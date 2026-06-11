# ADR-0021: 로그인 후 화면 공통 헤더 + (reader) route group 도입

**날짜** 2026-06-11
**상태** Accepted (베타 품질개선 트랙 작업2-A · phase 외부)
**관련** `docs/adr/0019-admin-system.md`(D13·D22 admin layout 헤더+nav 선례·usePathname 분리 패턴), `docs/adr/0015-screen-02-category-strategy.md`(Amendment #2 카테고리 라우팅 `/library?category=`), `docs/adr/0018-completion-rewards-and-library.md`(D12·D13 라이브러리·완독 동선), `docs/adr/0009-auth-architecture.md`(보호 라우트·`lib/auth/routes.ts` 중앙 상수), `docs/adr/0012-landing-page-static.md`(landing-header 랜딩 전용), `docs/backlog.md` §7.2 작업2, `claude.md` 2절 Hard Rule 10(semantic 토큰)

---

## 1. 맥락

phase-14 종결 후 베타 품질개선 트랙에서 다음을 실측 확정했다(2026-06-11 read-only 조사 2회):

- 로그인 후 화면 3종(`/home` · `/library` · `/book/[id]`)에 **홈↔라이브러리 상호 이동 메뉴가 0건**이다. 사용자는 홈에서 카테고리 카드로만 라이브러리에 가고, 라이브러리→홈 복귀 동선이 없다.
- `app/layout.tsx`는 `<body>{children}</body>`만으로 **공통 헤더 주입 지점이 없다**. `components/landing/landing-header.tsx`는 `/login`·`/signup` CTA + `LandingCopy` 의존으로 **랜딩 전용**이라 로그인 후 화면 재사용 불가(ADR-0012 결정 2).
- 세 page의 인라인 `<header>`는 실질 기능이 **로그아웃 form 하나뿐**이며, 3곳 마크업이 100% 동일(박제 직역)하다. → 중복 수렴 여지.
- route group(괄호 폴더)은 현재 **0건**. 중첩 layout은 `app/admin/layout.tsx` **단 1개**뿐이고, 이는 이미 "인증영역 전용 layout = 헤더 + nav(usePathname client 분리) + `{children}`"을 입증한 선례다(ADR-0019 D13·D22).
- 활성표시(usePathname)의 유일한 선례는 `components/admin/admin-nav.tsx`이며 `aria-current="page"` + `bg-surface-2 text-text` 토큰 패턴을 검증 완료.

**핵심 제약(구조적 사실):** `app/book/[id]/` 하위 4개 파일(`page` · `read` · `celebrate` · `not-found`)은 **`[id]` 동적 세그먼트를 공유**한다. route group은 `[id]` 바깥 레벨에만 끼울 수 있으므로 `book/[id]`를 route group으로 옮기면 **4개 파일이 분리 불가능하게 함께 이동**하고 모두 그룹 layout의 적용 대상이 된다. read(`<main flex-1 overflow-hidden>`)·celebrate(`<main min-h-screen justify-center>`)는 유아 몰입 화면이라 헤더가 새면 안 된다(ADR-0018 동선 + `book/[id]/page.tsx:104` 박제 "리더·완독은 몰입 화면이라 로그아웃 UI off-pattern으로 제외").

---

## 2. 후보 옵션 비교

### 2.1 주입 위치

| 옵션 | 방식 | URL 영향 | layout 수렴 | 기각 사유 |
|---|---|---|---|---|
| A-root | `app/layout.tsx`에 직접 헤더 주입 | — | — | 랜딩·로그인·가입·온보딩까지 모든 화면 공통 조상이라 헤더가 샘. ✗ |
| B-컴포넌트 | route group 없이 `<AppHeader/>`를 3 page가 각자 호출 | 불변 | ✗(3곳 반복) | 신규 페이지마다 수동 삽입. layout 미수렴. ✗ |
| **C ★ 채택** | **route group `app/(reader)/` 신설 + 그룹 layout 1곳 주입** | **불변(괄호는 경로 미반영)** | **✅ layout 1곳** | admin layout 선례와 동형. **채택** |

### 2.2 몰입 화면(read·celebrate·not-found) 헤더 차단

| 옵션 | 방식 | page 수정 | 선례 | 기각 사유 |
|---|---|---|---|---|
| **1 ★ 채택** | **공통 헤더를 client 컴포넌트로 만들어 `usePathname()`이 몰입/404 경로면 `null` 반환** | **0건** | **admin-nav usePathname 패턴 재사용(검증)** | **채택** |
| 2-구조분리 | `(reader)/book/[id]/` 아래 read·celebrate 감싸는 추가 중첩 layout 신설 | 0건 | 없음 | `[id]` 세그먼트 공유 제약상 중첩 layout 2단 강제 → 컨테이너·배경 토큰 충돌 위험, 구조 복잡도↑. ✗ |

---

## 3. 결정

### D1 — route group `app/(reader)/` 신설 (옵션 C)

`app/home` · `app/library` · `app/book`을 `app/(reader)/` 아래로 `git mv` 이동한다. 괄호 route group은 URL 경로에 반영되지 않으므로 `/home` · `/library` · `/book/[id]` URL은 **전부 불변**이다. 상대 import 0건·외부 소스 import 0건(`.next/types`만, 빌드 시 재생성)이 사전 점검으로 확정되어 이동은 안전하다.

`read` · `celebrate` · `not-found`는 `book/[id]` 하위라 함께 이동된다(분리 불가, §1 제약). 이는 의도된 동작이며 D3로 헤더 노출을 차단한다.

### D2 — 그룹 layout `app/(reader)/layout.tsx` 신설, 컨테이너 미수렴

`app/(reader)/layout.tsx`는 `<AppHeader/>` + `{children}`만 조립한다. **본문 컨테이너(`<main min-h-screen bg-surface-2 py-6>` + `<div mx-auto max-w-screen-* px-*>`)는 layout으로 올리지 않고 각 page가 그대로 유지**한다. 사유: read·celebrate는 자체 풀스크린 `<main>`을 가지므로 layout이 좁은 컨테이너를 강제하면 중첩·충돌로 풀스크린이 깨진다. 따라서 컨테이너는 page 책임으로 두고 layout은 헤더 바만 제공한다(Hard Rule 10 — 신규 토큰 0건, 본문과 정합되는 `max-w-*` 재사용).

### D3 — 공통 헤더 = client 컴포넌트 + usePathname 경로 분기 (옵션 1)

`components/app/app-header.tsx`(`'use client'`)는 `usePathname()`으로 `/book/*/read` · `/book/*/celebrate`(정규식 `/^\/book\/[^/]+\/(read|celebrate)$/`) 경로에서 **`null`을 반환(미렌더)**한다. admin-nav의 검증된 usePathname 패턴을 재사용하며 read·celebrate page 수정은 0건이다.

**Amendment #1 (2026-06-11, 구현 중 정정) — book not-found는 헤더 노출 허용.** 당초 not-found도 미노출 대상으로 적었으나, Next.js App Router에서 `notFound()`는 요청 URL을 그대로 유지한 채 not-found.tsx를 렌더하므로 **book not-found의 pathname(`/book/<uuid>`)이 성공한 책 상세와 완전히 동일** → usePathname 단독으로 구별 불가(실측 확정). 또한 404는 유아 몰입 화면이 아니라 오류 화면이므로 홈↔라이브러리 네비 제공이 오히려 탈출 동선 UX 이득이다. 따라서 book not-found에는 공통 헤더를 노출한다(PM 결정 2026-06-11). 미렌더는 read·celebrate 두 몰입 화면으로 한정한다.

### D4 — 헤더 내용 = 홈↔라이브러리 이동 + 로그아웃, 자녀칩 1차 제외

헤더는 (1) 홈(`/home`)↔라이브러리(`/library`) 이동 `<Link>` + 활성표시(admin-nav 패턴: `aria-current="page"` + `bg-surface-2 text-text` 활성 / `text-text-variant hover:...` 비활성), (2) 로그아웃 form(기존 3곳 박제 직역: `action="/auth/sign-out" method="post"` + 토큰 동일)을 포함한다.

- **자녀 프로필칩은 1차 제외** — book 상세는 현재 `getActiveChild`를 호출하지 않으며(`book/[id]/page.tsx:38` "책 상세는 자녀 무관"), 칩을 넣으면 book에 fetch 추가가 강제되어 헤더 단순성·성능을 해친다. 다자녀 토글 도입(active-child.ts 확장) 시 재검토.
- **라이브러리 h1+subtitle은 헤더 미통합** — page 본문에 잔류한다(콘텐츠 성격).

### D5 — 네비 경로 상수 중앙화 검토

`lib/auth/routes.ts`에 `POST_LOGIN_PATH='/home'`는 있으나 네비용 `HOME_PATH`·`LIBRARY_PATH`는 미중앙화 상태였다(`celebrate/page.tsx:69`가 로컬 `const LIBRARY_PATH='/library'` 선언). **결정(2026-06-11, PM): routes.ts에 `HOME_PATH`·`LIBRARY_PATH` 중앙화** — AppHeader가 import한다. `POST_LOGIN_PATH`는 의미(리다이렉트 도착지)가 달라 유지. `celebrate/page.tsx`의 로컬 `LIBRARY_PATH` 중복 통일은 후속 과제(본 작업 범위 외).

---

## 4. 결과 (Consequences)

**긍정**:
- 홈↔라이브러리 동선 확보(베타 UX 차단 해소). 로그아웃 3곳 중복 → 헤더 1곳 수렴.
- route group으로 URL 불변 유지하며 layout 수렴. 신규 로그인 후 페이지는 `(reader)/` 아래 생성만으로 헤더 자동 상속.
- admin layout·admin-nav 선례 재사용으로 신규 패턴 0건.

**부정·주의**:
- read·celebrate·not-found가 그룹 layout 적용 대상이 되므로 usePathname 경로 매칭 문자열 누락 시 헤더 노출 → STEP 4 수동 검증(5경로)으로 커버.
- `git mv`는 리네임+이동이라 단계별 분리 커밋 불가 → STEP 1 통합 커밋 허용.

**영향 범위**: 신규 `app/(reader)/layout.tsx` + `components/app/app-header.tsx` 2파일. 이동 3트리(home·library·book). 정리 = home·library·book 각 page의 `<header>`(로그아웃 form) 제거. read·celebrate·not-found 수정 0건. DB·스키마 변경 0건. `tasks/_index.json` 무변경(phase 외부 트랙).

---

## 5. 상호 참조

- ADR-0019 D13·D22: admin layout 헤더+nav 구조 + usePathname client 분리 선례
- ADR-0018 D12·D13: 라이브러리·완독 동선(read·celebrate 몰입 성격)
- ADR-0015 Amendment #2: 카테고리 라우팅 `/library?category=`(홈→라이브러리 기존 동선)
- ADR-0009 + `lib/auth/routes.ts`: 보호 라우트·경로 중앙 상수
- `docs/backlog.md` §7.2 작업2: 본 ADR 대상 작업 항목
- read-only 사전점검(2026-06-11): 상대 import 0건·외부 소스 import 0건·book/[id] 4파일 세그먼트 공유 확정
