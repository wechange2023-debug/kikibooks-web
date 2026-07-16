# -*- coding: utf-8 -*-
"""ADR-0049 — 캐시 PDF에서 페이지 이미지 렌더 (book_text 검수·뷰어용).

입력: population 목록 + out_154/{slug}.pages.json(권별 mapping_offset·page_no) + 캐시 {slug}.pdf
출력: {out}/{slug}/{NN}.jpg   (NN = page_no 2자리 zero-pad = book_text.page_index + 1)

페이지 매핑(ADR-0049 D2):
  page_no + mapping_offset = 1-based PDF 페이지 번호(실측: a-day-out offset4·총18·page_no1~14 → 14+4=18).
  PyMuPDF(fitz)는 0-based → 렌더 페이지 인덱스 = page_no + mapping_offset - 1.

네트워크 0 — 캐시 미스는 즉시 중단(reextract_coords.py 관례 계승, 다운로드 시도 금지).
사용:
  python scripts/pdf_harvest/render_page_images.py \
    --slugs scripts/pdf_harvest/population_pilot3.txt \
    --cache scripts/pdf_harvest/_pdf_cache \
    --pages-json-dir scripts/pdf_harvest/out_154 \
    --out scripts/pdf_harvest/out_images_154 [--dry-run] [--limit N]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image

TARGET_W = 1600       # 가로 기준 목표 px
JPEG_QUALITY = 80


def render_slug(slug: str, cache: Path, pages_json_dir: Path, out_root: Path,
                dry_run: bool) -> tuple[int, int]:
    """한 권 렌더. 반환 (offset, 생성 장수). 가드 위반 시 raise."""
    meta_f = pages_json_dir / f"{slug}.pages.json"
    if not meta_f.exists():
        raise SystemExit(f"[STOP] pages.json 부재: {meta_f}")
    meta = json.loads(meta_f.read_text(encoding="utf-8"))
    offset = meta["mapping_offset"]
    page_nos = [p["page_no"] for p in meta["pages"]]
    if not page_nos:
        raise SystemExit(f"[STOP] {slug}: page_no 목록 비어있음")

    # 가드 (c): 캐시 PDF 존재
    pdf_f = cache / f"{slug}.pdf"
    if not pdf_f.exists():
        raise SystemExit(f"[STOP] {slug}: 캐시 PDF 부재 {pdf_f} (다운로드 시도 금지)")

    doc = fitz.open(str(pdf_f))
    try:
        # 가드 (a): PDF 총 페이지 수 < max(page_no) + offset 이면 중단
        need = max(page_nos) + offset
        if doc.page_count < need:
            raise SystemExit(
                f"[STOP] {slug}: PDF 총 {doc.page_count}p < max(page_no)+offset={need}"
            )

        out_dir = out_root / slug
        if not dry_run:
            out_dir.mkdir(parents=True, exist_ok=True)

        made = 0
        for pn in page_nos:
            fitz_idx = pn + offset - 1  # 0-based (ADR-0049 D2)
            nn = f"{pn:02d}"
            out_f = out_dir / f"{nn}.jpg"
            if dry_run:
                print(f"      {slug}/{nn}.jpg  <- PDF idx {fitz_idx} (1-based {pn + offset})")
                made += 1
                continue
            page = doc.load_page(fitz_idx)
            zoom = TARGET_W / page.rect.width
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            img.save(str(out_f), "JPEG", quality=JPEG_QUALITY)
            made += 1

        # 가드 (b): 생성 장수 == page_no 개수
        if not dry_run:
            actual = len(list(out_dir.glob("*.jpg")))
            if actual != len(page_nos):
                raise SystemExit(
                    f"[STOP] {slug}: 생성 {actual}장 != page_no {len(page_nos)}장"
                )
        return offset, made
    finally:
        doc.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="PDF 페이지 이미지 렌더 (ADR-0049)")
    ap.add_argument("--slugs", required=True, help="slug 목록 파일(줄당 1개)")
    ap.add_argument("--cache", required=True, help="PDF 캐시 디렉터리({slug}.pdf)")
    ap.add_argument("--pages-json-dir", required=True, help="{slug}.pages.json 디렉터리(offset 출처)")
    ap.add_argument("--out", required=True, help="이미지 출력 루트")
    ap.add_argument("--dry-run", action="store_true", help="렌더 없이 매핑만 출력")
    ap.add_argument("--limit", type=int, default=None, help="앞 N권만")
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    cache = Path(a.cache)
    pages_json_dir = Path(a.pages_json_dir)
    out_root = Path(a.out)
    slugs = [s.strip() for s in Path(a.slugs).read_text(encoding="utf-8").splitlines() if s.strip()]
    if a.limit is not None:
        slugs = slugs[: a.limit]

    grand = 0
    for idx, slug in enumerate(slugs, 1):
        offset, made = render_slug(slug, cache, pages_json_dir, out_root, a.dry_run)
        grand += made
        print(f"[{idx}/{len(slugs)}] {slug}: offset={offset} · {made}장 → {out_root / slug}")
    print(f"\n총 {len(slugs)}권 / {grand}장{' (dry-run)' if a.dry_run else ''}")


if __name__ == "__main__":
    main()
