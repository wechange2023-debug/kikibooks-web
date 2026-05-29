import 'server-only';

import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

import { SIGN_IN_PATH } from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/server';

/**
 * /admin/* 라우트·server action의 단일 가드 진입점 (phase-13b CP2-a).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 책임 — ADR-0019 D2 트리플 가드의 ③단(role 검증) 단일 진입점
 * ──────────────────────────────────────────────────────────────────────────────
 *   본 함수는 admin·curator만 통과시킨다. 가드 통과 시 AdminContext({user, profile})를
 *   반환하고, 미통과 시 next/navigation redirect()로 호출자 흐름을 중단한다 — TypeScript는
 *   redirect를 never 반환으로 인식하므로 본 함수의 반환 타입은 AdminContext 단일이다
 *   (호출자에 narrowing 부담 0건).
 *
 * 호출 경로 — D16 layout 가드 1중 + server action 자체 가드:
 *   1) app/admin/layout.tsx — Server Component, /admin/* 모든 페이지 진입 시 1회
 *      (CP2-b 신규 예정). 페이지 컴포넌트는 layout 통과를 신뢰하고 재호출하지 않는다.
 *   2) lib/admin/books/actions.ts·users/actions.ts — server action 내부에서 직접 호출.
 *      server action 표면은 클라이언트가 직접 호출 가능하므로 layout 가드와 별개로
 *      자체 호출이 필수다 (CP3·CP4 sub-step 예정).
 *   3) lib/admin/books/query.ts·users/query.ts·stats/query.ts — server function의 경우
 *      호출자(page Server Component)가 layout 가드를 통과한 컨텍스트로 신뢰 (CP3·CP4·CP5).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 가드 4단 — D10 redirect 정책
 * ──────────────────────────────────────────────────────────────────────────────
 *   ① auth.getUser → 미인증 redirect(SIGN_IN_PATH)
 *      미들웨어가 1차(CP2-b에서 PROTECTED_PREFIXES에 '/admin' 추가 — D14), 본 가드가
 *      2차 안전망. server action 표면은 미들웨어를 거치지 않으므로 본 가드의 ①이 1차다.
 *   ② profiles SELECT (본인 세션 §9.2 USING(auth.uid()=id))
 *      본인의 profiles 행만 SELECT(.eq('id', user.id).maybeSingle). RLS가 보장.
 *   ③ profile 비정상(error or null) → redirect('/')
 *      RLS로 본인 행을 못 찾음 = 가입 미완·삭제됨 등 비정상 상태 → 환원.
 *   ④ role narrowing → admin·curator 아니면 redirect('/')
 *      D8 동일권한 IN list. parent·예상 외 값 차단.
 *
 * 가드 순서 의도:
 *   ① auth 먼저 — 미인증은 SIGN_IN_PATH 환원이 친절(로그인 후 재진입 유도)
 *   ②~④ 통과 후만 호출자가 admin 컨텍스트를 신뢰
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 데이터 출처 — D17 본인 세션 profiles SELECT (auth metadata 캐싱 미적용)
 * ──────────────────────────────────────────────────────────────────────────────
 *   본인 세션 createClient + RLS §9.2(본인 행 SELECT)로 본인의 role을 조회한다.
 *   auth.users.raw_user_meta_data 캐싱은 적용하지 않는다 — profiles.role이 사실 출처
 *   (사용자가 Supabase SQL Editor에서 UPDATE로 직접 갱신, D3)이며 metadata 캐싱은
 *   동기 불일치 위험. 페이지 진입마다 1회 SELECT 비용은 베타 트래픽에서 충분
 *   (F-item: unstable_cache 캐싱 최적화는 운영 데이터 누적 후).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 보안 — Hard Rule 6
 * ──────────────────────────────────────────────────────────────────────────────
 *   - `import 'server-only'` 강제 — 클라이언트 번들 포함 시 빌드 실패.
 *   - createServiceRoleClient 절대 미사용 — admin 본인의 role 조회는 본인 세션으로
 *     충분하다. service role은 D2 트리플 가드 ④단(admin mutation의 secret 쓰기)·D5
 *     (전 사용자·자녀 SELECT)에만 한정.
 *   - cookies 직접 import 0건 — createClient 내부에서만 cookies()를 호출한다.
 *
 * 의도 문서: docs/intent/admin-system.md §4.1·§4.5·§5.1
 * ADR: docs/adr/0019-admin-system.md D2·D8·D10·D16·D17
 * 패턴 정합: app/library/page.tsx auth 가드(line 66~81) + lib/home/greeting.ts profiles
 *           SELECT(line 44~48 .maybeSingle baseline) + lib/auth/routes.ts SIGN_IN_PATH
 */

/** profiles.role 좁힘 타입 — D8 admin/curator 통과 분리. */
export type AdminRole = 'admin' | 'curator';

/**
 * profiles SELECT row 타입 — role narrowing 전 원본.
 *
 * 001 line 25~26: role TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('parent','admin','curator')).
 * 본 타입은 그 CHECK 제약 3종을 그대로 박제한다.
 */
interface AdminProfileRow {
  id: string;
  role: 'parent' | 'admin' | 'curator';
}

/**
 * requireAdmin 통과 시 반환 컨텍스트.
 *
 * - user: Supabase 인증 사용자(auth.getUser 반환). 호출자(layout·server action)가
 *         user.id·user.email 등 필요 시 활용.
 * - profile.id: profiles 행 id (= user.id, RLS §9.2 본인 행). 향후 admin audit log(F34)
 *         도입 시 admin_user_id 출처.
 * - profile.role: D8 admin·curator narrowing 적용. 현재는 동일 권한이라 호출자 분기
 *         0건이지만 세분 권한(F31) 도입 시 활용 가능 구조.
 */
export interface AdminContext {
  user: User;
  profile: { id: string; role: AdminRole };
}

/**
 * 비admin redirect 경로 — D10 박제.
 *
 * 미인증은 SIGN_IN_PATH(/login)로, 비admin(parent 또는 그 외)은 '/'(랜딩)로 환원한다.
 * notFound(404) 대체안은 일반 사용자가 URL 추측 진입 시 혼란이므로 채택하지 않았다.
 * flash 메시지·toast 0건(베타 단순성, F-item).
 */
const NON_ADMIN_REDIRECT = '/';

/**
 * /admin/* 진입을 admin·curator로 좁히는 단일 가드.
 *
 * @returns 가드 통과 시 AdminContext. 미통과 시 redirect()로 호출자 흐름 중단
 *          (TypeScript는 redirect를 never로 좁히므로 본 함수 반환 타입 = AdminContext
 *           단일 = 호출자는 결과 narrowing 불요).
 *
 * @throws 환경변수 누락 시 createClient에서 throw (lib/supabase/server.ts line 20).
 *         throw는 redirect보다 상위 흐름 중단이라 호출자는 별도 try-catch 0건.
 *
 * 호출 예 (CP2-b 예정):
 *   // app/admin/layout.tsx
 *   const { user, profile } = await requireAdmin();
 *   // 통과 후 children 렌더
 */
export async function requireAdmin(): Promise<AdminContext> {
  // ① auth — 미인증 차단 (D10 SIGN_IN_PATH redirect)
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  // ② profiles SELECT — D17 본인 세션 RLS §9.2 본인 행 SELECT
  //    lib/home/greeting.ts:44~48 .maybeSingle baseline 정합
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle<AdminProfileRow>();

  // ③ profile 비정상 — RLS로 본인 행 못 찾음(가입 미완·삭제 등) → '/' 환원
  if (error || !profile) {
    redirect(NON_ADMIN_REDIRECT);
  }

  // ④ role narrowing — D8 admin·curator IN list, D10 비admin redirect('/')
  if (profile.role !== 'admin' && profile.role !== 'curator') {
    redirect(NON_ADMIN_REDIRECT);
  }

  // 통과 — 위 redirect들이 never로 좁히므로 profile.role은 AdminRole('admin'|'curator')
  return {
    user,
    profile: { id: profile.id, role: profile.role },
  };
}
