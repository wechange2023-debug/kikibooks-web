import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  toPopularBooks,
  type PopularBook,
  type PopularBookRow,
} from '@/lib/landing/popular-books';

/**
 * 마이페이지(/mypage) 요약 데이터 단일 진입점 — ADR-0024 D2·D3.
 *
 * D3(스키마 변경 0건): reading_sessions · children.points · favorites 3개 기존 테이블을
 *   **읽기 전용으로만** 재사용한다. 신규 컬럼·테이블·트리거 0건.
 *
 * Amendment O2(2026-08-07) 권수 정의:
 *   - **완독 권수 = `reading_sessions.is_completed = true`** 기준. ADR-0018의 완독 판정
 *     (+50 포인트 적립 앵커)·스트릭 채움 기준(lib/home/streak.ts)과 동일 컬럼을 써서
 *     포인트 수치와 권수 수치가 어긋나지 않게 한다.
 *   - **읽는 중 권수 = 세션은 있으나 미완독**(is_completed = false)을 별도 집계한다.
 *     완독 수에 섞지 않는다(사용자 혼동 방지).
 *   - 두 카운트는 **세션 행 수가 아니라 책 종수**다 — 같은 책을 두 번 완독하면 세션은
 *     2행이지만 "완독 2권"이 아니라 1권이다.
 *
 * 실패 정책 (throw 금지):
 *   개별 쿼리 실패는 예외를 던지지 않고 0·빈 배열로 폴백하며, 폴백이 1건이라도
 *   발생하면 `degraded: true`를 반환한다. 마이페이지는 요약 화면이라 일부 섹션이
 *   비어도 나머지가 보이는 편이 낫고, 호출자가 flag로 안내 문구를 띄울 수 있다.
 *
 * 오디오 배지 (필수 규약):
 *   `hasAudio`는 **반드시 toPopularBooks()** 를 통해 산출한다 — 내부적으로
 *   selectReaderAudioBookIds(book_audio)를 쓰는 카드 표면 전체의 단일 통로다.
 *   `books.has_audio` 컬럼 직접 읽기 **금지**(배지는 뜨는데 재생은 안 되는 불일치 재발).
 *
 * 카드 정합: 반환 배열의 원소 타입은 `PopularBook` — components/library/library-browser.tsx의
 *   `LibraryBookCard`가 그대로 받는 형태다(ADR-0024 작업 A안, 카드 신규 생성 0건).
 *
 * RLS 근거 (001_initial_schema.sql):
 *   §9.3 children / §9.4 reading_sessions / §9.5 favorites — 전부
 *   `parent_id = auth.uid()` 계열. 본인 세션 클라이언트로 호출되므로 본인 자녀만 가시하며,
 *   `.eq('child_id', childId)`는 명시 필터로 RLS의 2차 방어선이다.
 *
 * 의도 문서: docs/adr/0024-member-mypage.md D2·D3·D8 + Amendment O2
 */

/** 읽은 책·즐겨찾기 리스트에 노출하는 최대 권수(ADR-0024 작업지시서). */
const LIST_LIMIT = 20;

/**
 * 완독 세션 조회 상한 — 같은 책을 여러 번 완독하면 세션이 중복되므로 넉넉히 받아
 * book_id 기준으로 접은 뒤 LIST_LIMIT으로 자른다.
 */
const COMPLETED_SESSION_SCAN = 60;

/** 마이페이지 4개 섹션이 필요로 하는 데이터 일체. */
export interface MypageSummary {
  /** 완독한 책 **종수**(is_completed = true, 중복 제거). */
  completedCount: number;
  /** 읽는 중인 책 종수(세션은 있으나 미완독). 완독한 책은 제외한다. */
  inProgressCount: number;
  /** children.points 누적 포인트(ADR-0018 D5 매 완독 +50). */
  points: number;
  /** 최근 완독순 상위 LIST_LIMIT권. */
  readBooks: PopularBook[];
  /** 최근 추가순 상위 LIST_LIMIT권. */
  favoriteBooks: PopularBook[];
  /** 쿼리 1건 이상이 실패해 0·빈 배열로 폴백했으면 true. */
  degraded: boolean;
}

/** reading_sessions 조회 행. */
interface SessionRow {
  book_id: string;
  is_completed: boolean;
  completed_at: string | null;
}

/** favorites 조회 행. */
interface FavoriteRow {
  book_id: string;
}

/** children.points 조회 행. */
interface PointsRow {
  points: number | null;
}

/**
 * 자녀의 마이페이지 요약을 조회한다.
 *
 * 쿼리 구성 (3파):
 *   1파 Promise.all — 세션 전량 / 포인트 / 즐겨찾기 목록 (상호 무의존)
 *   2파               — 1파에서 얻은 book_id로 books 1회 조회 (읽은 책 + 즐겨찾기 합집합)
 *   3파               — toPopularBooks 1회 (book_audio 조회도 1회로 수렴)
 *   2·3파는 1파 결과에 의존하므로 병렬화할 수 없다. 대신 두 리스트의 id를 **합집합으로
 *   묶어 books·book_audio 왕복을 각각 1회**로 줄였다(리스트별 개별 조회 시 4왕복 → 2왕복).
 *
 * @param supabase 호출자가 만든 본인 세션 클라이언트.
 * @param childId  getActiveChild로 해소한 본인 자녀 id.
 */
export async function getMypageSummary(
  supabase: SupabaseClient,
  childId: string,
): Promise<MypageSummary> {
  let degraded = false;

  // ── 1파: 상호 의존 없는 3개 쿼리 병렬 ──────────────────────────────────────
  const [sessionsResult, pointsResult, favoritesResult] = await Promise.all([
    supabase
      .from('reading_sessions')
      .select('book_id, is_completed, completed_at')
      .eq('child_id', childId)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .returns<SessionRow[]>(),
    supabase
      .from('children')
      .select('points')
      .eq('id', childId)
      .maybeSingle<PointsRow>(),
    supabase
      .from('favorites')
      .select('book_id')
      .eq('child_id', childId)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT)
      .returns<FavoriteRow[]>(),
  ]);

  if (sessionsResult.error) {
    degraded = true;
  }
  if (pointsResult.error) {
    degraded = true;
  }
  if (favoritesResult.error) {
    degraded = true;
  }

  const sessions = sessionsResult.error ? [] : (sessionsResult.data ?? []);
  const points = pointsResult.error ? 0 : (pointsResult.data?.points ?? 0);
  const favoriteRows = favoritesResult.error ? [] : (favoritesResult.data ?? []);

  // 완독 책 종수 — 세션 행 수가 아니라 book_id 집합 크기(재완독 중복 제거).
  const completedBookIds: string[] = [];
  const completedSeen = new Set<string>();
  for (const row of sessions) {
    if (!row.is_completed || completedSeen.has(row.book_id)) {
      continue;
    }
    completedSeen.add(row.book_id);
    // 이미 completed_at DESC로 정렬돼 있으므로 최근 완독순이 그대로 보존된다.
    if (completedBookIds.length < COMPLETED_SESSION_SCAN) {
      completedBookIds.push(row.book_id);
    }
  }

  // 읽는 중 종수 — 미완독 세션이 있고, 그 책을 아직 한 번도 완독하지 않은 경우만.
  const inProgressSeen = new Set<string>();
  for (const row of sessions) {
    if (row.is_completed || completedSeen.has(row.book_id)) {
      continue;
    }
    inProgressSeen.add(row.book_id);
  }

  const readBookIds = completedBookIds.slice(0, LIST_LIMIT);
  const favoriteBookIds = favoriteRows.map((row) => row.book_id);

  // ── 2·3파: books 1회 + toPopularBooks 1회 (두 리스트 합집합) ───────────────
  const unionIds = Array.from(new Set([...readBookIds, ...favoriteBookIds]));
  const bookMap = await fetchBooksById(supabase, unionIds, () => {
    degraded = true;
  });

  return {
    completedCount: completedSeen.size,
    inProgressCount: inProgressSeen.size,
    points,
    // is_active=false 책은 bookMap에 없다 → 자동 제외(책 상세가 notFound라 죽은 링크 방지).
    readBooks: readBookIds.map((id) => bookMap.get(id)).filter(isPresent),
    favoriteBooks: favoriteBookIds.map((id) => bookMap.get(id)).filter(isPresent),
    degraded,
  };
}

/** Array.filter 타입 가드 — undefined 제거. */
function isPresent(book: PopularBook | undefined): book is PopularBook {
  return book !== undefined;
}

/**
 * book_id 목록 → PopularBook Map. 활성 책(is_active=true)만 담는다.
 *
 * 비활성 책(중복 표지 정리로 꺼진 231권 등)은 책 상세가 notFound()이므로 리스트에서
 * 빼는 편이 맞다 — 카드를 눌렀는데 404가 뜨는 죽은 링크를 만들지 않는다.
 */
async function fetchBooksById(
  supabase: SupabaseClient,
  bookIds: string[],
  onError: () => void,
): Promise<Map<string, PopularBook>> {
  if (bookIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('books')
    .select('id, title, author, cover_url')
    .in('id', bookIds)
    .eq('is_active', true)
    .returns<PopularBookRow[]>();

  if (error) {
    onError();
    return new Map();
  }

  const rows = data ?? [];

  // hasAudio 산출은 toPopularBooks 단일 통로 — has_audio 컬럼 직접 읽기 금지.
  const books = await toPopularBooks(supabase, rows);

  return new Map(books.map((book) => [book.id, book]));
}
