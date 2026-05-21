# 의도 문서 — Screen 03 책 상세 (screen-03-book-detail)

**대상 페이즈** phase-11-screen-03-book-detail
**상태** 확정 (phase-11 CP1)
**최종 갱신** 2026-05-21
**관련** `docs/adr/0016-illustrator-author-publisher-attributionbox.md`(본 페이즈 핵심 — illustrator·author/publisher·5요소 사유), `docs/adr/0014-gdl-cover-url-and-illustrator-strategy.md` Amendment #4(블랙리스트 책 상세 차단 + 404), `docs/adr/0013-cover-attribution-policy.md`(목록 캡션 정책 — 본 페이즈가 도달 지점), `docs/intent/screen-02-home.md`(선행 패턴), `tasks/phase-11-screen-03-book-detail.json`, `docs/design-system.md`(§1·§3·§6.1·§6.2·§7.1 AttributionBox 토큰), `docs/guidelines/license-rules.md`(4·5·7.2절), `lib/landing/popular-books.ts`(`BOOK_DASH_404_SOURCE_IDS` 재사용), `supabase/migrations/001_initial_schema.sql`(books — title·author·illustrator·original_url·license·attribution_text·source_platform), `PLAN.md` 9절(Screen 03), `claude.md` 2절 Hard Rule 1·3·6·8·10

---

## 1. 이 문서의 목적

학부모가 홈(또는 향후 라이브러리)에서 책 카드를 눌러 도달하는 책 상세 페이지 — `/book/[id]` — 가 사용자 입장에서 어떻게 동작해야 하는지를 자연어로 못박는다. 코드는 이 문서를 따른다(claude.md §3-5: 의도 문서 선행). 라이선스·어트리뷰션의 기술적·법적 "왜"는 `docs/adr/0016-illustrator-author-publisher-attributionbox.md`에 분리돼 있다.

책 상세의 목표는 셋이다:

1. **이 책이 무슨 책인지 30초 안에 판단하게 한다** (표지 + H1 제목 + 메타 + 어트리뷰션 한 화면 안)
2. **CC BY 4.0 법적 의무를 빠짐없이 충족한다** (AttributionBox 5요소 + H1 제목 = 통합 어트리뷰션 단위)
3. **읽기 시작점을 명확히 제공한다** (읽기 버튼 → phase-12 책 뷰어로 자연 진입)

---

## 2. 범위

**phase-11이 다루는 것**

- `app/book/[id]/page.tsx` 정식 페이지 신규 (현재 부재)
- `app/book/[id]/not-found.tsx` 공통 404 페이지 신규 — books NULL · RLS 차단 · 블랙리스트 차단 모두 동일 UX
- 5개 구성요소: BookCoverHero(표지 + H1 + 메타 칩) · AttributionBox(5요소) · ReadButton(phase-12 자리) · BookMeta(레벨·연령·언어) · 공통 404
- `lib/book/` 신규 데이터·카피·어트리뷰션 분기 헬퍼 3종 (`detail.ts` · `copy.ts` · `attribution.ts`)
- 신규 컴포넌트 4종: `AttributionBox`, `BookCoverHero`, `BookMeta`, `ReadButton`
- AttributionBox 5요소 100% 표시 + GDL `author=publisher` 분리 표시(ADR-0016 결정 2-나) + illustrator NULL 행 생략(ADR-0016 결정 1-가)
- 블랙리스트 4 UUID 직접 접속 시 404 (ADR-0014 Amendment #4)
- 모바일 우선(390px) + 태블릿(768px) + 데스크탑(1280px) 반응형
- 모바일에서 AttributionBox는 첫 fold 안에 노출 (license-rules.md §5.3)

**phase-11이 다루지 않는 것 (다음으로 연결)**

- 책 뷰어 (`/book/[id]/read`) — phase-12. 읽기 버튼은 자리만 잡고 phase-12에서 활성화
- 완독 보상 (`/book/[id]/celebrate`) — phase-13
- 라이브러리 (`/library`) — phase-13
- 즐겨찾기 ⭐ 토글 — phase-13 라이브러리 시점 통합(ADR-0016 결정 4 cp1_decisions d4). 본 페이즈에서 ⭐ 아이콘·버튼 0건. `favorites` 테이블은 phase-03부터 존재하지만 UI 진입점은 phase-13
- illustrator 데이터 sync 적재 — F8 트리거 박제, 별도 sync 보강 phase
- AttributionBox 박제 문안 법무 검토 — F9 트리거, phase-14 베타 직전
- 책 상세에서 다른 책 추천("이 책을 읽은 사람들이 본 책") — phase-13b 이후
- 다자녀 모드 — 책 상세는 자녀 무관(즐겨찾기 phase-13에서 자녀별 분기)
- 다크 모드 — design-system §9 Phase 2 이후
- middleware.ts·routes.ts 수정 — phase-07·08 확정본 무변경. `/book/[id]`은 보호 라우트(ADR-0013 결정 4 closed environment)

---

## 3. 라우트 지도

| 경로 | 공개/보호 | 비고 |
|---|---|---|
| `/book/[id]` | 보호 (로그인 + 자녀 ≥ 1) | 미로그인 → `/login` (middleware). [id]는 books.id UUID(ADR-0016 cp1_decisions d3). 블랙리스트 4 UUID 일치 → notFound() (ADR-0014 Amendment #4). books 행 NULL 또는 RLS 차단 → notFound() |
| `/book/[id]/read` | (phase-12 신설 예정) | 본 페이즈에서 미존재. 읽기 버튼은 자리만 |

**routes.ts·middleware.ts는 수정하지 않는다.** `/book`은 phase-07 기존 보호 라우트 prefix에 자연 포함될지 검증 후, 추가 처리가 필요하면 CP3-b 시점에 별도 보강(현재 plan 단계에서는 추가 수정 0건 가정).

---

## 4. 사용자 흐름 (단계별)

### 4.1 핵심 흐름 (홈 → 책 상세)

1. 학부모가 `/home`의 추천 카드 또는 카테고리 결과 카드를 누른다 → 브라우저가 `/book/[id]`(UUID)로 이동한다.
2. 화면 상단에 책 표지(BookCoverHero)와 H1 제목·메타 칩(레벨·연령·언어)을 본다.
3. 표지 직하단에 AttributionBox(5요소)를 본다 — 모바일 첫 fold 안에 노출된다.
4. AttributionBox 아래에 읽기 버튼(ReadButton)을 본다. phase-11에서는 클릭 시 placeholder 또는 404로 처리되며, phase-12에서 책 뷰어로 활성화된다.
5. 페이지 하단 또는 푸터에 CC BY 안내 문구가 표시된다(ADR-0013 결정 2 인용).

### 4.2 직접 URL 접속 (사용자 또는 외부 링크)

1. 사용자가 `/book/{uuid}`로 직접 접속한다.
2. 페이지가 books.id UUID로 조회한다 — `lib/book/detail.ts:getBookById`.
3. 다음 3 케이스 중 하나에 해당하면 공통 404 페이지(`not-found.tsx`)를 렌더한다:
   - 블랙리스트 4 UUID 일치 (ADR-0014 Amendment #4)
   - books 행 NULL (id 부재 또는 is_active=false)
   - RLS 차단(인증·자녀 가드)
4. 그 외에는 정상 렌더한다.

### 4.3 미로그인 가드

1. 미로그인 상태로 `/book/[id]` 접근 → `middleware.ts`가 `/login`으로 리다이렉트(phase-07 기존 동작, 무변경).
2. 로그인했으나 자녀 0명 상태로 접근 — phase-10과 달리 책 상세는 자녀 무관 페이지이므로 자녀 0명 가드는 적용하지 않는다(즐겨찾기 phase-13 통합 시 자녀별 분기 도입 검토).

---

## 5. 구성요소 (각 컴포넌트 의도)

### 5.1 BookCoverHero (표지 + H1 제목 + 메타 칩)

**의도**: 책의 시각적 정체성과 핵심 메타데이터를 한 시야에 담는다.

- 표지 이미지(`book.cover_url`) — next/image 사용, fallback은 design-system.md §6.4 Illustration 또는 단순 placeholder.
- 책 제목 — `<h1>{book.title}</h1>` (H1 단일, SEO·접근성·CC BY 4.0 '제목 요소' 충족 단위 — ADR-0016 결정 3 박제).
- 메타 칩 3종 — 레벨(§1.8 컬러 매핑) · 연령(age_min~age_max) · 언어. `BookMeta` 컴포넌트로 분리.

**위치**: 페이지 최상단. AttributionBox 직상단.

### 5.2 BookMeta (레벨·연령·언어 칩)

**의도**: 책 선택의 보조 정보. BookCoverHero 내부에서 사용된다.

- Level 1~5 칩 — design-system.md §1.8 컬러 매핑 사용(LevelSelector와 동일 토큰).
- 연령 칩 — "3-5세" 또는 "5-7세" 형식. age_min·age_max NULL이면 행 생략.
- 언어 칩 — `language='en'`이면 "영어". 베타에서 'en' 단일이라 사실상 고정 표시.

### 5.3 AttributionBox (라이선스 의무 표시 — 5요소)

**의도**: CC BY 4.0 법적 의무를 충족하면서 사용자에게 큐레이션 투명성을 전달한다(ADR-0016 결정 3 박제).

**표시 5요소** (PLAN.md 9절 + license-rules.md §5.1):

```
📚 출처: {source_platform 한국어명}        ← 출처 행 (큐레이션 투명성)
✍️ 글: {author}                            ← Book Dash 케이스. GDL은 행 생략 (ADR-0016 결정 2-나)
🎨 그림: {illustrator}                     ← NULL이면 행 생략 (ADR-0016 결정 1-가)
🏢 출판사: {publisher}                     ← GDL 케이스. Book Dash는 행 생략 (ADR-0016 결정 2-나)
📜 라이선스: CC BY 4.0                     ← 외부 링크(라이선스 URL, new tab, rel=noopener noreferrer)
🔗 원본 보기                                ← 외부 링크(book.original_url, new tab, rel=noopener noreferrer)
```

**법적 충분성** (ADR-0016 결정 3 박제):
- CC BY 4.0 법적 4요소는 (저작자·**제목**·라이선스URL·원본URL).
- "제목"은 BookCoverHero H1으로 별도 표시되며, AttributionBox와 DOM·시각 모두 인접 배치(license-rules.md §5.3)된다.
- H1 + AttributionBox = **통합 어트리뷰션 단위**로 기능하며, CC BY 4.0 'reasonable to the medium' 원칙을 충족한다.

**위치 규칙** (license-rules.md §5.3, design-system.md §7.1):
- 책 표지 직하단, 읽기 버튼 직상단.
- 모바일(390px)에서도 첫 fold 안에 노출.
- 폰트 최소 12px, 색상 대비 WCAG AA 이상.

**토큰** (design-system.md §7.1):
- Container: `--color-surface-2` 배경, `--color-outline` 1px 보더, `--radius-md`(16px), padding 16px 20px.
- Title: `body-sm`(13px), weight 600, `--color-text`.
- Body: `caption`(12px), `--color-text-variant`.
- 외부 링크: `body-sm`, `--color-tertiary`, hover underline.
- 라이선스 배지: Chip 형태, `--color-tertiary-container` 배경.

### 5.4 ReadButton (읽기 버튼 — phase-12 자리만)

**의도**: 책 뷰어 진입점. phase-11에서는 자리만 잡고, phase-12에서 `/book/[id]/read`로 활성화한다.

- 버튼 라벨: "📖 읽기 시작" 또는 "이 책 읽기" (CP3-a 결정).
- design-system.md §6.1 Button primary 변형 사용.
- 클릭 동작 (phase-11): `/book/[id]/read` 링크 또는 disabled. phase-12에서 책 뷰어 라우트가 신설되므로 본 페이즈에서는 클릭 시 404 또는 placeholder UI로 처리.
- 위치: AttributionBox 직하단(license-rules.md §5.3 "AttributionBox는 읽기 버튼 직상단" 정합).

### 5.5 공통 404 페이지 (`not-found.tsx`)

**의도**: 책 상세 페이지가 렌더되지 못하는 3 케이스(블랙리스트·NULL·RLS)에서 동일한 사용자 경험을 제공한다.

- "찾을 수 없는 책이에요" 메시지 + 홈으로 돌아가는 링크.
- design-system.md §6.2 Card + §6.1 Button 토큰 재사용.
- 정보 노출 최소화(블랙리스트 사유나 RLS 사유를 사용자에게 구분 표시하지 않음 — 보안 + UX 일관성).

---

## 6. 캐싱·성능

- `app/book/[id]/page.tsx`는 `export const dynamic = 'force-dynamic'` 보수적 적용(phase-10 cp1_decisions d3과 동일 정책). 책 상세는 자녀 무관이지만 베타에서 캐싱 오작동 위험 회피 우선.
- next/image로 표지 최적화. LCP 후보 이미지에 `priority` 또는 `fetchPriority='high'` 적용(phase-10 F1 트리거 학습 사전 반영).
- Cache Components(PPR · cacheLife · cacheTag) 도입은 phase-13b 이후 운영 데이터 기반 결정.
- 외부 링크는 반드시 `rel="noopener noreferrer"` + `target="_blank"` (license-rules.md §7.2).

---

## 7. 검증 (이 문서가 코드에 요구하는 것)

본 의도 문서는 다음을 코드에 요구한다. `tasks/phase-11-screen-03-book-detail.json` `verification` 필드가 동일 항목을 측정 가능한 명령으로 박제한다.

1. AttributionBox는 모든 책 상세 페이지에 100% 표시된다(v6).
2. CC BY 4.0 법적 4요소(저작자·제목·라이선스URL·원본URL)는 H1 제목 + AttributionBox 통합 단위로 충족된다(v7 4 sub-case).
3. illustrator NULL 시 '🎨 그림' 행 자체가 DOM에서 부재한다(v8).
4. GDL `author=publisher` 케이스에서 '✍️ 글' 행은 부재(또는 NULL 분기 폴백), '🏢 출판사: {publisher}' 행이 노출된다(v9).
5. 외부 링크(라이선스 URL · 원본 URL)는 `target="_blank"` + `rel="noopener noreferrer"`를 갖는다(v10).
6. 읽기 버튼은 phase-12 자리만 잡으며, 클릭 시 placeholder 또는 404로 처리된다(v11).
7. 모바일 390px에서 AttributionBox는 첫 fold 안에 노출된다(v12).
8. 블랙리스트 4 UUID 직접 접속 시 공통 404 페이지가 렌더된다(v16).
9. Hard Rule 10 — raw HEX 0건(v14).

---

*문서 끝.*
