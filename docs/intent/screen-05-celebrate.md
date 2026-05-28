# 의도 문서 — Screen 05 완독 보상 + 라이브러리 (screen-05-celebrate)

**대상 페이즈** phase-13-screen-05-celebrate
**상태** 작성 중 (phase-13 CP1-intent)
**최종 갱신** 2026-05-28
**관련** `tasks/phase-13-screen-05-celebrate.json`(본 페이즈 spec — d1~d10 결정·verification 9건·F21~F24), `docs/adr/0017-book-reader-architecture.md` D7(phase-13 경계 — 별·points·badges 전속) + Amendment #1, CP1-adr 신규 ADR 또는 ADR-0017 Amendment #2(옵션 B·멱등성·points 누적·awardCompletionRewards 분리 — 작성 예정), `docs/adr/0003-supabase-new-api-keys.md` §2·§5.2(secret 키 서버 전용), `docs/design-system.md` §7.3 Celebrate 모션 토큰(line 368~381) + §6.1 Button + §6.2 Card, `docs/intent/screen-04-reader.md`(선행 패턴 — 가드·세션·완독 흐름), `supabase/migrations/001_initial_schema.sql`(§9.1 books viewable by everyone·§9.3 children UPDATE·§9.6 child_badges SELECT만 'INSERT는 시스템이 책임'·children.points·child_badges UNIQUE), `lib/supabase/server.ts`(`createServiceRoleClient` — 옵션 B 인프라), `lib/book/reading-session.ts`(`completeReadingSession` — 멱등 앵커 line 176 + 보상 배선), `lib/home/active-child.ts`(`getActiveChild` — child_id 해소 재사용), `lib/home/actions.ts`(`.maybeSingle()`+0행 명시 error baseline), `lib/book/copy.ts`(carry: `BookReaderCopy.celebrate` placeholder → 정식 확장), `lib/shared/blacklist.ts`(/library 목록 차단분 제외), `components/book/finish-button.tsx`(완독 트리거 — 무변경), `PLAN.md` 9절 Screen 05, `claude.md` 2절 Hard Rule 1·3·6·8·9·10

---

## 1. 이 문서의 목적

자녀가 '다 읽었어요'를 눌러 도달하는 **완독 보상 화면**(`/book/[id]/celebrate`)과, 거기서 '다른 책 보러 가기'로 이어지는 **책 라이브러리**(`/library`)가 사용자 입장에서 어떻게 동작해야 하는지를 자연어로 못박는다. 코드는 이 문서를 따른다(claude.md §3-5: 의도 문서 선행). 보상 쓰기의 기술적 "왜"(옵션 B secret 키·보상 멱등성·points 누적 정책·awardCompletionRewards 분리)는 CP1-adr 신규 ADR(또는 ADR-0017 Amendment #2)에 분리 박제한다.

phase-12에서 `/celebrate`는 "완독 흐름이 끝까지 작동한다"는 신호만 주는 minimal placeholder였다(ADR-0017 D7·d9 경계). phase-13은 그 placeholder를 정식 보상으로 확장하고, 그동안 404였던 `/library`를 신규 구현한다.

본 페이즈의 목표는 셋이다:

1. **완독을 즉각적·시각적으로 보상한다** — 별 3개 등장(design-system §7.3) + 포인트 +50 카운트업 + 완독 배지로 만 3~7세 자녀에게 짧고 강렬한 성취감을 준다.
2. **보상을 정확히 1회만, 안전하게 적립한다** — 완독 전이 시점(completeReadingSession 1행 UPDATE 성공)에만 보상을 트리거(멱등)하고, child_badges INSERT는 RLS가 막는 표면이므로 `createServiceRoleClient`(secret 키)로 시스템이 책임진다(001 §9.6 설계 의도, 옵션 B).
3. **다음 책으로 자연스럽게 잇는다** — `/library`에서 자녀 레벨에 맞는 책을 필터·검색·무한 스크롤로 탐색해 재독·다독 동기를 만든다.

---

## 2. 범위

**phase-13이 다루는 것**

- `app/book/[id]/celebrate/page.tsx` — phase-12 placeholder → 정식 보상(별·포인트·배지 표시 + 다음 책 권유)
- `components/book/celebrate-rewards.tsx` — §7.3 모션 컴포넌트('use client')
- `lib/book/rewards.ts` — `awardCompletionRewards` server action(`createServiceRoleClient`, 옵션 B) — 파일 위치(별도 rewards.ts vs reading-session.ts 통합)는 CP1-adr 확정
- `lib/book/reading-session.ts` — `completeReadingSession` 1행 UPDATE 성공 직후 보상 배선(redirect 직전)
- `lib/book/copy.ts` — celebrate 정식 카피 확장 + library 카피
- `app/library/page.tsx` — 라이브러리 신규(3-가드 + 초기 페이지)
- `lib/library/query.ts` — 레벨·카테고리·키워드 필터 + cursor 페이지네이션
- `components/library/library-browser.tsx` — 필터·검색 UI + 무한 스크롤('use client')
- 모바일(390) + 태블릿 세로(768) + 태블릿 가로(1024) + 데스크탑(1280) 반응형

**phase-13이 다루지 않는 것 (다음으로 연결)**

- child_badges INSERT용 RLS 정책 추가(옵션 A) — 001 §9.6 설계 의도 위배 + Hard Rule 8 마이그레이션 사용자 사전 승인 트리거. 옵션 B로 대체(spec scope_out)
- milestone 배지(5권·10권·레벨별·스트릭) — 본 페이즈는 완독 배지 단일(badge_code 권고 'first_completion'). 확장은 F22(phase-13b/14)
- points 용도(보상 교환·레벨업 연동)·인플레이션 정책 재검토 — F23(베타 데이터 후)
- 즐겨찾기(favorites) 쓰기 토글 — CP1-adr에서 /library 포함/이연 결정(본 spec 핵심은 조회·필터·검색·무한 스크롤)
- 가상 스크롤(react-virtual) — 베타 규모는 IntersectionObserver+cursor 충분(d8). 대량 카탈로그 성능은 F24
- confetti 외부 라이브러리 — §7.3 '선택적'. 별·포인트·배지 우선, confetti는 F21(CP 시각 검수 결정)
- Admin(랜딩 카피·큐레이션·사용자 관리) — phase-13b 전속
- 다크 모드 — design-system §9 Phase 2 이후

---

## 3. 라우트 지도

| 경로 | 공개/보호 | 비고 |
|---|---|---|
| `/book/[id]/celebrate` | 보호 (로그인 필수) | phase-12 placeholder → 정식 보상. 4-가드(UUID·미인증·book NULL·자녀 0명) phase-12 옵션 P 상속. **보상 쓰기는 본 페이지가 하지 않는다**(d3 — 완독 전이 시점에 이미 적립됨). 페이지는 적립 결과 표시 + 모션만 |
| `/library` | 보호 (로그인 필수) | 신규. 3-가드(미인증 redirect·자녀 0명 onboarding·필터 입력 검증). PROTECTED_PREFIXES에 phase-12 등록 완료. books `is_active=true` + 블랙리스트 제외 카탈로그 |

**routes.ts·middleware.ts 인증 로직은 수정하지 않는다.** 두 경로 모두 phase-07 기존 보호 라우트 prefix(`/book`·`/library`)에 자연 포함된다. `robots.ts`의 `/book` disallow는 기존대로 유지하며, `/library`의 robots 정책(closed environment 정합 — index 회피)은 CP1-adr에서 확정한다.

---

## 4. 사용자 흐름 (단계별)

### 4.1 핵심 흐름 (완독 → 보상 적립 → 축하 화면 → 다음 책)

1. 자녀가 책 뷰어(`/book/[id]/read`)에서 '다 읽었어요'(FinishButton)를 누른다.
2. `completeReadingSession(bookId)`(server, 본인 세션)가 미완료 세션을 `completed_at=NOW()`·`is_completed=true`로 UPDATE한다.
3. **1행 UPDATE가 성공하면**(완독 전이 = 멱등 앵커, d3) 같은 server action이 redirect 직전에 `awardCompletionRewards()`를 호출해 **보상을 적립**한다(§4.2).
4. 보상 적립 후 `/book/[id]/celebrate`로 redirect한다.
5. `/celebrate`가 별 3개 등장 → 포인트 0→50 카운트업 → 완독 배지 등장(§7.3 모션, §7)을 보여주고, '다른 책 보러 가기' 버튼으로 `/library`를 권유한다.
6. 자녀/학부모가 `/library`에서 다음 책을 탐색한다(§4.4).

> **FinishButton·completeReadingSession 통신 계약은 phase-12 그대로다.** completeReadingSession은 성공 시 redirect(never)·실패 시에만 `{ok:false, error}` 반환이므로, FinishButton(`components/book/finish-button.tsx`)은 **무변경**이다. 보상은 전적으로 서버 측(completeReadingSession 내부)에서 일어나며 클라이언트는 보상의 존재를 모른다.

### 4.2 보상 적립 흐름 (awardCompletionRewards — 4.5중 안전망, d2)

`completeReadingSession`의 1행 UPDATE 성공 분기에서만 호출된다(d3 앵커). 인자·내부 동작:

1. **① 입력 검증(zod)** — 권고 시그니처는 인자 0건(d10, 내부에서 auth·자녀 재해소)이므로 외부 입력 신뢰 경계가 단순하다. bookId를 받는 변형이면 UUID zod 검증. ★ 시그니처 확정: CP1-adr.
2. **② 인증 가드** — `auth.getUser()`. 미인증이면 보상 미적립(완독 UPDATE는 이미 본인 세션으로 성공했으므로 정상 경로에서는 항상 인증 상태).
3. **③ child_id 소유권 검증** — `getActiveChild`(본인 세션 createClient · RLS 001 §9.3 `parent_id = auth.uid()`)로 child_id를 해소한다. **이 단계에서 child 소유권이 RLS로 검증**되므로, 이후 secret 키 쓰기에 넘기는 child_id는 "본인 자녀임이 보증된" 값이다.
4. **④ 보상 쓰기(createServiceRoleClient · 옵션 B)** —
   - `children.points`를 `+50` UPDATE(d5 매 완독 누적). children는 §9.3에 본인 세션 UPDATE 정책이 있어 본인 세션으로도 가능하나, child_badges와 클라이언트를 일관시키기 위해 secret 키 경로에서 함께 처리한다(원자성·단순성).
   - `child_badges`에 완독 배지 INSERT. badge_code는 권고 `'first_completion'`(d6, ★ CP1-adr 확정). `UNIQUE(child_id, badge_code)`(001 line 159)가 DB 레벨 중복 방어이며, INSERT는 `onConflict: ignore`(또는 사전 SELECT 가드, 옵션 Y 패턴)로 재완독 시 0건 INSERT가 되게 한다.
   - **RLS 우회는 ④의 INSERT/UPDATE 문장에만 국한**된다. child_id 출처(③)는 RLS로 검증됐으므로 자녀 격리(Hard Rule 6 핵심)는 유지된다 — phase-12 5중 안전망 박제 본질과 충돌 0건.
5. **⑤ 실패 처리** — 보상 쓰기 실패 시 명시 error를 throw(또는 결과 반환)하되, `reading_sessions` UPDATE는 이미 성공이므로 **롤백하지 않는다**(완독 사실은 보존). 보상 실패는 사용자 메시지로만 노출하거나 조용히 로깅한다. 실패 처리 정책(throw vs 무시 vs 재시도)은 CP1-adr에서 확정.

> baseline 패턴(`lib/home/actions.ts`): `.select('id').maybeSingle()` 후 0행이면 명시 error로 RLS의 묵묵한 실패를 구분한다. 단 secret 키 경로는 RLS를 우회하므로 0행의 의미가 다르다(소유권은 ③에서 이미 검증) — 이 차이를 CP1-adr·코드 주석에 박제한다.

### 4.3 /celebrate 페이지 로드 — 보상 호출 0건 (멱등 보호, d3)

`/celebrate`는 **재방문 가능한 페이지**다(URL 직접 입력·뒤로 가기·새로고침). 따라서 페이지 로드 시 보상을 적립하면 중복 +50이 발생한다. 본 페이지는 **보상 쓰기를 절대 하지 않으며**, 다음만 한다:

1. 4-가드 적용(UUID·미인증·book NULL·자녀 0명 — phase-12 옵션 P 상속).
2. 표시용 데이터 조회(본인 세션, 읽기 전용): `children.points`(현재 포인트), 방금 획득한 `child_badges`(§9.6 SELECT 정책 — 본인 자녀 배지 조회 가능), `book`(제목·표지·저작자).
3. `CelebrateRewards`('use client')가 §7.3 모션을 재생한다(별·카운트업·배지). 포인트 카운트업의 목표값은 조회된 현재 points다.

> 결과적으로 보상 적립은 **완독 전이(§4.1-3) 1회**, 화면 표시는 **페이지 로드마다**로 분리된다 — 재방문해도 모션은 재생되지만 포인트는 증가하지 않는다.

### 4.4 /library 흐름 (탐색 → 무한 스크롤)

1. `/library` 진입 → 3-가드(미인증 redirect·자녀 0명 onboarding·필터 입력 검증, d7).
2. 초기 페이지: 자녀 레벨(getActiveChild.current_level) 기준 추천 정렬 또는 전체 카탈로그 첫 페이지를 카드 그리드로 렌더한다.
3. 필터(레벨 1~5·카테고리)·검색(키워드)을 바꾸면 결과가 갱신된다.
4. 스크롤이 하단 sentinel에 닿으면(IntersectionObserver, d8) 다음 페이지를 cursor로 fetch해 그리드에 append한다.
5. 검색·필터 결과 0건이면 빈 상태 메시지를 보여준다.

### 4.5 가드 정리

| 화면 | 가드 |
|---|---|
| `/celebrate` | 4-가드(옵션 P, phase-12 상속): ①UUID 형식 ②미인증 redirect ③book NULL notFound ④자녀 0명 onboarding(축하 문구에 자녀명 필요) |
| `/library` | 3-가드(d7): ①미인증 redirect ②자녀 0명 onboarding ③필터 입력 검증(level 1~5·category·keyword sanitize). 개별 책 uuid 불요(목록). 목록 카드는 `lib/shared/blacklist.ts` 차단분 제외 |
| `awardCompletionRewards` | 4.5중(d2, §4.2): zod·auth·getActiveChild(RLS §9.3 소유권)·secret 쓰기·child_id 출처 RLS 검증 |

---

## 5. 구성요소 (각 컴포넌트 의도)

### 5.1 CelebrateRewards (`components/book/celebrate-rewards.tsx`, 'use client')

**의도**: 완독 직후의 §7.3 모션을 재생해 즉각적 성취감을 준다.

- 별 3개 SVG: 0/150/300ms stagger 등장 + scale(0)→(1.2)→(1) bounce + 200ms 지연 후 색상 transition(회색 → `--color-accent-yellow`).
- 포인트 카운터: 0→50 count-up, 600ms ease-out(목표값 = 페이지가 조회한 현재 points 또는 +50 증분).
- 배지: scale(0.5)→(1) 350ms bounce.
- `prefers-reduced-motion: reduce` 시 bounce → linear fade, duration 50% 축소.
- confetti는 선택적(F21) — 기본 미포함, CP 시각 검수에서 결정.
- raw HEX 0건(Hard Rule 10) — semantic 토큰만. easing cubic-bezier은 색상 아님.

### 5.2 CelebrateLayout / page (`app/book/[id]/celebrate/page.tsx`, Server Component)

**의도**: 가드·표시용 fetch·조립만(인터랙션 0건). 보상 쓰기 0건(d3).

- 4-가드(§4.5) + 본인 세션 읽기 전용 fetch(points·badge·book).
- 카피(`getBookReaderCopy().celebrate` 확장 또는 신규 CelebrateCopy, §6) + 책 제목·표지.
- `CelebrateRewards`에 모션 props 주입 + '다른 책 보러 가기' Link(→ `/library`).
- `export const dynamic = 'force-dynamic'`(자녀·포인트 매번 fresh) + metadata robots noindex(phase-12 정합).

### 5.3 LibraryBrowser (`components/library/library-browser.tsx`, 'use client')

**의도**: 필터·검색·무한 스크롤 인터랙션을 담당한다.

- 필터: 레벨 1~5 + 카테고리(design-system 토큰 + 홈 카테고리 그리드 정합).
- 검색: 키워드 input(debounce) → title ilike(또는 author).
- 무한 스크롤: 하단 sentinel `<div>` + IntersectionObserver → 다음 cursor 페이지 fetch → append(d8).
- 책 카드: `components/landing/book-cover-card.tsx`(또는 홈 추천 카드) 재사용 — `/book/[id]` Link(F18 패턴 정합), 표지 어트리뷰션(ADR-0013).
- 빈 상태: 검색/필터 결과 0건 메시지.

### 5.4 library page (`app/library/page.tsx`, Server Component)

**의도**: 3-가드 + 초기 페이지 SSR + LibraryBrowser에 초기 데이터·카피 주입.

- 3-가드(§4.5, d7).
- `lib/library/query.ts`로 첫 페이지 조회(books `is_active=true` + 블랙리스트 제외, §9.1 누구나 SELECT).
- `export const dynamic` 정책은 CP1-adr 확정(자녀 레벨 의존이면 force-dynamic, 정적 카탈로그면 revalidate 검토).

### 5.5 awardCompletionRewards (`lib/book/rewards.ts`, server action)

**의도**: §4.2의 4.5중 안전망으로 보상을 1회 적립한다. completeReadingSession이 호출하며, 클라이언트가 직접 호출하지 않는다(트리거 위치 = 멱등 앵커).

- `createServiceRoleClient`(옵션 B) — children.points +50 + child_badges INSERT(onConflict ignore).
- 시그니처(인자 0건 권고, d10)·실패 처리(⑤)·파일 위치는 CP1-adr 확정.

---

## 6. 카피 (lib/book/copy.ts 확장 예고)

- **celebrate 카피**: phase-12 `BookReaderCopy.celebrate`(title·buildSubtitle·libraryLinkLabel placeholder)를 정식으로 확장한다 — 포인트 라벨('+50 포인트'), 배지 라벨('완독 배지 획득!'), 다음 책 권유 문구 등. **기존 인터페이스 확장 vs 신규 CelebrateCopy 분리**는 CP1-adr 결정(ADR-0012 결정 2 단일 출처 패턴 — copy.ts는 server-only, 컴포넌트 직접 import 금지·페이지가 props 주입).
- **library 카피**: 신규 LibraryCopy(필터 라벨·카테고리명·검색 placeholder·빈 상태 메시지·정렬 라벨). 위치는 `lib/book/copy.ts` 확장 vs `lib/library/copy.ts` 신규 — CP1-adr 결정.
- 한국어 조사 정합(은/는·을/를): phase-12 placeholder가 `buildSubtitle`에서 박제 문안을 유지(말음 무관 고정)했다. 정식 celebrate에서 조사 자동 선택 보강 여부를 CP1-adr에서 결정(과한 엔지니어링 회피 vs 자연스러움).

---

## 7. design-system §7.3 Celebrate 모션 토큰 매핑 (d9 baseline 100% 정합)

`docs/design-system.md` §7.3(line 368~381)을 그대로 구현한다:

| 요소 | 모션 |
|---|---|
| 별 3개 등장 | 0/150/300ms 순차(stagger), `scale(0)→scale(1.2)→scale(1)`, easing `cubic-bezier(0.34, 1.56, 0.64, 1)`(bounce) |
| 별 채우기 | 등장 후 200ms 지연 + 색상 transition 400ms(회색 → `--color-accent-yellow`) |
| 포인트 카운터 | "0 → 50" count-up, **600ms**, `ease-out` |
| 포인트 카드 등장 | 별 모션 완료 후 100ms 지연, fade-in + `translateY(20px → 0)`, 300ms |
| 배지 등장 | 포인트 카드 후 200ms 지연, `scale(0.5) → scale(1)`, 350ms, bounce easing |
| 폭죽·confetti | 선택적, 1회만, 2초 이내(F21) |
| reduced-motion | `prefers-reduced-motion: reduce` 시 bounce → linear fade, duration 50% 축소 |

**Hard Rule 10**: 색상 토큰은 semantic(`--color-accent-yellow`·`--color-text-variant` 등)만 사용. easing `cubic-bezier(...)`는 색상이 아닌 모션 곡선이라 raw HEX 규칙 비대상. raw HEX 0건.

---

## 8. 캐싱·성능·보안

- `/celebrate`: `export const dynamic = 'force-dynamic'`(자녀·포인트 fresh) + robots noindex(phase-12 정합).
- `/library`: dynamic 정책 CP1-adr 확정. FCP < 2초(global_verification) — 초기 페이지 SSR + 이미지 lazy + 무한 스크롤 점진 로드.
- **Hard Rule 6 (옵션 B 보안 핵심)**: child_badges INSERT·children.points UPDATE의 secret 키 사용은 `awardCompletionRewards` server action **내부에서만**. `lib/supabase/server.ts`는 `import 'server-only'`로 클라이언트 번들 포함 시 빌드 실패를 강제한다. SUPABASE_SECRET_KEY는 phase-06 기존 인프라(.env.local·GitHub Secrets)에 존재 — 신규 발급·노출 0건(ADR-0003 §2·§5.2).
- **Hard Rule 8**: DB 스키마 변경 0건. 옵션 B는 기존 secret 키 인프라 사용이며 RLS 정책 추가(옵션 A)가 아니다 — `supabase/migrations` 신규 0건.
- 외부 링크(표지 어트리뷰션 등)는 `target="_blank"` + `rel="noopener noreferrer"`.

---

## 9. 검증 (이 문서가 코드에 요구하는 것)

`tasks/phase-13-screen-05-celebrate.json` `verification`(v1~v9)이 동일 항목을 측정 명령으로 박제한다.

1. 별 3개 SVG 애니메이션이 §7.3 모션 토큰과 정합한다(v1).
2. 포인트 +50이 children.points에 반영되고 매 완독 누적된다(v2).
3. child_badges INSERT가 1회 일어나고 재완독 시 UNIQUE로 0건 방어된다(옵션 B, v3).
4. /library 필터·검색·무한 스크롤이 작동한다(v4).
5. awardCompletionRewards가 4.5중 안전망(zod·auth·getActiveChild·secret 쓰기·child_id RLS 검증)을 따른다(v5).
6. 보상 멱등 — /celebrate 재방문 시 +50 중복 0건(v6).
7. prefers-reduced-motion 정합(v7).
8. Hard Rule 10 raw HEX 0건(v8).
9. /library FCP < 2초(v9).

### CP 시각 검수 체크리스트 (sub-step은 CP1-adr 확정)

**보상 구현 CP**
- [ ] 완독 1회 → /celebrate 별 3개 stagger·포인트 0→50 카운트업·배지 등장 시각 확인
- [ ] Supabase children.points +50 + child_badges 행 1건(badge_code 확정값) 확인
- [ ] 재완독(동일 책 새 세션) → points 다시 +50 누적 + child_badges 중복 0건
- [ ] /celebrate 새로고침·재방문 → points 추가 증가 0건(멱등)
- [ ] prefers-reduced-motion 토글 → 모션 축소
- [ ] secret 키가 클라이언트 번들에 0건(빌드 + grep)

**라이브러리 구현 CP**
- [ ] 레벨·카테고리 필터 → 결과 갱신
- [ ] 키워드 검색 → 매칭 결과 + 0건 빈 상태
- [ ] 스크롤 하단 → 다음 페이지 자동 append(IntersectionObserver)
- [ ] 책 카드 → /book/[id] 이동 + 표지 어트리뷰션
- [ ] 블랙리스트 책 목록 미노출
- [ ] FCP < 2초 + 4 viewport(390/768/1024/1280)

---

## 10. 미해소 결정 (CP1-adr 위임)

다음은 본 intent에서 방향만 박제하고 CP1-adr에서 최종 확정한다:

1. **d6 badge_code 명명** — 권고 `'first_completion'` 단일(외부 Claude). 후보 B `book_{id}`·후보 C `level_{level}_first`.
2. **d8 무한 스크롤 구현** — 권고 IntersectionObserver + cursor(외부 의존 0건, 외부 Claude). 후보 TanStack Query·react-virtual.
3. **d10 awardCompletionRewards 시그니처** — 권고 인자 0건(내부 auth+getActiveChild 재해소, 외부 Claude). 후보 (child_id, book_id)·(reading_session_id)·(bookId).
4. **badges SELECT 활용** — /celebrate가 방금 INSERT된 배지를 본인 세션(§9.6 SELECT 정책)으로 조회해 표시. 조회 키(최근 earned_at vs badge_code 매칭)·표시 범위(획득 배지 전체 vs 완독 배지 1건) 확정.
5. **/celebrate 후속 동선** — '다른 책 보러 가기'(`/library`) 단일 버튼 유지 vs '이어서 추천 책' 카드 추가(spec D7 placeholder 주석의 후속 동선). 추천 카드 추가 시 데이터 출처(같은 레벨·같은 카테고리).
6. **awardCompletionRewards 실패 처리(§4.2-⑤)** — throw vs 조용한 로깅 vs 재시도. reading_sessions UPDATE 롤백 0건은 확정.
7. **카피 구조(§6)** — celebrate 인터페이스 확장 vs 신규 분리, library 카피 위치, 조사 자동 선택 보강 여부.
8. **/library robots·dynamic 정책(§3·§8)** — closed environment 정합 index 회피 + 캐싱 전략.
9. **CP2·CP3 sub-step 분할** — 보상 구현 / 라이브러리 구현 경계 + spec `files_to_create_or_modify` CP 배정 확정.

### follow_up_triggers (F21~F24, spec 박제 인용)

- **F21** confetti 라이브러리 선택(보상 CP 시각 검수, blocker=false)
- **F22** milestone 배지 확장(phase-13b/14, blocker=false)
- **F23** points 인플레이션 모니터링(베타 데이터 후, blocker=false)
- **F24** 무한 스크롤 성능(카탈로그 확장 시, blocker=false)

---

*문서 끝.*
