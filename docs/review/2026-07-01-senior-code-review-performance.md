# 시니어 코드리뷰 + 성능 진단 리포트

**작성일** 2026-07-01 · **기준 커밋** `e67331c` · **범위** 읽기전용 진단(코드·DB 무변경)
**관점** 이 코드를 처음 보는 시니어 엔지니어 · **트리거** 팀장 "플랫폼이 조금씩 느려지는 체감"

> 본 리포트는 **진단·근거·우선순위**만 담는다. 실제 수정은 팀장이 우선순위를 정한 뒤
> 별도 지시서로 진행한다. 모든 발견은 `파일:줄` 실측(grep/view) 근거만 사실로 단언하며,
> 런타임 실측이 필요한 항목은 "가설 → 확인 방법"으로 분리했다.

---

## 0. 결론 요약 (한 페이지)

"느려지는 체감"의 **주원인은 죽은 코드가 아니라 요청당 왕복(round-trip) 수와 캐싱 부재**다.
Next.js tree-shaking이 미사용 코드를 런타임에서 제거하므로, 체감 저하는 아래 3축에서 온다.

| 축 | 핵심 사실 | 우선순위 |
|---|---|---|
| **캐싱 0 + force-dynamic 전면** | 목록/상세 10개 페이지 전부 `force-dynamic`, 데이터 레이어에 `revalidate`/`unstable_cache` **0건**. 매 네비게이션마다 DB 재조회 | **P0** |
| **인증 왕복 2회/요청** | `middleware.ts`와 페이지가 각각 `auth.getUser()` 호출 → 요청당 Supabase Auth 서버 검증 2회(총 21개 호출부) | **P0** |
| **홈 1회 로드 = 순차 DB 왕복 9~13회 + 전량 스캔** | `getCategoryDistribution`가 활성 전권(~880) 스캔 + 제목 substring 매칭 ~95,000회를 **매 홈 로드마다** 실행 | **P0** |

정리(P1)·위생(P2)은 체감 속도보다 유지보수·번들·저장소 건강에 관한 것이며, 별도로 정리한다.

**정직한 한계**: 활성 책이 ~896권 규모라 **인덱스 부재로 인한 seq scan 자체는 현재 병목이 아니다**
(sub-ms). 병목은 "왕복 횟수 × 왕복 지연 + 캐싱 없음"의 곱이다. 확정에는 Vercel/Supabase 실측이
필요하며, 아래 각 항에 확인용 SQL/측정법을 붙였다.

---

## P0 — 속도 직결 (체감 저하의 실제 원인)

### P0-1. force-dynamic 전면 적용 + 데이터 캐싱 0건

**근거(실측)**
- `force-dynamic` 선언 페이지 10개:
  `app/(reader)/home/page.tsx:52`, `library/page.tsx`, `book/[id]/page.tsx:44`,
  `book/[id]/read/page.tsx:62`, `book/[id]/celebrate/page.tsx`,
  `app/admin/books/page.tsx`, `admin/layout.tsx`, `admin/users/page.tsx`,
  `app/showcase/page.tsx`, `showcase/[source]/page.tsx`.
- 데이터 레이어(`lib/**`)에 `export const revalidate` / `unstable_cache` **0건**
  (grep 확인). 캐시 무효화는 admin mutation의 `revalidatePath`만 존재
  (`lib/admin/books/actions.ts:87`).
- 즉, **모든 목록·상세 조회가 매 요청 DB를 다시 친다.** 카탈로그(책 표지·제목·저자·카테고리
  분포)는 주간 cron 동기화 외에는 거의 불변인데도 캐싱되지 않는다.

**예상 효과**
- 카탈로그성 데이터(인기 책 후보 id 목록, 카테고리 분포, 라이브러리 count/목록)를
  `revalidate`(예: 시간 단위) 또는 `unstable_cache` + `revalidateTag`로 전환하면
  홈·라이브러리의 DB 왕복 대부분이 캐시 히트로 바뀐다. mutation 시 이미 있는
  `revalidatePath('/home'|'/library')` 패턴과 정합.
- **주의**: 세션·자녀별 데이터(추천 미독 필터, 스트릭)는 캐싱 불가. 캐싱 대상은
  "자녀 무관 카탈로그 데이터"로 한정해야 한다(설계 필요, 별도 지시서).

**확인 방법**: Vercel Analytics의 라우트별 TTFB, Supabase Dashboard → Reports → API
호출량 시간대 분포. 홈/라이브러리 TTFB가 다른 페이지 대비 높으면 본 항이 주범.

---

### P0-2. 요청당 `auth.getUser()` 2회 (미들웨어 + 페이지)

**근거(실측)**
- `middleware.ts:22` → `updateSession()` → `lib/supabase/middleware.ts:54`에서
  `supabase.auth.getUser()` 호출. 미들웨어 matcher(`middleware.ts:73`)는 정적파일 외
  **모든 요청**에 적용.
- 각 보호 페이지가 **다시** `getUser()` 호출:
  `home/page.tsx:58`, `book/[id]/page.tsx:67`, `read/page.tsx:93`, `app/page.tsx:59` 등.
  전체 `auth.getUser()` 호출부 21곳.
- `getUser()`는 주석대로(`lib/supabase/middleware.ts:50-51`) **Auth 서버에 원격 검증**한다
  (`getSession()`의 로컬 쿠키 신뢰와 다름). 따라서 요청당 최소 2회의 Auth 서버 왕복.

**예상 효과**
- 미들웨어에서 이미 검증한 사용자를 페이지에서 재검증하는 구조. 표준 완화책은
  페이지 레벨에서 `getUser()` 대신 미들웨어가 갱신한 세션을 신뢰하거나, 최소한
  중복 검증을 1회로 줄이는 것. 요청당 Auth 왕복 1회 감소 = 모든 네비게이션 지연 직접 감소.
- **주의**: 보안 경계(누가 무엇을) 변경이므로 ADR 선행 + RLS가 최종 방어선임을 재확인해야 함
  (`docs/adr/0009-auth-architecture.md`). 단순 삭제 금지 — 설계 검토 대상.

**확인 방법**: 브라우저 Network 탭에서 네비게이션 1회당 `…/auth/v1/user` 호출 수 관찰.

---

### P0-3. 홈 1회 로드 = 순차 DB 왕복 9~13회 + 전량 카테고리 스캔

**근거(실측)** — `app/(reader)/home/page.tsx`
- `getUser()`(58) → `getActiveChild()`(65) → `Promise.all`로 5개 병렬(71):
  `getGreetingProfile`, `getRecommendations`, `getStreakThisWeek`, `getHomeCopy`,
  `getCategoryDistribution`.
- `getCategoryDistribution` (`lib/home/categories.ts:391`):
  - 활성 전권의 `id,title` **전량 조회**(397) — 블랙리스트 `.neq` 15회(399) 후.
  - 각 책 제목에 `matchCategories`(238) 실행 = 8카테고리 × 평균 13.5키워드 = **108 키워드
    substring 검사/책**. 활성 ~880권 × 108 ≈ **~95,000회 `includes()`를 매 홈 로드마다**.
  - 용도는 홈 CategoryGrid에서 "0건 카테고리 회색 처리"뿐(`getCategoryDistribution` 주석).
    분포는 주간 sync 외 불변인데 매 요청 재계산.
- `getRecommendations` (`lib/home/recommendations.ts:155`)는 **순차** 실행:
  `fetchCompletedBookIds`(1왕복) → 단계1 `pickBooksAtLevelRange`(id 1 + card 1 = 2왕복)
  → 부족 시 단계2(2왕복) → 단계3(2왕복). 최악 **1+2+2+2 = 7 순차 왕복**. 각 단계는
  상위 레벨 범위의 **상위집합을 다시 전량 조회**(중복 조회).

**예상 효과**
- `getCategoryDistribution`를 캐싱(P0-1과 결합)하면 홈 로드에서 전량 스캔 + 95k 매칭이
  캐시 히트 1회로 축소. **홈 체감 개선 폭이 가장 큰 단일 항목**으로 추정.
- 추천 사다리를 "단일 쿼리(level ±3 범위 한 번) 후 JS에서 ±1→±2→±3 우선순위 채우기"로
  바꾸면 최대 7왕복 → 2왕복(완독 id + 후보 id, card는 합쳐서 1). 설계 필요(별도 지시서).

**확인 방법**: `getCategoryDistribution` 호출 전후에 임시 `console.time` 삽입(실측 수정은
별도 지시서) 또는 Supabase 로그에서 홈 로드 1회당 `books` SELECT 횟수 카운트.

---

### P0-4. 라이브러리 — 카테고리 모드 전량 페치 + `count:'exact'` 매 페이지

**근거(실측)** — `lib/library/query.ts`
- **카테고리 모드**(`getBooksWithCategory:330`): 후보 **전량 조회**(336) → JS
  `matchCategories` 필터(364) → **메모리 슬라이스** 페이지네이션. cursor가 진행돼도
  매 페이지 요청마다 전량을 다시 가져와 다시 매칭. 코드 자체가 F-item으로 박제
  (`query.ts:52` "카탈로그 5,000+ 규모에서 카테고리 모드 메모리 슬라이스는 비용 증가").
- **count 재조회**(`countKeyset:294`): `select('*', { count:'exact', head:true })`를
  **매 페이지 호출마다** 실행(`query.ts:290` 주석이 F-item으로 인정 — "매 페이지 재쿼리").
  무한스크롤로 페이지를 넘길수록 exact count 재실행 누적.

**예상 효과**
- count를 첫 페이지(cursor=null)에서만 계산해 클라이언트가 보관하면 페이지당 1왕복 절감.
- 카테고리 모드는 P0-1 캐싱과 결합 시 전량 페치가 캐시 히트로 흡수됨. 근본 해소는
  카테고리 컬럼 도입(ADR-0015 결정 7 트리거)이나 이는 스키마 변경 = ADR 선행 대상.

**확인 방법**: `/library?category=animals`에서 스크롤로 3~4페이지 넘긴 뒤 Network 탭의
`books` 조회 payload 크기(매번 전권 반환이면 수백 행) 확인.

---

## P1 — 정리 (중복·죽은 코드, 중간 효과)

### P1-1. 블랙리스트 `.neq()` 15회 루프가 7개 쿼리 함수에 복제

**근거(실측)** — 동일한 `for (const … of BOOK_DASH_404_SOURCE_IDS) query = query.neq(...)`
패턴이 아래 7곳에 반복. 15개 ID → **15개 체인 NOT-equal 술어**를 매 쿼리 생성.
- `lib/library/query.ts:228, 303, 340` (3곳)
- `lib/home/categories.ts:307, 399` (2곳)
- `lib/home/recommendations.ts:115`
- `lib/landing/popular-books.ts:80`

**예상 효과**
- 단일 헬퍼 `applyBlacklist(query)` 또는 PostgREST `.not('source_id','in','(id1,id2,…)')`
  단일 술어로 대체하면 7곳 중복 제거 + 쿼리 플랜 단순화. 성능 효과는 소폭(15술어 → 1술어)
  이나 **유지보수 효과가 큼**: 블랙리스트 정책 변경 시 1곳만 수정(현재도 상수는 단일 공급원
  `lib/shared/blacklist.ts`이나 **적용 루프는 7곳 복붙**).

### P1-2. "id 조회 → `.in()` 카드 재조회" 2왕복 패턴 3중복

**근거(실측)** — 활성 id를 먼저 받고, JS 선별 후 선택된 id로 `books`를 **다시** 조회:
- `lib/landing/popular-books.ts:84`(id) + `:100`(card) — 랜덤 6권
- `lib/home/recommendations.ts:119`(id) + `:134`(card) — 단계마다
- `lib/home/categories.ts:311`(id+title) + `:335`(card `.in`) — 카테고리

랜덤/카테고리 매칭은 title까지만 있으면 되므로, **첫 조회에서 카드 컬럼
(`id,title,author,cover_url`)까지 한 번에** 받으면 2번째 왕복 제거 가능(랜덤은 셔플만,
카테고리는 이미 title 보유).

**예상 효과**: 랜딩·홈 추천·카테고리 각 표면에서 왕복 1회씩 절감. 카탈로그가 작아 전량 카드
컬럼을 받아도 payload 부담 낮음(현재도 id 전량을 받고 있음).

### P1-3. 죽은 의존성 4개 (import 0건)

**근거(실측)** — `package.json` `dependencies`에 있으나 `app/components/lib/hooks`에서 import 0:
- `@tanstack/react-query` — 0곳
- `zustand` — 0곳
- `epubjs` — 0곳
- `h5p-standalone` — 0곳

특이: `lib/book/copy.ts:142` 주석은 "epub.js·h5p-standalone**는 미설치**"라고 적었으나
**실제로는 설치돼 있다**(package.json 등재). 주석과 상태 불일치.

**예상 효과**
- Next tree-shaking 덕에 **런타임 번들에는 없다**(import 0이므로). 즉 **속도 효과 없음**.
- 효과는 위생: `node_modules`/lockfile/설치시간 축소, 의존성 감사 표면 축소. `epubjs`·
  `h5p-standalone`는 무겁다. **제거는 안전하나 속도 개선으로 오해 금지**(P1로 분류한 이유).

### P1-4. 중복 헬퍼 (동일 구현 2벌)

**근거(실측)** — 코드 주석이 이미 중복을 인정:
- `fetchCompletedBookIds`: `lib/home/recommendations.ts:78` + `lib/home/categories.ts:359`
  (categories 주석 "recommendations.ts와 동일 구현")
- `pickRandom`: `lib/landing/popular-books.ts:122` + `lib/home/recommendations.ts:213`
  (주석 "lib/shared로 통합 가능")

**예상 효과**: `lib/shared/`로 각 1벌 추출 시 4곳 → 2곳. 로직 드리프트 위험 제거. 속도 무관.

---

## P2 — 나중 (위생·미래 스케일)

### P2-1. scratchpad 산출물 53개가 git 추적됨

**근거(실측)** — `git ls-files scratchpad` = 53개(마이그레이션 dry-run 리포트, `.sql`,
`.py`, `bloom_review_42.html`, `cover_samples/*.webp` 등). `.gitignore:52`는
`scratchpad/step3_out/`만 제외. 나머지 임시 산출물이 main 트리에 상주.

**예상 효과**: 저장소 크기·탐색 소음 감소. 단, 일부(step3 SQL·마이그레이션 스크립트)는
ADR 규율상 **의도적 보존**일 수 있음 — 삭제 전 팀장 확인 필요. 순수 폐기물(webp 샘플,
`*_v2/_v3` 중복 리포트)과 보존 대상 분리 권장. **속도 무관**.

### P2-2. 인덱스 — 현재 병목 아님, 미래 스케일 대비

**근거(실측)** — `supabase/migrations/001_initial_schema.sql:105-108,132-134`:
`books(source_platform|level|language|is_active)`, `reading_sessions(child_id|book_id|started_at)`.
- 라이브러리 keyset 정렬 `(synced_at DESC, id ASC)`(`query.ts:254`)를 받치는
  `books(synced_at,id)` 복합 인덱스 **없음** → 매 쿼리 정렬(sort).
- `reading_sessions(child_id, is_completed)` 복합 없음(추천·카테고리·스트릭이 함께 필터).
- `is_active` 단일 인덱스는 선택도 낮아(거의 전권 active) 플래너가 무시 → seq scan 가능.

**예상 효과**: **~896행 규모에선 seq scan/sort가 sub-ms라 지금 이득 미미.** 카탈로그가
수천 권으로 늘거나 `reading_sessions`가 누적되면 그때 복합 인덱스가 의미. **지금 P2**.
스키마 변경 = ADR 선행(Hard Rule 8). 확인용(읽기전용):
`EXPLAIN ANALYZE`를 라이브러리 keyset 쿼리에 걸어 Sort/Seq Scan 비용 관찰(팀장 실행).

### P2-3. 외부 이미지 핫링크 — 리더 지연, CDN 제어 불가

**근거(실측)**
- html 리더 iframe이 외부 페이지 직접 임베드: `components/book/html-reader.tsx:161`
  (`bookdash.github.io` / `content.digitallibrary.io`). 내부 이미지는 그 외부 페이지가
  로드 → **우리 서버 비용 0, 그러나 지연은 3rd-party 가용성에 종속**(5초 타임아웃 폴백 존재).
- asb 리더는 평문 `<img>`로 `africanstorybook.org` 핫링크
  (`components/book/asb-reader.tsx:131`, ±2 프리로드 `:88,209`). next/image 우회
  (외부 임의 경로).
- 목록 표지는 next/image + `sizes` 정상(`book-cover-card.tsx:76`,
  `recommendation-list.tsx:90`, `library-browser.tsx:151`). **목록 표지는 문제 없음.**

**예상 효과**: 리더 진입 지연은 외부 호스트 응답에 좌우. Book Dash html 39권·ASb 이미지가
느린 날엔 리더 체감 저하. 근본 해소는 본문 이미지의 자가 호스팅(Storage 이관)이나 이는
대형 작업(ADR-0032 표지 이관과 유사한 본문 이관 트랙). **목록/검색 체감과는 무관**하므로 P2.

### P2-4. 가드 4종 복붙 (책 상세 ↔ 뷰어)

**근거(실측)** — `book/[id]/page.tsx:58-90`과 `read/page.tsx:84-117`이 UUID 정규식·인증·
NULL·블랙리스트 4가드를 **복사**. `read/page.tsx:23-25` 주석이 "가드 함수 추출은 향후 phase"로
박제. 로직 드리프트 위험(한쪽만 고치면 불일치).

**예상 효과**: 공용 가드 헬퍼 추출로 2곳 → 1곳. 속도 무관, 정확성·유지보수.

---

## 부록 A — 측정으로 확인한 사실 vs 가설

| 구분 | 내용 |
|---|---|
| **확인된 사실(grep/view)** | force-dynamic 10페이지 / 캐싱 0건 / getUser 21호출부·요청당 2회 / `.neq` 루프 7곳 / getCategoryDistribution 전량+95k매칭 / 2왕복 패턴 3곳 / 죽은 의존성 4개 / 중복 헬퍼 2쌍 / scratchpad 53추적 / 인덱스 목록 |
| **가설(런타임 실측 필요)** | 각 항의 **절대 지연 기여도** 순위. 왕복 지연(Next 리전 ↔ Supabase 리전 RTT)·이미지 최적화 캐시 히트율·Auth 서버 응답시간은 Vercel/Supabase 대시보드 실측으로만 확정 |

## 부록 B — 팀장 실행용 확인 SQL/측정 (읽기전용)

1. 활성/블랙리스트 규모 재확인:
   `SELECT count(*) FROM books WHERE is_active;`
   `SELECT source_platform, count(*) FROM books WHERE is_active GROUP BY 1;`
2. 라이브러리 keyset 쿼리 플랜(정렬 비용):
   `EXPLAIN ANALYZE SELECT id,title,author,cover_url,synced_at FROM books
    WHERE is_active ORDER BY synced_at DESC, id ASC LIMIT 25;`
3. Vercel: Analytics → 라우트별 TTFB(홈·라이브러리 vs 정적 페이지 비교).
4. Supabase: Dashboard → Logs/Reports → 홈 로드 1회당 `books` SELECT 횟수.

---

## 부록 C — 권장 착수 순서 (팀장 결정용, 참고)

1. **P0-1 + P0-3 결합**(카탈로그·분포 캐싱) — 최소 코드로 홈/라이브러리 체감 최대 개선 예상.
   자녀 무관 데이터만 대상. **설계 ADR 선행.**
2. **P0-4**(count 첫 페이지만) — 국소 수정, 라이브러리 페이징 왕복 절감.
3. **P0-2**(인증 중복 검증) — 보안 경계라 신중. ADR + RLS 재확인 후.
4. **P1-1/P1-2/P1-4**(블랙리스트 헬퍼·2왕복·중복 헬퍼) — 리팩토링 묶음.
5. **P1-3/P2-1**(죽은 의존성·scratchpad) — 위생 묶음, 속도 무관 명시.
6. **P2-2/P2-3/P2-4** — 스케일·리더 이관·가드 추출, 후속 트랙.

*리포트 끝. 실제 수정은 본 리포트 기반 팀장 우선순위 확정 후 별도 지시서로 진행한다.*
