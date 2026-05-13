# Kikibooks Design System (design-system.md)

> **이 문서의 역할**: 키키북스 모든 화면 구현 작업의 시각적 단일 진실 공급원(Single Source of Truth).
> Claude Code는 화면 작업 시 본 문서를 **`docs/intent/screen-XX-*.md`와 함께 반드시 참조**한다.

**문서 버전** v1.0 (Claude Design v0.1 추출본 + 키키북스 보강)
**최종 갱신** 2026-05-13
**상위 참조** `claude.md` 5절(라우팅), `docs/adr/0002-design-system.md`
**연동 문서** `docs/guidelines/license-rules.md` (AttributionBox 규칙)

---

## 0. 핵심 원칙 (Design Tenets)

키키북스 디자인 시스템은 다음 4가지 원칙 위에 작동한다.

1. **따뜻함 우선**: 순흑(#000) 대신 따뜻한 차콜, 차가운 회색 그림자 대신 갈색 톤 그림자
2. **둥근 모서리는 비협상**: 직각 컨테이너 금지. 모든 박스는 최소 8px radius
3. **유아 콘텐츠는 여백 1.25배**: 일반 SaaS 대비 답답함 회피
4. **부모 단독 영역은 가독성 우선**: 결제·약관·리포트는 귀여움보다 명료함

---

## 1. 컬러 토큰

### 1.1 Primary (브랜드 메인)

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-primary` | `#FF7A45` | 메인 CTA, 활성 메뉴, 강조 텍스트, 진행률 fill |
| `--color-primary-hover` | `#E85A22` | Primary 위 hover/pressed 상태 |
| `--color-on-primary` | `#FFFFFF` | Primary 배경 위 텍스트/아이콘 |
| `--color-primary-container` | `#FFE2D6` | Primary 계열 약한 배경 (태그, 뱃지, 영역 강조) |
| `--color-on-primary-container` | `#5A2208` | Primary container 위 텍스트 |

따뜻한 코랄 계열. 활기차되 자극적이지 않아 유아 환경에 안전.

### 1.2 Secondary (서브 액션·균형)

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-secondary` | `#2DBE9F` | 보조 CTA, "Watch"·"Listen" 학습 모드 구분, 성공 상태 |
| `--color-on-secondary` | `#FFFFFF` | Secondary 위 텍스트 |
| `--color-secondary-container` | `#D4F5EC` | 연령 표시 pill, 보조 태그 배경 |
| `--color-on-secondary-container` | `#00382B` | Secondary container 위 텍스트 |

### 1.3 Tertiary (정보·내비게이션)

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-tertiary` | `#5B7BFF` | 정보형 카드, "New this week" 등 시간성 컨텐츠 |
| `--color-on-tertiary` | `#FFFFFF` | Tertiary 위 텍스트 |
| `--color-tertiary-container` | `#DCE3FF` | 학습 카테고리 뱃지 |
| `--color-on-tertiary-container` | `#0E1F66` | Tertiary container 위 텍스트 |

### 1.4 Accent (포인트·카테고리)

Accent는 **카테고리·콘텐츠 식별용**으로만 사용. CTA 사용 금지.

| 토큰 | HEX | 카테고리 매핑 |
|---|---|---|
| `--color-accent-yellow` | `#FFC53D` | 별점·보상·스트릭·축하 모먼트 |
| `--color-accent-pink` | `#FF6FA8` | 동화·감성 콘텐츠 |
| `--color-accent-violet` | `#B07BFF` | 판타지·상상 |
| `--color-accent-green` | `#7BC96F` | 자연·교육 |
| `--color-accent-sky` | `#67C7F5` | 음악·동요 |

### 1.5 Background / Surface

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-bg` | `#FFFFFF` | 앱 기본 배경 |
| `--color-surface` | `#FFFFFF` | 카드, 모달, 시트 |
| `--color-surface-2` | `#FAF8F5` | 보조 표면 (탭바, 사이드바, 입력 필드) |
| `--color-surface-3` | `#F4F1EC` | 최저 강조 표면, 외곽 영역 |
| `--color-outline` | `#E8E2D9` | 1px 테두리, 입력 필드 외곽선 |

### 1.6 Text

| 토큰 | HEX / RGBA | 용도 |
|---|---|---|
| `--color-text` | `#1B1A18` | 본문 기본 (순흑 대신 따뜻한 차콜) |
| `--color-text-variant` | `#6C645B` | 보조 텍스트, 메타데이터, placeholder |
| `--color-text-disabled` | `rgba(27,26,24,0.38)` | 비활성 상태 |
| `--color-text-inverse` | `#FFFFFF` | 컬러 배경 위 텍스트 |

### 1.7 시맨틱 (상태)

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-success` | `#2DBE9F` | 완료, 정답, 다운로드 성공 |
| `--color-warning` | `#FFC53D` | 주의, 사용량 알림 |
| `--color-error` | `#E5484D` | 결제 실패, 입력 오류 |
| `--color-info` | `#5B7BFF` | 안내 메시지 |

### 1.8 ★ 자녀 레벨 매핑 (키키북스 특화)

PLAN.md의 Level 1~5(`children.current_level`)에 일관된 컬러를 부여한다. 책 표지 테두리, 레벨 선택 바, 추천 책 라벨 등에 사용.

| 레벨 | Token | HEX | 의미 |
|---|---|---|---|
| Level 1 (입문) | `--level-1` | `#7BC96F` (accent-green) | 시작 - 새싹 |
| Level 2 | `--level-2` | `#67C7F5` (accent-sky) | 성장 - 하늘 |
| Level 3 (중간) | `--level-3` | `#FFC53D` (accent-yellow) | 도전 - 햇살 |
| Level 4 | `--level-4` | `#FF6FA8` (accent-pink) | 심화 - 꽃 |
| Level 5 (마스터) | `--level-5` | `#B07BFF` (accent-violet) | 완성 - 별 |

**규칙**: Level은 학습 도전 단계이므로 난이도가 올라갈수록 따뜻한 색으로 전환 (초록→하늘→노랑→분홍→보라). 빨강 계열은 사용 금지(부정적 신호 회피).

---

## 2. 타이포그래피

### 2.1 Font Family

| 토큰 | 값 |
|---|---|
| `--font-display` | `"Fraunces", "Pretendard", Georgia, serif` |
| `--font-body` | `"Plus Jakarta Sans", "Pretendard", system-ui, sans-serif` |
| `--font-mono` | `"JetBrains Mono", "D2Coding", ui-monospace, monospace` |

- **Display (Fraunces)**: 동화책 같은 친근한 세리프. 제목·헤로·책 제목
- **Body (Plus Jakarta Sans)**: 둥근 산세리프. 본문·UI 텍스트
- **한글 폴백**: 양쪽 모두 `Pretendard` (가독성·중성성)

### 2.2 Type Scale

태블릿 가로(1280px) 기준. 모바일(390px)에서는 한 단계 축소 가능.

| 역할 | Size | Line Height | Weight | Family | 사용처 |
|---|---|---|---|---|---|
| `h1` / display | 30px | 33px (1.1) | 600 | display | 페이지 메인 타이틀 |
| `h2` / heading-lg | 26px | 30px (1.15) | 600 | display | 모달 타이틀, 큰 카드 헤더 |
| `h3` / heading-md | 20px | 24px (1.2) | 600 | display | 섹션 헤더 |
| `h4` / heading-sm | 18px | 22px (1.2) | 600 | display | 카드 타이틀 |
| `h5` / title | 16px | 20px (1.25) | 600 | display | 책 제목, 영상 제목 |
| `h6` / title-sm | 14px | 18px (1.25) | 600 | display | 소형 카드 제목 |
| `body-lg` | 16px | 24px (1.5) | 400 | body | 본문 강조 |
| `body` | 14px | 21px (1.5) | 400 | body | 기본 본문, 설명 |
| `body-sm` | 13px | 19px (1.45) | 500 | body | UI 라벨, 메타데이터 |
| `caption` | 11px | 15px (1.4) | 600 | body | 태그, pill, 시간 표기 |
| `overline` | 11px | 15px (1.4) | 700 | body | 대문자 라벨 (letter-spacing 0.4px) |

### 2.3 Font Weight

| Weight | 값 | 사용 |
|---|---|---|
| Regular | 400 | 본문 |
| Medium | 500 | UI 라벨, 보조 텍스트 강조 |
| Semibold | 600 | 헤딩, 카드 타이틀, 버튼 라벨 |
| Bold | 700 | 강한 강조, 숫자(stat), 태그 |
| ExtraBold | 800 | **사용 금지** (한글 자모 충돌 + 시각 부담) |

> 한글 강조는 **700 + 색상**으로 처리. 800은 사용하지 않는다.

### 2.4 Line Height 기본 규칙

| 콘텐츠 | Line Height |
|---|---|
| 헤딩 | 1.1 ~ 1.25 |
| 본문 | 1.5 |
| UI 라벨·캡션 | 1.4 |
| **동화 본문 (Reader 페이지)** | 1.5 ~ 1.6 (한글 가독성 추가 여유) |

---

## 3. 간격(Spacing) 토큰

### 3.1 Scale (4px 베이스)

| 토큰 | 값 | 통상 용도 |
|---|---|---|
| `--space-0` | 0px | reset |
| `--space-1` | 4px | 아이콘-텍스트 미세 간격 |
| `--space-2` | 8px | 인라인 요소, 칩 내부 |
| `--space-3` | 12px | 버튼 내부, 작은 카드 패딩 |
| `--space-4` | 16px | 카드 간 gap, 일반 패딩 |
| `--space-5` | 20px | 카드 내부 패딩 |
| `--space-6` | 24px | 섹션 내부 여백 |
| `--space-7` | 28px | 큰 카드 패딩 |
| `--space-8` | 32px | 페이지 좌우 패딩, 큰 섹션 |
| `--space-10` | 40px | 섹션 사이 |
| `--space-12` | 48px | 페이지 헤더 ↔ 본문 |
| `--space-16` | 64px | 페이지 상단/하단 큰 여백 |

### 3.2 컴포넌트 내부 padding 규칙

| 컴포넌트 | Padding |
|---|---|
| Button (sm) | 8px 14px |
| Button (md, 기본) | 12px 20px |
| Button (lg, CTA) | 14px 24px |
| Input / Search bar | 0 22px (높이 52px) |
| Chip | 0 16px (높이 38px) |
| Card (sm) | 14px |
| Card (md, 기본) | 20px |
| Card (lg, hero) | 24~28px |
| Modal | 28~32px |
| Page container | 좌우 32px / 상하 20px |
| **AttributionBox (★)** | 16px (좌우 20px) |

### 3.3 컴포넌트 간 margin 규칙

| 관계 | Margin |
|---|---|
| 같은 그룹 내 요소 | 8~12px |
| 섹션 헤더 ↔ 컨텐츠 | 14~18px |
| 섹션 ↔ 다음 섹션 | 28~32px |
| 페이지 헤더 ↔ 첫 섹션 | 18~24px |

> 유아 콘텐츠는 밀도를 낮춰 답답함을 줄임. 데스크탑 SaaS 대비 1.25배 여유.

---

## 4. Border Radius

### 4.1 Scale

| 토큰 | 값 | 사용 |
|---|---|---|
| `--radius-none` | 0px | **사용 금지** |
| `--radius-xs` | 8px | 작은 인디케이터 |
| `--radius-sm` | 12px | 입력 필드 내부 요소, 작은 칩 |
| `--radius-md` | 16px | 일반 카드, 모달 내부 영역 |
| `--radius-lg` | 24px | 큰 카드, 카테고리 타일 |
| `--radius-xl` | 28px | 모달 컨테이너, 히어로 영역 |
| `--radius-pill` | 9999px | 버튼, 칩, 검색바, 스트릭 |

> **고정값 정책**: Tailwind 호환을 위해 범위(16~18px)가 아닌 단일 값(16px)으로 고정. 예외 시 명시적 ADR 작성.

### 4.2 컴포넌트별 적용

| 컴포넌트 | Radius |
|---|---|
| Primary / Secondary Button | `pill` |
| Icon Button (square) | `radius-md` |
| Input · Search bar | `pill` |
| Chip / Tag / Pill | `pill` |
| Card (책, 영상 카드) | `radius-md` |
| Book cover image | `radius-sm` (12px) |
| Hero card | `radius-xl` |
| Modal | `radius-xl` |
| Sidebar nav item | `radius-md` |
| **AttributionBox (★)** | `radius-md` |
| **Reader 페이지 컨테이너 (★)** | `radius-lg` |

---

## 5. Shadow / Elevation

### 5.1 단계 정의

따뜻한 갈색 톤(20,15,10 베이스)으로 차가운 회색 느낌 배제.

| 토큰 | 값 | 강도 |
|---|---|---|
| `--elevation-0` | `none` | 평면 |
| `--elevation-1` | `0 1px 2px rgba(20,15,10,0.06), 0 2px 6px rgba(20,15,10,0.04)` | 약함 |
| `--elevation-2` | `0 4px 12px rgba(20,15,10,0.08), 0 1px 3px rgba(20,15,10,0.06)` | 보통 |
| `--elevation-3` | `0 8px 20px rgba(20,15,10,0.10), 0 2px 6px rgba(20,15,10,0.06)` | 강함 |
| `--elevation-pop` | `0 14px 30px rgba(255,122,69,0.18), 0 4px 10px rgba(20,15,10,0.06)` | 브랜드 글로우 |
| `--elevation-modal` | `0 30px 80px rgba(20,15,10,0.18), 0 8px 24px rgba(20,15,10,0.10)` | 모달 전용 |

### 5.2 사용 규칙

| 상황 | Elevation |
|---|---|
| 기본 카드 (정적) | `1` |
| 카드 hover / 활성 | `2` |
| Floating button, 활성 메뉴 아이템 | `pop` |
| Dropdown, Tooltip | `2` |
| Modal, Dialog | `modal` |
| Toast, Snackbar | `3` |
| 책 표지 (콘텐츠) | `1~2` |
| 영상 썸네일 위 Play 버튼 | `2` |

---

## 6. 컴포넌트 원칙

### 6.1 Button

- **모양**: 기본 `pill` (사각형 금지)
- **위계**:
  - **Primary**: 메인 액션. `--color-primary` + `pop` shadow
  - **Secondary / Ghost**: 보조 액션. `surface-2` 배경 + 1px outline
  - **Text button**: "See all" 같은 미세 액션
- **상태**:
  - Hover: 색상 8% darken + `translateY(-1px)`
  - Active: 색상 10% darken + shadow 한 단계 감소
  - Focus: 2px outline (`primary` 50% alpha)
  - Disabled: opacity 0.38, pointer-events none
- **사이즈**: sm 36px / md 44px / lg 52px (lg는 결제·가입)
- **아이콘**: 18~20px, 텍스트와 간격 8px

### 6.2 Card

| 상황 | 처리 |
|---|---|
| 정보·콘텐츠 카드 | **Shadow only** — 떠 있는 느낌 |
| 표면 위 표면 (sidebar item, chip) | **Border only** (1px outline) |
| Hero·CTA 카드 | **Shadow** (브랜드 글로우) |
| 입력 필드, 선택 칩 | **Border**, focus 시 border 색상만 변경 |

- Hover: `translateY(-2~4px)` + `elevation` 1단계 증가
- Transition: **200~220ms cubic-bezier(0.2, 0, 0, 1)**

### 6.3 Icon Style

- **라이브러리**: Material Symbols Rounded (둥근 모서리)
- **선 굵기**: weight 400 기본, 활성 500
- **Fill 규칙**:
  - 비활성/기본: outline (FILL 0)
  - 활성/선택: filled (FILL 1)
  - 좋아요·별점은 항상 filled
- **사이즈**: 16 / 18 / 20 / 24 / 28 / 32px (UI 기본 20px, 내비 28px)
- 직선·날카로운 아이콘 세트(Feather 등) 사용 금지

### 6.4 Illustration

- 평면 벡터, 굵은 외곽선 없는 면 분할
- 한 일러스트당 컬러 4~6개 이내
- 캐릭터 표현 단순화 (점·선 얼굴), 사실적 묘사 자제

---

## 7. ★ 키키북스 특화 컴포넌트 (보강)

### 7.1 AttributionBox (라이선스 의무 표시)

`docs/guidelines/license-rules.md` 5절과 연동된다. **모든 책 상세 페이지 100% 표시 의무**.

| 속성 | 값 |
|---|---|
| Container Background | `--color-surface-2` (#FAF8F5) |
| Container Border | 1px solid `--color-outline` |
| Border Radius | `--radius-md` (16px) |
| Padding | 16px 20px |
| Title (📚 출처) | `body-sm` (13px), weight 600, color `--color-text` |
| Body (저자·라이선스) | `caption` (11px → 12px로 상향), color `--color-text-variant` |
| 원본 링크 | `body-sm`, color `--color-tertiary`, underline on hover |
| 라이선스 배지 | Chip 형태, `--color-tertiary-container` 배경 |

**위치 규칙**: 책 표지 직하단, 읽기 버튼 직상단. 모바일에서도 fold above.
**접근성**: AA 4.5:1 충족, 폰트 최소 12px (license-rules.md 5.3절 12px 최소 규칙 반영).

### 7.2 Reader (책 뷰어) 모드 토큰

content_type별로 뷰어 영역의 시각 처리가 다르다.

| content_type | 배경 | 컨테이너 |
|---|---|---|
| `html` (Book Dash iframe) | `--color-surface-3` (#F4F1EC) | `radius-lg` (24px), `elevation-2` |
| `epub` (epub.js) | `#FAF7F0` (책 종이 톤) | `radius-lg`, `elevation-2` |
| `h5p` (h5p-standalone) | `--color-bg` (흰색) | `radius-md`, `elevation-1` |
| `pdf` | `--color-surface-3` | `radius-md`, `elevation-2` |

**페이지 넘김 인디케이터**:
- 진행률 바: 높이 4px, `--color-primary` fill, `--color-surface-2` track
- 현재 페이지 / 전체 페이지: `caption` (11px → 12px), `--color-text-variant`
- 뷰어 좌우 여백: 모바일 16px / 태블릿 32px / 데스크탑 64px

**Reader 본문 텍스트 (epub일 때)**:
- Font: `--font-body` 또는 책 자체 폰트 (epub.js 기본 따름)
- Size: 18px 이상 (유아 가독성 필수)
- Line height: 1.6 (한글 여유)

### 7.3 Celebrate (완독 보상) 모션 토큰

PLAN.md Screen 05 명세 연동. 별 3개 + 포인트 +50 + 배지 부여.

| 요소 | 모션 |
|---|---|
| 별 3개 등장 | 0ms / 150ms / 300ms 순차, `scale(0) → scale(1.2) → scale(1)`, **easing: cubic-bezier(0.34, 1.56, 0.64, 1)** (bounce) |
| 별 채우기 | 등장 후 200ms 지연 + 색상 transition 400ms (회색 → `--color-accent-yellow`) |
| 포인트 카운터 | "0 → 50" count-up, **600ms**, easing `ease-out` |
| 포인트 카드 등장 | 별 모션 완료 후 100ms 지연, fade-in + `translateY(20px → 0)`, 300ms |
| 배지 등장 | 포인트 카드 후 200ms 지연, scale(0.5) → scale(1), 350ms, bounce easing |
| 폭죽·confetti | 선택적, 1회만, 2초 이내 종료 |

**reduced-motion 대응**: `prefers-reduced-motion: reduce` 시 모든 bounce → linear fade, duration 50% 축소.

### 7.4 Streak (학습 스트릭) 컴포넌트

PLAN.md Screen 02 홈 화면의 "최근 7일 막대그래프" 연동.

| 속성 | 값 |
|---|---|
| 막대 너비 | 28px |
| 막대 높이 (최대) | 60px |
| 막대 radius | `radius-sm` (12px), 위쪽만 |
| 완료일 색상 | `--color-primary` |
| 미완료일 색상 | `--color-surface-3` |
| 오늘 표시 | 막대 위에 작은 dot (`--color-accent-yellow`) |
| 막대 간 간격 | 8px |
| 요일 라벨 | `caption` (12px), `--color-text-variant` |

---

## 8. 타겟 톤 (만 3~7세 자녀를 둔 한국 학부모)

### 8.1 친근함을 표현하는 요소

| 요소 | 적용 |
|---|---|
| 색상 | 코랄·민트·하늘색 등 채도 중간 톤. 형광·원색 금지 |
| 모서리 | 모든 컨테이너 둥근 처리. 8px 이상 radius |
| 타이포 | 제목에 세리프(Fraunces) — 그림책 정서 |
| 마이크로 카피 | "Good morning, ___ ✦", "Keep it up!" |
| 모션 | 200ms easing 살짝 떠오름. 과한 바운스 자제 |
| 일러스트 | 동물·자연 모티프 + 단순 형태 |
| 이모지 | ✦, ⭐, 🔥 장식적 소량. 정보 전달용 미사용 |
| 여백 | 일반 SaaS 대비 1.25배 |

### 8.2 가독성 우선 영역 (부모 단독)

| 영역 | 가독성 규칙 |
|---|---|
| 회원가입 / 로그인 | 본문 16px+, 라벨 14px, 필드 높이 52px, 화면당 필드 최대 4개 |
| 결제 / 구독 관리 | 가격·기간은 Display 22~26px Bold. 약관은 13px Body |
| 자녀 학습 리포트 | 숫자 강조는 display, 본문 14~16px Body, 차트는 색상+패턴 |
| 약관·개인정보 | 본문 14px / line-height 1.6, 강조는 weight 600 (색상 강조 자제) |
| 알림·공지 | **최소 13px**, caption 11px 사용 금지 |

### 8.3 접근성·안전 기본값

- 모든 텍스트-배경 조합 **WCAG AA 4.5:1 이상**
- 인터랙티브 영역 최소 **44×44px** (태블릿/모바일 동일)
- 포커스 링 항상 가시 (시각 장애 부모 인지)
- 어두운 배경 위 텍스트는 weight 500 이상 (한글 가독성)
- 부모 단독 영역에서 이모지·축약어·영어 단독 표기 자제

---

## 9. ★ 다크 모드 정책 (보강)

**베타 단계**: 라이트 모드만 지원. 다크 모드는 Phase 2 이후 검토.

**근거**:
- 유아 콘텐츠는 라이트 모드가 표준 (그림책 종이 정서)
- 베타 사용자 데이터 확보 전 토큰 2배 증가 비용 비합리
- `prefers-color-scheme: dark` 미디어 쿼리는 정의하되 라이트로 강제 매핑

**Phase 2 검토 트리거**: 학부모 베타 피드백에서 다크 모드 요청 10건 이상 시.

**구현 권고**: CSS 변수는 `:root`에 정의하되, `@media (prefers-color-scheme: dark)` 블록은 비워둠. 미래 확장 시 ADR 작성 후 토큰 추가.

---

## 10. Tailwind CSS 매핑 가이드

Claude Code가 화면 구현 시 사용할 Tailwind 변환 표준이다.

### 10.1 tailwind.config.ts 확장 필수 항목

```typescript
theme: {
  extend: {
    colors: {
      primary: { DEFAULT: 'var(--color-primary)', hover: 'var(--color-primary-hover)' },
      // ... 1.1~1.8 모든 토큰 매핑
    },
    fontFamily: {
      display: 'var(--font-display)',
      body: 'var(--font-body)',
    },
    spacing: {
      // Tailwind 기본에 없는 값만 추가
      '7': '28px',
      '10': '40px',
      '12': '48px',
      '16': '64px',
    },
    borderRadius: {
      xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '28px',
    },
    boxShadow: {
      'elev-1': 'var(--elevation-1)',
      'elev-2': 'var(--elevation-2)',
      'elev-3': 'var(--elevation-3)',
      'elev-pop': 'var(--elevation-pop)',
      'elev-modal': 'var(--elevation-modal)',
    },
  }
}
```

### 10.2 글로벌 CSS (app/globals.css)

`:root`에 1.1~1.8의 모든 컬러 토큰을 CSS 변수로 정의한다. 폰트는 `@import` 또는 next/font로 로드.

---

## 부록 — 토큰 네이밍 컨벤션

```
--color-{role}[-{variant}]      예: --color-primary, --color-text-variant
--font-{role}                   예: --font-display
--text-{size}                   예: --text-body, --text-h3
--space-{step}                  예: --space-4
--radius-{size}                 예: --radius-lg, --radius-pill
--elevation-{level}             예: --elevation-2, --elevation-pop
--level-{n}                     예: --level-1 ~ --level-5
```

**원칙**: 의미 기반(semantic) 토큰 우선 사용. raw value(예: `#FF7A45`) 직접 노출은 일러스트·차트에 한정.

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|---|---|---|
| v1.0 | 2026-05-13 | Claude Design v0.1 추출본 + 키키북스 보강 5종 통합 (AttributionBox·Reader·Celebrate 모션·Streak·Level 컬러 매핑·다크 모드 정책·Tailwind 매핑) |

본 문서의 변경은 ADR-0002의 후속 ADR로 기록한다.

---

*문서 끝.*
