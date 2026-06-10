'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

import { fetchLibraryPage } from '@/lib/library/actions';
import type { LibraryCopy } from '@/lib/library/copy';
import type { LibraryFilters, LibraryPage } from '@/lib/library/query';
import type { PopularBook } from '@/lib/landing/popular-books';
import { cn } from '@/lib/utils';

/**
 * /library 인터랙션 컴포넌트 — 필터·검색·무한 스크롤·빈 상태.
 *
 * phase-13 CP3-b-2 신규 (ADR-0018 D7·D12 + intent §5.3·§5.4 + 외부 Claude 검토 통과).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 책임·역할
 * ──────────────────────────────────────────────────────────────────────────────
 *   - 서버에서 첫 페이지(initialPage)를 props로 받아 hydration (클라가 첫 쿼리 안 함).
 *   - 필터·검색 변경 → cursor 리셋 → fetchLibraryPage(newFilters, null) → books 교체.
 *   - 스크롤 하단 sentinel(IntersectionObserver) → fetchLibraryPage(filters, nextCursor) → append.
 *   - 빈 결과·에러·로딩 모두 UI에 반영.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 결정 박제 (외부 Claude 권고 채택, 2026-05-28)
 * ──────────────────────────────────────────────────────────────────────────────
 *   Q2 β: LibraryBookCard 내부 정의 — RecommendationCard 선례 정합(recommendation-list.tsx
 *         내부 정의). BookCoverCard(href='/signup' 하드코딩)·RecommendationCard(컴포넌트
 *         export 안 됨 + horizontal scroll용 w-32) 모두 재사용 불가 실측.
 *   Q4 β: debounce 자체 구현 — useRef<NodeJS.Timeout> + setTimeout/clearTimeout. 외부
 *         라이브러리(use-debounce·lodash) 0건(PLAN 명시 외 의존성 임의 추가 금지).
 *   Q5 β: IntersectionObserver useEffect deps에 [filters, nextCursor, hasMore, isPending].
 *         필터·검색 변경 시 자동 disconnect + 재observe. sentinel key 우회 금지(React
 *         idiomatic 패턴).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 상태 모델
 * ──────────────────────────────────────────────────────────────────────────────
 *   - filters: LibraryFilters — 현재 적용된 필터(level·category·keyword)
 *   - keywordInput: string — debounce 중 사용자가 타이핑하는 현재 입력(상태와 분리)
 *   - books: PopularBook[] — 누적 그리드 데이터
 *   - nextCursor: string | null — 다음 페이지 cursor(null이면 더 없음)
 *   - hasMore: boolean — sentinel 표시 여부(nextCursor !== null과 동일하나 명시 박제)
 *   - error: string | null — 사용자 표시 에러 메시지(LevelSelector role="alert" 패턴)
 *   - isPending: boolean — useTransition 진행 상태(중복 호출·sentinel 트리거 방지)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Hard Rule 점검 (무위반)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - Rule 1: 카드는 표지·title·author만 — attribution은 /book/[id] 책임(ADR-0013·0016)
 *   - Rule 6: server action 호출만, secret 키 직접 사용 0건 — fetchLibraryPage 내부도
 *             createClient 본인 세션(actions.ts 박제)
 *   - Rule 9: iframe 0건
 *   - Rule 10: semantic 토큰만(border-primary·bg-surface·text-text-variant 등),
 *              raw HEX 0건. easing은 ease-kiki(design-system §6.2 cubic-bezier(0.2,0,0,1))
 *
 * 의도 문서: docs/intent/screen-05-celebrate.md §5.3·§5.4
 * 디자인: docs/design-system.md §3.2 Chip 38px·Input 52px·§6.2 Card hover translateY
 */

interface LibraryBrowserProps {
  initialPage: LibraryPage;
  /**
   * 서버에서 SSR한 첫 페이지에 적용된 초기 필터(예: 홈 카테고리 카드 → /library?category=).
   * initialPage는 이미 이 필터로 조회된 결과이므로, filters state를 같은 값으로
   * 초기화해야 카테고리 칩 활성 표시·후속 fetch가 정합한다. 미제공 시 빈 필터({}).
   */
  initialFilters?: LibraryFilters;
  copy: LibraryCopy;
}

/**
 * 키워드 입력 최대 길이 — lib/library/query.ts의 LIBRARY_KEYWORD_MAX(50)와 동기 박제.
 *
 * query.ts는 'server-only'이라 client 컴포넌트가 직접 import 불가. 두 상수가 어긋나면
 * client는 51자를 전송하고 server zod는 reject — 변경 시 둘 다 갱신해야 한다.
 * 선례: app/book/[id]/celebrate/page.tsx의 POINTS_AWARDED·FIRST_COMPLETION_BADGE가
 * 같은 방식으로 lib/book/rewards.ts와 동기 박제(server action vs client 분리 경계).
 */
const KEYWORD_MAX = 50;

/** debounce 지연(ms) — 검색 input 타이핑 후 server action 호출까지 (Q4 β 외부 의존 0건). */
const DEBOUNCE_MS = 300;

/** sentinel rootMargin — 하단에 닿기 200px 전 미리 다음 페이지 로드(스크롤 끊김 회피). */
const SENTINEL_ROOT_MARGIN = '0px 0px 200px 0px';

/**
 * 표지 깨짐 fallback 팔레트 — book.id로 결정적 선택해 같은 책은 항상 같은 색.
 * RecommendationList·BookCoverCard와 동일 팔레트(키키북스 카드 fallback 표준).
 */
const FALLBACK_PALETTE = [
  { block: 'bg-primary-container', text: 'text-on-primary-container' },
  { block: 'bg-secondary-container', text: 'text-on-secondary-container' },
  { block: 'bg-tertiary-container', text: 'text-on-tertiary-container' },
] as const;

function pickFallbackColor(id: string): (typeof FALLBACK_PALETTE)[number] {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) {
    sum += id.charCodeAt(i);
  }
  return FALLBACK_PALETTE[sum % FALLBACK_PALETTE.length];
}

/**
 * 라이브러리 책 카드 1장 (내부 정의, Q2 β).
 *
 * RecommendationCard 마크업 인용(컴포넌트 재사용 아님):
 *   - <Link href={`/book/${id}`} prefetch={false}> — 24권 그리드 동시 prefetch 부담 회피
 *   - aspect-[3/4] 표지 + onError fallback(BookOpen + pickFallbackColor)
 *   - 카드 hover 효과는 design-system §6.2(translateY -1px, 200ms ease-kiki)
 *   - 캡션: 제목 항상, 저자 nullable(ADR-0013 결정 1)
 *
 * RecommendationCard와 다른 점:
 *   - w-32 가로 스크롤용 폭 제거 — 그리드 컬럼 너비에 자연 적응
 *   - sizes 속성 그리드 4 viewport 기준으로 조정
 */
function LibraryBookCard({ book }: { book: PopularBook }) {
  const [imageError, setImageError] = useState(false);
  const fallback = pickFallbackColor(book.id);

  return (
    <Link
      href={`/book/${book.id}`}
      prefetch={false}
      className="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-surface-3 shadow-elev-1 transition-transform duration-200 ease-kiki group-hover:-translate-y-1">
        {imageError ? (
          <div
            className={`flex h-full w-full flex-col items-center justify-center gap-2 p-3 ${fallback.block}`}
          >
            <BookOpen className={`h-7 w-7 ${fallback.text}`} aria-hidden="true" />
            <p
              className={`line-clamp-4 text-center text-sm font-semibold ${fallback.text}`}
            >
              {book.title}
            </p>
          </div>
        ) : (
          <Image
            src={book.coverUrl}
            alt={`${book.title} 표지`}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 768px) 30vw, (max-width: 1024px) 22vw, 16vw"
            className="object-cover"
            onError={() => setImageError(true)}
          />
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="line-clamp-2 text-sm font-semibold text-text">{book.title}</p>
        {book.author ? (
          <p className="line-clamp-1 text-xs text-text-variant">{book.author}</p>
        ) : null}
      </div>
    </Link>
  );
}

/** 필터 칩 1개 — 활성/비활성 스타일은 LevelSelector 패턴 정합. */
function FilterChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        'inline-flex h-[38px] items-center rounded-pill border px-4 text-sm font-medium transition-colors disabled:opacity-[0.38]',
        active
          ? 'border-primary bg-surface-2 text-text'
          : 'border-outline bg-surface text-text-variant hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  );
}

export function LibraryBrowser({
  initialPage,
  initialFilters,
  copy,
}: LibraryBrowserProps) {
  // ── 상태 ───────────────────────────────────────────────────────────────────
  // initialPage가 initialFilters로 SSR된 결과이므로 filters도 같은 값으로 시작
  // (미제공 시 빈 필터 — 기존 동작 회귀 방지).
  const [filters, setFilters] = useState<LibraryFilters>(initialFilters ?? {});
  const [keywordInput, setKeywordInput] = useState<string>(
    initialFilters?.keyword ?? '',
  );
  const [books, setBooks] = useState<PopularBook[]>(initialPage.books);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialPage.hasMore);
  const [totalCount, setTotalCount] = useState<number>(initialPage.totalCount);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // debounce·sentinel ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── 필터·검색 변경 헬퍼 ────────────────────────────────────────────────────
  /**
   * 1페이지 재조회 — 필터·검색 변경마다 호출. cursor는 null로 리셋해 첫 페이지부터.
   *
   * useCallback deps 0건 — startTransition·set*는 React가 안정 식별자 보장(strict mode 포함).
   * fetchLibraryPage는 외부 server action 식별자라 deps 불요.
   */
  const applyFilters = useCallback((newFilters: LibraryFilters) => {
    setError(null);
    startTransition(async () => {
      const result = await fetchLibraryPage(newFilters, null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBooks(result.page.books);
      setNextCursor(result.page.nextCursor);
      setHasMore(result.page.hasMore);
      setTotalCount(result.page.totalCount);
    });
  }, []);

  /**
   * 카테고리 필터를 주소창에 반영(shallow) — 재요청 없이 URL 문자열만 갱신한다.
   *
   * 이 페이지는 force-dynamic이라 router.replace는 주소 변경 시 서버 재SSR을 유발하나,
   * 필터링은 이미 클라이언트 상태로 끝나 있어 재요청은 불필요하다. Next 14 App Router의
   * shallow URL 갱신 표준인 window.history.replaceState로 주소창만 맞춘다.
   *
   * 서버(app/library/page.tsx)는 searchParams.category만 초기 필터로 복원한다(L71·L94).
   * 따라서 동기화 대상도 category 하나로 한정한다 — level·keyword를 URL에 쓰면 새로고침
   * 시 서버가 복원하지 않아 URL과 상태가 어긋난다. 값이 없으면 '/library'로 되돌린다.
   */
  const syncCategoryUrl = useCallback((category: LibraryFilters['category']) => {
    const url = category ? `/library?category=${category}` : '/library';
    window.history.replaceState(null, '', url);
  }, []);

  // 레벨 칩 — undefined = 전체
  const handleLevelChange = (level: LibraryFilters['level']) => {
    const newFilters: LibraryFilters = { ...filters, level };
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  // 카테고리 칩 — undefined = 전체
  const handleCategoryChange = (category: LibraryFilters['category']) => {
    const newFilters: LibraryFilters = { ...filters, category };
    setFilters(newFilters);
    applyFilters(newFilters);
    syncCategoryUrl(category);
  };

  // 키워드 input — debounce 300ms (Q4 β, 외부 의존 0건)
  const handleKeywordChange = (value: string) => {
    setKeywordInput(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      const trimmed = value.trim();
      const newFilters: LibraryFilters = {
        ...filters,
        keyword: trimmed.length > 0 ? trimmed : undefined,
      };
      setFilters(newFilters);
      applyFilters(newFilters);
    }, DEBOUNCE_MS);
  };

  // 전체 초기화
  const handleReset = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const newFilters: LibraryFilters = {};
    setFilters(newFilters);
    setKeywordInput('');
    applyFilters(newFilters);
    // 전체 초기화는 category도 비우므로 주소창을 '/library'로 되돌린다.
    syncCategoryUrl(undefined);
  };

  // unmount 시 debounce timer 정리(메모리 누수·stale callback 회피)
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // ── 무한 스크롤 IntersectionObserver (Q5 β: deps 변경 시 자동 재등록) ─────
  useEffect(() => {
    // 더 없거나 sentinel 미마운트면 등록 안 함
    if (!hasMore || !nextCursor) return;
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        // 이미 로드 중이면 중복 트리거 무시
        if (isPending) return;

        // 클로저 안전 — 현재 시점 filters·cursor 캡처(deps에 포함돼 변경 시 재등록)
        const currentCursor = nextCursor;
        const currentFilters = filters;
        startTransition(async () => {
          const result = await fetchLibraryPage(currentFilters, currentCursor);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setBooks((prev) => [...prev, ...result.page.books]);
          setNextCursor(result.page.nextCursor);
          setHasMore(result.page.hasMore);
          setTotalCount(result.page.totalCount);
        });
      },
      { rootMargin: SENTINEL_ROOT_MARGIN },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, filters, isPending]);

  // ── 파생 상태 ─────────────────────────────────────────────────────────────
  const isEmpty = books.length === 0 && !isPending;
  const hasActiveFilter =
    filters.level !== undefined ||
    filters.category !== undefined ||
    keywordInput.trim().length > 0;

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {/* 필터·검색 바 */}
      <section
        aria-label={copy.title}
        className="flex flex-col gap-4 rounded-md bg-surface p-5 shadow-elev-1"
      >
        {/* 레벨 칩 */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-text">
            {copy.filters.levelLabel}
          </legend>
          <div role="group" aria-label={copy.filters.levelLabel} className="flex flex-wrap gap-2">
            <FilterChip
              active={filters.level === undefined}
              disabled={isPending}
              onClick={() => handleLevelChange(undefined)}
            >
              {copy.filters.levelAllLabel}
            </FilterChip>
            {copy.filters.levelOptions.map((opt) => (
              <FilterChip
                key={opt.value}
                active={filters.level === opt.value}
                disabled={isPending}
                onClick={() => handleLevelChange(opt.value)}
              >
                {opt.label}
              </FilterChip>
            ))}
          </div>
        </fieldset>

        {/* 카테고리 칩 */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-text">
            {copy.filters.categoryLabel}
          </legend>
          <div
            role="group"
            aria-label={copy.filters.categoryLabel}
            className="flex flex-wrap gap-2"
          >
            <FilterChip
              active={filters.category === undefined}
              disabled={isPending}
              onClick={() => handleCategoryChange(undefined)}
            >
              {copy.filters.categoryAllLabel}
            </FilterChip>
            {copy.filters.categoryOptions.map((opt) => (
              <FilterChip
                key={opt.slug}
                active={filters.category === opt.slug}
                disabled={isPending}
                onClick={() => handleCategoryChange(opt.slug)}
              >
                {opt.label}
              </FilterChip>
            ))}
          </div>
        </fieldset>

        {/* 검색 input + 초기화 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="library-keyword" className="sr-only">
            {copy.search.label}
          </label>
          <input
            id="library-keyword"
            type="text"
            inputMode="search"
            value={keywordInput}
            placeholder={copy.search.placeholder}
            maxLength={KEYWORD_MAX}
            onChange={(event) => handleKeywordChange(event.target.value)}
            className="h-[52px] flex-1 rounded-md border border-outline bg-surface px-[22px] text-sm text-text placeholder:text-text-variant focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
          {hasActiveFilter && (
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="inline-flex h-[44px] items-center justify-center rounded-pill border border-outline bg-surface px-5 text-sm font-medium text-text-variant transition-colors hover:bg-surface-2 disabled:opacity-[0.38]"
            >
              {copy.search.resetLabel}
            </button>
          )}
        </div>
      </section>

      {/* 에러 메시지 (LevelSelector 패턴 정합) */}
      {error && (
        <p role="alert" className="rounded-md bg-surface px-5 py-3 text-sm font-medium text-error shadow-elev-1">
          {error}
        </p>
      )}

      {/* 결과 권수 — 전체·레벨·카테고리·키워드 모든 모드 단일 계약(query.ts totalCount). */}
      {books.length > 0 && (
        <p className="text-sm font-medium text-text-variant" aria-live="polite">
          총 {totalCount}권
        </p>
      )}

      {/* 그리드 / 빈 상태 */}
      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-outline bg-surface px-5 py-12 text-center shadow-elev-1">
          <h2 className="font-display text-lg font-semibold text-text">
            {copy.empty.title}
          </h2>
          <p className="text-sm text-text-variant">{copy.empty.body}</p>
        </div>
      ) : (
        <ul
          aria-label={copy.title}
          aria-busy={isPending}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
        >
          {books.map((book) => (
            <li key={book.id}>
              <LibraryBookCard book={book} />
            </li>
          ))}
        </ul>
      )}

      {/* 무한 스크롤 sentinel — hasMore일 때만 마운트(useEffect deps와 정합) */}
      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex h-12 items-center justify-center"
          aria-hidden={!isPending}
        >
          {isPending && (
            <span aria-live="polite" className="text-sm text-text-variant">
              {copy.loadingMore}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
