#!/usr/bin/env python3
"""
step3_recon.py — Book Dash 표지 STEP 3 Phase A 정찰·드라이런 (ADR-0032)

읽기 전용: DB SELECT + 매니페스트 생성 + 자동 게이트. 변환·업로드·DB 쓰기 0건.

산출:
  scratchpad/step3_manifest.csv  (id, source_id, old_cover_url, target_key, target_public_url)

게이트(전부 green이어야 Phase B 진행):
  (a) 행 수 == 206
  (b) source_id 중복 0
  (c) target_key 파일명 안전성 (source_id가 URL/스토리지 키로 안전)
  (d) old_cover_url 도달성 표본 10건 HTTP HEAD 200
  (e) 호스트 분포 리포트 (기대: bookdash.org 205 / CloudFront 1)

키 값(SUPABASE_SECRET_KEY)은 절대 출력하지 않음(Hard Rule 6).
"""
from __future__ import annotations

import csv
import os
import random
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

import requests

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"
MANIFEST = ROOT / "scratchpad" / "step3_manifest.csv"

BUCKET = "book-covers"
SOURCE_PLATFORM = "book_dash"
EXPECT_ROWS = 206
HTTP_TIMEOUT = 30
KEY_SAFE_RE = re.compile(r"^[A-Za-z0-9._-]+$")  # 스토리지 키/URL 안전 문자


def init_supabase():
    """.env.local에서 url·secret 로드 → (client, url). 키 값 출력 금지(Hard Rule 6)."""
    from dotenv import load_dotenv
    from supabase import create_client

    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret:
        print("[FAIL] 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY")
        sys.exit(1)
    return create_client(url, secret), url


def fetch_rows(client):
    """읽기 전용 SELECT — book_dash 활성책 id·source_id·cover_url."""
    rows = (
        client.table("books")
        .select("id, source_id, cover_url")
        .eq("source_platform", SOURCE_PLATFORM)
        .eq("is_active", True)
        .order("source_id")
        .execute()
        .data
        or []
    )
    return rows


def main() -> int:
    client, sb_url = init_supabase()
    sb_url = sb_url.rstrip("/")
    rows = fetch_rows(client)

    manifest = []
    for r in rows:
        sid = r.get("source_id") or ""
        key = f"bookdash-{sid}.webp"
        pub = f"{sb_url}/storage/v1/object/public/{BUCKET}/{key}"
        manifest.append(
            {
                "id": r.get("id"),
                "source_id": sid,
                "old_cover_url": r.get("cover_url") or "",
                "target_key": key,
                "target_public_url": pub,
            }
        )

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    with MANIFEST.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["id", "source_id", "old_cover_url", "target_key", "target_public_url"],
        )
        w.writeheader()
        w.writerows(manifest)

    print(f"매니페스트 기록: {MANIFEST}  ({len(manifest)}행)\n")

    # ---- 게이트 ----
    fails = []

    # (a) 행 수
    n = len(manifest)
    ok_a = n == EXPECT_ROWS
    print(f"(a) 행 수 == {EXPECT_ROWS}: {n}행 -> {'PASS' if ok_a else 'FAIL'}")
    if not ok_a:
        fails.append(f"(a) 행 수 {n} != {EXPECT_ROWS}")

    # (b) source_id 중복
    sids = [m["source_id"] for m in manifest]
    dups = sorted({s for s in sids if sids.count(s) > 1})
    ok_b = len(dups) == 0
    print(f"(b) source_id 중복 0건: {len(dups)}건 -> {'PASS' if ok_b else 'FAIL'}")
    if not ok_b:
        fails.append(f"(b) 중복 source_id: {dups}")

    # (c) target_key 파일명 안전성 (source_id 문자 안전)
    unsafe = [(m["id"], m["source_id"]) for m in manifest if not KEY_SAFE_RE.match(m["source_id"])]
    ok_c = len(unsafe) == 0
    print(f"(c) source_id 키 안전성(부적합 0건): {len(unsafe)}건 -> {'PASS' if ok_c else 'FAIL'}")
    if not ok_c:
        print("    부적합 목록:")
        print(f"    {'id':38} source_id")
        for _id, sid in unsafe:
            print(f"    {str(_id):38} {sid!r}")
        fails.append(f"(c) 키 부적합 source_id {len(unsafe)}건")

    # (e) 호스트 분포 (게이트 순서상 먼저 계산, 리포트만)
    hosts = {}
    for m in manifest:
        h = urlsplit(m["old_cover_url"]).netloc or "(빈 URL)"
        hosts[h] = hosts.get(h, 0) + 1
    print("\n(e) 호스트 분포 (기대: bookdash.org 205 / CloudFront 1):")
    for h, c in sorted(hosts.items(), key=lambda x: -x[1]):
        print(f"    {c:4}  {h}")

    # (d) 도달성 표본 10건 HEAD 200 (재현 위해 seed 고정)
    print("\n(d) old_cover_url 도달성 표본 10건 HTTP HEAD 200:")
    rng = random.Random(42)
    sample = rng.sample(manifest, min(10, len(manifest)))
    bad = []
    for m in sample:
        u = m["old_cover_url"]
        try:
            resp = requests.head(u, timeout=HTTP_TIMEOUT, allow_redirects=True)
            code = resp.status_code
            if code == 405:  # HEAD 미허용 origin → GET(stream)로 재확인
                resp = requests.get(u, timeout=HTTP_TIMEOUT, stream=True, allow_redirects=True)
                code = resp.status_code
                resp.close()
        except Exception as e:  # noqa: BLE001
            code = f"ERR({type(e).__name__})"
        ok = code == 200
        if not ok:
            bad.append((m["source_id"], code))
        print(f"    [{'OK' if ok else 'XX'}] {str(code):>6}  {m['source_id']}")
    ok_d = len(bad) == 0
    print(f"    -> {'PASS' if ok_d else 'FAIL'} ({len(sample)-len(bad)}/{len(sample)} 200)")
    if not ok_d:
        fails.append(f"(d) 도달 실패: {bad}")

    print("\n" + "=" * 50)
    if fails:
        print("게이트 FAIL — Phase B 진입 정지. 사유:")
        for x in fails:
            print(f"  - {x}")
        return 1
    print("게이트 ALL GREEN — Phase B 진입 가능")
    return 0


if __name__ == "__main__":
    sys.exit(main())
