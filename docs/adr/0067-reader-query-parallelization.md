# ADR-0067: 읽기 경로의 중복 조회를 없애고 독립 쿼리를 병렬로 돌린다

## Status

**Accepted** (2026-08-22, 비기 검수 통과) / 최초 제안 2026-08-22 (Proposed) / 기준 HEAD `ee1a5cf` (`main`)

결정 5건(D1~D5)은 **P-1 진단(`docs/ops/perf-p1-diagnosis.md`)의 실측만을 근거**로 하며,
2026-08-22 **비기 검수를 통과해 Accepted로 전환**했다. 구현은 지시서 P-1b에서 수행한다.

## Deciders

팀장(키키) · 오케스트레이터(비기) · 워커(Claude Code)

## Related

- **ADR-0066** — 함수 실행 지역 `icn1`. 왕복 **1회의 거리**를 줄였다. 본 ADR은 왕복 **횟수**를 줄인다
- `docs/ops/perf-p1-diagnosis.md` ① — 본 ADR의 유일한 수치 근거
- **ADR-0033** — 공용 카탈로그 캐싱(`unstable_cache`). D1이 이 캐시의 산출물을 재사용한다
- **ADR-0034 (d)** — `book_audio` RLS가 anon/authenticated 공개읽기. D1의 등가성 근거
- **ADR-0052 Phase D·F** — 오디오 리더 분기. D1·D2가 그 게이트를 건드린다
- **ADR-0064 D1·D4** — 자녀 0명 처리. D3이 이 분기를 보존해야 한다
- **ADR-0009 3.4절** — 데이터 보호의 최종 방어선은 RLS. D3이 이 원칙에 기대되 **의존하지는 않는다**

## Context

### 1. 남은 비용은 "왕복 횟수"다

ADR-0066으로 배포본 문서 응답이 2,081~3,518 ms → 372~910 ms가 됐다(P-R 3회 중앙값).
남은 것은 화면 하나를 그리는 데 **직렬로 쌓이는 왕복 수**다.

| 화면 | 현재(전형) | 가능 최소 | 파일:라인 |
|---|---|---|---|
| `/` | 4 | 3 | `app/page.tsx:98` → `:150` → `:193` |
| `/library` | 2 | **1** | `library/page.tsx:82` → `:99` |
| `/mypage` | 4 | 3 | `mypage/page.tsx:93` → `:99` → `:127` |
| `/book/{id}` | 3 | 2 | `book/[id]/page.tsx:117` → `:126` → `:163` |
| `/book/{id}/read` | **6** | **2** | `read/page.tsx:144` → `:151` → `:188` → `:214` → `:215`(내부 3단) |

### 2. `/read`가 같은 테이블을 두 번 읽는다

- **`books` 2회** — `read/page.tsx:151` `getBookByIdIncludingInactive`(캐시 경로) +
  `lib/book/audio-manifest.ts:266` `getAudioReaderBook` 내부(service role).
  뒤쪽이 뽑는 컬럼은 `id, title, source_id, cover_url` 넷뿐이고(`:267`),
  **앞쪽이 이미 반환한 `Book`에 전부 들어 있다**(`lib/book/detail.ts:146-148`).
- **`book_audio` 2회** — `read/page.tsx:214` `hasReaderAudio`(→ `audio-manifest.ts:179-186`) +
  `audio-manifest.ts:300` `getAudioReaderBook` 내부.

### 3. 게이트 조건은 이미 손에 들려 있다 (신규 발견)

`hasReaderAudio(bookId)`는 `selectReaderAudioBookIds(client, [bookId], DEFAULT_READER_VOICE)`를
호출할 뿐이다(`audio-manifest.ts:247-252`).

그런데 `Book.hasAudio`(`lib/book/detail.ts:99`)도 **같은 함수·같은 기본 voice**로 산출된다
(`detail.ts:170` · `:249` — `selectReaderAudioBookIds(supabase, [id])`).
클라이언트만 다른데(publishable ↔ service role), `detail.ts:167-169`가 그 등가성을 명시한다 —
*"`book_audio` RLS가 anon/authenticated SELECT 공개읽기(ADR-0034 (d))라 service role 없이도 같은 답이다."*

→ **`read/page.tsx:214`의 왕복 1회는 `book.hasAudio`로 대체 가능하다.** P-1이 예상한 것보다 한 걸음 더
줄어든다.

### 4. `getAudioReaderBook` 내부가 순차 3왕복이다

`audio-manifest.ts:266`(`books`) → `:284`(`book_text`) → `:300`(`book_audio`).
세 쿼리 모두 `bookId` 하나만 필터로 쓰며 **서로의 결과를 인자로 받지 않는다**(호출 인자 기준 확인).

### 5. `getActiveChild`가 `getUser`를 기다린다 — RLS와 중복이다

`lib/home/active-child.ts:55`의 `.eq('parent_id', parentId)`가 거르는 범위를 RLS가 이미 강제한다.

| 테이블 | 정책 | 파일:라인 |
|---|---|---|
| `children` | `USING (parent_id = auth.uid())` | `supabase/migrations/001_initial_schema.sql:238-241` |
| `profiles` | `USING (auth.uid() = id)` | `001_initial_schema.sql:221-224` |

즉 이 쿼리는 `user.id` 값이 **결과를 바꾸지 않는다.** 순차인 이유가 값 의존이 아니라 코드 배치다.

### 6. `/library`는 `user`를 쓰지도 않는다

`getBooks(supabase, initialFilters, null)`(`library/page.tsx:100`)는 `user`를 **인자로 받지 않는다.**
`initialFilters`는 `searchParams` 동기 파싱 결과다(`:91-96`). `user`는 `:84-86` 가드에만 쓰인다.

---

## Decision

### D1 — `/read`의 중복 조회를 없앤다: `books` 1회, `book_audio` 1회

**(a) `book_audio`** — `read/page.tsx:214`의 `await hasReaderAudio(book.id)`를 **`book.hasAudio`로 교체**한다.
`getAudioReaderBook`이 내부에서 한 번 더 읽는 것(`audio-manifest.ts:300`)만 남는다.

**(b) `books`** — `getAudioReaderBook`이 자체 `books` 조회(`audio-manifest.ts:266-275`)를 하지 않고,
**이미 읽은 값을 인자로 받는다.**

**시그니처 변경 범위**

| 대상 | 현재 | 변경 후 |
|---|---|---|
| `getAudioReaderBook` | `(bookId: string, opts?: BuildOptions)` | `(book: {id, title, source_id, cover_url}, opts?: BuildOptions)` — 필요한 4필드만 받는 최소 형태 |
| 호출부 | **`app/(reader)/book/[id]/read/page.tsx:215` 1곳뿐** | 같은 1곳 |
| `hasReaderAudio` | `read/page.tsx:214`가 유일 호출부 | **호출 0건이 된다** — 함수 자체는 남길지 지울지 구현 시 판단 |

`selectReaderAudioBookIds`는 **건드리지 않는다.** 배지·상세·인기책·관리자가 함께 쓰는 단일 출처다
(`lib/admin/books/query.ts:275` · `lib/book/detail.ts:170`·`:249` · `lib/landing/popular-books.ts:91`).

**(a)의 대가**: `book.hasAudio`는 `unstable_cache`(revalidate 3600, `detail.ts:253-254`)를 거치므로
**최대 1시간 stale**일 수 있다. 방금 오디오가 붙은 책이 리더에서 최대 1시간 늦게 열린다.
다만 **배지는 이미 같은 값을 쓰고 있어**(`detail.ts:99`), 이 변경은 배지와 게이트의 시차를
**없애는 쪽**이다 — 지금은 배지가 stale인데 게이트만 fresh라 둘이 어긋날 수 있다.

### D2 — `getAudioReaderBook` 내부의 `book_text`·`book_audio`를 병렬로 돌린다

`audio-manifest.ts:284`(`book_text`)와 `:300`(`book_audio`)를 `Promise.all`로 묶는다.
둘 다 `book_id`만 의존하고 서로의 결과를 쓰지 않는다(§4).

D1(b)로 `books` 조회가 사라지므로, **함수 내부 왕복은 3 → 1단(쿼리 2건 병렬)** 이 된다.

**구현 전 확인 의무**: 두 쿼리의 **본문 전량**을 열어 서로의 결과를 참조하지 않는지 확인한다.
본 ADR은 **호출 인자만** 확인했다(P-1 §1-5 D안의 「미확인」 승계).

### D3 — `getActiveChild`를 `auth.getUser()`와 병합한다. **`.eq()` 필터는 유지한다**

대상은 **4화면**이다 — `getActiveChild` 호출 지점 기준.

| 화면 | 현재 위치 | `user` null일 때 현재 동작 | 파일:라인 |
|---|---|---|---|
| `/` | `getUser` **뒤** 단독 await | **redirect 아님** — 비로그인 랜딩을 렌더한다 | `app/page.tsx:150` / null 분기 `:101-146` |
| `/mypage` | `getUser` 뒤 단독 await | `redirect(SIGN_IN_PATH)` | `mypage/page.tsx:99` / `:95-97` |
| `/book/{id}` | `getUser` 뒤 `Promise.all` 안 | `redirect(SIGN_IN_PATH)` | `book/[id]/page.tsx:126-130` / `:119-121` |
| `/read` | `getUser` 뒤 단독 await | `redirect(SIGN_IN_PATH)` | `read/page.tsx:188` / `:146-148` |

> **지시서의 "5화면"을 4화면으로 정정한다.** `/library`는 `getActiveChild`를 호출하지 않는다
> (`library/page.tsx` 전량 확인). `/library`는 D4가 담당한다.

**`.eq('parent_id', parentId)`를 지우지 않는다.** 지우면 RLS 정책이 **유일한 방어선**이 되고,
정책이 바뀌는 날 조용히 남의 자녀가 보인다. 왕복만 겹치고 필터는 그대로 둔다 —
`getUser` 프로미스를 `await` 없이 체인해 `user.id`를 넘기는 형태가 된다.

**`user`가 null일 때의 처리 — 화면별로 다르다**

- **redirect 3화면**(`/mypage`·`/book/{id}`·`/read`): 이미 착수된 `children` 쿼리는 **버린다.**
  rejection이 unhandled로 남지 않게 흡수한다 — `app/page.tsx:157` `void profilePromise.catch(() => undefined)`가
  같은 상황에 쓰는 선례다. RLS가 비로그인 요청에 빈 결과를 주므로 **데이터가 새지 않는다.**
- **`/`**: 비로그인이 **정상 경로**다(랜딩 렌더). 병합하면 랜딩 방문마다 버려지는 `children` 쿼리가
  1건 생긴다. `/`는 공개 최다 트래픽 화면이므로 **비용 방향이 반대일 수 있다.**
  → **`/`는 병합 대상에서 제외한다.** `/`가 얻는 것은 왕복 1회인데, 비로그인 방문 전량에 쿼리 1건을
  얹는다. 로그인 사용자 이득보다 비로그인 부하 증가가 크다고 보고 제외하며, 이 판단을 뒤집으려면
  **비로그인/로그인 트래픽 비율 실측**이 선행돼야 한다(현재 **미확인**).

따라서 D3의 실제 적용 대상은 **`/mypage`·`/book/{id}`·`/read` 3화면**이다.

### D4 — `/library`의 `getBooks`를 `getUser`와 병렬로 돌린다

`library/page.tsx:82`의 `await`를 기다리지 않고 `:99`의 `Promise.all`에 `getUser`를 합류시킨다.
가드(`:84-86`)는 `Promise.all` 결과를 받은 **뒤** 평가한다.

**대가**: 비로그인 요청에도 `getBooks` 쿼리가 1건 나간다. `books`는 전체 공개이므로
(`001_initial_schema.sql:214` `books are viewable by everyone`) **데이터 노출은 늘지 않는다.**
`/library`는 `PROTECTED_PREFIXES`(`lib/auth/routes.ts:16-22`)라 미들웨어가 이미 비로그인을
`/login`으로 보내므로, 이 페이지에 도달하는 비로그인 요청 자체가 **드문 안전망 경로**다.

### D5 — 본 ADR이 손대지 않는 것

아래 셋은 **범위 밖**이다. 각각의 이관처를 남긴다.

| 항목 | 이관처 | 사유 |
|---|---|---|
| **Auth 2중 호출**(P-1 ②) | 별도 ADR 필요 | `getClaims()` 전환은 반환 타입이 `user` → 클레임으로 바뀌어 **전 호출부 시그니처**에 걸린다. 서명키 정책(ES256) 의존도 별도 기록이 필요하다 |
| **폰트 preload 90개**(P-1 ③) | 별도 ADR 필요 | 배포본/로컬 차이의 **직접 원인이 미확인**이다. 원인을 모른 채 `preload: false`를 넣으면 결과를 예측할 수 없다 |
| **이미지 `unoptimized`**(P-1 ④) | 별도 ADR 필요 | (c)(d)안이 Supabase 플랜·DB 스키마에 걸린다(Hard Rule 8 — 스키마 변경은 ADR 선행) |

---

## 영향 범위

아래는 **예상이며 실측이 아니다.** 구현 시 실제로 열어보고 **예상과 다르면 STOP 후 보고**한다.

| 파일 | 예상 변경 | 결정 |
|---|---|---|
| `app/(reader)/book/[id]/read/page.tsx` | `:214` 게이트 교체 · `:215` 인자 변경 · `:188` 병합 | D1·D3 |
| `lib/book/audio-manifest.ts` | `getAudioReaderBook` 시그니처 · 내부 `books` 조회 제거 · 2쿼리 병렬 | D1·D2 |
| `app/(reader)/mypage/page.tsx` | `:93`↔`:99` 병합 | D3 |
| `app/(reader)/book/[id]/page.tsx` | `:117`↔`:126` 병합 | D3 |
| `app/(reader)/library/page.tsx` | `:82`↔`:99` 병합 | D4 |
| `app/page.tsx` | **무변경 예상** (D3 제외 대상) | — |
| `lib/home/active-child.ts` | **무변경 예상** — 시그니처·필터 유지 | 확인하라 |
| `lib/book/detail.ts` | **무변경 예상** — `Book.hasAudio`를 읽기만 한다 | 확인하라 |
| `lib/library/query.ts` | **무변경 예상** | 확인하라 |
| `middleware.ts` · `lib/supabase/*` | **무변경** — D5로 이관 | — |

그 밖의 파일을 수정하게 되면 **사유를 보고에 명시**한다.

---

## 검증 기준

| # | 조건 | 통과 기준 |
|---|---|---|
| **V1** | 회귀 | `pnpm lint` · `pnpm type-check` · `pnpm build` 전 구간 통과 |
| **V2** | 분기 동작 동일 | 5화면 × 4상태 — ① 로그인·자녀 있음 ② 로그인·**자녀 0명**(ADR-0064 D1·D4 — `/`는 랜딩계 블록, `/mypage`는 안내 1장, `/read`는 완독 버튼 미렌더) ③ **비로그인**(`/`는 랜딩, 나머지는 `/login`) ④ **비활성 도서**(`/book/{id}`는 안내 화면, `/read`는 상세로 redirect — ADR-0063 D2·D3). **전부 변경 전과 같은 화면**이어야 한다 |
| **V3** | `/read` 왕복 수 실측 | 화면 1회 진입당 DB 왕복 수를 **전/후 각각** 센다(Supabase 로그 또는 쿼리 계수). 기대: **6 → 2**. 오디오 도서·비오디오 도서 둘 다 잰다 |
| **V4** | 이동 시간 | P-0 표 1 (A)(C)를 **같은 방법**으로 재측정 — 같은 책 id(`0155f30d-3020-48d8-b39c-4f3c5c48695a`) · 로그인 상태 · 5화면 · 3회 중앙값 |
| **V5** | 무기록 | 구현 전 구간에서 **DB·Storage 쓰기 0건**. 본 ADR은 조회 순서만 바꾼다 |

**V2가 본 ADR의 핵심 검증이다.** D1~D4는 전부 `force-dynamic` SSR 경로를 만지므로, 빨라졌는지보다
**같은 화면이 나오는지**가 먼저다.

---

## 대안 · 기각

- **페이지별 개별 최적화만 하고 중복 조회는 방치한다** — 기각: `/read`의 왕복 6 중 **3이 중복**이라
  (§2·§3) 중복을 두면 최소 단계 2에 도달할 수 없고, 개별 병렬화 이득이 중복 왕복에 묻힌다.
- **RLS만 믿고 `.eq('parent_id', …)`를 제거한다** — 기각: 왕복 수가 더 줄지 않는데(필터는 왕복을
  만들지 않는다) **이중 방어 중 하나를 잃는다** — 이득 0, 위험만 증가한다.

---

*ADR-0067 끝. Status: Accepted (2026-08-22 비기 검수 통과).*

---

## Amendment #1 — D3을 철회하고 `getClaims()` ADR로 이관한다

**Status: Accepted** (2026-08-22) / 기준 HEAD `fcba34a` (`main`)

구현(지시서 P-1b) 중 **D3이 목적을 달성할 수 없음이 드러났다.** D1·D2·D4는 그대로 유효하며
이미 구현됐다. 본 Amendment는 D3만 철회하고, 그 목적을 어디서 달성할지 지정한다.

### A1-1 — D3 철회: `.then` 체인은 왕복을 겹치지 못한다

D3 본문은 *"`getUser` 프로미스를 `await` 없이 체인해 `user.id`를 넘기는 형태"* 로 왕복이 겹친다고
적었다. **틀렸다.**

- `getActiveChild(supabase, parentId)`는 **`parentId`를 인자로 요구한다**(`lib/home/active-child.ts:48-50`).
- 그 값은 `await supabase.auth.getUser()`의 **출력**이다 — Supabase Auth 네트워크 응답.
- `userPromise.then(u => getActiveChild(supabase, u.id))`의 콜백은 **프로미스가 resolve된 뒤에**
  실행된다. 따라서 `children` 쿼리는 여전히 Auth 응답을 기다린다. **겹치는 구간이 0이다.**

값 의존이 아니라 코드 배치 때문이라던 D3의 전제(§5) 자체가 `getActiveChild`의 **시그니처** 앞에서
성립하지 않는다. RLS가 필터를 중복 강제한다는 사실(§5의 표)은 여전히 참이지만, 그것만으로는
**인자를 없애지 않는 한** 착수 시점을 앞당길 수 없다.

### A1-2 — 세 경로 중 `getClaims()` 하나만 채택한다

| 경로 | 내용 | 판정 |
|---|---|---|
| (가) `.eq('parent_id')` 제거 | RLS만으로 범위 강제 | **기각** — D3 본문·§대안·기각이 이미 기각했다. 이중 방어 중 하나를 잃는다 |
| (나) 필터 없이 조회 후 앱에서 `parent_id` 대조 | 이중 방어 유지 + 진짜 병렬 | **기각** — 아래 |
| (다) `getClaims()`로 `sub`를 로컬 검증 | 네트워크 없이 `user.id` 확보 → `children` 쿼리 즉시 착수 | **채택(이관)** |

**(나)를 기각하는 이유는 "2중 작업"이다.** (다)를 하면 `user.id`가 **네트워크 없이** 손에 들어오므로
`getActiveChild`를 지금 형태 그대로 두고도 왕복이 겹친다 — 시그니처도, 필터도, RLS 의존 구조도
건드릴 필요가 없다. (나)를 먼저 하면 `getActiveChild`를 고쳐 놓고 (다) 뒤에 **다시 되돌리는** 일이
된다. 순서를 바꾸면 한 번에 끝난다.

→ **D3의 목적(자녀 조회 병렬화)은 `getClaims()` 전환 ADR에서 함께 달성한다.** 그 ADR은 P-1 ②의
전제 실측(프로젝트 JWKS `alg: ES256` · `kty: EC` — 비대칭 서명키라 로컬 검증 경로)을 근거로 삼는다.

### A1-3 — 목표치 정정

본 ADR §1-4가 적은 `/read` "현재 6 → 최소 2"는 **D3 포함 목표치**였다. D3 철회로 정정한다.

| 구간 | 값 | 근거 |
|---|---|---|
| 변경 전 | SSR 요청 6 · **직렬 깊이 6** | P-1b V3 실측(임시 계수기) |
| **본 ADR 적용 후** | SSR 요청 4 · **직렬 깊이 3** | 〃 |
| 후속 `getClaims()` ADR 목표 | 직렬 깊이 **2** | 미착수 |

깊이 3의 내역: `auth.getUser()` → `getActiveChild` → [`book_text` ∥ `book_audio`].
사라진 2건은 `hasReaderAudio`의 `book_audio`(D1a)와 `getAudioReaderBook` 내부 `books`(D1b)다.

**측정 범위 주의**: 계수기는 `globalThis.fetch`를 감싸는 방식이라 **미들웨어의 `auth.getUser()`는
잡히지 않는다**(별도 엣지 샌드박스). 위 수치는 **페이지 SSR 구간만**이며, 화면당 Auth 왕복 1회가
미들웨어에 별도로 존재한다(P-1 ②).

### A1-4 — 검증 미완 2건 (V2)

| 항목 | 상태 | 사유 |
|---|---|---|
| **자녀 0명 계정** 경로(ADR-0064 D1·D4) | **미검증** | 테스트 계정 없음 |
| **비활성 도서** 진입 분기(ADR-0063 D2·D3) | **미검증** | 비활성 도서 id를 DB 조회 없이 특정할 수 없음 |

둘 다 **변경 지점이 해당 분기보다 뒤에 있다** — 비활성 판정은 `read/page.tsx:174`·
`book/[id]/page.tsx:151`에서 끝나고, D1·D2는 그 이후 코드만 건드린다. 자녀 0명 분기도
`getActiveChild` 반환값 사용부(`read/page.tsx:189-191`)가 무변경이다.
그래도 **검증한 것은 아니므로 미검증으로 남긴다** — 팀장 계정으로 확인 가능해지면 채운다.

검증한 것: 비로그인 4경로 307 → `/login`, 로그인 5화면 200, **오디오 도서**(`<audio>` 존재)·
**오디오 없는 도서**(`content_type` 경로 폴백) 각 1권.

---

*Amendment #1 끝. Status: Accepted (2026-08-22).*
