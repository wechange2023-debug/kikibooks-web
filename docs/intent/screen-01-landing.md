# 의도 문서 — Screen 01 랜딩 페이지 (screen-01-landing)

**대상 페이즈** phase-09a-screen-01-landing-static
**상태** 확정 (phase-09a 기준)
**최종 갱신** 2026-05-19
**관련** `docs/adr/0012-landing-page-static.md`, `docs/adr/0013-cover-attribution-policy.md`, `tasks/phase-09a-screen-01-landing-static.json`, `docs/design-system.md`(2.2 타입 스케일·6.1 Button·6.2 Card·1.x 컬러), `docs/guidelines/license-rules.md`(4·5절 어트리뷰션), `lib/auth/resolve-post-login-path.ts`(phase-08 분기 헬퍼), `supabase/migrations/001_initial_schema.sql`(books 테이블·공개 SELECT 정책), `PLAN.md` 9절(Screen 01)·15절(CC BY·closed env), `claude.md` 2절 Hard Rule 6·9·10

---

## 1. 이 문서의 목적

비로그인 방문자가 키키북스를 처음 만나는 화면 — 랜딩 페이지(`/`) — 이 사용자 입장에서 어떻게 동작해야 하는지를 자연어로 못박는다. 코드는 이 문서를 따른다(claude.md §3-5: 의도 문서 선행). 기술적 "왜"와 대안 비교는 `docs/adr/0012-landing-page-static.md`(랜딩 설계 결정)와 `docs/adr/0013-cover-attribution-policy.md`(표지 어트리뷰션 정책)에 있다.

랜딩의 목표는 하나다: **비로그인 방문자가 "무료로 시작하기"를 눌러 가입을 결심하게 만든다.**

---

## 2. 범위

**phase-09a가 다루는 것**

- `app/page.tsx`를 Phase 0 placeholder에서 정식 랜딩 페이지로 교체
- 비로그인 방문자에게 5개 섹션(헤더·히어로·핵심 가치·인기 책·푸터)을 정적으로 표시
- 로그인 상태로 `/`에 접근하면 페이지 컴포넌트 안에서 자녀 유무에 따라 `/home` 또는 `/onboarding`으로 리다이렉트
- 인기 책 6권을 **랜덤**으로 골라 표지 그리드로 노출
- 이용약관(`/terms`)·개인정보처리방침(`/privacy`) placeholder 페이지 신설
- 검색엔진 정책(`robots.txt`)·사이트맵(`sitemap.xml`)·SEO 메타데이터·소셜 공유 이미지(OG)

**phase-09a가 다루지 않는 것 (다음으로 연결)**

- "인기순" 알고리즘 — 베타 데이터가 없어 무의미. phase-09a는 **랜덤 6권**으로 대체 (ADR-0012 결정 3)
- 랜딩 카피·책 큐레이션 관리 Admin 화면 → **phase-13b** (ADR-0012 결정 1)
- 파트너(출판사) 로고 섹션 → 협상 체결 전이라 노출할 파트너가 없음. 표지 그리드가 콘텐츠 미리보기 역할을 대신한다
- 책 상세 페이지의 전체 어트리뷰션 박스(`AttributionBox`) → phase-11 (license-rules.md 5절)
- 책 상세·뷰어 화면 → phase-11·12. phase-09a에서 표지 클릭은 가입(`/signup`)으로 유도
- 정식 약관·개인정보처리방침 문안 → phase-14 정식 출시 전 변호사 검토로 교체

---

## 3. 라우트 지도

| 경로 | 공개/보호 | 비고 |
|---|---|---|
| `/` | 공개 | 랜딩 페이지. 로그인 상태면 페이지 컴포넌트가 `/home`·`/onboarding`으로 리다이렉트 |
| `/terms` | 공개 | 이용약관 placeholder. 베타 임시 배너 포함 |
| `/privacy` | 공개 | 개인정보처리방침 placeholder. 베타 임시 배너 포함 |

세 경로 모두 `lib/auth/routes.ts`의 `PROTECTED_PREFIXES`에 들어가지 않으므로 기본 공개다. **`routes.ts`·`middleware.ts`는 수정하지 않는다**(ADR-0012 결정 4, claude.md 라우팅 §6.5 "routes.ts 변경 0건" 원칙).

---

## 4. 사용자 흐름 (단계별)

### 4.1 비로그인 방문자 (핵심 흐름)

1. 방문자가 `/`에 접속한다.
2. 히어로의 메인 카피("우리 아이의 첫 영어 그림책 서재")와 핵심 가치 4개를 본다.
3. 인기 책 6권의 표지를 본다. 각 표지 아래에 책 제목·저자가 캡션으로 표시된다(§5-④, ADR-0013).
4. "무료로 시작하기" 버튼 또는 표지를 누르면 회원가입(`/signup`)으로 이동한다.
5. 헤더의 "로그인"을 누르면 로그인(`/login`)으로 이동한다.

### 4.2 이미 로그인한 사용자가 `/`에 접근

1. 로그인 상태에서 주소창에 `/`를 입력하거나 로고를 누른다.
2. `/` 페이지(서버 컴포넌트)가 세션을 확인하고, phase-08의 `resolvePostLoginPath()` 헬퍼로 도착 경로를 정한다.
3. 자녀가 있으면 `/home`, 없으면 `/onboarding`으로 리다이렉트된다. 랜딩 화면은 렌더되지 않는다.
4. 분기는 `middleware.ts`가 아니라 `/` 페이지 안에서만 일어난다(ADR-0012 결정 4 — phase-08 "분기는 도착 지점에서" 원칙 계승).

### 4.3 인기 책 6권 선정

- `books` 테이블에서 `is_active = true`인 책 중 **6권을 랜덤**으로 고른다(시나리오 B — Server Component 직접 조회, PLAN.md 5절).
- 베타에는 조회수·완독수 데이터가 없어 "인기순"이 무의미하므로 랜덤으로 대체한다. 진짜 인기순·큐레이션은 phase-13b Admin에서 다룬다.
- `books`의 RLS 정책 `books are viewable by everyone`(`USING(true)`) 덕분에 **비로그인 방문자도 표지를 조회할 수 있다**.
- 표지 이미지는 외부 CDN URL(`bookdash.github.io`·`content.digitallibrary.io`)을 그대로 쓴다. 두 도메인을 `next.config.js` 이미지 허용 목록에 등록해야 한다(ADR-0012 결정 6).

---

## 5. 화면 구성 (5개 섹션)

모든 색·간격·폰트·radius·shadow는 `design-system.md` semantic 토큰만 사용한다(Hard Rule 10). 카피는 전부 `lib/landing/copy.ts` 단일 출처에서 온다(ADR-0012 결정 2).

| # | 섹션 | 구성 |
|---|---|---|
| ① | 헤더 | 로고 "Kikibooks" + "로그인"(텍스트 링크 → `/login`) + "무료로 시작하기"(primary pill 버튼 → `/signup`) |
| ② | 히어로 | 메인 카피 "우리 아이의 첫 영어 그림책 서재" + 서브 카피 + CTA "무료로 시작하기"(→ `/signup`) + 색상 블록 일러스트 영역(외부 이미지 미사용, design-system 토큰 색면 — D4) |
| ③ | 핵심 가치 4개 | ① **890권이 넘는 영어 그림책** ② 나이별 맞춤 추천 ③ 광고 없이 안심 ④ 무료로 시작 |
| ④ | 인기 책 | 랜덤 6권 표지 그리드. 표지 아래 캡션(제목·저자 — ADR-0013). 표지·캡션 클릭 시 `/signup` |
| ⑤ | 푸터 | 이용약관·개인정보처리방침 링크 + 회사 정보("주식회사 위체인지 (WECHANGE)") + CC BY 4.0 라이선스 안내 문구(ADR-0013) |

- 핵심 가치 ①은 원래 "AI 기반"이었으나, 베타 추천 로직이 단순 룰베이스(레벨 ±1)라 과장이므로 **"890권이 넘는 영어 그림책"**(구체적 적재량 기반, 100% 사실)으로 확정했다(ADR-0012 결정 5). 현재 적재량 896권 — 안전 마진을 두고 "890권"으로 표기한다.
- 모바일 우선(390px) 레이아웃. 태블릿(768px)·데스크탑(1280px) 미디어 쿼리로 확장한다.

---

## 6. 지켜야 할 규칙·제약

- **Hard Rule 6** — 랜딩은 publishable 키로만 동작한다. `SUPABASE_SECRET_KEY`/service_role는 랜딩 코드·클라이언트 코드·공개 환경변수에 일체 등장하지 않는다.
- **Hard Rule 10** — 모든 색·간격·폰트는 `design-system.md` semantic 토큰만 사용. raw HEX(예: `#FF7A45`) 직접 입력 금지.
- **DB 스키마 무변경** — phase-09a는 `books`를 읽기만 한다. 신규 마이그레이션 파일이 없다. 인기 책 랜덤 조회는 DB 함수(RPC)를 만들지 않고 애플리케이션 코드에서 처리한다(ADR-0012 결정 3 — Hard Rule 8 회피).
- **카피 단일 출처** — 화면 문구는 `lib/landing/copy.ts`에서만 정의한다. 컴포넌트는 카피를 직접 import하지 않고 props로 받는다(phase-13b에서 DB 교체 대비 — ADR-0012 결정 2).
- **표지 어트리뷰션** — 표지 노출 시 제목·저자 캡션 + CC BY 안내를 표시한다(ADR-0013). 책 상세 페이지의 전체 어트리뷰션 박스 의무는 phase-11이 별도로 진다.
- **closed environment** — 랜딩(`/`)·약관 페이지는 검색엔진에 노출하되, 읽기 콘텐츠 경로(`/home`·`/book`·`/library`·`/onboarding`)는 `robots.txt`로 차단한다(PLAN.md 15절 closed env 협상 요건).
- **분기는 페이지 컴포넌트에서 1회** — 로그인 사용자 리다이렉트는 `/` 페이지 안에서만. `middleware.ts`는 수정하지 않는다.

---

## 7. phase-09a가 끝나면 이어지는 것

- **phase-10**: 정식 홈(`/home` 교체) — 표지 어트리뷰션 정책(ADR-0013)을 재사용한다.
- **phase-11**: 책 상세 — `AttributionBox` 전체 어트리뷰션 의무 화면.
- **phase-13b**: Admin — 랜딩 카피(`getLandingCopy()`를 DB 조회로 교체)·책 큐레이션(진짜 인기순)·사용자 관리.
- **phase-14**(예정): 베타 배포 + 커스텀 SMTP. 약관·개인정보 문안 변호사 검토 교체, OG 이미지 한글화.

---

## 8. 사용자(키키북스 운영자)가 직접 해야 하는 일

없음. phase-09a는 코드만으로 완결되며 외부 콘솔 설정이 필요하지 않다. 검증은 `tasks/phase-09a-screen-01-landing-static.json`의 클릭 테스트를 사용자가 직접 수행한다(비로그인 랜딩 표시·로그인 리다이렉트·표지 6권·CTA 동선·약관 페이지).

*문서 끝.*
