import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * 서버 컴포넌트·Route Handler용 Supabase 클라이언트.
 * publishable 키 + 사용자 세션 쿠키 → RLS가 사용자 권한을 강제한다.
 *
 * Legacy fallback: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 미설정 시 옛 anon 키 사용.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase 서버 클라이언트 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 .env.local에 설정하세요.'
    );
  }

  const cookieStore = cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Component에서 쿠키 set 호출 시 무시 — middleware에서 갱신.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          /* same as above */
        }
      },
    },
  });
}

/**
 * RLS를 우회하는 secret 클라이언트 (sb_secret_xxx 또는 legacy service_role).
 *
 * ★ claude.md 2절 Hard Rule 6 — secret 키는 절대 클라이언트 코드/공개 환경변수에 노출 금지.
 * ★ `import 'server-only'`로 클라이언트 번들 포함 시 빌드가 실패하도록 강제.
 *
 * 사용처 (한정적):
 *   - GitHub Actions cron (콘텐츠 동기화)
 *   - 시드 스크립트
 *   - 명시적 관리자 권한이 필요한 Route Handler
 *
 * 그 외 모든 위치에서는 위 createClient() (RLS 적용)를 사용한다.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      'Secret 키 환경변수 누락: SUPABASE_SECRET_KEY가 설정되지 않았거나 서버 환경이 아닙니다. Secret 키는 절대 클라이언트에 노출되어선 안 됩니다.'
    );
  }

  return createSupabaseClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
