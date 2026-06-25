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
from collections import Counter
from pathlib import Path
from typing import Any, Optional

import requests

# 로컬 lib 모듈 임포트 — scripts/를 sys.path에 추가(기존 sync 스크립트 패턴).
_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))
from lib.attribution import build_attribution, AttributionError  # noqa: E402

# 리포트 출력 경로(리포 scratchpad/ — 세션 유실 방지).
ROOT = _SCRIPT_DIR.parent
REPORT_PATH = ROOT / "scratchpad" / "bloom_dryrun_report.txt"
REPORT_PATH_V2 = ROOT / "scratchpad" / "bloom_dryrun_report_v2.txt"  # 품질게이트 반영(Amd#3)
ENV_FILE = ROOT / ".env.local"
BUCKET = "book-manifests"  # ADR-0027 Amd#2 (asb_native 매니페스트 공용 버킷)

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

# 적재 상수 (조각4).
CONTENT_TYPE = "asb_native"  # 이미지 시퀀스 자체 렌더(AsbReader 재사용)
COVER_FILENAME = "coverImage200.jpg"  # harvester bloomdigital 표지(STEP9 실측)
BLOOM_DETAIL_TMPL = "https://bloomlibrary.org/book/{object_id}"  # 책 상세 페이지
GATE1_MIN_PAGES = 2  # 본문 < 2장(=1장 이하) 책은 게이트① 스킵(ADR-0027 Amd#5 동형)
# 책 HTML data-creator 속성(저자/창작자 신호) — 책 레벨 최빈값을 author로 채택.
_DATA_CREATOR_RE = re.compile(r'data-creator=["\']([^"\']+)["\']', re.I)

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
# 따옴표 안 내용은 따옴표 문자만 종결자 — 파일명에 괄호 '( )'가 있어도 안전(실측 버그).
_BG_IMAGE_RE = re.compile(
    r"background-image:\s*url\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^)]*?))\s*\)", re.I
)
# bloom-page 블록 분할 마커(캡처).
_PAGE_SPLIT_RE = re.compile(r'(<div class="[^"]*bloom-page)', re.I)
# bloom-editable 요소(속성 순서 무관) — lang="en" 영어 텍스트 추출용(Amd#4 ①).
_EDITABLE_RE = re.compile(
    r"<div\b([^>]*\bbloom-editable\b[^>]*)>(.*?)</div>", re.S | re.I
)
# 검수 리스트 시그널(자동제외 아님 — D5 시각검수, Amd#3 ②). 제목 단어 + 비스토리 주제 태그.
_REVIEW_TITLE_RE = re.compile(
    r"\b(unit|phase|game|lesson|quiz|worksheet)\b", re.I
)
_NONSTORY_TOPIC_TAGS = (
    "topic:Math",
    "topic:Mathematics",
    "topic:Science",
)
# 자동제외 시그널(Amd#3 ①). AI생성 이미지명/저자 + 테스트물 제목.
_AI_IMG_RE = re.compile(
    r"(gemini_|ai[_-]?generated|dall[-_ ]?e|midjourney|stable[-_ ]?diffusion)", re.I
)
_AI_AUTHOR_RE = re.compile(
    r"(google gemini|gemini ai|ai[- ]generated|generated by ai|chatgpt|midjourney)", re.I
)
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


def extract_en_text(page_html: str) -> str:
    """numberedPage 블록의 lang="en" bloom-editable 텍스트(Amd#4 ①). 없으면 ""."""
    for attrs, inner in _EDITABLE_RE.findall(page_html):
        if re.search(r'\blang="en"', attrs, re.I):
            t = re.sub(r"<[^>]+>", " ", inner)
            t = re.sub(r"\s+", " ", t).strip()
            if t:
                return t
    return ""


def extract_pages(
    index_html: str, base: str
) -> tuple[list[tuple[str, str]], dict[str, int]]:
    """
    index.htm DOM 순서로 (본문 이미지 URL, 영어 텍스트) 짝 추출 (Amd#2 §4 + Amd#4 ①).
    - bloom-page 블록 중 'numberedPage'(본문)만 채택 → xmatter는 자연 배제.
    - 각 본문 페이지: background-image url() DOM 순서 이미지 + lang="en" 텍스트.
      · 페이지 첫 이미지에 그 페이지 영어 텍스트를 부여, 같은 페이지 추가 이미지는 ""(이미지만).
    - 파일명은 임의·비순차라 숫자 정렬 금지(ASb 교훈). 연속 중복명은 1개로 접음.
    - 이미지 0장 페이지(텍스트만)는 스킵 — 이미지 시퀀스 정렬 보존(드묾, 미해결 Amd#4).
    → (짝 리스트[(url, text)], stats). stats = numbered_pages·multi_image_pages·collapsed_dups.
    """
    pairs: list[tuple[str, str]] = []
    prev: Optional[str] = None
    numbered = 0
    multi_image_pages = 0
    collapsed_dups = 0
    for page in _split_pages(index_html):
        opening = page[: page.find(">") + 1] if ">" in page else page[:400]
        if "numberedPage" not in opening:
            continue
        numbered += 1
        en_text = extract_en_text(page)
        page_imgs = 0
        for m in _BG_IMAGE_RE.finditer(page):
            raw = m.group(1) or m.group(2) or m.group(3) or ""  # dquote/squote/unquoted
            fname = raw.strip().split("/")[-1]  # 상대 파일명만
            if not fname or _NON_PAGE_IMG_RE.search(fname):
                continue
            if fname == prev:  # 직전과 동일 파일명(중복 레이어 등) → 스킵
                collapsed_dups += 1
                continue
            prev = fname
            # 페이지 첫 이미지에만 텍스트 부여(추가 이미지는 이미지-only 면).
            pairs.append((base + fname, en_text if page_imgs == 0 else ""))
            page_imgs += 1
        if page_imgs >= 2:
            multi_image_pages += 1
    stats = {
        "numbered_pages": numbered,
        "multi_image_pages": multi_image_pages,
        "collapsed_dups": collapsed_dups,
    }
    return pairs, stats


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


def build_bloom_manifest_text(
    slug: str, title: str, pairs: list[tuple[str, str]]
) -> str:
    """
    asb-parser 문법 매니페스트 — page_text(P<n>\\t<영어>) + images 인덱스 정렬(Amd#4 ①).
    pairs[i] = (이미지 URL, 영어 텍스트). 텍스트 없으면 P<n>\\t(공란) — 이미지-only 면.
    asb-parser가 texts[i]·images[i]를 같은 인덱스로 짝지으므로 길이·순서 1:1 보장.
    """
    text_lines = [f"P{i + 1}\t{t}" for i, (_, t) in enumerate(pairs)]
    image_lines = [u for u, _ in pairs]
    lines: list[str] = [
        f"id:\t{slug}",
        f"title:\t{title}",
        f"source:\t{SOURCE_PLATFORM}",
        "",
        "page_text:",
        "",
        *text_lines,
        "",
        "images:",
        "",
        *image_lines,
        "",
        "translations:",
        "",
    ]
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

    pairs, img_stats = extract_pages(index_html, base)
    if not pairs:
        return {"ok": False, "reason": "본문 이미지 0장", "slug": slug}

    image_urls = [u for u, _ in pairs]
    text_count = sum(1 for _, t in pairs if t)
    manifest = build_bloom_manifest_text(slug, title, pairs)
    return {
        "ok": True,
        "slug": slug,
        "title": title,
        "version": version,
        "page_count": len(pairs),
        "image_urls": image_urls,
        "text_count": text_count,
        "manifest": manifest,
        "stats": img_stats,
        "review": flag_review_list(book, title),
        "base": base,  # harvester bloomdigital base(표지 URL 조립용)
        "author": extract_author(index_html),
    }


def extract_author(index_html: str) -> Optional[str]:
    """책 HTML data-creator 속성 중 최빈값을 author 신호로 채택(없으면 None)."""
    creators = [c.strip() for c in _DATA_CREATOR_RE.findall(index_html) if c.strip()]
    if not creators:
        return None
    return Counter(creators).most_common(1)[0][0]


# ---------------------------------------------------------------------------
# 비그림책 시그널 (검수 보조 — 자동제외 아님)
# ---------------------------------------------------------------------------
def flag_review_list(book: dict[str, Any], title: str) -> list[str]:
    """검수 리스트 시그널(Amd#3 ② — 자동제외 아님). 제목 학습단어 / 비스토리 주제 태그."""
    sigs: list[str] = []
    if _REVIEW_TITLE_RE.search(title):
        sigs.append("title")
    for t in book.get("tags") or []:
        if t in _NONSTORY_TOPIC_TAGS:
            sigs.append(t)
    return sigs


def is_test_artifact(title: str) -> bool:
    """명백한 테스트물 제목(Amd#3 ① 자동제외). 보수적 패턴만."""
    t = (title or "").strip().lower()
    return (
        t.startswith("test ")
        or "testing book" in t
        or "test bloom" in t
        or t.endswith(" test")
    )


def is_ai_generated(res: dict[str, Any]) -> bool:
    """AI생성 콘텐츠(Amd#3 ① 자동제외). 매니페스트 이미지명 또는 author의 AI 시그널."""
    if _AI_AUTHOR_RE.search(res.get("author") or ""):
        return True
    return any(_AI_IMG_RE.search(u) for u in res.get("image_urls", []))


# ---------------------------------------------------------------------------
# 조각3 — 전량 드라이런 + 분포 리포트 (DB·Storage 없음)
# ---------------------------------------------------------------------------
def _page_bucket(n: int) -> str:
    if n <= 1:
        return "1p (gate① 후보)"
    if n <= 4:
        return "2-4p"
    if n <= 9:
        return "5-9p"
    return "10p+"


def run_full_dryrun(sleep: float = 0.1) -> str:
    """
    1차 배치 모수 전량을 조각1·2 파이프라인으로 끝까지 드라이런(DB·Storage 무접근).
    집계 리포트 문자열 반환 + REPORT_PATH에 저장. 네트워크 에러는 건당 기록 후 계속.
    """
    where = build_where()
    total_count = fetch_count(where)
    print(f"[INFO] 서버측 모수 count = {total_count} — 전량 수집 시작")
    collected = fetch_books(where, limit=None)
    print(f"[INFO] 수집 완료 = {len(collected)}건")

    after_tag, tag_excluded = apply_tag_dedup(collected)
    candidates, no_en, bad_json = apply_english_filter(after_tag)
    print(f"[INFO] 태그 dedup 후 {len(after_tag)} → 영어필터 후 후보 {len(candidates)}")

    # 매니페스트 합성 전수(index.htm 1건/책) — 진행 로그 + 에러 계속.
    ok_results: list[dict[str, Any]] = []
    skip_reasons: Counter = Counter()
    net_errors = 0
    ai_excluded: list[dict[str, Any]] = []
    test_excluded: list[str] = []
    n = len(candidates)
    for i, b in enumerate(candidates, 1):
        title = pick_english_title(b)
        # 자동제외 ①-a: 테스트물 제목 → fetch 전 스킵(Amd#3 ①).
        if is_test_artifact(title):
            test_excluded.append(title)
            time.sleep(sleep)
            continue
        try:
            res = build_bloom_manifest(b)
        except requests.RequestException as e:
            net_errors += 1
            skip_reasons["네트워크 에러"] += 1
            print(f"  [{i}/{n}] NET ERR: {e}")
            time.sleep(sleep)
            continue
        if res.get("ok"):
            # 자동제외 ①-b: AI생성 콘텐츠(Amd#3 ①).
            if is_ai_generated(res):
                ai_excluded.append(res)
            else:
                ok_results.append(res)
        else:
            reason = res.get("reason", "기타")
            # 사유 카테고리화
            if "fetch 실패" in reason:
                skip_reasons["index.htm fetch 실패"] += 1
            elif "CC URL 부재" in reason:
                skip_reasons["라이선스 URL 부재"] += 1
            elif "불일치" in reason:
                skip_reasons["라이선스 버전 불일치"] += 1
            elif "이미지 0장" in reason:
                skip_reasons["본문 이미지 0장"] += 1
            else:
                skip_reasons[reason] += 1
        if i % 25 == 0 or i == n:
            print(f"  [{i}/{n}] ok={len(ok_results)} ai={len(ai_excluded)} "
                  f"test={len(test_excluded)} skip={sum(skip_reasons.values())}")
        time.sleep(sleep)

    # --- 집계 (최종 후보 = 자동제외 반영분) ---
    page_hist: Counter = Counter()
    multi_books = 0
    collapsed_books = 0
    review: list[dict[str, Any]] = []
    for r in ok_results:
        page_hist[_page_bucket(r["page_count"])] += 1
        st = r.get("stats") or {}
        if st.get("multi_image_pages", 0) > 0:
            multi_books += 1
        if st.get("collapsed_dups", 0) > 0:
            collapsed_books += 1
        if r.get("review"):
            review.append(r)

    # --- 리포트 작성 ---
    L: list[str] = []
    L.append("=" * 64)
    L.append(" Bloom 1차 배치 전량 드라이런 리포트 (ADR-0028, DB·Storage 무접근)")
    L.append("=" * 64)
    L.append(f"  필터: license={FIRST_BATCH_LICENSE} tags$in={FIRST_BATCH_LEVELS} lang=en")
    L.append("")
    L.append("(a) 깔때기 카운트")
    L.append(f"  서버측 모수                     : {total_count}")
    L.append(f"  실제 수집                       : {len(collected)}")
    L.append(f"  − 1단 dedup(list 태그) 제외     : {tag_excluded}")
    L.append(f"  − 영어필터 제외(en 없음)        : {no_en}")
    L.append(f"  − allTitles 파싱 실패 제외      : {bad_json}")
    L.append(f"  = 매니페스트 합성 대상 후보     : {len(candidates)}")
    for reason, cnt in skip_reasons.most_common():
        L.append(f"    − 스킵[{reason}]            : {cnt}")
    L.append(f"    − 자동제외[AI생성] (Amd#3①)    : {len(ai_excluded)}")
    L.append(f"    − 자동제외[테스트물] (Amd#3①)  : {len(test_excluded)}")
    L.append(f"  = 최종 적재 후보(게이트 반영)   : {len(ok_results)}")
    L.append(f"  (네트워크 에러 건수: {net_errors})")
    L.append("")
    L.append("(b) 페이지 수 분포 (최종 후보)")
    for bucket in ["1p (gate① 후보)", "2-4p", "5-9p", "10p+"]:
        L.append(f"  {bucket:18s}: {page_hist.get(bucket, 0)}")
    L.append("")
    L.append("(c) 다중 background-image / 표지중복 의심")
    L.append(f"  페이지당 이미지 2장+ 발생 책 수 : {multi_books}")
    L.append(f"  연속중복 접은 책 수             : {collapsed_books}")
    L.append("")
    L.append("(d) 검수 리스트 분리 (Amd#3② — 자동제외 아님, D5 시각검수)")
    L.append(f"  검수 플래그 책 수: {len(review)} / 최종 후보 {len(ok_results)}")
    L.append("  제목 표본(최대 20):")
    for r in review[:20]:
        L.append(f"    - {r['title'][:60]!r}  sig={r['review']}")
    L.append("")
    L.append("(d-2) 자동제외 표본 (검증용)")
    L.append(f"  AI생성 제외 {len(ai_excluded)}건 — 제목 표본(최대 10):")
    for r in ai_excluded[:10]:
        L.append(f"    - {r['title'][:55]!r}  author={r.get('author')!r}")
    L.append(f"  테스트물 제외 {len(test_excluded)}건 — 제목 표본(최대 10):")
    for t in test_excluded[:10]:
        L.append(f"    - {t[:55]!r}")
    L.append("")
    L.append("(e) 라이선스 분포 (최종 후보)")
    ver_hist: Counter = Counter(r["version"] for r in ok_results)
    for ver, cnt in ver_hist.most_common():
        L.append(f"  {ver:10s}: {cnt}")
    L.append("  (스킵 라이선스 사유는 (a) 깔때기 참조)")
    L.append("")

    report = "\n".join(L)
    REPORT_PATH_V2.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH_V2.write_text(report, encoding="utf-8")
    return report


# ---------------------------------------------------------------------------
# 조각4 — 실제 적재 (Storage 업로드 + DB INSERT, --execute 전용)
# ---------------------------------------------------------------------------
def init_supabase() -> tuple[Any, str]:
    """.env.local/OS env에서 url·secret 로드 → (client, url). 키 값은 출력 금지(Hard Rule 6)."""
    try:
        from dotenv import load_dotenv
        from supabase import create_client
    except ImportError:
        print("[FAIL] 의존성 누락: pip install supabase python-dotenv --break-system-packages")
        sys.exit(1)
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    import os

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret:
        print("[FAIL] 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY")
        sys.exit(1)
    return create_client(url, secret), url


def _norm_title(t: str) -> str:
    """dedup 2단용 제목 정규화 — 소문자·영숫자만·공백 단일화."""
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def fetch_existing_titles(client: Any) -> set[str]:
    """기존 books의 정규화 title 집합(dedup 2단 — 태그 없는 사본·GDL 중복 포착)."""
    rows = client.table("books").select("title").execute().data or []
    return {_norm_title(r.get("title", "")) for r in rows if r.get("title")}


def bloom_cover_url(res: dict[str, Any]) -> Optional[str]:
    """harvester bloomdigital base + coverImage200.jpg → 표지 절대 URL."""
    base = res.get("base")
    return (base + COVER_FILENAME) if base else None


def build_book_payload(
    book: dict[str, Any], res: dict[str, Any], content_url: str
) -> dict[str, Any]:
    """books INSERT용 payload 구성 (attribution_text NOT NULL 보장)."""
    source_id = book.get("bookInstanceId") or book.get("objectId") or ""
    object_id = book.get("objectId") or ""
    title = res["title"]
    our_license = LICENSE_MAP.get(book.get("license") or "", "cc-by-4-0")
    original_url = BLOOM_DETAIL_TMPL.format(object_id=object_id)
    author = res.get("author")
    attribution_text = build_attribution(
        title=title,
        author=author,
        illustrator=None,
        source_platform=SOURCE_PLATFORM,
        license_code=our_license,
        original_url=original_url,
    )
    return {
        "source_platform": SOURCE_PLATFORM,
        "source_id": source_id,
        "title": title,
        "cover_url": bloom_cover_url(res),
        "content_url": content_url,
        "content_type": CONTENT_TYPE,
        "language": "en",
        "license": our_license,
        "author": author,
        "illustrator": None,
        "original_url": original_url,
        "attribution_text": attribution_text,
        "is_active": False,  # ★ 스테이징 — 검수 후 별도 단계에서 공개
    }


def upload_manifest(
    client: Any, supabase_url: str, source_id: str, text: str
) -> str:
    """book-manifests/bloom-{source_id}.txt 업로드 → Public URL. (slug 충돌 회피 위해 id 사용)"""
    object_path = f"bloom-{source_id}.txt"
    client.storage.from_(BUCKET).upload(
        object_path,
        text.encode("utf-8"),
        {"content-type": "text/plain; charset=utf-8", "upsert": "true"},
    )
    return f"{supabase_url}/storage/v1/object/public/{BUCKET}/{object_path}"


def upsert_book(client: Any, payload: dict[str, Any]) -> tuple[bool, str]:
    """books UPSERT(UNIQUE source_platform,source_id)."""
    try:
        client.table("books").upsert(
            payload, on_conflict="source_platform,source_id"
        ).execute()
        return True, "upsert OK"
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {str(exc)[:200]}"


def verify_inserted(client: Any, source_id: str) -> Optional[dict[str, Any]]:
    """적재 직후 source_id로 SELECT 1건 검증."""
    rows = (
        client.table("books")
        .select(
            "id,title,source_platform,source_id,content_type,content_url,"
            "license,attribution_text,is_active,cover_url,original_url"
        )
        .eq("source_platform", SOURCE_PLATFORM)
        .eq("source_id", source_id)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def run_execute(
    client: Any, supabase_url: str, max_insert: int, skip_review: bool = False
) -> int:
    """
    파이프라인 통과분을 최대 max_insert 권만 실제 적재(Storage + DB).
    gate①·dedup 2단(정규화 title) 포함. is_active=false 스테이징.
    skip_review=True 면 검수리스트 플래그 책도 스킵(깨끗한 표본 적재용 — 배치 시엔 False).
    """
    where = build_where()
    # 후보 확보용 풀(필터 통과율 고려해 넉넉히, 단 상한). 실제 INSERT는 max_insert에서 멈춤.
    pool = min(max(max_insert * 30, 40), 200)
    print(f"[INFO] 후보 풀 수집(limit={pool}) — 실제 INSERT는 정확히 {max_insert}권에서 중단")
    collected = fetch_books(where, limit=pool)
    after_tag, tag_excluded = apply_tag_dedup(collected)
    candidates, no_en, bad_json = apply_english_filter(after_tag)
    print(f"[INFO] 풀 {len(collected)} → 태그dedup {len(after_tag)} → 영어필터 {len(candidates)}")

    print("[INFO] 기존 books 제목 로드(dedup 2단)...")
    existing = fetch_existing_titles(client)
    print(f"[INFO] 기존 제목 {len(existing)}개 로드")

    inserted = 0
    for b in candidates:
        if inserted >= max_insert:
            break
        title = pick_english_title(b)
        # 자동제외 ①-a: 테스트물(Amd#3 ①) — fetch 전.
        if is_test_artifact(title):
            print(f"  skip(자동제외 테스트물) title={title[:50]!r}")
            continue
        res = build_bloom_manifest(b)
        if not res.get("ok"):
            print(f"  skip(합성) slug={res.get('slug')!r} 사유={res.get('reason')}")
            continue
        # 자동제외 ①-b: AI생성 콘텐츠(Amd#3 ①).
        if is_ai_generated(res):
            print(f"  skip(자동제외 AI생성) slug={res['slug']!r} author={res.get('author')!r}")
            continue
        # gate①: 본문 1장 이하
        if res["page_count"] < GATE1_MIN_PAGES:
            print(f"  skip(gate① 본문 {res['page_count']}장) slug={res['slug']!r}")
            continue
        # 검수 리스트 플래그(Amd#3 ② — 기본은 제외 아님, 로그만).
        if res.get("review"):
            if skip_review:
                print(f"  skip(검수리스트 --skip-review) slug={res['slug']!r} sig={res['review']}")
                continue
            print(f"  [검수리스트] slug={res['slug']!r} sig={res['review']} (적재는 진행)")
        # dedup 2단: 정규화 title 교차대조
        if _norm_title(res["title"]) in existing:
            print(f"  skip(dedup2 기존제목) slug={res['slug']!r}")
            continue

        source_id = b.get("bookInstanceId") or b.get("objectId") or ""
        try:
            content_url = upload_manifest(client, supabase_url, source_id, res["manifest"])
        except Exception as exc:  # noqa: BLE001
            print(f"  skip(Storage 업로드 실패) {type(exc).__name__}: {str(exc)[:160]}")
            continue

        try:
            payload = build_book_payload(b, res, content_url)
        except AttributionError as exc:
            print(f"  skip(attribution 실패) {exc}")
            continue

        ok, msg = upsert_book(client, payload)
        if not ok:
            print(f"  skip(DB upsert 실패) {msg}")
            continue

        row = verify_inserted(client, source_id)
        inserted += 1
        print()
        print("=" * 64)
        print(f" [적재 완료 {inserted}/{max_insert}] books row 검증")
        print("=" * 64)
        if row:
            for k in [
                "id", "title", "source_platform", "source_id", "content_type",
                "content_url", "license", "is_active", "cover_url", "original_url",
            ]:
                print(f"  {k:16s}: {row.get(k)}")
            print(f"  attribution_text:\n    " + "\n    ".join(
                row.get("attribution_text", "").split("\n")))
        else:
            print("  [WARN] 적재 후 SELECT 0건 — 확인 필요")
        print(f"  manifest URL    : {content_url}")

    print(f"\n[INFO] 총 적재 {inserted}권 (요청 상한 {max_insert})")
    return 0


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
    parser.add_argument(
        "--full-dryrun",
        action="store_true",
        help="전량(1차 배치 모수 전체) 드라이런 + 분포 리포트 저장(조각3). DB·Storage 없음.",
    )
    parser.add_argument(
        "--skip-review",
        action="store_true",
        help="검수리스트 플래그 책도 스킵(깨끗한 표본 적재 검증용). 배치 적재 시엔 미사용.",
    )
    args = parser.parse_args()

    if args.execute:
        print("=" * 64)
        print(f" Bloom 실제 적재 (조각4) — Storage+DB, is_active=FALSE, 상한 {args.limit}권")
        print("=" * 64)
        client, supabase_url = init_supabase()
        print(f"[INFO] Supabase 연결: {supabase_url}")
        try:
            return run_execute(
                client, supabase_url, max_insert=args.limit,
                skip_review=args.skip_review,
            )
        except requests.RequestException as e:
            print(f"[FAIL] 수집 단계 요청 실패: {e}")
            return 1

    if args.full_dryrun:
        print("=" * 64)
        print(" Bloom 전량 드라이런 (조각3) — DB·Storage 무접근")
        print("=" * 64)
        try:
            report = run_full_dryrun()
        except requests.RequestException as e:
            print(f"[FAIL] 수집 단계 요청 실패: {e}")
            return 1
        print()
        print(report)
        print(f"[INFO] 리포트 저장: {REPORT_PATH}")
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
