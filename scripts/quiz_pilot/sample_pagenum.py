#!/usr/bin/env python3
"""sample_pagenum.py — STEP 1-2 삽화 내 페이지 번호 인쇄 여부 표본 수집 (읽기 전용).

소스별 5권 × 3페이지를 **시드 고정** 무작위로 뽑아 이미지를 내려받는다.
DB 쓰기 0건 / Storage 쓰기 0건. 다운로드 위치 scripts/quiz_pilot/tmp/.

시드 = 20260821 (지시서 수령일). 같은 시드로 재실행하면 같은 표본이 나온다.
"""
from __future__ import annotations
import json, os, random, sys
from pathlib import Path
from collections import defaultdict

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TMP = HERE / "tmp"
SEED = 20260821
BOOKS_PER_SOURCE = 5
PAGES_PER_BOOK = 3
MAX_EDGE = 1400          # 육안 확인용 상한(페이지 번호 판독 가능하도록 크게 유지)

from dotenv import load_dotenv
load_dotenv(ROOT / ".env.local")
from supabase import create_client
import requests
from PIL import Image

c = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

raw = json.loads((HERE / "out" / "_q0_raw.json").read_text(encoding="utf-8"))
pop = [b for b in raw["per_book"] if b["pages"] > 0 and b["audio_pages"] > 0]

by_src: dict[str, list[dict]] = defaultdict(list)
for b in pop:
    by_src[b["source"]].append(b)

rng = random.Random(SEED)
TMP.mkdir(parents=True, exist_ok=True)
manifest = []

for src in sorted(by_src):
    books = sorted(by_src[src], key=lambda b: b["slug"] or b["book_id"])   # 결정적 정렬 후 추첨
    picked = rng.sample(books, min(BOOKS_PER_SOURCE, len(books)))
    for b in picked:
        rows = c.table("book_text").select("page_index,image_url,text") \
                .eq("book_id", b["book_id"]).order("page_index").execute().data or []
        withimg = [r for r in rows if r.get("image_url")]
        if not withimg:
            manifest.append({"source": src, "slug": b["slug"], "note": "no image_url"})
            continue
        pages = rng.sample(withimg, min(PAGES_PER_BOOK, len(withimg)))
        for r in sorted(pages, key=lambda r: r["page_index"]):
            url = r["image_url"]
            name = f"{src}__{b['slug']}__p{r['page_index']:02d}.png"
            dst = TMP / name
            try:
                resp = requests.get(url, timeout=60)
                resp.raise_for_status()
                dst.write_bytes(resp.content)
                im = Image.open(dst).convert("RGB")
                w, h = im.size
                if max(w, h) > MAX_EDGE:
                    s = MAX_EDGE / max(w, h)
                    im = im.resize((int(w*s), int(h*s)), Image.LANCZOS)
                im.save(dst)
                manifest.append({"source": src, "slug": b["slug"], "book_id": b["book_id"],
                                 "page_index": r["page_index"], "file": name,
                                 "orig_size": [w, h], "url": url,
                                 "text": (r.get("text") or "")[:80]})
                print(f"[OK] {name}  {w}x{h}", flush=True)
            except Exception as e:
                manifest.append({"source": src, "slug": b["slug"],
                                 "page_index": r["page_index"], "error": str(e)[:120], "url": url})
                print(f"[ERR] {name}: {e}", flush=True)

(HERE / "out" / "_q0_sample_manifest.json").write_text(
    json.dumps({"seed": SEED, "samples": manifest}, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"\n[DONE] {len([m for m in manifest if 'file' in m])}장 / manifest 저장")
