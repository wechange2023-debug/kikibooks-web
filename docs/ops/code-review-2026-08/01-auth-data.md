# 전체 코드리뷰 1/5 — 인증·데이터 접근

**작성** 2026-08-22 · **작성자** 워커(Claude Code) · **상태** 비기 검수 대기(커밋 전)
**기준 HEAD** `3834058` (`main`, origin 반영 완료)

## 이 문서의 규칙

- **읽기 전용 리뷰다.** 코드 변경 0건. 수정 제안은 **「방향 1줄」**까지만이고 구현하지 않았다.
- 모든 지적에 **파일:라인 근거**를 붙였다. 근거를 못 만든 것은 **「미확인」**으로 표기했다.
- 팀장(비개발자)을 위해 항목마다 **평이한 설명 1줄**을 병기했다.
- **DB 실물은 조회하지 않았다.** 마이그레이션 파일이 근거이며, 실물 확인이 필요한 것은
  말미에 **ROLLBACK 형식 SQL**로 첨부했다(실행은 팀장 전속).

---

## 1. 리뷰 범위 (실제로 연 파일)

| 구분 | 파일 |
|---|---|
| 미들웨어 | `middleware.ts` |
| Supabase 클라이언트 | `lib/supabase/client.ts` · `server.ts` · `middleware.ts` |
| 인증 유틸 | `lib/auth/routes.ts` · `ensure-profile.ts` · `resolve-post-login-path.ts` |
| 인증 라우트 | `app/auth/callback/route.ts` · `app/auth/sign-out/route.ts` · `app/auth/auth-error/page.tsx` |
| 로그인·가입 | `app/login/page.tsx` · `app/login/actions.ts` · `app/signup/page.tsx` · `components/auth/signup-form.tsx` |
| 마이그레이션 | `supabase/migrations/001~009` (9개 전량) |
| 서버 액션 | **9파일 16액션** (아래 §4) |
| admin 가드 | `lib/admin/gate.ts` · `app/admin/layout.tsx` · `lib/admin/{books,users,review,stats}/*` |
| API 라우트 | `app/api/**` — **디렉터리 자체가 없다**(Route Handler는 `app/auth/*` 2개뿐) |
| 환경변수 | `process.env` 전수 grep(9종) · `.env.example` · `.gitignore` |

---

## 2. 지적 표

| # | 심각도 | 파일:라인 | 문제 | 평이한 설명 | 방향 |
|---|---|---|---|---|---|
| **1** | **P0** | `supabase/migrations/001_initial_schema.sql:231-234` (+ `:25-26`) | `profiles` UPDATE 정책이 컬럼을 제한하지 않아 로그인한 누구나 자기 행의 `role`을 `'admin'`으로 바꿀 수 있다 | **아무 학부모나 스스로를 관리자로 만들 수 있습니다.** | `role` 변경을 막는 트리거(또는 컬럼 UPDATE 권한 회수) 추가 — 별도 ADR + 마이그레이션 |
| 2 | P1 | `.gitignore:28-29` | `.env.local`·`.env.*.local`만 무시한다. `.env`·`.env.production`·`.env.development`는 **무시되지 않는다**(`git check-ignore` 실측) | **비밀 키 파일을 실수로 저장소에 올릴 수 있는 구멍입니다.** | `.gitignore`에 `.env`·`.env.*` 계열 추가 |
| 3 | P1 | `components/auth/signup-form.tsx:88-172` | 가입 폼에 약관·개인정보 **동의 UI가 0건**이고, 동의 이력을 저장할 컬럼도 마이그레이션에 0건 | **약관 문서는 있는데, 가입할 때 "동의합니다"를 받는 절차가 없습니다.** | 가입 폼에 필수 동의 체크박스 + 동의 시각 저장 컬럼 — 법률 검토 동반 |
| 4 | P1 | `supabase/migrations/*` (해당 없음) | 코드가 쓰는 `book_audio` 테이블을 **만드는 마이그레이션이 없다**. 스키마·RLS가 버전 관리 밖에 있다 | **오디오 표가 어떻게 생겼는지 코드 저장소에는 기록이 없습니다.** | 현재 DB 상태를 그대로 옮겨 적는 "현황 기록용" 마이그레이션 1건 추가 |
| 5 | P2 | `001_initial_schema.sql:213-215` | `books` SELECT가 `USING (true)`라 **비활성(미검수) 도서의 메타데이터도 외부 API로 읽힌다**. 같은 위험을 `book_text`는 막았다(`006:70-79` 활성 도서 한정) | **아직 공개하지 않은 책의 제목·표지 주소가 밖에서 조회될 수 있습니다.** 본문·그림은 막혀 있습니다. | `books` SELECT를 `is_active` 조건으로 좁힐지 판단 — admin 경로는 service role이라 영향 없음 |
| 6 | P2 | `001_initial_schema.sql:255-258` 부재 | `reading_sessions`·`favorites`·`profiles`에 **DELETE 정책이 없다**. 개인정보처리방침은 삭제 요청 시 조치를 약속한다(`app/privacy/page.tsx:40`) | **"기록을 지워 주세요"를 앱에서 처리할 수 없고 사람이 손으로 해야 합니다.** | 탈퇴·삭제 기능 설계 시 함께 결정(지금은 기능 자체가 없음) |
| 7 | P2 | `middleware.ts:22` · 각 page `auth.getUser()` | 화면 1회당 인증 왕복 2회 | **로그인 확인을 한 화면에서 두 번 합니다.** | 백로그 (ai) `getClaims()` 전환으로 이관 완료 |

---

## 3. 점검 항목별 결과

### S1 — secret 키가 클라이언트에 닿는가 → **닿지 않는다** ✅

- `SUPABASE_SECRET_KEY`는 **`lib/supabase/server.ts:65` 단 한 곳**에서만 읽힌다.
- 그 파일은 `:1`에 `import 'server-only'`가 있어 클라이언트 번들에 섞이면 **빌드가 실패**한다.
- service role을 쓰는 8개 모듈 전부 `server-only`를 갖고 있다 —
  `server.ts` · `audio-manifest.ts` · `admin/gate.ts` · `book/rewards.ts` ·
  `admin/{books,users,review,stats}/query.ts`.
- **진짜 클라이언트 컴포넌트 34개**(첫 줄이 `'use client'`인 파일) 중 서버 모듈·secret을
  import하는 것은 **0건**.
- `.env.example`은 자리표시자만 담고 있고, 추적 중인 `.env*` 파일은 `.env.example` 하나뿐.

> 평이하게: 비밀 키는 서버 안에만 있고, 브라우저로 새는 길이 코드상 없습니다. (다만 지적 #2 참조)

### S2 — RLS 정책 표

`ENABLE ROW LEVEL SECURITY`가 걸린 테이블 **8종**, 정책 **16건**.

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 범위 |
|---|---|---|---|---|---|
| `books` | ✅ | ✗ | ✗ | ✗ | **`true`(전체 공개)** — 지적 #5 |
| `profiles` | ✅ | ✅ | ✅ | ✗ | `auth.uid() = id` — **UPDATE에 컬럼 제한 없음, 지적 #1** |
| `children` | ✅ | ✅ | ✅ | ✅ | `parent_id = auth.uid()` |
| `reading_sessions` | ✅ | ✅ | ✅ | ✗ | 본인 자녀(children 서브쿼리) |
| `favorites` | ✅ | ✅ | ✗ | ✅ | 본인 자녀 |
| `child_badges` | ✅ | ✗ | ✗ | ✗ | 본인 자녀 — 쓰기는 시스템(service role) 전용, 의도됨 |
| `book_text` | ✅ | ✗ | ✗ | ✗ | **활성 도서만**(`006:70-79`) |
| `book_review` | ✗ | ✗ | ✗ | ✗ | 정책 0개 = service role 전용, 의도됨(`006:83-86`) |
| **`book_audio`** | **미확인** | 미확인 | 미확인 | 미확인 | **마이그레이션에 정의 자체가 없음 — 지적 #4** |

`GRANT`/`REVOKE` 구문은 마이그레이션 전체에 **0건**이다. 즉 컬럼 단위 권한 제한이 없고,
Supabase 기본 권한(`authenticated`가 `public` 스키마 테이블에 전 작업 가능) 위에서 **RLS만이
유일한 방어**다. 지적 #1이 P0인 이유가 이것이다.

### S3 — 서버 액션 16개 전량 ✅

`'use server'`가 **첫 줄인 파일 9개**를 전수 확인했다(주석에 문자열만 등장하는 파일은 제외).
함수 내부 인라인 `'use server'`는 **0건**.

| 파일 | 액션 | zod | `getUser` | 소유 검증 |
|---|---|---|---|---|
| `app/login/actions.ts` | `signInWithEmail`·`signUpWithEmail` | ✅ | 해당 없음(로그인 전) | 해당 없음 |
| `app/onboarding/actions.ts` | `registerChild`·`skipOnboarding` | ✅ | ✅ | RLS(`children` INSERT) |
| `lib/book/favorite.ts` | `toggleFavorite` | ✅ | ✅ | RLS + `getActiveChild` |
| `lib/book/reading-session.ts` | `startReadingSession`·`completeReadingSession` | ✅ | ✅ | `getActiveChild`로 검증한 `child.id`만 사용(`:204`) |
| `lib/home/actions.ts` | `updateChildLevel` | ✅ | ✅ | **본인 세션 UPDATE + 0행이면 거부**(`:64-81`) — 모범 패턴 |
| `lib/library/actions.ts` | `fetchLibraryPage` | ✅ | ✅ | 공개 카탈로그라 해당 없음 |
| `lib/admin/books/actions.ts` | 4개 | ✅ | `assertAdmin` 내부 | zod → `assertAdmin` → service role 순서 준수 |
| `lib/admin/review/actions.ts` | 2개 | ✅ | 〃 | 〃 |
| `lib/admin/users/actions.ts` | 2개 | ✅ | 〃 | 〃 |

**`child_id` 위조 위협은 막혀 있다.** 자녀 id를 인자로 받는 액션은 전부 ① 본인 세션 클라이언트로
쿼리해 RLS가 거르게 하거나 ② `getActiveChild`가 검증한 id만 넘긴다.
`lib/book/rewards.ts`는 service role로 쓰지만 **서버 액션이 아니다**(`:1` `server-only`,
`'use server'` 없음) — 클라이언트가 직접 호출할 표면이 없고, 검증된 `child.id`만 인자로 받는다
(`reading-session.ts:241`).

> 평이하게: "남의 아이 기록을 건드리는" 공격 통로는 확인 범위에서 발견되지 않았습니다.

### S4 — admin 가드 ✅ (단, 지적 #1이 이 가드를 무력화한다)

- 판정 기준은 **`profiles.role` 컬럼**이다(`lib/admin/gate.ts:137-149`). 이메일 하드코딩 **0건**.
- 조회는 **본인 세션 클라이언트**로 한다(`:138-141`, `.eq('id', user.id)`) — service role을 쓰지
  않으므로 남의 role을 훔쳐볼 수 없다. 설계는 옳다.
- `role`이 `'admin'`·`'curator'`가 아니면 redirect(`:149`).
- admin 조회 액션 3종(`fetchAdminProfilesPage`·`fetchAdminChildrenPage`·`fetchAdminBooksPage`)
  전부 **zod → `assertAdmin` → service role** 순서를 지킨다.

**우회 경로**: 코드에는 없다. **DB 쪽에 있다** — 지적 #1로 사용자가 자기 `role`을 바꾸면 이 가드는
정상 동작하면서 통과시킨다. 가드의 결함이 아니라 **가드가 읽는 값이 사용자 소유**인 것이 문제다.

### S5 — 라이선스 장치 (마이그레이션 기준 ✅ / DB 실물 미확인)

| Hard Rule | 근거 | 상태 |
|---|---|---|
| `books.attribution_text` NOT NULL | `001_initial_schema.sql:97` | 파일에 존재 ✅ |
| `enforce_commercial_license` 트리거 | `001:166-178` 정의 + `books_license_check` 트리거 부착. `002:49`에서 `cc-by-3-0` 추가로 재정의 | 파일에 존재 ✅ |
| 허용 라이선스 화이트리스트 | `001:85` CHECK + `002:35` named constraint 재추가 | 파일에 존재 ✅ |

**DB 실물은 확인하지 않았다.** 말미 SQL로 팀장 확인 필요.

### S6 — 인증 콜백·리다이렉트 ✅

- `app/auth/callback/route.ts`는 **`next`·`redirect_to` 류 파라미터를 읽지 않는다**(`:17`은 `code`만).
  도착지는 `resolvePostLoginPath`가 서버에서 정하고 `request.nextUrl.clone()`으로 조립한다
  (`:43-46`) → **open redirect 없음**.
- 실패는 전부 `/auth/auth-error` 고정(`:19-21`·`:24`·`:31`·`:40`).
- `app/auth/sign-out/route.ts`도 같은 방식(고정 랜딩, 303).
- 사용자 입력이 리다이렉트 목적지에 섞이는 지점 전수 grep **0건**.
- 쿠키는 `@supabase/ssr` 표준 `getAll/setAll`(미들웨어) · `get/set/remove`(서버)로만 다룬다.
  `lib/supabase/server.ts:32-45`의 빈 catch 2건은 **Server Component에서 쿠키 쓰기가 금지된
  정상 상황**을 흡수하는 것이고 주석으로 설명돼 있다(`:36`).

### S7 — 에러 무시 지점 ✅ (데이터 접근 코드 한정)

본문이 실제로 비어 있는 catch는 **4건뿐**이고 전부 주석으로 사유가 적혀 있다.

| 위치 | 성격 |
|---|---|
| `lib/supabase/server.ts:35`·`:42` | Server Component 쿠키 쓰기 금지 흡수(정상) |
| `components/book/audio-reader.tsx:139`·`:462` | 오디오 재생 정책 거부 흡수(정상) |

`const { data } = await supabase...` 처럼 **`error`를 아예 받지 않는 패턴은 0건**이다.
데이터 접근 코드에서 Supabase 에러를 조용히 삼키는 지점은 발견되지 않았다.

### S8 — 14세 미만 동의·약관 ⚠ (지적 #3)

| 항목 | 상태 |
|---|---|
| `/terms` 페이지 | **존재** — `app/terms/page.tsx:59` "만 14세 미만 아동과 법정대리인의 동의" 조항 포함 |
| `/privacy` 페이지 | **존재** — `app/privacy/page.tsx:36-40` 법정대리인 동의·열람·삭제 조항 포함 |
| 두 페이지로 가는 링크 | **존재** — 공통 푸터(`components/app/app-footer.tsx:27`, ADR-0061 D2) |
| **가입 시 동의 수집 UI** | **없음** — `components/auth/signup-form.tsx`는 이메일·비밀번호·확인 3개 입력뿐 |
| **동의 이력 저장** | **없음** — 마이그레이션 전체에 `consent`·`agree`·`terms_` 컬럼 0건 |

> 평이하게: 약속문(약관·방침)은 잘 써 뒀는데, **가입할 때 그 약속에 동의받은 기록이 남지 않습니다.**

---

## 4. 집계

| 심각도 | 건수 | 항목 |
|---|---|---|
| **P0 (즉시)** | **1** | #1 `profiles.role` 자가 승격 |
| **P1 (베타 전)** | **3** | #2 `.env` 무시 누락 · #3 가입 동의 미수집 · #4 `book_audio` 마이그레이션 부재 |
| **P2 (리뉴얼 시)** | **3** | #5 비활성 도서 메타 공개 · #6 DELETE 정책 부재 · #7 Auth 2중 호출(백로그 이관 완료) |

## 5. 미확인 목록

1. **DB 실물의 `profiles` 보호 장치** — 마이그레이션 밖에서 트리거·권한 회수가 추가됐는지.
   지적 #1의 실제 성립 여부가 여기에 달렸다.
2. **`book_audio`의 실제 스키마·RLS 정책** — 파일에 없어 확인 불가.
3. **DB 실물의 `attribution_text` NOT NULL·`enforce_commercial_license` 생존 여부**.
4. **`authenticated` 역할의 실제 테이블 권한** — Supabase 기본값을 가정했을 뿐 실조회하지 않았다.
5. `app/api/**` — 디렉터리가 없어 점검 대상 0건(부재 자체는 정상).

## 6. 팀장 확인 필요 SQL (읽기 전용 · ROLLBACK 종료)

Supabase SQL Editor에 그대로 붙여 실행하고 **결과만** 알려 주십시오.
`ROLLBACK`으로 끝나므로 **아무것도 바꾸지 않습니다.**

```sql
BEGIN;

-- ① 지적 #1 — profiles.role을 보호하는 트리거가 실물 DB에 있는가 (기대: 있으면 안전, 없으면 P0 확정)
SELECT 'A. profiles 트리거' AS chk, tgname AS name, pg_get_triggerdef(t.oid) AS detail
FROM pg_trigger t
WHERE t.tgrelid = 'public.profiles'::regclass AND NOT t.tgisinternal
UNION ALL
-- ② profiles UPDATE 정책의 실제 식 (기대: WITH CHECK에 role 제한이 있으면 안전)
SELECT 'B. profiles 정책', policyname,
       cmd || ' | USING=' || coalesce(qual,'-') || ' | CHECK=' || coalesce(with_check,'-')
FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
UNION ALL
-- ③ authenticated 역할이 profiles에 가진 권한 (기대: UPDATE가 없으면 안전)
SELECT 'C. profiles 권한', grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='profiles' AND grantee IN ('anon','authenticated')
UNION ALL
-- ④ 지적 #4 — book_audio의 RLS 활성화·정책 현황
SELECT 'D. book_audio RLS', c.relname, CASE WHEN c.relrowsecurity THEN 'RLS 켜짐' ELSE 'RLS 꺼짐' END
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='book_audio'
UNION ALL
SELECT 'E. book_audio 정책', policyname, cmd || ' | USING=' || coalesce(qual,'-')
FROM pg_policies WHERE schemaname='public' AND tablename='book_audio'
UNION ALL
-- ⑤ S5 — 라이선스 장치 생존 확인
SELECT 'F. attribution_text', column_name, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='books' AND column_name='attribution_text'
UNION ALL
SELECT 'G. 라이선스 트리거', tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t
WHERE t.tgrelid = 'public.books'::regclass AND NOT t.tgisinternal
UNION ALL
-- ⑥ 실제로 승격된 계정이 이미 있는지 (기대: 팀장 계정 외 0건)
SELECT 'H. 관리자 계정 수', role, count(*)::text
FROM public.profiles WHERE role <> 'parent' GROUP BY role
ORDER BY 1, 2;

ROLLBACK;
```

**⑥의 결과가 예상보다 많으면 즉시 알려 주십시오** — 지적 #1이 이미 악용됐다는 뜻일 수 있습니다.

---

*리뷰 1/5 끝. 코드 변경 0건 · git 조작 0건 · DB 접근 0건.*
