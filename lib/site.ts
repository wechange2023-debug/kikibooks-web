import 'server-only';

/**
 * 사이트 절대 URL — robots.txt·sitemap.xml·OG 메타데이터(metadataBase)가
 * 공통으로 쓰는 base URL이다. 셋이 같은 값을 쓰도록 단일 출처로 둔다.
 *
 * 우선순위:
 *  1) NEXT_PUBLIC_SITE_URL          — 명시적 설정 (정식 도메인 연결 시).
 *  2) VERCEL_PROJECT_PRODUCTION_URL — Vercel 프로덕션 배포 도메인.
 *  3) VERCEL_URL                    — Vercel 프리뷰 배포 도메인.
 *  4) http://localhost:3000         — 로컬 개발 폴백.
 *
 * 정식 커스텀 도메인은 phase-14(베타 배포)에서 연결한다 — 그때
 * NEXT_PUBLIC_SITE_URL을 설정하면 robots·sitemap·OG의 절대 URL이 일괄 정정된다.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProduction) {
    return `https://${vercelProduction}`;
  }

  const vercelPreview = process.env.VERCEL_URL;
  if (vercelPreview) {
    return `https://${vercelPreview}`;
  }

  return 'http://localhost:3000';
}

/** 사이트 절대 base URL (말미 슬래시 없음). */
export const SITE_URL = resolveSiteUrl();
