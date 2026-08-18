# ADR-0058: 관리자 TTS 요청 큐 — 화면은 요청만, 합성은 로컬 파이프라인

## Status

**Accepted** (2026-08-13, 팀장 일괄 승인) / 기준 HEAD `7595b11`
최초 제안 2026-08-13 (Proposed)

**2026-08-13 팀장 일괄 승인** — 승인 대기 4항목(D2 스키마 변경 · D5 시드 실행 · D3 전이 정책 ·
D7 ADR-0053 D6 개정)이 **전부 승인**됐다. 상세는 §승인 이력.

본 문서는 **결정문만** 담는다. 마이그레이션 SQL·코드 변경·시드 실행은 별도 작업지시서에서
수행한다. 본 ADR과 함께 만들어진 코드·SQL 파일은 **0건**이며, 아래 SQL은 전부 본문 내
초안 코드블록이다(실행자는 팀장).

**Hard Rule 8 준수**: `book_review.status` CHECK 제약 변경(D2)이 포함되므로 코드보다 본 ADR을
먼저 썼다. 스키마 변경의 실행은 팀장의 SQL Editor 실행으로만 이뤄진다.

**Amendment #1 (2026-08-14, 확정 2026-08-15) — 재합성 절차 표준화**
D4가 Non-goal로 둔 "재생성"에 **절차를 부여**한다(기능 추가 아님).
D1·D2·D3·D5~D8 무개정. 상세는 §Amendment #1.

### 실행 완결 (Completed) — 2026-08-14

**본 ADR의 실행 5단계(문서 말미 §실행 순서)가 전량 완료됐다.** 결정문 D1~D8은 `Accepted` 그대로
유효하며, 본 표기는 **실행 트랙의 완결**을 뜻한다(ADR-0053 §종결 선례 형식).

#### 1. 실증 타임라인 — catch-that-cat 1권으로 전 구간 관통 (2026-08-14)

| 단계 | 실측 |
|---|---|
| 큐 | `tts_requested` 1권 (`book_dash-catch-that-cat` · 개행 보유 5면 — 좌표 실증 표본) |
| 드라이런 | **771자**(본문 756 + 표지 15) · 13유닛 · 좌표 전 유닛 정합 · 과금 0 |
| 합성 `--execute` | run `20260814-101906` — **13유닛 전량 `status:"ok"`, 실패 0** |
| 업로드 `--upload` | **26/26 객체**(mp3 13 + marks 13), 키 `book_dash-catch-that-cat/danielle/…` |
| 적재 SQL | `docs/sql/adr0058/requests/20260814-101906.sql` — **13행 COMMIT** + `tts_done` 전이 |
| 리더 검증 | **개행 보유 면의 하이라이트 정위치** — D6 원문 좌표계(개행 보존)와 리더 정합 실증 |

D1(화면은 요청만·합성은 로컬)·D2(5상태)·D3(전이표)·D4(재생성 차단)·D6(처리기)이 한 권으로 전부
관통 검증됐다.

#### 2. 비용 게이트 오탐 수정 — 비율 판정 → 원인 판정

- 구판은 문자수 편차를 **비율(±1.0%)** 로 판정했다. catch-that-cat 드라이런에서 개행 보존분
  **+11자**가 771자 대비 **+1.447%** 로 계산돼 **오탐 STOP**이 났다(같은 +11자가 4권 배치에서는
  +0.348%). 분모가 작을수록 비율이 커지므로 **소형 배치에서 필연적으로 오탐**하는 구조였다.
- 개정: 편차의 **크기**가 아니라 **원인**을 잰다. 개행 보존분은 D6 좌표계 결정의 의도된 증가이므로
  면제하고, **개행으로 설명되지 않는 편차는 1자라도 STOP**한다(fail-closed 유지). 비율은 참고값으로만
  출력한다.
- 회귀 테스트 2건을 처리기 자체에 박제했다(`--selftest`, 21항목 PASS): ① 편차 전액이 개행 보존분이고
  비율이 1.0%를 넘어도 **PASS** ② 개행 보존분 +11자에 개행 외 +1자가 섞이면 **STOP**.

#### 3. `BEGIN … ROLLBACK` 규약 검증 — 가설 A/B 실험

- 계기: 원복 SQL v1(`04_…`)이 SQL Editor에서 `ERROR 42P01: relation "_restore_before" does not exist`로
  2회 실패했다. 문법은 실 PostgreSQL 파서 검증을 통과했으므로 원인은 실행 환경으로 좁혀졌다.
- 가설 A(문장 단위 자동 커밋 → **ROLLBACK 무력**) vs 가설 B(임시 표가 세션 로컬 → 트랜잭션은 정상).
  A가 참이면 프로젝트 전체의 "리허설 후 COMMIT 타이핑" 규약(ADR-0053 E9)이 허상이 되므로 먼저 판별했다.
- 실험(`06_probe_rollback_semantics.sql`): 트랜잭션 안에서 1행을 실제로 바꾸고 **`updated_rows=1`을
  먼저 증명**한 뒤 ROLLBACK → 별도 실행으로 상태 조회. 결과 **[실행 1] READY → [실행 2] `confirmed` 유지**.
- **판정: 가설 B 확정.** `BEGIN … ROLLBACK` 리허설 규약은 **정상 작동한다**. ADR-0053 E9 규약 유효.

#### 4. 신규 규약 — SQL 산출물에서 임시 표 금지, CTE 단일 문장 표준

- **`CREATE TEMP TABLE`은 문장 간 생존을 보장받지 못한다**(임시 표는 세션 로컬이고 `ON COMMIT DROP`은
  트랜잭션 경계에서 사라진다). SQL Editor용 산출물에서 **임시 표 의존을 금지**한다.
- 표준형: 사전 상태 조회 · 조건부 UPDATE · 후검증을 **단일 SELECT 문장의 CTE**로 합친다
  (`WITH before AS (SELECT …), upd AS (UPDATE … RETURNING …) SELECT …`). 같은 문장의 WITH 하위 구문은
  동일 스냅샷을 보므로 `before`가 UPDATE 효과에 오염되지 않고, `RETURNING` 행 수가 곧 실제 영향 행수다.
  후검증 SELECT는 `FROM` 절 없이 스칼라 서브쿼리만 써서 **대상 행이 없어도 1행을 반환**하게 한다.
- 적용: `05_…_v2.sql`(전제 변경으로 미실행) · `06_probe_…sql` · `07_…_v3.sql`(리허설 PASS → COMMIT).
  실패 기록인 `04_…sql`도 이력 보존을 위해 함께 커밋했다.

#### 5. 줄바꿈 실험과 텍스트 수정 정책 확정

- 실험: `tts_done` 도서를 '되돌리기'로 `in_review`로 내린 뒤 텍스트만 수정하고 리더에서 하이라이트를
  실측했다. 되돌리기는 `book_review.status`만 바꾼다 — **`book_audio` 행·Storage 객체는 무접촉**이고,
  리더는 `book_review`를 참조하지 않으므로 되돌린 뒤에도 오디오는 계속 재생된다.
- 실측: **수정 지점 앞 글자수가 변하면 하이라이트가 밀린다(3면 재현). 글자수가 보존되면 무영향(5면).**
  marks 오프셋이 원문 좌표 기준이라 앞쪽 길이 변화가 이후 전체를 밀어내기 때문이다.
- **정책 확정: "TTS 완료 도서의 텍스트 수정 = 재합성."** D4(재생성 차단)와 결합하면, 재합성이
  필요할 때 `book_audio` 행 삭제가 선행돼야 한다(팀장 SQL 영역).
- 실험 후 상태 원복은 화면에서 불가능하다 — 전이표에 *어떤 상태 → `tts_done`* 이 없기 때문이며(D3),
  `07_…_v3.sql`이 그 유일한 경로다.

#### 6. 후속 백로그

- **marks 좌표 보정 방식** — 텍스트 수정분만큼 기존 marks 오프셋을 재계산해 **오디오를 재사용**하는
  경로(무과금). 위 재합성 정책의 완화안이다. **8/31 이후 착수**로 등재한다.

## Deciders

팀장, 오케스트레이터

## Related

- **ADR-0046** D1·D6(검수 데이터 모델 — `book_review` 4상태), **migration 006**
- **ADR-0048** D4(적재와 동시 `status='draft'` 시드 — `scratchpad/step10_book_review_seed.sql`)
- **ADR-0051** D2·D3·D5(검수 화면 — 본 ADR이 **D3를 개정**한다)
- **ADR-0053** D1(검수 게이트 폐지)·D2(키 보관 정책)·D4(dry-run 선행 절차)·D5(경로·UNIQUE 규약)
  ·**D6**(실행 경계 — 본 ADR이 **개정**한다)·Non-goals(:237 "관리자 '음원생성' 버튼 UI 구현" 제외)
- **ADR-0056** D8(ASb·Bloom 미시드) · **O5**(`book_review` 시드 여부 — 본 ADR이 **종결**한다)
- **ADR-0019** D2(트리플 가드)·D16(layout 가드 1중)·D18(낙관적 UI)
- **ADR-0034** Amd#1·#2(`kind`·1-based 파일명·성우 층위), **ADR-0052** Amd#2(Danielle/long-form/atempo 0.85)
- 구현 대상: `lib/admin/review/actions.ts` · `lib/admin/review/query.ts` ·
  `components/admin/review/review-list-view.tsx` · `scripts/tts_pilot/` (신규 처리기)

## Context

### 1. 요구

8/31 베타 목표 ②로 **관리자 패널에서 책 단위 TTS 생성을 촉발**할 수 있어야 한다.
현재는 팀장이 로컬 터미널에서 배치를 돌리는 것 외에 착수 수단이 없다.

### 2. 서버 직접 합성(A안)이 막히는 지점 — 정찰 실측(2026-08-13)

| 항목 | 실측 | 출처 |
|---|---|---|
| ffmpeg 외부 바이너리 의존 | atempo 0.85 감속 · marks time 재스케일 · `duration_ms` 실측 3곳 필수 | `run_tts_fullbatch.py:256-345` |
| AWS SDK | 앱 의존성 **0건** | `package.json` |
| API Route 전례 | `app/api/**/route.ts` **0건**. 서버 쓰기 표면은 server action 뿐 | 리포지토리 전수 |
| Storage 쓰기 경로 | 앱 코드에 `storage.from(` **0건** | 리포지토리 전수 |
| 함수 실행시간 | 유닛당 ≈5.3초(100유닛=8.9분 실측) × 권당 평균 11.3유닛 ⇒ **권당 ≈60초** + 업로드 | `out/_full708_log.txt` |
| 타임아웃 설정 | `vercel.json` 없음 · `maxDuration` 설정 **0건** | 리포지토리 전수 |

즉 A안은 ffmpeg 조달·AWS SDK 신규 의존·최초 API Route 신설·장시간 함수 설계를 **동시에**
요구한다. 베타까지 남은 기간에 이 4건을 한꺼번에 지는 것은 위험이 크다.

### 3. 이미 검증된 자산

`run_tts_full708.py` → `upload_tts_full708.py` → `gen_book_audio_sql_708.py` 3단 파이프라인은
**708권 7,978유닛 실패 0**으로 폐합됐고(ADR-0053 D4-a·E8), 로컬 ffmpeg·boto3·체크포인트가
갖춰져 있다. 이 자산을 버리지 않는 설계가 합리적이다.

### 4. 코호트 실측 — 2026-08-13 대조 확정

팀장 DB 실측(`book_audio` 보유 846권)과 로컬 정본 대조 결과, 장부는 다음과 같이 확정됐다.

```
book_audio 보유 846권
  ├ voice='danielle' 836권 = 기존 128(BD PDF 코호트) + 신규 708(asb 527 + bloom 142 + bd html 39)
  └ voice='Ruth' 전용 10권 = BD html 비활성 · 원본 이미지 404 블랙리스트(v1 트랙)

book_review 미보유 49권(book_dash) = 신규 danielle 39 + Ruth 전용 10
```

- **"708권"은 정확하다**(718 아님). 근거 3종 일치: `_full708_summary.json` `gate.books`=708 ·
  `out/audio_full708/` 디렉토리 708(asb 527 / bloom 142 / bd 39) · `load708/` 청크 SQL의
  book_dash 고유 source_id 39.
- Ruth 전용 10권 = `lib/shared/blacklist.ts` `BOOK_DASH_404_SOURCE_IDS` 등재 10/10,
  `scratchpad/step8_book_audio_insert.sql`(v1 44권) 등장 10/10, `audio_full708`·`load708` **0/10**.
  ADR-0056 §Context 5-b(:212) "비활성 10권 = 12면 9권 + 13면 1권(`who-is-our-friend`) = 121면"과 일치.
- 검산: 177(bd 오디오 보유) = 128 + 39 + 10 ✅ / 152(문서 기준 BD PDF `book_review`) − 128 =
  24 = 회전 18 + 오염 6 ✅
- **`book_review` 미시드 = 708권**이며, Ruth 전용 10권은 `book_text` 0행이라 `book_text` 기준
  시드에서 **구조적으로 자동 제외**된다.

> 위 152·860 등 문서 기준 수치의 최종 확정은 팀장 실측 COUNT로만 한다(ADR-0053 E9).

---

## Decision

### D1. 아키텍처 — 화면은 "요청 기록"만, 합성은 로컬 파이프라인 (B안)

- `/admin/review` 화면의 **[TTS 생성 요청]** 버튼은 **DB에 요청 사실만 기록**한다.
  Polly 호출 0 · Storage 업로드 0 · `book_audio` 쓰기 0.
- 실제 **합성 → 업로드 → 적재**는 팀장 로컬의 검증된 파이프라인(`run_tts_*` 계열)이
  요청 큐를 읽어 배치로 수행한다(D6).
- **서버 직접 합성(Polly·ffmpeg 서버 탑재)은 명시적 Non-goal**이다 — 베타 이후 별도 ADR.
  §Context 2의 4개 위험(ffmpeg 조달·AWS SDK 신규 의존·최초 API Route·장시간 함수)을
  베타 일정에 얹지 않는다.
- 이로써 **ADR-0053 D2(AWS 키의 Vercel 서버 보관 허용)는 본 ADR 범위에서 발동하지 않는다.**
  D2는 폐기가 아니라 **미발동 유지**이며, A안 재개 시 그대로 전제로 남는다.
- 사용자 관점 동작: 버튼 클릭 → 상태 배지가 🟣 `요청됨`으로 바뀜 → (팀장 배치 후) 🔵 `음성 완료`.

### D2. 요청 상태 모델 — `book_review.status`에 `tts_requested` 추가

- CHECK 제약을 5상태로 확장한다:
  `draft` / `in_review` / `confirmed` / **`tts_requested`** / `tts_done`
- 파이프라인 순서: `draft → in_review → confirmed → tts_requested → tts_done`
  (`query.ts`의 `STATUS_ORDER` 배열에 같은 위치로 삽입 — 목록 정렬이 파이프라인 순서를 유지한다)
- 요청 시각·요청자는 기존 컬럼을 재사용한다 — `reviewed_at` = 마지막 상태 이동 시각,
  `reviewer_id` = 마지막으로 상태를 움직인 사람(`actions.ts:251-257` 기존 의미 그대로).
  `note` 컬럼은 계속 미사용.
- **마이그레이션 초안** (파일명 `supabase/migrations/009_book_review_tts_requested.sql`,
  **본 ADR 승인 후에 생성**):

```sql
-- 목적: book_review.status에 'tts_requested' 추가 (ADR-0058 D2)
-- 실행자: 팀장(Supabase SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0053 D6 개정 후에도 불변).
-- 주의: books / book_audio / book_text 무접촉. attribution_text NOT NULL(Hard Rule 1)·
--       enforce_commercial_license(Hard Rule 2) 무관. 도메인 DDL은 book_review 1테이블 한정.
-- ⚠ 본 파일은 ROLLBACK 으로 끝난다(리허설). 기대값이 전부 맞으면 마지막 줄을 COMMIT 으로
--   직접 고쳐 타이핑한 뒤 재실행할 것. — ADR-0053 E9 사고(리허설 ROLLBACK을 COMMIT으로 오인)
--   재발 방지 규약.

-- ───────── [선검증] 현재 제약 이름·정의 확인 (기대: book_review_status_check 1행) ─────────
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.book_review'::regclass AND contype = 'c';

-- ───────── [선검증] 현재 status 분포 (기대: 5번째 값 0행) ─────────
SELECT status, count(*) FROM public.book_review GROUP BY status ORDER BY status;

BEGIN;

ALTER TABLE public.book_review DROP CONSTRAINT IF EXISTS book_review_status_check;

ALTER TABLE public.book_review
  ADD CONSTRAINT book_review_status_check
  CHECK (status IN ('draft','in_review','confirmed','tts_requested','tts_done'));

COMMENT ON TABLE public.book_review IS
  '책 단위 검수 상태. status 5단계(draft/in_review/confirmed/tts_requested/tts_done).
   tts_requested = 관리자 화면의 TTS 생성 요청(ADR-0058 D2). 공개는 books.is_active가 단일진실(ADR-0046 D6).';

-- ───────── [후검증] 새 제약 확인 (기대: 5개 값 포함) ─────────
SELECT pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.book_review'::regclass AND conname = 'book_review_status_check';

-- ───────── [후검증] 기존 행 무영향 (기대: 위 선검증 분포와 동일) ─────────
SELECT status, count(*) FROM public.book_review GROUP BY status ORDER BY status;

ROLLBACK;   -- 기대값 일치 시 COMMIT 으로 고쳐 재실행
```

- **되돌리기**: `tts_requested` 행이 0인 상태에서 CHECK를 4상태로 되돌리는 `ALTER` 1문.
  행이 남아 있으면 먼저 `UPDATE … SET status='confirmed' WHERE status='tts_requested'`.
- RLS·정책 변경 **0건**(006 §3.2 그대로 — `book_review`는 정책 0개 = service_role 전용).

### D3. 전이표·zod 개정 (ADR-0051 D3 개정)

- **개정되는 ADR-0051 D3 문안** — 아래로 대체한다:

  > `tts_done` 상태는 본 화면이 직접 설정하지 않는다(TTS 파이프라인 소관). 본 화면은
  > **`tts_requested`까지만 설정**하며, `tts_done` 전이는 로컬 파이프라인의 적재 SQL이
  > 수행한다(ADR-0058 D2·D6). 본 화면은 `tts_done`을 **표시·되돌리기만** 한다.

- **개정 후 전이표** (`lib/admin/review/actions.ts:92-97` `ALLOWED_TRANSITIONS`):

  | 현재 | 허용 도착 | 화면 라벨 |
  |---|---|---|
  | `draft` | `in_review`, **`tts_requested`** | 검수시작 / TTS 생성 요청 |
  | `in_review` | `confirmed` | 확정 |
  | `confirmed` | `in_review`, **`tts_requested`** | 되돌리기 / TTS 생성 요청 |
  | **`tts_requested`** | `in_review` | 요청 철회(경고 팝업) |
  | `tts_done` | `in_review` | 되돌리기(경고 팝업, 기존 유지) |

- **`in_review`에서는 요청할 수 없다.** 편집이 열린 상태의 텍스트로 합성하면 재생성이
  필요해지는데, 재생성은 D4에서 Non-goal이다.
- **`draft`에서 요청 가능하게 두는 것은 ADR-0053 D1 정합이다.** D1이 `confirmed` 게이트를
  폐지했으므로, 요청에 `confirmed` 선행을 강제하면 폐지된 게이트를 화면에서 되살리는 셈이 된다.
  신규 708권은 원본 확정 텍스트라 OCR 오류 유형이 없다는 ADR-0056 D8 근거 ①도 같은 방향이다.
- zod 개정 (`actions.ts:69`): `to: z.enum(['in_review','confirmed','tts_requested'])`.
  **`tts_done`은 여전히 enum 밖**이다 — 화면발 설정을 타입 단계에서 차단하는 구조는 유지된다.
- `saveReviewText`의 "`in_review`에서만 저장" 규칙은 **무개정**. `tts_requested`는 편집 잠김.
- 서버는 현재 status를 DB에서 다시 읽어 판정한다(`actions.ts:168-178` 기존 구조 유지) —
  화면 잠금은 UX일 뿐 보안 경계가 아니라는 원칙 불변.

### D4. 재생성 정책 — `book_audio` 행이 있으면 버튼 비활성

- 대상 책에 `book_audio` 행이 **1행이라도 있으면** 요청 버튼을 **비활성화**하고 사유를 표시한다:
  "이미 음성이 있는 책입니다. 재생성은 지원하지 않습니다."
- 근거: `book_audio` UNIQUE `(book_id, kind, page_index, voice)` + 적재 SQL에 `ON CONFLICT` 절이
  없다(`docs/sql/load708/README.md` §기존 행 보호 — "덮어쓰기 구조적 불가"). 업로더도
  기본 `upsert='false'`다. 재생성은 삭제 정책·Storage 키 재사용 정책을 새로 정해야 하므로
  베타 범위 밖이다. **UNIQUE 충돌을 입구에서 원천 차단**한다.
- 판정은 **`voice` 무관**하게 `book_audio` 행 존재로만 한다 — Ruth 전용 10권도 자동으로 잠긴다.
- 구현 영향: `lib/admin/review/query.ts`의 목록·상세 조회에 "오디오 보유 여부"가 필요하다
  (service role SELECT 1회 추가, `ReviewBookListRow`/`ReviewBookDetail`에 `hasAudio: boolean` 필드).
- **재생성은 Non-goal.** 필요 시 팀장이 기존 경로(개별 지시 + SQL)로 처리한다.
  - **(2026-08-14 Amendment #1)** 그 "기존 경로"의 절차가 표준화됐다 → **§Amendment #1**.
    Non-goal 지위와 화면 동작(버튼 비활성)은 **그대로**이며, 절차만 문서에 고정된 것이다.

### D5. ADR-0056 O5 흡수 — 신규 708권 `book_review` 시드

- **시드한다.** 대상 = §Context 4에서 확정된 **708권**(asb_native 669 = ASb 527 + Bloom 142,
  Book Dash html 39). `status='draft'`, ADR-0048 D4 및 `step10_book_review_seed.sql`과 동형.
- **O5 검토항목 1(시드 범위)** → 708권 전량. **항목 2(초기값)** → `draft`(선례 계승).
  **항목 4(TTS 비차단)** → D3에서 `draft`→`tts_requested`를 허용하므로 여전히 비차단.
- **O5 검토항목 3(기존 검수 큐와 혼입)** → 목록 화면에 **코호트 필터**를 추가해 해소한다.
  현재 `components/admin/review/review-list-view.tsx:57`의 `pilotOnly` 단일 토글을
  3분류 필터로 확장한다: `시범 12권` / `Book Dash PDF 코호트` / `신규 asb_native 코호트`.
  이를 위해 `query.ts`의 목록 조회 select에 `books(source_platform)`를 추가하고
  `ReviewBookListRow`에 `platform` 필드를 넣는다(정렬 로직은 무개정).
- **Ruth 전용 10권은 시드 대상이 아니다.** `book_text` 0행 · `is_active=false` ·
  원본 이미지 404 블랙리스트 등재(§Context 4). 아래 시드 SQL이 `book_text` 기준이므로
  **예외 처리 없이 구조적으로 제외**된다.
- **시드 SQL 초안** (실행자 팀장, 파일 생성은 후속 지시서):

```sql
-- 목적: 신규 708권(asb_native 669 + book_dash html 39)에 book_review(status='draft') 1:1 시드
-- 근거: ADR-0058 D5 (ADR-0056 O5 종결) · ADR-0048 D4 동형 · ADR-0046 D6
-- 실행자: 팀장(Supabase SQL Editor). ON CONFLICT (book_id) DO NOTHING → 재실행 안전.
-- 되돌리기: DELETE FROM book_review WHERE status='draft' AND book_id IN (<본 SQL 대상>);

-- ───────── [선검증] 시드 전 (기대: 문서 기준 152 / 미시드 708) ─────────
SELECT count(*) AS review_rows_before FROM public.book_review;
SELECT count(DISTINCT bt.book_id) AS text_books_without_review
  FROM public.book_text bt
 WHERE NOT EXISTS (SELECT 1 FROM public.book_review r WHERE r.book_id = bt.book_id);

BEGIN;
INSERT INTO public.book_review (book_id, status)
SELECT DISTINCT bt.book_id, 'draft'
  FROM public.book_text bt
ON CONFLICT (book_id) DO NOTHING;

-- ───────── [후검증] 기대: before + 708 = after · 미시드 0 ─────────
SELECT count(*) AS review_rows_after FROM public.book_review;
SELECT count(DISTINCT bt.book_id) AS still_without_review
  FROM public.book_text bt
 WHERE NOT EXISTS (SELECT 1 FROM public.book_review r WHERE r.book_id = bt.book_id);
SELECT b.source_platform, r.status, count(*) AS books
  FROM public.book_review r JOIN public.books b ON b.id = r.book_id
 GROUP BY b.source_platform, r.status ORDER BY b.source_platform, r.status;

ROLLBACK;   -- 기대값 일치 시 COMMIT 으로 고쳐 재실행 (ADR-0053 E9 규약)
```

### D6. 로컬 요청 처리기 사양 (신규 스크립트 — 코드는 후속 지시서)

`scripts/tts_pilot/run_tts_requested.py`(가칭). **기존 3단 구조를 그대로 유지**한다.

| 단계 | 내용 | 재사용 |
|---|---|---|
| ① 큐 조회 | `book_review`에서 `status='tts_requested'` SELECT → book_id 목록 | 읽기 전용 |
| ② 대상 조립 | `books` + `book_text` 조회 → 정제·표지문구 생성 | `sanitize()` · `cover_text()` · `build_targets` 형태 |
| ③ 게이트 | **요청 건수 기반으로 재정의**(아래) | `safety_gate` 대체 |
| ④ 합성 | 유닛 단위 Polly 2회 + ffmpeg atempo 0.85 | **`synth_unit()` 그대로 재사용** |
| ⑤ 업로드 | Storage `book-audio/{platform}-{sid}/danielle/…` | `upload_tts_full708.py` 패턴 |
| ⑥ 적재 SQL 생성 | `book_audio` INSERT + `tts_requested → tts_done` UPDATE | `gen_book_audio_sql_708.py` 패턴 |

- **게이트 재정의**: `EXPECT_BOOKS=708` 같은 고정 상수를 쓸 수 없다. 대신
  ① 조립된 권수 = 큐 SELECT 건수 일치 ② 권당 문자수 상한(초과 시 STOP) ③ 총 문자수·추산 비용
  출력 후 사용자 확인 ④ `--dry-run` 선행(Polly 0 · 업로드 0 · DB 쓰기 0)을 기본 절차로 둔다.
- **과금 승인의 정의**: ADR-0053 D4의 "dry-run 선행 · 팀장 승인 후 실행" 절차는 **유지**되며,
  **팀장이 로컬에서 본 스크립트를 실행하는 행위 자체가 그 승인**이다. 화면 버튼은 과금을
  일으키지 않으므로 D4 절차와 충돌하지 않는다.
- 경로·UNIQUE·Content-Type·`rate=85`·성우 층위 규약은 **ADR-0053 D5·ADR-0034 그대로 준수**한다.
- 재개 판정은 기존과 동일하게 **로컬 산출물 기준**(`already_done`), DB 기준이 아니다.
- 적재 SQL의 상태 UPDATE는 조건부로 쓴다:
  `UPDATE book_review SET status='tts_done' WHERE status='tts_requested' AND book_id IN (…)`
  — 배치 도중 철회된 권을 덮어쓰지 않는다(O2 참조).

### D7. ADR-0053 D6 개정 — 쓰기 주체 3분류

- **개정되는 ADR-0053 D6 문안** — 아래로 대체한다:

  > **D6. 실행 경계 — 쓰기 주체 3분류 (ADR-0058 D7로 개정, 2026-08-13)**
  >
  > | 주체 | DB 쓰기 | Storage 쓰기 | 비고 |
  > |---|---|---|---|
  > | ① **워커 스크립트**(로컬 개발자 도구) | **금지(불변)** | **금지(불변)** | SELECT만 허용. AWS·Supabase secret 키 주입 금지(ADR-0052 D8 승계) |
  > | ② **배포 서버**(Next.js server action) | **`book_review.status` 전이만 허용** | 금지 | `SUPABASE_SECRET_KEY` service role + ADR-0019 D2 트리플 가드(zod → `assertAdmin` → service role) 통과 필수. `books`·`book_audio`·`book_text` 쓰기 0건 |
  > | ③ **팀장 로컬 실행** | SQL Editor 실행(`book_audio` INSERT 등) | 업로드 | 합성·업로드·적재 SQL 실행 |
  >
  > 종전 D6의 "INSERT/UPDATE/DELETE·Storage 업로드는 전부 팀장 영역"은 **①에 대해 그대로 유효**하며,
  > ②는 관리자 인증 가드 하의 좁은 예외로 신설된 것이다. 스키마 변경은 3주체 모두 금지이며
  > 팀장의 SQL Editor 실행으로만 이뤄진다(Hard Rule 8).

- 개정 범위는 D6 한정이다. **D1·D2·D3·D4·D5는 무개정**이며, 특히 D4(dry-run 선행 절차)는
  D6-①·③ 경로에서 그대로 살아 있다.

### D8. 문서 정합 처리

- **ADR-0053**: 종결(Completed) 표기는 **유지**한다. 본 ADR은 0053의 D4 실행 트랙을 **재개하지
  않는다**(Amendment #3 C0 선례 형식). 0053에는 D6 개정 사실과 본 ADR 링크만 기재한다.
  0053 Non-goals의 "관리자 '음원생성' 버튼 UI 구현"은 **본 ADR이 그 범위를 인수**했음을 명기한다.
- **ADR-0056 O5**: **Resolved (2026-08-13, ADR-0058 D5)** 로 종결 처리한다. 종결 문안 초안:

  > ### O5. `book_review` 시드 여부 — ✅ **Resolved (2026-08-13, ADR-0058 D5)**
  >
  > ADR-0058 D5가 **신규 708권 전량을 `status='draft'`로 시드**하기로 결정했다. 검토항목 4건 처리:
  > ① 시드 범위 = 708권 전량 ② 초기값 = `draft`(ADR-0048 D4 선례) ③ 기존 검수 큐 혼입은
  > 목록 화면 코호트 필터로 분리 ④ TTS 비차단은 유지(`draft`에서 바로 요청 가능).
  > D8(ASb·Bloom 미시드)은 **본 결정으로 대체**되며, 미시드 사유였던 8/31 일정 부담은
  > 코호트 필터로 해소됐다. Book Dash html 비활성 10권은 `book_text` 0행이라 시드 대상 밖이다.

- **ADR-0051**: D3를 본 ADR D3 문안으로 개정. D1·D2·D4·D5는 무개정.
- **migration 006**의 `book_review` 테이블 주석은 D2 마이그레이션에서 5단계로 갱신된다.

---

## Amendment #1 (2026-08-14) — 재합성 절차 표준화 (D4 개정)

### G0. 본 Amendment의 성격

D4는 재생성을 **Non-goal**로 두고 "필요 시 팀장이 기존 경로로 처리한다"고만 적었다. 그 경로가
필요해지는 조건이 실측으로 확정됐으므로(§G6) **절차를 고정**한다. **기능 추가가 아니다** — 화면에는
재생성 버튼이 여전히 없고, `book_audio` 행이 있으면 요청 버튼은 그대로 잠긴다.
D1·D2·D3·D5~D8 무개정.

### G1. 결정 — 재합성 표준 4단계

| 단계 | 주체 | 행위 |
|---|---|---|
| ① | **팀장** | 해당 권의 `book_audio` 행 삭제 (권 단위 SQL · 사전/사후 대조 · `ROLLBACK` 종료) |
| ② | — | **잠금 자동 해제.** 코드 변경 0건 — `hasBookAudio`가 행 존재로만 판정하므로(`actions.ts`) 삭제 즉시 'TTS 생성 요청' 버튼이 열린다 |
| ③ | 팀장 | 검수 화면에서 텍스트 수정 → `confirmed` |
| ④ | 워커/팀장 | TTS 재요청 → 처리기 드라이런 → `--execute` → **`--upload --overwrite`** → 적재 SQL |

### G2. Storage 정책 — **객체를 삭제하지 않는다. `--overwrite`로 덮어쓴다**

- 키 규약 `{book_key}/{voice}/{unit}`이 결정적이라 재합성은 **같은 키**를 다시 만든다.
- 삭제 후 재업로드는 그 사이 **404 구간**을 만든다. 덮어쓰기가 원자적 교체에 가깝다.
- 업로더 기본값은 `upsert=false`이므로, 이 경로에서는 **`--overwrite`가 필수**다.

  > **정정 (2026-08-18, 코드 실측)** — 본 항목은 당초 "빼면 기존 키 충돌로 업로드가 **멈춘다**"고
  > 적었으나 사실이 아니다. `process_tts_requests.py:544-557`은 충돌 예외 메시지에
  > `exists`·`duplicate`·`409` 중 하나가 있으면 **`skip += 1` 후 다음 객체로 넘어간다**.
  > 즉 **업로드는 멈추지 않고 오류 없이 완주**하며, 결과는 `업로드 0 · 스킵 N`으로만 남는다.
  >
  > 실패가 조용하기 때문에 **더 위험하다**. 그 상태로 적재 SQL을 돌리면 새 `book_audio` 행이
  > **옛 음원 키를 가리키게** 되어, 교정된 텍스트와 낡은 marks 좌표가 어긋난 채 배포된다 —
  > 재합성을 시작한 이유였던 좌표 드리프트가 그대로 남는 셈이다.
  >
  > **결론은 불변이다: 재합성 업로드에는 `--overwrite`가 필수다.** 바뀐 것은 누락 시의
  > 실패 양상뿐이다(중단 → 무증상 스킵).
- **대가**: 덮어쓴 시점에 이전 음원은 소실된다(롤백 불가). 사전 백업 여부는 팀장 판단.

### G3. 순서가 강제되는 이유 — 적재 SQL에 `ON CONFLICT`가 없다

적재 SQL은 `ON CONFLICT` 절이 없다(D4 근거 — "덮어쓰기 구조적 불가"). 따라서 ①에서 행을
삭제해야만 ④의 INSERT가 통과한다. **①을 건너뛰면 `book_audio` UNIQUE 충돌로 실패**한다.
이 실패는 fail-closed이며, 절차 위반을 DB가 잡아주는 장치로 그대로 둔다.

### G4. 코드 변경 0건

`--overwrite` 플래그는 `process_tts_requests.py`에 이미 있다. `hasBookAudio` 가드도 무개정이다.
본 Amendment는 **문서만** 바꾼다.

### G5. 바꾸지 않는 것

- 화면에 재생성 기능을 **추가하지 않는다**. 잠금 해제는 팀장의 DB 삭제 행위의 결과일 뿐이다.
- D4의 판정 기준(`voice` 무관, 행 존재로만 판정)은 유지된다.
- 워커의 DB·Storage 쓰기 금지(D7-①)는 불변이다 — ①은 팀장 실행이다.

### G6. 발동 조건 (Trigger)

본 절차는 특정 도서에 고정되지 않는다. 아래 조건이 성립할 때 발동한다.

> **`book_audio` 행이 존재하는 도서의 `book_text` 본문을 수정해야 할 때.**

근거: 2026-08-14 실측으로 하이라이트 좌표가 **수정 지점 앞 글자수 변화만큼 밀리는**
것이 재현됐다. 따라서 합성이 끝난 도서의 텍스트를 고치면 기존 음원의 marks 좌표가
어긋나며, 재합성 외에 정합을 되돌릴 방법이 없다. 이로써 정책이 확정됐다 —
**"TTS 완료 도서 텍스트 수정 = 재합성"**. 반대로 **합성 전 도서의 줄바꿈·본문 편집은
자유**이며 본 절차와 무관하다.

판정은 화면의 "초안" 라벨이 아니라 **`book_audio` 행 존재 여부**로만 한다
(시드 정책상 오디오 보유 도서도 draft로 표시된다).

### G7. Open — 본 Amendment 신규

- **G7-a**: 덮어쓰기 전 구 음원 백업을 표준으로 둘지 (현재는 "팀장 판단"). 비차단.
- **G7-b**: `book_audio` 삭제 SQL 템플릿 미작성. 첫 적용 전 워커가 준비한다. 비차단.

---

## Alternatives

### A1. 서버 직접 합성 (A안) — 반려

- 내용: server action 또는 신규 API Route가 Polly를 호출하고 ffmpeg로 감속한 뒤 Storage에
  올리고 `book_audio`까지 INSERT.
- 반려 사유: §Context 2의 4개 위험 동시 부담. 특히 **ffmpeg 없이는 ADR-0052 Amd#2가 확정한
  atempo 0.85 감속을 재현할 수 없고**, SSML `prosody` 대체는 그 Amd#2가 이미 반려한 방식이라
  사양 변경(=음질 재검수)에 해당한다. 권당 ≈60초 + 업로드는 함수 타임아웃 설계도 요구한다.
- **폐기가 아니라 이연**이다. ADR-0053 D2(서버 키 보관 정책)는 그대로 살아 있으므로
  베타 이후 별도 ADR로 재개할 수 있다.

### A2. 별도 큐 테이블 `tts_request` 신설 — 반려(단, 이행 경로 유지)

| 축 | `book_review.status` 확장(채택) | 별도 큐 테이블(반려) |
|---|---|---|
| 스키마 변경 | CHECK 1개 수정 | 신규 테이블 + RLS 정책 + 인덱스 + FK |
| 화면 재사용 | 기존 status 배지·전이 UI 그대로 | 목록/상세 조회에 조인 추가 |
| 요청 이력 | **1건만 남는다**(마지막 상태) | 재요청·실패 이력 누적 가능 |
| 배치 식별 | 불가(`batch_id` 없음) | 가능 |
| 되돌리기 | `ALTER` 1문 | `DROP TABLE` |

- 채택 사유: 베타 범위에서 **요청은 책당 1회**(D4가 재생성을 금지하므로 재요청 개념이 없다)라
  이력 누적의 실익이 없다. 상태가 곧 큐라서 화면·조회·정렬 코드가 전부 재사용된다.
- **이행 경로**: 재생성이 필요해지는 시점(베타 이후)에 큐 테이블을 신설하고 `status`는
  그 테이블의 파생 표시로 격하하면 된다. 지금 결정이 그 길을 막지 않는다.

### A3. 시드하지 않고 별도 진입 경로 신설 (O5 검토항목 1의 3안) — 반려

- 목록의 기준 테이블이 `book_review`이므로(`query.ts:135`), 시드 없이 708권을 다루려면
  조회·상세·전이 경로를 전부 이중화해야 한다. 시드 1문이 압도적으로 싸다.

---

## Consequences

- **얻는 것**: 팀장이 터미널을 열지 않고도 화면에서 대상 책을 지정할 수 있다. 검증된 로컬
  파이프라인을 그대로 쓰므로 음질·경로·UNIQUE 규약 리스크가 0이다. 신규 708권이 검수 화면에
  드러나 ADR-0056 O5가 종결된다. 서버는 `book_review` 1테이블만 쓰므로 Hard Rule 표면이 최소다.
- **잃는 것**: 실시간이 아니다 — 요청과 실제 음성 사이에 팀장 배치 실행이라는 사람 개입이
  남는다. 요청 이력이 1건만 남는다(A2 참조). 검수 목록이 152 → 860권 규모가 되어 필터
  없이는 쓰기 어렵다(D5 필터가 전제 조건).
- **이연**: 서버 직접 합성(A1), 재생성(D4), 배치 진행률의 화면 표시.
- **되돌리기**: D2는 CHECK를 4상태로 되돌리는 `ALTER` 1문(선행: `tts_requested` 행 0 정리).
  D5 시드는 `DELETE` 1문. D3·D4 코드 변경은 커밋 되돌리기. **DB 데이터 손실 경로 0건**이다.
- **Hard Rule 점검**: `books` 무접촉(1·2 무관) · NC/ND 콘텐츠 무관(3·4·5) ·
  secret 키는 서버 전용 유지(6) · 스키마 변경에 본 ADR 선행(8) · 신규 라이브러리 추가 **0건**.

## Non-goals

- 서버에서의 직접 합성(Polly·ffmpeg 서버 탑재) — A1, 베타 이후 별도 ADR.
- **재생성**(이미 `book_audio` 행이 있는 책의 음성 교체) — D4.
- 배치 진행률·실패 사유의 화면 표시(요청 시점 이후는 팀장 터미널에서 관찰).
- `books.has_audio` 갱신 — 앱은 이 컬럼을 읽지 않는다(`06_final_verify.sql:110-111`).
- Ruth 전용 10권(비활성·404 블랙리스트)의 처리 — 별도 트랙.
- 회전 18권·오염 6권의 텍스트 교정(ADR-0053 Consequences 이연 항목 그대로).

## Open Questions

### O1. 요청 큐의 폴링 주기 — 미결정(비차단)

팀장이 배치를 언제 도는지에 대한 운영 규약이 없다. 요청이 며칠 방치될 수 있다.
후보: 주 N회 고정 / 요청 N건 누적 시 / 팀장 재량. 베타 운영 중 실측 후 정한다.

### O2. 배치 실행 중 요청 철회의 경합 — 미해소(비차단)

`tts_requested → in_review` 철회가 로컬 배치의 큐 SELECT 이후에 일어나면, 합성은 진행되고
상태는 `in_review`가 된다. D6의 조건부 UPDATE(`WHERE status='tts_requested'`)로 상태 덮어쓰기는
막히지만, "오디오는 있는데 `in_review`"인 행이 남는다. 이 경우 D4에 의해 버튼은 잠기므로
**추가 과금·중복 생성 위험은 없다**. 정정은 팀장 SQL 1문. 화면에 "배치 착수 후에는 철회가
반영되지 않을 수 있습니다" 경고 문구를 넣는 것으로 베타를 넘긴다.

### O3. `tts_requested` 배지 색·문구 — 미확정(비차단)

기존 신호등은 🔴 draft / 🟡 in_review / 🟢 confirmed / 🔵 tts_done(ADR-0051 D3).
`tts_requested`는 🟣 제안. 디자인 토큰 사용 규칙(Hard Rule 10)에 따라 semantic 토큰으로만
표현하며, 구현 지시서에서 `docs/design-system.md`를 참조해 확정한다.

### O4. 검수 목록 860권 규모의 조회 성능 — 미측정(비차단)

`getReviewBookList`는 페이지네이션 0건 전건 조회다(152권 전제로 설계, `query.ts:123-124`).
860권 + `books` 조인 + 오디오 보유 판정(D4)까지 얹으면 재검토가 필요할 수 있다.
D5 시드 후 실측하고, 필요 시 `lib/admin/books/query.ts`의 keyset cursor 패턴을 도입한다.

---

## 승인 이력 — 4항목 전량 승인 완결 (2026-08-13, 팀장 일괄 승인)

제안 시점의 승인 대기 4항목은 **전부 승인**됐다. 아래는 이력 보존을 위해 원 항목을 그대로
두고 승인 결과만 덧붙인 것이다.

| # | 항목 | 내용 | 결과 |
|---|---|---|---|
| 1 | **D2 스키마 변경** | `book_review.status` CHECK 5상태 확장(Hard Rule 8·CLAUDE.md 9절 ③) | ✅ **승인** (2026-08-13) |
| 2 | **D5 시드 실행** | 신규 708권 `status='draft'` 시드 | ✅ **승인** (2026-08-13) |
| 3 | **D3 전이 정책** | 특히 `draft`에서 바로 요청 가능하게 두는 결정(§D3 근거 참조) | ✅ **승인** (2026-08-13) |
| 4 | **D7 문안** | ADR-0053 D6 개정 — 서버(server action)의 `book_review` 쓰기 허용 | ✅ **승인** (2026-08-13) |

이로써 결정문 **D1~D8 전량이 `Accepted`** 상태이며, 잔여 미해소는 **O1~O4 4건뿐이고 전부
비차단**이다(운영 주기·철회 경합·배지 색·조회 성능).

**실행 순서** (승인 완료, 각 단계는 별도 작업지시서):

① `009_book_review_tts_requested.sql` 리허설(ROLLBACK) → 기대값 대조 → COMMIT
→ ② D5 시드 SQL 리허설 → COMMIT → ③ 코드 변경(D3 전이표·zod / D4 버튼 잠금 / D5 코호트 필터)
→ ④ 로컬 요청 처리기 작성(D6) → ⑤ ADR-0051 D3 · ADR-0053 D6 · ADR-0056 O5 개정 반영(D8).

**진행 상태 — ①②③④⑤ 전량 완료 (2026-08-14).** ①② 팀장 SQL Editor 실행(860권 시드 확정),
③④ 커밋 완료, ⑤ 본 개정으로 폐합. 실증까지 포함한 결과는 §실행 완결 (Completed) 참조.

⚠ ①②는 파일 끝이 `ROLLBACK;`이다. 기대값이 전부 맞을 때만 `COMMIT;`으로 직접 고쳐 재실행할 것
— ADR-0053 E9 사고(리허설 `ROLLBACK`을 `COMMIT`으로 오인) 재발 방지 규약.
