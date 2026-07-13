# -*- coding: utf-8 -*-
"""안건 #3 판정기 — v1↔v2 일치도(agree)가 정확도(acc_best)의 proxy가 되는가.

근거 문서: docs/intent/oracle-without-groundtruth.md (가설·반증 조건 3종)
척도: gate-v2(docs/recon/2026-07-10-harvest-gate-v2.md §3) B축 재현 검증 완료 —
  - 페이지 매핑: pages[].page_no = 본문 재넘버링 → 정본 page와 직접 매칭(offset 재적용 금지)
  - 정규화: HTML unescape + 스마트따옴표/대시/말줄임 통일 + 공백 압축, 대소문자 유지
    (39books 게이트와 동일 규약)
  - acc(B축) = (1 − 단어 Levenshtein(정본, 추출)/|정본 토큰|) × 100,
    정본 비어있지 않은 페이지 연결(concat) 시퀀스 기준. 공표치 재현: v2 7/7, v1 5/7
    (잔여 2권 = 객체순 무작위 책의 pypdf 버전 간 순서 변동 — 당시 v1 산출물 유실).
  - agree = (1 − lev(v1, v2)/평균 길이) × 100 (intent 문서 명시 분모 = 평균 길이).
스피어만: scipy 부재 → 동순위 평균랭크 + 피어슨 직접 구현, p는 Fisher-z 근사(보고 명시).

읽기 전용 — DB·네트워크 0. 입력 3종은 로컬 파일만.
사용: python scripts/pdf_harvest/oracle_check.py
출력: scripts/pdf_harvest/out_v1/_oracle_report.json + 콘솔 표
"""
from __future__ import annotations

import html
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CANON_DIR = ROOT / "scripts/tts_pilot/out"
V1_DIR = ROOT / "scripts/pdf_harvest/out_v1"
V2_DIR = ROOT / "scripts/pdf_harvest/out"
GATE_RECON = ROOT / "docs/recon/2026-07-10-harvest-gate-v2.md"
REPORT = V1_DIR / "_oracle_report.json"

# recon 축약 slug ↔ harvest 장형 slug (정본 파일은 축약형)
ALIAS = {
    "little-sock": "little-sock-and-the-tiny-creatures",
    "maddy-moona": "maddy-moonas-menagerie",
    "mrs-penguins-palace": "mrs-penguins-perfect-palace",
}

# 반증3 잠정 기준(문서 무수치 — 보고에 명시): agree IQR < 2.0점(0~100 스케일)
IQR_MIN = 2.0


def narration_slugs():
    """gate-v2 recon 권별 표에서 NARRATION 43권 slug 추출(축약형 그대로)."""
    rows = []
    for line in GATE_RECON.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\|\s*(AUTO|REVIEW|MANUAL)\s*\|\s*([a-z0-9-]+)\s*\|", line)
        if m:
            rows.append(m.group(2))
    return rows


def norm(s: str) -> str:
    s = html.unescape(s or "")
    s = s.replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-")
    s = s.replace("…", "...")
    return re.sub(r"\s+", " ", s).strip()


def toks(s: str) -> list[str]:
    return norm(s).split()


def lev(a: list[str], b: list[str]) -> int:
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[-1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def load_book(cslug: str):
    """3소스 로드. 하나라도 없으면 None 반환(호출부가 즉시 중단)."""
    hslug = ALIAS.get(cslug, cslug)
    cf = CANON_DIR / f"{cslug}.json"
    f1 = V1_DIR / f"{hslug}.pages.json"
    f2 = V2_DIR / f"{hslug}.pages.json"
    missing = [str(p.relative_to(ROOT)) for p in (cf, f1, f2) if not p.exists()]
    if missing:
        return None, missing
    canon = json.load(open(cf, encoding="utf-8"))
    v1 = json.load(open(f1, encoding="utf-8"))
    v2 = json.load(open(f2, encoding="utf-8"))
    p1 = {p["page_no"]: p["text"] for p in v1["pages"]}
    p2 = {p["page_no"]: p["text"] for p in v2["pages"]}
    c_seq, s1, s2 = [], [], []
    for e in sorted(canon, key=lambda e: e["page"]):
        if not (e.get("text") or "").strip():
            continue  # 정본 empty 면은 채점 제외(39books 규약)
        c_seq += toks(e["text"])
        s1 += toks(p1.get(e["page"], ""))
        s2 += toks(p2.get(e["page"], ""))
    return (c_seq, s1, s2), None


def acc(canon_seq, ext_seq) -> float:
    """gate-v2 B축: (1 − lev/|정본|) × 100, 0 하한."""
    if not canon_seq:
        return 100.0
    return max(0.0, (1 - lev(canon_seq, ext_seq) / len(canon_seq)) * 100)


def agree(s1, s2) -> float:
    """intent 문서: 1 − 편집거리/평균 길이 (× 100)."""
    if not s1 and not s2:
        return 100.0
    avg = (len(s1) + len(s2)) / 2
    return max(0.0, (1 - lev(s1, s2) / avg) * 100)


def ranks(xs):
    """동순위 평균 랭크."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            r[order[k]] = avg
        i = j + 1
    return r


def spearman(x, y):
    rx, ry = ranks(x), ranks(y)
    n = len(x)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = math.sqrt(sum((a - mx) ** 2 for a in rx))
    vy = math.sqrt(sum((b - my) ** 2 for b in ry))
    rho = cov / (vx * vy) if vx and vy else 0.0
    # p-value: Fisher-z 근사(scipy 부재). z = atanh(rho)·sqrt(n−3)
    if abs(rho) >= 1.0:
        p = 0.0
    else:
        z = math.atanh(rho) * math.sqrt(n - 3)
        p = 2 * (1 - 0.5 * (1 + math.erf(abs(z) / math.sqrt(2))))
    return rho, p


def quantile(xs, q):
    s = sorted(xs)
    pos = (len(s) - 1) * q
    lo, hi = int(math.floor(pos)), int(math.ceil(pos))
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    slugs = narration_slugs()
    if len(slugs) != 43:
        print(f"[중단] NARRATION 목록이 43이 아님: {len(slugs)}")
        sys.exit(1)
    rows = {}
    for s in slugs:
        loaded, missing = load_book(s)
        if missing:
            print(f"[중단] {s} 소스 누락: {missing}")
            sys.exit(1)
        c, s1, s2 = loaded
        a1, a2 = acc(c, s1), acc(c, s2)
        rows[s] = {
            "acc_v1": round(a1, 2),
            "acc_v2": round(a2, 2),
            "acc_best": round(max(a1, a2), 2),
            "agree": round(agree(s1, s2), 2),
        }

    ag = [r["agree"] for r in rows.values()]
    ab = [r["acc_best"] for r in rows.values()]
    rho, p = spearman(ag, ab)

    # 반증 판정
    c1_fail = rho < 0.5
    counterex = sorted(s for s, r in rows.items() if r["agree"] >= 95.0 and r["acc_best"] < 90.0)
    c2_fail = len(counterex) > 0
    n_mean = sum(ag) / len(ag)
    std = math.sqrt(sum((x - n_mean) ** 2 for x in ag) / (len(ag) - 1))
    iqr = quantile(ag, 0.75) - quantile(ag, 0.25)
    all_high = all(x >= 95.0 for x in ag)
    c3_fail = all_high or iqr < IQR_MIN

    verdict = "REJECT" if (c1_fail or c2_fail or c3_fail) else "PASS"

    # 콘솔 표
    print(f"{'slug':36s} {'acc_v1':>7s} {'acc_v2':>7s} {'best':>7s} {'agree':>7s}")
    for s in sorted(rows, key=lambda k: rows[k]["agree"]):
        r = rows[s]
        print(f"{s:36s} {r['acc_v1']:7.2f} {r['acc_v2']:7.2f} {r['acc_best']:7.2f} {r['agree']:7.2f}")
    print()
    print(f"n=43  spearman rho={rho:.4f}  p={p:.2e} (Fisher-z 근사)")
    print(f"agree 분포: min={min(ag):.2f} median={quantile(ag, 0.5):.2f} "
          f"max={max(ag):.2f} std={std:.2f} IQR={iqr:.2f}")
    print(f"반증1 (rho<0.5)                : {'실패(REJECT 사유)' if c1_fail else '통과'}")
    print(f"반증2 (agree>=95 & best<90)    : "
          f"{'실패 — ' + ', '.join(counterex) if c2_fail else '통과 (반례 0)'}")
    print(f"반증3 (변별력: 전권>=95 or IQR<{IQR_MIN}): {'실패' if c3_fail else '통과'}"
          f"  [전권>=95: {all_high}, IQR={iqr:.2f}]")
    print(f"VERDICT: {verdict}")

    REPORT.write_text(json.dumps({
        "hypothesis_doc": "docs/intent/oracle-without-groundtruth.md",
        "n": len(rows),
        "books": rows,
        "spearman": round(rho, 4),
        "p_value": p,
        "p_value_method": "Fisher-z approximation (scipy 부재)",
        "agree_stats": {"min": min(ag), "median": quantile(ag, 0.5), "max": max(ag),
                        "std": round(std, 3), "iqr": round(iqr, 3)},
        "counterexamples": counterex,
        "checks": {
            "c1_spearman_lt_0.5": {"fail": c1_fail, "rho": round(rho, 4)},
            "c2_high_agree_low_acc": {"fail": c2_fail, "slugs": counterex},
            "c3_no_discrimination": {"fail": c3_fail, "all_agree_ge_95": all_high,
                                     "iqr": round(iqr, 3), "iqr_min_provisional": IQR_MIN},
        },
        "verdict": verdict,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n리포트: {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
