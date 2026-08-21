import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { WordPlay } from '@/components/book/word-play';
import { SIGN_IN_PATH } from '@/lib/auth/routes';
import { getBookByIdIncludingInactive } from '@/lib/book/detail';
import { createClient } from '@/lib/supabase/server';
import { getWordPlay } from '@/lib/wordplay/get-word-play';
import { BRAND_NAME } from '@/lib/brand';

/**
 * /book/[id]/wordplay — 단어 놀이 전용 화면 (ADR-0065 Amendment #2 D-B1 · Q-1).
 *
 * 종전에는 celebrate 화면 **안에** 단어 놀이가 얹혀 있었다(본문 D3). 놀이가 둘(단어 놀이·
 * 책 퀴즈)로 늘면서 한 화면에 얹기 어려워져 전용 URL로 분리했다 — celebrate는 허브가 되고
 * 여기서는 놀이만 한다(Amd#2 §배경).
 *
 * ★ A안 — 가드를 두지 않는다 (Amd#2 D-B2):
 *   완독 여부·진입 경로를 **검사하지 않는다.** 주소를 직접 열어도 뜬다.
 *   무기록(D1)이라 보호할 상태가 없고, "완독했는가"를 판정하려면 `reading_sessions`를
 *   읽어야 하는데 그것은 O-10 미해소 구간에 새 의존을 만든다(ADR-0059).
 *   → **`reading_sessions` 조회 0건**이다. celebrate와 다른 점이 바로 이것이다.
 *
 * ★ 자녀 0명도 들어온다 (ADR-0065 D6):
 *   무기록이라 자녀 단위 데이터를 쓰지 않으므로 기록계 기능이 아니다. celebrate가
 *   자녀를 요구하는 이유는 축하 문구에 이름이 필요해서인데(`celebrate/page.tsx:127-130`),
 *   여기에는 그런 문구가 없다. → `getActiveChild` 호출 0건.
 *
 * ★ 무기록(ADR-0065 D1): 이 경로 전체에서 INSERT/UPDATE **0건**. SELECT + Storage 읽기만.
 *
 * 가드 4종:
 *   1. params.id UUID 형식 불일치 → notFound (DB 호출 방지)
 *   2. 미인증 → redirect(/login) (미들웨어 1차 — PROTECTED_PREFIXES '/book', 본 페이지 2차)
 *   3. books 행 NULL → notFound
 *   4. 단어 놀이 데이터 없음 → notFound
 *
 * 가드 4가 notFound인 이유 (ADR-0065 D2 조용한 미표시):
 *   대상 아닌 책(GDL 464권 등)에는 이 화면이 **존재하지 않는다.** "준비 중" 안내나 빈 화면을
 *   새로 만들지 않고 기존 404(`app/(reader)/book/[id]/not-found.tsx`)를 그대로 쓴다 —
 *   없는 기능을 설명하면 아이에게는 "못 하는 것"의 목록이 된다(D2 선례 인용).
 *   celebrate의 ADR-0063 D5(완독 직후 404 금지)와 충돌하지 않는다. 그 규칙은 **완독 직후
 *   축하 화면**을 지키기 위한 것이고, 여기는 진입 버튼 자체가 렌더되지 않는 경로다.
 *
 * 비활성 도서(ADR-0063 D5 승계): `getBookByIdIncludingInactive`로 조회해 is_active=false인
 *   책에서도 놀이를 막지 않는다. 이미 읽은 책의 단어를 되짚는 것을 취소할 이유가 없다.
 *
 * Server Component — 가드·fetch·조립만. 인터랙션은 WordPlay('use client')에 위임한다.
 *
 * ADR: docs/adr/0065-word-card-quiz-pilot.md D1·D2·D4·D6 + Amendment #2 D-B1·D-B2·D-B7
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `단어 놀이 · ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

/** 표준 UUID 형식 (celebrate/page.tsx:78과 동일 — 가드 1). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface WordPlayPageProps {
  params: { id: string };
}

export default async function WordPlayPage({ params }: WordPlayPageProps) {
  // 가드 1: UUID 형식 사전 차단 — DB 호출 방지 + 보안
  if (!UUID_RE.test(params.id)) {
    notFound();
  }

  // 가드 2: 미인증 안전망 — 미들웨어가 1차, 본 페이지가 2차 (celebrate와 동일 패턴)
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  const book = await getBookByIdIncludingInactive(supabase, params.id);

  // 가드 3: books 행 NULL → notFound
  if (!book) {
    notFound();
  }

  // 가드 4: 단어 놀이 데이터 없음 → notFound (D2 조용한 미표시)
  const wordPlay = await getWordPlay(supabase, book.id);
  if (!wordPlay) {
    notFound();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-2 px-6 py-12">
      {/* 나가기는 celebrate 허브로 돌려보낸다 — 거기서 다음 놀이를 고를 수 있다(Amd#2 D-B1).
          확인 대화상자는 두지 않는다(D-B2 이탈 시 즉시 복귀). */}
      <WordPlay cards={wordPlay.cards} exitHref={`/book/${book.id}/celebrate`} />
    </main>
  );
}
