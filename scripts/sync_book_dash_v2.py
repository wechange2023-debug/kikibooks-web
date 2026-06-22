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
def build_manifest_text(slug: str, title: str, pages: list[int]) -> str:
    """
    asb-parser.ts 가 읽는 문법으로 합성 .txt 생성.
      헤더(key:\\tvalue, 파서 무시) → page_text:(비움) → images:(CloudFront URL 순서) → translations:
    CloudFront URL = {CLOUDFRONT}/{slug}/e-book/en_english/images/{slug}_en_page{N}.jpg
    parser 의 .jpg 수용분(ADR-0027 D2) 으로 그대로 수집됨.
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
    for n in pages:
        lines.append(
            f"{CLOUDFRONT}/{slug}/e-book/en_english/images/{slug}_en_page{n}.jpg"
        )
    lines += ["", "translations:", ""]
    return "\n".join(lines)


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
    }
    page_counts: list[int] = []
    page_outliers: list[str] = []  # 17 외 예외 권
    single_token: list[str] = []  # 성 1토큰 의심(수동 점검)
    exec_storage_ok = 0  # 실적재: Storage 업로드 성공 수
    exec_db_ok = 0  # 실적재: DB upsert 성공 수
    exec_fail: list[str] = []  # 실적재 실패(slug — 사유)
    exec_skip_dup = 0  # 실적재: 기존중복 skip

    header = (
        f"{'slug':24} | {'title':26} | {'pg':>3} | "
        f"{'writer':16} | {'illustrator':16} | cov | dup | attribution preview"
    )
    print(header)
    print("-" * len(header))

    for c in candidates:
        slug = c["slug"]
        try:
            pages = fetch_page_list(slug)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {slug}: page list 실패 — {exc}")
            pages = []
        creators = fetch_creators(slug)
        time.sleep(0.3)  # 외부 예의

        stats["total"] += 1
        if not pages:
            stats["zero_pages"] += 1
        else:
            page_counts.append(len(pages))
            if len(pages) != 17:
                page_outliers.append(f"{slug}({len(pages)}p)")
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

        manifest = build_manifest_text(slug, c["title"], pages)
        attr_preview = (attr_text.replace("\n", " ⏎ ")[:60]) if attr_text else "(실패)"

        print(
            f"  {slug[:23]:23} | {c['title'][:25]:25} | {len(pages):>3} | "
            f"{(creators.get('writer') or '-')[:15]:15} | "
            f"{(creators.get('illustrator') or '-')[:15]:15} | "
            f"{'Y' if cover_ok else 'N':>3} | {dup_flag:>3} | {attr_preview}"
        )

        # 적재 경로. dup_flag=='DUP'면 실적재 skip(기존 UUID 행 유지, drift 보호).
        if not dry_run and dup_flag == "DUP":
            exec_skip_dup += 1
            print(f"     ↷ skip(기존 중복): {slug}")
            continue
        if not pages:
            # 페이지 0장(Scheme B/오류) → 적재 안 함(빈 책 방지)
            if not dry_run:
                exec_fail.append(f"{slug}: 페이지 0장(Scheme B 또는 폴더 부재)")
                print(f"     ✗ {slug}: 페이지 0장 → 적재 skip")
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
                print(f"     ✓ {slug}: Storage={'OK' if storage_ok else '-'} DB=OK ({len(pages)}p)")
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
