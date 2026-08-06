# -*- coding: utf-8 -*-
"""
중복 표지 탐지 리포트 v2 (재다운로드 없음, 분석 전용)

v1 대비 변경
  1. phash 해밍거리 임계값 8 -> 4
  2. 유지 추천 우선순위 확장: ① 오디오 보유 → ② book_dash → ③ 표지 해상도 최대
  3. 바이트(md5) 동일 표지 공유 도서는 '표지 오적재 후보'로 분리 → cover_reload_candidates.csv
     (다운로드 실패건도 사유와 함께 포함)
  4. 산출물 v2 접미사 (v1 보존)

DB 접근 없음. SQL 생성 없음. scratchpad/dedup/ 밖의 파일을 쓰지 않는다.
"""

import collections
import csv
import hashlib
import json
import os
import sys

import imagehash
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import find_duplicates as F  # v1 모듈 재사용 (norm_title / build_groups / UnionFind)

HERE = F.HERE
COVER_DIR = F.COVER_DIR

HAMMING_V2 = 4
REPORT_CSV = os.path.join(HERE, "duplicate_report_v2.csv")
REPORT_MD = os.path.join(HERE, "duplicate_report_v2.md")
RELOAD_CSV = os.path.join(HERE, "cover_reload_candidates.csv")
V1_CSV = os.path.join(HERE, "duplicate_report.csv")


# ---------------------------------------------------------------- 표지 지문
def scan_covers(books):
    """각 표지의 md5 와 픽셀 총량(가로*세로)을 구한다."""
    md5s, px = {}, {}
    for b in books:
        p = os.path.join(COVER_DIR, f"{b['id']}.jpg")
        if not os.path.exists(p):
            continue
        with open(p, "rb") as fh:
            md5s[b["id"]] = hashlib.md5(fh.read()).hexdigest()
        try:
            with Image.open(p) as im:
                px[b["id"]] = im.size[0] * im.size[1]
        except Exception:
            pass
    return md5s, px


def load_phashes(books):
    """v1 이 남긴 phash_cache.json 재사용 (재계산·재다운로드 없음)."""
    cache = json.load(open(F.PHASH_CACHE, encoding="utf-8"))
    out = {}
    for b in books:
        hit = cache.get(b["id"])
        if hit:
            out[b["id"]] = imagehash.hex_to_hash(hit["phash"])
    return out


# ---------------------------------------------------------------- 유지 추천
def make_picker(books, audio_ids, px):
    def pick(members):
        basis = []
        pool = list(members)

        # ① 오디오 보유
        c = [i for i in pool if books[i]["id"] in audio_ids]
        if len(c) == 1:
            return c[0], "오디오 보유"
        if len(c) > 1:
            pool, _ = c, basis.append("오디오 보유")

        # ② book_dash
        c = [i for i in pool if books[i]["source_platform"] == "book_dash"]
        if len(c) == 1:
            return c[0], " + ".join(basis + ["book_dash"])
        if len(c) > 1:
            pool, _ = c, basis.append("book_dash")

        # ③ 표지 해상도 최대
        known = [i for i in pool if px.get(books[i]["id"])]
        if known:
            mx = max(px[books[i]["id"]] for i in known)
            top = [i for i in known if px[books[i]["id"]] == mx]
            if len(top) == 1:
                return top[0], " + ".join(basis + ["최대 해상도"])
            return None, f"팀장 판단(해상도 동률 {len(top)}권)"
        return None, "팀장 판단(해상도 미상)"

    return pick


# ---------------------------------------------------------------- 리포트
def write_csv(books, groups, pick, px):
    with open(REPORT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["group_no", "matched_by", "id", "source_platform", "title",
                    "cover_url", "유지추천", "추천근거", "표지해상도(px)"])
        for gno, g in enumerate(groups, 1):
            keeper, basis = pick(g["members"])
            for i in g["members"]:
                b = books[i]
                w.writerow([gno, g["matched_by"], b["id"], b["source_platform"],
                            b["title"], b["cover_url"],
                            "Y" if i == keeper else "",
                            basis if (i == keeper or keeper is None) else "",
                            px.get(b["id"], "")])


def write_md(books, groups, pick, px, stats, audio_src):
    L = []
    A = L.append
    A("# 공개 도서 중복 표지 탐지 리포트 v2\n")
    A("> 읽기·분석 전용. DB 변경 없음. 비활성화 SQL은 팀장 확정 후 별도 생성.\n")
    A("## 요약\n")
    A("| 항목 | v1 | v2 |")
    A("|---|---|---|")
    A(f"| phash 해밍거리 임계값 | 8 | **{HAMMING_V2}** |")
    A(f"| 분석 대상 권수 | {stats['total']} | **{stats['analyzed']}** |")
    A(f"| 중복 그룹 수 | {stats['v1_groups']} | **{len(groups)}** |")
    A(f"| 중복으로 묶인 권수 | {stats['v1_books']} | **{stats['dup_books']}** |")
    A(f"| 유지 추천이 붙은 그룹 | {stats['v1_keepers']} | **{stats['keepers']}** |")
    A(f"| 표지 오적재 후보(분리) | — | **{stats['reload']}** |")
    A("")
    A(f"판정 기준: phash 해밍거리 ≤ {HAMMING_V2} (표지) / 정규화 제목 유사도 ≥ {F.TITLE_RATIO:.2f} (제목)\n")
    A(f"유지 추천 우선순위: ① 오디오 보유({os.path.basename(audio_src) if audio_src else '없음'}) "
      "→ ② book_dash → ③ 표지 해상도 최대 → 동률 시 팀장 판단\n")
    A(f"바이트 동일 표지를 공유하는 도서 {stats['reload_shared']}권은 중복 도서가 아니라 "
      "**표지 오적재 후보**로 판단하여 본 리포트에서 제외했다 → `cover_reload_candidates.csv`\n")
    A("---\n")

    for gno, g in enumerate(groups, 1):
        keeper, basis = pick(g["members"])
        A(f"## 그룹 {gno} · {len(g['members'])}권 · matched_by=`{g['matched_by']}`\n")
        if g["matched_by"] == "cover" and len(g["members"]) >= F.BIG_GROUP_WARN:
            A(f"> ⚠️ 표지만으로 {len(g['members'])}권이 묶였습니다. 육안 확인 필수.\n")
        A("| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |")
        A("|---|---|---|---|---|---|")
        for i in g["members"]:
            b = books[i]
            thumb = (f'<img src="covers/{b["id"]}.jpg" width="110">'
                     if os.path.exists(os.path.join(COVER_DIR, f'{b["id"]}.jpg')) else "(표지 없음)")
            keep = f"**Y**<br>{basis}" if i == keeper else ""
            title = (b["title"] or "").replace("|", "\\|")
            A(f"| [{thumb}]({b['cover_url']}) | {keep} | {title} | {b['source_platform']} "
              f"| {px.get(b['id'], '?')} | `{b['id']}` |")
        if keeper is None:
            A(f"\n> 유지 추천 없음 — **{basis}**")
        A("")

    with open(REPORT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


# ---------------------------------------------------------------- main
def main():
    books = F.load_books()
    audio_ids, audio_src = F.load_audio_ids()
    by_id = {b["id"]: b for b in books}
    print(f"[1/6] 입력 {len(books)}권 · 오디오 {len(audio_ids)}건")

    print("[2/6] 표지 md5 / 해상도 스캔")
    md5s, px = scan_covers(books)
    print(f"      스캔 {len(md5s)}건")

    print("[3/6] 바이트 동일 표지 분리")
    by_md5 = collections.defaultdict(list)
    for bid, m in md5s.items():
        by_md5[m].append(bid)
    shared = {m: v for m, v in by_md5.items() if len(v) > 1}
    excluded = {bid for v in shared.values() for bid in v}

    failures = []
    if os.path.exists(F.FAILED_CSV):
        failures = [r for r in csv.DictReader(open(F.FAILED_CSV, newline="", encoding="utf-8-sig"))]

    with open(RELOAD_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id", "source_platform", "title", "cover_url", "md5", "공유그룹번호", "사유"])
        for sn, (m, members) in enumerate(
                sorted(shared.items(), key=lambda x: (-len(x[1]), x[0])), 1):
            for bid in sorted(members, key=lambda i: by_id[i]["title"].lower()):
                b = by_id[bid]
                w.writerow([bid, b["source_platform"], b["title"], b["cover_url"], m, sn,
                            f"바이트 동일 표지 {len(members)}권 공유"])
        for r in failures:
            b = by_id.get(r["id"])
            w.writerow([r["id"], b["source_platform"] if b else "", r["title"],
                        r["cover_url"], "", "", f"다운로드 실패: {r['reason']}"])
    print(f"      공유 그룹 {len(shared)}개 / {len(excluded)}권 + 실패 {len(failures)}건 "
          f"-> {os.path.basename(RELOAD_CSV)}")

    print("[4/6] 그룹핑 (해밍거리 <= %d)" % HAMMING_V2)
    F.HAMMING_MAX = HAMMING_V2
    remaining = [b for b in books if b["id"] not in excluded]
    groups = F.build_groups(remaining, load_phashes(remaining))
    dup_books = sum(len(g["members"]) for g in groups)

    # 제외로 인해 사라진 중복 관계(부수 피해) 측정
    all_groups = F.build_groups(books, load_phashes(books))
    collateral = []
    for g in all_groups:
        ids = [books[i]["id"] for i in g["members"]]
        ex = [x for x in ids if x in excluded]
        keep = [x for x in ids if x not in excluded]
        if ex and keep:
            collateral.append((g["matched_by"], ids))
    print(f"      그룹 {len(groups)}개 · 묶인 권수 {dup_books} · 부수 손실 그룹 {len(collateral)}개")

    print("[5/6] 유지 추천")
    pick = make_picker(remaining, audio_ids, px)
    keepers = sum(1 for g in groups if pick(g["members"])[0] is not None)
    print(f"      추천 부여 {keepers}/{len(groups)} 그룹")

    print("[6/6] 리포트 생성")
    v1 = list(csv.DictReader(open(V1_CSV, newline="", encoding="utf-8-sig")))
    v1g = collections.defaultdict(list)
    for r in v1:
        v1g[r["group_no"]].append(r)
    stats = {"total": len(books), "analyzed": len(remaining),
             "dup_books": dup_books, "keepers": keepers,
             "reload": len(excluded) + len(failures), "reload_shared": len(excluded),
             "v1_groups": len(v1g), "v1_books": len(v1),
             "v1_keepers": sum(1 for v in v1g.values() if any(r["유지추천"] == "Y" for r in v))}
    write_csv(remaining, groups, pick, px)
    write_md(remaining, groups, pick, px, stats, audio_src)

    # ---- 콘솔 요약
    mb = collections.Counter(g["matched_by"] for g in groups)
    v1mb = collections.Counter(v[0]["matched_by"] for v in v1g.values())
    print("\n=== v1 -> v2 ===")
    print(f"분석 대상   : {len(books)} -> {len(remaining)} (오적재 후보 {len(excluded)}권 제외)")
    print(f"그룹 수     : {len(v1g)} -> {len(groups)}")
    print(f"묶인 권수   : {len(v1)} -> {dup_books}")
    print(f"matched_by  : v1 {dict(v1mb)} -> v2 {dict(mb)}")
    print(f"유지 추천   : {stats['v1_keepers']}/{len(v1g)} -> {keepers}/{len(groups)} 그룹")
    print(f"오적재 후보 : {len(excluded)}권 + 실패 {len(failures)}건 = {stats['reload']}행")
    if collateral:
        print(f"\n[주의] 오적재 후보 제외로 중복 관계가 끊긴 그룹 {len(collateral)}개:")
        for mbz, ids in collateral[:10]:
            print(f"   matched_by={mbz} :: " + " | ".join(by_id[x]["title"][:30] for x in ids))


if __name__ == "__main__":
    main()
