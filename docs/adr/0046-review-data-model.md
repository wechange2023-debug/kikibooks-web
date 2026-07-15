# ADR-0046: 검수 데이터 모델 — book_text / book_review 2테이블 + 006 마이그레이션

## Status
Proposed (2026-07-15) / 기준 HEAD d705421

## Context

- 정찰 실측(Phase A-1) 요약 3줄:
  1. 검수 상태·확정 텍스트·검수자를 담을 스키마가 전무하다. `books`(19컬럼)·`book_audio`(11컬럼) 어디에도 검수 컬럼이 없고, **DB에 본문 텍스트 테이블 자체가 없다**(A-1 [1]).
  2. 확정 텍스트는 `scripts/pdf_harvest/out_fixed_154/*.fixed.json` 로컬 JSON뿐이며, 구조는 최상위 `{slug, book_body_size, pipeline, pages}` + `pages[].page_no`(**1-based**) + `pages[].blocks[].role`(BODY/SFX) 이다(A-1 [5]).
  3. 기존 TTS 입력은 최상위가 **배열** `[{page, image_url, text}]`이다(`scripts/tts_pilot/generate_tts.py:216, 251-257`). 확정 JSON과 구조가 달라 적재 시 변환이 필수다(A-1 [6]).
- 상위 계획: `docs/intent/highlight-tts-master-plan.md` §5 — 개념 4가지(검수 상태 / 확정 텍스트 / 검수자·검수시각 / 캐릭터-화자 매핑 옵션)를 나열만 했고, DDL 확정은 본 ADR이 담당한다.

## Decision

### D1. 테이블 2개로 분리 — `book_text`(페이지 단위) / `book_review`(책 단위)
- 텍스트는 책 1 : 페이지 N 관계, 검수 상태는 책 1 : 1 관계로 카디널리티가 다르다.
- `book_audio`가 "오디오는 책 단위가 아니라 페이지 단위"라는 동일 사유로 페이지 단위 별도 테이블을 채택한 선례(ADR-0034:62-63)를 계승한다.

### D2. 페이지 식별자는 0-based `page_index`로 통일
- **실측 확인(Phase A-2 검증2)** — 기존 44권 본문 첫 페이지 기준 체인:
  `s["page"]=1`(`scripts/tts_pilot/extract_text.py:119`) → 로컬 파일명 `_p1`(**1-based**, `generate_tts.py:270`)
  → Storage 키 `p00.mp3`(**0-based**, `upload_audio.py:109`에서 `page-1`)
  → `book_audio.page_index=0`(`scratchpad/step8_book_audio_insert.sql:63`).
- **1-based → 0-based 변환은 생성 단계가 아니라 업로드·DB 적재 단계에서 일어난다.**
  `generate_tts.py`의 로컬 산출물 파일명이 1-based(`_p1`)인 것에 속아 이 규약을 뒤집지 말 것.
  DB·Storage 계층은 예외 없이 0-based다.
- 확정 JSON도 `page_no` 1-based(A-1 [5])이므로, `book_text` 적재 시 동일하게
  `page_index = page_no - 1` 변환을 규약으로 못 박는다.
- 이 변환을 누락하면 `book_audio.page_index`(0-based)와 `book_text.page_index`가
  한 페이지씩 어긋나 **오디오와 자막이 밀린다**. D2는 이 사고를 막기 위한 결정이다.

### D3. 검수 원본 블록은 `blocks JSONB`로 통째 보관, 낭독 확정본은 별도 `text` 컬럼
- 검수 화면(Phase C)이 SFX/대사 재분류를 하려면 `blocks[].role`·`bbox`·`size`가 남아 있어야 한다(A-1 [5] 구조).
- `text` = 검수 확정된 낭독 대상 최종본(SFX·DECOR 제외 결과). **TTS는 `text`만 읽는다** — blocks는 검수용 원본이다.

### D4. 캐릭터-화자 매핑용 컬럼·테이블은 지금 만들지 않는다
- 캐릭터 음성은 "책별 옵션"(기본값 아님, 계획서 §8)이다. 옵션 기능에 스키마를 선투자하지 않는다.
- `blocks JSONB` 내 `speaker` 키를 **예약어로 선언만** 하고, 실제 저장소는 Phase E에서 필요성이 실증되면 별도 ADR로 신설한다.

### D5. 스키마 변경 실행 경로를 `supabase/migrations/` 파일로 일원화
- A-1 [2] 실측: 현재 경로가 "마이그레이션 파일(001~005)"과 "ADR 내 SQL 팀장 직접실행"(has_audio·book_audio, ADR-0034)으로 **이원화**되어 있다.
- 본 ADR부터는 **`006_review_data_model.sql`이 유일한 원본**이며, 팀장은 006 파일 내용을 SQL Editor에 붙여 실행한다.
- ADR 본문에 DDL을 **중복 기재하지 않고** 006 경로만 참조한다(중복은 반드시 어긋난다).

### D6. `book_review.status` 4단계 — `draft` / `in_review` / `confirmed` / `tts_done`
- `service_on` 상태값을 두지 않는다. 공개 여부의 단일 진실은 `books.is_active`이며(ADR-0037 "사람이 공개 관리"), 같은 사실을 두 곳에 적으면 반드시 어긋난다.
- 서비스 ON은 `status='tts_done'`인 책에 대해 팀장이 `is_active`를 켜는 것으로 표현된다.

## Consequences

- **얻는 것**: 페이지 단위 확정 텍스트·검수 원본 블록이 정규화 저장되어 검수 화면·TTS·뷰어가 DB 단일 원천을 공유한다. 상태 4단계로 책별 진행 추적이 가능해진다.
- **잃는 것**: 확정 JSON → DB 변환 스텝이 추가로 필요하다(page_no→page_index, blocks 매핑). 캐릭터 화자 저장은 이번에 미해결로 남는다(D4).
- **되돌리기**: 신규 테이블 2개는 `DROP TABLE`만으로 원복된다. 기존 테이블 무변경(`books`·`book_audio` 미접촉)이라 회귀 표면 0.

## Non-goals (이번 ADR이 정하지 않는 것)

- 검수 화면 UI(Phase C) / 자체 뷰어(Phase D) / TTS 변환 스크립트(Phase E).
- 캐릭터 음성 저장소(D4 — Phase E에서 별도 ADR).
- 기존 44권 재처리(계획서 §3: 이번 트랙에서 변경하지 않음).

## Open (팀장 확인)

- 없음. (본 ADR은 전부 기술 결정)
