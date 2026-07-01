# P0-1 파일럿 캐시 히트 실증 진단 (읽기전용)

**작성일** 2026-07-01 · **기준 커밋** `54e5c51` · **범위** 진단만(코드·config 무변경)
**대상** `getBookById` unstable_cache 파일럿(ADR-0033, 커밋 `f7b3b9e`)이 실제로 캐시 적중하는지
**계기** 팀장 실환경 검증 — 즉시 무효화(버튼) 통과. 그러나 Supabase API 로그에 `/rest/v1/books`
GET이 거의 매 초 반복 관찰되어, 그중 `getBookById`(단일 책) 캐시가 실제 적중하는지 불분명.

---

## 0. 결론 요약

- **판정 = (iii) 로그 총량만으론 판별 불가 → 팀장 정밀 재검증 필요.** 단, **코드 분석상
  캐시가 적중하지 않을 이유가 발견되지 않음**(캐시 경로에 동적 API 없음, ƒ 라우트와 데이터
  캐시는 별개) → 격리 재검증 시 **(i) 정상 적중 가능성이 높다**고 본다.
- 팀장이 로그에서 본 "매 초 반복 `/rest/v1/books` GET"의 **대부분은 아직 캐시 대상이 아닌
  목록성 쿼리**(getBooks·getCategoryDistribution·recommendations·popular-books)로, 이들은
  **정상적으로 매 요청 DB를 친다**(캐시 대상 아님, 결함 아님). 이 트래픽에 묻혀
  `getBookById`(단일 책) 적중 여부가 안 보이는 것이다.
- 해소법: 아래 §4의 **단일 책 `id=eq` 격리 필터**로 재검증(총량이 아니라 그 한 책만 콕 집어).

---

## 1. getBookById 쿼리 지문 (로그에서 콕 집기)

`lib/book/detail.ts:124-130`의 캐시 코어가 쏘는 쿼리:

```
GET /rest/v1/books
    ?select=id,title,author,illustrator,cover_url,content_url,content_type,original_url,
            license,attribution_text,source_platform,source_id,level,age_min,age_max,language,is_active
    &id=eq.<BOOK_UUID>
    &is_active=eq.true
   (Accept: application/vnd.pgrst.object+json  — maybeSingle)
```

**★유일 식별 지문 = `id=eq.<uuid>`** (단일 등호). 실측 확인:
- `books`에 `.eq('id', ...)`로 **SELECT(GET)**하는 곳은 **`getBookById`(detail.ts:128) 하나뿐**.
- admin의 `.eq('id', bookId)`(actions.ts:142·190)는 **UPDATE(PATCH)** — HTTP 메서드가 다름.
- 다른 `.eq('id', ...)`는 `profiles`·`children` 테이블(gate.ts·rewards.ts·home/actions.ts) — 경로 다름.
- 목록/카드 재조회는 `id=in.(...)`(categories·recommendations·popular) 또는
  `is_active=eq.true&source_id=neq.*`(getBooks 등) — **`id=eq.` 아님**.

→ 따라서 로그에서 **`Pathname=/rest/v1/books` + 쿼리스트링에 `id=eq.<그 책 uuid>`**가 있는 GET이
바로 이 캐시 대상 쿼리다. 그 외 books GET은 전부 비대상(목록성).

## 2. 캐시 대상 vs 비대상 쿼리 (로그 판정 기준표)

| 쿼리(함수) | REST 지문(요지) | 캐시? | 로그에 매 요청 떠야 정상? |
|---|---|---|---|
| **getBookById** (`lib/book/detail.ts`) | `id=eq.<uuid>` + 17컬럼 select + `is_active=eq.true` | ✅ 캐시됨 | **아니오** — 적중 시 책당 ~1회/시간만 |
| getBooks keyset (`lib/library/query.ts:239`) | `is_active=eq.true&source_id=neq.*`(×15)+order synced_at+limit 25 | ❌ | 예 (매 요청/스크롤) |
| countKeyset (`query.ts:316`) | `select=*`&count=exact&`is_active=eq.true`&neq.* (head) | ❌ | 예(첫 페이지만, P0-4) |
| getBooksWithCategory (`query.ts:356`) | `is_active=eq.true&source_id=neq.*`+order (limit 없음, 전량) | ❌ | 예 |
| getCategoryDistribution (`categories.ts:414`) | **`select=title`**&`is_active=eq.true`&neq.* | ❌ | 예 (매 홈 로드) |
| recommendations (`recommendations.ts`) | `select=id`&is_active&`level=gte/lte`&neq.* → `id=in.(...)` 카드 | ❌ | 예 (홈, 단계별) |
| popular-books (`popular-books.ts`) | `select=id`&is_active&neq.* → `id=in.(...)` | ❌ | 예 (랜딩) |
| streak/celebrate 등 | `reading_sessions`·`children`·`profiles`·`child_badges` (**books 아님**) | ❌ | 예 (개인) |

**판정 기준(팀장 로그용)**:
- `id=eq.<uuid>`가 있으면 → **getBookById(캐시돼야 함)**. 같은 책 id로 매 요청 반복되면 **미적중**.
- `source_id=neq.` 또는 `select=title`만 또는 `id=in.(` 이면 → **비대상(정상적으로 매번 DB)**.

## 3. unstable_cache 적중 조건 재점검 (코드 근거)

1. **캐시 경로에 동적 API 없음** — `getBookByIdCached`(detail.ts) 내부는
   `createCatalogClient()`(`process.env.*`만 읽음 + `createSupabaseClient`)와 books 쿼리뿐.
   `cookies()`/`headers()`/`draftMode()` **미호출**(쿠키 세션 클라이언트는 캐시 경로에서 안 씀 —
   ADR-0033 설계 그대로). → Next.js가 캐시를 우회(bail-out)할 트리거가 **없음**. **적중 가능**.
2. **`/book/[id]` ƒ(Dynamic)와 데이터 캐시는 별개** — 라우트가 ƒ인 것은 **페이지가**
   `auth.getUser()`로 쿠키를 읽기 때문(라우트 렌더 캐시 차원). `unstable_cache`는 그와 독립된
   **데이터 캐시 계층**이라, 동적으로 렌더되는 라우트 안에서도 래핑된 함수는 데이터 캐시에
   적중한다. 즉 **ƒ 라우트 + getBookById 데이터 캐시 적중은 공존**한다(ADR-0033 핵심 설계).
   - 근거: build 출력에서 `/book/[id]`는 계속 ƒ이나, 이는 캐시 미적용 신호가 **아니다** —
     데이터 캐시는 라우트 심볼(○/ƒ)에 나타나지 않는다.
3. **Vercel(Fluid Compute) 데이터 캐시 지속성** — Next.js Data Cache(=unstable_cache 저장소)는
   Vercel에서 **인스턴스 로컬 메모리가 아니라 관리형 지속 캐시**에 저장되어 invocation·인스턴스
   간 공유된다. 즉 Fluid Compute 인스턴스 재사용 없이도 적중 가능. **단 실제 배포 프로젝트의
   런타임/캐시 설정은 워커가 조회 불가 → "확인 필요"**(§4 격리 테스트로 실증).
   - 알려진 유의점: Data Cache 항목 크기 한도(Next 14 ~2MB) — Book 단일 행은 한참 미달, 무관.
   - `next dev`는 캐시 거동이 달라(HMR 리셋 등) 미적중처럼 보일 수 있음 → **프로덕션(Vercel)에서
     검증**해야 한다.

→ 코드 상 **적중을 막을 요인 없음**. 남은 불확실성은 "배포 환경에서 실제로 적중하는가"뿐이며,
   이는 로그 총량이 아니라 §4 격리 절차로만 확정된다.

## 4. 팀장 정밀 재검증 절차 (단일 책 격리)

**목표**: 목록/추천/세션 트래픽과 분리해, "특정 한 책의 `id=eq` GET"이 첫 1회만 뜨는지 본다.

1. **대상 책 1권 고정** — 임의 활성 도서의 `id`(UUID)를 하나 정한다(예: `/library`에서 아무 책
   → URL의 `/book/<UUID>`에서 확보).
2. **프로덕션에서 연속 재요청** — 그 `/book/<UUID>`(및 `/book/<UUID>/read`)를 **10~20초 간격으로
   5회 이상** 새로고침(반드시 배포본/Vercel, `next dev` 아님). 매번 auth는 도므로 페이지는
   렌더되지만, getBookById는 캐시 적중이어야 한다.
3. **Supabase 로그 격리 필터** — Dashboard → Logs → **API(PostgREST)**:
   - `Pathname = /rest/v1/books` 로 좁힌다.
   - 쿼리스트링/필터에 **`id=eq.<그 UUID>`** 가 포함된 GET만 본다(로그 검색창에 그 UUID를 붙여넣어
     좁히면 목록성 `source_id=neq`·`id=in` 트래픽과 섞이지 않는다).
   - method가 **GET**인 것만(같은 id의 PATCH가 있으면 그건 admin UPDATE라 무관).
4. **판독**:
   - 5회 재요청 동안 그 `id=eq.<UUID>` **GET이 1회(또는 revalidate 창 경계에서 드물게)만** →
     **캐시 적중(정상)**.
   - 매 요청마다 그 `id=eq.<UUID>` **GET이 5회 다 뜨면** → **미적중** → §아래 원인 후보 점검.
5. **혼동 방지**: 이 테스트 동안 `/home`·`/library`를 열지 말 것(목록/분포/추천이 books GET을
   대량 발생시켜 로그가 시끄러워진다). `id=eq.<UUID>` 필터만 보면 그래도 구분되지만, 최소화가 안전.

**미적중 시 원인 후보(§3 근거상 가능성 낮음, 순서대로 점검)**:
- (a) `next dev`에서 테스트했다 → 프로덕션에서 재확인.
- (b) 배포 프로젝트가 Data Cache를 끄는 설정/런타임 → Vercel 프로젝트 설정 확인(워커 조회 불가).
- (c) revalidate 창(3600초)이 이미 지나 매번 갱신처럼 보임 → 재요청을 1시간 내로 몰아서.
- (d) 그 사이 admin 버튼/토글로 태그가 무효화됨 → 무효화 조작 없이 순수 재요청만.

## 5. 판정

**(iii) 로그 총량만으로는 판별 불가 — 팀장 §4 격리 재검증 필요.**
- 팀장이 본 매 초 `/rest/v1/books` GET은 **비대상 목록성 쿼리로 대부분 설명된다**(getBooks·
  getCategoryDistribution·recommendations·popular — 모두 아직 캐시 대상 아님, 매 요청 DB가 정상).
- getBookById는 **코드상 적중을 막을 요인이 없어**, 격리 재검증하면 **(i) 정상 적중이 확인될
  가능성이 높다**. 다만 배포 환경 실증은 §4로만 확정되므로, 캐시 확대(롤아웃 2·3단계) 전
  **§4로 (i)를 먼저 확정**할 것을 권고한다.

---

## 부록 — 관련
- `docs/adr/0033-catalog-data-caching-strategy.md` (캐싱 설계·Amendment #1)
- `docs/review/2026-07-01-senior-code-review-performance.md` (P0-1 진단 원본)
- `lib/book/detail.ts` (getBookById 캐시), `lib/library/query.ts`·`lib/home/categories.ts`·
  `lib/home/recommendations.ts`·`lib/landing/popular-books.ts` (비대상 목록성 쿼리)

*리포트 끝. 결론: (iii) — 로그 총량 불충분, §4 단일 책 `id=eq` 격리로 재검증. 코드분석상 적중
가능성 높음.*
