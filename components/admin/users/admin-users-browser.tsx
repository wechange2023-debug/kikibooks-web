'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';

import type { AdminCopy } from '@/lib/admin/copy';
import {
  fetchAdminChildrenPage,
  fetchAdminProfilesPage,
} from '@/lib/admin/users/actions';
import type {
  AdminChildRow,
  AdminChildrenPage,
  AdminProfileRow,
  AdminProfilesPage,
} from '@/lib/admin/users/query';
import { cn } from '@/lib/utils';

/**
 * /admin/users 인터랙션 컴포넌트 — tabs + 검색·페이지네이션·read-only (phase-13b CP4-b).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr ADR-0019)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D7: 자녀 read-only — 토글·level·mutation 0건. 검색·페이지네이션만.
 *   - D20: tabs URL 동기화 0건 — 클라이언트 useState만(activeTab). useSearchParams·router
 *     import 0건. tab 변경 시 검색 상태 유지(외부 검토 2번 옵션 A — UX 친화).
 *   - D21: parent_email 마스킹 0건 — children 카드에 raw email 상단 노출(외부 검토 8번
 *     운영 진단 우선).
 *   - D22: 단일 카드 그리드 패턴 — grid-cols-1 md:grid-cols-2. lg col 0건(children 7컬럼이라
 *     3열은 좁음, 외부 검토 1번).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 책임·역할
 * ──────────────────────────────────────────────────────────────────────────────
 *   - SSR 양 tab 초기 page hydration. 클라이언트 첫 쿼리 0건.
 *   - tab 변경 → setActiveTab만(검색 상태 유지). debounce timer는 정리(보류 검색 차단).
 *   - 검색 키워드 변경 → 해당 tab cursor 리셋 → fetch{Profiles|Children}Page → rows 교체.
 *   - sentinel → 활성 tab cursor + keyword로 fetch → append.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * state 모델 (외부 검토 2번 옵션 A — tab별 분리)
 * ──────────────────────────────────────────────────────────────────────────────
 *   공통:
 *     - activeTab: 'profiles' | 'children'
 *     - isPending: useTransition 양 tab 공유
 *
 *   profiles tab (5건):
 *     profilesKeywordInput · profilesRows · profilesNextCursor · profilesHasMore · profilesError
 *
 *   children tab (5건):
 *     childrenKeywordInput · childrenRows · childrenNextCursor · childrenHasMore · childrenError
 *
 *   UX 정합: profiles에서 검색 후 children 전환 → 다시 profiles 복귀 시 검색 결과 유지.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 토큰 재사용 (Hard Rule 10)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - 카드: rounded-md border border-outline bg-surface p-4 shadow-elev-1
 *     (admin-books-browser AdminBookCard 정합).
 *   - TabButton 활성: border-primary bg-surface-2 text-text
 *     (FilterChip 패턴 정합, admin-books-browser FilterChip 정합).
 *   - TabButton 비활성: border-outline bg-surface text-text-variant hover:bg-surface-2.
 *   - role badge·level badge: rounded-pill border bg-surface-2 text-xs text-text-variant.
 *   - 신규 토큰·raw HEX 0건.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 컬럼 박제 (CP2-a copy.ts 직역, 외부 검토 7번 키 순서 박제)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - profilesColumns 순서: id · email · role · displayName · createdAt
 *   - childrenColumns 순서: id · name · age · level · points · parentEmail · createdAt
 *     ★ parentEmail은 카드 상단 우선 노출(외부 검토 8번 운영 진단 우선)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * read-only 박제 0건 (CP3-b 대비 제거)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - 토글 button 0건 · level select 0건
 *   - 낙관적 환원(prevRows·setRows 환원) 0건
 *   - mutation server action import 0건 (toggle/update/delete 0건)
 *   - handleToggle / handleLevelInlineChange 0건
 *   - filter chip 0건 (검색 키워드만)
 *
 * ADR: docs/adr/0019-admin-system.md D7·D20·D21·D22
 * 의도 문서: docs/intent/admin-system.md §4.3·§5.5
 * 패턴 정합: components/admin/books/admin-books-browser.tsx(CP3-b, 554줄)
 *           — useTransition·debounce·IntersectionObserver·FilterChip 토큰 100% 정합
 */

interface AdminUsersBrowserProps {
  initialProfiles: AdminProfilesPage;
  initialChildren: AdminChildrenPage;
  copy: AdminCopy['users'];
}

/** 키워드 최대 길이 — lib/admin/users/query.ts ADMIN_USERS_KEYWORD_MAX(50) 동기. */
const KEYWORD_MAX = 50;

/** debounce 지연(ms) — admin-books-browser 정합. */
const DEBOUNCE_MS = 300;

/** sentinel rootMargin — 200px 전 미리 로드. admin-books-browser 정합. */
const SENTINEL_ROOT_MARGIN = '0px 0px 200px 0px';

/** 활성 tab — D20 클라이언트 useState만. */
type AdminUsersTab = 'profiles' | 'children';

/** profiles 패널 id (aria-controls 매칭). */
const PROFILES_PANEL_ID = 'admin-users-panel-profiles';
/** children 패널 id. */
const CHILDREN_PANEL_ID = 'admin-users-panel-children';

// =============================================================================
// TabButton — role="tab" + aria-selected (외부 검토 5번 FilterChip 토큰 정합)
// =============================================================================

interface TabButtonProps {
  label: string;
  isActive: boolean;
  controls: string;
  onClick: () => void;
}

function TabButton({ label, isActive, controls, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        'inline-flex h-[38px] items-center rounded-pill border px-4 text-sm font-medium transition-colors',
        isActive
          ? 'border-primary bg-surface-2 text-text'
          : 'border-outline bg-surface text-text-variant hover:bg-surface-2',
      )}
    >
      {label}
    </button>
  );
}

// =============================================================================
// AdminProfileCard — profiles 행 카드 (copy.profilesColumns 키 순서 박제 직역)
// =============================================================================

interface AdminProfileCardProps {
  row: AdminProfileRow;
  copy: AdminCopy['users'];
}

function AdminProfileCard({ row, copy }: AdminProfileCardProps) {
  return (
    <article className="flex flex-col gap-2 rounded-md border border-outline bg-surface p-4 shadow-elev-1">
      <div className="flex items-start justify-between gap-2">
        <h2 className="line-clamp-2 text-sm font-semibold text-text">
          {row.email}
        </h2>
        <span
          aria-label={copy.profilesColumns.role}
          className="inline-flex shrink-0 items-center rounded-pill border border-outline bg-surface-2 px-2 py-0.5 text-xs text-text-variant"
        >
          {copy.roleBadges[row.role]}
        </span>
      </div>
      <div
        aria-label={copy.profilesColumns.displayName}
        className="text-sm text-text-variant"
      >
        {row.display_name ?? '—'}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-variant">
        <span aria-label={copy.profilesColumns.id}>
          {row.id.slice(0, 8)}…
        </span>
        <span aria-hidden="true">·</span>
        <span aria-label={copy.profilesColumns.createdAt}>
          {row.created_at.slice(0, 10)}
        </span>
      </div>
    </article>
  );
}

// =============================================================================
// AdminChildCard — children 행 카드 (copy.childrenColumns 키 순서 박제 직역)
// parent_email 상단 노출(외부 검토 8번 운영 진단 우선)
// =============================================================================

interface AdminChildCardProps {
  row: AdminChildRow;
  copy: AdminCopy['users'];
}

function AdminChildCard({ row, copy }: AdminChildCardProps) {
  return (
    <article className="flex flex-col gap-2 rounded-md border border-outline bg-surface p-4 shadow-elev-1">
      <div className="flex items-start justify-between gap-2">
        <h2 className="line-clamp-2 text-sm font-semibold text-text">
          {row.name}
        </h2>
        <span
          aria-label={copy.childrenColumns.level}
          className="inline-flex shrink-0 items-center rounded-pill border border-outline bg-surface-2 px-2 py-0.5 text-xs text-text-variant"
        >
          {row.current_level}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 text-sm text-text-variant">
        <span>
          <span className="text-xs">{copy.childrenColumns.age}: </span>
          {row.age ?? '—'}
        </span>
        <span>
          <span className="text-xs">{copy.childrenColumns.points}: </span>
          {row.points}
        </span>
      </div>
      <div className="text-sm text-text-variant">
        <span className="text-xs">{copy.childrenColumns.parentEmail}: </span>
        {row.parent_email || '—'}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-variant">
        <span aria-label={copy.childrenColumns.id}>
          {row.id.slice(0, 8)}…
        </span>
        <span aria-hidden="true">·</span>
        <span aria-label={copy.childrenColumns.createdAt}>
          {row.created_at.slice(0, 10)}
        </span>
      </div>
    </article>
  );
}

// =============================================================================
// AdminUsersBrowser — 본 컴포넌트
// =============================================================================

export function AdminUsersBrowser({
  initialProfiles,
  initialChildren,
  copy,
}: AdminUsersBrowserProps) {
  // ── 공통 ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<AdminUsersTab>('profiles');
  const [isPending, startTransition] = useTransition();

  // ── profiles tab state (5건) ──────────────────────────────────────────────
  const [profilesKeywordInput, setProfilesKeywordInput] = useState<string>('');
  const [profilesRows, setProfilesRows] = useState<AdminProfileRow[]>(
    initialProfiles.rows,
  );
  const [profilesNextCursor, setProfilesNextCursor] = useState<string | null>(
    initialProfiles.nextCursor,
  );
  const [profilesHasMore, setProfilesHasMore] = useState<boolean>(
    initialProfiles.hasMore,
  );
  const [profilesError, setProfilesError] = useState<string | null>(null);

  // ── children tab state (5건) ──────────────────────────────────────────────
  const [childrenKeywordInput, setChildrenKeywordInput] = useState<string>('');
  const [childrenRows, setChildrenRows] = useState<AdminChildRow[]>(
    initialChildren.rows,
  );
  const [childrenNextCursor, setChildrenNextCursor] = useState<string | null>(
    initialChildren.nextCursor,
  );
  const [childrenHasMore, setChildrenHasMore] = useState<boolean>(
    initialChildren.hasMore,
  );
  const [childrenError, setChildrenError] = useState<string | null>(null);

  // ── refs ──────────────────────────────────────────────────────────────────
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── profiles 검색 헬퍼 ────────────────────────────────────────────────────
  const applyProfilesKeyword = useCallback((keyword: string) => {
    setProfilesError(null);
    const trimmed = keyword.trim();
    const filters = trimmed.length > 0 ? { keyword: trimmed } : {};
    startTransition(async () => {
      const result = await fetchAdminProfilesPage(filters, null);
      if (!result.ok) {
        setProfilesError(result.error);
        return;
      }
      setProfilesRows(result.page.rows);
      setProfilesNextCursor(result.page.nextCursor);
      setProfilesHasMore(result.page.hasMore);
    });
  }, []);

  const handleProfilesKeywordChange = (value: string) => {
    setProfilesKeywordInput(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      applyProfilesKeyword(value);
    }, DEBOUNCE_MS);
  };

  // ── children 검색 헬퍼 ────────────────────────────────────────────────────
  const applyChildrenKeyword = useCallback((keyword: string) => {
    setChildrenError(null);
    const trimmed = keyword.trim();
    const filters = trimmed.length > 0 ? { keyword: trimmed } : {};
    startTransition(async () => {
      const result = await fetchAdminChildrenPage(filters, null);
      if (!result.ok) {
        setChildrenError(result.error);
        return;
      }
      setChildrenRows(result.page.rows);
      setChildrenNextCursor(result.page.nextCursor);
      setChildrenHasMore(result.page.hasMore);
    });
  }, []);

  const handleChildrenKeywordChange = (value: string) => {
    setChildrenKeywordInput(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      applyChildrenKeyword(value);
    }, DEBOUNCE_MS);
  };

  // ── tab 변경 — 검색 상태 유지(D20·옵션 A) ────────────────────────────────
  const handleTabChange = (tab: AdminUsersTab) => {
    // 보류 중 debounce timer 정리 — 직전 tab 검색이 전환 후 실행되는 것 차단
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setActiveTab(tab);
  };

  // unmount 시 debounce timer 정리
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // ── 파생 — 활성 tab 정보 ─────────────────────────────────────────────────
  const isProfilesTab = activeTab === 'profiles';
  const activeHasMore = isProfilesTab ? profilesHasMore : childrenHasMore;
  const activeNextCursor = isProfilesTab
    ? profilesNextCursor
    : childrenNextCursor;
  const activeKeywordInput = isProfilesTab
    ? profilesKeywordInput
    : childrenKeywordInput;
  const activeRows = isProfilesTab ? profilesRows : childrenRows;
  const activeError = isProfilesTab ? profilesError : childrenError;
  const isEmpty = activeRows.length === 0 && !isPending;
  const activePanelId = isProfilesTab ? PROFILES_PANEL_ID : CHILDREN_PANEL_ID;

  // ── 무한 스크롤 IntersectionObserver — 활성 tab 분기 ──────────────────────
  useEffect(() => {
    if (!activeHasMore || !activeNextCursor) return;
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (isPending) return;

        const currentCursor = activeNextCursor;
        const trimmed = activeKeywordInput.trim();
        const filters = trimmed.length > 0 ? { keyword: trimmed } : {};

        if (isProfilesTab) {
          startTransition(async () => {
            const result = await fetchAdminProfilesPage(filters, currentCursor);
            if (!result.ok) {
              setProfilesError(result.error);
              return;
            }
            setProfilesRows((prev) => [...prev, ...result.page.rows]);
            setProfilesNextCursor(result.page.nextCursor);
            setProfilesHasMore(result.page.hasMore);
          });
        } else {
          startTransition(async () => {
            const result = await fetchAdminChildrenPage(filters, currentCursor);
            if (!result.ok) {
              setChildrenError(result.error);
              return;
            }
            setChildrenRows((prev) => [...prev, ...result.page.rows]);
            setChildrenNextCursor(result.page.nextCursor);
            setChildrenHasMore(result.page.hasMore);
          });
        }
      },
      { rootMargin: SENTINEL_ROOT_MARGIN },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    activeHasMore,
    activeNextCursor,
    activeKeywordInput,
    isProfilesTab,
    isPending,
  ]);

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {/* tabs — D20 클라이언트 useState만 */}
      <div
        role="tablist"
        aria-label={`${copy.tabs.profiles} / ${copy.tabs.children}`}
        className="flex flex-wrap gap-2"
      >
        <TabButton
          label={copy.tabs.profiles}
          isActive={isProfilesTab}
          controls={PROFILES_PANEL_ID}
          onClick={() => handleTabChange('profiles')}
        />
        <TabButton
          label={copy.tabs.children}
          isActive={!isProfilesTab}
          controls={CHILDREN_PANEL_ID}
          onClick={() => handleTabChange('children')}
        />
      </div>

      {/* 검색 input — 활성 tab 분기 */}
      <section className="rounded-md bg-surface p-5 shadow-elev-1">
        {isProfilesTab ? (
          <>
            <label htmlFor="admin-users-profiles-keyword" className="sr-only">
              {copy.profilesSearch.label}
            </label>
            <input
              id="admin-users-profiles-keyword"
              type="text"
              inputMode="search"
              value={profilesKeywordInput}
              placeholder={copy.profilesSearch.placeholder}
              maxLength={KEYWORD_MAX}
              onChange={(event) =>
                handleProfilesKeywordChange(event.target.value)
              }
              className="h-[52px] w-full rounded-md border border-outline bg-surface px-[22px] text-sm text-text placeholder:text-text-variant focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </>
        ) : (
          <>
            <label htmlFor="admin-users-children-keyword" className="sr-only">
              {copy.childrenSearch.label}
            </label>
            <input
              id="admin-users-children-keyword"
              type="text"
              inputMode="search"
              value={childrenKeywordInput}
              placeholder={copy.childrenSearch.placeholder}
              maxLength={KEYWORD_MAX}
              onChange={(event) =>
                handleChildrenKeywordChange(event.target.value)
              }
              className="h-[52px] w-full rounded-md border border-outline bg-surface px-[22px] text-sm text-text placeholder:text-text-variant focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </>
        )}
      </section>

      {/* 에러 (role="alert", CP3-b 정합) */}
      {activeError && (
        <p
          role="alert"
          className="rounded-md bg-surface px-5 py-3 text-sm font-medium text-error shadow-elev-1"
        >
          {activeError}
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
        <div id={activePanelId} role="tabpanel" aria-busy={isPending}>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {isProfilesTab
              ? profilesRows.map((row) => (
                  <li key={row.id}>
                    <AdminProfileCard row={row} copy={copy} />
                  </li>
                ))
              : childrenRows.map((row) => (
                  <li key={row.id}>
                    <AdminChildCard row={row} copy={copy} />
                  </li>
                ))}
          </ul>
        </div>
      )}

      {/* sentinel — 텍스트 0건(CP3-b 정합) */}
      {activeHasMore && (
        <div
          ref={sentinelRef}
          className="flex h-12 items-center justify-center"
          aria-hidden={!isPending}
        />
      )}
    </div>
  );
}
