#!/usr/bin/env python3
"""
verify_gdl_sync.py — Phase 05 검증

검증 항목 (tasks/phase-05-gdl-sync.json verification 절):
  v1. source_platform='gdl' AND language='en' 책 600권 이상
  v2. Book Dash + GDL 합산 660권 이상 (1,300권 목표의 첫 절반)
  v3. GDL 책의 attribution_text 누락/50자 미만 0건
  v4. GDL license가 cc-by-4-0 또는 cc-by-sa-4-0만 (NC/ND 0건)
  v5. GDL content_url이 content.digitallibrary.io/en/book/ 형식 100%
  v6. (info) GDL level 채워진 비율 — 참고용

모두 통과(v1~v5) 시 종료코드 0 → Phase 05 완료 처리 가능:
    python scripts/run_phase.py --complete phase-05-gdl-sync
"""

from __future__ import annotations

import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

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
    print("[FAIL] pip install -r requirements.txt --break-system-packages")
    sys.exit(1)


ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"

SOURCE_PLATFORM = "gdl"
MIN_GDL_BOOKS = 600
MIN_CUMULATIVE = 660
MIN_ATTRIBUTION_LEN = 50
ALLOWED_LICENSES = {"cc-by-4-0", "cc-by-sa-4-0"}
EXPECTED_URL_PREFIX = "https://content.digitallibrary.io/en/book/"
FALLBACK_AUTHOR_MARKER = "creator information not provided by source"
BETA_CONTENT_TARGET = 1300  # PLAN.md 베타 콘텐츠 스코프, 정보 출력용 (통과 기준 아님)

# 1순위 큐레이션 후보 식별 패턴 (ADR-0007 §7.8)
CURATION_KEYWORDS = ("test", "demo", "sample", "(cab")
CURATION_LANG_SUFFIX_REGEX = re.compile(r"\([a-z]{2}\)\s*$", flags=re.IGNORECASE)


def load_env() -> tuple[str, str]:
    if not ENV_FILE.exists():
        print(f"[FAIL] .env.local 없음: {ENV_FILE}")
        sys.exit(1)
    load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    if not url or not secret:
        print("[FAIL] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY 누락")
        sys.exit(1)
    return url, secret


def icon(ok: bool) -> str:
    return "✅" if ok else "❌"


def fetch_all(client: Client, source_platform: Optional[str] = None) -> list[dict]:
    """페이지네이션으로 모든 books 행을 가져온다. supabase-py는 page당 최대 1000건."""
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        q = (
            client.table("books")
            .select(
                "source_id, source_platform, title, language, license, "
                "content_url, attribution_text, level"
            )
        )
        if source_platform:
            q = q.eq("source_platform", source_platform)
        res = q.range(offset, offset + page_size - 1).execute()
        chunk = res.data or []
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return rows


def verify(client: Client) -> int:
    gdl_rows = fetch_all(client, SOURCE_PLATFORM)
    gdl_en = [r for r in gdl_rows if (r.get("language") or "").lower() == "en"]

    all_rows = fetch_all(client)
    cumulative = [
        r for r in all_rows
        if r.get("source_platform") in ("book_dash", "gdl")
        and (r.get("language") or "").lower() == "en"
    ]

    print()
    print("=" * 60)
    print(" Phase 05 — GDL 동기화 검증")
    print("=" * 60)
    print(f"  GDL 전체 행 수             : {len(gdl_rows)}")
    print(f"  GDL language='en'          : {len(gdl_en)}")
    print(f"  Book Dash + GDL 합산 (en)  : {len(cumulative)}")
    print()

    # v1. GDL ≥ 600
    v1 = len(gdl_en) >= MIN_GDL_BOOKS
    print(f"  {icon(v1)} v1. GDL en {MIN_GDL_BOOKS}권 이상  → 실제 {len(gdl_en)}권")

    # v2. 합산 ≥ 660
    v2 = len(cumulative) >= MIN_CUMULATIVE
    print(f"  {icon(v2)} v2. Book Dash+GDL 합산 {MIN_CUMULATIVE}권 이상  "
          f"→ 실제 {len(cumulative)}권")

    # v3. attribution
    bad_attr = [
        r for r in gdl_rows
        if not r.get("attribution_text")
        or len(r["attribution_text"]) < MIN_ATTRIBUTION_LEN
    ]
    v3 = len(bad_attr) == 0
    print(f"  {icon(v3)} v3. attribution_text {MIN_ATTRIBUTION_LEN}자 미만 0건  "
          f"→ 위반 {len(bad_attr)}건")
    for r in bad_attr[:3]:
        print(f"        - source_id={r.get('source_id')} "
              f"len={len(r.get('attribution_text') or '')}")

    # v4. license
    bad_lic = [r for r in gdl_rows if r.get("license") not in ALLOWED_LICENSES]
    v4 = len(bad_lic) == 0
    print(f"  {icon(v4)} v4. license ∈ {sorted(ALLOWED_LICENSES)} 100%  "
          f"→ 위반 {len(bad_lic)}건")
    lic_dist = Counter(r.get("license") for r in gdl_rows)
    print("        license 분포:")
    for lic, cnt in lic_dist.most_common():
        print(f"          {lic}: {cnt}")

    # v5. content_url
    bad_url = [
        r for r in gdl_rows
        if not (r.get("content_url") or "").startswith(EXPECTED_URL_PREFIX)
    ]
    v5 = len(bad_url) == 0
    print(f"  {icon(v5)} v5. content_url '{EXPECTED_URL_PREFIX}' 시작 100%  "
          f"→ 위반 {len(bad_url)}건")
    for r in bad_url[:3]:
        print(f"        - source_id={r.get('source_id')} "
              f"url={r.get('content_url')}")

    # v6. level coverage (info only)
    if gdl_rows:
        level_filled = sum(1 for r in gdl_rows if r.get("level") is not None)
        ratio = level_filled * 100.0 / len(gdl_rows)
        print(f"  ℹ  v6. (info) GDL level 채워진 비율: "
              f"{ratio:.1f}% ({level_filled}/{len(gdl_rows)})")
        print("        (ADR-0007 §4.3: level은 임시 분류, Phase 9~10에서 보정)")

    # v7. 정직 폴백 author 사용 비율 (info only, ADR-0007 §7.2)
    if gdl_rows:
        fallback_count = sum(
            1 for r in gdl_rows
            if FALLBACK_AUTHOR_MARKER in (r.get("attribution_text") or "")
        )
        fb_ratio = fallback_count * 100.0 / len(gdl_rows)
        print(f"  ℹ  v7. (info) 정직 폴백 author 사용 비율: "
              f"{fb_ratio:.1f}% ({fallback_count}/{len(gdl_rows)})")
        print("        (ADR-0007 §7.2: publisher 결측 실측 65%, C안 정책)")

    # v8. 누적 vs 베타 목표 (info only, 미달이어도 통과/실패 무관)
    print(f"  ℹ  v8. (info) Book Dash + GDL 누적: {len(cumulative)}권")
    if len(cumulative) >= BETA_CONTENT_TARGET:
        print(f"        ✨ 베타 목표 {BETA_CONTENT_TARGET}권 달성")
    else:
        shortfall = BETA_CONTENT_TARGET - len(cumulative)
        print(f"        베타 목표 {BETA_CONTENT_TARGET}권 대비 {shortfall}권 부족")
        print("        Phase 06 이후 신규 출처 추가로 보강 예정 (경고 아님)")

    # v9. 큐레이션 검토 권장 후보 (ADR-0007 §7.8 — 1순위 휴리스틱)
    curation_candidates = []
    for r in gdl_rows:
        t = (r.get("title") or "")
        t_lower = t.lower()
        if any(kw in t_lower for kw in CURATION_KEYWORDS):
            curation_candidates.append(r)
        elif CURATION_LANG_SUFFIX_REGEX.search(t):
            curation_candidates.append(r)
    print(f"  ℹ  v9. (info) 큐레이션 1순위 검토 후보: "
          f"{len(curation_candidates)}권")
    print("        (title에 test/demo/sample/(cab/(언어코드) 패턴 — "
          "ADR-0007 §7.8)")
    for r in curation_candidates[:10]:
        print(f"        - source_id={r.get('source_id')} "
              f"title=\"{(r.get('title') or '')[:60]}\"")
    if len(curation_candidates) > 10:
        print(f"        ... 외 {len(curation_candidates) - 10}건. "
              f"전체 목록은 ADR-0007 §7.8의 SQL 쿼리 참조")

    print()
    all_pass = v1 and v2 and v3 and v4 and v5
    if all_pass:
        print("  ✅ 모든 검증 통과 — Phase 05 완료 처리 가능")
        print("     다음: python scripts/run_phase.py --complete phase-05-gdl-sync")
        return 0
    else:
        print("  ❌ 일부 검증 실패 — 위 결과 확인 후 sync 재실행")
        return 1


def main() -> int:
    url, secret = load_env()
    client: Client = create_client(url, secret)
    return verify(client)


if __name__ == "__main__":
    sys.exit(main())
