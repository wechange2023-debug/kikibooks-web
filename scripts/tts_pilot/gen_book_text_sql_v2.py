# -*- coding: utf-8 -*-
"""book_text 적재 SQL 생성기 v2 — ADR-0056 (asb_native 669권 + Book Dash html 39권).

`scripts/pdf_harvest/gen_book_text_sql.py`(ADR-0046/0047/0048, Book Dash 152권)의 SQL 조립부를
재사용하되, 하드코딩 6개(SRC_DIR·EXCLUDED_SLUGS·EXPECT_BOOKS·EXPECT_ROWS·N_SPLIT·PLATFORM
/SOURCE_LABEL)를 코호트 설정 + CLI 인자로 치환했다. **원본 스크립트는 무변경 보존한다.**

코호트 (ADR-0056 D4·D5·D10·D11·D12)
-----------------------------------
  asb      african_storybook · 원천 content_url 매니페스트 .txt · source='manifest_txt_v1'
  bloom    bloom             · 원천 content_url 매니페스트 .txt · source='manifest_txt_v1'
  bd_html  book_dash         · 원천 scripts/tts_pilot/out/{slug}.json · source='html_scene_json_v1'

결정문 준수
----------
  D2/D11  page_index = (P번호 | json page) - 1  → 0-based. 연속성 가드 통과 필수.
  D4      파싱은 asb-parser.ts 이식본 재사용(dryrun_asb_bloom.parse_asb_text). 복제·개선 금지.
  D6      정제는 tts_targets.sanitize() 공유. import 실패 시 폴백 없이 STOP.
  D7      정제 후 빈 면도 text='' 행으로 적재한다(면 수 = 행 수).
  D3      표지 행은 만들지 않는다.
  D5/D12  source 라벨은 코호트별 고정. book_text.source는 NOT NULL·기본값 제거(마이그레이션 007).
  D10     bd_html은 로컬 커밋 json만 읽는다. 재크롤·extract_text.py 재실행 금지.
  D13     기존 voice='Ruth' book_audio 행은 본 스크립트가 접근하지 않는다(book_text 전용).

운영 규율
--------
  · DB 쓰기 0 · Storage 0. 산출은 .sql 파일뿐이며 실행은 팀장(Supabase SQL Editor) 영역.
  · 각 step 파일은 **ROLLBACK; 으로 종료**한다. COMMIT은 팀장이 검증 후 직접 타이핑한다.
  · 조인 키는 **(source_platform, source_id) 쌍**이다. source_id 단독 비교를 하지 않는다.
  · 중복 정책: ON CONFLICT (book_id, page_index) DO NOTHING — 기존 행을 덮어쓰지 않는다.
    선검증 (a)가 0이 아니면 팀장이 중단하도록 파일 머리에 명시한다.

사용
----
  python scripts/tts_pilot/gen_book_text_sql_v2.py --cohort bloom \
      --source-ids-file scripts/tts_pilot/out/sql/_bloom_pilot10_ids.txt \
      --out-dir scripts/tts_pilot/out/sql --prefix bloom_pilot10 --split 1
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "tts_pilot"))
sys.path.insert(0, str(REPO / "scripts" / "text_harvest"))

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

# D6 — 정제기 공유. 로컬 복제본을 만들지 않는다.
try:
    from tts_targets import sanitize
except ImportError as exc:  # pragma: no cover
    raise SystemExit(f"[STOP] tts_targets.sanitize 임포트 실패 — {exc}") from exc

# D4 — asb-parser.ts 이식본 공유(669권 실행 검증 완료). 재이식·개선 금지.
try:
    from dryrun_asb_bloom import parse_asb_text
except ImportError as exc:  # pragma: no cover
    raise SystemExit(f"[STOP] parse_asb_text 임포트 실패 — {exc}") from exc

COHORTS = {
    "asb":     {"platform": "african_storybook", "source_label": "manifest_txt_v1",
                "origin": "manifest", "adr": "ADR-0056 D1·D2·D4·D5"},
    "bloom":   {"platform": "bloom",             "source_label": "manifest_txt_v1",
                "origin": "manifest", "adr": "ADR-0056 D1·D2·D4·D5"},
    "bd_html": {"platform": "book_dash",         "source_label": "html_scene_json_v1",
                "origin": "scene_json", "adr": "ADR-0056 D9~D12"},
}
DEFAULT_TARGETS = REPO / "scratchpad" / "text_harvest" / "asb_bloom_targets.csv"
SCENE_JSON_DIR = REPO / "scripts" / "tts_pilot" / "out"


def sql_str(s: str) -> str:
    """작은따옴표 SQL 리터럴."""
    return "'" + s.replace("'", "''") + "'"


def guard_dollar(slug: str, page: int, field: str, val: str) -> None:
    """$$ 달러 인용 오파싱 방지 가드 (원본 :96-101 승계)."""
    if "$$" in val:
        raise SystemExit(f"[STOP] {slug} p{page} {field}: '$$' 포함 — 파일 미생성")
    if val.endswith("$"):
        raise SystemExit(f"[STOP] {slug} p{page} {field}: '$' 종결 — 파일 미생성")


# ─────────────────────────────────────────────────────────────────────────────
# 원천 로드
# ─────────────────────────────────────────────────────────────────────────────
def load_manifest_books(cohort: str, source_ids: list[str], targets_csv: Path) -> list[dict]:
    """ASb·Bloom — content_url 매니페스트 .txt를 GET해 파싱(D4). 읽기 전용."""
    import csv
    import requests

    plat = COHORTS[cohort]["platform"]
    rows = {r["source_id"]: r for r in csv.DictReader(targets_csv.open(encoding="utf-8-sig"))
            if r["source_platform"] == plat}
    missing = [s for s in source_ids if s not in rows]
    if missing:
        raise SystemExit(f"[STOP] targets CSV에 없는 source_id {len(missing)}건: {missing[:5]}")

    session = requests.Session()
    books = []
    for sid in source_ids:
        r = rows[sid]
        url = (r.get("content_url") or "").strip()
        if not url:
            raise SystemExit(f"[STOP] {sid}: content_url 공백")
        resp = session.get(url, timeout=30)
        if resp.status_code != 200:
            raise SystemExit(f"[STOP] {sid}: HTTP {resp.status_code} — {url}")
        resp.encoding = "utf-8"
        texts, _images, p_numbers = parse_asb_text(resp.text)
        if not texts:
            raise SystemExit(f"[STOP] {sid}: 파싱 텍스트 0면")
        # D2 가드 — P번호가 1부터 연속이어야 page_index = P-1 이 성립한다.
        if p_numbers != list(range(1, len(p_numbers) + 1)):
            raise SystemExit(f"[STOP] {sid}: P번호 비연속 {p_numbers[:12]}")
        if len(p_numbers) != len(texts):
            raise SystemExit(f"[STOP] {sid}: P번호 {len(p_numbers)} != texts {len(texts)}")
        books.append({"key": sid, "title": r.get("title", ""),
                      "pages": [{"page": p, "text": t} for p, t in zip(p_numbers, texts)]})
        print(f"  fetch OK  {sid}  {len(texts):>3}면  {r.get('title','')[:36]}")
    return books


def load_scene_json_books(source_ids: list[str], slug_map: dict[str, str]) -> list[dict]:
    """Book Dash html — 로컬 커밋 json만 읽는다(D10). 네트워크 0."""
    books = []
    for sid in source_ids:
        slug = slug_map[sid]
        path = SCENE_JSON_DIR / f"{slug}.json"
        if not path.exists():
            raise SystemExit(f"[STOP] {slug}: 원천 json 부재 — {path}")
        scenes = json.loads(path.read_text(encoding="utf-8"))
        pages = [{"page": sc["page"], "text": sc.get("text") or ""} for sc in scenes]
        nums = [p["page"] for p in pages]
        # D11 가드 — json page는 1부터 연속(extract_text.py:154).
        if nums != list(range(1, len(nums) + 1)):
            raise SystemExit(f"[STOP] {slug}: page 비연속 {nums[:12]}")
        books.append({"key": sid, "title": slug, "pages": pages})
        print(f"  local OK  {slug}  {len(pages):>3}면")
    return books


# ─────────────────────────────────────────────────────────────────────────────
# SQL 조립 (원본 :89-182 재사용)
# ─────────────────────────────────────────────────────────────────────────────
def build_rows(book: dict) -> tuple[list[str], int]:
    """한 권 → VALUES 행. 반환 (행 리스트, 정제 후 빈 면 수).

    D6 정제 → D7에 따라 빈 면도 text='' 행을 만든다(면 수 = 행 수).
    blocks는 NULL — 매니페스트·장면 JSON에는 블록 정보가 없다(스키마상 nullable).
    """
    rows, empties = [], 0
    for p in book["pages"]:
        page_index = p["page"] - 1  # D2 / D11
        text = sanitize(p["text"])[0]
        if not text:
            empties += 1
        guard_dollar(book["key"], p["page"], "text", text)
        rows.append(f"    ({sql_str(book['key'])}, {page_index}, $${text}$$)")
    return rows, empties


def chunk(books: list[dict], n: int) -> list[list[dict]]:
    """권 단위 n등분 (권이 파일 경계를 넘지 않게). 원본 :108-118 승계."""
    size, rem, out, idx = len(books) // n, len(books) % n, [], 0
    for i in range(n):
        take = size + (1 if i < rem else 0)
        out.append(books[idx: idx + take])
        idx += take
    return [c for c in out if c]


def id_in_list(keys: list[str]) -> str:
    return ", ".join(sql_str(k) for k in keys)


def render_sql(part: int, total: int, books: list[dict], cohort: str, prefix: str) -> tuple[str, int, int]:
    cfg = COHORTS[cohort]
    plat, label = cfg["platform"], cfg["source_label"]
    keys = [b["key"] for b in books]
    all_rows, empties = [], 0
    for b in books:
        r, e = build_rows(b)
        all_rows.extend(r)
        empties += e
    m_rows = len(all_rows)
    in_list = id_in_list(keys)

    L = []
    L.append(f"-- 목적: book_text 페이지 단위 본문 적재 ({cohort} · 이 파일: {part}of{total})")
    L.append("-- 실행자: 팀장(Supabase SQL Editor). 워커 초안. 워커 DB 직접 쓰기 금지.")
    L.append(f"-- 근거 ADR: ADR-0056 ({cfg['adr']}) · Accepted 2026-08-10")
    L.append(f"-- source 라벨: {label}")
    L.append(f"-- 이 파일 담당: {len(books)}권 / {m_rows}행 (정제 후 빈 면 {empties}행 포함 — D7)")
    L.append("-- 생성기: scripts/tts_pilot/gen_book_text_sql_v2.py")
    L.append("-- 매핑: page_index = (P번호|json page) - 1 (0-based, D2/D11). blocks = NULL(원천에 블록 정보 없음).")
    L.append("-- 정제: tts_targets.sanitize() 공유(D6). 표지 행 없음(D3).")
    L.append("-- 인용: $$ 달러 인용. 생성 시 '$$' 포함·'$' 종결 전수 가드 통과.")
    L.append("-- 중복: ON CONFLICT (book_id, page_index) DO NOTHING — 기존 행을 덮어쓰지 않는다.")
    L.append("--")
    L.append("-- ★ 이 파일은 ROLLBACK; 으로 끝난다. [적재검증]까지 기대값과 일치하면")
    L.append("--   마지막 ROLLBACK; 을 COMMIT; 으로 직접 바꿔 타이핑해 확정한다.")
    L.append("")
    L.append("-- ───────── [선검증] 트랜잭션 밖 ─────────")
    L.append(f"-- (a) 대상 권의 기존 book_text 행 수 — 기대 0. 0이 아니면 중단하고 보고할 것.")
    L.append("SELECT count(*) AS rows_before FROM book_text bt")
    L.append("  JOIN books b ON b.id = bt.book_id")
    L.append(f"  WHERE b.source_platform='{plat}' AND b.source_id IN ({in_list});")
    L.append(f"-- (b) 대상 source_id 중 books에 존재하는 권 수 — 기대 {len(books)}")
    L.append("SELECT count(*) AS books_found FROM books")
    L.append(f"  WHERE source_platform='{plat}' AND source_id IN ({in_list});")
    L.append("")
    L.append("-- ───────── [적재] ─────────")
    L.append("BEGIN;")
    L.append("INSERT INTO book_text (book_id, page_index, text, blocks, source)")
    L.append(f"SELECT b.id, v.page_index, v.text, NULL::jsonb, $${label}$$")
    L.append("  FROM (VALUES")
    L.append(",\n".join(all_rows))
    L.append("  ) AS v(source_id, page_index, text)")
    L.append("  JOIN books b")
    L.append(f"    ON b.source_platform = '{plat}' AND b.source_id = v.source_id")
    L.append("ON CONFLICT (book_id, page_index) DO NOTHING;")
    L.append("")
    L.append("-- ───────── [적재검증] 트랜잭션 안 ─────────")
    L.append(f"-- (c) 적재 후 행 수 — 기대 {m_rows}")
    L.append("SELECT count(*) AS rows_after FROM book_text bt")
    L.append("  JOIN books b ON b.id = bt.book_id")
    L.append(f"  WHERE b.source_platform='{plat}' AND b.source_id IN ({in_list});")
    L.append(f"-- (d) 조인 실패로 누락된 source_id — 기대 0행")
    vrows = ", ".join(f"({sql_str(k)})" for k in keys)
    L.append(f"SELECT v.source_id FROM (VALUES {vrows}) AS v(source_id)")
    L.append("  WHERE NOT EXISTS (SELECT 1 FROM books b")
    L.append(f"     WHERE b.source_platform='{plat}' AND b.source_id=v.source_id);")
    L.append(f"-- (e) source 라벨 분포 — 기대 {label} 1종 / {m_rows}행")
    L.append("SELECT bt.source, count(*) FROM book_text bt JOIN books b ON b.id=bt.book_id")
    L.append(f"  WHERE b.source_platform='{plat}' AND b.source_id IN ({in_list})")
    L.append("  GROUP BY bt.source;")
    L.append(f"-- (f) page_index 축 검증 — 권마다 0부터 연속이어야 한다. 기대 0행(위반 없음)")
    L.append("SELECT b.source_id, min(bt.page_index) AS mn, max(bt.page_index) AS mx, count(*) AS n")
    L.append("  FROM book_text bt JOIN books b ON b.id=bt.book_id")
    L.append(f"  WHERE b.source_platform='{plat}' AND b.source_id IN ({in_list})")
    L.append("  GROUP BY b.source_id HAVING min(bt.page_index) <> 0 OR max(bt.page_index) <> count(*)-1;")
    L.append(f"-- (g) 빈 면 행 수 — 기대 {empties} (D7: 빈 면도 text='' 로 적재)")
    L.append("SELECT count(*) AS empty_rows FROM book_text bt JOIN books b ON b.id=bt.book_id")
    L.append(f"  WHERE b.source_platform='{plat}' AND b.source_id IN ({in_list}) AND bt.text = '';")
    L.append("")
    L.append("-- ───────── [종료] ─────────")
    L.append("-- (c)~(g)가 전부 기대값과 일치하면 아래 ROLLBACK; 을 COMMIT; 으로 바꿔 타이핑한다.")
    L.append("ROLLBACK;")
    L.append("")
    return "\n".join(L), m_rows, empties


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", required=True, choices=sorted(COHORTS))
    ap.add_argument("--source-ids", default=None, help="쉼표구분 source_id")
    ap.add_argument("--source-ids-file", default=None, help="줄단위 source_id 파일")
    ap.add_argument("--targets", default=str(DEFAULT_TARGETS), help="ASb·Bloom content_url CSV")
    ap.add_argument("--slug-map", default=None, help="bd_html 전용: source_id,slug CSV")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--split", type=int, default=1)
    ap.add_argument("--expect-books", type=int, default=None)
    ap.add_argument("--expect-rows", type=int, default=None)
    ap.add_argument("--exclude", default="", help="쉼표구분 제외 source_id")
    args = ap.parse_args()

    if bool(args.source_ids) == bool(args.source_ids_file):
        raise SystemExit("[STOP] --source-ids 와 --source-ids-file 중 정확히 하나를 지정")
    raw = (args.source_ids.split(",") if args.source_ids
           else Path(args.source_ids_file).read_text(encoding="utf-8").split())
    excl = {s.strip() for s in args.exclude.split(",") if s.strip()}
    ids = [s.strip() for s in raw if s.strip() and s.strip() not in excl]
    if len(ids) != len(set(ids)):
        raise SystemExit("[STOP] source_id 중복")
    print(f"[{args.cohort}] 대상 {len(ids)}권 (제외 {len(excl)}건 적용)")

    if COHORTS[args.cohort]["origin"] == "manifest":
        books = load_manifest_books(args.cohort, ids, Path(args.targets))
    else:
        if not args.slug_map:
            raise SystemExit("[STOP] bd_html은 --slug-map 필수")
        import csv
        sm = {r["source_id"]: r["slug"] for r in csv.DictReader(Path(args.slug_map).open(encoding="utf-8-sig"))}
        miss = [s for s in ids if s not in sm]
        if miss:
            raise SystemExit(f"[STOP] slug-map 누락 {len(miss)}건: {miss[:5]}")
        books = load_scene_json_books(ids, sm)

    books.sort(key=lambda b: b["key"])
    total_rows = sum(len(b["pages"]) for b in books)
    if args.expect_books is not None and len(books) != args.expect_books:
        raise SystemExit(f"[STOP] 권수 {len(books)} != 기대 {args.expect_books}")
    if args.expect_rows is not None and total_rows != args.expect_rows:
        raise SystemExit(f"[STOP] 행수 {total_rows} != 기대 {args.expect_rows}")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    parts = chunk(books, args.split)
    grand, grand_empty, summary = 0, 0, []
    for i, pb in enumerate(parts, start=1):
        sql, m, e = render_sql(i, len(parts), pb, args.cohort, args.prefix)
        path = out_dir / f"{args.prefix}_{i}of{len(parts)}.sql"
        path.write_text(sql, encoding="utf-8")
        grand += m
        grand_empty += e
        summary.append((path.name, len(pb), m, e))

    print("\n[파일별 산출]")
    for name, nb, mr, e in summary:
        print(f"  {name}: {nb}권 / {mr}행 (빈 면 {e}행 포함)")
    print(f"\n행 수 합계 {grand} (원천 면 수 합계 {total_rows}) · 빈 면 {grand_empty}행")
    if grand != total_rows:
        raise SystemExit(f"[STOP] 행 수 {grand} != 면 수 {total_rows}")
    print("OK: 면 수 = 행 수 (D7 준수 — 빈 면도 행 생성).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
