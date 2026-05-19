# ADR-0011 — 온보딩 플로우: 자녀 프로필 등록 (분기 전략·입력 범위·레벨 매핑)

**상태** Accepted
**날짜** 2026-05-19
**관련** `docs/adr/0009-auth-architecture.md`(POST_LOGIN_PATH·미들웨어 중앙 가드), `docs/intent/onboarding-flow.md`(본 ADR과 함께 phase-08 생성 — 사용자 흐름), `docs/intent/auth-flow.md`(§4.1-7·§4.5 분기 추가 지점), `tasks/phase-08-onboarding.json`, `supabase/migrations/001_initial_schema.sql`(children 테이블·RLS), `scripts/lib/level_estimator.py`(LEVEL_TABLE), `docs/design-system.md` 1.8절(레벨 1~5 컬러), `claude.md` 2절 Hard Rule 8·10

---

## 1. 배경

phase-07(인증)이 완료되어 이메일·Google 로그인·세션·보호 라우트·`profiles` 행 생성이 동작한다. phase-08은 그 위에 **자녀 프로필 등록 온보딩**을 얹는다 — 첫 로그인 직후 자녀 정보가 없으면 `/onboarding`으로 보내 자녀를 등록시키고 `/home`으로 진입시킨다.

`children` 테이블은 phase-03(`001_initial_schema.sql`)에서 이미 생성되어 있다(`id·parent_id·name·age·current_level·points·created_at·updated_at` + RLS 4정책). 따라서 phase-08은 **새 테이블·새 컬럼 없이** 기존 스키마 위에서 동작할 수 있는지가 설계의 출발점이다.

phase-08 진입 전, 새 세션이 임의 결정하면 안 되는 5개 항목을 사용자와 사전 합의했다(2026-05-19). 본 ADR은 그 결정과 근거를 박제한다.

---

## 2. 결정

### 결정 1 — 로그인 도착 지점 분기 (middleware 미수정)

"자녀 없으면 `/onboarding`, 있으면 `/home`" 분기는 **로그인이 완료되는 지점**(`app/auth/callback/route.ts`, `app/login/actions.ts`)에서만 수행한다. 공통 헬퍼 `resolvePostLoginPath`가 `children` 존재 여부를 1회 조회하여 도착 경로를 반환한다. `middleware.ts`는 **수정하지 않는다**.

콜백·서버 액션에서 `hasChildren` 조회 실패 시 `/auth/auth-error`로 처리한다(`ensureProfile` 실패와 동일 취급). DB 조회 실패는 드문 케이스이나, 잘못 추측해 `/home`으로 보내는 것보다 명시적 에러가 안전하다.

### 결정 2 — 베타 온보딩은 자녀 1명 고정 (D1)

온보딩 화면은 자녀 1명만 입력받는다. `children` 스키마는 다자녀(1 부모 N 자녀)를 그대로 지원하지만, 베타 온보딩 UI는 단일 자녀 폼으로 고정한다. 추가 자녀 등록·자녀 전환 UI는 출시 후로 미룬다.

### 결정 3 — 나이 기반 레벨 자동 추천 + 수동 조정 (D2)

학부모가 자녀 나이를 입력하면 레벨(1~5)이 자동 추천되어 미리 선택된다. 학부모는 이를 1~5 범위에서 자유롭게 바꿀 수 있다. 추천은 §3의 매핑표를 따르며 **강제가 아니다**.

### 결정 4 — 색상 아바타 (Supabase Storage 미사용) (D3)

자녀 프로필 이미지는 사진 업로드 대신 **색상 아바타**로 대체한다. 색상은 `design-system.md` 1.8절 레벨 컬러 토큰(`--level-1`~`--level-5`)을 재사용한다. `children` 테이블에 `avatar_url` 컬럼을 추가하지 않으며 Storage 버킷도 만들지 않는다.

### 결정 5 — 온보딩 입력 필드는 이름·나이·레벨만 (D4)

온보딩에서 받는 필드는 **이름·나이·레벨** 3개로 한정한다. 생일·성별 등은 받지 않는다(유아 대상 개인정보 최소 수집). 이름·나이는 학부모 입력 필수, 레벨은 결정 3에 따라 나이에서 자동 채워지되 수정 가능.

### 결정 6 — DB 스키마 변경 0건

결정 4·5의 결과로 phase-08은 **`children` 테이블을 수정하지 않는다**. 신규 마이그레이션 파일(`002_*.sql`)이 없다. Hard Rule 8(스키마 변경 시 ADR 선행)은 변경 자체가 없으므로 마이그레이션 의무가 발생하지 않으며, 본 ADR은 "스키마를 바꾸지 않는다"는 결정의 기록이다.

---

## 3. 나이 → 레벨 추천 매핑표 (정본)

phase-05 GDL sync(`scripts/lib/level_estimator.py`)를 확인한 결과, 그 모듈은 **책의 난이도**를 description 단어 수로 추정할 뿐 **자녀 나이→추천 레벨** 매핑은 갖고 있지 않다(케이스 C — 2026-05-19 지침). 다만 같은 모듈의 `LEVEL_TABLE`이 레벨↔나이 범위를 정의한다:

```python
LEVEL_TABLE = { 1:(3,4), 2:(4,5), 3:(5,6), 4:(6,7), 5:(7,7) }   # {level: (age_min, age_max)}
```

자녀 나이→레벨 매핑은 이 표의 `age_min`을 역인덱스하여 도출한다(각 레벨의 시작 나이 = 그 나이의 추천 레벨). 결과는 다음과 같다:

| 자녀 나이 | 추천 레벨 | 근거 |
|---|---|---|
| 3세 | Level 1 | `LEVEL_TABLE[1]` age_min = 3 |
| 4세 | Level 2 | `LEVEL_TABLE[2]` age_min = 4 |
| 5세 | Level 3 | `LEVEL_TABLE[3]` age_min = 5 |
| 6세 | Level 4 | `LEVEL_TABLE[4]` age_min = 6 |
| 7세 | Level 5 | `LEVEL_TABLE[5]` age_min = 7 |

초기 매핑은 phase-05 `LEVEL_TABLE`의 `age_min`(하한) 기준이며, 베타 데이터(완독률·재시도율)로 재검토 예정이다(phase-14 이후 데이터 기반 보정 여지).

이 표는 phase-08에서 `lib/levels/age-to-level.ts` 헬퍼로 구현한다. 학부모는 추천 레벨을 1~5 범위에서 수동으로 override할 수 있다(결정 3).

**단일 출처화 메모 (향후 작업).** `level_estimator.py`(Python, books용 level→나이범위)와 `age-to-level.ts`(TypeScript, children용 나이→level)는 언어가 달라 코드 공유가 불가능하다. 두 모듈이 같은 레벨 체계를 따로 들고 있게 되므로, **본 §3 표와 `LEVEL_TABLE`이 어긋나지 않도록 본 ADR §3을 레벨↔나이의 정본으로 박제한다.** 한쪽이 바뀌면 다른 쪽과 본 표를 함께 갱신해야 한다(§7 재검토 트리거).

> phase-05에 합리적 매핑 로직이 이미 있었다면 그것을 공통 헬퍼로 추출했을 것이나(지침 케이스 A), 실제로는 books용 난이도 추정만 존재하여 케이스 C로 처리했다 — 자녀 나이→레벨 헬퍼를 phase-08 작업 범위에 신규 포함한다.

---

## 4. 근거

### 4.1 분기를 middleware가 아니라 로그인 도착 지점에서 (결정 1)
- `auth-flow.md` §4.5는 "미들웨어는 화면(UX) 차원의 가드, RLS가 최종 방어선"이라는 phase-07 철학을 못박았다. middleware에서 매 요청 `children`을 조회하면 이 철학이 흔들리고 모든 보호 라우트 요청에 DB 조회가 추가된다.
- 정상 흐름의 분기는 "로그인이 막 끝난 1회"에 결정하면 충분하다. `callback/route.ts`와 `login/actions.ts`가 이미 `POST_LOGIN_PATH`로 보내는 그 지점에 헬퍼 한 번을 끼운다(`routes.ts:14` 주석 "phase-08에서 온보딩 분기가 추가될 자리"가 가리키는 지점).
- `/home` URL 직접 입력 같은 엣지 케이스는 phase-10 정식 홈이 어차피 `children`을 조회(추천 책 level 기준)하므로 그때 자연히 처리된다. phase-08의 임시 `/home`은 `children`을 쓰지 않아 자녀 없이 열려도 깨지지 않는다.
- `/onboarding` 페이지 자체에는 "이미 자녀가 있으면 `/home`으로" 역가드를 둔다(중복 등록 방지).

### 4.2 자녀 1명 고정 (결정 2)
- 베타 검증 목표는 콘텐츠·읽기 흐름이다. 다자녀 입력 폼(동적 리스트)과 자녀 전환 칩 UX는 phase-10 홈에서 다룰 일이며 온보딩을 무겁게 만든다.
- 스키마가 다자녀를 지원하므로 출시 후 자녀 추가 기능은 마이그레이션 없이 UI만 더하면 된다 — 1명 고정이 미래를 막지 않는다.

### 4.3 나이 기반 레벨 추천 (결정 3)
- 사용자(키키북스 운영자) 정의상 학부모는 비개발자이며 "레벨 3"이 무엇인지 사전 지식이 없다. 나이는 학부모가 100% 아는 값이다.
- 추천을 강제하지 않는 이유: 같은 나이라도 영어 노출 정도가 천차만별이다. 학부모가 가장 잘 안다.

### 4.4 색상 아바타 (결정 4)
- 사진 업로드는 Storage 버킷·RLS 정책·이미지 리사이즈·업로드 UI를 동반한다 — 베타 속도에 비해 비용이 크다.
- 색상 아바타는 1.8절 레벨 컬러 토큰 재사용으로 추가 자산 없이 구현되고 스키마를 건드리지 않는다.

### 4.5 입력 필드 최소화 (결정 5)
- 대상이 만 3~7세 유아다. 생일·성별 등은 베타 검증에 불필요하며 개인정보 수집을 늘릴 이유가 없다.
- `children.age`는 스키마상 nullable이지만 온보딩에서는 레벨 추천의 근거이므로 입력 필수로 받는다. `name`은 스키마 NOT NULL.

---

## 5. 결과

- phase-08은 `children` 테이블·RLS·트리거를 **그대로 사용**한다. `supabase/migrations`에 신규 파일이 없다(검증 항목 v4).
- 신규 코드: `lib/children/has-children.ts`, `lib/levels/age-to-level.ts`, `lib/auth/resolve-post-login-path.ts`, `app/onboarding/page.tsx`, `app/onboarding/actions.ts`, `components/onboarding/child-profile-form.tsx`.
- 수정 코드: `lib/auth/routes.ts`(`ONBOARDING_PATH` 상수 추가), `app/auth/callback/route.ts`·`app/login/actions.ts`(분기 헬퍼 적용).
- `middleware.ts`는 수정하지 않는다.
- `claude.md` 라우팅 테이블 "인증·온보딩" 행에 `docs/intent/onboarding-flow.md`를 추가한다(claude.md §10 "라우팅 행 추가 가능", 본 ADR이 그 변경 기록).

---

## 6. 미반영 항목 (의도적 보류)

- **다자녀 등록·자녀 전환 UI** — 출시 후. 스키마는 이미 지원.
- **자녀 사진 업로드(Storage)** — 출시 후 또는 보류. 결정 4 재검토 시.
- **자녀 정보 수정·삭제 화면** — phase-10 이후(홈 또는 설정 화면).
- **생일·성별 등 추가 필드** — 수집 필요가 사업적으로 입증될 때만.

---

## 7. 재검토 트리거

- **phase-10 정식 홈 진입** — 자녀 전환 UI가 필요해지면 결정 2를, 자녀 정보 수정 동선이 필요하면 결정 5를 재검토.
- **`level_estimator.py`의 `LEVEL_TABLE` 변경** — §3 매핑표·`age-to-level.ts`를 함께 갱신(단일 출처화 메모).
- **다자녀 가구 베타 피드백** — 1명 고정이 온보딩 이탈을 유발하면 결정 2를 앞당겨 검토.

---

*문서 끝.*
