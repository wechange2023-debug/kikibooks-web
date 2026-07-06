#!/usr/bin/env python3
"""
tts_recon_49.py — v1 html 남은 49권 글자수 집계 → 예상 비용 산정 (읽기 전용·비용 $0)

★ Polly 호출 0 · DB write 0 · Storage 접근 0. 순수 공개 HTTP 조회(GH Pages) + 계산.
★ 본문 추출은 파일럿 1단계 extract_text.py 로직을 그대로 재사용(동일 장면 분리 규칙).
★ 표지 낭독 문장은 gen_cover.py 형식 "{title}. Created by {author}." 을 각 권에 가산.
  문자 수 기준은 generate_tts.py 의 total_chars(=normalize_text 적용 평문 길이)와 정합.

입력 : 팀장이 업로드한 Q2 결과 CSV(Downloads). done=false 49행만 대상.
출력 : scratchpad/tts_recon_49.csv (권별 body/cover/total 문자 수 + 합계)
비용 : Amazon Polly Neural $16 / 1,000,000 문자
"""
from __future__ import annotations

import csv
import re
import sys
import time
from pathlib import Path

# 파일럿 스크립트 로직 재사용 (동일 폴더 아님 → 경로 추가)
PILOT_DIR = Path(__file__).resolve().parent.parent / "scripts" / "tts_pilot"
sys.path.insert(0, str(PILOT_DIR))
from extract_text import fetch_html, extract_scenes  # noqa: E402
from generate_tts import normalize_text              # noqa: E402

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

ROOT = Path(__file__).resolve().parent.parent
SRC_CSV = Path.home() / "Downloads" / "Supabase Snippet Untitled query (2).csv"
OUT_CSV = ROOT / "scratchpad" / "tts_recon_49.csv"

POLLY_RATE_USD_PER_M = 16.0  # Neural, $16 / 1,000,000 chars

_SLUG_RE = re.compile(r"/bookdash-books/([^/]+)/en/")


def slug_from_url(url: str) -> str:
    m = _SLUG_RE.search(url)
    return m.group(1) if m else ""


def body_char_count(slug: str) -> tuple[int, int]:
    """(본문 문자 수, 텍스트 있는 장면 수). generate_tts.total_chars 와 동일 계산."""
    html = fetch_html(slug)
    scenes = extract_scenes(slug, html)
    total = 0
    n_text = 0
    for s in scenes:
        t = normalize_text(s.get("text", ""))
        if t.strip():
            total += len(t)
            n_text += 1
    return total, n_text


def main() -> int:
    if not SRC_CSV.exists():
        print(f"[FAIL] 입력 CSV 없음: {SRC_CSV}")
        return 1

    with SRC_CSV.open(encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f)]

    targets = [r for r in rows if str(r.get("done", "")).strip().lower() == "false"]
    print(f"[STEP 1] 전체 {len(rows)}행 중 done=false 대상 = {len(targets)}권")

    out_rows: list[dict] = []
    grand_total = 0
    for i, r in enumerate(targets, 1):
        title = r["title"]
        author = r["author"]
        url = r["content_url"]
        slug = slug_from_url(url)
        cover_sentence = normalize_text(f"{title}. Created by {author}.")
        cover_chars = len(cover_sentence)
        try:
            body_chars, n_text = body_char_count(slug)
        except Exception as exc:  # noqa: BLE001
            print(f"  [{i:>2}/{len(targets)}] {slug:38} FETCH FAIL — {type(exc).__name__}: {exc}")
            body_chars, n_text = -1, -1
        total = (body_chars + cover_chars) if body_chars >= 0 else -1
        if total >= 0:
            grand_total += total
        out_rows.append({
            "id": r["id"], "source_id": r["source_id"], "slug": slug,
            "title": title, "author": author, "content_url": url,
            "text_scenes": n_text, "body_chars": body_chars,
            "cover_chars": cover_chars, "total_chars": total,
        })
        print(f"  [{i:>2}/{len(targets)}] {slug:38} scenes={n_text:>2} "
              f"body={body_chars:>5} cover={cover_chars:>3} total={total:>5}")
        time.sleep(0.15)  # GH Pages 예의상 소량 지연

    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)

    ok = [r for r in out_rows if r["total_chars"] >= 0]
    n = len(ok)
    avg = grand_total / n if n else 0
    cost = grand_total / 1_000_000 * POLLY_RATE_USD_PER_M
    print("=" * 64)
    print(f"[STEP 1] 대상 권수 = {len(targets)}  → {OUT_CSV}")
    print(f"[STEP 2] 집계 성공 {n}/{len(targets)}권 (실패 {len(targets)-n}권)")
    print(f"[STEP 3] 총 문자 수      = {grand_total:,}")
    print(f"[STEP 3] 권당 평균 문자수 = {avg:,.0f}")
    print(f"[STEP 3] 예상 청구액     = ${cost:,.4f}  (Neural $16/1M, 무료티어 잔여 시 실제 $0 가능)")
    return 0 if n == len(targets) else 2


if __name__ == "__main__":
    sys.exit(main())
