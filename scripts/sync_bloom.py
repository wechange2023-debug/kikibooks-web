#!/usr/bin/env python3
"""
sync_bloom.py — Bloom Library(SIL) 영어책 동기화 (ADR-0028)

ADR-0028: Bloom Library 무료 다운로드 경로 도입 + source_platform 'bloom' 추가.
  - Amendment #1: cc-by 라이선스 버전 매핑(cc-by→cc-by-4-0, HTML URL /by/4.0/ 검증).
  - Amendment #2: 수집·적재 파이프라인. 본 스크립트가 그 구현.

수집 소스 (Amd#2 §1):
  - Parse Server REST: bloom-parse-server-production.azurewebsites.net/parse/classes/books
  - 인증: X-Parse-Application-Id(Bloom 공개 App-Id, 비밀키 불요).
  - 언어: langPointers $inQuery {isoCode:"en"} (영어 표제 objectId가 번역명으로
    분산되므로 단일 ID 금지 — $inQuery 필수).
  - 라이선스: cc-by / cc-by-sa / cc0 만(NC·ND·custom 제외).
  - 1차 배치: cc-by + computedLevel:1|2 (유아 타깃).

본 단계 = 조각1(수집·dedup) + 조각2(매니페스트 합성)까지:
  - Parse API GET 수집(count 확인 후 skip/limit 페이지네이션).
  - 1단 dedup: tags의 list:Book Dash / list:African Storybook 제외(기존 보유 사본).
  - 영어 본문 필터: allTitles에 "en" 키 존재(STEP14 위양성 ~18% 제거).
  - 영어 제목 채택 + 라이선스 URL 안전장치(Amd#1) + index.htm DOM 순서 매니페스트 합성.
  - Storage 업로드·DB INSERT 코드 없음(조각3·4 예정). --execute 미구현.

사용:
    python scripts/sync_bloom.py --dry-run --limit 3
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from typing import Any, Optional

import requests

# Windows 콘솔(cp949) 한글·이모지·키릴 깨짐 방지 (기존 sync 스크립트 패턴)
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 설정 상수 (ADR-0028 Amendment #2 §1 — 정찰 실측값)
# ---------------------------------------------------------------------------
PARSE_BASE = "https://bloom-parse-server-production.azurewebsites.net/parse"
PARSE_BOOKS = PARSE_BASE + "/classes/books"
# Bloom 클라이언트 공개 App-Id (비밀키 아님 — 공개 카탈로그 읽기 전용)
PARSE_APP_ID = "R6qNTeumQXjJCMutAJYAwPtip1qBulkFyLefkCE5"
HEADERS = {"X-Parse-Application-Id": PARSE_APP_ID}
HTTP_TIMEOUT = 40

SOURCE_PLATFORM = "bloom"  # ADR-0028 D2 (9번째 소스, 005 마이그레이션)

# 영어 필터 — langPointers 배열에 isoCode="en" language가 포함된 책($inQuery).
ENGLISH_LANG_INQUERY: dict[str, Any] = {
    "$inQuery": {"where": {"isoCode": "en"}, "className": "language"}
}

# 허용 라이선스(Amd#1·#2) → 우리 DB 표기 매핑. 그 외(NC·ND·custom)는 제외.
LICENSE_MAP = {
    "cc-by": "cc-by-4-0",
    "cc-by-sa": "cc-by-sa-4-0",
    "cc0": "cc0",
}
# Amd#1 안전장치: HTML 책 라이선스 URL 기대 버전.
EXPECTED_CC_VERSION = "4.0"
# Bloom license 값 → 기대 CC URL 토큰(버전 검증용).
EXPECTED_CC_TOKEN = {"cc-by": "by", "cc-by-sa": "by-sa"}

# 1차 배치 라이선스·레벨(Amd#2 §1) — 유아 타깃.
FIRST_BATCH_LICENSE = "cc-by"
FIRST_BATCH_LEVELS = ["computedLevel:1", "computedLevel:2"]

# 1단 dedup 대상 — 기존 보유 소스의 Bloom 사본(Amd#2 §3).
EXISTING_SOURCE_LIST_TAGS = ("list:Book Dash", "list:African Storybook")

# 응답 페이로드 축소용 keys(Parse).
FETCH_KEYS = "title,license,baseUrl,tags,bookInstanceId,langPointers,allTitles"
PARSE_PAGE_SIZE = 200  # skip/limit 페이지네이션 단위

# 매니페스트 본문에서 제외할 비-본문 이미지(표지·썸네일·브랜딩·레벨차트 등).
_NON_PAGE_IMG_RE = re.compile(
    r"(coverimage|thumbnail|placeholder|license|branding|bloomwith|levelchart)",
    re.I,
)
# 본문 페이지 이미지: background-image url() (요소 무관, numberedPage 내부만 채택).
_BG_IMAGE_RE = re.compile(
    r"background-image:\s*url\(['\"]?([^'\")]+)['\"]?\)", re.I
)
# bloom-page 블록 분할 마커(캡처).
_PAGE_SPLIT_RE = re.compile(r'(<div class="[^"]*bloom-page)', re.I)
# 책 라이선스 CC URL(by / by-sa 만; nc·nd 변종은 책 레벨 아님 → 무시).
_CC_URL_RE = re.compile(
    r"creativecommons\.org/licenses/(by|by-sa)/(\d+\.\d+)", re.I
)


# ---------------------------------------------------------------------------
# 1. Parse REST 수집 (Amd#2 §1)
# ---------------------------------------------------------------------------
def build_where() -> dict[str, Any]:
    """1차 배치 서버측 where 필터 — 영어 + cc-by + computedLevel:1|2."""
    return {
        "license": FIRST_BATCH_LICENSE,
        "tags": {"$in": FIRST_BATCH_LEVELS},
        "langPointers": ENGLISH_LANG_INQUERY,
    }


def _parse_get(params: dict[str, Any]) -> dict[str, Any]:
    """Parse REST GET 1회."""
    resp = requests.get(
        PARSE_BOOKS, headers=HEADERS, params=params, timeout=HTTP_TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()


def fetch_count(where: dict[str, Any]) -> int:
    """where 조건 총 권수(count=1&limit=0)."""
    data = _parse_get({"where": json.dumps(where), "limit": 0, "count": 1})
    return int(data.get("count", 0))


def fetch_books(
    where: dict[str, Any], limit: Optional[int] = None
) -> list[dict[str, Any]]:
    """where 조건 책을 skip/limit 페이지네이션으로 수집."""
    out: list[dict[str, Any]] = []
    skip = 0
    while True:
        page_size = PARSE_PAGE_SIZE
        if limit is not None:
            remaining = limit - len(out)
            if remaining <= 0:
                break
            page_size = min(PARSE_PAGE_SIZE, remaining)
        data = _parse_get(
            {
                "where": json.dumps(where),
                "keys": FETCH_KEYS,
                "limit": page_size,
                "skip": skip,
                "order": "objectId",  # 안정 정렬(페이지네이션 누락·중복 방지)
            }
        )
        results = data.get("results", [])
        if not results:
            break
        out.extend(results)
        skip += len(results)
        if len(results) < page_size:
            break
        time.sleep(0.3)  # 외부 예의
    return out


# ---------------------------------------------------------------------------
# 2. 1단 dedup — list 태그(기존 보유 사본) 제외 (Amd#2 §3 1단)
# ---------------------------------------------------------------------------
def has_existing_source_tag(book: dict[str, Any]) -> bool:
    """tags에 list:Book Dash / list:African Storybook 가 있으면 True(=제외 대상)."""
    tags = book.get("tags") or []
    return any(t in EXISTING_SOURCE_LIST_TAGS for t in tags)


def apply_tag_dedup(
    books: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    """1단 dedup 적용 → (잔여 후보, 제외 건수)."""
    kept: list[dict[str, Any]] = []
    excluded = 0
    for b in books:
        if has_existing_source_tag(b):
            excluded += 1
        else:
            kept.append(b)
    return kept, excluded


# ---------------------------------------------------------------------------
# 2-B. 영어 본문 필터 — allTitles "en" 키 존재 (STEP14 보정, 위양성 ~18% 제거)
# ---------------------------------------------------------------------------
def parse_all_titles(book: dict[str, Any]) -> Optional[dict[str, Any]]:
    """allTitles(stringified JSON 또는 dict) → dict. 파싱 실패 시 None."""
    at = book.get("allTitles")
    if isinstance(at, dict):
        return at
    if isinstance(at, str):
        try:
            d = json.loads(at)
            return d if isinstance(d, dict) else None
        except (ValueError, TypeError):
            return None
    return None


def apply_english_filter(
    books: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int, int]:
    """
    allTitles에 "en" 키가 있고 값이 비어있지 않은 책만 통과.
    → (잔여 후보, en없음 제외수, 파싱실패 제외수). 파싱 실패는 안전 우선 제외.
    """
    kept: list[dict[str, Any]] = []
    excluded_no_en = 0
    excluded_bad = 0
    for b in books:
        d = parse_all_titles(b)
        if d is None:
            excluded_bad += 1
            continue
        en = d.get("en")
        if isinstance(en, str) and en.strip():
            kept.append(b)
        else:
            excluded_no_en += 1
    return kept, excluded_no_en, excluded_bad


# ---------------------------------------------------------------------------
# 3. 영어 제목 채택 (조각2)
# ---------------------------------------------------------------------------
def _normalize_title(t: str) -> str:
    """제목 공백 정규화 — 줄바꿈·연속 공백을 단일 공백으로(매니페스트 헤더·slug 오염 방지)."""
    return re.sub(r"\s+", " ", t).strip()


def pick_english_title(book: dict[str, Any]) -> str:
    """allTitles["en"] 우선. 없으면 book["title"] 폴백(방어적). 공백 정규화 적용."""
    d = parse_all_titles(book) or {}
    en = d.get("en")
    if isinstance(en, str) and en.strip():
        return _normalize_title(en)
    return _normalize_title(book.get("title") or "")


def slugify(title: str, fallback: str) -> str:
    """영어 제목 → kebab-case slug. 비어지면 fallback(bookInstanceId 등)."""
    s = title.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or fallback


# ---------------------------------------------------------------------------
# 4. harvester 경로 + index.htm 페이지 이미지 추출 (조각2, Amd#2 §4)
# ---------------------------------------------------------------------------
def harvest_bloomdigital_base(book: dict[str, Any]) -> Optional[str]:
    """
    baseUrl(.../BloomLibraryBooks/{email}%2f{bid}%2f{folder}%2f) →
    harvester bloomdigital base(.../bloomharvest/{email}%2f{bid}%2fbloomdigital%2f).
    파싱 불가 시 None.
    """
    base = book.get("baseUrl") or ""
    marker = "BloomLibraryBooks/"
    if marker not in base:
        return None
    tail = base.split(marker, 1)[1]
    segs = tail.split("%2f")
    if len(segs) < 2 or not segs[0] or not segs[1]:
        return None
    email, bid = segs[0], segs[1]
    return (
        f"https://s3.amazonaws.com/bloomharvest/{email}%2f{bid}%2fbloomdigital%2f"
    )


def fetch_index_html(book: dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    """harvester bloomdigital/index.htm 본문 반환 → (html, base). 실패 시 (None, base)."""
    base = harvest_bloomdigital_base(book)
    if not base:
        return None, None
    try:
        resp = requests.get(base + "index.htm", timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        return resp.text, base
    except requests.RequestException:
        return None, base


def _split_pages(index_html: str) -> list[str]:
    """index.htm을 bloom-page 블록 단위로 분할(각 블록 = 한 페이지 마크업)."""
    parts = _PAGE_SPLIT_RE.split(index_html)
    pages: list[str] = []
    for i in range(1, len(parts), 2):  # [pre, marker, body, marker, body, ...]
        body = parts[i + 1] if i + 1 < len(parts) else ""
        pages.append(parts[i] + body)
    return pages


def extract_page_images(index_html: str, base: str) -> list[str]:
    """
    index.htm DOM 순서로 본문 페이지 이미지 절대 URL 추출 (Amd#2 §4).
    - bloom-page 블록 중 'numberedPage'(본문 페이지)만 채택 → xmatter(표지·크레딧·
      LevelChart·branding 페이지)는 자연 배제(실측: 신간은 비-본문 배경이미지 혼재).
    - 각 본문 페이지의 background-image url()을 DOM 등장 순서로 수집(순서 = 권위).
    - 파일명은 임의(image3.png 등)이고 번호순≠페이지순이라 숫자 정렬 금지(ASb 교훈).
    - 표지·브랜딩·레벨차트 명칭 이미지는 이름 필터로 2차 배제. 연속 중복명은 1개로 접음.
    """
    urls: list[str] = []
    prev: Optional[str] = None
    for page in _split_pages(index_html):
        opening = page[: page.find(">") + 1] if ">" in page else page[:400]
        if "numberedPage" not in opening:
            continue
        for m in _BG_IMAGE_RE.finditer(page):
            fname = m.group(1).strip().split("/")[-1]  # 상대 파일명만
            if not fname or _NON_PAGE_IMG_RE.search(fname):
                continue
            if fname == prev:  # 직전과 동일 파일명(중복 레이어 등) → 스킵
                continue
            prev = fname
            urls.append(base + fname)
    return urls


# ---------------------------------------------------------------------------
# 5. 라이선스 URL 안전장치 (Amd#1)
# ---------------------------------------------------------------------------
def verify_license_version(
    index_html: str, license_code: str
) -> tuple[bool, str]:
    """
    책 HTML의 creativecommons.org/licenses/<token>/<ver> 추출 → 기대 버전 검증.
    cc-by→by/4.0, cc-by-sa→by-sa/4.0. 일치 시 (True, "by/4.0"), 아니면 (False, 사유).
    ※ 개별 일러스트 data-license(예: cc-by-nc-sa)는 책 레벨 아님 → _CC_URL_RE가
      by·by-sa URL만 매칭하므로 무시됨.
    """
    expected_token = EXPECTED_CC_TOKEN.get(license_code)
    if expected_token is None:
        return False, f"매핑외 license={license_code}"
    found = [(t.lower(), v) for t, v in _CC_URL_RE.findall(index_html)]
    if not found:
        return False, "CC URL 부재"
    for token, ver in found:
        if token == expected_token and ver == EXPECTED_CC_VERSION:
            return True, f"{token}/{ver}"
    sample = ", ".join(f"{t}/{v}" for t, v in found[:3])
    return False, f"기대({expected_token}/{EXPECTED_CC_VERSION}) 불일치: {sample}"


# ---------------------------------------------------------------------------
# 6. 매니페스트 합성 (asb-parser 문법, 이미지-only) — sync_book_dash_v2 인터페이스 동형
# ---------------------------------------------------------------------------
def build_manifest_from_urls(slug: str, title: str, image_urls: list[str]) -> str:
    """
    asb-parser.ts 가 읽는 문법으로 합성 .txt 생성(이미지 URL 직접 수신).
      헤더(key:\\tvalue, 파서 무시) → page_text:(비움) → images:(URL 순서) → translations:
    (sync_book_dash_v2.build_manifest_from_urls 와 동일 인터페이스, source=bloom.)
    """
    lines: list[str] = [
        f"id:\t{slug}",
        f"title:\t{title}",
        f"source:\t{SOURCE_PLATFORM}",
        "",
        "page_text:",
        "",  # 이미지-only: P 라인 없음
        "images:",
        "",
    ]
    lines.extend(image_urls)
    lines += ["", "translations:", ""]
    return "\n".join(lines)


def build_bloom_manifest(book: dict[str, Any]) -> dict[str, Any]:
    """
    책 1권 → 매니페스트 합성 결과 dict.
    성공: {ok:True, slug, title, version, page_count, image_urls, manifest}
    스킵: {ok:False, reason}
    """
    license_code = book.get("license") or ""
    title = pick_english_title(book)
    bid = book.get("bookInstanceId") or book.get("objectId") or ""
    slug = slugify(title, fallback=bid)

    index_html, base = fetch_index_html(book)
    if index_html is None or base is None:
        return {"ok": False, "reason": "index.htm fetch 실패", "slug": slug}

    ok, version = verify_license_version(index_html, license_code)
    if not ok:
        return {"ok": False, "reason": f"라이선스 검증 실패({version})", "slug": slug}

    image_urls = extract_page_images(index_html, base)
    if not image_urls:
        return {"ok": False, "reason": "본문 이미지 0장", "slug": slug}

    manifest = build_manifest_from_urls(slug, title, image_urls)
    return {
        "ok": True,
        "slug": slug,
        "title": title,
        "version": version,
        "page_count": len(image_urls),
        "image_urls": image_urls,
        "manifest": manifest,
    }


# ---------------------------------------------------------------------------
# 리포트
# ---------------------------------------------------------------------------
def _title_of(book: dict[str, Any]) -> str:
    t = book.get("title")
    return t if isinstance(t, str) and t else "(제목 없음)"


def print_collect_report(
    total_count: int,
    collected: list[dict[str, Any]],
    after_tag: list[dict[str, Any]],
    tag_excluded: int,
    candidates: list[dict[str, Any]],
    no_en: int,
    bad_json: int,
) -> None:
    print()
    print("-" * 64)
    print(" 수집 리포트 (드라이런)")
    print("-" * 64)
    print(f"  서버측 where 총 권수(count)   : {total_count}")
    print(f"  실제 수집(--limit 적용)       : {len(collected)}")
    print(f"  1단 dedup 제외(list 태그)     : {tag_excluded}")
    print(f"  영어 본문 필터 제외(en 없음)  : {no_en}")
    print(f"  allTitles 파싱 실패 제외      : {bad_json}")
    print(f"  잔여 후보                     : {len(candidates)}")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Bloom Library 동기화 (ADR-0028)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="DB·Storage 쓰기 없이 수집·합성·출력만 (기본 True)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="실제 적재(조각4 전용). 본 단계에서는 미구현.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="수집 후보 수 상한 (기본 5, 외부 부하 방지)",
    )
    args = parser.parse_args()

    if args.execute:
        print("[STOP] --execute 미구현(조각4 예정). 본 단계는 수집·합성·드라이런만.")
        return 0

    dry_run = True
    where = build_where()

    print("=" * 64)
    print(" Bloom Library 동기화 (ADR-0028) — 수집·합성·드라이런 (조각1+2)")
    print("=" * 64)
    print(f"  Parse API : {PARSE_BOOKS}")
    print(f"  필터      : license={FIRST_BATCH_LICENSE} "
          f"tags$in={FIRST_BATCH_LEVELS} lang=en($inQuery)")
    print(f"  라이선스 매핑           : {LICENSE_MAP}")
    print(f"  1단 dedup 제외 태그      : {EXISTING_SOURCE_LIST_TAGS}")
    print(f"  dry_run   : {dry_run} / limit: {args.limit}")

    try:
        total_count = fetch_count(where)
        print(f"\n[INFO] 서버측 where count = {total_count}")
        collected = fetch_books(where, limit=args.limit)
        print(f"[INFO] 수집 완료 = {len(collected)}건")
        after_tag, tag_excluded = apply_tag_dedup(collected)
        candidates, no_en, bad_json = apply_english_filter(after_tag)
    except requests.HTTPError as e:
        print(f"[FAIL] Parse API HTTP 오류: {e}")
        return 1
    except requests.RequestException as e:
        print(f"[FAIL] Parse API 요청 실패: {e}")
        return 1

    print_collect_report(
        total_count, collected, after_tag, tag_excluded,
        candidates, no_en, bad_json,
    )

    # --- 조각2: 매니페스트 합성 (후보 전수 — 이미 --limit로 상한) ---
    print()
    print("-" * 64)
    print(" 매니페스트 합성 (조각2, 로컬 — Storage 업로드 없음)")
    print("-" * 64)
    ok_results: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for b in candidates:
        res = build_bloom_manifest(b)
        if res.get("ok"):
            ok_results.append(res)
        else:
            skipped.append(res)
        time.sleep(0.2)  # 외부 예의

    print(f"  라이선스·합성 통과 : {len(ok_results)}")
    print(f"  스킵               : {len(skipped)}")
    for s in skipped:
        print(f"    - skip slug={s.get('slug')!r} 사유={s.get('reason')}")

    if ok_results:
        sample = ok_results[0]
        print()
        print(f"  [표본] 영어 제목 : {sample['title']!r}")
        print(f"         slug      : {sample['slug']}")
        print(f"         라이선스  : {sample['version']}")
        print(f"         페이지 수 : {sample['page_count']}")
        print()
        print("  [표본 매니페스트 .txt 전문]")
        print("  " + "-" * 60)
        for line in sample["manifest"].split("\n"):
            print(f"  | {line}")
        print("  " + "-" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
