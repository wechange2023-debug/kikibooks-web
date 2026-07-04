# ADR-0034 — TTS 오디오 저장 구조 구현 (book_audio 테이블 · book-audio 버킷 · 헤더 정책)

## Status
Accepted (2026-07-04) — 팀장 승인 + 스키마 실행 완료. 이전: Proposed (2026-07-04).
결정 ①의 스키마는 2026-07-04 팀장이 Supabase SQL Editor에서 직접 실행·성공(아래 결정 ① 「실제
실행된 SQL」 참조). 남은 단계는 아래 「## 다음 단계」 참조.

## 관련
- `docs/adr/0023-ai-features-and-tts-policy.md`(TTS 정책 상위 결정) 및 그 **Amendment #1**
  (2026-07-03, Accepted — TTS 산출물 **저장 위치 = Supabase Storage 확정**). 본 ADR은 그
  "저장 위치 = Storage" 결정의 **구현 상세**(테이블·버킷·경로·헤더)를 확정한다.
- `docs/adr/0032-bookdash-cover-storage-migration.md`(book-covers 버킷 신설·키 컨벤션 선례).
- `docs/adr/0017-book-reader-architecture.md`(뷰어 결합점 — AsbReader 오디오 통합 대상).
- `docs/adr/0033-catalog-data-caching-strategy.md`(공개 카탈로그 캐시 원칙 — has_audio 플래그 정합).

---

## 1. 맥락

- ADR-0023 Amd#1로 **TTS 산출물 저장 위치 = Supabase Storage**가 확정됐고, 파일럿
  (Ruth·rate 78·natural, "78% 자연낭독" 팀장 승인)이 로컬 산출물로 검증을 마쳤다.
- 다음은 실제 배포용 저장 구조 확정이다. 파일럿 산출물 구조가 저장 형태를 규정한다:
  1권(`a-beautiful-day`) = **10페이지** → 페이지마다 **mp3 1개 + word speech-marks JSON 1개**
  (`generate_tts.py`: 장면별 `{slug}_p{N}.mp3` + `{slug}_p{N}.marks.json` 산출).
  즉 오디오는 **책 단위가 아니라 페이지 단위**다.
- 이 구조를 (a) DB에 어떻게 적재하고 (b) Storage 버킷·경로를 어떻게 짜고 (c) 어떤 Content-Type/
  캐시 헤더로 서빙할지를 본 ADR에서 확정한다.

---

## 2. 읽기전용 정찰 결과 — book-covers 키 컨벤션 (book-audio 경로 정합 근거)

신규 `book-audio` 버킷 경로를 기존 `book-covers`와 **동일 규칙**으로 맞추기 위해 커버 업로드·
DB 반영 코드를 정찰했다. **결과는 작업지시서가 전제한 "book-covers = slug"와 달랐다.**

- **실제 book-covers 객체 키 = `bookdash-{source_id}.webp` (flat, 폴더 없음)**
  근거: `scratchpad/step3_upload.py:97-101`(`upload(key=target_key, {"content-type":"image/webp"})`),
  `ADR-0032` 결정 3(키 `bookdash-{source_id}.webp`).
- **`source_id`는 slug가 아니라 플랫폼 고유 ID다.** Book Dash의 경우 **UUID**.
  근거: `scratchpad/step3_manifest.csv` 실측 —
  `source_id=9c9e55de-fe46-11e5-86aa-5e5517507c66`, `target_key=bookdash-9c9e55de-...webp`.
  사람이 읽는 slug(`little-ants-big-plan`)는 **old_cover_url 경로 안에만** 존재하고 키에는 안 쓰인다.
  ⇒ ADR-0032 산문의 "Book Dash는 `source_id = slug`"는 **부정확**(실제 source_id = Book Dash UUID).
- **DB 자연키(정본)** = `(source_platform, source_id)`.
  근거: `scripts/sync_asb.py:327,339`(`on_conflict="source_platform,source_id"`),
  `scripts/sync_asb.py:299-300`.
- **source_id 형태는 플랫폼마다 다르다**:
  - `book_dash` → UUID(`9c9e...`)
  - `african_storybook` → African Storybook 숫자 ID(`sync_asb.py:303` `{ASB_RAW_BASE}/{source_id}.txt`)
- **접두사 주의**: 커버 키 접두사는 리터럴 **`bookdash-`** 로, `source_platform` 값 **`book_dash`**
  (밑줄 포함)와 **철자가 다르다**. 아래 결정 ②에서 이 불일치를 어떻게 정리할지 명시한다.

**정찰 결론**: book-covers가 실제로 각 책을 구분하는 키는 **slug가 아니라 `source_id`(플랫폼 고유
ID) + 플랫폼 접두사**다. book-audio도 이 정본을 계승하되, 다중 플랫폼·페이지 단위 특성에 맞춰
아래처럼 확장한다.

---

## 3. 결정

### 결정 ① DB 저장 형태 — `book_audio` 별도 테이블 채택
- **사유**: 오디오가 책 단위가 아니라 **페이지 단위**(예: `a-beautiful-day` = 10페이지 → mp3 10 +
  marks 10). `books.audio_url` 컬럼 1개로는 표현 불가.
- **실제 실행된 SQL** (2026-07-04 팀장이 Supabase SQL Editor에서 직접 실행, 성공):

  ```sql
  create table if not exists public.book_audio (
    id           uuid primary key default gen_random_uuid(),
    book_id      uuid not null references public.books(id) on delete cascade,
    page_index   int  not null check (page_index >= 0),  -- 0-based 페이지 인덱스(경로 p00..과 정합)
    audio_path   text not null,                          -- book-audio 버킷 내 mp3 객체 키
    marks_path   text,                                   -- 동 word speech-marks JSON 객체 키
    voice        text not null,                          -- 예: 'Ruth'
    engine       text not null,                          -- 예: 'neural'
    rate         int  check (rate between 1 and 300),    -- 말하기 속도 % (예: 78)
    duration_ms  int  check (duration_ms >= 0),          -- 오디오 길이(마지막 word mark 프록시 또는 실측)
    created_at   timestamptz not null default now(),
    unique (book_id, page_index, voice)
  );
  alter table public.books
    add column if not exists has_audio boolean not null default false;
  -- RLS: enable + anon/authenticated SELECT 공개읽기, 쓰기 정책 없음(service_role 전용)
  ```

  - **`voice`를 UNIQUE에 포함**하는 이유: 향후 멀티보이스 트랙(같은 책·페이지의 다른 성우
    버전)이 충돌 없이 얹히도록. 현 배치는 `Ruth` 단일.
  - `page_index`는 **0-based**로 통일(결정 ②의 경로 `p00`과 정합).
- **books 보완**: `books`에 **`has_audio BOOLEAN NOT NULL DEFAULT false`** 플래그 **1개만** 추가.
  - **사유**: "오디오 있는 책만" 카탈로그 필터를 `book_audio` 조인 없이 싸게 처리. 공개 카탈로그
    캐시 원칙(ADR-0033)과 정합(카탈로그 응답에 이미 포함된 books 컬럼으로 필터).

- **초안(Proposed) 대비 실제 반영 변경점**:
  - (a) **idempotent 실행**: `create table if not exists` / `add column if not exists`로 재실행 안전화.
  - (b) **CHECK 제약 추가**: `page_index >= 0`(음수 페이지 차단), `rate between 1 and 300`(속도 범위
    가드), `duration_ms >= 0`(음수 길이 차단). 초안엔 없던 데이터 무결성 가드.
  - (c) **`marks_path` NOT NULL 해제**: 빈 텍스트 페이지(파일럿 관찰 — page 4·12 등 음성 스킵)는
    marks가 없을 수 있어 NULL 허용으로 완화. `audio_path`는 NOT NULL 유지.
  - (d) **RLS 공개읽기 정책 추가**: RLS enable + `anon`/`authenticated` SELECT 공개읽기, 쓰기 정책
    없음(service_role 전용). 초안엔 RLS 언급 없었음 → 공개 리더 재생 + 쓰기 차단 정합.
- **Hard Rule 8 준수 확인**: 스키마 변경(테이블·컬럼 추가)에 앞서 본 ADR(문서)이 선행됐고, 승인 후
  팀장이 SQL Editor에서 직접 실행(워커 DB 직접 쓰기 금지). 기존 제약·트리거
  (`enforce_commercial_license`)·`attribution_text` NOT NULL(Hard Rule 1) 미접촉.

### 결정 ② Storage 버킷·경로
- **신규 버킷**: **`book-audio`** (기존 `book-covers`·`book-manifests`의 `book-*` 네이밍 컨벤션 계승).
  버킷 생성은 팀장이 Supabase Dashboard에서 수행(워커는 Storage 관리자 권한 없음).
- **경로**:
  ```
  book-audio/{book_key}/p00.mp3
  book-audio/{book_key}/p00.marks.json
  book-audio/{book_key}/p01.mp3
  book-audio/{book_key}/p01.marks.json
  ...
  ```
  - mp3와 marks JSON을 **같은 폴더에 co-location**(한 책의 자산 응집).
  - 페이지 번호는 **2자리 zero-pad**(`p00`, `p01` …) — 문자열 정렬 안정성(`p10`이 `p2` 앞에
    오는 사고 방지). DB `page_index`(0-based)와 1:1 대응.
- **`{book_key}` = `{source_platform}-{source_id}`** (예: `african_storybook-1234`,
  `book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66`).
  - **근거(정찰 §2)**: book-covers가 실제로 쓰는 키는 slug가 **아니라** `{플랫폼 접두사}-{source_id}`
    (`bookdash-{source_id}.webp`)다. book-audio는 이 정본을 계승하되, 오디오 첫 배치가 **ASb 39권**
    이고 향후 다중 플랫폼으로 확장되므로 **플랫폼을 명시**해 교차 플랫폼 충돌을 원천 차단한다.
  - `(source_platform, source_id)`는 DB 자연키(`sync_asb.py:327`)와 동일 → **정본 재사용**.
  - **접두사 표준화**: 커버는 리터럴 `bookdash-`를 썼으나(= `source_platform` 값 `book_dash`와 철자
    불일치), book-audio는 **`source_platform` 값을 그대로** 접두사로 사용(`book_dash-`, 밑줄 포함)해
    코드-데이터 일치를 확보한다. ⚠️ **팀장 확인 필요 항목**: 향후 커버까지 이 표준으로 통일할지는
    별도 카드로 이연(본 ADR은 book-audio에만 적용, 기존 커버 키 미터치).
  - **대안(기록만)**: `books.id`(PK UUID, 전 플랫폼 전역 유일)로 키하면 접두사 불요·충돌 원천 없음.
    단, Storage 객체명만 보고 어느 플랫폼·책인지 육안 식별이 어렵다. 본 ADR은 정찰 정본
    계승(가독성·커버 컨벤션 정합)을 우선해 `{source_platform}-{source_id}`를 채택.
- **공개/비공개**: 베타에선 covers처럼 **public 버킷** 권장(리더가 바로 재생, 서명 URL 왕복 없음).
  - **사유**: CC-BY 텍스트를 Polly로 읽은 산출물이라 다운로드 방지가 시급하지 않음. closed
    environment(협상용) 요건은 향후 **서명 URL 대응 후속 카드**로 이연.

### 결정 ③ Content-Type / 헤더 정책
- **mp3** → `audio/mpeg` (charset 없음)
- **marks.json** → `application/json; charset=utf-8`
- **공통 캐시** → `Cache-Control: public, max-age=31536000, immutable` (정적 파일, 장기 캐시).
- ⚠️ **업로드 시 확장자 자동추측에 의존하지 말 것.** 업로드 스크립트에서 `contentType`을 **명시
  지정**한다(book-covers 업로드가 `{"content-type":"image/webp"}`를 명시한 것과 동일 방향 —
  `step3_upload.py:100`). 백로그의 Storage charset 헤더 트랙과 방향 일치.

---

## 4. 원본 보존 · 라이선스 (불변 규율 확인)
- 본 ADR은 **읽기전용 정찰 + 문서**까지다. 코드·스키마·DB·Storage 변경 0.
- 오디오는 CC-BY 4.0 텍스트를 TTS로 낭독한 **2차 산출물**로, 원본 텍스트·`attribution_text`
  (Hard Rule 1 NOT NULL)·`license`·`original_url` 어디에도 영향 없음. 어트리뷰션 의무 변동 0.
- 스키마 변경(결정 ①)은 **컬럼/테이블 추가**로 기존 제약·트리거(`enforce_commercial_license`)
  미접촉.

---

## 5. 다음 단계
- [x] **(1) 스키마 생성** — `book_audio` 테이블 + `books.has_audio` 컬럼 생성 **완료**
  (2026-07-04 팀장 SQL Editor 직접 실행·성공. 결정 ① 「실제 실행된 SQL」).
- [ ] **(2) 39권 배치 생성** — `Ruth · rate 78 · natural`로 배치 TTS 생성(파일럿 스크립트 확장).
- [ ] **(3) Storage 업로드** — `book-audio` 버킷에 `{book_key}/pNN.mp3` + `pNN.marks.json` 업로드
  (contentType 명시, DB write 0건 — `step3_upload.py` 패턴 계승).
- [ ] **(4) DB 연결** — `book_audio` INSERT SQL을 워커가 산출, 팀장이 SQL Editor에서 실행.
  오디오 적재된 책은 `books.has_audio = true` 반영.
- [ ] **(5) 뷰어 통합** — 뷰어 `AsbReader`에 오디오 재생·word 하이라이트 통합(ADR-0017 결합점).

---

## 6. Consequences
- 페이지 단위 오디오가 정규화된 테이블로 적재돼 멀티보이스·부분 재생성에 유연(UNIQUE에 voice 포함).
- `has_audio` 플래그로 "오디오 있는 책" 카탈로그 필터가 조인 없이 캐시 정합적으로 처리됨.
- book-audio 키가 `(source_platform, source_id)` 정본을 계승해 교차 플랫폼 충돌 없음. 단 커버와
  접두사 철자 표준(`book_dash-` vs `bookdash-`)이 갈리므로, 향후 통일 여부는 후속 카드로 남김.
- 헤더 명시 지정으로 Storage charset/캐시 이슈를 업로드 시점에 원천 차단.
