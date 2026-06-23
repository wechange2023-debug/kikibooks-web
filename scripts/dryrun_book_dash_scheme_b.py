#!/usr/bin/env python3
"""
dryrun_book_dash_scheme_b.py — Book Dash Scheme B 전량 드라이런 (읽기전용 집계)

ADR-0027 Amendment #4의 HTML 컨테이너 추출 레시피를 Book Dash 영어책 전체에
적용해 전수 분류한다. **적재·DB쓰기·파일출력 없음. 콘솔 집계만.**

레시피(Amd#4):
  책페이지 HTML GET → div#read-book 격리 → img[data-src] 수집
  → wp-content/uploads 필터 → -WxH 접미사 제거 → 중복제거 → 본문 장수 카운트

분류:
  A: 본문 1장 이상 추출 성공 (장수 분포)
  B: #read-book 컨테이너 매칭 실패 (구조 다름)
  C: 컨테이너는 있으나 본문 0장
  D: cover-명명 파일 부재(표지 겸용 의심) — 휴리스틱·추정치

본 스크립트는 sync_book_dash_v2.py 를 import 하지 않는다(본체 오염·Supabase init 방지).

사용:
  python scripts/dryrun_book_dash_scheme_b.py            # 전량(영어 206)
  python scripts/dryrun_book_dash_scheme_b.py --limit 10 # 표본 N권만
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from collections import Counter
from typing import Any, Optional

import requests

# Windows 콘솔 한글·이모지 깨짐 방지 (기존 스크립트 패턴)
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

# ---------------------------------------------------------------------------
# 상수 (ADR-0027 정찰 실측)
# ---------------------------------------------------------------------------
WP_BOOKS = "https://bookdash.org/wp-json/wp/v2/books"
BOOK_PAGE_BASE = "https://bookdash.org/books"
ENGLISH_LANG_TERM = 621  # /wp/v2/languages 실측: id=621 name='English' count=206
HTTP_TIMEOUT = 30
WP_PER_PAGE = 100
SLEEP_BETWEEN = 0.4  # 외부 예의 (요청 간)

# 이미 적재된 Scheme A 21권 (ADR-0027 Amd#3) — 순 후보 산정용 제외 집합
SCHEME_A_21 = {
    "aaaaahhh-mmawe", "banzis-busy-bees", "best-friends", "going-places",
    "grumpy-cloud", "how-do-you-eat", "i-hate-winter", "its-my-book",
    "jock-and-me", "julia-loves-books", "khaya-wants-to-row", "little-shoots",
    "mazi-learns-to-play", "moms-hands", "oyisa-and-the-giant-tree", "samoosas",
    "tata-comes-home", "the-window-seat", "thulis-tissue",
    "whats-happened-to-our-water", "why-the-owl-never-sleeps",
}

# slug drift 3권 (ADR-0027 Amd#3) — 별도 표기
DRIFT_3 = {
    "maddy-moonas-menagerie",
    "mrs-penguins-perfect-palace",
    "little-sock-and-the-tiny-creatures",
}

_THUMB_SUFFIX_RE = re.compile(r"-\d+x\d+(\.(?:jpg|jpeg|png))$", re.I)
_DIV_TOKEN_RE = re.compile(r"<div\b|</div>", re.I)
_DATASRC_RE = re.compile(r'data-src=["\']([^"\']+)["\']', re.I)


# ---------------------------------------------------------------------------
# WP API — 영어책 전수 slug 수집 (페이지네이션)
# ---------------------------------------------------------------------------
def fetch_english_books(limit: Optional[int] = None) -> list[dict[str, Any]]:
    """/books?languages=621 를 per_page=100·page=N 으로 전수 순회."""
    out: list[dict[str, Any]] = []
    page = 1
    total_pages = 1
    total_books: Optional[int] = None

    while page <= total_pages:
        params = {
            "languages": ENGLISH_LANG_TERM,
            "per_page": WP_PER_PAGE,
            "page": page,
        }
        resp = requests.get(WP_BOOKS, params=params, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        if total_books is None:
            total_books = int(resp.headers.get("X-WP-Total", "0"))
            total_pages = int(resp.headers.get("X-WP-TotalPages", "1"))
            print(
                f"[INFO] WP API 영어책 X-WP-Total={total_books} "
                f"X-WP-TotalPages={total_pages}"
            )
        for b in resp.json():
            out.append({
                "slug": b.get("slug") or "",
                "title": (b.get("title") or {}).get("rendered") or "",
            })
            if limit is not None and len(out) >= limit:
                return out
        page += 1
        time.sleep(SLEEP_BETWEEN)

    return out


# ---------------------------------------------------------------------------
# Amd#4 레시피 — div#read-book 격리 + img[data-src] 추출
# ---------------------------------------------------------------------------
def isolate_read_book(html: str) -> Optional[str]:
    """
    <div id="read-book" ...> 의 매칭 닫는 </div> 까지를 div 깊이 카운팅으로 격리.
    매칭 실패(구조 다름) 시 None.
    """
    m = re.search(r'<div\b[^>]*\bid=["\']read-book["\']', html, re.I)
    if not m:
        return None
    start = m.start()
    depth = 0
    seen_open = False
    for tok in _DIV_TOKEN_RE.finditer(html, start):
        if tok.group(0).lower().startswith("<div"):
            depth += 1
            seen_open = True
        else:
            depth -= 1
        if seen_open and depth == 0:
            return html[start:tok.end()]
    return html[start:]  # 닫힘 미발견 — 끝까지(비정상이나 추출은 시도)


def extract_body_images(html: str) -> tuple[Optional[list[str]], str]:
    """
    레시피 적용 → (본문 풀사이즈 URL 목록, 분류코드).
    분류코드: 'B'(컨테이너 부재) / 'C'(컨테이너 有 본문 0장) / 'A'(1장 이상).
    """
    seg = isolate_read_book(html)
    if seg is None:
        return None, "B"
    srcs = _DATASRC_RE.findall(seg)
    uploads = [s for s in srcs if "wp-content/uploads" in s]
    full = []
    seen = set()
    for u in uploads:
        f = _THUMB_SUFFIX_RE.sub(r"\1", u)
        if f not in seen:
            seen.add(f)
            full.append(f)
    if not full:
        return [], "C"
    return full, "A"


def has_cover_named(urls: list[str]) -> bool:
    """추출 목록 중 파일명에 'cover' 포함 이미지 존재 여부(표지 별도파일 신호)."""
    return any("cover" in u.rsplit("/", 1)[-1].lower() for u in urls)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description="Book Dash Scheme B 전량 드라이런(읽기전용)")
    ap.add_argument("--limit", type=int, default=None, help="표본 N권만(테스트)")
    args = ap.parse_args()

    print("=" * 64)
    print(" Book Dash Scheme B 전량 드라이런 (읽기전용 집계 · ADR-0027 Amd#4)")
    print(" 적재·DB쓰기·파일출력 없음 — 콘솔 집계만")
    print("=" * 64)

    books = fetch_english_books(limit=args.limit)
    n = len(books)
    est_sec = int(n * (SLEEP_BETWEEN + 0.6))
    print(f"[INFO] 대상 {n}권 · 예상 소요 ~{est_sec}초(~{est_sec // 60}분)\n")

    cat: dict[str, list[str]] = {"A": [], "B": [], "C": []}
    page_counts: dict[str, int] = {}      # slug -> 본문 장수 (A만)
    page_urls: dict[str, list[str]] = {}  # slug -> 추출 URL 목록 (A만, 이상치 출력용)
    d_suspect: list[str] = []             # cover-명명 파일 부재 (휴리스틱)
    errors: list[str] = []

    for i, bk in enumerate(books, 1):
        slug = bk["slug"]
        try:
            resp = requests.get(f"{BOOK_PAGE_BASE}/{slug}/", timeout=HTTP_TIMEOUT)
            resp.raise_for_status()
            urls, code = extract_body_images(resp.text)
            cat[code].append(slug)
            if code == "A" and urls is not None:
                page_counts[slug] = len(urls)
                page_urls[slug] = urls
                if not has_cover_named(urls):
                    d_suspect.append(slug)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{slug}: {type(exc).__name__}: {str(exc)[:80]}")
            cat.setdefault("ERR", []).append(slug)  # type: ignore[arg-type]

        if i % 10 == 0:
            print(f"  ... {i}/{n} 처리 (A={len(cat['A'])} "
                  f"B={len(cat['B'])} C={len(cat['C'])} ERR={len(errors)})")
        time.sleep(SLEEP_BETWEEN)

    # -----------------------------------------------------------------------
    # 집계 출력
    # -----------------------------------------------------------------------
    a_slugs = set(cat["A"])
    a_net = a_slugs - SCHEME_A_21  # 이미 적재된 21권 제외 = 순 B 후보

    print("\n" + "=" * 64)
    print(" 집계 결과")
    print("=" * 64)
    print(f" 전체 영어책            : {n}")
    print(f" ─ 카테고리 A(본문≥1장) : {len(cat['A'])}")
    print(f" ─ 카테고리 B(컨테이너부재): {len(cat['B'])}")
    print(f" ─ 카테고리 C(본문 0장)  : {len(cat['C'])}")
    print(f" ─ ERR(네트워크/예외)    : {len(errors)}")

    print(f"\n [순 후보] A {len(cat['A'])} − Scheme A 적재분 21 = {len(a_net)}권")
    print(f"   (교집합 검산: A∩SchemeA21 = {len(a_slugs & SCHEME_A_21)}/21)")

    print("\n [A 본문 장수 분포]")
    dist = Counter(page_counts.values())
    for pages in sorted(dist):
        bar = "#" * dist[pages]
        print(f"   {pages:>3}장 : {dist[pages]:>3}권 {bar}")
    if page_counts:
        vals = list(page_counts.values())
        print(f"   min={min(vals)} max={max(vals)} "
              f"avg={sum(vals) / len(vals):.1f}")

    # (a) 본문 장수 ≤ 1 — 깨짐/미배포 의심
    low = sorted(s for s, c in page_counts.items() if c <= 1)
    print(f"\n [(a) 이상치 · 본문 ≤1장 — {len(low)}권]")
    if not low:
        print("   (없음)")
    for s in low:
        print(f"   ▷ {s} ({page_counts[s]}장)")
        for u in page_urls[s]:
            print(f"       {u}")

    # (b) 본문 장수 ≥ 25 — 중복/다른 포맷 의심
    high = sorted(s for s, c in page_counts.items() if c >= 25)
    print(f"\n [(b) 이상치 · 본문 ≥25장 — {len(high)}권]")
    if not high:
        print("   (없음)")
    for s in high:
        print(f"   ▷ {s} ({page_counts[s]}장)")
        for u in page_urls[s]:
            print(f"       {u}")

    # (c) 카테고리 D — cover-명명 파일 부재 (slug만)
    print(f"\n [(c) 카테고리 D · cover-명명 파일 부재 — {len(d_suspect)}권 (slug만)]")
    for s in sorted(d_suspect):
        print(f"   - {s}")

    print(f"\n [카테고리 D · 휴리스틱·추정치]")
    print(f"   cover-명명 파일 부재(표지 겸용/featured_media 의존 의심): {len(d_suspect)}권")
    print(f"   ※ 추정: '첫 면이 표지 겸용'인지는 본 신호만으로 단정 불가."
          f" 실제 표지는 WP featured_media로 별도 보유(Amd#4 결정).")

    print("\n [drift 3권 별도 표기]")
    for slug in sorted(DRIFT_3):
        loc = ("A" if slug in cat["A"] else
               "B" if slug in cat["B"] else
               "C" if slug in cat["C"] else "?")
        pg = page_counts.get(slug, "-")
        print(f"   {slug:38} → cat {loc}, 본문 {pg}장")

    if cat["B"]:
        print("\n [카테고리 B slug 목록(컨테이너 부재)]")
        for s in sorted(cat["B"]):
            print(f"   - {s}")
    if cat["C"]:
        print("\n [카테고리 C slug 목록(본문 0장)]")
        for s in sorted(cat["C"]):
            print(f"   - {s}")
    if errors:
        print("\n [ERR 상세]")
        for e in errors:
            print(f"   - {e}")

    print("\n[완료] 파일·DB 쓰기 없음. 위 집계를 스샷으로 회신.")


if __name__ == "__main__":
    main()
