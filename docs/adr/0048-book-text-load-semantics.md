# ADR-0048: book_text 적재 의미론 — source 라벨·기본값 제거·초벌 text 정의·검수 시드

## Status
Accepted (2026-07-16) / 기준 HEAD 5d37b1d

## Context

- ADR-0046이 `book_text`(페이지 단위 확정텍스트) 스키마를, ADR-0047이 적재 대상 152권을 확정했다.
- 적재 SQL 생성기(`scripts/pdf_harvest/gen_book_text_sql.py`)와 4분할 INSERT(`scratchpad/step9_book_text_insert_{1..4}of4.sql`)가 준비됐다(HEAD 5d37b1d). 그러나 실제 적재 직전, 다음 4개 의미론적 결정이 미확정 상태였다.
  1. `source` 컬럼에 실을 값 — 006 기본값 `'pdf_harvest_v1'`은 실제 산출 체인을 가리키지 않는다.
  2. 006의 `source` 기본값 유지 여부 — 기본값은 누락 INSERT를 조용히 통과시킨다.
  3. 초벌 `text`의 의미 — ADR-0046 컬럼 주석("SFX·DECOR 제외 결과")을 적재 시점에 적용하면 본문이 소실된다.
  4. 검수 진척 측정 수단 — `book_review` 시드 없이는 "남은 권 수"를 쿼리할 수 없다.
- 값 출처 체인: PDF 캐시 → `reextract_coords.py`(좌표 재추출) → `order_fix.py`(ADR-0044 읽기순서 교정) → `out_fixed_154/`.

## Decision

### D1. book_text.source 값 = 'pdf_harvest_v2_orderfix' 로 명시 적재한다
- 값 출처는 위 체인의 산출물 `out_fixed_154`이며, 이는 좌표 재추출 + ADR-0044 order_fix를 거친 **v2 산출물**이다.
- 006의 기본값 `'pdf_harvest_v1'`은 이 체인을 가리키지 않는다. 그대로 두면 전 행이 오라벨된다.
- 생성기가 INSERT에 `source` 컬럼을 명시하여 `$$pdf_harvest_v2_orderfix$$`를 싣는다.

### D2. 006의 source 기본값을 제거한다 (마이그레이션 007)
- `book_text`는 출처가 여러 개가 될 수 있어 "옳은 기본값"이 존재하지 않는다.
- 기본값이 있으면 `source`를 빠뜨린 INSERT가 조용히 잘못된 값으로 통과한다.
- 기본값을 없애면 `not null` 제약이 즉시 실패시킨다(fail-closed).
- 영향 없음: `book_text` 0행, 앱 코드에 `book_text` 쓰기 경로 없음.

### D3. 초벌 text의 의미 = "DECOR 제외, SFX 포함"
- ADR-0046의 컬럼 주석 "SFX·DECOR 제외 결과"는 `status='confirmed'` 도달 후의 상태를 기술한 것이며, 적재 시점(`draft`)의 상태가 아니다.
- SFX 판정은 글자 크기 기반이라 본문 대사를 SFX로 오분류한다:
  - `hello-baby`는 거의 전 페이지가 SFX 판정이나 그것이 본문 전부다.
  - `catch-that-cat`의 "Hurry. Hurry!", `best-friends` 마지막 대사 등도 SFX로 잡힌다.
- 적재 시 SFX를 제외하면 책 단위로 본문이 소실된다. 따라서 초벌은 전부 싣고, SFX/대사 재분류는 검수 화면이 `blocks`(role)로 수행한다(ADR-0046 D3와 정합).

### D4. 적재와 동시에 book_review에 대상 152권의 status='draft' 행을 시드한다
- 검수 진척(남은 권 수)이 쿼리로 측정 가능해야 한다.
- `book_text`가 적재된 책 전부에 `book_review(status='draft')`를 1:1로 시드한다(`scratchpad/step10_book_review_seed.sql`).
- 되돌리기는 `DELETE` 1문.

## Consequences

- **얻는 것**: `source` 오라벨 방지(v2_orderfix 명시), 향후 `source` 누락이 즉시 실패(fail-closed), 검수 진척(`book_review.status`)이 쿼리로 측정 가능.
- **잃는 것**: 팀장 SQL 실행 순서 의존 발생 — **007 → step9(1of4~4of4) → step10** 순으로 실행해야 한다.
- **되돌리기**: `source`는 `UPDATE` 1문, `book_review` 시드는 `DELETE` 1문, 007은 기본값 재설정(`alter column source set default 'pdf_harvest_v1'`)으로 복구.

## Non-goals

- SFX/대사 재분류 알고리즘 개선 / DECOR 판정 재설계 / 결손 2권·drift 3권 처리(ADR-0047 범위).

## Open (팀장 확인)

- 없음.
