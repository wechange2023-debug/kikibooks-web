# 핸드오프 — 성능 개선 트랙(P1 완독) + 쇼케이스 검수 네비

**날짜** 2026-07-01 · **HEAD** `67974a5` · 워킹트리 clean(`.claude/settings.local.json`만 미스테이징, 손대지 말 것) · origin 동기화

---

## 이번 세션 완료 트랙 (HEAD=67974a5 시점)

### 1. 완독 P1 — 중복 auth·getActiveChild 재해소 제거 (ADR-0018 Amendment #1)
- **커밋** `d2237d3` `perf(rewards): pass verified childId to awardCompletionRewards (ADR-0018 Amd#1)`
- `lib/book/rewards.ts`: `'use server'` server action → `import 'server-only'` 내부 함수.
  시그니처 `awardCompletionRewards(childId: string)`. 내부 `auth.getUser`·`getActiveChild` 제거.
- `lib/book/reading-session.ts:203`: `awardCompletionRewards(child.id)` — `:168`에서 RLS 검증한 본인 자녀 id 전달.
- **보안 계약**: `'use server'` 제거 + 인자 추가를 **한 커밋**에 함께(중간 상태 = 외부 조작 id로 남의 자녀 적립 구멍 → 금지). service-role(RLS 우회) 쓰기 성격 불변, 넘기는 childId는 호출자가 RLS 검증한 값만.
- **효과**: 완독 POST 1회에서 auth 서버 왕복 1 + children SELECT 1 감소. 완독 결과(+50·배지·celebrate) 등가.
- 게이트: 타입체크·린트·빌드 통과, `/book/[id]/celebrate` = ƒ Dynamic 불변.
- 근거 문서: `docs/adr/0018-completion-rewards-and-library.md` Amendment #1(Accepted),
  `docs/review/2026-07-01-completion-path-diagnosis.md`.

### 2. 상단 헤더에 '쇼케이스(검수용)' 메뉴 추가 → /showcase
- **커밋** `9dd03b8` `feat(routes): add SHOWCASE_PATH nav constant for review showcase menu`
  — `lib/auth/routes.ts`에 `SHOWCASE_PATH = '/showcase'` 상수 신설(ADR-0021 D5 중앙화).
- **커밋** `67974a5` `feat(nav): add review-only showcase menu item to app header`
  — `components/app/app-header.tsx` `NAV_LINKS` 배열 끝에 항목 추가(label '쇼케이스(검수용)').
    기존 홈·라이브러리 항목·순서·스타일 불변, map·토큰 재사용(스타일 신규 0, Hard Rule 10).
  — `app/showcase/page.tsx` 상단 주석 정정("전역 네비 미노출" → 헤더 검수 메뉴 노출).
- `/showcase`는 자체 로그인 가드만(자녀 가드 없음), robots noindex, force-dynamic. 임시 메뉴 — 서비스 전환 시 app/showcase 삭제 + NAV_LINKS 항목 제거로 함께 정리.
- 게이트: 타입체크·린트·빌드 통과, 헤더 렌더 페이지(/home·/library·/book/[id]) 전부 ƒ Dynamic 불변.

### (참고) 앞선 성능 트랙 누적 상태
- P0-1 카탈로그 데이터 캐싱(ADR-0033): `getBookById`(파일럿)·`getCategoryDistribution`(롤아웃 2) `unstable_cache` 적용, tag `books-catalog`, revalidate 3600. 쿠키 없는 publishable 클라이언트(개인 데이터 혼입 구조적 차단).
- 즉시 무효화: admin `revalidateTag('books-catalog')` + `clearCatalogCache()`(assertAdmin 가드) 버튼, `docs/ops/emergency-takedown.md` 런북.
- P0-3(홈 병렬화)·P0-4(라이브러리 count 최적화) 반영 완료.

## 다음 세션 첫 안건 후보
1. **캐시 롤아웃 3단계 — `getBooks` 캐싱**(ADR-0033 롤아웃 계속). `lib/book/detail.ts`·`lib/home/categories.ts` 파일럿과 동일 패턴(createCatalogClient 인라인, void supabase, tag `books-catalog`, revalidate 3600). getBooks의 쿼리 지문·페이지네이션/필터 인자가 캐시 키에 포함되는지 먼저 진단.
2. **베타 게이트 기능** — TTS(낭독) / 독후활동 / MyPage. 신규 기능 트랙(ADR·의도문서 선행).

## 미검수 항목 (사람 눈 확인 필요)
- **완독 P1 체감**: 실제 책 1권 완독 → +50 포인트·first_completion 배지·celebrate 정상 표시 + 완독 처리가 이전보다 가벼운지 체감.
- **쇼케이스 메뉴 표시**: 로그인 후 상단에 '쇼케이스(검수용)' 노출·클릭 시 /showcase 이동·반응형 동일 표시·기존 홈/라이브러리 항목 불변.

---

*메모 끝. 재개 시 본 파일 + `docs/review/2026-07-01-*` 진단 리포트 우선 참조.*
