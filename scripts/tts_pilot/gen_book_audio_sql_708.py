#!/usr/bin/env python3
"""gen_book_audio_sql_708.py — 708권 book_audio 적재 SQL 생성기 (로컬 산출물 → .sql).

ADR-0053 D4 전량 확장. **DB 접속 0건 · 쓰기 0건** — 로컬 매니페스트만 읽어 SQL 텍스트를 만든다.
실행은 팀장이 Supabase SQL Editor에서 한다(ADR-0052 D8 워커 DB 직접 쓰기 금지).

선행 조건: Storage 업로드 폐합 완료 (성공 15,888 + 스킵 68 = 15,956, 실패 0).
  → 본 스크립트가 _upload708_checkpoint.json 과 매니페스트를 대조해 재검증한다.

입력:
  out/audio_full708/{platform}-{source_id}/_manifest.json   권별 units[] (정본)
  out/_upload708_checkpoint.json                            업로드 완료 키 목록(대조용)
  out/_fullbatch_report.json + docs/sql/pilot12_danielle_load.sql
                                                            기존 danielle 128권 book_id(교집합 검사용)

출력:
  docs/sql/load708_step1_asb.sql        african_storybook 527권
  docs/sql/load708_step2_bloom.sql      bloom            142권
  docs/sql/load708_step3_bookdash.sql   book_dash         39권
  docs/sql/load708_final_verify.sql     3 step COMMIT 후 최종 검증

행 산출 로직 (UNIQUE (book_id, kind, page_index, voice) 충돌 회피 근거):
  · kind       unit=='cover' → 'cover', 그 외 → 'page'
  · page_index 'pNN' → **NN - 1** (1-based 파일명 ↔ 0-based 컬럼, ADR-0052 D5).
               표지는 page_index=0 고정 placeholder (ADR-0034 Amd#1). kind가 UNIQUE에
               포함되므로 표지(cover,0)와 본문 첫 면(page,0)은 공존한다.
  · audio_path 매니페스트 key_prefix + 파일명. **버킷명 미포함 오브젝트 키만**(ADR-0034).
  · voice      'danielle' — 구 44권 'Ruth'와 표기가 달라 UNIQUE에서 자연 분리된다.
  · rate       atempo 0.85의 실효 속도 85 (SSML prosody 아님 — ADR-0052 Amd#2).
  · duration_ms 매니페스트 out_ms = 감속 후 mp3 실측(ffmpeg). 마크 프록시 아님.

book_id 매핑:
  매니페스트가 book_id를 들고 있으나 **그대로 믿지 않는다**. 생성되는 SQL은
  (source_platform, source_id)로 books를 조인해 id를 얻고, 매니페스트 book_id와
  일치하는지 대조한다. 불일치·매핑 실패가 1건이라도 있으면 RAISE EXCEPTION 으로 즉시 중단.

사용: python scripts/tts_pilot/gen_book_audio_sql_708.py
"""
from __future__ import annotations

import argparse
import json
import re
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
SQL_DIR = REPO / "docs" / "sql"

VOICE = "danielle"
ENGINE = "long-form"
RATE = 85           # atempo 0.85 → 실효 속도
ATEMPO = 0.85

# 기존 DB 현황 — 로컬 산출물로 확정한 기준값 (pilot12 + fullbatch116)
PREV_DANIELLE_BOOKS = 128
PREV_DANIELLE_ROWS = 1614   # 150(pilot12) + 1464(fullbatch116)
PREV_DANIELLE_PAGE = 1486   # 138 + 1348
PREV_DANIELLE_COVER = 128   # 12 + 116
PREV_RUTH_BOOKS = 44
PREV_RUTH_ROWS = 574

STEPS = [
    ("step1", "african_storybook", "asb", "load708_step1_asb.sql"),
    ("step2", "bloom", "bloom", "load708_step2_bloom.sql"),
    ("step3", "book_dash", "bookdash", "load708_step3_bookdash.sql"),
]

_UNIT_RE = re.compile(r"^p(\d+)$")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")
_SAFE_PATH = re.compile(r"^[A-Za-z0-9._/-]+$")


class Stop(Exception):
    """생성 중단 사유. 1건이라도 발생하면 SQL을 쓰지 않는다."""


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

    # 기존 danielle 128권과 교집합 0 확인 (충돌 드라이런의 로컬 근거)
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


_UUID_ANY = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)


def q(v) -> str:
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def build_step_sql(step: str, platform: str, fname: str, books: list[dict], totals: dict) -> str:
    n_books = len(books)
    n_page = sum(1 for b in books for r in b["rows"] if r[0] == "page")
    n_cover = sum(1 for b in books for r in b["rows"] if r[0] == "cover")
    n_rows = n_page + n_cover
    stage = f"_stage_load708_{step}"

    L: list[str] = []
    a = L.append
    a(f"-- {fname} — 708권 Danielle 오디오 book_audio 적재 · {step} ({platform})")
    a("-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)")
    a("-- 근거: ADR-0053 D4(전량 확장) / ADR-0034(결정 ①②③ + Amd#1 kind · Amd#2 성우 층위)")
    a("--       / ADR-0052 D5(page_index 축) · Amd#2(rate 의미) · D8(워커 DB 직접 쓰기 금지)")
    a("--")
    a("-- ★★ 이 파일은 끝이 ROLLBACK; 이다. 그대로 실행하면 **아무것도 남지 않는다**. ★★")
    a("--    검증 SELECT 결과가 전부 기대값과 같으면, 맨 끝 ROLLBACK; 을 COMMIT; 으로")
    a("--    직접 고쳐 타이핑한 뒤 다시 실행할 것. (자동 COMMIT 금지 — 팀장 확인 영역)")
    a("--")
    a("-- ※ Supabase SQL Editor는 스크립트를 자체 트랜잭션으로 감싸는 경우가 있어 BEGIN에서")
    a("--   'there is already a transaction in progress' WARNING이 뜰 수 있다. 경고이지 에러가")
    a("--   아니며 ROLLBACK/COMMIT은 정상 동작한다. ERROR 로 시작하는 줄만 실패로 취급할 것.")
    a("-- ※ [3]·[4]의 DO 블록은 fail-closed 가드다. 여기서 STOP이 뜨면 트랜잭션이 죽고 이후")
    a("--   문장이 'current transaction is aborted'로 줄줄이 실패한다 — 정상 동작이다.")
    a("--   맨 처음 뜬 STOP 메시지만 워커에게 전달하면 된다.")
    a("--")
    a("-- ★ 선행 조건: Storage 업로드 폐합 완료(성공 15,888 + 스킵 68 = 15,956, 실패 0).")
    a("--   audio_path가 가리키는 오브젝트가 없으면 행만 생기고 재생이 깨진다.")
    a("--   본 SQL 생성 시 매니페스트 ↔ 업로드 체크포인트 1:1 대조를 통과했다.")
    a("--")
    a(f"-- 규모: {n_books}권 / {n_rows}행 (page {n_page} + cover {n_cover})")
    a(f"-- 값  : voice='{VOICE}' · engine='{ENGINE}' · rate={RATE}"
      f" (atempo {ATEMPO}의 실효 속도, SSML prosody 아님)")
    a("--        duration_ms = 감속 후 mp3 실측(ffmpeg). 마크 프록시 아님. NULL 0행.")
    a("--        audio_path/marks_path = 버킷명 미포함 **오브젝트 키만** (ADR-0034)")
    a("--")
    a("-- page_index 축: 파일명 pNN은 1-based, 컬럼 page_index는 0-based → page_index = NN - 1.")
    a("--   표지는 page_index=0 고정 placeholder이며 kind='cover'로 본문 첫 면과 구분된다")
    a("--   (UNIQUE에 kind 포함 — ADR-0034 Amd#1).")
    a("--")
    a("-- 기존 행 보호:")
    a(f"--   · 기존 danielle {PREV_DANIELLE_BOOKS}권({PREV_DANIELLE_ROWS}행)과 교집합 0"
      " — 로컬 산출물 대조 확인. 아래 [4]에서 DB로 재확인한다.")
    a(f"--   · 구 {PREV_RUTH_BOOKS}권은 voice='Ruth'라 UNIQUE에서 자연 분리 — 건드리지 않는다.")
    a("--   · INSERT 는 ON CONFLICT 절이 **없다**. 충돌이 있으면 에러로 죽는다(=덮어쓰기 불가).")
    a("--     이것이 의도다 — 기존 행 무접촉을 SQL 레벨에서 보장한다.")
    a("--")
    a("-- SQL Editor 표시 100행 제한 대응: 모든 검증문을 COUNT 기반으로 작성했다(행 나열 없음).")
    a("")
    a("BEGIN;")
    a("")
    a("-- ============================================================")
    a("-- [0] 사전 상태 스냅샷 — 적재 전 기준값")
    a("-- ============================================================")
    a(f"-- 기대: danielle_books {totals['prev_books']} / danielle_rows {totals['prev_rows']}"
      f" / page {totals['prev_page']} / cover {totals['prev_cover']}")
    a("--   (step1 기준값은 pilot12+fullbatch116 = 128권 1614행. step2/step3는 앞 step COMMIT 반영값)")
    a("--   이 수치가 다르면 즉시 중단하고 원인을 확인할 것(앞 step 미실행? 중복 실행?).")
    a("SELECT count(DISTINCT book_id) AS danielle_books,")
    a("       count(*)                               AS danielle_rows,")
    a("       count(*) FILTER (WHERE kind = 'page')  AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover') AS cover_rows")
    a(f"  FROM public.book_audio WHERE voice = '{VOICE}';")
    a("")
    a(f"-- 구 {PREV_RUTH_BOOKS}권(voice='Ruth') 기준값 — 본 적재 무간섭을 사후 대조할 값")
    a(f"-- 기대: ruth_books {PREV_RUTH_BOOKS} / ruth_rows {PREV_RUTH_ROWS}")
    a("SELECT count(DISTINCT book_id) AS ruth_books, count(*) AS ruth_rows")
    a("  FROM public.book_audio WHERE voice = 'Ruth';")
    a("")
    a("-- ============================================================")
    a(f"-- [1] 스테이징 — {n_rows}행을 임시 테이블에 올린다 (ON COMMIT DROP)")
    a("-- ============================================================")
    a("-- book_id를 VALUES에 직접 박지 않는다. (source_platform, source_id)로 books를 조인해")
    a("-- 얻고, 매니페스트가 기록한 book_id와 일치하는지 [3]에서 대조한다.")
    a(f"CREATE TEMP TABLE {stage} (")
    a("  source_platform  text NOT NULL,")
    a("  source_id        text NOT NULL,")
    a("  manifest_book_id uuid NOT NULL,")
    a("  kind             text NOT NULL,")
    a("  page_index       int  NOT NULL,")
    a("  audio_path       text NOT NULL,")
    a("  marks_path       text,")
    a("  duration_ms      int  NOT NULL")
    a(") ON COMMIT DROP;")
    a("")
    a(f"INSERT INTO {stage}")
    a("  (source_platform, source_id, manifest_book_id, kind, page_index, audio_path, marks_path, duration_ms)")
    a("VALUES")

    idx = 0
    for b in books:
        a(f"  -- {b['key']}  (page {sum(1 for r in b['rows'] if r[0] == 'page')}"
          f" + cover {sum(1 for r in b['rows'] if r[0] == 'cover')})")
        for kind, pi, audio, marks, dur in b["rows"]:
            idx += 1
            comma = "," if idx < n_rows else ";"
            a(f"  ({q(b['platform'])}, {q(b['source_id'])}, {q(b['book_id'])}, "
              f"{q(kind)}, {pi}, {q(audio)}, {q(marks)}, {dur}){comma}")
    a("")
    a("-- ============================================================")
    a("-- [2] 스테이징 자체 검증 — 매니페스트가 그대로 올라왔는가")
    a("-- ============================================================")
    a(f"-- 기대: staged_rows {n_rows} / staged_books {n_books} / page {n_page} / cover {n_cover}")
    a("SELECT count(*)                               AS staged_rows,")
    a("       count(DISTINCT source_id)              AS staged_books,")
    a("       count(*) FILTER (WHERE kind = 'page')  AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover') AS cover_rows")
    a(f"  FROM {stage};")
    a("")
    a("-- 스테이징 내부 중복·결측 (기대: 전부 0)")
    a("SELECT")
    a("  (SELECT count(*) FROM (SELECT 1 FROM " + stage)
    a("      GROUP BY source_platform, source_id, kind, page_index HAVING count(*) > 1) t)")
    a("                                                    AS dup_unit_key,")
    a(f"  (SELECT count(*) FROM (SELECT 1 FROM {stage}")
    a("      GROUP BY audio_path HAVING count(*) > 1) t)    AS dup_audio_path,")
    a(f"  (SELECT count(*) FROM {stage} WHERE duration_ms IS NULL) AS null_duration,")
    a(f"  (SELECT count(*) FROM {stage} WHERE marks_path IS NULL)  AS null_marks,")
    a(f"  (SELECT count(*) FROM {stage}")
    a(f"    WHERE audio_path LIKE 'book-audio/%'")
    a(f"       OR audio_path NOT LIKE '%/{VOICE}/%')          AS bad_path;")
    a("")
    a("-- ============================================================")
    a("-- [3] book_id 매핑 검증 — (source_platform, source_id) → books.id")
    a("-- ============================================================")
    a(f"-- 기대: mapped_books {n_books} / unmapped_rows 0 / mismatched_rows 0")
    a("--   unmapped  = books에 그 (platform, source_id)가 없음")
    a("--   mismatched= books.id 와 매니페스트 book_id 불일치")
    a("SELECT")
    a("  (SELECT count(DISTINCT b.id)")
    a(f"     FROM {stage} s JOIN public.books b")
    a("       ON b.source_platform = s.source_platform AND b.source_id = s.source_id)")
    a("                                                     AS mapped_books,")
    a(f"  (SELECT count(*) FROM {stage} s WHERE NOT EXISTS (")
    a("      SELECT 1 FROM public.books b")
    a("       WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id))")
    a("                                                     AS unmapped_rows,")
    a(f"  (SELECT count(*) FROM {stage} s JOIN public.books b")
    a("       ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a("    WHERE b.id <> s.manifest_book_id)                AS mismatched_rows;")
    a("")
    a("-- 하드 가드 — 위 셋 중 하나라도 어긋나면 여기서 트랜잭션을 죽인다(fail-closed).")
    a("DO $$")
    a("DECLARE v_unmapped int; v_mismatch int; v_books int;")
    a("BEGIN")
    a(f"  SELECT count(*) INTO v_unmapped FROM {stage} s WHERE NOT EXISTS (")
    a("    SELECT 1 FROM public.books b")
    a("     WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id);")
    a(f"  SELECT count(*) INTO v_mismatch FROM {stage} s JOIN public.books b")
    a("     ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a("   WHERE b.id <> s.manifest_book_id;")
    a(f"  SELECT count(DISTINCT source_id) INTO v_books FROM {stage};")
    a("  IF v_unmapped <> 0 THEN")
    a("    RAISE EXCEPTION 'STOP: books 매핑 실패 % 행 — 적재 중단', v_unmapped;")
    a("  END IF;")
    a("  IF v_mismatch <> 0 THEN")
    a("    RAISE EXCEPTION 'STOP: 매니페스트 book_id 불일치 % 행 — 적재 중단', v_mismatch;")
    a("  END IF;")
    a(f"  IF v_books <> {n_books} THEN")
    a(f"    RAISE EXCEPTION 'STOP: 스테이징 권수 % ≠ 기대 {n_books} — 적재 중단', v_books;")
    a("  END IF;")
    a("END $$;")
    a("")
    a("-- ============================================================")
    a("-- [4] 충돌 사전 검사 — (book_id, kind, page_index, voice) 기준")
    a("-- ============================================================")
    a("-- 기대: conflict_rows 0 (신규 삽입만 발생). 1건이라도 있으면 기존 행을 건드린다는 뜻.")
    a("SELECT count(*) AS conflict_rows")
    a(f"  FROM {stage} s")
    a("  JOIN public.books b")
    a("    ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a("  JOIN public.book_audio a")
    a("    ON a.book_id = b.id AND a.kind = s.kind")
    a(f"   AND a.page_index = s.page_index AND a.voice = '{VOICE}';")
    a("")
    a("-- 참고: audio_path 기준 충돌(다른 voice 층위 포함) — 기대 0")
    a("SELECT count(*) AS conflict_audio_path")
    a(f"  FROM {stage} s JOIN public.book_audio a ON a.audio_path = s.audio_path;")
    a("")
    a("-- 하드 가드 — 충돌이 있으면 여기서 죽인다.")
    a("DO $$")
    a("DECLARE v int;")
    a("BEGIN")
    a(f"  SELECT count(*) INTO v FROM {stage} s")
    a("    JOIN public.books b")
    a("      ON b.source_platform = s.source_platform AND b.source_id = s.source_id")
    a("    JOIN public.book_audio a")
    a("      ON a.book_id = b.id AND a.kind = s.kind")
    a(f"     AND a.page_index = s.page_index AND a.voice = '{VOICE}';")
    a("  IF v <> 0 THEN")
    a("    RAISE EXCEPTION 'STOP: 기존 행과 충돌 % 건 — 적재 중단', v;")
    a("  END IF;")
    a(f"  SELECT count(*) INTO v FROM {stage} s")
    a("    JOIN public.book_audio a ON a.audio_path = s.audio_path;")
    a("  IF v <> 0 THEN")
    a("    RAISE EXCEPTION 'STOP: audio_path 중복 % 건 — 적재 중단', v;")
    a("  END IF;")
    a("END $$;")
    a("")
    a("-- ============================================================")
    a(f"-- [5] book_audio INSERT — {n_books}권 / {n_rows}행")
    a("-- ============================================================")
    a("-- ON CONFLICT 절 없음 = 덮어쓰기 불가. [4]를 통과했으므로 전량 신규 삽입이다.")
    a("INSERT INTO public.book_audio")
    a("  (book_id, kind, page_index, audio_path, marks_path, voice, engine, rate, duration_ms)")
    a("SELECT b.id, s.kind, s.page_index, s.audio_path, s.marks_path,")
    a(f"       '{VOICE}', '{ENGINE}', {RATE}, s.duration_ms")
    a(f"  FROM {stage} s")
    a("  JOIN public.books b")
    a("    ON b.source_platform = s.source_platform AND b.source_id = s.source_id;")
    a("")
    a("-- ============================================================")
    a("-- [6] 사후 검증")
    a("-- ============================================================")
    a(f"-- 기대: danielle_books {totals['post_books']} / danielle_rows {totals['post_rows']}"
      f" / page {totals['post_page']} / cover {totals['post_cover']}")
    a(f"--   (= 적재 전 {totals['prev_books']}권 {totals['prev_rows']}행 + 본 step {n_books}권 {n_rows}행)")
    a("SELECT count(DISTINCT book_id) AS danielle_books,")
    a("       count(*)                               AS danielle_rows,")
    a("       count(*) FILTER (WHERE kind = 'page')  AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover') AS cover_rows")
    a(f"  FROM public.book_audio WHERE voice = '{VOICE}';")
    a("")
    a(f"-- 본 step 적재분만 재확인 (기대: books {n_books} / rows {n_rows}"
      f" / page {n_page} / cover {n_cover})")
    a("SELECT count(DISTINCT a.book_id)                 AS step_books,")
    a("       count(*)                                  AS step_rows,")
    a("       count(*) FILTER (WHERE a.kind = 'page')   AS page_rows,")
    a("       count(*) FILTER (WHERE a.kind = 'cover')  AS cover_rows")
    a("  FROM public.book_audio a")
    a(f"  JOIN {stage} s ON s.audio_path = a.audio_path;")
    a("")
    a(f"-- 표지 누락 권 (기대: 0) — 본 step {n_books}권 중 cover 행이 없는 책")
    a("SELECT count(*) AS books_missing_cover FROM (")
    a("  SELECT b.id FROM public.books b")
    a(f"   WHERE b.source_platform = '{platform}'")
    a(f"     AND b.source_id IN (SELECT DISTINCT source_id FROM {stage})")
    a("     AND NOT EXISTS (SELECT 1 FROM public.book_audio a")
    a(f"                      WHERE a.book_id = b.id AND a.voice = '{VOICE}' AND a.kind = 'cover')")
    a(") t;")
    a("")
    a("-- 경로 규약 위반 (기대: 0) — 버킷명 접두사 혼입 · 성우 층위 누락")
    a("SELECT count(*) AS bad_path FROM public.book_audio")
    a(f" WHERE voice = '{VOICE}'")
    a(f"   AND (audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/{VOICE}/%');")
    a("")
    a("-- duration_ms NULL (기대: 0)")
    a(f"SELECT count(*) AS null_duration FROM public.book_audio WHERE voice = '{VOICE}' AND duration_ms IS NULL;")
    a("")
    a(f"-- 구 {PREV_RUTH_BOOKS}권 무간섭 확인 (기대: [0]과 동일한"
      f" {PREV_RUTH_BOOKS} / {PREV_RUTH_ROWS})")
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
    a(f"-- │ [0] 적재 전   danielle  books {totals['prev_books']:>4}  rows {totals['prev_rows']:>5}"
      f"  page {totals['prev_page']:>5}  cover {totals['prev_cover']:>4}")
    a(f"-- │             Ruth      books {PREV_RUTH_BOOKS:>4}  rows {PREV_RUTH_ROWS:>5}")
    a(f"-- │ [2] 스테이징  rows {n_rows:>5}  books {n_books:>4}  page {n_page:>5}  cover {n_cover:>4}")
    a("-- │             dup_unit_key 0 · dup_audio_path 0 · null_duration 0")
    a("-- │             null_marks 0 · bad_path 0")
    a(f"-- │ [3] 매핑      mapped_books {n_books:>4} · unmapped_rows 0 · mismatched_rows 0")
    a("-- │ [4] 충돌      conflict_rows 0 · conflict_audio_path 0")
    a(f"-- │ [5] INSERT   {n_rows}행")
    a(f"-- │ [6] 적재 후   danielle  books {totals['post_books']:>4}  rows {totals['post_rows']:>5}"
      f"  page {totals['post_page']:>5}  cover {totals['post_cover']:>4}")
    a(f"-- │             step 적재분 books {n_books:>4}  rows {n_rows:>5}")
    a("-- │             books_missing_cover 0 · bad_path 0 · null_duration 0")
    a(f"-- │             Ruth      books {PREV_RUTH_BOOKS:>4}  rows {PREV_RUTH_ROWS:>5} (불변)")
    a("-- ├──────────────────────────────────────────────────────────┤")
    a("-- │ 전부 일치하면 위 ROLLBACK; 을 COMMIT; 으로 바꿔 재실행.")
    a("-- │ 하나라도 다르면 COMMIT 하지 말고 워커에게 수치를 그대로 전달할 것.")
    a("-- └──────────────────────────────────────────────────────────┘")
    return "\n".join(L) + "\n"


def build_final_verify(books: list[dict], per_platform: dict) -> str:
    n_books = len(books)
    n_page = sum(1 for b in books for r in b["rows"] if r[0] == "page")
    n_cover = sum(1 for b in books for r in b["rows"] if r[0] == "cover")
    n_rows = n_page + n_cover
    tot_books = PREV_DANIELLE_BOOKS + n_books
    tot_rows = PREV_DANIELLE_ROWS + n_rows
    tot_page = PREV_DANIELLE_PAGE + n_page
    tot_cover = PREV_DANIELLE_COVER + n_cover

    L: list[str] = []
    a = L.append
    a("-- load708_final_verify.sql — step1~3 COMMIT 완료 후 최종 검증 (읽기 전용)")
    a("-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)")
    a("-- 근거: ADR-0053 D4 / ADR-0034 / ADR-0052")
    a("--")
    a("-- ★ 이 파일에는 INSERT/UPDATE/DELETE가 **없다**. 전부 SELECT — 안전하게 반복 실행 가능.")
    a("-- ★ 실행 시점: load708_step1_asb / step2_bloom / step3_bookdash 를 모두 COMMIT 한 뒤.")
    a("--")
    a(f"-- 신규 적재분: {n_books}권 / {n_rows}행 (page {n_page} + cover {n_cover})")
    a(f"-- 기존 danielle: {PREV_DANIELLE_BOOKS}권 / {PREV_DANIELLE_ROWS}행 (pilot12 + fullbatch116)")
    a(f"-- 최종 danielle: {tot_books}권 / {tot_rows}행 (page {tot_page} + cover {tot_cover})")
    a("")
    a("-- ============================================================")
    a("-- [1] danielle 총계")
    a("-- ============================================================")
    a(f"-- 기대: books {tot_books} / rows {tot_rows} / page {tot_page} / cover {tot_cover}")
    a("SELECT count(DISTINCT book_id) AS danielle_books,")
    a("       count(*)                               AS danielle_rows,")
    a("       count(*) FILTER (WHERE kind = 'page')  AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover') AS cover_rows")
    a(f"  FROM public.book_audio WHERE voice = '{VOICE}';")
    a("")
    a("-- ============================================================")
    a("-- [2] voice별 분포 — 구 Ruth 무간섭 확인")
    a("-- ============================================================")
    a(f"-- 기대: danielle {tot_books}권 {tot_rows}행 · Ruth {PREV_RUTH_BOOKS}권 {PREV_RUTH_ROWS}행")
    a(f"--       총 {tot_rows + PREV_RUTH_ROWS}행 (그 밖의 voice가 나오면 예상 밖 — 보고할 것)")
    a("SELECT voice, count(DISTINCT book_id) AS books, count(*) AS row_count")
    a("  FROM public.book_audio GROUP BY voice ORDER BY voice;")
    a("")
    a("-- ============================================================")
    a("-- [3] 신규 danielle 708권 — 플랫폼별 분포")
    a("-- ============================================================")
    a("-- 기대:")
    for _, platform, _, _ in STEPS:
        p = per_platform[platform]
        a(f"--   {platform:<18} books {p['books']:>4} · rows {p['rows']:>5}"
          f" (page {p['page']} + cover {p['cover']})")
    a("-- ※ 이 쿼리는 신규분만 세도록 audio_path의 '/danielle/' 층위와 books 조인을 함께 건다.")
    a("--   기존 128권(Book Dash pilot12+fullbatch116)은 slug 기반 경로라 book_dash 행에 섞인다 —")
    a(f"--   그래서 기대값은 book_dash {per_platform['book_dash']['books']}"
      f" + {PREV_DANIELLE_BOOKS} = {per_platform['book_dash']['books'] + PREV_DANIELLE_BOOKS}권이다.")
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
    a("-- [4] 무결성 — 전부 0이어야 한다")
    a("-- ============================================================")
    a("-- 기대: dup_audio_path 0 / null_duration 0 / null_audio_path 0")
    a("--       bad_path 0 / books_missing_cover 0 / orphan_book_id 0")
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
    a("-- [5] UNIQUE 키 중복 — (book_id, kind, page_index, voice)")
    a("-- ============================================================")
    a("-- 기대: 0 (제약이 살아 있으면 구조적으로 0이지만, 제약 유효성 자체를 확인한다)")
    a("SELECT count(*) AS dup_unique_key FROM (")
    a("  SELECT 1 FROM public.book_audio")
    a("   GROUP BY book_id, kind, page_index, voice HAVING count(*) > 1")
    a(") t;")
    a("")
    a("-- ============================================================")
    a("-- [6] 권별 page_index 연속성 — 신규 708권")
    a("-- ============================================================")
    a("-- 기대: gap_books 0. page 행의 page_index가 0..(n-1) 연속인지 본다.")
    a("--   (매니페스트의 pNN이 연속이었으므로 DB에서도 연속이어야 한다)")
    a("SELECT count(*) AS gap_books FROM (")
    a("  SELECT a.book_id")
    a("    FROM public.book_audio a")
    a(f"   WHERE a.voice = '{VOICE}' AND a.kind = 'page'")
    a("   GROUP BY a.book_id")
    a("  HAVING max(a.page_index) <> count(*) - 1 OR min(a.page_index) <> 0")
    a(") t;")
    a("")
    a("-- ============================================================")
    a("-- [7] 참고 — 후속 작업 판단용 (본 적재 범위 밖)")
    a("-- ============================================================")
    a("-- ⚠ books.has_audio 갱신과 book_review.status 전이는 본 3 step에 **포함하지 않았다**.")
    a("--   앱은 has_audio를 읽지 않고 book_audio 행 존재로 판정하므로(lib/book/audio-manifest.ts)")
    a("--   화면에는 영향이 없다. SQL 레벨 정합이 필요하면 별도 판단 후 실행할 것.")
    a("-- 현재 상태만 조회한다(쓰기 없음).")
    a("SELECT count(*) AS danielle_books_has_audio_false")
    a("  FROM public.books b")
    a(f" WHERE b.has_audio = false")
    a(f"   AND b.id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = '{VOICE}');")
    a("")
    a("SELECT r.status, count(*) AS books")
    a("  FROM public.book_review r")
    a(f" WHERE r.book_id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = '{VOICE}')")
    a(" GROUP BY r.status ORDER BY r.status;")
    a("")
    a("-- ┌──────────────────────────────────────────────────────────┐")
    a("-- │ 최종 기대값 대조표 — 팀장 확인용")
    a("-- ├──────────────────────────────────────────────────────────┤")
    a(f"-- │ [1] danielle  books {tot_books:>4}  rows {tot_rows:>5}"
      f"  page {tot_page:>5}  cover {tot_cover:>4}")
    a(f"-- │ [2] voice     danielle {tot_books:>4}권 {tot_rows:>5}행"
      f" · Ruth {PREV_RUTH_BOOKS}권 {PREV_RUTH_ROWS}행")
    a(f"-- │             book_audio 총 {tot_rows + PREV_RUTH_ROWS}행")
    a("-- │ [3] 플랫폼별  "
      + f"african_storybook {per_platform['african_storybook']['books']}권"
        f" {per_platform['african_storybook']['rows']}행")
    a(f"-- │             bloom {per_platform['bloom']['books']}권 {per_platform['bloom']['rows']}행")
    a(f"-- │             book_dash {per_platform['book_dash']['books'] + PREV_DANIELLE_BOOKS}권"
      f" {per_platform['book_dash']['rows'] + PREV_DANIELLE_ROWS}행 (신규"
      f" {per_platform['book_dash']['books']} + 기존 {PREV_DANIELLE_BOOKS})")
    a("-- │ [4] 무결성    dup_audio_path 0 · null_duration 0 · null_audio_path 0")
    a("-- │             bad_path 0 · books_missing_cover 0 · orphan_book_id 0")
    a("-- │ [5] UNIQUE    dup_unique_key 0")
    a("-- │ [6] 연속성    gap_books 0")
    a("-- └──────────────────────────────────────────────────────────┘")
    return "\n".join(L) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="708권 book_audio 적재 SQL 생성(DB 접속 0건)")
    ap.add_argument("--out-dir", default=str(SQL_DIR))
    args = ap.parse_args()
    out_dir = Path(args.out_dir)

    try:
        print("[1/4] 매니페스트 로드·검증…")
        books = load_books()
        print(f"  권수 {len(books)} · 행수 {sum(len(b['rows']) for b in books)}")

        print("[2/4] 업로드 체크포인트·기존 danielle 대조…")
        cross_check(books)
    except Stop as e:
        print(f"[STOP] {e}")
        return 3

    by_platform: dict[str, list[dict]] = {}
    for b in books:
        by_platform.setdefault(b["platform"], []).append(b)

    per_platform = {}
    for p, bs in by_platform.items():
        pg = sum(1 for b in bs for r in b["rows"] if r[0] == "page")
        cv = sum(1 for b in bs for r in b["rows"] if r[0] == "cover")
        per_platform[p] = {"books": len(bs), "page": pg, "cover": cv, "rows": pg + cv}

    expected = {p: STEPS_EXPECT[p] for p in STEPS_EXPECT}
    for p, want in expected.items():
        got = per_platform.get(p, {}).get("books", 0)
        if got != want:
            print(f"[STOP] {p} 권수 {got} ≠ 지시서 {want}")
            return 3

    print("[3/4] step SQL 생성…")
    # 누적 기준값 — 각 step은 앞 step이 COMMIT 된 상태를 전제한다
    cur = {"books": PREV_DANIELLE_BOOKS, "rows": PREV_DANIELLE_ROWS,
           "page": PREV_DANIELLE_PAGE, "cover": PREV_DANIELLE_COVER}
    written: list[tuple[Path, int, int]] = []
    for step, platform, _short, fname in STEPS:
        bs = by_platform[platform]
        pp = per_platform[platform]
        totals = {
            "prev_books": cur["books"], "prev_rows": cur["rows"],
            "prev_page": cur["page"], "prev_cover": cur["cover"],
            "post_books": cur["books"] + pp["books"], "post_rows": cur["rows"] + pp["rows"],
            "post_page": cur["page"] + pp["page"], "post_cover": cur["cover"] + pp["cover"],
        }
        sql = build_step_sql(step, platform, fname, bs, totals)
        path = out_dir / fname
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(sql, encoding="utf-8")
        written.append((path, pp["books"], pp["rows"]))
        cur = {"books": totals["post_books"], "rows": totals["post_rows"],
               "page": totals["post_page"], "cover": totals["post_cover"]}

    print("[4/4] 최종 검증 SQL 생성…")
    fv = out_dir / "load708_final_verify.sql"
    fv.write_text(build_final_verify(books, per_platform), encoding="utf-8")

    n_page = sum(1 for b in books for r in b["rows"] if r[0] == "page")
    n_cover = sum(1 for b in books for r in b["rows"] if r[0] == "cover")
    print()
    print("=" * 66)
    print(f"[OK] 총 {len(books)}권 / {n_page + n_cover}행 (page {n_page} + cover {n_cover})")
    print(f"     voice={VOICE} · engine={ENGINE} · rate={RATE} · duration NULL 0행")
    print(f"     충돌 드라이런: 기존 danielle {PREV_DANIELLE_BOOKS}권과 교집합 0 · audio_path 중복 0")
    print(f"     매핑 드라이런: book_id UUID 형식 {len(books)}/{len(books)} · 중복 0")
    print("-" * 66)
    for path, nb, nr in written:
        print(f"  {path.relative_to(REPO)}  {nb}권 {nr}행")
    print(f"  {fv.relative_to(REPO)}  (읽기 전용)")
    print(f"     최종 기대: danielle {PREV_DANIELLE_BOOKS + len(books)}권"
          f" {PREV_DANIELLE_ROWS + n_page + n_cover}행")
    print("=" * 66)
    return 0


STEPS_EXPECT = {"african_storybook": 527, "bloom": 142, "book_dash": 39}


if __name__ == "__main__":
    sys.exit(main())
