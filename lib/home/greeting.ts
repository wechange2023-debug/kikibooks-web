import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { HomeCopy } from '@/lib/home/copy';

/**
 * 홈 인사 카드 데이터 생성.
 *
 * 두 책임을 분리한다:
 *   1) getGreetingProfile()  — profiles.display_name fetch (Supabase 의존)
 *   2) buildGreeting()       — 순수 함수, 카피 템플릿 치환 + NULL 폴백 적용
 *
 * 분리 이유: buildGreeting()을 순수 함수로 두면 단위 호출 검증이 가능하고,
 * fetch와 표시 로직이 결합되지 않는다(cp2_decisions d7 — CP2 dry-run = 시그니처·타입 안전성).
 *
 * NULL 폴백 (cp1_decisions d1):
 *   - display_name 있음 → copy.withName 템플릿 ("안녕하세요, {name}님 👋")
 *   - display_name NULL → copy.nameOnly 템플릿 ("{name} 부모님 👋"), name = 자녀 이름
 *
 * 의도 문서: docs/intent/screen-02-home.md §5.1
 */

/** profiles 조회 행 (display_name만 필요). */
interface ProfileRow {
  display_name: string | null;
}

/** 인사 카드에 전달할 최종 문자열 한 묶음. */
export interface GreetingData {
  primary: string;
  subtitle: string;
}

/**
 * profiles.display_name을 조회한다. RLS "users can view own profile"(auth.uid()=id)
 * 통과. ensure-profile.ts가 로그인 시점에 profile 행을 보장하지만, 안전망으로 0행
 * 케이스도 처리한다(0행이면 display_name=null로 취급).
 */
export async function getGreetingProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ display_name: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw new Error(`getGreetingProfile: profiles 조회 실패 — ${error.message}`);
  }

  return { display_name: data?.display_name ?? null };
}

/**
 * 인사 카피 템플릿을 자녀·부모 정보로 치환하여 표시 문자열을 만든다.
 *
 * 순수 함수 — fetch 없음, 인자만으로 결과 결정. 테스트 가능.
 *
 * @param profile profiles.display_name (NULL 허용 — 폴백 트리거)
 * @param child   첫 번째 자녀 (cp2_decisions d6 — name만 사용)
 * @param copy    HomeCopy.greeting (`{name}` 자리표시자를 가진 템플릿 + subtitle)
 */
export function buildGreeting(
  profile: { display_name: string | null },
  child: { name: string },
  copy: HomeCopy['greeting'],
): GreetingData {
  const hasDisplayName =
    typeof profile.display_name === 'string' && profile.display_name.trim().length > 0;

  const template = hasDisplayName ? copy.withName : copy.nameOnly;
  const name = hasDisplayName ? (profile.display_name as string) : child.name;

  return {
    primary: template.replace('{name}', name),
    subtitle: copy.subtitle,
  };
}
