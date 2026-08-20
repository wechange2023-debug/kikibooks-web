# ADR-0062: 메인 페이지 통합 — `/` 단일 메인 + 로그인 상태별 블록 주입

## Status

**Accepted** (2026-08-19, 팀장 승인) / 기준 HEAD `b7ce7ac` (브랜치 `design-renewal`)
최초 제안 2026-08-19 (Proposed)

**Open Questions 확정 (2026-08-19, 팀장 결정)** — 상세는 §Open Questions.

| # | 결정 |
|---|---|
| **O-M1** | **실측 완료 — `next.config.js` redirects()가 미들웨어보다 먼저. D2 원안 채택** |
| **O-M2** | **비로그인 카테고리 타일 → `/signup`** |
| **O-M3** | **`AppFooter` 전 화면 일원화 확정** (사업자·저작권 포함) |
| **O-M4** | **홈 활성 판정은 정확 일치(`===`) 유지. `startsWith` 금지** |

구현은 큐 D-4c에서 수행한다(본 ADR 자체에는 코드 변경 0건).

**Amendment 1 (2026-08-19, 팀장 결정)** — **D1 변경**: 로그인 상태 메인에도 랜딩 섹션
(핵심가치·인기책)을 포함한다. 상세는 §Amendment 1.

**Amendment 2 (2026-08-19, 팀장 결정)** — **히어로 구도 통일**: 좌 텍스트+CTA /
우 `HeroCoverStack`(실표지 3장) **단일 구도**. 텍스트·CTA·표지 **데이터 소스만** 상태별로
분기한다. 상세는 §Amendment 2.

**ADR-0012 결정 4를 supersede**하고 **결정 6을 승계**한다(§Decision D8).

## Deciders

팀장, 오케스트레이터

## Related

- **ADR-0012** 결정 4(로그인 사용자의 `/` 접근을 페이지 컴포넌트가 분기) — **supersede 대상** ·
  결정 6(`/`는 dynamic 렌더) — 승계
- **ADR-0009** 3.4절 — 미들웨어 중앙 가드("미들웨어 = 화면 가드, 최종 방어선은 RLS")
- **ADR-0011** 결정 1 — "분기는 도착 지점에서 1회"(`resolvePostLoginPath`)
- **ADR-0013** 결정 4 — closed environment(로그인 후 경로 색인 차단)
- **ADR-0021** D1·D3·D4 — `(reader)` route group · AppHeader 몰입 화면 분기
- **ADR-0060** §6.1(CTA 화면당 1개) · §6.3·§6.4(섹션 헤더·풀폭 히어로·캐러셀)
- **ADR-0061** D1·D4 — 공통 푸터와 몰입 화면 미렌더
- 큐 D-4b 읽기 전용 실측(2026-08-19) — 본 ADR의 모든 파일:라인 근거

## Context

### 1. 현행 라우팅 실측 — `/`와 `/home`의 관계

**미들웨어는 `/`를 건드리지 않는다.** `middleware.ts:26-33`의 분기는 두 개뿐이다.

| 조건 | 동작 | 파일:라인 |
|---|---|---|
| 비로그인 + 보호 라우트 | → `/login` | `middleware.ts:26-28` |
| 로그인 + `/login`·`/signup` | → `POST_LOGIN_PATH`(`/home`) | `middleware.ts:31-33` |

`/`는 `PROTECTED_PREFIXES`(`lib/auth/routes.ts:9-16`)에 없고 `AUTH_PAGES`에도 없다 —
**의도적으로 공개 라우트**다(ADR-0012 결정 4).

**`/` → `/home` 분기는 페이지 컴포넌트가 한다.** `app/page.tsx:64-66`:

```
if (user) {
  redirect(await resolvePostLoginPath(supabase, user.id));
}
```

`resolvePostLoginPath`(`lib/auth/resolve-post-login-path.ts:21-27`)는 자녀 유무로
`/home`(자녀 있음) 또는 `/onboarding`(자녀 없음)을 돌려준다.

**현행 전체 흐름**

| 진입 | 상태 | 결과 |
|---|---|---|
| `/` | 비로그인 | 랜딩 렌더 |
| `/` | 로그인 + 자녀≥1 | → `/home` |
| `/` | 로그인 + 자녀 0 | → `/onboarding` |
| `/home` | 비로그인 | 미들웨어 → `/login` |
| `/home` | 로그인 + 자녀 0 | 페이지 → `/onboarding` (`(reader)/home/page.tsx:77`) |
| `/login`·`/signup` | 로그인 | 미들웨어 → `/home` |

### 2. `/home`을 가리키는 지점 전수 (실측)

상수를 경유하므로 **값 1곳(`lib/auth/routes.ts`)을 바꾸면 대부분 따라온다.**

| 분류 | 파일:라인 | 비고 |
|---|---|---|
| 상수 정의 | `lib/auth/routes.ts:22` `POST_LOGIN_PATH = '/home'` | 리다이렉트 도착지 |
| 상수 정의 | `lib/auth/routes.ts:29` `HOME_PATH = '/home'` | 네비 링크 |
| 보호 목록 | `lib/auth/routes.ts:10` `PROTECTED_PREFIXES`에 `'/home'` | **하드코딩** |
| 미들웨어 | `middleware.ts:32` | 상수 경유 |
| 로그인 콜백 | `app/auth/callback/route.ts:38` `resolvePostLoginPath` | 상수 경유 |
| 온보딩 완료 | `app/onboarding/actions.ts:73` `redirect(POST_LOGIN_PATH)` | 상수 경유 |
| 온보딩 가드 | `app/onboarding/page.tsx:34` | 상수 경유 |
| 헤더 내비 | `components/app/app-header.tsx:69`·`:71`·`:110` | 상수 경유 |
| 책 404 복귀 | `app/(reader)/book/[id]/not-found.tsx:44` | 상수 경유 |
| **캐시 무효화** | `lib/home/actions.ts:84` `revalidatePath('/home')` | **하드코딩** |
| **캐시 무효화** | `lib/admin/books/actions.ts:92` `'/home'` | **하드코딩** |
| **색인 차단** | `app/robots.ts:18` `disallow: ['/home', …]` | **하드코딩** |

**하드코딩 4곳**(`routes.ts:10` · `home/actions.ts:84` · `admin/books/actions.ts:92` ·
`robots.ts:18`)이 마이그레이션의 실질 위험 지점이다.

### 3. 컴포넌트 실측 — 랜딩 358행 / 홈 754행

| 랜딩 | 행 | 홈 | 행 |
|---|---|---|---|
| `landing-header.tsx` | 38 | `home-hero.tsx` | 119 |
| `hero-section.tsx` | 67 | `hero-cover-stack.tsx` | 127 |
| `value-props.tsx` | 50 | `level-selector.tsx` | 116 |
| `popular-books.tsx` | 47 | `recommendation-list.tsx` | 151 |
| `book-cover-card.tsx` | 110 | `category-carousel.tsx` | 108 |
| `landing-footer.tsx` | 46 | `streak-chart.tsx` | 133 |

**헤더·푸터가 갈라져 있다** — 이것이 통합의 최대 구조 쟁점이다.

- `/` → `LandingHeader` + `LandingFooter` (`app/page.tsx:81`·`:87`)
- `/home` → `AppHeader` + `AppFooter` (`app/(reader)/layout.tsx`)

`/`는 루트라 `(reader)` route group **안에 넣을 수 없다.**

### 4. SEO·인증 실측

- **`/`는 이미 dynamic이다.** `app/page.tsx:58`이 `createClient()`로 쿠키를 읽으므로
  Next가 라우트를 dynamic으로 강제한다(ADR-0012 결정 6, `page.tsx:52` 주석).
  → **static → dynamic 전환은 발생하지 않는다.** 통합의 렌더링 비용 증가분은 0이다.
- **미들웨어 세션 판독 비용도 증가 0이다.** `middleware.ts:73-75`의 matcher는 정적 자산만
  제외하므로 `/`는 **이미 매 요청 `updateSession`을 통과**한다.
- **색인 정책**: `app/robots.ts:16-26`은 `/` allow, `/home`·`/book` 등 disallow.
  `app/sitemap.ts:15-20`은 `/`를 priority 1로 등재한다.
  → 통합 후에도 **크롤러는 비로그인이므로 `/`에서 마케팅 랜딩을 본다.** closed
  environment(ADR-0013 결정 4)는 깨지지 않는다. 단 이 근거를 문서에 남겨야 한다(D7).

## Decision

### D1 — `/` 단일 메인. 로그인 상태로 블록을 주입한다

`app/page.tsx`가 `auth.getUser()` 결과로 **같은 레이아웃에 다른 블록**을 렌더한다.
리다이렉트로 화면을 나누지 않는다.

| 블록 | 비로그인 | 로그인 |
|---|---|---|
| 헤더 | `LandingHeader` (로그인/회원가입) | `AppHeader` (홈·라이브러리·마이페이지·로그아웃) |
| **히어로** | 서비스 소개 + **가입 CTA** | 인사말·자녀 칩 + **"책 보러 가기" CTA** |
| **추천** | 인기 책(랜덤 6권) | 오늘의 추천(레벨 기반) |
| 레벨 선택 | 미렌더 | `LevelSelector` |
| **카테고리** | **공통** — 캐러셀 | **공통** — 캐러셀 |
| 스트릭 | 미렌더 | `StreakChart` |
| 핵심 가치 | `ValueProps` | 미렌더 |
| 푸터 | `AppFooter` (공통으로 수렴) | `AppFooter` |

**공통**은 카테고리 캐러셀과 푸터다. 카테고리는 비로그인에게 "무엇이 있는지" 보여주는
마케팅 자산이면서 로그인 사용자에게는 탐색 도구다 — 같은 컴포넌트를 쓰되 타일 링크는
비로그인일 때 `/signup`으로 보낸다(→ O-M2).

### D2 — `/home`은 `/`로 **permanent redirect**하고 라우트를 폐기한다

기존 북마크·외부 링크·`revalidatePath` 이력을 보호한다.

**구현 위치는 `next.config.js`의 `redirects()`** 로 한다(현재 미정의 — 신설).
페이지 컴포넌트의 `permanentRedirect()`보다 낫다:

- 렌더 없이 edge에서 끝난다
- **미들웨어보다 먼저 평가**되므로 비로그인 사용자의 `/home` 북마크가
  `/login`으로 새지 않고 곧장 `/`(랜딩)에 도착한다

> **★ 구현 시 검증 의무**: Next 14.2의 라우팅 순서(`next.config` redirects vs
> middleware)를 **실측으로 확인**한 뒤 확정한다. 순서가 반대라면 `/home`을
> `PROTECTED_PREFIXES`에서 빼는 것(D3)만으로도 같은 결과가 나온다.

### D3 — 라우트 상수를 정리한다

| 대상 | 조치 |
|---|---|
| `POST_LOGIN_PATH` | `'/home'` → `'/'` |
| `HOME_PATH` | `'/home'` → `'/'` |
| `PROTECTED_PREFIXES` | `'/home'` **제거** — `/`는 공개 라우트이자 메인이다 |
| `resolvePostLoginPath` | 자녀 0명 → `/onboarding` 유지, 자녀≥1 → `/`(상수 경유) |

`/`가 보호 라우트가 **아니라는 점은 불변**이다(ADR-0009 3.4절 모델 유지). 로그인
사용자용 데이터 블록은 페이지가 세션을 보고 렌더할 뿐이며, 데이터 보호의 최종 방어선은
RLS다.

### D4 — 자녀 0명은 여전히 `/onboarding`으로 보낸다

통합 후에도 `/`는 **로그인 + 자녀 0명**이면 `/onboarding`으로 `redirect()`한다.
홈 블록(인사말·레벨·추천·스트릭) 전부가 활성 자녀를 전제하기 때문이다
(`(reader)/home/page.tsx:75-78`과 동일 논리).

즉 `/`의 분기는 **3갈래**다: 비로그인 → 랜딩 / 로그인+자녀0 → `/onboarding` /
로그인+자녀≥1 → 홈 블록.

### D5 — 헤더·푸터 통합

- **푸터**: `AppFooter`(ADR-0061 D1)로 일원화한다. `LandingFooter`가 보유한
  **사업자 정보·저작권 표기**는 `AppFooter`로 이관한다(ADR-0061 O-F2를 여기서 해소).
  이관 후 `LandingFooter`는 폐기한다.
- **헤더**: 비로그인 `LandingHeader` / 로그인 `AppHeader`를 `/`가 상태로 선택한다.
  둘을 하나로 합치지 않는다 — 내비 항목이 완전히 다르고(로그인/회원가입 ↔ 4개 내비 +
  로그아웃), 합치면 분기가 컴포넌트 안으로 숨어 더 나빠진다.
- `(reader)` layout은 **무변경**이다.

### D6 — CTA 화면당 1개 규칙 유지 (§6.1)

| 상태 | CTA(오렌지레드) 1개 | Primary 유지 |
|---|---|---|
| 비로그인 | 히어로 "시작하기" → `/signup` | 헤더 "회원가입" |
| 로그인 | 히어로 "책 보러 가기" → `/library` | — |

두 상태가 동시에 렌더되지 않으므로 규칙이 깨지지 않는다. **구현 후 실측으로 확인**한다
(`bg-cta` 요소 개수 = 1).

### D7 — 색인 정책을 명시적으로 재확인한다

`app/robots.ts`의 `disallow`에서 **`/home`을 제거**한다(라우트가 사라지므로).
`/`는 계속 allow, `sitemap.ts`의 `/` priority 1도 유지한다.

**근거를 robots.ts 주석에 남긴다**: 크롤러는 비로그인이므로 `/`에서 마케팅 랜딩만
본다. 로그인 후 콘텐츠 블록은 세션이 있어야 렌더되므로 closed environment(ADR-0013
결정 4)는 유지된다.

### D8 — ADR-0012와의 관계

- **결정 4를 supersede**한다. "로그인 사용자의 `/` 접근은 페이지가 리다이렉트한다" →
  "페이지가 **블록을 바꿔 렌더한다**"로 바뀐다. 단 결정 4의 **핵심 원칙**("미들웨어는
  이 분기를 하지 않는다")은 **그대로 유지**된다 — 분기는 여전히 도착 지점 1회다.
- **결정 6은 승계**한다. `/`는 계속 dynamic이며 인기 책은 매 요청 랜덤이다.
- 결정 2(카피 단일 출처)·결정 3(랜덤 6권)·결정 5(카피 문안)는 **무변경**이다.

ADR-0012 본문은 소급 수정하지 않고 상태부에 `부분 Superseded by ADR-0062 (결정 4)`를
표기한다.

## Amendment 1 (2026-08-19) — 로그인 메인에 랜딩 섹션 병합 (D1 변경)

원안 D1은 핵심가치·인기 책을 **비로그인 전용**으로 두고 로그인 상태에서는 미렌더했다.
팀장 결정으로 **양쪽 모두 렌더**한다. 로그인 사용자도 카탈로그 폭(인기 책)과 서비스
성격(핵심가치)을 계속 보는 편이 낫다는 판단이다.

**섹션 순서 (로그인 상태)** — 개인화(자주 쓰는 것)를 위, 마케팅성 정보(덜 급한 것)를 아래:

```
히어로(개인화) → 레벨 선택 → 오늘의 추천 → 카테고리 캐러셀 → 인기 책 → 핵심가치 → 푸터
```

**D1 표 개정** (변경 행만):

| 블록 | 비로그인 | 로그인 |
|---|---|---|
| 인기 책 | 렌더 | ~~미렌더~~ → **렌더** |
| 핵심 가치 | 렌더 | ~~미렌더~~ → **렌더** |

**부수 결정**

1. **컴포넌트 재사용** — `PopularBooks`·`ValueProps`를 그대로 쓴다. 신규 컴포넌트 0건.
2. **인기 책 링크 분기** — `BookCoverCard`는 `href="/signup"`이 하드코딩돼 있었다
   (`book-cover-card.tsx:57`). `signedIn` prop을 받아 **로그인 시 `/book/[id]`,
   비로그인 시 `/signup`** 으로 간다. `CategoryCarousel`의 O-M2 분기와 같은 패턴이다.
3. **추천과 인기 책의 중복 허용** — 로그인 상태에서 "오늘의 추천"과 "인기 책"에 같은 책이
   겹칠 수 있다. **겹침 제거는 하지 않는다** — 추천 로직 변경은 큐 D-5 이후 별건이며
   이번 변경은 **표시만** 한다.
4. **CTA 1개 규칙 유지** — `ValueProps`에는 CTA 버튼이 **없다**(실측: 정보 카드 4장뿐,
   `value-props.tsx:23-49`). 따라서 제외할 버튼이 없고 §6.1은 자동으로 지켜진다.
   로그인 메인의 CTA는 히어로 "책 보러 가기" 1개뿐이다.
5. **신규 쿼리** — 로그인 분기에 `getPopularBooks()` **1회**가 추가된다.
   `getLandingCopy()`는 정적 상수라 왕복이 아니다. `books`는 약 900행 인덱스 테이블이고
   베타 트래픽이 작다(ADR-0012 결정 3·6의 비용 판단 승계).

**레이아웃 주의**: `PopularBooks`·`ValueProps`는 자체 전폭 `<section>`(`px-5 py-12` +
내부 `max-w-5xl`)을 갖는다. 개인화 블록의 `max-w-screen-*` 컨테이너 **안에 넣지 않고**
형제로 배치해야 이중 제약이 걸리지 않는다.

## Amendment 2 (2026-08-19) — 히어로 구도 통일

Amendment 1까지의 상태에서 두 히어로의 **우측 구성이 달랐다**:

| | 좌측 | 우측 |
|---|---|---|
| 비로그인 (`hero-section.tsx`) | 소개 문구 + 가입 CTA | **색 블록 6장**(장식, `HERO_BLOCK_COLORS`) |
| 로그인 (`home-hero.tsx`) | 인사말·자녀 칩 + CTA | **실표지 3장**(`HeroCoverStack`) |

같은 `/` 안에서 로그인 여부로 히어로 인상이 갈리는 것은 "단일 메인"(D1)의 취지와
어긋난다. **구도를 하나로 고정**하고 데이터만 바꾼다.

### 결정

**A2-1 — 단일 구도.** 히어로는 항상 `좌: 텍스트 + CTA 1개` / `우: HeroCoverStack(실표지 3장)`이다.
색 블록 장식(`HERO_BLOCK_COLORS`)은 **폐기**한다.

**A2-2 — 공통 컴포넌트로 수렴.** 컨테이너·패널·radius·여백을 **`components/main/main-hero.tsx`**
한 곳이 소유한다. 상태별 히어로 컴포넌트(`landing/hero-section.tsx`·`home/home-hero.tsx`)는
폐기한다 — 클래스를 두 곳에 두면 "동일한지" 가 검수 항목이 되지만, 한 곳에 두면
**구조적으로 동일**해진다(§Amendment 2 합격 기준을 코드로 보장).

**A2-3 — 상태별로 바뀌는 것은 데이터뿐.**

| 항목 | 비로그인 | 로그인 |
|---|---|---|
| 제목·부제 | 랜딩 카피(`copy.hero`) | 인사말(`buildGreeting`) |
| 뱃지 | 없음 | 자녀 프로필 칩 |
| CTA | `copy.hero.ctaLabel` → `/signup` | "책 보러 가기" → `/library` |
| 표지 3장 | **인기 책 상위 3권** | **오늘의 추천 상위 3권** |
| 표지 링크 | `/signup` | `/book/[id]` |

**A2-4 — 신규 쿼리 0건.** 비로그인 히어로는 이미 조회한 `getPopularBooks()` 결과를
`slice(0, 3)` 해 쓴다. 로그인은 기존대로 `recommendation.books`를 쓴다.

**A2-5 — 표지 중복 허용.** 히어로 3장이 아래 섹션(비로그인=인기 책 그리드,
로그인=추천 캐러셀)과 겹친다. **제거하지 않는다** — 로그인 쪽이 이미 같은 구조였고
(Amd.1 부수 결정 3과 같은 판단), 히어로는 "지금 볼 수 있는 것"의 미리보기다.

**A2-6 — 불변 사항.** 표지 폴백(§7.3 색 블록+제목, 레이아웃 유지)과 §6.1 CTA 1개
규칙은 그대로다. `HeroCoverStack`은 `signedIn` prop으로 링크만 분기한다.

## 마이그레이션 순서

실측 기반. **각 단계가 끝날 때마다 타입체크·린트·빌드가 통과해야 한다.**

| # | 단계 | 대상 | 위험 |
|---|---|---|---|
| 1 | 푸터 일원화 | `AppFooter`에 사업자·저작권 이관, `app/page.tsx`가 `AppFooter` 사용 | 낮음 |
| 2 | 홈 블록 컴포넌트화 | `(reader)/home/page.tsx`의 데이터 fetch를 `lib/home/`의 함수 조합으로 유지한 채, 렌더 블록을 `/`에서도 쓸 수 있게 정리 | 중간 |
| 3 | `/` 3갈래 분기 구현 | `app/page.tsx` — 비로그인/자녀0/자녀≥1 | **높음** |
| 4 | 상수 전환 | `POST_LOGIN_PATH`·`HOME_PATH` → `/`, `PROTECTED_PREFIXES`에서 `/home` 제거 | **높음** |
| 5 | 하드코딩 3곳 | `lib/home/actions.ts:84` · `lib/admin/books/actions.ts:92` · `app/robots.ts:18` | **높음** |
| 6 | `/home` redirect | `next.config.js` `redirects()` 신설 + 라우트 삭제 | 중간 |
| 7 | `LandingFooter` 폐기 | 참조 0건 확인 후 삭제 | 낮음 |
| 8 | 회귀 검수 | 아래 목록 전수 | — |

**1~2를 먼저 하는 이유**: 3~5가 동시에 깨지면 원인 분리가 불가능하다. 되돌리기 쉬운
순서로 쌓는다.

## 회귀 위험 목록 (검수 체크리스트)

**라우팅**

1. 비로그인 `/` → 랜딩 (리다이렉트 0회)
2. 로그인+자녀≥1 `/` → 홈 블록 (리다이렉트 0회)
3. 로그인+자녀0 `/` → `/onboarding`
4. 비로그인 `/home` 북마크 → **`/`**(랜딩). `/login`으로 새지 않는지 — D2 순서 쟁점
5. 로그인 `/home` 북마크 → `/`(홈 블록)
6. 로그인 상태로 `/login`·`/signup` 진입 → `/` (`middleware.ts:32`)
7. 로그인 콜백(`/auth/callback`) 도착지 → `/` 또는 `/onboarding`
8. 온보딩 완료(`onboarding/actions.ts:73`) → `/`
9. 책 404 "홈으로"(`not-found.tsx:44`) → `/`
10. **리다이렉트 루프 부재** — `/` ↔ `/onboarding` ↔ `/home` 삼각 확인

**캐시·데이터**

11. `LevelSelector` 레벨 변경 → 추천 즉시 갱신 (`lib/home/actions.ts:84`
    `revalidatePath` 대상이 `/`인지). **누락 시 "레벨 바꿔도 추천 그대로" 증상**
12. 관리자 `is_active`·`level` 토글 → 메인 반영 (`lib/admin/books/actions.ts:92`)
13. 인기 책 랜덤 6권이 비로그인에서 매 요청 새로 뽑히는지 (ADR-0012 결정 3·6)

**SEO**

14. `robots.txt`에 `/home` 잔존 없음, `/` allow 유지
15. `sitemap.xml` `/` priority 1 유지
16. **비로그인 크롤러가 `/`에서 로그인 후 콘텐츠를 보지 못하는지** (closed environment)
17. `/`의 `metadata`·OG 이미지가 비로그인 기준으로 유지되는지 —
    로그인 상태에서 OG 태그가 개인화되면 안 된다(`app/page.tsx:25-41`)

**디자인 (ADR-0060)**

18. 화면 내 `bg-cta` 요소 = **1개** (두 상태 각각)
19. §7 변경 불가 4건 무영향 — AttributionBox·오디오 ⓘ·표지 폴백·라이트 강제
20. `AppHeader`의 `isActive` 판정 — `HOME_PATH`가 `/`가 되면
    `p === HOME_PATH`(`app-header.tsx:71`)가 `/`에서만 활성. **다른 경로에서
    홈 링크가 항상 비활성으로 보이지 않는지** 확인

## Alternatives

| 대안 | 장점 | 단점 | 선택 |
|---|---|---|---|
| (a) `/` 단일 메인 + 상태별 블록 | 진입점 1개. 로그인 후에도 `/`가 홈이라 멘탈 모델이 단순. 리다이렉트 왕복 1회 제거 | 분기가 한 페이지에 모임. 마이그레이션 위험 집중 | ✅ **채택** |
| (b) 현행 유지(`/` ↔ `/home` 분리) | 변경 0건 | 로그인 사용자가 `/`를 치면 매번 리다이렉트 1회. 히어로·섹션 패턴이 두 벌로 유지됨 | ✗ |
| (c) `/home`을 메인으로 하고 `/`를 redirect | 홈 코드 무변경 | `/`가 마케팅·SEO 진입점이라 포기 불가. sitemap priority 1 상실 | ✗ |
| (d) 미들웨어에서 상태별 rewrite | 페이지 분기 없음 | ADR-0009 3.4절("미들웨어=화면 가드") 모델 훼손. 매 요청 자녀 조회 발생(ADR-0011 결정 1 위반) | ✗ |

## Consequences

**긍정**

- 로그인 사용자의 `/` 접근에서 **리다이렉트 왕복 1회가 사라진다**.
- 히어로·섹션 헤더·카테고리 캐러셀을 **한 벌만** 유지한다(현재 랜딩 358행 + 홈 754행에
  중복 패턴 존재).
- 렌더링 비용 증가 0 — `/`는 이미 dynamic이고 미들웨어도 이미 `/`를 통과한다.

**부정**

- `app/page.tsx`가 3갈래 분기 + 두 벌 블록을 갖게 되어 **단일 파일 복잡도가 오른다**.
  블록을 컴포넌트로 확실히 뽑지 않으면 읽기 어려워진다(마이그레이션 2단계가 그 방어).
- **하드코딩 3곳**(`revalidatePath` 2 + `robots.ts` 1)이 조용히 틀릴 수 있다 —
  타입 검사에 걸리지 않고 화면도 즉시 깨지지 않는다. 회귀 목록 11·12·14가 유일한 그물이다.
- `/home` redirect를 영구 유지해야 한다(북마크 보호). 라우트는 사라져도 리다이렉트 항목은
  남는 부채다.

## Non-goals

- **`/library`·`/mypage` 통합** — 본 ADR 범위 밖. 각자 독립 화면으로 유지한다.
- **O-8·`degraded`·마이페이지 기능 변경** — 큐 D-5 소관.
- **랜딩 카피 DB 이관** — ADR-0012 결정 1 Amendment의 F28로 이연된 상태 그대로.
- **`AppHeader`·`LandingHeader` 병합** — D5에서 명시 배제.

## Open Questions

- **O-M1**: **Closed (2026-08-19) — 실측 완료. D2 원안(`next.config.js` redirects) 채택.**

  **측정 방법** (Next 14.2.35, dev, `.next` 삭제 후 기동): `next.config.js`에
  `{ source: '/home', destination: '/', permanent: true }` 임시 규칙만 넣고
  **쿠키 없는(비로그인) 요청**을 보냈다. 측정 후 규칙은 제거했다.

  | 경로 | 응답 | Location | 해석 |
  |---|---|---|---|
  | `/home` (프로브 규칙 있음) | **308** | `/` | `redirects()`가 **먼저** 평가됨 |
  | `/library` (대조군) | 307 | `/login` | 미들웨어 정상 동작 |
  | `/mypage` (대조군) | 307 | `/login` | 미들웨어 정상 동작 |
  | `/book/[id]` (대조군) | 307 | `/login` | 미들웨어 정상 동작 |

  리다이렉트 체인 추적에서도 `/home` → `/` **홉 1회**로 도착했다 —
  `/login` 경유가 없다. 상태코드도 갈린다: **308**은 `next.config`의
  `permanent: true`, **307**은 미들웨어의 `NextResponse.redirect`다.

  → **합격 기준 충족**: 비로그인 `/home` 북마크가 `/login`으로 새지 않고 `/`에 도달한다.
  대안(미들웨어 최상단 처리)은 불필요하므로 채택하지 않는다.
- **O-M2**: **Closed (2026-08-19) — 비로그인 타일은 `/signup`으로 보낸다.**
  `/library`는 보호 라우트라 비로그인이 누르면 `/login`으로 튀어 카테고리를 미끼로만 쓰고
  끝난다. 가입 동선으로 직결시킨다. 타일 자체는 **활성 링크로 유지**한다(비활성
  미리보기는 3~7세 부모에게 "고장난 화면"으로 읽힌다).
  → 구현: 캐러셀이 `href` 생성 규칙을 로그인 상태로 분기한다.
- **O-M3**: **Closed (2026-08-19) — `AppFooter` 전 화면 일원화 확정.**
  사업자 정보·저작권을 `AppFooter`로 이관해 비로그인 `/`와 로그인 후 화면 모두에
  노출한다. 전자상거래법 표기 의무 관점에서 유리하며(ADR-0061 O-F2 해소),
  `LandingFooter`는 폐기한다. 몰입 화면(`/read`·`/celebrate`) 미렌더는 불변(ADR-0061 D4).
- **O-M4**: **Closed (2026-08-19) — 정확 일치(`===`) 유지, `startsWith` 금지.**
  `HOME_PATH`가 `/`가 되면 `p === HOME_PATH`는 `/`에서만 참이라 의도대로 동작한다.
  `startsWith('/')`로 바꾸면 **모든 경로에서 홈이 활성**이 되므로 금지한다.
  `components/app/app-header.tsx`의 홈 링크 `isActive`는 정확 일치를 유지하며,
  이 사실을 해당 줄 주석에 못박는다.

---

*문서 끝. 본 ADR의 변경은 신규 ADR로 작성하고, 본 문서는 "Superseded by ADR-XXXX" 표시 후 유지한다.*
