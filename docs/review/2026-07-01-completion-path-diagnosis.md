# 완독 경로 진단 — 속도·캐시 무효화 (읽기전용)

**작성일** 2026-07-01 · **기준 커밋** `4e12742` · **범위** 진단만(코드·config·DB 무변경)
**계기** 팀장 체감: (1) 재접속 빨라짐(캐시 확인) (2) 완독 처리 자체가 조금 느림 (3) 완독 직후
홈 재진입이 "처음처럼" 느리고 그다음은 다시 빠름 — (3)이 과잉 무효화인지 정상 동작인지 확정.

---

## 0. 결론 요약

- **(3) 판정 = (b) 정상 동작 (고칠 것 없음 — 과잉 무효화 아님).** 완독 경로 전체에
  `revalidateTag`/`revalidatePath` **0건**(실측). 완독은 **books-catalog(공용 카탈로그) 캐시를
  건드리지 않는다.** 완독 직후 홈이 느린 것은 홈의 **개인 데이터(추천·스트릭)가 원래 캐시
  대상이 아니라 매 서버 렌더마다 재계산**되기 때문(설계상 정상). "그다음 빠름"은 프레임워크의
  클라이언트 라우터 캐시·워밍된 카탈로그 캐시 때문(추정).
- **(2) 완독 느림 = 실측 병목 확인.** 완독 처리 POST 한 번에 **auth.getUser 3회·getActiveChild
  2회**가 순차로 돈다. 그중 **awardCompletionRewards가 completeReadingSession이 이미 해소한
  auth.getUser + getActiveChild를 다시 수행**(순수 중복 2왕복). → **P1 개선 여지**.

---

## 1. 완독 처리 경로 전체 (파일·함수·순서, 실측)

FinishButton 클릭 → 서버 액션 → redirect. 순차 흐름:

```
components/book/finish-button.tsx:65  completeReadingSession(bookId)  [server action, POST]
  │  (POST가 middleware를 거침 → lib/supabase/middleware.ts:54  auth.getUser()   … 왕복 A1)
  ▼
lib/book/reading-session.ts:151  completeReadingSession
  ① :162  auth.getUser()                                          … 왕복 A2 (auth 서버)
  ② :168  getActiveChild(supabase, user.id)                       … 왕복 D1 (children SELECT)
  ③ :176  reading_sessions UPDATE(completed_at,is_completed)      … 왕복 D2
          WHERE child_id+book_id+completed_at IS NULL .select('id')
  ④ :203  await awardCompletionRewards()   ────────────┐
                                                        ▼
        lib/book/rewards.ts:85  awardCompletionRewards
          ② :92  auth.getUser()                                   … 왕복 A3 (auth 서버, ★중복)
          ③ :99  getActiveChild(supabase, user.id)                … 왕복 D3 (children SELECT, ★중복)
          ④-1 :109 children SELECT points                         … 왕복 D4
          ④-2 :120 children UPDATE points(+50)                    … 왕복 D5
          ④-3 :132 child_badges upsert(first_completion)          … 왕복 D6
  ⑤ :216  redirect(`/book/${bookId}/celebrate`)
```

- points·배지 쓰기는 `awardCompletionRewards`(secret 키, ADR-0018 D4 분리)가 전담. `celebrate`
  페이지는 **읽기 전용**(이미 적립된 값 표시).
- **완독 처리 POST 1회 = 순차 왕복 ~8회**(auth 3 + children/sessions/badges 5). 병렬화 0.

## 2. (2) 완독 느림 — 병목 후보 (실측 + 추정)

| # | 지점 | 성격 | 개선 여지 |
|---|---|---|---|
| **P1** | `awardCompletionRewards`가 auth.getUser(:92) + getActiveChild(:99)를 **다시 수행** — completeReadingSession이 :162/:168에서 이미 해소한 값 | **실측 중복** — 순차 2왕복(auth 서버 1 + children SELECT 1) 낭비 | completeReadingSession이 이미 가진 `child`(또는 `supabase`+`child.id`)를 인자로 넘기면 제거 가능. **단 ADR-0018 D8이 "인자 0건"을 신뢰 경계 단순화 목적으로 의도** → 개선하려면 ADR 보완 필요 |
| **P2** | children **SELECT points(:109) → UPDATE(:120)** 2왕복 | 비-atomic 증가(코드 주석도 인정) | 원자적 증가는 DB 함수/RPC 필요 = Hard Rule 8(ADR 선행). 왕복 1회 절감이나 스키마 변경이라 후순위 |
| **P2** | `child_badges` upsert(:132)가 points 쓰기 **뒤 순차** | badge는 points와 독립 | points SELECT+UPDATE와 badge upsert를 Promise.all 병렬 가능(왕복 1회 절감). 소폭 |
| (P0-2) | middleware가 POST에도 `auth.getUser`(A1) | 요청당 고정 | 별도 트랙(P0-2, 이연 판정됨). 완독 특유 아님 |

**정리**: 확실한 개선은 **P1(중복 auth+getActiveChild 제거)** 하나. 순차 경로에서 auth 서버
왕복 1회 + DB 왕복 1회를 없앤다. 나머지(P2)는 스키마 변경(RPC)이나 소폭이라 후순위.
※ 절대 왕복 지연(ms)은 미측정 — 위는 "순차 왕복 수" 근거의 병목 후보이며, 실제 기여도는
Vercel 함수 실행시간으로 실측 필요(추정 표기).

## 3. (3) 완독 후 홈 느림 — 캐시 무효화 정확 확인 (★핵심)

### 실측: 완독 경로의 무효화 호출 = 0건

- `grep revalidateTag|revalidatePath|books-catalog` 대상 `lib/book/`·`app/(reader)/book/`·
  `components/book/` → **완독 경로(reading-session.ts·rewards.ts·finish-button·celebrate)에
  revalidate 호출 0건.** `books-catalog`/`next/cache`는 오직 `lib/book/detail.ts`(getBookById
  **캐시 정의 자체**, 무효화 아님)에만 등장.
- **∴ 완독은 `books-catalog` 캐시를 무효화하지 않는다.** getCategoryDistribution(캐시됨)은
  완독을 거쳐도 **워밍 상태 유지** → 홈의 캐시 부분은 완독 전후 모두 빠르다.

### 그렇다면 왜 완독 직후 홈이 느린가

- 홈(`app/(reader)/home/page.tsx`, force-dynamic)이 렌더에 쓰는 데이터:
  - `getCategoryDistribution` — **캐시됨(books-catalog)**, 완독이 안 건드림 → 워밍 → 빠름.
  - `getRecommendations`·`getStreakThisWeek`·`getGreetingProfile`·`getActiveChild` —
    **개인 데이터, 캐시 대상 아님** → **매 홈 서버 렌더마다 재조회**(설계상 정상, 프라이버시·정합성).
- 특히 `getRecommendations`는 폴백 사다리(±1→±2→±3)로 **최대 7 순차 왕복**(P0-3 진단 기록).
  이건 완독과 무관하게 **모든 홈 서버 렌더에서** 도는 고정 비용이다.
- 완독은 개인 데이터(완독 세션·points·배지)를 **바꾸므로**, 완독 직후 홈의 추천/스트릭 결과가
  달라진다 — 그러나 이들은 원래 캐시가 없어 **매번 재계산**한다. 즉 완독이 홈을 "더 느리게"
  만드는 게 아니라, **완독 직후는 홈으로의 fresh 네비게이션이라 서버 렌더(개인 데이터 전량
  재계산)를 타는 것**이다.

### "그다음 재진입은 빠름"의 원인 (추정)

- **추정(프레임워크 동작, 미측정)**: Next.js App Router의 **클라이언트 라우터 캐시**. 완독
  서버 액션(completeReadingSession) 실행은 클라이언트 라우터 캐시를 만료시키고, /celebrate에서
  /home으로의 첫 이동은 서버에서 RSC를 새로 받아온다(느림). 이후 /home 재방문은 워밍된
  라우터 캐시로 즉시(빠름). + 카탈로그 데이터 캐시도 워밍 상태.
- 이 "first-slow-then-fast"의 정확한 메커니즘(라우터 캐시 vs 개인 데이터 재계산)은 **Vercel
  함수 타이밍/네트워크 탭으로 실측 확인 필요** — 다만 **어느 쪽이든 books-catalog 과잉 무효화는
  아니다**(무효화 0건 실측).

### 판정

**(3) = (b) 정상 동작.** 완독은 카탈로그 캐시를 무효화하지 않는다(실측). 완독 직후 홈이 느린 것은
홈 개인 데이터(추천·스트릭)가 **원래 캐시 대상이 아니라 매 서버 렌더마다 재계산**되기 때문이며,
이는 프라이버시·정합성상 **의도된 정상 동작**이다. 고칠 과잉 무효화는 없다.

## 4. 종합 판정 및 개선 여지

| 항목 | 판정 | 개선 |
|---|---|---|
| (3) 완독 후 홈 느림 | **(b) 정상 동작** — 과잉 무효화 아님(완독 revalidate 0건 실측) | 고칠 것 없음. (홈 추천 자체의 서버 렌더 비용은 완독과 무관한 별도 사안 — 아래) |
| (2) 완독 느림 | 실측 병목 = 중복 auth+getActiveChild 재해소 | **P1** — awardCompletionRewards에 resolved context 전달(ADR-0018 D8 보완 필요) |
| (2) points SELECT-then-UPDATE / badge 순차 | 소폭·스키마 의존 | **P2** — 원자적 증가(RPC=Hard Rule 8) / badge 병렬화 |
| (참고) 홈 추천 폴백 사다리 최대 7 순차 왕복 | 완독 무관 상시 비용 | **P1/P2(별도 트랙)** — fresh 홈 렌더가 늘 느린 근본. 캐시 불가(개인 데이터)라 왕복 축소(사다리 단일 쿼리화)만 여지. 성능 트랙 후속 후보 |

**권고 순서**: (2)의 **P1(중복 재해소 제거)**가 가장 확실하고 국소적 — 완독 처리 순차 경로에서
auth 서버 1왕복 + DB 1왕복을 없앤다. 착수 시 ADR-0018 D8("인자 0건" 신뢰 경계)에 개선 근거를
보완한다. (3)은 조치 불요(정상). 홈 추천 사다리는 완독과 무관한 별도 성능 사안으로 분리.

## 정직성 표기
- **실측(단언)**: 완독 경로 revalidate 0건 / awardCompletionRewards의 auth·getActiveChild 중복 /
  순차 왕복 구조 / 완독은 awardCompletionRewards 단일 호출부.
- **추정(미측정)**: 각 왕복의 절대 지연(ms) 기여 / "first-slow-then-fast"의 정확한 프레임워크
  메커니즘(라우터 캐시). Vercel 함수 타이밍·브라우저 네트워크 탭으로 확인 필요.

---

## 부록 — 관련
- `lib/book/reading-session.ts`(completeReadingSession)·`lib/book/rewards.ts`(awardCompletionRewards)
- `app/(reader)/book/[id]/celebrate/page.tsx`(완독 후 표시, 읽기 전용)
- `docs/adr/0018-completion-rewards-and-library.md`(D3·D4·D8·D9 보상 설계)
- `docs/adr/0033-catalog-data-caching-strategy.md`(books-catalog 캐시·무효화)
- `docs/review/2026-07-01-p0-2-auth-duplication-diagnosis.md`(auth.getUser 중복 트랙)

*리포트 끝. (3) 정상 동작(과잉 무효화 아님, 완독 revalidate 0건 실측). (2) P1 = 중복 auth+child
재해소 제거. 실제 수정은 별도 지시서.*
