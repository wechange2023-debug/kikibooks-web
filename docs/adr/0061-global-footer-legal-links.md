# ADR-0061: 공통 푸터 및 법적 링크 도달성

## Status

**Proposed** (2026-08-19 초안) / 기준 HEAD `f0fad59`

본 문서는 **결정문 초안만** 담는다. **본 ADR과 함께 만들어진 코드 변경은 0건**이다.
구현은 큐 D 디자인 리뉴얼(D-3 이후)과 함께 수행한다 — 같은 레이아웃을 두 번 열지 않기
위함이다.

## Deciders

팀장, 오케스트레이터

## Related

- **ADR-0021 D1·D2·D3** — `(reader)` route group · AppHeader의 몰입 화면 분기 패턴(준용 원본)
- **ADR-0013 결정 2** — CC BY 안내 문구는 **표지를 노출하는 화면의 어트리뷰션 하한선**
- **ADR-0013 결정 3** — 4요소 완전 표시 의무는 **책 상세 페이지**가 진다
- **ADR-0060** — 디자인 시스템 v2 (같은 리뉴얼 파도, 본 ADR과 병행)
- `docs/guidelines/license-rules.md` §5
- **큐 D-0 현황 조사**(2026-08-19, 읽기 전용 실측) — 본 ADR의 모든 경로·수치 근거
- ~~ADR-0020~~ — **무관**. 아래 §Context 2 참조

## Context

### 1. 증상 — 약관·개인정보 링크 도달 경로가 1곳뿐이다 (D-0 실측)

- 푸터 컴포넌트는 `components/landing/landing-footer.tsx` **1개뿐**이다.
- 사용처는 `app/page.tsx:87` **단 1곳**(랜딩)이다.
- `/terms`·`/privacy`로 가는 링크는 저장소 전역에서
  `components/landing/landing-footer.tsx:28`·`:34` **2건뿐**이다.
- `app/(reader)/layout.tsx`에는 푸터가 **0건**이다(`:29` `AppHeader`만 렌더).

즉 로그인 이후 사용자는 **랜딩으로 되돌아가지 않는 한 약관·개인정보처리방침에 도달할 수
없다.** `/terms`·`/privacy` 페이지 자신도 푸터가 없어 **두 법적 문서 사이의 상호 이동도
불가능**하다.

### 2. UI 푸터를 결정한 ADR은 존재하지 않는다

ADR-0020(「키키북스 Commit Footer 0건 정책」)은 **git commit trailer**(`Co-Authored-By:`)
금지 결정으로, Vercel Hobby plan의 배포 차단 회피가 목적이다(D1~D5). **UI 푸터와 전혀
무관**하며 본 ADR의 선행 결정이 아니다.

현재 랜딩 푸터의 유일한 근거는 ADR-0013 결정 2이며, 그 취지는
`components/landing/landing-footer.tsx:8-10` 주석에 박제돼 있다:

> CC BY 안내 문구(attributionNotice)는 표지를 노출하는 화면의 어트리뷰션 **하한선**이다
> (ADR-0013 결정 2). 4요소 완전 표시 의무는 **책 상세 페이지**가 진다(ADR-0013 결정 3).

### 3. 라우트 구조 실측 — `(reader)` 그룹의 실제 범위

`app/` 하위 `page.tsx` **20개** 중 `(reader)` route group에 속한 것은 **6개**다.

| 그룹 | 라우트 | 현재 푸터 |
|---|---|---|
| `(reader)` | `/home` · `/library` · `/mypage` · `/book/[id]` | 없음 |
| `(reader)` (몰입) | `/book/[id]/read` · `/book/[id]/celebrate` | 없음 (의도) |
| 최상위 | `/` (랜딩) | **있음** (`LandingFooter`) |
| 최상위 | `/terms` · `/privacy` | 없음 |
| 최상위 | `/showcase` · `/showcase/[source]` | 없음 |
| 최상위 | `/login` · `/signup` · `/onboarding` · `/auth/auth-error` | 없음 |
| `admin` | `/admin` · `/admin/books` · `/admin/users` · `/admin/review` · `/admin/review/[bookId]` | 없음 (의도) |

`layout.tsx`는 `app/layout.tsx`(루트) · `app/(reader)/layout.tsx` · `app/admin/layout.tsx`
**3개뿐**이다. 즉 `(reader)` 밖의 사용자 화면들은 **공통 레이아웃을 공유하지 않는다.**

### 4. 준용할 패턴 — AppHeader의 몰입 화면 분기 (ADR-0021 D3)

`components/app/app-header.tsx`:

- `:52` `const IMMERSIVE_ROUTE_RE = /^\/book\/[^/]+\/(read|celebrate)$/` — **정확한 세그먼트 매칭**
- `:88` `usePathname()` · `:90-92` 일치 시 `return null`
- `'use client'` 컴포넌트이며, `app/(reader)/layout.tsx`는 **server component를 유지**한 채
  분기 책임을 자식에게 위임한다(`layout.tsx:14-15`)

`:19-20` 주석이 기록한 알려진 한계: **book not-found는 책 상세와 URL이 동일**하므로
(`notFound()`는 요청 URL을 그대로 렌더) `usePathname`으로 구별할 수 없어 헤더가 노출된다.
푸터도 동일한 한계를 갖는다.

## Decision

### D1 — `app/(reader)/layout.tsx`에 공통 푸터를 도입한다

`AppHeader` 아래에 `AppFooter`를 추가한다. `layout.tsx`는 **server component를 유지**하고,
경로 분기는 `AppFooter`가 `'use client'` + `usePathname`으로 자체 처리한다 — ADR-0021 D3의
책임 분리를 그대로 준용한다.

```
<>
  <AppHeader />
  {children}
  <AppFooter />
</>
```

`children` **뒤**에 둔다. ADR-0021 D2에 따라 각 page가 자체 컨테이너(`<main>`)를 보유하므로
layout은 헤더·푸터 바만 제공한다.

### D2 — 푸터 내용

1. `/terms` 링크 · `/privacy` 링크
2. **CC BY 안내 1행** — 현행 랜딩 푸터 문구를 그대로 재사용한다:

   > 모든 도서는 CC BY 4.0 라이선스이며, 글·그림 저작자와 원본 출처는 각 책 상세 페이지에
   > 표시됩니다.

   근거: `lib/landing/copy.ts:107-108`. ADR-0013 결정 2의 **하한선**을 (reader) 화면 전반으로
   확장하는 것이며, 4요소 완전 표시 의무의 소재는 **책 상세 페이지 그대로**다(ADR-0013 결정 3).

시각 설계(레이아웃·타이포·색)는 ADR-0060의 v2 팔레트를 따른다. 본 ADR은 **내용과 도달성만**
결정한다.

### D3 — 문구 단일 출처를 `lib/` 공용 모듈로 승격한다

현행 문구는 `lib/landing/copy.ts`의 `LANDING_COPY` 상수 안에 있고, 이 상수는
**의도적으로 export되지 않는다**(`:60` 주석 — "컴포넌트 직접 import 차단"). 공개 API는
`getLandingCopy()`(`:120`) 하나뿐이다.

따라서 (reader) 푸터가 이 문자열을 쓰려면 둘 중 하나가 필요하다:

- (가) 비-랜딩 화면이 `getLandingCopy()`를 호출 → **랜딩 카피에 결합**된다. 기각.
- (나) **CC BY 안내 문구를 `lib/` 공용 상수로 승격**하고, 랜딩 푸터와 (reader) 푸터가
  **둘 다 그것을 참조**한다. ✅ **채택**

선례는 `lib/brand.ts`다 — `import 'server-only'`를 붙이지 않아 클라이언트 컴포넌트도
참조할 수 있고, "문자열을 새로 쓰지 말고 반드시 본 상수를 참조한다"는 사용 규칙이 이미
박제돼 있다. 푸터는 `'use client'`이므로 **`server-only`를 붙이면 안 된다.**

문구 자체는 **변경하지 않는다**(현행 그대로 이관).

### D4 — 몰입 화면(`/read`·`/celebrate`)은 미렌더

`AppHeader`와 **동일한** `IMMERSIVE_ROUTE_RE` 정규식을 사용한다.
정규식을 두 곳에 복제하지 말고 **공용 상수로 추출해 헤더·푸터가 공유**한다 —
복제하면 한쪽만 고쳐지는 순간 헤더는 숨고 푸터는 남는 상태가 된다.

사유: 유아 몰입 화면이며, 리더는 `h-screen` 고정 레이아웃이라
(`read/page.tsx:222` `flex h-screen flex-col`) 푸터가 들어가면 본문 높이 계산이 깨진다.
`/read`의 완독 버튼은 이미 자체 `<footer>`를 갖고 있다(`read/page.tsx:259-261`).

### D5 — 구현 시점

큐 D 디자인 리뉴얼 **D-3 이후**. 단독 선행하지 않는다 — 푸터 시각 설계가 ADR-0060의 v2
팔레트에 의존하므로, 먼저 만들면 두 번 그리게 된다.

**D6·D7도 같은 시점에 함께 수행한다.** 세 항목은 동일한 푸터 자산을 공유하므로 분리하면
같은 컴포넌트를 세 번 열게 된다.

### D6 — `/showcase`·`/showcase/[source]`도 적용 대상에 포함한다

**근거**: 두 화면 모두 **표지를 렌더한다** — `app/showcase/[source]/page.tsx:64`가
`cover_url`을 SELECT하고 `app/showcase/showcase-book-card.tsx:61`이 렌더한다.
따라서 ADR-0013 결정 2의 *"CC BY 안내 문구는 **표지를 노출하는 화면**의 어트리뷰션
하한선"* 이 그대로 적용되는 표면이며, 현재 그 안내가 **0건**이다.

**방법**: `app/showcase/`에는 현재 `layout.tsx`가 **없다**(`page.tsx` ·
`[source]/page.tsx` 2개 라우트뿐). **`app/showcase/layout.tsx`를 신설**해 두 라우트를
한 번에 덮는다. 각 page가 개별 렌더하는 방식은 채택하지 않는다 — §Alternatives (c)와
동일한 실패 모드(신규 라우트에서 누락)다.

**최소 요건은 CC BY 안내 1행**(D2-2)이다. `/terms`·`/privacy` 링크 동반은 필수가 아니나,
별도 컴포넌트를 새로 만들지 않고 **`AppFooter`를 그대로 재사용하는 것을 기본**으로 한다
(세 요소가 함께 오며 자산이 하나로 유지된다).

> **주의 — 쇼케이스는 검수용 임시 라우트다.**
> `components/app/app-header.tsx:79` 주석: *"검수용 임시 메뉴 — 서비스 전환 시 제거
> 대상(app/showcase 삭제와 함께)"*. 그러나 **삭제 전까지는 로그인 사용자에게 도달 가능한
> 표지 노출 표면**이므로 안내 의무가 성립한다. 라우트 삭제 시 `app/showcase/layout.tsx`도
> 함께 제거한다.

### D7 — `/terms` ↔ `/privacy` 상호 링크를 `LegalPageShell`에 추가한다

**현행**: `components/legal/legal-page-shell.tsx:37-42`에 `← {BRAND_NAME} 홈` 링크
**1개뿐**이다. 두 법적 문서가 서로를 링크하지 않아, 한쪽에 도달한 사용자가 다른 쪽으로
이동하려면 랜딩까지 되돌아가야 한다.

**결정**: 셸 본문 하단에 **상대 문서로 가는 링크 1개**를 추가한다
(`/terms`에서는 "개인정보처리방침", `/privacy`에서는 "이용약관").

**구현 주의 2건**:

1. 셸은 `doc: LegalDocument` **prop 1개만** 받으므로(`:29-31`) 현재 문서를 식별할 수 없다.
   `doc.title` 문자열 비교로 분기하지 말 것 — 문안 개정에 취약하다.
   **명시적 prop을 추가**한다(예: `current: 'terms' | 'privacy'`).
   호출부는 `app/terms/page.tsx`·`app/privacy/page.tsx` **2곳뿐**이다.
2. 셸은 **server component**다(`:12` 주석 "서버 컴포넌트"). `usePathname`을 쓰기 위해
   `'use client'`로 전환하지 **말 것** — 1번 방식이면 클라이언트 경계가 불필요하다.

법적 문서 페이지에 `AppFooter` 전체를 넣지는 않는다. `(reader)` 밖이라 레이아웃을
공유하지 않고, 셸이 이미 자체 `<main>` 컨테이너를 보유하기 때문이다.

## Alternatives

| 대안 | 장점 | 단점 | 선택 |
|---|---|---|---|
| (a) `(reader)/layout.tsx`에 공통 푸터 (+ D6 showcase layout, D7 legal shell) | 로그인 후 주요 4화면을 1곳 수정으로 커버. ADR-0021 패턴 재사용. 표지 노출 표면을 D6이 마저 덮는다 | 편집 지점이 3곳(reader layout · showcase layout · legal shell). 가입 동선(`/login`·`/signup`·`/onboarding`)은 여전히 미커버 | ✅ **채택** |
| (b) `app/layout.tsx`(루트)에 푸터 | 20개 라우트 전부 커버 | `/admin`·`/login`·몰입 화면까지 들어와 **제외 목록이 포함 목록보다 길어진다**. 루트 layout은 `<body>` 소유라 영향 범위가 과하다 | ✗ |
| (c) 각 page가 개별 렌더 | 세밀한 제어 | 20곳 중복. 신규 라우트에서 누락된다 — 현 상태가 정확히 이 실패 모드다 | ✗ |
| (d) AppHeader에 약관 링크 추가 | 푸터 신설 불요 | 헤더는 이미 4링크(홈·라이브러리·마이페이지·쇼케이스)로 390px 반응형 한계가 논의된 상태(ADR-0024 O3-R). CC BY 안내 1행을 넣을 자리도 없다 | ✗ |

## Consequences

**긍정**

- 로그인 후 주요 4화면(`/home`·`/library`·`/mypage`·`/book/[id]`)에서 약관·개인정보 도달이
  가능해진다.
- **D6으로 ADR-0013 결정 2의 CC BY 하한선이 표지 노출 표면 전부를 덮는다** —
  랜딩(기존) + `(reader)` 4화면(D1) + 쇼케이스 2라우트(D6). 남는 표지 노출 표면은 0건이다.
- **D7로 두 법적 문서가 상호 도달 가능해진다.**
- D3의 공용 상수 승격으로 문구 이중 관리가 생기지 않는다.

**부정**

- 편집 지점이 3곳으로 늘었다(`(reader)/layout.tsx` · `app/showcase/layout.tsx` 신설 ·
  `legal-page-shell.tsx`). 셋 다 같은 시점에 처리하지 않으면 표면별로 안내가 엇갈린다.
- 가입 동선(`/login`·`/signup`·`/onboarding`)과 `/auth/auth-error`는 **여전히 푸터가 없다**.
  표지를 노출하지 않아 ADR-0013 결정 2의 대상이 아니며, 약관 도달성만의 문제다 → **O-F1**.
- D6의 `app/showcase/layout.tsx`는 쇼케이스 라우트 폐기 시 **함께 제거해야 하는 부채**다
  (`app-header.tsx:79` — 검수용 임시 메뉴).
- `/book/[id]` not-found는 URL이 책 상세와 동일해 `usePathname`으로 구별 불가하므로,
  헤더와 마찬가지로 푸터가 노출된다(ADR-0021 D3의 기존 한계 승계).

## Non-goals

- **약관·개인정보 본문 개정** — 별건. 다만 큐 D-1에서 법정대리인 동의 문구 정합화가
  병행된다.
- **`/admin` 푸터** — 관리자 화면은 대상 아님.
- **쿠키 배너·동의 관리** — 본 ADR 범위 밖.
- **푸터 시각 설계 확정** — ADR-0060 v2 소관.

## Open Questions

- **O-F1**: **결정부로 승격됨 (2026-08-19, 팀장 지시).** 초안 시점에는 `(reader)` 밖 화면의
  푸터 처리를 미결로 두었으나, 제기된 2건이 그대로 결정으로 채택됐다 —
  **`/showcase`·`/showcase/[source]` → D6**, **`/terms` ↔ `/privacy` 상호 링크 → D7**.
  구현 시점은 D5와 동일하다.

  **잔여 범위**: `/login`·`/signup`·`/onboarding`·`/auth/auth-error`는 여전히 미커버다.
  표지를 노출하지 않아 ADR-0013 결정 2의 대상이 아니고, 약관 도달성만의 문제이며
  가입 동선이라 우선순위가 낮다. **본 ADR 범위 밖으로 둔다.**
- **O-F2**: 푸터에 사업자 정보(`lib/landing/copy.ts:105` "주식회사 위체인지 (WECHANGE)")와
  저작권 표기(`:106`)를 함께 넣을지. 전자상거래법상 표기 의무는 유료 결제 도입 시 발생하며,
  현재는 무료 베타다.

---

*문서 끝. 본 ADR의 변경은 신규 ADR로 작성하고, 본 문서는 "Superseded by ADR-XXXX" 표시 후 유지한다.*
