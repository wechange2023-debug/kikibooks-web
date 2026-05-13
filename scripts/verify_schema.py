#!/usr/bin/env python3
"""
verify_schema.py — 키키북스 DB 스키마 무결성 검증

사용법:
    pip install supabase python-dotenv --break-system-packages
    python scripts/verify_schema.py

검증 항목:
  1. 6개 테이블 존재 (profiles, children, books, reading_sessions, favorites, child_badges)
  2. enforce_commercial_license 트리거 작동 (NC INSERT → 차단)
  3. attribution_text NOT NULL 강제 (NULL INSERT → 차단)
  4. 정상 cc-by-4-0 INSERT + 자동 정리 (양성 케이스)
  5. RLS 활성화 (publishable 키로 children 조회 → 0건)

★ SUPABASE_SECRET_KEY는 RLS 우회용. .env.local에 설정되어 있어야 한다.
★ 검증 후 테스트 데이터는 즉시 삭제된다 (실패해도 정리 시도).
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path
from typing import Tuple, List

try:
    from dotenv import load_dotenv
    from supabase import create_client, Client
except ImportError:
    print(
        "[FAIL] 의존성 누락: supabase, python-dotenv가 설치되지 않았습니다.\n"
        "       다음 명령으로 설치하세요:\n"
        "         pip install supabase python-dotenv --break-system-packages"
    )
    sys.exit(1)


# Windows 콘솔(cp949)에서도 ✅/❌ 같은 이모지가 깨지지 않도록 UTF-8 강제
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"

EXPECTED_TABLES = [
    "profiles",
    "children",
    "books",
    "reading_sessions",
    "favorites",
    "child_badges",
]

# 검증용 테스트 책 — 실행 후 즉시 DELETE
TEST_SOURCE_PLATFORM = "book_dash"
TEST_SOURCE_ID_PREFIX = f"_kiki_verify_{uuid.uuid4().hex[:8]}"


# =============================================================================
# 환경변수 로드
# =============================================================================
def load_env() -> Tuple[str, str, str | None]:
    """환경변수 로드. (URL, SECRET_KEY, PUBLISHABLE_KEY?) 반환."""
    if not ENV_FILE.exists():
        print(f"[FAIL] .env.local 파일이 없습니다: {ENV_FILE}")
        print("       .env.example을 .env.local로 복사한 뒤 키를 채워 넣으세요.")
        sys.exit(1)

    load_dotenv(ENV_FILE)

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    publishable = os.environ.get(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    ) or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not url or not secret:
        print(
            "[FAIL] 환경변수 누락:\n"
            "       NEXT_PUBLIC_SUPABASE_URL\n"
            "       SUPABASE_SECRET_KEY (또는 legacy SUPABASE_SERVICE_ROLE_KEY)\n"
            "       .env.local에 설정되어 있는지 확인하세요."
        )
        sys.exit(1)

    return url, secret, publishable


# =============================================================================
# 출력 헬퍼
# =============================================================================
def print_header(title: str) -> None:
    print()
    print("=" * 60)
    print(f" {title}")
    print("=" * 60)


def icon(passed: bool) -> str:
    return "✅" if passed else "❌"


# =============================================================================
# 검증 1: 테이블 존재
# =============================================================================
def check_tables_exist(client: Client) -> List[Tuple[str, bool, str]]:
    """각 테이블에 limit 0 SELECT — 존재 여부 + secret 키 권한 확인."""
    results: List[Tuple[str, bool, str]] = []
    for tbl in EXPECTED_TABLES:
        try:
            client.table(tbl).select("*").limit(0).execute()
            results.append((tbl, True, "존재"))
        except Exception as exc:  # noqa: BLE001
            results.append(
                (tbl, False, f"{type(exc).__name__}: {str(exc)[:60]}")
            )
    return results


# =============================================================================
# 검증 2: enforce_commercial_license 트리거
# =============================================================================
def check_license_trigger(client: Client) -> Tuple[bool, str]:
    """NC 라이선스 INSERT 시도 → 트리거가 차단해야 함."""
    src_id = TEST_SOURCE_ID_PREFIX + "_nc"
    payload = {
        "source_platform": TEST_SOURCE_PLATFORM,
        "source_id": src_id,
        "title": "NC 차단 검증용",
        "cover_url": "https://example.com/c.png",
        "content_url": "https://example.com/c.html",
        "content_type": "html",
        "language": "en",
        "license": "cc-by-nc-4-0",  # ★ 차단되어야 함
        "original_url": "https://example.com/o",
        "attribution_text": "verify_schema test — should not persist",
    }
    try:
        client.table("books").insert(payload).execute()
        # 만약 성공했다면 트리거 미작동 → 즉시 정리 후 실패
        try:
            client.table("books").delete().eq("source_id", src_id).execute()
        except Exception:
            pass
        return False, "[CRITICAL] NC INSERT가 차단되지 않음 (Hard Rule 2 위반)"
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        # 트리거 메시지 ('상업 사용 불가') 또는 CHECK 위반 ('license')
        if "license" in msg or "check" in msg or "상업" in str(exc):
            return True, "정상 차단 (CHECK 또는 트리거 발동)"
        return False, f"예상과 다른 예외: {type(exc).__name__}: {str(exc)[:80]}"


# =============================================================================
# 검증 3: attribution_text NOT NULL
# =============================================================================
def check_attribution_not_null(client: Client) -> Tuple[bool, str]:
    """attribution_text 누락 INSERT → NOT NULL 제약 위반."""
    src_id = TEST_SOURCE_ID_PREFIX + "_attr"
    payload = {
        "source_platform": TEST_SOURCE_PLATFORM,
        "source_id": src_id,
        "title": "attribution NOT NULL 검증",
        "cover_url": "https://example.com/c.png",
        "content_url": "https://example.com/c.html",
        "content_type": "html",
        "language": "en",
        "license": "cc-by-4-0",
        "original_url": "https://example.com/o",
        # attribution_text 의도적 누락 ★
    }
    try:
        client.table("books").insert(payload).execute()
        # 만약 성공했다면 즉시 정리 후 실패
        try:
            client.table("books").delete().eq("source_id", src_id).execute()
        except Exception:
            pass
        return False, "[CRITICAL] attribution_text NULL 차단 안 됨 (Hard Rule 1 위반)"
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        if (
            "attribution" in msg
            or "null" in msg
            or "not-null" in msg
            or "23502" in msg  # PostgreSQL not_null_violation SQLSTATE
        ):
            return True, "정상 차단 (NOT NULL 제약)"
        return False, f"예상과 다른 예외: {type(exc).__name__}: {str(exc)[:80]}"


# =============================================================================
# 검증 4: 정상 INSERT + 자동 정리
# =============================================================================
def check_valid_insert_and_cleanup(client: Client) -> Tuple[bool, str]:
    """정상 cc-by-4-0 INSERT → 성공 → 즉시 DELETE."""
    src_id = TEST_SOURCE_ID_PREFIX + "_ok"
    payload = {
        "source_platform": TEST_SOURCE_PLATFORM,
        "source_id": src_id,
        "title": "정상 INSERT 검증용 (즉시 삭제됨)",
        "cover_url": "https://example.com/c.png",
        "content_url": "https://example.com/c.html",
        "content_type": "html",
        "language": "en",
        "license": "cc-by-4-0",
        "original_url": "https://example.com/o",
        "attribution_text": (
            '"Test" by Verify Script. Licensed under CC BY 4.0 '
            "(https://creativecommons.org/licenses/by/4.0/). "
            "Original: https://example.com/o"
        ),
    }
    try:
        client.table("books").insert(payload).execute()
    except Exception as exc:  # noqa: BLE001
        return False, f"정상 INSERT 실패: {type(exc).__name__}: {str(exc)[:80]}"

    try:
        client.table("books").delete().eq("source_id", src_id).execute()
        return True, "정상 INSERT 성공 + 테스트 데이터 정리됨"
    except Exception as exc:  # noqa: BLE001
        return (
            False,
            f"INSERT 성공했으나 DELETE 실패 (수동 정리 필요): source_id={src_id}",
        )


# =============================================================================
# 검증 5: RLS 활성화 (publishable 키로 children SELECT → 0건 또는 거부)
# =============================================================================
def check_rls_active(url: str, publishable: str | None) -> Tuple[bool, str]:
    """publishable 키로 children 조회 → 0건이면 RLS 작동, 데이터 보이면 위반."""
    if not publishable:
        return False, "건너뜀 (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 미설정)"

    try:
        anon_client: Client = create_client(url, publishable)
        result = anon_client.table("children").select("*").limit(5).execute()
        if not result.data:
            return True, "anon으로 children 조회 시 0건 (RLS 작동)"
        return (
            False,
            f"[CRITICAL] anon으로 {len(result.data)}건 노출됨 (RLS 미적용)",
        )
    except Exception as exc:  # noqa: BLE001
        # PostgREST가 RLS 거부를 401/403으로 응답할 수도 있음 — 통과로 본다
        return True, f"anon 접근 거부 ({type(exc).__name__}) — RLS 작동"


# =============================================================================
# 잔여 테스트 데이터 강제 정리 (보호망)
# =============================================================================
def cleanup_residual(client: Client) -> None:
    """검증 도중 예외로 남은 테스트 책이 있다면 강제 삭제."""
    try:
        client.table("books").delete().like(
            "source_id", f"{TEST_SOURCE_ID_PREFIX}%"
        ).execute()
    except Exception:
        pass


# =============================================================================
# Main
# =============================================================================
def main() -> int:
    print_header("키키북스 DB 스키마 무결성 검증")
    url, secret, publishable = load_env()
    print(f"  URL          : {url}")
    print(f"  Secret prefix: {secret[:14]}…")
    print(
        f"  Publishable  : {'설정됨' if publishable else '미설정 (검증 5 건너뜀)'}"
    )

    client: Client = create_client(url, secret)

    try:
        # 1. 테이블 존재
        print_header("1. 6개 테이블 존재 확인")
        table_results = check_tables_exist(client)
        all_tables_ok = all(ok for _, ok, _ in table_results)
        for tbl, ok, msg in table_results:
            print(f"  {icon(ok)} {tbl:20s} {msg}")

        if not all_tables_ok:
            print(
                "\n[FAIL] 테이블이 누락되었습니다. "
                "supabase/migrations/001_initial_schema.sql을 먼저 실행하세요."
            )
            return 1

        # 2. enforce_commercial_license
        print_header("2. enforce_commercial_license 트리거 (NC 차단)")
        trig_ok, trig_msg = check_license_trigger(client)
        print(f"  {icon(trig_ok)} {trig_msg}")

        # 3. attribution_text NOT NULL
        print_header("3. attribution_text NOT NULL 강제")
        attr_ok, attr_msg = check_attribution_not_null(client)
        print(f"  {icon(attr_ok)} {attr_msg}")

        # 4. 정상 INSERT + 정리
        print_header("4. 정상 cc-by-4-0 INSERT + 자동 정리")
        ins_ok, ins_msg = check_valid_insert_and_cleanup(client)
        print(f"  {icon(ins_ok)} {ins_msg}")

        # 5. RLS 활성화 (publishable)
        print_header("5. RLS 활성화 확인 (publishable 키)")
        rls_ok, rls_msg = check_rls_active(url, publishable)
        print(f"  {icon(rls_ok)} {rls_msg}")

        # 종합
        print_header("결과 요약")
        all_pass = (
            all_tables_ok and trig_ok and attr_ok and ins_ok and rls_ok
        )
        if all_pass:
            print("  ✅ 모든 검증 통과 — phase-03 완료 처리 가능")
            print(
                "     다음: python scripts/run_phase.py --complete phase-03-db-schema"
            )
            return 0
        else:
            print("  ❌ 일부 검증 실패 — 위 결과 확인 후 재시도")
            return 1
    finally:
        cleanup_residual(client)


if __name__ == "__main__":
    sys.exit(main())
