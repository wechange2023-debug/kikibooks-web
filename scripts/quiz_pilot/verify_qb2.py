#!/usr/bin/env python3
"""verify_qb2.py — QB-2 표본 확대 검증 (읽기 전용).

가설: book_dash 190권은 slug 형태로 두 계보로 갈리며,
      kebab-slug = 삽화에 본문 문장 인쇄 / UUID-slug = 미인쇄.

기존 표본(seed 20260821 본표본 + UUID 계보 확인용 EXT 표본)과 **겹치지 않는**
새 표본을 뽑는다: kebab 15권 × 2면 · UUID 10권 × 2면 = 50면.
시드 20260822 고정 — 재실행하면 같은 표본이 나온다.

텍스트가 빈 면은 판정 불능이라 제외한다(빈 면은 삽화에도 글자가 없다 —
`unathi-…__p13` 사례). 따라서 `text`가 비지 않은 면 중에서만 뽑는다.

DB 쓰기 0건 / Storage 쓰기 0건.
"""
from __future__ import annotations
import json, os, random, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TMP = HERE / "tmp"
SEED_OLD = 20260821          # 기존 표본 재현용(제외 목록 산출)
SEED_NEW = 20260822          # 본 확대 검증 시드
KEBAB_BOOKS, UUID_BOOKS, PAGES_PER_BOOK = 15, 10, 2
MAX_EDGE = 1000

from dotenv import load_dotenv
load_dotenv(ROOT / ".env.local")
from supabase import create_client
import requests
from PIL import Image

c = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
raw = json.loads((HERE / "out" / "_q0_raw.json").read_text(encoding="utf-8"))
pop = [b for b in raw["per_book"] if b["pages"] > 0 and b["audio_pages"] > 0
       and b["source"] == "book_dash"]
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-", re.I)
uu = sorted([b for b in pop if UUID_RE.match(b["slug"] or "")], key=lambda b: b["slug"])
kb = sorted([b for b in pop if not UUID_RE.match(b["slug"] or "")], key=lambda b: b["slug"])

# ── 기존 표본 재현 → 제외 목록 ────────────────────────────────────────────────
used: set[str] = set()
m = json.loads((HERE / "out" / "_q0_sample_manifest.json").read_text(encoding="utf-8"))
used |= {s["slug"] for s in m["samples"] if s.get("source") == "book_dash"}
# EXT 표본은 sample_pagenum.py 뒤에 별도 실행된 결정적 추첨이었다 — 동일 로직 재현
_r = random.Random(SEED_OLD)
used |= {b["slug"] for b in _r.sample(uu, 3)} | {b["slug"] for b in _r.sample(kb, 2)}
print(f"[제외] 기존 표본 도서 {len(used)}권: {sorted(s[:26] for s in used)}\n")

kb_pool = [b for b in kb if b["slug"] not in used]
uu_pool = [b for b in uu if b["slug"] not in used]
print(f"[모집단] kebab {len(kb)} (가용 {len(kb_pool)}) · UUID {len(uu)} (가용 {len(uu_pool)})")

rng = random.Random(SEED_NEW)
picks = ([("KEBAB", b) for b in rng.sample(kb_pool, KEBAB_BOOKS)]
         + [("UUID", b) for b in rng.sample(uu_pool, UUID_BOOKS)])

TMP.mkdir(parents=True, exist_ok=True)
manifest = []
for tag, b in picks:
    rows = c.table("book_text").select("page_index,image_url,text") \
            .eq("book_id", b["book_id"]).order("page_index").execute().data or []
    ok = [r for r in rows if r.get("image_url") and (r.get("text") or "").strip()]
    if len(ok) < PAGES_PER_BOOK:
        manifest.append({"tag": tag, "slug": b["slug"], "note": f"판정가능 면 {len(ok)}개"})
        print(f"[SKIP] {tag} {b['slug'][:30]} — 판정가능 면 {len(ok)}개")
        continue
    for r in sorted(rng.sample(ok, PAGES_PER_BOOK), key=lambda r: r["page_index"]):
        name = f"QB2_{tag}__{b['slug'][:28]}__p{r['page_index']:02d}.png"
        resp = requests.get(r["image_url"], timeout=60); resp.raise_for_status()
        (TMP / name).write_bytes(resp.content)
        im = Image.open(TMP / name).convert("RGB"); w, h = im.size
        if max(w, h) > MAX_EDGE:
            s = MAX_EDGE / max(w, h); im = im.resize((int(w*s), int(h*s)), Image.LANCZOS)
        im.save(TMP / name)
        manifest.append({"tag": tag, "slug": b["slug"], "page_index": r["page_index"],
                         "file": name, "text": (r.get("text") or "")[:70]})
        print(f"[OK] {name}")

(HERE / "out" / "_qb2_manifest.json").write_text(
    json.dumps({"seed": SEED_NEW, "excluded_books": sorted(used), "samples": manifest},
               ensure_ascii=False, indent=1), encoding="utf-8")
n = len([x for x in manifest if "file" in x])
print(f"\n[DONE] {n}면 수집 (kebab {len([x for x in manifest if x['tag']=='KEBAB' and 'file' in x])}"
      f" / UUID {len([x for x in manifest if x['tag']=='UUID' and 'file' in x])})")
