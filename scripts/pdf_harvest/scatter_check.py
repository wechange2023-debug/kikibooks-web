# -*- coding: utf-8 -*-
"""ADR-0043 Prong-1 기계검증 — v1·v2 산포(글자깨짐) 지표 비교, 154권 전권.

가설(사전등록): v2(좌표 재조립)의 산포조판 실패가 낮은 agree의 주원인이고 v1은 건전.
권별 지표(v1·v2 각각):
  - single_char_ratio = 길이1 알파 토큰 수(단 a/I/A/O 제외) / 전체 알파 토큰 수  ← 주 판별자
  - mean_alpha_token_len = 알파 토큰 평균 길이
  - fragment_hits = r'\\b[A-Za-z]\\s[A-Za-z]\\s[A-Za-z]\\b' 페이지별 매치 합
판정(주 판별자 절대차 기준, TIE_EPS=0.02):
  v2 ratio − v1 ratio >  +TIE_EPS → v2_worse
  v1 ratio − v2 ratio >  +TIE_EPS → v1_worse
  그 외 → tie
함께깨짐 후보: v1·v2 둘 다 single_char_ratio ≥ BOTH_HIGH(0.10).

읽기 전용 — 네트워크·DB 0. 입력: out_154/(v2)·out_v1_154/(v1)·_154_summary.json.
사용: python scripts/pdf_harvest/scatter_check.py
출력: scripts/pdf_harvest/out_154/_154_scatter_report.json + 콘솔 집계
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

PH = Path(__file__).resolve().parent
V1_DIR = PH / "out_v1_154"
V2_DIR = PH / "out_154"
QUEUE = V2_DIR / "_review_queue.json"
POP = PH / "population_154.txt"
REPORT = V2_DIR / "_154_scatter_report.json"

TIE_EPS = 0.02      # 주 판별자 절대차가 이 미만이면 tie
BOTH_HIGH = 0.10    # 함께깨짐 후보: 양쪽 모두 single_char_ratio ≥ 이 값
OK_SINGLES = {"a", "I", "A", "O"}  # 정상 1글자 단어(관사·대명사·감탄)
FRAG_RE = re.compile(r"\b[A-Za-z]\s[A-Za-z]\s[A-Za-z]\b")


def metrics(pages: list[dict]) -> dict:
    alpha_tokens, frag = [], 0
    for p in pages:
        text = p.get("text") or ""
        alpha_tokens += [t for t in text.split() if any(c.isalpha() for c in t)]
        frag += len(FRAG_RE.findall(text))
    singles = [t for t in alpha_tokens if len(t) == 1 and t not in OK_SINGLES]
    n = len(alpha_tokens)
    return {
        "single_char_ratio": round(len(singles) / n, 4) if n else 0.0,
        "mean_alpha_token_len": round(sum(len(t) for t in alpha_tokens) / n, 2) if n else 0.0,
        "fragment_hits": frag,
        "alpha_tokens": n,
    }


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    slugs = [s.strip() for s in POP.read_text(encoding="utf-8").splitlines() if s.strip()]
    if len(slugs) != 154:
        print(f"[중단] 모집단 {len(slugs)} != 154")
        sys.exit(1)
    queue = json.loads(QUEUE.read_text(encoding="utf-8"))
    review_set = {b["slug"] for b in queue["books"]}
    # agree는 전권 직접 계산(큐에는 REVIEW 39권만 있음) — oracle_check 로직 재사용
    spec = importlib.util.spec_from_file_location("oracle_check", PH / "oracle_check.py")
    oc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(oc)

    books, missing = {}, []
    for s in slugs:
        f1, f2 = V1_DIR / f"{s}.pages.json", V2_DIR / f"{s}.pages.json"
        if not f1.exists() or not f2.exists():
            missing.append(s)
            continue
        pages1 = json.loads(f1.read_text(encoding="utf-8"))["pages"]
        pages2 = json.loads(f2.read_text(encoding="utf-8"))["pages"]
        m1, m2 = metrics(pages1), metrics(pages2)
        s1 = [t for p in sorted(pages1, key=lambda p: p["page_no"]) for t in oc.toks(p["text"])]
        s2 = [t for p in sorted(pages2, key=lambda p: p["page_no"]) for t in oc.toks(p["text"])]
        agree_val = round(oc.agree(s1, s2), 2)
        d = m2["single_char_ratio"] - m1["single_char_ratio"]
        verdict = "v2_worse" if d > TIE_EPS else ("v1_worse" if d < -TIE_EPS else "tie")
        books[s] = {
            "v1": m1, "v2": m2, "verdict": verdict,
            "both_high_scatter": (m1["single_char_ratio"] >= BOTH_HIGH
                                  and m2["single_char_ratio"] >= BOTH_HIGH),
            "label": "REVIEW" if s in review_set else "AUTO",
            "agree": agree_val,
        }
    if missing:
        print(f"[중단] 산출물 누락 {len(missing)}권: {missing[:10]}")
        sys.exit(1)

    total = {k: sum(1 for b in books.values() if b["verdict"] == k)
             for k in ("v2_worse", "v1_worse", "tie")}
    in_review = {k: sum(1 for b in books.values()
                        if b["label"] == "REVIEW" and b["verdict"] == k)
                 for k in ("v2_worse", "v1_worse", "tie")}
    v1_worse_slugs = sorted(s for s, b in books.items() if b["verdict"] == "v1_worse")
    both_high = sorted(s for s, b in books.items() if b["both_high_scatter"])
    human_set = sorted(set(v1_worse_slugs) | set(both_high))

    # 반증선(ADR-0043 §4 사전등록): v1_worse 전체 >15 또는 REVIEW 내 >10 → STOP
    falsified = total["v1_worse"] > 15 or in_review["v1_worse"] > 10
    verdict = "STOP(반증 — v1 정본 전제 재검토)" if falsified else "PASS(예측 부합)"

    print("=== Prong-1 판정 집계 (154권) ===")
    print(f"v2_worse {total['v2_worse']} / v1_worse {total['v1_worse']} / tie {total['tie']}")
    print(f"REVIEW 39 내: v2_worse {in_review['v2_worse']} / "
          f"v1_worse {in_review['v1_worse']} / tie {in_review['tie']}")
    print(f"v1_worse 목록: {v1_worse_slugs}")
    print(f"함께깨짐 후보(양쪽 ratio>={BOTH_HIGH}): {both_high}")
    print(f"반증선: 전체 v1_worse>15 → {total['v1_worse'] > 15} / "
          f"REVIEW 내 >10 → {in_review['v1_worse'] > 10}")
    print(f"판정: {verdict}")
    print(f"사람검수 잔여세트(Prong-2) {len(human_set)}권: {human_set}")

    REPORT.write_text(json.dumps({
        "adr": "0043 Prong-1",
        "constants": {"tie_eps": TIE_EPS, "both_high": BOTH_HIGH,
                      "ok_singles": sorted(OK_SINGLES)},
        "totals": total,
        "review39": in_review,
        "v1_worse_slugs": v1_worse_slugs,
        "both_high_scatter_slugs": both_high,
        "human_review_set": human_set,
        "falsification": {"total_gt_15": total["v1_worse"] > 15,
                          "review_gt_10": in_review["v1_worse"] > 10,
                          "verdict": verdict},
        "books": books,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n리포트: {REPORT.relative_to(PH.parent.parent)}")


if __name__ == "__main__":
    main()
