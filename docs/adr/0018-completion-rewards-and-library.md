# ADR-0018: 완독 보상 + 라이브러리 — 옵션 B(secret 키) child_badges INSERT · 보상 멱등 앵커 · 매 완독 누적

**날짜** 2026-05-28
**상태** Accepted (phase-13 CP1-adr)
**관련** `docs/adr/0017-book-reader-architecture.md` D7(phase-13 경계 — 별·points·badges 전속, 본 ADR이 해소) + Amendment #2(동시 작성 — D7 해소 박제), `docs/adr/0003-supabase-new-api-keys.md` §2·§5.2(secret 키 서버 전용 — 옵션 B 정책 근거), `supabase/migrations/001_initial_schema.sql`(§9.1 books viewable·§9.3 children UPDATE·§9.6 child_badges SELECT만 'INSERT는 시스템이 책임' line 293·children.points line 44·child_badges UNIQUE line 159), `lib/supabase/server.ts`(`createServiceRoleClient` line 65 — 옵션 B 인프라, `import 'server-only'` 강제), `lib/book/reading-session.ts`(`completeReadingSession` 멱등 앵커 line 162~178 + 보상 배선), `lib/home/active-child.ts`(`getActiveChild` — child_id 소유권 RLS 해소), `lib/home/actions.ts`(`.maybeSingle()`+0행 명시 error baseline), `docs/design-system.md` §7.3 Celebrate 모션(line 368~381), `docs/intent/screen-05-celebrate.md`, `tasks/phase-13-screen-05-celebrate.json`(d1~d10 + verification v1~v9 + F21~F24), `components/book/finish-button.tsx`(완독 트리거 — 무변경), `claude.md` 2절 Hard Rule 1·3·6·8·9·10

---

## 1. 맥락 (Context)

phase-13 Screen 05는 두 표면을 구현한다 — 완독 보상(`/book/[id]/celebrate`)과 책 라이브러리(`/library`). ADR-0017 D7은 phase-12 종료 시점에 "별 3개 SVG 애니메이션·`children.points += 50`·`child_badges` INSERT는 phase-13 전속"으로 경계를 박제했고, phase-12의 `/celebrate`는 minimal placeholder였다. 본 ADR은 그 경계를 해소하고 보상 시스템의 쓰기 아키텍처를 박제한다.

### 1.1 child_badges INSERT의 RLS 표면 진단 (2026-05-28 박제 view)

`supabase/migrations/001_initial_schema.sql` §9.6은 `child_badges`에 **SELECT 정책만** 둔다(line 294~297). INSERT/UPDATE/DELETE 정책이 없고, line 293 주석은 명시한다:

```
-- 9.6 child_badges — 본인 자녀의 뱃지만 SELECT (INSERT는 시스템이 책임)
```

이는 버그가 아니라 스키마 설계자의 의도적 박제다 — **배지 INSERT는 본인 세션 클라이언트가 아니라 시스템(secret 키)이 책임진다**. 반면 `children.points`는 §9.3에 "parents can update own children" UPDATE 정책이 있어 본인 세션 UPDATE가 가능하다(line 248~251).

### 1.2 보상 멱등성 진단

`/celebrate`는 URL 직접 입력·뒤로 가기·새로고침으로 **재방문 가능**하다. 따라서 페이지 로드 시점에 보상을 적립하면 중복 `+50`이 발생한다. 한편 `lib/book/reading-session.ts`의 `completeReadingSession`(line 162~178)은 미완료 세션만 1행 UPDATE하고(`.is('completed_at', null)`), 이미 완독·세션 없음은 0행이다. 이 **1행 UPDATE 성공 = in-progress→completed 전이**가 보상의 자연스러운 멱등 앵커다.

### 1.3 사용자 사전 결정 (2026-05-28)

비개발자 사용자가 CP1 선행 점검 후 2건을 확정했다: (1) child_badges 쓰기 = 옵션 B(secret 키), (2) points = 매 완독 +50 누적. 본 ADR은 이 결정과 외부 교차 검토 권고를 박제한다. ADR-0017과 분리한 신규 ADR로 둔 사유: ADR-0017은 책 뷰어(read 표면) 단일 책임, 본 ADR은 보상(celebrate)·탐색(library) 표면 — 향후 milestone 배지·B2B 보상 정책 확장 시 단일 출처가 된다(ADR-0017 Amendment #2는 D7 해소 1줄만 박제).

---

## 2. 결정 (Decision)

> 결정 번호 D1~D14는 본 ADR 고유 체계다. `tasks/phase-13-screen-05-celebrate.json`의 `cp1_decisions.decisions`(소문자 d1~d10)와 cross-reference: **ADR D6 = spec d6**(badge_code), **ADR D7 = spec d8**(무한 스크롤), **ADR D8 = spec d10**(시그니처). 나머지 ADR D1~D5는 spec d1~d5와 1:1, D9~D14는 본 ADR이 spec intent §10 미해소 9건을 확정한다.

### D1 — child_badges 쓰기 경로 = 옵션 B (createServiceRoleClient)

`child_badges` INSERT는 `lib/supabase/server.ts`의 `createServiceRoleClient`(secret 키, RLS 우회)로 수행한다. **사용자 확정(2026-05-28).** 근거 3중:

- 001 §9.6 주석(line 293) — "INSERT는 시스템이 책임"이 설계 의도. 본인 세션 INSERT는 RLS가 거부한다.
- ADR-0003 §2(line 38) — `SUPABASE_SECRET_KEY` "★ 서버 전용. cron·시드·관리자 라우트".
- 인프라 — `createServiceRoleClient`(server.ts line 65)가 이미 존재(`import 'server-only'` 강제).

**옵션 A(RLS INSERT 정책 추가) 기각**: §9.6 설계 의도 위배 + DB 스키마 변경(마이그레이션 002)이라 Hard Rule 8 사용자 사전 승인 절차를 트리거한다. 옵션 B는 스키마 무변경.

### D2 — 4.5중 안전망 패턴 (secret 키 쓰기 server action 표준)

옵션 B는 RLS를 우회하므로, phase-12의 "5중 안전망"(zod·auth·getActiveChild·WHERE eq·RLS)에서 RLS 대신 **child_id 출처의 RLS 검증**으로 자녀 격리를 보존한다:

1. **① zod** — 입력 검증(D8 인자 0건이면 신뢰 경계 단순).
2. **② auth.getUser()** — 인증 가드.
3. **③ getActiveChild** — 본인 세션 createClient(RLS §9.3 `parent_id=auth.uid()`)로 child_id 해소. **이 단계에서 child 소유권이 RLS로 검증**된다.
4. **④ createServiceRoleClient 쓰기** — ③에서 검증된 child_id로만 children.points UPDATE + child_badges INSERT. RLS 우회는 이 INSERT/UPDATE 문장에만 국한.
5. **⑤(0.5) child_id 출처 보증** — secret 키는 child 소유권 결정에 관여하지 않는다(③의 산출물만 사용). 자녀 격리(Hard Rule 6 핵심)는 유지 — phase-12 5중 안전망 박제 본질과 충돌 0건.

본 패턴은 향후 모든 secret 키 쓰기 server action의 표준이다.

### D3 — 보상 멱등 앵커 = completeReadingSession 1행 UPDATE 성공 직후·redirect 직전

보상은 `completeReadingSession`의 1행 UPDATE 성공 분기(§1.2, reading-session.ts line 176 `if (!data)` 가드의 반대 분기)에서만, redirect 직전에 트리거한다. **`/celebrate` 페이지 로드 시점 보상은 0건**(재방문 멱등 보호). 결과적으로 보상 적립은 완독 전이 1회, 화면 표시는 페이지 로드마다로 분리된다.

### D4 — completeReadingSession + awardCompletionRewards 분리

`completeReadingSession`(본인 세션 createClient + reading_sessions UPDATE)과 `awardCompletionRewards`(createServiceRoleClient + points/badges)를 분리한다. 사유: 클라이언트가 다름(본인 세션 vs secret) + 단일 책임. 배선: completeReadingSession이 1행 UPDATE 성공 시(D3 앵커) `awardCompletionRewards`를 호출한 뒤 redirect. **`components/book/finish-button.tsx`는 무변경** — completeReadingSession이 성공 시 redirect(never)·실패 시에만 `{ok:false,error}` 반환하는 phase-12 통신 계약이 그대로 유지되고, 보상은 전적으로 서버 측에서 일어난다.

### D5 — points 누적 정책 = 매 완독 +50

`children.points`를 완독마다 `+50` 누적한다. **사용자 확정(2026-05-28).** 근거: 만 3~7세 반복 독서 발달 정합 + 베타 단순성(1행 UPDATE = 항상 +50 단일 분기) + 배지가 다양성 KPI 트래커 역할. 재독 시 새 reading_session(phase-12 재진입 신규 INSERT 정합) → 새 완독 전이 → +50 누적. points 인플레이션 모니터링은 F23.

### D6 — badge_code 명명 = 'first_completion' 단일 (= spec d6 확정)

완독 배지의 `badge_code`는 `'first_completion'` 단일로 확정한다. `UNIQUE(child_id, badge_code)`(001 line 159)가 DB 레벨 1회 방어이며, INSERT는 `onConflict: ignore`(Supabase upsert `ignoreDuplicates`) 또는 사전 SELECT 가드(옵션 Y 패턴)로 재완독 시 0건 INSERT가 된다. 근거: 베타 단순성 + 첫 완독 의미 강조. milestone 배지(`5books`·`10books`·레벨별)는 별도 badge_code로 F22(phase-13b/14) 확장.

### D7 — 무한 스크롤 = IntersectionObserver + cursor 페이지네이션 (= spec d8 확정)

`/library` 무한 스크롤은 IntersectionObserver + cursor 페이지네이션으로 구현한다(외부 라이브러리 의존 0건). 근거: PLAN 명시 외 의존성 임의 추가 금지 정합 + Supabase `.range()`/`.gt()` 쿼리 정합 + 베타 100명·900~1,300권 규모 충분. cursor 정렬·키(예: `synced_at DESC` + cursor, 또는 `id` 안정 정렬)는 구현 CP에서 확정. 가상 스크롤(react-virtual)은 대량 카탈로그 성능 임계 초과 시 F24.

**기각**: TanStack Query useInfiniteQuery(client 의존 추가) · react-virtual(가상 스크롤 의존 추가) — 베타 규모에 과함.

### D8 — awardCompletionRewards 시그니처 = 인자 0건 (= spec d10 확정)

`awardCompletionRewards()`는 인자를 받지 않고 내부에서 auth + getActiveChild로 재해소한다. 근거: D2 4.5중 안전망 패턴 정합(server action이 자체 검증 수행) + completeReadingSession 의존성 최소화 + 입력 신뢰 0(인자 없음 → zod 입력 검증 0건). completeReadingSession 내부 호출이라 호출자가 신뢰 가능한 컨텍스트지만, server action은 직접 호출 가능 표면이므로 자체 가드를 갖춘다.

**기각**: `(child_id, book_id)`·`(reading_session_id)`·`(bookId)` 전달 — 입력 신뢰 0 원칙상 받은 인자를 재검증해야 하므로 인자 0건이 더 단순하고 안전. (단 완독 책 식별이 배지·로깅에 필요하면 bookId 1개 전달도 후속 미세 조정 여지 — 현 결정은 인자 0건.)

### D9 — 보상 실패 처리 = 옵션 A (rollback 0건 + 명시 처리)

`awardCompletionRewards` 실패 시: `reading_sessions` UPDATE는 이미 성공이므로 **롤백하지 않는다**(완독 사실 보존). completeReadingSession이 보상 호출을 try-catch로 감싸 실패를 흡수하되, 완독 자체는 성공 처리하고 redirect는 진행한다. 보상 실패는 로깅하고, 필요 시 /celebrate에서 표시 데이터 부재로 자연 노출된다. 근거: 베타 단순성 + 완독 UPDATE 성공 보존 + 별도 재시도 큐(옵션 C) 과함.

**기각**: 옵션 B(page-load 보상 재시도) — D3 멱등 앵커(페이지 로드 보상 0건)와 충돌. 옵션 C(백오피스 재시도 큐) — 베타 과함.

### D10 — 카피 구조 = CelebrateCopy + LibraryCopy 신규 분리

phase-12 `BookReaderCopy.celebrate` placeholder를 정식 `CelebrateCopy`로 분리하고, `LibraryCopy`를 신규 추가한다. 사유: 책 뷰어 카피 vs 보상 카피 vs 라이브러리 카피 = 서로 다른 표면(ADR-0012 결정 2 단일 책임 패턴). `lib/book/copy.ts`에서 `BookReaderCopy`의 celebrate 섹션을 `CelebrateCopy`로 이전(server-only·미export·페이지 props 주입 패턴 유지), `lib/library/copy.ts` 신규로 `LibraryCopy`. 한국어 조사(은/는·을/를) 자동 선택 보강은 베타 범위 외(placeholder 박제 문안 유지, 과한 엔지니어링 회피) — 필요 시 후속.

### D11 — /celebrate robots/dynamic = phase-12 정합 무변경

`/celebrate`는 `export const dynamic = 'force-dynamic'` + metadata robots `{index:false, follow:false}`를 phase-12 placeholder 그대로 유지한다(D7 해소로 정식 보상이 추가되어도 캐싱·robots 박제는 무변경). 자녀·포인트가 매번 fresh여야 하므로 force-dynamic.

### D12 — /library robots/dynamic 신규 박제

`/library`는 robots `noindex`(closed environment 정합 — ADR-0013 결정 4 + app/robots.ts 정책과 정합) + `export const dynamic = 'force-dynamic'`(자녀 레벨별 필터·검색 결과 매번 fresh). PROTECTED_PREFIXES에 phase-12에서 이미 등록됨. robots 적용 방식(robots.ts disallow 확장 vs page metadata)은 구현 CP에서 기존 패턴 정합 확인.

### D13 — /celebrate 후속 동선 = '/library' 단일 Link

`/celebrate`의 후속 동선은 '다른 책 보러 가기'(`/library`) 단일 Link를 유지한다(phase-12 placeholder 박제 정합). '이어서 추천 책' 카드는 추가하지 않는다 — 추천은 `/home`이 담당하고, 베타 단순성을 우선한다. 추천 카드는 phase-13b/향후 확장 여지.

### D14 — CP2·CP3 sub-step 분할 확정

CP1(spec·intent·adr) 종료 후 구현을 2 sub-step + 검증으로 분할한다(각 단독 커밋 + 시각 검수, phase-12 CP3-a/-b 패턴 정합):

- **CP2-celebrate-rewards-and-page** — 보상 server action + 멱등 배선 + §7.3 모션 + celebrate 정식 페이지 + 카피 분리.
- **CP3-library-page-and-components** — /library 페이지 + 쿼리(필터·검색·cursor) + 필터·검색·무한 스크롤·빈 상태 컴포넌트.
- **CP4-verify-and-meta** — verification v1~v9 박제 + _index.json 플립 + 메타 커밋 + push.

파일 인벤토리는 `tasks/phase-13-screen-05-celebrate.json` `files_to_create_or_modify`·`checkpoints`에 박제(단일 출처는 spec).

---

## 3. 결과 (Consequences)

### Positive

- DB 스키마 무변경(Hard Rule 8) — 옵션 B는 기존 secret 키 인프라 사용. 마이그레이션 002 불요, 사용자 사전 승인 절차 회피.
- §9.6 설계 의도 정합 — "INSERT는 시스템이 책임"을 그대로 따른다.
- 자녀 격리 보존 — child_id 출처가 RLS(③)로 검증되므로 secret 키 우회는 쓰기 문장에만 국한(D2).
- 보상 정확성 — 완독 전이 멱등 앵커(D3)로 재방문 중복 0건.
- 단일 출처 — ADR-0017(read) / ADR-0018(celebrate·library) 책임 분리. milestone·B2B 보상 확장 시 본 ADR이 단일 출처.

### Negative

- secret 키 표면 확장 — 지금까지 cron·시드 위주였던 secret 키 사용이 사용자 트리거 server action(awardCompletionRewards)으로 확장된다. server-only 강제 + 4.5중 안전망으로 방어하나, 코드 리뷰 강도를 높여야 한다(v5·v8).
- points 인플레이션 여지 — 매 완독 +50(D5)이라 동일 책 반복으로 누적 가능. 베타 단순성 우선, F23 모니터링.
- 무한 스크롤 메모리 — IntersectionObserver+cursor(D7)는 가상 스크롤 미적용이라 대량 누적 시 DOM 증가. 베타 규모 충분, F24.
- 보상 실패 부분 성공 — D9 옵션 A는 완독 성공·보상 실패의 부분 성공 상태를 허용(롤백 0건). 베타 수용, 재시도는 후속.

---

## 4. 대안 비교 (Trade-offs)

| 기각 대안 | 내용 | 기각 사유 |
|---|---|---|
| 옵션 A — RLS INSERT 정책 추가 | child_badges에 본인 세션 INSERT 정책(마이그레이션 002) | §9.6 설계 의도 위배 + Hard Rule 8 스키마 변경 사용자 사전 승인 트리거. 옵션 B가 무변경·정합 |
| 페이지 로드 보상 | /celebrate 진입 시 보상 적립 | 재방문 가능 페이지라 중복 +50(D3 충돌) |
| completeReadingSession 통합 | 보상을 completeReadingSession에 인라인 | 클라이언트 다름(본인 세션 vs secret) + 단일 책임 위배(D4 분리) |
| TanStack Query / react-virtual | 무한 스크롤에 외부 라이브러리 | 베타 규모에 과함 + 의존성 임의 추가(D7 IntersectionObserver 정합) |
| 인자 전달 시그니처 | awardCompletionRewards(child_id,...) | 입력 신뢰 0 원칙상 재검증 필요 → 인자 0건이 단순·안전(D8) |
| 최초 완독만 보상 | points는 첫 완독 1회만 | 반복 독서 동기 약화(D5 매 완독 누적, 사용자 확정) |

---

## 5. 후속 트리거 (본 ADR이 박제하는 트리거)

상세 박제는 `tasks/phase-13-screen-05-celebrate.json` `phase_13_follow_up_triggers`에 있다(F21~F24, 전부 blocker=false). 요약:

1. **F21 — confetti 라이브러리 선택**: §7.3 confetti는 선택적. 별·포인트·배지 우선, 도입 시 의존성 ADR. 보상 CP 시각 검수에서 결정.
2. **F22 — milestone 배지 확장**: badge_code 단일(D6) → 5권·10권·레벨별·스트릭 milestone. phase-13b/14.
3. **F23 — points 인플레이션 모니터링**: 매 완독 +50(D5) 누적 정책. points 용도(교환·레벨) 확정 시 재검토. 베타 데이터 후.
4. **F24 — 무한 스크롤 성능**: IntersectionObserver+cursor(D7)의 대량 카탈로그 누적 DOM. 임계 초과 시 가상 스크롤.

---

## 6. 상호 참조

- **ADR-0017 Amendment #2**(동시 작성): D7 phase-13 경계(별·points·badges 전속)를 본 ADR이 해소함을 박제. ADR-0017 본문 D1~D7은 무변경(phase-end 본문 보존 관례).
- **ADR-0003** §2(secret 키 서버 전용)·§5.2(노출 금지) — 옵션 B(D1)의 정책 근거. SUPABASE_SECRET_KEY는 phase-06 기존 인프라.
- **001 마이그레이션** §9.1(books viewable by everyone — /library SELECT 본인 세션 정상)·§9.3(children UPDATE — points 본인 세션 가능)·§9.6(child_badges SELECT만 — 옵션 B 필수)·children.points(line 44)·child_badges UNIQUE(line 159).
- **design-system** §7.3(line 368~381) — 별·포인트·배지 모션 토큰(spec d9, Hard Rule 10 semantic).
- **claude.md** Hard Rule 6(secret 키 클라이언트 노출 금지 — awardCompletionRewards server-only)·Hard Rule 8(DB 스키마 무변경 — 옵션 B)·Hard Rule 10(raw HEX 0건 — §7.3 모션).

---

*문서 끝.*
