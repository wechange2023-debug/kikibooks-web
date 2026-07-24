import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';

import { AsbReader } from '@/components/book/asb-reader';
import { AudioReader } from '@/components/book/audio-reader';
import { FinishButton } from '@/components/book/finish-button';
import { HtmlReader } from '@/components/book/html-reader';
import { ReaderAttributionBar } from '@/components/book/reader-attribution-bar';
import { ReaderExitGuard } from '@/components/book/reader-exit-guard';
import { SIGN_IN_PATH } from '@/lib/auth/routes';
import { getAudioReaderBook, hasReaderAudio } from '@/lib/book/audio-manifest';
import { buildAttributionRows, type AttributionRow } from '@/lib/book/attribution';
import { getBookDetailCopy, getBookReaderCopy } from '@/lib/book/copy';
import { getBookById } from '@/lib/book/detail';
import { BOOK_DASH_404_SOURCE_IDS } from '@/lib/shared/blacklist';
import { createClient } from '@/lib/supabase/server';

/**
 * /book/[id]/read — Screen 04 책 뷰어 페이지 (ADR-0017 D1 iframe 단일 경로).
 *
 * phase-11 ReadButton(href=/book/[id]/read)이 본 페이지 신규로 자연 활성화된다
 * (ReadButton 수정 0건). content_type='html' 책을 HtmlReader iframe으로 임베드하고,
 * 상단 미니 어트리뷰션 바로 CC BY 4.0 의무를 충족한다(ADR-0016 Amendment #1).
 *
 * 가드 4종 (옵션 P — app/book/[id]/page.tsx의 4-가드 패턴을 복사 상속한다.
 *           가드 함수 추출 리팩토링은 phase-12 범위 외이며 향후 phase에서 검토한다.
 *           복사 사유: 추출은 데이터 레이어 영향 평가가 필요한 별도 작업 단위):
 *   1. params.id UUID 형식 불일치 → notFound (DB 호출 방지)
 *   2. 미인증 → redirect(/login) (미들웨어 1차, 본 페이지 2차 안전망)
 *   3. books 행 NULL (없음·is_active=false·RLS 차단) → notFound
 *   4. ADR-0014 Amendment #5 블랙리스트 4 UUID 일치 → notFound (5번째 차단 표면 —
 *      깨진 GitHub Pages를 iframe이 로드하지 않도록 사전 차단)
 *
 * 미니 어트리뷰션 바 (ADR-0016 Amendment #1):
 *   buildAttributionRows(book, detailCopy) 결과에서 author/publisher·license·
 *   originalLink 행만 선별(source·illustrator 제외)해 ReaderAttributionBar에 전달한다.
 *   신규 분기·신규 카피 0건(단일 출처, ADR-0012 결정 2). 책 제목은 페이지 h1 헤더에
 *   노출해 '제목 + 어트리뷰션 = 통합 어트리뷰션 단위'(ADR-0016 결정 3)를 충족한다.
 *
 * content_type 분기 (ADR-0017 D1·D2):
 *   'html' → HtmlReader(실데이터 896/896). epub·h5p·pdf → 미지원 안내 골격(실데이터
 *   0건). switch + never exhaustive check로 향후 content_type 확장 시 컴파일 단계에서
 *   누락을 잡는다(Book.content_type 유니온 타입 가치 발현).
 *
 * Cache 정책: export const dynamic = 'force-dynamic' (page.tsx·phase-10 d3 정합 —
 *   세션 쓰기·자녀 의존). Metadata robots noindex (ADR-0013 결정 4 closed environment,
 *   app/robots.ts '/book' disallow와 정합).
 *
 * 여백: 본 페이지 root는 px-* 0건 — 뷰어 좌우 여백(§7.2 16/32/64px)은 HtmlReader
 *   외곽 wrapper가 보유한다(CP3-a-3 박제, 중복 적용 방지).
 *
 * 완독 버튼(FinishButton, CP3-b 통합 완료): iframe 하단 footer에 배치(intent §5.3 —
 *   "iframe 하단"). HtmlReader(상단 iframe)와 FinishButton(하단)이 동일 book.id를 받지만
 *   sessionId threading은 0건이다 — HtmlReader는 마운트 시 startReadingSession(bookId)로
 *   세션을 시작(옵션 A)하고, FinishButton의 completeReadingSession(bookId)은 server에서
 *   (child_id, book_id, completed_at IS NULL)로 동일 세션을 재조회해 완독 처리한다
 *   (CP3-b-2 시그니처 확정 — start/complete 가드 키 대칭).
 *
 * Server Component — 가드·fetch·조립. 클라이언트 상태는 HtmlReader('use client')에 한정.
 *
 * 의도 문서: docs/intent/screen-04-reader.md §4·§5
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '책 읽기 · 키키북스',
  robots: { index: false, follow: false },
};

/** 표준 UUID 형식 (page.tsx와 동일 — 옵션 P 복사). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 미니 바 표시 행 key (source·illustrator 제외 — ADR-0016 Amendment #1). */
const READER_BAR_KEYS: ReadonlySet<AttributionRow['key']> = new Set([
  'author',
  'publisher',
  'license',
  'originalLink',
]);

/**
 * 오디오 리더 ⓘ 팝오버 표시 행 key (Wave 1.7 F7). 미니 바보다 넓은 시트라 illustrator까지
 * 포함해 CC BY 필수 4요소(작가+illustrator·라이선스+링크·원본)를 모두 담는다. source만 제외
 * (책 제목은 AudioReader가 book.title로 별도 노출). 상단 바 제거로 사라진 어트리뷰션 도달을
 * 리더 내 1탭으로 대체한다(license-rules.md §7 어트리뷰션 상시 도달 의무).
 */
const READER_POPOVER_KEYS: ReadonlySet<AttributionRow['key']> = new Set([
  'author',
  'publisher',
  'illustrator',
  'license',
  'originalLink',
]);

interface ReadPageProps {
  params: { id: string };
}

export default async function ReadPage({ params }: ReadPageProps) {
  // 가드 1: UUID 형식 사전 차단 — DB 호출 방지 + 보안
  if (!UUID_RE.test(params.id)) {
    notFound();
  }

  // 가드 2: 미인증 안전망 — 미들웨어가 1차, 본 페이지가 2차 (phase-07 정합)
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  // 가드 3·정상 fetch 병렬 — book + 카피 2종 의존성 없음
  const [book, detailCopy, readerCopy] = await Promise.all([
    getBookById(supabase, params.id),
    getBookDetailCopy(),
    getBookReaderCopy(),
  ]);

  if (!book) {
    notFound();
  }

  // 가드 4: ADR-0014 Amendment #5 블랙리스트 4 UUID 차단 (5번째 표면)
  if (
    book.source_platform === 'book_dash' &&
    (BOOK_DASH_404_SOURCE_IDS as readonly string[]).includes(book.source_id)
  ) {
    notFound();
  }

  // 미니 바 행 압축 — buildAttributionRows 재사용, page에서 선별 (신규 export 0건)
  const allAttributionRows = buildAttributionRows(book, detailCopy);
  const readerRows = allAttributionRows.filter((row) => READER_BAR_KEYS.has(row.key));
  // 오디오 리더 ⓘ 팝오버용(F7) — illustrator 포함(미니 바보다 넓은 시트).
  const readerPopoverRows = allAttributionRows.filter((row) =>
    READER_POPOVER_KEYS.has(row.key),
  );

  // 오디오 리더 분기 (ADR-0052 Phase D·F) — book_audio 행이 있는 책만.
  //   게이트는 count 전용 쿼리 1회(hasReaderAudio). 행이 0이면 아래 content_type 경로를
  //   그대로 타므로 기존 896권 html·asb_native 동작은 변하지 않는다(회귀 0).
  //
  //   ★ 진실 원천 분리 (Phase F 결정):
  //     - 리더의 오디오 기능 게이팅(재생·연속 듣기·하이라이트)은 book_audio 행 존재를
  //       정본으로 쓴다 — 실제 재생 가능한 오브젝트가 있는 책만 오디오 UI를 띄운다.
  //     - 카드·상세의 "듣기 지원" 아이콘 표시는 books.has_audio 컬럼을 쓴다(표시 전용).
  //   has_audio를 리더 게이트로 쓰지 않는 이유: getBookById의 SELECT는
  //   unstable_cache('books-catalog', 1h) 경유라, 여기서 컬럼값에 기능을 걸면 캐시된 표시
  //   신호와 실제 오브젝트 존재가 어긋날 수 있다(ADR-0033). 읽기 라우트 안에서 끝나는
  //   book_audio 조회가 영향 범위가 좁고 정본과 일치한다.
  if (await hasReaderAudio(book.id)) {
    const audioBook = await getAudioReaderBook(book.id);
    if (audioBook && audioBook.audioPageCount > 0) {
      // 제목·페이지수·뒤로가기는 AudioReader 헤더가 보유 → 외곽 h1 중복 제거.
      // 어트리뷰션 바(CC BY 의무)는 page 레벨 유지. 완독 버튼은 P2-B 재배치로
      // AudioReader 하단 1행에 합류시킨다 — FinishButton 자체는 무수정(슬롯 주입).
      // 배경은 순백(P2-C). bg-surface = --color-surface = #FFFFFF (semantic 토큰, Hard Rule 10).
      // 오디오 리더 화면 한정 — 아래 content_type 경로는 bg-surface-2 그대로다.
      // 상단 어트리뷰션 바 제거(Wave 1.7 F7·F8) — 그림 영역 확장을 위해 세로를 양보하고,
      // CC BY 어트리뷰션은 AudioReader 헤더 ⓘ 팝오버로 1탭 도달을 보장한다(readerPopoverRows).
      // 아래 content_type 경로는 기존대로 ReaderAttributionBar를 유지한다(회귀 0).
      // 이탈 확인 가드(Wave 2 F5) — AudioReader 형제로 마운트한다. 재생 상태와 접점이
      // 없어(props·ref 공유 0건) 오디오·하이라이트 로직은 무수정이다. 완독 → /celebrate는
      // 클라이언트 라우팅이라 가드가 발화하지 않는다(정상 흐름 무간섭).
      // html·asb_native 경로에는 달지 않는다 — intent 문서가 기존 뷰어 일관성을 미결로 둠.
      return (
        <div className="flex h-screen flex-col bg-surface">
          <ReaderExitGuard
            bookDetailHref={`/book/${book.id}`}
            copy={readerCopy.exitGuard}
          />
          <main className="flex-1 overflow-hidden">
            <AudioReader
              book={audioBook}
              bookDetailHref={`/book/${book.id}`}
              autoAdvanceLabel={readerCopy.audioReader.autoAdvanceLabel}
              attributionRows={readerPopoverRows}
              finishSlot={<FinishButton bookId={book.id} copy={readerCopy.finish} />}
            />
          </main>
        </div>
      );
    }
  }

  // content_type 분기 — html 실구현, 나머지는 미지원 안내 골격 (ADR-0017 D1·D2)
  let readerBody: ReactNode;
  switch (book.content_type) {
    case 'html':
      readerBody = (
        <HtmlReader
          bookId={book.id}
          src={book.content_url}
          title={book.title}
          readerCopy={readerCopy.reader}
          bookDetailHref={`/book/${book.id}`}
          // Book Dash만 외부 페이지 상단 #nav-bar(fixed) 클리핑 — 작업4 STEP C.
          // GDL은 H5P embed로 chrome 부재(ADR-0017 Am#3)라 클리핑 0.
          clipNavBar={book.source_platform === 'book_dash'}
        />
      );
      break;
    case 'asb_native':
      // ASb 자체 렌더 — content_url(.txt) fetch + parseAsbText(ADR-0025 Amd#3·#6).
      readerBody = (
        <AsbReader
          bookId={book.id}
          contentUrl={book.content_url}
          coverUrl={book.cover_url}
          title={book.title}
          originalUrl={book.original_url}
          originalLinkLabel={readerCopy.unsupportedFormat.originalLinkLabel}
          readerCopy={readerCopy.reader}
          bookDetailHref={`/book/${book.id}`}
        />
      );
      break;
    case 'epub':
    case 'h5p':
    case 'pdf':
      readerBody = (
        <div className="flex h-full w-full flex-col px-4 py-4 md:px-8 lg:px-16">
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-3 rounded-lg bg-surface-3 px-6 text-center shadow-elev-2">
            <p className="font-display text-lg font-semibold text-text">
              {readerCopy.unsupportedFormat.notice}
            </p>
            <a
              href={book.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex h-11 items-center justify-center rounded-pill border border-outline bg-surface px-6 text-sm font-semibold text-text transition-colors duration-200 ease-kiki hover:bg-surface-2"
            >
              {readerCopy.unsupportedFormat.originalLinkLabel}
            </a>
          </div>
        </div>
      );
      break;
    default: {
      // exhaustive check — content_type 유니온 확장 시 컴파일 에러로 누락 포착
      const _exhaustive: never = book.content_type;
      readerBody = _exhaustive;
    }
  }

  return (
    <div className="flex h-screen flex-col bg-surface-2">
      <h1 className="truncate border-b border-outline bg-surface px-4 py-2 font-display text-base font-semibold text-text md:px-6">
        {book.title}
      </h1>
      <ReaderAttributionBar rows={readerRows} />
      <main className="flex-1 overflow-hidden">{readerBody}</main>
      <footer className="border-t border-outline bg-surface px-4 py-3">
        <FinishButton bookId={book.id} copy={readerCopy.finish} />
      </footer>
    </div>
  );
}
