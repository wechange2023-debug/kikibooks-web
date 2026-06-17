#!/usr/bin/env python3
"""
verify_licenses.py — 외부 출처의 라이선스 변경 감지 (Phase 06 월 1회 cron)

설계 근거: ADR-0008 §6 (운영 정책), docs/guidelines/license-rules.md 6.2

★ 기본 동작은 dry-run (감지+보고만). 어떤 DB UPDATE도 수행하지 않는다.
★ --apply 명시 시에만 books 테이블 UPDATE.

분류 (4단계):
  1. 변경 감지 (위험)    : 화이트리스트 외 라이선스(NC/ND 등)로 변경됨
                            → --apply 시 is_active=FALSE
  2. 변경 감지 (허용범위) : cc-by-4-0 ↔ cc-by-sa-4-0 같은 화이트리스트 내 전환
                            → --apply 시 license 컬럼 UPDATE (is_active 유지)
  3. disappeared          : 원천 응답에 책이 없음 (캐시 누락 가능성)
                            → 자동 처리 안 함, 사람 판단 위임
  4. 조회 실패            : 매칭 실패·필드 누락 등
                            → 자동 처리 안 함

종료 코드:
  0 — 변경 감지 없음 (또는 dry-run 정상 종료)
  1 — 환경변수 누락·원천 사이트 통째 실패 등 치명적 오류
  2 — 변경 감지 있음 (CI workflow가 이 코드 보고 gh issue 생성)

사용:
    python scripts/verify_licenses.py                    # dry-run (DB 절대 안 건드림)
    python scripts/verify_licenses.py --apply            # 실제 UPDATE
    python scripts/verify_licenses.py --platform gdl
    python scripts/verify_licenses.py --verbose
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

import requests
import yaml

# 로컬 lib 모듈 임포트 — scripts/를 sys.path에 추가 (sync_*.py와 동일 관례)
_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))
from lib.license_normalize import normalize_asb_license  # noqa: E402

# stdout/stderr UTF-8 강제 (Windows cp949 호환)
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

BOOK_DASH_META_URL = (
    "https://raw.githubusercontent.com/bookdash/bookdash-books/master/_data/meta.yml"
)
GDL_API_URL = "https://content.digitallibrary.io/wp-json/content-api/v1/books/en"
# African Storybook 원천 — asp-raw-db 책별 메타 dump (data/<id>.txt). 적재는 sync_asb.py(D4) 몫.
ASB_RAW_BASE = "https://raw.githubusercontent.com/global-asp/asp-raw-db/master/data"

ALLOWED_LICENSE_SLUGS = {"cc-by-4-0", "cc-by-sa-4-0", "cc0", "public-domain", "cc-by-3-0"}

HTTP_TIMEOUT = 120
RETRY_MAX = 3
RETRY_BACKOFF = 10


# ---------------------------------------------------------------------------
# 환경변수 (sync 스크립트와 동일 패턴 — .env.local 우선, 없으면 OS env)
# ---------------------------------------------------------------------------
def load_env() -> tuple[str, str]:
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret:
        print(
            "[FAIL] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY 누락 "
            "— 로컬은 .env.local, CI는 GitHub Secrets로 설정"
        )
        sys.exit(1)
    return url, secret


# ---------------------------------------------------------------------------
# 원천 fetch — Book Dash meta.yml
# ---------------------------------------------------------------------------
def fetch_book_dash_meta() -> Optional[dict[str, Any]]:
    """meta.yml 1회 fetch. 통째 실패 시 None."""
    last_exc: Optional[Exception] = None
    for attempt in range(1, RETRY_MAX + 1):
        try:
            resp = requests.get(BOOK_DASH_META_URL, timeout=HTTP_TIMEOUT)
            if resp.status_code == 200:
                data = yaml.safe_load(resp.text)
                if isinstance(data, dict) and "titles" in data:
                    return data
                return None
            if resp.status_code in (429, 502, 503, 504):
                time.sleep(RETRY_BACKOFF * attempt)
                continue
            return None
        except Exception as exc:
            last_exc = exc
            time.sleep(RETRY_BACKOFF * attempt)
    print(f"  ⚠ Book Dash meta.yml 가져오기 실패 (최종): {last_exc}")
    return None


# ---------------------------------------------------------------------------
# 원천 fetch — GDL WP REST
# ---------------------------------------------------------------------------
def fetch_gdl_books() -> Optional[list[dict[str, Any]]]:
    last_exc: Optional[Exception] = None
    for attempt in range(1, RETRY_MAX + 1):
        try:
            resp = requests.get(GDL_API_URL, timeout=HTTP_TIMEOUT)
            if resp.status_code == 200:
                data = resp.json()
                books = data.get("books") or []
                return books if isinstance(books, list) else None
            if resp.status_code in (429, 502, 503, 504):
                time.sleep(RETRY_BACKOFF * attempt)
                continue
            return None
        except Exception as exc:
            last_exc = exc
            time.sleep(RETRY_BACKOFF * attempt)
    print(f"  ⚠ GDL API 가져오기 실패 (최종): {last_exc}")
    return None


# ---------------------------------------------------------------------------
# 라이선스 변경 분류
# ---------------------------------------------------------------------------
def classify_book_dash_license(rights_text: Optional[str]) -> Optional[str]:
    """meta.yml의 rights 자유 텍스트에서 우리 슬러그로 정규화."""
    if not rights_text or not isinstance(rights_text, str):
        return None
    t = rights_text.lower()
    if "creativecommons.org/licenses/by-sa/4.0" in t or "cc by-sa 4.0" in t:
        return "cc-by-sa-4-0"
    if "creativecommons.org/licenses/by/4.0" in t or "cc by 4.0" in t:
        return "cc-by-4-0"
    if "creativecommons.org/publicdomain/zero" in t or "cc0" in t:
        return "cc0"
    if "public domain" in t:
        return "public-domain"
    return None  # 알 수 없는 라이선스 표기 — 조회 실패로 분류


def classify_change(
    db_license: str, upstream_license: Optional[str]
) -> str:
    """
    Returns one of:
      'no_change'     — 동일
      'within_safe'   — 화이트리스트 내 전환 (by ↔ sa 등)
      'risk'          — 화이트리스트 외 (NC/ND 등) 또는 알 수 없는 슬러그
      'unknown'       — upstream_license=None (정규화 실패 또는 누락)
    """
    if upstream_license is None:
        return "unknown"
    if upstream_license == db_license:
        return "no_change"
    if upstream_license in ALLOWED_LICENSE_SLUGS:
        return "within_safe"
    return "risk"


# ---------------------------------------------------------------------------
# DB 책 조회
# ---------------------------------------------------------------------------
def fetch_db_books(
    client: Client, platforms: list[str], limit: int
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page_size = 1000
    offset = 0
    while True:
        q = (
            client.table("books")
            .select("id, source_platform, source_id, title, license, is_active")
            .in_("source_platform", platforms)
            .eq("is_active", True)
        )
        res = q.range(offset, offset + page_size - 1).execute()
        chunk = res.data or []
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
        if limit and len(rows) >= limit:
            break
    return rows[:limit] if limit else rows


# ---------------------------------------------------------------------------
# Book Dash meta.yml 인덱스 (identifier UUID 또는 슬러그로 lookup)
# ---------------------------------------------------------------------------
def build_book_dash_index(
    meta: dict[str, Any]
) -> dict[str, Optional[str]]:
    """
    source_id(identifier UUID 또는 슬러그) → upstream_license_slug 사전.
    sync_book_dash.py의 source_id 결정 로직과 일치해야 함.
    """
    index: dict[str, Optional[str]] = {}
    titles = meta.get("titles") or {}
    if not isinstance(titles, dict):
        return index
    for slug, entry in titles.items():
        if not isinstance(entry, dict):
            continue
        lic = classify_book_dash_license(entry.get("rights"))
        raw_id = entry.get("identifier")
        source_id = str(raw_id).strip() if raw_id else slug
        index[source_id] = lic
        # 슬러그로도 조회 가능하도록 양방향 등록 (sync 코드가 fallback 슬러그를 쓸 가능성)
        if slug not in index:
            index[slug] = lic
    return index


def build_gdl_index(
    books: list[dict[str, Any]]
) -> dict[str, Optional[str]]:
    """postId(문자열) → upstream_license_slug 사전."""
    index: dict[str, Optional[str]] = {}
    for b in books:
        pid = b.get("postId")
        if pid is None:
            continue
        license_arr = b.get("license") or []
        slug = None
        if isinstance(license_arr, list) and license_arr:
            slug = license_arr[0].get("slug")
        index[str(pid)] = slug
    return index


# ---------------------------------------------------------------------------
# African Storybook — raw-db data/<id>.txt 의 lic 파싱 + 정규화
# ---------------------------------------------------------------------------
def parse_asb_lic(text: str) -> Optional[str]:
    """raw-db data/<id>.txt 헤더에서 'lic' 값만 추출 (page_text/images 이전). 네트워크 없음."""
    for line in text.splitlines():
        if line.strip().lower().startswith(("page_text:", "images:")):
            break
        if line.startswith("lic:"):
            return line.split(":", 1)[1].strip()
    return None


def fetch_asb_lic(source_id: str) -> Optional[str]:
    """
    단일 ASb 책 메타(data/<id>.txt) 1회 fetch → 원시 lic 문자열. 실패/404 시 None.

    ★ 감시 cron(verify_licenses.py) 전용. 적재(sync_asb.py, D4)와 별개다.
    """
    url = f"{ASB_RAW_BASE}/{source_id}.txt"
    last_exc: Optional[Exception] = None
    for attempt in range(1, RETRY_MAX + 1):
        try:
            resp = requests.get(url, timeout=HTTP_TIMEOUT)
            if resp.status_code == 200:
                return parse_asb_lic(resp.text)
            if resp.status_code == 404:
                return None
            if resp.status_code in (429, 502, 503, 504):
                time.sleep(RETRY_BACKOFF * attempt)
                continue
            return None
        except Exception as exc:
            last_exc = exc
            time.sleep(RETRY_BACKOFF * attempt)
    print(f"  ⚠ ASb {source_id} 가져오기 실패 (최종): {last_exc}")
    return None


def build_asb_index(source_ids: list[str]) -> dict[str, Optional[str]]:
    """
    source_id → upstream_license_slug 사전.
    각 source_id의 data/<id>.txt 'lic'을 normalize_asb_license로 정규화한다(NC/ND→None).

    ★ 본 함수는 verify_licenses.py(감시 cron)에서 호출하며 적재가 아니다.
      실제 책 적재·대량 fetch는 sync_asb.py(D4) 몫이다.
    """
    index: dict[str, Optional[str]] = {}
    for sid in source_ids:
        raw = fetch_asb_lic(sid)
        index[sid] = normalize_asb_license(raw)
    return index


# ---------------------------------------------------------------------------
# 메인 비교 루프
# ---------------------------------------------------------------------------
def verify(
    client: Client,
    platforms: list[str],
    limit: int,
    sleep_between: float,
    verbose: bool,
    apply_changes: bool,
) -> int:
    db_books = fetch_db_books(client, platforms, limit)
    print(f"[INFO] DB에서 활성 책 {len(db_books)}건 조회 완료")

    # 원천 fetch
    bd_index: Optional[dict[str, Optional[str]]] = None
    gdl_index: Optional[dict[str, Optional[str]]] = None
    asb_index: Optional[dict[str, Optional[str]]] = None

    if "book_dash" in platforms:
        print(f"[INFO] Book Dash meta.yml fetch: {BOOK_DASH_META_URL}")
        bd_meta = fetch_book_dash_meta()
        if bd_meta is None:
            print("  ⚠ Book Dash 원천 통째 실패 — Book Dash 책은 모두 조회 실패로 분류")
        else:
            bd_index = build_book_dash_index(bd_meta)
            print(f"  ✓ Book Dash meta.yml 인덱스 {len(bd_index)} 항목")

        if "gdl" in platforms:
            print(f"[INFO] 두 사이트 간 sleep {sleep_between}초")
            time.sleep(sleep_between)

    if "gdl" in platforms:
        print(f"[INFO] GDL API fetch: {GDL_API_URL}")
        gdl_books = fetch_gdl_books()
        if gdl_books is None:
            print("  ⚠ GDL 원천 통째 실패 — GDL 책은 모두 조회 실패로 분류")
        else:
            gdl_index = build_gdl_index(gdl_books)
            print(f"  ✓ GDL 인덱스 {len(gdl_index)} 항목 (응답 {len(gdl_books)}권)")

    if "african_storybook" in platforms:
        # DB에 적재된 ASb 책의 source_id만 raw-db에서 개별 조회(감시 cron 전용, 적재 아님).
        asb_ids = [b["source_id"] for b in db_books if b["source_platform"] == "african_storybook"]
        print(f"[INFO] African Storybook raw-db fetch: {ASB_RAW_BASE}/<id>.txt ({len(asb_ids)}건)")
        asb_index = build_asb_index(asb_ids)
        print(f"  ✓ ASb 인덱스 {len(asb_index)} 항목")

    # 분류 버킷
    no_change: list[dict] = []
    within_safe: list[dict] = []  # by ↔ sa 등 화이트리스트 내 전환
    risk: list[dict] = []          # NC/ND 등 화이트리스트 외 — is_active=FALSE 후보
    disappeared: list[dict] = []   # 원천 응답에 책 없음
    lookup_failures: list[dict] = []  # 응답 통째 실패 또는 license 슬러그 정규화 실패

    for book in db_books:
        plat = book["source_platform"]
        src_id = book["source_id"]
        db_lic = book["license"]

        if plat == "book_dash":
            if bd_index is None:
                lookup_failures.append({**book, "reason": "원천 통째 실패"})
                continue
            if src_id not in bd_index:
                disappeared.append(book)
                continue
            upstream = bd_index[src_id]
        elif plat == "gdl":
            if gdl_index is None:
                lookup_failures.append({**book, "reason": "원천 통째 실패"})
                continue
            if src_id not in gdl_index:
                disappeared.append(book)
                continue
            upstream = gdl_index[src_id]
        elif plat == "african_storybook":
            if asb_index is None:
                lookup_failures.append({**book, "reason": "원천 통째 실패"})
                continue
            if src_id not in asb_index:
                disappeared.append(book)
                continue
            upstream = asb_index[src_id]
        else:
            lookup_failures.append({**book, "reason": f"미지원 platform: {plat}"})
            continue

        if upstream is None:
            lookup_failures.append({**book, "reason": "원천 license 슬러그 정규화 실패"})
            continue

        verdict = classify_change(db_lic, upstream)
        record = {**book, "upstream_license": upstream, "verdict": verdict}

        if verdict == "no_change":
            no_change.append(record)
        elif verdict == "within_safe":
            within_safe.append(record)
        elif verdict == "risk":
            risk.append(record)
        else:
            lookup_failures.append({**record, "reason": "verdict=unknown"})

        if verbose and verdict != "no_change":
            print(f"  [{verdict}] {plat}/{src_id} {db_lic} → {upstream}  "
                  f"\"{(book.get('title') or '')[:50]}\"")

    # --apply 처리
    risk_applied = 0
    within_safe_applied = 0
    if apply_changes:
        print()
        print("[APPLY MODE] 실제 DB UPDATE 수행")
        # 1. 위험 변경: is_active=FALSE
        for r in risk:
            try:
                client.table("books").update({"is_active": False}).eq(
                    "id", r["id"]
                ).execute()
                risk_applied += 1
                print(f"  ✓ is_active=FALSE: {r['source_platform']}/{r['source_id']} "
                      f"\"{(r.get('title') or '')[:40]}\"  "
                      f"({r['license']} → {r['upstream_license']})")
            except Exception as exc:
                print(f"  ✗ UPDATE 실패: {r['source_id']} — {exc}")
        # 2. 화이트리스트 내 전환: license 컬럼만 UPDATE (is_active 유지)
        for r in within_safe:
            try:
                client.table("books").update(
                    {"license": r["upstream_license"]}
                ).eq("id", r["id"]).execute()
                within_safe_applied += 1
                print(f"  ✓ license UPDATE: {r['source_platform']}/{r['source_id']} "
                      f"\"{(r.get('title') or '')[:40]}\"  "
                      f"({r['license']} → {r['upstream_license']})")
            except Exception as exc:
                print(f"  ✗ UPDATE 실패: {r['source_id']} — {exc}")
    # else: dry-run — 어떤 DB UPDATE도 수행 안 함. 보고만.

    # 요약 출력
    print()
    print("=" * 60)
    print(" verify_licenses.py — 라이선스 변경 감지 요약")
    print("=" * 60)
    print(f"  모드                  : {'apply' if apply_changes else 'dry-run (DB 미변경)'}")
    print(f"  대상 platform         : {','.join(platforms)}")
    print(f"  검증 권수             : {len(db_books)}")
    if "book_dash" in platforms:
        bd_count = sum(1 for b in db_books if b["source_platform"] == "book_dash")
        print(f"  ├ Book Dash          : {bd_count}")
    if "gdl" in platforms:
        gdl_count = sum(1 for b in db_books if b["source_platform"] == "gdl")
        print(f"  └ GDL                : {gdl_count}")
    print(f"  변경 없음             : {len(no_change)}")
    print(f"  변경 감지 (위험)       : {len(risk)}    "
          f"({'적용됨 ' + str(risk_applied) if apply_changes else 'dry-run — 보고만'})")
    print(f"  변경 감지 (허용범위)   : {len(within_safe)}    "
          f"({'적용됨 ' + str(within_safe_applied) if apply_changes else 'dry-run — 보고만'})")
    print(f"  disappeared           : {len(disappeared)}    (자동 처리 안 함)")
    print(f"  조회 실패             : {len(lookup_failures)}")

    # 상세 출력 (위험은 항상, 다른 카테고리는 verbose 또는 건수 있을 때)
    if risk:
        print()
        print("  [위험 변경 상세 — 화이트리스트 외 라이선스]")
        for r in risk[:20]:
            print(f"    - {r['source_platform']}/{r['source_id']}  "
                  f"{r['license']} → {r['upstream_license']}  "
                  f"\"{(r.get('title') or '')[:50]}\"")
        if len(risk) > 20:
            print(f"    ... 외 {len(risk) - 20}건")

    if within_safe and (verbose or apply_changes):
        print()
        print("  [허용범위 전환 상세]")
        for r in within_safe[:10]:
            print(f"    - {r['source_platform']}/{r['source_id']}  "
                  f"{r['license']} → {r['upstream_license']}  "
                  f"\"{(r.get('title') or '')[:50]}\"")
        if len(within_safe) > 10:
            print(f"    ... 외 {len(within_safe) - 10}건")

    if disappeared and verbose:
        print()
        print("  [disappeared 상세 — 원천에서 사라짐, 자동 처리 안 함]")
        for r in disappeared[:10]:
            print(f"    - {r['source_platform']}/{r['source_id']}  "
                  f"\"{(r.get('title') or '')[:50]}\"")
        if len(disappeared) > 10:
            print(f"    ... 외 {len(disappeared) - 10}건")

    if lookup_failures and verbose:
        print()
        print("  [조회 실패 상세]")
        for r in lookup_failures[:10]:
            print(f"    - {r['source_platform']}/{r['source_id']}  "
                  f"reason={r.get('reason')}")

    # 종료 코드
    has_changes = len(risk) > 0 or len(within_safe) > 0
    # 원천이 양쪽 다 실패한 경우는 치명 — exit 1
    if bd_index is None and "book_dash" in platforms and \
       gdl_index is None and "gdl" in platforms:
        print()
        print("  [FATAL] 두 원천 모두 가져오기 실패. 환경·API 상태 점검 필요.")
        return 1

    if has_changes:
        print()
        if apply_changes:
            print(f"  → {risk_applied}건 비활성화 + {within_safe_applied}건 license UPDATE 완료")
        else:
            print("  → 변경 감지됨. 로그 검토 후 사람이 별도로 --apply 실행 권장")
            print("    (ADR-0008 §6 정책: 자동 적용은 명시적 플래그가 있을 때만)")
        return 2

    print()
    print("  ✅ 변경 감지 없음 — 모든 라이선스가 DB 값과 일치")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="외부 출처 라이선스 변경 감지 (ADR-0008 §6)"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="감지된 변경을 DB에 실제 반영 (위험→is_active=FALSE, 허용범위→license UPDATE). "
             "★ 기본은 dry-run으로 DB 절대 안 건드림.",
    )
    parser.add_argument(
        "--platform",
        choices=["book_dash", "gdl", "african_storybook", "all"],
        default="all",
        help="검증 대상 출처 (기본: all)",
    )
    parser.add_argument(
        "--limit", type=int, default=0, help="DB SELECT 슬라이스 (점검용, 0=무제한)"
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=1.0,
        help="두 사이트 fetch 사이 sleep 초 (기본 1.0)",
    )
    parser.add_argument("--verbose", action="store_true", help="책별 비교 상세 출력")
    args = parser.parse_args()

    if args.platform == "all":
        platforms = ["book_dash", "gdl", "african_storybook"]
    else:
        platforms = [args.platform]

    print("=" * 60)
    print(" verify_licenses.py — 라이선스 변경 감지 (Phase 06)")
    print("=" * 60)
    print(f"  모드          : {'APPLY (DB UPDATE)' if args.apply else 'dry-run (DB 미변경)'}")
    print(f"  platform      : {platforms}")
    print(f"  limit         : {args.limit if args.limit else '(unlimited)'}")
    print(f"  inter-site sleep: {args.sleep}s")
    print(f"  verbose       : {args.verbose}")
    print()

    url, secret = load_env()
    client: Client = create_client(url, secret)

    start = time.time()
    code = verify(
        client=client,
        platforms=platforms,
        limit=args.limit,
        sleep_between=args.sleep,
        verbose=args.verbose,
        apply_changes=args.apply,
    )
    elapsed = time.time() - start
    print(f"  소요 시간             : {elapsed:.1f}s")
    return code


if __name__ == "__main__":
    sys.exit(main())
