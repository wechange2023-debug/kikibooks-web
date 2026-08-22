# ADR-0068: `profiles.role`을 사용자가 바꾸지 못하게 막는다

## Status

**Accepted** (2026-08-22, 팀장 DB 적용 완료) / 최초 제안 2026-08-22 (Proposed)
기준 HEAD `3834058` (`main`, origin 반영 완료)

리뷰 P-2-1 지적 #1(P0)의 조치안이다. **DB 실행은 팀장 전속**이었고 2026-08-22 완료됐다 —
워커는 DB에 접근하지 않았다. 검증 결과는 §검증 기록 참조.

## Deciders

팀장(키키) · 오케스트레이터(비기) · 워커(Claude Code)

## Related

- `docs/ops/code-review-2026-08/01-auth-data.md` **지적 #1** — 본 ADR의 출발점
- `supabase/migrations/001_initial_schema.sql:25-26`(`role` 컬럼·CHECK) · `:231-234`(UPDATE 정책)
- `lib/admin/gate.ts:137-149` — 이 값을 읽어 관리자 여부를 판정한다
- **ADR-0009 3.4절** — 데이터 보호의 최종 방어선은 RLS. 본 ADR은 RLS **위에** 트리거 한 겹을 더한다
- **claude.md Hard Rule 8** — DB 스키마 변경은 ADR 선행. 본 ADR이 그 선행이다

## Context

### 1. 무엇이 뚫려 있는가

`profiles.role`은 평범한 컬럼이고(`001:25-26`, CHECK가 `'admin'`을 허용), 본인 행 UPDATE가
열려 있으며(`001:231-234`), 그 정책에 **컬럼 제한이 없다**.

```sql
CREATE POLICY "users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);          -- WITH CHECK 없음 → USING이 그대로 CHECK로 쓰인다
```

새 행도 `auth.uid() = id`만 만족하면 되고 `role` 값은 검사하지 않는다. 즉 **로그인한 누구나
브라우저에 노출된 publishable 키로 PostgREST를 직접 호출해 자기 `role`을 `'admin'`으로 바꿀 수
있다.** 앱 화면·서버 액션을 거치지 않으므로 애플리케이션 가드가 개입할 지점이 없다.

승격되면 `/admin` 전체에 닿는다 — 전 사용자·전 자녀 조회(`lib/admin/users/query.ts:286`·`:370`,
service role로 RLS 우회), `books` 활성화·레벨 변경(`lib/admin/books/actions.ts:139`·`:187`).

### 2. 팀장 실측 (2026-08-22, 리뷰 §6 SQL)

| 라벨 | 확인 대상 | 결과 | 판정 |
|---|---|---|---|
| **A** | `profiles`의 사용자 트리거 | **보호 트리거 0건** | 막는 장치 없음 |
| **B** | `profiles` UPDATE 정책의 실제 식 | **`WITH CHECK` 없음** | 컬럼 제한 없음 |
| **C** | `anon`·`authenticated`의 테이블 권한 | **전 권한 보유** | UPDATE 가능 |
| **H** | `role <> 'parent'` 계정 수 | **관리자 1명** | 팀장 계정뿐 — **악용 흔적 없음** |

A·B·C가 모두 "막지 않음"이므로 **지적 #1은 확정**이다. H가 1이므로 **아직 악용되지는 않았다.**

### 3. 부수 확인 — 라이선스 장치는 살아 있다

같은 SQL의 **F** 항목은 `information_schema.columns.is_nullable`을 조회했고 결과가 **`NO`** 였다.
SQL 표준에서 `is_nullable = 'NO'`는 **"이 컬럼은 NULL을 가질 수 없다"** 는 뜻이다. 즉
`books.attribution_text`의 **NOT NULL 제약이 그대로 살아 있다**(Hard Rule 1 무저촉).
`'YES'`였다면 제약이 풀린 것이었다.

## Decision

### D1 — 트리거 `protect_profiles_role`을 신설한다

`BEFORE INSERT OR UPDATE ON public.profiles`, `FOR EACH ROW`.

| 상황 | 동작 |
|---|---|
| 요청자가 **우회 대상**(아래 판정식) | 그대로 통과 |
| 그 외 **INSERT** | `NEW.role := 'parent'` 로 **덮어쓴다**(거부하지 않는다) |
| 그 외 **UPDATE** 이고 `NEW.role IS DISTINCT FROM OLD.role` | `RAISE EXCEPTION` (SQLSTATE `42501`) |
| 그 외 **UPDATE** 이고 role 무변경 | 그대로 통과 |

**INSERT는 왜 거부가 아니라 덮어쓰기인가.** 거부하면 정상 가입이 깨진다 —
`ensureProfile`(`lib/auth/ensure-profile.ts:30-35`)이 로그인마다 `profiles` upsert를 시도하는데,
어떤 이유로든 `role`이 페이로드에 섞이면 로그인 자체가 실패한다. 덮어쓰기는 **공격은 무력화하고
정상 흐름은 건드리지 않는다.** UPDATE는 반대다 — 정상 앱 코드가 `role`을 바꾸는 경로가 **하나도
없으므로**(§영향 범위), 시도 자체가 비정상 신호다. 그래서 조용히 무시하지 않고 **소리 내어
거부**한다(fail-loud).

#### 우회 판정식 (명시)

```sql
coalesce(auth.role(), '') = 'service_role'
  or coalesce(current_setting('request.jwt.claims', true), '') = ''
```

- **첫 항** — PostgREST를 통해 들어온 **service_role** 요청. Supabase 표준 헬퍼 `auth.role()`은
  `request.jwt.claims`의 `role` 클레임을 읽는다.
- **둘째 항** — **JWT가 아예 없는 직접 접속**(Supabase SQL Editor · 마이그레이션 · psql).
  이 항이 없으면 D3(관리자 지정)이 성립하지 않는다 — SQL Editor는 `postgres` 역할로 붙고
  `request.jwt.claims`가 설정되지 않아 `auth.role()`이 NULL을 돌려주므로, 첫 항만으로는
  **팀장 본인의 SQL Editor 작업까지 막힌다.**

`SECURITY DEFINER`를 쓰지 않는다. 이 함수는 권한 상승이 필요 없고 `auth.role()`·`current_setting`만
읽는다. 기본값(`SECURITY INVOKER`)이 더 좁은 권한이다.

### D2 — UPDATE 정책에 `WITH CHECK (auth.uid() = id)`를 명시한다

```sql
CREATE POLICY "users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);   -- ← 추가
```

**행위는 바뀌지 않는다.** `WITH CHECK`가 생략되면 PostgreSQL이 `USING` 식을 그대로 쓰기 때문이다.
그럼에도 명시하는 이유는 **읽는 사람 때문**이다 — 지금 형태는 "새 행을 검사하지 않는다"처럼
읽히고, 실제로 리뷰가 그 지점에서 멈춰 P0을 찾아냈다. 명시해 두면 다음 사람이 `WITH CHECK`에
조건을 **추가**해야 한다는 것을 바로 안다.

D1이 실질 방어이고 D2는 **문서화 겸 2중 방어**다. D1 트리거가 어떤 이유로 사라져도 D2만으로는
`role` 변경을 막지 못한다는 점을 분명히 해 둔다 — 둘은 대체재가 아니다.

### D3 — 관리자 지정은 `service_role` 경로로만 한다

**운영 절차**: 관리자를 늘릴 때는 팀장이 Supabase SQL Editor에서
`update public.profiles set role='admin' where email='<대상>';` 를 실행한다(D1 우회 둘째 항으로 통과).
앱 화면·서버 액션에는 role 변경 기능을 **만들지 않는다.**

### D4 — 컬럼 단위 `REVOKE`는 채택하지 않는다

`REVOKE UPDATE (role) ON profiles FROM authenticated`로도 막을 수 있다. 기각한다.

- **컬럼이 늘어날 때마다 누락 위험**이 생긴다. 컬럼 권한은 "남은 컬럼 전체"를 다시 GRANT해야
  하는 구조라, 새 컬럼을 추가하면 조용히 권한이 빠지거나 남는다.
- 현재 저장소에 `GRANT`/`REVOKE` 구문이 **0건**이다. 여기서 컬럼 권한 체계를 시작하면
  **앞으로 모든 테이블 변경이 권한 재검토를 동반**한다. 트리거 한 개가 유지 비용이 낮다.
- 트리거는 **INSERT 경로까지 한 번에** 덮지만, `REVOKE UPDATE (role)`은 INSERT를 막지 못한다.

---

## 영향 범위

**앱 코드 변경 0건이 예상된다.** 아래는 예상이며, 구현 시 실제로 열어보고 **예상과 다르면
STOP 후 보고**한다.

| 대상 | 예상 | 근거 |
|---|---|---|
| `lib/auth/ensure-profile.ts:30-35` | **무변경** — upsert 페이로드가 `{id, email}`뿐이라 `role`을 쓰지 않는다. `ignoreDuplicates: true`라 기존 행을 덮지도 않는다 | **확인하라** |
| `lib/admin/gate.ts:137-141`·`:218-222` | **무변경** — `role`을 **읽기만** 한다(`.select('id, role')`) | **확인하라** |
| `lib/admin/users/query.ts:290` | **무변경** — 목록 표시용 `select`에 `role` 포함, 쓰기 0건 | **확인하라** |
| 그 밖의 `profiles` 접근 | `lib/admin/stats/query.ts:100`(count) · `lib/home/greeting.ts:45`(display_name) — 전부 SELECT | **확인하라** |

**`role`을 쓰는(write) 앱 코드는 전수 grep 결과 0건이다.** `.update(`·`.upsert(`·`.insert(`와
`role`이 함께 등장하는 지점이 없다. 따라서 D1의 UPDATE 거부가 정상 기능을 깨뜨릴 표면이 없다.

**service_role 클라이언트로 role을 바꾸는 코드도 0건**이다 — admin 액션은 `books`
(`lib/admin/books/actions.ts:139`·`:187`)와 `book_review`(`lib/admin/review/actions.ts:216`·`:286`)만
쓴다.

---

## 검증 기준

| # | 조건 | 통과 기준 |
|---|---|---|
| **V1** | 동봉 SQL의 **시뮬레이션 3건** | ① 일반 사용자 UPDATE → **거부** ② 일반 사용자 INSERT `role='admin'` → 저장값이 **`parent`** ③ service_role UPDATE → **허용**. 결과 표의 「1. 시뮬레이션」 행이 전부 `PASS` (SEC-1b에서 NOTICE → 결과 표로 변경 — SQL Editor가 NOTICE를 표시하지 않아서다) |
| **V2** | COMMIT 후 팀장 재조회 | 리뷰 §6의 **A 항목에 트리거 1건**(`protect_profiles_role`)이 보이고, **B 항목 `CHECK=`에 식이 채워진다** |
| **V3** | 배포본 회귀 | 일반 계정 로그인·가입·자녀 등록 정상, 관리자 계정 `/admin` 진입 정상. **가입이 막히면 즉시 원복** |

**실행은 SQL Editor 1회로 끝난다.** `supabase/migrations/010_*.sql`은 **기록·재현용 정본**이며
자동 실행되지 않는다(009와 같은 취급 — `009_book_review_status_tts_requested.sql:3-7` 선례).

## 검증 기록 (2026-08-22, 팀장 실행)

`scripts/sql/2026-08-22_protect_profiles_role.sql` 1차 실행(ROLLBACK) → 결과 표 확인 →
`COMMIT`으로 바꿔 2차 실행. 순서·결과는 아래와 같다.

### V1 — 시뮬레이션

| # | 결과 | 판독 |
|---|---|---|
| `[0]` | **역할 전환 가능** | 1~3의 판정이 유효하다 |
| `[1]` | **PASS** | 일반 사용자의 `role` 변경이 거부됐다 — D1이 목적을 달성한다 |
| `[2]` | **SKIP** | 프로필이 없는 `auth.users` 행이 0건이라 INSERT 경로를 모의하지 못했다 |
| `[3]` | **PASS** | `service_role` 경로는 허용됐다 — D3(관리자 지정)이 계속 가능하다 |

**`[2]`는 실패가 아니라 표본 부재다.** 모든 사용자가 이미 프로필을 갖고 있어 "프로필이 없는
사용자가 role='admin'으로 INSERT를 시도하는" 상황 자체를 만들 수 없었다. 트리거의 INSERT 분기
(`tg_op = 'INSERT'` → `new.role := 'parent'`)는 **코드로만 확인됐고 실행으로는 확인되지 않았다.**
→ **미검증으로 남긴다.** 신규 가입이 한 건 발생하면 그 행의 `role`이 `'parent'`인지 확인하면
자연스럽게 메워진다(신규 가입은 정확히 이 경로를 탄다).

### V2 — 적용 후 재조회

팀장 **COMMIT 완료**. 트리거와 정책이 실물 DB에 존재함을 확인했다.
리뷰 §6 SQL 기준으로 **A 항목에 `profiles_protect_role` 트리거**가 보이고,
**B 항목 `CHECK=`에 식이 채워진** 상태다.

### V3 — 배포본 회귀

| 항목 | 결과 |
|---|---|
| 일반 계정 로그인 | **정상** |
| 일반 계정의 `/admin` 접근 | **차단** |
| 관리자 계정의 `/admin` 진입 | **정상** |

가입이 막히는 증상은 발생하지 않았다(D1이 INSERT를 거부가 아니라 덮어쓰기로 처리한 이유).

---

## 원복

```sql
drop trigger if exists profiles_protect_role on public.profiles;
drop function if exists public.protect_profiles_role();
```
D2는 되돌릴 필요가 없다(행위 동일). 트리거만 지우면 변경 전 상태다.

---

*ADR-0068 끝. Status: Accepted (2026-08-22 팀장 DB 적용 완료).*
