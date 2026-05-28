# ADR-0012 — Screen 01 랜딩 페이지 정적 구현 (phase 분할·카피 단일 출처·렌더링·로그인 분기)

**상태** Accepted
**날짜** 2026-05-19
**관련** `docs/adr/0009-auth-architecture.md`(POST_LOGIN_PATH·미들웨어 중앙 가드), `docs/adr/0011-onboarding-flow.md`(결정 1 — 분기는 로그인 도착 지점, `resolvePostLoginPath`), `docs/adr/0013-cover-attribution-policy.md`(표지 어트리뷰션 — 본 ADR과 함께 phase-09a 생성), `docs/intent/screen-01-landing.md`(사용자 흐름), `tasks/phase-09a-screen-01-landing-static.json`, `tasks/_index.json`(phase 분할 반영), `supabase/migrations/001_initial_schema.sql`(books 테이블·공개 SELECT 정책·license 트리거), `docs/design-system.md`(컬러·타입·Button·Card 토큰), `PLAN.md` 9절(Screen 01)·15절(closed env), `claude.md` 2절 Hard Rule 6·8·10·5절 라우팅·10절

---

## 1. 배경

phase-08(온보딩)이 완료되어 인증·세션·보호 라우트·자녀 등록 분기가 동작한다. phase-09는 PLAN.md 9절의 Screen 01 — 비로그인 방문자가 가입을 결심하게 만드는 랜딩 페이지(`/`) — 를 구현한다.

phase-09 진입 전, 새 세션이 임의 결정하면 안 되는 항목을 사용자와 사전 합의했다(2026-05-19). 핵심 쟁점은 두 가지였다. (1) PLAN.md가 말하는 "인기 책"은 베타 시점에 조회수·완독수 데이터가 없어 알고리즘이 무의미하다. (2) PLAN.md 9절 Screen 01 명세에는 "랜딩 카피 관리"와 "책 큐레이션"을 운영자가 다룰 Admin이 암시되지만, 보호 라우트·권한·운영 도구가 아직 없다.

본 ADR은 그 결과로 도출된 **phase-09의 분할**과 **랜딩 정적 구현(phase-09a)의 설계 결정**을 박제한다. 표지 노출 시 어트리뷰션 정책은 화면을 가로지르는 별도 정책이라 `ADR-0013`으로 분리했다.

---

## 2. 결정

### 결정 1 — phase-09를 phase-09a + phase-13b로 분할

`phase-09-screen-01-landing`을 둘로 나눈다.

- **phase-09a (지금 진행)** — `phase-09a-screen-01-landing-static`. 랜딩 페이지 정적 구현. 카피는 단일 출처 상수, 인기 책은 랜덤 6권.
- **phase-13b (모든 Screen 화면 완료 후)** — `phase-13b-admin-system`. Admin 시스템(랜딩 카피 관리 + 책 큐레이션 + 사용자 관리).

분할 근거: 베타 데이터가 없는 시점에 "인기순" 알고리즘은 무의미하고, Admin 시스템은 보호 라우트·권한·운영 도구가 갖춰진 후가 적합하다. `tasks/_index.json`은 `total_phases` 14→15, `phase-09` 항목을 `phase-09a`로 교체, `phase-13b`를 phase-13 뒤에 삽입하도록 갱신한다(claude.md 10절 — 본 문서 자체의 구조 변경을 ADR에 기록).

**phase-13b CP1-adr Amendment (2026-05-28).** phase-13b 착수 시 CP1 선행 점검에서 (1) 랜딩 카피 DB 편집은 `landing_copy` 신규 테이블 = 마이그레이션 002 = Hard Rule 8 사용자 사전 승인 트리거이고 (2) 베타 운영자가 사용자 수·자녀 수·완독 세션 수·활성 책 수를 한 화면에서 진단할 통계 대시보드가 공백이라는 사실이 드러났다. 사용자 사전 결정(Q1·Q3, 2026-05-28)으로 phase-13b 1차 범위를 다음 4기능으로 정정한다 — (a) admin 토대 (b) 콘텐츠 큐레이션(`books.is_active` 토글 + `books.level` 수정) (c) 사용자·자녀 조회 read-only (d) 통계 대시보드 read-only. 랜딩 카피 DB 편집은 phase-13b scope_out으로 이연(follow_up F28 → phase-13c 또는 phase-2). 정적 `getLandingCopy()`(본 ADR 결정 2 박제, `lib/landing/copy.ts`)는 phase-13b 동안 무변경 유지된다. 본 Amendment는 결정 1 phase 분할 근본(phase-09 → phase-09a + phase-13b 신설·total_phases 14→15·삽입 위치)을 변경하지 않고, phase-13b 범위만 정정한다. admin 시스템 정책의 단일 출처는 본 ADR과 동시 작성된 [ADR-0019](./0019-admin-system.md)이며, 본 ADR(0012) 본문 결정 2~7은 무변경.

### 결정 2 — 랜딩 카피 단일 출처 + `getLandingCopy()` 추상화

랜딩의 모든 문구(메인 카피·서브 카피·CTA 라벨·핵심 가치 4개·푸터 회사 정보·어트리뷰션 안내)는 `lib/landing/copy.ts` 한 파일에서 정의한다. 구조는 `LandingCopy` 인터페이스 + `LANDING_COPY` 상수 + `async getLandingCopy(): Promise<LandingCopy>` 함수다.

컴포넌트는 카피 상수를 직접 import하지 않는다 — 이 금지를 규율이 아닌 컴파일 단계 강제로 만들기 위해 `LANDING_COPY` 상수는 `export`하지 않는다(모듈 비공개). 컴포넌트는 `import type { LandingCopy }`(타입 전용, 런타임에서 제거됨)만 쓰고, `/` 페이지가 `getLandingCopy()`를 호출해 그 결과를 하위 컴포넌트에 **props로** 내려준다. phase-13b에서 Admin이 카피를 DB(`landing_copy` 테이블)로 관리하게 되면 `getLandingCopy()`의 본문만 DB 조회로 교체하면 되고, `LandingCopy` 인터페이스와 컴포넌트 props는 그대로다 — **컴포넌트 수정 0건**으로 교체된다.

### 결정 3 — 인기 책은 랜덤 6권, DB 함수 미생성

인기 책 섹션은 `books`에서 `is_active = true`인 책 중 6권을 랜덤으로 노출한다. 베타에 인기 데이터가 없어 알고리즘 대신 랜덤을 쓴다.

Supabase JS 클라이언트는 `ORDER BY RANDOM()`을 직접 지원하지 않는다. 이를 위해 PostgreSQL RPC 함수를 만들면 DB 객체 추가 = Hard Rule 8(DB 변경 시 ADR·마이그레이션 선행)이 발동한다. phase-08처럼 **DB 스키마 변경 0건**을 유지하기 위해, 랜덤 선정은 애플리케이션 코드(`lib/landing/popular-books.ts`)에서 처리한다 — 활성 책 id 목록을 조회해 JS에서 6개를 무작위로 고른 뒤 그 6건만 다시 조회한다.

**phase-09a CP3 보강 (2026-05-19).** CP3 표지 진단에서 GDL 표지 28% 정상률(842권 중 약 606권이 404)이 발견됐다. 근본 원인은 `sync_gdl.py`가 GDL API의 실제 표지 URL 대신 `h5pId` 템플릿으로 URL을 조립한 것이다. 랜딩 임시 조치로 `getPopularBooks`에 `source_platform = 'book_dash'` 필터를 적용한다 — Book Dash 90% 정상률 안에서 랜덤 6권을 뽑는다. `phase-09b`(content-quality-fix)에서 `sync_gdl.py` 정정 + GDL 재동기화가 끝나면 전 카탈로그 환원을 재검토한다.

**phase-09b CP3 환원 (2026-05-20).** sync_gdl.py가 thumbnail 필드 우선으로 정정되어(ADR-0014 결정 1) GDL 표지 정상률이 CP3 v6 측정에서 100%(100/100 표본, random.seed=42)를 달성했다. 따라서 옵션 Y(`source_platform='book_dash'` 한정 필터)를 환원하고 전 카탈로그(gdl 842 + book_dash 54, 총 896권)를 인기 책 후보로 복원한다. 단 Book Dash 4건의 GitHub Pages 미배포 cover.jpg를 사전 차단하기 위해 `lib/landing/popular-books.ts`에 `BOOK_DASH_404_SOURCE_IDS` UUID 블랙리스트를 두고 다중 `.neq()` 체인으로 적용한다(ADR-0014 결정 2). 환원 후 v7 사용자 클릭 측정: 36/36 = 100%(6회 새로고침, 임계 90% +10%p 마진, 4 슬러그 노출 0건).

### 결정 4 — 로그인 사용자의 `/` 접근은 페이지 컴포넌트가 분기

로그인 상태로 `/`에 접근하면 `/` 페이지(서버 컴포넌트)가 `auth.getUser()`로 세션을 확인하고, phase-08의 `resolvePostLoginPath()` 헬퍼 결과(자녀 있으면 `/home`, 없으면 `/onboarding`)로 `redirect()`한다.

`middleware.ts`와 `lib/auth/routes.ts`는 **수정하지 않는다**. `/`는 `PROTECTED_PREFIXES`에 넣지 않아 공개 라우트로 둔다. 분기 로직을 공개 라우트인 `/`에 대해 미들웨어 가드에 끼워넣으면 phase-07·08이 세운 "미들웨어 = 보호/인증 라우트 가드" 모델이 흐려진다. 분기는 ADR-0011 결정 1과 같은 철학으로 "도착 지점 1회"에서만 한다.

### 결정 5 — 핵심 가치 ① 카피를 "890권이 넘는 영어 그림책"으로 확정

원래 핵심 가치 ①은 "AI 기반"이었다. 베타 추천 로직은 단순 룰베이스(레벨 ±1)라 "AI"는 마케팅 과장이다. ①을 **"890권이 넘는 영어 그림책"**으로 바꾼다 — 구체적 적재량 기반이라 100% 사실이고 검증 가능하며, 나머지 가치(②나이별 맞춤·③광고 없이 안심·④무료)와 의미가 겹치지 않는다.

현재 적재량은 896권(Book Dash 54 + GDL 842)이다. 안전 마진을 두고 표기는 **"890권"**으로 한다. 적재량이 늘면 `lib/landing/copy.ts` 한 줄만 갱신한다.

> 후보였던 "나이 맞춤 추천"(안 A)은 핵심 가치 ②("나이별 맞춤 추천")와 거의 동일어라 채택하지 않았다. "검증된 그림책 큐레이션"(안 B)은 "큐레이션"이 베타의 자동 동기화 실태와 어긋나는 과장 소지가 있어 제외했다.

### 결정 6 — 렌더링은 매 요청 dynamic, 이미지 도메인 허용 등록

`/` 페이지는 결정 4에 따라 쿠키(세션)를 읽으므로 Next.js가 라우트를 dynamic으로 강제한다. 따라서 ISR(`revalidate`)은 적용되지 않으며, 인기 책 랜덤 조회는 매 요청 실행된다. `books`는 약 900행 인덱스 테이블이고 베타 트래픽이 작아 비용이 사실상 0이다. 트래픽이 커지면 인기 책 조회만 `unstable_cache`로 감싸는 것을 후속 작업으로 남긴다.

표지 이미지 도메인 `bookdash.github.io`·`content.digitallibrary.io`를 `next.config.js`의 `images.remotePatterns`에 등록한다. 표지는 `next/image`로 최적화하되, URL이 깨진 책에 대비해 표지 카드에 색상 블록 fallback을 둔다.

**phase-09a CP3 보강 (2026-05-19).** fallback 디자인을 '책 아이콘 + 색상 블록'에서 '책 제목 + 색상 블록'으로 개선했다. 이유: `phase-09b` 완료 전까지 phase-10·13에서 fallback이 노출될 수 있고, 사용자가 어떤 책인지 인지할 수 있어야 하며, ADR-0013 결정 1의 '제목 필수' 정책과 일관되어야 한다. 블록 색은 raw accent 대신 **WCAG 대비가 보장된 container 토큰 쌍**(`primary/secondary/tertiary-container` + `on-*-container`)을 쓴다 — 블록 위 제목 텍스트의 가독성(접근성 목표) 때문이다.

### 결정 7 — OG 이미지는 동적 생성, 베타는 영문 브랜드

소셜 공유 이미지는 외부 이미지 파일 없이 `app/opengraph-image.tsx`에서 `ImageResponse`로 동적 생성한다(D4 "외부 이미지 미사용"과 일치). 베타 한정으로 OG 이미지 텍스트는 영문("Kikibooks" + 영문 태그라인)으로 둔다 — 한글 글리프를 위해 Noto Sans KR 등 한글 폰트를 OG 렌더러에 번들하는 작업을 베타 속도와 맞바꾼 결정이다.

**phase-14 정식 출시 시 OG 이미지를 Noto Sans KR 서브셋으로 한글화한다** — 이 일정을 본 ADR에 기록한다(§7 재검토 트리거).

---

## 3. 근거

### 3.1 phase 분할 (결정 1)
- "인기순"은 본질적으로 사용 데이터(조회·완독)가 있어야 의미를 가진다. 베타 출시 시점엔 그 데이터가 0이므로 랜덤이 정직한 대체재다.
- Admin은 보호 라우트·역할 권한·운영 도구를 전제한다. 5개 Screen이 끝나고 운영 골격이 선 뒤에 짓는 것이 의존성상 옳다.

### 3.2 카피 추상화 (결정 2)
- phase-13b에서 카피를 DB로 옮길 것이 이미 확정돼 있다. 그때 컴포넌트를 다시 건드리지 않으려면, 데이터 출처를 함수 하나(`getLandingCopy()`) 뒤로 숨기고 컴포넌트는 props만 받게 해야 한다.
- 상수 직접 import를 금지하는 이유: import 지점이 흩어지면 DB 교체 시 모든 import를 추적해야 한다. props 주입은 교체 지점을 페이지 1곳으로 모은다.

### 3.3 DB 함수 미생성 (결정 3)
- phase-08은 "DB 스키마 변경 0건"으로 완결됐다(ADR-0011 결정 6). phase-09a도 `books`를 읽기만 하므로 같은 청결도를 유지하는 편이 검증(신규 마이그레이션 0건)을 단순하게 한다.
- 랜덤 RPC 함수는 "올바른" 장기 해법이지만, 만들려면 마이그레이션 + ADR이 필요하다(Hard Rule 8). 베타 규모(약 900행)에서는 애플리케이션 코드 랜덤이 성능상 충분하다. RPC는 필요 시 phase-13b 또는 별도 phase에서 마이그레이션과 함께 도입한다.

### 3.4 페이지 컴포넌트 분기 (결정 4)
- `auth-flow.md`·ADR-0009·ADR-0011이 "미들웨어는 보호/인증 라우트 가드, 분기는 도착 지점 1회"라는 철학을 일관되게 못박았다. `/`는 공개 라우트다 — 이를 미들웨어 가드에 끼우면 그 철학이 흔들린다.
- `/` 페이지는 어차피 인기 책 조회로 서버 렌더된다. 같은 렌더에서 세션을 한 번 확인하는 비용은 무시할 수준이고, `routes.ts`·`middleware.ts` 변경 0건을 지킨다.

### 3.5 카피 정직성 (결정 5)
- claude.md 1절은 "추측·과장 기반 구현 금지"를 페르소나 원칙으로 둔다. "AI 기반"은 룰베이스 추천을 AI로 포장하는 과장이며, 베타 신뢰성·후속 협상 신뢰도에 부담이 된다.
- 적재량(896권)은 DB로 검증 가능한 사실이다. 구체적 숫자는 비개발 학부모에게 가장 설득력 있는 동시에 거짓이 아니다.

### 3.6 렌더링·이미지 (결정 6)
- 결정 4(쿠키 읽기)와 ISR은 기술적으로 양립하지 않는다. 한쪽을 포기해야 한다 — 베타 규모에서는 per-request 비용이 무시할 수준이므로 dynamic을 택하고 ISR을 포기하는 편이 단순하다.
- `next/image`를 쓰려면 외부 도메인 등록이 필수다(미등록 시 런타임 에러). Lighthouse Performance 80+ 목표(`_index.json` global_verification)를 위해 이미지 최적화가 필요하므로 `next/image` + `remotePatterns`를 택했다.

### 3.7 OG 이미지 (결정 7)
- D4는 외부 이미지 미사용을 정했다. `ImageResponse` 동적 생성이 이 제약과 맞고 자산 파일이 필요 없다.
- 한글 OG 텍스트는 한글 폰트 버퍼 번들을 요구해 베타 일정에 비해 비용이 크다. 영문 브랜드 텍스트로 미루되, 정식 출시(phase-14) 과제로 명시 기록한다.

---

## 4. 결과

- `tasks/_index.json` — `total_phases` 14→15, `phase-09` 항목을 `phase-09a-screen-01-landing-static`으로 교체, `phase-13b-admin-system`을 phase-13 뒤에 삽입, `current_phase` 갱신. `completed_phases` 9 불변, `remaining_phases` 5→6.
- 신규 코드(예정): `lib/landing/copy.ts`, `lib/landing/popular-books.ts`, `app/page.tsx`(교체), `components/landing/*`(헤더·히어로·핵심 가치·인기 책·표지 카드·푸터), `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/opengraph-image.tsx`, `app/robots.ts`, `app/sitemap.ts`.
- 수정 코드(예정): `next.config.js`(`images.remotePatterns` 2개 추가).
- `middleware.ts`·`lib/auth/routes.ts`는 수정하지 않는다.
- `claude.md` 라우팅 테이블은 이미 Screen 01 행에 `docs/intent/screen-01-landing.md`를 명시하고 있어 **수정하지 않는다**.
- `supabase/migrations`에 신규 파일이 없다 — DB 스키마 변경 0건.

---

## 5. 미반영 항목 (의도적 보류)

- **진짜 인기순·큐레이션 알고리즘** — phase-13b 이후, 베타 사용 데이터 축적 후.
- **랜딩 카피 DB 관리(`landing_copy` 테이블·Admin 화면)** — phase-13b. 본 ADR 결정 2가 교체 인터페이스를 미리 마련.
- **랜덤 RPC 함수** — 필요 시 마이그레이션 + ADR과 함께 도입. 베타에는 애플리케이션 코드 랜덤으로 충분.
- **파트너(출판사) 로고 섹션** — 협상 체결 전까지 노출할 파트너가 없음.
- **정식 약관·개인정보처리방침 문안** — phase-14 변호사 검토 교체. phase-09a는 placeholder.
- **OG 이미지 한글화** — phase-14(§7 재검토 트리거).
- **인기 책 조회 `unstable_cache` 캐싱** — 트래픽 증가 시 후속 작업.

---

## 6. 재검토 트리거

- **phase-13b Admin 착수** — 결정 2의 `getLandingCopy()`를 DB 조회로 교체. 결정 3의 랜덤을 진짜 인기순으로 교체할지 검토.
- **phase-14 정식 출시** — 결정 7에 따라 OG 이미지를 Noto Sans KR 서브셋으로 한글화. 약관·개인정보 문안을 변호사 검토본으로 교체.
- **적재량 변동** — 결정 5의 "890권" 표기를 `lib/landing/copy.ts`에서 갱신.
- **트래픽 증가** — 결정 6의 per-request 인기 책 조회를 `unstable_cache`로 캐싱.

---

*문서 끝.*
