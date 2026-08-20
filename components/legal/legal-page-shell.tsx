import Link from 'next/link';

import { BRAND_NAME } from '@/lib/brand';
import {
  PRIVACY_LABEL,
  PRIVACY_PATH,
  TERMS_LABEL,
  TERMS_PATH,
} from '@/lib/legal';

/**
 * 약관·개인정보처리방침 등 법적 고지 페이지의 공용 레이아웃.
 *
 * 본문 내용은 각 페이지(app/terms·app/privacy)가 LegalDocument 상수로 정의해
 * props로 넘긴다 — 회사가 작성한 정식 문안이며, 서비스 운영에 따라 개정될 수
 * 있다(상단 배너로 명시).
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
  /**
   * 현재 문서 식별자 — 하단 상호 링크가 **반대편** 문서를 가리키게 한다(ADR-0061 D7).
   *
   * `doc.title` 문자열 비교로 분기하지 않는다 — 문안 개정에 취약하다.
   * 본 셸은 server component이므로 usePathname을 쓰지 않으며, 'use client'로
   * 전환하지도 않는다(호출부가 2곳뿐이라 명시 prop이 더 싸다).
   */
  current: 'terms' | 'privacy';
}

/** D7 상호 링크 — 현재 문서의 반대편. */
const CROSS_LINK = {
  terms: { href: PRIVACY_PATH, label: PRIVACY_LABEL },
  privacy: { href: TERMS_PATH, label: TERMS_LABEL },
} as const;

export function LegalPageShell({ doc, current }: LegalPageShellProps) {
  const cross = CROSS_LINK[current];

  return (
    <main className="min-h-screen bg-bg px-5 py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link
          href="/"
          className="text-label font-semibold text-primary transition-colors duration-200 ease-kiki hover:text-primary-hover"
        >
          ← {BRAND_NAME} 홈
        </Link>

        <div className="rounded-md border border-warning bg-surface-2 px-4 py-3 text-label text-text">
          본 문서는 회사가 작성한 정식 문서이며, 서비스 운영에 따라 개정될 수 있습니다.
        </div>

        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-semibold text-text">
            {doc.title}
          </h1>
          <p className="text-label text-text-variant">
            시행일 {doc.effectiveDate}
          </p>
        </header>

        {doc.intro ? (
          <p className="break-keep text-label leading-relaxed text-text-variant">
            {doc.intro}
          </p>
        ) : null}

        <div className="flex flex-col gap-6">
          {doc.sections.map((section, index) => (
            <section key={section.heading} className="flex flex-col gap-2">
              <h2 className="font-display text-body font-semibold text-text">
                제{index + 1}조 ({section.heading})
              </h2>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p
                  key={paragraphIndex}
                  className="break-keep text-label leading-relaxed text-text-variant"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        {/*
          ADR-0061 D7 — 두 법적 문서 상호 링크. 이전에는 셸에 "← 홈" 링크 1개뿐이라
          한쪽에 도달한 사용자가 다른 쪽으로 가려면 랜딩까지 되돌아가야 했다.
          터치 타깃 하한 44px(§6.5) 확보를 위해 min-h-11을 준다.
        */}
        <nav
          aria-label="관련 문서"
          className="border-t border-outline pt-4"
        >
          <Link
            href={cross.href}
            className="inline-flex min-h-11 items-center text-label font-semibold text-primary transition-colors duration-200 ease-kiki hover:text-primary-hover"
          >
            {cross.label} 보기 →
          </Link>
        </nav>
      </div>
    </main>
  );
}
