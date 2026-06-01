import type { AdminRole } from './gate';

/**
 * /admin 화면 텍스트 단일 출처 (Single Source of Truth).
 *
 * phase-13b CP2-a 신규 (gate.ts와 같은 sub-step, 단일 커밋 예정).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0019 D23: AdminCopy = lib/admin/copy.ts 단일 파일. nav·pageTitles·books·
 *     users·stats·errors·confirms 7 섹션. 기능별 분리 미적용(베타 규모에서는 단일이
 *     단일 출처 패턴 + 한국어 카피 한눈 검토 + i18n 진입점 단일화). 200줄 이상으로
 *     늘면 분리 재검토.
 *   - ADR-0019 D19: is_active OFF confirm 모달 미도입(즉시 토글, 가역 액션). confirms는
 *     Record<string, never>로 박제 → 타입 시스템이 confirm 키 추가를 컴파일 단계에서
 *     차단한다(향후 confirm 도입은 인터페이스 수정 + 박제 확장이 선결).
 *   - ADR-0019 D20: tabs URL 동기화 미적용(클라이언트 useState만, 베타 단순성).
 *     users.tabs는 라벨만 박제하고 URL searchParams 매핑 키 0건. 향후 딥링크 도입 시
 *     1줄 변경.
 *   - ADR-0019 D21: 자녀 목록 parent_email 노출 + 마스킹 0건(운영 진단 편의 + admin
 *     가드 트리플 가드 통과자만 + audit log는 F34). childrenColumns.parentEmail 라벨
 *     명시. 베타 출시 전 개인정보 처리방침이 정정되면 본 키도 정정.
 *
 * 단일 출처 패턴 (ADR-0012 결정 2 정합):
 *   - 상수 ADMIN_COPY는 미export — 컴포넌트가 카피를 직접 import하는 우회로를
 *     컴파일 단계에서 차단한다.
 *   - 페이지(app/admin/layout.tsx·app/admin/page.tsx 등)가 getAdminCopy()를 호출해
 *     그 결과를 하위 컴포넌트(AdminNav·AdminBooksBrowser·AdminUsersBrowser·
 *     StatsDashboard 등)에 props로 주입한다.
 *
 * server-only 강제 미적용:
 *   - 박제(D23·intent §6)에 server-only 명시 0건이므로 import 'server-only'를 추가하지
 *     않는다. AdminCopy 타입과 getAdminCopy 함수는 server·client 양쪽에서 import 가능.
 *     ADMIN_COPY 상수 미export로 카피 본문은 단일 출처 통제 하에 유지된다.
 *
 * 박제 직역 정책:
 *   - 박제(spec·intent·ADR)에 명시된 한국어 표현은 그대로 인용한다 — "콘텐츠 큐레이션"
 *     (intent §2 (b)·§4.2), "사용자·자녀 조회"(intent §2 (c)·§4.3), "공개/비공개"
 *     (spec line 65 — is_active 토글), "사용자·자녀·완독 세션·활성 책"(intent §4.4 통계).
 *   - role badge는 박제 표현이 영문(intent §4.3·§5.5 "parent/admin/curator")이라 영문
 *     그대로 유지 — 한국어화는 박제 확장으로만.
 *   - 박제 0건인 라벨(예: pageTitles.subtitle·stats.cards.sublabel)은 인터페이스에서
 *     옵셔널로 두고 ADMIN_COPY에서 키를 생략한다 — "박제 없음"을 타입에 명시.
 *
 * 향후 DB 전환:
 *   - phase-2 이후 admin_copy 테이블 도입 시 getAdminCopy() 본문만 DB 조회로 교체한다.
 *     시그니처·AdminCopy 인터페이스 불변 → 호출자 수정 0건(landing/library/celebrate
 *     copy 동형 패턴).
 *
 * 의도 문서: docs/intent/admin-system.md §5.2(nav)·§5.3(home)·§5.4(books)·§5.5(users)·§5.6(stats)·§6(copy)
 * ADR: docs/adr/0019-admin-system.md D9·D13·D19·D20·D21·D23
 * 패턴 정합: lib/landing/copy.ts·lib/library/copy.ts·lib/book/celebrate-copy.ts (단일 출처 + 미export + async getter)
 */

/** /admin/users children 행에 노출되는 role badge 키. AdminRole(gate.ts) + 'parent'. */
type RoleBadgeKey = AdminRole | 'parent';

/** /admin 화면 텍스트 단일 출처 (D23 박제 — 7 섹션). */
export interface AdminCopy {
  /** 사이드/탑 네비 4링크 라벨 (intent §5.2) + 헤더 로그아웃 액션 라벨(#5). */
  nav: {
    home: string;
    books: string;
    users: string;
    stats: string;
    /** 헤더 로그아웃 버튼 라벨 (#5 — layout.tsx 하드코딩 분리). AdminNav 미참조(고정 4키만). */
    logout: string;
  };
  /**
   * 각 페이지 h1·subtitle (intent §5.3·§4.2·§4.3).
   * stats는 home 통합(D13)이라 별도 키 없음.
   * subtitle은 박제 0건이라 옵셔널 — CP2-b·CP3-b·CP4-b 도달 시 박제 확장.
   */
  pageTitles: {
    home: { title: string; subtitle?: string };
    books: { title: string; subtitle?: string };
    users: { title: string; subtitle?: string };
  };
  /** /admin/books 콘텐츠 큐레이션 화면 카피 (intent §4.2·§5.4). */
  books: {
    filters: {
      isActiveLabel: string;
      isActiveAnyLabel: string;
      isActiveTrueLabel: string;
      isActiveFalseLabel: string;
      levelLabel: string;
      levelAnyLabel: string;
      levelNullLabel: string;
    };
    search: {
      placeholder: string;
      label: string;
    };
    columns: {
      title: string;
      source: string;
      license: string;
      isActive: string;
      level: string;
    };
    /** is_active 토글 on/off 라벨 (D19 즉시 토글, confirm 0건). */
    toggle: {
      on: string;
      off: string;
    };
    empty: {
      title: string;
      body: string;
    };
  };
  /** /admin/users 사용자·자녀 조회 화면 카피 (intent §4.3·§5.5). */
  users: {
    /** D20 박제 — tabs 라벨만, URL searchParams 매핑 키 0건(클라이언트 useState만). */
    tabs: {
      profiles: string;
      children: string;
    };
    profilesSearch: {
      placeholder: string;
      label: string;
    };
    childrenSearch: {
      placeholder: string;
      label: string;
    };
    profilesColumns: {
      id: string;
      email: string;
      role: string;
      displayName: string;
      createdAt: string;
    };
    /** D21 박제 — parentEmail 라벨 포함, 마스킹 0건. */
    childrenColumns: {
      id: string;
      name: string;
      age: string;
      level: string;
      points: string;
      parentEmail: string;
      createdAt: string;
    };
    /** role badge 라벨 — 박제 표현이 영문(intent §4.3·§5.5 "parent/admin/curator")이라 영문 유지. */
    roleBadges: Record<RoleBadgeKey, string>;
    empty: {
      title: string;
      body: string;
    };
  };
  /**
   * /admin 홈 통합 통계 4 카드 (D9·D13·intent §4.4·§5.6).
   * sublabel은 박제 0건이라 옵셔널 — CP5-b 도달 시 박제 확장.
   */
  stats: {
    cards: {
      profilesCount: { label: string; sublabel?: string };
      childrenCount: { label: string; sublabel?: string };
      completedSessionsCount: { label: string; sublabel?: string };
      activeBooksCount: { label: string; sublabel?: string };
    };
  };
  /**
   * server action 실패 메시지 (intent §6·D23 키 박제, 구체 메시지 박제 0건).
   * Record<string, never>로 박제 → CP3-a 도달 시 메시지 박제와 함께 인터페이스 확장 필요.
   */
  errors: Record<string, never>;
  /**
   * D19 박제 — is_active OFF confirm 모달 미도입(즉시 토글).
   * Record<string, never>로 박제 → confirm 키 추가가 타입 시스템에서 차단된다.
   */
  confirms: Record<string, never>;
}

/**
 * /admin 카피 정본. export하지 않는다(LANDING_COPY·LIBRARY_COPY·CELEBRATE_COPY 동형 —
 * 컴포넌트 직접 import 차단, ADR-0012 결정 2 패턴).
 */
const ADMIN_COPY: AdminCopy = {
  nav: {
    home: '홈',
    books: '책',
    users: '사용자',
    stats: '통계',
    logout: '로그아웃',
  },
  pageTitles: {
    home: { title: '관리 홈' },
    books: { title: '콘텐츠 큐레이션' },
    users: { title: '사용자·자녀 조회' },
  },
  books: {
    filters: {
      isActiveLabel: '공개 여부',
      isActiveAnyLabel: '전체',
      isActiveTrueLabel: '공개',
      isActiveFalseLabel: '비공개',
      levelLabel: '레벨',
      levelAnyLabel: '전체',
      levelNullLabel: '미분류',
    },
    search: {
      placeholder: '책 제목으로 검색…',
      label: '책 제목 검색',
    },
    columns: {
      title: '제목',
      source: '출처',
      license: '라이선스',
      isActive: '공개',
      level: '레벨',
    },
    toggle: {
      on: '공개',
      off: '비공개',
    },
    empty: {
      title: '결과가 없어요',
      body: '필터를 줄이거나 다른 키워드로 다시 검색해보세요.',
    },
  },
  users: {
    tabs: {
      profiles: '사용자',
      children: '자녀',
    },
    profilesSearch: {
      placeholder: '이메일·이름으로 검색…',
      label: '사용자 검색',
    },
    childrenSearch: {
      placeholder: '자녀 이름·부모 이메일로 검색…',
      label: '자녀 검색',
    },
    profilesColumns: {
      id: 'ID',
      email: '이메일',
      role: '역할',
      displayName: '이름',
      createdAt: '가입일',
    },
    childrenColumns: {
      id: 'ID',
      name: '이름',
      age: '나이',
      level: '레벨',
      points: '포인트',
      parentEmail: '부모 이메일',
      createdAt: '등록일',
    },
    roleBadges: {
      parent: 'Parent',
      admin: 'Admin',
      curator: 'Curator',
    },
    empty: {
      title: '결과가 없어요',
      body: '검색 키워드를 줄이거나 다른 탭을 확인해보세요.',
    },
  },
  stats: {
    cards: {
      profilesCount: { label: '사용자 수' },
      childrenCount: { label: '자녀 수' },
      completedSessionsCount: { label: '완독 세션 수' },
      activeBooksCount: { label: '활성 책 수' },
    },
  },
  errors: {},
  confirms: {},
};

/**
 * /admin 카피를 반환한다.
 *
 * 현재 — 정적 상수를 그대로 반환한다(getLandingCopy·getLibraryCopy·getCelebrateCopy 동형).
 * phase-2 이후 — 본문을 admin_copy 테이블 조회로 교체한다(시그니처·반환 타입 불변).
 */
export async function getAdminCopy(): Promise<AdminCopy> {
  return ADMIN_COPY;
}
