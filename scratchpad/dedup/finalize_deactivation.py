# -*- coding: utf-8 -*-
"""
중복 비활성화 확정 목록 + SQL 파일 생성 (DB 실행 없음, 분석 전용) — 최종 방침판

입력 : duplicate_report_v3.csv (166그룹 / 362권), ../audio_books.csv

그룹 유형
  B (의심 35그룹) = cover 전용 오탐 의심 8그룹 + 제목 소멸 발생 27그룹
      규칙: 오디오 보유판 유지 · book_dash판 유지 · 그 외 전원 비활성화
            (유지판 0권 허용 = 그룹 전원 비활성화)
  A (확정 중복 131그룹) = 나머지 전부
      규칙: 유지판 정확히 1권
            ① 오디오 → ② book_dash → ④ 비-GDL → ③ 표지 해상도(오적재 판 제외) → ⑤ id 최소

  ※ 166 = A 131 + B 35. 지시서의 '158+35=193' 은 27그룹이 158 안에 이미 포함돼 있어
     생긴 중복 계산이므로 166 기준으로 산출한다.

게이트 a(오디오 보호)는 절대 유지. 하나라도 실패하면 SQL 없이 종료.
DELETE 생성 금지. DB 접근 없음.
"""

import collections
import csv
import os
import sys
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from find_duplicates import norm_title, TITLE_RATIO

HERE = os.path.dirname(os.path.abspath(__file__))
SCRATCH = os.path.dirname(HERE)

REPORT_V3 = os.path.join(HERE, "duplicate_report_v3.csv")
AUDIO_CSV = os.path.join(SCRATCH, "audio_books.csv")
FINAL_CSV = os.path.join(HERE, "deactivate_final.csv")
SQL1 = os.path.join(HERE, "step1_backup.sql")
SQL2 = os.path.join(HERE, "step2_deactivate.sql")
SQL3 = os.path.join(HERE, "step3_verify.sql")
OUTPUTS = [FINAL_CSV, SQL1, SQL2, SQL3]
PREV_SUFFIX = "_prev3"

BACKUP_TABLE = "books_backup_dedup_20260806"
SUSPECT_SIM = 0.40
ACTIVE_TOTAL = 1852
ACTIVE_BOOKDASH = 190          # active_books.csv 실측 (비활성화 후에도 불변이어야 함)
RULE_ORDER = ["① 오디오 보유", "② book_dash", "④ 비-GDL 우선",
              "③ 표지 해상도 최대", "⑤ id 최소"]


# 이 파일은 최상위에서 산출물을 덮어쓰므로 import 되면 사고가 난다. 직접 실행만 허용한다.
if __name__ != "__main__":
    raise SystemExit("finalize_deactivation.py 는 import 대상이 아니다. 직접 실행할 것.")


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def id_list_sql(ids, indent="    "):
    return ",\n".join(f"{indent}{sql_str(i)}" for i in ids)


def px_of(m):
    v = str(m.get("표지해상도(px)", "")).strip()
    return int(v) if v.isdigit() else None


def is_misload(m):
    return "표지 재적재" in (m.get("비고") or "")


def title_close(a, b):
    na, nb = norm_title(a), norm_title(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if min(len(na), len(nb)) / max(len(na), len(nb)) < 0.5:
        return False
    return SequenceMatcher(None, na, nb).ratio() >= TITLE_RATIO


# ---------------------------------------------------------------- 이전 산출물 보존
prev_rows = []
if os.path.exists(FINAL_CSV):
    prev_rows = list(csv.DictReader(open(FINAL_CSV, newline="", encoding="utf-8-sig")))
for p in OUTPUTS:
    if os.path.exists(p):
        root, ext = os.path.splitext(p)
        dst = root + PREV_SUFFIX + ext
        if os.path.exists(dst):
            os.remove(dst)
        os.rename(p, dst)
print(f"[0/6] 이전 산출물 {len(OUTPUTS)}종 -> *{PREV_SUFFIX} 로 보존")

# ---------------------------------------------------------------- 로드
rows = list(csv.DictReader(open(REPORT_V3, newline="", encoding="utf-8-sig")))
groups = collections.OrderedDict()
for r in rows:
    groups.setdefault(int(r["group_no"]), []).append(r)
audio_ids = {r["book_id"].strip()
             for r in csv.DictReader(open(AUDIO_CSV, newline="", encoding="utf-8-sig"))
             if r["book_id"].strip()}
print(f"[1/6] v3 리포트 {len(groups)}그룹 / {len(rows)}권 · 오디오 {len(audio_ids)}건")


# ---------------------------------------------------------------- A 규칙 (유지판 1권)
def decide_a(mem):
    pool, notes = list(mem), []

    c = [m for m in pool if m["id"] in audio_ids]
    if len(c) == 1:
        return c[0], RULE_ORDER[0], "오디오 보유 단독"
    if len(c) > 1:
        pool, _ = c, notes.append("오디오 보유 복수")

    c = [m for m in pool if m["source_platform"] == "book_dash"]
    if len(c) == 1:
        return c[0], RULE_ORDER[1], " / ".join(notes + ["book_dash 단독"])
    if len(c) > 1:
        pool, _ = c, notes.append("book_dash 복수")

    c = [m for m in pool if m["source_platform"] != "gdl"]
    if len(c) == 1:
        return c[0], RULE_ORDER[2], " / ".join(notes + ["비-GDL 단독"])
    if len(c) > 1:
        pool, _ = c, notes.append("비-GDL 복수")
    elif not c:
        notes.append("전권 GDL")

    known = [m for m in pool if px_of(m) and not is_misload(m)]
    if known:
        mx = max(px_of(m) for m in known)
        top = [m for m in known if px_of(m) == mx]
        extra = " (오적재 판 제외)" if any(is_misload(m) for m in pool) else ""
        if len(top) == 1:
            return top[0], RULE_ORDER[3], " / ".join(notes + [f"해상도 {mx}{extra}"])
        pool, _ = top, notes.append(f"해상도 동률 {len(top)}권{extra}")
    else:
        notes.append("해상도 비교 불가")

    return min(pool, key=lambda m: m["id"]), RULE_ORDER[4], " / ".join(notes + ["id 최소"])


# ---------------------------------------------------------------- 그룹 유형 분류
suspect8 = {}
for gno, mem in groups.items():
    if mem[0]["matched_by"] != "cover":
        continue
    t = [norm_title(m["title"]) for m in mem]
    worst = min(SequenceMatcher(None, t[i], t[j]).ratio()
                for i in range(len(t)) for j in range(i + 1, len(t)))
    if worst < SUSPECT_SIM:
        suspect8[gno] = worst

lost27 = {}
for gno, mem in groups.items():
    if gno in suspect8:
        continue
    keeper, _, _ = decide_a(mem)
    gone = [m for m in mem if m is not keeper and not title_close(m["title"], keeper["title"])]
    if gone:
        lost27[gno] = gone

type_b = set(suspect8) | set(lost27)
type_a = [g for g in groups if g not in type_b]
print(f"[2/6] 그룹 유형: A(확정) {len(type_a)} / B(의심) {len(type_b)} "
      f"= 오탐 의심 {len(suspect8)} + 제목 소멸 {len(lost27)}  ·  합계 {len(groups)}")

# ---------------------------------------------------------------- 확정
final, rule_count = [], collections.Counter()
b_all_deact, b_lost_titles = [], 0

for gno, mem in groups.items():
    if gno in type_b:
        kind = "오탐 의심" if gno in suspect8 else "제목 소멸"
        keepers = [m for m in mem
                   if m["id"] in audio_ids or m["source_platform"] == "book_dash"]
        if not keepers:
            b_all_deact.append(gno)
        titles_kept = [k["title"] for k in keepers]
        for m in mem:
            keep = m in keepers
            if not keep and not any(title_close(m["title"], t) for t in titles_kept):
                b_lost_titles += 1
            if keep:
                why = "오디오 보유" if m["id"] in audio_ids else "book_dash"
                note = f"B({kind}) / {why} 유지"
            else:
                note = (f"B({kind}) / 오디오·book_dash 아님"
                        + ("" if keepers else " · 그룹 전원 비활성화"))
            final.append({"그룹유형": "B", "group_no": gno, "id": m["id"],
                          "source_platform": m["source_platform"], "title": m["title"],
                          "처리": "유지" if keep else "비활성화", "근거": note})
    else:
        keeper, rule, note = decide_a(mem)
        rule_count[rule] += 1
        for m in mem:
            keep = m is keeper
            final.append({"그룹유형": "A", "group_no": gno, "id": m["id"],
                          "source_platform": m["source_platform"], "title": m["title"],
                          "처리": "유지" if keep else "비활성화",
                          "근거": f"A / {rule} / {note}" if keep
                                  else f"A / 그룹 {gno} 중복 (유지판: {keeper['id']})"})

keep_ids = [f["id"] for f in final if f["처리"] == "유지"]
deact_ids = [f["id"] for f in final if f["처리"] == "비활성화"]
print(f"[3/6] 확정: 유지 {len(keep_ids)}권 / 비활성화 {len(deact_ids)}권")

# ---------------------------------------------------------------- 안전 게이트
print("[4/6] 안전 게이트")
gates = []
hit = sorted(set(deact_ids) & audio_ids)
gates.append(("a. 비활성화 ∩ audio_books = 0  [절대 유지]", not hit,
              f"{len(hit)}건 검출" if hit else "0건"))
bad = [g for g in type_a
       if sum(1 for f in final if f["group_no"] == g and f["처리"] == "유지") != 1]
gates.append(("b. A그룹 유지판 정확히 1권", not bad,
              f"위반 그룹 {bad}" if bad else f"A {len(type_a)}그룹 전부 1권"))
dup = [i for i, c in collections.Counter(deact_ids).items() if c > 1]
gates.append(("c. 비활성화 대상 중복 id 없음", not dup,
              f"중복 {dup}" if dup else f"고유 {len(set(deact_ids))}건"))
bd_leak = [f for f in final
           if f["그룹유형"] == "B" and f["처리"] == "비활성화"
           and f["source_platform"] == "book_dash"]
gates.append(("d. B그룹 book_dash 비활성화 0건", not bd_leak,
              f"{len(bd_leak)}건 검출" if bd_leak else "0건"))
for name, ok, detail in gates:
    print(f"      {'PASS' if ok else 'FAIL'}  {name} — {detail}")
if not all(ok for _, ok, _ in gates):
    print("\n[STOP] 게이트 실패 — SQL 생성하지 않음")
    sys.exit(1)

# ---------------------------------------------------------------- 산출물
with open(FINAL_CSV, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=["그룹유형", "group_no", "id", "source_platform",
                                      "title", "처리", "근거"])
    w.writeheader()
    w.writerows(final)

print("[5/6] SQL 생성")
HDR = ("-- 중복 도서 비활성화 · {step}\n"
       "-- 생성: scratchpad/dedup/finalize_deactivation.py (Claude Code)\n"
       "-- A그룹(확정 {na}) 유지판 1권: ① 오디오 → ② book_dash → ④ 비-GDL → ③ 해상도 → ⑤ id 최소\n"
       "-- B그룹(의심 {nb}) 오디오·book_dash 판만 유지, 그 외 전원 비활성화\n"
       "-- 실행: 팀장 전속. 반드시 step1 → step2 → step3 순서로 실행할 것\n"
       "-- 대상: 총 {ng}그룹 중 비활성화 {nd}권 (유지 {nk}권)\n"
       "-- DELETE 없음. books 스키마 변경 없음. 트리거 무접촉\n")
meta = {"na": len(type_a), "nb": len(type_b), "ng": len(groups),
        "nd": len(deact_ids), "nk": len(keep_ids)}

with open(SQL1, "w", encoding="utf-8") as f:
    f.write(HDR.format(step="step1 백업", **meta))
    f.write(f"\nDROP TABLE IF EXISTS {BACKUP_TABLE};\n\n")
    f.write(f"CREATE TABLE {BACKUP_TABLE} AS\nSELECT * FROM books\nWHERE id IN (\n")
    f.write(id_list_sql(deact_ids))
    f.write("\n);\n\n")
    f.write(f"-- 백업 행수 확인 (기대값: {len(deact_ids)})\n")
    f.write(f"SELECT count(*) AS backup_rows FROM {BACKUP_TABLE};\n\n")
    f.write("-- 기대값과 다르면 step2 로 진행하지 말 것\n")

with open(SQL2, "w", encoding="utf-8") as f:
    f.write(HDR.format(step="step2 비활성화", **meta))
    f.write(f"-- 선행조건: {BACKUP_TABLE} 이 {len(deact_ids)}행으로 생성되어 있을 것\n")
    f.write("-- DELETE 를 쓰지 않는다. is_active 플래그만 내린다\n\n")
    f.write("UPDATE books SET is_active = FALSE\nWHERE id IN (\n")
    f.write(id_list_sql(deact_ids))
    f.write("\n);\n\n")
    f.write(f"-- 영향 행수 확인 (기대값: {len(deact_ids)})\n")
    f.write(f"SELECT count(*) AS deactivated FROM books\n"
            f"WHERE is_active = FALSE AND id IN (SELECT id FROM {BACKUP_TABLE});\n\n")
    f.write("-- [비상 원복] 문제 발생 시 아래 주석을 해제해 실행\n")
    f.write(f"-- UPDATE books b SET is_active = k.is_active\n"
            f"--   FROM {BACKUP_TABLE} k WHERE b.id = k.id;\n")

with open(SQL3, "w", encoding="utf-8") as f:
    f.write(HDR.format(step="step3 검증", **meta))
    f.write(f"\n-- 검증 1) 비활성화 건수 (기대값: {len(deact_ids)})\n")
    f.write(f"SELECT count(*) AS deactivated_count FROM books\n"
            f"WHERE is_active = FALSE AND id IN (SELECT id FROM {BACKUP_TABLE});\n\n")
    f.write(f"-- 검증 2) 활성 잔여 총수 "
            f"(기대값: {ACTIVE_TOTAL} - {len(deact_ids)} = {ACTIVE_TOTAL - len(deact_ids)})\n")
    f.write("SELECT count(*) AS active_total FROM books WHERE is_active = TRUE;\n\n")
    f.write("-- 검증 3) 오디오 보유 도서 전원 활성 확인 (기대값: 0행)\n")
    f.write("SELECT b.id, b.title, b.source_platform\n"
            "FROM books b\nWHERE b.is_active = FALSE\n"
            "  AND EXISTS (SELECT 1 FROM book_audio a WHERE a.book_id = b.id);\n\n")
    f.write(f"-- 검증 4) book_dash 활성 권수 불변 확인 (기대값: {ACTIVE_BOOKDASH})\n")
    f.write("SELECT count(*) AS active_book_dash FROM books\n"
            "WHERE is_active = TRUE AND source_platform = 'book_dash';\n")

# ---------------------------------------------------------------- 요약
print("[6/6] 요약")
prev_deact = {r["id"] for r in prev_rows if r["처리"] == "비활성화"}
print(f"\n=== 최종 확정 ===")
print(f"그룹        : A {len(type_a)} + B {len(type_b)} = {len(groups)}")
print(f"유지 권수    : {len(keep_ids)}")
print(f"비활성화 권수: {len(deact_ids)}  (직전 {len(prev_deact)} -> {len(deact_ids)})")
print(f"활성 잔여    : {ACTIVE_TOTAL} - {len(deact_ids)} = {ACTIVE_TOTAL - len(deact_ids)}")
print(f"\nB그룹 전원 비활성화된 그룹: {len(b_all_deact)}개 {sorted(b_all_deact)[:20]}"
      f"{' ...' if len(b_all_deact) > 20 else ''}")
print(f"B그룹에서 소멸하는 제목    : {b_lost_titles}권")
print("\nA규칙별 결정 분포:")
for rule in RULE_ORDER:
    print(f"   {rule:20s} {rule_count.get(rule, 0):3d} 그룹")
print("\n비활성화 플랫폼:",
      dict(collections.Counter(f["source_platform"] for f in final if f["처리"] == "비활성화")))
print("유지 플랫폼    :",
      dict(collections.Counter(f["source_platform"] for f in final if f["처리"] == "유지")))
print("\nB그룹 내역:",
      dict(collections.Counter(f["처리"] for f in final if f["그룹유형"] == "B")))
