import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SIGN_IN_PATH } from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/server';

import { SOURCE_LABELS, sourceLabel } from './sources';

/**
 * /showcase — 임시 시연 메뉴: 출처(source_platform)별 공개 도서 진입 화면.
 *
 * 임시·격리. 전역 네비 미노출(시연자는 URL로 직접 진입). 시연 후 app/showcase 삭제로 제거.
 *
 * 가드: 로그인만(getUser → SIGN_IN_PATH). /showcase는 PROTECTED_PREFIXES에 미등록이라
 *   미들웨어가 가드하지 않으므로 본 페이지가 직접 가드한다. 자녀(온보딩) 가드는 시연
 *   동선을 막을 수 있어 의도적으로 적용하지 않는다(작업지시서 §2 '로그인 가드').
 *
 * 쿼리: 출처별 is_active=true 권수(head count). 0건 출처는 카드 숨김. SELECT only.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '출처별 도서 (시연) · 키키북스',
  robots: { index: false, follow: false },
};

export default async function ShowcasePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  // 출처별 공개 권수(head count) — 전 enum을 세고 0건은 숨김, 권수 내림차순 정렬.
  const counts = await Promise.all(
    Object.keys(SOURCE_LABELS).map(async (source) => {
      const { count } = await supabase
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('source_platform', source);
      return { source, count: count ?? 0 };
    }),
  );
  const visible = counts
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-5 px-4 md:max-w-screen-md md:px-6 lg:max-w-screen-lg">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold text-text md:text-3xl">
            출처별 도서
          </h1>
          <p className="text-sm text-text-variant">
            콘텐츠 출처를 선택하면 해당 출처의 공개 도서를 볼 수 있어요.
          </p>
        </header>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ source, count }) => (
            <li key={source}>
              <Link
                href={`/showcase/${source}`}
                className="group flex flex-col gap-1 rounded-md bg-surface p-5 shadow-elev-1 outline-none transition-transform duration-200 ease-kiki hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
              >
                <span className="font-display text-lg font-semibold text-text">
                  {sourceLabel(source)}
                </span>
                <span className="text-sm text-text-variant">{count}권</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
