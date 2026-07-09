# HelloKiki(헬로키키) 구축 최종 계획서

> **문서 버전** v2.0
> **작성일** 2026-05-13 · **개정일** 2026-06-13
> **출시 목표** 베타 2026년 8월 (작업량에 따라 조정 가능)
> **대상** 비개발자 풀스택 빌더 + Claude Code
> **참조 문서** 「유명 영어 동화 IP 합법 확보 가이드」 + 「Claude Code 1차 구축 계획서」 + `docs/adr/0022-content-source-expansion.md`(콘텐츠 소스 확장) + `docs/adr/0023-ai-features-and-tts-policy.md`(AI 기능·TTS 정책)

---

## 목차

1. [임원 요약](#1-임원-요약)
2. [두 문서를 통합한 관점](#2-두-문서를-통합한-관점)
3. [전체 4단계 로드맵](#3-전체-4단계-로드맵)
4. [콘텐츠-기술 매트릭스](#4-콘텐츠-기술-매트릭스)
5. [서비스 환경 (인프라 구조)](#5-서비스-환경-인프라-구조)
6. [기술 스택 결정](#6-기술-스택-결정)
7. [데이터베이스 스키마](#7-데이터베이스-스키마)
8. [Phase 0 상세 — 사전 준비 (2주)](#8-phase-0-상세--사전-준비-2주)
9. [Phase 1 상세 — MVP 베타 출시 (4~6주)](#9-phase-1-상세--mvp-베타-출시-46주)
10. [콘텐츠 협상 트랙](#10-콘텐츠-협상-트랙)
11. [Claude Code 작업 분담](#11-claude-code-작업-분담)
12. [위험 요소와 대응책](#12-위험-요소와-대응책)
13. [의사결정 트리거](#13-의사결정-트리거)
14. [지금 바로 시작할 4가지 액션](#14-지금-바로-시작할-4가지-액션)
15. [부록 — 헷갈리는 개념 정리](#15-부록--헷갈리는-개념-정리)

---

## 1. 임원 요약

HelloKiki(헬로키키)는 한국 유아(만 3~7세)를 대상으로 한 영어 그림책 e-라이브러리 플랫폼입니다. 본 계획서는 두 개의 선행 문서를 하나로 통합하여 **3개월 내 베타 출시**를 목표로 한 통합 로드맵을 제시합니다.

### 핵심 전략 한 문장

> **베타는 '무료 합법 콘텐츠'만으로 출시하고, 출시와 동시에 한국 출판사 협상 트랙을 가동한다.**

이유는 명확합니다. 유명 작가 IP(Eric Carle, Gruffalo, Anthony Browne 등)의 디지털 라이선스는 협상에 6~18개월이 걸리므로, 3개월 내 베타에 포함될 가능성은 0에 가깝습니다. 대신 Book Dash + Global Digital Library(CC BY 4.0 무료) + Beatrix Potter(한국 PD)만으로도 **약 900권 이상을 합법적으로 확보 가능**하며, 이것이 베타의 기반이 됩니다.

### 3개월 베타 출시까지의 결정 요약

| 영역 | 결정 사항 |
|---|---|
| 콘텐츠 | Book Dash(211권+) + GDL 영어 CC BY(600~900권) + Beatrix Potter 23권 자체 제작 |
| 기술 | Next.js 14 + Supabase + Vercel + GitHub Actions (기본 인프라 무료 티어). 단 Phase 1.5의 AI(LLM)·TTS·오디오 스토리지는 유료 진입 — $0 체계 종료(§5·ADR-0023 §2.8) |
| 디자인 | Claude Design → 5개 화면 시안 → design.md → Claude Code가 코드화 |
| 협상 | 베타 출시와 동시에 JYBooks 노부영·웅진주니어 협상 시작 |

### 3년 콘텐츠 예산 가이드라인

| 연차 | 예산 범위 | 내용 |
|---|---|---|
| 1년차(2026) | USD 0~5,000 | 베타는 무료 콘텐츠만 사용. Beatrix Potter 자체 제작비 약간 |
| 2년차(2027) | USD 80,000~150,000 | 한국 출판사 협업 + Vooks/Epic B2B 통합 본격 시작 |
| 3년차(2028) | USD 150,000~250,000 | Magic Light(Gruffalo) 직접 라이선스 + 시공주니어 Eric Carle 디지털 추가 |

---

## 2. 두 문서를 통합한 관점

콘텐츠(비즈니스/협상) 트랙과 기술(개발/배포) 트랙은 동일한 시간축 위에서 진행되며, 각 단계의 종료 조건이 서로의 입력값이 됩니다.

### 두 문서의 핵심 비교

| 구분 | 라이선스 가이드 (콘텐츠) | Claude Code 계획서 (기술) |
|---|---|---|
| 1차 결론 | 유명 IP 직접 확보는 6~18개월 협상 필요 | Phase 0(2주) + Phase 1(6주) = 약 2개월 내 MVP 가능 |
| 핵심 수단 | 무료 50% + 한국 출판사 30% + B2B 15% + 직접 5% | Book Dash + GDL에서 약 900~1,900권 자동 동기화 |
| 리스크 | 라이선스 변경, NC 콘텐츠 유입, 어트리뷰션 누락 | 외부 CDN 호환성, OAuth 설정, 부적합 콘텐츠 노출 |
| 연결 지점 | 협상 결과는 books 테이블에 신규 source_platform으로 누적 | DB의 license 필드와 차단 트리거가 법적 의무를 강제 |

### 두 트랙이 맞물리는 방식

- **기술 트랙이 빠른 이유**: 무료 콘텐츠 약 900권이 이미 준비되어 있어, 협상 없이도 베타 출시 가능
- **콘텐츠 트랙이 느린 이유**: 한국 출판사·글로벌 IP 협상은 평균 6개월 이상. 베타 출시 후 시작해도 정상
- **두 트랙의 만남**: 베타로 사용자 데이터 확보 → 협상 시 "MAU 5,000명, 학원 50개" 같은 증거로 사용

---

## 3. 전체 4단계 로드맵

```
Phase 0        Phase 1 ★      Phase 1.5 ★      Phase 2          Phase 3
사전 준비       MVP 출시        베타 보강         콘텐츠 확장       B2B + 결제
2주            4~6주           가변              8~12주           지속
────────────   ────────────   ──────────────   ──────────────   ──────────────
계정·API키     B2C 핵심 5화면  트랙A 콘텐츠확장  Bloom Library    B2B 학원 대시보드
DB 설계        Book Dash + GDL  (GDL심화→SW→Bloom) LibriVox        결제(Stripe/Toss)
디자인 시안    약 900~1,900권   트랙B AI/TTS      StoryWeaver(확대) 학부모 리포트
동기화 인프라  책 뷰어         자체e-book 23권   African Storybook 알림톡
               자녀 프로필     ~960권 목표       4,000~5,500권
               가입/로그인     내부테스트·피드백  진도 추적
                              디자인 리뉴얼→베타
──────────────────── 1차 구축 + 베타 보강 범위 ──────────────── 별도 계획서 ──────
```

### 단계별 목표 요약

| Phase | 기간 | 기술 목표 | 콘텐츠 목표 | KPI / 트리거 |
|---|---|---|---|---|
| Phase 0 | 2주 | 계정·DB·동기화 인프라 | 무료 6개 플랫폼 라이선스 검토, attribution SOP 확정 | books 약 900권+ 적재, 어트리뷰션 100% |
| Phase 1 ★ | 4~6주 | B2C 핵심 5화면, 인증, 뷰어, 진도/배지 | Beatrix Potter 23권 자체 제작, 큐레이션 SOP | 베타 사용자 50~100명, 완독 세션 100건 |
| Phase 1.5 ★ | 가변 | **트랙B**: 캐릭터 AI 옵션 A(선택형 대화)·도서 낭독 TTS / 내부 테스트(직원) → 피드백 기능 보강 → 디자인 리뉴얼 | **트랙A**: GDL 심화(842→~937) → StoryWeaver(공식 API) → Bloom 순차 + 자체 e-book 23권 | 노출 **~960권**(900 하한·960 회복), 내부 테스터 막힘 없음, 디자인 리뉴얼 완료 → 베타 출시 |
| Phase 2 | 8~12주 | StoryWeaver·LibriVox·Bloom 추가, Read-along 영상 | JYBooks·웅진주니어 협상, Vooks/Epic 견적 | 유료 가입 의향 1,000명, 책 4,000권 |
| Phase 3 | 6개월~ | 학원 대시보드, 결제, 학부모 리포트 | Magic Light(Gruffalo) 직접 라이선스 | ARR USD 200k, B2B 학원 50개, MAU 5,000 |

### 3개월 베타 주차별 일정 (Phase 0 + Phase 1)

```
Week 1~2  (Phase 0)   계정 셋업 → DB 스키마 → 콘텐츠 동기화 → 첫 동기화 실행
Week 3~4              인증 + 공통 레이아웃 + 디자인 토큰 적용
Week 5                랜딩 페이지 + 로그인 후 홈
Week 6                책 상세 + 책 뷰어
Week 7                완독 보상 + 라이브러리 + 모바일 최종 점검
Week 8                베타 테스트 + Vercel Production 배포(Phase 1 완료)
                      ↓
Phase 1.5 (가변)      트랙A 콘텐츠 확장(GDL심화→StoryWeaver→Bloom 순차)
                      + 트랙B AI 대화(옵션 A)·낭독 TTS  ※트랙 병렬
                      → 자체 e-book 23권(~960권) → 내부 테스트(직원)
                      → 피드백 기능 보강 → 디자인 리뉴얼
                      ↓
베타 출시 (2026-08, 작업량에 따라 조정 가능)
```

---

## 4. 콘텐츠-기술 매트릭스

어떤 콘텐츠가 어떤 기술 스택과 결합되는지 정리합니다. 베타에는 ✅ 영역만 포함됩니다.

| 콘텐츠 소스 | 권리 상태 | 권 수 | 기술 통합 방법 | 베타 포함 |
|---|---|---|---|---|
| Book Dash | CC BY 4.0 — 영리 사용 가능, 어트리뷰션 의무 | 211권+ | ~~GitHub Pages CDN → iframe 임베드~~ (구 계획, ADR-0035로 대체) → **자체 뷰어**: book-images 창고 복사 이미지 + 별도 렌더 텍스트 + 오디오·자막 하이라이트 | ✅ |
| Global Digital Library | CC BY 4.0 / CC BY-SA 4.0 / **CC BY 3.0** — 영리 사용 가능 (NC/ND는 트리거 차단). **GDL은 aggregator**: StoryWeaver 289·African Storybook 34·BookDash 33 등 집계 | 적격 약 937권 (842 적재 → slug 매핑 + cc-by-3-0 화이트리스트로 **~937 회복**) | REST API 동기화 → h5p-standalone | ✅ |
| Beatrix Potter | 한국 Public Domain(1943 사망). 단 `Peter Rabbit™` 상표 미사용 | 23권 | 자체 e-book 제작 (HTML/ePub) | ✅ (Phase 1 후반) |
| LibriVox | CC0(퍼블릭 도메인 낭독) — 자유 사용 | MP3 다수 | MP3 + Beatrix Potter 낭독 결합 | △ Phase 2 |
| StoryWeaver (Pratham) | CC BY (책별 필드 필터, NC 제외) | 직접 ~40k+ 풀(GDL 경유 289 일부 적재) | **공식 bulk·파트너 API·데이터 덤프 확보 선행.** 공개 API는 Cloudflare 403 — **스크래핑·봇차단 우회·비공식 엔드포인트 금지** | △ Phase 1.5 (공식 API 확보 시) |
| Bloom Library | CC BY 등 (책별 메타 필터 검증 필요) | 미정 | **조건부**: Parse API 크리덴셜 확보 + 약관(상업 재배포 허용 범위) 확인 시 | △ Phase 1.5 조건부 |
| African Storybook | CC BY 등 | GDL 경유 34권 | 공개 REST API 부재 → **GDL 경유분으로 갈음**, 직접 적재는 후순위 | △ (GDL 경유 ✅) |
| JYBooks 노부영 | Eric Carle·Browne·Donaldson 한국 음원·CD 권리. 디지털 재라이선스 협상 필요 | 수십 종 | 협상 후 별도 콘텐츠 파이프라인 | ✗ Phase 2 협상 |
| 웅진주니어 | Anthony Browne 15권 한국어판. 디지털 권리 협상 필요 | 15권 | 협상 후 별도 파이프라인 | ✗ Phase 2 협상 |
| Vooks / Epic | Distribution 파트너십 협상 필요 | Vooks 350편+, Epic 40,000권 | SSO 통합 또는 화이트라벨 임베드 | ✗ Phase 2 견적 |
| Magic Light (Gruffalo) | BBC 애니메이션 13편. 한국 sub-agent 부재 → 직접 협상 | 13편 영상 | DRM 동영상 스트리밍 인프라 필요 | ✗ Phase 3 |

> 📌 **베타 목표 권수**: ADR-0008로 1,300 → **약 900권(하한 목표)**으로 하향 정정(실측 적재 896권, 2026-05-14). Phase 1.5 트랙A(ADR-0022)로 GDL 심화 842→~937 + 자체 e-book 23권 = **~960권(회복 목표)**. 900=하한·960=회복으로 병기. 근거: `docs/adr/0008-beta-content-target-900.md`, `docs/adr/0022-content-source-expansion.md`.

> 🗂️ **큐레이션 정책 개정(ADR-0022 §2.6)**: 기존 "전수 수동 승인"(소량 베타 전제)을 **소스 신뢰도 기반 표본 검수 + 사용자 신고/즉시 차단** 안전망으로 개정. 신뢰 소스(GDL·StoryWeaver 등 CC 검증 aggregator)는 표본 추출 검수로 갈음하고, 사용자 신고 + admin 즉시 비활성(`is_active=false`) + 블랙리스트(`lib/shared/blacklist.ts`, cron-proof)를 안전망으로 둔다.

> ⚠️ **베타에 절대 포함하지 말 것**
> - **Storyline Online(SAG-AFTRA)** — 영리 사용 금지, 별도 라이선스 창구 없음. 임베드 금지.
> - **YouTube 임베드(출판사 공식 채널 외)** — 광고 매출과 직접 결합 금지. 자체 학습 기능 부재 시 위험.
> - **유명 작가 미협상 콘텐츠** — Eric Carle, Mo Willems, Dr. Seuss 등. 협상 체결 전 어떠한 형태로도 사용 금지.
> - **`Peter Rabbit™` 로고·캐릭터명 상표적 사용** — Beatrix Potter 텍스트는 PD이지만 상표는 별도 보호 중.

---

## 5. 서비스 환경 (인프라 구조)

### 아키텍처 다이어그램

```
┌─────────────────────────────────────────┐
│           [사용자 브라우저]               │
│       학부모 스마트폰 / 자녀 태블릿       │
└──────────────────┬──────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────┐
│      [Vercel — Next.js 호스팅]           │
│  Next.js 14 App Router + Tailwind CSS   │
│  무료: 100GB 대역폭/월                  │
└──────────┬────────────┬─────────────────┘
           │            │
           ▼            ▼
┌──────────────┐  ┌─────────────────────┐
│  Supabase    │  │  외부 콘텐츠 CDN    │
│  (백엔드)    │  │  + GitHub Pages 미러│
│              │  │                     │
│ PostgreSQL   │  │ GDL CDN             │
│ Auth         │  │ Book Dash           │
│ Storage      │  │ (이미지·PDF)        │
│ RLS          │  └─────────────────────┘
│              │
│ 무료: DB 500MB│
│ Auth 5만 MAU │
└──────────────┘
       ▲
       │ Daily Cron (03:00 UTC)
       │
┌─────────────────────────────────────────┐
│       [GitHub Actions — 자동화]          │
│  · Book Dash 동기화 (주 1회)            │
│  · GDL API 동기화 (일 1회)             │
│  · 라이선스 변경 감지 (월 1회)          │
│  무료: 월 2,000분 (실제 사용 ~60분)    │
└─────────────────────────────────────────┘
```

**Supabase Storage 버킷 운용 (2026-07 실측 기준 추가 — ADR-0035/0036/0034/0027)**

| 버킷 | 용도 | 근거 |
|---|---|---|
| `book-covers` | 표지 이미지(마이그레이션 코호트) | ADR-0032 |
| `book-images` | book_dash 자체 뷰어 본문 이미지(정예 39권, 508객체 + 잔여 커버 10) | ADR-0036 |
| `book-audio` | TTS 오디오(mp3)+marks(json), `book_dash-{UUID}/pNN.mp3`(0-based)+cover | ADR-0034 |
| `book-manifests` | asb_native 매니페스트 텍스트 | ADR-0027 Amd#2 |

### 데이터 흐름 — 핵심 3가지 시나리오

**시나리오 A — 콘텐츠 자동 동기화 (매일 새벽)**

```
GitHub Actions
  └─ GDL API 호출 + Book Dash GitHub repo 호출
  └─ license 필드 필터링 (CC BY/SA만 통과, NC·ND는 차단)
  └─ Supabase books 테이블 upsert (변경된 책만)
```

**시나리오 B — 사용자가 책 목록 보기 (실시간)**

```
학부모 브라우저 → GET /home 또는 /library
  └─ Next.js Server Component
  └─ Supabase 쿼리: 자녀 레벨 기반 책 목록
  └─ 표지 이미지는 외부 CDN URL 직접 사용 (서버 부하 없음)
```

**시나리오 C — 사용자가 책 읽기 (실시간)**

```
GET /book/[id]/read
  └─ content_type에 따라 분기
       HTML(book_dash) → 자체 뷰어(이미지+텍스트+오디오 하이라이트)   ※ 구 계획 "iframe 임베드"는 ADR-0035로 대체
       ePub  → epub.js
       H5P   → h5p-standalone
  └─ 페이지 넘김마다 reading_sessions 업데이트
  └─ 마지막 페이지 → 완독 처리 → /book/[id]/celebrate
```

### 월 운영 비용 (베타 출시 시점)

> ⚠️ **"$0 운영비 체계 종료"(ADR-0023 §2.8)**: 종료는 **AI(LLM)·TTS·오디오 스토리지에 한정**한다. 기본 인프라(Vercel·Supabase·GitHub Actions)는 베타 규모에서 **무료 티어를 그대로 유지**한다. Phase 1.5부터 AI 기능 도입으로 유료 운영에 진입한다.

| 항목 | 서비스 | 무료 한도 | 베타 예상 사용량 | 비용 |
|---|---|---|---|---|
| 프론트 호스팅 | Vercel | 100GB/월 | ~20GB | $0 |
| DB + Auth | Supabase | DB 500MB, 50K MAU | ~50MB, ~100명 | $0 |
| 자동화 | GitHub Actions | 2,000분/월 | ~60분 | $0 |
| 도메인 (선택) | Cloudflare 등 | — | 연 1회 결제 | ~$1.25/월 |
| **AI (LLM)** | 제공사 선정 후(Claude 등) | — | 캐릭터 대화 옵션 A 선택지·반응 생성 | **월 상한**(금액 미정, 제공사 선정 후 확정) |
| **TTS** | 제공사 선정 후 | — | 도서 낭독 **배치 사전 생성**(실시간 금지) | **문자 상한**(금액 미정) |
| **오디오 스토리지** | **Cloudflare R2 우선 검토** vs Supabase Storage | R2: egress 무료 | 음성 자산 반복 스트리밍 | 용량 단가(미정, R2 egress 무료가 유리) |
| **합계** | | | | 기본 인프라 월 $0~$1.25 + **AI/TTS/스토리지 월 상한 내**(제공사 선정 후 확정) |

> 기본 인프라는 베타 100명 기준 무료 티어 내(1,000~10,000명까지 월 $0~$25). **AI/TTS/스토리지는 별도 유료** — 베타 기간 월 비용 상한으로 통제(토큰·문자 상한 + 배치 사전 생성), 상한 금액은 제공사 선정 후 PM 확정.

---

## 6. 기술 스택 결정

### 프론트엔드

| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js 14 (App Router) + TypeScript** | React 표준, Vercel 최적, Server Components로 SEO·성능 동시 확보 |
| 스타일링 | **Tailwind CSS** | 빠른 개발, Claude Design 산출물과 호환 |
| UI 컴포넌트 | **shadcn/ui + Radix UI** | 무료, 커스터마이즈 가능, 접근성 보장 |
| 책 뷰어 | **자체 뷰어(Book Dash) + epub.js + h5p-standalone** | ~~HTML(Book Dash) → iframe~~ (구 계획, ADR-0035로 대체) → 자체 뷰어(A안: 무텍스트 이미지 + 렌더 텍스트 + marks 하이라이트), ePub → epub.js, H5P(GDL) → h5p-standalone |
| 상태 관리 | **Zustand + React Query** | 글로벌 상태 + 서버 상태 분리 |
| 폼 처리 | **React Hook Form + Zod** | 표준 검증 조합 |
| 아이콘 | **Lucide React** | 둥근 outline 스타일, shadcn과 호환 |

### 백엔드

| 항목 | 선택 | 이유 |
|---|---|---|
| BaaS | **Supabase** | PostgreSQL + Auth + Storage + Realtime + RLS 통합 |
| 인증 | **Supabase Auth** | 이메일·카카오·구글 통합, RLS 자동 연동 |
| API | **Supabase REST + RPC + Next.js API Routes** | 단순 CRUD는 Supabase, 복잡 로직은 Next.js |
| 권한 관리 | **Row Level Security (RLS)** | 사용자별 데이터 분리 자동화 |

### 자동화·운영

| 항목 | 선택 | 이유 |
|---|---|---|
| 콘텐츠 동기화 | **GitHub Actions (cron)** | 무료 2,000분/월, YAML로 설정 |
| 콘텐츠 미러 | **GitHub Pages + jsDelivr** | 무료 무제한 CDN, 핫링크 안전 |
| 모니터링 | **Vercel Analytics + Supabase Dashboard** | 무료, 통합 모니터링 |
| 에러 추적 | Phase 2에 Sentry 무료 티어 추가 | 베타 단계는 Vercel 로그로 충분 |

### 개발 환경

- **Node.js** 20 LTS 이상
- **패키지 매니저** pnpm 권장
- **Git** GitHub Private Repo로 시작
- **에디터** VS Code + Claude Code 확장
- **로컬 DB** Supabase CLI (Docker 기반)

---

## 7. 데이터베이스 스키마

### ERD 개요 (6개 테이블)

```
profiles ──── children ──── reading_sessions
  (학부모)     (자녀)              ↕
                │            books ★ (핵심)
                ├──── favorites
                └──── child_badges
```

### 테이블 요약

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `profiles` | Supabase Auth users와 1:1 매핑되는 학부모 계정 | id, email, display_name, role |
| `children` | 학부모의 자녀 정보 (다자녀 지원 스키마, 베타는 1명) | parent_id, name, age, current_level, points |
| `books` ★ | 콘텐츠 카탈로그 핵심 테이블. 모든 책의 메타데이터·라이선스·어트리뷰션 | source_platform, title, cover_url, content_url, content_type, level, license, attribution_text |
| `reading_sessions` | 자녀의 책 읽기 기록 | child_id, book_id, started_at, completed_at, pages_read, is_completed |
| `favorites` | 자녀의 즐겨찾기 | child_id, book_id |
| `child_badges` | 자녀가 획득한 배지 | child_id, badge_code, earned_at |

### 핵심 SQL (Phase 0에서 그대로 실행)

```sql
-- books 테이블 (핵심)
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform TEXT NOT NULL CHECK (source_platform IN
    ('book_dash', 'gdl', 'storyweaver', 'bloom', 'pg', 'librivox', 'asb')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  content_url TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('html', 'epub', 'h5p', 'pdf')),
  language TEXT NOT NULL DEFAULT 'en',
  level INT CHECK (level BETWEEN 1 AND 5),
  age_min INT,
  age_max INT,
  license TEXT NOT NULL CHECK (license IN
    ('cc-by-4-0', 'cc-by-sa-4-0', 'cc0', 'public-domain')),
  author TEXT,
  illustrator TEXT,
  original_url TEXT NOT NULL,
  attribution_text TEXT NOT NULL,  -- NOT NULL: 어트리뷰션 누락 자동 차단
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_platform, source_id)
);
```

### 라이선스 자동 차단 트리거

```sql
-- CC BY-NC 등 비상업 라이선스가 실수로 들어오면 DB 레벨에서 자동 거부
CREATE OR REPLACE FUNCTION enforce_commercial_license()
RETURNS trigger AS $$
BEGIN
  IF NEW.license NOT IN ('cc-by-4-0', 'cc-by-sa-4-0', 'cc0', 'public-domain') THEN
    RAISE EXCEPTION '상업 사용 불가 라이선스 차단: %', NEW.license;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER books_license_check
BEFORE INSERT OR UPDATE ON books
FOR EACH ROW EXECUTE FUNCTION enforce_commercial_license();
```

> 이 트리거가 있으면 코드 버그로 NC 라이선스 책이 들어와도 DB 레벨에서 차단됩니다. **법적 의무를 코드가 아닌 데이터베이스 제약으로 강제하는 것이 이 설계의 핵심**입니다.

---

## 8. Phase 0 상세 — 사전 준비 (2주)

> 이 단계의 핵심: **"아직 화면은 거의 안 만든다. 인프라와 콘텐츠 파이프라인만 만든다."**
> 2주 후 결과: 빈 사이트 + Supabase에 약 900권 콘텐츠 적재 완료.

### Week 1 — 계정·도구·디자인 시안

| Day | 작업 | 산출물 / 검증 |
|---|---|---|
| D1~D2 | 핵심 계정 생성 — GitHub, Vercel, Supabase(Seoul region) | Supabase Project URL, anon key, service_role key 기록 (service_role은 절대 노출 금지) |
| D3~D4 | Claude Code로 Next.js 14 + TypeScript + Tailwind + shadcn/ui 초기 셋업 | 로컬 `pnpm dev` 실행 시 기본 페이지 표시 |
| D5~D7 | Claude Design으로 5개 화면 시안 생성 → design.md 작성 | design.md에 컬러 토큰·타이포·5개 화면 와이어프레임 포함 |

**Supabase 프로젝트 생성 시 반드시 확인**
- Region: **Northeast Asia — Seoul** (한국 사용자 레이턴시 최적)
- Project URL, anon key, service_role key 메모장에 저장

**Claude Code 초기 셋업 프롬프트**

```
프로젝트 이름: kikibooks-web
다음 환경을 셋업해줘:
1. Next.js 14 App Router + TypeScript + Tailwind CSS
2. shadcn/ui 초기화 (style: default, base color: slate)
3. Supabase 클라이언트 설치 (@supabase/supabase-js, @supabase/ssr)
4. epub.js, h5p-standalone, lucide-react, zustand, @tanstack/react-query,
   react-hook-form, zod 설치
5. .env.local 템플릿 (.env.example로 생성)
6. 폴더 구조 생성: app/ components/ lib/ types/ hooks/ scripts/
7. README.md 작성
```

### Week 2 — DB · API · 콘텐츠 동기화

| Day | 작업 | 산출물 / 검증 |
|---|---|---|
| D8~D9 | Supabase 6개 테이블 마이그레이션 SQL 실행 + 라이선스 트리거 | Supabase Dashboard에서 테이블 + RLS 활성화 + 트리거 작동 확인 |
| D10~D11 | Book Dash 동기화 스크립트 작성 (`scripts/sync-book-dash.ts`) | 로컬 실행 시 books 테이블에 211권+ 적재, attribution_text 100% 채워짐 |
| D12 | GDL API 동기화 스크립트 작성 (`scripts/sync-gdl.ts`) | 영어 CC BY/SA 책 600권+ 적재, level/age 자동 추정 작동 |
| D13 | GitHub Actions cron 워크플로 설정 (`.github/workflows/sync-content.yml`) | GitHub Secrets 등록, 수동 트리거 성공 |
| D14 | 첫 자동 동기화 실행 + 라이선스 재검증 | ✅ 약 900권+ 적재, NC 라이선스 0건, 어트리뷰션 누락 0건 |

### ✅ Phase 0 완료 체크리스트

- [ ] GitHub Private Repo 생성됨
- [ ] Supabase 프로젝트(Seoul region) 생성, 6개 테이블 + 라이선스 트리거 작동
- [ ] Vercel 프로젝트 GitHub 연동 완료, 로컬 dev 서버 정상
- [ ] design.md 작성 완료 (5개 화면 명세 포함)
- [ ] Book Dash 200권+ 적재 완료
- [ ] GDL 영어 CC BY 600권+ 적재 완료
- [ ] `license`가 cc-by-nc-\* 인 책 0건 (트리거 정상 작동 증명)
- [ ] `attribution_text` 누락 0건 (`SELECT COUNT(*) FROM books WHERE attribution_text IS NULL` → 0)
- [ ] GitHub Actions 수동 트리거 성공

---

## 9. Phase 1 상세 — MVP 베타 출시 (4~6주)

> 이 단계의 핵심: **"실제로 학부모와 자녀가 사용할 수 있는 사이트를 만든다."**
> 베타 KPI: 사용자 50~100명, 완독 세션 100건.

### 5개 핵심 화면 목록

| 번호 | 화면명 | URL | 핵심 기능 |
|---|---|---|---|
| Screen 01 | 랜딩 페이지 | `/` | 히어로 + 인기 책 미리보기 + CTA + 파트너 로고 |
| Screen 02 | 로그인 후 홈 | `/home` | 자녀 프로필 칩 + 오늘의 추천 + 카테고리 그리드 + 스트릭 |
| Screen 03 | 책 상세 | `/book/[id]` | 표지·메타데이터 + **어트리뷰션 박스(CC BY 4.0 법적 의무)** + 읽기 버튼 |
| Screen 04 | 책 뷰어 | `/book/[id]/read` | content_type별 분기 + 진도 기록 + 페이지 넘김 |
| Screen 05 | 완독 보상 | `/book/[id]/celebrate` | 별 3개 애니메이션 + 포인트 +50 + 배지 부여 |

### Week 3~4 — 인증 + 공통 레이아웃

- Supabase Auth 설정 (이메일·구글·카카오) → `middleware.ts`, `auth/callback/route.ts`
- design.md 기반 Tailwind 토큰 등록 (컬러·폰트·border-radius·shadow)
- 공통 Header/Footer + shadcn/ui 컴포넌트 커스터마이즈
- 자녀 프로필 등록 온보딩 플로우 (`/onboarding`)

### Week 5 — Screen 01 + Screen 02

**Screen 01 랜딩 — Claude Code 프롬프트 예시**

```
app/page.tsx를 구현해줘:
- design.md의 Screen 01 명세 참조
- 비로그인 사용자에게 표시
- 추천 책 6권: SELECT * FROM books WHERE is_active = TRUE ORDER BY synced_at DESC LIMIT 6
- 이미 로그인된 사용자는 redirect('/home')
- 모바일 우선(390px), 태블릿/데스크탑 미디어 쿼리
```

**Screen 02 홈 — 핵심 구성요소**
- 인사 카드 ("안녕하세요, [학부모명]님 👋")
- 오늘의 추천: 자녀 `current_level ±1`, 아직 안 읽은 책 5권
- 카테고리 그리드 (2×4): 동물·가족·ABC·숫자·감정·자연·음식·잠자리
- 레벨 선택 바 (Level 1~5)
- 오늘의 학습 스트릭 (최근 7일 막대그래프)

### Week 6 — Screen 03 + Screen 04

**책 상세 페이지 — 어트리뷰션 박스(법적 의무)**

```
⚠️ AttributionBox 컴포넌트는 모든 책 상세 페이지에 100% 표시해야 합니다.
표시 항목:
  📚 출처: {플랫폼명}
  ✍️ 글: {author}   🎨 그림: {illustrator}
  📜 라이선스: CC BY 4.0 (링크 포함)
  🔗 원본 보기 (new tab)
```

**책 뷰어 — content_type별 분기**

```
content_type === 'html'  → 자체 뷰어(book_dash, ADR-0035 A안)   ※ 구 HtmlReader(iframe + sandbox)는 전환 완료 후 폐기 예정
content_type === 'epub'  → EpubReader (epub.js)
content_type === 'h5p'   → H5pReader (h5p-standalone)

완독 감지 → reading_sessions.completed_at SET
         → children.points += 50
         → router.replace(`/book/${id}/celebrate`)
```

### Week 7 — Screen 05 + 라이브러리

- 완독 보상: 별 3개 SVG 애니메이션 + 포인트 표시 + 배지 부여 (`child_badges` INSERT)
- 라이브러리 (`/library`): 레벨·카테고리 필터 + 키워드 검색 + 무한 스크롤
- 모바일 반응형 전체 점검 (390px / 768px / 1280px)

### Week 8 — 베타 테스트 + 배포

- Lighthouse 점수 점검: Performance 80+, Accessibility 90+
- 학부모 5~10명 베타 테스트, 피드백 P0/P1/P2 분류
- Vercel Production 배포 + 커스텀 도메인 연결
- Vercel Analytics 활성화

### ✅ Phase 1 베타 출시 체크리스트

**필수 기능**
- [ ] 비로그인 → 랜딩 페이지 정상
- [ ] 이메일·구글·카카오 가입·로그인 작동
- [ ] 첫 로그인 → 온보딩 → 자녀 등록 → /home
- [ ] 가입~완독까지 막힘 없이 진행 가능
- [ ] **책 상세 페이지 어트리뷰션 박스 100% 표시** (CC BY 4.0 법적 의무)
- [ ] Book Dash 자체 뷰어 정상(~~HTML iframe~~ 구 계획, ADR-0035로 대체), GDL H5P 정상
- [ ] 완독 시 포인트 +50, 첫 배지 부여
- [ ] 로그아웃 → 랜딩으로 복귀

**비기능 요건**
- [ ] 모바일(390px) 전체 화면 정상
- [ ] Lighthouse Performance ≥ 80, Accessibility ≥ 90
- [ ] 책 상세 FCP < 2초
- [ ] `SELECT COUNT(*) FROM books WHERE attribution_text IS NULL` → 0

**법적·운영 요건**
- [ ] 푸터에 파트너 로고 + CC BY 라이선스 안내
- [ ] 이용약관 / 개인정보처리방침 페이지 (법무 자문 권장)
- [ ] 14세 미만 가입 시 법정대리인 동의 처리

---

## 10. 콘텐츠 협상 트랙

베타 출시(Week 8) 직후부터 협상을 시작합니다. **베타 사용자 데이터가 협상력**이므로, 출시 전 협상을 서두를 이유가 없습니다.

### 우선순위 Top 5 — 베타 출시 후 즉시 시도

| 순위 | 협상 대상 | 기대 효과 | 연락처 | 예상 기간 |
|---|---|---|---|---|
| 1 | **JYBooks 노부영** | Eric Carle·Browne·Donaldson 한국 노출 IP 한 번에 확보. 이미 e-러닝 운영 경험 | JYbooks@JYbooks.com / 1588-8450 | 3~6개월 |
| 2 | **웅진주니어** | Anthony Browne 15권(돼지책 등) 한국어판 디지털 권리 | wjjr@wjthinkbig.com | 3~6개월 |
| 3 | **Vooks distribution** | 350+ 애니메이션 그림책 카탈로그 화이트라벨. Amazon Prime·Discovery 사례 있음 | support@vooks.com | 4~8개월 |
| 4 | **Epic School Plus** | 40,000권 카탈로그 SSO 통합 가능 | epicschoolplus@getepic.com | 3~6개월 |
| 5 | **Brightly Storytime(PRH)** | PRH가 "스트리밍 deal 모색 중" 공식 언급. 2024~2026 협상 적기 | storytime@readbrightly.com | 4~8개월 |

### Phase 3 협상 (출시 18개월 이후)

- **Magic Light Pictures(Gruffalo 13편)** — 한국 sub-agent 부재로 직접 협상 가능. `office@magiclightpictures.com`, +44 20 7631 1800
- **시공주니어 Eric Carle 70종** — 디지털 권리 포함 여부 확인 필수
- **Scholastic Weston Woods** — Caldecott 수상작 다수. `westonwoodsquestions@scholastic.com`

### 협상 시 반드시 챙길 7가지

1. **지역(territory) 명시** — 한국 한정 vs 글로벌. 초기는 한국 한정으로 비용 최적화
2. **디지털 권리 세분화** — 출판·e-book·read-along audio·streaming video를 형태별로 분리 명시
3. **영상화권 vs 텍스트권 분리 확인** — Gruffalo 책은 Macmillan, 28분 애니메이션은 Magic Light가 별도 보유
4. **단기 시범 우선** — 1~2년 시범 → 사용량 데이터 확보 후 5년 갱신
5. **매출 분배 + minimum guarantee 하이브리드** — 초기 매출 불확실성 흡수
6. **PRH 정책: 언어별 grant** — 한국어와 영어 별도 신청. blanket 라이선스 없음
7. **Closed environment 요건** — SSO·결제 게이트로 "닫힌 환경"이 되도록 설계

---

## 11. Claude Code 작업 분담

### 🟢 완전 자동 (약 95%)

다음은 명확한 프롬프트만 주면 Claude Code가 완성하는 작업입니다.

- 프로젝트 초기 셋업 (Next.js + Tailwind + shadcn)
- Supabase 마이그레이션 SQL 작성·실행
- Book Dash / GDL 콘텐츠 동기화 스크립트
- GitHub Actions YAML 작성
- 책 뷰어 컴포넌트 (epub.js + H5P 통합)
- 인증 플로우 (Supabase Auth + OAuth)
- 책 상세 + 어트리뷰션 박스
- 라이브러리 (필터·검색·페이지네이션)
- 진도 기록·완독 보상 로직
- 모바일 반응형 CSS
- 환경 변수·배포 설정

### 🟡 반자동 — Claude Code 후 사람 검토 (약 4%)

- Claude Design 시안 → design.md 변환 (토큰 명확화 필요)
- 책 카테고리 자동 분류 후 검수
- 책 레벨 자동 추정 후 큐레이터 조정
- 어색한 한국어 카피 수정

### 🔴 사람이 직접 (약 1%)

- Supabase / Vercel / GitHub 계정 생성·결제 정보
- 카카오·구글 OAuth 클라이언트 등록 (본인 인증)
- 도메인 구매·연결
- 베타 테스터 모집·피드백 수집
- 콘텐츠 큐레이션 최종 승인
- 약관·개인정보처리방침 검토 (법무 자문 권장)
- 출판사 협상 이메일 (Phase 2 이후)

### Claude Code에게 잘 지시하는 프롬프트 패턴

좋은 프롬프트에는 다음 6가지 요소가 포함됩니다.

```
다음 화면을 구현해줘:
① 파일 위치: app/book/[id]/page.tsx
② 참조 기준: design.md의 Screen 03 명세
③ 데이터 출처: Supabase books 테이블에서 [id]로 조회
④ 컴포넌트 분리: 어트리뷰션 박스는 components/book/AttributionBox.tsx
⑤ 타입 정의: types/book.ts에 Book 타입 정의 후 사용
⑥ 에러 처리: 책이 없으면 not-found.tsx 표시
```

---

## 12. 위험 요소와 대응책

| 위험 | 영향 | 확률 | 대응책 |
|---|---|---|---|
| 어트리뷰션 누락 | **매우 큼** (CC BY 종료 + 법적 분쟁) | 중 | DB 트리거로 `attribution_text` NULL 차단. `AttributionBox` 컴포넌트 필수 props |
| 라이선스 변경 (CC BY → NC) | 큼 | 매우 낮 | 월 1회 `verify-licenses.ts` 실행, 변경 감지 시 자동 `is_active = false` |
| 어린이 부적합 콘텐츠 노출 | 큼 (신뢰도 타격) | 중 | 큐레이션 정책 개정(ADR-0022 §2.6): **표본 검수 + 사용자 신고/즉시 차단**(`is_active=false`·블랙리스트 cron-proof) (Phase 1.5) |
| 아동 대상 AI 안전성 | 큼 | 낮 | **옵션 A 선택형 대화로 구조적 저감**(자유 텍스트 입력 없음 → 부적절 입력 유도·PII 유출 경로 차단) + 책 컨텍스트 한정 프롬프트·안전 가드레일 (ADR-0023 §2.7) |
| AI/TTS 비용 폭주 | 중 | 중 | **베타 월 비용 상한** + **배치 사전 생성**(실시간 TTS 금지) + 토큰·문자 상한 (ADR-0023 §2.8) |
| 큐레이션 표본 검수 누락 | 중 | 중 | 사용자 **신고 + admin 즉시 차단**(`is_active=false`)·블랙리스트 안전망으로 표본 검수 공백 보완 |
| TTS 2차 저작물 라이선스 | 큼 | 낮 | TTS 음성=원본 derivative: **CC BY-SA 원본 음성은 BY-SA 승계**, BY/BY-3.0 음성은 어트리뷰션 의무, 재생 UI에 원작 표기 (ADR-0023 §2.6) |
| ~~Book Dash HTML iframe 호환성~~ (구 계획, ADR-0035로 대체 — 자체 뷰어 전환으로 iframe 위험 소멸) | ~~중~~ | ~~중~~ | 이미지는 book-images 버킷 창고 복사(ADR-0036)로 외부 종속 제거 |
| GDL API 다운 | 작음 | 낮 | 1주 단위 캐시 유지. 다운 시에도 기존 데이터로 서비스 가능 |
| Supabase 무료 한도 초과 | 중 | 낮 | 베타 100명까지 충분. 1,000명 넘으면 Pro $25/월 |
| OAuth 설정 실패 | 중 (가입 차단) | 낮 | 이메일 가입 우선 살리고, OAuth는 나중에 추가 |
| 외부 CDN 다운 | 중 | 낮 | Phase 2에 GitHub Pages 미러 이중화 |
| 협상 결렬 | 작음 (베타 영향 없음) | 중 | 베타는 무료 콘텐츠 약 900권+로 작동 중. StoryWeaver·Bloom으로 보충 가능 |
| `Peter Rabbit™` 상표 침해 | 큼 | 낮 | Beatrix Potter 제작 시 로고·캐릭터명 상표적 사용 금지. "by Beatrix Potter"만 표기 |

---

## 13. 의사결정 트리거

"언제 다음 단계로 가야 하나?"를 감이 아닌 데이터로 판단합니다.

| 전환 시점 | 트리거 조건 | 실행 액션 |
|---|---|---|
| Phase 1.5 완료 → 베타 정식 공개 | 내부 테스터 5~10명이 가입~완독을 막힘 없이 완료 + **노출 ~960권** + **디자인 리뉴얼 완료** | Vercel Production 배포 + 초대 링크 공유 |
| 베타 → Phase 2 진입 | 유료 가입 의향 100명 또는 완독 세션 300건 | Vooks/Epic 견적 요청 + 한국 출판사 협상 시작 |
| Phase 2 → Phase 3 진입 | MAU 5,000 + 학원 client 50개 + ARR USD 200k | Magic Light 라이선스 협상 + 결제 시스템 도입 |
| Supabase Pro 전환 | MAU 1,000명 또는 DB 400MB 도달 | 월 $25 Pro 플랜 업그레이드 |
| **긴급 중단** | 어트리뷰션 누락 감지 또는 라이선스 변경 알림 | 해당 책 즉시 `is_active = false` → 검토 후 복구 또는 제거 |

---

## 14. 지금 바로 시작할 4가지 액션

이 문서를 받은 직후 일주일 안에 끝낼 수 있는 일입니다.

### Action 1 — 계정 4개 만들기 (1~2시간)

- [github.com](https://github.com) → Private Repo 생성
- [vercel.com](https://vercel.com) → GitHub 연동 가입
- [supabase.com](https://supabase.com) → 새 프로젝트, region: **Northeast Asia (Seoul)**
- (선택) [cloudflare.com](https://cloudflare.com) → 도메인 후보 검색 (kikibooks.com / kikibooks.kr)

### Action 2 — Claude Design으로 5개 화면 시안 만들기 (1~2일)

- 기존 Claude Design 시안 프롬프트를 입력
- 5개 화면: 랜딩 / 로그인 후 홈 / 책 상세 / 책 뷰어 / 완독 보상
- 결과물을 `design.md`로 정리 (컬러 토큰 + 컴포넌트 명세 + 화면별 와이어프레임)

### Action 3 — Claude Code에게 Phase 0 착수 지시

**Claude Code에게 줄 첫 프롬프트**

```
이 계획서(키키북스_구축_최종_계획서.md)와 design.md 두 문서를 기준으로
HelloKiki Phase 0를 진행해줘.

본 계획서의 '8. Phase 0 상세' 섹션을 따라 Day 1부터 Day 14까지 순서대로
작업하되, 각 Day가 끝날 때마다 내가 검증할 수 있도록 결과를 보고해줘.

가장 먼저 D3~D4의 Next.js 초기 셋업부터 시작해줘.
```

### Action 4 — 협상 사전 작업 (베타 출시 전에 해둘 일)

- JYBooks 노부영·웅진주니어 공식 이메일 주소 확인 + 회사 소개 메일 초안 작성
- Vooks distribution 파트너십 사례(Amazon Prime·Discovery) 조사
- 이용약관·개인정보처리방침 변호사 검토 일정 잡기 (베타 출시 2주 전까지)

---

## 15. 부록 — 헷갈리는 개념 정리

### CC BY 4.0이 무엇이고 왜 영리 사용이 가능한가

Creative Commons Attribution 4.0 International의 줄임말입니다. 저작권자가 **"저작자만 표시하면 누구나 자유롭게 써도 좋다(영리 포함)"** 고 미리 허락한 라이선스입니다. HelloKiki가 유료 서비스여도 사용 가능하지만, 다음 4가지는 반드시 표시해야 합니다.

1. 저작자(author) 이름
2. 저작물 제목(title)
3. 라이선스 종류 (CC BY 4.0) + 라이선스 링크
4. 원본 출처 URL

이 4가지를 빠뜨리면 라이선스 위반으로 권리가 자동 종료됩니다. 그래서 `books.attribution_text`를 NOT NULL로 강제하고, `AttributionBox` 컴포넌트가 모든 책 상세 페이지에 100% 표시되도록 설계했습니다.

### Public Domain과 CC0의 차이

| 구분 | Public Domain (PD) | CC0 |
|---|---|---|
| 의미 | 저작권 보호 기간이 끝나 자연스럽게 자유 사용 가능 | 저작권자가 권리를 포기하고 자발적으로 PD에 가깝게 공개 |
| 예시 | Beatrix Potter(1943 사망) — 한국 사후 50년 적용으로 2014년부터 PD | LibriVox 낭독 파일 |
| 어트리뷰션 의무 | 법적 의무 없음 (표시하는 것이 관례) | 법적 의무 없음 |

### RLS(Row Level Security)가 무엇인가

Supabase PostgreSQL의 핵심 보안 기능입니다. **"학부모 A는 자기 자녀 B의 데이터만 볼 수 있다"** 는 규칙을 데이터베이스 레벨에서 강제합니다. 코드에서 실수로 다른 사용자 데이터를 조회해도 DB가 빈 결과를 반환합니다. HelloKiki의 모든 테이블에 RLS가 활성화되어 있어 보안 사고 확률이 매우 낮습니다.

### Closed Environment가 왜 협상에서 중요한가

Penguin Random House 같은 대형 출판사는 **"read-aloud 영상은 닫힌 환경(closed environment)에서만 허용한다"** 는 정책이 있습니다. HelloKiki는 (1) SSO 또는 결제 게이트로 가입한 사용자만 (2) 검색엔진 노출 없이 (3) 콘텐츠 다운로드 불가 형태로 제공하므로 closed 요건을 충족합니다. 이 설계가 향후 PRH·Brightly Storytime 협상의 핵심 무기가 됩니다.

### 비개발자 풀스택 빌더를 위한 5가지 원칙

1. Claude Code에게 시킬 때는 `design.md를 참조해서`, `본 계획서의 X절을 참조해서`처럼 기준 문서를 항상 명시한다.
2. 한 번에 큰 작업 말고, Day 단위로 쪼개서 지시한다. 그래야 검증이 쉽다.
3. Claude Code가 작성한 코드를 다 이해할 필요는 없지만, **"이 화면이 실제로 작동하는가"** 는 매번 직접 클릭해서 확인한다.
4. DB 스키마와 라이선스 트리거 같은 법적·구조적 부분은 임의로 수정하지 않는다. 수정이 필요하면 본 계획서를 먼저 업데이트한다.
5. **협상 트랙은 천천히, 기술 트랙은 빠르게.** 두 트랙의 속도가 다르다는 것을 받아들이면 마음이 편해진다.

---

*문서 끝. 본 계획서를 프로젝트 루트의 `PLAN.md`로 저장하고, Claude Code 작업 시마다 참조 문서로 지정하기를 권장합니다.*