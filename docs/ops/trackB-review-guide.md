# 트랙 B · 회전 페이지 검수 교정 절차 (팀장용)

**작성** 2026-08-18 · **상태** Active · **작성 근거** 워커 코드 실측(추측 0건)

> 본 문서의 모든 항목은 저장소 코드를 직접 읽어 확인한 사실만 적었다. 확인되지 않은 것은
> "미구현"으로 명시했다. 근거 파일과 라인을 각 항목에 붙였다.
>
> **대상**: 직교회전 **33면 / 18권**(`lib/admin/review/rotation-pages.ts` `ROTATED_PAGES`).
> 대상 목록·현재 상태 조회는 `scripts/sql/trackB_rotation_targets.sql`(읽기 전용).

---

## 1. 화면 진입 경로

| 화면 | URL | 라우트 파일 |
|---|---|---|
| 검수 목록 | `/admin/review` | `app/admin/review/page.tsx` |
| 책별 검수 상세 | `/admin/review/{book_id}` | `app/admin/review/[bookId]/page.tsx` |

- `{book_id}`는 **`books.id` UUID**다. slug가 아니다
  (`app/admin/review/[bookId]/page.tsx:36-37` UUID 형식 검사 → 불일치 시 `notFound()`).
  → 위 조회 SQL의 `book_id` 열을 그대로 URL에 붙이면 된다.
- 권한 가드는 `app/admin/layout.tsx:68` `requireAdmin()` 1중이다. 각 페이지는 재검사하지 않는다.

### ⚠ 목록 기본 필터가 대상을 가린다 (착수 전 필독)

목록의 코호트 필터 기본값은 **`시범 12권`**이다(`components/admin/review/review-list-view.tsx:85`).
시범 12권은 **회전 18권·오염 6권을 제외하고 뽑은 목록**이라
(`lib/admin/review/pilot-cohort.ts:4`, `:20-33`), **회전 18권은 기본 화면에 한 권도 뜨지 않는다.**

→ 목록 상단 필터에서 **`Book Dash`** 또는 **`전체`** 를 눌러야 대상이 보인다
(`review-list-view.tsx:60-66`).
회전 면을 가진 책 행에는 **`⚠`** 아이콘이 붙는다(`review-list-view.tsx:163-169`, 표시 전용).

---

## 2. 텍스트 읽기순서를 교정하는 UI

### 2-1. 무엇으로 고치는가

**전용 UI는 없다.** 블록 드래그·순서 재배열·좌표 편집 같은 도구는 **미구현**이다
(`ADR-0051` D2 = 편집 대상은 `book_text.text` 단일, `blocks`(jsonb) 편집은 2차 백로그).

실제 교정 수단은 **면마다 하나씩 있는 textarea에 사람이 직접 다시 쓰는 것** 1종이다.

- 상세 화면은 면을 세로로 나열하고, 각 행이 2단 `[좌: 이미지 | 우: 텍스트]`다.
- 오른쪽 칸의 `textarea` — `components/admin/review/review-detail-view.tsx:357`
- 그 아래 **[저장]** 버튼 — `review-detail-view.tsx:378`
- 면 번호는 **`NN면` = `page_index + 1`** 로 표시된다(`review-detail-view.tsx:324`).
  → 조회 SQL의 **`page_no`** 열과 같은 축이다. `page_index`(0-based)와 혼동하지 말 것.
- 회전 대상 면에는 **`⚠ 회전 의심`** 배지가 붙는다(`review-detail-view.tsx:330`). 표시 전용이며
  이미지·텍스트를 자동으로 고치지 않는다(ADR-0050 D1·D2).

### 2-2. 편집칸이 열리는 조건

`status === 'in_review'` 일 때만 textarea가 열린다(`review-detail-view.tsx:145`).
그 외 상태에서는 읽기 전용 `<pre>`로만 보인다 — 칸이 안 열리면 상태부터 확인한다.

### 2-3. [저장]을 누르면 바뀌는 것

| 항목 | 값 |
|---|---|
| 테이블 | `public.book_text` |
| 컬럼 | **`text` 1개만** |
| 대상 행 | `book_id` = 그 책, `page_index` = 그 면 (1행) |
| 무변경 | `blocks` · `source` · `image_url` · `page_index` · `book_id` |
| `updated_at` | 트리거 `touch_updated_at`이 자동 갱신 (migration `006` §2.5) |

근거: `lib/admin/review/actions.ts:231-236` (`.from('book_text').update({ text }).eq(book_id).eq(page_index)`).

서버는 저장 직전 DB의 현재 `status`를 다시 읽어 `in_review`가 아니면 거부한다
(`actions.ts:223-228`). 화면 잠금은 편의일 뿐이고 판정은 서버가 한다.

---

## 3. 교정 완료 → `confirmed`

- 조작: 상세 화면 **머리말의 전이 버튼**을 누른다(`review-detail-view.tsx:263-270`).
  버튼 라벨은 현재 상태에 따라 1종만 나온다(`review-detail-view.tsx:225-233`):

  | 현재 상태 | 버튼 라벨 | 도착 상태 |
  |---|---|---|
  | `draft` | **검수시작** | `in_review` |
  | `in_review` | **확정** | `confirmed` |
  | `confirmed` | 되돌리기 | `in_review` |
  | `tts_requested` | 요청 철회 | `in_review` |
  | `tts_done` | 되돌리기 | `in_review` |

- 따라서 `draft`인 책은 **[검수시작] → 교정 → [확정]** 2단계다. `draft → confirmed` 직행은 없다
  (허용 전이표 `actions.ts:111-117`).
- 저장하지 않은 수정이 남은 채 [확정]을 누르면 경고 1회가 뜬다 —
  "저장하지 않은 수정이 있습니다. 그래도 확정할까요?"(`review-detail-view.tsx:112-113`).
  **이 경고가 뜨면 취소하고 저장부터 하는 것이 안전하다.**
- 바뀌는 것: `public.book_review`의 `status` · `reviewed_at` · `reviewer_id`
  (`actions.ts:315-321`). `books` 테이블은 무접촉이다.

---

## 4. `confirmed` → `tts_requested`

- 조작: 머리말의 **[TTS 생성 요청]** 버튼(`review-detail-view.tsx:273-288`).
- **노출 조건**: `status`가 `draft` 또는 `confirmed` 일 때만 버튼이 보인다
  (`review-detail-view.tsx:243-244`).
  → **`in_review`에서는 버튼 자체가 없다.** 반드시 [확정]을 먼저 눌러야 한다
  (`in_review → tts_requested`는 전이표에서 금지, `actions.ts:112`).
- **잠김 조건**: 그 책에 `book_audio` 행이 1행이라도 있으면 버튼이 비활성화되고
  옆에 `오디오 보유 — 재생성은 별도 트랙`이 표시된다(`review-detail-view.tsx:276`, `:109`).
  voice(`Ruth`/`danielle`) 무관 판정이다.
- 클릭 시 확인창 1회: "이 책을 TTS 생성 요청 목록에 올립니다. 요청 후에는 텍스트를 고칠 수 없고,
  음성이 만들어진 뒤에는 재생성이 지원되지 않습니다. 계속할까요?"(`review-detail-view.tsx:100`).
- 바뀌는 것: `book_review.status = 'tts_requested'` + `reviewed_at` + `reviewer_id`
  (`actions.ts:315-321`).
- **이 버튼은 합성을 시작하지 않는다.** 요청 사실만 DB에 기록하고, 실제 합성은 워커의 로컬
  배치가 별도로 돈다(ADR-0058 D1).
- 요청 후 `tts_requested → in_review`(철회)는 가능하나, 배치가 이미 시작됐으면 반영되지 않을 수
  있다는 경고가 뜬다(`review-detail-view.tsx:105-106`, ADR-0058 O2).

---

## 5. 교정 중 STOP 해야 하는 상황

아래 중 하나라도 나오면 **그 자리에서 멈추고 워커에게 화면 문구 그대로 전달**한다.
임의로 상태를 되돌리거나 다른 버튼을 눌러 우회하지 않는다.

### 5-1. 화면에 뜨는 오류 문구 (전부 서버 거부 신호)

| 문구 | 의미 | 근거 |
|---|---|---|
| `검수중 상태에서만 저장할 수 있습니다. 화면을 새로고침해 주세요.` | 다른 탭·세션에서 상태가 바뀌었다 | `actions.ts:226` |
| `해당 페이지를 찾을 수 없습니다.` | 그 면의 `book_text` 행이 없다 | `actions.ts:245` |
| `검수 대상 책을 찾을 수 없습니다.` | `book_review` 행이 없다 | `actions.ts:221`, `:290`, `:332` |
| `허용되지 않는 상태 변경입니다. 화면을 새로고침해 주세요.` | 전이표 밖 요청 | `actions.ts:297` |
| `이미 음성이 있는 책입니다. 재생성은 지원하지 않습니다(별도 트랙).` | `book_audio` 보유 | `actions.ts:309` |
| `저장에 실패했습니다.` / `상태 변경에 실패했습니다.` | DB 오류 | `actions.ts:241`, `:328` |

### 5-2. 화면 상태 이상

- **`적재된 페이지 텍스트가 없습니다.`** — 그 책의 `book_text`가 0행이다. 교정할 대상이 없다.
  (`review-detail-view.tsx:306`)
- **`이미지 없음 (텍스트 전용 면)`** — 그 면에 원본 이미지가 없다. 이미지를 못 보면 읽기순서를
  판정할 수 없으므로, 회전 대상 면에서 이 표시가 나오면 **교정하지 말고 STOP**한다.
  (`review-detail-view.tsx:348`)
- **목록 화면 전체가 오류 페이지** — 조회 결과가 행 상한 1,000에 도달해 fail-loud로 막힌 경우다.
  목록이 조용히 잘리는 대신 일부러 실패시킨 것이다(`lib/admin/review/query.ts:188-192`).
- **`⚠ 회전 의심` 배지가 없는 면에서 읽기순서 역전을 발견** — 또는 배지가 붙은 면이 정상이다.
  회전 상수는 `scratchpad/rotation_audit_154.csv`를 고정(freeze)한 값이라 자동 갱신되지
  않는다(`rotation-pages.ts:7-12`). **상수와 원본의 불일치**이므로 임의로 넘기지 말고 보고한다.

### 5-3. 조회 SQL 결과의 이상 신호

`scripts/sql/trackB_rotation_targets.sql` 실행 결과에서 아래가 나오면 착수 전에 STOP한다.

- `book_id`가 `NULL` — `books` 매칭 실패(정상이면 33행 전부 값이 있다)
- `review_status`가 `NULL` — `book_review` 행 없음 → 그 책은 검수 화면에 뜨지 않는다
- `text_row_exists = false` — 그 면의 `book_text` 행이 없다 → 화면에 교정 칸이 없다
- `has_audio = true` — TTS 생성 요청이 잠긴다(재생성 차단, ADR-0058 D4)
- 총 행 수가 33이 아니거나 책 수가 18이 아님 (`target_pages_total` 열로 확인)

---

## 6. 트랙 B 완결 기록 — 17권 32면 (2026-08-18)

**이 트랙은 완결됐다.** 아래는 실행 결과의 실측 기록이다.

| 단계 | 결과 |
|---|---|
| 교정 | **17권 32면** 교정 완료 → [확정] → [TTS 생성 요청] (팀장, 2026-08-18) |
| 좌표 경고 | 1건 — `the-monster-must-go` **page_no 7**. 연속 공백 정리 후 **해소**(재드라이런에서 `전 유닛 정합`) |
| 합성 | `run_id` **`20260818-144217`** · **221유닛**(본문 204 + 표지 17) · **16,829자** · 실패 0 · 스킵 0 |
| 비용 | **$3.3658**(×2 보수적 상한, Danielle long-form $100/1M자) — 승인 상한과 동일 |
| Storage | **442객체** 업로드(mp3 221 + marks 221) · 버킷 **`book-audio`** · 실패 0 · 기존키 충돌 0 |
| DB 적재 | `book_audio` **221행** · `book_review` **17권 `tts_done`** (팀장 COMMIT) |
| 독립 검증 | **통과**(2026-08-18) — 17권 전부 `tts_done` · `audio_rows` 합계 221 · `is_active` 전부 true |

- 교정 범위는 회전 대상 면에 그치지 않는다. 팀장이 각 책의 **전체 지문을 점검하고 줄바꿈까지
  조정**했다. 이 17권은 작업 시점에 `has_audio = false`였으므로 ADR-0058 Amd#1 G6과 무관하다
  (합성 전 편집은 자유).
- 적재 SQL: `docs/sql/adr0058/requests/20260818-144217.sql`
- 상태 검증 SQL: `scripts/sql/trackB_tts_request_verify.sql`
  (게이트는 합성 **전** 기준이라 사후 실행 시 `GATE FAIL`이 정상 — 해당 파일 헤더 참조)

---

## 7. `catch-that-cat` — 재합성 대상 확정 (착수 대기, 2026-08-18)

대상 **18권 33면** 중 **`catch-that-cat` 1권 1면(`page_no` = 5, `page_index` = 4)** 은
6절의 17권 32면 트랙에서 제외했다. 그 사유와 현재 상태는 아래와 같다.

- **제외 사유(실측)**: 이 책은 `book_audio` 행을 보유한다(`has_audio = true`). 따라서 상세 화면의
  **[TTS 생성 요청] 버튼이 잠겨 있다** — `review-detail-view.tsx:276`(화면 잠금) ·
  `lib/admin/review/actions.ts:304-312`(서버 거부). 잠김 사유 표기는
  `오디오 보유 — 재생성은 별도 트랙`이다.
- **팀장 확인 사항**: 이 책은 지난주 교정이 이미 진행된 도서다.
- **판별 결과**: **재합성 대상으로 확정**됐다. 텍스트 교정이 합성보다 나중이어서 하이라이트
  좌표가 밀린다(ADR-0058 Amendment #1 G6 — "TTS 완료 도서 텍스트 수정 = 재합성").
  판별 조회: `scripts/sql/trackB_catchthatcat_audit.sql`(읽기 전용).
- **승인된 대응**: **A안 — `book_audio` 13행 전삭제**(page 12 + cover 1).
  삭제하면 `hasBookAudio`가 행 존재로만 판정하므로 **잠금이 자동 해제**된다
  (ADR-0058 Amd#1 G1 ② — 코드 변경 0건).
- **현재 상태**: **착수 대기.** 별도 지시 전까지 이 책의 코드·문서·데이터를 건드리지 않는다.

> 재합성 표준 4단계(ADR-0058 Amd#1 G1): ① 팀장이 `book_audio` 행 삭제 → ② 잠금 자동 해제
> → ③ 검수 화면에서 텍스트 수정 → `confirmed` → ④ TTS 재요청 → 드라이런 → `--execute`
> → **`--upload --overwrite`** → 적재 SQL.
> G3: 적재 SQL에 `ON CONFLICT`가 없어 **①을 건너뛰면 UNIQUE 충돌로 실패**한다(fail-closed).

---

## 8. 표준 순서 요약

```
조회 SQL 실행(팀장)  →  결과에서 book_id 확보
   ↓
/admin/review 에서 필터를 'Book Dash' 또는 '전체'로 변경
   ↓  (또는 /admin/review/{book_id} 로 직접 이동)
[검수시작]  ← status가 draft인 경우에만
   ↓
회전 대상 면(page_no)의 textarea 수정 → [저장]  ← 면마다 반복
   ↓
[확정]      → status = confirmed
   ↓
[TTS 생성 요청] → status = tts_requested   ← 여기까지가 팀장 몫
   ↓
워커의 로컬 배치가 합성 → tts_done          ← 화면에서 누르는 조작 아님
```

---

## 9. 참조

- 대상 조회 SQL: `scripts/sql/trackB_rotation_targets.sql` (읽기 전용)
- 회전 대상 상수: `lib/admin/review/rotation-pages.ts`
- 검수 화면: `components/admin/review/review-detail-view.tsx`, `review-list-view.tsx`
- 서버 액션: `lib/admin/review/actions.ts`
- ADR: `0050`(회전 페이지) · `0051`(검수 화면) · `0058`(TTS 요청 큐)
