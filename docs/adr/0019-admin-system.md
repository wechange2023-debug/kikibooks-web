# ADR-0019: Admin 시스템 — 트리플 가드 표준 · service role SELECT · SQL Editor 직접 승격 · 랜딩카피 이연 · 통계 추가

**날짜** 2026-05-28
**상태** Accepted (phase-13b CP1-adr)
**관련** `docs/adr/0012-landing-page-static.md` 결정 1 Amendment(랜딩카피 이연·통계 추가 — 본 ADR과 동시 작성 phase-13b CP1-adr), `docs/adr/0018-completion-rewards-and-library.md` D1·D2(옵션 B `createServiceRoleClient` + 4.5중 안전망 — 본 ADR D2 트리플 가드 표준의 베이스), `docs/adr/0003-supabase-new-api-keys.md` §2·§5.2(secret 키 서버 전용 + 노출 금지 — D2·D5 정책 근거), `docs/adr/0013-cover-attribution-policy.md` 결정 4(closed environment — D12·D15 robots 정책 베이스), `docs/adr/0011-onboarding-flow.md` 결정 1("분기는 도착 지점에서" — D10 redirect 정책 정합), `supabase/migrations/001_initial_schema.sql`(profiles.role CHECK line 25~26 — 마이그레이션 0건의 근거·books.is_active line 99·books.level CHECK line 80·§9.1 books USING(true)·§9.2 profiles 본인 행·§9.3 children 본인 자녀·§9.4 reading_sessions 본인 자녀), `lib/supabase/server.ts`(`createServiceRoleClient` line 65 — 옵션 B 인프라, `import 'server-only'` 강제), `lib/library/query.ts`·`actions.ts`·`components/library/library-browser.tsx`(/library 패턴 — admin UI 베이스), `lib/home/actions.ts` `updateChildLevel`(server action 반환 표준 + revalidatePath — D11 베이스), `lib/landing/copy.ts`(랜딩카피 정적 유지 — D4 이연), `docs/intent/admin-system.md`(본 페이즈 의도 문서 — §10 미해소 11건의 ADR 확정), `tasks/phase-13b-admin-system.json`(d1~d12 박제·v1~v13·F28~F34), `claude.md` 2절 Hard Rule 1·3·6·8·9·10

---

## 1. 맥락 (Context)

phase-13b는 ADR-0012 결정 1로 신설된 admin 시스템 페이즈다. 그 결정은 phase-13b를 "랜딩 카피 관리 + 책 큐레이션 + 사용자 관리" 3종으로 박제했고 `_index.json` verification 4건도 동일했다. 본 ADR은 CP1 선행 점검(2026-05-28) 진단과 사용자 사전 결정(Q1~Q6)에 따라 범위를 4기능으로 정정하고, admin mutation·SELECT·승격·redirect·캐싱·robots 정책을 단일 출처로 박제한다.

### 1.1 ADR-0012 결정 1 정정 진단 (2026-05-28 박제 view)

CP1 선행 점검에서 두 가지가 드러났다:

- **랜딩 카피 DB 편집은 마이그레이션 002 트리거다.** `landing_copy` 신규 테이블 + RLS(admin write·public read)는 DDL이라 Hard Rule 8 사용자 사전 승인 절차 + 신규 ADR이 선결돼야 한다. phase-13b를 단일 페이즈로 짧게 종료하려면 본 페이즈에서 분리해야 한다.
- **통계 대시보드가 베타 운영 진단의 공백이다.** 사용자 수·자녀 수·완독 세션 수·활성 책 수를 한 화면에서 보지 못하면 운영자가 매번 Supabase SQL Editor에 들어가 COUNT 쿼리를 입력해야 한다. 베타 운영 마찰이 크다.

### 1.2 admin role 표면 진단

- `profiles.role TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'admin', 'curator'))` (001 line 25~26) — CHECK에 admin·curator가 이미 포함돼 마이그레이션 0건으로 분기 가능. 스키마 설계자의 선견(2026-04~05 초기 스키마 시점).
- `profiles.role` 사용 코드 0건(grep `role.*admin|role.*curator` 결과 0 파일) — admin role 분기는 phase-13b 최초 도입이라 회귀 표면 0건.
- `profiles` RLS §9.2 `users can view own profile` USING(`auth.uid()=id`) — 본인 행만 SELECT 가능. admin이 전 profiles 조회하려면 RLS 우회 필요. `children` §9.3도 동일(본인 자녀만).
- `books` RLS §9.1 SELECT USING(true)만, INSERT/UPDATE/DELETE 정책 부재 — admin이 `is_active`·`level` UPDATE는 RLS 우회 필요.

### 1.3 ADR-0018 D1·D2와의 평행 (옵션 B 표준 확장)

phase-13에서 옵션 B(`createServiceRoleClient`) + 4.5중 안전망(zod·auth·`getActiveChild` RLS 소유권 검증·secret 쓰기·child_id 출처 보증)이 박제됐다(ADR-0018 D1·D2). admin mutation 맥락에서는 의미가 평행 변형된다:

- 보상 쓰기는 **자녀별** 데이터(`children.points`·`child_badges`) → `getActiveChild`로 child_id 소유권을 RLS로 검증.
- admin mutation은 **전 카탈로그** 데이터(`books`·`profiles`) → admin role이 "전 카탈로그 권한"을 의미하므로 child_id 검증 대신 `requireAdmin`(role IN list) 1단.

결과: 4.5중 안전망 → **트리플 가드**(zod·auth·`requireAdmin`)로 변형되되, secret 키 쓰기 직전의 자격 검증이라는 본질은 유지(D2). 자녀 격리(Hard Rule 6 핵심)는 admin 페이지에서 자녀 read-only(D7)로 별도 보존.

### 1.4 사용자 사전 결정 (2026-05-28, Q1~Q6)

비개발자 사용자가 CP1 선행 점검 후 6건을 확정했다: (Q1) phase-13b 1차 범위 = 4기능(랜딩카피 이연·통계 추가), (Q2) admin 승격 = SQL Editor 직접 실행, (Q3) 랜딩카피 DB 전환 이연·마이그레이션 002 금지, (Q4) admin mutation = 트리플 가드 표준, (Q5) admin 사용자 목록 = service role SELECT + role 검증, (Q6) CP1 = phase-13 동형 3 sub-step. 본 ADR은 이 결정과 intent §10 미해소 11건의 확정을 박제한다.

---

## 2. 결정 (Decision)

> D1~D12는 `tasks/phase-13b-admin-system.json` `cp1_decisions.decisions`(소문자 d1~d12)와 1:1 매핑 — **ADR D1 = spec d1** ... **ADR D12 = spec d12**. D13~D23은 `docs/intent/admin-system.md` §10 미해소 11건의 ADR 확정. admin 시스템 정책의 단일 출처는 본 ADR.

### D1 — phase-13b 1차 범위 = 4기능 (= spec d1)

ADR-0012 결정 1이 박제한 phase-13b 범위 "랜딩 카피 관리 + 책 큐레이션 + 사용자 관리" 3종을 다음 4기능으로 정정한다 — (a) admin 토대 (b) 콘텐츠 큐레이션(`is_active` 토글 + `level` 수정) (c) 사용자·자녀 조회 read-only (d) 통계 대시보드 read-only. 사유: §1.1의 두 진단(랜딩카피 이연·통계 공백). **사용자 확정(2026-05-28)**. ADR-0012 결정 1은 본 ADR과 동시 작성 Amendment로 정정 박제.

### D2 — admin mutation 트리플 가드 표준 (= spec d2)

모든 admin mutation server action은 다음 4단을 거친다(§1.3 평행 변형):

1. **① zod** — 입력 검증(잘못된 bookId·level·미허용 인자 차단).
2. **② auth.getUser** — 세션 만료 차단(인증 가드).
3. **③ requireAdmin** — `profiles.role IN ('admin','curator')` 검증(parent의 직접 호출 차단).
4. **④ createServiceRoleClient** — secret 키 UPDATE/INSERT. RLS 우회는 이 문장에만 국한.

①~③이 모두 통과해야 ④가 일어난다. ADR-0018 D2 4.5중 안전망의 child_id 소유권 검증(getActiveChild) 단이 admin 맥락에서는 admin role(전 카탈로그 권한)로 의미 대체된 표준이다. 향후 모든 admin mutation의 표준 패턴.

### D3 — admin 승격 = 사용자 SQL Editor 직접 실행 (= spec d3)

admin/curator 권한 부여는 사용자가 Supabase Dashboard SQL Editor에서 다음을 1회 실행한다:

```sql
-- user_id 조회
SELECT id FROM auth.users WHERE email = '<대상 이메일>';
-- 승격
UPDATE profiles SET role = 'admin' WHERE id = '<user_id>';
```

승격 UI·server action·RPC 0건. **사용자 확정(2026-05-28, Q2 (가))**. 근거: 베타 1인 운영자 가정 + 인수인계 §2 정합(.env.local·Supabase 키 캡처 금지 — DDL SQL 텍스트만 제공) + `profiles.role` CHECK(001 기존)로 스키마 변경 0건. 운영자 추가 확장은 F29.

### D4 — 랜딩 카피 DB 편집 이연 (= spec d4)

`landing_copy` 신규 테이블 + `getLandingCopy()` DB 전환은 phase-13b scope_out. 정적 `getLandingCopy()`(`lib/landing/copy.ts`, ADR-0012 결정 2 — "본문만 DB 조회로 교체하면 컴포넌트 수정 0건" 박제) 유지. **사용자 확정(2026-05-28, Q3 (다))**. 사유: 마이그레이션 002 = Hard Rule 8 사용자 사전 승인 트리거. 이연 = F28(phase-13c 또는 phase-2). ADR-0012 결정 1 Amendment에 동시 박제.

### D5 — admin 사용자/자녀 SELECT = createServiceRoleClient + admin 가드 (= spec d5)

`getAdminProfiles`·`getAdminChildren`·`getAdminStats`는 `createServiceRoleClient` SELECT + 호출자(page Server Component)의 `requireAdmin` 통과 후만 호출. `profiles` RLS §9.2·`children` RLS §9.3·`reading_sessions` §9.4는 **불변**(admin은 RLS 우회). 옵션 A(RLS 정책 추가 — `admin can view all profiles` 같은 새 정책) 기각 — 마이그레이션 002 + RLS 정책 복잡도 증가. **사용자 확정(2026-05-28, Q5)**.

### D6 — CP1 sub-step = 3개(spec → intent → adr) (= spec d6)

CP1은 phase-13 동형 3 sub-step — CP1-spec(`tasks/phase-13b-admin-system.json`) → CP1-intent(`docs/intent/admin-system.md`) → CP1-adr(본 ADR + ADR-0012 Amendment). 각 단독 add+commit + 사용자 검증 후 진행. push 0건(CP6에서 1회). 'allow all edits'·'don't ask again' 거절. **사용자 확정(2026-05-28, Q6)**.

### D7 — 자녀 정보 admin read-only (= spec d7)

`/admin/users` children 목록 = 조회만. 편집·삭제 server action 0건. 부모만 `children` RLS §9.3로 본인 자녀 UPDATE/DELETE 가능(admin은 본 페이즈 미도입). 자녀는 미성년자 개인정보로 민감도 높음 — 편집이 필요해지면 (1) 개인정보 보호 정책 합의 + (2) admin audit log table + (3) updateChild·deleteChild server action(트리플 가드 + audit insert) + (4) ADR이 선결 필요. 이연 = F30.

### D8 — admin·curator 동일 권한 (= spec d8)

`requireAdmin` 통과 조건 = `role IN ('admin','curator')`. admin·curator 차등 0건. 베타 단순성 + curator 1인 운영 가정. 세분 권한(curator 큐레이션만·admin 전체)은 F31 — 도입 시 `lib/admin/gate.ts`에 `requireCurator`·`requireAdmin` 분리 + 권한 매트릭스 ADR.

### D9 — 통계 = 단순 COUNT 4종 (= spec d9)

`/admin/stats`(또는 `/admin` 홈, D13) = (a) profiles 전체 (b) children 전체 (c) reading_sessions WHERE `is_completed=true` (d) books WHERE `is_active=true` 4종 COUNT. 시계열·필터·차트 0건. PostgREST `select(..., { count: 'exact', head: true })` 패턴(데이터 0건 반환 + count 헤더). 외부 차트 라이브러리(recharts·chart.js 등) 의존 0건(Hard Rule 8 정합 — PLAN 명시 외 의존성 임의 추가 금지). 시계열·차트는 F33.

### D10 — 비admin redirect = '/' (= spec d10)

`requireAdmin` 비통과 시 분기: 미인증 → `redirect(SIGN_IN_PATH)`(/login). 비admin(role='parent' 또는 그 외) → `redirect('/')`. flash 메시지·toast 0건(베타 단순성, F-item). 사유: notFound(404)는 admin 페이지 존재를 숨기는 효과가 있으나 일반 사용자가 URL 추측 진입 시 혼란 → redirect로 친절한 환원. ADR-0011 결정 1 "분기는 도착 지점에서" 정합.

### D11 — 큐레이션 mutation revalidatePath 다중 호출 (= spec d11)

`toggleBookActive`·`updateBookLevel` 성공 직후 다음 3 경로 동시 revalidate:

```ts
revalidatePath('/admin/books');
revalidatePath('/home');
revalidatePath('/library');
```

force-dynamic 적용된 페이지(/home·/library)에서 효과는 미세하지만 표준 패턴으로 박제(향후 ISR·캐시 도입 시 자동 동기). 누락 시 ISR 캐시로 인한 지연 반영 위험 차단. `updateChildLevel`(lib/home/actions.ts) 패턴 정합.

### D12 — /admin/* force-dynamic + robots noindex (= spec d12)

모든 `/admin/*` 페이지: `export const dynamic = 'force-dynamic'` + `metadata.robots = { index: false, follow: false }`. 사유: admin 데이터 매번 fresh(role 변경·통계 실시간) + closed environment 정합(ADR-0013 결정 4 + app/robots.ts 정책 정합). app/robots.ts에 `/admin` disallow 추가는 D15에서 별도 결정.

### D13 — /admin 홈 = 통계 통합 (intent §10-1)

`app/admin/page.tsx`에 4종 통계 카드 통합. 별도 `app/admin/stats/page.tsx` **미생성**. 베타 단순성 우선 + 빠른 진단·빠른 링크가 한 화면에 합쳐진다. 사이드/탑 네비의 '통계' 링크는 `/admin`을 가리키거나(통합) 또는 anchor(`/admin#stats`)로 처리(CP2-b 착수 미세 확정). 기각: 분리(`/admin`은 빠른 링크 카드만, `/admin/stats` 별도) — 베타 사용량에서는 한 페이지가 정합.

> 본 결정으로 spec `scope_in` 17번째 항목(`app/admin/stats/page.tsx`)은 **0건**으로 정정한다. spec `files_to_create_or_modify` 동일 정정. CP5 sub-step은 `CP5-a-stats-query`(query.ts) + `CP5-b-stats-page-and-dashboard`(통계 카드 통합을 `app/admin/page.tsx`에서 처리 + `components/admin/stats/stats-dashboard.tsx` 컴포넌트)로 유지.

### D14 — middleware PROTECTED_PREFIXES에 '/admin' 추가 (intent §10-2)

`middleware.ts`의 `PROTECTED_PREFIXES`에 `/admin` 1줄 추가. 인증 모델 자체 변경 아님 — phase-07 박제 패턴의 표면 확장(phase-12에서 `/library`도 동일 추가됨). 미들웨어 1차 가드(미인증 차단) + layout `requireAdmin` 2차 가드(role 검증). 1줄 추가는 ADR-0009 보호 라우트 prefix 표준과 정합하므로 신규 ADR 트리거 아님.

### D15 — app/robots.ts disallow에 '/admin' 추가 (intent §10-3)

`app/robots.ts`의 disallow 리스트에 `/admin` 추가. 페이지 metadata noindex(D12)가 1차, robots.ts disallow가 2차 = **이중 박제**. 사유: closed environment 정합(ADR-0013 결정 4) + 검색엔진 크롤 비용 절감 + `/book` disallow 패턴(phase-09a 박제) 정합. `/admin/*` 모든 하위 경로 자동 포함.

### D16 — layout 가드 + 페이지 가드 1중 (intent §10-4)

`app/admin/layout.tsx`의 `requireAdmin`이 모든 `/admin/*` 페이지 컴포넌트 도달 전에 실행됨이 Next.js layout 동작으로 보장된다. 페이지 컴포넌트는 layout 통과를 신뢰하고 자체 `requireAdmin` 중복 호출 0건. 사유: 가드 코드 중복 0건 + DB 쿼리 중복 0건. mutation server action(D2)·server function 호출은 layout 외부에서도 호출 가능 표면이라 자체 `requireAdmin` 필수 — 페이지 가드 1중 ≠ server action 가드 1중.

### D17 — role 검증 데이터 출처 = 본인 세션 profiles SELECT (intent §10-5)

`requireAdmin` 내부는 본인 세션 `createClient` + `profiles SELECT id, role WHERE id = auth.uid()`(§9.2 본인 행만 — 자기 자신의 role 조회는 본인 세션으로 가능). `auth.users` raw_user_meta_data 캐싱 미적용. 사유: `profiles.role`이 사실 출처(SQL Editor 직접 UPDATE로 갱신됨, D3) + metadata 캐싱은 동기 불일치 위험. 캐싱 최적화는 F-item(베타 트래픽 충분).

### D18 — 큐레이션 mutation = 낙관적 UI + useTransition (intent §10-6)

`toggleBookActive`·`updateBookLevel`은 클라이언트에서 `useTransition` + 낙관적 UI(즉시 시각 토글) + server action 호출 + 실패 시 환원 + 토스트(또는 inline 에러). 사유: UX 즉각성 우선(베타 운영자가 다수 책을 빠르게 큐레이션) + server-driven full refresh는 무한스크롤 스크롤 위치·검색·필터 상태 유실 위험. 실패 환원은 mutation 결과 `{ok:false,error}` 수신 시 직전 값으로 복원.

### D19 — is_active OFF confirm 모달 미도입 (intent §10-7)

`is_active` 토글은 즉시 실행. confirm 모달 0건. 사유: 베타 단순성 + 토글 가능 = 환원 가능(다시 ON 토글) + 운영 마찰 최소화. 영구 삭제·라이선스 변경 같은 비가역 액션이 추가될 경우 별도 confirm 도입 검토.

### D20 — tabs URL 동기화 미적용 (intent §10-8)

`/admin/users` tabs(profiles/children)는 클라이언트 `useState`만. URL searchParams 동기화 0건(예: `/admin/users?tab=children`). 사유: 베타 단순성 + 북마크·공유는 admin 일상 동작 아님 + tabs 컴포넌트(design-system 또는 shadcn/ui) 기본 동작 활용. 향후 딥링크가 필요해지면 URL 동기화 추가는 1줄 변경.

### D21 — 자녀 목록 parent_email 노출 (intent §10-9)

`/admin/users` children 행에 `parent_email`(profiles join) 노출. 마스킹 0건. 사유: 운영 진단 편의(부정 가입·테스트 잔존 데이터 부모 식별) + admin 가드(D2 트리플 가드 통과자만) + audit log는 F34. 본 결정은 별도 ADR(개인정보 처리방침 + 운영자 데이터 접근 정책)이 합의되면 정정 가능. 베타 출시 전 개인정보 처리방침 작성 시 본 ADR을 cross-reference로 박제.

### D22 — 사이드 네비 모바일 전환 = 탑 네비 가로 (intent §10-10)

모바일(390)에서 햄버거 메뉴 미적용. 탑 네비 가로 스크롤 또는 압축 라벨(아이콘 + 짧은 한글). 사유: admin 메뉴 4개(홈·책·사용자·통계) → 햄버거 1탭 추가는 과함 + 탑 네비가 한 손 진입 빠름 + design-system 기본 패턴 정합. 메뉴가 5개 이상으로 늘면 햄버거 재검토.

### D23 — AdminCopy = lib/admin/copy.ts 단일 (intent §10-11)

`lib/admin/copy.ts` 단일 파일에 `AdminCopy` 인터페이스 + nav·pageTitles·books·users·stats·errors·confirms 섹션. 기능별 분리(`lib/admin/books/copy.ts`·`users/copy.ts`·`stats/copy.ts`) 미적용. 사유: 베타 규모(4기능)에서는 단일 파일이 단일 출처 패턴(ADR-0012 결정 2) + 한국어 카피 한눈 검토 + i18n 진입점 단일화. 카피 라인이 200줄 이상으로 늘면 분리 재검토.

---

## 3. 결과 (Consequences)

### Positive

- **DB 스키마 변경 0건** — 마이그레이션 002 불요(D1·D4). Hard Rule 8 사용자 사전 승인 절차 회피. `profiles.role` CHECK·`books.is_active`·`books.level` CHECK 모두 001 기존 활용.
- **옵션 B 표준 확장** — phase-13 ADR-0018 D1·D2의 4.5중 안전망이 admin 맥락에서 트리플 가드(D2)로 변형. secret 키 쓰기 직전 자격 검증 본질 유지. 향후 admin server action 전체의 표준.
- **베타 단순성 다층 확보** — 승격 SQL 직접(D3) + 자녀 read-only(D7) + admin·curator 동일(D8) + 단순 COUNT(D9) + flash 0건(D10) + 낙관적 UI(D18) + confirm 0건(D19) + URL 동기화 0건(D20) + 햄버거 0건(D22) + 카피 단일(D23). 운영 마찰 최소.
- **단일 출처** — admin 시스템 정책의 단일 출처는 본 ADR. F28~F34 확장 시 본 ADR Amendment로 박제. ADR-0012 Amendment(동시 작성)는 결정 1 정정만 박제하고 admin 정책 본체는 본 ADR에 집중.
- **회귀 표면 0건** — `profiles.role` 사용 코드 0건(grep)이라 admin role 분기 도입이 기존 동작에 영향 0건.

### Negative

- **secret 키 표면 확장** — phase-13 보상 server action(`awardCompletionRewards`)에 admin server action(`toggleBookActive`·`updateBookLevel`) + server function(`getAdminProfiles`·`getAdminChildren`·`getAdminStats`)가 추가. 트리플 가드(D2) + `import 'server-only'` 강제 + v7·v8 코드 검토·빌드 검증으로 방어하나 코드 리뷰 강도를 높여야 한다.
- **자녀 정보 admin 표면 노출** — `/admin/users` children 목록·`parent_email` 노출(D21). audit log(F34) 부재 — admin 부정 행위 사후 추적 어려움. 베타 1인 운영자 가정에서 수용, 운영자 2인 이상 또는 개인정보 정책 합의 시 F34·F30 우선순위 상승.
- **승격 UI 부재** — 운영자 추가 시 매번 Supabase SQL Editor 접근 마찰(D3). 베타 1인 운영자 가정에서 수용, 운영자 2인 이상 확장 시 F29.
- **시계열·차트 부재** — 단순 COUNT 4종만(D9). 신규 가입 추이·완독 추이·월별 활성 책 변동 미관측. 베타 운영 데이터 누적 후 F33.
- **role 캐싱 0건** — 매 admin 페이지 진입마다 profiles SELECT 1회(D17). 베타 트래픽 충분하나 admin 페이지 라우팅 빈번해질 시 unstable_cache 도입 검토(F-item).

---

## 4. 대안 비교 (Trade-offs)

| 기각 대안 | 내용 | 기각 사유 |
|---|---|---|
| ADR-0012 결정 1 그대로 — 4기능 = 랜딩카피 포함 | landing_copy 신규 테이블 + 마이그레이션 002 | Hard Rule 8 사용자 사전 승인 트리거 + 통계 공백 미해소(D1·D4) |
| 옵션 A — `admin can view all profiles` RLS 정책 추가 | 마이그레이션 002로 admin role SELECT 정책 추가 | 마이그레이션 002 + RLS 정책 복잡도 + 옵션 B 표준(D2) 일관성 훼손(D5) |
| admin 승격 server action 도입 | promoteUser·demoteUser server action + UI | 베타 1인 운영자에 과함 + 본인 강등·악성 강등 가드 복잡(D3) |
| 자녀 admin 편집/삭제 도입 | updateChild·deleteChild server action | 개인정보 보호 정책 + audit log 선결 필요(D7) |
| admin/curator 차등 권한 | requireCurator·requireAdmin 분리 + 매트릭스 ADR | 베타 curator 1인 운영(D8) |
| 통계 시계열·차트 도입 | recharts·chart.js + GROUP BY date_trunc | 외부 의존성 임의 추가 + 베타 데이터 부족(D9) |
| notFound(404) 비admin 차단 | parent 접근 시 404 | URL 추측 진입 시 혼란(D10 redirect 채택) |
| 페이지 가드 2중 호출 | layout + page 양쪽 requireAdmin | 가드·쿼리 중복(D16 1중) |
| auth metadata role 캐싱 | auth.users raw_user_meta_data 활용 | profiles.role과 동기 불일치 위험(D17) |
| server-driven refresh | 토글 후 페이지 전체 새로고침 | 스크롤·검색·필터 상태 유실(D18 낙관적 UI) |
| is_active OFF confirm 모달 | 비공개 전환 시 확인 모달 | 가역 액션이라 마찰만 증가(D19) |
| tabs URL 동기화 | /admin/users?tab=children | 베타 단순성 + 일상 동작 아님(D20) |
| 햄버거 메뉴 | 모바일 햄버거 + 사이드 drawer | 메뉴 4개로 햄버거 과함(D22) |
| 카피 기능별 분리 | books/copy.ts·users/copy.ts·stats/copy.ts | 베타 규모에 과함(D23) |

---

## 5. 후속 트리거 (본 ADR이 박제하는 트리거)

상세 박제는 `tasks/phase-13b-admin-system.json` `phase_13b_follow_up_triggers`(F28~F34, 전부 blocker=false). 요약:

1. **F28 — 랜딩 카피 DB 전환**: `landing_copy` 신규 테이블 + `getLandingCopy()` DB 교체. phase-13c 또는 phase-2.
2. **F29 — admin 승격 UI**: 운영자 2인 이상 확장 시. promoteUser·demoteUser server action + audit log.
3. **F30 — 자녀 정보 admin 편집/삭제**: 개인정보 정책 합의 + audit log + ADR 선결 후.
4. **F31 — 큐레이터 세분 권한**: curator 운영자 추가 시. requireCurator·requireAdmin 분리 + 매트릭스 ADR.
5. **F32 — B2B 학원 대시보드**: PLAN 10절 협상 후. academies·academy_members·정산 테이블 + 학원장 권한 분리.
6. **F33 — 통계 시계열·차트**: 베타 운영 데이터 누적 후. recharts 또는 visx 의존성 ADR + GROUP BY date_trunc.
7. **F34 — 큐레이션 감사 로그**: 운영자 2인 이상 또는 phase-2. admin_audit_log 테이블 + 마이그레이션 + 각 admin server action 끝 audit insert.

---

## 6. 상호 참조

- **ADR-0012 결정 1 Amendment**(동시 작성): 랜딩카피 이연(D4) + 통계 추가(D1·D9) + phase-13b verification 4건 정정(spec CP6 _index 동기 예정)을 결정 1에 박제. ADR-0012 본문 결정 2~7은 무변경.
- **ADR-0018 D1·D2**: 옵션 B `createServiceRoleClient` + 4.5중 안전망 — 본 ADR D2 트리플 가드 표준의 베이스. 자녀 격리(child_id RLS 검증)가 admin 맥락에서 admin role(전 카탈로그 권한)로 의미 대체.
- **ADR-0003** §2(secret 키 서버 전용)·§5.2(노출 금지) — D2·D5의 정책 근거. SUPABASE_SECRET_KEY는 phase-06 기존 인프라.
- **ADR-0013 결정 4**(closed environment) — D12·D15 robots 정책의 베이스.
- **ADR-0011 결정 1**("분기는 도착 지점에서") — D10 redirect 정책 정합.
- **001 마이그레이션** §9.2(profiles 본인 행 SELECT — D5 RLS 우회 사유)·§9.3(children 본인 자녀 — D5)·§9.1(books USING(true) — admin SELECT 정책 추가 없이 SELECT 가능, mutation은 옵션 B)·`profiles.role` CHECK(line 25~26 — D1·D8 admin·curator 분기 근거)·`books.is_active`(line 99 — D11 토글)·`books.level` CHECK(line 80 — D11 1~5).
- **claude.md** Hard Rule 6(secret 키 클라이언트 노출 금지 — D2 트리플 가드·`import 'server-only'` 강제)·Hard Rule 8(DB 스키마 무변경 — D1·D4·D9)·Hard Rule 10(raw HEX 0건 — admin 화면 design-system 토큰 재사용).

---

*문서 끝.*
