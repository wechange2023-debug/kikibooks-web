# Hello Kiki Design System (design-system.md)

> **이 문서의 역할**: Hello Kiki 모든 화면 구현 작업의 시각적 단일 진실 공급원(Single Source of Truth).
> Claude Code는 화면 작업 시 본 문서를 **`docs/intent/screen-XX-*.md`와 함께 반드시 참조**한다.

**문서 버전** v2.0 (서점 테마 Bookory 레퍼런스 기반 전면 개정)
**최종 갱신** 2026-08-19
**상위 참조** `CLAUDE.md` 5절(라우팅), `docs/adr/0060-design-system-v2.md`
**연동 문서** `docs/guidelines/license-rules.md`(AttributionBox 규칙), `docs/adr/0061-global-footer-legal-links.md`(푸터)

> **v2 작성 원칙 — "문서에 적힌 것 = 구현될 것".**
> 구현되지 않을 토큰은 이 문서에 쓰지 않는다. v1.0은 `--space-*`·`--radius-*`·Type Scale
> 11종을 정의했으나 **구현이 0건**이었다(ADR-0060 §Context 3). v2는 그 실패를 반복하지 않는다.
> 본 문서의 모든 값은 **`app/globals.css` 또는 `tailwind.config.ts`에 실제로 들어갈 값**이다.

---

## 0. 핵심 원칙 (Design Tenets)

1. **따뜻함 우선**: 순흑(#000) 대신 따뜻한 차콜, 차가운 회색 대신 크림·갈색 톤
2. **둥근 모서리는 비협상**: 직각 컨테이너 금지. 모든 박스는 최소 12px radius
3. **유아 콘텐츠는 여백 1.25배**: 일반 SaaS 대비 답답함 회피
4. **부모 단독 영역은 가독성 우선**: 결제·약관·리포트는 귀여움보다 명료함
5. **★ 접근성은 사후 검증이 아니라 토큰의 전제**: 본 문서의 모든 색 조합은 §1.9 대비표에서
   WCAG AA를 통과한 것만 쓴다. 통과하지 않은 조합은 토큰으로 존재하지 않는다

---

## 1. 컬러 토큰

**팔레트 방향(ADR-0060 D2-a)**: 딥 그린 주조 + 오렌지레드 CTA + 화이트/웜크림 베이스 +
퍼플·머스터드 보조.

> **★ v1.0 대비 가장 큰 변경 — 주조색과 CTA색이 분리됐다.**
> v1.0은 `primary`(코랄) 하나가 브랜드색이자 CTA색이었다. v2는 **`primary`(딥 그린) = 브랜드·
> 구조색**, **`cta`(오렌지레드) = 행동 유도 전용**으로 나눈다.
> 이에 따라 v1.0 §1.4의 *"accent는 카테고리 전용, CTA 사용 금지"* 규칙은 **폐기**한다 —
> CTA 토큰이 독립했으므로 금지 규칙이 불필요하다.

### 1.1 Primary (딥 그린 — 브랜드·구조)

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-primary` | `#1F4A3D` | 헤더·푸터 바탕, 브랜드 마크, 섹션 강조, 진행률 fill |
| `--color-primary-hover` | `#2C6553` | primary 표면 위 hover/pressed |
| `--color-on-primary` | `#FFFFFF` | primary 배경 위 텍스트·아이콘 |
| `--color-primary-container` | `#DCEDE6` | primary 계열 약한 배경(태그·영역 강조) |
| `--color-on-primary-container` | `#102C23` | primary container 위 텍스트 |

### 1.2 CTA (오렌지레드 — 행동 유도 전용)

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-cta` | `#CE3D1A` | **메인 CTA 버튼**("읽기 시작"), 활성 탭 인디케이터 |
| `--color-cta-hover` | `#B5320F` | CTA hover/pressed |
| `--color-on-cta` | `#FFFFFF` | CTA 배경 위 텍스트 |
| `--color-cta-container` | `#FDE4DB` | CTA 계열 약한 배경(뱃지·하이라이트) |
| `--color-on-cta-container` | `#5A1A08` | CTA container 위 텍스트 |

> **`#F0532D` → `#CE3D1A` 조정 사유**: 레퍼런스 시작값 `#F0532D`는 흰 글자 대비 **3.51:1**로
> WCAG AA(4.5:1) **미달**이다(§1.9). CTA 라벨은 16px semibold라 AA Large(3:1) 예외에
> 해당하지 않는다. 같은 색상 계열에서 AA를 만족하는 최소 조정값이 `#CE3D1A`(4.88:1)다.
> ADR-0060 O-D4 이행.

**CTA 사용 규칙**: 한 화면에 **CTA 버튼은 1개**를 원칙으로 한다. 보조 행동은 `primary`
아웃라인 버튼 또는 텍스트 버튼을 쓴다. CTA가 흔해지면 CTA가 아니게 된다.

### 1.3 Accent (프로모·카테고리 카드)

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-accent-purple` | `#6B5DD8` | 프로모 카드, 정보형 섹션, 판타지 카테고리 |
| `--color-accent-mustard` | `#F5B841` | 보상·스트릭·축하 모먼트, 추천 배너 |
| `--color-on-accent-mustard` | `#3A2B08` | **머스터드 위 텍스트 전용** |

> **★ 머스터드에는 흰 글자를 쓰지 않는다.** `#FFFFFF`/`#F5B841` = **1.78:1**로 AA에 크게
> 미달한다. 머스터드 표면의 텍스트는 반드시 `--color-on-accent-mustard`를 쓴다.
> **`#7C6FE4` → `#6B5DD8` 조정 사유**: 레퍼런스 시작값은 흰 글자 대비 **4.00:1**로 AA 미달.
> 조정값은 5.02:1.

### 1.4 Background / Surface

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-bg` | `#FFFFFF` | 앱 기본 배경 |
| `--color-surface` | `#FFFFFF` | 카드·모달·시트 |
| `--color-surface-2` | `#FBF7F0` | **웜 크림** — 보조 표면(섹션 바탕, 입력 필드, 페이지 바탕) |
| `--color-surface-3` | `#F3EDE1` | 최저 강조 표면, 캐러셀 트랙 |
| `--color-outline` | `#E4DBCB` | **장식용** 1px 구분선 |
| `--color-outline-strong` | `#8C7C64` | **폼 컨트롤 경계** — 입력·체크박스·토글 |

> **★ `outline`과 `outline-strong`을 혼동하지 말 것.** WCAG 1.4.11(비텍스트 대비)은 사용자가
> 식별해야 하는 **UI 컴포넌트 경계**에 3:1을 요구한다. `outline`(#E4DBCB)은 흰 배경 대비
> **1.37:1**이라 이 기준을 만족하지 않으므로 **장식용 구분선에만** 쓴다.
> 입력 필드처럼 경계 자체가 컴포넌트를 식별시키는 곳은 `outline-strong`(4.05:1)을 쓴다.

### 1.5 Text

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-text` | `#1A1D1B` | 본문 기본 (순흑 대신 따뜻한 차콜) |
| `--color-text-variant` | `#5A635E` | 보조 텍스트·메타데이터·placeholder |
| `--color-text-disabled` | `rgba(26, 29, 27, 0.38)` | 비활성 상태 |
| `--color-text-inverse` | `#FFFFFF` | 어두운 컬러 배경 위 텍스트 |

`--color-text-disabled`는 대비 기준 적용 대상이 아니다(WCAG 1.4.3 비활성 컴포넌트 예외).
단 **비활성 상태를 색으로만 알리지 않는다** — `disabled` 속성·아이콘을 함께 쓴다.

### 1.6 시맨틱 (상태)

| 토큰 | HEX | 위 텍스트 | 용도 |
|---|---|---|---|
| `--color-success` | `#2C6553` | `text-inverse` | 완료·정답·저장 성공 |
| `--color-warning` | `#F5B841` | `on-accent-mustard` | 주의·사용량 알림 |
| `--color-error` | `#B3261E` | `text-inverse` | 입력 오류·실패 |
| `--color-info` | `#6B5DD8` | `text-inverse` | 안내 메시지 |

> `error`(#B3261E)와 `cta`(#CE3D1A)는 **다른 토큰이다.** 오류 표시에 CTA색을 쓰지 않고,
> CTA에 오류색을 쓰지 않는다. 두 색은 육안으로 가까우므로 **아이콘·문구를 반드시 동반**한다.

### 1.7 자녀 레벨 매핑

`children.current_level`(1~5)에 대응한다. 책 표지 테두리, 레벨 선택 바, 추천 책 라벨에 쓴다.

| 레벨 | 스트로크/도트 | 라벨 배경(container) | 의미 |
|---|---|---|---|
| Level 1 (입문) | `--level-1` `#3B8A63` | `--level-1-container` `#DDF0E5` | 새싹 |
| Level 2 | `--level-2` `#2F87B7` | `--level-2-container` `#DCEDF7` | 하늘 |
| Level 3 (중간) | `--level-3` `#A9761A` | `--level-3-container` `#FBEBCB` | 햇살 |
| Level 4 | `--level-4` `#C9527E` | `--level-4-container` `#FBE0EA` | 꽃 |
| Level 5 (마스터) | `--level-5` `#6B5DD8` | `--level-5-container` `#E5E1FA` | 별 |

**사용 규칙 (v2 신설 — 실측 결과 반영)**

1. **`--level-N`은 스트로크·도트·바 전용이다. 텍스트 배경으로 쓰지 않는다.**
   레벨 1~4는 흰 글자 대비가 3.96~4.21:1로 **AA(4.5) 미달**이기 때문이다(§1.9).
2. **레벨 라벨은 `--level-N-container` 배경 + `--color-text` 글자** 조합을 쓴다
   (13.3~14.5:1로 전부 통과).
3. **빨강 계열 금지** 유지 — 부정 신호 회피(v1.0 승계).
4. **★ CTA 오렌지레드 계열 금지** (v2 신설) — 레벨 색이 CTA로 오인되면 아이가 잘못 누른다.
   Level 3은 v1.0의 노랑 대신 **앰버(`#A9761A`)** 로 내려 3:1을 확보하면서 오렌지와도 구분했다.
5. 레벨은 색만으로 전달하지 않는다 — 숫자 또는 라벨을 반드시 병기한다(색각 이상 대응).

### 1.8 v1.0 → v2.0 토큰 대응표

| v1.0 | v2.0 | 비고 |
|---|---|---|
| `primary` `#FF7A45`(코랄, CTA 겸용) | `cta` `#CE3D1A` | **역할 이동** — CTA로 분리 |
| — | `primary` `#1F4A3D` | **신설** — 브랜드·구조색 |
| `secondary` `#2DBE9F` | 폐기 | 역할을 `primary`가 흡수 |
| `tertiary` `#5B7BFF` | `accent-purple` `#6B5DD8` | 정보형 역할 승계 |
| `accent-yellow` `#FFC53D` | `accent-mustard` `#F5B841` | |
| `accent-pink`/`violet`/`green`/`sky` | 폐기 | 레벨 토큰으로 흡수 |
| `outline` `#E8E2D9` | `outline` `#E4DBCB` + `outline-strong` 신설 | **분리** |
| `level-1~5` | 전면 재매핑 | §1.7 |

### 1.9 ★ 대비 검증표 (WCAG 2.1 AA)

**아래 34개 조합 전부 통과 · 미달 0건.** 텍스트는 4.5:1, UI 컴포넌트 경계(1.4.11)는 3:1 기준.
값은 sRGB 상대휘도 기준 계산값이다.

| 조합 | 대비 | 기준 | 판정 |
|---|---|---|---|
| `text` #1A1D1B / `bg` #FFFFFF | **17.00:1** | 4.5 | ✅ |
| `text` / `surface-2` #FBF7F0 | **15.92:1** | 4.5 | ✅ |
| `text` / `surface-3` #F3EDE1 | **14.58:1** | 4.5 | ✅ |
| `text-variant` #5A635E / `bg` | **6.21:1** | 4.5 | ✅ |
| `text-variant` / `surface-2` | **5.82:1** | 4.5 | ✅ |
| `text-variant` / `surface-3` | **5.33:1** | 4.5 | ✅ |
| `on-primary` #FFFFFF / `primary` #1F4A3D | **9.98:1** | 4.5 | ✅ |
| `on-primary` / `primary-hover` #2C6553 | **6.79:1** | 4.5 | ✅ |
| `on-cta` #FFFFFF / `cta` #CE3D1A | **4.88:1** | 4.5 | ✅ |
| `on-cta` / `cta-hover` #B5320F | **6.13:1** | 4.5 | ✅ |
| `on-primary-container` #102C23 / `primary-container` #DCEDE6 | **12.30:1** | 4.5 | ✅ |
| `on-cta-container` #5A1A08 / `cta-container` #FDE4DB | **10.91:1** | 4.5 | ✅ |
| `primary` 텍스트 / `bg` | **9.98:1** | 4.5 | ✅ |
| `cta` 텍스트 / `bg` | **4.88:1** | 4.5 | ✅ |
| `cta` 텍스트 / `surface-2` | **4.57:1** | 4.5 | ✅ |
| `text-inverse` / `accent-purple` #6B5DD8 | **5.02:1** | 4.5 | ✅ |
| `on-accent-mustard` #3A2B08 / `accent-mustard` #F5B841 | **7.73:1** | 4.5 | ✅ |
| `text-inverse` / `success` #2C6553 | **6.79:1** | 4.5 | ✅ |
| `text-inverse` / `error` #B3261E | **6.54:1** | 4.5 | ✅ |
| `error` 텍스트 / `bg` | **6.54:1** | 4.5 | ✅ |
| `on-accent-mustard` / `warning` #F5B841 | **7.73:1** | 4.5 | ✅ |
| `text-inverse` / `info` #6B5DD8 | **5.02:1** | 4.5 | ✅ |
| `outline-strong` #8C7C64 / `surface` ▸UI | **4.05:1** | 3 | ✅ |
| `outline-strong` / `surface-2` ▸UI | **3.79:1** | 3 | ✅ |
| `level-1` #3B8A63 / `surface` ▸UI | **4.20:1** | 3 | ✅ |
| `level-2` #2F87B7 / `surface` ▸UI | **3.98:1** | 3 | ✅ |
| `level-3` #A9761A / `surface` ▸UI | **3.97:1** | 3 | ✅ |
| `level-4` #C9527E / `surface` ▸UI | **4.21:1** | 3 | ✅ |
| `level-5` #6B5DD8 / `surface` ▸UI | **5.02:1** | 3 | ✅ |
| `text` / `level-1-container` #DDF0E5 | **14.30:1** | 4.5 | ✅ |
| `text` / `level-2-container` #DCEDF7 | **14.16:1** | 4.5 | ✅ |
| `text` / `level-3-container` #FBEBCB | **14.45:1** | 4.5 | ✅ |
| `text` / `level-4-container` #FBE0EA | **13.72:1** | 4.5 | ✅ |
| `text` / `level-5-container` #E5E1FA | **13.34:1** | 4.5 | ✅ |

**금지 조합(기록용)** — 아래는 토큰으로 만들지 않는다.

| 조합 | 대비 | 사유 |
|---|---|---|
| `#FFFFFF` / `accent-mustard` #F5B841 | 1.78:1 | 머스터드 위 흰 글자 금지 |
| `#FFFFFF` / `level-1`~`level-4` | 3.96 / 3.98 / 3.97 / 4.21 | 레벨 pill에 흰 글자 금지 |
| `outline` #E4DBCB / `surface` | 1.37:1 | 폼 컨트롤 경계에 사용 금지 |

**색을 바꿀 때의 의무**: 위 표의 조합 중 하나라도 값이 바뀌면 **대비를 다시 계산해 표를
갱신**한다. 계산은 WCAG 2.1 상대휘도 공식을 쓴다.

---

## 2. 타이포그래피

### 2.1 Font Family — **확정**

| 토큰 | 스택 |
|---|---|
| `--font-display` | `"Gothic A1", "Pretendard", system-ui, sans-serif` |
| `--font-body` | `"Plus Jakarta Sans", "Gothic A1", "Pretendard", system-ui, sans-serif` |
| `--font-mono` | `"JetBrains Mono", "D2Coding", ui-monospace, monospace` |

**Display = `Gothic A1`** (next/font/google, 로드 weight **500·700**)
- **`Fraunces` 폐기 확정** — v1.0의 세리프 display를 폐기한다(ADR-0060 D2-b, 팀장 확정).
  레퍼런스의 "굵은 산세리프 헤드라인"과 정면으로 어긋나고, **한글 글리프가 없다.**
- 선정 사유: next/font/google 제공 한글 폰트 중 **weight 100~900 전 구간**을 가진 기하학적
  산세리프. 한글·라틴 모두 한 폰트로 처리해 헤드라인의 서체 혼합이 일어나지 않는다.

**Body = `Plus Jakarta Sans` 유지 + `Gothic A1` 한글 폴백**
- PJS는 라틴 전용이라 **한글 글리프가 없다.** 브라우저는 글리프 단위로 폴백하므로
  **라틴은 PJS, 한글은 Gothic A1**이 렌더된다 — 영어 그림책 서비스에 맞는 조합이다.
- PJS 유지 사유: 라틴 본문 품질이 Gothic A1보다 낫고, 이미 로드 중이라 변경 비용이 0이다.

**후보 실측 (next/font/google `font-data.json`, Next 14.2.35)**

| 후보 | weights | 한글 | 채택 |
|---|---|---|---|
| **Gothic A1** | 100~900 (9종) | ✅ | ✅ **display 채택** |
| Noto Sans KR | 100~900 + variable | ✅ | ✗ 중립적이라 "라운드" 방향과 거리 |
| IBM Plex Sans KR | 100~700 (7종) | ✅ | ✗ 기업체 톤, 유아 대상과 거리 |
| Jua / Do Hyeon / Black Han Sans | **400 단일** | ✅ | ✗ weight 1종이라 스케일 운용 불가 |
| Pretendard | — | — | ✗ **next/font/google 미제공** |

> **★ 실측 경고 — `Pretendard`는 현재 로드된 적이 없다.**
> `app/layout.tsx:14`·`:22`의 `fallback` 배열에 이름만 있을 뿐, `@font-face`도 CDN 링크도
> `public/` 폰트 파일도 **0건**이다. 즉 v1.0에서 한글은 **의도한 서체가 아니라 OS 기본 폰트**
> (Windows 맑은 고딕 등)로 렌더돼 왔다. v2가 `Gothic A1`을 실제 로드해 이 구멍을 막는다.
> `Pretendard`는 ADR-0060 D2-b에 따라 스택에 **남기되**, 로드되는 `Gothic A1` **뒤**에 둔다 —
> 사용자마다 다른 서체로 보이는 것을 막기 위함이다(로컬 설치 여부와 무관하게 동일 렌더).

> **★ D-3 구현 의무 — 한글 웹폰트 용량 측정.**
> 한글 폰트는 unicode-range 청크가 100개 이상으로 쪼개져 제공된다. `subsets` 옵션은
> **preload 대상만** 정한다(`font-data.json`상 Gothic A1의 subsets는 `latin` 뿐이라
> `subsets: ['latin']`로 선언한다). D-3에서 **실제 전송량과 LCP를 측정**하고, 과하면
> `preload: false` + `display: 'swap'`으로 전환한다. 측정 없이 확정하지 않는다.

### 2.2 Type Scale — **7종** (v1.0의 11종에서 축소)

**축소 근거(실측)**: 현행 코드에서 실제 사용 중인 Tailwind 크기 클래스는 8종이며 분포가
극단적으로 치우쳐 있다 — `text-sm` 149회 · `text-xs` 59회 · `text-base` 29회 · `text-2xl` 21회 ·
`text-3xl` 16회 · `text-lg` 15회 · `text-xl` 10회 · `text-4xl` 2회. v1.0의 11종은 절반이
사용된 적이 없다.

| 역할 | Tailwind 키 | Size | Line Height | Weight | Family | 사용처 |
|---|---|---|---|---|---|---|
| Display | `text-display` | 36px | 1.15 (41px) | 700 | display | 풀폭 히어로 타이틀 |
| Heading 1 | `text-h1` | 28px | 1.2 (34px) | 700 | display | 페이지 메인 타이틀 |
| Heading 2 | `text-h2` | 22px | 1.25 (28px) | 700 | display | 섹션 헤더 |
| Heading 3 | `text-h3` | 18px | 1.3 (23px) | 600 | display | 카드 타이틀, 책 제목 |
| Body | `text-body` | **16px** | 1.6 (26px) | 400 | body | **기본 본문 — 최소 크기** |
| Label | `text-label` | 14px | 1.45 (20px) | 500 | body | UI 라벨, 메타데이터 |
| Caption | `text-caption` | **12px** | 1.4 (17px) | 600 | body | 칩·태그·시간 표기 |

**★ 3~7세 대상 상향 (v1.0 대비)**
- 본문 **14px → 16px**. 16px 미만을 본문에 쓰지 않는다.
- 최소 크기 **11px → 12px**. 12px 미만 텍스트는 만들지 않는다.
- 동화 본문(Reader)은 **18px 이상**, line-height **1.6~1.7**.

### 2.3 Font Weight

| Weight | 값 | 사용 |
|---|---|---|
| Regular | 400 | 본문 |
| Medium | 500 | UI 라벨, 보조 강조 |
| Semibold | 600 | 카드 타이틀, 버튼 라벨 |
| Bold | 700 | 헤딩, 숫자(stat), 강한 강조 |
| ExtraBold | 800 | **사용 금지 — 유지** |

> **800 금지 규칙은 v2에서도 유지한다**(ADR-0060 D2-b 명시). 한글 자모가 굵은 무게에서
> 뭉개지고 시각 부담이 크다. **"굵은 산세리프 헤드라인"의 상한은 700**이다.
> 로드하는 weight도 이 표를 넘지 않는다 — Gothic A1은 500·700 **2종만** 로드한다.

---

## 3. 간격(Spacing)

> **★ v2 방식 변경 (ADR-0060 O-D3 확정)**: `--space-*` **CSS 변수 방식을 폐기**한다.
> 간격은 **Tailwind 기본 spacing 스케일 단일 경로**로만 표현한다. 두 표기를 병존시키지 않는다.

### 3.1 스케일 — Tailwind 기본값을 그대로 쓴다

Tailwind의 기본 스케일이 이미 4px 베이스다(`1` = 4px). **`tailwind.config.ts`에 spacing
확장을 추가하지 않는다.**

| Tailwind 클래스 | px | 통상 용도 |
|---|---|---|
| `1` | 4px | 아이콘-텍스트 미세 간격 |
| `2` | 8px | 인라인 요소, 칩 내부 |
| `3` | 12px | 버튼 내부, 작은 카드 패딩 |
| `4` | 16px | 카드 간 gap, 일반 패딩 |
| `5` | 20px | 카드 내부 패딩 |
| `6` | 24px | 섹션 내부 여백 |
| `7` | 28px | 큰 카드 패딩 |
| `8` | 32px | 페이지 좌우 패딩 |
| `10` | 40px | 섹션 사이 |
| `12` | 48px | 페이지 헤더 ↔ 본문 |
| `16` | 64px | 페이지 상단/하단 큰 여백 |

> **실측 기록**: v1.0 시기 `tailwind.config.ts:71-77`은 `7`/`10`/`12`/`16`을
> `28px`/`40px`/`48px`/`64px`로 "확장"했으나, **Tailwind 기본값과 완전히 동일**하다
> (`1.75rem`=28px, `2.5rem`=40px, `3rem`=48px, `4rem`=64px). **아무 효과가 없는 확장이므로
> D-3에서 삭제한다.**

### 3.2 컴포넌트 내부 padding

| 컴포넌트 | Padding | 최소 높이 |
|---|---|---|
| Button (sm) | `px-4 py-2.5` | **44px** |
| Button (md, 기본) | `px-6 py-3` | **48px** |
| Button (lg, CTA) | `px-8 py-4` | **56px** |
| Input / Search bar | `px-6` | **52px** |
| Chip | `px-4` | **40px** |
| Card (sm) | `p-4` | — |
| Card (md, 기본) | `p-5` | — |
| Card (lg, hero) | `p-7` | — |
| Modal | `p-7`~`p-8` | — |
| Page container | `px-4 py-5` (모바일) / `px-8` (데스크탑) | — |
| **AttributionBox (★)** | `px-5 py-4` | — |

### 3.3 컴포넌트 간 margin

| 관계 | 간격 |
|---|---|
| 같은 그룹 내 요소 | `gap-2`~`gap-3` (8~12px) |
| 섹션 헤더 ↔ 컨텐츠 | `gap-4` (16px) |
| 섹션 ↔ 다음 섹션 | `gap-8`~`gap-10` (32~40px) |
| 페이지 헤더 ↔ 첫 섹션 | `gap-5`~`gap-6` (20~24px) |

---

## 4. Border Radius

> **★ v2 방식 변경 (ADR-0060 O-D3 확정)**: `--radius-*` CSS 변수를 만들지 않는다.
> `tailwind.config.ts`의 `borderRadius` 확장 키 **단일 경로**로만 표현한다.

### 4.1 스케일 — **5종** (레퍼런스의 "큰 라운딩" 반영)

| Tailwind 키 | 값 | v1.0 | 사용 |
|---|---|---|---|
| `rounded-sm` | 12px | 12px | 작은 칩, 인디케이터, 표지 썸네일 |
| `rounded-md` | **20px** | 16px | **카드 기본** (상향) |
| `rounded-lg` | **28px** | 24px | 큰 카드, 카테고리 타일 (상향) |
| `rounded-xl` | **36px** | 28px | 히어로, 모달 컨테이너 (상향) |
| `rounded-pill` | 9999px | 9999px | 버튼, 칩, 검색바, "전체 보기" |

**v1.0 `rounded-xs`(8px)는 폐기한다** — 실측 사용 **0건**이다.
**`rounded-none`은 정의하지 않는다** — §0 원칙 2(직각 금지)와 충돌한다.

> **실측 기록 및 D-3 정리 대상**: 현행 사용 빈도는 `rounded-md` 83회 · `rounded-pill` 67회 ·
> `rounded-lg` 17회 · **`rounded-full` 6회** · `rounded-xl` 4회 · `rounded-sm` 1회다.
> `rounded-full`은 Tailwind 기본 키로 `pill`과 값이 같다 — **D-3에서 `rounded-pill`로 통일**한다.

### 4.2 컴포넌트별 적용

| 컴포넌트 | Radius |
|---|---|
| CTA / Primary / Secondary Button | `pill` |
| Icon Button (정사각) | `md` |
| Input · Search bar | `pill` |
| Chip / Tag | `pill` |
| **"전체 보기" 링크 (★)** | `pill` |
| Book Card | `md` (20px) |
| Book cover image | `sm` (12px) |
| Category tile / 캐러셀 아이템 | `lg` (28px) |
| **Hero (풀폭) (★)** | `xl` (36px) |
| Promo Card | `lg` |
| Modal | `xl` |
| **AttributionBox (★)** | `md` |
| **Reader 페이지 컨테이너 (★)** | `lg` |

---

## 5. Shadow / Elevation

> **★ v2 방식 변경**: CSS 변수를 거치지 않고 `tailwind.config.ts`의 `boxShadow` 확장에
> **리터럴 값**을 직접 둔다(§3·§4와 동일 원칙).

### 5.1 단계 정의

그림자 색은 **따뜻한 갈색 톤**(20,15,10)을 유지한다 — 회색 그림자는 크림 배경에서 탁해진다.

| Tailwind 키 | 값 |
|---|---|
| `shadow-elev-1` | `0 1px 2px rgba(20,15,10,.06), 0 2px 6px rgba(20,15,10,.04)` |
| `shadow-elev-2` | `0 4px 12px rgba(20,15,10,.08), 0 1px 3px rgba(20,15,10,.06)` |
| `shadow-elev-3` | `0 8px 20px rgba(20,15,10,.10), 0 2px 6px rgba(20,15,10,.06)` |
| `shadow-elev-cta` | `0 12px 28px rgba(206,61,26,.22), 0 4px 10px rgba(20,15,10,.06)` |
| `shadow-elev-modal` | `0 30px 80px rgba(20,15,10,.18), 0 8px 24px rgba(20,15,10,.10)` |

`elev-pop`(v1.0)은 **`elev-cta`로 개명**했다 — 발광색이 코랄(`#FF7A45`)에서 CTA
오렌지레드(`#CE3D1A`)로 바뀌었고, 용도가 CTA 버튼 전용임을 이름에 담았다.

### 5.2 사용 규칙

| 표면 | Elevation |
|---|---|
| 페이지 바탕 | 없음 |
| Book Card (기본) | `elev-1` |
| Book Card (hover) | `elev-2` |
| Hero / Promo Card | `elev-2` |
| CTA 버튼 | `elev-cta` |
| Dropdown / Popover | `elev-3` |
| Modal / Bottom sheet | `elev-modal` |

그림자로 계층을 3단계 넘게 쌓지 않는다. 더 필요하면 배경색(`surface-2`/`surface-3`)으로 나눈다.

---

## 6. 컴포넌트 원칙

### 6.1 Button

- **모든 버튼은 `pill`**이다. 사각 버튼을 만들지 않는다.
- 위계: **CTA**(`cta` 채움) → **Primary**(`primary` 채움) → **Secondary**(`primary` 외곽선)
  → **Text**(글자만).
- 한 화면에 CTA 채움 버튼은 **1개**(§1.2).
- **최소 터치 타깃 44×44px** — 아이콘 버튼도 예외 없다(§6.5).
- 라벨은 `text-label` 이상, weight 600.

### 6.2 Card

- 기본 radius `md`(20px), `surface` 배경, `elev-1`.
- hover 시 `elev-2` + `translate-y-[-2px]`, transition 200ms `ease-kiki`.
- 책 카드는 **표지 3:4 비율**을 유지하고, 표지 실패 시 §7.3 폴백을 쓴다.
- **커머스 요소를 넣지 않는다** — 가격, 장바구니, 벤더/판매자, 재고, 위시리스트 카운터,
  판매지표성 별점. 레퍼런스가 커머스 테마이므로 각색 시 특히 주의한다(ADR-0060 D2-e).

### 6.3 ★ 섹션 헤더 + "전체 보기" (신규 패턴)

레퍼런스의 핵심 레이아웃 관용구다.

```
[ 섹션 타이틀 (text-h2) ]              [ 전체 보기 → (pill) ]
[ 콘텐츠: 캐러셀 또는 그리드 ]
```

- 좌측 타이틀 `text-h2`, 우측 링크는 **`pill` 형태**(`primary` 외곽선 또는
  `primary-container` 채움), `text-label`.
- 타이틀과 콘텐츠 사이 `gap-4`, 섹션 간 `gap-8`~`gap-10`.
- 우측 링크는 **44px 높이**를 확보한다.

### 6.4 ★ 풀폭 히어로 / 카테고리 캐러셀 (신규 패턴)

**풀폭 히어로**
- 뷰포트 폭 전체, radius `xl`(36px), 좌우 `px-4`(모바일)/`px-8`(데스크탑) 안쪽 여백.
- 배경은 `primary` 또는 `accent-purple` 채움. 위 텍스트는 `text-inverse`.
- CTA 버튼 1개를 포함한다.

**카테고리 캐러셀**
- 가로 스크롤. 아이템 radius `lg`(28px), 트랙 배경 `surface-3`.
- **스크롤 스냅**을 쓰고, 터치 드래그와 키보드 화살표를 모두 지원한다.
- 아이템 최소 폭은 표지 3:4 비율 기준 **120px 이상**(작은 손가락 기준).
- 캐러셀만으로 콘텐츠에 도달하게 하지 않는다 — 항상 "전체 보기" 경로를 병기한다(§6.3).

### 6.5 ★ 터치 타깃 · 가독성 하한 (3~7세 대상)

| 항목 | 하한 | 근거 |
|---|---|---|
| 터치 타깃 | **44 × 44px** | WCAG 2.5.5 / 유아 소근육 |
| 인접 타깃 간격 | **8px 이상** | 오터치 방지 |
| 본문 글자 | **16px** | §2.2 |
| 최소 글자 | **12px** | §2.2 |
| 아이가 조작하는 버튼 | **48px 이상 권장** | 리더 페이지 넘김 등 |

**정보를 색만으로 전달하지 않는다** — 레벨·상태·오류는 아이콘 또는 텍스트를 병기한다.

### 6.6 Icon / Illustration

- 아이콘은 **선(stroke) 스타일**, 굵기 2px, 라운드 캡. 크기 20/24/28px.
- 일러스트는 §1의 팔레트 안에서 그린다. **일러스트와 차트는 raw value 예외**다(Hard Rule 10).

---

## 7. ★ 키키 특화 — 변경 불가 요소 (ADR-0060 D3 승계)

**본 절은 디자인 재량 밖이다.** 리뉴얼 검수 체크리스트의 원천이며, v2 어느 항목도 이를
축소할 수 없다.

### 7.1 AttributionBox — CC BY 4.0 법적 의무

- `components/book/attribution-box.tsx`는 `lib/book/attribution.ts`
  `buildAttributionRows`의 **산출 행을 하나도 빠뜨리지 않고** 렌더한다.
- `app/(reader)/book/[id]/page.tsx:128`은 **조건부 렌더가 아니며**, 조건부로 바꿀 수 없다.
- **H1(BookCoverHero) ↔ AttributionBox 인접 배치를 깨지 않는다** — 둘이 합쳐
  "통합 어트리뷰션 단위"를 이룬다.
- 고정 기준은 **"현행 산출 행 비축소 + H1 인접 유지"** 다. `book.author`가 NULL이면 글·출판사
  행이 생략되는 것은 **ADR-0016으로 승인된 기존 동작**이며 위반이 아니다.

**토큰**: 컨테이너 `surface-2` + `outline` 1px + `rounded-md` + `px-5 py-4` /
라벨 `text-label` 600 `text` / 값 `text-caption` `text-variant` /
외부 링크 `accent-purple` + hover underline / 라이선스 배지 `pill` +
`level-5-container` 배경 + `text` 글자.

### 7.2 Reader (책 뷰어) — 어트리뷰션 도달 경로

- **비오디오 경로**: 상단 `ReaderAttributionBar` **상시 렌더** 유지
  (`app/(reader)/book/[id]/read/page.tsx:258`).
- **오디오 경로**: 상단 바 대신 `AudioReader` 헤더의 **ⓘ 팝오버**로 어트리뷰션을 제공한다
  (`:183`). **이 1탭 도달 경로가 사라지면 CC BY 의무 표면이 소실된다.**
  리더 헤더를 재설계할 때 최우선 확인 항목이다.

**토큰**: 리더 배경 `surface`(순백), 본문 컨테이너 `rounded-lg`,
동화 본문 18px 이상 / line-height 1.6~1.7 (§2.2).

### 7.3 표지 폴백 — 6개 표면 유지

`onError` → 색 블록 + `BookOpen` 아이콘 + 제목. 색은 `book.id` 기반 **결정적** 선택.

| 표면 | 파일 |
|---|---|
| 라이브러리 카드 (마이페이지 재사용) | `components/library/library-browser.tsx` |
| 책 상세 히어로 | `components/book/book-cover-hero.tsx` |
| 홈 추천 | `components/home/recommendation-list.tsx` |
| 랜딩 표지 | `components/landing/book-cover-card.tsx` |
| 쇼케이스 | `app/showcase/showcase-book-card.tsx` |
| 관리자 책 목록 | `components/admin/books/admin-books-browser.tsx` |

**카드 마크업을 교체할 때 `useState(imageError)` + `onError` 쌍이 누락되기 쉽다.**
폴백 팔레트는 v2에서 `level-N-container` + `text` 조합을 쓴다(§1.7 규칙 2, 대비 13:1 이상).

### 7.4 라이트 모드 강제

`app/globals.css`의
`@media (prefers-color-scheme: dark) { :root { color-scheme: light } }` 를 유지한다.
**v2에서 다크 팔레트를 신설하지 않는다.** §9 참조.

### 7.5 Celebrate (완독 보상) 모션

- 진입 모션 `cubic-bezier(0.34, 1.56, 0.64, 1)`(`ease-kiki-bounce`), 400~600ms.
- 축하 색은 `accent-mustard`(별·보상) + `cta`(포인트 숫자).
- **`prefers-reduced-motion: reduce`에서 바운스·컨페티를 끄고 페이드만 남긴다.**

### 7.6 Streak (학습 스트릭)

- 7일 그리드. 달성일 `primary` 채움, 미달성일 `surface-3`, 오늘 `cta` 외곽선.
- 색만으로 구분하지 않는다 — 달성일에 체크 아이콘을 병기한다(§6.5).

---

## 8. 타겟 톤 (만 3~7세 자녀를 둔 한국 학부모)

### 8.1 친근함
- 둥근 형태(§4), 웜 크림 배경(§1.4), 넉넉한 여백(§0 원칙 3)
- 문구는 존댓말·짧은 문장. 아이 대상 문구는 **초등 입학 전 어휘**로 쓴다
  (예: "이 책은 지금 쉬는 중이에요")

### 8.2 가독성 우선 영역 (부모 단독)
결제·약관·개인정보·리포트는 귀여움보다 명료함이다.
- 본문 `text-body`(16px) + line-height 1.6 이상
- 장식 요소 최소화, `surface` 위 `text` 기본
- 최대 본문 폭 **65자** 내외(`max-w-2xl`)

### 8.3 접근성 기본값
- 대비: §1.9 통과 조합만 사용
- 포커스 링: `outline-strong` 2px + offset 2px. **`outline: none`만 두고 대체 표시가 없는
  코드를 금지**한다
- 터치 타깃 44px(§6.5)
- 모든 이미지에 의미 있는 `alt`(장식 이미지는 `alt=""` + `aria-hidden`)
- `prefers-reduced-motion` 존중(§7.5)

---

## 9. 다크 모드 정책

**베타는 라이트 모드 강제다.** v2에서도 변경하지 않는다(§7.4).

- 구현: `@media (prefers-color-scheme: dark) { :root { color-scheme: light } }`
- **재검토 트리거**(v1.0 승계): 학부모 요청 **10건 이상** 누적 시 Phase 2에서 검토
- 다크 팔레트를 "미리 만들어 두는" 것도 하지 않는다 — §1.9 대비표를 두 벌 유지해야 하고,
  검증되지 않은 토큰이 문서에 남는 것이 v1.0의 실패 방식이다

---

## 10. Tailwind CSS 매핑 가이드

### 10.1 `app/globals.css` — 컬러만 CSS 변수로 둔다

`:root`에 **§1의 컬러 토큰만** 정의한다. 간격·radius·shadow는 CSS 변수를 만들지 않는다
(§3·§4·§5).

```css
:root {
  /* 1.1 Primary */
  --color-primary: #1F4A3D;
  --color-primary-hover: #2C6553;
  --color-on-primary: #FFFFFF;
  --color-primary-container: #DCEDE6;
  --color-on-primary-container: #102C23;

  /* 1.2 CTA */
  --color-cta: #CE3D1A;
  --color-cta-hover: #B5320F;
  --color-on-cta: #FFFFFF;
  --color-cta-container: #FDE4DB;
  --color-on-cta-container: #5A1A08;

  /* 1.3 Accent */
  --color-accent-purple: #6B5DD8;
  --color-accent-mustard: #F5B841;
  --color-on-accent-mustard: #3A2B08;

  /* 1.4 Surface */
  --color-bg: #FFFFFF;
  --color-surface: #FFFFFF;
  --color-surface-2: #FBF7F0;
  --color-surface-3: #F3EDE1;
  --color-outline: #E4DBCB;
  --color-outline-strong: #8C7C64;

  /* 1.5 Text */
  --color-text: #1A1D1B;
  --color-text-variant: #5A635E;
  --color-text-disabled: rgba(26, 29, 27, 0.38);
  --color-text-inverse: #FFFFFF;

  /* 1.6 Semantic */
  --color-success: #2C6553;
  --color-warning: #F5B841;
  --color-error: #B3261E;
  --color-info: #6B5DD8;

  /* 1.7 Level */
  --level-1: #3B8A63;  --level-1-container: #DDF0E5;
  --level-2: #2F87B7;  --level-2-container: #DCEDF7;
  --level-3: #A9761A;  --level-3-container: #FBEBCB;
  --level-4: #C9527E;  --level-4-container: #FBE0EA;
  --level-5: #6B5DD8;  --level-5-container: #E5E1FA;

  /* 2.1 Mono — display/body는 next/font가 주입 */
  --font-mono: "JetBrains Mono", "D2Coding", ui-monospace, monospace;
}
```

### 10.2 `tailwind.config.ts` — 평면 키로 매핑한다

**중첩 객체(`{ DEFAULT, hover }`)를 쓰지 않는다.** 현행 구현이 평면 키이고, 중첩으로 바꾸면
전 화면의 클래스명이 함께 바뀐다.

```ts
theme: {
  extend: {
    colors: {
      primary: 'var(--color-primary)',
      'primary-hover': 'var(--color-primary-hover)',
      'on-primary': 'var(--color-on-primary)',
      'primary-container': 'var(--color-primary-container)',
      'on-primary-container': 'var(--color-on-primary-container)',

      cta: 'var(--color-cta)',
      'cta-hover': 'var(--color-cta-hover)',
      'on-cta': 'var(--color-on-cta)',
      'cta-container': 'var(--color-cta-container)',
      'on-cta-container': 'var(--color-on-cta-container)',

      'accent-purple': 'var(--color-accent-purple)',
      'accent-mustard': 'var(--color-accent-mustard)',
      'on-accent-mustard': 'var(--color-on-accent-mustard)',

      bg: 'var(--color-bg)',
      surface: 'var(--color-surface)',
      'surface-2': 'var(--color-surface-2)',
      'surface-3': 'var(--color-surface-3)',
      outline: 'var(--color-outline)',
      'outline-strong': 'var(--color-outline-strong)',

      text: 'var(--color-text)',
      'text-variant': 'var(--color-text-variant)',
      'text-disabled': 'var(--color-text-disabled)',
      'text-inverse': 'var(--color-text-inverse)',

      success: 'var(--color-success)',
      warning: 'var(--color-warning)',
      error: 'var(--color-error)',
      info: 'var(--color-info)',

      'level-1': 'var(--level-1)', 'level-1-container': 'var(--level-1-container)',
      'level-2': 'var(--level-2)', 'level-2-container': 'var(--level-2-container)',
      'level-3': 'var(--level-3)', 'level-3-container': 'var(--level-3-container)',
      'level-4': 'var(--level-4)', 'level-4-container': 'var(--level-4-container)',
      'level-5': 'var(--level-5)', 'level-5-container': 'var(--level-5-container)',
    },
    fontFamily: {
      display: ['var(--font-display)'],
      body: ['var(--font-body)'],
      mono: ['var(--font-mono)'],
    },
    // §2.2 Type Scale 7종 — [size, { lineHeight, fontWeight }]
    fontSize: {
      display: ['36px', { lineHeight: '41px', fontWeight: '700' }],
      h1:      ['28px', { lineHeight: '34px', fontWeight: '700' }],
      h2:      ['22px', { lineHeight: '28px', fontWeight: '700' }],
      h3:      ['18px', { lineHeight: '23px', fontWeight: '600' }],
      body:    ['16px', { lineHeight: '26px', fontWeight: '400' }],
      label:   ['14px', { lineHeight: '20px', fontWeight: '500' }],
      caption: ['12px', { lineHeight: '17px', fontWeight: '600' }],
    },
    // §4.1 — xs 폐기, md/lg/xl 상향
    borderRadius: {
      sm: '12px', md: '20px', lg: '28px', xl: '36px', pill: '9999px',
    },
    // §5.1 — 리터럴 값 직접 기재
    boxShadow: {
      'elev-1': '0 1px 2px rgba(20,15,10,.06), 0 2px 6px rgba(20,15,10,.04)',
      'elev-2': '0 4px 12px rgba(20,15,10,.08), 0 1px 3px rgba(20,15,10,.06)',
      'elev-3': '0 8px 20px rgba(20,15,10,.10), 0 2px 6px rgba(20,15,10,.06)',
      'elev-cta': '0 12px 28px rgba(206,61,26,.22), 0 4px 10px rgba(20,15,10,.06)',
      'elev-modal': '0 30px 80px rgba(20,15,10,.18), 0 8px 24px rgba(20,15,10,.10)',
    },
    transitionTimingFunction: {
      kiki: 'cubic-bezier(0.2, 0, 0, 1)',
      'kiki-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
    // spacing 확장 없음 — Tailwind 기본 스케일 사용 (§3.1)
  },
}
```

### 10.3 D-3(구현) 인수인계 체크리스트

`fontSize` 확장은 Tailwind **기본 키를 지우지 않는다** — `text-sm`·`text-xs` 등이 그대로
남는다. 따라서 D-3은 아래를 반드시 수행한다.

1. `app/layout.tsx` — `Fraunces` 제거, `Gothic A1` 도입(weight 500·700), `fallback` 스택 교체
2. `app/globals.css` — §10.1로 전면 교체
3. `tailwind.config.ts` — §10.2로 교체, **spacing 확장 삭제**(§3.1)
4. 기존 크기 클래스 마이그레이션: `text-sm`→`text-label`, `text-xs`→`text-caption`,
   `text-base`→`text-body`, `text-lg`/`text-xl`→`text-h3`/`text-h2`,
   `text-2xl`/`text-3xl`/`text-4xl`→`text-h1`/`text-display`
5. `rounded-full`(6곳) → `rounded-pill` 통일, `rounded-xs` 사용처 확인(0건 예상)
6. 폐기 토큰 사용처 정리: `secondary`·`tertiary`·`accent-yellow/pink/violet/green/sky`
7. **§7 변경 불가 4건 회귀 검수** — 팀장 브라우저 육안 승인
8. 한글 웹폰트 전송량·LCP 측정(§2.1)

---

## 부록 — 토큰 네이밍 컨벤션

```
--color-{role}[-{variant}]   예: --color-primary, --color-cta-hover, --color-text-variant
--level-{n}[-container]      예: --level-3, --level-3-container
--font-{role}                예: --font-display
```

- **간격·radius·shadow는 CSS 변수를 만들지 않는다.** Tailwind 확장 키가 단일 출처다.
- **원칙**: semantic 토큰만 사용. raw value(예: `#CE3D1A`) 직접 노출은 **일러스트·차트,
  그리고 CSS 변수를 쓸 수 없는 렌더러**(`app/opengraph-image.tsx`의 satori,
  브랜드 로고 SVG)에 한정한다 — `CLAUDE.md` Hard Rule 10.

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|---|---|---|
| v1.0 | 2026-05-13 | Claude Design v0.1 추출본 + 키키북스 보강 5종 통합 |
| **v2.0** | **2026-08-19** | **전면 개정(ADR-0060).** 딥 그린 주조 + 오렌지레드 CTA 팔레트로 교체(주조색·CTA 분리) · WCAG AA 대비표 34조합 신설 · `Fraunces` 폐기 → `Gothic A1` 확정(한글 웹폰트 최초 도입) · Type Scale 11→7종 축소, 본문 16px 상향 · `--space-*`/`--radius-*` CSS 변수 폐기 → Tailwind 확장 키 단일화 · radius 상향 및 `xs` 폐기 · 섹션+"전체 보기"·풀폭 히어로·캐러셀 패턴 신설 · 터치 타깃 44px 명문화 · 변경 불가 4건(§7) 승계 |

본 문서의 변경은 ADR-0060의 후속 ADR로 기록한다.

---

*문서 끝.*
