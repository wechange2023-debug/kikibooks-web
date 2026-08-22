# P-1 잔여 병목 진단 (읽기 전용)

**작성** 2026-08-22 · **작성자** 워커(Claude Code) · **상태** 비기 검수 대기(커밋 전)
**기준 HEAD** `f92c9d7` (`main`, origin 반영 완료 — ADR-0066 icn1 적용 후)

## 이 문서의 규칙

- **코드 변경 0건.** 방안·영향·위험만 적는다. 실행은 별도 지시서로 한다.
- 모든 주장에 **파일:라인 또는 실측 근거**를 붙인다. 근거를 못 만든 항목은 **「미확인」**으로 표기하고 추정으로 메우지 않는다.
- 수치는 P-0(2026-08-22)·P-R(2026-08-22) 실측과 본 문서에서 새로 잰 값만 쓴다.

## 출발점 — ADR-0066 적용 후 남은 격차

P-R 재측정(3회 중앙값, 문서 응답 완료까지).

| 화면 | 배포본 icn1 | 로컬 제품(서울) | 잔여 배수 |
|---|---|---|---|
| `/` | 910 ms | 514 ms | 1.77× |
| `/library` | 514 ms | 293 ms | 1.75× |
| `/mypage` | 507 ms | 383 ms | 1.32× |
| `/book/{id}` | 372 ms | 207 ms | 1.80× |
| `/book/{id}/read` | 403 ms | 317 ms | 1.27× |

지역 이동으로 5.9~10.4배가 1.27~1.80배로 줄었다. 남은 격차의 원인 분해는 본 문서 범위 밖이며(**미확인**), 아래 ①~④는 **환경과 무관하게 존재하는 구조적 비용**만 다룬다.

---

# ① 순차 DB 호출 병렬화

## 1-1. 판정 방법

각 `await`가 **앞 단계의 반환값을 실제로 쓰는지**를 변수 단위로 확인했다. 코드가 위에 있다는 이유로 순차인 것과, 값이 필요해서 순차인 것을 구분한다.

**RLS 중복 판정**도 함께 했다. 필터 인자가 `user.id`뿐이고 그 테이블의 RLS가 이미 `auth.uid()`로 같은 범위를 강제한다면, 그 쿼리는 **`user.id` 없이도 같은 결과**를 낸다 — 즉 `getUser()`를 기다릴 이유가 없다.

| 테이블 | RLS 정책 | 파일:라인 |
|---|---|---|
| `profiles` | `USING (auth.uid() = id)` | `supabase/migrations/001_initial_schema.sql:221-224` |
| `children` | `USING (parent_id = auth.uid())` | `001_initial_schema.sql:238-241` |
| `reading_sessions` | `USING (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()))` | `001_initial_schema.sql:260-263` |
| `favorites` | 위와 동일 구조 | `001_initial_schema.sql:277-280` |
| `books` | `books are viewable by everyone` | `001_initial_schema.sql:214` |

## 1-2. 헬퍼 내부 왕복 수 (함수 본문 실측)

| 함수 | 파일:라인 | 내부 왕복 | 비고 |
|---|---|---|---|
| `assertAdmin` | `lib/admin/gate.ts:202-240` | 1 | **비활성 도서 분기에서만 호출**(단축 평가) |
| `getActiveChild` | `lib/home/active-child.ts:47-64` | **1** | `children` 1건. `.eq('parent_id', parentId)`(`:55`)는 RLS와 중복 |
| `getGreetingProfile` | `lib/home/greeting.ts:40-55` | **1** | `.eq('id', userId)`(`:47`)는 RLS와 중복 |
| `getStreakThisWeek` | `lib/home/streak.ts:81-131` | **1** | `child.id` 필요 — 진짜 의존 |
| `getMypageSummary` | `lib/mypage/summary.ts:130-238` | **2단** | `:137` `Promise.all`(rpc 1 + 쿼리 4) → `:222` `fetchBooksById` |
| `getRecommendations` | `lib/home/recommendations.ts:165-216` | **2~4단** | `:172` 완독 id → `:174` stage1. stage2(`:186`)·stage3(`:198`)은 **부족할 때만** |
| `getPopularBooks` | `lib/landing/popular-books.ts:112-154` | 2 | |
| `getCategoryDistribution` | `lib/home/categories.ts:491-500` | **0~1** | `unstable_cache`(`:487-488`, revalidate 3600) |
| `getBookById(IncludingInactive)` | `lib/book/detail.ts:198-204` / `:272-278` | **0~1** | `unstable_cache`(`:177-178` / `:253-254`, revalidate 3600) |
| `getBooks` | `lib/library/query.ts:219-228` | 1 | keyset 또는 category 경로 위임 |
| `hasReaderAudio` | `lib/book/audio-manifest.ts:243-253` | **1** | `book_audio` 조회(`:179-186`), service role |
| `getAudioReaderBook` | `lib/book/audio-manifest.ts:259-367` | **3단** | `books`(`:266`) → `book_text`(`:284`) → `book_audio`(`:300`) **순차** |
| copy 함수 전량 | `lib/*/copy.ts` | **0** | 정적 상수 반환(`lib/home/copy.ts:88-90` 등, `.from(` 0건) |

## 1-3. 화면별 단계 분해

### `/` — `app/page.tsx` (로그인 · 자녀 있음)

| 단계 | 호출 | 파일:라인 | 앞 단계 의존 변수 | 독립 가능? |
|---|---|---|---|---|
| S1 | `auth.getUser()` | `:98` | — | — |
| — | (선착수) `getGreetingProfile`·`getCategoryDistribution`·`getPopularBooks`·정적 카피 | `:144-153` | `user.id`(greeting만) | 이미 겹쳐 있음 |
| S2 | `await getActiveChild(supabase, user.id)` | `:150` | `user.id` | **가능** — RLS 중복(1-1) |
| S3 | `Promise.all([profile, getRecommendations(child), getStreakThisWeek(child.id), …])` | `:193-202` | `activeChild.id`·`current_level` | 불가 — 진짜 의존 |
| S3 내부 | `getRecommendations`: 완독 id → stage1 | `recommendations.ts:172`·`:174` | `completedIds` | 불가 — stage1이 완독 id를 인자로 받음 |

**임계경로 왕복(전형)**: `getUser` → `getActiveChild` → `fetchCompletedBookIds` → `pickBooksAtLevelRange` = **4**

### `/library` — `app/(reader)/library/page.tsx`

| 단계 | 호출 | 파일:라인 | 앞 단계 의존 변수 | 독립 가능? |
|---|---|---|---|---|
| S1 | `auth.getUser()` | `:82` | — | — |
| S2 | `Promise.all([getBooks(supabase, initialFilters, null), getLibraryCopy()])` | `:99-102` | **없음** — `initialFilters`는 `searchParams` 동기 파싱(`:91-96`) | **가능** |

`getBooks`는 `user`를 **인자로도 받지 않는다**. `user`는 `:84-86` 가드에만 쓰인다.

**임계경로 왕복(전형)**: `getUser` → `getBooks` = **2**

### `/mypage` — `app/(reader)/mypage/page.tsx`

| 단계 | 호출 | 파일:라인 | 앞 단계 의존 변수 | 독립 가능? |
|---|---|---|---|---|
| S1 | `auth.getUser()` | `:93` | — | — |
| S2 | `await getActiveChild(supabase, user.id)` | `:99` | `user.id` | **가능** — RLS 중복 |
| S3 | `Promise.all([getMypageSummary(child.id), getStreakThisWeek(child.id), 카피 2종])` | `:127-132` | `activeChild.id` | 불가 |
| S3 내부 | `getMypageSummary` 2단 | `summary.ts:137` → `:222` | 1단 결과의 book id 합집합 | 불가 |

**임계경로 왕복(전형)**: `getUser` → `getActiveChild` → summary 1단 → summary 2단 = **4**

### `/book/{id}` — `app/(reader)/book/[id]/page.tsx` (활성 도서)

| 단계 | 호출 | 파일:라인 | 앞 단계 의존 변수 | 독립 가능? |
|---|---|---|---|---|
| S1 | `auth.getUser()` | `:117` | — | — |
| S2 | `Promise.all([getBookByIdIncludingInactive(params.id), 카피, getActiveChild(user.id)])` | `:126-130` | `user.id`(activeChild만) | **가능** — RLS 중복 |
| S3 | `favorites` 조회 | `:163-168` | `activeChild.id` + `book.id` | 불가 |

**`assertAdmin`(`:100`)은 비활성 도서 분기(`:151`)에서만 실행된다** — 활성 도서에서는 왕복 0. P-0 표 3의 "4단"은 코드 나열 기준이었고, **런타임 기준은 3단**이다(본 문서가 정정).

**임계경로 왕복(전형)**: `getUser` → (books 캐시 히트면 0) `getActiveChild` → `favorites` = **3**

### `/book/{id}/read` — `app/(reader)/book/[id]/read/page.tsx` (활성 · 오디오 도서)

| 단계 | 호출 | 파일:라인 | 앞 단계 의존 변수 | 독립 가능? |
|---|---|---|---|---|
| S1 | `auth.getUser()` | `:144` | — | — |
| S2 | `Promise.all([getBookByIdIncludingInactive(params.id), 카피 2종])` | `:151-155` | 없음(`params.id`는 URL) | **가능** |
| S3 | `await getActiveChild(supabase, user.id)` | `:188` | `user.id` | **가능** — RLS 중복. `book`과 무관 |
| S4 | `await hasReaderAudio(book.id)` | `:214` | `book.id` — **그러나 `book.id === params.id`** | **가능** |
| S5 | `await getAudioReaderBook(book.id)` | `:215` | 동일 | **가능**(S4와 병합 가능) |
| S5 내부 | `books` → `book_text` → `book_audio` **순차 3** | `audio-manifest.ts:266`·`:284`·`:300` | 상호 없음 | **가능** |

**`assertAdmin`(`:130`)도 비활성 분기 전용**이다. P-0의 "6단"은 코드 나열 기준이고 **런타임은 5단**이다.

**중복 조회 2건 (신규 발견)**

- `books` 테이블을 **두 번** 읽는다 — S2 `getBookByIdIncludingInactive`(캐시 경로) + S5 내부 `:266`(service role).
- `book_audio` 테이블을 **두 번** 읽는다 — S4 `hasReaderAudio`(`:179-186`) + S5 내부 `:300`.

**임계경로 왕복(전형)**: `getUser` → `getActiveChild` → `hasReaderAudio` → (`books`→`book_text`→`book_audio`) = **6**

## 1-4. "현재 단계 수 → 가능 최소 단계 수"

「단계」는 **직렬로 이어지는 네트워크 왕복 수**다(캐시 히트는 0으로 셈). 미들웨어 `getUser` 1회는 ②에서 따로 다루므로 여기서는 제외한다.

| 화면 | 현재(전형) | 가능 최소 | 줄어드는 근거 |
|---|---|---|---|
| `/` | **4** | **3** | `getActiveChild`를 S1과 병합(RLS 중복). `getRecommendations` 내부 2단은 완독 id 의존이라 잔존 |
| `/library` | **2** | **1** | `getBooks`가 `user`를 쓰지 않음 — `getUser`와 완전 병렬 |
| `/mypage` | **4** | **3** | `getActiveChild` 병합. summary 내부 2단은 잔존 |
| `/book/{id}` | **3** | **2** | `getActiveChild` 병합 → `favorites`만 뒤에 남음 |
| `/read` | **6** | **2** | `getActiveChild` 병합 + S4·S5 병합(`params.id`만 필요) + `getAudioReaderBook` 내부 3단 병렬화 + 중복 2건 제거 |

## 1-5. 방안 · 영향 · 위험

| 방안 | 대상 | 영향 | 위험 |
|---|---|---|---|
| **A. `getUser`와 데이터 조회 병렬 착수** | `/library`(`:82`↔`:99`) | 1왕복 제거 | **가드 순서가 바뀐다.** 비로그인 요청에서도 `getBooks`가 먼저 나간다 — `books`는 전체 공개(`001_initial_schema.sql:214`)라 데이터 노출은 늘지 않으나, 리다이렉트될 요청에도 쿼리가 1건 발생한다 |
| **B. `getActiveChild`를 `getUser`와 병렬화** | `/`(`:150`) · `/mypage`(`:99`) · `/book/{id}`(`:126`) · `/read`(`:188`) | 화면당 1왕복 제거 | **RLS 의존이 코드에서 사라진다.** 지금은 `.eq('parent_id', …)`가 이중 방어인데, 이를 걷으면 **RLS 정책이 유일한 방어선**이 된다. 정책이 바뀌면 조용히 전 사용자 자녀가 보인다. → 인자를 지우지 말고 `getUser` 프로미스를 체인해 **왕복만 겹치고 필터는 유지**하는 형태가 대안 |
| **C. `/read` S4·S5 병합** | `read/page.tsx:214-215` | `hasReaderAudio` 왕복 1건 제거 | `getAudioReaderBook`이 null/0면 아래 `content_type` 경로로 폴백해야 한다 — 현재 게이트가 그 역할을 하므로 **폴백 분기를 반환값 기준으로 다시 써야 한다**(회귀 범위: html·asb_native 896권) |
| **D. `getAudioReaderBook` 내부 3쿼리 병렬화** | `audio-manifest.ts:266`·`:284`·`:300` | 2왕복 제거 | 세 쿼리가 서로의 결과를 쓰지 않는지 **재확인 필요**(본 조사에서는 호출 인자만 확인, 본문 전량 검증은 **미확인**) |
| **E. `books` 중복 조회 제거** | `read/page.tsx:151` ↔ `audio-manifest.ts:266` | 1왕복 제거 | S2는 `unstable_cache`(publishable), S5는 **service role**이다. 합치면 **한쪽의 권한 경계가 바뀐다** — service role로 합치면 RLS 우회 범위가 넓어지고, 캐시 쪽으로 합치면 비활성 도서 처리가 달라질 수 있다 |

**공통 위험**: 위 전부가 `force-dynamic` SSR 경로(`app/page.tsx:92` 등 11곳)라 **화면 정확성에 직결**된다. 검증은 6화면 육안 + 자녀 0명·비활성 도서·비오디오 도서 3종 분기까지 포함해야 한다.

---

# ② Auth 2중 호출

## 2-1. 현황

| 지점 | 호출 | 파일:라인 |
|---|---|---|
| 미들웨어 | `supabase.auth.getUser()` | `middleware.ts:22` → `lib/supabase/middleware.ts:52-54` |
| 각 페이지 | `supabase.auth.getUser()` | `app/page.tsx:98` · `library/page.tsx:82` · `mypage/page.tsx:93` · `book/[id]/page.tsx:117` · `read/page.tsx:144` |

미들웨어 matcher(`middleware.ts:73-75`)가 정적·이미지만 제외하므로 **화면 1회당 Auth 왕복 2회**다. `lib/supabase/middleware.ts:50-51` 주석이 `getSession()` 대신 `getUser()`를 쓰는 이유를 밝혀 두었다 — "getSession()은 쿠키만 신뢰한다".

## 2-2. 미들웨어 결과를 페이지가 재사용할 수 있는가

**헤더 전달 방식은 성립하지 않는다.** 미들웨어가 `x-user-id` 같은 헤더를 심어 페이지가 그것을 믿으면 **신뢰 경계가 헤더로 내려간다**. 요청자가 같은 헤더를 위조해 보낼 수 있고, 미들웨어가 그것을 덮어쓰는지 여부에 보안이 걸린다. 현재 미들웨어에는 요청 헤더 정화 코드가 **없다**(`middleware.ts:21-47` 전량 확인). `@supabase/auth-js` 자체 문서도 같은 취지로 경고한다 — *"If using an insecure storage medium, such as cookies or request headers, the user object returned by this function must not be trusted"* (`GoTrueClient.d.ts:1318`).

**`getSession()` 대체도 성립하지 않는다.** 쿠키 값을 검증 없이 신뢰한다. 현행 주석(`:50-51`)이 이미 같은 이유로 기각한 선택지다.

## 2-3. `getClaims()` — 성립하는 대안

설치본에 존재한다: `@supabase/auth-js@2.105.4`, `node_modules/.pnpm/@supabase+auth-js@2.105.4/.../GoTrueClient.d.ts:2393`.

공식 주석(`:2330-2352`) 요지:

- JWKS(`/.well-known/jwks.json`)로 **로컬 검증** → `getUser()`보다 현저히 빠르다.
- **비대칭 서명키(ECC·RSA)일 때만** 로컬 검증이다. **대칭 시크릿이면 `getUser()`와 같이 서버로 간다.**
- 휘발성 환경(Lambda 등)에서는 인스턴스마다 JWKS를 한 번 받을 수 있다(Supabase가 엣지 캐시 제공).

**전제 조건은 충족돼 있다(실측).** 프로젝트 JWKS 응답:

```
$ curl -s https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
{"keys":[{"alg":"ES256","kty":"EC","crv":"P-256","use":"sig","key_ops":["verify"], …}]}
```

`alg: ES256` · `kty: EC` — **비대칭 서명키**다. 즉 이 프로젝트에서 `getClaims()`는 로컬 검증 경로를 탄다.

## 2-4. 방안 · 영향 · 위험

| 방안 | 영향 | 위험 |
|---|---|---|
| **F. 페이지 측 `getUser()` → `getClaims()`** | 화면당 Auth 왕복 1회 제거(미들웨어 1회는 유지). 세션 검증은 미들웨어가 계속 담당 | ① **서명키를 대칭으로 되돌리면 이득이 조용히 사라진다**(오류는 아니고 느려질 뿐) ② 반환이 `user` 객체가 아니라 **클레임**이다 — 코드가 쓰는 값은 `user.id`뿐(`page.tsx:150` 등)이고 `claims.sub`로 대응되나 **전 호출부 반환 타입 변경**이 필요 ③ 서버리스 인스턴스가 짧게 살면 JWKS 요청이 늘 수 있다(**본 프로젝트에서 실측 미확인**) |
| **G. 미들웨어 matcher 축소** | 미들웨어 실행 횟수 감소 | 세션 갱신이 안 도는 경로가 생겨 **토큰 만료 처리가 어긋난다**. `updateSession`이 쿠키를 갱신하는 유일한 지점이다(`lib/supabase/middleware.ts:36-46`) |
| **H. 현행 유지** | 0 | 없음 |

**「미확인」**: `getClaims()`로 바꿨을 때의 실제 절감 ms. 본 조사는 왕복 1회를 없앨 수 있다는 **구조**만 확인했고, 그 1회가 몇 ms인지는 측정하지 않았다.

---

# ③ 폰트 preload 90개

## 3-1. 실측 — 무엇이 다른가

| 지표 | 배포본 | 로컬 제품 모드 | 근거 |
|---|---|---|---|
| HTML `rel="preload"` 총수 | **91** | **1** | 비로그인 `/` HTML `curl` |
| 그중 `as="font"` | **90** | **0** | 〃 |
| HTML 내 `.woff2` 참조(고유) | **95** | **0** | 〃 |
| 화면 진입당 woff2 요청 | **95개 / 768.9 KB** | **10개 / 99.6 KB** | P-0·P-R 브라우저 실측 |
| HTML 크기 | 71,743 B | 51,523 B | 〃 |

## 3-2. 빌드 산출물은 동일하다 (결정적)

로컬에서 `pnpm build`를 다시 돌려 대조했다.

| 대조 항목 | 결과 |
|---|---|
| `.next/static/media/*.woff2` 총수 | **202개** |
| 그중 `-s.p.woff2`(**preload 표시**) | **95개** — 배포본 HTML이 참조하는 수와 **일치** |
| `.next/static/css/` 파일명 | `04612191867ed76e.css` · `253b2b6231848049.css` · `3c0e2a9ae0d82487.css` |
| 배포본 stylesheet href | **위 3개와 완전 동일** |

CSS는 내용 해시 파일명이므로 **이름이 같다 = 내용이 같다**. 폰트 파일도 95개가 동일하게 `.p`로 표시돼 생성된다.

→ **차이는 빌드가 아니라 요청 시점의 HTML 렌더링에 있다.** 같은 산출물로 배포본은 preload 링크 90개를 내보내고 로컬 `next start`는 0개를 내보낸다.

## 3-3. 한글 unicode-range 청크가 실제로 요청되는가 — 예

배포본 HTML의 폰트 참조 **95개 전부**가 `-s.p.woff2` 접미사다(`/_next/static/media/…-s.p.woff2`, 파일명 패턴 계수 181회 · 고유 95개). `next/font`의 `-s`는 subset, `.p`는 preload 대상 표시다.

`app/layout.tsx:24-25` 주석은 *"한글 글리프는 unicode-range 청크로 함께 self-host되며 preload 대상만 아니다"* 라고 적고 있으나, **배포본 실측은 그 반대다** — 95개 중 90개가 preload 링크로 나가고, 브라우저는 화면 진입마다 95개·768.9 KB를 받는다. 라틴 글리프만으로 95개 청크가 나올 수 없으므로(`subsets: ['latin']` 선언, `app/layout.tsx:28`·`:36`) **한글 청크가 포함돼 있다.**

## 3-4. 원인 후보 — 확인된 것과 미확인

| 후보 | 판정 |
|---|---|
| Next 버전 차이 | **아니다** — 양쪽 빌드 모두 `14.2.35`(빌드 출력 · `package.json` `next: "14"`) |
| 빌드 산출물 차이 | **아니다** — CSS 3개 해시 일치, `.p` 폰트 95개 일치(3-2) |
| `subsets` 선언 차이 | **아니다** — 같은 소스(`app/layout.tsx:28`·`:36`) |
| 빌드 OS 차이(Windows ↔ Linux) | **미확인** — 산출물이 같으므로 영향이 없어 보이나 렌더 경로 차이는 조사하지 않았다 |
| Vercel 런타임 어댑터의 HTML 조립 차이 | **미확인** — 본 조사 범위 밖 |
| `preload` 옵션 미지정(기본 true) | 선언에 `preload` 키가 **없다**(`app/layout.tsx:27-41`). 기본값 적용이나 그것만으로 로컬 0개를 설명하지 못한다 → **미확인** |

## 3-5. 방안 · 영향 · 위험

| 방안 | 영향 | 위험 |
|---|---|---|
| **I. `preload: false` 명시** | preload 링크 90개 제거. 폰트는 CSS `unicode-range`로 **필요할 때만** 내려온다 | 첫 렌더에서 한글이 폴백 서체로 잠깐 보일 수 있다(`display: 'swap'` 이미 적용, `:32`·`:40`). **아이 화면의 첫인상**에 영향 |
| **J. 한글을 next/font에서 분리(로컬 self-host + 서브셋)** | 청크 수를 직접 통제 | 신규 폰트 파일 관리·라이선스 확인 필요. `docs/design-system.md` §2.1 개정 동반 |
| **K. 현행 유지** | 0 | 화면당 768.9 KB가 계속 나간다(총 전송량의 **84%**) |

**「미확인」**: I를 적용했을 때 실제로 몇 개가 남는지. 로컬 제품 모드가 이미 10개인 것은 참고치일 뿐, 같은 결과가 배포본에서 나온다는 근거가 아니다(3-4에서 원인 자체가 미확인이므로).

---

# ④ 이미지 `unoptimized: true`

## 4-1. 현황

- `next.config.js:30` `unoptimized: true`. 사유 주석 `:25-29` — 2026-08-06 표지 전량 402(`OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`), 표본 28건 중 402 28건.
- 표지는 `next/image` `<Image fill sizes …>`를 쓴다 — `components/library/library-browser.tsx:184-188` · `components/landing/book-cover-card.tsx:85-89` · `components/home/recommendation-list.tsx:92-96` · `components/book/book-cover-hero.tsx:83-88`(`priority`) · `components/home/hero-cover-stack.tsx:106-110`. `unoptimized`라 **원본 URL이 그대로 `<img src>`에 들어간다** — `sizes`는 바이트에 영향이 없다.

## 4-2. Vercel 공식 한도 (문서 최종 갱신 2026-02-23)

출처: `https://vercel.com/docs/image-optimization/limits-and-pricing`

| 항목 | Hobby 포함 | 초과 요율 |
|---|---|---|
| Image transformations | **5K/월** | $0.05 ~ $0.0812 / 1K |
| Image cache reads | **300K/월** | $0.40 ~ $0.64 / 1M |
| Image cache writes | **100K/월** | $4.00 ~ $6.40 / 1M |

- transformation은 **캐시 MISS·STALE마다** 과금된다(원격 이미지와 로컬 이미지의 캐시 키가 다르다).
- Hobby는 한도 초과 시 **과금되지 않고 402를 반환**하며 `alt` 텍스트가 대신 보인다. 이미 최적화된 이미지는 계속 동작한다. → **2026-08-06에 관측된 현상과 정확히 일치한다.**
- Hobby는 **비상업적 개인 사용으로 제한**된다(Fair Usage Policy).
- 기타 한도: 변환 결과 최대 **10 MB**, 원본 최대 **8192 px**, 원본 형식은 jpeg·png·webp·avif만(그 외는 원본 그대로 서빙).

## 4-3. 원본이 얼마나 큰가 (표본 6건 실측)

`/library` 표지 24장 중 6장을 내려받아 헤더를 읽었다. 화면 슬롯은 1512 px 뷰포트에서 약 **242 px**(`library-browser.tsx:188` `16vw`).

| # | 형식 | 원본 px | 바이트 | 슬롯 대비 가로 |
|---|---|---|---|---|
| 1 | JPEG | 1075×518 | 152,400 | 4.4× |
| 2 | JPEG | 871×720 | 101,227 | 3.6× |
| 3 | PNG | 541×720 | 71,248 | 2.2× |
| 4 | JPEG | 599×322 | 30,210 | 2.5× |
| 5 | JPEG | 542×599 | 33,085 | 2.2× |
| 6 | PNG | 274×300 | 19,295 | 1.1× |

합계 407,465 B · 평균 **67,910 B**. 24장 추정 **≈1,591 KB**(표본 6건 평균 × 24). 건당 응답 시간 **637.9 ~ 1,046.8 ms**(s3.amazonaws.com 직결, CDN 미경유).

## 4-4. 대안 비교

| 안 | 비용 발생 | 구현 범위 | `/library` 24장 ≈1,591 KB 대비 예상 절감 |
|---|---|---|---|
| **(a) 유지** | 0 | 0 | **0** |
| **(b) Vercel 최적화 재활성 + 표지 한정** | Hobby 5K transformations/월 내에서 **0원**, 초과 시 402 재발(과금은 아님) | `next.config.js:30` 제거 + `remotePatterns` 유지. `<Image>` 5개 컴포넌트는 **무수정** | **미확인.** 원본이 슬롯 대비 1.1~4.4배(4-3)라 리사이즈 여지는 확실하나, webp 변환 후 바이트는 실제 변환 없이 계산할 수 없다 |
| **(c) Supabase Storage 이미지 변환** | **Pro 플랜 이상 전용** — Free 불가. Pro/Team 100건 포함, 초과 $5 / 1,000 origin images (출처: `supabase.com/docs/guides/storage/serving/image-transformations`) | 표지를 Supabase Storage로 **이관해야** 적용된다. 현재 표지는 s3·digitallibrary·bookdash 외부 직결 | **미확인.** 이관 자체가 선행 조건 |
| **(d) 적재 시 썸네일 사전 생성(Storage 저장)** | Storage 용량·전송 비용만. 변환 API 비용 0 | 동기화 파이프라인(`scripts/`)에 생성 단계 신설 + `books.cover_url` 정책 변경 → **DB 스키마·ADR 선행**(claude.md Hard Rule 8) | **미확인.** 다만 폭을 슬롯(≈242 px)에 맞추면 4-3의 1.1~4.4배 초과분이 사라진다 |

**(c) 전제 미확인**: 현재 Supabase 플랜이 Free인지 Pro인지 확인하지 못했다. Free라면 (c)는 성립하지 않는다.

**(b) transformation 소요량 미확인**: 활성 도서 수 × `sizes` 조합 수만큼 캐시 MISS가 발생하는데, 활성 도서 수를 본 조사에서 실측하지 않았다. 5K/월 한도 초과 여부는 그 수가 있어야 판정된다.

**공통 위험**: 표지 원본 형식에 **PNG가 섞여 있다**(표본 6건 중 2건). Vercel은 jpeg·png·webp·avif만 변환하고 그 외는 원본 그대로 서빙하므로(4-2), 형식 전수 조사 없이는 적용 범위를 확정할 수 없다 — **미확인**.

---

# ⑤ 우선순위 초안 (사실만 · 추천 표기 없음)

「효과」는 실측 근거가 있는 것만 수치로 적고, 없으면 미확인이라 적는다.

| # | 항목 | 효과(실측 근거) | 위험 | 범위(수정 파일) |
|---|---|---|---|---|
| ③ | 폰트 preload 90개 | 화면당 **768.9 KB → 미확인**. 현재 총 전송량의 **84%** | 첫 렌더 한글 폴백 노출 | `app/layout.tsx` 1파일 (I안) |
| ④ | 이미지 unoptimized | `/library` **≈1,591 KB** · 건당 638~1,047 ms. 절감 폭 **미확인** | 402 재발(과금 없음) / (c)(d)는 플랜·스키마 선행 | (b) `next.config.js` 1파일 / (d) 파이프라인 + DB ADR |
| ① | 순차 DB 호출 | 왕복 제거 수 **확정**: `/read` 6→2 · `/library` 2→1 · `/`·`/mypage` 4→3 · `/book/{id}` 3→2. **왕복당 ms는 미확인** | RLS 단일 방어선화 / 권한 경계 변경 / 폴백 분기 재작성 | 페이지 5파일 + `lib/book/audio-manifest.ts` |
| ② | Auth 2중 호출 | 화면당 Auth 왕복 **2 → 1**. 전제(ES256 비대칭키) **실측 충족**. ms 절감 **미확인** | 반환 타입 변경(전 호출부) / 서명키 정책 의존 | 페이지 5파일 + `lib/supabase/*` |

**세 축 요약**

| 항목 | 효과 근거 강도 | 위험 | 범위 |
|---|---|---|---|
| ③ | **강**(84% 실측) | 중(시각) | **최소**(1파일) |
| ④(b) | 중(원본 과대 실측, 절감폭 미확인) | 중(402 재발) | **최소**(1파일) |
| ④(d) | 중 | 중 | **최대**(파이프라인+DB ADR) |
| ① | **강**(왕복 수 확정) | **고**(보안·폴백) | 대(6파일) |
| ② | 중(구조 확정, ms 미확인) | 중~고(타입 변경) | 대(7파일 내외) |

---

## 본 문서가 P-0을 정정한 것

- `/book/{id}` "4단" → **런타임 3단**. `assertAdmin`(`book/[id]/page.tsx:100`)은 비활성 도서 분기에서만 호출된다(`:151` 단축 평가).
- `/read` "6단" → **런타임 5단**(같은 사유, `read/page.tsx:130`·`:174`). 다만 `getAudioReaderBook` 내부 3단을 더하면 **임계경로 왕복은 6**이다.

## 확인하지 못한 것 (전량)

1. ADR-0066 적용 후 남은 1.27~1.80배의 원인 분해
2. `getClaims()` 전환 시 실제 절감 ms
3. 배포본과 로컬의 HTML preload 링크 차이를 만드는 **직접 원인**
4. `preload: false` 적용 시 배포본에 남는 폰트 요청 수
5. Vercel 최적화 재활성 시 표지 바이트 절감 폭
6. 현재 Supabase 플랜(Free / Pro)
7. 활성 도서 수 — ④(b)의 5K/월 한도 판정에 필요
8. 표지 원본 형식 분포(전수) — 변환 가능 형식 판정에 필요
9. `getAudioReaderBook` 3쿼리의 상호 독립성 전량 검증

---

*P-1 진단 끝. 코드 변경 0건 · git 조작 0건 · DB 쓰기 0건.*
