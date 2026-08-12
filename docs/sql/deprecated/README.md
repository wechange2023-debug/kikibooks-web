# deprecated — 실행하지 말 것

이력 보존용 보관소다. 여기 있는 SQL은 **실행하지 않는다.**

## load708_step1~3 · load708_final_verify (2026-08-12 폐기)

708권 book_audio 적재 v1. 플랫폼별 단일 파일 구조였다.

**폐기 사유**: `load708_step1_asb.sql` 이 1.1MB라 Supabase SQL Editor가
`Query is too large to be run via the SQL Editor` 로 실행을 거부했다.
step1조차 실행이 불가능해 구조 자체를 바꿔야 했다.

**대체**: `docs/sql/load708/` — VALUES 적재(무거움)와 본 테이블 머지(가벼움)를
분리하고, VALUES를 ≤150KB 청크 12개로 쪼갰다. 실행 순서는
`docs/sql/load708/README.md` 참조.

적재 내용(708권 / 7,978행)과 기대값은 v1·v2가 동일하다. 바뀐 것은 실행 단위뿐이다.

생성기는 `scripts/tts_pilot/gen_book_audio_sql_708.py` 하나이며 v2를 산출한다
(v1을 다시 만들지 않는다).
