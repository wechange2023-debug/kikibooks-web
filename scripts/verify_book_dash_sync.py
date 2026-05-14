#!/usr/bin/env python3
"""
verify_book_dash_sync.py — Phase 04 검증

검증 항목 (tasks/phase-04-book-dash-sync.json verification 절):
  v1. source_platform='book_dash' AND language='en' 책 50권 이상 적재
  v2. Book Dash 책의 attribution_text 누락(또는 50자 미만) 0건
  v3. Book Dash 책의 license가 100% cc-by-4-0
  v4. Book Dash 책의 content_url이 100% bookdash.github.io 형식

모두 통과 시 종료코드 0 → 다음 명령으로 페이즈 완료 처리:
    python scripts/run_phase.py --complete phase-04-book-dash-sync
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Windows 콘솔(cp949) 한글·이모지 안전 출력
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


ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"

SOURCE_PLATFORM = "book_dash"
MIN_BOOKS = 50
MIN_ATTRIBUTION_LEN = 50
EXPECTED_LICENSE = "cc-by-4-0"
EXPECTED_URL_PREFIX = "https://bookdash.github.io/"


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


def icon(ok: bool) -> str:
    return "✅" if ok else "❌"


# ---------------------------------------------------------------------------
# 검증 헬퍼
# ---------------------------------------------------------------------------
def all_book_dash_rows(client: Client) -> list[dict]:
    """
    Book Dash 책 전체를 페이지네이션으로 가져온다. supabase-py는 기본 1,000건
    제한이 있으나 베타 단계에는 ~60권이므로 단일 페이지로 충분하다. 안전을
    위해 .limit(2000)으로 명시.
    """
    res = (
        client.table("books")
        .select("source_id, title, language, license, content_url, attribution_text")
        .eq("source_platform", SOURCE_PLATFORM)
        .limit(2000)
        .execute()
    )
    return res.data or []


# ---------------------------------------------------------------------------
# 검증 1~4
# ---------------------------------------------------------------------------
def verify(client: Client) -> int:
    rows = all_book_dash_rows(client)
    en_rows = [r for r in rows if (r.get("language") or "").lower() == "en"]

    print()
    print("=" * 60)
    print(" Phase 04 — Book Dash 동기화 검증")
    print("=" * 60)
    print(f"  Book Dash 전체 행 수 : {len(rows)}")
    print(f"  그 중 language='en'  : {len(en_rows)}")
    print()

    # v1. 권수
    v1_ok = len(en_rows) >= MIN_BOOKS
    print(f"  {icon(v1_ok)} v1. language='en' 책 {MIN_BOOKS}권 이상  "
          f"→ 실제 {len(en_rows)}권")

    # v2. attribution_text 누락
    bad_attr = [
        r for r in rows
        if not r.get("attribution_text")
        or len(r["attribution_text"]) < MIN_ATTRIBUTION_LEN
    ]
    v2_ok = len(bad_attr) == 0
    print(f"  {icon(v2_ok)} v2. attribution_text 누락/{MIN_ATTRIBUTION_LEN}자 미만 0건  "
          f"→ 실제 {len(bad_attr)}건")
    for r in bad_attr[:3]:
        print(f"        - source_id={r.get('source_id')} "
              f"len={len(r.get('attribution_text') or '')}")

    # v3. license 순도
    bad_lic = [r for r in rows if r.get("license") != EXPECTED_LICENSE]
    v3_ok = len(bad_lic) == 0
    print(f"  {icon(v3_ok)} v3. license == '{EXPECTED_LICENSE}' 100%  "
          f"→ 위반 {len(bad_lic)}건")
    for r in bad_lic[:3]:
        print(f"        - source_id={r.get('source_id')} "
              f"license={r.get('license')}")

    # v4. content_url 형식
    bad_url = [
        r for r in rows
        if not (r.get("content_url") or "").startswith(EXPECTED_URL_PREFIX)
    ]
    v4_ok = len(bad_url) == 0
    print(f"  {icon(v4_ok)} v4. content_url이 '{EXPECTED_URL_PREFIX}' 시작 100%  "
          f"→ 위반 {len(bad_url)}건")
    for r in bad_url[:3]:
        print(f"        - source_id={r.get('source_id')} "
              f"url={r.get('content_url')}")

    print()
    all_pass = v1_ok and v2_ok and v3_ok and v4_ok
    if all_pass:
        print("  ✅ 모든 검증 통과 — Phase 04 완료 처리 가능")
        print("     다음: python scripts/run_phase.py --complete phase-04-book-dash-sync")
        return 0
    else:
        print("  ❌ 일부 검증 실패 — 위 결과 확인 후 sync 재실행")
        return 1


# ---------------------------------------------------------------------------
def main() -> int:
    url, secret = load_env()
    client: Client = create_client(url, secret)
    return verify(client)


if __name__ == "__main__":
    sys.exit(main())
