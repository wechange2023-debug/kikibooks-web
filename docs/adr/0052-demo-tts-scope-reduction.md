# ADR-0052: 7/28 내부 시연 대응 — TTS 파이프라인 범위 축소(154→12)·대표 3권 우선

## Status
Accepted (2026-07-22) / 기준 HEAD 3e717e9

## Deciders
팀장, 오케스트레이터

## Related
ADR-0023 Amd#1(TTS 엔진·보이스·저장), ADR-0046(리뷰 데이터 모델), ADR-0047(book_text 적재 인구),
ADR-0048(적재 시맨틱), ADR-0049(이미지 출처), ADR-0050(회전 페이지), ADR-0051(검수 화면).
상위 계획서: `docs/intent/highlight-tts-master-plan.md`(§2 파이프라인, §4 페이즈, §8 TTS/노출).

## Context

- **7/28 내부 시연**에서 뷰어·TTS·자막 하이라이트까지 시연되어야 한다. 착수 시점 기준 잔여 6일.
- 마스터 계획서의 임계경로는 `A → (C·D·E) → F`. **A(데이터 모델)·C(검수 화면)는 완료**
  (`book_text` 152권·`book_review` 152권 적재, ADR-0051 검수 화면 push `3e717e9`).
- 미착수는 **E(TTS 154권)·D(자체 뷰어)·F(사용자 노출)**. 154권 배치는 6일 내 시연 품질 확보에 과대하다.
- 팀장 검수로 **시범 12권이 confirmed** 상태가 되었고, AWS Polly 자격증명 설정이 완료되어 Phase E 실행 전제가 충족됐다.

본 ADR은 마스터 계획서를 시연용으로 축소·우선순위화하는 **실행 결정만** 고정한다.
스키마 변경은 없다(`book_text`·`book_review`·`books.has_audio` 모두 기존 자산).

## Decision

### D1. 파이프라인 범위 축소 — 12권, 임계경로 E→D→F
- 시연 대상은 **시범 12권 전체**(`lib/admin/review/pilot-cohort.ts`). **154권 배치는 시연 후로 연기**한다.
- 실행 순서는 **E(축소) → D → F**. B(ADR 정리)·**G(백로그)는 본 범위에서 제외**한다.
- **7/27 이후 신규 기능 추가 금지**(리허설·버그 수정만).

### D2. 대표 3권 우선 원칙
- 시연 리허설·품질 집중 대상 **대표 3권**을 Phase E·D에서 **최우선**으로 처리한다.
  12권 배치가 중간에 문제를 만나도 대표 3권 산출물은 먼저 확보한다.
- 7/25 하이라이트 타이밍 판정은 대표 3권 기준으로 수행한다.
- **대표 3권 고정 식별자**(2026-07-22 팀장 SQL 확인, 전부 `confirmed`·page_rows 14):

  | title (DB) | slug (=source_id) | book_id |
  |---|---|---|
  | A trip to the tap | `a-trip-to-the-tap` | `0134f341-7b58-4c7c-b17a-8d4e036dcd72` |
  | Amahle wants to help! | `amahle-wants-to-help` | `f3e5da2f-a04d-4b08-ac81-4dee971c15e8` |
  | Baby Babble | `baby-babble` | `22a4f65f-df39-44c3-863f-81d7855e35c0` |

### D3. 브리지 book_text 읽기 — A안(팀장 SQL export → 워커 변환)
- 워커는 **DB에 직접 접근하지 않는다**. 팀장이 Supabase SQL Editor에서 confirmed 12권의
  `book_text` 행을 JSON으로 export하고, 워커의 변환 스크립트가 이를 읽어 TTS 입력을 만든다.
- 근거: 3자 구조상 워커 DB 무접근 원칙 + 프로젝트 관행(SQL 텍스트 제공 → 팀장 실행).
- 채택 배제: 스크립트가 env DB 키로 직접 접속(B안) — 관행과 어긋나고 워커 코드가 키 경로를 다뤄야 함.

### D4. 이미지 원천 — 검수 화면과 동일 canonical URL
- 뷰어·브리지 모두 검수 화면(`review-detail-view.tsx:91`)과 **동일 규칙**을 쓴다:
  `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/book-images/book_dash-{slug}/{NN}.jpg`
- 목적: 텍스트-이미지 불일치 방지. 별도 이미지 원천(핫링크·이원화)은 본 범위에서 쓰지 않는다.

### D5. 페이지 번호 축 — page = page_index + 1 = NN
- `book_text.page_index`(0-based)를 기준으로 `page = page_index + 1`(= 이미지 파일명 NN, 2자리 zero-pad)로
  통일한다. 이미지·mp3 파일명·뷰어 페이지가 단일 축으로 정렬된다.

### D6. TTS 엔진 — 기확정 승계
- **Amazon Polly / 보이스 Ruth / rate 78% / neural / `--natural`**(ADR-0023 Amd#1). 재검토하지 않는다.
- 따옴표 기반 화자분리는 마스터 계획 §8의 **초벌 수준으로만** 적용하고, 시연 품질을 해치면 비활성화한다.
- TTS 음성은 원본의 2차 저작물 — 어트리뷰션 의무를 승계한다(ADR-0023 §2.6).

### D7. 하이라이트 — 단어 단위, 단어/문장 전환식
- speech marks의 **단어 타임스탬프** 기준 단어 단위 하이라이트를 구현한다.
- 단, **단어→문장 단위 전환이 설정 한 곳 변경으로 가능**하게 구조화한다(7/25 판정 시 문장 강등 대비).

### D8. 외부 실행 경계(Hard Rule 연계)
- **Storage 업로드·DB 쓰기·`tts_done` 전이 SQL 실행은 전부 팀장 영역**. 워커는 실행용 SQL/명령을
  문서로 정리해 전달한다. 워커는 Storage secret key를 수령하지 않는다.
- 뷰어 레이아웃은 Claude Design 선검증(7/23 오전 반나절 타임박스). 미확정 시 검수 화면 레이아웃을 확장해 즉시 구현.

## Consequences

- **범위 밖(명시)**: 154권 배치, B(ADR 정리), G(백로그 §10), 7/27 이후 신규 기능.
- E→D→F 각 페이즈는 워커가 작은 단위로 쪼개 매 단위 보고·승인·단독 커밋한다.
- 진행 상태는 `tasks/highlight-tts-plan.json`에 반영한다(범위 축소·대표 3권 우선).
- 리스크: 6일 기한. 대표 3권 우선 확보로 완파 대비. 하이라이트 불안정 시 문장 단위 강등(D7).

## Amendment #1 (2026-07-24, 팀장·오케스트레이터)

### D6 개정 — TTS 보이스 변경: Ruth → Amy

- 배경: Ruth 78% 12권 로컬 생성본을 팀장 청취 검수 결과 반려.
  2차 보이스 비교(`voice_samples_r2`: Amy·Emma·Kimberly·Olivia·Salli 등) 수행 후
  **Amy (en-GB, neural, `--natural`) 확정**.
- 속도: r85 vs r92 샘플(`voice_samples_amy/`) 팀장 청취 후 확정. **[팀장 확정 대기]**
- Ruth 산출물(`out/audio/*_Ruth_r78.*`)은 삭제하지 않고 보존한다.
- 파일 키 구조: 성우 층위 반영 `book_dash-{slug}/{voice}/pNN.mp3`(+`.marks.json`)
  (`tasks/HANDOFF-2026-07-24.md` §3-1 승계).
- 진행 기록 원천: `tasks/highlight-tts-plan.json` `demo_feedback_p1` 블록.
