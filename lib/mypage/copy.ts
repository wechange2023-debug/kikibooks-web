import 'server-only';

/**
 * 마이페이지(`/mypage`) + 비활성 도서 표면 카피 단일 출처 (Single Source of Truth).
 *
 * ADR-0012 결정 2 패턴 계승 — `lib/home/copy.ts`와 같은 형태다.
 * 컴포넌트는 카피를 직접 import하지 않는다. 페이지가 getMypageCopy()를 호출해
 * 그 결과를 하위 컴포넌트에 props로 내려준다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 왜 신설했는가 (ADR-0063이 뒤집은 결정)
 * ──────────────────────────────────────────────────────────────────────────────
 *   `app/(reader)/mypage/page.tsx`는 원래 화면 전용 문구를 **파일에 하드코딩**했다
 *   ("copy.ts 박제 확장 회피", app-header.tsx 라벨 정책과 동일). ADR-0063이 그 결정을
 *   뒤집는다 — 문구가 3종 이상 늘었고, 그중 "쉬는 중" 어휘는 **마이페이지 배지와
 *   책 상세 안내 화면(`/book/[id]`)이 표현을 맞춰야** 하기 때문이다. 두 라우트가
 *   같은 말을 쓰려면 단일 출처가 필요하다.
 *
 *   그래서 inactiveBook 그룹은 **마이페이지 전용이 아니다**. 아래 두 표면이 공유한다:
 *     - `app/(reader)/mypage/page.tsx`         — 카드 "쉬는 중" 배지 (ADR-0063 D1)
 *     - `components/book/inactive-book-notice.tsx` — 상세 안내 화면 (ADR-0063 D2)
 *   책 라우트가 mypage 카피를 읽는 것이 어색해 보일 수 있으나, 어휘를 두 벌로 나누면
 *   아이가 같은 상태를 다른 말로 두 번 배우게 된다. 단일 출처가 우선이다.
 *
 * ★ MYPAGE_COPY 상수는 의도적으로 export하지 않는다 — 컴포넌트가 상수를 직접
 *   import하는 우회로를 컴파일 단계에서 차단한다(ADR-0012 결정 2 패턴).
 * ★ `import 'server-only'` — 이 모듈의 값은 서버에서만 읽힌다.
 *
 * ADR: docs/adr/0063-inactive-book-user-surface.md (D1·D2 · O-D5-2 · O-D5-3)
 */

/** 마이페이지 + 비활성 도서 표면 전체 카피. */
export interface MypageCopy {
  /**
   * 요약 수치 정합 불가 안내 (ADR-0059 D1 — 표시 제거 금지, 표현만 다듬는다).
   *
   * ADR-0063 O-D5-2 **안 A 채택**. 트리거 5종(lib/mypage/summary.ts:173-185·:210-212)
   * 중 "수가 실제보다 적게 나오는" 경우는 :183-185 하나뿐이라, 수치를 직접 지목하는
   * 안 B는 나머지 4종에서 사실과 달라진다. 본 문구는 5종 모두에 대해 참이다.
   */
  degradedNotice: string;
  /** 비활성 도서(books.is_active = false) 공통 어휘 — 마이페이지·책 상세 공유. */
  inactiveBook: {
    /** 카드 좌상단 소형 칩 라벨 (ADR-0063 O-D5-3 형태 '가'). */
    badgeLabel: string;
    /** 칩의 스크린리더 라벨 — 시각 배지만으로는 상태가 전달되지 않는다. */
    badgeAriaLabel: string;
    /** 안내 화면 제목 (ADR-0063 D2 — 3~7세 눈높이 첫 줄). */
    noticeTitle: string;
    /** 안내 화면 본문 — 사라진 것이 아님을 알린다(O-8 상실감 완화). */
    noticeBody: string;
    /** 안내 화면의 라이브러리 복귀 링크 라벨. 다시 읽기 CTA는 두지 않는다. */
    noticeLibraryLinkLabel: string;
  };
}

/**
 * 마이페이지 카피 정본. export하지 않는다(위 주석 참조 — 컴포넌트 직접 import 차단).
 */
const MYPAGE_COPY: MypageCopy = {
  degradedNotice: '지금은 기록을 다 보여주지 못했어요. 잠시 뒤에 다시 열어 주세요.',
  inactiveBook: {
    badgeLabel: '쉬는 중',
    badgeAriaLabel: '지금은 쉬는 중인 책이에요',
    noticeTitle: '이 책은 지금 쉬는 중이에요',
    noticeBody:
      '읽은 기록은 그대로 있어요. 지금은 이 책을 열 수 없지만, 다른 재미있는 책이 많이 기다리고 있어요.',
    noticeLibraryLinkLabel: '다른 책 보러 가기',
  },
};

/**
 * 마이페이지·비활성 도서 표면 카피를 반환한다.
 *
 * 지금은 정적 상수를 그대로 반환한다. 향후 Admin이 카피를 DB로 관리하게 되면
 * 본문만 DB 조회로 교체한다(시그니처·반환 타입 불변 — getHomeCopy와 동일 계약).
 */
export async function getMypageCopy(): Promise<MypageCopy> {
  return MYPAGE_COPY;
}
