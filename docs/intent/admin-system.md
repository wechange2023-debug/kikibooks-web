# 의도 문서 — Admin 시스템 (admin-system)

**대상 페이즈** phase-13b-admin-system
**상태** 작성 중 (phase-13b CP1-intent)
**최종 갱신** 2026-05-28
**관련** `tasks/phase-13b-admin-system.json`(본 페이즈 spec — D1~D12 결정·verification v1~v13·F28~F34), `docs/adr/0019-admin-system.md`(CP1-adr 작성 예정 — 본 intent §10 미해소 결정의 최종 박제 단일 출처), `docs/adr/0012-landing-page-static.md` 결정 1 Amendment(랜딩카피 이연·통계 추가 — CP1-adr 동시 작성 예정), `docs/adr/0018-completion-rewards-and-library.md` D1·D2(옵션 B + 4.5중 안전망 → 본 페이즈 트리플 가드 표준의 베이스), `docs/adr/0003-supabase-new-api-keys.md` §2·§5.2(secret 키 서버 전용 + 노출 금지), `docs/adr/0013-cover-attribution-policy.md` 결정 4(closed environment 정합 — /admin/* robots noindex 베이스), `docs/design-system.md`(컬러·타입·Button·Card·Input·Badge·Tabs·Switch 토큰), `docs/intent/screen-04-reader.md`·`docs/intent/screen-05-celebrate.md`(선행 intent 패턴), `supabase/migrations/001_initial_schema.sql`(profiles.role CHECK line 25~26·books.is_active line 99·books.level CHECK line 80·§9.1~§9.6 RLS 정책·child_badges UNIQUE), `lib/supabase/server.ts` `createServiceRoleClient`(옵션 B 인프라), `lib/admin/gate.ts`(`requireAdmin` — CP2-a 신규 예정), `lib/admin/books/actions.ts`(`toggleBookActive`·`updateBookLevel` — CP3-a 신규 예정), `lib/admin/users/query.ts`(`getAdminProfiles`·`getAdminChildren` — CP4-a 신규 예정), `lib/admin/stats/query.ts`(`getAdminStats` — CP5-a 신규 예정), `lib/library/query.ts`·`actions.ts`·`components/library/library-browser.tsx`(/library 패턴 베이스), `lib/home/actions.ts` `updateChildLevel`(server action 반환 표준 + revalidatePath), `lib/landing/copy.ts`(랜딩카피 정적 유지 — F28 이연), `PLAN.md` 9절(Screen 01 admin 암시), `claude.md` 2절 Hard Rule 1·3·6·8·9·10

---

## 1. 이 문서의 목적

베타 1인 운영자가 키키북스를 운영 진단·정정할 수 있게 만드는 **Admin 시스템**(`/admin/*`)이 사용자 입장에서 어떻게 동작해야 하는지를 자연어로 못박는다. 코드는 이 문서를 따른다(claude.md §3-5: 의도 문서 선행). admin mutation·secret 키·role 가드의 기술적 "왜"(옵션 B 트리플 가드 표준·profiles RLS 우회·승격 SQL 직접 실행·랜딩카피 이연)는 CP1-adr(ADR-0019 신규 + ADR-0012 결정 1 Amendment)에 분리 박제한다.

ADR-0012 결정 1은 phase-09 분할 시 phase-13b를 "랜딩 카피 관리 + 책 큐레이션 + 사용자 관리"로 박제했고, `_index.json` verification 4건도 동일했다. CP1 선행 점검(2026-05-28)에서 두 가지가 드러났다 — (1) 랜딩 카피 DB 편집은 `landing_copy` 신규 테이블 = 마이그레이션 002 = Hard Rule 8 사용자 사전 승인 트리거이므로 본 페이즈에서 분리해야 한다. (2) 베타 운영자가 카탈로그·사용자 상태를 한 화면에서 진단할 통계 대시보드가 없다. 본 intent는 그 결과로 도출된 **4기능**을 박제한다 — (a) admin 토대 (b) 콘텐츠 큐레이션 (c) 사용자·자녀 조회 read-only (d) 통계 대시보드 read-only.

본 페이즈의 목표는 셋이다:

1. **베타 1인 운영자가 코드 수정 없이 운영 진단·정정한다** — `is_active` 토글·`level` 수정·사용자/자녀 목록·통계 4종을 `/admin/*`에서 직접 본다.
2. **admin 권한 표면을 최소로 시작한다** — 승격은 사용자가 Supabase SQL Editor에서 1회 직접 실행(승격 UI 0건), 자녀 정보는 read-only(편집 0건), curator는 admin과 동일 권한(세분 0건). 표면 확장은 follow_up(F29·F30·F31)으로 박제.
3. **secret 키 사용 표면을 트리플 가드로 봉합한다** — phase-13 ADR-0018 D2의 4.5중 안전망(`getActiveChild` RLS로 child 소유권 검증)이 admin 맥락에서는 데이터 소유권 = 전 카탈로그 권한이므로 `requireAdmin`(role IN ('admin','curator')) 1단으로 대체되고, mutation 표면 전체에 zod·auth·requireAdmin 트리플 가드가 표준이 된다.

---

## 2. 범위

**phase-13b가 다루는 것 (4기능, 마이그레이션 0건)**

- **(a) admin 토대** — `app/admin/layout.tsx` + `app/admin/page.tsx` 신규. `lib/admin/gate.ts` `requireAdmin` 신규(auth + `profiles.role IN ('admin','curator')` 검증 + 미인증/비admin redirect 분기). `/admin/*` robots noindex + `export const dynamic = 'force-dynamic'`. 사이드/탑 네비 4링크(홈·책·사용자·통계).
- **(b) 콘텐츠 큐레이션** — `/admin/books` 신규. `books.is_active` 토글(공개/비공개) + `books.level` 수정(1~5 CHECK). 옵션 B(`createServiceRoleClient`) + auth + `requireAdmin` 트리플 가드 server action. mutation 후 `revalidatePath('/admin/books'·'/home'·'/library')` 다중 호출.
- **(c) 사용자·자녀 조회 read-only** — `/admin/users` 신규. `profiles` 목록(id·email·role·display_name·created_at) + `children` 목록(id·name·age·current_level·points·parent_email join). 옵션 B SELECT + `requireAdmin`. tabs(profiles·children) + 검색 + 무한스크롤. **편집·삭제 버튼 0건**.
- **(d) 통계 대시보드 read-only** — `/admin/stats` 신규(또는 `/admin/page.tsx` 통합). 4종 단순 COUNT: 사용자 수(profiles)·자녀 수(children)·완독 세션 수(reading_sessions WHERE is_completed=true)·활성 책 수(books WHERE is_active=true). 옵션 B + `requireAdmin`. PostgREST `count: 'exact', head: true` 패턴.
- 모바일(390) + 태블릿 세로(768) + 태블릿 가로(1024) + 데스크탑(1280) 반응형.

**phase-13b가 다루지 않는 것 (다음으로 연결)**

- **랜딩 카피 DB 편집** — `landing_copy` 신규 테이블 + `getLandingCopy()` DB 전환 = 마이그레이션 002 = Hard Rule 8 사용자 사전 승인 트리거. 정적 `getLandingCopy()`(lib/landing/copy.ts, ADR-0012 결정 2) 유지. 이연: **F28**(phase-13c 또는 phase-2).
- **admin 승격 UI** — 다른 사용자를 admin/curator로 승격시키는 server action. 베타 1인 운영자 가정이라 사용자가 Supabase SQL Editor에서 `UPDATE profiles SET role='admin' WHERE id=...` 1회 직접 실행으로 충분. 이연: **F29**.
- **자녀 정보 admin 편집/삭제** — 미성년자 개인정보 민감도 → 별도 개인정보 정책 합의 + audit log 선결 필요. 본 페이즈는 read-only(d7). 이연: **F30**.
- **큐레이터 세분 권한** — admin vs curator 분리(예: curator는 큐레이션만·admin은 전체). 베타 단순성 우선 동일 권한(d8). 이연: **F31**.
- **B2B 학원 대시보드** — 학원 단위 사용자·자녀·통계 분리 + 정산. PLAN 10절 협상 후. 이연: **F32**.
- **통계 시계열·차트** — 일·주·월별 추이 + 차트 시각화. 본 페이즈는 단순 COUNT 4종(d9), 외부 차트 라이브러리 의존 0건. 이연: **F33**.
- **큐레이션 일괄 작업** — bulk is_active 토글·CSV 업로드. 본 페이즈는 행 단위 토글만.
- **큐레이션 감사 로그** — admin_audit_log 테이블 + 마이그레이션 + admin server action 마지막에 audit insert. 이연: **F34**.
- **다크 모드** — design-system §9 Phase 2 이후.

---

## 3. 라우트 지도

| 경로 | 공개/보호 | 비고 |
|---|---|---|
| `/admin` | 보호 (admin 전용) | layout.tsx에서 `requireAdmin` 호출. 홈 화면 = 통계 카드 4종 미리보기 또는 빠른 링크 4개(CP5 착수 시 통합/분리 확정). robots noindex + force-dynamic |
| `/admin/books` | 보호 (admin 전용) | 콘텐츠 큐레이션. `is_active` 토글 스위치 + `level` 인라인 select + 검색·필터·무한스크롤. layout 가드 + 페이지 가드 2중 |
| `/admin/users` | 보호 (admin 전용) | 사용자·자녀 read-only 목록. tabs(profiles·children) + 검색 + 무한스크롤. **편집/삭제 버튼 0건** |
| `/admin/stats` | 보호 (admin 전용) | 통계 대시보드 4종 COUNT. 필터·차트·시계열 0건(F33 이연). `/admin/page.tsx`에 통합 또는 별도 페이지는 CP5 착수 확정 |

**routes.ts·middleware.ts 인증 로직은 수정한다 1군데만** — `PROTECTED_PREFIXES`에 `/admin`을 추가(미들웨어 1차 안전망). 본 페이지 `layout.tsx`의 `requireAdmin`이 2차(role 검증). 추가 자체는 phase-07 보호 라우트 prefix 박제 패턴 정합이므로 인증 모델 자체 변경 0건. **`PROTECTED_PREFIXES` 추가 1줄을 인증 모델 변경으로 분류할지**는 CP1-adr에서 확정.

`app/robots.ts`의 disallow에 `/admin` 추가 여부는 CP1-adr 또는 CP2 착수 확정(현재 페이지 metadata.robots noindex만으로도 검색엔진 차단 충분 — 이중 박제 여부는 패턴 정합 확인).

---

## 4. 사용자 흐름 (단계별)

### 4.1 admin 진입 흐름

1. 사용자가 `/admin/*` URL을 주소창에 입력하거나 `/home`·`/library`에서 (admin 전용 메뉴가 노출되는 경우) 링크로 진입한다.
2. 미들웨어 1차 가드 — `PROTECTED_PREFIXES`에 `/admin` 등록 시 미인증이면 `/login` redirect. 안전망.
3. `app/admin/layout.tsx`의 `requireAdmin` 호출:
   - **3-1 auth.getUser** — 미인증이면 `redirect(SIGN_IN_PATH)`. 미들웨어 1차의 2차 안전망.
   - **3-2 profiles SELECT** — 본인 세션 createClient로 `profiles.role`을 조회한다(§9.2 본인 행만 SELECT 가능 → admin 본인의 role 조회 가능).
   - **3-3 role 검증** — `role IN ('admin','curator')`이면 통과(d8 동일 권한). `parent`(기본) 또는 그 외이면 `redirect('/')`(d10 채택). flash 메시지 0건(베타 단순성, F-item).
4. layout 통과 시 사이드/탑 네비 4링크가 렌더되고 현재 활성 경로가 강조된다.
5. 페이지 컴포넌트(`/admin`·`/admin/books`·`/admin/users`·`/admin/stats`)가 자체 `requireAdmin` 또는 layout 가드 신뢰로 데이터를 fetch한다(2중 가드 vs 1중 신뢰는 CP1-adr 확정).

> **운영자 추가 시**: 사용자가 Supabase Dashboard SQL Editor에서 `SELECT id FROM auth.users WHERE email='...'`로 `user_id`를 찾고, `UPDATE profiles SET role='admin' WHERE id='<user_id>'`를 1회 실행한다. 승격 UI/server action 0건(d3, Q2 (가) 채택, F29 이연). 강등도 동일 — `UPDATE profiles SET role='parent' WHERE id=...`.

### 4.2 콘텐츠 큐레이션 흐름 (is_active 토글 + level 수정)

`/admin/books`는 라이브러리(`/library`)의 admin 변형이다. UI 패턴은 `lib/library/library-browser.tsx` 정합(필터·검색·무한스크롤) + admin 전용 행 액션(토글·수정).

1. **진입** — layout 가드 통과 후 `getAdminBooks` 첫 페이지(24권, synced_at DESC + id ASC 복합 keyset, opaque cursor)가 SSR된다. 필터 디폴트: `is_active = any`(공개·비공개 둘 다)·level any·키워드 없음. `/library`와 달리 비공개 책도 노출되는 이유는 admin이 비공개 책을 다시 공개로 돌리거나 level을 정정할 수 있어야 하기 때문이다.
2. **필터·검색** — `is_active`(any/true/false 3택)·level(any/1~5/NULL)·키워드(title ilike). 필터 변경 시 `fetchAdminBooksPage` server action 호출 → cursor 리셋 + 첫 페이지 갱신.
3. **is_active 토글** — 행의 스위치 클릭 → `toggleBookActive(bookId, nextValue)` server action 호출. 트리플 가드 통과 후 `createServiceRoleClient`로 `UPDATE books SET is_active = ? WHERE id = ?`. 성공 시 `revalidatePath('/admin/books'·'/home'·'/library')` 호출(d11) 후 결과 반환. 클라이언트는 낙관적 UI(즉시 스위치 시각 토글) + 실패 시 환원 또는 `await refresh()` 패턴 — CP3 착수 확정.
4. **level 수정** — 행의 level select(NULL/1/2/3/4/5) 변경 → `updateBookLevel(bookId, level | null)` server action 호출. zod schema: `z.number().int().min(1).max(5).nullable()`. CHECK 제약(1~5)에 정합. 성공 시 동일 revalidatePath 다중 호출.
5. **무한스크롤** — 하단 sentinel → IntersectionObserver → 다음 cursor 페이지 fetch → append. `/library` 패턴 정합.
6. **사용자 시각 검수** — 토글 OFF → 다른 탭에서 `/home`·`/library` 새로고침 → 해당 책 미노출 확인. 토글 ON 환원 → 노출 환원 확인. level 변경 → `/home` 자녀 current_level 추천에 반영 확인(v3·v4).

> **트리플 가드 동작**: server action 호출은 신뢰 0이므로 매번 ①zod 입력 검증(잘못된 bookId·level 차단) ②auth.getUser(세션 만료 차단) ③requireAdmin(parent가 server action을 직접 호출하는 시도 차단) ④createServiceRoleClient UPDATE. ①~③이 모두 통과해야 ④의 secret 키 쓰기가 일어난다. ADR-0018 D2 4.5중 안전망에서 child_id 소유권 검증(getActiveChild)이 admin 맥락에서는 admin role(전 카탈로그 권한)로 의미가 대체된 것 — 표준 패턴(d2, ADR-0019 D2).

### 4.3 사용자·자녀 조회 흐름 (read-only)

1. **진입** — `/admin/users` layout 가드 통과 후 `getAdminProfiles` 첫 페이지 + `getAdminChildren` 첫 페이지가 SSR된다(Promise.all 병렬, 의존성 0건).
2. **tabs** — 사용자(profiles) / 자녀(children) 2탭. 디폴트는 profiles. tab 전환은 클라이언트 상태(URL 동기화 여부는 CP4 착수 확정).
3. **profiles 목록** — id(축약)·email·role(badge로 시각화: parent/admin/curator)·display_name·created_at. 검색은 email ilike + display_name ilike.
4. **children 목록** — id(축약)·name·age·current_level(컬러 badge)·points·parent_email(profiles join)·created_at. 검색은 name ilike + parent_email ilike.
5. **read-only** — 행 클릭 시 상세 모달·편집 폼 0건. 삭제 버튼 0건. 부정 가입·테스트 잔존 데이터 정정이 필요해지면 사용자가 직접 Supabase SQL Editor 또는 dashboard에서 처리한다. admin 편집/삭제는 follow_up F30(개인정보 정책 합의 후).
6. **무한스크롤** — 각 tab마다 IntersectionObserver + cursor.

> **민감정보 주의**: 자녀는 미성년자 개인정보다. 본 페이지는 조회만 허용되며, 출력에 민감 컬럼(가령 부모 전체 연락처·결제 정보 등)을 추가하지 않는다. v5에서 admin/users/* 트리에 INSERT/UPDATE/DELETE server action 0건을 grep으로 검증한다.

### 4.4 통계 대시보드 흐름 (read-only COUNT 4종)

1. **진입** — `/admin/stats`(또는 `/admin` 홈에 통합) layout 가드 통과 후 `getAdminStats()` SSR.
2. **4종 COUNT 병렬 fetch** — `Promise.all`로 (a) profiles 전체 (b) children 전체 (c) reading_sessions WHERE is_completed=true (d) books WHERE is_active=true. PostgREST `select('id', { count: 'exact', head: true })` 패턴으로 데이터 0건 + count 헤더만 반환(전체 행 fetch 회피).
3. **카드 그리드** — 4 카드(아이콘·라벨·숫자·서브텍스트). 모바일은 2×2, 데스크탑은 1×4 또는 4×1. design-system Card 토큰 재사용.
4. **새로고침** — 페이지 새로고침마다 fresh(force-dynamic). 자동 polling·realtime subscription 0건(베타 단순성).
5. **사용자 시각 검수** — 4 카드 숫자를 Supabase SQL Editor의 `SELECT COUNT(*) FROM ...` 결과와 대조(v6).

> **단순 COUNT만**: 시계열·필터·차트 0건(d9). 베타 운영 데이터 누적 후 F33으로 시계열·차트 도입 검토.

### 4.5 가드 정리

| 화면 | 가드 |
|---|---|
| `/admin/*` (전 페이지) | 2-가드: ①middleware `PROTECTED_PREFIXES` 1차 + ②layout `requireAdmin`(auth + role IN ('admin','curator')) 2차 |
| `requireAdmin` (lib/admin/gate.ts) | 3-가드: ①auth.getUser ②profiles SELECT(본인 세션 §9.2) ③role 검증(IN list) — 미인증 redirect SIGN_IN_PATH·비admin redirect '/'(d10) |
| admin mutation (lib/admin/books/actions.ts) | 트리플 가드(d2): ①zod 입력 검증 ②auth.getUser ③requireAdmin ④createServiceRoleClient UPDATE — 직접 호출 가능 표면 4단 봉합 |
| admin SELECT (lib/admin/users/query.ts·stats/query.ts) | 호출자 가드 신뢰: server function은 page Server Component에서 requireAdmin 통과 후 호출. 직접 호출 표면 없음(server-only import 강제 + 클라이언트 import 시 빌드 실패) |

---

## 5. 구성요소 (각 컴포넌트 의도)

### 5.1 `requireAdmin` (`lib/admin/gate.ts`, server-only)

**의도**: 모든 `/admin/*` 페이지·server action·server function의 단일 가드 진입점. 가드 코드 중복 0건 보장.

- 반환: `Promise<{ user: User; profile: { role: 'admin' | 'curator' } }>` 또는 redirect/notFound. 호출 후 통과는 admin·curator 양쪽(d8).
- 미인증 → `redirect(SIGN_IN_PATH)`. 비admin → `redirect('/')`(d10).
- 본인 세션 createClient로 `profiles SELECT id, role WHERE id = auth.uid()`(§9.2 본인 행만 — 자기 자신의 role 조회는 본인 세션으로 가능).
- `'server-only'` import 강제 → 클라이언트 번들 포함 시 빌드 실패.

### 5.2 `app/admin/layout.tsx` (Server Component)

**의도**: 가드 1회 + 네비 + 일관 레이아웃.

- `requireAdmin` 호출(미통과면 redirect로 페이지 컴포넌트 도달 0건).
- 사이드/탑 네비 4링크(홈 `/admin`·책 `/admin/books`·사용자 `/admin/users`·통계 `/admin/stats`). 모바일은 햄버거 또는 탑 네비 가로(CP2-b 착수 확정).
- 현재 활성 경로 강조(usePathname 또는 segment 매칭 — Server Component이므로 children에 props 전달 또는 클라이언트 sub-component).
- metadata robots `{ index: false, follow: false }` + `export const dynamic = 'force-dynamic'`.

### 5.3 `app/admin/page.tsx` (Server Component)

**의도**: `/admin` 진입 시 첫 화면 = 빠른 진단(통계 카드 4종 미리보기 + 빠른 링크 4개).

- `/admin/stats`와 통합(통계 카드 4종을 `/admin`에 노출하고 `/admin/stats` 별도 페이지는 생략) vs 분리(`/admin`은 링크 카드만, `/admin/stats`에 상세 통계)는 CP5 착수 확정.
- 어느 쪽이든 `getAdminStats()` 호출 + `StatsDashboard`(또는 `StatsPreview`) 조립.

### 5.4 `AdminBooksBrowser` (`components/admin/books/admin-books-browser.tsx`, 'use client')

**의도**: `lib/library/library-browser.tsx`의 admin 변형. 큐레이션 행 액션 추가.

- 필터 바: `is_active`(any/true/false)·level(any/1~5/NULL)·키워드(debounce 300ms).
- 행 컬럼: title·source_platform(badge)·license(badge)·is_active(스위치)·level(인라인 select)·표지 thumb(클릭 시 새 탭 `/book/[id]` 또는 원본 URL).
- 무한스크롤: 하단 sentinel + IntersectionObserver(`/library` 패턴).
- 토글/수정: 낙관적 UI(즉시 시각 토글) + server action 호출 + 실패 시 환원 또는 `useTransition` 패턴(CP3 착수 확정).
- 빈 상태: 검색/필터 결과 0건 메시지.

### 5.5 `AdminUsersBrowser` (`components/admin/users/admin-users-browser.tsx`, 'use client')

**의도**: profiles·children read-only 목록 + tabs + 검색 + 무한스크롤.

- tabs: 사용자(profiles) / 자녀(children). 디폴트는 사용자.
- profiles 행: id(축약)·email·role(badge: parent/admin/curator)·display_name·created_at.
- children 행: id(축약)·name·age·current_level(컬러 badge)·points·parent_email·created_at.
- 검색: 각 tab마다 키워드 input(debounce 300ms).
- 무한스크롤: 각 tab마다 IntersectionObserver + cursor.
- **편집/삭제/모달 0건**(d7, F30 이연).

### 5.6 `StatsDashboard` (`components/admin/stats/stats-dashboard.tsx`, Server Component 또는 dumb client)

**의도**: 4종 COUNT 카드 그리드. 인터랙션 0건.

- 4 카드(아이콘·라벨·숫자·서브텍스트). 라벨 한글, 숫자 천 단위 콤마 포맷.
- 모바일 2×2 → 데스크탑 1×4 또는 4×1(design-system grid 토큰).
- 외부 차트 라이브러리 0건(d9, F33 이연).

### 5.7 admin server action·server function (lib/admin/*)

**의도**: 가드 단일 진입점(`requireAdmin`) + secret 키 쓰기 표준화.

- `lib/admin/books/actions.ts` — `toggleBookActive`·`updateBookLevel` server action. 트리플 가드 + `createServiceRoleClient` + revalidatePath 다중 호출.
- `lib/admin/books/query.ts` — `getAdminBooks` server function. createServiceRoleClient + 호출자 가드 신뢰.
- `lib/admin/users/query.ts` — `getAdminProfiles`·`getAdminChildren` server function. 동일 패턴.
- `lib/admin/stats/query.ts` — `getAdminStats` server function. PostgREST `count: 'exact', head: true`.

---

## 6. 카피 (lib/admin/copy.ts 신규)

- **AdminCopy** 신규 인터페이스 + 단일 출처 상수 + `getAdminCopy()` 함수(ADR-0012 결정 2 단일 출처 패턴 정합 — 상수는 미export, 페이지가 함수 호출 후 컴포넌트에 props로 주입).
- 섹션: `nav`(홈·책·사용자·통계 4링크 라벨) · `pageTitles`(각 페이지 title·subtitle) · `books`(필터 라벨·is_active 토글 on/off·level select 옵션·검색 placeholder) · `users`(tabs 라벨·검색 placeholder·empty 상태) · `stats`(4종 카드 라벨·서브텍스트) · `errors`(server action 실패 메시지) · `confirms`(is_active OFF 시 confirm 모달 여부는 CP3 착수 확정).
- 한국어 조사 정합(은/는·을/를): admin 카피는 운영자용이라 박제 문안 고정으로 충분(과한 엔지니어링 회피).
- 향후 다국어 지원 시 본 파일이 i18n 키 매핑 진입점이 됨.

---

## 7. design-system 토큰·컴포넌트 재사용

본 페이즈는 **신규 디자인 토큰·CSS 0건 목표** — `/home`·`/library`에서 검증된 토큰만 사용한다(Hard Rule 10).

| 영역 | 재사용 토큰·컴포넌트 |
|---|---|
| 배경 | `bg-surface-2`(페이지) / `bg-surface`(카드) — `/library`·`/home` 정합 |
| 텍스트 | `text-text`(본문)·`text-text-variant`(보조)·`text-error`(에러) — `/library`·`/home` 정합 |
| 보더 | `border-outline` — `/home` `aside`·`/library` 카드 정합 |
| 헤더 | `<header>` + `font-display text-2xl font-bold text-text md:text-3xl` — `/library` 페이지 정합 |
| 사이드/탑 네비 | design-system §6.x Nav 토큰(있다면) 또는 Card 토큰 조합 — CP2-b 착수 확정 |
| Badge | role badge(parent/admin/curator)·license badge·source_platform badge — design-system §6.x Badge |
| Switch | `is_active` 토글 — design-system §6.x Switch(또는 shadcn/ui Switch — CP3 착수 확정) |
| Select | level 인라인 select·필터 select — design-system §6.x Select |
| Tabs | profiles/children 전환 — design-system §6.x Tabs |
| Input | 검색 input + debounce — `/library` Input 정합 |
| Card | 통계 4종 카드·책 행 카드 — design-system §6.2 Card |
| 색상 강조 | level 1~5 컬러 — design-system 1.8절 레벨 컬러 매핑(`/home` `LevelSelector` 정합) |

raw HEX 0건(v11). easing·cubic-bezier·shadow는 색상이 아니므로 규칙 비대상.

---

## 8. 캐싱·성능·보안

- `/admin/*`: `export const dynamic = 'force-dynamic'`(d12) — admin 데이터는 매번 fresh(role 변경 즉시 반영·통계 실시간). ISR 미적용.
- robots: 각 페이지 metadata `{ index: false, follow: false }`(d12). closed environment 정합(ADR-0013 결정 4 + app/robots.ts `/admin` disallow 추가 여부는 CP1-adr 확정).
- **Hard Rule 6 (옵션 B 보안 핵심)**: `createServiceRoleClient` 사용은 `lib/admin/*` server function·server action **내부에서만**. `lib/supabase/server.ts` `import 'server-only'`로 클라이언트 번들 포함 시 빌드 실패 강제. SUPABASE_SECRET_KEY는 phase-06 기존 인프라(.env.local·GitHub Secrets)에 존재 — 신규 발급·노출 0건(ADR-0003 §2·§5.2). admin 사용 표면 확장은 트리플 가드(d2)로 봉합 + v7·v8 코드 검토·빌드 검증.
- **Hard Rule 8**: DB 스키마 변경 0건. `supabase/migrations` 신규 0건(v13). profiles.role CHECK·books.is_active·books.level CHECK 모두 001 기존.
- **revalidatePath 다중 호출**(d11): 큐레이션 mutation 후 `/admin/books`·`/home`·`/library` 3 경로 동시 revalidate. force-dynamic 페이지(/home·/library)에서 효과는 미세하지만 표준 패턴 박제.
- 외부 링크(표지 어트리뷰션·원본 URL 등)는 `target="_blank"` + `rel="noopener noreferrer"`.

---

## 9. 검증 (이 문서가 코드에 요구하는 것)

`tasks/phase-13b-admin-system.json` `verification`(v1~v13)이 동일 항목을 측정 명령으로 박제한다.

1. `/admin/*` 라우트 가드 3 케이스(미인증·parent·admin) 정합(v1).
2. `profiles.role IN ('admin','curator')` 분기 정상(curator도 통과·parent 차단, v2).
3. `books.is_active` 토글 ↔ DB ↔ `/home`·`/library` 3중 정합(v3).
4. `books.level` 수정 1~5 정합 + 무효값 차단(v4).
5. 사용자·자녀 목록 read-only(편집·삭제 server action 0건 grep, v5).
6. 통계 4종 COUNT 실측값 정합(v6).
7. 트리플 가드 코드 검토(zod·auth·requireAdmin·createServiceRoleClient 4단, v7).
8. secret 키 클라이언트 노출 0건(빌드 산출물 grep + 'use client' 파일에 secret import 0건, v8).
9. `/admin/*` robots noindex 4경로(v9).
10. 4 viewport 반응형(v10).
11. Hard Rule 10 raw HEX 0건(v11).
12. lint·type-check·build 통과(v12).
13. 마이그레이션 002 생성 0건(v13).

### CP 시각 검수 체크리스트

**CP2 admin 토대**
- [ ] 사용자가 Supabase SQL Editor에서 본인 role을 'admin'으로 UPDATE (1회)
- [ ] /admin 진입 3 케이스: 미인증 redirect·parent redirect·admin 통과
- [ ] 사이드/탑 네비 4링크 활성 강조
- [ ] robots noindex(view-source)

**CP3 콘텐츠 큐레이션**
- [ ] 임의 책 is_active OFF → 다른 탭 /home·/library 새로고침 → 미노출 확인
- [ ] is_active ON 환원 → 노출 환원
- [ ] level 1→5 변경 → /home 자녀(current_level=5) 추천 반영
- [ ] 무효 level(0·6) → 클라이언트·서버 차단
- [ ] 무한스크롤 + 검색·필터

**CP4 사용자·자녀 조회**
- [ ] tabs(profiles·children) 목록·검색·무한스크롤
- [ ] 편집/삭제 버튼 0건(시각 + grep)

**CP5 통계 대시보드**
- [ ] 4종 COUNT 카드 표시
- [ ] Supabase SQL Editor SELECT COUNT(*) 결과와 일치 (4건)
- [ ] 모바일 2×2 / 데스크탑 1×4 또는 4×1

---

## 10. 미해소 결정 (CP1-adr 위임)

다음은 본 intent에서 방향만 박제하고 CP1-adr(ADR-0019 + ADR-0012 Amendment)에서 최종 확정한다:

1. **`/admin` 홈 = 통계 통합 vs 분리(§5.3·§4.4)** — `/admin/page.tsx`에 4종 카드 통합 vs 빠른 링크만 + `/admin/stats` 별도 페이지. 베타 단순성 우선이면 통합 권고.
2. **`middleware.ts` PROTECTED_PREFIXES에 `/admin` 추가 여부(§3·§4.5)** — 추가는 phase-07 박제 패턴 정합이나 인증 모델 변경 분류 여부.
3. **`app/robots.ts` disallow에 `/admin` 추가 여부(§3·§8)** — 페이지 metadata noindex만으로 충분 vs 이중 박제.
4. **layout 가드 + 페이지 가드 2중 vs layout 가드 1중 신뢰(§4.5)** — 페이지 컴포넌트가 layout 통과를 신뢰할지, 자체 `requireAdmin`을 한 번 더 호출할지.
5. **role 검증 데이터 출처(§5.1)** — 본인 세션 createClient + `profiles SELECT`(§9.2 본인 행만) vs auth.users metadata 캐싱 — 본인 세션 SELECT가 정합인 듯하나 캐시 전략 박제.
6. **낙관적 UI vs server-driven refresh(§5.4)** — is_active 토글·level 수정 시 즉시 시각 토글 + 실패 환원 vs `useTransition` + `await fetchAdminBooksPage`.
7. **is_active OFF confirm 모달(§6)** — 비공개 전환 시 확인 모달 vs 즉시 토글. 베타 단순성 우선이면 즉시 토글.
8. **tabs URL 동기화(§5.5)** — `/admin/users?tab=children` 같은 URL 동기화 vs 클라이언트 상태만.
9. **자녀 목록의 parent_email 노출 정책(§4.3·§5.5)** — children 행에 부모 email을 노출(운영 진단 편의) vs 마스킹(개인정보 최소화). 개인정보 정책 합의 필요.
10. **`/admin` 사이드 네비 모바일 전환 방식(§5.2)** — 햄버거 메뉴 vs 탑 네비 가로 vs 하단 탭바.
11. **CelebrateCopy·LibraryCopy와 AdminCopy 카피 위치 정합(§6)** — `lib/admin/copy.ts` 단일 vs 기능별 `lib/admin/books/copy.ts`·`users/copy.ts`·`stats/copy.ts`. ADR-0012 결정 2 단일 출처 패턴은 어느 쪽이든 정합.

### follow_up_triggers (F28~F34, spec 박제 인용)

- **F28** 랜딩 카피 DB 전환(phase-13c 또는 phase-2, blocker=false)
- **F29** admin 승격 UI(운영자 2인 이상 또는 phase-2, blocker=false)
- **F30** 자녀 정보 admin 편집/삭제(개인정보 정책 합의 후, blocker=false)
- **F31** 큐레이터 세분 권한(curator 운영자 추가 시, blocker=false)
- **F32** B2B 학원 대시보드(PLAN 10절 협상 후, blocker=false)
- **F33** 통계 시계열·차트(베타 운영 데이터 누적 후, blocker=false)
- **F34** 큐레이션 감사 로그(운영자 2인 이상 또는 phase-2, blocker=false)

---

*문서 끝.*
