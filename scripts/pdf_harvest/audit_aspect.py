#!/usr/bin/env python3
"""audit_aspect.py — Book Dash 페이지 이미지 종횡비 실측 (세로 long-scroll 형식 식별).

배경
----
book_dash 도서 중 가로 슬라이드가 아니라 **세로로 길게 이어진 형식**이 존재한다는
팀장 보고가 있었다. 이런 권은 이미지를 잘라 가로 슬라이드로 바꿀 계획인데, 그러면
페이지 번호가 바뀔 수 있다. 페이지 번호에 결합된 산출물(mp3 `pNN`, `book_audio.page_index`)을
만들기 **전에** 영향 범위를 확정하기 위한 정찰이다.

읽기 전용이다. 이미지 변환·업로드·DB 쓰기 0건.

측정 대상
---------
    scripts/pdf_harvest/out_images_154/{slug}/NN.jpg  (로컬 렌더 산출물)
Storage(`book-images/book_dash-{slug}/NN.jpg`)와 동일 원천인지는 --verify-storage로 표본 대조한다.

사용
----
    python scripts/pdf_harvest/audit_aspect.py
    python scripts/pdf_harvest/audit_aspect.py --threshold 2.0
    python scripts/pdf_harvest/audit_aspect.py --verify-storage 12
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

HARVEST_DIR = Path(__file__).resolve().parent
ROOT = HARVEST_DIR.parent.parent
IMAGES_DIR = HARVEST_DIR / "out_images_154"
OUT_CSV = HARVEST_DIR / "aspect_audit.csv"
OUT_JSON = HARVEST_DIR / "aspect_audit.json"

# 통상 그림책 판형(가로형)은 w/h ≈ 1.4 안팎. 세로로 이어붙인 long-scroll은 h/w가 크게 튄다.
DEFAULT_TALL_RATIO = 2.0     # h/w 가 이 값 이상이면 '세로 긴 이미지'
PORTRAIT_RATIO = 1.05        # h/w 가 이 값 이상이면 단순 '세로형'(참고용)


def measure() -> list[dict]:
    from PIL import Image

    books: list[dict] = []
    for slug_dir in sorted(p for p in IMAGES_DIR.iterdir() if p.is_dir()):
        pages = []
        for img in sorted(slug_dir.glob("*.jpg")):
            try:
                with Image.open(img) as im:
                    w, h = im.size
            except Exception as exc:  # noqa: BLE001
                pages.append({"file": img.name, "error": f"{type(exc).__name__}: {exc}"})
                continue
            pages.append({
                "file": img.name,
                "page": int(img.stem) if img.stem.isdigit() else None,
                "w": w, "h": h,
                "hw": round(h / w, 4) if w else None,
            })
        books.append({"slug": slug_dir.name, "pages": pages})
    return books


def measure_storage(sample_per_book: int, only_missing_local: bool) -> list[dict]:
    """Storage `book-images/book_dash-*` 폴더의 이미지를 직접 측정한다(읽기 전용 GET).

    로컬 렌더가 없는 권(v1 html 배치 등)을 덮기 위한 경로다. 이미지 전체를 받지 않고
    Range 요청으로 앞부분만 읽어 치수를 얻는다.
    """
    import io
    import os
    import urllib.request

    from dotenv import load_dotenv
    from PIL import Image
    from supabase import create_client

    load_dotenv(ROOT / ".env.local")
    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    client = create_client(base, os.environ["SUPABASE_SECRET_KEY"])

    local = {p.name for p in IMAGES_DIR.iterdir() if p.is_dir()} if IMAGES_DIR.exists() else set()
    prefixes = [e["name"] for e in client.storage.from_("book-images").list("", {"limit": 2000})
                if e["name"].startswith("book_dash-")]

    books: list[dict] = []
    for prefix in sorted(prefixes):
        slug = prefix[len("book_dash-"):]
        if only_missing_local and slug in local:
            continue
        try:
            files = sorted(f["name"] for f in
                           client.storage.from_("book-images").list(prefix, {"limit": 2000})
                           if f["name"].lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
        except Exception as exc:  # noqa: BLE001
            books.append({"slug": slug, "source": "storage", "pages": [],
                          "error": f"{type(exc).__name__}: {exc}"})
            continue

        picks = files if sample_per_book <= 0 or len(files) <= sample_per_book else [
            files[round(i * (len(files) - 1) / (sample_per_book - 1))]
            for i in range(sample_per_book)
        ]
        pages = []
        for name in picks:
            url = f"{base.rstrip('/')}/storage/v1/object/public/book-images/{prefix}/{name}"
            req = urllib.request.Request(url, headers={"Range": "bytes=0-65535"})
            try:
                with urllib.request.urlopen(req, timeout=25) as resp:
                    with Image.open(io.BytesIO(resp.read())) as im:
                        w, h = im.size
            except Exception as exc:  # noqa: BLE001
                pages.append({"file": name, "error": f"{type(exc).__name__}"})
                continue
            stem = Path(name).stem
            pages.append({"file": name, "page": int(stem) if stem.isdigit() else None,
                          "w": w, "h": h, "hw": round(h / w, 4) if w else None})
        books.append({"slug": slug, "source": "storage",
                      "images_in_folder": len(files), "sampled": len(picks), "pages": pages})
        print(f"    {slug[:44]:46s} {len(files):3d}장 중 {len(picks)}장 측정", flush=True)
    return books


def verify_storage(books: list[dict], sample: int) -> dict:
    """로컬 이미지가 Storage 본과 같은 원천인지 표본으로 대조(읽기 전용 HTTP GET)."""
    import os
    import urllib.request

    from dotenv import load_dotenv
    from PIL import Image

    load_dotenv(ROOT / ".env.local")
    base = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    if not base:
        return {"checked": 0, "note": "NEXT_PUBLIC_SUPABASE_URL 없음 — 대조 생략"}

    picks = []
    step = max(1, len(books) // sample)
    for b in books[::step][:sample]:
        ok_pages = [p for p in b["pages"] if p.get("w")]
        if ok_pages:
            picks.append((b["slug"], ok_pages[0]))

    match = mismatch = error = 0
    details = []
    for slug, page in picks:
        url = (f"{base.rstrip('/')}/storage/v1/object/public/book-images/"
               f"book_dash-{slug}/{page['file']}")
        try:
            with urllib.request.urlopen(url, timeout=20) as resp:
                import io
                with Image.open(io.BytesIO(resp.read())) as im:
                    sw, sh = im.size
        except Exception as exc:  # noqa: BLE001
            error += 1
            details.append({"slug": slug, "file": page["file"],
                            "result": "error", "detail": f"{type(exc).__name__}"})
            continue
        same = (sw, sh) == (page["w"], page["h"])
        match += same
        mismatch += (not same)
        details.append({"slug": slug, "file": page["file"],
                        "result": "match" if same else "mismatch",
                        "local": [page["w"], page["h"]], "storage": [sw, sh]})
    return {"checked": len(picks), "match": match, "mismatch": mismatch,
            "error": error, "details": details}


def main() -> int:
    ap = argparse.ArgumentParser(description="Book Dash 페이지 이미지 종횡비 실측")
    ap.add_argument("--threshold", type=float, default=DEFAULT_TALL_RATIO,
                    help=f"세로 긴 이미지 판정 h/w 임계 (기본 {DEFAULT_TALL_RATIO})")
    ap.add_argument("--verify-storage", type=int, default=0, metavar="N",
                    help="Storage 본과 치수 대조할 표본 권수 (0=생략)")
    ap.add_argument("--source", choices=("local", "storage", "both"), default="local",
                    help="측정 원천. storage/both는 로컬 렌더가 없는 권까지 덮는다")
    ap.add_argument("--sample-per-book", type=int, default=0, metavar="N",
                    help="storage 측정 시 권당 표본 이미지 수 (0=전부)")
    ap.add_argument("--out-prefix", default=None,
                    help="산출 파일명 접두사(기본 aspect_audit)")
    args = ap.parse_args()

    global OUT_CSV, OUT_JSON
    if args.out_prefix:
        OUT_CSV = HARVEST_DIR / f"{args.out_prefix}.csv"
        OUT_JSON = HARVEST_DIR / f"{args.out_prefix}.json"

    if args.source in ("local", "both") and not IMAGES_DIR.exists():
        print(f"[FAIL] 이미지 폴더 없음: {IMAGES_DIR}")
        return 2

    books = measure() if args.source in ("local", "both") else []
    if args.source in ("storage", "both"):
        print("[INFO] Storage 이미지 측정 중(읽기 전용 Range GET)…")
        books += measure_storage(args.sample_per_book,
                                 only_missing_local=(args.source == "both"))
    all_hw = [p["hw"] for b in books for p in b["pages"] if p.get("hw")]
    if not all_hw:
        print("[FAIL] 측정된 이미지 0장")
        return 1

    all_hw_sorted = sorted(all_hw)

    def pct(q: float) -> float:
        idx = min(len(all_hw_sorted) - 1, int(q * len(all_hw_sorted)))
        return round(all_hw_sorted[idx], 4)

    print("=" * 78)
    print(" Book Dash 페이지 이미지 종횡비 실측 (읽기 전용 · 변환 0건)")
    print("=" * 78)
    print(f"  권수 {len(books)} · 이미지 {len(all_hw):,}장   (h/w = 세로÷가로)")
    print(f"  중앙값 {statistics.median(all_hw):.4f} · 평균 {statistics.fmean(all_hw):.4f}")
    print(f"  분위수  p01={pct(.01)}  p25={pct(.25)}  p50={pct(.50)}  "
          f"p75={pct(.75)}  p99={pct(.99)}")
    print(f"  최소 {min(all_hw)}  최대 {max(all_hw)}")

    buckets = [(0, 0.5), (0.5, 0.8), (0.8, 1.05), (1.05, 1.5), (1.5, 2.0),
               (2.0, 3.0), (3.0, 999)]
    print("\n  [h/w 분포]")
    for lo, hi in buckets:
        n = sum(1 for v in all_hw if lo <= v < hi)
        if n:
            label = f"{lo:>4.2f}~{hi:<5.2f}" if hi < 999 else f"{lo:>4.2f}~     "
            print(f"    {label} {n:5,d}장  {'#' * max(1, round(n / len(all_hw) * 60))}")

    tall = args.threshold
    candidates = []
    for b in books:
        hits = [p for p in b["pages"] if (p.get("hw") or 0) >= tall]
        if hits:
            hw = [p["hw"] for p in b["pages"] if p.get("hw")]
            candidates.append({
                "slug": b["slug"],
                "images_total": len(hw),
                "tall_images": len(hits),
                "tall_pages": [p["page"] for p in hits],
                "hw_min": min(hw), "hw_max": max(hw),
                "hw_median": round(statistics.median(hw), 4),
                "all_tall": len(hits) == len(hw),
            })

    print(f"\n  [세로 긴 이미지(h/w ≥ {tall}) 보유 권] {len(candidates)}권")
    for c in sorted(candidates, key=lambda c: -c["tall_images"]):
        mark = "전면" if c["all_tall"] else "일부"
        print(f"    {c['slug']:38s} {c['tall_images']:2d}/{c['images_total']:2d}장 {mark} "
              f"h/w {c['hw_min']}~{c['hw_max']} (중앙 {c['hw_median']})")
    if not candidates:
        print("    없음")

    storage = None
    if args.verify_storage:
        print(f"\n  [Storage 대조] 표본 {args.verify_storage}권 …")
        storage = verify_storage(books, args.verify_storage)
        print(f"    검사 {storage['checked']} · 일치 {storage.get('match')} · "
              f"불일치 {storage.get('mismatch')} · 오류 {storage.get('error')}")
        for d in storage.get("details", []):
            if d["result"] != "match":
                print(f"      {d['slug']}/{d['file']}: {d}")

    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["slug", "images_total", "hw_min", "hw_median", "hw_max",
                    "tall_images", "tall_pages", "all_tall"])
        for b in books:
            hw = [p["hw"] for p in b["pages"] if p.get("hw")]
            if not hw:
                continue
            hits = [p for p in b["pages"] if (p.get("hw") or 0) >= tall]
            w.writerow([b["slug"], len(hw), min(hw), round(statistics.median(hw), 4),
                        max(hw), len(hits),
                        ";".join(str(p["page"]) for p in hits),
                        int(len(hits) == len(hw) and bool(hits))])

    OUT_JSON.write_text(json.dumps(
        {"threshold": tall, "books_measured": len(books), "images_measured": len(all_hw),
         "hw_median": round(statistics.median(all_hw), 4),
         "candidates": candidates, "storage_check": storage,
         "books": books}, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n  CSV  → {OUT_CSV.relative_to(ROOT)}")
    print(f"  JSON → {OUT_JSON.relative_to(ROOT)}")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
