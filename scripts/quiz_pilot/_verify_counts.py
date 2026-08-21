#!/usr/bin/env python3
"""행수 교차검증 — count=exact vs 페이지네이션 수집 행수, 정렬키 안정성."""
import os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent.parent
from dotenv import load_dotenv
load_dotenv(ROOT / ".env.local")
from supabase import create_client
c = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

for t in ("books", "book_text", "book_audio"):
    r = c.table(t).select("*", count="exact", head=True).execute()
    print(f"{t:12s} count=exact -> {r.count:,}")

# book_text 컬럼 확인
row = c.table("book_text").select("*").limit(1).execute().data
print("\nbook_text columns:", sorted(row[0].keys()) if row else "EMPTY")

# 정렬키 후보로 재수집해 행수 비교
def page_all(table, cols, order_cols):
    out, start, step = [], 0, 1000
    while True:
        q = c.table(table).select(cols)
        for oc in order_cols:
            q = q.order(oc)
        rows = q.range(start, start + step - 1).execute().data or []
        out.extend(rows); 
        if len(rows) < step: return out
        start += step

a = page_all("book_text", "book_id,page_index", ["book_id"])
b = page_all("book_text", "book_id,page_index", ["book_id", "page_index"])
print(f"\nbook_text  order(book_id) 수집        -> {len(a):,}")
print(f"book_text  order(book_id,page_index) -> {len(b):,}")
sa = sorted((r["book_id"], r["page_index"]) for r in a)
sb = sorted((r["book_id"], r["page_index"]) for r in b)
print("두 수집 결과 동일:", sa == sb, "| a중복:", len(sa)-len(set(sa)), "| b중복:", len(sb)-len(set(sb)))
