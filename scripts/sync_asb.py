#!/usr/bin/env python3
"""
sync_asb.py — African Storybook 적재 스크립트 (ADR-0025 D4~D7)

데이터 출처:
  https://codeload.github.com/global-asp/asp-raw-db/tar.gz/master  (tarball 1회 GET)
  → 책별 메타 dump data/<id>.txt (평면 단일 txt, 헤더 탭구분 key:value)

규칙:
  - lang == 'English' 인 책만 적재 (ADR-0006 영어 베타 스코프, ADR-0025 D7)
  - 라이선스 게이트: 헤더 lic → normalize_asb_license(공용 모듈, D3).
    None(NC/ND·미매칭)이면 skip — NC/ND 전량 배제(Hard Rule 3, fail-safe)
  - staging: is_active=FALSE 로 적재 (ADR-0025 D4·Amd#3 A6 — 검수 후 공개).
    ★ 기존 sync_*.py 의 is_active=True 하드코딩과 정반대
  - dedup: GDL 경유 ASb 중복 제거 (Amd#4 A1) — 기존 gdl 행 중 author='African Storybook'
    의 title 정규화 집합과 매칭되면 skip
  - illustrator: 헤더 artist 빈값이면 '미상' (Amd#4 A3). author 기준 CC BY 충족
  - content_type='asb_native' (Amd#3·#5, 004 마이그레이션 선행)
  - content_url = raw-db data/<id>.txt URL (Amd#3 A4 확정 — 자체 렌더 뷰어 참조 식별자)
  - attribution_text = scripts/lib/attribution.py 제네릭 build_attribution

Hard Rule 보호:
  1. attribution_text 빌드 실패 시 해당 책 skip (NOT NULL 충돌 방지)
  2. license 트리거가 1차 방어 — NC/ND는 게이트 + DB 트리거 이중 차단
  3. NC/ND 어떤 형태도 적재 금지 — normalize_asb_license None → skip
  6. SUPABASE_SECRET_KEY는 .env.local/OS env에서만 로드 (출력 금지)

사용:
    pip install -r requirements.txt --break-system-packages
    python scripts/sync_asb.py --dry-run          # DB 쓰기 없음(측정·검증)
    python scripts/sync_asb.py --limit 20         # 소량 실적재(검증)
    python scripts/sync_asb.py                     # 전량 실적재

옵션:
    --dry-run    upsert 없이 파싱·필터·dedup·attribution 빌드만 수행. 통계만 출력.
    --limit N    필터+dedup 후 적재 대상을 N건으로 제한 (점검용, 0=무제한)

관련: ADR-0025 D4~D7, Amendment #1~#5 / docs/backlog.md §7.4 (j)
"""

from __future__ import annotations

import argparse
import html
import io
import os
import sys
import tarfile
import time
from pathlib import Path
from typing import Any, Optional

import requests

# 로컬 lib 모듈 임포트 — scripts/를 sys.path에 추가 (sync_*.py 동일 관례)
_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))
from lib.license_normalize import normalize_asb_license  # noqa: E402
from lib.attribution import build_attribution, AttributionError  # noqa: E402

# Windows 콘솔(cp949)에서 한글·이모지 깨짐 방지
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

# supabase/dotenv는 실적재(또는 dry-run의 dedup 조회)에만 필요.
# 미설치 환경에서도 --dry-run 파싱·측정은 동작하도록 import 실패를 치명 처리하지 않는다.
try:
    from dotenv import load_dotenv
    from supabase import create_client, Client  # noqa: F401
    _HAS_SUPABASE = True
except ImportError:
    _HAS_SUPABASE = False


# ---------------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"

ASB_TARBALL_URL = "https://codeload.github.com/global-asp/asp-raw-db/tar.gz/master"
ASB_RAW_BASE = "https://raw.githubusercontent.com/global-asp/asp-raw-db/master/data"
ASB_COVER_BASE = "https://africanstorybook.org/illustrations/covers"

SOURCE_PLATFORM = "african_storybook"
CONTENT_TYPE = "asb_native"
LANGUAGE = "en"
ENGLISH_LANG = "English"  # raw-db lang 필드의 정확 표기
ILLUSTRATOR_UNKNOWN = "미상"  # Amd#4 A3
GDL_ASB_AUTHOR = "African Storybook"  # GDL이 publisher→author로 저장한 ASb 표기 (Amd#4 A4)

HTTP_TIMEOUT = 120
BATCH_SIZE = 100

_HEADER_KEYS = {"title", "author", "artist", "lang", "lic", "thumb", "url", "id"}


# ---------------------------------------------------------------------------
# 환경변수 로드 (sync_*.py 복제 — .env.local 우선, 없으면 OS env). SECRET 출력 금지.
# ---------------------------------------------------------------------------
def load_env() -> tuple[str, str]:
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret:
        print(
            "[FAIL] 환경변수 누락 — 로컬은 .env.local, CI는 GitHub Secrets로 설정:\n"
            "       NEXT_PUBLIC_SUPABASE_URL\n"
            "       SUPABASE_SECRET_KEY"
        )
        sys.exit(1)
    return url, secret


# ---------------------------------------------------------------------------
# tarball 1회 fetch → data/*.txt (이름, 내용) 리스트 (메모리 내 처리, 디스크 잔여 0)
# ---------------------------------------------------------------------------
def fetch_asb_books() -> list[tuple[str, str]]:
    """
    codeload tarball을 1회 GET해 메모리에서 풀고, data/<id>.txt 의 (basename, text)를 반환.
    디스크에 파일을 남기지 않는다(스트림 → tarfile → 메모리).
    """
    print(f"[INFO] ASb tarball 다운로드: {ASB_TARBALL_URL}")
    resp = requests.get(ASB_TARBALL_URL, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    print(f"[INFO] tarball 수신 {len(resp.content) // 1024} KB — 압축 해제 중")

    books: list[tuple[str, str]] = []
    with tarfile.open(fileobj=io.BytesIO(resp.content), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            # 경로 예: asp-raw-db-master/data/1001.txt
            parts = member.name.split("/")
            if len(parts) < 2 or parts[-2] != "data" or not parts[-1].endswith(".txt"):
                continue
            f = tar.extractfile(member)
            if f is None:
                continue
            text = f.read().decode("utf-8", errors="replace")
            books.append((parts[-1], text))
    print(f"[INFO] data/*.txt {len(books)}건 확보")
    return books


# ---------------------------------------------------------------------------
# 헤더 다필드 파서 (D3 parse_asb_lic의 다필드판 — D3 함수는 그대로 둠)
# ---------------------------------------------------------------------------
def parse_asb_header(text: str) -> dict[str, Any]:
    """
    raw-db data/<id>.txt → 헤더 필드 dict + 페이지 이미지 목록.
    page_text:/images: 직전까지 헤더(key:\\tvalue, split(':',1)). images: 블록은 페이지 경로.
    반환 키: title·author·artist·lang·lic·thumb·url·id + images(list).
    """
    h: dict[str, Any] = {}
    images: list[str] = []
    section = "header"
    for raw in text.splitlines():
        stripped = raw.strip()
        low = stripped.lower()
        if section == "header":
            if low.startswith("images:"):
                section = "images"
                continue
            if low.startswith("page_text:"):
                section = "page_text"
                continue
            if ":" in raw:
                key, val = raw.split(":", 1)
                key = key.strip().lower()
                if key in _HEADER_KEYS:
                    h[key] = val.strip()
        elif section == "page_text":
            if low.startswith("images:"):
                section = "images"
        elif section == "images":
            if low.startswith("translations:") or low.startswith("page_text:"):
                section = "done"
                continue
            if stripped and ("illustrations/" in stripped or low.endswith(".png")):
                images.append(stripped)
    h["images"] = images
    return h


# ---------------------------------------------------------------------------
# 어트리뷰션 — 제네릭 build_attribution 감쌈 (artist 빈값 → '미상', Amd#4 A3)
# ---------------------------------------------------------------------------
def build_asb_attribution(
    *, title: str, author: Optional[str], artist: Optional[str], license_code: str, url: str
) -> tuple[str, bool]:
    """
    Returns (attribution_text, illustrator_unknown).
    artist 빈값이면 illustrator='미상'으로 표기(누락 표시), author 기준 CC BY 충족.
    title/url/license_code 결측 시 AttributionError (호출자가 skip).
    """
    illustrator = (artist or "").strip()
    is_unknown = not illustrator
    if is_unknown:
        illustrator = ILLUSTRATOR_UNKNOWN
    text = build_attribution(
        title=title,
        author=(author or "").strip() or None,
        illustrator=illustrator,
        source_platform=SOURCE_PLATFORM,
        license_code=license_code,
        original_url=url,
    )
    return text, is_unknown


# ---------------------------------------------------------------------------
# 제목 정규화 (dedup 키)
# ---------------------------------------------------------------------------
def normalize_title(title: str) -> str:
    """소문자 + 영숫자/공백 외 제거 + 공백 단일화 + trim."""
    low = (title or "").lower()
    cleaned = "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in low)
    return " ".join(cleaned.split())


# ---------------------------------------------------------------------------
# dedup skipset — 기존 gdl 행 중 author='African Storybook' 의 title 정규화 집합 (Amd#4)
# ---------------------------------------------------------------------------
def build_dedup_skipset(client: Any) -> set[str]:
    """
    GDL 경유 ASb 행의 정규화 title 집합. author 정확매칭 0건이면 ilike 폴백 1회.
    --dry-run 에서도 호출(읽기). client=None이면 빈 집합(DB 미연결).
    """
    if client is None:
        print("  ⚠ dedup: DB 미연결 — skipset 비움(dedup skip=0, 실적재 시 적용)")
        return set()
    try:
        res = (
            client.table("books")
            .select("title")
            .eq("source_platform", "gdl")
            .eq("author", GDL_ASB_AUTHOR)
            .execute()
        )
        rows = res.data or []
        if not rows:
            print(f"  ⚠ dedup: author='{GDL_ASB_AUTHOR}' 정확매칭 0건 — ilike 폴백 시도")
            res = (
                client.table("books")
                .select("title")
                .eq("source_platform", "gdl")
                .ilike("author", "%african storybook%")
                .execute()
            )
            rows = res.data or []
        skipset = {normalize_title(r.get("title") or "") for r in rows if r.get("title")}
        print(f"  ✓ dedup skipset: GDL 경유 ASb {len(rows)}건 → 정규화 제목 {len(skipset)}개")
        return skipset
    except Exception as exc:  # noqa: BLE001
        print(f"  ⚠ dedup 조회 실패({type(exc).__name__}) — skipset 비움")
        return set()


# ---------------------------------------------------------------------------
# 단일 책 → payload (None이면 호출자가 사유별 skip 집계)
# ---------------------------------------------------------------------------
def build_payload(header: dict[str, Any]) -> tuple[Optional[dict[str, Any]], bool]:
    """
    Returns (payload_or_None, illustrator_unknown).
    license None(NC/ND·미매칭)·필수필드 결측 시 None. AttributionError는 호출자가 캐치.
    """
    source_id = (header.get("id") or "").strip()
    # ADR-0029 D1: ingestion 경계에서 HTML 엔티티 디코딩(메타필드 단일 출처)
    title = html.unescape(header.get("title") or "").strip()
    url = (header.get("url") or "").strip()
    if not source_id or not title or not url:
        return None, False

    license_code = normalize_asb_license(header.get("lic"))
    if license_code is None:
        return None, False  # NC/ND·미매칭 차단 (호출자가 license skip 집계)

    author = html.unescape(header.get("author") or "").strip() or None
    artist = html.unescape(header.get("artist") or "").strip()

    attribution_text, illustrator_unknown = build_asb_attribution(
        title=title,
        author=author,
        artist=artist,
        license_code=license_code,
        url=url,
    )

    thumb = (header.get("thumb") or "").strip()
    cover_url = thumb.replace("http://", "https://") if thumb else f"{ASB_COVER_BASE}/{source_id}.png"

    payload = {
        "source_platform": SOURCE_PLATFORM,
        "source_id": source_id,
        "title": title,
        "cover_url": cover_url,
        "content_url": f"{ASB_RAW_BASE}/{source_id}.txt",  # Amd#3 A4: 자체 렌더 참조 식별자
        "content_type": CONTENT_TYPE,
        "language": LANGUAGE,
        # level/age는 후속(검수 단계)에서 보강
        "license": license_code,
        "author": author,
        "illustrator": ILLUSTRATOR_UNKNOWN if illustrator_unknown else artist,
        "original_url": url,
        "attribution_text": attribution_text,
        "is_active": False,  # ★ staging (Amd#3 A6) — 기존 sync의 True와 정반대
    }
    return payload, illustrator_unknown


# ---------------------------------------------------------------------------
# Batch UPSERT (sync_gdl 패턴)
# ---------------------------------------------------------------------------
def batch_upsert(client: Any, rows: list[dict[str, Any]]) -> tuple[int, list[str]]:
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
    parser = argparse.ArgumentParser(description="African Storybook 적재 (ADR-0025 D4~D7)")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="upsert 없이 파싱·필터·dedup·빌드만 수행(통계만). DB 쓰기 0.",
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="필터+dedup 후 적재 대상 제한 (점검용, 0=무제한)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print(" African Storybook 동기화 (ADR-0025 D4~D7)")
    print("=" * 60)
    print(f"  tarball       : {ASB_TARBALL_URL}")
    print(f"  source_platform: {SOURCE_PLATFORM}")
    print(f"  content_type  : {CONTENT_TYPE}")
    print(f"  language scope: {ENGLISH_LANG} only (ADR-0006/D7)")
    print(f"  staging       : is_active=FALSE (Amd#3 A6)")
    print(f"  dry-run       : {args.dry_run}")
    print(f"  limit         : {args.limit if args.limit else '(unlimited)'}")
    print()

    # 1. tarball fetch
    try:
        books = fetch_asb_books()
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] tarball 가져오기 실패: {exc}")
        return 1

    # 2. Supabase 클라이언트
    #    실적재: 필수(없으면 FAIL). dry-run: dedup 조회용으로 시도하되 불가 시 None으로 진행.
    client: Optional[Any] = None
    if not args.dry_run:
        if not _HAS_SUPABASE:
            print("[FAIL] supabase/dotenv 미설치 — pip install -r requirements.txt")
            return 1
        url, secret = load_env()
        client = create_client(url, secret)
        print(f"[INFO] Supabase 연결: {url}")
    else:
        if _HAS_SUPABASE and (ENV_FILE.exists() or os.environ.get("SUPABASE_SECRET_KEY")):
            try:
                url, secret = load_env()
                client = create_client(url, secret)
                print(f"[INFO] (dry-run) dedup 조회용 Supabase 연결: {url}")
            except SystemExit:
                client = None
            except Exception as exc:  # noqa: BLE001
                print(f"  ⚠ (dry-run) Supabase 연결 실패({type(exc).__name__}) — dedup 생략")
                client = None
        else:
            print("[INFO] (dry-run) DB 미연결 — dedup 생략(실적재 시 적용)")
    print()

    # 3. dedup skipset
    skipset = build_dedup_skipset(client)
    print()

    # 4. 순회
    stats = {
        "parsed": len(books),
        "english": 0,
        "eligible": 0,           # English + 라이선스 적격
        "blocked_ncnd": 0,       # normalize None (NC/ND·미매칭)
        "dedup_skipped": 0,
        "illustrator_unknown": 0,
        "skipped_missing": 0,    # 필수필드(id/title/url) 결측
        "attribution_error": 0,
        "to_ingest": 0,
    }
    dedup_samples: list[str] = []
    payloads: list[dict[str, Any]] = []

    start = time.time()
    for fname, text in books:
        header = parse_asb_header(text)
        lang = (header.get("lang") or "").strip()
        if lang != ENGLISH_LANG:
            continue
        stats["english"] += 1

        # 라이선스 게이트 (NC/ND·미매칭 차단)
        if normalize_asb_license(header.get("lic")) is None:
            stats["blocked_ncnd"] += 1
            continue

        # payload 빌드 (attribution 포함)
        try:
            payload, illu_unknown = build_payload(header)
        except AttributionError:
            stats["attribution_error"] += 1
            continue
        if payload is None:
            stats["skipped_missing"] += 1
            continue

        stats["eligible"] += 1

        # dedup (제목 정규화 매칭)
        if normalize_title(payload["title"]) in skipset:
            stats["dedup_skipped"] += 1
            if len(dedup_samples) < 10:
                dedup_samples.append(payload["title"])
            continue

        if illu_unknown:
            stats["illustrator_unknown"] += 1
        payloads.append(payload)

    # --limit 적용 (필터+dedup 후)
    if args.limit and len(payloads) > args.limit:
        payloads = payloads[: args.limit]
    stats["to_ingest"] = len(payloads)

    # 5. 적재 (dry-run이면 건너뜀)
    upsert_success = 0
    upsert_errors: list[str] = []
    if not args.dry_run:
        print(f"[INFO] 실적재 시작 — {len(payloads)}건 (is_active=FALSE staging)")
        upsert_success, upsert_errors = batch_upsert(client, payloads)
    else:
        print("[INFO] dry-run — upsert 0 (DB 쓰기 없음)")

    elapsed = time.time() - start

    # 6. 요약
    print()
    print("=" * 60)
    print(" 동기화 요약")
    print("=" * 60)
    print(f"  파싱 총합            : {stats['parsed']}")
    print(f"  English              : {stats['english']}")
    print(f"  NC/ND·미매칭 차단    : {stats['blocked_ncnd']}")
    print(f"  필수필드 결측 skip   : {stats['skipped_missing']}")
    print(f"  attribution 실패 skip: {stats['attribution_error']}")
    print(f"  적격(English+라이선스): {stats['eligible']}")
    print(f"  dedup skip(GDL 중복) : {stats['dedup_skipped']}")
    print(f"  illustrator '미상'   : {stats['illustrator_unknown']}")
    print(f"  최종 적재 대상       : {stats['to_ingest']}")
    if not args.dry_run:
        print(f"  실제 upsert 성공     : {upsert_success}")
        print(f"  upsert 오류          : {len(upsert_errors)}")
    print(f"  소요 시간            : {elapsed:.1f}s")
    if dedup_samples:
        print()
        print("  [dedup skip 제목 샘플 최대 10]")
        for t in dedup_samples:
            print(f"    - {t}")
    if upsert_errors:
        print()
        print("  [upsert 오류 샘플 최대 5]")
        for line in upsert_errors[:5]:
            print(line)

    print()
    if args.dry_run:
        print("  ※ dry-run 모드 — DB에는 아무것도 쓰이지 않았습니다.")
    return 0 if not upsert_errors else 2


if __name__ == "__main__":
    sys.exit(main())
