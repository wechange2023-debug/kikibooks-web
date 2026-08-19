import Link from 'next/link';

/**
 * 섹션 헤더 — 좌측 타이틀 + 우측 "전체 보기" pill.
 *
 * design-system v2 §6.3의 관용구를 컴포넌트로 박제한다:
 *
 *   [ 섹션 타이틀 (text-h2) ]              [ 전체 보기 → (pill) ]
 *   [ 콘텐츠: 캐러셀 또는 그리드 ]
 *
 * ★ "전체 보기"는 장식이 아니다 — §6.4가 **"캐러셀만으로 콘텐츠에 도달하게 하지
 *   않는다"** 고 규정하므로, 가로 스크롤 섹션에는 이 링크가 **대체 도달 경로**로
 *   반드시 붙어야 한다. 링크 대상(/library)은 전체 그리드 + 카테고리·레벨 필터를
 *   갖춘 화면이다(`components/library/library-browser.tsx`).
 *
 * 링크 높이는 §6.5 터치 타깃 하한 44px를 만족시킨다(min-h-11).
 *
 * Server Component — 정적 렌더.
 */

interface SectionHeaderProps {
  title: string;
  /** "전체 보기" 링크 대상. 생략하면 링크를 렌더하지 않는다. */
  href?: string;
  /** 링크 라벨. 기본값 "전체 보기". */
  linkLabel?: string;
}

export function SectionHeader({
  title,
  href,
  linkLabel = '전체 보기',
}: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-display text-h2 text-text">{title}</h2>
      {href ? (
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-pill border border-primary px-4 text-label font-semibold text-primary transition-colors duration-200 ease-kiki hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {linkLabel}
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}
