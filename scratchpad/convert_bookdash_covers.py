#!/usr/bin/env python3
"""
convert_bookdash_covers.py — Book Dash 표지 600px WebP 변환 (ADR-0032)

목적: Book Dash 표지(평균 3.3MB 인쇄해상도 JPEG, 느린 bookdash.org origin)를
가로 600px·WebP·품질 80 사본으로 변환한다. STEP 2에서 표본 5건 화질 검증에 사용했고,
STEP 3에서 206건 일괄 변환 + book-covers 버킷 업로드에 재사용한다(ADR-0032 결정 4·5).

원본 출처(sync_book_dash_v2.py:159-166): featured_media(bookdash.org) 우선,
없으면 CloudFront 폴백. 본 스크립트는 출처 무관하게 입력 cover_url을 그대로 GET한다.
(STEP 3에서는 DB 현재 cover_url 목록을 입력으로 사용 — 어느 origin이든 처리.)

이번 단계(표본): WP API ?slug= 로 표본 slug의 cover_url을 받아 변환.
  - 변환만 한다. Storage 업로드·DB UPDATE 0건(ADR-0032 STEP 2 범위).
  - 원본(__orig.jpg)·변환본(bookdash-{slug}.webp) 둘 다 OUT_DIR에 보존.

변환 사양(ADR-0032 결정 2, STEP 2 표본 확정):
  - 가로 TARGET_W(600px) 리사이즈, 비율 유지(세로 비례). 600px 미만 원본은 확대 안 함.
  - WebP, 품질 Q(80), method=6(최고 압축).
  - 표본 실측: 원본 평균 3.3MB → 변환 평균 ~48KB(약 98% 감소), 600x600.

사용(표본):
    python scripts/convert_bookdash_covers.py
"""

from __future__ import annotations

import io
import os
import sys

import requests
from PIL import Image

# ---------------------------------------------------------------------------
# 변환 사양 (ADR-0032 결정 2 — q80은 STEP 2 표본 검증값. 조정 시 본 상수만 변경)
# ---------------------------------------------------------------------------
TARGET_W = 600          # 가로 목표폭(px). 카드 최대표시폭 ~16vw × DPR2 여유.
QUALITY = 80            # WebP 품질.
WEBP_METHOD = 6         # 0(빠름)~6(최고압축). 일괄도 표지 1장당 가벼워 6 고정.
HTTP_TIMEOUT = 60

WP_BOOKS = "https://bookdash.org/wp-json/wp/v2/books"

# STEP 2 표본 slug(4MB대 2건 포함 전 구간 분포). STEP 3에서는 DB cover_url 목록으로 대체.
SAMPLE_SLUGS = [
    "aaaaahhh-mmawe",       # 5.48MB (최대급)
    "khaya-wants-to-row",   # 4.32MB
    "moms-hands",           # 3.74MB
    "dance-khuzwayo-dance",  # 0.59MB
    "baby-talk",            # 0.16MB (최소급)
]


def cover_url_for_slug(slug: str) -> str:
    """WP API ?slug= 로 featured_media source_url 조회(없으면 CloudFront 폴백 조립).

    sync_book_dash_v2.py:_extract_book 의 cover_url 조립 로직과 동일 규칙.
    """
    resp = requests.get(WP_BOOKS, params={"slug": slug, "_embed": 1}, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        raise ValueError(f"WP API: slug '{slug}' 책 없음")
    b = data[0]
    emb = b.get("_embedded") or {}
    fm = emb.get("wp:featuredmedia") or []
    src = (fm[0] or {}).get("source_url") if fm else None
    if not src:
        cf = "https://d3qawc7yl9x4zs.cloudfront.net"
        src = f"{cf}/{slug}/e-book/en_english/images/{slug}_en_cover.jpg"
    return src


def convert_to_webp(raw: bytes) -> tuple[bytes, tuple[int, int], tuple[int, int]]:
    """원본 바이트 → (webp 바이트, 원본해상도, 변환해상도).

    가로 TARGET_W로 비율유지 축소(원본이 더 작으면 원본 유지). RGB 변환 후 WebP 저장.
    """
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    ow, oh = im.size
    if ow > TARGET_W:
        nh = round(oh * TARGET_W / ow)
        im = im.resize((TARGET_W, nh), Image.LANCZOS)
    nw, nh = im.size
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=QUALITY, method=WEBP_METHOD)
    return buf.getvalue(), (ow, oh), (nw, nh)


def main() -> int:
    out_dir = os.path.join(os.path.dirname(__file__), "..", "scratchpad", "cover_samples")
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    print(f"{'source_id':24} {'orig':>9} {'webp':>9} {'reduce':>7} {'orig_res':>11} {'webp_res':>11}")
    for slug in SAMPLE_SLUGS:
        url = cover_url_for_slug(slug)
        raw = requests.get(url, timeout=HTTP_TIMEOUT).content
        with open(os.path.join(out_dir, f"{slug}__orig.jpg"), "wb") as f:
            f.write(raw)
        webp, (ow, oh), (nw, nh) = convert_to_webp(raw)
        with open(os.path.join(out_dir, f"bookdash-{slug}.webp"), "wb") as f:
            f.write(webp)
        osize, wsize = len(raw), len(webp)
        reduce = 100 * (1 - wsize / osize) if osize else 0
        print(
            f"{slug:24} {osize/1024/1024:7.2f}MB {wsize/1024:7.1f}KB "
            f"{reduce:6.1f}% {f'{ow}x{oh}':>11} {f'{nw}x{nh}':>11}"
        )
    print(f"\nOUT: {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
