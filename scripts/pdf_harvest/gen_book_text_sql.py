# -*- coding: utf-8 -*-
"""book_text 적재 SQL 생성기 (ADR-0046 스키마 / ADR-0047 대상 152권).

입력 : scripts/pdf_harvest/out_fixed_154/*.fixed.json (ADR-0044 order_fix 확정 JSON)
출력 : scratchpad/step9_book_text_insert_{1..4}of4.sql (slug 오름차순 38/38/38/38 분할)
실행 : python scripts/pdf_harvest/gen_book_text_sql.py   (DB 쓰기 없음. 팀장이 SQL Editor에서 실행)

매핑 (ADR-0046):
  page_index = page_no - 1        # D2, 0-based
  text       = pages[].text       # 확정 낭독본
  blocks     = json.dumps(pages[].blocks, ensure_ascii=False)  # 검수 원본 블록 → jsonb

조인 : books.source_platform='book_dash' AND books.source_id = slug
       (books UNIQUE(source_platform, source_id) — 001_initial_schema.sql:102)
인용 : $$ 달러 인용. 데이터에 '$$'·단일 '$' 전무 실측(정찰 #2 item4) → 안전.
       그래도 가드로 재검(발견 시 raise → STOP).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PH = Path(__file__).resolve().parent
SRC_DIR = PH / "out_fixed_154"
REPO = PH.parent.parent
OUT_DIR = REPO / "scratchpad"

EXCLUDED_SLUGS = {"mogaus-gift", "the-baby-book"}  # ADR-0047 결손 2권 (WP 이미지 body_pages=1)

EXPECT_BOOKS = 152
EXPECT_ROWS = 2128
N_SPLIT = 4
PLATFORM = "book_dash"
SOURCE_LABEL = "pdf_harvest_v2_orderfix"  # ADR-0048 D1 (출처 체인: coords 재추출 → order_fix)


def sql_str(s: str) -> str:
    """작은따옴표 SQL 리터럴 (slug 목록용). slug는 영숫자+하이픈이라 이스케이프 불요이나 안전하게 처리."""
    return "'" + s.replace("'", "''") + "'"


def load_books() -> list[dict]:
    """out_fixed_154에서 대상 slug만 로드. 메타(_*.json) 스킵, 제외 목록 적용."""
    skipped_meta = []
    excluded_hit = []
    pipelines = set()
    books = []
    for f in sorted(SRC_DIR.glob("*.json")):
        name = f.name
        if name.startswith("_"):
            skipped_meta.append(name)
            continue
        if not name.endswith(".fixed.json"):
            skipped_meta.append(name)
            continue
        slug = name[: -len(".fixed.json")]
        if slug in EXCLUDED_SLUGS:
            excluded_hit.append(slug)
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        pages = data.get("pages", [])
        pipelines.add(data.get("pipeline"))
        # 가드: page_no가 1부터 연속인지
        for i, p in enumerate(pages):
            expected = i + 1
            if p.get("page_no") != expected:
                raise SystemExit(
                    f"[STOP] {slug}: page_no 불연속 — index {i} 기대 {expected}, 실제 {p.get('page_no')}"
                )
        books.append({"slug": slug, "pages": pages})

    print(f"메타/스킵 파일: {len(skipped_meta)}개 {sorted(skipped_meta)}")
    print(f"제외 slug (ADR-0047): {sorted(excluded_hit)}")
    print(f"pipeline distinct 값: {sorted(str(p) for p in pipelines)}")

    # 가드: pipeline 값 1종 (추적용 — source로 쓰지는 않음, ADR-0048 D1)
    if len(pipelines) != 1:
        raise SystemExit(f"[STOP] pipeline 값 {len(pipelines)}종 != 1종 — 파일 미생성")

    # 가드: 정확히 152권
    if len(books) != EXPECT_BOOKS:
        raise SystemExit(f"[STOP] 처리 대상 {len(books)}권 != 기대 {EXPECT_BOOKS}권 — 파일 미생성")

    books.sort(key=lambda b: b["slug"])
    return books


def build_rows(book: dict) -> list[str]:
    """한 권 → VALUES 행 문자열 리스트."""
    rows = []
    for p in book["pages"]:
        page_index = p["page_no"] - 1
        text = p.get("text", "")
        blocks = json.dumps(p.get("blocks", []), ensure_ascii=False)
        # 가드: $$ 및 단일 $ 종결 (달러 인용 오파싱 방지)
        for field, val in (("text", text), ("blocks", blocks)):
            if "$$" in val:
                raise SystemExit(f"[STOP] {book['slug']} p{p['page_no']} {field}: '$$' 포함 — 미생성")
            if val.endswith("$"):
                raise SystemExit(f"[STOP] {book['slug']} p{p['page_no']} {field}: '$' 종결 — 미생성")
        rows.append(
            f"    ({sql_str(book['slug'])}, {page_index}, $${text}$$, $${blocks}$$)"
        )
    return rows


def chunk(books: list[dict], n: int) -> list[list[dict]]:
    """권 단위로 n등분 (권이 파일 경계를 넘지 않게). 152/4=38 균등."""
    size = len(books) // n
    rem = len(books) % n
    out = []
    idx = 0
    for i in range(n):
        take = size + (1 if i < rem else 0)
        out.append(books[idx : idx + take])
        idx += take
    return out


def slug_in_list(slugs: list[str]) -> str:
    return ", ".join(sql_str(s) for s in slugs)


def render_sql(part: int, total: int, books: list[dict]) -> tuple[str, int]:
    slugs = [b["slug"] for b in books]
    n_books = len(books)
    all_rows = []
    for b in books:
        all_rows.extend(build_rows(b))
    m_rows = len(all_rows)
    in_list = slug_in_list(slugs)
    values_list = slug_in_list(slugs)  # 후검증 (d) VALUES 용은 아래서 별도 구성

    lines = []
    lines.append(f"-- 목적: book_text 페이지 단위 확정텍스트 적재 (이 파일: {part}of{total})")
    lines.append("-- 실행자: 팀장(Supabase SQL Editor). 워커 초안. DB 직접 쓰기 금지.")
    lines.append("-- 값 출처: scripts/pdf_harvest/out_fixed_154 (ADR-0044 order_fix 확정 JSON)")
    lines.append("-- 근거 ADR: ADR-0046, ADR-0047, ADR-0048")
    lines.append(f"-- source: {SOURCE_LABEL} (ADR-0048 D1)")
    lines.append(f"-- 이 파일 담당: slug {slugs[0]} ~ {slugs[-1]}, {n_books}권 / {m_rows}행")
    lines.append("-- 생성기: scripts/pdf_harvest/gen_book_text_sql.py")
    lines.append("-- 매핑: page_index = page_no - 1 (ADR-0046 D2). blocks = order_fix 원본 블록 → jsonb.")
    lines.append("-- 인용: $$ 달러 인용 (데이터에 '$$'·단일 '$' 전무 검증). ON CONFLICT DO NOTHING → 재실행 안전.")
    lines.append("")
    lines.append("-- ───────── [선검증] ─────────")
    lines.append("-- (a) 적재 전 이 파일 대상 권의 book_text 행 수 (기대 0)")
    lines.append("SELECT count(*) AS rows_before FROM book_text bt")
    lines.append("  JOIN books b ON b.id = bt.book_id")
    lines.append(f"  WHERE b.source_platform='{PLATFORM}' AND b.source_id IN ({in_list});")
    lines.append(f"-- (b) 이 파일 대상 slug 중 books에 존재하는 권 수 (기대 = {n_books})")
    lines.append("SELECT count(*) AS books_found FROM books")
    lines.append(f"  WHERE source_platform='{PLATFORM}' AND source_id IN ({in_list});")
    lines.append("")
    lines.append("-- ───────── [적재] ─────────")
    lines.append("BEGIN;")
    lines.append("INSERT INTO book_text (book_id, page_index, text, blocks, source)")
    lines.append(f"SELECT b.id, v.page_index, v.text, v.blocks::jsonb, $${SOURCE_LABEL}$$")
    lines.append("  FROM (VALUES")
    lines.append(",\n".join(all_rows))
    lines.append("  ) AS v(slug, page_index, text, blocks)")
    lines.append("  JOIN books b")
    lines.append(f"    ON b.source_platform = '{PLATFORM}' AND b.source_id = v.slug")
    lines.append("ON CONFLICT (book_id, page_index) DO NOTHING;")
    lines.append("COMMIT;")
    lines.append("")
    lines.append("-- ───────── [후검증] ─────────")
    lines.append(f"-- (c) 적재 후 이 파일 대상 권의 book_text 행 수 (기대 = {m_rows})")
    lines.append("SELECT count(*) AS rows_after FROM book_text bt")
    lines.append("  JOIN books b ON b.id = bt.book_id")
    lines.append(f"  WHERE b.source_platform='{PLATFORM}' AND b.source_id IN ({in_list});")
    lines.append("-- (d) 조인 실패로 누락된 slug 확인 (기대 0행)")
    values_rows = ", ".join(f"({sql_str(s)})" for s in slugs)
    lines.append(f"SELECT DISTINCT v.slug FROM (VALUES {values_rows}) AS v(slug)")
    lines.append("  WHERE NOT EXISTS (SELECT 1 FROM books b")
    lines.append(f"     WHERE b.source_platform='{PLATFORM}' AND b.source_id=v.slug);")
    lines.append(f"-- (e) source 라벨 확인 (기대: {SOURCE_LABEL} 1종 / {m_rows}행)")
    lines.append("SELECT bt.source, count(*) FROM book_text bt JOIN books b ON b.id=bt.book_id")
    lines.append(f"  WHERE b.source_platform='{PLATFORM}' AND b.source_id IN ({in_list})")
    lines.append("  GROUP BY bt.source;")
    lines.append("")
    return "\n".join(lines), m_rows


def main() -> None:
    books = load_books()
    total_rows = sum(len(b["pages"]) for b in books)
    print(f"처리 대상: {len(books)}권 / 총 {total_rows}행")

    parts = chunk(books, N_SPLIT)
    grand_rows = 0
    summary = []
    for i, part_books in enumerate(parts, start=1):
        sql, m_rows = render_sql(i, N_SPLIT, part_books)
        out_path = OUT_DIR / f"step9_book_text_insert_{i}of{N_SPLIT}.sql"
        out_path.write_text(sql, encoding="utf-8")
        grand_rows += m_rows
        summary.append(
            (out_path.name, len(part_books), m_rows, part_books[0]["slug"], part_books[-1]["slug"])
        )

    print("\n[파일별 산출]")
    for name, nb, mr, s0, s1 in summary:
        print(f"  {name}: {nb}권 / {mr}행 ({s0} ~ {s1})")
    print(f"\n행 수 합계: {grand_rows} (기대 {EXPECT_ROWS})")

    if grand_rows != EXPECT_ROWS:
        raise SystemExit(f"[STOP] 행 수 합계 {grand_rows} != 기대 {EXPECT_ROWS}")
    print("OK: 행 수 합계 일치.")


if __name__ == "__main__":
    main()
