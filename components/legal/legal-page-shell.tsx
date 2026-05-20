import Link from 'next/link';

/**
 * 약관·개인정보처리방침 등 법적 고지 페이지의 공용 레이아웃.
 *
 * 본문 내용은 각 페이지(app/terms·app/privacy)가 LegalDocument 상수로 정의해
 * props로 넘긴다 — 베타 placeholder 텍스트이며 phase-14 정식 출시 전 변호사
 * 검토본으로 통째 교체된다(상단 베타 배너로 명시 — C-4 옵션 1).
 *
 * 서버 컴포넌트. 모든 색·간격은 design-system 토큰 클래스만 사용한다(Hard Rule 10).
 */
export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  /** 문서 제목 (예: "이용약관"). */
  title: string;
  /** 시행일 표기. */
  effectiveDate: string;
  /** 도입 문단(선택). */
  intro?: string;
  sections: LegalSection[];
}

interface LegalPageShellProps {
  doc: LegalDocument;
}

export function LegalPageShell({ doc }: LegalPageShellProps) {
  return (
    <main className="min-h-screen bg-bg px-5 py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link
          href="/"
          className="text-sm font-semibold text-primary transition-colors duration-200 ease-kiki hover:text-primary-hover"
        >
          ← 키키북스 홈
        </Link>

        <div className="rounded-md border border-warning bg-surface-2 px-4 py-3 text-sm text-text">
          베타 임시 문서 — 정식 출시 전 변호사 검토를 거쳐 교체될 예정입니다.
        </div>

        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold text-text">
            {doc.title}
          </h1>
          <p className="text-sm text-text-variant">
            시행일 {doc.effectiveDate}
          </p>
        </header>

        {doc.intro ? (
          <p className="break-keep text-sm leading-relaxed text-text-variant">
            {doc.intro}
          </p>
        ) : null}

        <div className="flex flex-col gap-6">
          {doc.sections.map((section, index) => (
            <section key={section.heading} className="flex flex-col gap-2">
              <h2 className="font-display text-base font-semibold text-text">
                제{index + 1}조 ({section.heading})
              </h2>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p
                  key={paragraphIndex}
                  className="break-keep text-sm leading-relaxed text-text-variant"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
