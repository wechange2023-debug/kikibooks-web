# -*- coding: utf-8 -*-
"""Prong-2 사람검수 뷰어 빌더 (ADR-0043 §4) — 정적 HTML, 서버·네트워크 불필요.

입력: sample_prong2.txt(slug\t태그) + out_v1_154/(v1 정본 후보) + out_154/(v2 참고)
      + PDF 캐시({slug}.pdf) + out_154/_154_scatter_report.json(agree 조인)
출력: review_viewer/review.html + review_viewer/img/{slug}/pNN.png
  (렌더 산출물은 커밋하지 않음 — 빌더로 재생성 가능. .gitignore 무시 대상)

면 대응: pages.json의 page_no = 본문 재넘버링(서비스 면). PDF 페이지 = page_no + offset.
좌=PDF 렌더(원본 조판 = 사람 눈 오라클), 우=v1 텍스트, 접이식 v2 참고.
체크박스는 순수 표시용(저장 없음) — 문제 면은 slug+면번호를 메모로 수집.

사용: python scripts/pdf_harvest/review_viewer/build_review.py --cache <PDF캐시 dir>
"""
from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path

import fitz  # pymupdf

HERE = Path(__file__).resolve().parent
PH = HERE.parent
ZOOM = 1.4  # 렌더 배율(가독 확보·용량 절충)


def esc(s: str) -> str:
    return html.escape(s or "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="PDF 캐시 디렉터리({slug}.pdf)")
    ap.add_argument("--sample", default=str(PH / "sample_prong2.txt"))
    ap.add_argument("--out", default=str(HERE / "review.html"))
    ap.add_argument("--mode", choices=["v1", "fixed"], default="v1",
                    help="fixed = 우측에 교정후 텍스트(BODY/SFX, DECOR 회색) 표시")
    ap.add_argument("--fixed-dir", default=str(PH / "out_fixed_154"))
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    cache = Path(a.cache)
    rep = json.loads((PH / "out_154/_154_scatter_report.json").read_text(encoding="utf-8"))
    rows = []
    for line in Path(a.sample).read_text(encoding="utf-8").splitlines():
        if line.strip():
            slug, tag = line.split("\t")
            rows.append((slug.strip(), tag.strip()))

    img_root = HERE / "img"
    img_root.mkdir(exist_ok=True)
    sections, toc, total_pages = [], [], 0

    for slug, tag in rows:
        v1 = json.loads((PH / f"out_v1_154/{slug}.pages.json").read_text(encoding="utf-8"))
        v2 = json.loads((PH / f"out_154/{slug}.pages.json").read_text(encoding="utf-8"))
        fixed = None
        if a.mode == "fixed":
            fixed = json.loads(
                (Path(a.fixed_dir) / f"{slug}.fixed.json").read_text(encoding="utf-8"))
            fx = {p["page_no"]: p for p in fixed["pages"]}
        pdf_f = cache / f"{slug}.pdf"
        if not pdf_f.exists():
            print(f"[중단] PDF 캐시 없음: {pdf_f}")
            sys.exit(1)
        off = v1["mapping_offset"]
        p1 = {p["page_no"]: p["text"] for p in v1["pages"]}
        p2 = {p["page_no"]: p["text"] for p in v2["pages"]}
        agree = rep["books"].get(slug, {}).get("agree")

        d = img_root / slug
        d.mkdir(exist_ok=True)
        doc = fitz.open(str(pdf_f))
        page_html = []
        for pn in sorted(p1):
            pdf_idx = pn + off - 1  # 0-based
            if 0 <= pdf_idx < len(doc):
                png = d / f"p{pn:02d}.png"
                if not png.exists():  # 재실행 시 재렌더 생략
                    doc[pdf_idx].get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM)).save(str(png))
                img_tag = f'<img src="img/{slug}/p{pn:02d}.png" alt="{slug} p{pn}">'
            else:
                img_tag = '<div class="noimg">PDF 페이지 범위 밖</div>'
            total_pages += 1
            if a.mode == "fixed":
                fp = fx.get(pn, {"blocks": [], "decor_excluded": []})
                parts = []
                for b in fp["blocks"]:
                    if b["role"] == "DECOR":
                        parts.append(f'<div class="decor">제외(DECOR): {esc(b["text"])}</div>')
                    elif b["role"] == "SFX":
                        parts.append(f'<div class="sfxb"><span class="badge">SFX</span> '
                                     f'{esc(b["text"])}</div>')
                    else:
                        parts.append(f'<div class="bodyb">{esc(b["text"])}</div>')
                right = (f'<div class="v1">{"".join(parts) or "(빈 면)"}</div>'
                         f'<details><summary>v1 참고(교정 전)</summary>'
                         f'<div class="v2">{esc(p1.get(pn, ""))}</div></details>')
            else:
                right = (f'<div class="v1">{esc(p1.get(pn, ""))}</div>'
                         f'<details><summary>v2 참고</summary>'
                         f'<div class="v2">{esc(p2.get(pn, ""))}</div></details>')
            page_html.append(f"""
<div class="page">
 <div class="phead"><b>p{pn:02d}</b>
  <label><input type="checkbox"> OK</label>
  <label class="bad"><input type="checkbox"> 문제</label></div>
 <div class="cols">
  <div class="col">{img_tag}</div>
  <div class="col txt">{right}</div>
 </div>
</div>""")
        doc.close()
        aid = f"b-{slug}"
        toc.append(f'<li><a href="#{aid}">[{tag}] {esc(slug)}</a> <small>agree={agree}</small></li>')
        sections.append(f"""
<section id="{aid}">
 <h2>[{tag}] {esc(slug)} <small>agree={agree} · offset={off} · 본문 {len(p1)}면</small>
  <a class="top" href="#toc">▲목차</a></h2>
 {''.join(page_html)}
</section>""")
        print(f"{tag:6s} {slug}: {len(p1)}면 렌더 OK")

    html_doc = f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<title>Prong-2 사람검수 — v1 정본 후보 vs PDF 원본 (25권)</title>
<style>
 body{{font-family:'Malgun Gothic',sans-serif;margin:0 auto;max-width:1200px;padding:1em;background:#fafafa}}
 h2{{border-top:4px solid #333;padding-top:.5em;margin-top:2em}}
 .page{{border:1px solid #ccc;border-radius:6px;margin:.8em 0;background:#fff}}
 .phead{{padding:.4em .8em;background:#eee;display:flex;gap:1.5em;align-items:center}}
 .phead .bad{{color:#b00}}
 .cols{{display:flex;gap:.5em;padding:.5em}}
 .col{{flex:1;min-width:0}}
 .col img{{width:100%;height:auto;border:1px solid #ddd}}
 .txt .v1{{font-size:1.05em;line-height:1.5;padding:.5em;background:#f5fbf5;border:1px solid #cde5cd;border-radius:4px;white-space:pre-wrap}}
 .txt details{{margin-top:.5em;color:#666}}
 .txt .v2{{padding:.5em;background:#f7f7fb;border:1px dashed #ccd;border-radius:4px;white-space:pre-wrap}}
 .bodyb{{margin:.15em 0}}
 .sfxb{{margin:.15em 0;color:#7a5}}
 .badge{{font-size:.7em;background:#7a5;color:#fff;border-radius:3px;padding:0 .3em}}
 .decor{{margin:.15em 0;color:#999;text-decoration:line-through;font-size:.9em}}
 .noimg{{padding:2em;text-align:center;color:#999;border:1px dashed #ccc}}
 .top{{float:right;font-size:.6em}}
 #toc li{{margin:.2em 0}}
 .guide{{background:#fff8e1;border:1px solid #e6d590;padding:.8em;border-radius:6px}}
</style></head><body>
<h1>{'교정 후 재검수 — 순서교정본 vs PDF 원본' if a.mode == 'fixed'
     else 'Prong-2 사람검수 — v1 정본 후보 vs PDF 원본'}</h1>
<div class="guide">{'좌(PDF 원본 면)와 우(<b>순서교정 후 텍스트</b>)를 대조하세요. '
 '초록 배지 SFX = 효과음(보존), 회색 취소선 = DECOR 제외분(장식/간판 — 잘못 제외됐으면 '
 '해당 slug+면번호 메모). 순서·누락·깨짐이 보이면 <b>[문제]</b> 체크 후 '
 '<b>slug + 면번호를 메모</b>해 주세요(체크는 저장되지 않습니다).'
 if a.mode == 'fixed' else
 '좌(PDF 원본 면)와 우(초록 상자 = <b>v1 정본 후보</b>)를 대조하세요. '
 '단어 누락·뒤섞임·깨짐이 보이면 <b>[문제]</b> 체크 후 <b>slug + 면번호를 메모</b>해 '
 '주세요(체크는 저장되지 않습니다). 회색 접이식 v2는 참고용입니다.'}</div>
<h2 id="toc">목차 ({len(rows)}권)</h2>
<ul>{''.join(toc)}</ul>
{''.join(sections)}
</body></html>"""
    Path(a.out).write_text(html_doc, encoding="utf-8")
    print(f"\n완료: {len(rows)}권 · 총 {total_pages}면 → {a.out}")


if __name__ == "__main__":
    main()
