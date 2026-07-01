'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import Image from 'next/image';
import { BookOpen } from 'lucide-react';

import {
  clearCatalogCache,
  fetchAdminBooksPage,
  toggleBookActive,
  updateBookLevel,
} from '@/lib/admin/books/actions';
import type {
  AdminBookFilters,
  AdminBookRow,
  AdminBooksPage,
} from '@/lib/admin/books/query';
import type { AdminCopy } from '@/lib/admin/copy';
import { cn } from '@/lib/utils';

/**
 * /admin/books 인터랙션 컴포넌트 — 필터·검색·낙관적 UI·무한스크롤 (phase-13b CP3-b).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr ADR-0019)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D18: 낙관적 UI 환원 — toggleBookActive·updateBookLevel은 setRows 즉시 변경 +
 *     server action 호출 + 실패 시 prevRows로 환원 + inline 에러. useOptimistic 미사용
 *     (library-browser.tsx 정합 + 명시적 디버깅 우선).
 *   - D19: confirm 모달 0건 — is_active 토글은 즉시 실행. 환원 가능 액션.
 *   - D20: searchParams URL 동기화 0건 — 클라이언트 useState만(admin URL 단순).
 *   - D22: 모바일/데스크탑 분기 0건 — 단일 카드 그리드(1열·2열·3열).
 *   - intent §4.2·§5.4: SSR 24권 + 디폴트 is_active=any/level=any/키워드 0건 + 필터
 *     변경 시 cursor 리셋 + 토글/수정 낙관적 UI + 무한 스크롤 IntersectionObserver.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 책임·역할
 * ──────────────────────────────────────────────────────────────────────────────
 *   - SSR initialPage(첫 24권) hydration. 클라가 첫 쿼리 안 함.
 *   - 필터·검색 변경 → cursor 리셋 → fetchAdminBooksPage(newFilters, null) → rows 교체.
 *   - sentinel(IntersectionObserver) → fetchAdminBooksPage(filters, nextCursor) → append.
 *   - 토글·레벨 변경 → 낙관적 setRows → toggleBookActive/updateBookLevel → 실패 시 환원.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 상태 모델 (library-browser.tsx 정합)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - filters: AdminBookFilters — 현재 적용된 필터(isActive·level·keyword)
 *   - keywordInput: string — debounce 중 사용자 타이핑(상태와 분리)
 *   - rows: AdminBookRow[] — 누적 카탈로그 행
 *   - nextCursor: string | null — 다음 페이지 cursor
 *   - hasMore: boolean — sentinel 표시 여부
 *   - error: string | null — 사용자 표시 에러(role="alert")
 *   - isPending: boolean — useTransition 진행 상태(중복 호출·sentinel 트리거 방지)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 0건 텍스트 처리 (자진 신고 0건 유지)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - 초기화 버튼: copy.books에 박제 0건 → 미도입. 환원 동선 = chip 'All' + input clear.
 *   - sentinel 로딩 텍스트: copy.books에 박제 0건 → 시각만(h-12 빈 영역 + spinner 0건).
 *   - Level select 옵션 라벨: 박제 0건 → 숫자만('1'~'5' + copy.filters.levelNullLabel).
 *     컬럼 라벨 copy.books.columns.level('레벨')이 옆에 표시되어 의미 정합.
 *   - source/license badge 값: row 영문 raw 그대로(운영자 운영 진단용 코드 표시).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Hard Rule 점검 (무위반)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - Rule 1: 카드는 표지·title·source·license·level·is_active만 — attribution은
 *     admin 화면 노출 무관(book/[id] 책임). UPDATE 컬럼은 is_active·level 단일(actions.ts).
 *   - Rule 6: server action 호출만, secret 키 직접 사용 0건. actions.ts(server)가 secret 사용.
 *   - Rule 9: iframe 0건
 *   - Rule 10: semantic 토큰만(border-outline·border-primary·bg-surface·bg-surface-2·
 *              text-text·text-text-variant·text-error 등), raw HEX 0건. library-browser.tsx
 *              FilterChip 정합.
 *
 * ADR: docs/adr/0019-admin-system.md D2·D5·D11·D18·D19·D20·D22
 * 의도 문서: docs/intent/admin-system.md §4.2·§5.4·§5.7
 * 패턴 정합: components/library/library-browser.tsx (459줄 풀 베이스 — useTransition·
 *           debounce·IntersectionObserver·applyFilters·FilterChip)
 */

interface AdminBooksBrowserProps {
  initialPage: AdminBooksPage;
  copy: AdminCopy['books'];
}

/** 키워드 입력 최대 길이 — lib/admin/books/query.ts ADMIN_KEYWORD_MAX(50)와 동기 박제. */
const KEYWORD_MAX = 50;

/** debounce 지연(ms) — library-browser.tsx 정합. */
const DEBOUNCE_MS = 300;

/** sentinel rootMargin — 하단 200px 전 미리 로드. library-browser.tsx 정합. */
const SENTINEL_ROOT_MARGIN = '0px 0px 200px 0px';

/** 표지 깨짐 fallback 팔레트 — library-browser.tsx 정합 (3종 회전). */
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
 * 필터 칩 1개 — library-browser.tsx FilterChip 시각 정합.
 *
 * 활성: border-primary bg-surface-2 text-text
 * 비활성: border-outline bg-surface text-text-variant + hover:bg-surface-2
 */
function FilterChip({
  label,
  isActive,
  onClick,
  disabled,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      disabled={disabled}
      className={cn(
        'inline-flex h-[38px] items-center rounded-pill border px-4 text-sm font-medium transition-colors disabled:opacity-[0.38]',
        isActive
          ? 'border-primary bg-surface-2 text-text'
          : 'border-outline bg-surface text-text-variant hover:bg-surface-2',
      )}
    >
      {label}
    </button>
  );
}

/**
 * 책 카드 1장 — 썸네일 + title + source/license badge + level select + is_active toggle.
 *
 * 박제 매핑:
 *   - copy.columns.title/source/license/level → 컬럼 라벨(sr-only는 미적용, 시각 라벨)
 *   - copy.toggle.on/off → 토글 버튼 라벨(is_active true/false)
 *   - 토글 버튼 활성/비활성 시각 = FilterChip 패턴 정합(border-primary/border-outline)
 *   - level select: 1·2·3·4·5 + 'null' sentinel(copy.filters.levelNullLabel)
 */
interface AdminBookCardProps {
  row: AdminBookRow;
  copy: AdminCopy['books'];
  isPending: boolean;
  onToggle: (bookId: string, nextValue: boolean) => void;
  onLevelChange: (bookId: string, levelOrNullSentinel: string) => void;
}

function AdminBookCard({
  row,
  copy,
  isPending,
  onToggle,
  onLevelChange,
}: AdminBookCardProps) {
  const [imageError, setImageError] = useState(false);
  const fallback = pickFallbackColor(row.id);

  const levelSelectValue = row.level === null ? 'null' : String(row.level);

  return (
    <article className="flex flex-col gap-3 rounded-md border border-outline bg-surface p-4 shadow-elev-1">
      <div className="flex gap-3">
        <div className="relative h-[106px] w-[80px] shrink-0 overflow-hidden rounded-md bg-surface-3">
          {imageError ? (
            <div
              className={`flex h-full w-full items-center justify-center ${fallback.block}`}
            >
              <BookOpen className={`h-6 w-6 ${fallback.text}`} aria-hidden="true" />
            </div>
          ) : (
            <Image
              src={row.cover_url}
              alt={`${row.title} 표지`}
              fill
              sizes="80px"
              className="object-cover"
              onError={() => setImageError(true)}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="line-clamp-2 text-sm font-semibold text-text">
            {row.title}
          </h2>
          <div className="flex flex-wrap gap-1">
            <span
              aria-label={copy.columns.source}
              className="inline-flex items-center rounded-pill border border-outline bg-surface-2 px-2 py-0.5 text-xs text-text-variant"
            >
              {row.source_platform}
            </span>
            <span
              aria-label={copy.columns.license}
              className="inline-flex items-center rounded-pill border border-outline bg-surface-2 px-2 py-0.5 text-xs text-text-variant"
            >
              {row.license}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-text-variant">
          <span>{copy.columns.level}</span>
          <select
            value={levelSelectValue}
            onChange={(event) => onLevelChange(row.id, event.target.value)}
            disabled={isPending}
            className="h-9 appearance-none rounded-md border border-outline bg-surface px-2 text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-[0.38]"
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="null">{copy.filters.levelNullLabel}</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => onToggle(row.id, !row.is_active)}
          disabled={isPending}
          aria-pressed={row.is_active}
          aria-label={copy.columns.isActive}
          className={cn(
            'inline-flex h-9 items-center rounded-pill border px-4 text-sm font-medium transition-colors disabled:opacity-[0.38]',
            row.is_active
              ? 'border-primary bg-surface-2 text-text'
              : 'border-outline bg-surface text-text-variant hover:bg-surface-2',
          )}
        >
          {row.is_active ? copy.toggle.on : copy.toggle.off}
        </button>
      </div>
    </article>
  );
}

export function AdminBooksBrowser({ initialPage, copy }: AdminBooksBrowserProps) {
  // ── 상태 ───────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<AdminBookFilters>({});
  const [keywordInput, setKeywordInput] = useState<string>('');
  const [rows, setRows] = useState<AdminBookRow[]>(initialPage.rows);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialPage.nextCursor,
  );
  const [hasMore, setHasMore] = useState<boolean>(initialPage.hasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 카탈로그 캐시 비우기 (ADR-0033 Amendment #1 (b)) — 목록 로딩(isPending)과 분리한 별도 상태.
  const [cacheClearing, startCacheClear] = useTransition();
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);

  /**
   * 공용 카탈로그 데이터 캐시('books-catalog')를 즉시 비운다(ADR-0033 Amendment #1 (b)).
   * 팀장이 SQL Editor에서 is_active를 직접 토글한 뒤 이 버튼으로 최대 1시간 지연 없이 반영한다.
   * clearCatalogCache는 서버에서 assertAdmin() 가드 뒤에서만 실행된다(권한 강제).
   */
  const handleClearCache = () => {
    setCacheMsg(null);
    startCacheClear(async () => {
      const result = await clearCatalogCache();
      setCacheMsg(
        result.ok ? '카탈로그 캐시를 비웠습니다.' : result.error,
      );
    });
  };

  // debounce·sentinel ref (library-browser 정합)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── 필터 변경 헬퍼 ─────────────────────────────────────────────────────────
  /**
   * 1페이지 재조회 — 필터·검색 변경마다 호출. cursor=null로 리셋해 첫 페이지부터.
   * library-browser.tsx applyFilters 정합.
   */
  const applyFilters = useCallback((newFilters: AdminBookFilters) => {
    setError(null);
    startTransition(async () => {
      const result = await fetchAdminBooksPage(newFilters, null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows(result.page.rows);
      setNextCursor(result.page.nextCursor);
      setHasMore(result.page.hasMore);
    });
  }, []);

  // is_active 칩 — 'any' → undefined로 변환(필터 미적용)
  const handleIsActiveChange = (value: 'any' | 'true' | 'false') => {
    const newFilters: AdminBookFilters = {
      ...filters,
      isActive: value === 'any' ? undefined : value,
    };
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  // level 칩 — undefined(All) / 1~5 / 'null'(미분류)
  const handleLevelChange = (value: AdminBookFilters['level']) => {
    const newFilters: AdminBookFilters = { ...filters, level: value };
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  // 키워드 input — debounce 300ms (library-browser 정합)
  const handleKeywordChange = (value: string) => {
    setKeywordInput(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      const trimmed = value.trim();
      const newFilters: AdminBookFilters = {
        ...filters,
        keyword: trimmed.length > 0 ? trimmed : undefined,
      };
      setFilters(newFilters);
      applyFilters(newFilters);
    }, DEBOUNCE_MS);
  };

  // ── 낙관적 환원 핸들러 (D18 — 옵션 A 직접 환원) ──────────────────────────
  /**
   * is_active 토글 — 낙관적 setRows 즉시 변경 + server action + 실패 시 환원.
   * D19 정합 — confirm 모달 0건(즉시 실행).
   */
  const handleToggle = (bookId: string, nextValue: boolean) => {
    const prevRows = rows;
    setRows((prev) =>
      prev.map((r) => (r.id === bookId ? { ...r, is_active: nextValue } : r)),
    );
    setError(null);
    startTransition(async () => {
      const result = await toggleBookActive({ bookId, nextValue });
      if (!result.ok) {
        setError(result.error);
        setRows(prevRows);
      }
    });
  };

  /**
   * level 인라인 수정 — 'null' sentinel → null 변환 + 낙관적 setRows + server action +
   * 실패 시 환원.
   */
  const handleLevelInlineChange = (
    bookId: string,
    levelOrNullSentinel: string,
  ) => {
    const newLevel: number | null =
      levelOrNullSentinel === 'null' ? null : Number(levelOrNullSentinel);
    const prevRows = rows;
    setRows((prev) =>
      prev.map((r) => (r.id === bookId ? { ...r, level: newLevel } : r)),
    );
    setError(null);
    startTransition(async () => {
      const result = await updateBookLevel({ bookId, level: newLevel });
      if (!result.ok) {
        setError(result.error);
        setRows(prevRows);
      }
    });
  };

  // unmount 시 debounce timer 정리(library-browser 정합)
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // ── 무한 스크롤 IntersectionObserver (library-browser 정합) ──────────────
  useEffect(() => {
    if (!hasMore || !nextCursor) return;
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (isPending) return;

        const currentCursor = nextCursor;
        const currentFilters = filters;
        startTransition(async () => {
          const result = await fetchAdminBooksPage(currentFilters, currentCursor);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setRows((prev) => [...prev, ...result.page.rows]);
          setNextCursor(result.page.nextCursor);
          setHasMore(result.page.hasMore);
        });
      },
      { rootMargin: SENTINEL_ROOT_MARGIN },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, filters, isPending]);

  // ── 파생 상태 ─────────────────────────────────────────────────────────────
  const isEmpty = rows.length === 0 && !isPending;

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {/* 카탈로그 캐시 비우기 (ADR-0033 Amd#1 (b)) — SQL 직접 토글 후 즉시 반영용 */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {cacheMsg && (
          <span role="status" aria-live="polite" className="text-sm text-text-variant">
            {cacheMsg}
          </span>
        )}
        <button
          type="button"
          onClick={handleClearCache}
          disabled={cacheClearing}
          className="inline-flex h-[38px] items-center rounded-pill border border-outline bg-surface px-4 text-sm font-medium text-text-variant transition-colors hover:bg-surface-2 disabled:opacity-[0.38]"
        >
          {cacheClearing ? '비우는 중…' : '카탈로그 캐시 비우기'}
        </button>
      </div>

      {/* 필터 바 */}
      <section
        aria-label={copy.search.label}
        className="flex flex-col gap-4 rounded-md bg-surface p-5 shadow-elev-1"
      >
        {/* is_active 3 chip */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-text">
            {copy.filters.isActiveLabel}
          </legend>
          <div
            role="group"
            aria-label={copy.filters.isActiveLabel}
            className="flex flex-wrap gap-2"
          >
            <FilterChip
              label={copy.filters.isActiveAnyLabel}
              isActive={filters.isActive === undefined}
              onClick={() => handleIsActiveChange('any')}
              disabled={isPending}
            />
            <FilterChip
              label={copy.filters.isActiveTrueLabel}
              isActive={filters.isActive === 'true'}
              onClick={() => handleIsActiveChange('true')}
              disabled={isPending}
            />
            <FilterChip
              label={copy.filters.isActiveFalseLabel}
              isActive={filters.isActive === 'false'}
              onClick={() => handleIsActiveChange('false')}
              disabled={isPending}
            />
          </div>
        </fieldset>

        {/* level 7 chip — All + 1~5 + Null */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-text">
            {copy.filters.levelLabel}
          </legend>
          <div
            role="group"
            aria-label={copy.filters.levelLabel}
            className="flex flex-wrap gap-2"
          >
            <FilterChip
              label={copy.filters.levelAnyLabel}
              isActive={filters.level === undefined}
              onClick={() => handleLevelChange(undefined)}
              disabled={isPending}
            />
            {[1, 2, 3, 4, 5].map((n) => (
              <FilterChip
                key={n}
                label={String(n)}
                isActive={filters.level === n}
                onClick={() => handleLevelChange(n)}
                disabled={isPending}
              />
            ))}
            <FilterChip
              label={copy.filters.levelNullLabel}
              isActive={filters.level === 'null'}
              onClick={() => handleLevelChange('null')}
              disabled={isPending}
            />
          </div>
        </fieldset>

        {/* 검색 input — copy.books 박제 0건 → 초기화 버튼 미도입 */}
        <div>
          <label htmlFor="admin-books-keyword" className="sr-only">
            {copy.search.label}
          </label>
          <input
            id="admin-books-keyword"
            type="text"
            inputMode="search"
            value={keywordInput}
            placeholder={copy.search.placeholder}
            maxLength={KEYWORD_MAX}
            onChange={(event) => handleKeywordChange(event.target.value)}
            className="h-[52px] w-full rounded-md border border-outline bg-surface px-[22px] text-sm text-text placeholder:text-text-variant focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
        </div>
      </section>

      {/* 에러 (role="alert", library-browser 정합) */}
      {error && (
        <p
          role="alert"
          className="rounded-md bg-surface px-5 py-3 text-sm font-medium text-error shadow-elev-1"
        >
          {error}
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
          aria-busy={isPending}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {rows.map((row) => (
            <li key={row.id}>
              <AdminBookCard
                row={row}
                copy={copy}
                isPending={isPending}
                onToggle={handleToggle}
                onLevelChange={handleLevelInlineChange}
              />
            </li>
          ))}
        </ul>
      )}

      {/* sentinel — copy.books 박제 0건 → 시각만(h-12 빈 영역). 텍스트 hardcoded 0건. */}
      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex h-12 items-center justify-center"
          aria-hidden={!isPending}
        />
      )}
    </div>
  );
}
