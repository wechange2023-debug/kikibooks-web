import Link from 'next/link';
import { BookOpen } from 'lucide-react';

/**
 * ReadButton — 책 상세 페이지의 책 뷰어 진입점 (Primary CTA).
 *
 * phase-12 활성화 트리거:
 *   - 현재 phase-11에서는 /book/[bookId]/read 라우트가 부재 → 클릭 시 Next.js 기본 404
 *   - phase-12 책 뷰어 구현 시 자동 활성화 — 본 컴포넌트 수정 0건
 *   - Link 패턴 (b) 채택 사유: 비활성 버튼(disabled, 옵션 a)은 "위치만 있고 누를 수 없는"
 *     사용자 혼란 가능. cp1_decisions d4(즐겨찾기 4-나 위치만 기각 + 4-다 미구현 채택)와
 *     동일 패턴 — 비활성 UI는 dead end로 보이므로 미채택. ReadButton은 (b) Link로 자리
 *     잡아 phase-12 page.tsx 추가 시 자연 활성화. license-rules.md §5.3 "읽기 버튼"
 *     위치 박제 정합.
 *
 * 디자인 인용 (design-system §6.1 Button Primary):
 *   - Primary 변형: bg-primary + text-on-primary + shadow-elev-pop + hover:bg-primary-hover
 *   - 모양: rounded-pill (§6.1 "기본 pill, 사각형 금지")
 *   - 사이즈: h-[52px] (lg — 결제·가입 등 중요 액션 사이즈. 모바일 큰 터치 타겟, Apple HIG 44pt 초과)
 *   - 아이콘: BookOpen 20px + gap-2 (§6.1 "아이콘 18~20px, 텍스트와 간격 8px")
 *   - hover: translateY(-1px) + bg-primary-hover
 *   - focus: 2px outline primary 50% alpha
 *
 * 위치 규칙 (license-rules.md §5.3): AttributionBox 직하단. 페이지가 배치 책임.
 *
 * 책임 분리:
 *   - 본 컴포넌트는 표시 + Link만. 라우트 보호·자녀 가드·뷰어 로딩은 phase-12 책 뷰어
 *     페이지가 처리(phase-07 middleware + phase-12 책 뷰어 page.tsx)
 *   - label은 props로 받음 — copy.readButton.label 단일 출처 (ADR-0012 결정 2 정합)
 *   - BookMeta·BookCoverHero 수정 0건 (CP3-a 분리 원칙 유지)
 *
 * Server Component — 인터랙션 0건. Link만 사용.
 *
 * 의도 문서: docs/intent/screen-03-book-detail.md §5.4
 */

interface ReadButtonProps {
  bookId: string;
  label: string;
}

export function ReadButton({ bookId, label }: ReadButtonProps) {
  return (
    <Link
      href={`/book/${bookId}/read`}
      className="inline-flex h-[52px] items-center justify-center gap-2 rounded-pill bg-primary px-8 text-base font-semibold text-on-primary shadow-elev-pop transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
    >
      <BookOpen className="h-5 w-5" aria-hidden="true" />
      {label}
    </Link>
  );
}
