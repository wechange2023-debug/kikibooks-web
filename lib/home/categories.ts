import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { BOOK_DASH_404_SOURCE_IDS } from '@/lib/shared/blacklist';
import { fetchAllWithinRowCap } from '@/lib/shared/row-cap';
import {
  toPopularBooks,
  type PopularBook,
  type PopularBookRow,
} from '@/lib/landing/popular-books';

/**
 * 홈 화면 카테고리 그리드 8개 — 정적 키워드 매핑 전략 (ADR-0015).
 *
 * - 결정 1: 옵션 D — `book.title.toLowerCase().includes(keyword)` boolean 매칭
 * - 결정 2: 8 카테고리 × 평균 13.5 = 108 키워드 (본 파일 §CATEGORIES가 단일 진실 공급원)
 * - 결정 3: 매칭 실패 책 = 카테고리 그리드에서만 미노출 (β)
 * - 결정 4: 한 책이 여러 카테고리에 매칭되면 모두에 포함 (다중 매칭)
 * - 결정 5: 카테고리 카드 클릭 라우팅 = /home?cat={slug} (5b)
 * - 결정 6: 결과 0건 카테고리 폴백 메시지
 * - 결정 7: phase-13b 정식 컬럼 도입 트리거 = 정확도 ≤ 70% OR 클릭률 ≥ 10%
 * - Amendment #1: getCategoryDistribution()은 정확도 아닌 **분포** 측정 (ground truth 불필요)
 *
 * 키워드 풀 운영 규칙: 본 파일을 직접 수정하지 않고 ADR-0015 결정 2.2 / Amendment를
 * 갱신한 뒤에만 본 상수를 갱신한다.
 *
 * 의도 문서: docs/intent/screen-02-home.md §5.3
 */

/** 8개 카테고리 slug. ADR-0015 결정 2.1 표 인용. */
export type CategorySlug =
  | 'animals'
  | 'family'
  | 'abc'
  | 'numbers'
  | 'emotions'
  | 'nature'
  | 'food'
  | 'bedtime';

/** 1개 카테고리 정의. 키워드는 모두 lowercase 보관 (ADR-0015 결정 1·2). */
export interface CategoryDefinition {
  slug: CategorySlug;
  labelKo: string;
  keywords: readonly string[];
}

/**
 * 카테고리 정본 — ADR-0015 결정 2.2의 108 키워드를 그대로 옮긴다.
 *
 * 배열 순서 = 화면 그리드 노출 순서(2×4).
 */
export const CATEGORIES: readonly CategoryDefinition[] = [
  {
    slug: 'animals',
    labelKo: '동물',
    keywords: [
      'animal',
      'dog',
      'cat',
      'lion',
      'tiger',
      'bear',
      'monkey',
      'elephant',
      'rabbit',
      'bird',
      'fish',
      'horse',
      'pig',
      'fox',
      'duck',
    ],
  },
  {
    slug: 'family',
    labelKo: '가족',
    keywords: [
      'family',
      'mom',
      'dad',
      'mother',
      'father',
      'baby',
      'brother',
      'sister',
      'grandma',
      'grandpa',
      'parent',
      'home',
    ],
  },
  {
    slug: 'abc',
    labelKo: 'ABC',
    keywords: [
      'abc',
      'alphabet',
      'letter',
      'letters',
      'a is for',
      'b is for',
      'my first',
      'learn letters',
      'phonics',
      'first words',
    ],
  },
  {
    slug: 'numbers',
    labelKo: '숫자',
    keywords: [
      'number',
      'numbers',
      'count',
      'counting',
      'one two',
      'ten',
      'hundred',
      'zero',
      'math',
      'how many',
      'first numbers',
      '1 2 3',
    ],
  },
  {
    slug: 'emotions',
    labelKo: '감정',
    keywords: [
      'feel',
      'feeling',
      'feelings',
      'emotion',
      'happy',
      'sad',
      'angry',
      'scared',
      'brave',
      'kind',
      'friend',
      'friendship',
      'share',
      'smile',
      'fear',
    ],
  },
  {
    slug: 'nature',
    labelKo: '자연',
    keywords: [
      'tree',
      'flower',
      'garden',
      'forest',
      'mountain',
      'river',
      'ocean',
      'sea',
      'sun',
      'moon',
      'star',
      'rain',
      'snow',
      'season',
      'spring',
      'summer',
      'winter',
      'leaf',
    ],
  },
  {
    slug: 'food',
    labelKo: '음식',
    keywords: [
      'food',
      'eat',
      'fruit',
      'vegetable',
      'apple',
      'banana',
      'bread',
      'soup',
      'cake',
      'cook',
      'kitchen',
      'hungry',
      'meal',
      'lunch',
    ],
  },
  {
    slug: 'bedtime',
    labelKo: '잠자리',
    keywords: [
      'night',
      'sleep',
      'bedtime',
      'dream',
      'good night',
      'lullaby',
      'tired',
      'blanket',
      'bed',
      'pajama',
      'goodnight',
      'nap',
    ],
  },
];

/** slug → CategoryDefinition 빠른 조회. */
const CATEGORIES_BY_SLUG: Record<CategorySlug, CategoryDefinition> = Object.fromEntries(
  CATEGORIES.map((cat) => [cat.slug, cat]),
) as Record<CategorySlug, CategoryDefinition>;

/** 카테고리 결과 권수 캡 (cp2_decisions d9). 동일 카테고리 재진입 시 결과 변동 최소화. */
export const CATEGORY_BOOKS_CAP = 24;

/**
 * matchCategories 핫루프용 소문자 키워드 사전 계산 (P0-3(B), performance-track.md §3).
 *
 * 기존 matchCategories는 책마다 `kw.toLowerCase()`를 반복 호출했다 —
 * getCategoryDistribution이 활성 전권(~880) × 키워드(~108)를 매 홈 로드마다 돌리므로
 * 요청당 ~95,000회의 중복 소문자화가 발생했다. 키워드는 값이 불변이므로 모듈 로드 시
 * 1회만 소문자화해 재사용한다(안전망 toLowerCase는 유지 — 여기서 1회 적용).
 *
 * 배열 순서 = CATEGORIES 순서를 그대로 보존한다(matched 배열 순서 = 분포 카운트 불변).
 */
const CATEGORY_LOWER_KEYWORDS: readonly {
  slug: CategorySlug;
  keywords: readonly string[];
}[] = CATEGORIES.map((cat) => ({
  slug: cat.slug,
  keywords: cat.keywords.map((kw) => kw.toLowerCase()),
}));

/**
 * 주어진 책 제목과 매칭되는 카테고리 slug 목록을 반환한다.
 *
 * 알고리즘: `book.title.toLowerCase().includes(keyword)` boolean (ADR-0015 결정 1).
 * 키워드는 CATEGORY_LOWER_KEYWORDS에 사전 소문자화되어 있다(모듈 로드 1회, 안전망 유지).
 * 결과는 기존과 완전히 동일하다 — 소문자화 시점만 책당 반복에서 로드 1회로 이동(P0-3(B)).
 *
 * 다중 매칭 허용 (결정 4) — 한 책이 여러 카테고리에 들어갈 수 있다.
 * 매칭 0건이면 빈 배열을 반환 (결정 3 (β) — 카테고리 그리드에서만 미노출).
 *
 * 순수 함수, fetch 없음.
 */
export function matchCategories(book: { title: string }): CategorySlug[] {
  const lowerTitle = book.title.toLowerCase();
  const matched: CategorySlug[] = [];
  for (const cat of CATEGORY_LOWER_KEYWORDS) {
    if (cat.keywords.some((kw) => lowerTitle.includes(kw))) {
      matched.push(cat.slug);
    }
  }
  return matched;
}

/** slug 유효성 검사 (쿼리 파라미터 검증용). */
export function isCategorySlug(value: string): value is CategorySlug {
  return value in CATEGORIES_BY_SLUG;
}


/** reading_sessions 완독 행. */
interface CompletedSessionRow {
  book_id: string;
}

/**
 * 카테고리 결과 페이지의 책 목록을 반환한다.
 *
 * 정책 (cp2_decisions d9):
 *   - 정렬: synced_at DESC 안정 정렬 (동일 카테고리 재진입 시 결과 변동 최소화)
 *   - 캡: 기본 CATEGORY_BOOKS_CAP(24)권
 *   - 필터: is_active + 블랙리스트 제외 + 미독 (자녀 제공 시)
 *   - level 필터: 미적용 (intent §5.3 — 카테고리 입구는 주제 우선, 레벨은 별도 셀렉터)
 *     ADR-0015 §6 "권장 ±1"은 베타 단순성을 위해 본 코드에 적용하지 않는다.
 *     phase-13b 정확도 측정 후 재검토 가능.
 *
 * 매칭 자체는 DB가 아니라 JS 측에서 한다(컬럼 부재, ADR-0015 채택 옵션 D).
 * 따라서:
 *   1) 후보 활성 책 전수의 id·title을 가져온다(블랙리스트·미독 적용)
 *   2) matchCategories로 slug 매칭 검사
 *   3) synced_at DESC 정렬 후 cap 적용
 *   4) 선택된 id로 표지 카드 데이터 재조회
 */
export async function getCategoryBooks(
  supabase: SupabaseClient,
  slug: CategorySlug,
  child: { id: string } | null,
  capN: number = CATEGORY_BOOKS_CAP,
): Promise<PopularBook[]> {
  if (!isCategorySlug(slug)) {
    return [];
  }

  // 1) 후보 책 전수 id + title + synced_at 조회
  let candidateQuery = supabase
    .from('books')
    .select('id, title, synced_at')
    .eq('is_active', true)
    .order('synced_at', { ascending: false });

  for (const blockedSourceId of BOOK_DASH_404_SOURCE_IDS) {
    candidateQuery = candidateQuery.neq('source_id', blockedSourceId);
  }

  const { data: candidateRows, error: candidateError } = await candidateQuery.returns<
    { id: string; title: string; synced_at: string }[]
  >();
  if (candidateError) {
    throw new Error(`getCategoryBooks: 후보 조회 실패 — ${candidateError.message}`);
  }

  // 2) 카테고리 매칭 (synced_at DESC 정렬은 위 쿼리에서 이미 보장됨)
  let matched = (candidateRows ?? []).filter((row) =>
    matchCategories({ title: row.title }).includes(slug),
  );

  // 3) 미독 필터 (자녀 제공 시)
  if (child) {
    const completedIds = await fetchCompletedBookIds(supabase, child.id);
    matched = matched.filter((row) => !completedIds.has(row.id));
  }

  // 4) 캡 적용 후 표지 카드 상세 조회
  const cappedIds = matched.slice(0, Math.max(0, capN)).map((row) => row.id);
  if (cappedIds.length === 0) {
    return [];
  }

  const { data: bookRows, error: bookError } = await supabase
    .from('books')
    .select('id, title, author, cover_url')
    .in('id', cappedIds)
    .returns<PopularBookRow[]>();

  if (bookError) {
    throw new Error(`getCategoryBooks: 책 상세 조회 실패 — ${bookError.message}`);
  }

  // 4-1) 상세 결과를 cappedIds 순서로 정렬 (synced_at DESC 일관성 보장).
  //      toPopularBooks는 입력 순서를 그대로 보존하므로 정렬 후 넘긴다.
  const cardById = new Map((bookRows ?? []).map((row) => [row.id, row]));
  const orderedRows = cappedIds
    .map((id) => cardById.get(id))
    .filter((row): row is PopularBookRow => row !== undefined);

  // 오디오 배지 판정은 toPopularBooks(공용 단일 통로)가 전담 — 쿼리 1회.
  return toPopularBooks(supabase, orderedRows);
}

/** 자녀의 완독 book_id Set. recommendations.ts와 동일 구현 (소량 중복, 모듈 응집도 우선). */
async function fetchCompletedBookIds(
  supabase: SupabaseClient,
  childId: string,
): Promise<Set<string>> {
  // 행 상한 2중 가드 (ADR-0059 D1 #3) — 청크 페이징 + 길이 일치 감지.
  // 불일치는 헬퍼가 console.error 1줄로 남기고 **화면 표시는 바꾸지 않는다**: 이 Set은
  // 표시 수치가 아니라 차집합 필터이며, 잘림의 영향은 "이미 읽은 책이 재노출"에 그친다.
  // 화면을 에러로 막으면 원 버그보다 피해가 크다. 쿼리 실패에 throw하는 기존 동작은
  // queryError(불일치와 별개 신호)로 그대로 보존한다.
  const result = await fetchAllWithinRowCap<CompletedSessionRow>({
    label: 'fetchCompletedBookIds(categories): reading_sessions',
    selectCount: () =>
      supabase
        .from('reading_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('child_id', childId)
        .eq('is_completed', true),
    // offset 페이징의 결정적 정렬 키 — PK 오름차순(완독 행은 book_id 중복이 가능하다).
    selectChunk: (from, to) =>
      supabase
        .from('reading_sessions')
        .select('book_id')
        .eq('child_id', childId)
        .eq('is_completed', true)
        .order('id', { ascending: true })
        .range(from, to)
        .returns<CompletedSessionRow[]>(),
  });

  if (result.queryError) {
    throw new Error(result.queryError);
  }
  return new Set(result.rows.map((row) => row.book_id));
}

/**
 * 각 카테고리에 매칭되는 활성 책 권수를 반환한다(분포 측정, ADR-0015 Amendment #1).
 *
 * ★ 본 함수는 정확도(accuracy)가 아닌 **분포(distribution)**를 측정한다.
 *   ground truth(인간 라벨링) 불필요 — 단순 카운트.
 *
 * 용도:
 *   - 홈 페이지 CategoryGrid 렌더링 시 0건 카테고리 식별 (결정 6 폴백 UI 대상 검출)
 *   - phase-13b Admin "키워드 풀 정확도 측정 도구"의 baseline 데이터로 활용
 *     (운영자가 카테고리별 표본 추출 시 모집단 크기를 본 함수로 확보)
 *
 * 결정 7 트리거 임계 "(a) 정확도 ≤ 70%"와는 **무관** — 정확도는 외부 라벨링 필요.
 *
 * 블랙리스트는 적용하나 미독 필터는 적용하지 않는다(자녀 무관, 카탈로그 분포).
 */
/**
 * 카탈로그 캐시 전용 — 쿠키 없는 publishable 클라이언트 (ADR-0033 P0-1, 롤아웃 2단계).
 *
 * lib/book/detail.ts createCatalogClient와 동일 패턴(의도된 임시 중복 — 3단계 getBooks 이관 시
 * 공용 헬퍼로 일괄 dedup). unstable_cache 내부는 cookies() 등 동적 API를 쓸 수 없어 세션
 * 클라이언트를 못 쓴다. books RLS §9.1 USING(true) 공개라 세션 없이도 활성 책 조회 가능.
 *   - publishable 키만 — secret 키 아님(RLS 우회 아님, Hard Rule 6 무위반).
 *   - 사용자·자녀 스코프 데이터 접근이 구조적으로 차단된다(개인 데이터 혼입 불가).
 */
function createCatalogClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'getCategoryDistribution(cache): Supabase 환경변수 누락 — NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    );
  }

  return createSupabaseClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * getCategoryDistribution 캐시 코어 (ADR-0033 P0-1 롤아웃 2단계).
 *
 * Next.js unstable_cache로 공용 카탈로그 분포 계산 결과를 캐시한다.
 *   - 캐시 키: ['getCategoryDistribution'] (인자 없음 → 단일 엔트리).
 *   - tag: 'books-catalog' (파일럿 getBookById와 공유 — admin 토글/캐시비우기 버튼의
 *     revalidateTag가 둘 다 즉시 무효화. is_active 변경이 분포 count에도 영향).
 *   - revalidate: 3600초(1시간) — 파일럿과 동일. out-of-band sync를 결국 반영하는 안전망.
 * P0-3(B) 최적화(키워드 소문자화 선계산·title만 조회)는 캐시 코어 안에 그대로 유지된다 —
 * 캐싱은 그 계산의 결과를 메모이즈하므로 ~95k 매칭이 캐시 미스 시(시간당 1회)만 실행된다.
 * 반환 Record<CategorySlug, number>는 순수 JSON 직렬화 가능이라 캐시 왕복에도 값 불변.
 */
const getCategoryDistributionCached = unstable_cache(
  async (): Promise<Record<CategorySlug, number>> => {
    // P0-3(B): 분포 카운트는 title만 사용한다(id 미사용) — payload 축소.
    let query = createCatalogClient()
      .from('books')
      .select('title')
      .eq('is_active', true);

    for (const blockedSourceId of BOOK_DASH_404_SOURCE_IDS) {
      query = query.neq('source_id', blockedSourceId);
    }

    const { data, error } = await query.returns<{ title: string }[]>();
    if (error) {
      throw new Error(`getCategoryDistribution: books 조회 실패 — ${error.message}`);
    }

    const counts: Record<CategorySlug, number> = {
      animals: 0,
      family: 0,
      abc: 0,
      numbers: 0,
      emotions: 0,
      nature: 0,
      food: 0,
      bedtime: 0,
    };

    for (const row of data ?? []) {
      const matched = matchCategories({ title: row.title });
      for (const slug of matched) {
        counts[slug] += 1;
      }
    }

    return counts;
  },
  ['getCategoryDistribution'],
  { tags: ['books-catalog'], revalidate: 3600 },
);

export async function getCategoryDistribution(
  supabase: SupabaseClient,
): Promise<Record<CategorySlug, number>> {
  // ★ ADR-0033 P0-1 롤아웃 2단계 — 공용 카탈로그 캐싱(getCategoryDistributionCached).
  //   supabase 인자는 캐시 경로에서 사용하지 않는다 — 캐시 코어가 쿠키 없는 publishable
  //   클라이언트를 내부 생성한다(파일럿 getBookById와 동일, ADR-0033 안전 원칙). 인자는
  //   호출부 시그니처 안정성을 위해 유지하며, 3단계 getBooks 이관 시 일괄 정리한다.
  void supabase;
  return getCategoryDistributionCached();
}
