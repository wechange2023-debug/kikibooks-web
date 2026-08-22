import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';

import { AsbReader } from '@/components/book/asb-reader';
import { AudioReader } from '@/components/book/audio-reader';
import { FinishButton } from '@/components/book/finish-button';
import { HtmlReader } from '@/components/book/html-reader';
import { ReaderAttributionBar } from '@/components/book/reader-attribution-bar';
import { ReaderExitGuard } from '@/components/book/reader-exit-guard';
import { assertAdmin } from '@/lib/admin/gate';
import { SIGN_IN_PATH } from '@/lib/auth/routes';
import { getAudioReaderBook } from '@/lib/book/audio-manifest';
import { buildAttributionRows, type AttributionRow } from '@/lib/book/attribution';
import { getBookDetailCopy, getBookReaderCopy } from '@/lib/book/copy';
import { getBookByIdIncludingInactive } from '@/lib/book/detail';
import { getActiveChild } from '@/lib/home/active-child';
import { PREVIEW_PARAM, isPreviewParamValue } from '@/lib/book/preview-mode';
import { BOOK_DASH_404_SOURCE_IDS } from '@/lib/shared/blacklist';
import { createClient } from '@/lib/supabase/server';
import { BRAND_NAME } from '@/lib/brand';

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
 *   3. books 행 NULL (책이 없음·RLS 차단) → notFound
 *   4. ADR-0014 Amendment #5 블랙리스트 4 UUID 일치 → notFound (5번째 차단 표면 —
 *      깨진 GitHub Pages를 iframe이 로드하지 않도록 사전 차단)
 *   5. is_active = false → **redirect(/book/[id])** (ADR-0063 D3, 2026-08-19 신설).
 *      종전에는 조회 함수가 is_active=true를 걸어 가드 3에 흡수돼 404였다. 이제
 *      getBookByIdIncludingInactive로 "없는 책"과 "쉬는 책"을 나눠, 쉬는 책은 상세의
 *      안내 화면으로 흘려보낸다. **진입 차단이라는 결과 자체는 종전과 동일하다.**
 *      관리자 `?preview=1` 진입만 예외 통과한다(D4).
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
  title: `책 읽기 · ${BRAND_NAME}`,
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
  /** `?preview=1` — 관리자 검수 진입 표시 (ADR-0063 D4). 그 외 키는 읽지 않는다. */
  searchParams?: { [PREVIEW_PARAM]?: string };
}

/**
 * 비활성 도서 예외 통과 판정 — 관리자 role **AND** `preview=1` (ADR-0063 D4·O-D5-1).
 *
 * app/(reader)/book/[id]/page.tsx의 동명 함수와 **같은 판정**이다. 두 라우트가 각자
 * 자기 searchParams를 읽어야 해서 함수 본체가 양쪽에 있으나, **판정 기준은 이원화되지
 * 않는다** — 관리자 여부는 양쪽 모두 lib/admin/gate.ts:202 assertAdmin 단일 출처를
 * 그대로 쓰고, preview 값 판정도 lib/book/preview-mode.ts:45 isPreviewParamValue
 * 단일 출처를 쓴다. 한쪽만 고치는 일이 없도록 두 주석이 서로를 가리킨다.
 *
 * **단축 평가**: preview 파라미터가 없으면 assertAdmin을 부르지 않는다. 파라미터가
 * 없으면 예외 통과가 성립하지 않으므로 role 확인이 불필요하다(논리적 동치).
 * 정상 열람 경로의 추가 왕복 0건.
 */
async function isAdminPreview(previewValue: string | undefined): Promise<boolean> {
  if (!isPreviewParamValue(previewValue)) {
    return false;
  }

  const admin = await assertAdmin();
  return admin.ok;
}

export default async function ReadPage({ params, searchParams }: ReadPageProps) {
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
    getBookByIdIncludingInactive(supabase, params.id),
    getBookDetailCopy(),
    getBookReaderCopy(),
  ]);

  if (!book) {
    notFound();
  }

  // 가드 4: ADR-0014 Amendment #5 블랙리스트 4 UUID 차단 (5번째 표면)
  // ★ 가드 5(비활성)보다 먼저 평가한다 — 블랙리스트는 활성 여부와 무관하게 404다.
  if (
    book.source_platform === 'book_dash' &&
    (BOOK_DASH_404_SOURCE_IDS as readonly string[]).includes(book.source_id)
  ) {
    notFound();
  }

  // 가드 5: 비활성 도서 → **상세로 redirect** (ADR-0063 D3, 2026-08-19 신설).
  //   진입 차단이라는 결과는 종전(notFound)과 같고 착지점만 바뀐다 — 아이가 막다른
  //   404 대신 상세의 안내 화면(D2)에 도착한다. 관리자 preview 진입만 예외 통과하며,
  //   assertAdmin은 이 분기 안에서만 호출된다(단축 평가, isAdminPreview 주석 참조).
  if (!book.is_active && !(await isAdminPreview(searchParams?.[PREVIEW_PARAM]))) {
    redirect(`/book/${book.id}`);
  }

  // ADR-0064 **D4** — 자녀 0명이면 완독 버튼을 렌더하지 않는다.
  //
  //   종전에는 버튼이 무조건 렌더돼, 누르면 completeReadingSession이
  //   "자녀 정보를 찾을 수 없습니다"를 되돌려 생짜 에러 문구가 떴다
  //   (`lib/book/reading-session.ts:204-208`). 반면 세션 **시작**은 같은 상황에서
  //   조용히 건너뛰고 ok:true를 돌려준다(`:127-131`) — 둘이 비대칭이었다.
  //   버튼을 숨겨 둘을 대칭으로 맞춘다.
  //
  //   ★ 서버의 에러 반환 자체는 그대로 둔다 — 안전망이다(ADR-0064 §불변 사항).
  //   이 페이지의 가드 5종은 그대로다 — **열람 자체는 자녀 유무와 무관**하게 허용된다.
  const activeChild = await getActiveChild(supabase, user.id);
  const finishButton = activeChild ? (
    <FinishButton bookId={book.id} copy={readerCopy.finish} />
  ) : null;

  // 미니 바 행 압축 — buildAttributionRows 재사용, page에서 선별 (신규 export 0건)
  const allAttributionRows = buildAttributionRows(book, detailCopy);
  const readerRows = allAttributionRows.filter((row) => READER_BAR_KEYS.has(row.key));
  // 오디오 리더 ⓘ 팝오버용(F7) — illustrator 포함(미니 바보다 넓은 시트).
  const readerPopoverRows = allAttributionRows.filter((row) =>
    READER_POPOVER_KEYS.has(row.key),
  );

  // 오디오 리더 분기 (ADR-0052 Phase D·F) — book_audio 행이 있는 책만.
  //   ★ ADR-0067 D1(a) — 게이트가 **쿼리 0회**가 됐다. 종전에는 hasReaderAudio()로 book_audio를
  //   한 번 더 읽었는데, 그 판정값은 이미 book.hasAudio에 들어 있다 — 둘 다
  //   selectReaderAudioBookIds·같은 기본 voice로 산출된다(lib/book/detail.ts:170·:249).
  //   대신 book.hasAudio는 카탈로그 캐시(revalidate 3600)를 거쳐 **최대 1시간 stale**일 수 있다.
  //   그래도 배지와 게이트가 **같은 값을 보게 되므로** 둘이 어긋나던 종전보다 정합적이다.
  //   판정이 true인데 실제 행이 0이면 audioPageCount가 0이 되어 아래 content_type 경로로
  //   그대로 떨어진다 — 기존 896권 html·asb_native 동작은 변하지 않는다(회귀 0).
  //
  //   ★ 판정 단일화 (2026-07-28):
  //     리더 게이팅(재생·연속 듣기·하이라이트)과 카드·상세·관리자의 "듣기 지원" 배지가
  //     모두 selectReaderAudioBookIds(lib/book/audio-manifest.ts) 한 함수를 쓴다 —
  //     book_audio에 (kind='page', voice=DEFAULT_READER_VOICE) 행이 있는가.
  //     즉 배지가 뜨는 책은 여기서도 오디오 리더로 열린다.
  //
  //   종전에는 배지만 books.has_audio 컬럼을 따로 봤다(표시/게이팅 진실 원천 분리).
  //   그 결과 구 Ruth 44권(voice='Ruth')에서 배지는 뜨는데 재생은 안 되는 상태가 생겨
  //   판정을 하나로 합쳤다. has_audio 컬럼 자체는 미접촉이며 읽기 참조만 끊었다.
  if (book.hasAudio) {
    // ADR-0067 D1(b) — 이미 읽은 book을 넘긴다. getAudioReaderBook이 books를 다시 읽지 않는다.
    const audioBook = await getAudioReaderBook(book);
    if (audioBook.audioPageCount > 0) {
      // 제목·페이지수·뒤로가기는 AudioReader 헤더가 보유 → 외곽 h1 중복 제거.
      // 어트리뷰션 바(CC BY 의무)는 page 레벨 유지. 완독 버튼은 P2-B 재배치로
      // AudioReader 하단 1행에 합류시킨다 — FinishButton 자체는 무수정(슬롯 주입).
      // 배경은 순백(P2-C). bg-surface = --color-surface = #FFFFFF (semantic 토큰, Hard Rule 10).
      // 오디오 리더 화면 한정 — 아래 content_type 경로는 bg-surface-2 그대로다.
      // 상단 어트리뷰션 바 제거(Wave 1.7 F7·F8) — 그림 영역 확장을 위해 세로를 양보하고,
      // CC BY 어트리뷰션은 AudioReader 헤더 ⓘ 팝오버로 1탭 도달을 보장한다(readerPopoverRows).
      // 아래 content_type 경로는 기존대로 ReaderAttributionBar를 유지한다(회귀 0).
      // 이탈 확인 가드(Wave 2 F5) — AudioReader 형제로 마운트한다. 재생 상태와 접점이
      // 없어(props·ref 공유 0건) 오디오·하이라이트 로직은 무수정이다.
      // ★ 2026-08-21 정정: 종전 주석은 "완독 → /celebrate는 클라이언트 라우팅이라
      //   가드가 발화하지 않는다"고 했으나 **틀렸다**. 서버액션 redirect가 MPA 폴백으로
      //   문서를 언로드해 beforeunload가 떴다(팀장 프로덕션 실측). 이제 FinishButton이
      //   호출 직전에 READER_LEAVING_EVENT를 쏴 가드를 내린다(reader-exit-guard.tsx 참조).
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
              finishSlot={finishButton}
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
            <p className="font-display text-h3 font-semibold text-text">
              {readerCopy.unsupportedFormat.notice}
            </p>
            <a
              href={book.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex h-11 items-center justify-center rounded-pill border border-outline bg-surface px-6 text-label font-semibold text-text transition-colors duration-200 ease-kiki hover:bg-surface-2"
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
      <h1 className="truncate border-b border-outline bg-surface px-4 py-2 font-display text-body font-semibold text-text md:px-6">
        {book.title}
      </h1>
      <ReaderAttributionBar rows={readerRows} />
      <main className="flex-1 overflow-hidden">{readerBody}</main>
      {/* 자녀 0명이면 푸터 바 자체를 내린다 — 빈 띄가 남지 않게(ADR-0064 D4). */}
      {finishButton ? (
        <footer className="border-t border-outline bg-surface px-4 py-3">
          {finishButton}
        </footer>
      ) : null}
    </div>
  );
}
