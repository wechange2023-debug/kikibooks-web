#!/usr/bin/env python3
"""
sync_book_dash_v2.py — Book Dash 신간(영어 206권) 2차 동기화 (ADR-0027)

기존 scripts/sync_book_dash.py(meta.yml + GH Pages, 54권 content_type='html')는
2019 스냅샷이라 순증 0. 본 스크립트는 그와 별개로, bookdash.org WP REST API의
영어 신간을 수집해 이미지 시퀀스(content_type='asb_native') 책으로 적재한다.

소스 3원 (ADR-0027 D1):
  1. WP API   : /wp/v2/books?languages=621 — slug·title·표지(featured_media)·original_url
  2. 폴더 HTML: /book-source-files/?book={slug}&folder=/e-book/en_english/images — 페이지 목록
  3. CloudFront: 본문 페이지 이미지 직링크(핫링크, Supabase 미복사 — D3)
  + 책 페이지 HTML(/books/{slug}/) — Writer/Illustrator 역할 분리(D5)

저장 (ADR-0027 D2/Amd#1·#2):
  - content_type = 'asb_native' (스키마 변경 없음, 004 화이트리스트 재사용)
  - content_url  = 합성 .txt 매니페스트 Public URL (Supabase Storage 'book-manifests')
  - 매니페스트 images: 섹션 = CloudFront 페이지 URL(asb-parser .jpg 수용분, ADR-0027 D2)
  - source_id    = slug (D6)

본 단계(드라이런):
  - 외부는 GET만. DB INSERT·Storage 업로드 코드는 작성하되 dry_run 분기로 '실행 안 함'.
  - --limit 기본 5 (외부 부하 방지). 전량(206)은 다음 단계.

사용:
    python scripts/sync_book_dash_v2.py --dry-run --limit 5
"""

from __future__ import annotations

import argparse
import html
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Optional

import requests

# 로컬 lib 모듈 임포트 — scripts/를 sys.path에 추가 (기존 sync 스크립트 패턴)
_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))
from lib.attribution import build_attribution, AttributionError  # noqa: E402

# Windows 콘솔(cp949) 한글·이모지 깨짐 방지 (기존 스크립트 패턴)
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 설정 상수 (ADR-0027 정찰 실측값)
# ---------------------------------------------------------------------------
WP_BASE = "https://bookdash.org/wp-json/wp/v2"
WP_BOOKS = WP_BASE + "/books"
ENGLISH_LANG_TERM = 621  # languages taxonomy term id (정찰 실측)
BOOK_PAGE_BASE = "https://bookdash.org/books"
SOURCE_FILES_BASE = "https://bookdash.org/book-source-files"
CLOUDFRONT = "https://d3qawc7yl9x4zs.cloudfront.net"
BUCKET = "book-manifests"  # ADR-0027 Amd#2
SOURCE_PLATFORM = "book_dash"
LICENSE_CODE = "cc-by-4-0"
CONTENT_TYPE = "asb_native"
LANGUAGE = "en"

HTTP_TIMEOUT = 30
WP_PER_PAGE = 100

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"


# ---------------------------------------------------------------------------
# Supabase 클라이언트 (실적재 시에만 초기화 — 기존 sync 스크립트 패턴)
# ---------------------------------------------------------------------------
def init_supabase() -> tuple[Any, str]:
    """
    .env.local(로컬) 또는 OS env(CI)에서 url·secret 로드 → (client, url) 반환.
    SUPABASE_SECRET_KEY는 출력 금지(Hard Rule 6).
    """
    try:
        from dotenv import load_dotenv
        from supabase import create_client
    except ImportError:
        print(
            "[FAIL] 의존성 누락: pip install -r requirements.txt --break-system-packages"
        )
        sys.exit(1)
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret:
        print("[FAIL] 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY")
        sys.exit(1)
    return create_client(url, secret), url


# ---------------------------------------------------------------------------
# 2. WP API — 영어책 수집 (페이지네이션)
# ---------------------------------------------------------------------------
def fetch_english_slugs(limit: Optional[int] = None) -> list[dict[str, Any]]:
    """
    /books?languages=621 를 per_page=100·page=N 으로 순회.
    X-WP-TotalPages 로 종료 판정. limit 도달 시 조기 종료(드라이런 부하 절감).
    각 책: slug, title, wp_id, original_url, cover_url(featured_media→없으면 CloudFront 폴백).
    """
    out: list[dict[str, Any]] = []
    page = 1
    total_pages = 1
    total_books: Optional[int] = None

    while page <= total_pages:
        params = {
            "languages": ENGLISH_LANG_TERM,
            "per_page": WP_PER_PAGE,
            "page": page,
            "_embed": 1,  # wp:featuredmedia(표지 source_url) 동봉
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
            out.append(_extract_book(b))
            if limit is not None and len(out) >= limit:
                return out
        page += 1
        time.sleep(0.3)  # 외부 예의

    return out


def fetch_one_slug(slug: str) -> list[dict[str, Any]]:
    """WP API에서 단일 slug 책만 조회(?slug=). --only-slug 용."""
    params = {"slug": slug, "_embed": 1}
    resp = requests.get(WP_BOOKS, params=params, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return [_extract_book(b) for b in resp.json()]


def _extract_book(b: dict[str, Any]) -> dict[str, Any]:
    slug = b.get("slug") or ""
    # WP title.rendered 는 HTML 엔티티 포함(예: Mom&#8217;s) → 디코딩 후 전 경로 사용.
    title = html.unescape(((b.get("title") or {}).get("rendered") or "").strip())
    wp_id = b.get("id")
    original_url = b.get("link") or f"{BOOK_PAGE_BASE}/{slug}/"

    # 표지: _embedded.wp:featuredmedia[0].source_url → 없으면 CloudFront cover 공식
    cover_url: Optional[str] = None
    emb = b.get("_embedded") or {}
    fm = emb.get("wp:featuredmedia") or []
    if fm and isinstance(fm, list):
        cover_url = (fm[0] or {}).get("source_url")
    if not cover_url:
        cover_url = f"{CLOUDFRONT}/{slug}/e-book/en_english/images/{slug}_en_cover.jpg"

    return {
        "slug": slug,
        "title": title,
        "wp_id": wp_id,
        "original_url": original_url,
        "cover_url": cover_url,
    }


# ---------------------------------------------------------------------------
# 3. 폴더 HTML — 페이지 목록 (정적 HTML, 정찰 실측)
# ---------------------------------------------------------------------------
_PAGE_RE_TMPL = r"{slug}_en_page(\d+)\.jpg"


def fetch_page_list(slug: str) -> list[int]:
    """
    /book-source-files/?book={slug}&folder=/e-book/en_english/images GET.
    {slug}_en_page(\\d+).jpg 추출 → int 오름차순(zero-pad 없음 주의). 0장이면 [].
    """
    params = {"book": slug, "folder": "/e-book/en_english/images"}
    resp = requests.get(SOURCE_FILES_BASE, params=params, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    pat = re.compile(_PAGE_RE_TMPL.format(slug=re.escape(slug)))
    nums = sorted({int(m) for m in pat.findall(resp.text)})
    return nums


# ---------------------------------------------------------------------------
# 3-B. Scheme B 본문 추출 (ADR-0027 Amd#4 레시피 + Amd#5 게이트② dedup)
# ---------------------------------------------------------------------------
# Scheme B = CloudFront _en_page 경로 404. 파일명 공식화 불가(책마다 stem·날짜·
# zero-pad 상이) → 책페이지 HTML #read-book 모달에서 img[data-src] 직접 파싱.
_THUMB_SUFFIX_RE = re.compile(r"-\d+x\d+(\.(?:jpg|jpeg|png))$", re.I)
_DIV_TOKEN_RE = re.compile(r"<div\b|</div>", re.I)
_DATASRC_RE = re.compile(r'data-src=["\']([^"\']+)["\']', re.I)
_COLLISION_RE = re.compile(r"-\d+$")  # WP 충돌접미사 -N
_DATE_RE = re.compile(r"\d{8}(\d*)")  # 8자리 날짜 제거(글자붙은 페이지번호는 보존)


def _isolate_read_book(html_text: str) -> Optional[str]:
    """<div id="read-book" ...> 의 매칭 닫는 </div> 까지를 div 깊이 카운팅으로 격리.

    매칭 실패(구조 다름) 시 None. (드라이런 dryrun_book_dash_scheme_b.py 검증분)
    """
    m = re.search(r'<div\b[^>]*\bid=["\']read-book["\']', html_text, re.I)
    if not m:
        return None
    start = m.start()
    depth = 0
    seen_open = False
    for tok in _DIV_TOKEN_RE.finditer(html_text, start):
        if tok.group(0).lower().startswith("<div"):
            depth += 1
            seen_open = True
        else:
            depth -= 1
        if seen_open and depth == 0:
            return html_text[start:tok.end()]
    return html_text[start:]  # 닫힘 미발견 — 끝까지(비정상이나 추출 시도)


def _page_key(url: str) -> str:
    """순서기반 dedup용 페이지 키. 파일명 공식을 신뢰하지 않되, 동일 본문의 재등장을
    감지할 수 있게 썸네일·WP 충돌접미사(-N)·8자리 날짜를 정규화한다(Amd#5 게이트②).
    """
    base = url.rsplit("/", 1)[-1]
    base = _THUMB_SUFFIX_RE.sub(r"\1", base)          # -WxH.jpg → .jpg
    base = re.sub(r"\.(?:jpe?g|png)$", "", base, flags=re.I)  # 확장자 제거
    base = _COLLISION_RE.sub("", base)                # -1/-3 등 충돌접미사 제거
    base = _DATE_RE.sub(r"\1", base)                  # 날짜 제거(붙은 번호 보존)
    return base.lower()


def _dedup_first_set(urls: list[str]) -> list[str]:
    """게이트② 'dedup 방식 A — 첫 세트만 채택'(Amd#5, PM 확정).

    문서 순서대로 보다가 이미 본 페이지 키가 다시 등장(=세트 되감기)하면 거기서 절단.
    파일명 규칙이 아니라 '시퀀스가 다시 시작되는가'로 판정.
    """
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        k = _page_key(u)
        if k in seen:
            break  # 본문 세트 재시작 → 첫 세트에서 종료
        seen.add(k)
        out.append(u)
    return out


def fetch_scheme_b_pages(slug: str) -> list[str]:
    """Scheme B 본문 풀사이즈 이미지 URL 목록(Amd#4 레시피 + Amd#5 게이트②).

    책페이지 HTML GET → #read-book 격리 → img[data-src] → uploads 필터 →
    -WxH 접미사 제거 → 중복 제거(첫 세트만). 표지는 수집 안 함(featured_media 사용).
    컨테이너 부재·본문 없음이면 [].
    """
    resp = requests.get(f"{BOOK_PAGE_BASE}/{slug}/", timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    seg = _isolate_read_book(resp.text)
    if seg is None:
        return []
    srcs = _DATASRC_RE.findall(seg)
    uploads = [s for s in srcs if "wp-content/uploads" in s]
    full: list[str] = []
    seen: set[str] = set()
    for u in uploads:
        f = _THUMB_SUFFIX_RE.sub(r"\1", u)  # 풀사이즈 stem
        if f not in seen:
            seen.add(f)
            full.append(f)
    return _dedup_first_set(full)


def apply_cover_dedup(
    slug: str, cover_url: Optional[str], body_urls: list[str]
) -> tuple[list[str], str]:
    """게이트③(Amd#6): 본문 첫 이미지가 표지(cover_url=featured_media)와 동일 그림이면
    첫 1장만 제외(판정방식 a: stem 비교 — _page_key 재사용). 둘째 장 이후는 보존.

    반환 (조정 body_urls, 상태) where 상태 ∈ {"kept","removed","warn"}.
    안전장치: 제외 시 본문이 ≤1장으로 떨어지면 원본 유지+"warn"(과잉제거 방지).
    Scheme A는 표지 stem({slug}_en_cover)≠첫장({slug}_en_page1)이라 자연히 "kept"(무변동).
    """
    if not cover_url or not body_urls:
        return body_urls, "kept"
    if _page_key(cover_url) != _page_key(body_urls[0]):
        return body_urls, "kept"
    trimmed = body_urls[1:]
    if len(trimmed) <= 1:
        return body_urls, "warn"  # 과잉제거 방지 — 원본 유지
    return trimmed, "removed"


# ---------------------------------------------------------------------------
# 4. 책 페이지 HTML — 작가/그린이 (역할 분리, 정찰 실측)
# ---------------------------------------------------------------------------
# "Name (Writer)" / "Name (Illustrator)" 패턴. 역할 표기 + 이미지 파일명(_writer 등) 병용.
# 성 중간/앞의 소문자 입자(name particle: van/de/le 등) 허용 — "Maria van Wyk"가
# "Wyk"로 잘리지 않도록(이전 토막 회귀). 후속 토큰 = 입자 또는 대문자 시작 단어.
_PARTICLE = (
    r"van|von|der|den|de|del|della|du|da|dos|das|le|la|ten|ter|di|bin|al"
)
_NAME = (
    r"[A-Z][A-Za-z.'\-]+"
    r"(?:\s+(?:" + _PARTICLE + r"|[A-Z][A-Za-z.'\-]+)){0,4}"
)
_ROLE_RE = re.compile(rf"({_NAME})\s*\((Writer|Illustrator)\)")
_ROLE_FILE_RE = re.compile(
    r"/([a-z][a-z0-9\-]+)_(writer|illustrator)\b", re.I
)


def fetch_creators(slug: str) -> dict[str, Optional[str]]:
    """
    /books/{slug}/ GET → {'writer': ..., 'illustrator': ...}. 실패·결측 시 None.
    1차: "Name (Writer/Illustrator)" 표기. 2차 보강: 기여자 이미지 파일명 _writer/_illustrator.
    """
    result: dict[str, Optional[str]] = {"writer": None, "illustrator": None}
    try:
        resp = requests.get(f"{BOOK_PAGE_BASE}/{slug}/", timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
    except Exception:
        return result

    txt = re.sub(r"<[^>]+>", " ", resp.text)
    txt = re.sub(r"\s+", " ", txt)
    for name, role in _ROLE_RE.findall(txt):
        key = role.lower()
        if result.get(key) is None:
            result[key] = name.strip()

    # 보강: 표기에서 못 찾은 역할을 이미지 파일명 슬러그로(언더스코어→공백·타이틀케이스)
    if result["writer"] is None or result["illustrator"] is None:
        for fileslug, role in _ROLE_FILE_RE.findall(resp.text):
            key = role.lower()
            if result.get(key) is None:
                result[key] = fileslug.replace("-", " ").title()

    return result


# ---------------------------------------------------------------------------
# 5. 매니페스트 .txt 생성 (asb-parser 문법, 이미지-only)
# ---------------------------------------------------------------------------
def build_manifest_from_urls(slug: str, title: str, image_urls: list[str]) -> str:
    """
    asb-parser.ts 가 읽는 문법으로 합성 .txt 생성(이미지 URL 직접 수신).
      헤더(key:\\tvalue, 파서 무시) → page_text:(비움) → images:(URL 순서) → translations:
    Scheme A(CloudFront)·B(uploads HTML 파싱) 공용. parser 의 .jpg 수용분(ADR-0027 D2).
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


def build_manifest_text(slug: str, title: str, pages: list[int]) -> str:
    """
    Scheme A 전용: 페이지 번호(list[int]) → CloudFront URL 조립 → 공용 빌더 위임.
    CloudFront URL = {CLOUDFRONT}/{slug}/e-book/en_english/images/{slug}_en_page{N}.jpg
    (기존 A 경로 동작·출력 불변. B는 build_manifest_from_urls 직접 호출.)
    """
    urls = [
        f"{CLOUDFRONT}/{slug}/e-book/en_english/images/{slug}_en_page{n}.jpg"
        for n in pages
    ]
    return build_manifest_from_urls(slug, title, urls)


# ---------------------------------------------------------------------------
# attribution_text 생성 (역할 분리형, ADR-0027 D5)
# ---------------------------------------------------------------------------
def build_attr(
    title: str,
    writer: Optional[str],
    illustrator: Optional[str],
    original_url: str,
) -> str:
    """
    build_attribution(분리형)으로 attribution_text 생성. author=writer, illustrator=illustrator.
    writer 결측 시 build_attribution 내부에서 "Unknown creators" 폴백 → NOT NULL 보장(Hard Rule 1).
    """
    return build_attribution(
        title=title,
        author=writer,  # None이면 build_attribution이 "Unknown creators"로 폴백
        illustrator=illustrator,
        source_platform=SOURCE_PLATFORM,
        license_code=LICENSE_CODE,
        original_url=original_url,
    )


# ---------------------------------------------------------------------------
# DB·Storage 쓰기 (작성만 — dry_run 에서는 절대 실행 안 함)
# ---------------------------------------------------------------------------
def upload_manifest(
    client: Any, supabase_url: Optional[str], slug: str, text: str, dry_run: bool
) -> str:
    """
    Supabase Storage 'book-manifests/{slug}_en.txt' 업로드 → Public URL 반환.
    dry_run 이면 업로드하지 않고 예정 public URL만 반환.
    """
    object_path = f"{slug}_en.txt"
    base = supabase_url or "{SUPABASE_URL}"
    public_url = f"{base}/storage/v1/object/public/{BUCKET}/{object_path}"
    if dry_run:
        return public_url  # 실제 업로드 없음
    # service_role 키로 upsert 업로드. (Public 버킷 읽기 정책 불요, ADR-0027 Amd#2)
    client.storage.from_(BUCKET).upload(
        object_path,
        text.encode("utf-8"),
        {"content-type": "text/plain; charset=utf-8", "upsert": "true"},
    )
    return public_url


def upsert_book(client: Any, payload: dict[str, Any], dry_run: bool) -> tuple[bool, str]:
    """books UPSERT(UNIQUE source_platform,source_id). dry_run 이면 실행 안 함."""
    if dry_run:
        return True, "[dry-run] upsert 생략"
    try:
        client.table("books").upsert(
            payload, on_conflict="source_platform,source_id"
        ).execute()
        return True, "upsert OK"
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {str(exc)[:140]}"


# ---------------------------------------------------------------------------
# 6. main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Book Dash v2 동기화 (ADR-0027)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="DB·Storage 쓰기 없이 수집·출력만 (기본 True)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="실제 적재(다음 단계 전용). 본 단계에서는 사용 금지.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="처리 후보 수 상한 (기본 5, 외부 부하 방지)",
    )
    parser.add_argument(
        "--existing-slugs",
        default=None,
        help=(
            "기존 book_dash 54권 slug 차집합용. 쉼표목록 또는 @파일경로(줄단위). "
            "미지정 시 중복=unknown(실제 dedup은 --execute의 upsert on_conflict가 처리)."
        ),
    )
    parser.add_argument(
        "--only-slug",
        default=None,
        help="단일 slug만 처리(WP ?slug= 조회). 첫 실적재 검증용.",
    )
    parser.add_argument(
        "--slug-list",
        default=None,
        help="다건 slug 처리. 쉼표목록 또는 @파일경로. 실패 건은 기록 후 계속.",
    )
    parser.add_argument(
        "--inactive",
        action="store_true",
        help="적재 시 is_active=false(숨김). 기본 동작이며 명시용.",
    )
    args = parser.parse_args()
    dry_run = not args.execute  # --execute 없으면 항상 dry_run

    # 실적재 시에만 Supabase 클라이언트 초기화
    client: Any = None
    supabase_url: Optional[str] = None
    if not dry_run:
        client, supabase_url = init_supabase()
        print(f"[INFO] Supabase 연결: {supabase_url}")

    # 기존 slug 집합 로드(선택). source_id=slug(D6)이므로 신규 slug와 같은 키 체계로 비교.
    existing_slugs: Optional[set[str]] = None
    if args.existing_slugs:
        raw = args.existing_slugs
        if raw.startswith("@"):
            raw = Path(raw[1:]).read_text(encoding="utf-8")
            parts = re.split(r"[\r\n,]+", raw)
        else:
            parts = raw.split(",")
        existing_slugs = {s.strip().lower() for s in parts if s.strip()}
        print(f"[INFO] 기존 slug {len(existing_slugs)}개 로드(차집합 대조용)")

    print("=" * 64)
    print(" Book Dash v2 동기화 (ADR-0027) — 수집·드라이런")
    print("=" * 64)
    print(f"  WP API     : {WP_BOOKS}?languages={ENGLISH_LANG_TERM}")
    print(f"  CloudFront : {CLOUDFRONT}")
    print(f"  bucket     : {BUCKET} (Public)")
    print(f"  content_type: {CONTENT_TYPE} / license: {LICENSE_CODE}")
    print(f"  dry_run    : {dry_run} / limit: {args.limit}")
    print()

    try:
        if args.only_slug:
            candidates = fetch_one_slug(args.only_slug)
        elif args.slug_list:
            raw = args.slug_list
            if raw.startswith("@"):
                raw = Path(raw[1:]).read_text(encoding="utf-8")
            wanted = [s.strip() for s in re.split(r"[\r\n,]+", raw) if s.strip()]
            candidates = []
            for s in wanted:
                candidates += fetch_one_slug(s)
                time.sleep(0.3)
        else:
            candidates = fetch_english_slugs(limit=args.limit)
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] WP API 수집 실패: {exc}")
        return 1

    if args.only_slug:
        print(f"[INFO] --only-slug={args.only_slug} → {len(candidates)}권 매칭\n")
    elif args.slug_list:
        print(f"[INFO] --slug-list → {len(candidates)}권 매칭\n")
    else:
        print(f"[INFO] 후보 {len(candidates)}권 수집(limit={args.limit})\n")

    stats = {
        "total": 0,
        "zero_pages": 0,
        "no_creator": 0,
        "no_cover": 0,
        "no_attribution": 0,
        "dup_existing": 0,
        "net_new": 0,
        "scheme_a": 0,
        "scheme_b": 0,
        "gate1_skip": 0,
        "gate3_removed": 0,
        "gate3_warn": 0,
    }
    page_counts: list[int] = []
    page_outliers: list[str] = []  # 17 외 예외 권
    single_token: list[str] = []  # 성 1토큰 의심(수동 점검)
    exec_storage_ok = 0  # 실적재: Storage 업로드 성공 수
    exec_db_ok = 0  # 실적재: DB upsert 성공 수
    exec_fail: list[str] = []  # 실적재 실패(slug — 사유)
    exec_skip_dup = 0  # 실적재: 기존중복 skip

    header = (
        f"{'slug':24} | {'title':26} | S | {'pg':>3} | "
        f"{'writer':16} | {'illustrator':16} | cov | dup | attribution preview"
    )
    print(header)
    print("-" * len(header))

    for c in candidates:
        slug = c["slug"]
        # Scheme 판정: 폴더리스팅(A)에 페이지가 있으면 A(기존 경로 불변),
        # 비면 B 레시피(Amd#4)로 본문 URL 직접 추출. body_urls 가 단일 진실원.
        scheme = "B"
        try:
            page_nums = fetch_page_list(slug)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {slug}: page list 실패 — {exc}")
            page_nums = []
        if page_nums:
            scheme = "A"
            body_urls = [
                f"{CLOUDFRONT}/{slug}/e-book/en_english/images/{slug}_en_page{n}.jpg"
                for n in page_nums
            ]
        else:
            try:
                body_urls = fetch_scheme_b_pages(slug)
            except Exception as exc:  # noqa: BLE001
                print(f"  ! {slug}: scheme B 추출 실패 — {exc}")
                body_urls = []
        # 게이트③(Amd#6): 본문 첫 장이 표지와 동일하면 제외(stem 비교, 첫 1장만).
        body_urls, _g3 = apply_cover_dedup(slug, c.get("cover_url"), body_urls)
        if _g3 == "removed":
            stats["gate3_removed"] += 1
            print(f"     ✂ gate3_cover_dedup: {slug} removed first page (cover match)")
        elif _g3 == "warn":
            stats["gate3_warn"] += 1
            print(f"     ⚠ gate3_cover_dedup: {slug} 첫 장 표지일치이나 제외 시 본문 과소 → 원본 유지(과잉제거 방지)")
        n_body = len(body_urls)
        creators = fetch_creators(slug)
        time.sleep(0.3)  # 외부 예의

        stats["total"] += 1
        stats["scheme_a" if scheme == "A" else "scheme_b"] += 1
        if n_body == 0:
            stats["zero_pages"] += 1
        else:
            page_counts.append(n_body)
            if n_body != 17:
                page_outliers.append(f"{slug}({n_body}p/{scheme})")
        if not creators.get("writer") and not creators.get("illustrator"):
            stats["no_creator"] += 1
        # 성 1토큰(공백 없음) 의심 — 추가 잘림 점검용
        for _role in ("writer", "illustrator"):
            _n = creators.get(_role)
            if _n and " " not in _n:
                single_token.append(f"{slug}:{_role}={_n}")
        cover_ok = bool(c.get("cover_url"))
        if not cover_ok:
            stats["no_cover"] += 1

        # 기존 54 slug 차집합 (D6: source_id=slug → 같은 키 체계로 비교)
        if existing_slugs is None:
            dup_flag = "?"  # 미지정: 실제 dedup은 --execute upsert on_conflict
        elif slug.lower() in existing_slugs:
            dup_flag = "DUP"
            stats["dup_existing"] += 1
        else:
            dup_flag = "new"
            stats["net_new"] += 1

        # attribution_text 생성 (역할 분리형, 폴백으로 NOT NULL 보장)
        attr_text = ""
        try:
            attr_text = build_attr(
                c["title"], creators.get("writer"), creators.get("illustrator"),
                c["original_url"],
            )
        except AttributionError as exc:
            stats["no_attribution"] += 1
            print(f"  ⊘ attribution 실패: {slug} — {exc}")

        manifest = build_manifest_from_urls(slug, c["title"], body_urls)
        attr_preview = (attr_text.replace("\n", " ⏎ ")[:60]) if attr_text else "(실패)"

        print(
            f"  {slug[:23]:23} | {c['title'][:25]:25} | {scheme} | {n_body:>3} | "
            f"{(creators.get('writer') or '-')[:15]:15} | "
            f"{(creators.get('illustrator') or '-')[:15]:15} | "
            f"{'Y' if cover_ok else 'N':>3} | {dup_flag:>3} | {attr_preview}"
        )

        # 적재 경로. dup_flag=='DUP'면 실적재 skip(기존 UUID 행 유지, drift 보호).
        if not dry_run and dup_flag == "DUP":
            exec_skip_dup += 1
            print(f"     ↷ skip(기존 중복): {slug}")
            continue
        # 게이트①(Amd#5): 본문 ≤1장 → skip(빈 책/표지뿐 제외). dry-run에서도 표시.
        if n_body <= 1:
            stats["gate1_skip"] += 1
            print(f"     ⊘ scheme_{scheme.lower()}_skip: {slug} body_pages={n_body} (게이트① ≤1장)")
            if not dry_run:
                exec_fail.append(f"{slug}: 게이트①(본문 {n_body}장) skip")
            continue
        # 실패해도 멈추지 않음: Storage 업로드 → DB upsert 순서, 각 단계 try.
        content_url = ""
        storage_ok = False
        try:
            content_url = upload_manifest(
                client, supabase_url, slug, manifest, dry_run=dry_run
            )
            storage_ok = True
            if not dry_run:
                exec_storage_ok += 1
        except Exception as exc:  # noqa: BLE001
            if not dry_run:
                exec_fail.append(f"{slug}: Storage 업로드 실패 — {type(exc).__name__}: {str(exc)[:100]}")
                print(f"     ✗ {slug}: Storage 실패 — {str(exc)[:80]}")
                continue
        _payload = {
            "source_platform": SOURCE_PLATFORM,
            "source_id": slug,  # D6
            "title": c["title"],
            "cover_url": c["cover_url"],
            "content_url": content_url,
            "content_type": CONTENT_TYPE,
            "language": LANGUAGE,
            "license": LICENSE_CODE,
            "author": creators.get("writer"),
            "illustrator": creators.get("illustrator"),
            "original_url": c["original_url"],
            "attribution_text": attr_text,
            "is_active": False,  # 검수 전 스테이징(--inactive, ASb 정책 정합)
        }
        ok, msg = upsert_book(client, _payload, dry_run=dry_run)
        if not dry_run:
            if ok:
                exec_db_ok += 1
                print(f"     ✓ {slug}: Storage={'OK' if storage_ok else '-'} DB=OK ({n_body}p/{scheme})")
            else:
                # Storage는 됐는데 DB 실패 = 부분상태
                exec_fail.append(f"{slug}: DB 실패(Storage 업로드됨, 부분상태) — {msg}")
                print(f"     ✗ {slug}: DB 실패(부분상태) — {msg}")

    # 집계
    print()
    print("=" * 64)
    print(" 집계")
    print("=" * 64)
    print(f"  총 후보            : {stats['total']}")
    print(f"  Scheme A / B       : {stats['scheme_a']} / {stats['scheme_b']}")
    print(f"  게이트① skip(≤1장) : {stats['gate1_skip']}")
    print(f"  게이트③ 표지중복제거: {stats['gate3_removed']} (warn 원본유지: {stats['gate3_warn']})")
    if existing_slugs is None:
        print(f"  기존중복 추정      : unknown(--existing-slugs 미지정)")
        print(f"  순신규 추정        : unknown")
    else:
        print(f"  기존중복(DUP)      : {stats['dup_existing']}")
        print(f"  순신규(new)        : {stats['net_new']}")
    print(f"  페이지 0장 경고    : {stats['zero_pages']}")
    print(f"  작가 결측          : {stats['no_creator']}")
    print(f"  표지 결측          : {stats['no_cover']}")
    print(f"  attribution 결측   : {stats['no_attribution']} (0이어야 함)")
    if page_counts:
        from collections import Counter

        mode_n, mode_c = Counter(page_counts).most_common(1)[0]
        print(
            f"  page수 분포        : min={min(page_counts)} "
            f"max={max(page_counts)} 최빈={mode_n}({mode_c}건)"
        )
        if page_outliers:
            print(f"  page 17 예외({len(page_outliers)}) : {', '.join(page_outliers)}")
        else:
            print(f"  page 17 예외       : 없음(전권 17p)")
    if single_token:
        print(f"  성 1토큰 의심({len(single_token)}):")
        for s in single_token:
            print(f"    - {s}")
    else:
        print(f"  성 1토큰 의심      : 없음")
    if not dry_run:
        print()
        print("  [실적재 결과]")
        print(f"    Storage 업로드 성공 : {exec_storage_ok}")
        print(f"    DB upsert 성공      : {exec_db_ok}")
        print(f"    기존중복 skip       : {exec_skip_dup}")
        print(f"    실패                : {len(exec_fail)}")
        if exec_storage_ok != exec_db_ok:
            print(f"    ⚠️ 부분상태 경고: Storage({exec_storage_ok}) ≠ DB({exec_db_ok})")
        for f in exec_fail:
            print(f"      - {f}")
    print()
    print("  ⚠️ 키 체계 경고: 기존 54권 source_id=UUID, 신규 source_id=slug(D6).")
    print("     같은 책이 UUID·slug 두 키로 '중복 적재'될 위험 → 신규 slug가 기존")
    print("     book_dash slug와 겹치면 그 책은 skip(실제 skip은 --execute 단계).")
    print("     --existing-slugs 로 54 slug 넘기면 dry-run에서 DUP/new 집계 반영.")
    if dry_run:
        print("  ※ dry-run — DB·Storage에 아무것도 쓰지 않았습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
