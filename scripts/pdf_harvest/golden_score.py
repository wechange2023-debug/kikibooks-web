# -*- coding: utf-8 -*-
"""ADR-0044 golden 자동채점기 — order_fix 교정출력 vs golden/order_golden.json.

면 단위 pass/fail/NEEDS_HUMAN:
  - expected 문장 명기 면(its-my-book p08·dudus-hat p09): 핵심구 순서 일치
    (정규화 = 소문자·스마트따옴표 통일·공백/구두점 제거 — 스타일 연쇄 'It’sMY'가
    공백 비보존이므로 공백 무시 비교)
  - ORDER hint 면: 블록 배열 방향 자동판정(좌→우 열순 / 상→하 / 우측열 상→하 /
    질문→답). 자동판정 불가('읽기순 재정렬' 일반 힌트)는 NEEDS_HUMAN.
  - SPLIT 면: 병합 토큰('You'/'Your'/'WHEEEEE')이 단일 토큰으로 존재.
  - IMG_TEXT 면: 대상 토큰('school'/'TINO'/'KUMA')이 DECOR 제외 목록에 있고 본문에 없음.
  - SFX 면: 효과음 토큰 보존(제외 안 됨). 배치 방향은 블록순 확인 가능 시 병기.

합격선(ADR-0044 §4 사전등록, 사후조정 금지): ORDER ≥90% / SPLIT ≥95%
(NEEDS_HUMAN은 분모 제외·건수 보고).
사용: python scripts/pdf_harvest/golden_score.py
출력: out_fixed_14/_golden_score.json + 콘솔
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PH = Path(__file__).resolve().parent
GOLDEN = PH / "golden/order_golden.json"
_ap = argparse.ArgumentParser()
_ap.add_argument("--fixed-dir", default=str(PH / "out_fixed_14"),
                 help="교정 산출물 디렉터리(전권 적용판 회귀 채점 시 out_fixed_154)")
_args = _ap.parse_args()
FIXED = Path(_args.fixed_dir)
REPORT = FIXED / "_golden_score.json"

SFX_RE = re.compile(r"([A-Za-z])\1{2,}|([A-Za-z]{2,4})\2")  # order_fix와 동일 정의

SPLIT_TOKENS = {("hello", n): ("you", "your") for n in list(range(2, 13)) + [14]}
SPLIT_TOKENS[("the-box", 11)] = ("wheeeee",)
IMG_TOKENS = {("how-to-tame-a-monster", 5): ["school"]}
for n in (5, 7, 8):
    IMG_TOKENS[("yapo-saves-the-day", n)] = ["tino", "kuma"]
KEYPHRASES = {
    ("its-my-book", 8): ["dragons cant read", "its my booooook"],
    ("dudus-hat", 9): ["puts it in her hand", "point your other hand",
                       "breath and throws", "her hat swoops up", "disappears"],
}


def nsp(s):
    s = (s or "").lower().replace("’", "'").replace("‘", "'")
    return re.sub(r"[^a-z0-9]", "", s)


def tokens_of(text):
    return [re.sub(r"[^a-z0-9']", "", t.lower()) for t in (text or "").split()]


def col_groups(blocks):
    """x구간 겹침 전이폐포로 열 그룹핑 → [(min_x0, [출력순 인덱스…])]."""
    groups = []
    for i, b in enumerate(blocks):
        placed = None
        for g in groups:
            if any(min(blocks[j]["bbox"][2], b["bbox"][2]) -
                   max(blocks[j]["bbox"][0], b["bbox"][0]) > 0 for j in g):
                g.append(i)
                placed = g
                break
        else:
            groups.append([i])
        if placed:  # 전이 병합
            merged = True
            while merged:
                merged = False
                for g2 in groups:
                    if g2 is placed:
                        continue
                    if any(min(blocks[j]["bbox"][2], blocks[k]["bbox"][2]) -
                           max(blocks[j]["bbox"][0], blocks[k]["bbox"][0]) > 0
                           for j in placed for k in g2):
                        placed.extend(g2)
                        groups.remove(g2)
                        merged = True
                        break
    return sorted(([min(blocks[j]["bbox"][0] for j in g), sorted(g)] for g in groups),
                  key=lambda x: x[0])


def judge_order(hint, page):
    blocks = [b for b in page["blocks"] if b["role"] != "DECOR" and nsp(b["text"])]
    if len(blocks) <= 1:
        return "pass", "블록 1개(줄 top순 내장) — 방향 위반 불가"
    if "질문" in hint:
        qi = next((i for i, b in enumerate(blocks) if "?" in b["text"]), None)
        ai = next((i for i, b in enumerate(blocks) if "?" not in b["text"]), None)
        if qi is None or ai is None:
            return "NEEDS_HUMAN", "질문/답 블록 식별 실패"
        return ("pass" if qi < ai else "fail"), f"질문블록 idx {qi}, 답블록 idx {ai}"
    if "우측 블록" in hint:
        mid = max(b["bbox"][2] for b in blocks) / 2
        right = [i for i, b in enumerate(blocks)
                 if (b["bbox"][0] + b["bbox"][2]) / 2 > mid]
        tops = [blocks[i]["bbox"][1] for i in right]
        ok = all(a <= b + 1 for a, b in zip(tops, tops[1:]))
        return ("pass" if ok else "fail"), f"우측열 top 순열 {[round(t) for t in tops]}"
    if "좌" in hint or "열간" in hint:
        groups = col_groups(blocks)
        if len(groups) < 2:
            return "NEEDS_HUMAN", "열 1개로 판정됨 — 좌우 방향 자동판정 불가"
        order_ok = all(max(g[1]) < min(h[1]) for g, h in zip(groups, groups[1:]))
        return ("pass" if order_ok else "fail"), \
            f"열 {len(groups)}개, 좌열부터 출력순 연속 배치 = {order_ok}"
    if "상" in hint or "위" in hint:
        tops = [b["bbox"][1] for b in blocks]
        if max(tops) - min(tops) < 15:  # 동일 상단 밴드 — 힌트(상하)와 기하 불일치
            return "NEEDS_HUMAN", \
                f"블록 top 동일 밴드({[round(t) for t in tops]}) — 상하 힌트와 기하 불일치, 사람 확인"
        ok = all(a <= b + 1 for a, b in zip(tops, tops[1:]))
        return ("pass" if ok else "fail"), f"블록 top 순열 {[round(t) for t in tops]}"
    return "NEEDS_HUMAN", "일반 힌트('읽기순 재정렬') — 자동판정 기준 없음"


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    fixed = {}
    results = []
    for c in golden["cases"]:
        slug, pn, dt = c["slug"], c["page_no"], c["defect_type"]
        if slug not in fixed:
            fixed[slug] = json.loads((FIXED / f"{slug}.fixed.json").read_text(encoding="utf-8"))
        pages = fixed[slug]["pages"] if pn is None else \
            [p for p in fixed[slug]["pages"] if p["page_no"] == pn]
        page = pages[0] if pn is not None else None

        if dt == "SPLIT":
            targets = SPLIT_TOKENS[(slug, pn)]
            toks = tokens_of(page["text"])
            hit = any(t in toks for t in targets)
            unsplit = re.search(r"\b[A-Z]\s+[a-zA-Z]{2,}", page["text"]) and \
                any(t not in toks for t in targets)
            verdict = "pass" if hit else "fail"
            detail = f"병합 토큰 {targets} → 존재 {hit}" + \
                     (" (미병합 흔적 잔존)" if unsplit and not hit else "")
        elif dt == "IMG_TEXT":
            # 장식형은 대문자 표기('TINO'/'SCHOOL') — 본문 실단어('Tino')와 대소문자로 구분.
            # 원료에 토큰 자체가 없으면(래스터 간판) 제외할 것이 없음 → 통과.
            targets = [t.upper() for t in IMG_TOKENS[(slug, pn)]]
            body_upper = [re.sub(r"[^A-Za-z0-9']", "", t) for t in page["text"].split()]
            excl = " ".join(page["decor_excluded"])
            miss = [t for t in targets if t in body_upper]
            verdict = "pass" if not miss else "fail"
            detail = f"대문자형 본문 잔존 {miss or '없음'} / DECOR 제외 " \
                     f"{[t for t in targets if t in excl] or '없음(원료 부재=래스터)'}"
        elif dt == "SFX":
            # 보존 판정 = 효과음성 토큰이 DECOR로 오제외되지 않았는가 (제거 아님 정책).
            # 전권(page_no null) 케이스는 golden 문구("여기선 제거 아님")대로
            # 해당 책의 DECOR 제외 0건을 요구(가장 엄격한 해석).
            if pn is None:
                bad = [(p["page_no"], e) for p in pages for e in p["decor_excluded"]]
            else:
                bad = [e for e in page["decor_excluded"]
                       if SFX_RE.search(e) or e.rstrip()[-1:] in "!?"]
            verdict = "pass" if not bad else "fail"
            detail = f"오제외 {bad or '없음'} — 배치·조립 품질은 정책상 팀장 재검토" + \
                     (" [전권 flag]" if pn is None else "")
        elif (slug, pn) in KEYPHRASES:
            text = nsp(page["text"])
            pos, ok = -1, True
            for ph in KEYPHRASES[(slug, pn)]:
                i = text.find(nsp(ph))
                if i <= pos:
                    ok = False
                    break
                pos = i
            verdict = "pass" if ok else "fail"
            detail = f"핵심구 {len(KEYPHRASES[(slug, pn)])}개 순서 일치 = {ok}"
        else:  # ORDER hint
            verdict, detail = judge_order(c.get("expected_hint", "") + c.get("note", ""), page)

        results.append({"slug": slug, "page_no": pn, "defect_type": dt,
                        "verdict": verdict, "detail": detail})

    counts = {}
    for dt in ("ORDER", "SPLIT", "IMG_TEXT", "SFX"):
        sub = [r for r in results if r["defect_type"] == dt]
        counts[dt] = {"pass": sum(r["verdict"] == "pass" for r in sub),
                      "fail": sum(r["verdict"] == "fail" for r in sub),
                      "NEEDS_HUMAN": sum(r["verdict"] == "NEEDS_HUMAN" for r in sub)}

    def rate(dt):
        c = counts[dt]
        den = c["pass"] + c["fail"]
        return c["pass"] / den * 100 if den else None

    order_rate, split_rate = rate("ORDER"), rate("SPLIT")
    gate = {
        "ORDER": {"rate": round(order_rate, 1), "threshold": 90.0,
                  "met": order_rate >= 90.0},
        "SPLIT": {"rate": round(split_rate, 1), "threshold": 95.0,
                  "met": split_rate >= 95.0},
    }

    print("=== golden 자동채점 (ADR-0044) ===")
    for dt, c in counts.items():
        r = rate(dt)
        print(f"{dt:9s} pass {c['pass']:2d} / fail {c['fail']:2d} / "
              f"NEEDS_HUMAN {c['NEEDS_HUMAN']} " +
              (f"→ {r:.1f}%" if r is not None else ""))
    print(f"합격선: ORDER ≥90% → {'달성' if gate['ORDER']['met'] else '미달'} "
          f"({gate['ORDER']['rate']}%) / SPLIT ≥95% → "
          f"{'달성' if gate['SPLIT']['met'] else '미달'} ({gate['SPLIT']['rate']}%)")
    fails = [r for r in results if r["verdict"] == "fail"]
    nh = [r for r in results if r["verdict"] == "NEEDS_HUMAN"]
    if fails:
        print("\n실패면:")
        for r in fails:
            print(f"  {r['slug']} p{r['page_no']}: [{r['defect_type']}] {r['detail']}")
    if nh:
        print(f"\nNEEDS_HUMAN {len(nh)}면:")
        for r in nh:
            print(f"  {r['slug']} p{r['page_no']}: {r['detail']}")

    REPORT.write_text(json.dumps({
        "adr": "0044", "counts": counts, "gate": gate, "results": results,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n리포트: {REPORT.relative_to(PH.parent.parent)}")


if __name__ == "__main__":
    main()
