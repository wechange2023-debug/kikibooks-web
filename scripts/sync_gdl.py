#!/usr/bin/env python3
"""
sync_gdl.py — Global Digital Library 1차 동기화 스크립트 (Phase 05)

데이터 출처:
  https://content.digitallibrary.io/wp-json/content-api/v1/books/en
  → ADR-0007 §7 amendment (2026-05-14 실측 정정)

★ 페이지네이션 미작동: 모든 페이지네이션 파라미터(posts_per_page, _skip,
  per_page, page, offset, limit)가 무시되며 단일 응답에 영어 H5P 책 1,313권
  전체가 5.7MB로 반환된다. 따라서 본 스크립트는 1회 GET 후 메모리에서 처리한다.

핵심 규칙 (ADR-0007 §7 amendment):
  - language='en'만 적재
  - license[0].slug ∈ {cc-by-4-0, cc-by-sa-4-0}만 적재
  - publisher == "BookDash"는 skip (Phase 04 중복 회피, ADR-0007 §4.8)
  - 동일 정규화 title(lower+strip) 그룹은 lastChanged 최신 1건만 채택 (§4.7)
  - publisher 결측 시 정직 폴백 author 사용 (C안, §4.2 amendment)
  - 100건 단위 batch upsert (UNIQUE(source_platform, source_id) idempotent)

사용:
    pip install -r requirements.txt --break-system-packages   # 이미 phase-04에서 설치됨
    python scripts/sync_gdl.py                                # 본 동기화 (~30초)
    python scripts/sync_gdl.py --dry-run --max-books 40       # 소규모 점검
    python scripts/sync_gdl.py --verbose                      # 동제목 dedup 등 상세 로그
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

_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))
from lib.attribution import build_gdl_attribution, AttributionError  # noqa: E402
from lib.level_estimator import estimate_from_gdl_response  # noqa: E402

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

try:
    from dotenv import load_dotenv
    from supabase import create_client, Client
except ImportError:
    print(
        "[FAIL] 의존성 누락. pip install -r requirements.txt --break-system-packages"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"

API_URL = "https://content.digitallibrary.io/wp-json/content-api/v1/books/en"
# ADR-0014 결정 1: 본 템플릿은 *폴백 전용*으로 의미가 재정의됨.
# 정상 경로는 API 응답의 thumbnail 필드(string URL, 1306/1313=99.5% 정상).
# thumbnail이 boolean False(7권, 0.5%)이거나 누락된 경우에만 본 템플릿 사용.
# 측정(2026-05-20, n=30): 템플릿 단독 33% vs thumbnail 우선 100% (ADR-0014 §2).
COVER_URL_TEMPLATE = (
    "https://content.digitallibrary.io/wp-content/uploads/h5p/content/{h5pId}/images/coverImage.jpg"
)
# B-lite (ADR-0017 amendment 예정): content_url을 postLink(사이트 페이지 — gdl-header·
# 쿠키배너·Read 재클릭 노출)에서 H5P 전용 embed URL로 전환. 사이트 chrome 없는 책 본문만
# 임베드된다. h5pId는 picture_book 가드(line 276)에서 이미 필수 검증됨.
EMBED_URL_TEMPLATE = (
    "https://content.digitallibrary.io/wp-admin/admin-ajax.php?action=h5p_embed&id={h5pId}"
)
SOURCE_PLATFORM = "gdl"
CONTENT_TYPE = "html"
LANGUAGE = "en"

ALLOWED_LICENSE_SLUGS = {"cc-by-4-0", "cc-by-sa-4-0"}
BOOK_DASH_PUBLISHER = "BookDash"

# 비-그림책 필터 (ADR-0007 §7.8) — 명확한 케이스만 자동 skip
NON_PICTURE_BOOK_H5P_LIBRARIES = {"H5P.InteractiveVideo"}
NON_PICTURE_BOOK_TITLE_PREFIXES = (
    "Introduction to ",
    "Numeracy Level",
    "Literacy Level",
    "World Around Us",
)

# H5P 기술 변형본 — title 정규식 (ADR-0007 §7.8)
# 11권 모두 정상 그림책 ‘본책’의 H5P 레이아웃·내비게이션 변형. h5pLibrary 기준은
# 위양성(Big Buck Bunny, Spring 등 정상 책) 발생으로 채택하지 않음.
H5P_VARIANT_TITLE_REGEX = re.compile(
    r"\((?:"
    r"Arrow navigation"
    r"|Column"
    r"|Column,[^)]*"
    r"|Comprehension after book"
    r"|Comprehension in book[^)]*"
    r"|Arrow[^)]*comprehension[^)]*"
    r")\)",
    flags=re.IGNORECASE,
)

HTTP_TIMEOUT = 120
RETRY_MAX = 3
RETRY_BACKOFF = 10
BATCH_SIZE = 100


# ---------------------------------------------------------------------------
# 환경변수
# ---------------------------------------------------------------------------
def load_env() -> tuple[str, str]:
    """
    환경변수 로드. 로컬은 .env.local에서, CI(GitHub Actions)는 OS 환경변수에서.
    .env.local이 있으면 거기서 우선 로드(기존 동작 유지), 없으면 OS env로 폴백.
    """
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    if not url or not secret:
        print(
            "[FAIL] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY 누락 "
            "— 로컬은 .env.local, CI는 GitHub Secrets로 설정"
        )
        sys.exit(1)
    return url, secret


# ---------------------------------------------------------------------------
# 전체 책 1회 fetch (페이지네이션 없음, ADR-0007 §7 amendment)
# ---------------------------------------------------------------------------
def fetch_all_books() -> list[dict[str, Any]]:
    last_exc: Optional[Exception] = None
    for attempt in range(1, RETRY_MAX + 1):
        try:
            print(f"[INFO] GET {API_URL} (시도 {attempt}/{RETRY_MAX}, ~5.7MB 예상)")
            resp = requests.get(API_URL, timeout=HTTP_TIMEOUT)
            if resp.status_code == 200:
                data = resp.json()
                books = data.get("books") or []
                if not isinstance(books, list):
                    raise ValueError("응답의 books 키가 list가 아님")
                print(f"[INFO] 수신 완료: {len(books)}권 (응답 {len(resp.content)/1024:.0f} KB)")
                return books
            if resp.status_code in (429, 502, 503, 504):
                wait = RETRY_BACKOFF * attempt
                print(f"  ⏸ HTTP {resp.status_code}, {wait}초 대기 후 재시도")
                time.sleep(wait)
                continue
            resp.raise_for_status()
        except requests.RequestException as exc:
            last_exc = exc
            wait = RETRY_BACKOFF * attempt
            print(f"  ⏸ {exc} — {wait}초 후 재시도")
            time.sleep(wait)
    raise RuntimeError(f"books fetch 최종 실패 ({RETRY_MAX}회): {last_exc}")


# ---------------------------------------------------------------------------
# 동제목 dedup — 정규화 title 기준 그룹화, lastChanged 최신 1건만 채택
# ---------------------------------------------------------------------------
def normalize_title(t: Optional[str]) -> str:
    return (t or "").strip().lower()


def parse_last_changed(s: Optional[str]) -> str:
    """ISO-like 문자열 그대로 비교용 키 (사전순 비교가 시간순과 동등)."""
    return (s or "").strip()


def dedupe_by_title(
    books: list[dict[str, Any]], verbose: bool
) -> tuple[list[dict[str, Any]], int, list[str]]:
    """
    Returns (kept_books, skipped_count, verbose_lines).
    verbose_lines는 --verbose에서 출력할 dedup 결정 로그.
    """
    groups: dict[str, list[dict[str, Any]]] = {}
    for b in books:
        groups.setdefault(normalize_title(b.get("title")), []).append(b)

    kept: list[dict[str, Any]] = []
    skipped = 0
    lines: list[str] = []

    for norm_title, members in groups.items():
        if len(members) == 1:
            kept.append(members[0])
            continue
        # 그룹 크기 ≥ 2 — lastChanged 최신 1건 채택 (동률 시 postId 큰 값)
        members.sort(
            key=lambda x: (parse_last_changed(x.get("lastChanged")), x.get("postId") or 0),
            reverse=True,
        )
        winner = members[0]
        losers = members[1:]
        kept.append(winner)
        skipped += len(losers)

        if verbose:
            lines.append(
                f"[dedup] title=\"{winner.get('title')}\" group_size={len(members)}, "
                f"kept postId={winner.get('postId')} "
                f"lastChanged={winner.get('lastChanged')}"
            )
            for l in losers:
                lines.append(
                    f"[dedup]   skipped postId={l.get('postId')} "
                    f"lastChanged={l.get('lastChanged')} "
                    f"post_name={l.get('post_name')}"
                )
    return kept, skipped, lines


# ---------------------------------------------------------------------------
# 비-그림책 / H5P 변형본 판별 (ADR-0007 §7.8)
# ---------------------------------------------------------------------------
def is_non_picture_book(book: dict[str, Any]) -> bool:
    """h5pLibrary 또는 title prefix 기반 명확한 비-그림책 판별."""
    h5p_lib = book.get("h5pLibrary") or {}
    if isinstance(h5p_lib, dict):
        lib_name = h5p_lib.get("name") or ""
        if lib_name in NON_PICTURE_BOOK_H5P_LIBRARIES:
            return True
    title = (book.get("title") or "").strip()
    for prefix in NON_PICTURE_BOOK_TITLE_PREFIXES:
        if title.startswith(prefix):
            return True
    return False


def is_h5p_technical_variant(book: dict[str, Any]) -> bool:
    """title 정규식으로 동일 본책의 H5P 레이아웃 변형본 판별."""
    title = (book.get("title") or "").strip()
    return bool(H5P_VARIANT_TITLE_REGEX.search(title))


# ---------------------------------------------------------------------------
# 단일 책 → INSERT payload (None 반환 사유 분기는 호출자가 카운트)
# ---------------------------------------------------------------------------
def build_payload(book: dict[str, Any]) -> tuple[Optional[dict[str, Any]], bool]:
    """
    Returns: (payload_or_None, used_fallback_author)
    payload가 None이면 스킵 사유는 호출자가 판정. AttributionError는 그대로 전파.
    """
    # 1. language 재검증
    language_arr = book.get("language") or []
    if not (
        language_arr
        and isinstance(language_arr, list)
        and language_arr[0].get("slug") == LANGUAGE
    ):
        return None, False

    # 2. license 화이트리스트
    license_arr = book.get("license") or []
    if not (license_arr and isinstance(license_arr, list)):
        return None, False
    license_slug = license_arr[0].get("slug")
    if license_slug not in ALLOWED_LICENSE_SLUGS:
        return None, False

    # 3. 필수 필드 + HTML 엔티티 정규화 (ADR-0007 §7.9 이슈 1)
    raw_title = book.get("title")
    post_id = book.get("postId")
    post_link = book.get("postLink")
    h5p_id = book.get("h5pId")
    if not raw_title or not post_id or not post_link or not h5p_id:
        return None, False

    title = html.unescape(str(raw_title)).strip()

    publisher = book.get("publisher")
    if publisher:
        publisher = html.unescape(str(publisher)).strip()

    # 어트리뷰션 빌드 (publisher 결측 시 정직 폴백 — AttributionError 안 던짐)
    attribution_text, used_fallback = build_gdl_attribution(
        title=title,
        publisher=publisher,
        post_link=post_link,
        license_code=license_slug,
    )

    raw_description = book.get("description") or ""
    description = html.unescape(str(raw_description))
    level_field = book.get("level") or []
    level, age_min, age_max = estimate_from_gdl_response(description, level_field)

    # author 필드: publisher가 있으면 그대로, 없으면 None (폴백 텍스트는 attribution_text에만)
    raw_author = (publisher or "").strip()

    # ADR-0014 결정 1: cover_url은 API thumbnail 필드 우선,
    # boolean False/누락 시만 폴백 템플릿 사용. 폴백 케이스는 운영자 확인용으로 stderr 경고.
    raw_thumbnail = book.get("thumbnail")
    if isinstance(raw_thumbnail, str) and raw_thumbnail:
        cover_url = raw_thumbnail
    else:
        cover_url = COVER_URL_TEMPLATE.format(h5pId=h5p_id)
        print(
            f"  ⚠ cover fallback: postId={post_id} "
            f"(thumbnail={raw_thumbnail!r}, ADR-0014 결정 1)",
            file=sys.stderr,
        )

    payload = {
        "source_platform": SOURCE_PLATFORM,
        "source_id": str(post_id),
        "title": title,
        "cover_url": cover_url,
        # B-lite: 뷰어 iframe src — H5P 전용 embed URL(사이트 chrome 제거). original_url은
        # 어트리뷰션 '원본 보기'용이라 postLink(사이트 페이지) 유지(아래 참조).
        "content_url": EMBED_URL_TEMPLATE.format(h5pId=h5p_id),
        "content_type": CONTENT_TYPE,
        "language": LANGUAGE,
        "level": level,
        "age_min": age_min,
        "age_max": age_max,
        "license": license_slug,
        "author": raw_author or None,
        "illustrator": None,
        "original_url": post_link,
        "attribution_text": attribution_text,
        "is_active": True,
    }
    return payload, used_fallback


# ---------------------------------------------------------------------------
# Batch UPSERT
# ---------------------------------------------------------------------------
def batch_upsert(
    client: Client, rows: list[dict[str, Any]]
) -> tuple[int, list[str]]:
    success = 0
    errors: list[str] = []
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        try:
            client.table("books").upsert(
                chunk, on_conflict="source_platform,source_id"
            ).execute()
            success += len(chunk)
            print(f"  ✓ batch {i // BATCH_SIZE + 1}: {len(chunk)}건 upsert")
        except Exception as exc:  # noqa: BLE001
            print(
                f"  ✗ batch {i // BATCH_SIZE + 1} 통째 실패, 1건씩 재시도: "
                f"{type(exc).__name__}: {str(exc)[:100]}"
            )
            for row in chunk:
                try:
                    client.table("books").upsert(
                        row, on_conflict="source_platform,source_id"
                    ).execute()
                    success += 1
                except Exception as row_exc:  # noqa: BLE001
                    errors.append(
                        f"  - source_id={row.get('source_id')}: "
                        f"{type(row_exc).__name__}: {str(row_exc)[:100]}"
                    )
    return success, errors


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="GDL 동기화 (Phase 05)")
    parser.add_argument(
        "--dry-run", action="store_true", help="DB 없이 필터·dedup·빌드만 수행"
    )
    parser.add_argument(
        "--max-books",
        type=int,
        default=0,
        help="처리할 최대 책 수 (filter+dedup 후 slice, 0=무제한). 점검 시 40 권장",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="동제목 dedup 등 상세 결정 로그 출력",
    )
    args = parser.parse_args()

    print("=" * 60)
    print(" GDL 동기화 (Phase 05) — ADR-0007 §7 amendment 적용")
    print("=" * 60)
    print(f"  API           : {API_URL}")
    print(f"  허용 license  : {sorted(ALLOWED_LICENSE_SLUGS)}")
    print(f"  BookDash skip : publisher=='{BOOK_DASH_PUBLISHER}' 인 책 (Phase 04 중복)")
    print(f"  dry-run       : {args.dry_run}")
    print(f"  max-books     : {args.max_books if args.max_books else '(unlimited)'}")
    print(f"  verbose       : {args.verbose}")
    print()

    client: Optional[Client] = None
    if not args.dry_run:
        url, secret = load_env()
        client = create_client(url, secret)
        print(f"[INFO] Supabase 연결: {url}")
        print()

    start = time.time()

    # 1. 전체 fetch
    try:
        all_books = fetch_all_books()
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] GDL API fetch 실패: {exc}")
        return 1

    stats = {
        "received": len(all_books),
        "skipped_by_book_dash_duplicate": 0,
        "skipped_as_non_picture_book": 0,
        "skipped_as_h5p_variant": 0,
        "skipped_by_title_duplicate": 0,
        "skipped_by_license": 0,
        "skipped_by_language_or_fields": 0,
        "skipped_by_attribution_error": 0,
        "inserted_or_updated": 0,
        "inserted_with_fallback_author": 0,
        "errors": 0,
    }
    error_samples: list[str] = []

    # 2. BookDash publisher skip (Phase 04 중복 회피)
    before_bd = len(all_books)
    after_bd = []
    for b in all_books:
        if (b.get("publisher") or "").strip() == BOOK_DASH_PUBLISHER:
            stats["skipped_by_book_dash_duplicate"] += 1
        else:
            after_bd.append(b)
    print(f"[step 1] BookDash publisher skip: "
          f"{stats['skipped_by_book_dash_duplicate']}건 "
          f"({before_bd} → {len(after_bd)})")

    # 3. 비-그림책 skip (ADR-0007 §7.8) — H5P.InteractiveVideo + title prefix
    after_npb = []
    non_picture_book_titles: list[tuple[Any, str]] = []
    for b in after_bd:
        if is_non_picture_book(b):
            stats["skipped_as_non_picture_book"] += 1
            non_picture_book_titles.append((b.get("postId"), b.get("title", "")))
        else:
            after_npb.append(b)
    print(f"[step 2] 비-그림책 skip: "
          f"{stats['skipped_as_non_picture_book']}건 "
          f"({len(after_bd)} → {len(after_npb)})")
    if non_picture_book_titles:
        print("  [비-그림책 skip 상세]")
        for pid, t in non_picture_book_titles:
            print(f"    - postId={pid}  title=\"{t}\"")

    # 4. H5P 기술 변형본 skip (ADR-0007 §7.8) — title 정규식
    # ★ 보강 2: --verbose 없이도 skip된 변형본 제목을 항상 출력
    after_var = []
    h5p_variant_titles: list[tuple[Any, str]] = []
    for b in after_npb:
        if is_h5p_technical_variant(b):
            stats["skipped_as_h5p_variant"] += 1
            h5p_variant_titles.append((b.get("postId"), b.get("title", "")))
        else:
            after_var.append(b)
    print(f"[step 3] H5P 기술 변형본 skip: "
          f"{stats['skipped_as_h5p_variant']}건 "
          f"({len(after_npb)} → {len(after_var)})")
    if h5p_variant_titles:
        print("  [H5P 변형본 skip 상세 — 정규식 매치 결과 항상 출력]")
        for pid, t in h5p_variant_titles:
            print(f"    - postId={pid}  title=\"{t}\"")

    # 5. 동제목 dedup
    pool, title_dup_skipped, verbose_lines = dedupe_by_title(
        after_var, verbose=args.verbose
    )
    stats["skipped_by_title_duplicate"] = title_dup_skipped
    print(f"[step 4] 동제목 dedup: {title_dup_skipped}건 제거 "
          f"({len(after_var)} → {len(pool)})")
    if args.verbose:
        print()
        print(f"--- dedup 상세 로그 ({len(verbose_lines)}줄) ---")
        for line in verbose_lines:
            print(line)
        print()

    # 6. --max-books slice (점검용)
    if args.max_books and len(pool) > args.max_books:
        print(f"[INFO] --max-books {args.max_books} 적용: "
              f"{len(pool)} → {args.max_books}")
        pool = pool[: args.max_books]

    # 5. payload 변환 + license/language/필수필드 client-side 재필터
    pending: list[dict[str, Any]] = []
    for book in pool:
        try:
            payload, used_fb = build_payload(book)
        except AttributionError as exc:
            stats["skipped_by_attribution_error"] += 1
            continue
        except Exception as exc:  # noqa: BLE001
            stats["errors"] += 1
            error_samples.append(
                f"  - postId={book.get('postId')}: "
                f"{type(exc).__name__}: {str(exc)[:100]}"
            )
            continue

        if payload is None:
            license_arr = book.get("license") or []
            if license_arr and license_arr[0].get("slug") not in ALLOWED_LICENSE_SLUGS:
                stats["skipped_by_license"] += 1
            else:
                stats["skipped_by_language_or_fields"] += 1
            continue

        if used_fb:
            stats["inserted_with_fallback_author"] += 1

        pending.append(payload)

    print(f"[step 5] payload 변환: 적재 대상 {len(pending)}건 "
          f"(폴백 author 사용: {stats['inserted_with_fallback_author']}건)")

    # 7. dry-run vs 실 INSERT
    if args.dry_run:
        stats["inserted_or_updated"] = len(pending)
        print()
        print("[step 6] dry-run — 처음 5건 미리보기:")
        for i, p in enumerate(pending[:5]):
            fb_mark = "★폴백" if "creator information not provided" in p["attribution_text"] else ""
            print(f"  {i+1}. source_id={p['source_id']:>6}  "
                  f"{p['title'][:45]:<45} {fb_mark}")
            cover = p['cover_url']
            print(f"     cover_url: {cover[:80]}{'...' if len(cover) > 80 else ''}")
    else:
        print()
        print(f"[step 6] Supabase batch upsert (BATCH_SIZE={BATCH_SIZE})")
        ok, errs = batch_upsert(client, pending)
        stats["inserted_or_updated"] = ok
        stats["errors"] += len(errs)
        error_samples.extend(errs)

    elapsed = time.time() - start

    # 7. 요약
    print()
    print("=" * 60)
    print(" GDL 동기화 요약")
    print("=" * 60)
    print(f"  수신 (API 1회)                       : {stats['received']}")
    print(f"  skipped (publisher=BookDash 중복)    : {stats['skipped_by_book_dash_duplicate']}")
    print(f"  skipped (비-그림책)                   : {stats['skipped_as_non_picture_book']}")
    print(f"  skipped (H5P 기술 변형본)             : {stats['skipped_as_h5p_variant']}")
    print(f"  skipped (동제목 dedup 후순위)        : {stats['skipped_by_title_duplicate']}")
    print(f"  skipped (license NC/ND 등)           : {stats['skipped_by_license']}")
    print(f"  skipped (language/필수필드 결측)      : {stats['skipped_by_language_or_fields']}")
    print(f"  skipped (attribution_error)          : {stats['skipped_by_attribution_error']}")
    print(f"  inserted/updated                     : {stats['inserted_or_updated']}")
    print(f"    └ 그 중 정직 폴백 author 사용       : {stats['inserted_with_fallback_author']}")
    print(f"  errors                               : {stats['errors']}")
    print(f"  소요 시간                            : {elapsed:.1f}s")
    if error_samples:
        print()
        print("  [에러 샘플 최대 5건]")
        for line in error_samples[:5]:
            print(line)

    print()
    if args.dry_run:
        print("  ※ dry-run 모드 — DB에는 아무것도 쓰이지 않았습니다.")
    print("  다음 단계: python scripts/verify_gdl_sync.py")

    return 0 if stats["errors"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
