import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 책 상세 페이지 데이터 fetch — books.id UUID 단일 조회.
 *
 * ADR-0016 결정 1·2·3 데이터 공급원:
 *   본 함수는 AttributionBox 5요소(출처·글·그림·출판사·라이선스·원본)와
 *   BookCoverHero(표지·H1 제목·메타 칩) 렌더에 필요한 모든 컬럼을 한 번에
 *   조회한다. illustrator(결정 1-가 NULL 행 생략)·author(결정 2-나 GDL 분기
 *   판별)·source_platform(결정 2-나 분기 키)·attribution_text(license-rules
 *   §4.2 표준 포맷)이 모두 SELECT에 포함된다.
 *
 * RLS 근거:
 *   - 001 §9.x books RLS 정책 "books are viewable by everyone" (USING(true))
 *   - 비로그인 방문자 publishable 세션에서도 조회 가능하나, 본 함수는
 *     보호 라우트(/book/[id])에서만 호출되므로 사실상 인증 사용자만 도달
 *   - is_active=false 책은 명시 필터로 제외 (운영자가 비활성화한 책 보호)
 *
 * 호출자 책임 (호출 측에서 처리):
 *   - null 반환 시 next/navigation.notFound() 호출 (app/book/[id]/page.tsx)
 *   - ADR-0014 Amendment #4 블랙리스트 4 UUID 차단 (book.source_platform +
 *     book.source_id 매칭 후 notFound) — 본 함수는 블랙리스트를 모른다.
 *     사유: detail.ts는 단순 조회 단일 책임. 표면별 차단 정책은 호출 측 분기.
 *
 * 사용자 흐름: docs/intent/screen-03-book-detail.md §4
 */

/** 책 상세 페이지에 필요한 books 행 — AttributionBox 5요소 + 표지·메타 컬럼 전부. */
export interface Book {
  id: string;
  title: string;
  /** Book Dash는 실제 글쓴이, GDL은 publisher 값 (ADR-0016 결정 2-나 분기 키). */
  author: string | null;
  /** 활성 책 896/896 = 100% NULL (ADR-0013 §7, ADR-0016 결정 1-가 행 생략). */
  illustrator: string | null;
  cover_url: string;
  original_url: string;
  license: string;
  /** Hard Rule 1 — NOT NULL 제약. license-rules.md §4.2 표준 포맷. */
  attribution_text: string;
  /** 'book_dash' | 'gdl' — ADR-0016 결정 2-나 분기 키 + ADR-0014 Amendment #4 차단 판별. */
  source_platform: string;
  /** ADR-0014 Amendment #4 블랙리스트 UUID 비교 키. */
  source_id: string | null;
  level: number;
  age_min: number | null;
  age_max: number | null;
  language: string;
  is_active: boolean;
}

/**
 * books.id로 책 1권을 조회한다. 없거나 is_active=false면 null.
 *
 * 호출 측은 null을 받으면 next/navigation.notFound()를 호출해야 한다 —
 * 본 함수는 throw하지 않고 null 반환만 한다(NULL과 진짜 에러의 명확한 분리).
 * 진짜 DB 에러(네트워크·권한 등)는 throw로 호출 측에 전달된다.
 *
 * @param supabase 호출자가 만든 본인 세션 Supabase 클라이언트.
 * @param id       books.id UUID. 형식 검증은 호출 측 책임(잘못된 UUID는 DB가 0행 반환).
 */
export async function getBookById(
  supabase: SupabaseClient,
  id: string,
): Promise<Book | null> {
  const { data, error } = await supabase
    .from('books')
    .select(
      'id, title, author, illustrator, cover_url, original_url, license, attribution_text, source_platform, source_id, level, age_min, age_max, language, is_active',
    )
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle<Book>();

  if (error) {
    throw new Error(`getBookById: books 조회 실패 (id=${id}) — ${error.message}`);
  }

  return data ?? null;
}
