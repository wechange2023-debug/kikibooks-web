# ADR 0001 — 키키북스 기술 스택 선정

> **ADR (Architectural Decision Record)**: 장기적인 기술 의사결정을 기록하는 문서.
> 이 결정이 왜 내려졌는지, 어떤 대안이 있었는지를 미래의 자신과 협업자(Claude Code 포함)에게 남긴다.

**문서 번호** ADR-0001
**상태** Accepted (확정)
**결정일** 2026-05-13
**작성자** 키키북스 팀
**관련 문서** `PLAN.md` 6절, `claude.md` 5절(라우팅), `docs/guidelines/db-schema-rules.md`

---

## 1. 컨텍스트 (배경)

키키북스는 다음 제약 조건 하에 베타를 3개월 내 출시해야 한다.

- **개발 인력**: 비개발자 풀스택 빌더 1명 + Claude Code (자율 주행)
- **예산**: 월 운영비 $0~$25 목표 (베타 단계)
- **사용자**: 한국 유아 학부모 (모바일 우선)
- **콘텐츠**: CC BY 4.0 / Public Domain 1,300권+ (외부 CDN 호환 필수)
- **법적 요건**: 라이선스 어트리뷰션 의무, RLS 기반 자녀 데이터 격리

이 제약 조건 하에서 가장 빠르게 베타를 출시하고, 100명~10,000명 사용자 규모까지 무료 티어로 확장 가능한 스택을 선정해야 한다.

---

## 2. 결정 (선택한 스택)

### 2.1 프론트엔드

| 항목 | 선택 | 버전 |
|---|---|---|
| 프레임워크 | **Next.js (App Router) + TypeScript** | 14.x |
| 스타일링 | **Tailwind CSS** | 3.x |
| UI 컴포넌트 | **shadcn/ui + Radix UI** | 최신 |
| 책 뷰어 | **epub.js + iframe + h5p-standalone** | 최신 |
| 상태 관리 | **Zustand + React Query (TanStack Query)** | 최신 |
| 폼 처리 | **React Hook Form + Zod** | 최신 |
| 아이콘 | **Lucide React** | 최신 |

### 2.2 백엔드 및 인프라

| 항목 | 선택 | 비고 |
|---|---|---|
| BaaS | **Supabase** (Seoul region) | PostgreSQL + Auth + Storage + Realtime + RLS 통합 |
| 인증 | **Supabase Auth** | 이메일·구글·카카오 OAuth |
| API | **Supabase REST + RPC + Next.js API Routes** | 단순 CRUD는 Supabase, 복잡 로직은 Next.js |
| 권한 관리 | **Row Level Security (RLS)** | 사용자별 데이터 분리 자동화 |
| 호스팅 | **Vercel** | Next.js 최적, 무료 100GB/월 |
| 자동화 | **GitHub Actions (cron)** | 무료 2,000분/월 |
| 콘텐츠 CDN | **GitHub Pages + jsDelivr** | 무료 무제한 |
| 모니터링 | **Vercel Analytics + Supabase Dashboard** | 무료 |

### 2.3 개발 환경

- Node.js 20 LTS 이상
- pnpm 패키지 매니저
- GitHub Private Repo
- VS Code + Claude Code 확장
- Supabase CLI (로컬 DB Docker)

---

## 3. 대안 비교

각 영역에서 검토했던 다른 선택지와 탈락 사유를 기록한다.

### 3.1 프론트엔드 프레임워크

| 후보 | 장점 | 탈락 사유 |
|---|---|---|
| **Next.js (선택)** | Vercel 최적, Server Components, SEO·성능 동시 확보 | — |
| Vite + React SPA | 빠른 개발 환경 | SSR 부재로 SEO·초기 로딩 불리, 학부모 모바일 환경 부적합 |
| Remix | 우수한 DX | Vercel 외 호스팅 비용 + 한국 커뮤니티 자료 부족 |
| Astro | 정적 사이트 최적 | 인증·실시간 상태 관리 시 추가 복잡도 |
| SvelteKit | 작은 번들 사이즈 | Claude Code 학습 데이터 양 부족, shadcn 호환성 낮음 |

### 3.2 백엔드 / BaaS

| 후보 | 장점 | 탈락 사유 |
|---|---|---|
| **Supabase (선택)** | PostgreSQL 표준 SQL + RLS + Seoul region + 무료 티어 관대 | — |
| Firebase | 구글 생태계, 검증된 안정성 | NoSQL이라 복잡한 책 메타데이터 쿼리 불편, RLS 동등 기능 부재(Security Rules는 별도 학습) |
| AWS Amplify | 무한 확장성 | 비개발자 학습 곡선 가파름, 무료 한도 빠르게 소진 |
| 직접 구축 (Node.js + PostgreSQL on Railway) | 완전한 제어권 | 인증·실시간·Storage 직접 구현 부담, 3개월 일정 불가 |
| PocketBase | 단일 파일 SQLite | RLS 동등 기능 부재, 동시 사용자 100명 이상 시 우려 |

### 3.3 호스팅

| 후보 | 장점 | 탈락 사유 |
|---|---|---|
| **Vercel (선택)** | Next.js 최적, 무료 100GB | — |
| Netlify | Vercel과 유사한 무료 티어 | Next.js App Router 최적도가 Vercel보다 낮음 |
| Cloudflare Pages | 무료 한도 매우 관대 | Next.js SSR 일부 기능 제약 (Workers 환경) |
| AWS Amplify Hosting | AWS 생태계 통합 | 설정 복잡, 비개발자 부담 |

### 3.4 콘텐츠 동기화 자동화

| 후보 | 장점 | 탈락 사유 |
|---|---|---|
| **GitHub Actions (선택)** | 무료 2,000분/월, YAML 단순 설정 | — |
| Supabase Edge Functions cron | Supabase 통합 | 무료 한도 적음, 외부 API 호출 시 타임아웃 우려 |
| Vercel Cron Jobs | Vercel 통합 | Hobby 플랜에서 일 1회 제한 |
| 별도 VPS (Railway, Fly.io) | 완전한 제어 | 비용 발생, 관리 부담 |

---

## 4. 결정 근거 (왜 이 조합인가)

### 4.1 비개발자 + Claude Code 조합에 최적

- **Next.js + Tailwind + shadcn**: Claude Code의 학습 데이터에서 가장 풍부하게 다뤄지는 조합. 코드 생성 품질이 가장 안정적.
- **Supabase**: SQL 표준이라 Claude Code가 마이그레이션 SQL을 정확히 작성. Firebase의 Security Rules는 Claude Code도 종종 틀린다.
- **GitHub Actions YAML**: 구조가 단순해 Claude Code가 한 번에 완성된 파일을 생성하기 쉽다.

### 4.2 무료 티어로 베타 100명 충분 커버

| 서비스 | 무료 한도 | 베타 100명 예상 | 여유 |
|---|---|---|---|
| Vercel | 100GB/월 | ~20GB | 5배 |
| Supabase DB | 500MB | ~50MB | 10배 |
| Supabase Auth | 50,000 MAU | ~100명 | 500배 |
| GitHub Actions | 2,000분/월 | ~60분 | 33배 |

→ **베타 단계에서 월 운영비 $0 달성 가능.** 사용자 1,000명까지도 $0~$25 범위 유지.

### 4.3 법적 안전망 강화

- **PostgreSQL CHECK 제약 + 트리거**: NC 라이선스 INSERT를 DB 레벨에서 차단. 코드 버그로 우회 불가.
- **RLS**: 학부모 A가 학부모 B의 자녀 데이터를 절대 볼 수 없음을 DB가 강제.
- 이 두 가지가 Firebase 같은 NoSQL 환경에서는 동등한 보장이 어렵다.

### 4.4 한국 사용자 레이턴시

- Supabase Seoul region: 도쿄/싱가포르 대비 응답 속도 30~50ms 단축
- Vercel: 한국에 엣지 노드 보유, 정적 자산 캐싱 최적

---

## 5. 결과 및 영향 (Consequences)

### 5.1 긍정적 결과

- 3개월 내 베타 출시 가능성 매우 높음 (Phase 0 + Phase 1 = 약 8주)
- 월 운영비 $0~$1.25로 시작 → 사용자 검증 후 점진 확장
- Claude Code의 자율 주행 품질 최대화 (학습 데이터 풍부)
- 법적 안전망이 DB 레벨에 내장되어 라이선스 위반 리스크 최소화

### 5.2 부정적 결과 / 트레이드오프

- **Vercel 종속**: 향후 호스팅 비용 증가 시 마이그레이션 비용 발생 (Phase 3 이상에서 검토)
- **Supabase 무료 한도**: 1,000명 초과 시 Pro $25/월 전환 필요 (예상 시점: 2027년)
- **shadcn/ui 학습 곡선**: 컴포넌트가 코드로 복사되는 구조라 초기 이해 시간 필요
- **카카오 OAuth**: 한국 특수 환경이라 Supabase 기본 제공 OAuth 외 별도 설정 필요

### 5.3 향후 검토 트리거

다음 조건 충족 시 본 ADR을 재검토하고 신규 ADR을 작성한다.

| 트리거 | 검토 대상 |
|---|---|
| MAU 1,000명 초과 | Supabase Pro 전환 + CDN 이중화 |
| MAU 10,000명 초과 | 별도 백엔드 분리 또는 Supabase Team 플랜 |
| 콘텐츠 50,000권 초과 | Elasticsearch 등 검색 엔진 분리 |
| B2B 학원 결제 시작 | Stripe 또는 Toss Payments 통합 ADR |
| Magic Light (Gruffalo) 동영상 라이선스 체결 | DRM 동영상 스트리밍 인프라 ADR |

---

## 6. 미래 자신을 위한 메모

비개발자 사용자가 이 ADR을 읽을 때 알아두면 좋은 것:

1. **이 스택은 "지금 빨리, 무료로, 안전하게"의 균형점**이다. 완벽한 스택이 아니라 현재 단계의 최적해다.
2. Claude Code에게 "다른 프레임워크로 다시 만들어줘"라고 시키지 마라. 그 작업은 베타 출시 후 사용자 데이터를 보고 결정한다.
3. Supabase Dashboard에 로그인하면 DB 내용을 직접 클릭으로 확인할 수 있다. 코드를 읽지 못해도 데이터는 볼 수 있다.
4. Vercel은 GitHub에 코드를 push하면 자동 배포된다. 별도 명령어 학습 불필요.
5. 이 스택의 약점은 "한국 결제 시스템"이다. Toss Payments 통합 시점에 별도 ADR을 작성하게 될 것이다.

---

## 7. 부록: 의사결정 요약 한 줄

> **"비개발자가 Claude Code와 함께 3개월 안에 안전한 무료 베타를 띄울 수 있는 조합"**
> = Next.js + Supabase + Vercel + GitHub Actions

---

*문서 끝. 본 ADR의 변경은 새로운 ADR(예: ADR-0010)으로 작성하고, 본 문서는 "Superseded by ADR-XXXX" 표시 후 유지합니다.*
