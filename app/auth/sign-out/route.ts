import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * 로그아웃 — 세션을 종료하고 세션 쿠키를 지운 뒤 랜딩(/)으로 보낸다.
 * (docs/intent/auth-flow.md 4.6절)
 *
 * 임시 /home의 로그아웃 버튼이 form POST로 호출한다.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = createClient();
  await supabase.auth.signOut();

  const landingUrl = request.nextUrl.clone();
  landingUrl.pathname = '/';
  landingUrl.search = '';

  // POST → GET 내비게이션이므로 303 See Other.
  return NextResponse.redirect(landingUrl, { status: 303 });
}
