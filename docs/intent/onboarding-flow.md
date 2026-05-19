# 의도 문서 — 온보딩 흐름 (onboarding-flow)

**대상 페이즈** phase-08-onboarding
**상태** 확정 (phase-08 기준)
**최종 갱신** 2026-05-19
**관련** `docs/adr/0011-onboarding-flow.md`, `docs/intent/auth-flow.md`(§4.1·§4.5 분기 추가 지점), `tasks/phase-08-onboarding.json`, `supabase/migrations/001_initial_schema.sql`(children 테이블·RLS), `scripts/lib/level_estimator.py`(LEVEL_TABLE), `docs/design-system.md` 1.8절(레벨 컬러), `PLAN.md` 9절(Week 3~4), `claude.md` 2절 Hard Rule 6·8·10

---

## 1. 이 문서의 목적

키키북스의 **자녀 프로필 등록 온보딩**이 사용자 입장에서 어떻게 동작해야 하는지를 자연어로 먼저 못박는다. 코드는 이 문서를 따른다(claude.md §3-5: 의도 문서 선행). 기술적 "왜"의 근거와 대안 비교는 `docs/adr/0011-onboarding-flow.md`에 있다.

이 문서는 phase-07의 `auth-flow.md`가 §4.1-7·§4.5·§6에서 "phase-08로 미룬다"고 표시한 부분 — "자녀 프로필이 없으면 `/onboarding`으로" 분기와 `/onboarding` 화면 — 을 이어받는다.

---

## 2. 범위

**phase-08이 다루는 것**

- 첫 로그인 직후 자녀 정보가 없으면 `/onboarding`으로 보내는 분기
- `/onboarding` 화면 — 자녀 1명의 이름·나이·레벨 입력 폼
- 나이를 입력하면 레벨이 자동 추천되고, 학부모가 수동으로 바꿀 수 있음
- 입력 완료 시 `children` 테이블에 행 1건 INSERT
- 등록 후 `/home`으로 이동
- 이미 자녀가 있는 사용자는 `/onboarding`을 건너뛰고 바로 `/home`

**phase-08이 다루지 않는 것 (다음으로 연결)**

- 다자녀 등록·자녀 전환 UI → 출시 후 (ADR-0011 결정 2)
- 자녀 사진 업로드 → 색상 아바타로 대체 (ADR-0011 결정 4)
- 자녀 정보 수정·삭제 화면 → phase-10 이후
- 정식 홈 화면(`/home` 교체) → phase-10
- `middleware.ts` 수정 → 하지 않음 (ADR-0011 결정 1)

---

## 3. 라우트 지도

| 경로 | 공개/보호 | 비고 |
|---|---|---|
| `/onboarding` | 보호 | phase-08에서 구현. 자녀 입력 폼. 이미 자녀가 있으면 `/home`으로 역가드 |
| `/home` | 보호 | phase-07 임시 화면 유지. phase-10에서 교체. phase-08은 미수정 |

`/onboarding`은 `lib/auth/routes.ts`의 `PROTECTED_PREFIXES`에 이미 들어 있어, 비로그인 사용자는 `middleware.ts`가 `/login`으로 막는다(phase-07에서 완성). phase-08은 미들웨어를 더 손대지 않는다.

---

## 4. 사용자 흐름 (단계별)

### 4.1 첫 로그인 → 온보딩 → 홈 (핵심 흐름)

1. 학부모가 회원가입 또는 로그인을 끝낸다(이메일 확인 링크·이메일 로그인·Google — `auth-flow.md` §4.1~4.3).
2. 로그인이 완료되는 지점(`/auth/callback` 또는 이메일 로그인/회원가입 서버 액션)에서 `profiles` 행이 보장된 직후, **자녀 정보가 있는지 확인**한다.
3. 자녀가 한 명도 없으면 `/home`이 아니라 **`/onboarding`으로** 보낸다.
4. `/onboarding`에서 학부모가 자녀의 이름·나이를 입력한다. 나이를 고르면 레벨이 자동으로 추천되어 미리 선택된다(§4.3).
5. 학부모가 추천 레벨을 그대로 두거나 1~5 중 다른 값으로 바꾼다.
6. "시작하기"(완료 버튼)를 누르면 입력값이 **서버 액션**으로 전달되고, `children` 테이블에 자녀 행이 1건 만들어진다(§4.4).
7. 등록이 끝나면 `/home`으로 이동한다.

### 4.2 이미 자녀가 있는 사용자의 로그인

1. 자녀를 이미 등록한 학부모가 다시 로그인한다.
2. §4.1-2단계의 자녀 확인에서 자녀가 발견되므로 `/onboarding`을 건너뛰고 곧장 `/home`으로 간다.
3. 이 사용자가 주소창에 `/onboarding`을 직접 입력하면, `/onboarding` 화면이 자녀 존재를 확인하고 `/home`으로 되돌려보낸다(중복 등록 방지 — 역가드).

### 4.3 나이 기반 레벨 추천

- 학부모가 자녀 나이(만 3~7세)를 고르면 레벨이 다음과 같이 자동 추천된다: 3세→1, 4세→2, 5세→3, 6세→4, 7세→5 (ADR-0011 §3 매핑표, `LEVEL_TABLE` 정합).
- 추천은 **출발점**일 뿐 강제가 아니다. 학부모는 레벨을 1~5 중 어느 값으로든 바꿀 수 있다.
- 레벨 선택 UI의 색은 `design-system.md` 1.8절 레벨 컬러(`--level-1`~`--level-5`)를 쓴다. 자녀 색상 아바타도 같은 토큰을 재사용한다(ADR-0011 결정 4).

### 4.4 children 행 생성

- 서버 액션이 **사용자 본인 세션**으로 `children`에 INSERT한다 — `001` 스키마의 RLS 정책 `parents can insert own children`(`parent_id = auth.uid()`)을 그대로 통과한다. 추가 권한·스키마 변경이 필요 없다.
- INSERT하는 값: `parent_id`(현재 로그인 사용자), `name`, `age`, `current_level`. `points`는 DB 기본값 0, `id`·`created_at`·`updated_at`은 DB가 채운다.
- 입력값은 클라이언트 검증(폼)을 신뢰하지 않고 서버 액션에서 다시 검증한다: 이름은 비어 있지 않음, 나이 3~7, 레벨 1~5 (`children` 스키마 CHECK 제약과 동일 범위).

---

## 5. 지켜야 할 규칙·제약

- **Hard Rule 8** — phase-08은 `children` 테이블을 바꾸지 않는다. 신규 마이그레이션 파일이 없다(ADR-0011 결정 6).
- **Hard Rule 10** — `/onboarding` 화면의 색·간격·폰트는 `design-system.md` semantic 토큰만 쓴다. 레벨 컬러도 1.8절 토큰. raw 색상값 직접 입력 금지.
- **Hard Rule 6** — 온보딩 흐름은 publishable 키로만 동작한다. secret 키는 어디에도 등장하지 않는다.
- **입력은 서버 액션으로** — 자녀 정보 저장은 서버 액션이 담당한다(브라우저가 직접 DB에 쓰지 않는다).
- **분기는 로그인 도착 1회** — 자녀 확인 분기는 로그인 직후에만 한다. `middleware.ts`는 수정하지 않는다(ADR-0011 결정 1).
- **개인정보 최소 수집** — 이름·나이·레벨 외 필드는 받지 않는다.

---

## 6. phase-08이 끝나면 이어지는 것

- **phase-09**: 랜딩(`/`).
- **phase-10**: 정식 홈(`/home` 교체) — 자녀 프로필 칩·자녀별 추천. 자녀 전환·수정 UI가 여기서 다뤄질 수 있다.
- **출시 후**: 다자녀 등록, 자녀 사진 업로드 (ADR-0011 §6).

---

## 7. 사용자(키키북스 운영자)가 직접 해야 하는 일

없음. phase-08은 코드만으로 완결되며 외부 콘솔 설정(Supabase Storage 버킷 등)이 필요하지 않다(ADR-0011 결정 4·6). 검증은 `tasks/phase-08-onboarding.json`의 클릭 테스트(v6~v11)를 사용자가 직접 수행한다.

*문서 끝.*
