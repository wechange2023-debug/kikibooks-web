import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StreakChart } from '@/components/home/streak-chart';
import { LibraryBookCard } from '@/components/library/library-browser';
import { ONBOARDING_PATH, SIGN_IN_PATH } from '@/lib/auth/routes';
import { getActiveChild } from '@/lib/home/active-child';
import { getHomeCopy } from '@/lib/home/copy';
import { getStreakThisWeek } from '@/lib/home/streak';
import { getMypageSummary } from '@/lib/mypage/summary';
import { createClient } from '@/lib/supabase/server';
import { BRAND_NAME } from '@/lib/brand';

/**
 * /mypage — 회원 마이페이지 (ADR-0024 D1).
 *
 * (reader) route group 안에 둔다 — 괄호 그룹이라 URL은 `/mypage`로 불변이며,
 * ADR-0021의 공통 헤더가 그대로 노출된다(홈·라이브러리와 같은 성격의 로그인 후 화면,
 * read·celebrate 같은 몰입 화면이 아님).
 *
 * 섹션 4개 (D2 순서 고정):
 *   ① 요약        — 완독 N권 · 읽는 중 N권 · 누적 포인트 P (Amendment O2 정의)
 *   ② 독서 리포트  — StreakChart 재사용(D4 "주간 스트릭 컴포넌트는 재사용한다")
 *   ③ 읽은 책      — 최근 완독순 상위 20권
 *   ④ 즐겨찾기     — 최근 추가순 상위 20권 (D5-a 토글로 담긴 목록, Amendment O5 귀속지)
 *
 * 데이터 (D3): reading_sessions · children.points · favorites **읽기 전용 재사용**.
 *   DB 스키마 변경 0건. 조회는 lib/mypage/summary.ts 단일 진입점에 위임한다.
 *
 * 다자녀 (D8): 베타는 활성 자녀 1명 기준 — getActiveChild(created_at ASC LIMIT 1).
 *   자녀 선택 UI는 정식 단계 보류.
 *
 * 가드:
 *   1. 미인증 → redirect(SIGN_IN_PATH). 미들웨어(PROTECTED_PREFIXES '/mypage')가 1차,
 *      본 페이지가 2차 안전망 — 책 상세 page.tsx와 동일 패턴.
 *   2. 활성 자녀 0명 → **redirect하지 않고** 온보딩 유도 안내 1장만 렌더한다.
 *      마이페이지의 4개 섹션이 전부 자녀 기준 집계라 보여줄 내용이 없기 때문이며,
 *      강제 이동 대신 안내를 두어 사용자가 맥락을 잃지 않게 한다.
 *
 * 책 카드: components/library/library-browser.tsx의 LibraryBookCard 재사용(A안,
 *   2026-08-07 팀장 결정). 카드 신규 생성 0건 — 통합 리팩터링은 backlog §7.4 (y).
 *
 * 카피: 화면 전용 문구는 본 파일에 hardcode한다(app-header.tsx의 라벨 정책과 동일 —
 *   copy.ts 박제 확장 회피). 스트릭 카피만 getHomeCopy()에서 가져온다(컴포넌트 계약).
 *
 * Cache 정책: force-dynamic — 읽기 이력·즐겨찾기는 요청마다 최신이어야 한다.
 * Metadata: robots noindex — 로그인 후 개인 화면(책 상세와 동일 방어).
 *
 * Server Component — 'use client' 없음.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `마이페이지 · ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

/** 섹션 카드 공통 — design-system §6.2 정보 카드(홈 섹션들과 동일 토큰). */
const SECTION_CLASS = 'flex flex-col gap-3 rounded-md bg-surface p-5 shadow-elev-1';
/** 섹션 제목 공통. */
const SECTION_TITLE_CLASS = 'font-display text-body font-semibold text-text';
/** 빈 상태 안내 공통 — StreakChart·RecommendationList의 빈 상태와 동일 토큰. */
const EMPTY_CLASS =
  'rounded-md border border-outline bg-surface-2 px-4 py-3 text-label text-text-variant';
/** 책 그리드 공통 — library-browser의 그리드 컬럼 정합. */
const GRID_CLASS = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

export default async function MypagePage() {
  // 가드 1: 미인증 안전망 — 미들웨어가 1차, 본 페이지가 2차.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  const activeChild = await getActiveChild(supabase, user.id);

  // 가드 2: 자녀 0명 — 안내 1장만 렌더(redirect 없음).
  if (!activeChild) {
    return (
      <main className="min-h-screen bg-surface-2 py-6">
        <div className="mx-auto flex max-w-screen-sm flex-col gap-5 px-4 md:max-w-screen-md md:gap-6 md:px-6 lg:max-w-screen-lg">
          <section className={SECTION_CLASS} aria-label="마이페이지">
            <h1 className={SECTION_TITLE_CLASS}>마이페이지</h1>
            <p className={EMPTY_CLASS}>
              아직 자녀 프로필이 없어요. 프로필을 만들면 읽은 책과 포인트를 모아볼 수 있어요.
            </p>
            <Link
              href={ONBOARDING_PATH}
              className="inline-flex h-[52px] items-center justify-center gap-2 self-start rounded-pill bg-cta px-8 text-body font-semibold text-on-cta shadow-elev-cta transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta/50 focus-visible:ring-offset-2"
            >
              자녀 프로필 만들기
            </Link>
          </section>
        </div>
      </main>
    );
  }

  // 요약·스트릭·카피는 상호 의존이 없다 — 한 번에 착수해 왕복을 겹친다.
  const [summary, streakDays, copy] = await Promise.all([
    getMypageSummary(supabase, activeChild.id),
    getStreakThisWeek(supabase, activeChild.id),
    getHomeCopy(),
  ]);

  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-5 px-4 md:max-w-screen-md md:gap-6 md:px-6 lg:max-w-screen-lg">
        {/* ① 요약 — 완독/읽는 중/포인트 */}
        <section className={SECTION_CLASS} aria-label="독서 요약">
          <h1 className={SECTION_TITLE_CLASS}>{activeChild.name}의 기록</h1>

          <dl className="grid grid-cols-3 gap-3">
            <SummaryTile label="완독" value={`${summary.completedCount}권`} highlight />
            <SummaryTile label="읽는 중" value={`${summary.inProgressCount}권`} />
            <SummaryTile label="포인트" value={`${summary.points}P`} />
          </dl>

          {summary.degraded && (
            <p role="status" className={EMPTY_CLASS}>
              일부 정보를 불러오지 못했어요. 잠시 후 새로고침해 주세요.
            </p>
          )}
        </section>

        {/* ② 독서 리포트 — 주간 스트릭 재사용(D4) */}
        <StreakChart days={streakDays} copy={copy.streak} />

        {/* ③ 읽은 책 */}
        <section className={SECTION_CLASS} aria-label="읽은 책">
          <h2 className={SECTION_TITLE_CLASS}>읽은 책</h2>
          {summary.readBooks.length === 0 ? (
            <p className={EMPTY_CLASS}>아직 완독한 책이 없어요</p>
          ) : (
            <div className={GRID_CLASS}>
              {summary.readBooks.map((book) => (
                <LibraryBookCard key={book.id} book={book} />
              ))}
            </div>
          )}
        </section>

        {/* ④ 즐겨찾기 */}
        <section className={SECTION_CLASS} aria-label="즐겨찾기">
          <h2 className={SECTION_TITLE_CLASS}>즐겨찾기</h2>
          {summary.favoriteBooks.length === 0 ? (
            <p className={EMPTY_CLASS}>책 상세에서 하트를 눌러 담아보세요</p>
          ) : (
            <div className={GRID_CLASS}>
              {summary.favoriteBooks.map((book) => (
                <LibraryBookCard key={book.id} book={book} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * 요약 타일 1개 — 라벨 + 수치. dt/dd 쌍이라 스크린리더가 "완독: 12권"으로 읽는다.
 * highlight=true(완독)만 primary로 강조한다 — Amendment O2가 완독을 대표 지표로 확정했다.
 */
function SummaryTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-outline bg-surface-2 px-2 py-3">
      <dt className="text-caption font-medium text-text-variant">{label}</dt>
      <dd
        className={
          highlight
            ? 'font-display text-h2 font-bold tabular-nums text-primary'
            : 'font-display text-h2 font-bold tabular-nums text-text'
        }
      >
        {value}
      </dd>
    </div>
  );
}
