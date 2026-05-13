import { Button } from '@/components/ui/button';

// 디자인 토큰 적용 확인용 페이지. Phase 1 화면 작업 시작 시 교체될 예정.
export default function Page() {
  return (
    <main className="min-h-screen px-8 py-16">
      <div className="mx-auto max-w-2xl space-y-10">
        <header className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-text-variant">
            Phase 0 · Setup Complete
          </p>
          <h1 className="font-display text-[30px] font-semibold leading-[1.1] text-text">
            Kikibooks · Setup Complete
          </h1>
          <p className="text-base text-text-variant">
            Next.js 14 + Tailwind + Design System v1.0 토큰이 정상 적용되었습니다.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="font-display text-[20px] font-semibold text-text">
            컬러 토큰
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-md bg-primary p-5 text-on-primary shadow-elev-1">
              <p className="text-sm font-semibold">Primary</p>
              <p className="text-xs opacity-80">CTA · 강조</p>
            </div>
            <div className="rounded-md bg-secondary p-5 text-on-secondary shadow-elev-1">
              <p className="text-sm font-semibold">Secondary</p>
              <p className="text-xs opacity-80">보조 액션</p>
            </div>
            <div className="rounded-md bg-tertiary p-5 text-on-tertiary shadow-elev-1">
              <p className="text-sm font-semibold">Tertiary</p>
              <p className="text-xs opacity-80">정보형</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-[20px] font-semibold text-text">
            자녀 레벨 컬러 (1 → 5)
          </h2>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-pill bg-level-1 px-4 py-2 text-sm font-semibold text-text-inverse">
              Level 1 · 새싹
            </span>
            <span className="rounded-pill bg-level-2 px-4 py-2 text-sm font-semibold text-text-inverse">
              Level 2 · 하늘
            </span>
            <span className="rounded-pill bg-level-3 px-4 py-2 text-sm font-semibold text-text-inverse">
              Level 3 · 햇살
            </span>
            <span className="rounded-pill bg-level-4 px-4 py-2 text-sm font-semibold text-text-inverse">
              Level 4 · 꽃
            </span>
            <span className="rounded-pill bg-level-5 px-4 py-2 text-sm font-semibold text-text-inverse">
              Level 5 · 별
            </span>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-[20px] font-semibold text-text">
            shadcn/ui Button
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button>읽기 시작</Button>
            <Button variant="secondary">나중에</Button>
            <Button variant="outline">자세히</Button>
          </div>
        </section>

        <footer className="border-t border-outline pt-6 text-sm text-text-variant">
          <p>
            다음 단계: <code className="rounded-xs bg-surface-3 px-1.5 py-0.5 font-mono text-xs">.env.example</code> 복사 →
            <code className="rounded-xs bg-surface-3 px-1.5 py-0.5 font-mono text-xs">.env.local</code> 작성 →
            <code className="rounded-xs bg-surface-3 px-1.5 py-0.5 font-mono text-xs">pnpm dev</code>
          </p>
        </footer>
      </div>
    </main>
  );
}
