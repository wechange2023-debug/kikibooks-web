#!/usr/bin/env python3
"""
step3s_check_storage.py — STEP 3 잔여 3권 창고 실물 존재 확인 (읽기 전용)

Storage READ만 수행(list). DB write 0, upload 0, download 0.
step3_upload.py 의 env/키 로드·버킷·파일명 규칙(bookdash-{key}.webp)을 그대로 재사용.
키 값(SUPABASE_SECRET_KEY)은 절대 출력하지 않음(Hard Rule 6).

각 권마다 두 후보 파일명을 모두 조회한다:
  - orchestrator 확정 id (8ecad49e / 65710be3 / 8b447c51)
  - manifest target_key = 옛 book_dash UUID (9c9f4da4 / 9c9e7dca / 9c9eb7e0)
실제 존재하는 파일명을 진실로 보고한다.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"
BUCKET = "book-covers"

# slug -> (orchestrator 확정 id, manifest target_key UUID)
BOOKS = {
    "little-sock-and-the-tiny-creatures": (
        "8ecad49e-2a79-4a47-9815-5af12cb13de7",
        "9c9f4da4-fe46-11e5-86aa-5e5517507c66",
    ),
    "maddy-moonas-menagerie": (
        "65710be3-bd8a-4a0c-ae0b-66d9fc0699ae",
        "9c9e7dca-fe46-11e5-86aa-5e5517507c66",
    ),
    "mrs-penguins-perfect-palace": (
        "8b447c51-ba5e-4b2a-b598-259304fa93be",
        "9c9eb7e0-fe46-11e5-86aa-5e5517507c66",
    ),
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


def all_bookdash_names(client) -> set[str]:
    """book-covers 버킷 bookdash-*.webp 전체 파일명 집합(페이지네이션)."""
    names: set[str] = set()
    offset = 0
    page = 1000
    while True:
        items = client.storage.from_(BUCKET).list("", {"limit": page, "offset": offset})
        if not items:
            break
        for it in items:
            n = it.get("name", "")
            if n.startswith("bookdash-"):
                names.add(n)
        if len(items) < page:
            break
        offset += page
    return names


def main() -> int:
    client, sb_url = init_supabase()
    names = all_bookdash_names(client)
    print(f"버킷 {BUCKET} 내 bookdash-*.webp 총 {len(names)}개\n")

    base = f"{sb_url}/storage/v1/object/public/{BUCKET}"
    print("규칙 대조: 업로드 파일명 = bookdash-{key}.webp (step3_upload.py target_key와 일치)\n")

    for slug, (new_id, old_uuid) in BOOKS.items():
        fn_new = f"bookdash-{new_id}.webp"
        fn_old = f"bookdash-{old_uuid}.webp"
        ex_new = fn_new in names
        ex_old = fn_old in names
        print(f"[{slug}]")
        print(f"  new-id : {fn_new:52} {'있음' if ex_new else '없음'}")
        print(f"  old-uuid: {fn_old:52} {'있음' if ex_old else '없음'}")
        if ex_new:
            print(f"  -> 확정 URL: {base}/{fn_new}")
        elif ex_old:
            print(f"  -> 확정 URL: {base}/{fn_old}")
        else:
            print(f"  -> 실물 없음: 재업로드 필요")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
