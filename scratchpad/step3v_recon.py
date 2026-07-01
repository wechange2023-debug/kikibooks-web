#!/usr/bin/env python3
"""
step3v_recon.py — 재소싱 5권 열람 실패 정찰 Phase A (읽기 전용, backlog §7-v)

DB SELECT만. 쓰기 0건. 5권 레코드 + 정상 비교군 3권 조회 후 필드 대조.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"

TARGET = {
    "9c9eb452-fe46-11e5-86aa-5e5517507c66": "i-can-dress-myself",
    "9c9eb574-fe46-11e5-86aa-5e5517507c66": "hugs-in-the-city",
    "9c9ffed4-fe46-11e5-86aa-5e5517507c66": "it-wasnt-me",
    "9c9fffba-fe46-11e5-86aa-5e5517507c66": "katiitis-song",
    "9ca00316-fe46-11e5-86aa-5e5517507c66": "the-lion-who-wouldnt-try",
}

COLS = "id, source_id, title, source_platform, is_active, content_type, content_url, cover_url, level, language"


def init_supabase():
    from dotenv import load_dotenv
    from supabase import create_client

    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret:
        print("[FAIL] 환경변수 누락")
        sys.exit(1)
    return create_client(url, secret)


def show(r, sb_host):
    cu = (r.get("content_url") or "")
    cov = (r.get("cover_url") or "")
    # 호스트만 요약 표기(전체 URL은 길어 축약)
    def host(u):
        from urllib.parse import urlsplit
        return urlsplit(u).netloc or "(빈)"
    print(f"  title      : {r.get('title')}")
    print(f"  source_id  : {r.get('source_id')}")
    print(f"  is_active  : {r.get('is_active')}   content_type: {r.get('content_type')}   level: {r.get('level')}   lang: {r.get('language')}")
    print(f"  content_url: [{host(cu)}] {cu}")
    print(f"  cover_url  : [{host(cov)}] {cov[:90]}")
    print()


def main() -> int:
    client = init_supabase()

    # 사용 가능한 컬럼 확인(age_min/age_max 등 존재 불확실 → 전체 1행으로 스키마 파악)
    probe = client.table("books").select("*").eq("source_platform", "book_dash").limit(1).execute().data
    if probe:
        print("books 컬럼(book_dash 표본 1행 키):")
        print("  " + ", ".join(sorted(probe[0].keys())) + "\n")

    print("=" * 70)
    print("[Phase A-1] 재소싱 5권 레코드")
    print("=" * 70)
    rows = (
        client.table("books").select(COLS)
        .eq("source_platform", "book_dash")
        .in_("source_id", list(TARGET.keys()))
        .execute().data or []
    )
    print(f"조회 결과: {len(rows)}행 (기대 5)\n")
    got = {r["source_id"] for r in rows}
    missing = set(TARGET) - got
    if missing:
        print(f"⚠ DB에 없는 source_id {len(missing)}건: {[TARGET[m] for m in missing]}\n")
    for r in sorted(rows, key=lambda x: x["source_id"]):
        show(r, None)

    print("=" * 70)
    print("[Phase A-2] 비교군: 정상(is_active=true) Book Dash 3권")
    print("=" * 70)
    norm = (
        client.table("books").select(COLS)
        .eq("source_platform", "book_dash").eq("is_active", True)
        .not_.in_("source_id", list(TARGET.keys()))
        .limit(3).execute().data or []
    )
    for r in norm:
        show(r, None)

    # content_type 분포 대조(전체 book_dash)
    allrows = client.table("books").select("content_type, is_active").eq("source_platform", "book_dash").execute().data or []
    from collections import Counter
    ct = Counter((r.get("content_type"), r.get("is_active")) for r in allrows)
    print("=" * 70)
    print(f"[참고] book_dash 전체 {len(allrows)}권 (content_type, is_active) 분포:")
    for (c, a), n in sorted(ct.items(), key=lambda x: -x[1]):
        print(f"  {n:4}  content_type={c!r:20} is_active={a}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
