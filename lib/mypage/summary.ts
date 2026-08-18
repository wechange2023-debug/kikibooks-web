import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchAllWithinRowCap } from '@/lib/shared/row-cap';
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
 * ADR-0059 D2-b(2026-08-18 COMMIT 확정): 4수치의 **정본은 DB 함수**
 *   `public.get_child_reading_stats(p_child_id uuid)`다(SECURITY INVOKER). 세션 행을
 *   전량 받아 JS로 세던 구조를 폐기했으므로, 행 수가 늘어도 PostgREST 행 상한에
 *   걸리지 않는다. 함수 신설은 D3의 "스키마 변경 0건"에 대한 유일한 예외이며
 *   ADR-0059가 승인 근거다(테이블·컬럼·트리거는 여전히 0건).
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

/**
 * get_child_reading_stats RPC 반환 1행 (ADR-0059 D2-b).
 *
 * bigint 3종은 PostgREST가 JSON number로 직렬화한다. 권수 2종은 ADR-0024 O2의
 * **책 종수** 정의를 그대로 따른다 — 세션 행 수가 아니다.
 */
interface ReadingStatsRow {
  /** reading_sessions 행 수(총계). 진단용 — 화면 계약에는 넣지 않는다. */
  session_rows: number;
  /** is_completed = true 인 DISTINCT book_id 종수. */
  completed_titles: number;
  /** 완독 이력이 전혀 없는 DISTINCT book_id 종수. completed_titles와 상호 배타. */
  in_progress_titles: number;
  /** 완독 세션의 MAX(completed_at). 완독 0건이면 null. */
  last_read_at: string | null;
}

/** '읽은 책' 목록 순서를 얻기 위한 완독 세션 행. is_completed = true로 좁혀 조회한다. */
interface CompletedSessionRow {
  book_id: string;
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
 *   1파 Promise.all — **RPC 4수치** / 포인트 / 즐겨찾기 목록 / 완독 세션 목록 (상호 무의존)
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

  // ── 1파: 상호 의존 없는 4개 쿼리 병렬 ──────────────────────────────────────
  const [statsResult, pointsResult, favoritesResult, completedResult] = await Promise.all([
    // 4수치의 **정본**(ADR-0059 D2-b) — DB가 집계한 값을 왕복 1회로 받는다. 행 수와
    // 무관하므로 PostgREST 행 상한 문제가 이 경로에서는 구조적으로 소멸한다.
    // SECURITY INVOKER라 reading_sessions RLS(001 §9.4)가 그대로 걸린다.
    supabase
      .rpc('get_child_reading_stats', { p_child_id: childId })
      .maybeSingle<ReadingStatsRow>(),
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
    // '읽은 책' 목록의 **순서**는 RPC가 주지 않는다(종수·타임스탬프만 반환). 그래서
    // 세션 조회가 남지만, 범위를 **완독 세션으로 한정**해 전체 세션 전량 스캔(절단의
    // 직접 원인, 실측 2,433행)을 없앴다 — 완독 행은 실측 52행이라 사실상 1왕복이다.
    // 행 상한 가드는 유지한다(ADR-0059 D1): 목록이 조용히 잘리면 책이 사라진다.
    // 보조 정렬 키 id ASC는 필수다 — 같은 completed_at 동률에서 청크 경계가 흔들린다.
    fetchAllWithinRowCap<CompletedSessionRow>({
      label: 'getMypageSummary: reading_sessions(completed)',
      selectCount: () =>
        supabase
          .from('reading_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('child_id', childId)
          .eq('is_completed', true),
      selectChunk: (from, to) =>
        supabase
          .from('reading_sessions')
          .select('book_id')
          .eq('child_id', childId)
          .eq('is_completed', true)
          .order('completed_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, to)
          .returns<CompletedSessionRow[]>(),
    }),
  ]);

  // RPC 실패·0행은 degraded로 승격하고 **청크 방식으로 폴백하지 않는다** — 폴백은
  // ADR-0059가 없앤 절단 버그를 되살린다. 신규 필드 0건(기존 degraded 재사용).
  const stats = statsResult.error ? null : statsResult.data;
  if (!stats) {
    degraded = true;
  }
  if (pointsResult.error) {
    degraded = true;
  }
  if (favoritesResult.error) {
    degraded = true;
  }
  // 목록 조회는 길이 불일치도 degraded다 — 조용히 잘리면 '읽은 책'에서 책이 사라진다.
  if (!completedResult.consistent) {
    degraded = true;
  }

  const points = pointsResult.error ? 0 : (pointsResult.data?.points ?? 0);
  const favoriteRows = favoritesResult.error ? [] : (favoritesResult.data ?? []);

  // 최근 완독순 상위 LIST_LIMIT권의 book_id — **종수 산출에는 쓰지 않는다**.
  // 4수치의 정본은 RPC 하나뿐이며, 같은 수치를 두 경로로 만들지 않는다.
  const readBookIds: string[] = [];
  const readSeen = new Set<string>();
  for (const row of completedResult.rows) {
    if (readSeen.has(row.book_id)) {
      continue;
    }
    readSeen.add(row.book_id);
    // 이미 completed_at DESC로 정렬돼 있으므로 최근 완독순이 그대로 보존된다.
    readBookIds.push(row.book_id);
    if (readBookIds.length >= LIST_LIMIT) {
      break;
    }
  }

  const favoriteBookIds = favoriteRows.map((row) => row.book_id);

  // ── 2·3파: books 1회 + toPopularBooks 1회 (두 리스트 합집합) ───────────────
  const unionIds = Array.from(new Set([...readBookIds, ...favoriteBookIds]));
  const bookMap = await fetchBooksById(supabase, unionIds, () => {
    degraded = true;
  });

  return {
    // ADR-0024 O2 정의(책 종수) 그대로 — RPC가 DISTINCT book_id로 센 값이다.
    completedCount: stats?.completed_titles ?? 0,
    inProgressCount: stats?.in_progress_titles ?? 0,
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
