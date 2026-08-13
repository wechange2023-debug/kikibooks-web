# ADR-0057: 페이지 이미지 URL을 `book_text`에 직접 저장한다 (A-1안)

## Status

**Accepted** (2026-08-13, 팀장 승인) / 기준 HEAD `f51ccef` · 제안 커밋 `82ee0d7`

DDL 실행·백필 SQL·코드 수정은 **본 승인 이후 별도 작업지시서**에서 수행한다.
근거가 되는 **읽기 전용 정찰은 2026-08-13에 완료**됐으며, 본 문서의 파일:행 인용은 전부 그 실측이다.

**2026-08-13 승인 시 확정 사항 2건** — 검토 회신으로 결정됐으며 결정문 본문은 무변경이다.

1. **D5-① 대상 191권 확정**(152권 검수 코호트 포함 승인). 결정문 기재와 동일하다.
2. **O-1(절대 URL 통일) 확정** → Open questions에서 **§Resolved R-1**로 이동.

ADR-0056 D14가 "**잠정 조치**"로 유보하고 O-d가 "**ASb·Bloom 적재 시 재검토 필요**"로 넘긴
**안건 3(이미지 URL 방식 · A-1안)** 을 본 ADR이 확정한다.

## Deciders

팀장, 오케스트레이터

## 관련 문서

- **직접 개정 대상**: `docs/adr/0056-asb-native-book-text-load.md` **D14**(현행 조립 유지 — 잠정 조치)
  → 본 ADR D2로 대체된다. **O-d**(`Slide.imageUrl` non-null 결손 표현) → 본 ADR D3로 해소된다.
- ADR-0046 **D3**(`blocks` = 검수 원본 블록 / `text` = 낭독 확정본) · **D4**(`blocks` 내 `speaker`
  예약) · **D5**(스키마 변경은 `supabase/migrations/` 파일로 일원화)
- ADR-0052 **D4**(오디오 리더와 검수 화면의 이미지·텍스트 출처 동일 — 불일치 방지 불변식)
- ADR-0056 **D4**(원천 매니페스트 경로 · 파서 1:1 일치 의무) · **D2/D11**(`page_index` 0-based)
- ADR-0053 **E9**(실행 판정은 화면 표시·파일 주석이 아니라 실측 결과로만 확정)
- ADR-0049 D1(152권 페이지 이미지 출처) · ADR-0036 D2·Amd#1(`book-images` 키 규약)
- ADR-0025 Amd#6(ASb 페이지 구성·짝짓기 A2·A3·A4) · ADR-0028 Amd#4(Bloom 본문 텍스트 레이어)
- ADR-0051 D1·D2(검수 상세 2단 화면) — D4의 영향 표면
- 구현 참조: `lib/book/audio-manifest.ts` · `components/admin/review/review-detail-view.tsx` ·
  `lib/book/asb-parser.ts` · `components/book/audio-reader.tsx` ·
  `scripts/text_harvest/dryrun_asb_bloom.py` · `scripts/tts_pilot/gen_book_text_sql_v2.py`

---

## Context

### 1. 증상 — ASb/Bloom 오디오 리더에서 본문 이미지가 전부 뜨지 않는다

`lib/book/audio-manifest.ts:289`가 **플랫폼과 무관하게** `book_dash-` 접두사를 붙여 이미지 URL을
조립한다.

```ts
const slug = book.source_id;                                       // :275
const nn   = String(pageIndex + 1).padStart(2, '0');               // :282
imageUrl: `${imageBase}/${IMAGE_STORAGE_PREFIX}/book_dash-${slug}/${nn}.jpg`   // :289
```

`getAudioReaderBook`이 `books`에서 읽는 컬럼은 `id, title, source_id, cover_url` 4개뿐이며
(`:218`), **`source_platform`은 조회조차 하지 않는다.** ASb·Bloom 책도 `book_dash-{source_id}/…`
키로 조립되어 전 면이 404가 된다.

이 결함은 ADR-0056 D14 말미(`:762-764`)에 이미 기재돼 있었다.

> 참고(범위 밖): `audio-manifest.ts:289`의 `book_dash-` 접두사는 **하드코딩**이라 타 플랫폼
> (ASb·Bloom·GDL)에서는 조용히 404를 만든다. … 타 플랫폼 대응은 안건 3 소관이다.

### 2. **접두사만 고쳐서는 해결되지 않는다** — 이미지가 버킷에 없다

정찰의 핵심 발견이다. ASb·Bloom 본문 이미지는 `book-images` 버킷에 **객체가 존재하지 않는다.**
외부 CDN에 있으며, 그 URL은 **매니페스트 `.txt`의 `images:` 섹션 안에만** 있다.

| 코호트 | 본문 이미지 실소재 | 근거 |
|---|---|---|
| african_storybook | `https://africanstorybook.org/` + 상대경로 | `lib/book/asb-parser.ts:21,44-51` |
| bloom | `https://s3.amazonaws.com/bloomharvest/{email}%2f{bid}%2fbloomdigital%2f` + 파일명 | `scripts/sync_bloom.py:368` · `:443` |
| book_dash (152권·39권) | `book-images/book_dash-{source_id}/{NN}.jpg` (자체 Storage) | `scripts/pdf_harvest/upload_page_images.py:9` · `scripts/copy_bookdash_images.py:14` |

즉 **접두사를 플랫폼별로 분기하는 방식(가칭 A-2안)은 애초에 성립하지 않는다.** ASb·Bloom은
버킷에 넣을 객체 자체가 없고, 그 URL을 알아내려면 매니페스트를 파싱해야 한다.

현행 `asb_native` 뷰어는 이 문제를 **렌더 시점 fetch**로 우회하고 있다 —
`components/book/asb-reader.tsx:79-82`가 `parseAsbText()` 결과의 `imageUrl`을 직접 `<img>`에 싣는다.
오디오 리더는 그 경로를 타지 않으므로 혜택을 받지 못한다.

### 3. 표지만 정상 표시되는 이유

`audio-manifest.ts:300`의 표지 슬라이드는 조립하지 않고 `books.cover_url` **원본을 그대로** 쓴다.
따라서 ASb·Bloom도 **표지 1장은 뜨고 본문 면만 전부 빈 칸**이 된다. 사용자가 보고한 증상과
정확히 일치한다.

### 4. 실패가 조용하다

`ReaderAudioPage.imageUrl`(`audio-manifest.ts:39`)과 `Slide.imageUrl`
(`components/book/audio-reader.tsx:311`)이 **둘 다 `string`(non-null)** 이다. 조립 함수가 항상
문자열을 반환하므로 "이미지 없음"을 표현할 방법 자체가 없다.

결손 시 동작: `<img onError>`(`audio-reader.tsx:183`) → `phase='failed'` → `return null`(`:167-169`).
**런타임 에러 없이 해당 칸만 빈 렌더**이며 폴백이 없다. ADR-0056 O-d(`:1032-1047`)가 지적한
그대로다.

### 5. 데이터 흐름 (현행)

```
[DB] books (id, title, source_id, cover_url)              audio-manifest.ts:216-225
[DB] book_text (page_index, text) ORDER BY page_index     audio-manifest.ts:234-239
[DB] book_audio (kind, page_index, audio_path, marks_path) audio-manifest.ts:248-260
      │
      ▼  getAudioReaderBook()                              audio-manifest.ts:210
   imageUrl = 문자열 조립 (Storage 조회 0건)                :289   ★ 존재 확인 단계 없음
      │
      ▼  app/(reader)/book/[id]/read/page.tsx:158-186
      ▼  components/book/audio-reader.tsx:331-354 → PageImage :890 → <img> :178
```

**이미지 존재 여부를 확인하는 단계가 파이프라인 어디에도 없다.** `book_text` 행 수가 곧 면 수이고,
이미지 URL은 그 인덱스로부터 무조건 파생된다.

### 6. 현행 `book_text` 스키마 — 이미지 컬럼이 없다

`supabase/migrations/006_review_data_model.sql:13-22` + `007_book_text_source_default.sql:13`.
**008 이후 마이그레이션은 존재하지 않는다**(실측: `supabase/migrations/` 001~007 7개).

```sql
create table if not exists public.book_text (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.books(id) on delete cascade,
  page_index   int  not null check (page_index >= 0),   -- 0-based
  text         text not null default '',
  blocks       jsonb,
  source       text not null default 'pdf_harvest_v1',  -- 007에서 default 제거
  updated_at   timestamptz not null default now(),
  unique (book_id, page_index)
);
```

### 7. 적재 현황과 백필 대상 규모 (산정값 — D5 게이트로 실측 확정)

| 코호트 | 권수 | 이미지 소재 | 근거 |
|---|---:|---|---|
| book_dash `asb_native` (검수 152권) | 152 | 자체 Storage (`source_id` = **slug**) | ADR-0047·0048 · `upload_page_images.py:9-10` |
| book_dash `html` (정예 39권) | 39 | 자체 Storage (`source_id` = **UUID**) | ADR-0056 D9·D14 · `copy_bookdash_images.py:14` |
| african_storybook `asb_native` | 527 | 외부 CDN (매니페스트) | ADR-0056 §Context 3·6 |
| bloom `asb_native` | 142 | 외부 CDN (매니페스트) | ADR-0056 §Context 3·6 |
| **합계** | **860** | | |

- 검산: 152 + 39 = **191**(자체 Storage 계열) · 527 + 142 = **669**(외부 CDN 계열) · 191 + 669 = **860** ✅
- **708권의 정확한 구성**: `african_storybook 527 · bloom 142 · book_dash 39`
  (`scripts/tts_pilot/upload_tts_full708.py:11` 실측 인용). **708은 book_dash 단일 플랫폼이 아니다.**
- 위 860은 두 ADR의 기재치를 합산한 **산정값**이다. **D5의 완료 판정은 실측 COUNT로만 한다**
  (ADR-0053 E9).

> **[작업지시서 수치 정정]** 지시서 D5 단계1은 대상을 "book_dash 708권"으로 기재했으나,
> 708권 중 book_dash는 **39권**뿐이다(위 실측). 자체 Storage 키 규약을 따르는 book_dash 계열은
> **152 + 39 = 191권**이며, 본 ADR D5-①은 이 191권을 대상으로 한다. **152권을 빠뜨리면 관리자
> 검수 상세 화면(D4 전환 대상)이 그대로 깨진다.**

---

## Decision

### D1. `book_text`에 `image_url text NULL` 컬럼을 신설한다

```sql
ALTER TABLE public.book_text ADD COLUMN image_url text;
```

- **NULL 허용**이 본질이다. "이미지가 없는 면"은 오류가 아니라 **정상 상태**다
  (ADR-0025 Amd#6 A3 — 텍스트만 있는 면 허용, ASb에서 실제로 발생).
- **실행 주체**: 팀장(Supabase SQL Editor). 워커는 DB에 접근하지 않는다.
- **원복**: `ALTER TABLE public.book_text DROP COLUMN image_url;` — 기존 컬럼 무접촉이라
  롤백 비용이 낮다.

#### D1-a. `blocks`(jsonb) 재활용안은 **기각**한다

- `blocks`는 현재 앱 코드에서 **읽기·쓰기 0건**이고(정찰 전수 확인), 적재 스크립트도
  `NULL::jsonb`를 넣는다(`scripts/tts_pilot/gen_book_text_sql_v2.py:225-226`). 표면적으로는
  빈 컬럼이라 재활용 유혹이 있다.
- **그러나 예약된 용도가 명시돼 있다.**
  - ADR-0046 **D3**: "검수 화면(Phase C)이 SFX/대사 재분류를 하려면 `blocks[].role`·`bbox`·`size`가
    남아 있어야 한다" — `blocks` = **검수 원본 블록**, `text` = 낭독 확정본.
  - ADR-0046 **D4**: "`blocks JSONB` 내 `speaker` 키를 **예약어로 선언만** 하고, 실제 저장소는
    Phase E에서 필요성이 실증되면 별도 ADR로 신설한다."
- 이미지 URL은 검수 원본 블록도 화자 매핑도 아니다. **한 컬럼에 성격이 다른 두 계약을 얹으면
  Phase C·E 착수 시점에 반드시 충돌한다.** 별도 컬럼 1개의 비용이 그 충돌보다 싸다.
- 부수 사유: `image_url`을 최상위 컬럼으로 두면 백필 UPDATE·검증 COUNT가 평이한 SQL이 된다.
  jsonb 경로 표현식은 팀장 SQL Editor 실행 절차를 불필요하게 어렵게 만든다.

#### D1-b. DDL 정본은 마이그레이션 파일이다

- ADR-0046 **D5**는 "스키마 변경 실행 경로를 `supabase/migrations/` 파일로 일원화"하고
  "ADR 본문에 DDL을 **중복 기재하지 않고** 경로만 참조한다(중복은 반드시 어긋난다)"를 규정한다.
- **정본 파일 = `supabase/migrations/008_book_text_image_url.sql`** (2026-08-13 신설 완료).
  팀장은 그 파일 내용을 SQL Editor에 붙여 실행한다. 위 DDL 인용은 결정 내용을 읽기 위한 것이며,
  **실행 정본은 008 파일**이다. 두 기재가 어긋나면 008 파일이 우선한다.
- 008은 `book_text`에 **컬럼 1개를 추가할 뿐** 기존 컬럼·제약·트리거·RLS 정책에 접촉하지 않는다
  (006 §2.5 `book_text_touch_updated_at` · §3.1 SELECT 정책 무변경).

### D2. 전 플랫폼 **완성된 절대 URL**을 저장하고, 런타임 조립을 전면 제거한다

- `image_url`에는 **그대로 `<img src>`에 넣을 수 있는 절대 URL**을 넣는다. 접두사·확장자·자릿수
  같은 조립 규칙을 런타임에 남기지 않는다.

| 플랫폼 | 저장할 값 | 산출 방법 |
|---|---|---|
| `book_dash` (152 + 39) | `{SUPABASE_URL}/storage/v1/object/public/book-images/book_dash-{source_id}/{NN}.jpg` | 결정적 키 패턴을 **사전 계산**해 저장 (`NN` = `page_index + 1`, 2자리 zero-pad) |
| `african_storybook` | 매니페스트 `images:` 섹션의 `africanstorybook.org` 절대 URL | 매니페스트 파싱 |
| `bloom` | 매니페스트 `images:` 섹션의 `s3.amazonaws.com/bloomharvest` 절대 URL | 매니페스트 파싱 |

- **제거 대상 2곳** — 이 두 지점이 전 코드의 조립 지점 전부다(정찰 전수 검색 확인).
  - `lib/book/audio-manifest.ts:289` (+ 불필요해지는 `:275` `slug` · `:282` `nn` · `:29` `IMAGE_STORAGE_PREFIX`)
  - `components/admin/review/review-detail-view.tsx:97` (`buildPageImageUrl` 함수 전체 `:90-98`)
- **조립을 남긴 채 컬럼만 추가하는 절충안을 채택하지 않는다.** 두 진실이 공존하면 어느 쪽이
  화면에 뜨는지 코드를 읽어야만 알 수 있고, 이는 ADR-0056 §5-c의 교훈("합이 맞는 잘못된 배분")과
  같은 부류의 진단 불가 상태를 만든다.
- **`books.source_id`의 이중 의미가 여기서 해소된다.** 152권은 `source_id = slug`,
  39권은 `source_id = UUID`, ASb·Bloom은 또 다른 체계다. URL을 사전 계산해 저장하면 런타임이
  이 차이를 알 필요가 없어진다.

### D3. `imageUrl` 타입을 `string | null`로 전환하고 폴백을 렌더한다

- **ADR-0056 O-d 권고의 이행이다.**
- 타입 전환 2곳:
  - `ReaderAudioPage.imageUrl` (`lib/book/audio-manifest.ts:39`) → `string | null`
  - `Slide.imageUrl` (`components/book/audio-reader.tsx:311`) → `string | null`
- **`null`일 때 빈 칸으로 두지 않는다.** 현행은 `onError` → `return null`(`audio-reader.tsx:167-169`)로
  아무것도 남기지 않아 "이미지가 없는 면"과 "URL이 틀린 면"이 화면상 구분되지 않는다.
  **텍스트 전용 면임을 명시하는 폴백을 렌더**해 결손이 눈에 보이게 한다.
- 폴백의 시각 규격은 구현 시 `docs/design-system.md` semantic 토큰으로만 구성한다(Hard Rule 10).
  구체 디자인은 본 ADR이 정하지 않는다.
- **조용한 실패 금지가 본 결정의 목적**이다. 이번 결함이 4개월간 발견되지 않은 직접 원인이
  "404가 에러가 아니라 빈 화면"이었다.

### D4. 리더·검수 동일 출처 불변식(ADR-0052 D4)을 유지한다

- 두 화면 모두 **`book_text.image_url` 단일 출처**로 전환한다. 어느 한쪽만 옮기면 불변식이 깨진다.
- 이 불변식은 코드 주석에 이미 박제돼 있다(`lib/book/audio-manifest.ts:11-13`).

  > 이미지·텍스트 출처는 검수 화면과 동일하다(불일치 방지, ADR-0052 D4)

- **`buildPageImageUrl`(`review-detail-view.tsx:90-98`)은 폐기한다.** 이 함수는 module-private이며
  export되지 않아 재사용처가 0건이다 — 폐기 시 회귀 표면이 없다.
- 검수 화면은 `ReviewPage`에 `imageUrl`을 실어 받는다(D3와 동일하게 nullable).

### D5. 백필은 2단계로 나누고, 완료 판정은 실측 COUNT로만 한다

#### D5-①. book_dash 191권 — **순수 SQL UPDATE** (스크립트 불요)

- 대상: `source_platform='book_dash'` AND `book_text` 보유 = **152권 + 39권 = 191권**.
- 키가 `page_index`로부터 결정적으로 파생되므로 **UPDATE 한 문장**으로 끝난다. 두 코호트가
  `source_id` 체계는 다르지만(slug / UUID) **키 규약은 `book_dash-{source_id}`로 동일**하므로
  분기가 필요 없다.
- 실행 주체: 팀장(SQL Editor). 워커 산출물 0건.
- ⚠ **`{SUPABASE_URL}` 리터럴이 DB 행에 박힌다.** 프로젝트 URL이 바뀌면 전 행 재백필이 필요하다
  → **O-1**.

#### D5-②. ASb·Bloom 669권 — 매니페스트 파싱 → UPDATE SQL 생성 스크립트

- 원천 경로(ADR-0056 D4 표):
  - african_storybook: `https://raw.githubusercontent.com/global-asp/asp-raw-db/master/data/{source_id}.txt`
  - bloom: `{supabase}/storage/v1/object/public/book-manifests/bloom-{source_id}.txt`
- **파서를 새로 쓰지 않는다.** `scripts/text_harvest/dryrun_asb_bloom.py`의 `parse_asb_text()`가
  이미 `(texts, images, p_numbers)`를 반환하며(`:190`), `lib/book/asb-parser.ts`와 1:1 대조 주석을
  달고 669권 전수 실행 검증을 마쳤다. **ADR-0056 D4의 "파서 규칙 임의 개선 금지"가 그대로 적용된다.**
- 짝짓기 축은 ADR-0025 Amd#6 A2를 따른다 — `images[i]` ↔ `page_index = i`. 강제 1:1·번호 정렬
  금지(A4)를 유지한다.
- **`images`가 `texts`보다 짧은 면은 `image_url`을 NULL로 둔다.** ASb는 `axis_diff ≠ 0`인 권이
  다수 존재한다(ADR-0056 §Context 3 기재: ASb 496권) → **O-2**.

#### D5-③. **기존 적재 스크립트는 재사용할 수 없다**

- `scripts/tts_pilot/gen_book_text_sql_v2.py`는 `ON CONFLICT (book_id, page_index) DO NOTHING`
  (`:232`)이라 **재실행해도 기존 행을 갱신하지 않는다.** 5컬럼 고정 INSERT(`:225-226`)이기도 하다.
- 따라서 D5-②는 **INSERT가 아닌 별도 UPDATE 경로**로 신규 작성한다. 기존 스크립트는 무수정 보존한다
  (708권 적재 이력의 재현 근거).

#### D5-④. 완료 판정 게이트 — **실측 COUNT 쿼리로만 확정한다 (ADR-0053 E9)**

- 아래를 팀장이 SQL Editor에서 **실행하고 그 결과를 근거로** 판정한다. 파일 안의 기대값 주석,
  스크립트가 출력한 계획 건수, 문서 산정값은 **판정 근거가 아니다.**

| # | 확인 항목 | 기대 |
|---|---|---|
| (a) | `book_text` 전체 행수 · distinct `book_id` | 백필 전후 **불변**(UPDATE이므로 행 증감 0) |
| (b) | `image_url IS NOT NULL` 행수 — 플랫폼별 | book_dash 191권분 전량 · ASb·Bloom은 (c) 제외분 |
| (c) | `image_url IS NULL` 행수 — 플랫폼·권별 | ASb `axis_diff` 결손분과 **일치**해야 한다(O-2) |
| (d) | `image_url NOT LIKE 'http%'` 행수 | **0** (절대 URL 불변식) |
| (e) | book_dash 표본 URL과 `book-images` 실객체 대조 | 표본 전량 로드 |

- (c)가 예상과 어긋나면 **파싱 축이 틀린 것**이므로 즉시 STOP한다. 총계만 맞고 배분이 틀린 상태를
  통과시키지 않는다(ADR-0056 §5-c).

---

## 코드 갱신 지점 (구현 시 필수 확인 4곳)

> **[예상 외]** `types/database.ts` 류의 **생성 DB 타입 파일이 없다**(glob 0건). `book_text` 행
> 타입이 각 쿼리의 `.returns<>()` 제네릭과 수기 인터페이스로 **4곳에 분산**돼 있어, 컬럼 추가 시
> 한 곳만 고치면 타입 체커가 잡아주지 않는다.

| # | 파일:행 | 내용 | 필요 변경 |
|---|---|---|---|
| 1 | `lib/book/audio-manifest.ts:239` | `.returns<{ page_index: number; text: string \| null }[]>()` | `image_url: string \| null` 추가 + SELECT 목록(`:236`)에 컬럼 추가 |
| 2 | `lib/admin/review/query.ts:201` | `.returns<{ page_index: number; text: string }[]>()` | 동일 |
| 3 | `lib/book/audio-manifest.ts:33-46` | `interface ReaderAudioPage` | `imageUrl: string \| null` (D3) |
| 4 | `lib/admin/review/query.ts:74-78` | `interface ReviewPage` | `imageUrl: string \| null` 신설 |

부수 갱신: `components/book/audio-reader.tsx:311`(`Slide.imageUrl`), `:347`(slides 매핑),
`:890`(`PageImage` 호출부) · `components/admin/review/review-detail-view.tsx:90-98`(함수 폐기).

## 영향 화면 (2곳)

| 화면 | 경로 | 변화 |
|---|---|---|
| 오디오 리더 | `app/(reader)/book/[id]/read/page.tsx:158-186` → `components/book/audio-reader.tsx` | ASb·Bloom **669권의 본문 이미지가 처음으로 표시된다.** book_dash 191권은 무변화(같은 URL) |
| 관리자 검수 상세 | `app/admin/review/[bookId]/page.tsx:55` → `components/admin/review/review-detail-view.tsx` | 이미지 출처가 조립 → DB로 전환. 화면 결과는 무변화(같은 URL) |

- **회귀 위험이 낮은 이유**: book_dash 191권은 백필 값이 현행 조립 결과와 **문자열 수준으로 동일**하다
  (ADR-0056 D14의 6축 대조표가 조립식 ↔ 업로드 키 일치를 이미 확증했다). 실제 변화는 ASb·Bloom
  669권이 **빈 칸 → 이미지**로 바뀌는 것뿐이다.
- 표지 슬라이드(`audio-manifest.ts:297-305`)는 `books.cover_url`을 쓰므로 **본 ADR의 대상이 아니다.**

## 후속 트랙 연결

1. **관리자 TTS 버튼** — ADR-0051(검수 화면)·ADR-0053(TTS 확장) 개정 안건. 본 ADR과 독립이나
   같은 두 화면을 건드리므로 **구현 순서를 조율**해야 한다. 본 ADR을 먼저 넣는 편이 낫다 —
   검수 화면의 이미지 출처가 확정된 뒤라야 TTS 버튼의 검증 화면이 신뢰 가능해진다.
2. **`book_review` 미시드 708권** — ADR-0056 **O5**(2026-08-10 실사용 발현). 신규 708권이 검수 목록에
   나타나지 않아 D9-b 육안 검증을 대체 절차로 수행했다. 본 ADR D5-④(e)의 표본 대조도 같은 제약을
   받으므로, O5 해소가 선행되면 검증 절차가 단순해진다.
3. **Book Dash 78권 처리** — "Book Dash 78권"은 **코드 외부의 기획 코호트**다
   (2026-07-30 세션 확정, 인수인계 기록 소재). 구성: **HTML 세로스크롤 54 + 회전 페이지 18 +
   메타데이터 오염 6 = 78**. 분류 축이 코드·DB 상태가 아니라 기획 판정이므로 **리포지토리에
   근거 문자열이 없는 것이 정상이다**(2026-08-13 정찰: `78권` 0건 확인). **본 ADR의 범위 밖**이다.
   아래 표는 코드·DB에서 실측되는 book_dash 잔여 집합으로 **모집단이 다른 별개 분류**이며,
   **참고용으로만 유지**한다.

   | 집합 | 권수 | 근거 |
   |---:|---:|---|
   | `asb_native` 155권 중 `book_text` 미보유 | 3 (=155−152) | ADR-0056 §Context 5 팀장 실측 |
   | `html` 비활성 10권(오디오 보유, 적재 제외) | 10 | ADR-0056 D9 · O-a |
   | `html` 블랙리스트 15권 | 15 | `lib/shared/blacklist.ts` · ADR-0056 §5-e |
   | 152권 중 오디오 미보유 | 24 (=152−128) | 128 = pilot12 12 + fullbatch 116 |

   위 4개 집합은 78권 코호트와 **직접 대응하지 않는다.** 두 축을 섞어 산정하지 않도록 주의한다
   (ADR-0056 §5-c — 서로 독립인 축에서 배분을 역산하지 않는다).

---

## Consequences

### 얻는 것

- **ASb·Bloom 669권이 오디오 리더에서 정상 작동한다.** 현재는 표지 1장만 뜨고 본문 전 면이 빈 칸이다.
- **플랫폼 분기가 코드에서 사라진다.** `source_platform`을 읽지 않고도 전 코호트가 동작한다.
  GDL 등 향후 코호트도 "적재 시 URL을 넣는다"는 같은 규칙 하나로 흡수된다.
- **결손이 눈에 보인다.** D3의 폴백으로 "이미지 없는 면"과 "URL이 틀린 면"이 화면에서 구분된다.
- **ADR-0056의 미결 2건(D14 잠정 · O-d)이 동시에 닫힌다.**

### 잃는 것 · 감수하는 것

- **`book_text` 행이 URL 문자열을 보유하게 된다.** 원본 CDN이 URL 체계를 바꾸면 재백필이 필요하다.
  현행(런타임 fetch)은 자동 추종하지만, 그 대가가 지금의 조용한 404다.
- **Storage 키 마이그레이션이 DB 갱신을 동반한다.** 종전에는 코드 1줄이었다.
- **백필이 끝나기 전까지 화면이 비어 보이는 구간이 생긴다** — D5(백필) 완료를 D2·D3(코드 전환)
  배포의 **선행 조건**으로 둔다. 순서가 뒤집히면 book_dash 191권까지 빈 칸이 된다.
- ASb·Bloom은 이미지가 **외부 CDN 직링크**로 남는다. 가용성·성능이 외부에 의존하며, 자체 Storage
  이전은 본 ADR의 범위가 아니다(별도 안건).

### 되돌리기

- 코드: D2·D3 커밋 revert. 조립 로직 2곳이 되살아나면 현행 동작으로 복귀한다.
- DB: `ALTER TABLE public.book_text DROP COLUMN image_url;` — 기존 컬럼·행 무접촉이라 데이터 손실 0.
- 백필은 UPDATE이므로 **행 증감이 없다**(D5-④(a) 게이트가 이를 확인한다).

---

## Non-goals (본 ADR이 정하지 않는 것)

- 표지 이미지 처리 — `books.cover_url` 경로는 무접촉.
- ASb·Bloom 이미지의 자체 Storage 이전.
- `asb_native` 뷰어(`components/book/asb-reader.tsx`)의 렌더 시점 fetch 방식 — 무변경.
- D3 폴백의 구체 시각 디자인.
- `book_review` 시드(ADR-0056 O5) · 관리자 TTS 버튼.

## Resolved

### R-1 (구 O-1). `{SUPABASE_URL}` 리터럴이 DB에 박히는 문제 — ✅ **Resolved (2026-08-13 팀장 승인)**

> **절대 URL 통일 유지로 확정한다.** 프로젝트 URL이 바뀌면 **UPDATE 1문으로 재백필**한다.

아래는 확정 전 기재분이다(이력 보존).

- D5-①이 저장하는 book_dash 191권분 URL에는 프로젝트 URL이 포함된다. 프로젝트 이전 시 전 행
  재백필이 필요하다.
- **대안**: 상대 키(`book_dash-{source_id}/{NN}.jpg`)만 저장하고 런타임에 base를 붙이는 방식.
  그러나 이는 D2의 "완성된 절대 URL" 원칙을 깨고, ASb·Bloom(외부 절대 URL)과 축이 갈린다.
- **판단 근거**: 프로젝트 URL 변경은 실무상 드물고, 발생 시 UPDATE 1문으로 해소된다. 반면 상대
  키 방식은 D2의 "런타임 조립 전면 제거"를 되돌려 book_dash만 조립 코드를 남기게 된다.

## Open questions

### O-2. ASb `axis_diff ≠ 0` 권들의 NULL 면 UX — 비차단, D3와 연동

- ADR-0056 §Context 3 기재: ASb는 `axis_match = False`가 **496권**이며 분포는 `-1`이 433권으로
  지배적이다(텍스트가 이미지보다 1면 많음). Bloom은 142권 전량 일치.
- 즉 **ASb 다수 권에서 마지막 면 부근에 `image_url IS NULL`이 정상적으로 발생한다.** D3 폴백이
  이 면에서 어떻게 보이는지가 실사용 품질을 좌우한다.
- ADR-0056 **O1**(ASb 94권 텍스트↔이미지 짝 정합)과 겹친다 — 짝이 한 칸씩 밀려 있는지 여부는
  본 ADR로 판정되지 않는다. D5-④(c) 게이트가 **결손 위치의 분포**를 드러내므로, 그 결과를 O1
  판정의 입력으로 쓸 것을 권고한다.

### O-3. GDL 코호트 대응 — **이번 범위 제외**

- GDL은 `content_type='html'` iframe 경로이며 `book_text`가 0행이라 오디오 리더 대상이 아니다.
  따라서 현 시점에 결손이 발현하지 않는다.
- 향후 GDL을 `book_text` 적재 대상에 넣을 경우 **본 ADR D2가 그대로 적용된다**(적재 시 절대 URL
  기입). 별도 결정이 필요 없다는 점만 기록하고, 대상 편입 여부는 본 ADR이 정하지 않는다.

### O-4. `book-images` 39권 객체 수 문서 불일치 — 비차단, 참고

- `docs/adr/0049-book-page-image-source.md:9`는 "**39권 / 518객체**"로 적고, ADR-0056 §5-g가 인용한
  `ADR-0036 Amd#1:128`은 "**508객체**"로 적는다. 10객체 차이의 원인은 미확인이다.
- 본 ADR의 결정에는 영향이 없다(D5-④(e)가 실객체 대조로 판정한다). **문서 정합 트랙으로 이연**한다.

---

*ADR-0057 끝. 본 문서는 **Accepted**(2026-08-13)이며, DDL 정본은
`supabase/migrations/008_book_text_image_url.sql`이다(D1-b). 다음 단계는 008 실행(팀장) →
D5 백필 → D2·D3 코드 전환 순이다 — 백필 완료가 코드 전환 배포의 선행 조건이다(§Consequences).*
