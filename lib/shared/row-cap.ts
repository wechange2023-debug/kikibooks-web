import 'server-only';

/**
 * PostgREST 행 상한(Max rows = 1,000) 대응 공용 조회 헬퍼 — ADR-0059 **D1**.
 *
 * ## 왜 필요한가
 *
 * PostgREST는 상한을 넘는 요청에 오류를 반환하지 않고 **행을 조용히 잘라서** 200으로
 * 응답한다. 잘린 배열이 그대로 카운트 로직에 들어가면 화면은 축소된 수치를 정확한 값인
 * 것처럼 표시한다. 마이페이지 "읽는 중"이 실제 2,352권인데 930권으로 표시돼 온 것이
 * 그 증상이다(ADR-0059 §1, 2026-08-15 팀장 실측).
 *
 * ## 2중 가드
 *
 *   (1) **`.range()` 청크 페이징** — 1회 {@link ROW_CAP_CHUNK}행씩 반복 수집하고, 반환
 *       행수가 청크 크기 미만이면 종료한다. 안전 상한 {@link ROW_CAP_MAX_CHUNKS}회
 *       (= {@link ROW_CAP_MAX_ROWS}행)에 도달하면 수집을 멈추고 (2)의 불일치로 처리한다.
 *   (2) **길이 일치 감지(fail-loud)** — 같은 조건으로 `{ count: 'exact', head: true }`
 *       카운트를 **1회** 조회하고, 수집 배열 길이와 다르면 `consistent: false`를 반환하며
 *       기대값·실제값을 `console.error`로 동시 출력한다.
 *
 * 임계를 **요청 쪽이 소유**한다(ADR-0059 D1 판정 원칙 (b)) — 서버 대시보드의 Max rows를
 * 코드에 박제하지 않는다. 청크 크기·종료 조건·안전 상한 전부 이 파일이 소유하므로
 * 대시보드 값이 바뀌어도 조용히 틀리지 않는다.
 *
 * ## 호출자의 책임 — 처리 강도는 호출자가 정한다
 *
 * 본 헬퍼는 **로그만 남기고 throw하지 않는다.** 불일치를 화면에 어떻게 반영할지는
 * 지점마다 다르기 때문이다(ADR-0059 D1 적용 표).
 *
 *   - `lib/mypage/summary.ts` — 표시 수치이므로 기존 `degraded` 플래그로 승격한다.
 *   - `lib/home/recommendations.ts` · `lib/home/categories.ts` — 표시 수치가 아니라
 *     차집합용 Set이다. 잘림의 영향은 "이미 읽은 책이 추천에 재등장"에 그치므로
 *     **화면 표시를 바꾸지 않는다**(에러로 막으면 원 버그보다 피해가 크다).
 *   - `lib/home/streak.ts` — **비적용**. 자녀 1명 × 당주 월요일 이후 완독분으로 상한이
 *     구조적으로 제한된다. 불필요한 가드는 넣지 않는다.
 *
 * **쿼리 실패(`queryError`)와 길이 불일치(`consistent: false`)는 별개**다. 기존 호출부가
 * 쿼리 실패에 throw하고 있었다면 그 동작을 그대로 유지하도록 두 신호를 분리해 반환한다.
 *
 * ## 정렬 계약 (호출자 필수)
 *
 * offset 페이지네이션이므로 `selectChunk`는 **결정적(deterministic) 정렬**을 지정해야
 * 한다. 동률이 남으면 청크 경계에서 중복·누락이 생긴다. 기존 정렬 키가 NULL을 허용하거나
 * 동률이 가능하면 **PK(`id`) 오름차순을 보조 키로 반드시 덧붙인다**.
 *
 * ## 수명
 *
 * D1은 정확도를 고치는 장치가 아니라 **잘린 수치를 정확한 척 보여주는 상태를 끝내는**
 * 임시 안전장치다. 마이페이지 경로는 D2-b(RPC) 배포와 함께 청크가 걷힌다(ADR-0059 D3).
 *
 * 기존 인라인 청크 2건(`app/showcase/[source]/page.tsx:56-79`,
 * `lib/admin/review/query.ts:181-193`)은 본 헬퍼로 통합하지 않는다 — ADR-0059 D1 범위 밖.
 *
 * 의도 문서: docs/adr/0059-reading-sessions-row-cap.md D1
 */

/** 1회 왕복으로 받는 행수. Supabase Max rows 실측값(1,000)과 동일하게 잡는다. */
export const ROW_CAP_CHUNK = 1000;

/** 안전 상한 왕복 수. 도달 시 수집을 멈추고 불일치로 처리한다(무한 루프 차단). */
export const ROW_CAP_MAX_CHUNKS = 20;

/** 안전 상한 행수 = 1,000 × 20. */
export const ROW_CAP_MAX_ROWS = ROW_CAP_CHUNK * ROW_CAP_MAX_CHUNKS;

/** PostgREST 청크 응답 중 본 헬퍼가 보는 최소 형태. */
interface ChunkResponse<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/** PostgREST count 헤더 응답 중 본 헬퍼가 보는 최소 형태(`head: true`라 data는 null). */
interface CountResponse {
  count: number | null;
  error: { message: string } | null;
}

/** {@link fetchAllWithinRowCap} 반환값. */
export interface RowCapResult<T> {
  /** 수집된 전체 행. 쿼리 실패 시에는 빈 배열(기존 폴백 동작 보존). */
  rows: T[];
  /** `count: 'exact'`가 알려준 기대 행수. 카운트 조회 실패 시 0. */
  expected: number;
  /** 실제 수집된 행수(= `rows.length`). */
  actual: number;
  /**
   * 기대값과 실제값이 일치하고 안전 상한에도 걸리지 않았으면 true.
   * false면 수치를 정확한 값으로 취급해서는 안 된다.
   */
  consistent: boolean;
  /** 안전 상한({@link ROW_CAP_MAX_ROWS}행)에 걸려 수집을 중단했으면 true. */
  capped: boolean;
  /** 쿼리 자체가 실패했으면 그 메시지, 아니면 null. 길이 불일치와 별개 신호다. */
  queryError: string | null;
}

/** {@link fetchAllWithinRowCap} 인자. */
export interface RowCapParams<T> {
  /** 로그·에러 메시지 접두사. 예: `'getMypageSummary: reading_sessions'`. */
  label: string;
  /**
   * 같은 필터 조건의 `count: 'exact', head: true` 쿼리. **1회만** 호출된다.
   * `selectChunk`와 필터가 어긋나면 정합 판정 자체가 무의미해지므로 반드시 동일하게 쓴다.
   */
  selectCount: () => PromiseLike<CountResponse>;
  /**
   * `[from, to]` 구간을 `.range(from, to)`로 받는 쿼리.
   * **결정적 정렬 필수** — 동률이 가능하면 `.order('id', { ascending: true })`를 덧붙인다.
   */
  selectChunk: (from: number, to: number) => PromiseLike<ChunkResponse<T>>;
}

/**
 * 행 상한에 걸리지 않게 전량을 청크로 수집하고, 기대 행수와 일치하는지 검증한다.
 *
 * throw하지 않는다 — 판정 결과만 돌려주고 처리 강도는 호출자가 정한다(위 §호출자의 책임).
 */
export async function fetchAllWithinRowCap<T>(
  params: RowCapParams<T>,
): Promise<RowCapResult<T>> {
  const { label, selectCount, selectChunk } = params;

  // (2) 길이 일치 감지의 기준값 — 같은 조건의 count 헤더를 1회만 조회한다.
  const countResponse = await selectCount();
  if (countResponse.error) {
    const message = `${label}: 행 수 카운트 조회 실패 — ${countResponse.error.message}`;
    console.error(message);
    return { rows: [], expected: 0, actual: 0, consistent: false, capped: false, queryError: message };
  }
  const expected = countResponse.count ?? 0;

  // (1) .range 청크 페이징 — 반환 행수가 청크 미만이면 전량 수집 완료.
  const rows: T[] = [];
  let capped = true;
  for (let chunk = 0; chunk < ROW_CAP_MAX_CHUNKS; chunk += 1) {
    const from = chunk * ROW_CAP_CHUNK;
    const chunkResponse = await selectChunk(from, from + ROW_CAP_CHUNK - 1);

    if (chunkResponse.error) {
      const message = `${label}: 청크 조회 실패(offset ${from}) — ${chunkResponse.error.message}`;
      console.error(message);
      return { rows: [], expected, actual: 0, consistent: false, capped: false, queryError: message };
    }

    const page = chunkResponse.data ?? [];
    rows.push(...page);

    if (page.length < ROW_CAP_CHUNK) {
      capped = false;
      break;
    }
  }

  const actual = rows.length;
  const consistent = !capped && actual === expected;

  // fail-loud — 조용히 잘린 수치가 흘러나가지 않도록 기대값·실제값을 함께 남긴다.
  if (!consistent) {
    console.error(
      `${label}: 행 수 정합 실패 — 기대 ${expected}행 / 실제 ${actual}행` +
        (capped
          ? ` · 안전 상한 ${ROW_CAP_MAX_ROWS}행(${ROW_CAP_MAX_CHUNKS}왕복) 도달로 수집 중단`
          : ''),
    );
  }

  return { rows, expected, actual, consistent, capped, queryError: null };
}
