# -*- coding: utf-8 -*-
"""
공개 도서 중복 표지 탐지 리포트 생성기 (읽기·분석 전용)

입력 : scratchpad/active_books.csv  (id, source_platform, source_id, title, cover_url)
선택 : scratchpad/audio_books.csv   (book_id 또는 id 컬럼) - 있으면 '유지 추천' 1순위 근거로 사용
출력 : scratchpad/dedup/ 하위에만 생성
        covers/{id}.jpg
        phash_cache.json
        failed_downloads.csv
        duplicate_report.csv
        duplicate_report.md

DB 접근 없음. SQL 생성 없음. scratchpad/dedup/ 밖의 파일을 쓰지 않는다.

사용:
    python find_duplicates.py                     # 전체 실행
    python find_duplicates.py --skip-download     # 이미 받은 covers/ 로만 재분석
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import unicodedata
from difflib import SequenceMatcher

try:
    import imagehash
    from PIL import Image
except ImportError:
    sys.exit("[FATAL] Pillow / imagehash 미설치. python -m pip install --user Pillow imagehash")

# ---------------------------------------------------------------- 설정
HERE = os.path.dirname(os.path.abspath(__file__))
SCRATCH = os.path.dirname(HERE)

IN_CSV = os.path.join(SCRATCH, "active_books.csv")
AUDIO_CSV = os.path.join(SCRATCH, "audio_books.csv")
AUDIO_CSV_ALT = os.path.join(HERE, "audio_books.csv")

COVER_DIR = os.path.join(HERE, "covers")
PHASH_CACHE = os.path.join(HERE, "phash_cache.json")
FAILED_CSV = os.path.join(HERE, "failed_downloads.csv")
REPORT_CSV = os.path.join(HERE, "duplicate_report.csv")
REPORT_MD = os.path.join(HERE, "duplicate_report.md")

HAMMING_MAX = 8        # phash 해밍거리 <= 8 -> 동일 표지 후보
TITLE_RATIO = 0.90     # 정규화 제목 유사도 >= 0.90 -> 동일 제목 후보
SLEEP_SEC = 0.3        # 요청 간 대기 (서버 부하 방지)
TIMEOUT = 30
UA = "Mozilla/5.0 (compatible; kikibooks-dedup-audit/1.0)"
BIG_GROUP_WARN = 8     # 이보다 큰 표지 그룹은 단색/플레이스홀더 의심 경고

# ---------------------------------------------------------------- 다운로드
try:
    import requests

    def fetch(url):
        r = requests.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT)
        r.raise_for_status()
        return r.content
except ImportError:
    import urllib.request

    def fetch(url):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.read()


# ---------------------------------------------------------------- 유틸
_PUNCT = re.compile(r"[^0-9a-z가-힣\s]+")
_WS = re.compile(r"\s+")


def norm_title(t):
    """소문자화 + 특수문자 제거 + 공백 정규화."""
    t = unicodedata.normalize("NFKC", (t or "")).lower()
    t = _PUNCT.sub(" ", t)
    return _WS.sub(" ", t).strip()


class UnionFind:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def load_audio_ids():
    for path in (AUDIO_CSV, AUDIO_CSV_ALT):
        if not os.path.exists(path):
            continue
        with open(path, newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            return set(), path
        key = next((k for k in rows[0] if k.strip().lower() in ("book_id", "id")), None)
        if key is None:
            print(f"[WARN] {os.path.basename(path)}: book_id/id 컬럼 없음 -> 무시")
            return set(), None
        return {r[key].strip() for r in rows if r.get(key)}, path
    return set(), None


# ---------------------------------------------------------------- 1) 입력
def load_books():
    if not os.path.exists(IN_CSV):
        sys.exit(f"[FATAL] 입력 없음: {IN_CSV}")
    with open(IN_CSV, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    need = {"id", "source_platform", "source_id", "title", "cover_url"}
    missing = need - set(rows[0].keys() if rows else [])
    if missing:
        sys.exit(f"[FATAL] 컬럼 누락: {sorted(missing)}")
    return rows


# ---------------------------------------------------------------- 2) 표지 수집
def download_covers(books, skip_download):
    os.makedirs(COVER_DIR, exist_ok=True)
    failures = []
    total = len(books)
    for i, b in enumerate(books, 1):
        bid, url = b["id"], (b["cover_url"] or "").strip()
        dest = os.path.join(COVER_DIR, f"{bid}.jpg")

        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            continue
        if not url:
            failures.append((bid, b["title"], "", "cover_url 비어 있음"))
            continue
        if skip_download:
            failures.append((bid, b["title"], url, "skip-download 모드: 로컬 파일 없음"))
            continue

        try:
            data = fetch(url)
            if not data:
                raise ValueError("빈 응답")
            with open(dest, "wb") as fh:
                fh.write(data)
        except Exception as e:  # 실패해도 계속 진행
            failures.append((bid, b["title"], url, f"{type(e).__name__}: {e}"))
            if os.path.exists(dest):
                os.remove(dest)
        time.sleep(SLEEP_SEC)

        if i % 25 == 0 or i == total:
            print(f"  다운로드 {i}/{total} (실패 {len(failures)})", flush=True)

    with open(FAILED_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id", "title", "cover_url", "reason"])
        w.writerows(failures)
    return failures


# ---------------------------------------------------------------- 3) phash
def compute_hashes(books):
    cache = {}
    if os.path.exists(PHASH_CACHE):
        try:
            cache = json.load(open(PHASH_CACHE, encoding="utf-8"))
        except Exception:
            cache = {}

    hashes, broken = {}, []
    for b in books:
        bid = b["id"]
        path = os.path.join(COVER_DIR, f"{bid}.jpg")
        if not os.path.exists(path):
            continue
        sig = str(os.path.getsize(path))
        hit = cache.get(bid)
        if hit and hit.get("sig") == sig:
            hashes[bid] = imagehash.hex_to_hash(hit["phash"])
            continue
        try:
            with Image.open(path) as im:
                h = imagehash.phash(im.convert("RGB"))
            hashes[bid] = h
            cache[bid] = {"sig": sig, "phash": str(h)}
        except Exception as e:
            broken.append((bid, b["title"], b["cover_url"], f"디코드 실패 {type(e).__name__}: {e}"))

    json.dump(cache, open(PHASH_CACHE, "w", encoding="utf-8"), indent=1)
    return hashes, broken


# ---------------------------------------------------------------- 4) 그룹핑
def build_groups(books, hashes):
    n = len(books)
    uf = UnionFind(n)
    ids = [b["id"] for b in books]
    norms = [norm_title(b["title"]) for b in books]
    reasons = {}  # frozenset(pair) -> {'cover','title'}

    def mark(i, j, why):
        reasons.setdefault(frozenset((i, j)), set()).add(why)
        uf.union(i, j)

    # 표지 기준: phash 해밍거리 <= HAMMING_MAX
    hidx = [i for i in range(n) if ids[i] in hashes]
    for a in range(len(hidx)):
        i = hidx[a]
        hi = hashes[ids[i]]
        for b in range(a + 1, len(hidx)):
            j = hidx[b]
            if hi - hashes[ids[j]] <= HAMMING_MAX:
                mark(i, j, "cover")

    # 제목 기준: 완전 일치 또는 유사도 >= TITLE_RATIO
    exact = {}
    for i, t in enumerate(norms):
        if t:
            exact.setdefault(t, []).append(i)
    for group in exact.values():
        for a in range(len(group)):
            for b in range(a + 1, len(group)):
                mark(group[a], group[b], "title")

    for i in range(n):
        ti = norms[i]
        if not ti:
            continue
        li = len(ti)
        sm = SequenceMatcher(None, ti, "")
        for j in range(i + 1, n):
            tj = norms[j]
            if not tj or ti == tj:
                continue
            if min(li, len(tj)) / max(li, len(tj)) < TITLE_RATIO:  # 길이 기반 상한 컷
                continue
            sm.set_seq2(tj)
            if sm.real_quick_ratio() < TITLE_RATIO or sm.quick_ratio() < TITLE_RATIO:
                continue
            if sm.ratio() >= TITLE_RATIO:
                mark(i, j, "title")

    groups = {}
    for i in range(n):
        groups.setdefault(uf.find(i), []).append(i)

    out = []
    for members in groups.values():
        if len(members) < 2:
            continue
        mset = set(members)
        why = set()
        for pair, r in reasons.items():
            if pair <= mset:
                why |= r
        matched_by = "both" if why == {"cover", "title"} else (why.pop() if why else "unknown")
        out.append({"members": sorted(members, key=lambda i: books[i]["title"].lower()),
                    "matched_by": matched_by})

    out.sort(key=lambda g: (-len(g["members"]), books[g["members"][0]]["title"].lower()))
    return out


# ---------------------------------------------------------------- 5) 유지 추천
def pick_keeper(members, books, audio_ids):
    """① book_audio 보유 → ② book_dash → ③ 추천 없음(팀장 판단)"""
    if audio_ids:
        cand = [i for i in members if books[i]["id"] in audio_ids]
        if len(cand) == 1:
            return cand[0], "오디오 보유"
        if len(cand) > 1:
            bd = [i for i in cand if books[i]["source_platform"] == "book_dash"]
            if len(bd) == 1:
                return bd[0], "오디오 보유 + book_dash"
            return None, "팀장 판단(오디오 보유 복수)"
    bd = [i for i in members if books[i]["source_platform"] == "book_dash"]
    if len(bd) == 1:
        return bd[0], "book_dash"
    if len(bd) > 1:
        return None, "팀장 판단(book_dash 복수)"
    return None, "팀장 판단"


# ---------------------------------------------------------------- 6) 리포트
def write_reports(books, groups, audio_ids, audio_src, failures, broken, stats):
    with open(REPORT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["group_no", "matched_by", "id", "source_platform",
                    "title", "cover_url", "유지추천", "추천근거"])
        for gno, g in enumerate(groups, 1):
            keeper, basis = pick_keeper(g["members"], books, audio_ids)
            for i in g["members"]:
                b = books[i]
                w.writerow([gno, g["matched_by"], b["id"], b["source_platform"],
                            b["title"], b["cover_url"],
                            "Y" if i == keeper else "",
                            basis if i == keeper else ("" if keeper is not None else basis)])

    dup_books = sum(len(g["members"]) for g in groups)
    L = []
    L.append("# 공개 도서 중복 표지 탐지 리포트\n")
    L.append("> 읽기·분석 전용 산출물. DB 변경 없음. 비활성화 SQL은 팀장 확정 후 별도 생성.\n")
    L.append("## 요약\n")
    L.append("| 항목 | 값 |")
    L.append("|---|---|")
    L.append(f"| 전체 권수 | {stats['total']} |")
    L.append(f"| 표지 다운로드 성공 | {stats['hashed']} |")
    L.append(f"| 다운로드 실패 | {len(failures)} |")
    L.append(f"| 이미지 디코드 실패 | {len(broken)} |")
    L.append(f"| 중복 그룹 수 | {len(groups)} |")
    L.append(f"| 중복으로 묶인 권수 | {dup_books} |")
    L.append(f"| 정리 시 감소 예상 권수 | {dup_books - len(groups)} |")
    L.append("")
    L.append(f"판정 기준: phash 해밍거리 ≤ {HAMMING_MAX} (표지) / 정규화 제목 유사도 ≥ {TITLE_RATIO:.2f} (제목)\n")
    L.append(f"오디오 보유 목록: {os.path.basename(audio_src) if audio_src else '없음 → 우선순위 ① 생략'}\n")
    L.append("---\n")

    for gno, g in enumerate(groups, 1):
        keeper, basis = pick_keeper(g["members"], books, audio_ids)
        L.append(f"## 그룹 {gno} · {len(g['members'])}권 · matched_by=`{g['matched_by']}`\n")
        if g["matched_by"] == "cover" and len(g["members"]) >= BIG_GROUP_WARN:
            L.append(f"> ⚠️ 표지만으로 {len(g['members'])}권이 묶였습니다. "
                     "단색/플레이스홀더 표지일 수 있으니 육안 확인 필수.\n")
        L.append("| 표지 | 유지 | 제목 | 플랫폼 | id |")
        L.append("|---|---|---|---|---|")
        for i in g["members"]:
            b = books[i]
            thumb = (f'<img src="covers/{b["id"]}.jpg" width="110">'
                     if os.path.exists(os.path.join(COVER_DIR, f'{b["id"]}.jpg')) else "(표지 없음)")
            keep = f"**Y**<br>{basis}" if i == keeper else ""
            title = (b["title"] or "").replace("|", "\\|")
            L.append(f"| [{thumb}]({b['cover_url']}) | {keep} | {title} | {b['source_platform']} | `{b['id']}` |")
        if keeper is None:
            L.append(f"\n> 유지 추천 없음 — **{basis}**")
        L.append("")

    if failures:
        L.append("---\n\n## 다운로드 실패\n")
        L.append("| id | 제목 | 사유 |")
        L.append("|---|---|---|")
        for bid, title, _url, reason in failures:
            L.append(f"| `{bid}` | {(title or '').replace('|', '\\|')} | {reason.replace('|', '/')} |")
        L.append("")
    if broken:
        L.append("---\n\n## 이미지 디코드 실패\n")
        L.append("| id | 제목 | 사유 |")
        L.append("|---|---|---|")
        for bid, title, _url, reason in broken:
            L.append(f"| `{bid}` | {(title or '').replace('|', '\\|')} | {reason.replace('|', '/')} |")
        L.append("")

    with open(REPORT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-download", action="store_true", help="covers/ 기존 파일로만 재분석")
    args = ap.parse_args()

    books = load_books()
    audio_ids, audio_src = load_audio_ids()
    print(f"[1/5] 입력 {len(books)}권 로드 · 오디오 목록 "
          f"{len(audio_ids)}건({os.path.basename(audio_src) if audio_src else '없음'})")

    print("[2/5] 표지 다운로드")
    failures = download_covers(books, args.skip_download)
    print(f"      실패 {len(failures)}건 -> {os.path.basename(FAILED_CSV)}")

    print("[3/5] phash 계산")
    hashes, broken = compute_hashes(books)
    print(f"      성공 {len(hashes)}건 · 디코드 실패 {len(broken)}건")

    print("[4/5] 중복 그룹핑")
    groups = build_groups(books, hashes)
    dup_books = sum(len(g["members"]) for g in groups)
    print(f"      그룹 {len(groups)}개 · 묶인 권수 {dup_books}")

    print("[5/5] 리포트 생성")
    write_reports(books, groups, audio_ids, audio_src, failures, broken,
                  {"total": len(books), "hashed": len(hashes)})

    print("\n=== 요약 ===")
    print(f"전체 권수        : {len(books)}")
    print(f"중복 그룹 수     : {len(groups)}")
    print(f"중복으로 묶인 권수: {dup_books}")
    print(f"다운로드 실패 수 : {len(failures)}")
    print(f"디코드 실패 수   : {len(broken)}")
    print(f"\n산출물: {HERE}")


if __name__ == "__main__":
    main()
