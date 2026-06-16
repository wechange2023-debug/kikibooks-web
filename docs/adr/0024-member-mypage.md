# ADR-0024: 회원 마이페이지(/mypage) 도입

**날짜** 2026-06-15
**상태** Proposed (베타 범위 포함 결정 · 화면 구현은 본 ADR 확정 후 별도 작업지시서)
**관련** `docs/adr/0021-reader-route-group-and-app-header.md`((reader) route group·공통 헤더·usePathname 분기 패턴), `docs/adr/0018-completion-rewards-and-library.md`(D5 매 완독 +50 누적·`reading_sessions` 완독·라이브러리 무한스크롤), `docs/adr/0016-illustrator-author-publisher-attributionbox.md`(어트리뷰션 행 생성), `docs/adr/0011-onboarding-flow.md`(자녀 프로필·다자녀 스키마), `docs/adr/0009-auth-architecture.md`(보호 라우트·`lib/auth/routes.ts` 중앙 상수), `docs/backlog.md` §7.4 (f), `claude.md` 2절 Hard Rule 8(스키마 변경 시 ADR 선행)·Hard Rule 10(semantic 토큰)

---

## 1. 맥락 (Context)

2026-06-15 read-only recon(폴더 트리 + grep)으로 다음을 실측 확정했다.

- **마이페이지 성격 화면이 0건**이다. `app/` 사용자 라우트는 `(reader)/home` · `(reader)/library` · `(reader)/book/[id]`(+ `read`·`celebrate`) · `auth/*` · `login` · `signup` · `onboarding` · `privacy` · `terms`뿐이며, `mypage` · `account` · `report` · `history` · `favorite` 라우트는 없다. `admin/*`은 관리자 전용이라 학부모 마이페이지가 아니다.
- **전역 헤더(`components/app/app-header.tsx`) NavLink는 홈·라이브러리 2개 + 로그아웃 form뿐**이다(ADR-0021 D4). 마이페이지/계정 진입 링크가 없다.
- **데이터 소스는 이미 존재한다.** `reading_sessions`(읽은 책·완독 이력), `children.points`(누적 포인트, ADR-0018 D5 매 완독 +50), `favorites`(즐겨찾기, `001_initial_schema.sql`) 3개 테이블이 스키마에 있다. 즉 **DB 스키마 변경 없이 화면(읽기 쿼리 + 렌더)만 신규로 만들면 된다.**
- **단, 즐겨찾기는 추가/표시 UI가 전무하다(recon 분기 확정).** `favorites` 테이블을 참조하는 코드는 0건이며(grep `favorites` → app/components/lib 0 파일), `components/book/read-button.tsx`에는 "즐겨찾기 4-다 **미구현** 채택" 주석이 박제돼 있다. 즉 즐겨찾기는 **테이블만 있고 INSERT(추가)·SELECT(목록) 코드가 모두 없다.**
- 현 포인트는 완독 흐름(`celebrate` · `finish-button`)에서 적립만 되고, **누적 포인트를 모아 보는 화면이 없다.**

**PM 결정(2026-06-15):** 마이페이지를 **베타 범위에 포함**한다. 재방문·구독 유지의 핵심 동력이며, 향후 B2B(학원·교사 리포트) 확장의 자산이 되기 때문이다.

---

## 2. 결정 (Decision)

### D1 — 라우트 = `/mypage` 단일 통합 화면

`app/(reader)/mypage/page.tsx`로 신설한다. (reader) route group 안에 두어 ADR-0021의 보호 라우트·공통 헤더 규칙과 정합시킨다(괄호 그룹이므로 URL은 `/mypage`로 불변). 홈·라이브러리와 동일하게 로그인 후 화면이므로 공통 헤더가 노출된다(read·celebrate 같은 몰입 화면이 아님).

### D2 — 구성 섹션 4개

단일 화면에 다음 4개 섹션을 집약한다.

1. **읽은 책 리스트** — `reading_sessions` 기반, 최근 읽은/완독한 책 목록.
2. **간단 독서 리포트** — 총 읽은 권수 · 누적 포인트 · 최근 읽은 책 · 주간 스트릭. **베타는 간단형**(아래 D7 보류 범위 참조).
3. **누적 포인트** — `children.points` 표시.
4. **즐겨찾기** — `favorites` 목록(D5 전제 조건 주의).

### D3 — 데이터 소스 = 기존 테이블 재사용, **DB 스키마 변경 0건**

`reading_sessions`(읽은 책·완독) · `children.points`(포인트) · `favorites`(즐겨찾기)를 **읽기 전용으로 재사용**한다. 신규 컬럼·테이블·트리거·CHECK 변경은 없다. (Hard Rule 8 스키마 변경 ADR 선행 의무에 해당하는 변경 자체가 없음 — 본 ADR은 화면 도입 ADR이다.)

### D4 — 홈과의 역할 분담

- **홈(`/home`)** = 오늘/추천 중심(인사말 · 추천 책 · 카테고리 진입).
- **마이페이지(`/mypage`)** = 누적 이력/요약 중심(읽은 책 누적 · 리포트 · 포인트 · 즐겨찾기).
- **주간 스트릭 컴포넌트는 재사용**한다(`lib/home/streak.ts` 등 기존 자산). 중복 구현하지 않는다.

### D5 — 즐겨찾기 섹션 = 추가 버튼 선행 구현 필요 (recon 분기: "버튼 없음")

recon 결과 즐겨찾기는 **추가·표시 코드가 전무**하다. 따라서 마이페이지의 즐겨찾기 "목록"만 만들면 **항상 빈 목록**이 되어 의미가 없다. 즐겨찾기가 동작하려면 다음 한 쌍이 함께 필요하다.

- (a) **즐겨찾기 추가 버튼**(책 상세 `book/[id]/page.tsx` 또는 라이브러리 카드)에서 `favorites` INSERT/DELETE(토글).
- (b) **마이페이지 즐겨찾기 목록**(`favorites` SELECT).

**제안:** (a) 즐겨찾기 추가 버튼은 마이페이지 화면과 **별도 작업 단위**로 분리한다. 우선순위/포함 여부는 작업지시서 단계에서 PM이 확정한다. 만약 (a)를 베타에서 제외하면, 마이페이지 즐겨찾기 섹션은 "준비 중" 빈 상태로 두거나 베타 섹션에서 제외한다(D7).

### D6 — 전역 헤더에 `/mypage` 진입 링크 추가

`components/app/app-header.tsx`의 `NAV_LINKS`에 `/mypage` 항목을 추가한다(ADR-0021 D4·D5 패턴 — `lib/auth/routes.ts` 경로 상수 중앙화 검토 포함). 진입 동선이 없으면 화면을 만들어도 도달 불가하므로 본 항목은 마이페이지 구현과 **동일 작업 범위**다.

### D7 — 베타 범위 밖(의도적 보류)

다음은 베타에서 구현하지 않는다. 레벨/카테고리별 통계, 월간 추이 그래프, 리포트 화면 분리(독립 라우트), 계정·자녀정보 수정. 정식 단계에서 재검토한다.

### D8 — 다자녀 = 베타는 단일 자녀 기준

스키마는 다자녀를 지원하나(`children` 1:N), 베타는 자녀 1명 기준으로 기술한다. 마이페이지의 읽은 책·포인트·리포트·즐겨찾기는 **활성 자녀(active child) 1명** 기준으로 집계한다(온보딩·홈의 활성 자녀 선택 패턴 재사용, ADR-0011). 다자녀 전환·자녀 선택 UI는 정식 단계 보류.

---

## 3. 결과 (Consequences)

### Positive

- DB 스키마 변경 0건 → Hard Rule(attribution NOT NULL·license 트리거 등)에 무영향, 마이그레이션 리스크 없음.
- 기존 자산(`reading_sessions` 쿼리·주간 스트릭·포인트 적립 로직) 재사용으로 신규 표면 최소화.
- 재방문·구독 유지 동력 확보 + B2B(학원·교사 리포트) 확장 기반 마련.

### Negative / 주의

- **즐겨찾기는 추가 버튼(D5-a)이 선행되지 않으면 빈 목록**이다 — 작업 순서 의존성 발생. 별도 작업 단위로 분리 시 베타 즐겨찾기 섹션의 포함/제외를 명시 결정해야 한다.
- 헤더 NavLink 추가(D6)는 홈·라이브러리 2링크 레이아웃을 3링크로 바꾸므로 모바일 폭 검토 필요(semantic 토큰 준수, Hard Rule 10).
- 간단 독서 리포트의 "총 권수" 정의(읽기 시작 vs 완독)를 작업지시서에서 1개로 확정해야 한다(`reading_sessions` 완독 플래그 기준 권장, ADR-0018 정합).

---

## 4. 후속 트리거 (본 ADR이 박제하는 트리거)

1. 본 ADR **확정(Accepted) 시** → 마이페이지 화면 작업지시서 작성(D1·D2·D3·D4·D6 = 1개 작업 단위).
2. **즐겨찾기 추가 버튼(D5-a)** = 별도 작업 단위 — 베타 포함 여부 PM 확정 후 착수.
3. 정식 단계 → D7 보류 항목(상세 통계·월간 추이·리포트 화면 분리·계정/자녀 수정·다자녀 UI) 재검토.

---

## 5. 상호 참조

- `docs/adr/0021-reader-route-group-and-app-header.md` — (reader) 그룹 배치·헤더 NavLink·usePathname.
- `docs/adr/0018-completion-rewards-and-library.md` — `reading_sessions` 완독·`children.points` 누적 +50.
- `docs/adr/0011-onboarding-flow.md` — 활성 자녀·다자녀 스키마.
- `docs/backlog.md` §7.4 (f) — 본 결정의 backlog 박제.
