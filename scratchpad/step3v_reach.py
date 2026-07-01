#!/usr/bin/env python3
"""
step3v_reach.py — 재소싱 5권 열람 실패 정찰 Phase B (읽기 전용 HTTP)

5권 content_url 도달성 + html 트랙 54권 전반 도달성 대조 + asb_native 구조 대조.
HTTP GET/HEAD만. DB·파일 쓰기 0건.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

import requests

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"
TIMEOUT = 30

TARGET = {
    "9c9eb452-fe46-11e5-86aa-5e5517507c66": "i-can-dress-myself",
    "9c9eb574-fe46-11e5-86aa-5e5517507c66": "hugs-in-the-city",
    "9c9ffed4-fe46-11e5-86aa-5e5517507c66": "it-wasnt-me",
    "9c9fffba-fe46-11e5-86aa-5e5517507c66": "katiitis-song",
    "9ca00316-fe46-11e5-86aa-5e5517507c66": "the-lion-who-wouldnt-try",
}


def init_supabase():
    from dotenv import load_dotenv
    from supabase import create_client

    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    return create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])


def reach(u):
    try:
        r = requests.get(u, timeout=TIMEOUT, allow_redirects=True)
        return r.status_code, r.headers.get("content-type", ""), r.text if r.status_code == 200 else ""
    except Exception as e:  # noqa: BLE001
        return f"ERR({type(e).__name__})", "", ""


def main() -> int:
    client = init_supabase()
    rows = (
        client.table("books").select("source_id, title, content_type, content_url, is_active")
        .eq("source_platform", "book_dash").execute().data or []
    )
    by_sid = {r["source_id"]: r for r in rows}
    html_rows = [r for r in rows if r.get("content_type") == "html"]
    asb_rows = [r for r in rows if r.get("content_type") == "asb_native"]

    print("=" * 72)
    print("[B-1] 재소싱 5권 content_url(github.io HTML) 도달성 + 내부 이미지 표본")
    print("=" * 72)
    for sid, slug in TARGET.items():
        r = by_sid.get(sid)
        u = r["content_url"]
        code, ct, body = reach(u)
        print(f"\n● {slug}")
        print(f"  content_url: {u}")
        print(f"  -> status={code}  content-type={ct}")
        if body:
            # HTML 내부 이미지 경로 표본 1~2개 추출 후 도달성
            imgs = re.findall(r'(?:src|href)=["\']([^"\']+\.(?:jpg|jpeg|png|webp))["\']', body, re.I)
            imgs = [i for i in imgs if not i.startswith("data:")][:2]
            if not imgs:
                print("  내부 이미지 참조 추출 0건(JS 렌더링 가능)")
            for im in imgs:
                iu = im if im.startswith("http") else requests.compat.urljoin(u, im)
                ic, ict, _ = reach(iu)
                print(f"    img: [{ic} {ict}] {iu}")

    print("\n" + "=" * 72)
    print(f"[B-2] html 트랙 전체 {len(html_rows)}권 content_url 도달성 (5권이 특수한가 vs 전반 문제인가)")
    print("=" * 72)
    bad = []
    for r in html_rows:
        code, ct, _ = reach(r["content_url"])
        mark = "OK" if code == 200 else "XX"
        if code != 200:
            bad.append((r["title"], code))
        # 간결 출력: 실패만 상세, 성공은 카운트
    ok_n = len(html_rows) - len(bad)
    print(f"  html 54권 content_url: 200={ok_n}  비200={len(bad)}")
    if bad:
        print("  비200 목록:")
        for t, c in bad:
            star = " ★재소싱5" if t in {r_["title"] for sid_ in TARGET for r_ in [by_sid[sid_]]} else ""
            print(f"    [{c}] {t}{star}")

    print("\n" + "=" * 72)
    print(f"[B-3] 대조: asb_native {len(asb_rows)}권 중 표본 3권 content_url 구조·도달성")
    print("=" * 72)
    for r in asb_rows[:3]:
        code, ct, _ = reach(r["content_url"])
        print(f"  [{code} {ct}] {r['title']}")
        print(f"     {r['content_url']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
