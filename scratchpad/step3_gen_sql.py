#!/usr/bin/env python3
"""
step3_gen_sql.py — STEP 3 Phase C: UPDATE SQL + 롤백 산출물 생성 (ADR-0032)

파일만 생성(DB 미실행). 팀장이 SQL Editor에서 실행.

산출:
  scratchpad/step3_rollback_cover_url.csv  (id, source_id, old_cover_url) — 롤백 baseline
  scratchpad/step3_update_cover_url.sql    (VALUES 기반 일괄 UPDATE, source_id 매칭)
  scratchpad/step3_rollback_cover_url.sql  (old_cover_url로 복원)

롤백 baseline 원칙(팀장 지시): old_cover_url = 실제 DB값(manifest 그대로).
재소싱 5건도 baseline은 죽은 github.io URL 유지(이전 상태 그대로 복원).
"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scratchpad" / "step3_manifest.csv"
ROLLBACK_CSV = ROOT / "scratchpad" / "step3_rollback_cover_url.csv"
UPDATE_SQL = ROOT / "scratchpad" / "step3_update_cover_url.sql"
ROLLBACK_SQL = ROOT / "scratchpad" / "step3_rollback_cover_url.sql"


def q(s: str) -> str:
    """SQL 문자열 리터럴 이스케이프(single quote 이중화)."""
    return "'" + (s or "").replace("'", "''") + "'"


def main() -> int:
    rows = list(csv.DictReader(MANIFEST.open(encoding="utf-8")))
    n = len(rows)

    # 1) 롤백 baseline CSV (id, source_id, old_cover_url = 실제 DB값)
    with ROLLBACK_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["id", "source_id", "old_cover_url"])
        w.writeheader()
        for r in rows:
            w.writerow({"id": r["id"], "source_id": r["source_id"], "old_cover_url": r["old_cover_url"]})

    # 2) UPDATE SQL (source_id → target_public_url)
    up_values = ",\n".join(f"  ({q(r['source_id'])}, {q(r['target_public_url'])})" for r in rows)
    UPDATE_SQL.write_text(
        f"""-- step3_update_cover_url.sql — Book Dash 표지 cover_url 이관 (ADR-0032 STEP 3)
-- 대상: source_platform='book_dash' AND is_active=true ({n}건)
-- cover_url만 변경. original_url·attribution_text·license 미터치.
-- 실행: 팀장(Supabase SQL Editor). 워커는 파일 생성만.

-- [선검증] 기대: {n}
SELECT COUNT(*) AS active_book_dash
FROM books
WHERE source_platform = 'book_dash' AND is_active = true;

-- [본 업데이트] source_id 매칭 VALUES 일괄 ({n}행)
UPDATE books AS b
SET cover_url = v.new_url
FROM (VALUES
{up_values}
) AS v(source_id, new_url)
WHERE b.source_platform = 'book_dash'
  AND b.is_active = true
  AND b.source_id = v.source_id;

-- [후검증] 기대: {n}
SELECT COUNT(*) AS migrated
FROM books
WHERE source_platform = 'book_dash' AND is_active = true
  AND cover_url LIKE '%/storage/v1/object/public/book-covers/%';
""",
        encoding="utf-8",
    )

    # 3) 롤백 SQL (source_id → old_cover_url, 실제 DB baseline)
    rb_values = ",\n".join(f"  ({q(r['source_id'])}, {q(r['old_cover_url'])})" for r in rows)
    ROLLBACK_SQL.write_text(
        f"""-- step3_rollback_cover_url.sql — STEP 3 이관 롤백 (ADR-0032)
-- cover_url을 이관 직전 실제 DB값(old_cover_url)으로 복원 ({n}건).
-- 주의: 재소싱 5건의 baseline은 죽은 github.io URL(이전 상태 그대로 복원 원칙).
-- 실행: 팀장(Supabase SQL Editor).

-- [본 롤백] source_id 매칭 VALUES 일괄 ({n}행)
UPDATE books AS b
SET cover_url = v.old_url
FROM (VALUES
{rb_values}
) AS v(source_id, old_url)
WHERE b.source_platform = 'book_dash'
  AND b.is_active = true
  AND b.source_id = v.source_id;

-- [후검증] 기대: 0 (book-covers 이관본이 모두 원상복구됨)
SELECT COUNT(*) AS still_migrated
FROM books
WHERE source_platform = 'book_dash' AND is_active = true
  AND cover_url LIKE '%/storage/v1/object/public/book-covers/%';
""",
        encoding="utf-8",
    )

    print(f"롤백 CSV : {ROLLBACK_CSV}  ({n}행)")
    print(f"UPDATE SQL: {UPDATE_SQL}  ({n} VALUES)")
    print(f"롤백  SQL : {ROLLBACK_SQL}  ({n} VALUES)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
