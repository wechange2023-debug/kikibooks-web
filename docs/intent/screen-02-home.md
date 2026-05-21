# 의도 문서 — Screen 02 로그인 후 홈 (screen-02-home)

**대상 페이즈** phase-10-screen-02-home
**상태** 확정 (phase-10 CP1)
**최종 갱신** 2026-05-21
**관련** `docs/adr/0015-screen-02-category-strategy.md`(카테고리 8개 + 키워드 풀), `docs/adr/0012-landing-page-static.md`(DB 무변경 패턴), `docs/adr/0014-gdl-cover-url-and-illustrator-strategy.md`(GDL author=publisher · 옵션 Y · Book Dash 블랙리스트 — 본 페이즈는 무변경 인용), `docs/adr/0013-cover-attribution-policy.md`(표지 캡션 정책 — 추천·카테고리 결과에 재사용), `tasks/phase-10-screen-02-home.json`, `docs/design-system.md`(§1.4 Accent 컬러·§1.8 Level 매핑·§3 Spacing·§7.4 Streak·§6.x 컴포넌트), `docs/guidelines/license-rules.md`(4·5절 어트리뷰션), `lib/auth/resolve-post-login-path.ts`(phase-08 분기 헬퍼), `lib/landing/popular-books.ts`(Book Dash 4 UUID 블랙리스트 재사용), `supabase/migrations/001_initial_schema.sql`(profiles·children·books·reading_sessions), `PLAN.md` 9절(Screen 02), `claude.md` 2절 Hard Rule 1·3·6·8·10

---

## 1. 이 문서의 목적

로그인·온보딩을 마친 학부모가 자녀와 함께 매일 진입하는 화면 — 홈(`/home`) — 이 사용자 입장에서 어떻게 동작해야 하는지를 자연어로 못박는다. 코드는 이 문서를 따른다(claude.md §3-5: 의도 문서 선행). 카테고리 그리드의 기술적 "왜"는 `docs/adr/0015-screen-02-category-strategy.md`에 분리돼 있다.

홈의 목표는 둘이다:

1. **오늘 읽을 책 1권을 30초 안에 찾게 한다** (오늘의 추천 5권 + 카테고리 그리드 8개)
2. **자녀의 학습 습관을 시각화한다** (최근 7일 스트릭 막대그래프)

---

## 2. 범위

**phase-10이 다루는 것**

- `app/home/page.tsx`를 phase-07~08 placeholder에서 정식 홈 페이지로 교체
- 5개 구성요소: 인사 카드 · 오늘의 추천 5권 · 카테고리 그리드 8개 · 레벨 선택 바 · 최근 7일 스트릭
- `lib/home/` 신규 데이터 fetch 레이어 (greeting · recommendations · categories · streak)
- 신규 컴포넌트 5종: `GreetingCard`, `RecommendationList`, `CategoryGrid`, `LevelSelector`, `StreakChart`
- 레벨 변경 핸들러 — server action + `revalidatePath('/home')`
- 카테고리 카드 클릭 라우팅 — `/home?cat={slug}` (홈 내부 확장, ADR-0015 결정 5b)
- 모바일 우선(390px) + 태블릿(768px) + 데스크탑(1280px) 반응형

**phase-10이 다루지 않는 것 (다음으로 연결)**

- 책 상세 페이지 진입 — phase-11. 표지 클릭은 phase-11 신설 후 라우팅
- `AttributionBox` 전체 어트리뷰션 의무 화면 — phase-11
- 책 뷰어·완독 보상 — phase-12·13
- illustrator 데이터 적재 — ADR-0013 §7 + ADR-0014 결정 3 유지 (phase-11에서 결정)
- GDL `author=publisher` 정정 — ADR-0014 결정 6 유지 (phase-11에서 결정). 홈 카드 라벨에 publisher가 노출되는 현황은 phase-10 무변경
- Book Dash 4 슬러그 블랙리스트 — ADR-0014 결정 2 그대로 인용. `lib/landing/popular-books.ts`의 `BOOK_DASH_404_SOURCE_IDS` 상수를 추천·카테고리 쿼리에서 재사용
- 라이브러리(`/library`) 신설 — phase-13. 카테고리 라우팅 5a로의 이전은 phase-13 ADR
- 카테고리 키워드 풀 정확도 측정 도구 — phase-13b Admin (ADR-0015 결정 7)
- "진짜 인기순" 알고리즘 — phase-13b
- 다크 모드 — design-system §9 (Phase 2 이후)

---

## 3. 라우트 지도

| 경로 | 공개/보호 | 비고 |
|---|---|---|
| `/home` | 보호 (로그인 + 자녀 ≥ 1) | 미로그인 → `/login`. 자녀 0명 → `/onboarding` (페이지 컴포넌트 안에서 redirect) |
| `/home?cat={slug}` | 보호 | 8 slug 중 하나(`animals`·`family`·`abc`·`numbers`·`emotions`·`nature`·`food`·`bedtime`). 그 외 slug는 무시(쿼리 없음과 동일 동작) |

**routes.ts·middleware.ts는 수정하지 않는다**. `/home`은 phase-07에서 이미 `PROTECTED_PREFIXES`에 등록돼 있고, 미온보딩(자녀 0명) 가드는 페이지 컴포넌트 안에서 처리한다(phase-08 "분기는 도착 지점에서" 원칙 계승).

---

## 4. 사용자 흐름 (단계별)

### 4.1 핵심 흐름 (로그인 + 자녀 1명 이상)

1. 학부모가 `/home`에 접속한다(헤더 로고·`/`에서 리다이렉트·앱 첫 진입 등).
2. 화면 상단에 인사 카드("안녕하세요, [display_name]님 👋")와 자녀 프로필 칩을 본다.
3. 그 아래 "오늘의 추천 5권" 가로 스크롤 책 카드 줄을 본다. 자녀의 `current_level ±1`을 기준으로 아직 안 읽은 책 5권이다.
4. 카테고리 그리드 8개(2×4)를 본다. 카드를 누르면 같은 페이지에 `/home?cat={slug}` 쿼리로 카테고리 결과 섹션이 확장 표시된다.
5. 레벨 선택 바(Level 1~5)에서 자녀의 현재 레벨을 본다. 다른 레벨을 누르면 server action이 `children.current_level`을 UPDATE하고 `revalidatePath('/home')`로 추천 5권을 재계산한다.
6. 화면 하단에 최근 7일 스트릭 막대그래프를 본다. 완독한 날은 `--color-primary`, 미완독일은 `--color-surface-3`로 표시된다.

### 4.2 미로그인 / 미온보딩 가드

1. 미로그인 상태로 `/home` 접근 → `middleware.ts`가 `/login`으로 리다이렉트(phase-07 기존 동작, 무변경).
2. 로그인했으나 자녀 0명 상태로 `/home` 접근 → 페이지 컴포넌트가 `children` 행 개수를 확인하고 0이면 `redirect('/onboarding')`. 미들웨어는 수정하지 않는다.

### 4.3 카테고리 카드 클릭 (확장 흐름)

1. 사용자가 카테고리 그리드의 "동물" 카드를 누른다 → 브라우저 URL이 `/home?cat=animals`로 바뀐다.
2. 페이지가 같은 라우트로 다시 렌더링되며, 카테고리 그리드 아래에 "카테고리: 동물 (n권)" 섹션이 표시된다.
3. 매칭된 책 카드 목록 + 닫기 버튼("닫기"를 누르면 `/home`으로 돌아감).
4. 매칭 결과 0건이면 폴백 UI("이 카테고리에 아직 책이 없어요. 다른 카테고리를 둘러보세요!")를 표시한다(ADR-0015 결정 6).

### 4.4 레벨 변경 흐름

1. 사용자가 Level 1~5 Chip 중 다른 레벨을 누른다.
2. 클라이언트가 server action을 호출하여 `children.current_level`을 UPDATE한다.
3. server action이 `revalidatePath('/home')`을 호출한다.
4. 페이지가 새 레벨 기준으로 추천 5권을 재계산하여 렌더링한다.
5. 레벨 변경은 즉시 반영되며 별도 페이지 이동은 없다.

---

## 5. 5개 구성요소 명세

모든 색·간격·폰트·radius·shadow는 `design-system.md` semantic 토큰만 사용한다(Hard Rule 10). 화면 문구는 컴포넌트 안에 하드코딩하지 않고 `lib/home/copy.ts` 단일 출처로 통일한다(ADR-0012 결정 2 패턴 계승).

### 5.1 인사 카드 (GreetingCard)

| 항목 | 값 |
|---|---|
| 메인 카피 | `안녕하세요, {display_name}님 👋` |
| 폴백 카피 (display_name이 NULL) | `{children[0].name} 부모님 👋` |
| 서브 카피 | `오늘도 함께 책을 펼쳐볼까요?` |
| 자녀 프로필 칩 | 자녀 이름·나이·레벨 (Chip 토큰: 0 16px / 38px / pill radius) |
| 칩 컬러 | design-system §1.8 Level 컬러 매핑 (Level 1: green / Level 2: sky / Level 3: yellow / Level 4: pink / Level 5: violet) |
| 카드 토큰 | Card md (padding 20px, radius-md 16px, surface-1) |

**폴백 규칙**:
- `profiles.display_name`이 NULL이면 첫 번째 자녀 이름을 빌려 "{자녀이름} 부모님"으로 표시한다. 이 폴백은 정보 부족 상태를 자연스러운 한국어 호칭으로 가린다.
- 자녀가 여러 명이어도 인사 카드는 첫 번째 자녀의 이름만 사용한다(다자녀 모드는 phase-13 이후 고려).
- display_name도 자녀도 없는 경우는 §4.2 가드로 인해 도달 불가.

### 5.2 오늘의 추천 5권 (RecommendationList)

| 항목 | 값 |
|---|---|
| 쿼리 기준 | `books WHERE is_active=true AND level BETWEEN current_level-1 AND current_level+1 AND id NOT IN (reading_sessions WHERE child_id=… AND is_completed=true)` |
| Book Dash 4 UUID 블랙리스트 | `lib/landing/popular-books.ts`의 `BOOK_DASH_404_SOURCE_IDS` 상수를 import 재사용 (ADR-0014 결정 2 정합) |
| source_platform 필터 | **없음** — 옵션 Y 환원(ADR-0014 결정 4)으로 GDL+Book Dash 모두 노출 |
| 정렬 | 랜덤 (ADR-0012 결정 3 패턴 — 베타 "진짜 인기순" 부재) |
| 표시 권수 | 5권 (PLAN.md 9절 명세) |
| 레이아웃 | 가로 스크롤 카드 줄 (모바일: 단일 행 스와이프 / 태블릿+: 5개 한 줄 그리드) |
| 카드 캡션 | 표지 아래 제목·저자 (ADR-0013 §3 정책 재사용). GDL `author=publisher` 현황은 phase-10 무변경(ADR-0014 결정 6) |
| 카드 클릭 동작 | phase-10에서는 `/book/[id]`가 미존재 — phase-11까지 placeholder 동작(클릭 시 토스트 "곧 공개될 예정이에요" 또는 비활성). **CP1 결정**: **비활성**(클릭 무반응) 채택. 토스트는 인지 부담 증가. phase-11 신설 시 카드 클릭 활성화 |

**폴백 사다리**:

| 단계 | 조건 | 결과 |
|---|---|---|
| 1 | level ±1 + 미독 책 ≥ 5권 | 5권 표시 (기본) |
| 2 | level ±1 + 미독 책 < 5권 | level ±2로 확장 재조회 |
| 3 | level ±2 + 미독 책 < 5권 | level ±3으로 확장 재조회 |
| 4 | level ±3 + 미독 책 < 5권 | 나온 N권만 표시 (1 ≤ N < 5) |
| 5 | level ±3에서도 0권 | 빈 상태 폴백 UI ("아직 추천할 책이 부족해요. 카테고리에서 둘러보세요!") |

각 단계의 폴백 발동은 사용자에게 별도 알림 없이 자연스럽게 처리한다. 빈 상태(5단계)에서만 명시적 메시지를 표시한다.

### 5.3 카테고리 그리드 8개 (CategoryGrid)

| 항목 | 값 |
|---|---|
| 카테고리 슬러그·라벨 | ADR-0015 결정 2.1 표 인용 (`animals·family·abc·numbers·emotions·nature·food·bedtime`) |
| 키워드 풀 | ADR-0015 결정 2.2 단일 진실 공급원 (`lib/home/categories.ts`에서 옮겨 적기) |
| 레이아웃 | 2×4 그리드 (모바일·태블릿·데스크탑 동일 — design-system §3.4 grid 토큰) |
| 카드 토큰 | Card sm (padding 14px, radius-sm 12px) |
| 카드 액센트 | ADR-0015 결정 2.1 매핑 컬러 |
| 카드 안 표시 | 한글 라벨 + 카테고리 아이콘 영역(이모지 또는 단순 SVG 일러스트 — CP3-a에서 확정) |
| 클릭 동작 | `/home?cat={slug}` 쿼리 추가 (ADR-0015 결정 5b) |
| 매칭 알고리즘 | `book.title.toLowerCase().includes(keyword.toLowerCase())` boolean (ADR-0015 결정 1) |
| 카테고리 결과 권수 캡 | 24권 (CP3-a에서 최종 확정. 본 문서는 캡 존재만 박제) |
| 결과 0건 폴백 | "이 카테고리에 아직 책이 없어요." 메시지 + 다른 7개 카드 강조 (ADR-0015 결정 6) |
| 매칭 실패 책 처리 | 카테고리 그리드에서만 미노출. 추천·라이브러리·검색에는 정상 노출 (ADR-0015 결정 3 (β)) |
| 다중 매칭 | 한 책이 여러 카테고리에 매칭되면 모두에 포함 (ADR-0015 결정 4) |

### 5.4 레벨 선택 바 (LevelSelector)

| 항목 | 값 |
|---|---|
| 표시 | Level 1~5 Chip 5개 (가로 배치) |
| 현재 레벨 강조 | 활성 Chip은 design-system §1.8 매핑 컬러 배경 + `--color-text-inverse` 텍스트 |
| 비활성 Chip | `--color-surface-2` 배경 + `--color-text-variant` 텍스트 |
| 클릭 동작 | server action `updateChildLevel(childId, newLevel)` 호출 → DB UPDATE → `revalidatePath('/home')` |
| 보호 | `childId`는 server에서 세션의 현재 자녀 ID로 한정. 클라이언트가 임의 childId를 전송할 수 없도록 server action 내부 검증 |
| 로딩 상태 | 클릭 즉시 옵티미스틱 UI (활성 Chip 시각 변경). server 응답 후 추천 5권이 자동 재계산되어 렌더링 |

**재계산 정책**: server-side UPDATE + `revalidatePath('/home')` 채택. 클라이언트 단독 상태 관리는 추천 5권 재계산을 트리거할 수 없어 부적합. SWR/React Query 도입은 베타 단계의 단순성을 해친다.

### 5.5 최근 7일 스트릭 (StreakChart)

| 항목 | 값 |
|---|---|
| 쿼리 기준 | `reading_sessions WHERE child_id=… AND completed_at >= NOW()-INTERVAL '7 days' AND is_completed=true` |
| 채움 기준 | **완독 기준** (`is_completed=true`) — design-system §7.4 "완료일 색상" 정의와 정합. 세션 시작만으로는 막대 채우지 않음 |
| 표시 형식 | 막대 7개 (가장 오래된 날 ← 오늘) — design-system §7.4 토큰 100% 적용 |
| 막대 너비 | 28px |
| 막대 최대 높이 | 60px |
| 막대 radius | radius-sm (12px), 위쪽만 |
| 완료일 색상 | `--color-primary` |
| 미완료일 색상 | `--color-surface-3` |
| 오늘 표시 | 막대 위 작은 dot `--color-accent-yellow` |
| 막대 간 간격 | 8px |
| 요일 라벨 | caption (12px) `--color-text-variant` |
| 막대 높이 계산 | 일자별 완독 권수 비율 (해당 주 최대 완독 권수 = 60px 기준 비례). 모두 0이면 모든 막대 같은 최소 높이(예: 4px)로 표시 |
| 빈 상태 폴백 | 7일 전체 완독 0건 시 차트 영역 아래 "오늘부터 시작해볼까요?" 메시지 표시 (UI는 빈 막대 7개 그대로 + 메시지 카드 1장) |

---

## 6. 지켜야 할 규칙·제약

- **Hard Rule 1·3** — books·license 관련 INSERT/UPDATE 없음. attribution_text NOT NULL 트리거 무변경.
- **Hard Rule 6** — 홈 페이지는 Server Component에서 `SUPABASE_SECRET_KEY`로 데이터 조회 가능. 클라이언트 코드·공개 환경변수에 secret 노출 0건. server action도 server 환경 변수만 사용.
- **Hard Rule 8** — DB 스키마 변경 0건. supabase/migrations 신규 0건. children.current_level UPDATE만 (스키마 무변경).
- **Hard Rule 10** — 모든 색·간격·폰트는 `design-system.md` semantic 토큰만 사용. raw HEX 직접 입력 금지. 일러스트·차트 예외도 §7.4 토큰 매핑 100% 준수.
- **카피 단일 출처** — `lib/home/copy.ts`에서만 정의. 컴포넌트는 props로 받는다(ADR-0012 결정 2 패턴).
- **Cache Components 정책** — 본 페이즈에서는 **`export const dynamic = 'force-dynamic'` 보수적 적용**. 자녀별·세션별 데이터가 강하게 결합돼 있고, 베타 단계에서 캐싱 오작동(다른 자녀 데이터 누출 등)은 신뢰를 깬다. PPR / `cacheLife` / `cacheTag`는 phase-13b 이후 운영 데이터 기반으로 도입 검토.
- **분기는 페이지 컴포넌트에서 1회** — 자녀 0명 가드는 `/home` 페이지 안에서만. `middleware.ts`는 수정하지 않는다.
- **routes.ts·middleware.ts 무변경** — phase-07·08에서 확정된 `PROTECTED_PREFIXES`·미들웨어를 phase-10이 건드리지 않는다.
- **표지 어트리뷰션** — 추천 5권·카테고리 결과 카드 모두 표지 아래 제목·저자 캡션을 표시한다(ADR-0013 §3 재사용).
- **GDL author=publisher 노출 유지** — 추천 5권·카테고리 결과 카드 라벨에 GDL `publisher`가 그대로 노출된다(ADR-0014 Amendment #2 D 박제 현황). phase-11에서 통합 결정.

---

## 7. phase-10이 끝나면 이어지는 것

- **phase-11**: 책 상세 — 추천 5권·카테고리 결과 카드 클릭이 `/book/[id]`로 활성화. AttributionBox 전체 표시 + GDL author=publisher / illustrator 정책 통합 결정(ADR-0014 결정 3·6).
- **phase-12**: 책 뷰어 — 완독 시 `reading_sessions.is_completed=true` 갱신 → 본 페이즈 스트릭 차트에 즉시 반영.
- **phase-13**: 라이브러리(`/library`) — 카테고리 라우팅을 `/home?cat={slug}`에서 `/library?category={slug}`로 이전(ADR-0015 결정 5 갱신).
- **phase-13b**: Admin — ADR-0015 결정 7 임계 도달 시 정식 `categories` 컬럼 도입 ADR 신설. 키워드 풀 정확도 측정 도구.

---

## 8. 사용자(키키북스 운영자)가 직접 해야 하는 일

없음. phase-10은 코드만으로 완결되며 외부 콘솔 설정이 필요하지 않다. 검증은 `tasks/phase-10-screen-02-home.json`의 v6~v13 클릭 테스트를 사용자가 직접 수행한다(인사 카드 NULL 폴백·추천 5권 미독/블랙리스트/옵션 Y/폴백 사다리·카테고리 그리드 8개·레벨 변경 재계산·스트릭 완독 기준·빈 상태 폴백·반응형 3 viewport).

*문서 끝.*
