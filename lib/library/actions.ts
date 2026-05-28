'use server';

import { createClient } from '@/lib/supabase/server';
import {
  getBooks,
  LibraryFiltersSchema,
  type LibraryPage,
} from '@/lib/library/query';

/**
 * 라이브러리(/library) 페이지 fetch server action — LibraryBrowser('use client')가 호출한다.
 *
 * phase-13 CP3-b-1 신규 (ADR-0018 D7·D12 + spec d7·d8 + 외부 Claude 검토 통과 2026-05-28).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 호출 경로 확정 근거 — server action 채택 (route handler 기각)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - 실측 1: app/api/**\/route.ts = 0 파일 (route handler 미사용)
 *   - 실측 2: 'use server' 디렉티브 5건(reading-session·rewards·home/actions·onboarding/actions·
 *            login/actions) = 100% server action 패턴
 *   - 실측 3: lib/home/actions.ts updateChildLevel이 가장 가까운 선례 (LevelSelector 클라이언트
 *            컴포넌트 ↔ server action 호출, discriminated union 반환)
 *   - 기존 5건은 모두 mutation(UPDATE/INSERT). 본 함수는 키키북스 최초의 **client-triggered
 *     SELECT용 server action**이며 패턴 본질(zod·createClient 본인 세션·{ok}/{error})은 계승.
 *   - 타입 안전: LibraryFilters → LibraryPage end-to-end TypeScript. route handler는 JSON
 *     수동 직렬화/역직렬화 필요 → 패턴 복잡도만 증가.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 더블 가드 (Q1 α 외부 Claude 채택, 입력 신뢰 0 원칙)
 * ──────────────────────────────────────────────────────────────────────────────
 *   ① zod 입력 검증 — LibraryFiltersSchema.safeParse (query.ts 단일 출처 스키마 재사용)
 *   ② auth 세션 가드 — auth.getUser() 미인증 차단 (page가 1차 가드, server action이 2차
 *      안전망 — server action 표면은 직접 호출 가능)
 *   ③ getBooks try-catch — DB 호출 실패만 catch해 사용자 메시지로 변환
 *
 * 가드 순서가 중요하다:
 *   1) zod 먼저 — 인증된 사용자라도 잘못된 입력은 차단(공격 표면 축소)
 *   2) auth 다음 — 입력은 정상인데 세션 만료된 경우를 분리 메시지로 처리
 *   3) try-catch 마지막 — 위 두 가드 통과 후 실제 DB·네트워크 실패만 흡수
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * RLS·보안 (Hard Rule 1·3·6·8·9·10 무위반)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - createClient() 본인 세션만 — books §9.1 USING(true) 공개 SELECT 정합
 *   - createServiceRoleClient 절대 미사용 — 옵션 B는 보상 쓰기 전용(ADR-0018 D1).
 *     본 함수가 secret 키를 import만 해도 server-only 안전망과 별개로 노출 표면 확대 위험.
 *   - SELECT만, INSERT/UPDATE/DELETE 0건 — DB 스키마 변경 0건(Hard Rule 8)
 *   - revalidatePath 0건 — SELECT만, 캐시 무효화 불요(updateChildLevel은 UPDATE라 호출)
 *   - child_id 0건 — books §9.1로 child 무관 SELECT 가능 (Q3 β 외부 Claude 채택)
 *   - Hard Rule 1(attribution)·9(iframe)·10(raw HEX) 무관 경로
 *
 * 의도 문서: docs/intent/screen-05-celebrate.md §5.3·§5.4
 * ADR: docs/adr/0018-completion-rewards-and-library.md D7·D12·D13
 */

/**
 * 결과 — 성공 시 LibraryPage, 실패 시 사용자에게 표시할 에러 메시지 1줄.
 *
 * 호출자(LibraryBrowser 클라이언트 컴포넌트, CP3-b-2 작성 예정)는 ok=false 시 사용자에게
 * 메시지를 보여주고 무한 스크롤 sentinel을 일시 정지한다. 재시도는 사용자 트리거
 * (스크롤 재진입·필터 변경)로 처리 — 자동 재시도는 베타 단순성 우선 미적용.
 *
 * lib/home/actions.ts UpdateChildLevelResult 패턴 정합(키키북스 server action 반환 표준).
 */
export type FetchLibraryPageResult =
  | { ok: true; page: LibraryPage }
  | { ok: false; error: string };

/**
 * /library 책 목록 1페이지를 가져온다 — LibraryBrowser가 필터 변경·무한 스크롤마다 호출.
 *
 * @param filtersInput 외부 입력(unknown) — zod safeParse로 LibraryFilters 검증
 * @param cursor 다음 페이지 opaque cursor (null이면 첫 페이지)
 *
 * filtersInput 타입이 unknown인 이유 — server action 호출 표면은 외부 신뢰 0이므로
 * LibraryFilters 타입으로 받지 않고 zod로 강제 검증한다 (lib/home/actions.ts는 typed input을
 * 받지만 본 함수는 클라이언트의 상태 객체를 직접 전달받아 검증 표면이 더 넓다).
 *
 * 사용자 표시 에러는 1줄 압축(updateChildLevel 정합). 상세 디버그는 후속 logging 인프라가
 * 책임진다 — 현재는 console.error 없음(베타 단순성, F-item).
 */
export async function fetchLibraryPage(
  filtersInput: unknown,
  cursor: string | null,
): Promise<FetchLibraryPageResult> {
  // ① zod — 입력 검증
  const parsed = LibraryFiltersSchema.safeParse(filtersInput);
  if (!parsed.success) {
    return { ok: false, error: '필터 입력이 올바르지 않습니다.' };
  }

  // ② auth — 세션 가드 (page가 1차, 본 함수가 2차 안전망)
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.',
    };
  }

  // ③ SELECT — books §9.1 USING(true), child_id 불요(Q3 β)
  try {
    const page = await getBooks(supabase, parsed.data, cursor);
    return { ok: true, page };
  } catch {
    // 사용자 표시는 1줄 압축 (updateChildLevel 정합).
    // 상세 디버그 logging은 후속 인프라 — 현재 단계는 사용자 메시지만.
    return {
      ok: false,
      error: '책을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}
