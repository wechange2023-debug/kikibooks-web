# ADR-0051: /admin/review 검수 화면 설계

## Status
Accepted (2026-07-20) / 기준 HEAD d704958

## Deciders
팀장, 오케스트레이터

## Related
ADR-0046(리뷰 데이터 모델), ADR-0048(적재 시맨틱), ADR-0049(이미지 출처), ADR-0050(회전 페이지)

## Context

- `book_text` **2,128행 / 152권** 적재 완료, `book_review` **152권 draft** 시드 완료.
- 이미지 2,128장은 Storage(`book-images/book_dash-{slug}/NN.jpg`)에 업로드됨.
- TTS 생성 전, 사람이 낭독 확정본(`book_text.text`)을 검수·수정하는 **내부 화면**이 필요하다.
- 파이프라인: draft 추출 → **[본 화면] 검수·수정** → TTS 생성 → marks/하이라이트 → 책별 서비스 ON.

## Decision

### D1. 화면 단위 — 책 단위

- `/admin/review` = 책 목록(status 신호등 포함) → `/admin/review/[bookId]` = 책별 검수 상세.
- 상세 화면은 페이지를 **세로로 나열**, 각 행 = `[좌: 이미지 NN.jpg | 우: text 편집칸]`.
- status는 **책 단위**로 관리(페이지 단위 아님).
- 근거: TTS·서비스 ON이 모두 책 단위. 세로 나열이라야 페이지 경계를 넘는 읽기순서 오류가 잡힌다.
- 참고: 이 화면은 **검수 도구**이며, 아이·학부모용 옆넘김 ebook 뷰어(자막 동기화 뷰어 트랙)와 별개다.

### D2. 편집 대상 — 최종 text 직접 편집만

- 1차 검수는 `book_text.text`(낭독 확정본)만 직접 편집한다.
- `blocks`(jsonb, role/bbox/size) 구조적 재분류는 본 화면 범위 밖 → **2차 백로그**.
- 근거: TTS는 최종 `text`만 읽는다. `text`가 정확하면 목적 달성. SFX가 본문인 경우(`hello-baby` 등)도 사람이 해당 문장을 `text`에 남기면 해결된다.
- `text` 정의 기준은 **ADR-0048 D3**("DECOR 제외, SFX 포함")을 따른다.
  - 주의: migration `006_review_data_model.sql`의 `text` 컬럼 주석 "SFX·DECOR 제외"는 **낡은 정의**다 — 별도 백로그로 정정 예정.

### D3. status 전이 — 4상태

- `book_review.status` CHECK 기존값 그대로 사용: `draft` / `in_review` / `confirmed` / `tts_done`.
- 전이 규칙:
  - `draft`(🔴, 편집 잠김) → **[검수시작]** → `in_review`(🟡, 편집 열림)
  - `in_review`(🟡) → **[확정]** → `confirmed`(🟢, 편집 잠김, TTS 생성 허가 신호)
  - `confirmed`(🟢) → **[되돌리기]** → `in_review`(🟡) … 자유 허용
  - `tts_done`(🔵, 음성 생성 완료) → **[되돌리기]** → `in_review`(🟡) … **경고 팝업 후** 허용
    - 경고 문구: "이 책은 음성이 이미 생성됐습니다. 텍스트를 다시 고치면 음성을 새로 만들어야 합니다. 계속할까요?"
- `text` 저장(mutation)은 **`in_review` 상태에서만** 가능. 나머지 상태는 편집칸 잠금.
- `tts_done` 상태는 본 화면이 직접 설정하지 않는다(TTS 파이프라인 소관). 본 화면은 **표시·되돌리기만**.

### D4. 회전 페이지 주의 표시

- `scratchpad/rotation_audit_154.csv` 기준 **33면(18권)** 에 "⚠ 회전 의심" 배지 표시.
- 이미지 자동교정은 하지 않는다(**ADR-0050 D1·D2 유지**). 표시만 한다.

### D5. 접근·가드

- `app/admin/review` 하위에 배치 → `app/admin/layout.tsx`의 `requireAdmin()` **1중 가드 자동 상속**(ADR-0019 D16).
- page는 `force-dynamic`·robots noindex를 layout에서 상속하고, `title`만 override(ADR-0019 D12).
- `book_text`·`book_review`는 활성 도서 한정 정책과 무관하게 **전량 조회**해야 하므로 `createServiceRoleClient`로 직접 조회한다(`getBookById` 사용 안 함 — `is_active=true` 강제 회피).
- `text` 저장·status 전이는 **server action**으로 처리하며, 각 action은 `assertAdmin` 트리플 가드를 자체 적용한다(ADR-0019 D2 — layout 가드는 server action 표면을 덮지 않는다).

## Consequences

- **얻는 것**: 최소 UI로 TTS 입력 품질 확보. status 신호등으로 파이프라인 진행도 가시화.
- **한계**: `blocks` 역할 재분류 미지원(2차). 읽기순서 오류는 사람 검수에 의존.
- **후속**: 구현 ADR/작업지시서 작성, 이후 TTS 생성 트랙 연결.

## Backlog (본 ADR에서 파생)

- migration `006` `book_text.text` 주석을 ADR-0048 정의로 정정
- `blocks` role 재분류 UI (2차)
- 읽기순서 오류 페이지 비율 실측 → 전수/표본 검수 방식 확정
