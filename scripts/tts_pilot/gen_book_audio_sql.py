#!/usr/bin/env python3
"""gen_book_audio_sql.py — 전량 116권 book_audio 적재 SQL 생성기 (로컬 산출물 → .sql).

ADR-0053 실행 3단계 준비. **DB 접속 0건 · 쓰기 0건** — 로컬 매니페스트만 읽어 SQL 텍스트를 만든다.
실행은 팀장이 Supabase SQL Editor에서 한다(ADR-0052 D8 워커 DB 직접 쓰기 금지).

입력:
  out/_fullbatch_report.json                    대상 목록·프리셋 단일 진실
  out/audio_full_danielle/{slug}/_manifest.json 권별 units[](파일명·duration)

출력:
  docs/sql/fullbatch116_danielle_load.sql

행 산출 로직 (UNIQUE (book_id, kind, page_index, voice) 충돌 회피 근거):
  · kind       unit=='cover' → 'cover', 그 외 → 'page'
  · page_index 'pNN' → **NN - 1** (1-based 파일명 ↔ 0-based 컬럼, ADR-0052 D5)
               표지는 page_index=0 고정 placeholder (ADR-0034 Amd#1).
               kind가 UNIQUE에 포함되므로 표지(cover,0)와 본문 첫 면(page,0)은 공존한다.
  · audio_path 매니페스트 key_prefix + 파일명. **버킷명 미포함 오브젝트 키만**(ADR-0034).
  · voice      프리셋 voice_key('danielle', 소문자) — 구 44권 'Ruth'와 표기가 달라
               UNIQUE에서 자연 분리된다(같은 책·면에 두 성우 공존 가능).
  · 권 내 page_index 중복은 생성 단계에서 검사해 발견 시 STOP(아래 verify_units).

사용: python scripts/tts_pilot/gen_book_audio_sql.py
      python scripts/tts_pilot/gen_book_audio_sql.py --out <경로>
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
AUDIO_ROOT = OUT / "audio_full_danielle"
REPORT = OUT / "_fullbatch_report.json"
DEFAULT_SQL = REPO / "docs" / "sql" / "fullbatch116_danielle_load.sql"

_UNIT_RE = re.compile(r"^p(\d+)$")
_SAFE_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_SAFE_PATH = re.compile(r"^[A-Za-z0-9._/-]+$")


def rows_for_book(slug: str, book_id: str) -> list[tuple]:
    """(book_id, kind, page_index, audio_path, marks_path, duration_ms) 행 목록."""
    man = json.loads((AUDIO_ROOT / slug / "_manifest.json").read_text(encoding="utf-8"))
    if man["book_id"] != book_id:
        raise ValueError(f"{slug}: 매니페스트 book_id 불일치")
    prefix = man["key_prefix"]
    out: list[tuple] = []
    for u in man["units"]:
        unit = u["unit"]
        if unit == "cover":
            kind, page_index = "cover", 0
        else:
            m = _UNIT_RE.fullmatch(unit)
            if not m:
                raise ValueError(f"{slug}: 알 수 없는 unit — {unit}")
            kind, page_index = "page", int(m.group(1)) - 1
            if page_index < 0:
                raise ValueError(f"{slug}: page_index 음수 — {unit}")
        audio = f"{prefix}/{u['file']}"
        marks = f"{prefix}/{u['marks_file']}" if u.get("marks_file") else None
        for p in (audio, marks):
            if p and not _SAFE_PATH.fullmatch(p):
                raise ValueError(f"{slug}: 경로에 예상 밖 문자 — {p}")
        out.append((book_id, kind, page_index, audio, marks, u.get("out_ms")))
    return out


def verify_units(rows: list[tuple], slug: str) -> None:
    """권 내 (kind, page_index) 중복 = UNIQUE 위반 예고. 발견 시 STOP."""
    seen = set()
    for _, kind, pi, *_ in rows:
        if (kind, pi) in seen:
            raise ValueError(f"{slug}: (kind={kind}, page_index={pi}) 중복 — UNIQUE 충돌 예고")
        seen.add((kind, pi))


def sql_val(v) -> str:
    return "NULL" if v is None else f"'{v}'"


def main() -> int:
    ap = argparse.ArgumentParser(description="116권 book_audio 적재 SQL 생성(DB 접속 0건)")
    ap.add_argument("--out", default=str(DEFAULT_SQL))
    args = ap.parse_args()

    rep = json.loads(REPORT.read_text(encoding="utf-8"))
    if rep.get("books_failed"):
        print(f"[STOP] 생성 실패 권 {rep['books_failed']}권 — SQL 생성 중단")
        return 3
    preset = rep["preset"]
    voice = preset["voice_key"]
    engine = preset["engine"]
    # rate 컬럼에는 ffmpeg atempo로 얻은 '실효 속도'를 기록한다(SSML prosody 아님 — ADR-0052 Amd#2).
    rate = int(round(float(preset["atempo"]) * 100))

    books = [b for b in rep["books"] if b.get("ok")]
    all_rows: list[tuple] = []
    per_book: list[tuple[str, str, int, int]] = []  # slug, book_id, page행, cover행

    for b in books:
        slug, book_id = b["slug"], b["book_id"]
        if not _SAFE_SLUG.fullmatch(slug):
            print(f"[STOP] slug 문자 이상: {slug}")
            return 3
        if not _UUID.fullmatch(book_id):
            print(f"[STOP] book_id UUID 아님: {slug}")
            return 3
        rows = rows_for_book(slug, book_id)
        verify_units(rows, slug)
        all_rows.extend(rows)
        per_book.append((slug, book_id,
                         sum(1 for r in rows if r[1] == "page"),
                         sum(1 for r in rows if r[1] == "cover")))

    n_page = sum(1 for r in all_rows if r[1] == "page")
    n_cover = sum(1 for r in all_rows if r[1] == "cover")
    n_books = len(books)
    if n_page + n_cover != rep["total_units"]:
        print(f"[STOP] 행 수 {n_page + n_cover} ≠ 리포트 유닛 {rep['total_units']}")
        return 3
    null_dur = sum(1 for r in all_rows if r[5] is None)

    L: list[str] = []
    a = L.append
    a("-- fullbatch116_danielle_load.sql — Book Dash 전량 116권 Danielle 오디오 book_audio 적재")
    a("-- 생성: scripts/tts_pilot/gen_book_audio_sql.py (워커, DB 접속 0건)")
    a("-- 근거: ADR-0053(전량 확장) / ADR-0034(결정 ①②③ + Amd#1 kind · Amd#2 성우 층위) / ADR-0052 Amd#2")
    a("--")
    a("-- ★ 실행은 팀장 영역(Supabase SQL Editor). ★ 선행 조건: Storage 업로드 완료")
    a("--   (docs/ops/tts-fullbatch-upload.md 1~3단계). audio_path가 가리키는 오브젝트가 없으면")
    a("--   행만 생기고 재생이 깨진다 — 업로드 검증을 반드시 먼저 통과할 것.")
    a("--")
    a(f"-- 규모: {n_books}권 / {n_page + n_cover}행 (page {n_page} + cover {n_cover})")
    a(f"-- 값  : voice='{voice}' · engine='{engine}' · rate={rate}"
      " (atempo 0.85의 실효 속도, SSML prosody 아님)")
    a("--        duration_ms = 감속 후 mp3 실측(ffmpeg). 마크 프록시 아님."
      + (f"  ※ NULL {null_dur}행" if null_dur else ""))
    a("--        audio_path/marks_path = 버킷명 미포함 **오브젝트 키만** (ADR-0034)")
    a("--")
    a("-- page_index 축: 파일명 pNN은 1-based, 컬럼 page_index는 0-based → page_index = NN - 1.")
    a("--   표지는 page_index=0 고정 placeholder이며 kind='cover'로 본문 첫 면과 구분된다")
    a("--   (UNIQUE에 kind 포함 — ADR-0034 Amd#1).")
    a("--")
    a("-- UNIQUE (book_id, kind, page_index, voice) 충돌 검토:")
    a(f"--   · 파일럿 12권과 본 {n_books}권은 **교집합 0**(로컬 산출물 대조 확인) → 신규 삽입만 발생")
    a("--   · 구 44권은 voice='Ruth'라 voice가 달라 자연 분리 — 건드리지 않는다")
    a("--   · 권 내 (kind, page_index) 중복은 생성 단계에서 검사 통과(중복 0건)")
    a("--   · ON CONFLICT DO UPDATE 채택 — 재실행 안전(경로·길이 정정 반영).")
    a("--     절대 덮어쓰지 않으려면 DO UPDATE SET 블록을 DO NOTHING 으로 바꿔 실행할 것.")
    a("--")
    a("-- SQL Editor 표시 100행 제한 대응: 모든 검증문을 COUNT 기반으로 작성했다(행 나열 없음).")
    a("")
    a("BEGIN;")
    a("")
    a("-- ============================================================")
    a("-- [0] 사전검증 — 현재 danielle 행이 '파일럿 12권'뿐인지")
    a("-- ============================================================")
    a("-- 기대: books 12 / rows 150 / page 138 / cover 12  (파일럿 적재분만 존재)")
    a("-- 이 수치가 다르면 이미 일부가 적재된 상태다. 그대로 진행해도 ON CONFLICT로 안전하나,")
    a("-- 원인을 먼저 확인할 것(중복 실행? 다른 배치?).")
    a("SELECT count(DISTINCT book_id) AS danielle_books,")
    a("       count(*)                                   AS danielle_rows,")
    a("       count(*) FILTER (WHERE kind = 'page')      AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover')     AS cover_rows")
    a("  FROM public.book_audio WHERE voice = 'danielle';")
    a("")
    a("-- 참고: 구 44권(voice='Ruth') 현황 — 본 적재가 건드리지 않음을 사후 대조할 기준값")
    a("-- 기대: books 44 / rows 574")
    a("SELECT count(DISTINCT book_id) AS ruth_books, count(*) AS ruth_rows")
    a("  FROM public.book_audio WHERE voice = 'Ruth';")
    a("")
    a(f"-- 대상 {n_books}권이 books에 실재하는지 (기대: {n_books})")
    a("SELECT count(*) AS target_books_found FROM public.books WHERE id IN (")
    for i, (slug, book_id, _, _) in enumerate(per_book):
        comma = "," if i < len(per_book) - 1 else ""
        a(f"  '{book_id}'{comma}  -- {slug}")
    a(");")
    a("")
    a("-- ============================================================")
    a(f"-- [1] book_audio INSERT — {n_books}권 / {n_page + n_cover}행")
    a("-- ============================================================")
    a("INSERT INTO public.book_audio")
    a("  (book_id, kind, page_index, audio_path, marks_path, voice, engine, rate, duration_ms)")
    a("VALUES")

    cur_slug = None
    idx = 0
    for (slug, book_id, np_, nc_) in per_book:
        rows = [r for r in all_rows if r[0] == book_id]
        if slug != cur_slug:
            a(f"  -- {slug} (page {np_} + cover {nc_})")
            cur_slug = slug
        for r in rows:
            idx += 1
            comma = "," if idx < len(all_rows) else ""
            _, kind, pi, audio, marks, dur = r
            a(f"  ('{book_id}', '{kind}', {pi}, '{audio}', {sql_val(marks)}, "
              f"'{voice}', '{engine}', {rate}, {dur if dur is not None else 'NULL'}){comma}")
    a("ON CONFLICT (book_id, kind, page_index, voice) DO UPDATE SET")
    a("  audio_path  = EXCLUDED.audio_path,")
    a("  marks_path  = EXCLUDED.marks_path,")
    a("  engine      = EXCLUDED.engine,")
    a("  rate        = EXCLUDED.rate,")
    a("  duration_ms = EXCLUDED.duration_ms;")
    a("")
    a("-- ============================================================")
    a("-- [1-검증] 적재 결과 (COUNT 기반)")
    a("-- ============================================================")
    a(f"-- 기대: books {n_books + 12} / rows {n_page + n_cover + 150}"
      f" / page {n_page + 138} / cover {n_cover + 12}")
    a("--       (= 본 배치 + 기존 파일럿 12권 150행. 파일럿과 교집합이 없으므로 단순 합)")
    a("SELECT count(DISTINCT book_id) AS danielle_books,")
    a("       count(*)                                   AS danielle_rows,")
    a("       count(*) FILTER (WHERE kind = 'page')      AS page_rows,")
    a("       count(*) FILTER (WHERE kind = 'cover')     AS cover_rows")
    a("  FROM public.book_audio WHERE voice = 'danielle';")
    a("")
    a("-- 표지 누락 권 (기대: 0) — 본문은 있는데 cover가 없는 danielle 책")
    a("SELECT count(*) AS books_missing_cover FROM (")
    a("  SELECT book_id FROM public.book_audio WHERE voice = 'danielle'")
    a("   GROUP BY book_id HAVING count(*) FILTER (WHERE kind = 'cover') = 0")
    a(") t;")
    a("")
    a("-- 경로 규약 위반 (기대: 0) — 버킷명 접두사 혼입·성우 층위 누락 검출")
    a("SELECT count(*) AS bad_path FROM public.book_audio")
    a(" WHERE voice = 'danielle'")
    a("   AND (audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/danielle/%');")
    a("")
    a("-- 구 44권 무간섭 확인 (기대: 위 [0]과 동일한 44 / 574)")
    a("SELECT count(DISTINCT book_id) AS ruth_books, count(*) AS ruth_rows")
    a("  FROM public.book_audio WHERE voice = 'Ruth';")
    a("")
    a("-- ============================================================")
    a("-- [2] (선택) books.has_audio = true")
    a("-- ============================================================")
    a("-- ⚠ 2026-07-28 기준 **앱에서 has_audio 컬럼을 읽는 코드는 0건**이다.")
    a("--   상세 배지·카드 배지·리더 게이트·관리자 배지 전부 book_audio 행 존재로 판정한다")
    a("--   (selectReaderAudioBookIds — lib/book/audio-manifest.ts). 즉 이 UPDATE는")
    a("--   사용자 화면에 아무 영향이 없다. SQL 레벨 정합을 위해서만 남긴다 — 생략해도 무방.")
    a("-- 대상은 danielle 행을 가진 책 전체(파일럿 12 포함, 이미 true라 멱등).")
    a("UPDATE public.books SET has_audio = true")
    a(" WHERE has_audio = false")
    a("   AND id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = 'danielle');")
    a("")
    a(f"-- 검증 기대: {n_books + 12} (danielle 책 전체가 true)")
    a("SELECT count(*) AS has_audio_true FROM public.books")
    a(" WHERE has_audio = true")
    a("   AND id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = 'danielle');")
    a("")
    a("-- ============================================================")
    a("-- [3] (선택) book_review.status: confirmed → tts_done")
    a("-- ============================================================")
    a("-- ADR-0046 D6 status 4단계. 공개 여부의 단일진실은 books.is_active이며 여기서 건드리지 않는다.")
    a("-- ⚠ 기대 건수를 로컬 산출물로는 알 수 없다(현재 status 분포는 DB만 안다).")
    a("--   아래 분포를 **먼저 조회**해 confirmed가 몇 권인지 확인한 뒤 UPDATE 여부를 판단할 것.")
    a("SELECT r.status, count(*) AS books")
    a("  FROM public.book_review r")
    a(" WHERE r.book_id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = 'danielle')")
    a(" GROUP BY r.status ORDER BY r.status;")
    a("")
    a("UPDATE public.book_review SET status = 'tts_done'")
    a(" WHERE status = 'confirmed'")
    a("   AND book_id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = 'danielle');")
    a("")
    a("-- 검증: 위 분포를 다시 조회해 confirmed → tts_done 이동을 확인")
    a("SELECT r.status, count(*) AS books")
    a("  FROM public.book_review r")
    a(" WHERE r.book_id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = 'danielle')")
    a(" GROUP BY r.status ORDER BY r.status;")
    a("")
    a("COMMIT;")
    a("")
    a("-- 롤백이 필요하면 COMMIT 전에 ROLLBACK; 을 실행한다.")
    a(f"-- 적재 후 되돌리려면: DELETE FROM public.book_audio WHERE voice='danielle' AND book_id IN (…{n_books}권…);")
    a("--   (파일럿 12권을 지우지 않도록 book_id 목록을 [0]의 IN 목록으로 한정할 것)")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(L) + "\n", encoding="utf-8")

    print(f"[OK] {out_path}")
    print(f"  권수      {n_books}")
    print(f"  행수      {n_page + n_cover}  (page {n_page} + cover {n_cover})")
    print(f"  duration NULL {null_dur}행")
    print(f"  voice/engine/rate = {voice} / {engine} / {rate}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
