#!/usr/bin/env python3
"""gen_book_audio_sql_708.py — 708권 book_audio 적재 SQL 생성기 (로컬 산출물 → .sql).

ADR-0053 D4 전량 확장. **DB 접속 0건 · 쓰기 0건** — 로컬 매니페스트만 읽어 SQL 텍스트를 만든다.
실행은 팀장이 Supabase SQL Editor에서 한다(ADR-0052 D8 워커 DB 직접 쓰기 금지).

■ v2 재설계 (SQL Editor 크기 제한 대응)
  v1은 플랫폼별 단일 파일(step1 1.1MB)이었고 Editor가
  "Query is too large to be run via the SQL Editor" 로 거부했다.
  v2는 실행 단위를 쪼갠다:

    00_staging_create   영구 staging 테이블 1개 (TEMP 금지 — Editor 세션 유지 보장 없음)
    01_chunk_NN         VALUES를 ≤150KB 청크로 분할, staging에만 INSERT (본 테이블 무접촉)
    02_staging_verify   전량 적재 후 게이트 (행수·중복·매핑·충돌) → PASS/FAIL 판정
    03~05_merge_stepN   BEGIN → books 조인 INSERT SELECT → 검증 → ROLLBACK (짧음)
    06_final_verify     3 step COMMIT 후 최종 검증 (읽기 전용)
    07_staging_drop     staging 정리

  원자성: 본 테이블(book_audio)에 쓰는 것은 03~05 머지뿐이고, 각 머지는 단일
  트랜잭션 안에서 플랫폼 단위로 통째 들어가거나 통째 롤백된다. 청크 적재는
  staging에만 닿으므로 실패·중복 실행해도 본 테이블은 무접촉이다.

  재적재 안전: staging은 audio_path에 UNIQUE 제약을 갖고 청크는 전부
  ON CONFLICT (audio_path) DO NOTHING 이다 → 같은 청크를 몇 번 돌려도 멱등.
  TRUNCATE 없이 재시도할 수 있다(02가 총 행수를 정확히 대조하므로 누락도 잡힌다).

입력:
  out/audio_full708/{platform}-{source_id}/_manifest.json   권별 units[] (정본)
  out/_upload708_checkpoint.json                            업로드 완료 키 목록(대조용)
  out/_fullbatch_report.json + docs/sql/deprecated/... 또는 docs/sql/pilot12_danielle_load.sql
                                                            기존 danielle 128권 book_id(교집합 검사용)

출력: docs/sql/load708/ 이하 전체 + README.md

행 산출 로직 (UNIQUE (book_id, kind, page_index, voice) 충돌 회피 근거):
  · kind       unit=='cover' → 'cover', 그 외 → 'page'
  · page_index 'pNN' → **NN - 1** (1-based 파일명 ↔ 0-based 컬럼, ADR-0052 D5).
               표지는 page_index=0 고정 placeholder (ADR-0034 Amd#1).
  · audio_path 매니페스트 key_prefix + 파일명. **버킷명 미포함 오브젝트 키만**(ADR-0034).
  · voice      'danielle' — 구 44권 'Ruth'와 표기가 달라 UNIQUE에서 자연 분리된다.
  · rate       atempo 0.85의 실효 속도 85 (SSML prosody 아님 — ADR-0052 Amd#2).
  · duration_ms 매니페스트 out_ms = 감속 후 mp3 실측(ffmpeg).

book_id 매핑:
  매니페스트가 book_id를 들고 있으나 **그대로 믿지 않는다**. 머지 SQL은
  (source_platform, source_id)로 books를 조인해 id를 얻고, 매니페스트 book_id와
  일치하는지 대조한다. 불일치·매핑 실패가 1건이라도 있으면 RAISE EXCEPTION 으로 중단.

사용: python scripts/tts_pilot/gen_book_audio_sql_708.py
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

PILOT = Path(__file__).resolve().parent
REPO = PILOT.parent.parent
OUT = PILOT / "out"
AUDIO_ROOT = OUT / "audio_full708"
UPLOAD_CK = OUT / "_upload708_checkpoint.json"
FULLBATCH_REPORT = OUT / "_fullbatch_report.json"
PILOT12_SQL = REPO / "docs" / "sql" / "pilot12_danielle_load.sql"
LOAD_DIR = REPO / "docs" / "sql" / "load708"

VOICE = "danielle"
ENGINE = "long-form"
RATE = 85           # atempo 0.85 → 실효 속도
ATEMPO = 0.85
STAGING = "public.book_audio_staging_708"

# SQL Editor 크기 한계 대응. v1 step1(1.1MB)이 거부됐으므로 7배 이상 여유를 둔다.
MAX_CHUNK_BYTES = 150_000
MAX_CHUNK_ROWS = 800

# 기존 DB 현황 — 로컬 산출물로 확정한 기준값 (pilot12 + fullbatch116)
PREV_DANIELLE_BOOKS = 128
PREV_DANIELLE_ROWS = 1614   # 150(pilot12) + 1464(fullbatch116)
PREV_DANIELLE_PAGE = 1486   # 138 + 1348
PREV_DANIELLE_COVER = 128   # 12 + 116
PREV_RUTH_BOOKS = 44
PREV_RUTH_ROWS = 574

STEPS = [
    ("step1", "african_storybook", "03_merge_step1_asb.sql"),
    ("step2", "bloom", "04_merge_step2_bloom.sql"),
    ("step3", "book_dash", "05_merge_step3_bookdash.sql"),
]
STEPS_EXPECT = {"african_storybook": 527, "bloom": 142, "book_dash": 39}

_UNIT_RE = re.compile(r"^p(\d+)$")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_UUID_ANY = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")
_SAFE_PATH = re.compile(r"^[A-Za-z0-9._/-]+$")


class Stop(Exception):
    """생성 중단 사유. 1건이라도 발생하면 SQL을 쓰지 않는다."""


# ─────────────────────────────────────────────────────────── 입력 검증

def load_books() -> list[dict]:
    """매니페스트 전권을 읽어 검증하고 행 목록까지 만들어 돌려준다."""
    if not AUDIO_ROOT.is_dir():
        raise Stop(f"산출물 루트 없음: {AUDIO_ROOT}")

    dirs = sorted(d for d in AUDIO_ROOT.iterdir() if d.is_dir() and d.name != "_raw")
    books: list[dict] = []
    seen_book_id: dict[str, str] = {}
    seen_path: set[str] = set()

    for d in dirs:
        mp = d / "_manifest.json"
        if not mp.exists():
            raise Stop(f"{d.name}: _manifest.json 없음")
        m = json.loads(mp.read_text(encoding="utf-8"))

        platform, source_id, book_id = m["platform"], m["source_id"], m["book_id"]
        key = f"{platform}-{source_id}"
        if key != d.name:
            raise Stop(f"{d.name}: 디렉터리명 ≠ {key}")
        if not _SAFE_ID.fullmatch(source_id):
            raise Stop(f"{d.name}: source_id 문자 이상 — {source_id}")
        if not _UUID.fullmatch(book_id):
            raise Stop(f"{d.name}: book_id UUID 아님 — {book_id}")
        if book_id in seen_book_id:
            raise Stop(f"{d.name}: book_id 중복 — {seen_book_id[book_id]} 와 동일")
        seen_book_id[book_id] = d.name

        # 프리셋 고정값 검증 — 한 권이라도 다르면 rate/voice/engine 상수가 거짓말이 된다
        if m.get("voice_key") != VOICE:
            raise Stop(f"{d.name}: voice_key {m.get('voice_key')} ≠ {VOICE}")
        if m.get("engine") != ENGINE:
            raise Stop(f"{d.name}: engine {m.get('engine')} ≠ {ENGINE}")
        if abs(float(m.get("atempo", -1)) - ATEMPO) > 1e-9:
            raise Stop(f"{d.name}: atempo {m.get('atempo')} ≠ {ATEMPO}")

        prefix = m["key_prefix"]
        if prefix != f"{key}/{VOICE}":
            raise Stop(f"{d.name}: key_prefix 규약 위반 — {prefix}")

        rows: list[tuple] = []
        seen_unit: set[tuple[str, int]] = set()
        for u in m["units"]:
            unit = u["unit"]
            if unit == "cover":
                kind, page_index = "cover", 0
            else:
                mm = _UNIT_RE.fullmatch(unit)
                if not mm:
                    raise Stop(f"{d.name}: 알 수 없는 unit — {unit}")
                kind, page_index = "page", int(mm.group(1)) - 1
                if page_index < 0:
                    raise Stop(f"{d.name}: page_index 음수 — {unit}")
            if (kind, page_index) in seen_unit:
                raise Stop(f"{d.name}: (kind={kind}, page_index={page_index}) 중복 — UNIQUE 충돌 예고")
            seen_unit.add((kind, page_index))

            audio = f"{prefix}/{u['file']}"
            marks = f"{prefix}/{u['marks_file']}" if u.get("marks_file") else None
            for p in (audio, marks):
                if p and not _SAFE_PATH.fullmatch(p):
                    raise Stop(f"{d.name}: 경로에 예상 밖 문자 — {p}")
            if audio in seen_path:
                raise Stop(f"{d.name}: audio_path 전역 중복 — {audio}")
            seen_path.add(audio)

            dur = u.get("out_ms")
            if dur is None:
                raise Stop(f"{d.name}/{unit}: out_ms 없음 — duration_ms NULL 불가")
            rows.append((kind, page_index, audio, marks, int(dur)))

        if len(rows) != m.get("audio_units"):
            raise Stop(f"{d.name}: 유닛 {len(rows)} ≠ audio_units {m.get('audio_units')}")

        books.append({
            "platform": platform, "source_id": source_id, "book_id": book_id,
            "key": key, "title": m.get("title", ""), "rows": rows,
        })

    return books


def cross_check(books: list[dict]) -> None:
    """업로드 체크포인트 · 기존 danielle 128권 교집합 대조. 어긋나면 STOP."""
    ck = json.loads(UPLOAD_CK.read_text(encoding="utf-8"))
    if ck.get("bucket") != "book-audio" or ck.get("voice") != VOICE:
        raise Stop(f"업로드 체크포인트 프리셋 불일치: {ck.get('bucket')}/{ck.get('voice')}")
    uploaded_mp3 = {k for k in ck["done_keys"] if k.endswith(".mp3")}
    uploaded_marks = {k for k in ck["done_keys"] if k.endswith(".marks.json")}

    want_audio = {r[2] for b in books for r in b["rows"]}
    want_marks = {r[3] for b in books for r in b["rows"] if r[3]}
    missing_audio = want_audio - uploaded_mp3
    missing_marks = want_marks - uploaded_marks
    if missing_audio:
        raise Stop(f"업로드 안 된 audio_path {len(missing_audio)}건 — 예: {sorted(missing_audio)[:3]}")
    if missing_marks:
        raise Stop(f"업로드 안 된 marks_path {len(missing_marks)}건 — 예: {sorted(missing_marks)[:3]}")
    orphan = uploaded_mp3 - want_audio
    if orphan:
        raise Stop(f"매니페스트에 없는 업로드 mp3 {len(orphan)}건 — 예: {sorted(orphan)[:3]}")

    prev: set[str] = set()
    rep = json.loads(FULLBATCH_REPORT.read_text(encoding="utf-8"))
    prev |= {b["book_id"] for b in rep["books"] if b.get("ok")}
    prev |= set(_UUID_ANY.findall(PILOT12_SQL.read_text(encoding="utf-8")))
    if len(prev) != PREV_DANIELLE_BOOKS:
        raise Stop(f"기존 danielle 권수 {len(prev)} ≠ 기준 {PREV_DANIELLE_BOOKS}")
    overlap = {b["book_id"] for b in books} & prev
    if overlap:
        raise Stop(f"기존 danielle 128권과 교집합 {len(overlap)}건 — 덮어쓰기 위험, 중단")

    print(f"  [대조] 업로드 mp3 {len(uploaded_mp3)} · marks {len(uploaded_marks)} = 매니페스트와 1:1 일치")
    print(f"  [대조] 기존 danielle {len(prev)}권과 교집합 0건")


def q(v) -> str:
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def counts(books: list[dict]) -> dict:
    pg = sum(1 for b in books for r in b["rows"] if r[0] == "page")
    cv = sum(1 for b in books for r in b["rows"] if r[0] == "cover")
    return {"books": len(books), "page": pg, "cover": cv, "rows": pg + cv}


# ─────────────────────────────────────────────────────────── 청크 분할

def make_chunks(books: list[dict]) -> list[dict]:
    """권 경계를 지키며 ≤MAX_CHUNK_BYTES / ≤MAX_CHUNK_ROWS 로 자른다."""
    chunks: list[dict] = []
    cur: list[dict] = []
    cur_bytes = 0
    cur_rows = 0

    def value_lines(chunk_no: int, b: dict) -> list[str]:
        out = []
        for kind, pi, audio, marks, dur in b["rows"]:
            out.append(f"  ({chunk_no}, {q(b['platform'])}, {q(b['source_id'])}, {q(b['book_id'])}, "
                       f"{q(kind)}, {pi}, {q(audio)}, {q(marks)}, {dur})")
        return out

    for b in books:
        blines = value_lines(0, b)
        bbytes = sum(len(x.encode()) + 2 for x in blines)
        if cur and (cur_bytes + bbytes > MAX_CHUNK_BYTES or cur_rows + len(blines) > MAX_CHUNK_ROWS):
            chunks.append({"items": cur})
            cur, cur_bytes, cur_rows = [], 0, 0
        cur.append(b)
        cur_bytes += bbytes
        cur_rows += len(blines)
    if cur:
        chunks.append({"items": cur})

    cum = 0
    for i, c in enumerate(chunks, start=1):
        c["no"] = i
        # counts()의 'books' 키가 items 리스트를 덮지 않도록 순서 주의 — items는 별도 키다
        c.update(counts(c["items"]))
        cum += c["rows"]
        c["cum"] = cum
    return chunks


# ─────────────────────────────────────────────────────────── 파일 빌더

def hdr(a, title: str) -> None:
    a(f"-- {title}")
    a("-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)")
    a("-- 근거: ADR-0053 D4(전량 확장) / ADR-0034(결정 ①②③ + Amd#1 kind · Amd#2 성우 층위)")
    a("--       / ADR-0052 D5(page_index 축) · Amd#2(rate 의미) · D8(워커 DB 직접 쓰기 금지)")


def build_staging_create(tot: dict, chunks: list[dict]) -> str:
    L: list[str] = []
    a = L.append
    hdr(a, "00_staging_create.sql — 영구 staging 테이블 생성 (실행 순서 1/N)")
    a("--")
    a("-- ★ 이 파일은 본 테이블(book_audio)을 건드리지 않는다. staging 테이블 1개만 만든다.")
    a("-- ★ TEMP 테이블을 쓰지 않는 이유: SQL Editor는 실행마다 세션이 유지된다는 보장이 없어")
    a("--   TEMP 테이블이 청크 사이에 사라질 수 있다. 그래서 영구 테이블로 만들고 07에서 지운다.")
    a("--")
    a("-- 멱등: CREATE TABLE IF NOT EXISTS 라 여러 번 실행해도 안전하다.")
    a("--")
    a("-- ┌─ 재적재(다시 처음부터) 하고 싶을 때 ──────────────────────────────┐")
    a(f"-- │ TRUNCATE {STAGING};")
    a("-- │ 를 먼저 실행한 뒤 01_chunk_01 부터 다시 돌린다.")
    a("-- │ ※ 보통은 TRUNCATE가 필요 없다. 청크는 ON CONFLICT (audio_path) DO NOTHING")
    a("-- │   이라 같은 청크를 몇 번 돌려도 중복이 쌓이지 않는다(멱등).")
    a("-- │   중간에 실패했다면 그냥 실패한 청크부터 이어서 실행하면 된다.")
    a("-- └──────────────────────────────────────────────────────────────────┘")
    a("")
    a(f"CREATE TABLE IF NOT EXISTS {STAGING} (")
    a("  chunk_no         int  NOT NULL,")
    a("  source_platform  text NOT NULL,")
    a("  source_id        text NOT NULL,")
    a("  manifest_book_id uuid NOT NULL,")
    a("  kind             text NOT NULL,")
    a("  page_index       int  NOT NULL,")
    a("  audio_path       text NOT NULL,")
    a("  marks_path       text,")
    a("  duration_ms      int  NOT NULL,")
    a("  CONSTRAINT book_audio_staging_708_audio_path_key UNIQUE (audio_path)")
    a(");")
    a("")
    a("-- books 조인용 인덱스 (머지 단계 성능)")
    a("CREATE INDEX IF NOT EXISTS book_audio_staging_708_src_idx")
    a(f"  ON {STAGING} (source_platform, source_id);")
    a("")
    a("-- RLS 켜고 정책은 만들지 않는다 → anon/authenticated 접근 전면 차단.")
    a("-- SQL Editor(테이블 소유자)와 service_role은 RLS를 우회하므로 작업에 지장 없다.")
    a("-- (books · book_audio 선례 — ADR-0034 Phase A-1 [3])")
    a(f"ALTER TABLE {STAGING} ENABLE ROW LEVEL SECURITY;")
    a("")
    a("-- 확인 (기대: staging_exists = book_audio_staging_708 / staging_rows = 0)")
    a("SELECT to_regclass('public.book_audio_staging_708') AS staging_exists,")
    a(f"       (SELECT count(*) FROM {STAGING})            AS staging_rows;")
    a("")
    a("-- ┌──────────────────────────────────────────────────────────┐")
    a("-- │ 00 기대값")
    a("-- ├──────────────────────────────────────────────────────────┤")
    a("-- │ staging_exists  book_audio_staging_708")
    a("-- │ staging_rows    0   (재실행 시에는 그때까지 적재된 행 수)")
    a("-- ├──────────────────────────────────────────────────────────┤")
    a(f"-- │ 다음: 01_chunk_01 ~ 01_chunk_{len(chunks):02d} 를 순서대로 실행")
    a(f"-- │       (총 {len(chunks)}개 파일 / 최종 {tot['rows']:,}행)")
    a("-- └──────────────────────────────────────────────────────────┘")
    return "\n".join(L) + "\n"


def build_chunk(c: dict, n_chunks: int, tot: dict) -> str:
    L: list[str] = []
    a = L.append
    no = c["no"]
    hdr(a, f"01_chunk_{no:02d}.sql — staging 청크 {no}/{n_chunks} (실행 순서 {no + 1}/N)")
    a("--")
    a("-- ★ 이 파일은 staging 테이블에만 INSERT 한다. 본 테이블(book_audio) 무접촉.")
    a("--   실패하든 두 번 돌리든 본 테이블에는 아무 영향이 없다.")
    a("-- ★ 멱등: ON CONFLICT (audio_path) DO NOTHING — 재실행해도 중복이 쌓이지 않는다.")
    a("--   재실행하면 INSERT 0 0 이 뜨는데 정상이다(이미 다 들어있다는 뜻).")
    a("--   아래 확인 쿼리의 chunk_rows / total_rows 로 판단할 것.")
    a("--")
    a(f"-- 이 청크: {c['books']}권 / {c['rows']}행 (page {c['page']} + cover {c['cover']})")
    a(f"-- 누적   : {c['cum']:,}행 / 전체 {tot['rows']:,}행")
    plats = sorted({b["platform"] for b in c["items"]})
    a(f"-- 플랫폼 : {', '.join(plats)}")
    a(f"-- 첫 권  : {c['items'][0]['key']}")
    a(f"-- 끝 권  : {c['items'][-1]['key']}")
    a("")
    a(f"INSERT INTO {STAGING}")
    a("  (chunk_no, source_platform, source_id, manifest_book_id, kind, page_index,")
    a("   audio_path, marks_path, duration_ms)")
    a("VALUES")

    lines: list[str] = []
    for b in c["items"]:
        lines.append(f"  -- {b['key']}  (page {sum(1 for r in b['rows'] if r[0] == 'page')}"
                     f" + cover {sum(1 for r in b['rows'] if r[0] == 'cover')})")
        for kind, pi, audio, marks, dur in b["rows"]:
            lines.append(f"  ({no}, {q(b['platform'])}, {q(b['source_id'])}, {q(b['book_id'])}, "
                         f"{q(kind)}, {pi}, {q(audio)}, {q(marks)}, {dur}),")
    # 마지막 VALUES 행의 쉼표 제거
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].rstrip().endswith(","):
            lines[i] = lines[i].rstrip()[:-1]
            break
    L.extend(lines)
    a("ON CONFLICT (audio_path) DO NOTHING;")
    a("")
    a(f"-- 확인 (기대: chunk_rows {c['rows']} / total_rows {c['cum']})")
    a("--   chunk_rows 가 기대보다 작으면 이 청크가 덜 들어간 것 — 다시 실행할 것.")
    a("--   total_rows 는 01_chunk_01 부터 순서대로 실행했을 때의 누적값이다.")
    a(f"SELECT count(*) FILTER (WHERE chunk_no = {no}) AS chunk_rows,")
    a("       count(*)                                AS total_rows")
    a(f"  FROM {STAGING};")
    a("")
    a("-- ┌──────────────────────────────────────────────────────────┐")
    a(f"-- │ 청크 {no}/{n_chunks} 기대값 — chunk_rows {c['rows']} · total_rows {c['cum']}")
    if no < n_chunks:
        a(f"-- │ 다음: 01_chunk_{no + 1:02d}")
    else:
        a("-- │ 다음: 02_staging_verify  (전량 게이트)")
    a("-- └──────────────────────────────────────────────────────────┘")
    return "\n".join(L) + "\n"


def build_staging_verify(tot: dict, per_platform: dict, chunks: list[dict]) -> str:
    L: list[str] = []
    a = L.append
    hdr(a, "02_staging_verify.sql — staging 전량 게이트 (읽기 전용)")
    a("--")
    a("-- ★ 쓰기문 0건 — 전부 SELECT. 반복 실행해도 안전하다.")
    a("-- ★ 실행 시점: 01_chunk_01 ~ 마지막 청크를 모두 실행한 뒤.")
    a("-- ★ 맨 아래 verdict 가 'PASS' 여야만 03 머지로 넘어간다. FAIL이면 머지 금지.")
    a("--")
    a(f"-- 기대 총량: {tot['books']}권 / {tot['rows']}행 (page {tot['page']} + cover {tot['cover']})")
    a("")
    a("-- ============================================================")
    a("-- [1] 총량")
    a("-- ============================================================")
    a(f"-- 기대: staged_rows {tot['rows']} / staged_books {tot['books']}"
      f" / page {tot['page']} / cover {tot['cover']}")
    a("SELECT count(*)                                       AS staged_rows,")
    a("       count(DISTINCT (source_platform, source_id))   AS staged_books,")
    a("       count(*) FILTER (WHERE kind = 'page')          AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover')         AS cover_rows")
    a(f"  FROM {STAGING};")
    a("")
    a("-- ============================================================")
    a("-- [2] 청크별 적재 확인 — 빠진 청크 찾기")
    a("-- ============================================================")
    a("-- 기대:")
    for c in chunks:
        a(f"--   chunk {c['no']:>2} → {c['rows']:>4}행")
    a("SELECT chunk_no, count(*) AS rows_loaded")
    a(f"  FROM {STAGING} GROUP BY chunk_no ORDER BY chunk_no;")
    a("")
    a("-- ============================================================")
    a("-- [3] 플랫폼별 분포")
    a("-- ============================================================")
    a("-- 기대:")
    for _, platform, _ in STEPS:
        p = per_platform[platform]
        a(f"--   {platform:<18} books {p['books']:>4} · rows {p['rows']:>5}"
          f" (page {p['page']} + cover {p['cover']})")
    a("SELECT source_platform,")
    a("       count(DISTINCT source_id)                AS books,")
    a("       count(*)                                 AS rows_staged,")
    a("       count(*) FILTER (WHERE kind = 'page')    AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover')   AS cover_rows")
    a(f"  FROM {STAGING} GROUP BY source_platform ORDER BY source_platform;")
    a("")
    a("-- ============================================================")
    a("-- [4] 무결성 — 전부 0")
    a("-- ============================================================")
    a("-- 기대: dup_unit_key 0 / dup_audio_path 0 / null_duration 0 / null_marks 0 / bad_path 0")
    a("SELECT")
    a(f"  (SELECT count(*) FROM (SELECT 1 FROM {STAGING}")
    a("      GROUP BY source_platform, source_id, kind, page_index HAVING count(*) > 1) t)")
    a("                                                     AS dup_unit_key,")
    a(f"  (SELECT count(*) FROM (SELECT 1 FROM {STAGING}")
    a("      GROUP BY audio_path HAVING count(*) > 1) t)    AS dup_audio_path,")
    a(f"  (SELECT count(*) FROM {STAGING} WHERE duration_ms IS NULL) AS null_duration,")
    a(f"  (SELECT count(*) FROM {STAGING} WHERE marks_path IS NULL)  AS null_marks,")
    a(f"  (SELECT count(*) FROM {STAGING}")
    a("    WHERE audio_path LIKE 'book-audio/%'")
    a(f"       OR audio_path NOT LIKE '%/{VOICE}/%')         AS bad_path;")
    a("")
    a("-- ============================================================")
    a("-- [5] book_id 매핑 — (source_platform, source_id) → books.id")
    a("-- ============================================================")
    a(f"-- 기대: mapped_books {tot['books']} / unmapped_rows 0 / mismatched_rows 0")
    a("SELECT")
    a("  (SELECT count(DISTINCT b.id)")
    a(f"     FROM {STAGING} s JOIN public.books b")
    a("       ON b.source_platform = s.source_platform AND b.source_id = s.source_id)")
    a("                                                     AS mapped_books,")
    a(f"  (SELECT count(*) FROM {STAGING} s WHERE NOT EXISTS (")
    a("      SELECT 1 FROM public.books b")
    a("       WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id))")
    a("                                                     AS unmapped_rows,")
    a(f"  (SELECT count(*) FROM {STAGING} s JOIN public.books b")
    a("       ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a("    WHERE b.id <> s.manifest_book_id)                AS mismatched_rows;")
    a("")
    a("-- ============================================================")
    a("-- [6] 기존 행 충돌 — (book_id, kind, page_index, voice) 및 audio_path")
    a("-- ============================================================")
    a("-- 기대: conflict_unique 0 / conflict_audio_path 0")
    a("-- ※ 03~05 머지를 이미 COMMIT 한 뒤 이 파일을 다시 돌리면 여기서 0이 아니게 나온다.")
    a("--   그건 정상이다(이미 적재됐다는 뜻). 머지 **전에** 0인지가 관문이다.")
    a("SELECT")
    a(f"  (SELECT count(*) FROM {STAGING} s")
    a("     JOIN public.books b")
    a("       ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a("     JOIN public.book_audio a")
    a("       ON a.book_id = b.id AND a.kind = s.kind")
    a(f"      AND a.page_index = s.page_index AND a.voice = '{VOICE}')")
    a("                                                     AS conflict_unique,")
    a(f"  (SELECT count(*) FROM {STAGING} s")
    a("     JOIN public.book_audio a ON a.audio_path = s.audio_path)")
    a("                                                     AS conflict_audio_path;")
    a("")
    a("-- ============================================================")
    a("-- [7] 종합 판정 — 이 한 줄만 보면 된다")
    a("-- ============================================================")
    a("SELECT CASE WHEN")
    a(f"     (SELECT count(*) FROM {STAGING}) = {tot['rows']}")
    a(f" AND (SELECT count(DISTINCT (source_platform, source_id)) FROM {STAGING}) = {tot['books']}")
    a(f" AND (SELECT count(*) FROM {STAGING} WHERE kind = 'page')  = {tot['page']}")
    a(f" AND (SELECT count(*) FROM {STAGING} WHERE kind = 'cover') = {tot['cover']}")
    a(f" AND (SELECT count(*) FROM (SELECT 1 FROM {STAGING}")
    a("       GROUP BY source_platform, source_id, kind, page_index HAVING count(*) > 1) t) = 0")
    a(f" AND (SELECT count(*) FROM {STAGING} WHERE duration_ms IS NULL) = 0")
    a(f" AND (SELECT count(*) FROM {STAGING} WHERE marks_path IS NULL) = 0")
    a(f" AND (SELECT count(*) FROM {STAGING}")
    a(f"       WHERE audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/{VOICE}/%') = 0")
    a(f" AND (SELECT count(*) FROM {STAGING} s WHERE NOT EXISTS (")
    a("       SELECT 1 FROM public.books b")
    a("        WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id)) = 0")
    a(f" AND (SELECT count(*) FROM {STAGING} s JOIN public.books b")
    a("        ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a("      WHERE b.id <> s.manifest_book_id) = 0")
    a(f" AND (SELECT count(*) FROM {STAGING} s")
    a("        JOIN public.books b")
    a("          ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a("        JOIN public.book_audio a")
    a("          ON a.book_id = b.id AND a.kind = s.kind")
    a(f"         AND a.page_index = s.page_index AND a.voice = '{VOICE}') = 0")
    a(f" AND (SELECT count(*) FROM {STAGING} s")
    a("        JOIN public.book_audio a ON a.audio_path = s.audio_path) = 0")
    a("  THEN 'PASS — 03_merge_step1_asb 로 진행 가능'")
    a("  ELSE 'FAIL — 머지 금지. 위 [1]~[6] 수치를 워커에게 전달할 것'")
    a("  END AS verdict;")
    a("")
    a("-- ┌──────────────────────────────────────────────────────────┐")
    a("-- │ 02 기대값 대조표 — 팀장 확인용")
    a("-- ├──────────────────────────────────────────────────────────┤")
    a(f"-- │ [1] staged_rows {tot['rows']} · staged_books {tot['books']}"
      f" · page {tot['page']} · cover {tot['cover']}")
    a(f"-- │ [2] 청크 {len(chunks)}개 전부 존재, 각 기대 행 수 일치")
    a(f"-- │ [3] asb {per_platform['african_storybook']['books']}권"
      f" {per_platform['african_storybook']['rows']}행 ·"
      f" bloom {per_platform['bloom']['books']}권 {per_platform['bloom']['rows']}행 ·"
      f" book_dash {per_platform['book_dash']['books']}권 {per_platform['book_dash']['rows']}행")
    a("-- │ [4] 무결성 5개 항목 전부 0")
    a(f"-- │ [5] mapped_books {tot['books']} · unmapped 0 · mismatched 0")
    a("-- │ [6] conflict_unique 0 · conflict_audio_path 0")
    a("-- │ [7] verdict = PASS")
    a("-- ├──────────────────────────────────────────────────────────┤")
    a("-- │ 다음: 03_merge_step1_asb")
    a("-- └──────────────────────────────────────────────────────────┘")
    return "\n".join(L) + "\n"


def build_merge(step: str, platform: str, fname: str, pp: dict, totals: dict,
                nxt: str) -> str:
    L: list[str] = []
    a = L.append
    hdr(a, f"{fname} — {step} ({platform}) 본 테이블 머지")
    a("--")
    a("-- ★★ 이 파일은 끝이 ROLLBACK; 이다. 그대로 실행하면 **아무것도 남지 않는다**. ★★")
    a("--    검증 SELECT 결과가 전부 기대값과 같으면, 맨 끝 ROLLBACK; 을 COMMIT; 으로")
    a("--    직접 고쳐 타이핑한 뒤 다시 실행할 것. (자동 COMMIT 금지 — 팀장 확인 영역)")
    a("--")
    a("-- ★ 선행 조건: 02_staging_verify 의 verdict 가 PASS.")
    a("-- ★ 이 파일은 VALUES를 담지 않는다(staging에서 SELECT). 그래서 짧고 Editor 제한에 안 걸린다.")
    a("--")
    a("-- ※ Supabase SQL Editor는 스크립트를 자체 트랜잭션으로 감싸는 경우가 있어 BEGIN에서")
    a("--   'there is already a transaction in progress' WARNING이 뜰 수 있다. 경고이지 에러가")
    a("--   아니며 ROLLBACK/COMMIT은 정상 동작한다. ERROR 로 시작하는 줄만 실패로 취급할 것.")
    a("-- ※ [2]·[3]의 DO 블록은 fail-closed 가드다. 여기서 STOP이 뜨면 트랜잭션이 죽고 이후")
    a("--   문장이 'current transaction is aborted'로 줄줄이 실패한다 — 정상 동작이다.")
    a("--   맨 처음 뜬 STOP 메시지만 워커에게 전달하면 된다.")
    a("--")
    a(f"-- 규모: {pp['books']}권 / {pp['rows']}행 (page {pp['page']} + cover {pp['cover']})")
    a(f"-- 값  : voice='{VOICE}' · engine='{ENGINE}' · rate={RATE}"
      f" (atempo {ATEMPO}의 실효 속도, SSML prosody 아님)")
    a("--        duration_ms = 감속 후 mp3 실측(ffmpeg). audio_path = 버킷명 미포함 오브젝트 키.")
    a("--")
    a("-- 기존 행 보호:")
    a("--   · INSERT 에 ON CONFLICT 절이 **없다**. 충돌이 있으면 에러로 죽는다(=덮어쓰기 불가).")
    a(f"--   · 구 {PREV_RUTH_BOOKS}권(voice='Ruth')은 UNIQUE에서 자연 분리 — 무접촉.")
    a(f"--   · 모든 검사·삽입은 source_platform = '{platform}' 로 한정된다.")
    a("--     (앞 step을 COMMIT 한 뒤 실행해도 앞 step 행이 충돌로 잡히지 않는다)")
    a("")
    a("BEGIN;")
    a("")
    a("-- ============================================================")
    a("-- [0] 사전 상태 스냅샷")
    a("-- ============================================================")
    a(f"-- 기대: danielle_books {totals['prev_books']} / danielle_rows {totals['prev_rows']}"
      f" / page {totals['prev_page']} / cover {totals['prev_cover']}")
    a("--   이 수치가 다르면 즉시 중단(앞 step 미실행? 중복 실행?).")
    a("SELECT count(DISTINCT book_id) AS danielle_books,")
    a("       count(*)                               AS danielle_rows,")
    a("       count(*) FILTER (WHERE kind = 'page')  AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover') AS cover_rows")
    a(f"  FROM public.book_audio WHERE voice = '{VOICE}';")
    a("")
    a(f"-- 기대: ruth_books {PREV_RUTH_BOOKS} / ruth_rows {PREV_RUTH_ROWS}")
    a("SELECT count(DISTINCT book_id) AS ruth_books, count(*) AS ruth_rows")
    a("  FROM public.book_audio WHERE voice = 'Ruth';")
    a("")
    a("-- ============================================================")
    a(f"-- [1] staging 해당 플랫폼분 확인")
    a("-- ============================================================")
    a(f"-- 기대: staged_rows {pp['rows']} / staged_books {pp['books']}"
      f" / page {pp['page']} / cover {pp['cover']}")
    a("SELECT count(*)                                 AS staged_rows,")
    a("       count(DISTINCT source_id)                AS staged_books,")
    a("       count(*) FILTER (WHERE kind = 'page')    AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover')   AS cover_rows")
    a(f"  FROM {STAGING} WHERE source_platform = '{platform}';")
    a("")
    a("-- ============================================================")
    a("-- [2] 매핑 게이트 (fail-closed)")
    a("-- ============================================================")
    a(f"-- 기대: mapped_books {pp['books']} / unmapped_rows 0 / mismatched_rows 0")
    a("SELECT")
    a("  (SELECT count(DISTINCT b.id)")
    a(f"     FROM {STAGING} s JOIN public.books b")
    a("       ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a(f"    WHERE s.source_platform = '{platform}')          AS mapped_books,")
    a(f"  (SELECT count(*) FROM {STAGING} s")
    a(f"    WHERE s.source_platform = '{platform}' AND NOT EXISTS (")
    a("      SELECT 1 FROM public.books b")
    a("       WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id))")
    a("                                                     AS unmapped_rows,")
    a(f"  (SELECT count(*) FROM {STAGING} s JOIN public.books b")
    a("       ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a(f"    WHERE s.source_platform = '{platform}' AND b.id <> s.manifest_book_id)")
    a("                                                     AS mismatched_rows;")
    a("")
    a("DO $$")
    a("DECLARE v_rows int; v_books int; v_unmapped int; v_mismatch int;")
    a("BEGIN")
    a("  SELECT count(*), count(DISTINCT source_id) INTO v_rows, v_books")
    a(f"    FROM {STAGING} WHERE source_platform = '{platform}';")
    a(f"  IF v_rows <> {pp['rows']} THEN")
    a(f"    RAISE EXCEPTION 'STOP: staging {platform} 행 수 % ≠ 기대 {pp['rows']}"
      " — 청크 적재 미완. 머지 중단', v_rows;")
    a("  END IF;")
    a(f"  IF v_books <> {pp['books']} THEN")
    a(f"    RAISE EXCEPTION 'STOP: staging {platform} 권 수 % ≠ 기대 {pp['books']} — 머지 중단', v_books;")
    a("  END IF;")
    a(f"  SELECT count(*) INTO v_unmapped FROM {STAGING} s")
    a(f"   WHERE s.source_platform = '{platform}' AND NOT EXISTS (")
    a("    SELECT 1 FROM public.books b")
    a("     WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id);")
    a("  IF v_unmapped <> 0 THEN")
    a("    RAISE EXCEPTION 'STOP: books 매핑 실패 % 행 — 머지 중단', v_unmapped;")
    a("  END IF;")
    a(f"  SELECT count(*) INTO v_mismatch FROM {STAGING} s JOIN public.books b")
    a("     ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a(f"   WHERE s.source_platform = '{platform}' AND b.id <> s.manifest_book_id;")
    a("  IF v_mismatch <> 0 THEN")
    a("    RAISE EXCEPTION 'STOP: 매니페스트 book_id 불일치 % 행 — 머지 중단', v_mismatch;")
    a("  END IF;")
    a("END $$;")
    a("")
    a("-- ============================================================")
    a("-- [3] 충돌 게이트 (fail-closed)")
    a("-- ============================================================")
    a("-- 기대: conflict_unique 0 / conflict_audio_path 0")
    a("SELECT")
    a(f"  (SELECT count(*) FROM {STAGING} s")
    a("     JOIN public.books b")
    a("       ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a("     JOIN public.book_audio a")
    a("       ON a.book_id = b.id AND a.kind = s.kind")
    a(f"      AND a.page_index = s.page_index AND a.voice = '{VOICE}'")
    a(f"    WHERE s.source_platform = '{platform}')          AS conflict_unique,")
    a(f"  (SELECT count(*) FROM {STAGING} s")
    a("     JOIN public.book_audio a ON a.audio_path = s.audio_path")
    a(f"    WHERE s.source_platform = '{platform}')          AS conflict_audio_path;")
    a("")
    a("DO $$")
    a("DECLARE v int;")
    a("BEGIN")
    a(f"  SELECT count(*) INTO v FROM {STAGING} s")
    a("    JOIN public.books b")
    a("      ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a("    JOIN public.book_audio a")
    a("      ON a.book_id = b.id AND a.kind = s.kind")
    a(f"     AND a.page_index = s.page_index AND a.voice = '{VOICE}'")
    a(f"   WHERE s.source_platform = '{platform}';")
    a("  IF v <> 0 THEN")
    a("    RAISE EXCEPTION 'STOP: 기존 행과 충돌 % 건 — 머지 중단', v;")
    a("  END IF;")
    a(f"  SELECT count(*) INTO v FROM {STAGING} s")
    a("    JOIN public.book_audio a ON a.audio_path = s.audio_path")
    a(f"   WHERE s.source_platform = '{platform}';")
    a("  IF v <> 0 THEN")
    a("    RAISE EXCEPTION 'STOP: audio_path 중복 % 건 — 머지 중단', v;")
    a("  END IF;")
    a("END $$;")
    a("")
    a("-- ============================================================")
    a(f"-- [4] book_audio INSERT — {pp['books']}권 / {pp['rows']}행")
    a("-- ============================================================")
    a("INSERT INTO public.book_audio")
    a("  (book_id, kind, page_index, audio_path, marks_path, voice, engine, rate, duration_ms)")
    a("SELECT b.id, s.kind, s.page_index, s.audio_path, s.marks_path,")
    a(f"       '{VOICE}', '{ENGINE}', {RATE}, s.duration_ms")
    a(f"  FROM {STAGING} s")
    a("  JOIN public.books b")
    a("    ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a(f" WHERE s.source_platform = '{platform}';")
    a("")
    a("-- ============================================================")
    a("-- [5] 사후 검증")
    a("-- ============================================================")
    a(f"-- 기대: danielle_books {totals['post_books']} / danielle_rows {totals['post_rows']}"
      f" / page {totals['post_page']} / cover {totals['post_cover']}")
    a(f"--   (= 적재 전 {totals['prev_books']}권 {totals['prev_rows']}행"
      f" + 본 step {pp['books']}권 {pp['rows']}행)")
    a("SELECT count(DISTINCT book_id) AS danielle_books,")
    a("       count(*)                               AS danielle_rows,")
    a("       count(*) FILTER (WHERE kind = 'page')  AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover') AS cover_rows")
    a(f"  FROM public.book_audio WHERE voice = '{VOICE}';")
    a("")
    a(f"-- 본 step 적재분만 재확인 (기대: step_books {pp['books']} / step_rows {pp['rows']}"
      f" / page {pp['page']} / cover {pp['cover']})")
    a("SELECT count(DISTINCT a.book_id)                 AS step_books,")
    a("       count(*)                                  AS step_rows,")
    a("       count(*) FILTER (WHERE a.kind = 'page')   AS page_rows,")
    a("       count(*) FILTER (WHERE a.kind = 'cover')  AS cover_rows")
    a("  FROM public.book_audio a")
    a(f"  JOIN {STAGING} s ON s.audio_path = a.audio_path")
    a(f" WHERE s.source_platform = '{platform}';")
    a("")
    a(f"-- 표지 누락 권 (기대: 0) — 본 step {pp['books']}권 중 cover 행이 없는 책")
    a("SELECT count(*) AS books_missing_cover FROM (")
    a("  SELECT b.id FROM public.books b")
    a(f"   WHERE b.source_platform = '{platform}'")
    a(f"     AND b.source_id IN (SELECT DISTINCT source_id FROM {STAGING}")
    a(f"                          WHERE source_platform = '{platform}')")
    a("     AND NOT EXISTS (SELECT 1 FROM public.book_audio a")
    a(f"                      WHERE a.book_id = b.id AND a.voice = '{VOICE}' AND a.kind = 'cover')")
    a(") t;")
    a("")
    a("-- 경로 규약 위반 (기대: 0) · duration NULL (기대: 0)")
    a("SELECT")
    a("  (SELECT count(*) FROM public.book_audio")
    a(f"    WHERE voice = '{VOICE}'")
    a(f"      AND (audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/{VOICE}/%'))")
    a("                                                     AS bad_path,")
    a(f"  (SELECT count(*) FROM public.book_audio WHERE voice = '{VOICE}' AND duration_ms IS NULL)")
    a("                                                     AS null_duration;")
    a("")
    a(f"-- 구 {PREV_RUTH_BOOKS}권 무간섭 확인 (기대: {PREV_RUTH_BOOKS} / {PREV_RUTH_ROWS})")
    a("SELECT count(DISTINCT book_id) AS ruth_books, count(*) AS ruth_rows")
    a("  FROM public.book_audio WHERE voice = 'Ruth';")
    a("")
    a("-- ============================================================")
    a("ROLLBACK;")
    a("-- ============================================================")
    a("")
    a("-- ┌──────────────────────────────────────────────────────────┐")
    a(f"-- │ {step} ({platform}) 기대값 대조표 — 팀장 확인용")
    a("-- ├──────────────────────────────────────────────────────────┤")
    a(f"-- │ [0] 적재 전  danielle books {totals['prev_books']:>4} rows {totals['prev_rows']:>5}"
      f" page {totals['prev_page']:>5} cover {totals['prev_cover']:>4}")
    a(f"-- │            Ruth     books {PREV_RUTH_BOOKS:>4} rows {PREV_RUTH_ROWS:>5}")
    a(f"-- │ [1] staging rows {pp['rows']:>5} books {pp['books']:>4}"
      f" page {pp['page']:>5} cover {pp['cover']:>4}")
    a(f"-- │ [2] 매핑     mapped_books {pp['books']:>4} · unmapped 0 · mismatched 0")
    a("-- │ [3] 충돌     conflict_unique 0 · conflict_audio_path 0")
    a(f"-- │ [4] INSERT  {pp['rows']}행")
    a(f"-- │ [5] 적재 후  danielle books {totals['post_books']:>4} rows {totals['post_rows']:>5}"
      f" page {totals['post_page']:>5} cover {totals['post_cover']:>4}")
    a(f"-- │            step 적재분 books {pp['books']:>4} rows {pp['rows']:>5}")
    a("-- │            books_missing_cover 0 · bad_path 0 · null_duration 0")
    a(f"-- │            Ruth     books {PREV_RUTH_BOOKS:>4} rows {PREV_RUTH_ROWS:>5} (불변)")
    a("-- ├──────────────────────────────────────────────────────────┤")
    a("-- │ 전부 일치하면 위 ROLLBACK; 을 COMMIT; 으로 바꿔 재실행.")
    a("-- │ 하나라도 다르면 COMMIT 하지 말고 워커에게 수치를 그대로 전달할 것.")
    a(f"-- │ 다음: {nxt}")
    a("-- └──────────────────────────────────────────────────────────┘")
    return "\n".join(L) + "\n"


def build_final_verify(tot: dict, per_platform: dict) -> str:
    n_books, n_rows = tot["books"], tot["rows"]
    n_page, n_cover = tot["page"], tot["cover"]
    tb = PREV_DANIELLE_BOOKS + n_books
    tr = PREV_DANIELLE_ROWS + n_rows
    tp = PREV_DANIELLE_PAGE + n_page
    tc = PREV_DANIELLE_COVER + n_cover

    L: list[str] = []
    a = L.append
    hdr(a, "06_final_verify.sql — 3 step COMMIT 후 최종 검증 (읽기 전용)")
    a("--")
    a("-- ★ 쓰기문 0건 — 전부 SELECT. 반복 실행해도 안전하다.")
    a("-- ★ 실행 시점: 03 / 04 / 05 머지를 모두 COMMIT 한 뒤.")
    a("--")
    a(f"-- 신규 적재분: {n_books}권 / {n_rows}행 (page {n_page} + cover {n_cover})")
    a(f"-- 기존 danielle: {PREV_DANIELLE_BOOKS}권 / {PREV_DANIELLE_ROWS}행 (pilot12 + fullbatch116)")
    a(f"-- 최종 danielle: {tb}권 / {tr}행 (page {tp} + cover {tc})")
    a("")
    a("-- ============================================================")
    a("-- [1] danielle 총계")
    a("-- ============================================================")
    a(f"-- 기대: books {tb} / rows {tr} / page {tp} / cover {tc}")
    a("SELECT count(DISTINCT book_id) AS danielle_books,")
    a("       count(*)                               AS danielle_rows,")
    a("       count(*) FILTER (WHERE kind = 'page')  AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover') AS cover_rows")
    a(f"  FROM public.book_audio WHERE voice = '{VOICE}';")
    a("")
    a("-- ============================================================")
    a("-- [2] voice별 분포 — 구 Ruth 무간섭 확인")
    a("-- ============================================================")
    a(f"-- 기대: danielle {tb}권 {tr}행 · Ruth {PREV_RUTH_BOOKS}권 {PREV_RUTH_ROWS}행")
    a(f"--       총 {tr + PREV_RUTH_ROWS}행 (그 밖의 voice가 나오면 예상 밖 — 보고할 것)")
    a("SELECT voice, count(DISTINCT book_id) AS books, count(*) AS row_count")
    a("  FROM public.book_audio GROUP BY voice ORDER BY voice;")
    a("")
    a("-- ============================================================")
    a("-- [3] 플랫폼별 분포")
    a("-- ============================================================")
    a("-- 기대:")
    for _, platform, _ in STEPS:
        p = per_platform[platform]
        extra = f" + 기존 {PREV_DANIELLE_BOOKS}권 = {p['books'] + PREV_DANIELLE_BOOKS}권" \
            if platform == "book_dash" else ""
        a(f"--   {platform:<18} 신규 books {p['books']:>4} · rows {p['rows']:>5}{extra}")
    a(f"--   ※ 기존 128권(pilot12+fullbatch116)은 전부 Book Dash라 book_dash 행에 합산된다.")
    a(f"--     book_dash 기대 = {per_platform['book_dash']['books']} + {PREV_DANIELLE_BOOKS}"
      f" = {per_platform['book_dash']['books'] + PREV_DANIELLE_BOOKS}권 /"
      f" {per_platform['book_dash']['rows']} + {PREV_DANIELLE_ROWS}"
      f" = {per_platform['book_dash']['rows'] + PREV_DANIELLE_ROWS}행")
    a("SELECT b.source_platform,")
    a("       count(DISTINCT a.book_id)                 AS books,")
    a("       count(*)                                  AS row_count,")
    a("       count(*) FILTER (WHERE a.kind = 'page')   AS page_rows,")
    a("       count(*) FILTER (WHERE a.kind = 'cover')  AS cover_rows")
    a("  FROM public.book_audio a JOIN public.books b ON b.id = a.book_id")
    a(f" WHERE a.voice = '{VOICE}'")
    a(" GROUP BY b.source_platform ORDER BY b.source_platform;")
    a("")
    a("-- ============================================================")
    a("-- [4] 무결성 — 전부 0")
    a("-- ============================================================")
    a("SELECT")
    a("  (SELECT count(*) FROM (SELECT 1 FROM public.book_audio")
    a("      GROUP BY audio_path HAVING count(*) > 1) t)      AS dup_audio_path,")
    a("  (SELECT count(*) FROM public.book_audio WHERE duration_ms IS NULL)")
    a("                                                       AS null_duration,")
    a("  (SELECT count(*) FROM public.book_audio WHERE audio_path IS NULL)")
    a("                                                       AS null_audio_path,")
    a("  (SELECT count(*) FROM public.book_audio")
    a(f"    WHERE voice = '{VOICE}'")
    a(f"      AND (audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/{VOICE}/%'))")
    a("                                                       AS bad_path,")
    a("  (SELECT count(*) FROM (SELECT book_id FROM public.book_audio")
    a(f"     WHERE voice = '{VOICE}' GROUP BY book_id")
    a("      HAVING count(*) FILTER (WHERE kind = 'cover') = 0) t)")
    a("                                                       AS books_missing_cover,")
    a("  (SELECT count(*) FROM public.book_audio a")
    a("    WHERE NOT EXISTS (SELECT 1 FROM public.books b WHERE b.id = a.book_id))")
    a("                                                       AS orphan_book_id;")
    a("")
    a("-- ============================================================")
    a("-- [5] UNIQUE 키 중복 · page_index 연속성")
    a("-- ============================================================")
    a("-- 기대: dup_unique_key 0 / gap_books 0")
    a("SELECT")
    a("  (SELECT count(*) FROM (SELECT 1 FROM public.book_audio")
    a("      GROUP BY book_id, kind, page_index, voice HAVING count(*) > 1) t)")
    a("                                                       AS dup_unique_key,")
    a("  (SELECT count(*) FROM (SELECT a.book_id FROM public.book_audio a")
    a(f"     WHERE a.voice = '{VOICE}' AND a.kind = 'page' GROUP BY a.book_id")
    a("      HAVING max(a.page_index) <> count(*) - 1 OR min(a.page_index) <> 0) t)")
    a("                                                       AS gap_books;")
    a("")
    a("-- ============================================================")
    a("-- [6] 종합 판정")
    a("-- ============================================================")
    a("SELECT CASE WHEN")
    a(f"     (SELECT count(DISTINCT book_id) FROM public.book_audio WHERE voice = '{VOICE}') = {tb}")
    a(f" AND (SELECT count(*) FROM public.book_audio WHERE voice = '{VOICE}') = {tr}")
    a(f" AND (SELECT count(*) FROM public.book_audio WHERE voice = '{VOICE}' AND kind = 'page') = {tp}")
    a(f" AND (SELECT count(*) FROM public.book_audio WHERE voice = '{VOICE}' AND kind = 'cover') = {tc}")
    a(f" AND (SELECT count(*) FROM public.book_audio WHERE voice = 'Ruth') = {PREV_RUTH_ROWS}")
    a(" AND (SELECT count(*) FROM (SELECT 1 FROM public.book_audio")
    a("       GROUP BY audio_path HAVING count(*) > 1) t) = 0")
    a(" AND (SELECT count(*) FROM public.book_audio WHERE duration_ms IS NULL) = 0")
    a(" AND (SELECT count(*) FROM public.book_audio")
    a(f"       WHERE voice = '{VOICE}'")
    a(f"         AND (audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/{VOICE}/%')) = 0")
    a(" AND (SELECT count(*) FROM (SELECT book_id FROM public.book_audio")
    a(f"        WHERE voice = '{VOICE}' GROUP BY book_id")
    a("         HAVING count(*) FILTER (WHERE kind = 'cover') = 0) t) = 0")
    a("  THEN 'PASS — 적재 완료. 07_staging_drop 로 정리 가능'")
    a("  ELSE 'FAIL — 위 [1]~[5] 수치를 워커에게 전달할 것'")
    a("  END AS verdict;")
    a("")
    a("-- ============================================================")
    a("-- [7] 참고 — 본 적재 범위 밖 (쓰기 없음)")
    a("-- ============================================================")
    a("-- ⚠ books.has_audio 갱신과 book_review.status 전이는 본 적재에 **포함하지 않았다**.")
    a("--   앱은 has_audio 를 읽지 않고 book_audio 행 존재로 판정하므로")
    a("--   (lib/book/audio-manifest.ts) 화면 영향이 없다. 필요 시 별도 판단 후 실행.")
    a("SELECT count(*) AS danielle_books_has_audio_false")
    a("  FROM public.books b")
    a(" WHERE b.has_audio = false")
    a(f"   AND b.id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = '{VOICE}');")
    a("")
    a("SELECT r.status, count(*) AS books")
    a("  FROM public.book_review r")
    a(f" WHERE r.book_id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = '{VOICE}')")
    a(" GROUP BY r.status ORDER BY r.status;")
    a("")
    a("-- ┌──────────────────────────────────────────────────────────┐")
    a("-- │ 06 최종 기대값 대조표 — 팀장 확인용")
    a("-- ├──────────────────────────────────────────────────────────┤")
    a(f"-- │ [1] danielle books {tb:>4} rows {tr:>5} page {tp:>5} cover {tc:>4}")
    a(f"-- │ [2] danielle {tb}권 {tr}행 · Ruth {PREV_RUTH_BOOKS}권 {PREV_RUTH_ROWS}행"
      f" · 총 {tr + PREV_RUTH_ROWS}행")
    a(f"-- │ [3] asb {per_platform['african_storybook']['books']}권"
      f" {per_platform['african_storybook']['rows']}행 ·"
      f" bloom {per_platform['bloom']['books']}권 {per_platform['bloom']['rows']}행 ·"
      f" book_dash {per_platform['book_dash']['books'] + PREV_DANIELLE_BOOKS}권"
      f" {per_platform['book_dash']['rows'] + PREV_DANIELLE_ROWS}행")
    a("-- │ [4] 무결성 6개 항목 전부 0")
    a("-- │ [5] dup_unique_key 0 · gap_books 0")
    a("-- │ [6] verdict = PASS")
    a("-- ├──────────────────────────────────────────────────────────┤")
    a("-- │ 다음: 07_staging_drop")
    a("-- └──────────────────────────────────────────────────────────┘")
    return "\n".join(L) + "\n"


def build_drop(tot: dict) -> str:
    L: list[str] = []
    a = L.append
    hdr(a, "07_staging_drop.sql — staging 정리 (마지막)")
    a("--")
    a("-- ★ 실행 조건: 03/04/05 머지를 모두 COMMIT 하고 06_final_verify 가 PASS 한 뒤.")
    a("--   그 전에 지우면 청크 1.6MB를 처음부터 다시 올려야 한다.")
    a("-- ★ 이 파일은 book_audio 를 건드리지 않는다. staging 테이블만 지운다.")
    a("")
    a(f"-- 지우기 전 확인 (기대: staging_rows {tot['rows']})")
    a(f"SELECT count(*) AS staging_rows FROM {STAGING};")
    a("")
    a(f"DROP TABLE IF EXISTS {STAGING};")
    a("")
    a("-- 확인 (기대: should_be_null = NULL)")
    a("SELECT to_regclass('public.book_audio_staging_708') AS should_be_null;")
    a("")
    a("-- ┌──────────────────────────────────────────────────────────┐")
    a("-- │ 07 기대값 — staging_rows {r} → DROP → should_be_null NULL".replace("{r}", str(tot["rows"])))
    a("-- │ 전체 적재 절차 종료.")
    a("-- └──────────────────────────────────────────────────────────┘")
    return "\n".join(L) + "\n"


def build_readme(tot: dict, per_platform: dict, chunks: list[dict], step_totals: list) -> str:
    n = len(chunks)
    L: list[str] = []
    a = L.append
    a("# load708 — 708권 book_audio 적재 실행 순서")
    a("")
    a("생성: `scripts/tts_pilot/gen_book_audio_sql_708.py` (워커, DB 접속 0건)  ")
    a("근거: ADR-0053 D4 / ADR-0034 / ADR-0052 D5·Amd#2·D8")
    a("")
    a(f"**총 {tot['books']}권 / {tot['rows']:,}행** (page {tot['page']:,} + cover {tot['cover']})")
    a("")
    a("## 왜 파일이 여러 개인가")
    a("")
    a("v1은 플랫폼별 단일 파일이었는데 step1이 1.1MB라 SQL Editor가")
    a("`Query is too large to be run via the SQL Editor` 로 거부했다.")
    a("그래서 **VALUES 적재(무거움)** 와 **본 테이블 머지(가벼움)** 를 분리했다.")
    a("")
    a("- 청크 파일은 staging 테이블에만 넣는다 → 실패해도 `book_audio` 무접촉")
    a(f"- 머지 파일은 VALUES가 없어 짧다 (staging에서 SELECT) → 크기 제한과 무관")
    a("- 원자성은 머지 단계에서 유지: 플랫폼 단위로 통째 COMMIT 또는 통째 ROLLBACK")
    a("")
    a("## 실행 순서")
    a("")
    a("| # | 파일 | 내용 | 기대값 |")
    a("|---|---|---|---|")
    a("| 1 | `00_staging_create.sql` | staging 테이블 생성 | `staging_rows` 0 |")
    for c in chunks:
        a(f"| {c['no'] + 1} | `01_chunk_{c['no']:02d}.sql` | {c['books']}권 {c['rows']}행 적재 "
          f"| `chunk_rows` {c['rows']} / `total_rows` {c['cum']:,} |")
    base = n + 2
    a(f"| {base} | `02_staging_verify.sql` | 전량 게이트 | **verdict = PASS** |")
    for i, (step, platform, fname, pp, totals) in enumerate(step_totals):
        a(f"| {base + 1 + i} | `{fname}` | {platform} {pp['books']}권 {pp['rows']}행 머지 "
          f"| 적재 후 danielle {totals['post_books']}권 {totals['post_rows']:,}행 |")
    a(f"| {base + 4} | `06_final_verify.sql` | 최종 검증 | **verdict = PASS** |")
    a(f"| {base + 5} | `07_staging_drop.sql` | staging 정리 | `should_be_null` NULL |")
    a("")
    a("## 규칙")
    a("")
    a("- **청크(01)** 는 그냥 순서대로 실행하면 된다. 멱등이라 두 번 돌려도 안전하다.")
    a("  재실행 시 `INSERT 0 0` 이 뜨는 건 정상(이미 들어있다는 뜻).")
    a("- **머지(03~05)** 는 파일 끝이 `ROLLBACK;` 이다. 기대값이 전부 맞으면")
    a("  `ROLLBACK;` 을 `COMMIT;` 으로 **직접 고쳐 타이핑** 한 뒤 다시 실행한다.")
    a("- **게이트(02, 06)** 의 `verdict` 가 `PASS` 가 아니면 다음 단계로 넘어가지 않는다.")
    a("- 머지의 `DO` 블록에서 `STOP:` 으로 시작하는 에러가 나면 fail-closed 가드가 걸린 것이다.")
    a("  이후 문장들이 `current transaction is aborted` 로 줄줄이 실패하는 건 정상 —")
    a("  **맨 처음 뜬 STOP 메시지만** 워커에게 전달하면 된다.")
    a("")
    a("## 처음부터 다시 하고 싶을 때")
    a("")
    a("```sql")
    a("TRUNCATE public.book_audio_staging_708;")
    a("```")
    a("")
    a("을 실행하고 `01_chunk_01` 부터 다시 돌린다. 보통은 필요 없다 —")
    a("청크가 멱등이라 실패한 지점부터 이어서 실행하면 된다.")
    a("")
    a("머지를 이미 COMMIT 한 뒤 되돌리려면:")
    a("")
    a("```sql")
    a("DELETE FROM public.book_audio a")
    a(" USING public.book_audio_staging_708 s")
    a(" WHERE a.audio_path = s.audio_path AND a.voice = 'danielle';")
    a("```")
    a("")
    a("staging을 DROP 하기 전에만 쓸 수 있다(그래서 07은 맨 마지막이다).")
    a("")
    a("## 기존 행 보호")
    a("")
    a(f"- 기존 danielle {PREV_DANIELLE_BOOKS}권 {PREV_DANIELLE_ROWS:,}행(pilot12+fullbatch116)과"
      " book_id 교집합 **0** — 로컬 산출물 대조 확인")
    a(f"- 구 {PREV_RUTH_BOOKS}권은 `voice='Ruth'` 라 UNIQUE에서 자연 분리 — 무접촉")
    a("- 머지 INSERT에 `ON CONFLICT` 절이 **없다** → 충돌 시 에러로 죽는다(덮어쓰기 구조적 불가)")
    a("- `book_id` 는 VALUES에 박지 않고 `(source_platform, source_id)` 로 `books` 를 조인해")
    a("  얻은 값을 쓴다. 매니페스트 `book_id` 와 불일치하면 `RAISE EXCEPTION`")
    a("")
    a("## v1 파일")
    a("")
    a("`docs/sql/deprecated/` 로 옮겼다(이력 보존). 실행하지 말 것 — Editor 크기 제한에 걸린다.")
    return "\n".join(L) + "\n"


# ─────────────────────────────────────────────────────────── main

def main() -> int:
    ap = argparse.ArgumentParser(description="708권 book_audio 적재 SQL 생성(DB 접속 0건)")
    ap.add_argument("--out-dir", default=str(LOAD_DIR))
    args = ap.parse_args()
    out_dir = Path(args.out_dir)

    try:
        print("[1/5] 매니페스트 로드·검증…")
        books = load_books()
        tot = counts(books)
        print(f"  권수 {tot['books']} · 행수 {tot['rows']}")

        print("[2/5] 업로드 체크포인트·기존 danielle 대조…")
        cross_check(books)
    except Stop as e:
        print(f"[STOP] {e}")
        return 3

    by_platform: dict[str, list[dict]] = {}
    for b in books:
        by_platform.setdefault(b["platform"], []).append(b)
    per_platform = {p: counts(bs) for p, bs in by_platform.items()}
    for p, want in STEPS_EXPECT.items():
        got = per_platform.get(p, {}).get("books", 0)
        if got != want:
            print(f"[STOP] {p} 권수 {got} ≠ 지시서 {want}")
            return 3

    print("[3/5] 청크 분할…")
    chunks = make_chunks(books)
    if chunks[-1]["cum"] != tot["rows"]:
        print(f"[STOP] 청크 누적 {chunks[-1]['cum']} ≠ 총 {tot['rows']}")
        return 3
    print(f"  청크 {len(chunks)}개 (최대 {MAX_CHUNK_ROWS}행 / {MAX_CHUNK_BYTES:,}바이트 기준)")

    out_dir.mkdir(parents=True, exist_ok=True)
    # 이전 생성물 중 청크 파일만 정리(청크 수가 줄어들면 유령 파일이 남는다)
    for old in out_dir.glob("01_chunk_*.sql"):
        old.unlink()

    print("[4/5] 파일 생성…")
    written: list[tuple[str, str]] = []

    p = out_dir / "00_staging_create.sql"
    p.write_text(build_staging_create(tot, chunks), encoding="utf-8")
    written.append((p.name, "staging 생성"))

    for c in chunks:
        p = out_dir / f"01_chunk_{c['no']:02d}.sql"
        p.write_text(build_chunk(c, len(chunks), tot), encoding="utf-8")
        written.append((p.name, f"{c['books']}권 {c['rows']}행 · 누적 {c['cum']}"))

    p = out_dir / "02_staging_verify.sql"
    p.write_text(build_staging_verify(tot, per_platform, chunks), encoding="utf-8")
    written.append((p.name, "전량 게이트"))

    cur = {"books": PREV_DANIELLE_BOOKS, "rows": PREV_DANIELLE_ROWS,
           "page": PREV_DANIELLE_PAGE, "cover": PREV_DANIELLE_COVER}
    step_totals = []
    for i, (step, platform, fname) in enumerate(STEPS):
        pp = per_platform[platform]
        totals = {
            "prev_books": cur["books"], "prev_rows": cur["rows"],
            "prev_page": cur["page"], "prev_cover": cur["cover"],
            "post_books": cur["books"] + pp["books"], "post_rows": cur["rows"] + pp["rows"],
            "post_page": cur["page"] + pp["page"], "post_cover": cur["cover"] + pp["cover"],
        }
        nxt = STEPS[i + 1][2] if i + 1 < len(STEPS) else "06_final_verify.sql"
        p = out_dir / fname
        p.write_text(build_merge(step, platform, fname, pp, totals, nxt), encoding="utf-8")
        written.append((fname, f"{platform} {pp['books']}권 {pp['rows']}행"))
        step_totals.append((step, platform, fname, pp, totals))
        cur = {"books": totals["post_books"], "rows": totals["post_rows"],
               "page": totals["post_page"], "cover": totals["post_cover"]}

    p = out_dir / "06_final_verify.sql"
    p.write_text(build_final_verify(tot, per_platform), encoding="utf-8")
    written.append((p.name, "최종 검증"))

    p = out_dir / "07_staging_drop.sql"
    p.write_text(build_drop(tot), encoding="utf-8")
    written.append((p.name, "staging 정리"))

    p = out_dir / "README.md"
    p.write_text(build_readme(tot, per_platform, chunks, step_totals), encoding="utf-8")
    written.append((p.name, "실행 순서 안내"))

    print("[5/5] 크기 확인…")
    biggest = 0
    for name, _ in written:
        sz = (out_dir / name).stat().st_size
        biggest = max(biggest, sz)
        if name.endswith(".sql") and sz > MAX_CHUNK_BYTES * 1.3:
            print(f"[STOP] {name} 가 {sz:,}바이트 — Editor 제한 위험")
            return 3

    print()
    print("=" * 70)
    print(f"[OK] 총 {tot['books']}권 / {tot['rows']}행 (page {tot['page']} + cover {tot['cover']})")
    print(f"     voice={VOICE} · engine={ENGINE} · rate={RATE} · duration NULL 0행")
    print(f"     최대 파일 크기 {biggest:,}바이트 (v1 step1 = 1,139,390바이트 → Editor 거부됨)")
    print("-" * 70)
    for name, note in written:
        sz = (out_dir / name).stat().st_size
        print(f"  {name:26s} {sz:>8,}B  {note}")
    print("-" * 70)
    print(f"     최종 기대: danielle {PREV_DANIELLE_BOOKS + tot['books']}권"
          f" {PREV_DANIELLE_ROWS + tot['rows']}행")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
