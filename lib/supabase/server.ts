import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * 서버 컴포넌트·Route Handler용 Supabase 클라이언트.
 * anon key + 사용자 세션 쿠키 → RLS가 사용자 권한을 강제한다.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase 서버 클라이언트 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY를 .env.local에 설정하세요.'
    );
  }

  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
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
 * RLS를 우회하는 service_role 클라이언트.
 *
 * ★ claude.md 2절 Hard Rule 6 — service_role 키는 절대 클라이언트 코드/공개 환경변수에 노출 금지.
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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'service_role 환경변수 누락: SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았거나 서버 환경이 아닙니다. service_role은 절대 클라이언트에 노출되어선 안 됩니다.'
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
