import { NextResponse, type NextRequest } from 'next/server';

import { ensureProfile } from '@/lib/auth/ensure-profile';
import { POST_LOGIN_PATH } from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/server';

/**
 * 인증 콜백 진입점 — 이메일 확인 링크와 Google 로그인이 공통으로 돌아오는 곳.
 *
 * 흐름 (docs/intent/auth-flow.md 4.1·4.3절):
 *  1. ?code= 를 세션으로 교환한다.
 *  2. 세션이 생기면 profiles 행을 보장한다 (ensureProfile — 4.4절).
 *  3. /home으로 보낸다. 실패하면 /auth/auth-error로 보낸다.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');

  const errorUrl = request.nextUrl.clone();
  errorUrl.pathname = '/auth/auth-error';
  errorUrl.search = '';

  if (!code) {
    return NextResponse.redirect(errorUrl);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(errorUrl);
  }

  // 세션이 생겼으니 profiles 행을 보장한다.
  try {
    await ensureProfile(supabase, data.user);
  } catch {
    return NextResponse.redirect(errorUrl);
  }

  const homeUrl = request.nextUrl.clone();
  homeUrl.pathname = POST_LOGIN_PATH;
  homeUrl.search = '';
  return NextResponse.redirect(homeUrl);
}
