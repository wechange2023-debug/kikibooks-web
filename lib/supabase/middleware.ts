import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

/**
 * 미들웨어용 Supabase 세션 갱신 헬퍼.
 *
 * 매 요청에서 호출되어 ① 만료가 가까운 세션 토큰을 갱신하고,
 * ② 갱신된 세션 쿠키가 담긴 응답과 현재 사용자를 돌려준다.
 * 보호 라우트 판정(리다이렉트)은 middleware.ts가 담당한다.
 *
 * - publishable 키만 사용한다 (claude.md Hard Rule 6 — secret 키 미사용).
 * - 쿠키는 @supabase/ssr 권장 getAll/setAll 인터페이스로 다룬다.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase 미들웨어 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 .env.local에 설정하세요.',
    );
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 1) 요청 쿠키를 갱신해 이후 supabase 호출이 새 세션을 보게 한다.
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        // 2) 응답을 새로 만들고 갱신된 쿠키를 브라우저로 내려보낸다.
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser()는 Supabase Auth 서버에 세션을 검증·갱신한다.
  // (getSession()은 쿠키만 신뢰하므로 미들웨어에서는 getUser()를 쓴다.)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
