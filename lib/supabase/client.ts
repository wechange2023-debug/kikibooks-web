'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * 브라우저 컴포넌트용 Supabase 클라이언트.
 * publishable 키만 사용. RLS가 사용자 권한을 강제한다.
 *
 * secret 키(sb_secret_xxx)는 절대 이 파일에 등장해선 안 된다 (claude.md 2절 Hard Rule 6).
 *
 * Legacy fallback: 새 시스템(sb_publishable_xxx) 미설정 시 옛 anon 키도 인식한다.
 * 자세한 배경은 docs/adr/0003-supabase-new-api-keys.md.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 설정되지 않았습니다. .env.local을 확인하세요.'
    );
  }

  return createBrowserClient(url, publishableKey);
}
