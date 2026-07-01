#!/usr/bin/env python3
"""
step3_upload.py — STEP 3 Phase B 7·8단계: book-covers 버킷 업로드 + 검증 (ADR-0032)

Storage 전용 쓰기(DB write 0건). sync_bloom.upload_manifest 패턴 재사용.
  - 입력: scratchpad/step3_out/*.webp (206장)
  - 대상: book-covers 버킷(public), 키 = bookdash-{source_id}.webp, content-type image/webp
  - upsert=true (재실행 안전)

검증(8단계):
  (1) 버킷 객체 수 == 206
  (2) 무작위 5건 target_public_url HTTP GET 200 + content-type image/webp
      — 표본에 github.io 출신 표지 최소 1건 포함(팀장 지시: 두 origin 정상 변환 동시 확인)

키 값(SUPABASE_SECRET_KEY)은 절대 출력하지 않음(Hard Rule 6).
"""
from __future__ import annotations

import csv
import os
import random
import sys
from pathlib import Path
from urllib.parse import urlsplit

import requests

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"
MANIFEST = ROOT / "scratchpad" / "step3_manifest.csv"
STEP3_OUT = ROOT / "scratchpad" / "step3_out"
BUCKET = "book-covers"
EXPECT = 206

# 재소싱된 5건(github.io 404 → WP): github.io 경로 검증 표본에서 제외해
# '실제 github.io에서 변환된' 표지로 검증하기 위함.
RESOURCED = {
    "9c9eb452-fe46-11e5-86aa-5e5517507c66",
    "9c9eb574-fe46-11e5-86aa-5e5517507c66",
    "9c9ffed4-fe46-11e5-86aa-5e5517507c66",
    "9c9fffba-fe46-11e5-86aa-5e5517507c66",
    "9ca00316-fe46-11e5-86aa-5e5517507c66",
}


def init_supabase():
    from dotenv import load_dotenv
    from supabase import create_client

    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret:
        print("[FAIL] 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY")
        sys.exit(1)
    return create_client(url, secret), url.rstrip("/")


def bucket_object_count(client) -> int:
    """book-covers 버킷 bookdash-*.webp 객체 수(페이지네이션 처리)."""
    total = 0
    offset = 0
    page = 1000
    while True:
        items = client.storage.from_(BUCKET).list(
            "", {"limit": page, "offset": offset}
        )
        if not items:
            break
        total += sum(1 for it in items if it.get("name", "").startswith("bookdash-"))
        if len(items) < page:
            break
        offset += page
    return total


def main() -> int:
    client, sb_url = init_supabase()
    rows = list(csv.DictReader(MANIFEST.open(encoding="utf-8")))
    by_sid = {r["source_id"]: r for r in rows}

    # ---- 7단계: 업로드 ----
    print(f"업로드 시작: {len(rows)}건 → {BUCKET} 버킷\n")
    up_ok = 0
    up_fail = []
    for i, r in enumerate(rows, 1):
        key = r["target_key"]
        p = STEP3_OUT / key
        if not p.exists():
            up_fail.append((key, "로컬 파일 없음"))
            continue
        try:
            client.storage.from_(BUCKET).upload(
                key,
                p.read_bytes(),
                {"content-type": "image/webp", "upsert": "true"},
            )
            up_ok += 1
            if i % 25 == 0 or i == len(rows):
                print(f"  [{i:3}/{len(rows)}] 업로드 누적 {up_ok}")
        except Exception as e:  # noqa: BLE001
            up_fail.append((key, f"{type(e).__name__}: {e}"))
            print(f"  [{i:3}/{len(rows)}] XX {key}: {type(e).__name__}: {e}")

    print(f"\n업로드 성공 {up_ok}/{len(rows)}")
    if up_fail:
        print("[FAIL] 업로드 실패:")
        for k, err in up_fail:
            print(f"  - {k}: {err}")
        return 1

    # ---- 8단계 검증 ----
    print("\n[검증 1] 버킷 객체 수 == 206")
    cnt = bucket_object_count(client)
    ok1 = cnt == EXPECT
    print(f"  bookdash-*.webp 객체 수: {cnt} -> {'PASS' if ok1 else 'FAIL'}")

    print("\n[검증 2] 무작위 5건 GET 200 + content-type image/webp (github.io 출신 1건 포함)")
    rng = random.Random(2024)
    gh = [
        r for r in rows
        if urlsplit(r["old_cover_url"]).netloc == "bookdash.github.io"
        and r["source_id"] not in RESOURCED
    ]
    gh_pick = rng.choice(gh)
    others = [r for r in rows if r["source_id"] != gh_pick["source_id"]]
    sample = [gh_pick] + rng.sample(others, 4)
    bad = []
    for r in sample:
        origin = urlsplit(r["old_cover_url"]).netloc
        try:
            resp = requests.get(r["target_public_url"], timeout=30)
            code = resp.status_code
            ct = resp.headers.get("content-type", "")
        except Exception as e:  # noqa: BLE001
            code, ct = f"ERR({type(e).__name__})", ""
        ok = code == 200 and ct.startswith("image/webp")
        if not ok:
            bad.append((r["source_id"], code, ct))
        print(f"  [{'OK' if ok else 'XX'}] {str(code):>6} {ct:16} origin={origin:22} {r['source_id']}")
    ok2 = len(bad) == 0

    print("\n" + "=" * 50)
    if ok1 and ok2:
        print("Phase B 검증 ALL GREEN (업로드 206/206, 객체 206, 표본 5/5)")
        return 0
    print("[FAIL] 검증 실패 — 정지")
    if not ok1:
        print(f"  객체 수 {cnt} != {EXPECT}")
    if bad:
        print(f"  표본 실패: {bad}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
