#!/usr/bin/env python3
"""book_text.image_url 전수 스캔 — 깨진 URL·백지 삽화 판별 (Q-2d · 읽기 전용).

배경: 퀴즈 보기에 **완전 공백 이미지**가 떴다(팀장 프로덕션 육안, 2026-08-21).
표본 진단 결과 HTTP 200에 정상 JPEG인데 **콘텐츠가 순백**이었다
(`book_dash-and-also/14.jpg` — 1600x1600, 평균 255.0, 표준편차 0.00).

그래서 상태 코드만 보는 HEAD 요청으로는 잡히지 않는다. **본문을 받아 픽셀 통계**를
내야 한다. 8,096개 고유 URL 기준 약 16분(동시 24) — 1회성이라 감당한다.

★ DB는 SELECT만. Storage는 GET만. 쓰기 0건.
★ 결과는 scripts/quiz_pilot/out/ 아래(‥gitignore) + 제외 목록만 별도 파일로 뽑는다.

판정:
  broken   HTTP != 200 / 빈 응답 / 디코드 실패
  blank    표준편차 < BLANK_SD  (사실상 단색 — 보기로 쓰면 빈 카드가 된다)
  flat     표준편차 < FLAT_SD   (거의 단색 — 참고용, 제외하지 않는다)
  ok       그 외

실행:
    python scripts/quiz_pilot/scan_blank_images.py
    python scripts/quiz_pilot/scan_blank_images.py --limit 500   # 표본만
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / "out"

#: 이 아래면 사실상 단색 = 빈 카드로 보인다. 표본에서 진짜 백지가 0.00이었다.
BLANK_SD = 3.0
#: 참고용 경계(제외하지 않는다). 단색에 가까우나 무늬가 있는 면.
FLAT_SD = 8.0
WORKERS = 24
READER_VOICE = "danielle"

import requests  # noqa: E402
from PIL import Image, ImageStat  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env.local")
import os  # noqa: E402
from supabase import create_client  # noqa: E402

client = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])


def page_all(table: str, cols: str) -> list[dict]:
    out: list[dict] = []
    start = 0
    while True:
        rows = (
            client.table(table).select(cols)
            .order("id" if table == "books" else "book_id")
            .range(start, start + 999).execute().data or []
        )
        out.extend(rows)
        if len(rows) < 1000:
            return out
        start += 1000


def load_population() -> tuple[dict[str, str], list[str]]:
    """모집단 858권의 (URL -> 대표 book_id) 와 고유 URL 목록."""
    books = page_all("books", "id,source_platform,is_active")
    texts = page_all("book_text", "book_id,page_index,image_url")
    audio = page_all("book_audio", "book_id,kind,voice")

    active = {b["id"]: b for b in books if b["is_active"]}
    have_audio = {r["book_id"] for r in audio if r["voice"] == READER_VOICE and r["kind"] == "page"}

    by_book: dict[str, list[dict]] = {}
    for r in texts:
        if r["book_id"] in active:
            by_book.setdefault(r["book_id"], []).append(r)

    pop = {bid for bid in by_book if bid in have_audio}
    owner: dict[str, str] = {}
    for bid in pop:
        for r in by_book[bid]:
            u = r.get("image_url")
            if u and u not in owner:
                owner[u] = bid
    return owner, sorted(owner)


def probe(session: requests.Session, url: str) -> dict:
    try:
        resp = session.get(url, timeout=45)
    except Exception as exc:  # noqa: BLE001
        return {"url": url, "verdict": "broken", "reason": f"request:{type(exc).__name__}"}

    if resp.status_code != 200 or not resp.content:
        return {"url": url, "verdict": "broken", "reason": f"http:{resp.status_code}",
                "bytes": len(resp.content)}

    try:
        im = Image.open(io.BytesIO(resp.content))
        w, h = im.size
        # JPEG는 draft로 1/8 축소 디코드 — 통계에 충분하고 훨씬 빠르다.
        im.draft("L", (160, 160))
        gray = im.convert("L")
        st = ImageStat.Stat(gray)
        mean, sd = st.mean[0], st.stddev[0]
    except Exception as exc:  # noqa: BLE001
        return {"url": url, "verdict": "broken", "reason": f"decode:{type(exc).__name__}",
                "bytes": len(resp.content)}

    verdict = "blank" if sd < BLANK_SD else ("flat" if sd < FLAT_SD else "ok")
    return {"url": url, "verdict": verdict, "bytes": len(resp.content),
            "w": w, "h": h, "mean": round(mean, 2), "sd": round(sd, 3)}


def main() -> int:
    ap = argparse.ArgumentParser(description="book_text.image_url 전수 스캔")
    ap.add_argument("--limit", type=int, default=None, help="앞에서 N개만 (표본 확인용)")
    args = ap.parse_args()

    owner, urls = load_population()
    if args.limit:
        urls = urls[: args.limit]
    print(f"[대상] 고유 URL {len(urls):,}개", flush=True)
    print("[호스트]", dict(Counter(urlparse(u).netloc for u in urls).most_common()), flush=True)

    session = requests.Session()
    started = time.time()
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for i, row in enumerate(ex.map(lambda u: probe(session, u), urls), 1):
            results.append(row)
            if i % 500 == 0:
                print(f"  {i:,}/{len(urls):,}  {time.time() - started:.0f}s", flush=True)

    counts = Counter(r["verdict"] for r in results)
    print(f"\n[완료] {time.time() - started:.0f}초 · {dict(counts)}")

    blanks = [r for r in results if r["verdict"] == "blank"]
    broken = [r for r in results if r["verdict"] == "broken"]
    flats = [r for r in results if r["verdict"] == "flat"]

    for r in blanks:
        r["book_id"] = owner.get(r["url"])
    for r in broken:
        r["book_id"] = owner.get(r["url"])

    print(f"\n백지 {len(blanks)}건 / 깨짐 {len(broken)}건 / 거의단색 {len(flats)}건")
    for r in blanks[:20]:
        print(f"  blank sd={r.get('sd')} mean={r.get('mean')} {r['url']}")
    for r in broken[:20]:
        print(f"  broken {r.get('reason')} {r['url']}")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "_image_scan.json").write_text(
        json.dumps({"scanned": len(results), "counts": dict(counts),
                    "blank_sd": BLANK_SD, "flat_sd": FLAT_SD,
                    "blanks": blanks, "broken": broken,
                    "flats": sorted(flats, key=lambda r: r["sd"])[:50]},
                   ensure_ascii=False, indent=1),
        encoding="utf-8")
    (OUT / "_image_scan_all.json").write_text(
        json.dumps(results, ensure_ascii=False), encoding="utf-8")
    print(f"\n[저장] {OUT / '_image_scan.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
