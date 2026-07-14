# -*- coding: utf-8 -*-
"""ADR-0044 면내 읽기순서 교정기 — 좌표 원료(out_coords_154) 기반.

파이프라인(면 단위):
  1) 파편 연쇄 병합(라인 형성 전): 알파 ≤2자 파편 토큰을 x-단조·x겹침 필수·수직간극
     ≤0.05×size 최근접 연쇄로 병합 — 산포 낱글자('j i g g l e'), 대각('W/H/E…'),
     세로 적층('D/OO/F/!'), 스타일 아크('c h a n g e') 대응. 정상 단어는 x겹침이
     없어 절대 병합되지 않음(실단어 'it up' 보호). 타워 간 수평 점프·아크 모서리
     교차는 x겹침·수직간극 조건이 차단.
  2) 줄 형성: 수직겹침 ≥50%로 줄 묶기 → 줄 내 큰 x간극(>1.5×size)에서 세그먼트 분할
  3) 드롭캡 병합: 단독 대문자(I·A 제외)+소문자 시작 후속 근접 병합('Y ou'→'You')
  4) 블록화: 세그먼트 수직 인접(≤0.9×size)+x겹침(≥25%)으로 블록 묶기
  5) 역할 태깅: DECOR(크기 이상치 양방향 + 고립 + ALL-CAPS + SFX 아님 → 본문 제외:
     'TINO' 1.67× / 'SCHOOL' 0.75× 실측 근거) / SFX(동일문자 연속≥3 또는 '!' — 보존) / BODY
  6) 읽기순: 재귀 XY-cut — 최대 간극 분할, 세로분할=좌→우, 가로분할=상→하
     (단순 top정렬 불가 실증: dudus-hat p09 2단, how-do-you-sleep p05 질문좌하단)

정답지: golden/order_golden.json (채점 = golden_score.py).
사용: python scripts/pdf_harvest/order_fix.py [--slugs a,b,c] [--out out_fixed_14]
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

PH = Path(__file__).resolve().parent
COORDS = PH / "out_coords_154"
GOLDEN = PH / "golden/order_golden.json"

# ── 상수 (golden 튜닝 대상 — ADR-0044 §3) ────────────────────────────────
FRAG_ALPHA_MAX = 2       # 파편 판정: 알파 ≤2자
CHAIN_DYGAP_F = 0.05     # 파편 연쇄: 수직 간극 ≤ 0.05×size (아크 모서리 근접 6.7pt 교차 차단)
CHAIN_XBACK_F = 0.20     # 파편 연쇄: x0 역행 허용 ≤ 0.20×size (단조 강제)
FRAG_SIZE_RATIO = 1.6    # 파편 연쇄 크기 유사성 상한(정상 연쇄 최대 1.49 실측 수용,
                         # 아크 간 교차 1.69~1.70 차단)
LINE_OVERLAP_MIN = 0.5   # 줄 판정: 수직겹침 ≥ 작은쪽 높이의 50%
XSPLIT_F = 1.5           # 줄 내 세그먼트 분할: x간극 > 1.5×size (열 경계)
DROPCAP_GAP_F = 0.30     # 드롭캡 병합 허용 간극
JOIN_GAP_F = 0.9         # 블록화: 줄 간격 ≤ 0.9×size
BLOCK_XOVERLAP = 0.25    # 블록화: x겹침 비율 하한
DECOR_RATIO_LO = 0.80    # DECOR: 책 본문 크기 대비 하한('SCHOOL' 0.75 실측)
DECOR_RATIO_HI = 1.30    # DECOR: 상한('TINO' 1.67 실측)
DECOR_ISO_DIST = 60.0    # DECOR: 최근접 본문 블록과의 최소 간격(pt)
DECOR_MAX_TOKENS = 1     # DECOR: 단독 토큰 간판만('TINO'/'SCHOOL' — 'SPLISH SPLOSH' 등
                         # 다토큰 의성어 쌍은 보수적으로 보존)
SFX_RUN = 3              # SFX: 동일문자 연속 ≥3 ('WHEEEEE', 'Shhh')
VGAP_MIN = 50.0          # XY-cut 세로 분할 최소 간극
HGAP_MIN = 30.0          # XY-cut 가로 분할 최소 간극

# SFX 패턴: 동일문자 연속≥3('WHEEEEE') 또는 반복부분열('TOOTTOOT'=TOOT×2 — p06 실측)
SFX_RE = re.compile(r"([A-Za-z])\1{%d,}|([A-Za-z]{2,4})\2" % (SFX_RUN - 1))


def alpha_len(t):
    return sum(1 for c in t if c.isalpha())


def is_frag(w):
    return alpha_len(w["text"]) <= FRAG_ALPHA_MAX and len(w["text"]) <= FRAG_ALPHA_MAX + 1


def bbox_gap(a, b):
    dx = max(b["x0"] - a["x1"], a["x0"] - b["x1"], 0)
    dy = max(b["top"] - a["bottom"], a["top"] - b["bottom"], 0)
    return max(dx, dy)


def chain_frags(words):
    """파편 토큰을 x-단조 최근접 연쇄로 병합 — 산포·적층·대각·아크 글자 복원."""
    frags = [dict(w) for w in words if is_frag(w)]
    out = [dict(w) for w in words if not is_frag(w)]
    todo = set(range(len(frags)))
    while todo:
        start = min(todo, key=lambda i: (frags[i]["x0"], frags[i]["top"]))
        chain = [start]
        todo.remove(start)
        while True:
            last = frags[chain[-1]]
            best, best_d = None, None
            for i in todo:
                w = frags[i]
                sz = max(last["size"], w["size"])
                if w["x0"] < last["x0"] - CHAIN_XBACK_F * sz:
                    continue
                # x-겹침 필수(수평 점프 차단) + 수직 간극 미세(모서리 교차 차단)
                if min(last["x1"], w["x1"]) - max(last["x0"], w["x0"]) <= 0:
                    continue
                if max(w["top"] - last["bottom"], last["top"] - w["bottom"], 0) \
                        > CHAIN_DYGAP_F * sz:
                    continue
                if sz / max(min(last["size"], w["size"]), 1) > FRAG_SIZE_RATIO:
                    continue
                d = ((w["x0"] + w["x1"]) / 2 - (last["x0"] + last["x1"]) / 2) ** 2 + \
                    ((w["top"] + w["bottom"]) / 2 - (last["top"] + last["bottom"]) / 2) ** 2
                if best_d is None or d < best_d:
                    best, best_d = i, d
            if best is None:
                break
            chain.append(best)
            todo.remove(best)
        ws = [frags[i] for i in chain]
        out.append({
            "text": "".join(w["text"] for w in ws),
            "x0": min(w["x0"] for w in ws), "x1": max(w["x1"] for w in ws),
            "top": min(w["top"] for w in ws), "bottom": max(w["bottom"] for w in ws),
            "size": max(w["size"] for w in ws),
        })
    return out


def v_overlap(a, b):
    ov = min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])
    h = min(a["bottom"] - a["top"], b["bottom"] - b["top"])
    return ov / h if h > 0 else 0.0


def make_segments(words):
    """줄 묶기(수직겹침) → 줄 내 x정렬 → 큰 간극 분할 → 드롭캡 병합."""
    lines = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        for ln in lines:
            if any(v_overlap(x, w) >= LINE_OVERLAP_MIN for x in ln):
                ln.append(w)
                break
        else:
            lines.append([w])
    segs = []
    for ln in lines:
        ln.sort(key=lambda w: w["x0"])
        cur = [ln[0]]
        for w in ln[1:]:
            if w["x0"] - cur[-1]["x1"] > XSPLIT_F * max(w["size"], cur[-1]["size"]):
                segs.append(cur)
                cur = [w]
            else:
                cur.append(w)
        segs.append(cur)
    # 드롭캡: 단독 대문자(I·A 제외) + 소문자 시작 후속 근접 → 병합
    merged = []
    for seg in segs:
        out = []
        for w in seg:
            if out:
                p = out[-1]
                if (len(p["text"]) == 1 and p["text"].isupper() and p["text"] not in "IA"
                        and w["text"][:1].islower()
                        and w["x0"] - p["x1"] <= DROPCAP_GAP_F * max(p["size"], w["size"])):
                    p["text"] += w["text"]
                    p["x1"] = max(p["x1"], w["x1"])
                    p["top"] = min(p["top"], w["top"])
                    p["bottom"] = max(p["bottom"], w["bottom"])
                    continue
            out.append(dict(w))
        merged.append(out)
    return merged


def make_blocks(segs):
    segs = [{"words": s,
             "x0": min(w["x0"] for w in s), "x1": max(w["x1"] for w in s),
             "top": min(w["top"] for w in s), "bottom": max(w["bottom"] for w in s),
             "size": statistics.median(w["size"] for w in s)} for s in segs]
    segs.sort(key=lambda b: (b["top"], b["x0"]))
    blocks = []
    for s in segs:
        for b in blocks:
            xov = min(b["x1"], s["x1"]) - max(b["x0"], s["x0"])
            wid = min(b["x1"] - b["x0"], s["x1"] - s["x0"])
            if xov > BLOCK_XOVERLAP * max(wid, 1) and \
               s["top"] - b["bottom"] <= JOIN_GAP_F * max(b["size"], s["size"]):
                b["lines"].append(s)
                b["x0"] = min(b["x0"], s["x0"]); b["x1"] = max(b["x1"], s["x1"])
                b["bottom"] = max(b["bottom"], s["bottom"])
                b["size"] = statistics.median([b["size"], s["size"]])
                break
        else:
            blocks.append({"lines": [s], "x0": s["x0"], "x1": s["x1"],
                           "top": s["top"], "bottom": s["bottom"], "size": s["size"]})
    for b in blocks:
        b["lines"].sort(key=lambda ln: (ln["top"], ln["x0"]))
        b["tokens"] = [w["text"] for ln in b["lines"] for w in ln["words"]]
        b["text"] = " ".join(b["tokens"])
    return blocks


def tag_blocks(blocks, book_body_size):
    body_ref = [b for b in blocks
                if DECOR_RATIO_LO <= b["size"] / book_body_size <= DECOR_RATIO_HI]
    sentences = [b for b in blocks if len(b["tokens"]) >= 3]  # 실문장 블록(고립 기준점)
    for b in blocks:
        alpha = re.sub(r"[^A-Za-z]", "", b["text"])
        # 감탄부호(!·?)로 끝나는 블록은 의성·대사 가능성 — 보수적으로 보존('MEH?' 실측).
        # 닫는 따옴표류는 벗기고 검사('“YAY!”' 오제외 방지 — 154 전권 실측)
        sfx = bool(SFX_RE.search(b["text"])) or \
            b["text"].rstrip().rstrip("\"”’'»)").strip()[-1:] in "!?"
        ratio = b["size"] / book_body_size
        odd_size = not (DECOR_RATIO_LO <= ratio <= DECOR_RATIO_HI)
        allcaps = bool(alpha) and alpha.isupper()
        iso = all(bbox_gap(o, b) >= DECOR_ISO_DIST for o in body_ref if o is not b)
        # 제2 판별자: 본문 크기와 비슷한 간판('TINO' p07 0.88×·p08 1.08× 실측) —
        # 짧은 ALL-CAPS 단독 블록 + 실문장 블록들로부터 고립(≥40pt). SFX·'!' 보호 유지.
        caps_sign = (allcaps and not sfx and len(b["tokens"]) <= DECOR_MAX_TOKENS
                     and 3 <= len(alpha) <= 8
                     and all(bbox_gap(o, b) >= 40.0 for o in sentences if o is not b))
        if not sfx and allcaps and len(b["tokens"]) <= DECOR_MAX_TOKENS and \
                ((odd_size and iso) or caps_sign):
            b["role"] = "DECOR"
        elif sfx and odd_size:
            b["role"] = "SFX"
        else:
            b["role"] = "BODY"
    return blocks


def xy_cut(blocks):
    """재귀 XY-cut: 최대 간극 분할 — 세로분할 좌→우, 가로분할 상→하."""
    if len(blocks) <= 1:
        return blocks

    def best_gap(ivs):
        ivs = sorted(ivs)
        merged = [list(ivs[0])]
        for lo, hi in ivs[1:]:
            if lo <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], hi)
            else:
                merged.append([lo, hi])
        gap, pos = 0.0, None
        for a, bb in zip(merged, merged[1:]):
            if bb[0] - a[1] > gap:
                gap, pos = bb[0] - a[1], (a[1] + bb[0]) / 2
        return gap, pos

    vgap, vpos = best_gap([(b["x0"], b["x1"]) for b in blocks])
    hgap, hpos = best_gap([(b["top"], b["bottom"]) for b in blocks])
    if vgap >= VGAP_MIN and vgap >= hgap:
        left = [b for b in blocks if b["x1"] <= vpos]
        right = [b for b in blocks if b["x1"] > vpos]
        if left and right:
            return xy_cut(left) + xy_cut(right)
    if hgap >= HGAP_MIN:
        topg = [b for b in blocks if b["bottom"] <= hpos]
        botg = [b for b in blocks if b["bottom"] > hpos]
        if topg and botg:
            return xy_cut(topg) + xy_cut(botg)
    return sorted(blocks, key=lambda b: (b["top"], b["x0"]))


def fix_book(slug, out_dir):
    j = json.loads((COORDS / f"{slug}.words.json").read_text(encoding="utf-8"))
    sizes = [w["size"] for p in j["pages"] for w in p["words"] if w["size"] > 0]
    body_size = statistics.median(sizes) if sizes else 1.0
    pages_out = []
    for page in j["pages"]:
        if not page["words"]:
            pages_out.append({"page_no": page["page_no"], "text": "", "blocks": [],
                              "decor_excluded": []})
            continue
        words = chain_frags(page["words"])
        blocks = tag_blocks(make_blocks(make_segments(words)), body_size)
        ordered = xy_cut(blocks)
        pages_out.append({
            "page_no": page["page_no"],
            "text": " ".join(b["text"] for b in ordered if b["role"] != "DECOR"),
            "blocks": [{"role": b["role"], "text": b["text"],
                        "bbox": [round(b["x0"], 1), round(b["top"], 1),
                                 round(b["x1"], 1), round(b["bottom"], 1)],
                        "size": round(b["size"], 1)} for b in ordered],
            "decor_excluded": [b["text"] for b in ordered if b["role"] == "DECOR"],
        })
    doc = {"slug": slug, "book_body_size": round(body_size, 1),
           "pipeline": "order_fix-v1 (ADR-0044)", "pages": pages_out}
    (out_dir / f"{slug}.fixed.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return doc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", default=None, help="쉼표구분 slug (기본: golden 수록 전권)")
    ap.add_argument("--slugs-file", default=None, help="slug 목록 파일(줄당 1개 — 전권 적용용)")
    ap.add_argument("--out", default=str(PH / "out_fixed_14"))
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if a.slugs_file:
        slugs = [s.strip() for s in Path(a.slugs_file).read_text(encoding="utf-8").splitlines()
                 if s.strip()]
    elif a.slugs:
        slugs = a.slugs.split(",")
    else:
        g = json.loads(GOLDEN.read_text(encoding="utf-8"))
        slugs = sorted({c["slug"] for c in g["cases"]})
    out_dir = Path(a.out)
    out_dir.mkdir(exist_ok=True)
    for s in slugs:
        doc = fix_book(s, out_dir)
        nb = sum(len(p["blocks"]) for p in doc["pages"])
        nd = sum(len(p["decor_excluded"]) for p in doc["pages"])
        print(f"{s}: {len(doc['pages'])}면 · 블록 {nb} · DECOR 제외 {nd} · body_size {doc['book_body_size']}")
    print(f"\n완료 {len(slugs)}권 → {out_dir}")


if __name__ == "__main__":
    main()
