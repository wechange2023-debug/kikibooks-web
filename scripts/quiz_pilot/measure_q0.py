#!/usr/bin/env python3
"""measure_q0.py — Q-0 퀴즈 개편 사전 실측 (읽기 전용).

DB **읽기만** 한다. INSERT/UPDATE/DELETE 0건, Storage 쓰기 0건.
읽기 경로는 기존 스크립트와 동일 — supabase-py + SUPABASE_SECRET_KEY
(scripts/tts_pilot/tts_targets.py:243-259 의 load_env/make_client 계승).
service role이므로 RLS 우회 = 행 누락 없음.

산출: scripts/quiz_pilot/out/_q0_raw.json  (STEP 1-1 / 1-3 집계 원자료)
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = Path(__file__).resolve().parent / "out"
ENV_FILE = ROOT / ".env.local"

READER_VOICE = "danielle"      # lib/book/audio-manifest.ts:104
PAGE_KIND = "page"             # lib/book/audio-manifest.ts:321


def make_client():
    from dotenv import load_dotenv
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret:
        print("[FAIL] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 누락")
        raise SystemExit(1)
    from supabase import create_client
    return create_client(url, secret)


def page_all(client, table: str, cols: str, apply_filter=None) -> list[dict]:
    """PostgREST 1,000행 상한 회피 (tts_targets.py:260-272 계승)."""
    out: list[dict] = []
    start, step = 0, 1000
    while True:
        q = client.table(table).select(cols)
        if apply_filter:
            q = apply_filter(q)
        rows = q.order("id" if table == "books" else "book_id") \
                .range(start, start + step - 1).execute().data or []
        out.extend(rows)
        if len(rows) < step:
            return out
        start += step


def main() -> int:
    client = make_client()

    print("[1/3] books …", flush=True)
    books = page_all(client, "books",
                     "id,source_id,title,source_platform,is_active,has_audio")
    print(f"      books 전체 {len(books):,}행", flush=True)

    print("[2/3] book_text …", flush=True)
    text_rows = page_all(client, "book_text", "book_id,page_index,text,image_url")
    print(f"      book_text 전체 {len(text_rows):,}행", flush=True)

    print("[3/3] book_audio …", flush=True)
    audio_rows = page_all(client, "book_audio", "book_id,kind,page_index,voice")
    print(f"      book_audio 전체 {len(audio_rows):,}행", flush=True)

    by_id = {b["id"]: b for b in books}
    active = {bid: b for bid, b in by_id.items() if b.get("is_active")}

    text_by_book: dict[str, list[dict]] = defaultdict(list)
    for r in text_rows:
        text_by_book[r["book_id"]].append(r)

    # 페이지 오디오: kind='page' AND voice=danielle
    audio_pages: dict[str, set[int]] = defaultdict(set)
    audio_any_book: set[str] = set()
    for r in audio_rows:
        if r.get("voice") == READER_VOICE and r.get("kind") == PAGE_KIND:
            audio_pages[r["book_id"]].add(r["page_index"])
        audio_any_book.add(r["book_id"])

    per_book = []
    for bid, b in active.items():
        rows = text_by_book.get(bid, [])
        imgs = [r.get("image_url") for r in rows]
        non_null = [u for u in imgs if u]
        distinct = len(set(non_null))
        null_pages = sum(1 for u in imgs if not u)
        texts = [(r.get("text") or "").strip() for r in rows]
        nonempty_text = sum(1 for t in texts if t)
        apages = audio_pages.get(bid, set())
        # 오디오 있는 페이지의 삽화만 따로 (문항① 조건 계산용)
        img_on_audio_pages = {r.get("image_url") for r in rows
                              if r["page_index"] in apages and r.get("image_url")}
        per_book.append({
            "book_id": bid,
            "slug": b.get("source_id"),
            "title": b.get("title"),
            "source": b.get("source_platform"),
            "has_audio_flag": bool(b.get("has_audio")),
            "pages": len(rows),
            "distinct_images": distinct,
            "null_image_pages": null_pages,
            "nonempty_text_pages": nonempty_text,
            "audio_pages": len(apages),
            "distinct_images_on_audio_pages": len(img_on_audio_pages),
        })

    OUT.mkdir(parents=True, exist_ok=True)
    payload = {
        "counts": {
            "books_total": len(books),
            "books_active": len(active),
            "book_text_rows": len(text_rows),
            "book_audio_rows": len(audio_rows),
            "books_with_any_audio_row": len(audio_any_book),
        },
        "reader_voice": READER_VOICE,
        "per_book": per_book,
    }
    (OUT / "_q0_raw.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[OK] {OUT / '_q0_raw.json'}  (활성 {len(active):,}권)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
