# -*- coding: utf-8 -*-
"""
중복 표지 탐지 리포트 v3 (재다운로드 없음, 분석 전용)

v2 대비 변경
  - 바이트(md5) 동일 표지 그룹을 정규화 제목 비교로 재분류
      · 제목 동일 -> 진짜 중복 도서 -> duplicate_report_v3 에 편입 (matched_by 에 identical_file)
      · 제목 다름 -> 표지 오적재    -> cover_reload_candidates_v3.csv 에만 유지
  - 되돌아온 도서로 그룹핑을 다시 돌려 v2 에서 끊겼던 관계 복원 여부를 검증

유지 추천 우선순위: ① 오디오 보유 → ② book_dash → ③ 표지 해상도 최대 → 동률 시 팀장 판단
DB 접근 없음. SQL 생성 없음. scratchpad/dedup/ 밖의 파일을 쓰지 않는다.
"""

import collections
import csv
import os
import sys
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import find_duplicates as F
import find_duplicates_v2 as V2

HERE = F.HERE
COVER_DIR = F.COVER_DIR
HAMMING_V3 = 4

REPORT_CSV = os.path.join(HERE, "duplicate_report_v3.csv")
REPORT_MD = os.path.join(HERE, "duplicate_report_v3.md")
RELOAD_CSV = os.path.join(HERE, "cover_reload_candidates_v3.csv")

# v2 에서 끊겼다고 보고한 관계 (복원 검증 대상)
RESTORE_CHECKS = [
    ("Colours ×4", ["colours"]),
    ("Luwo's House ×3", ["luwo s house"]),
    # 아래 2건은 교차 편입 결과 각각 별도 그룹으로 나타나는 것이 정상이다
    ("Disability Is Not Inability ×2", ["disability is not inability"]),
    ("They Can Do Many Things ×2", ["they can do many things"]),
]


# ---------------------------------------------------------------- 유지 추천 (v3)
def make_picker_v3(books, audio_ids, px, reload_ids):
    """① 오디오 보유 → ② book_dash → ③ 표지 해상도 최대 → 동률 시 팀장 판단.

    ③ 은 표지가 오적재된 도서(reload_ids)를 비교에서 제외한다.
    잘못 붙은 표지의 해상도로 판을 고르면 정상 표지 판이 탈락하기 때문이다.
    ①② 는 표지와 무관한 기준이므로 그대로 적용한다.
    """
    def pick(members):
        basis = []
        pool = list(members)

        c = [i for i in pool if books[i]["id"] in audio_ids]
        if len(c) == 1:
            return c[0], "오디오 보유"
        if len(c) > 1:
            pool = c
            basis.append("오디오 보유")

        c = [i for i in pool if books[i]["source_platform"] == "book_dash"]
        if len(c) == 1:
            return c[0], " + ".join(basis + ["book_dash"])
        if len(c) > 1:
            pool = c
            basis.append("book_dash")

        known = [i for i in pool
                 if px.get(books[i]["id"]) and books[i]["id"] not in reload_ids]
        if known:
            mx = max(px[books[i]["id"]] for i in known)
            top = [i for i in known if px[books[i]["id"]] == mx]
            if len(top) == 1:
                extra = " (표지 오적재 판 제외)" if any(
                    books[i]["id"] in reload_ids for i in pool) else ""
                return top[0], " + ".join(basis + ["최대 해상도"]) + extra
            return None, f"팀장 판단(해상도 동률 {len(top)}권)"
        return None, "팀장 판단(해상도 미상)"

    return pick


# ---------------------------------------------------------------- 그룹핑 (identical_file 확장)
def build_groups_v3(books, hashes, md5_pairs):
    """v1 build_groups + 'identical_file' 결합 사유 추가."""
    n = len(books)
    uf = F.UnionFind(n)
    ids = [b["id"] for b in books]
    norms = [F.norm_title(b["title"]) for b in books]
    reasons = {}

    def mark(i, j, why):
        reasons.setdefault(frozenset((i, j)), set()).add(why)
        uf.union(i, j)

    pos = {bid: i for i, bid in enumerate(ids)}

    # 0) 바이트 동일 + 제목 동일 -> 확정 중복
    for a, b in md5_pairs:
        if a in pos and b in pos:
            mark(pos[a], pos[b], "identical_file")

    # 1) 표지: phash 해밍거리 <= HAMMING_V3
    hidx = [i for i in range(n) if ids[i] in hashes]
    for a in range(len(hidx)):
        i = hidx[a]
        hi = hashes[ids[i]]
        for b in range(a + 1, len(hidx)):
            j = hidx[b]
            if hi - hashes[ids[j]] <= HAMMING_V3:
                mark(i, j, "cover")

    # 2) 제목: 완전 일치 또는 유사도 >= TITLE_RATIO
    exact = {}
    for i, t in enumerate(norms):
        if t:
            exact.setdefault(t, []).append(i)
    for grp in exact.values():
        for a in range(len(grp)):
            for b in range(a + 1, len(grp)):
                mark(grp[a], grp[b], "title")

    for i in range(n):
        ti = norms[i]
        if not ti:
            continue
        li = len(ti)
        sm = SequenceMatcher(None, ti, "")
        for j in range(i + 1, n):
            tj = norms[j]
            if not tj or ti == tj:
                continue
            if min(li, len(tj)) / max(li, len(tj)) < F.TITLE_RATIO:
                continue
            sm.set_seq2(tj)
            if sm.real_quick_ratio() < F.TITLE_RATIO or sm.quick_ratio() < F.TITLE_RATIO:
                continue
            if sm.ratio() >= F.TITLE_RATIO:
                mark(i, j, "title")

    buckets = {}
    for i in range(n):
        buckets.setdefault(uf.find(i), []).append(i)

    order = ["identical_file", "cover", "title"]
    out = []
    for members in buckets.values():
        if len(members) < 2:
            continue
        mset = set(members)
        why = set()
        for pair, r in reasons.items():
            if pair <= mset:
                why |= r
        if why == {"cover", "title"}:
            label = "both"
        else:
            label = "+".join(x for x in order if x in why) or "unknown"
        out.append({"members": sorted(members, key=lambda i: books[i]["title"].lower()),
                    "matched_by": label})

    out.sort(key=lambda g: (-len(g["members"]), books[g["members"][0]]["title"].lower()))
    return out


# ---------------------------------------------------------------- 리포트
def write_csv(books, groups, pick, px, reload_ids):
    with open(REPORT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["group_no", "matched_by", "id", "source_platform", "title",
                    "cover_url", "유지추천", "추천근거", "표지해상도(px)", "비고"])
        for gno, g in enumerate(groups, 1):
            keeper, basis = pick(g["members"])
            for i in g["members"]:
                b = books[i]
                w.writerow([gno, g["matched_by"], b["id"], b["source_platform"],
                            b["title"], b["cover_url"],
                            "Y" if i == keeper else "",
                            basis if (i == keeper or keeper is None) else "",
                            px.get(b["id"], ""),
                            "표지 재적재 필요" if b["id"] in reload_ids else ""])


def write_md(books, groups, pick, px, stats, audio_src, restored, reload_ids):
    L = []
    A = L.append
    A("# 공개 도서 중복 표지 탐지 리포트 v3\n")
    A("> 읽기·분석 전용. DB 변경 없음. 비활성화 SQL은 팀장 확정 후 별도 생성.\n")
    A("## 요약\n")
    A("| 항목 | v1 | v2 | v3 |")
    A("|---|---|---|---|")
    A(f"| phash 해밍거리 임계값 | 8 | 4 | **4** |")
    A(f"| 분석 대상 권수 | {stats['total']} | {stats['v2_analyzed']} | **{stats['analyzed']}** |")
    A(f"| 중복 그룹 수 | {stats['v1_groups']} | {stats['v2_groups']} | **{len(groups)}** |")
    A(f"| 중복으로 묶인 권수 | {stats['v1_books']} | {stats['v2_books']} | **{stats['dup_books']}** |")
    A(f"| 유지 추천이 붙은 그룹 | {stats['v1_keepers']} | {stats['v2_keepers']} | **{stats['keepers']}** |")
    A(f"| 표지 오적재 후보 | — | {stats['v2_reload']} | **{stats['reload']}** |")
    A("")
    A(f"판정 기준: 바이트 동일 표지 + 제목 동일(`identical_file`) / phash 해밍거리 ≤ {HAMMING_V3}(`cover`) "
      f"/ 정규화 제목 유사도 ≥ {F.TITLE_RATIO:.2f}(`title`)\n")
    A(f"유지 추천 우선순위: ① 오디오 보유({os.path.basename(audio_src) if audio_src else '없음'}) "
      "→ ② book_dash → ③ 표지 해상도 최대 → 동률 시 팀장 판단\n")
    A("바이트 동일 표지 그룹 중 **제목이 다른** 건만 표지 오적재로 분리했다 "
      "→ `cover_reload_candidates_v3.csv`\n")
    A("### v2 에서 끊겼던 관계 복원 검증\n")
    A("| 대상 | 결과 |")
    A("|---|---|")
    for name, ok, detail in restored:
        A(f"| {name} | {'✅ 복원' if ok else '❌ 미복원'} — {detail} |")
    A("\n---\n")

    for gno, g in enumerate(groups, 1):
        keeper, basis = pick(g["members"])
        A(f"## 그룹 {gno} · {len(g['members'])}권 · matched_by=`{g['matched_by']}`\n")
        if g["matched_by"] == "cover" and len(g["members"]) >= F.BIG_GROUP_WARN:
            A(f"> ⚠️ 표지만으로 {len(g['members'])}권이 묶였습니다. 육안 확인 필수.\n")
        A("| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | 비고 | id |")
        A("|---|---|---|---|---|---|---|")
        for i in g["members"]:
            b = books[i]
            thumb = (f'<img src="covers/{b["id"]}.jpg" width="110">'
                     if os.path.exists(os.path.join(COVER_DIR, f'{b["id"]}.jpg')) else "(표지 없음)")
            keep = f"**Y**<br>{basis}" if i == keeper else ""
            title = (b["title"] or "").replace("|", "\\|")
            note = "⚠️ 표지 재적재 필요" if b["id"] in reload_ids else ""
            A(f"| [{thumb}]({b['cover_url']}) | {keep} | {title} | {b['source_platform']} "
              f"| {px.get(b['id'], '?')} | {note} | `{b['id']}` |")
        if keeper is None:
            A(f"\n> 유지 추천 없음 — **{basis}**")
        A("")

    with open(REPORT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


# ---------------------------------------------------------------- main
def main():
    books = F.load_books()
    by_id = {b["id"]: b for b in books}
    audio_ids, audio_src = F.load_audio_ids()
    print(f"[1/6] 입력 {len(books)}권 · 오디오 {len(audio_ids)}건")

    print("[2/6] 표지 md5 / 해상도 스캔")
    md5s, px = V2.scan_covers(books)

    print("[3/6] 바이트 동일 그룹 재분류 (정규화 제목 비교)")
    by_md5 = collections.defaultdict(list)
    for bid, m in md5s.items():
        by_md5[m].append(bid)
    shared = {m: v for m, v in by_md5.items() if len(v) > 1}

    same_title, diff_title = {}, {}
    for m, members in shared.items():
        if len({F.norm_title(by_id[b]["title"]) for b in members}) == 1:
            same_title[m] = members
        else:
            diff_title[m] = members
    md5_pairs = [(v[i], v[j]) for v in same_title.values()
                 for i in range(len(v)) for j in range(i + 1, len(v))]
    misload = {b for v in diff_title.values() for b in v}
    print(f"      바이트 동일 {len(shared)}그룹 -> 제목동일 {len(same_title)}그룹"
          f"({sum(len(v) for v in same_title.values())}권, 리포트 편입) / "
          f"제목상이 {len(diff_title)}그룹({len(misload)}권, 오적재 분리)")

    # ---- 오적재이면서 동시에 중복인 도서 = 교차 편입 대상
    #      (오적재로 분리했으나, 리포트에 남는 도서와 제목이 겹치는 건)
    keptset = [b for b in books if b["id"] not in misload]
    overlap = set()
    for bid in misload:
        ne = F.norm_title(by_id[bid]["title"])
        for k in keptset:
            nk = F.norm_title(k["title"])
            if not ne or not nk:
                continue
            if ne == nk or (min(len(ne), len(nk)) / max(len(ne), len(nk)) >= F.TITLE_RATIO
                            and SequenceMatcher(None, ne, nk).ratio() >= F.TITLE_RATIO):
                overlap.add(bid)
                break
    print(f"      교차 편입(오적재+중복 겹침) {len(overlap)}권: "
          + " / ".join(by_id[b]["title"][:30] for b in sorted(overlap)))

    print(f"[4/6] 그룹핑 (해밍거리 <= {HAMMING_V3}, identical_file 포함)")
    # 교차 편입 도서는 분석에 되돌려 넣되, 표지가 오적재 파일이므로 표지 신호는 신뢰하지 않는다
    # (그대로 두면 오적재된 동일 표지끼리 다시 결합해 서로 무관한 책이 한 덩어리가 된다)
    remaining = [b for b in books if b["id"] not in misload or b["id"] in overlap]
    hashes = {k: v for k, v in V2.load_phashes(remaining).items() if k not in misload}
    groups = build_groups_v3(remaining, hashes, md5_pairs)
    for g in groups:
        if any(remaining[i]["id"] in overlap for i in g["members"]):
            g["matched_by"] = "identical_file+title"
    dup_books = sum(len(g["members"]) for g in groups)
    print(f"      그룹 {len(groups)}개 · 묶인 권수 {dup_books}")

    # ---- 오적재 후보 v3 (교차 편입 2권은 그룹 번호를 비고에 적어 유지)
    gno_of = {remaining[i]["id"]: gno
              for gno, g in enumerate(groups, 1) for i in g["members"]}
    failures = []
    if os.path.exists(F.FAILED_CSV):
        failures = list(csv.DictReader(open(F.FAILED_CSV, newline="", encoding="utf-8-sig")))
    with open(RELOAD_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id", "source_platform", "title", "cover_url", "md5",
                    "공유그룹번호", "사유", "비고"])
        for sn, (m, members) in enumerate(
                sorted(diff_title.items(), key=lambda x: (-len(x[1]), x[0])), 1):
            for bid in sorted(members, key=lambda i: by_id[i]["title"].lower()):
                b = by_id[bid]
                note = f"중복 판정 대기(리포트 그룹 {gno_of[bid]})" if bid in overlap else ""
                w.writerow([bid, b["source_platform"], b["title"], b["cover_url"], m, sn,
                            f"바이트 동일 표지를 제목이 다른 {len(members)}권이 공유", note])
        for r in failures:
            b = by_id.get(r["id"])
            w.writerow([r["id"], b["source_platform"] if b else "", r["title"],
                        r["cover_url"], "", "", f"다운로드 실패: {r['reason']}", ""])
    print(f"      -> {os.path.basename(RELOAD_CSV)} {len(misload) + len(failures)}행")

    print("[5/6] 유지 추천 + 복원 검증")
    pick = make_picker_v3(remaining, audio_ids, px, overlap)
    keepers = sum(1 for g in groups if pick(g["members"])[0] is not None)

    restored = []
    for name, keys in RESTORE_CHECKS:
        hit = None
        for gno, g in enumerate(groups, 1):
            ns = {F.norm_title(remaining[i]["title"]) for i in g["members"]}
            if all(any(k == n for n in ns) for k in keys):
                hit = (gno, g)
                break
        if hit:
            gno, g = hit
            restored.append((name, True,
                             f"그룹 {gno} · {len(g['members'])}권 · matched_by=`{g['matched_by']}`"))
        else:
            restored.append((name, False, "그룹으로 나타나지 않음"))
        print(f"      {name}: {restored[-1][2]}")

    print("[6/6] 리포트 생성")

    def load_stats(path, keycol="유지추천"):
        rows = list(csv.DictReader(open(path, newline="", encoding="utf-8-sig")))
        gg = collections.defaultdict(list)
        for r in rows:
            gg[r["group_no"]].append(r)
        return len(gg), len(rows), sum(1 for v in gg.values() if any(r[keycol] == "Y" for r in v))

    v1g, v1b, v1k = load_stats(os.path.join(HERE, "duplicate_report.csv"))
    v2g, v2b, v2k = load_stats(os.path.join(HERE, "duplicate_report_v2.csv"))
    v2rl = len(list(csv.DictReader(open(os.path.join(HERE, "cover_reload_candidates.csv"),
                                        newline="", encoding="utf-8-sig"))))
    stats = {"total": len(books), "analyzed": len(remaining), "dup_books": dup_books,
             "keepers": keepers, "reload": len(misload) + len(failures),
             "v1_groups": v1g, "v1_books": v1b, "v1_keepers": v1k,
             "v2_groups": v2g, "v2_books": v2b, "v2_keepers": v2k,
             "v2_analyzed": 1805, "v2_reload": v2rl}
    write_csv(remaining, groups, pick, px, overlap)
    write_md(remaining, groups, pick, px, stats, audio_src, restored, overlap)

    mb = collections.Counter(g["matched_by"] for g in groups)
    print("\n=== v1 -> v2 -> v3 ===")
    print(f"분석 대상 : {len(books)} -> 1805 -> {len(remaining)}")
    print(f"그룹 수   : {v1g} -> {v2g} -> {len(groups)}")
    print(f"묶인 권수 : {v1b} -> {v2b} -> {dup_books}")
    print(f"유지 추천 : {v1k}/{v1g} -> {v2k}/{v2g} -> {keepers}/{len(groups)}")
    print(f"오적재    : - -> {v2rl} -> {len(misload) + len(failures)}행"
          f" (교차 편입 {len(overlap)}권은 리포트에도 등장)")
    print(f"matched_by: {dict(mb)}")


if __name__ == "__main__":
    main()
