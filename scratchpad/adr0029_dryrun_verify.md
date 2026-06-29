# ADR-0029 적용 셀프 검증 (오프라인, DB 미반영)

> 작성 2026-06-29 · 네트워크/DB 없이 실제 디코딩 함수에 엔티티 표본 투입.
> 엔티티 정규식: `&[a-zA-Z]+;|&#[0-9]+;|&#x[0-9a-fA-F]+;`
> 검증 하네스(임시): temp scratchpad `verify_adr0029.py` — **코드 diff·커밋 미포함**.

## 변경 요약 (ingestion 경계 `html.unescape` 추가)

| 파일 | 위치(함수) | 디코딩 필드 |
|---|---|---|
| `sync_asb.py` | `build_payload` (+ `import html`) | title·author·artist(illustrator) → attribution 자동 정정 |
| `sync_bloom.py` | `pick_english_title` / `extract_author` | title·author → attribution 자동 정정 |
| `sync_book_dash_v2.py` | `fetch_creators` | writer·illustrator(방어적) |
| `sync_gdl.py` | — | 변경 없음(이미 완전, ADR D3) |
| `lib/attribution.py` | — | 변경 없음(순수 함수, ADR D2) |

## 검증 결과표

| 스크립트 | 표본수 | 엔티티매칭 | 공동저자/엔티티 표본 before → after |
|---|---|---|---|
| `sync_asb.build_payload` | 4필드 | **0건** | title `Tom &amp; Jerry&#8217;s Day` → `Tom & Jerry’s Day` · author `Alice &amp; Bob` → `Alice & Bob` · illustrator `Carol &#38; Dave` → `Carol & Dave` · attribution 동반 정정 |
| `sync_bloom` (title+author+attr) | 3필드 | **0건** | title `Mom&#8217;s Garden &amp; Night` → `Mom’s Garden & Night` · author `Smith &amp; Jones` → `Smith & Jones` (data-creator 최빈값) · attribution 동반 정정 |
| `sync_book_dash_v2.fetch_creators` | 3필드 | **0건** | writer `Maria van Wyk` → `Maria van Wyk`(멱등) · illustrator `John Smith` → 동일 · attribution clean |
| **합계** | — | **0건 (PASS ✅)** | — |

## 핵심 확인 사항

1. **ASb·Bloom: 엔티티 실유입 → 정정 입증.** `&amp;`·`&#8217;`·`&#38;`가 title·author·
   illustrator에서 모두 디코딩되고, 그 값을 소비한 `attribution_text`도 자동으로 깨끗해짐
   (ADR D2 — ingestion 1회 디코딩으로 attribution 동반 정정, `attribution.py` 무수정).

2. **Book Dash: 구조상 엔티티 유입 불가 경로 — 디코딩은 방어적(멱등).**
   `_ROLE_RE`의 `_NAME` 패턴(`[A-Z][A-Za-z.'\-]+`)이 `&`·`;` 등 엔티티 문자를 구조적으로
   제외하므로 `(Writer)` 텍스트 파싱에서 엔티티 이름은 애초에 캡처되지 않는다. 따라서
   `fetch_creators`의 `html.unescape`는 현재 데이터에서 no-op이며, 멱등성 표본으로 무해 입증.
   ADR D4(예방적·비블로킹) 성격에 부합.

3. **D2 역방향 대조.** `build_attribution`에 엔티티 author(`Raw &amp; Entity`)를 직접 넣으면
   결과에 엔티티 1건이 그대로 잔존 → `build_attribution`은 자체 디코딩하지 않음을 확인.
   즉 정정점은 **오직 ingestion**이며, 디코딩을 읽는 지점에 두는 ADR D1 방침이 전제임을 재확인.

4. **멱등성(ADR D5).** 이미 디코딩된 문자열(`Maria van Wyk` 등)은 `html.unescape` 통과 후
   불변 → 재실행·부분적용 시 이중 손상 없음.

## 우선순위 적용 현황 (ADR D4)

- **필수(블로킹)** `sync_bloom.py` — 700권 배치 전 선결. ✅ 적용·검증 완료.
- **예방적** `sync_asb.py`·`sync_book_dash_v2.py` — ✅ 적용·검증 완료.
- **대상 외** `sync_gdl.py`·`lib/attribution.py` — 무변경 유지.

## 후속 (본 작업 범위 외)

- 기존 DB 오염 3건(전부 bloom `&amp;`)은 본 코드 적용과 별개로 UPDATE SQL 정정 필요
  (사용자 Dashboard SQL Editor 실행 — 다음 작업지시서).
- 실적재 dry-run(네트워크 포함)은 Supabase/외부 API 접근 필요 — 본 검증은 오프라인 함수 단위.
