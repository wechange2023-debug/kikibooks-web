#!/usr/bin/env python3
"""build_asb_bloom_image_backfill.py — ASb 527 / Bloom 142 페이지 이미지 URL 백필 SQL 생성.

목적
----
ADR-0057 **D5-②**. `book_text.image_url`이 NULL인 ASb·Bloom 669권에 대해,
매니페스트 `.txt`의 `images:` 섹션에서 이미지 절대 URL을 뽑아 **UPDATE SQL을 생성**한다.

★ 본 스크립트는 DB에 접속하지 않는다.
    DB 읽기 0건 · DB 쓰기 0건 · Storage 쓰기 0건.
    하는 일은 (1) 팀장 export CSV 읽기 (2) content_url GET (3) 파싱 (4) SQL 파일 기록뿐이다.
    생성된 SQL의 실행은 전적으로 팀장(SQL Editor) 몫이다.

★ 파서를 새로 쓰지 않는다 (ADR-0057 D5-② · ADR-0056 D4).
    `scripts/text_harvest/dryrun_asb_bloom.py`의 `parse_asb_text()`·`fetch_text()`를
    **import 해서 그대로 쓴다.** 그 함수들은 `lib/book/asb-parser.ts`와 1:1 대조 주석을 달고
    669권 전수 실행 검증을 마친 이식본이다. 로컬 복제본·규칙 개선을 만들지 않는다 —
    서버 사본이 화면(AsbReader)과 어긋나면 백필의 의미가 사라진다.

짝짓기 축 (ADR-0025 Amd#6 A2 / ADR-0057 D5-②)
----------------------------------------------
    images[i]  ↔  page_index = i        (0-based, ADR-0046 D2)

    emit 범위 = range(min(len(texts), len(images)))  ← 교집합만 낸다

      · len(images) < len(texts)  → 뒤쪽 면은 **행을 만들지 않는다**(image_url NULL 유지).
        "이미지 없는 면"은 오류가 아니라 정상 상태다(Amd#6 A3 / ADR-0057 D1).
      · len(images) > len(texts)  → 남는 이미지는 **버린다**. 대응하는 book_text 행이
        존재하지 않으므로(적재 시 행 수 = len(texts), ADR-0056 D2·D7) UPDATE가 매칭될
        대상이 없다. 행을 만들면 스테이징 미매칭 잔여로만 남아 검증을 흐린다.
      · 강제 1:1 · 번호 정렬 매핑 금지(Amd#6 A4) — images는 원문 순서·중복 그대로다.

URL 가공 (ADR-0057 D2)
----------------------
    파서의 `to_absolute_image_url()`이 하는 http→https 승격 외에 **아무 가공도 하지 않는다.**
    저장 값은 그대로 <img src>에 넣을 수 있는 완성된 절대 URL이며,
    `image_url NOT LIKE 'http%'` = 0행이 불변식이다(ADR-0057 D5-④ (d)).

입력
----
    scratchpad/text_harvest/asb_bloom_targets.csv   (팀장 SQL Editor export, 669행)
    필수 컬럼: id, source_platform, source_id, title, content_url
    ※ `id`(book_id) 컬럼은 **사용하지 않는다.** book_id 매핑은 머지 SQL의 books 조인이
      담당한다(ADR-0057 D5-② 지시 — DB가 진실). 본 스크립트는 4열만 산출한다.
    ※ bloom의 content_url에는 Supabase 프로젝트 URL이 포함된다. **화면·리포트·SQL 어디에도
      출력하지 않는다**(SQL 산출물은 외부 CDN 이미지 URL만 담는다).

출력 (scripts/image_backfill/out/ 아래)
---------------------------------------
    _dryrun_report.json      집계 리포트(게이트 판정 근거)
    _progress.jsonl          권별 원시 결과(재개용). --resume 이 읽는다.
    per_book.csv             권별 1행 (n_text/n_image/emitted/missing/extra)
    sql/step0_staging.sql    스테이징 테이블 생성
    sql/chunk_NN.sql         VALUES INSERT 청크
    sql/step2_merge.sql      조인 UPDATE 리허설(BEGIN … 검증 … ROLLBACK)
    sql/step3_verify.sql     COMMIT 후 최종 검증
    sql/step4_drop.sql       스테이징 DROP

사용
----
    python scripts/image_backfill/build_asb_bloom_image_backfill.py --check-input
    python scripts/image_backfill/build_asb_bloom_image_backfill.py
    python scripts/image_backfill/build_asb_bloom_image_backfill.py --resume
    python scripts/image_backfill/build_asb_bloom_image_backfill.py --platform bloom --limit 5
    python scripts/image_backfill/build_asb_bloom_image_backfill.py --sql-only --resume
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from collections import Counter
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

REPO = Path(__file__).resolve().parent.parent.parent
IN_CSV = REPO / "scratchpad" / "text_harvest" / "asb_bloom_targets.csv"
OUT_DIR = Path(__file__).resolve().parent / "out"
SQL_DIR = OUT_DIR / "sql"
PROGRESS = OUT_DIR / "_progress.jsonl"

# 파서·fetch는 드라이런 스크립트에서 import 한다(복제본 금지 — ADR-0056 D4).
sys.path.insert(0, str(REPO / "scripts" / "text_harvest"))
try:
    from dryrun_asb_bloom import fetch_text, parse_asb_text  # noqa: E402
except ImportError as exc:  # pragma: no cover
    print(
        f"[STOP] dryrun_asb_bloom 임포트 실패 — {exc}\n"
        "  파서는 asb-parser.ts 이식본을 공유해야 한다. 로컬 복제본을 만들지 말 것."
    )
    raise SystemExit(2) from exc

REQUIRED_COLS = ("id", "source_platform", "source_id", "title", "content_url")
VALID_PLATFORMS = ("african_storybook", "bloom")

SLEEP_BETWEEN = 0.3          # dryrun_asb_bloom과 동일(동시성 1, 요청 간 0.3초)

# 청크 분할 — SQL Editor 안전 크기. ADR-0053 §Amd#4 선례(최대 156KB)보다 보수적으로 잡는다.
CHUNK_ROWS = 800
CHUNK_MAX_BYTES = 150_000

# 백필 전 실측 고정치 (팀장 SQL 실측 2026-08-13). 검증 SQL의 기대값 산출에 쓴다.
TOTAL_ROWS = 9_496           # book_text 전체 행수
TOTAL_BOOKS = 860            # book_text distinct book_id
BOOKDASH_NOT_NULL = 2_597    # D5-① 백필 완료분(book_dash 191권)

STAGING = "public._img_backfill_staging"


# ─────────────────────────────────────────────────────────────────────────────
# 입력
# ─────────────────────────────────────────────────────────────────────────────
def load_targets(path: Path, platform: str | None, limit: int | None) -> list[dict]:
    if not path.exists():
        print(f"[STOP] 입력 CSV 없음 — {path}")
        raise SystemExit(2)

    with path.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    if not rows:
        print("[STOP] 입력 CSV 0행")
        raise SystemExit(2)

    missing = [c for c in REQUIRED_COLS if c not in rows[0]]
    if missing:
        print(f"[STOP] 필수 컬럼 누락 — {missing}")
        raise SystemExit(2)

    bad = [r for r in rows if r["source_platform"] not in VALID_PLATFORMS]
    if bad:
        print(f"[STOP] 허용되지 않은 source_platform {len(bad)}행 — {bad[0]['source_platform']}")
        raise SystemExit(2)

    empty_url = [r for r in rows if not (r.get("content_url") or "").strip()]
    if empty_url:
        print(f"[STOP] content_url 빈 값 {len(empty_url)}행")
        raise SystemExit(2)

    keys = {(r["source_platform"], r["source_id"]) for r in rows}
    if len(keys) != len(rows):
        print(f"[STOP] (source_platform, source_id) 중복 — {len(rows)}행 중 고유 {len(keys)}건")
        raise SystemExit(2)

    if platform:
        rows = [r for r in rows if r["source_platform"] == platform]
    if limit:
        rows = rows[:limit]
    return rows


def load_progress() -> dict[tuple[str, str], dict]:
    done: dict[tuple[str, str], dict] = {}
    if not PROGRESS.exists():
        return done
    with PROGRESS.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            done[(rec["platform"], rec["source_id"])] = rec
    return done


# ─────────────────────────────────────────────────────────────────────────────
# 권별 처리
# ─────────────────────────────────────────────────────────────────────────────
def process(row: dict, session) -> dict:
    """권 1건 → 산출 레코드. rows[] 는 (page_index, image_url) 쌍."""
    rec = {
        "platform": row["source_platform"],
        "source_id": row["source_id"],
        "title": row.get("title") or "",
        "fetch_ok": False,
        "http_status": "",
        "error": "",
        "n_text": 0,
        "n_image": 0,
        "emitted": 0,
        "missing": 0,       # 이미지가 모자라 NULL로 남는 면 수 (n_text - emitted)
        "extra": 0,         # 대응 book_text 행이 없어 버린 이미지 수 (n_image - emitted)
        "bad_scheme": 0,
        "rows": [],
    }

    status, body, error = fetch_text(session, row["content_url"], retry_4xx=False)
    rec["http_status"] = status if status is not None else ""
    if body is None:
        rec["error"] = error
        return rec

    rec["fetch_ok"] = True
    texts, images, _p_numbers = parse_asb_text(body)
    rec["n_text"] = len(texts)
    rec["n_image"] = len(images)

    n = min(len(texts), len(images))
    rec["emitted"] = n
    rec["missing"] = len(texts) - n
    rec["extra"] = len(images) - n

    for i in range(n):
        url = images[i]
        if not url.lower().startswith("http"):
            rec["bad_scheme"] += 1
            continue
        rec["rows"].append([i, url])

    # 교집합 산정과 실제 행 수가 어긋나면(= bad_scheme 발생) emitted를 실측으로 정정한다.
    rec["emitted"] = len(rec["rows"])
    return rec


# ─────────────────────────────────────────────────────────────────────────────
# SQL 생성
# ─────────────────────────────────────────────────────────────────────────────
def sql_str(value: str) -> str:
    """작은따옴표 이스케이프. 제어문자가 섞이면 즉시 STOP(조용한 오염 금지)."""
    if any(ord(ch) < 32 for ch in value):
        print(f"[STOP] 제어문자 포함 값 — {value!r}")
        raise SystemExit(3)
    return "'" + value.replace("'", "''") + "'"


def write_step0() -> Path:
    path = SQL_DIR / "step0_staging.sql"
    path.write_text(
        "-- 목적: ASb·Bloom 이미지 URL 백필용 임시 스테이징 테이블 생성\n"
        "-- ADR: ADR-0057 D5-②\n"
        "-- 적용: PM이 Supabase Dashboard → SQL Editor에 붙여넣기 → Run\n"
        "-- ★실행 순서: 본 step0 → chunk_01..NN → step2_merge(리허설→COMMIT) → step3_verify → step4_drop\n"
        "-- 주의:\n"
        "--   - 임시 테이블이다. step4_drop.sql로 반드시 지운다(ADR-0053 Amd#4 staging 선례).\n"
        "--   - RLS 미설정 = service_role/SQL Editor 전용. 앱 코드는 이 테이블을 모른다.\n"
        "--   - 재실행 안전(create table if not exists).\n"
        "--   - 원복: drop table if exists " + STAGING + ";\n"
        "\n"
        f"create table if not exists {STAGING} (\n"
        "  source_platform text not null,\n"
        "  source_id       text not null,\n"
        "  page_index      int  not null,\n"
        "  image_url       text not null\n"
        ");\n"
        "\n"
        f"create index if not exists _img_backfill_staging_src_idx\n"
        f"  on {STAGING} (source_platform, source_id);\n"
        "\n"
        "-- 기대: 0행 (신규 생성 직후). 재실행 시 이전 행이 남아 있으면 먼저 truncate 한다.\n"
        f"select count(*) as staging_rows from {STAGING};\n"
        f"-- truncate {STAGING};   -- 필요 시 주석 해제\n",
        encoding="utf-8",
    )
    return path


def write_chunks(records: list[dict]) -> tuple[list[Path], int]:
    """(source_platform, source_id, page_index, image_url) 4열 INSERT 청크."""
    values: list[str] = []
    for rec in records:
        p = sql_str(rec["platform"])
        s = sql_str(rec["source_id"])
        for page_index, url in rec["rows"]:
            values.append(f"  ({p}, {s}, {page_index}, {sql_str(url)})")

    paths: list[Path] = []
    idx = 0
    total = len(values)
    chunk_no = 0
    while idx < total:
        chunk: list[str] = []
        size = 0
        while idx < total and len(chunk) < CHUNK_ROWS and size < CHUNK_MAX_BYTES:
            v = values[idx]
            chunk.append(v)
            size += len(v.encode("utf-8")) + 2
            idx += 1
        chunk_no += 1
        path = SQL_DIR / f"chunk_{chunk_no:02d}.sql"
        body = (
            f"-- 목적: 이미지 URL 백필 스테이징 적재 청크 {chunk_no:02d} ({len(chunk)}행)\n"
            "-- ADR: ADR-0057 D5-②\n"
            "-- 적용: PM이 SQL Editor에 붙여넣기 → Run. step0 실행 후, 청크 번호 순서대로.\n"
            "-- 주의:\n"
            "--   - 본 파일은 스테이징에만 INSERT 한다. book_text 무접촉.\n"
            "--   - 중복 실행 시 스테이징에 행이 2배로 쌓인다 — 마지막 검증 select의 행수로 확인한다.\n"
            "\n"
            f"insert into {STAGING} (source_platform, source_id, page_index, image_url)\nvalues\n"
            + ",\n".join(chunk)
            + ";\n\n"
            f"-- 기대: 누적 행수 = 이 파일까지의 합계\n"
            f"select count(*) as staging_rows_so_far from {STAGING};\n"
        )
        path.write_text(body, encoding="utf-8")
        paths.append(path)
    return paths, total


def write_step2(total_rows: int, per_platform: dict[str, int]) -> Path:
    path = SQL_DIR / "step2_merge.sql"
    expect_not_null = BOOKDASH_NOT_NULL + total_rows
    asb = per_platform.get("african_storybook", 0)
    bloom = per_platform.get("bloom", 0)
    path.write_text(
        "-- 목적: 스테이징 → book_text.image_url 조인 UPDATE (ASb·Bloom 669권)\n"
        "-- ADR: ADR-0057 D5-② · 검증 기준 D5-④\n"
        "-- 적용: PM이 SQL Editor에 전체 붙여넣기 → Run\n"
        "--\n"
        "-- ############################################################################\n"
        "-- ##  이 파일은 리허설이다 — 마지막 줄이 ROLLBACK; 이다.                    ##\n"
        "-- ##  실제 반영은 마지막 줄을 COMMIT; 으로 **직접 고쳐** 다시 Run 해야 한다.##\n"
        "-- ##                                                                        ##\n"
        "-- ##  ADR-0053 E9 사고: 리허설 ROLLBACK을 COMMIT으로 오인해 적재 0건 상태로 ##\n"
        "-- ##  다음 단계를 진행했다. SQL Editor는 **마지막 문장의 결과만** 보여준다. ##\n"
        "-- ##  → 아래 (V6) verdict 한 줄이 화면에 남는다. 그 값으로만 판정할 것.     ##\n"
        "-- ##  → 파일 안의 기대값 주석은 판정 근거가 아니다(E9 교훈).               ##\n"
        "-- ############################################################################\n"
        "\n"
        "begin;\n"
        "\n"
        "-- (V0) 사전 상태 — UPDATE 전\n"
        "select count(*) as rows_before,\n"
        "       count(distinct book_id) as books_before,\n"
        "       count(image_url) as not_null_before\n"
        "  from public.book_text;\n"
        f"-- 기대: rows_before = {TOTAL_ROWS} · books_before = {TOTAL_BOOKS} · not_null_before = {BOOKDASH_NOT_NULL}\n"
        "\n"
        "update public.book_text bt\n"
        "   set image_url = s.image_url\n"
        f"  from {STAGING} s\n"
        "  join public.books b\n"
        "    on b.source_platform = s.source_platform\n"
        "   and b.source_id       = s.source_id\n"
        " where bt.book_id    = b.id\n"
        "   and bt.page_index = s.page_index;\n"
        "\n"
        "-- (V1) 스테이징 행수\n"
        f"select count(*) as staging_rows from {STAGING};\n"
        f"-- 기대: {total_rows}\n"
        "\n"
        "-- (V2) 스테이징 중 books 조인 실패(= 해당 source_id가 books에 없음)\n"
        "select count(*) as unmatched_books\n"
        f"  from {STAGING} s\n"
        "  where not exists (select 1 from public.books b\n"
        "                     where b.source_platform = s.source_platform\n"
        "                       and b.source_id = s.source_id);\n"
        "-- 기대: 0\n"
        "\n"
        "-- (V3) books는 있으나 대응 book_text 행이 없는 스테이징 행\n"
        "--      (매니페스트가 적재 시점 이후 바뀌어 면 수가 달라진 경우 여기서 드러난다)\n"
        "select count(*) as unmatched_pages\n"
        f"  from {STAGING} s\n"
        "  join public.books b on b.source_platform = s.source_platform\n"
        "                     and b.source_id = s.source_id\n"
        "  where not exists (select 1 from public.book_text bt\n"
        "                     where bt.book_id = b.id and bt.page_index = s.page_index);\n"
        "-- 기대: 0\n"
        "\n"
        "-- (V4) 총행수·권수 불변 + not_null 합계\n"
        "select count(*) as rows_after,\n"
        "       count(distinct book_id) as books_after,\n"
        "       count(image_url) as not_null_after\n"
        "  from public.book_text;\n"
        f"-- 기대: rows_after = {TOTAL_ROWS}(불변) · books_after = {TOTAL_BOOKS}(불변)\n"
        f"--       not_null_after = {BOOKDASH_NOT_NULL} + {total_rows} = {expect_not_null}\n"
        "\n"
        "-- (V5) 절대 URL 불변식 (ADR-0057 D5-④ (d))\n"
        "select count(*) as bad_url\n"
        "  from public.book_text\n"
        " where image_url is not null and image_url not like 'http%';\n"
        "-- 기대: 0\n"
        "\n"
        "-- (V6) ★ 최종 판정 1행 — SQL Editor 화면에 남는 것은 이 결과다\n"
        "select\n"
        f"  (select count(*) from {STAGING})                                  as staging_rows,\n"
        "  (select count(*) from public.book_text)                              as rows_after,\n"
        "  (select count(image_url) from public.book_text)                      as not_null_after,\n"
        "  (select count(*) from public.book_text\n"
        "     where image_url is not null and image_url not like 'http%')       as bad_url,\n"
        "  case when (select count(*) from public.book_text) = " + str(TOTAL_ROWS) + "\n"
        "        and (select count(image_url) from public.book_text) = " + str(expect_not_null) + "\n"
        "        and (select count(*) from public.book_text\n"
        "               where image_url is not null and image_url not like 'http%') = 0\n"
        "       then 'PASS' else 'FAIL' end                                     as verdict;\n"
        f"-- 기대: staging_rows={total_rows} · rows_after={TOTAL_ROWS} · not_null_after={expect_not_null}\n"
        f"--       · bad_url=0 · verdict='PASS'   (내역: asb {asb} + bloom {bloom} = {total_rows})\n"
        "\n"
        "-- ############################################################################\n"
        "-- ##  아래 한 줄. 리허설이면 ROLLBACK, 실제 반영이면 COMMIT 으로 고쳐 Run.  ##\n"
        "-- ############################################################################\n"
        "rollback;\n",
        encoding="utf-8",
    )
    return path


def write_step3(total_rows: int, per_platform: dict[str, int], missing_rows: int) -> Path:
    path = SQL_DIR / "step3_verify.sql"
    expect_not_null = BOOKDASH_NOT_NULL + total_rows
    expect_null = TOTAL_ROWS - expect_not_null
    asb = per_platform.get("african_storybook", 0)
    bloom = per_platform.get("bloom", 0)
    path.write_text(
        "-- 목적: COMMIT 후 최종 검증 (ADR-0057 D5-④)\n"
        "-- ADR: ADR-0057 D5-④ (a)(b)(c)(d)\n"
        "-- 적용: step2_merge를 COMMIT으로 실행한 뒤 본 파일을 Run\n"
        "-- 주의:\n"
        "--   - 읽기 전용. UPDATE·DELETE 0건.\n"
        "--   - ★ (c)는 총계가 아니라 **배분**을 본다. 총계만 맞고 배분이 틀린 상태를\n"
        "--     통과시키지 않는다(ADR-0056 §5-c · ADR-0057 D5-④ (c)).\n"
        "\n"
        "-- (a) 행수·권수 불변\n"
        "select count(*) as total_rows, count(distinct book_id) as total_books\n"
        "  from public.book_text;\n"
        f"-- 기대: total_rows = {TOTAL_ROWS} · total_books = {TOTAL_BOOKS}\n"
        "\n"
        "-- (b) 플랫폼별 not_null 분포\n"
        "select b.source_platform,\n"
        "       count(*)                as rows,\n"
        "       count(bt.image_url)     as not_null,\n"
        "       count(*) - count(bt.image_url) as nulls\n"
        "  from public.book_text bt\n"
        "  join public.books b on b.id = bt.book_id\n"
        " group by b.source_platform\n"
        " order by b.source_platform;\n"
        f"-- 기대: book_dash not_null = {BOOKDASH_NOT_NULL} / nulls = 0\n"
        f"--       african_storybook not_null = {asb}\n"
        f"--       bloom not_null = {bloom}\n"
        f"--       전체 not_null = {expect_not_null} · 전체 nulls = {expect_null}\n"
        "\n"
        "-- (c) ★ NULL 배분 대조 — 드라이런 리포트의 '이미지<텍스트' 행수와 일치해야 한다\n"
        "select b.source_platform, b.source_id, count(*) as null_pages\n"
        "  from public.book_text bt\n"
        "  join public.books b on b.id = bt.book_id\n"
        " where bt.image_url is null\n"
        " group by b.source_platform, b.source_id\n"
        " order by null_pages desc, b.source_platform, b.source_id;\n"
        f"-- 기대: 합계 {expect_null}행. 권별 값이 out/per_book.csv 의 missing 열과 1:1 일치.\n"
        f"--       (드라이런 실측: 이미지<텍스트 면 합계 = {missing_rows}행 + fetch 실패권 전 면)\n"
        "\n"
        "-- (d) 절대 URL 불변식\n"
        "select count(*) as bad_url\n"
        "  from public.book_text\n"
        " where image_url is not null and image_url not like 'http%';\n"
        "-- 기대: 0\n"
        "\n"
        "-- (e) 표본 육안 확인 — 플랫폼별 3건씩 URL 형태 확인\n"
        "select b.source_platform, b.source_id, bt.page_index, bt.image_url\n"
        "  from public.book_text bt\n"
        "  join public.books b on b.id = bt.book_id\n"
        " where bt.image_url is not null\n"
        "   and b.source_platform in ('african_storybook','bloom')\n"
        " order by b.source_platform, b.source_id, bt.page_index\n"
        " limit 6;\n"
        "-- 기대: african_storybook → https://africanstorybook.org/...\n"
        "--       bloom             → https://s3.amazonaws.com/bloomharvest/...\n",
        encoding="utf-8",
    )
    return path


def write_step4() -> Path:
    path = SQL_DIR / "step4_drop.sql"
    path.write_text(
        "-- 목적: 백필용 스테이징 테이블 삭제\n"
        "-- ADR: ADR-0057 D5-②\n"
        "-- 적용: ★ step3_verify가 전항 PASS 한 뒤에만 Run\n"
        "-- 주의:\n"
        "--   - step3가 FAIL이면 실행하지 말 것. 스테이징이 있어야 재머지가 가능하다\n"
        "--     (ADR-0053 E9: staging을 먼저 지워 복구 경로를 잃은 선례).\n"
        "--   - book_text 무접촉. 되돌리기는 step0 + chunk 재실행.\n"
        "\n"
        f"drop table if exists {STAGING};\n"
        "\n"
        "-- 기대: 0행 (테이블 소멸 확인)\n"
        "select count(*) as staging_tables from information_schema.tables\n"
        " where table_schema = 'public' and table_name = '_img_backfill_staging';\n",
        encoding="utf-8",
    )
    return path


# ─────────────────────────────────────────────────────────────────────────────
# main
# ─────────────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=IN_CSV)
    ap.add_argument("--platform", choices=VALID_PLATFORMS)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--resume", action="store_true", help="_progress.jsonl 재사용")
    ap.add_argument("--sql-only", action="store_true", help="fetch 없이 진행분으로 SQL만 생성")
    ap.add_argument("--check-input", action="store_true", help="CSV만 점검(네트워크 0)")
    args = ap.parse_args()

    rows = load_targets(args.input, args.platform, args.limit)
    print(f"[INFO] 대상 {len(rows)}권 — {dict(Counter(r['source_platform'] for r in rows))}")
    if args.check_input:
        print("[OK] 입력 점검 통과(네트워크 0건).")
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SQL_DIR.mkdir(parents=True, exist_ok=True)

    done = load_progress() if (args.resume or args.sql_only) else {}
    if done:
        print(f"[INFO] 재개 — 기존 진행분 {len(done)}권")

    records: list[dict] = []
    if args.sql_only:
        records = [done[(r["source_platform"], r["source_id"])]
                   for r in rows if (r["source_platform"], r["source_id"]) in done]
        print(f"[INFO] --sql-only: 진행분 {len(records)}권으로 SQL 생성")
    else:
        import requests  # noqa: PLC0415  (fetch 시점에만 필요)

        if not args.resume and PROGRESS.exists():
            PROGRESS.unlink()

        session = requests.Session()
        session.headers.update({"User-Agent": "kikibooks-image-backfill/1.0"})

        with PROGRESS.open("a", encoding="utf-8") as prog:
            for i, row in enumerate(rows, 1):
                key = (row["source_platform"], row["source_id"])
                if key in done:
                    records.append(done[key])
                    continue

                rec = process(row, session)
                records.append(rec)
                prog.write(json.dumps(rec, ensure_ascii=False) + "\n")
                prog.flush()

                if i % 50 == 0 or not rec["fetch_ok"]:
                    mark = "OK " if rec["fetch_ok"] else "FAIL"
                    print(f"[{i:>4}/{len(rows)}] {mark} {rec['platform']:>17} {rec['source_id']:<40}"
                          f" text={rec['n_text']:>3} img={rec['n_image']:>3} emit={rec['emitted']:>3}")
                time.sleep(SLEEP_BETWEEN)

    # ── 집계 ─────────────────────────────────────────────────────────────────
    ok = [r for r in records if r["fetch_ok"]]
    failed = [r for r in records if not r["fetch_ok"]]
    emit_records = [r for r in ok if r["rows"]]

    per_platform_books = Counter(r["platform"] for r in ok)
    per_platform_rows: dict[str, int] = {}
    for r in ok:
        per_platform_rows[r["platform"]] = per_platform_rows.get(r["platform"], 0) + r["emitted"]

    short_books = [r for r in ok if r["missing"] > 0]     # 이미지 < 텍스트
    long_books = [r for r in ok if r["extra"] > 0]        # 이미지 > 텍스트
    bad_scheme_total = sum(r["bad_scheme"] for r in ok)
    missing_rows = sum(r["missing"] for r in ok)

    # ── SQL 생성 ─────────────────────────────────────────────────────────────
    p0 = write_step0()
    chunks, total_rows = write_chunks(emit_records)
    p2 = write_step2(total_rows, per_platform_rows)
    p3 = write_step3(total_rows, per_platform_rows, missing_rows)
    p4 = write_step4()

    # ── per_book.csv ─────────────────────────────────────────────────────────
    per_book = OUT_DIR / "per_book.csv"
    with per_book.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["platform", "source_id", "title", "fetch_ok", "http_status",
                    "n_text", "n_image", "emitted", "missing", "extra", "bad_scheme", "error"])
        for r in records:
            w.writerow([r["platform"], r["source_id"], r["title"], r["fetch_ok"],
                        r["http_status"], r["n_text"], r["n_image"], r["emitted"],
                        r["missing"], r["extra"], r["bad_scheme"], r["error"]])

    # ── 리포트 ───────────────────────────────────────────────────────────────
    report = {
        "adr": "ADR-0057 D5-②",
        "input_rows": len(rows),
        "books": {
            "total": len(records),
            "fetch_ok": len(ok),
            "fetch_failed": len(failed),
            "by_platform_ok": dict(per_platform_books),
        },
        "image_rows": {
            "total_emitted": total_rows,
            "by_platform": per_platform_rows,
            "expected_not_null_after": BOOKDASH_NOT_NULL + total_rows,
            "expected_null_after": TOTAL_ROWS - (BOOKDASH_NOT_NULL + total_rows),
        },
        "image_lt_text": {
            "books": len(short_books),
            "rows": missing_rows,
            "detail": [{"platform": r["platform"], "source_id": r["source_id"],
                        "n_text": r["n_text"], "n_image": r["n_image"],
                        "missing": r["missing"]} for r in short_books],
        },
        "image_gt_text": {
            "books": len(long_books),
            "rows_dropped": sum(r["extra"] for r in long_books),
        },
        "fetch_failures": [{"platform": r["platform"], "source_id": r["source_id"],
                            "title": r["title"], "http_status": r["http_status"],
                            "error": r["error"], "n_text_unknown": True} for r in failed],
        "url_scheme_violations": bad_scheme_total,
        "baseline": {"total_rows": TOTAL_ROWS, "total_books": TOTAL_BOOKS,
                     "bookdash_not_null": BOOKDASH_NOT_NULL},
        "sql_files": {
            "step0": p0.name,
            "chunks": [p.name for p in chunks],
            "step2": p2.name,
            "step3": p3.name,
            "step4": p4.name,
        },
    }
    (OUT_DIR / "_dryrun_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    # ── 요약 출력 ────────────────────────────────────────────────────────────
    print("\n" + "=" * 78)
    print(f"권수      : 총 {len(records)} · 성공 {len(ok)} · 실패 {len(failed)}"
          f"  {dict(per_platform_books)}")
    print(f"이미지 행 : {total_rows:,}  {per_platform_rows}")
    print(f"이미지<텍스트: {len(short_books)}권 / {missing_rows}행 (NULL 유지)")
    print(f"이미지>텍스트: {len(long_books)}권 / {sum(r['extra'] for r in long_books)}행 (버림)")
    print(f"URL 스킴 위반: {bad_scheme_total}  (기대 0)")
    print(f"백필 후 기대 not_null = {BOOKDASH_NOT_NULL} + {total_rows} = "
          f"{BOOKDASH_NOT_NULL + total_rows} / 전체 {TOTAL_ROWS}")
    print(f"SQL 파일  : step0 + chunk {len(chunks)}개 + step2 + step3 + step4")
    print("=" * 78)
    if failed:
        print(f"[주의] fetch 실패 {len(failed)}권 — 해당 권은 백필 대상에서 제외됐다:")
        for r in failed[:20]:
            print(f"   {r['platform']:>17} {r['source_id']:<40} {r['http_status']} {r['error']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
