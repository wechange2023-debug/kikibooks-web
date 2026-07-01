# ADR-0033 — 공용 카탈로그 데이터 캐싱 전략 (P0-1)

## Status
Proposed (2026-07-01)

> 본 ADR은 **초안(Proposed)**이다. 팀장 승인 전까지 코드에 착수하지 않는다. 성능 개선 트랙
> (`docs/intent/performance-track.md`)의 마지막 항목 P0-1을 다룬다. 근거 진단은
> `docs/review/2026-07-01-senior-code-review-performance.md` P0-1.

## Context

- **문제(진단 리포트 P0-1)**: 목록·상세 페이지 8개가 `dynamic = 'force-dynamic'`이고, 데이터
  레이어(`lib/**`)에 `revalidate`/`unstable_cache`가 **0건**이다. 그 결과 **매 네비게이션마다
  DB를 다시 조회**한다. 카탈로그(책 표지·제목·저자·카테고리 분포)는 동기화 외에는 거의
  불변인데도 캐싱되지 않아 "조금씩 느려지는 체감"의 성장 요인이 된다.
- **왜 지금인가**: 성능 트랙 P0-3(홈 병렬화·중복계산 제거)·P0-4(라이브러리 count 최적화)로
  국소 왕복은 줄였으나, **캐싱 부재라는 구조 요인**은 남아 있다. 이는 "무엇을·얼마나·누구
  기준으로 캐시하나"라는 설계 결정이라 규율상 ADR을 선행한다.
- **force-dynamic의 성격(실측)**: 8개 선언 페이지 —
  `home`·`library`·`book/[id]`·`book/[id]/read`·`book/[id]/celebrate`·`showcase`·
  `showcase/[source]`·`admin/layout`(admin/books·users 상속). 모든 페이지가 요청마다
  `auth.getUser()`로 쿠키를 읽으므로 **페이지 자체는 본질적으로 동적**이다(전면 정적화 불가).
- **캐시 무효화 트리거(실측)**:
  - **GDL sync — 매일** `0 3 * * *` (`.github/workflows/sync-gdl.yml`)
  - **Book Dash sync — 주간** `0 2 * * 0` (`.github/workflows/sync-book-dash.yml`)
  - 라이선스 검증 — 월간, 단 `is_active`/`license` UPDATE는 **사람이 수동 SQL** 실행
    (`verify-licenses.yml` — 자동 DB 변경 아님)
  - admin `is_active`/`level` 토글 — `toggleBookActive`가 `revalidatePath('/admin/books',
    '/home','/library')` 이미 호출(`lib/admin/books/actions.ts:87,98`). **현재는 캐시가 없어
    무효**하지만 캐싱 도입 후 의미가 생긴다.
  - ★ **중요**: sync 워크플로는 **GitHub Actions에서 DB를 직접 변경**한다 → 앱의
    `revalidateTag`/`revalidatePath`를 **트리거하지 않는다**. 앱-내 이벤트(admin 토글)만
    앱에서 무효화를 부를 수 있다. 이 비대칭이 무효화 전략의 핵심 제약이다.

## 데이터 분류 (캐싱 안전선의 핵심)

각 force-dynamic 페이지가 렌더에 쓰는 데이터를 **(a) 공용 카탈로그** vs **(b) 개인(사용자·자녀)**
으로 실측 분류한다. **이 분류가 캐싱 안전선이다.**

| 페이지 | 렌더 데이터 | 분류 | 캐시 대상? |
|---|---|---|---|
| `book/[id]` (책 상세) | `getBookById`(공용), copy(정적) | **공용** | ✅ 파일럿 1순위 |
| `book/[id]/read` (뷰어) | `getBookById`(공용), copy(정적) + 세션시작(개인, 클라이언트) | **공용**(SSR 데이터) | ✅ (`getBookById` 공유) |
| `library` (라이브러리) | `getBooks`(공용 카탈로그 — child_id 0건, `lib/library/actions.ts:49`), copy(정적), activeChild(개인, **가드 전용·미렌더**) | **공용** | ✅ 확대 단계 |
| `home` (홈) | greeting·activeChild·recommendations·streak(**모두 개인**) + `getCategoryDistribution`(**공용**) | **혼합** | 부분 — `getCategoryDistribution`만 |
| `book/[id]/celebrate` (완독) | `getBookById`(공용) + `reading_sessions`·`child_badges`(**개인/자녀별**) | **개인** | ❌ 금지 |
| `admin/*` | requireAdmin(role) + admin 쿼리(**inactive 포함**) + mutations | **개인/관리** | ❌ 금지 |
| `showcase`, `showcase/[source]` | 출처별 공용 카운트/목록 | 공용(**임시 시연·삭제 예정**) | ❌ 롤아웃 제외 |

**판정 근거**:
- `books` 테이블 RLS는 §9.1 `USING(true)` 공개 — 카탈로그 읽기는 **사용자 세션이 불필요**하다
  (`lib/library/query.ts:66`, `lib/library/actions.ts:44·49` "child_id 0건").
- `getBooks`·`getBookById`·`getCategoryDistribution`·`getPopularBooks`는 자녀·사용자 인자를
  받지 않는다(공용). 반면 `getRecommendations`·`getStreakThisWeek`·`getGreetingProfile`·
  `getActiveChild`와 celebrate의 `reading_sessions`/`child_badges` 조회는 사용자·자녀 스코프다(개인).

## Decision

### 핵심 결정 — 데이터 함수 단위 캐싱 (페이지 정적화 아님)

1. **캐시 대상은 "공용 카탈로그 데이터 조회 함수"로 한정**한다. 페이지 전면 정적화(force-dynamic
   제거)는 채택하지 않는다 — 모든 페이지가 `auth.getUser()`로 쿠키를 읽어 본질적으로 동적이므로,
   페이지를 캐싱하려면 auth를 페이지에서 제거해야 하고 이는 보안 회귀다(별개 트랙 P0-2와 충돌).
   대신 **Next.js `unstable_cache`(next@14, `next/cache`)로 데이터 함수 결과만** 캐시한다. auth는
   요청마다 그대로 실행되고, 그 안에서 호출되는 카탈로그 함수만 캐시 히트로 바뀐다.

2. **★안전 원칙(명문화) — 개인 데이터는 절대 공유 캐시에 넣지 않는다.**
   - `unstable_cache`는 **전역(사용자 무관) 캐시**다. 사용자·자녀 스코프 함수를 넣으면
     **한 사용자 데이터가 다른 사용자에게 노출**되거나(교차 노출), 즉시성이 깨진다(완독 직후
     스트릭 미갱신 등).
   - **캐시 가능 조건(둘 다 충족)**: (a) 함수가 **사용자·자녀 id 인자를 받지 않고**,
     (b) **`books`(RLS `USING(true)`) 등 공용 테이블만** 조회. 구현 시 캐시 함수 내부에서
     **쿠키 없는 publishable 클라이언트**를 생성해(사용자 세션 미전달) 구조적으로 개인 데이터
     접근을 원천 차단한다. ← 리팩토링 필요, **구현 라운드 실측 검증**.
   - 개인 데이터 함수(recommendations·streak·greeting·activeChild·celebrate 세션/배지)는
     **캐싱 금지**. 사유: 정합성(자녀 진도·완독 상태는 즉시 반영 필수) + 프라이버시(교차 노출).

### 공용 카탈로그 — 캐시 방식 제안

| 함수 | 위치 | 캐시 키 | 무효화 |
|---|---|---|---|
| `getBookById(id)` | `lib/book/detail.ts` | book id별 | tag `books-catalog` + revalidate 시간창 |
| `getCategoryDistribution()` | `lib/home/categories.ts` | 단일(무인자) | 동일 |
| `getBooks(filters, cursor)` (카탈로그 경로) | `lib/library/query.ts` | filters+cursor별 | 동일 |
| `getPopularBooks()` | `lib/landing/popular-books.ts` | — | **랜덤이라 캐시 시 UX 고정** → 제외 또는 id-목록만 캐시(구현 판단) |

- **revalidate 시간창**: 카탈로그 변경 최빈 주기(GDL 매일)에 맞춰 **수 시간 단위**(예: 1~6시간)를
  기본으로 제안. 도서관 특성상 신간이 몇 시간 늦게 뜨는 지연은 허용 가능. 정확한 값은 구현
  라운드에서 sync 완료 시각·트래픽을 보고 확정.

## 무효화 전략 (out-of-band sync 대응)

sync가 앱 밖(GitHub Actions)에서 DB를 바꾸는 비대칭 때문에 **2중 전략**을 제안한다.

1. **시간 기반 revalidate (기본)** — `unstable_cache(..., { revalidate: N })`. 앱 트리거가 없어도
   N초 뒤 자동 갱신 → **매일 GDL sync·주간 Book Dash sync를 결국 반영**(eventually consistent).
   out-of-band 변경의 안전망.
2. **온디맨드 `revalidateTag('books-catalog')` (즉시성 보강)** — 앱-내 이벤트에서만 가능:
   - admin `toggleBookActive`의 기존 `revalidatePath` 3중 호출을 **`revalidateTag('books-catalog')`
     병행**으로 승격 → 팀장 수동 is_active 토글이 즉시 반영.
   - (선택·구현 라운드) sync 워크플로 종료 시 배포 앱의 revalidate 라우트를 호출해 태그 무효화 —
     신규 라우트 = 표면 확대라 **별도 검토**(기본 전략은 시간 기반으로 충분).

## 단계적 롤아웃 (페이지별 커밋 단위, 가장 안전한 곳부터)

1. **파일럿: 책 상세 `getBookById`** — 순수 공용·단일 행·무작위/페이지네이션 없음 = 가장 결정적.
   1곳만 `unstable_cache` 적용 → 실측 검증(같은 책 재조회 시 DB 호출 0, 갱신 정상, 개인 데이터
   미혼입) → 통과 시 다음 단계.
2. **`getCategoryDistribution`** — 무인자·공용·고비용(~95k 매칭)이라 캐시 이득 큼.
3. **`getBooks` 카탈로그 경로** — filters+cursor 키가 많아 키 카디널리티·메모리 검증 후 확대.
4. **제외(이번 롤아웃 범위 밖)**: home 개인 데이터·celebrate·admin·showcase(임시), `getPopularBooks`
   (랜덤). `getBooks` **카테고리 모드 전량 페치**(P0-4에서 이연)는 본 캐싱으로 흡수 여부를
   구현 라운드에서 판정.

각 단계는 **파일별 개별 커밋**으로 남겨 회귀 표면을 최소화한다.

## 롤백

- 각 단계 커밋은 `unstable_cache` 래핑 1개 추가가 전부 → 문제 시 **해당 커밋 `git revert`로 즉시
  원복**(캐시 제거 = force-dynamic 매요청 조회로 복귀, 기존 동작). 데이터 계약·화면 출력은
  캐싱 전후 동일(성능만 변화)이라 롤백이 안전.

## 리스크와 방지책

| 리스크 | 영향 | 방지책 |
|---|---|---|
| **개인 데이터를 공유 캐시에 혼입** | 교차 노출(프라이버시 사고) | 안전 원칙(§Decision 2) — 사용자/자녀 인자 함수 캐싱 금지 + 캐시 함수 내부 쿠키없는 publishable 클라이언트로 구조적 차단. 코드리뷰 게이트에 "캐시 함수 인자에 user/child id 0건" 체크 추가 |
| **stale 카탈로그** | 신간/토글이 최대 N초 늦게 반영 | revalidate 창을 sync 주기(GDL 매일)에 맞춤 + admin 토글 즉시 `revalidateTag` |
| **`unstable_cache` 제약(next@14)** | 쿠키/헤더 접근 불가, 결과 크기 한도, 동작 미확정 | 파일럿에서 **실측 검증**(구현 라운드). 카탈로그 함수는 쿠키 미사용이라 적합 예상이나 확인 필요 |
| **out-of-band sync 미반영** | tag 무효화가 안 불림 | 시간 기반 revalidate를 **기본**으로 두어 앱 트리거 없이도 결국 반영 |
| **랜덤 콘텐츠 고정** | `getPopularBooks` 캐시 시 인기 책 6권 고정 | 랜덤 함수는 캐시 제외 또는 id-목록만 캐시(구현 판단) |

## 대안과 기각 사유

| 대안 | 기각 사유 |
|---|---|
| **전면 페이지 캐싱(force-dynamic 제거 + ISR)** | 모든 페이지가 `auth.getUser()`로 쿠키를 읽어 동적 → 정적화하려면 auth를 페이지에서 제거해야 함(보안 회귀). PPR 등은 복잡·위험 ↑. **데이터 함수 캐싱이 같은 이득을 저위험으로 달성** |
| **무캐싱 유지(현상 유지)** | 그것이 P0-1 문제 자체 — 매 네비게이션 DB 재조회 |
| **모듈/인메모리 전역 캐시** | 서버리스 인스턴스가 다중·단명 → 인스턴스 간 불일치, 공유 무효화 불가 |
| **라우트 `export const revalidate`** | 페이지가 쿠키(auth)를 읽어 동적이라 라우트 캐시가 안 걸림. 데이터 레이어 `unstable_cache`가 정합 |

## 확인 필요 (구현 라운드 실측 — 지금 단정 금지)

1. `unstable_cache`가 카탈로그 함수에서 기대대로 동작하는지(쿠키 미접근·키 직렬화·결과 크기).
2. 카탈로그 함수를 **쿠키 없는 publishable 클라이언트**로 리팩토링했을 때 RLS `USING(true)`
   경로가 정상인지(현재는 사용자 세션 클라이언트 전달).
3. revalidate 최적 시간창(sync 완료 시각 + 트래픽 기반).
4. `getBooks` filters+cursor 캐시 키 카디널리티·메모리 부담.
5. Vercel(Fluid Compute) 환경에서 Next 데이터 캐시 지속성.

## 관련

- `docs/review/2026-07-01-senior-code-review-performance.md` (P0-1 진단)
- `docs/review/2026-07-01-p0-2-auth-duplication-diagnosis.md` (P0-2 — 페이지 정적화가 auth와
  충돌하는 이유의 배경)
- `docs/intent/performance-track.md` (트랙 착수 순서)
- `docs/adr/0009-auth-architecture.md` (미들웨어+RLS 이중 방어 — 캐싱이 침범하면 안 되는 경계)
- `lib/library/query.ts`·`lib/library/actions.ts`·`lib/book/detail.ts`·`lib/home/categories.ts`·
  `lib/landing/popular-books.ts` (캐시 후보 함수)
- `lib/admin/books/actions.ts` (기존 revalidatePath → revalidateTag 승격 대상)
- `.github/workflows/sync-gdl.yml`·`sync-book-dash.yml` (out-of-band 무효화 트리거)

---

*ADR 끝. **Proposed** 상태로만 둔다. 팀장 승인 시 Accepted로 전환하고, §단계적 롤아웃의
파일럿(책 상세 `getBookById`)부터 별도 지시서로 착수한다.*
