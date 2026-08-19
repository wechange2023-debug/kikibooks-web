'use client';

import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';

import { toggleFavorite } from '@/lib/book/favorite';
import { cn } from '@/lib/utils';

/**
 * FavoriteButton — 책 상세의 즐겨찾기 추가/해제 토글 (ReadButton 우측 보조 액션).
 *
 * 결정 근거: ADR-0024 Amendment O1(2026-08-07) — D5-a 토글을 베타에 포함하고 마이페이지
 *   화면보다 **먼저** 구현한다. 토글이 없으면 마이페이지 즐겨찾기 섹션이 구조적으로 항상
 *   빈 목록이 되어 검수가 불가능하다. 목록의 귀속지는 마이페이지 섹션(Amendment O5).
 *
 * 패턴 차용 (components/home/level-selector.tsx 직역 — 새 패턴 창작 0건):
 *   - useState(favorited) — 옵티미스틱 상태
 *   - useState(error) — 인라인 에러 메시지
 *   - useTransition — server action 진행 상태(isPending 중 재클릭 차단)
 *   - server action 실패 시 이전 값으로 롤백 + error 표시
 *   - sonner 토스트 미사용. action 반환 메시지를 그대로 표시.
 *
 * 옵티미스틱 동기화:
 *   성공 시 서버가 돌려준 favorited로 상태를 다시 맞춘다(추정치 → 서버 진실).
 *   초기값이 조회 시점과 어긋나 있었더라도 1회 클릭으로 수렴한다.
 *
 * a11y:
 *   - aria-pressed={favorited} — 토글 버튼의 눌림 상태 (admin-books-browser.tsx 정합)
 *   - aria-label — 상태에 따라 "즐겨찾기에 추가" / "즐겨찾기에서 제거"
 *   - 아이콘은 aria-hidden, 의미는 aria-label이 전담(아이콘 전용 버튼)
 *
 * 디자인 (Hard Rule 10 — semantic 토큰만, raw HEX 0건):
 *   - 크기: h-[52px] w-[52px] — ReadButton(h-[52px])과 같은 높이로 나란히 정렬
 *   - 모양: rounded-pill (design-system §6.1 "기본 pill, 사각형 금지")
 *   - 활성(즐겨찾기 O): border-primary + text-primary + Heart fill-current(채움)
 *   - 비활성(즐겨찾기 X): border-outline + text-text-variant + Heart 비움 + hover
 *   - 전환: duration-200 ease-kiki / disabled:opacity-[0.38] (level-selector 정합)
 *
 * Client Component — useState + useTransition + server action 호출.
 */

interface FavoriteButtonProps {
  bookId: string;
  initialFavorited: boolean;
}

export function FavoriteButton({ bookId, initialFavorited }: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    if (isPending) {
      return;
    }
    const previous = favorited;
    setFavorited(!previous); // 옵티미스틱
    setError(null);

    startTransition(async () => {
      const result = await toggleFavorite(bookId);
      if (!result.ok) {
        setFavorited(previous); // 롤백
        setError(result.error);
        return;
      }
      // 서버 진실로 동기화 — 옵티미스틱 추정치와 어긋났을 경우를 수렴시킨다.
      setFavorited(result.favorited);
    });
  };

  const label = favorited ? '즐겨찾기에서 제거' : '즐겨찾기에 추가';

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={favorited}
        aria-label={label}
        title={label}
        disabled={isPending}
        className={cn(
          'inline-flex h-[52px] w-[52px] items-center justify-center rounded-pill border bg-surface transition-all duration-200 ease-kiki disabled:opacity-[0.38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
          favorited
            ? 'border-primary text-primary'
            : 'border-outline text-text-variant hover:bg-surface-2 hover:text-text',
        )}
      >
        <Heart
          aria-hidden="true"
          className={cn('h-5 w-5', favorited && 'fill-current')}
        />
      </button>

      {error && (
        <p role="alert" className="text-label font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
