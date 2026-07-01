# P0-2 auth 중복 진단·설계 리포트 (읽기전용, 수정 없음)

**작성일** 2026-07-01 · **기준 커밋** `fefdc9f` · **범위** 진단·설계만(코드·auth·스키마 무변경)
**트랙** 성능 개선 (`docs/intent/performance-track.md` §2 착수 순서 P0-2)
**근거 리포트** `docs/review/2026-07-01-senior-code-review-performance.md` P0-2

> 본 리포트는 **진단·설계·권고**만 담는다. auth는 로그인·세션에 직접 영향을 주는 민감 영역이라
> 이번 라운드는 코드를 수정하지 않는다. 실제 수정 방향(ADR 선행 여부 포함)은 팀장이 본 리포트를
> 보고 결정한 뒤 별도 지시서로 진행한다. 모든 사실은 grep/view 실측 근거만 단언하며, 확인이
> 필요한 항목은 "확인 필요"로 분리했다.

---

## 0. 결론 요약 (한 페이지)

- **현황(실측)**: `await supabase.auth.getUser()` 코드 호출부는 **18곳/16파일**(미들웨어 1 +
  페이지·서버액션·lib 17). 미들웨어는 matcher상 정적파일 외 **모든 요청**에 실행되므로,
  보호 페이지 1회 진입 = **미들웨어 getUser 1 + 목적지 getUser 1 = 요청당 2회 원격 검증**.
- **중복의 성격**: 완전한 잉여는 아니다. 미들웨어 getUser는 **세션 토큰 갱신 + 라우트 가드**,
  페이지 getUser는 **데이터 가드(redirect 안전망) + user.id 확보**가 목적이다(ADR-0009 3.3·3.4).
  둘 다 Auth 서버에 JWT를 원격 검증하는 **네트워크 왕복**을 각각 발생시킨다는 점만 중복이다.
- **핵심 판정**:
  - "요청 스코프 메모이제이션(React `cache()`)"은 **이 코드베이스에 적용 불가** — 중복은
    미들웨어↔페이지의 **서로 다른 실행(invocation) 경계**에 걸쳐 있어 렌더 내 메모이제이션이
    가로지를 수 없고, 단일 렌더 안에서 getUser를 2번 부르는 지점은 실측상 **없다**.
  - 실효 있는 저위험 후보는 **`getClaims()`로 로컬 JWT 검증 전환**이나, 이는 **비대칭 JWT 서명키
    사용 여부(프로젝트 설정)**에 이득이 전적으로 좌우된다 → **확인 필요**(팀장 대시보드).
- **★추천**: 코드를 손대기 전에 **(1) 비대칭 서명키 활성 여부 확인** + **(2) 2× getUser의
  실제 지연 기여 측정**을 먼저 한다. 비대칭키가 켜져 있으면 `getClaims` 전환이 최선(ADR 권장),
  아니면 **P0-2는 P0-1(캐싱) 뒤로 이연**을 권고한다(고정비·저ROI·민감영역).

---

## 1. 현황 실측 (grep/view)

### 1.1 `auth.getUser()` 코드 호출부 — 18곳 / 16파일

`grep -rn "await supabase.auth.getUser()" app lib middleware.ts` = **18줄**(주석 제외).
(직전 리포트의 "21"은 주석 문자열까지 센 수치였고, 실제 **코드 호출은 18**이다.)

| 분류 | 파일 (호출 수) |
|---|---|
| **미들웨어** (1) | `lib/supabase/middleware.ts:54` (updateSession) |
| **페이지 RSC** (9) | `app/page.tsx:60`(랜딩), `app/(reader)/home/page.tsx:60`, `library/page.tsx:81`, `book/[id]/page.tsx:68`, `book/[id]/read/page.tsx:94`, `book/[id]/celebrate/page.tsx:97`, `app/onboarding/page.tsx:25`, `app/showcase/page.tsx:33`, `app/showcase/[source]/page.tsx:107` |
| **서버액션·lib** (8) | `lib/library/actions.ts:96`, `lib/home/actions.ts:58`, `lib/onboarding/actions.ts:53`, `lib/book/rewards.ts:92`, `lib/book/reading-session.ts:85·162`(2), `lib/admin/gate.ts:128·207`(2) |

`getSession()`/`getClaims()` 코드 호출부: **0곳**(전량 `getUser`). 즉 모든 검증이 Auth 서버
원격 왕복 방식이다.

### 1.2 중복 경로 — "요청당 2회"의 구체 실측

- **미들웨어**(`middleware.ts:21-22` → `updateSession` → `lib/supabase/middleware.ts:54`):
  matcher(`middleware.ts:73`)가 `_next/static·_next/image·favicon·이미지 확장자`만 제외 →
  그 외 **모든 요청**(HTML·RSC 네비게이션·서버액션 POST 포함)에서 `getUser()` 1회.
- **목적지**(예: `/home` 진입 시 `home/page.tsx:60`): 페이지 RSC가 다시 `getUser()` 1회.
- 미들웨어와 RSC 렌더는 **별개 실행**이라 값 공유가 없다 → 같은 네비게이션에서 Auth 서버
  검증이 **2회**.
- 서버액션(예: 무한스크롤 `fetchLibraryPage`)도 POST가 미들웨어를 거치므로 **미들웨어 1 +
  액션 1 = 2회** 동일 패턴.

### 1.3 `getUser`는 왜 왕복인가 (view 근거)

`lib/supabase/middleware.ts:50-51` 주석: "getUser()는 Supabase Auth 서버에 세션을
검증·갱신한다. (getSession()은 쿠키만 신뢰하므로 미들웨어에서는 getUser()를 쓴다.)"
auth-js 2.105.4 `GoTrueClient.d.ts` getUser 문서도 "always sends a request to the Auth
server for each JWT"로 명시. 즉 getUser는 매 호출 원격 검증이다.

---

## 2. 중복의 성격 — 각 getUser가 무엇을 위한 것인가

ADR-0009(`docs/adr/0009-auth-architecture.md`)가 설계 의도를 못박는다.

| 호출 지점 | 목적 | ADR 근거 |
|---|---|---|
| **미들웨어 getUser** | ① **세션 토큰 갱신**(짧은 수명 토큰을 매 요청 refresh해 서버 컴포넌트가 만료 세션을 안 만나게) ② 보호 라우트 리다이렉트 가드 | ADR-0009 3.3(결정 3)·3.4(결정 4), `middleware.ts:11-19` |
| **페이지 getUser** | ① 미인증 리다이렉트 **2차 안전망**(미들웨어 우회 대비) ② **user.id 확보**(RLS 스코프 쿼리·`getActiveChild(user.id)` 등 입력) | 각 페이지 주석 "미들웨어 1차, 본 페이지 2차 안전망"; ADR-0009 3.4:69가 "화면마다 getUser 반복 → **중복**"을 이미 비용으로 인지 |

**결정적 정합성 근거 (RLS)**: ADR-0009 3.4:72·82 — "미들웨어(경험) + **RLS(강제)** 이중 방어".
데이터 보안의 최종 방어선은 RLS다. RLS는 앱이 넘긴 user.id가 아니라 **요청 토큰의 `auth.uid()`를
서버측에서** 평가한다. 따라서 앱-레벨 신원 확보 수단이 다소 약해져도(예: 스푸핑된 user.id) 남의
데이터는 RLS가 막는다 — **페이지 getUser의 보안 부담은 "데이터 유출 방지"가 아니라 "리다이렉트
UX 정확성 + 올바른 user.id로 자기 데이터 필터링"에 한정**된다. 이 점이 후보별 위험도 산정의 핵심이다.

---

## 3. 개선 후보 (위험도별) — 로그인·세션·RLS 영향 포함

### 후보 C(먼저 기각) — 요청 스코프 메모이제이션(React `cache()`) → **이 코드베이스에 적용 불가**

- **판정**: 지시서가 물은 "같은 요청에서 1회만 원격검증" 아이디어는 **여기서 효과 0**이다.
  이유 (실측):
  1. 핵심 중복은 **미들웨어↔페이지**인데, 둘은 별개 실행이라 `cache()`(단일 RSC 렌더 트리
     스코프)가 **경계를 넘지 못한다**.
  2. **단일 렌더 안에서 getUser를 2번 부르는 지점이 없다** — 각 페이지는 1회, 각 서버액션은
     1회 호출(홈 렌더 검증: page:60 이후 `getActiveChild`/`getRecommendations`/`getGreetingProfile`
     등은 어느 것도 getUser를 재호출하지 않음). 메모이제이션할 중복 자체가 없다.
- **영향**: 없음(적용 불가). **이 후보는 권고하지 않는다.** (정직성 요건 — 흔한 Supabase 최적화
  이나 이 코드 구조에는 해당 사항 없음.)

### 후보 A — `getClaims()` 로컬 JWT 검증 전환 (위험도 **중**, ADR 권장)

- **내용**: 미들웨어·페이지의 `getUser()`를 `getClaims()`로 교체. auth-js 2.105.4
  `GoTrueClient.d.ts`(getClaims 문서, view 실측):
  - **비대칭 JWT 서명키(ECC/RSA)** 사용 시 → **WebCrypto로 로컬 검증**, JWKS는 캐시,
    "usually without a network request", "significantly faster". "Prefer this over getUser
    which always sends a request."
  - **대칭 secret(레거시 HS256)** 사용 시 → getUser처럼 **서버 요청** → **이득 0**.
- **보안(정합성)**: getSession(쿠키 무검증 신뢰, Supabase가 경고)과 달리 getClaims는 **JWT 서명을
  암호학적으로 검증**한다 → 신원 신뢰성은 getUser와 동등(원격 대신 로컬 서명검증). §2의 RLS 백스톱과
  결합하면 보안 부담 낮음. 세션 갱신도 getClaims가 "만료 임박 시 먼저 refresh"를 수행(문서 명시)하므로
  미들웨어 refresh 책임 유지 가능(단, 쿠키 setAll 갱신 동작은 **테스트 확인 필요**).
- **비용/리스크**:
  - user 객체 대신 **claims 반환**(user.id = `claims.sub`). 각 호출부가 user의 어떤 필드를 쓰는지
    **전수 감사 필요**(대부분 user.id → sub 매핑이나, email·user_metadata 사용처 있으면 개별 처리).
  - 16파일 auth 패턴 전환 = **시스템 전반 변경** → ADR-0009 개정(auth 아키텍처) **권장**.
  - **이득이 서명키 종류에 전적으로 좌우** → 비대칭키 미사용이면 순이득 0.
  - ephemeral 환경(요청마다 인스턴스 소멸)에선 JWKS 캐시 미유지로 매번 왕복 가능 — 단
    Vercel Fluid Compute는 인스턴스 재사용(세션 컨텍스트)이라 캐시 유지에 유리(**확인 필요**).
- **성능 이득**: 비대칭키 O → 요청당 최대 2회 Auth 왕복이 로컬 검증으로 대체(큰 이득 가능).
  비대칭키 X → **이득 없음**.

### 후보 B — 페이지가 미들웨어 검증을 신뢰(페이지 getUser 제거 또는 getSession) (위험도 **고**, ADR 필수)

- **내용**: 페이지 2차 getUser를 없애고 미들웨어 검증만 신뢰하거나 getSession(로컬 쿠키)로 대체.
- **정합성 영향(경고)**:
  - Supabase 공식 경고 — getSession/쿠키 user는 "must not be trusted"(auth-js 문서). getUser/getClaims
    없이 신뢰하면 신원 검증이 약화.
  - 코드베이스가 **의도적으로 심은 "2차 안전망"**(모든 페이지 주석·ADR-0009 3.4)을 제거 → 미들웨어
    우회 경로에서 UX 가드 공백. 데이터는 RLS가 막으나(§2), redirect UX·user.id 정확성은 약화.
- **위험 대비 이득**: getClaims(후보 A)가 같은 왕복 제거를 **암호학적 검증을 유지한 채** 달성하므로,
  B는 이득이 A와 비슷하면서 리스크만 크다. **권고하지 않음**. ADR 없이는 절대 진행 불가.

### 후보 D — 이연/수용 (위험도 **없음**)

- **내용**: 이번엔 auth를 손대지 않고 P0-1(캐싱) 완료 후 재평가.
- **근거**: 2× getUser는 **요청당 고정비**(데이터·트래픽 증가에 따라 악화되지 않음). 체감 저하의
  성장 요인은 P0-1(force-dynamic·캐싱 부재)·P0-3(전량 스캔)에 더 가깝다. 민감영역을 추측으로
  건드리기보다, **P0-2의 실제 지연 기여를 측정**해 ROI가 확인될 때 착수하는 편이 안전.

---

## 4. ★추천 (팀장 결정용)

**추천 = "측정·설정확인 먼저, 그다음 후보 A(getClaims) 또는 후보 D(이연)".**

구체 순서:
1. **(선행, 코드무관) 비대칭 JWT 서명키 활성 여부 확인** — Supabase 대시보드 Auth → JWT/Signing
   Keys. 이 한 가지가 후보 A의 이득 유무를 가른다.
2. **(선행) 2× getUser의 실제 지연 기여 측정** — 브라우저 Network의 `/auth/v1/user` 호출 수/시간,
   Vercel 라우트 TTFB. 왕복 지연이 유의미할 때만 auth를 건드린다.
3. **분기**:
   - 비대칭키 **O** + 측정상 유의미 → **후보 A(getClaims) 진행, ADR-0009 개정 선행 권장**.
     (전수 필드 감사 + 미들웨어 refresh/쿠키 동작 테스트를 별도 지시서 범위로.)
   - 비대칭키 **X** 또는 측정상 미미 → **후보 D(이연)**. P0-1(캐싱) 완료 후 재평가.

**ADR 필요 여부(이번엔 작성 안 함, 권고만)**: 후보 A·B 모두 auth 아키텍처(ADR-0009) 변경이므로
**ADR 선행 필요**. 후보 C·D는 코드 변경이 없어 ADR 불요.

---

## 5. 확인 필요 목록 (추측 아님 — 실측 불가 항목)

1. **비대칭 JWT 서명키 사용 여부** — 팀장 대시보드. 후보 A 이득의 전제(linchpin).
2. **배포/미들웨어 런타임과 JWKS 캐시 유지** — Vercel Fluid Compute는 유리하나 실제 미들웨어
   런타임(edge/node)·캐시 지속성 확인.
3. **getClaims 전환 시 각 호출부 user 필드 사용 감사** — user.id(→sub) 외 email·user_metadata
   사용처 유무(16파일 전수).
4. **미들웨어 refresh/쿠키 setAll 동작이 getClaims에서도 동일한지** — 테스트로 확인.
5. **2× getUser의 절대 지연 기여** — Vercel/Supabase 실측(측정 전 auth 변경 비권장).

---

## 6. 정직성 경고

- 후보 A의 성능 이득은 **비대칭 서명키 설정에 전적으로 의존**한다. 이를 확인하지 않고 착수하면
  16파일을 바꾸고도 **이득 0**일 수 있다.
- 후보 B는 이득이 A와 유사하면서 **로그인/세션 UX 정합성 리스크가 더 크다** — 이득 대비 위험 과다.
- auth는 로그인·세션 민감영역이다. **측정으로 지연 기여가 확인되기 전에는** P0-1(캐싱, 성장하는
  비용) 우선이 합리적이다. 2× getUser는 고정비라 방치해도 악화되지 않는다.

*리포트 끝. 실제 수정은 §4 선행 확인(비대칭키·측정) 결과를 팀장이 검토한 뒤 별도 지시서로 진행한다.*
