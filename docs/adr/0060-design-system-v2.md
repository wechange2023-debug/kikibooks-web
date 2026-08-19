# ADR-0060: 디자인 시스템 v2 전면 개정 — 서점 테마(Bookory) 레퍼런스 채택

## Status

**Accepted** (2026-08-19, 팀장 승인) / 기준 HEAD `f0fad59`
최초 제안 2026-08-19 (Proposed)

**진척 (큐 D-2, 2026-08-19)** — D5 실행 순서 **2번 완료**: `docs/design-system.md`를 **v2.0으로
전면 개정**했다. D2의 확정 항목이 모두 해소됐다(컬러 HEX·`Fraunces` 폐기 및 `Gothic A1` 확정·
Type Scale 7종·O-D3 택일·O-D4 대비 검증). 남은 것은 D5의 **3번(토큰 구현) 이후**이며
**큐 D-3** 소관이다.

본 문서는 **결정문만** 담는다. 코드 변경은 큐 D-3에서 수행한다.
**본 ADR과 함께 만들어진 코드 변경은 0건**이다.

**ADR-0002를 supersede**한다. ADR-0002는 삭제하지 않고 `Superseded by ADR-0060` 표기 후
유지한다 — ADR-0002 자신이 `:164`에서 정한 규칙이다.

**`docs/design-system.md:516` 자체 규칙 이행**: *"본 문서의 변경은 ADR-0002의 후속 ADR로
기록한다."* 본 ADR이 그 후속 ADR이다.

## Deciders

팀장, 오케스트레이터

## Related

- **ADR-0002** — supersede 대상. 「Claude Design v0.1 추출본 + 키키북스 보강」 채택 결정
- `docs/design-system.md` — 개정 대상 정본 (520행, 2026-05-13 `54bfab8` 이후 무변경)
- `CLAUDE.md` 2절 **Hard Rule 10**(semantic 토큰 강제) · 5절 라우팅 테이블 `:93-99`
- **ADR-0013 결정 2·3** — CC BY 안내 하한선 / 4요소 완전 표시 의무의 소재
- **ADR-0016** — AttributionBox 행 생성 분기(글 XOR 출판사 · illustrator NULL)
- **ADR-0021** — `(reader)` route group · AppHeader의 몰입 화면 분기
- **ADR-0052 Phase D·F**(오디오 리더) 및 Wave 1.7 F7·F8(ⓘ 팝오버 전환)
- **ADR-0059 O-3 / O-8** — 큐 D가 흡수하는 항목
- **ADR-0061** — 공통 푸터 및 법적 링크 도달성 (같은 리뉴얼 파도, 본 ADR과 병행)
- **큐 D-0 현황 조사**(2026-08-19, 읽기 전용 실측) — 본 ADR의 모든 수치·경로 근거

## Context

### 1. 배경 — 베타 필수 항목

전면 디자인 리뉴얼은 큐 D이며 **베타 필수**다(`docs/ops/schedule-2026-08.md:53`).
팀장이 서점 테마 **"Bookory" 스타일**을 레퍼런스 정본으로 지정했다.

### 2. 현행 정본의 상태 (D-0 실측)

- 정본은 `docs/design-system.md` **1건**이다. **`DESIGN.md`·`design.md`는 실재하지 않는다**
  (대소문자 구분 `find` 각각 0건). 큐 D 착수 메모의 "DESIGN.md 전면 교체"는 파일명 오기이며,
  실제 대상은 `docs/design-system.md`다.
- 20,225 B / 520행. 마지막 커밋 `54bfab8`(2026-05-13) 이후 **무변경**.
- 담고 있는 것: 컬러 §1.1~1.8 · 타이포 §2 · 간격 §3 · radius §4 · shadow §5 ·
  컴포넌트 원칙 §6 · 키키 특화 §7(AttributionBox·Reader·Celebrate·Streak) ·
  타겟 톤 §8 · 다크모드 정책 §9 · Tailwind 매핑 §10.
- **화면 명세는 담고 있지 않다** — Screen 01~05 명세는 `docs/intent/screen-XX-*.md` 소관이며
  본 개정의 범위 밖이다.

### 3. 문서-구현 불일치 3건 (D-0 실측)

v1.0 문서가 정의했으나 **구현이 존재하지 않는** 토큰군이다.

| # | 문서 | 구현 실측 |
|---|---|---|
| 1 | §3.1 `--space-0` ~ `--space-16` 12종 | CSS 변수 정의 **0건** (`--space-` 전역 grep 0건). `tailwind.config.ts:71-77`이 `7`/`10`/`12`/`16` 4개만 확장 |
| 2 | §4.1 `--radius-*` 7종 | CSS 변수 정의 **0건**. `tailwind.config.ts:78-85`가 리터럴 px를 직접 박제. `--radius-none`(사용 금지) 미반영 |
| 3 | §2.2 Type Scale 11종(h1~overline) | `fontSize` 확장 **0건** (grep 0건), `--text-*` 변수 **0건**. 각 화면이 Tailwind 기본 `text-sm`/`text-xs`를 임의 사용 |

부가 — §10.1 예시는 `colors.primary`를 `{DEFAULT, hover}` 중첩 객체로 제시하나,
실제 구현은 평면 키 `primary`/`primary-hover`다(`tailwind.config.ts:15-16`).

**Hard Rule 10 위반은 실질 0건**이다. 실제 raw hex 출현은 `app/opengraph-image.tsx:33,46,68,78`
(satori 렌더러라 CSS 변수 불가)와 `components/auth/google-button.tsx:16-28`(구글 브랜드 로고 SVG)
뿐이며, 나머지는 전부 주석이다. 즉 v1.0의 semantic 토큰 강제는 **지켜지고 있다** —
개정은 규율 실패의 시정이 아니라 **디자인 언어 교체**다.

### 4. 현행 토큰 정의 위치 (v2 작업의 편집 대상)

| 토큰군 | 파일:라인 |
|---|---|
| 컬러 · elevation · `--font-mono` | `app/globals.css:10-72` |
| 다크모드 라이트 강제 | `app/globals.css:75-79` |
| Tailwind 컬러 매핑 | `tailwind.config.ts:13-65` |
| fontFamily | `tailwind.config.ts:66-70` |
| spacing | `tailwind.config.ts:71-77` |
| borderRadius | `tailwind.config.ts:78-85` |
| boxShadow | `tailwind.config.ts:86-92` |
| easing (`kiki`, `kiki-bounce`) | `tailwind.config.ts:93-97` |
| `--font-display` / `--font-body` 주입 | `app/layout.tsx:10-22`, `:52` |

## Decision

### D1 — `docs/design-system.md`를 **경로 유지 + 전면 개정**한다 (v2.0)

새 파일을 만들지 않는다. 경로를 유지하는 이유는 `CLAUDE.md` 5절 라우팅 테이블 6개 행
(`:93`·`:94`·`:95`·`:96`·`:97`·`:99`)이 이 경로를 참조하기 때문이다 — 경로를 바꾸면
라우팅 테이블과 Hard Rule 10(`CLAUDE.md:48`)을 동시에 고쳐야 한다.

문서 버전은 **v2.0**으로 올리고 §변경 이력에 행을 추가한다.

### D2 — 새 디자인 언어의 방향 (확정값은 v2 본문에서)

레퍼런스에서 추출한 **방향**만 본 ADR이 고정하고, **정확한 값은 `design-system.md` v2가
확정**한다. 본 ADR은 HEX를 박제하지 않는다.

**a. 컬러**

- 주조: **딥 그린 계열**
- 포인트(CTA): **오렌지레드 계열**
- 베이스: **화이트**
- 보조: **퍼플 · 머스터드**
- 정확한 HEX와 `--color-primary`/`secondary`/`tertiary`/`accent-*`로의 시맨틱 매핑,
  그리고 §1.8 자녀 레벨 1~5 매핑의 재배정은 **v2 확정 항목**이다.
- 제약: 레벨 매핑의 **빨강 계열 금지**(부정 신호 회피, v1.0 §1.8) 원칙은 유지한다.
  포인트 컬러가 오렌지레드로 이동하므로 **레벨 색과 CTA 색의 충돌 여부를 v2에서 검증**한다.

**b. 타이포**

- 방향: **굵은 산세리프 헤드라인 + 가벼운 본문**
- **현행 `Fraunces`(세리프 display) 유지/교체 여부는 v2 확정 항목**이다.
  교체 시 `app/layout.tsx:10-22`의 `next/font` 선언과 `fallback` 배열을 함께 개정한다.
  한글 폴백 `Pretendard`는 유지한다.
- v1.0 §2.3의 **ExtraBold(800) 사용 금지**(한글 자모 충돌)는 유지한다 —
  "굵은 헤드라인"의 상한은 **700**이다.

**c. 형태**

- **pill 버튼**, **큰 라운딩 카드**. v1.0 §4.2가 이미 Button=`pill`, Card=`radius-md`(16px)로
  두었으므로 방향은 연속이며, 카드 라운딩 상향 폭이 v2 확정 항목이다.
- v1.0 §0 원칙 2 **"직각 컨테이너 금지, 최소 8px"** 는 유지한다.

**d. 레이아웃 패턴**

- 풀폭 히어로 → 카테고리 캐러셀 → 프로모/섹션 카드 그리드
- 섹션 타이틀 + 우측 **"전체 보기" pill**

**e. 각색 원칙 (레퍼런스는 커머스 테마다)**

- **커머스 요소 전량 배제**: 장바구니 · 가격 · 벤더 · 위시리스트 카운터 · 재고 ·
  판매지표성 별점
- **3~7세 대상 상향**: 터치 타깃과 글자 크기를 레퍼런스보다 키운다.
  구체 수치는 v2가 확정하되, v1.0 §8.3의 접근성 기본값을 하한으로 삼는다.
- v1.0 §0 원칙 3 **"유아 콘텐츠는 여백 1.25배"** 는 유지한다.

### D3 — 변경 불가 요소 (회귀 체크리스트 원천)

아래는 **디자인 재량 밖**이다. v2 문서와 구현 어느 쪽도 이를 축소할 수 없으며,
리뉴얼 검수 체크리스트는 본 절을 그대로 항목화한다.

**a. 어트리뷰션 표시 — CC BY 4.0 법적 의무**

`components/book/attribution-box.tsx`가 `lib/book/attribution.ts:69-125`
`buildAttributionRows`의 산출 행을 **하나도 빠뜨리지 않고** 렌더해야 한다.
`app/(reader)/book/[id]/page.tsx:128`은 **조건부가 아니며**, 조건부로 바꿀 수 없다.

> **실측 주의 — "4요소"의 정확한 현행 동작.** D-0 실측 결과 4요소가 모두 무조건은 아니다.
>
> - 라이선스+링크(`:107-114`) · 원본 URL(`:116-122`) — **항상**
> - 저작자 — **조건부**. `book.author` 존재 시에만 렌더되고, `gdl`이면 출판사 행으로
>   대체된다(`:82-96`). author NULL이면 두 행 모두 생략된다(`:23-25` 주석 — GDL 842권 중
>   540권 NULL). 이는 ADR-0016 결정 1·2로 승인된 기존 동작이다.
> - 제목 — AttributionBox **밖**. `BookCoverHero`의 H1이 담당하며
>   "H1 + AttributionBox = 통합 어트리뷰션 단위"다(`attribution.ts:14-16`).
>
> 따라서 본 항목의 고정 기준은 "4요소 무조건 표시"가 아니라
> **"현행 산출 행을 축소하지 않는다 + H1과 AttributionBox의 인접 배치를 깨지 않는다"** 이다.
> author NULL 코호트의 표시 개선은 **본 ADR의 범위가 아니며**, 필요 시 ADR-0016 개정으로
> 별도 처리한다(→ O-D2).

**b. 오디오 리더 ⓘ 팝오버 도달 경로 유지**

`app/(reader)/book/[id]/read/page.tsx:159-190` 오디오 분기는 상단
`ReaderAttributionBar`를 렌더하지 않고 `AudioReader` 헤더 **ⓘ 팝오버**로 어트리뷰션을
제공한다(`:183` `attributionRows={readerPopoverRows}`). 근거는 `:166-168`
(Wave 1.7 F7·F8 — 그림 영역 확장을 위해 세로를 양보하고 **1탭 도달을 보장**).

리뉴얼에서 리더 헤더를 재설계할 때 **이 1탭 경로가 사라지면 CC BY 의무 표면이 소실된다.**
비오디오 경로(`:258` `ReaderAttributionBar` 상시 렌더)도 동일하게 유지한다.

**c. 표지 폴백 6개 표면 유지**

`onError` → 색 블록 + `BookOpen` 아이콘 + 제목. `book.id` 기반 결정적 색 선택.

| 표면 | 파일:라인 |
|---|---|
| 라이브러리 카드 (마이페이지도 재사용) | `components/library/library-browser.tsx:136`·`:163` |
| 책 상세 히어로 | `components/book/book-cover-hero.tsx:63`·`:84` |
| 홈 추천 | `components/home/recommendation-list.tsx:39`·`:91` |
| 랜딩 표지 | `components/landing/book-cover-card.tsx:35`·`:77` |
| 쇼케이스 | `app/showcase/showcase-book-card.tsx:38-52`·`:61` |
| 관리자 책 목록 | `components/admin/books/admin-books-browser.tsx:198-221` |

카드 마크업을 전면 교체할 때 `useState(imageError)` + `onError` 쌍이 누락되기 쉽다.
뷰어 내부는 형태가 다르며 그대로 둔다(`asb-reader.tsx:137` 자기 자리만 비움 ·
`audio-reader.tsx:202` `phase='failed'`).

**d. 라이트 모드 강제 정책 유지 (§9)**

`app/globals.css:75-79`의
`@media (prefers-color-scheme: dark) { :root { color-scheme: light } }` 를 유지한다.
다크 팔레트를 v2에서 신설하지 않는다.
v1.0 §9의 재검토 트리거(**학부모 요청 10건+**, Phase 2)는 그대로 승계한다.

### D4 — 문서-구현 불일치 3건 해소를 v2 범위에 포함한다

v2의 작성 원칙은 **"문서에 적힌 것 = 구현된 것"** 이다. 구현 없는 토큰을 문서에 남기지
않으며, 반대로 구현에만 있는 값을 문서 밖에 두지 않는다.

1. **Type Scale** — `tailwind.config.ts`에 `fontSize` 확장을 **신설**한다. v2 §2.2의 각 역할
   (h1~overline 또는 v2가 재정의한 스케일)이 Tailwind 클래스로 1:1 대응해야 한다.
2. **`--space-*`** — CSS 변수로 실제 정의하거나, 또는 **Tailwind spacing 단일 경로로 일원화**하고
   문서에서 CSS 변수 표기를 제거한다. **둘 중 하나를 v2에서 택일**한다(두 표기 병존 금지).
3. **`--radius-*`** — 위와 동일 기준으로 택일한다. 현행은 Tailwind 리터럴 단일 경로이므로
   문서를 구현에 맞추는 쪽이 변경량이 적다.

§10.1의 Tailwind 예시 코드블록도 실제 `tailwind.config.ts` 형태(평면 키)로 정정한다.

### D5 — 실행 순서

1. 본 ADR 승인 (Proposed → Accepted)
2. `docs/design-system.md` v2 전면 개정 — **컬러 HEX·타이포·스케일 확정**
3. `app/globals.css` · `tailwind.config.ts` · `app/layout.tsx` 토큰 교체
4. 화면 리뉴얼 (Screen 01~05 + 마이페이지 P2)
5. D3 회귀 체크리스트 검수 — **팀장 브라우저 육안 승인**

2번이 끝나기 전에는 3번 이후를 시작하지 않는다 — v1.0에서 토큰이 문서보다 앞서 나간 결과가
§Context 3의 불일치 3건이다.

## Alternatives

| 대안 | 장점 | 단점 | 선택 |
|---|---|---|---|
| (a) `design-system.md` 경로 유지 + 전면 개정 | 라우팅 테이블·Hard Rule 10 무변경. 변경 이력이 한 파일에 축적 | 큰 diff 1회 | ✅ **채택** |
| (b) `design-system-v2.md` 신규 파일 + 구본 보존 | 구·신 비교 용이 | `CLAUDE.md` 6개 행 + Hard Rule 10 동시 개정 필요. 두 정본 병존 위험 | ✗ |
| (c) v1.0 부분 개정(컬러만 교체) | 최소 변경 | 레퍼런스의 레이아웃·타이포·형태 언어를 담을 수 없음. 큐 D의 "전면"과 불일치 | ✗ |
| (d) 불일치 3건을 별도 큐로 분리 | 본 개정 범위 축소 | 같은 파일을 두 번 연다. v2가 또 "문서만 있는 토큰"을 남김 | ✗ |

## Consequences

**긍정**

- 레퍼런스 기반이라 팀장 육안 승인의 기준이 명확하다(주관 논쟁 축소).
- 불일치 3건이 해소되어 v2 이후 화면 작업이 문서만 보고 진행 가능해진다.
- D3이 회귀 체크리스트 원천이 되어 법적 의무 표면의 소실을 구조적으로 막는다.

**부정**

- 전 화면 리뉴얼이므로 diff가 크고, 회귀 표면이 넓다(특히 D3-c 6개 표면).
- ADR-0002가 Superseded되면 `CLAUDE.md:98`(「디자인 시스템·토큰 변경」 행)이
  Superseded ADR을 가리키게 된다 → **O-D1**.
- `Fraunces` 교체 시 `next/font` 재선언으로 폰트 로딩 특성이 바뀔 수 있다.

## Non-goals

- **화면 명세(`docs/intent/screen-XX-*.md`) 개정** — 별도 문서 소관.
- **다크 모드 도입** — D3-d로 명시 배제.
- **어트리뷰션 정책 변경** — ADR-0013·0016 소관. 본 ADR은 표시 회귀만 막는다.
- **`author` NULL 코호트 표시 개선** — ADR-0016 개정 사안(O-D2).
- **커머스 기능** — 레퍼런스에 있으나 D2-e로 배제.

## Open Questions

- **O-D1**: `CLAUDE.md:98` 「디자인 시스템·토큰 변경」 행이 `docs/adr/0002-design-system.md`를
  명시한다. ADR-0002가 Superseded되어도 문서는 유지되므로 **링크가 깨지지는 않으나**,
  최신 결정이 아닌 ADR을 가리키게 된다. 본 ADR 승인 시 이 행을 `0060`으로 갱신할지
  팀장 결정이 필요하다. 나머지 6개 행(`:93`~`:97`, `:99`)은 경로 불변이라 **변경 불요**다.
  → 큐 D-1 지시서의 "라우팅 테이블 변경 불요" 판단은 **6행 중 5행에 대해 성립**하며,
  `:98` 1행이 예외다.
- **O-D2**: `book.author` NULL 코호트(GDL 842권 중 540권)에서 저작자 행이 생략되는 현행
  동작을 v2 디자인에서 어떻게 보일지. `attribution_text` 컬럼에는 표준 포맷이 박제돼 있어
  **어트리뷰션 의무 자체는 충족**된다(`lib/book/attribution.ts:23-25`). 표시 개선은
  ADR-0016 개정 사안이며 베타 차단이 아니다.
- **O-D3**: D4-2·D4-3의 택일(`--space-*`/`--radius-*`를 CSS 변수로 실제 정의할지,
  Tailwind 단일 경로로 일원화할지). v2 작성 시점에 확정한다.
- **O-D4**: 오렌지레드 CTA와 §1.8 레벨 색(현행 Level 4 `#FF6FA8` 핑크 등)의 충돌 여부.
  v2 팔레트 확정 시 대비 검증이 필요하다.

---

*문서 끝. 본 ADR의 변경은 신규 ADR로 작성하고, 본 문서는 "Superseded by ADR-XXXX" 표시 후 유지한다.*
