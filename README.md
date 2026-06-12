# Kikibooks

> 한국 유아(만 3~7세) 대상 영어 그림책 e-라이브러리.
> CC BY 4.0 / Public Domain 900권+ 무료 콘텐츠로 베타 출시 (ADR-0008).

## 시작하기

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경변수 설정

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열고 다음 3개 키를 입력합니다 (Supabase 대시보드 → Project Settings → **API**):

- `NEXT_PUBLIC_SUPABASE_URL` — 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — `sb_publishable_xxx` 형태의 공개 키
- `SUPABASE_SECRET_KEY` — `sb_secret_xxx` 형태의 **서버 전용** 비밀 키 (절대 노출 금지)

> `.env.local`은 `.gitignore`에 의해 커밋되지 않습니다.
> Secret 키는 비밀번호 매니저에 보관하고, 직접 타이핑하지 말고 복사해서 붙여넣으세요.
> 새 API 키 시스템(Publishable / Secret) 채택 배경은 [`docs/adr/0003-supabase-new-api-keys.md`](./docs/adr/0003-supabase-new-api-keys.md).
>
> ※ publishable 키는 옛 이름(`NEXT_PUBLIC_SUPABASE_ANON_KEY`)으로 입력해도 코드 fallback
> 덕분에 당분간 작동하지만, 새 이름으로의 전환을 권장합니다. (secret 키 옛 이름 fallback은
> 2026-06-12 제거 — `SUPABASE_SECRET_KEY`만 인식, ADR-0003 Amendment #3.)

### 3. 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 디자인 토큰 적용 확인 페이지를 확인합니다.

### 4. 그 외 명령

| 명령 | 용도 |
|---|---|
| `pnpm dev` | 개발 서버 실행 |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 프로덕션 서버 실행 |
| `pnpm lint` | ESLint 실행 |
| `pnpm type-check` | TypeScript 타입 검사 |

## 폴더 구조

```
kikibooks_platform/
├── app/                  # Next.js App Router (페이지·레이아웃·라우트 핸들러)
│   ├── globals.css       # 디자인 토큰 :root 변수 정의
│   ├── layout.tsx        # 루트 레이아웃 (Fraunces / Plus Jakarta Sans 폰트 로드)
│   └── page.tsx          # 셋업 확인 페이지 (Phase 1 시작 시 교체)
├── components/
│   └── ui/               # shadcn/ui 컴포넌트 (직접 작성)
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # 브라우저용 (anon key)
│   │   └── server.ts     # 서버용 (anon + service_role 분기)
│   └── utils.ts          # cn() 클래스 머지 헬퍼
├── hooks/                # React 커스텀 훅
├── types/                # TypeScript 타입 정의
├── docs/                 # 의도·가이드라인·ADR 문서 (수정 금지)
├── tasks/                # 페이즈 진행 추적 (_index.json)
├── scripts/              # 페이즈 실행기 등 자동화
├── claude.md             # Claude Code 운영 헌법 (라우터)
└── tailwind.config.ts    # 디자인 시스템 토큰 매핑
```

## 참조 문서

작업을 시작하기 전에 반드시 다음 문서를 확인합니다.

| 문서 | 역할 |
|---|---|
| [`claude.md`](./claude.md) | Claude Code 운영 헌법 — Hard Rules · 라우팅 테이블 |
| [`docs/design-system.md`](./docs/design-system.md) | 디자인 토큰 단일 진실 공급원 (v1.0) |
| [`docs/guidelines/license-rules.md`](./docs/guidelines/license-rules.md) | 라이선스·어트리뷰션 의무 (Hard Rule 1~6) |
| [`docs/adr/0001-tech-stack.md`](./docs/adr/0001-tech-stack.md) | 기술 스택 선정 근거 |
| [`docs/adr/0002-design-system.md`](./docs/adr/0002-design-system.md) | 디자인 시스템 도입 근거 |

## 페이즈 진행

```bash
python scripts/run_phase.py --status            # 현재 진행 상태
python scripts/run_phase.py --complete <id>     # 페이즈 완료 마크
```

진행 추적 파일: [`tasks/_index.json`](./tasks/_index.json)
