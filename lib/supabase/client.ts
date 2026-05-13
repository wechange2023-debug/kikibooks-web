'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * 브라우저 컴포넌트용 Supabase 클라이언트.
 * anon key만 사용. RLS가 사용자 권한을 강제한다.
 *
 * service_role 키는 절대 이 파일에 등장해선 안 된다 (claude.md 2절 Hard Rule 6).
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다. .env.local을 확인하세요.'
    );
  }

  return createBrowserClient(url, anonKey);
}
