# -*- coding: utf-8 -*-
"""ADR-0044 원료 재추출 — 캐시 PDF에서 단어별 좌표·폰트크기 확보 (네트워크 0).

pages.json(v1·v2)에는 좌표가 없다(추출 시 계산되나 저장 단계에서 버려짐 —
harvest.py:148). 순서교정(블록 정렬)·SPLIT 병합·IMG_TEXT 판별의 원료로
pdfplumber extract_words 결과를 그대로 저장한다. **정렬·병합은 하지 않는다.**

입력: population_154.txt + PDF 캐시({slug}.pdf) + out_154/{slug}.pages.json(offset)
출력: out_coords_154/{slug}.words.json
  { slug, mapping_offset, extraction: "pdfplumber-words-raw",
    pages: [{page_no, words: [{text,x0,x1,top,bottom,size}]}] }
page_no = 본문 재넘버링(pages.json과 동일 규약, PDF p = page_no + offset).

네트워크 접근 코드 없음 — 캐시 미스는 즉시 중단(강제 다운로드 금지).
사용: python scripts/pdf_harvest/reextract_coords.py --cache <PDF캐시 dir>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pdfplumber

PH = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="PDF 캐시 디렉터리({slug}.pdf)")
    ap.add_argument("--slugs", default=str(PH / "population_154.txt"))
    ap.add_argument("--out", default=str(PH / "out_coords_154"))
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    cache = Path(a.cache)
    out_dir = Path(a.out)
    out_dir.mkdir(exist_ok=True)
    slugs = [s.strip() for s in Path(a.slugs).read_text(encoding="utf-8").splitlines() if s.strip()]

    word_totals = []
    for idx, slug in enumerate(slugs, 1):
        out_f = out_dir / f"{slug}.words.json"
        if out_f.exists():
            continue
        pdf_f = cache / f"{slug}.pdf"
        if not pdf_f.exists():
            print(f"[중단] 캐시 미스: {pdf_f} — 다운로드 금지, 팀장/오케스트레이터 보고")
            sys.exit(1)
        meta = json.loads((PH / "out_154" / f"{slug}.pages.json").read_text(encoding="utf-8"))
        off = meta["mapping_offset"]
        pages_out = []
        with pdfplumber.open(str(pdf_f)) as pdf:
            for i in range(off, len(pdf.pages)):
                words = pdf.pages[i].extract_words(extra_attrs=["size"], keep_blank_chars=False)
                pages_out.append({
                    "page_no": i - off + 1,
                    "words": [{"text": w["text"],
                               "x0": round(w["x0"], 2), "x1": round(w["x1"], 2),
                               "top": round(w["top"], 2), "bottom": round(w["bottom"], 2),
                               "size": round(w.get("size", 0.0), 2)} for w in words],
                })
        doc = {"slug": slug, "mapping_offset": off,
               "extraction": "pdfplumber-words-raw", "pages": pages_out}
        out_f.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
        n = sum(len(p["words"]) for p in pages_out)
        word_totals.append(n)
        print(f"[{idx}/{len(slugs)}] {slug} OK — 본문 {len(pages_out)}면 {n}단어")

    done = sum(1 for s in slugs if (out_dir / f"{s}.words.json").exists())
    print(f"\n완료: {done}/{len(slugs)}")
    if word_totals:
        print(f"이번 실행 권당 평균 단어수: {sum(word_totals)/len(word_totals):.1f}")


if __name__ == "__main__":
    main()
