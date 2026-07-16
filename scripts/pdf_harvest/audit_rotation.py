# -*- coding: utf-8 -*-
"""ADR-0049 보조 — 본문 페이지 회전 실측 (읽기 전용).

목적: 페이지 이미지 렌더 전에 회전(90/180/270°)·회전 텍스트를 가진 페이지를 census.
      회전 페이지는 렌더 시 방향 보정 필요 여부 판단 근거가 된다.

측정(본문 페이지 = page_no + mapping_offset, PyMuPDF 0-based 인덱스 = page_no + offset - 1):
  (1) page.rotation — PDF /Rotate 속성값 (0/90/180/270)
  (2) 텍스트 방향 — get_text("dict")의 **line "dir"** 값.
      ※ PyMuPDF는 방향(dir)을 line 레벨로 노출한다(span에는 dir 키 없음). span은 소속
        line의 방향을 상속하므로, 페이지 내 모든 텍스트 line의 dir을 수집해 판정한다.
      dir=(1,0)이 정상 가로. 그 외((-1,0)=180°, (0,±1)=90/270°)는 회전으로 간주.

판정: 페이지 내 텍스트 line 중 dir≠(1,0)이 1개 이상이면 ROTATED.

사용:
  python scripts/pdf_harvest/audit_rotation.py \
    --slugs scripts/pdf_harvest/population_154.txt \
    --cache scripts/pdf_harvest/_pdf_cache \
    --pages-json-dir scripts/pdf_harvest/out_154 \
    --out scratchpad/rotation_audit_154.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path

import fitz  # PyMuPDF

NORMAL_DIR = (1, 0)


def round_dir(d) -> tuple[int, int]:
    """dir 튜플을 정수로 반올림 (부동소수 오차 흡수). 예 (1.0,0.0)→(1,0)."""
    return (round(d[0]), round(d[1]))


def page_dirs(page) -> list[tuple[int, int]]:
    """페이지 내 모든 텍스트 line의 dir 목록."""
    dirs = []
    d = page.get_text("dict")
    for block in d.get("blocks", []):
        if block.get("type", 0) != 0:  # 0 = 텍스트 블록
            continue
        for line in block.get("lines", []):
            if "dir" in line:
                dirs.append(round_dir(line["dir"]))
    return dirs


def main() -> None:
    ap = argparse.ArgumentParser(description="본문 페이지 회전 실측 (ADR-0049 보조)")
    ap.add_argument("--slugs", required=True)
    ap.add_argument("--cache", required=True, help="PDF 캐시({slug}.pdf)")
    ap.add_argument("--pages-json-dir", required=True, help="{slug}.pages.json(offset·page_no)")
    ap.add_argument("--out", default=None, help="CSV 출력 경로")
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    cache = Path(a.cache)
    pjson = Path(a.pages_json_dir)
    slugs = [s.strip() for s in Path(a.slugs).read_text(encoding="utf-8").splitlines() if s.strip()]

    rows = []                 # (slug, page_no, page_rotation, span_dirs, is_rotated)
    total_pages = 0
    rotated_pages = 0
    rotation_dist = Counter()  # page.rotation 값별
    dir_dist = Counter()       # line dir 값별 (전 페이지 누적)
    rotated_slugs = set()
    missing_cache = []
    missing_json = []

    for slug in slugs:
        pdf_f = cache / f"{slug}.pdf"
        meta_f = pjson / f"{slug}.pages.json"
        if not pdf_f.exists():
            missing_cache.append(slug)
            continue
        if not meta_f.exists():
            missing_json.append(slug)
            continue
        meta = json.loads(meta_f.read_text(encoding="utf-8"))
        offset = meta["mapping_offset"]
        page_nos = [p["page_no"] for p in meta["pages"]]
        doc = fitz.open(str(pdf_f))
        try:
            for pn in page_nos:
                idx = pn + offset - 1
                if idx >= doc.page_count:
                    # 본문 매핑이 총장수를 초과 — 이상. 기록만 하고 스킵(렌더러 가드가 별도 처리).
                    continue
                page = doc.load_page(idx)
                rot = page.rotation
                dirs = page_dirs(page)
                for dd in dirs:
                    dir_dist[dd] += 1
                is_rot = any(dd != NORMAL_DIR for dd in dirs)
                total_pages += 1
                rotation_dist[rot] += 1
                if is_rot:
                    rotated_pages += 1
                    rotated_slugs.add(slug)
                span_dirs_str = ";".join(f"{x[0]},{x[1]}" for x in sorted(set(dirs)))
                rows.append((slug, pn, rot, span_dirs_str, int(is_rot)))
        finally:
            doc.close()

    # CSV
    if a.out:
        out_p = Path(a.out)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with out_p.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["slug", "page_no", "page_rotation", "span_dirs", "is_rotated"])
            w.writerows(rows)

    # stdout 요약
    print("=" * 72)
    print(f"[회전 실측] 대상 slug {len(slugs)} · 캐시 미스 {len(missing_cache)} · JSON 미스 {len(missing_json)}")
    print(f"전체 본문 페이지 수: {total_pages}")
    ratio = (rotated_pages / total_pages * 100) if total_pages else 0.0
    print(f"ROTATED 페이지 수: {rotated_pages} ({ratio:.1f}%)")
    print(f"page.rotation 값별 분포: {dict(sorted(rotation_dist.items()))}")
    print(f"line dir 값별 분포: {dict(sorted(dir_dist.items(), key=lambda kv: (-kv[1])))}")
    print(f"ROTATED 페이지 보유 slug 수: {len(rotated_slugs)}")
    print(f"  목록(상위 20): {sorted(rotated_slugs)[:20]}")
    if missing_cache:
        print(f"[주의] 캐시 미스 {len(missing_cache)}권: {missing_cache[:20]}")
    if missing_json:
        print(f"[주의] pages.json 미스 {len(missing_json)}권: {missing_json[:20]}")
    if a.out:
        print(f"CSV: {a.out} ({len(rows)}행)")


if __name__ == "__main__":
    main()
