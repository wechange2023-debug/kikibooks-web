/**
 * ASb(.txt) 파서 — African Storybook raw-db 평면 텍스트를 페이지 구조로 변환.
 *
 * ADR-0025 Amendment #6(페이지 구성·텍스트/이미지 짝짓기 규칙) 구현.
 *   - A1 표지면: coverUrl(DB cover_url)을 AsbBook.coverUrl로 별도 보유. pages에 넣지 않는다.
 *   - A2 본문: page_text(N) / images(M)를 독립 스트림으로 받아 같은 인덱스끼리 느슨히
 *     정렬, max(N,M) 면 생성(pages[i] = {text[i] ?? null, image[i] ?? null}). 한쪽 소진 시
 *     다른쪽만 단독 면.
 *   - A3 개수 불일치(+/−/0)는 정상 흡수(빈 텍스트 면·이미지 없는 면 허용).
 *   - A4 강제 1:1·이미지 번호 정렬 매핑 금지 — images는 원문 순서·중복 그대로 유지.
 *   - 이미지 절대 URL: https://africanstorybook.org/ + 상대경로, http→https 승격.
 *
 * 원문 구조(raw-db data/<id>.txt): 탭구분 header → `page_text:`(`P<n>\t<문장>`) →
 *   `images:`(`illustrations/pages/<n>.png`) → `translations:`(이하 무시).
 *
 * 순수 함수 — 네트워크 호출·React 의존 없음(테스트 가능). fetch는 호출 측 책임.
 * 데이터 형식 근거: scripts/sync_asb.py 파서 + ADR-0025 Amd#6 recon.
 */

/** ASb 이미지 절대 URL base — 상대경로(`illustrations/...`)는 사이트 루트 기준(Amd#6). */
const ASB_IMAGE_BASE = 'https://africanstorybook.org/';

/** 본문 1면 — 텍스트·이미지 둘 중 하나는 null일 수 있다(Amd#6 A3). */
export type AsbPage = {
  /** 페이지 텍스트(`P<n>` 라인 본문). 이미지만 있는 면이면 null. */
  text: string | null;
  /** 페이지 이미지 절대 URL. 텍스트만 있는 면이면 null. */
  imageUrl: string | null;
};

/** 파싱된 ASb 책 — 표지(별도) + 본문 면 배열. */
export type AsbBook = {
  /** 표지 절대 URL(DB cover_url). 본문 pages와 분리(Amd#6 A1). */
  coverUrl: string | null;
  /** 본문 면 — max(텍스트수, 이미지수) 길이(Amd#6 A2). */
  pages: AsbPage[];
};

type Section = 'header' | 'page_text' | 'images' | 'done';

/**
 * 이미지 경로 → 절대 URL. 절대 URL이면 http→https 승격, 상대경로면 base 결합.
 */
function toAbsoluteImageUrl(path: string): string {
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  // 선행 슬래시 제거 후 사이트 루트 base 결합(상대경로는 루트 기준).
  return ASB_IMAGE_BASE + trimmed.replace(/^\/+/, '');
}

/**
 * page_text 1문장 정규화 — ASb 줄바꿈 마커 "@@"를 실제 줄바꿈("\n")으로 치환.
 * "@@" · "@ @"(사이 공백) · 주변 공백을 모두 한 줄바꿈으로 흡수하고, 과도한 빈 줄은
 * 1줄로 접은 뒤 trim. page_text 텍스트에만 적용(이미지/헤더/translations 무관).
 */
function normalizePageText(text: string): string {
  return text
    .replace(/\s*@\s*@\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * ASb raw-db .txt 원문을 페이지 구조(AsbBook)로 파싱한다.
 *
 * @param raw      raw-db data/<id>.txt 원문 전체.
 * @param coverUrl DB books.cover_url(표지). pages와 분리 보유(Amd#6 A1).
 * @returns        coverUrl + max(N,M) 본문 면 배열.
 */
export function parseAsbText(raw: string, coverUrl: string | null): AsbBook {
  const texts: string[] = [];
  const images: string[] = [];
  let section: Section = 'header';

  for (const line of raw.split(/\r?\n/)) {
    if (section === 'done') break;

    const stripped = line.trim();
    const low = stripped.toLowerCase();

    if (section === 'header') {
      if (low.startsWith('page_text:')) {
        section = 'page_text';
      } else if (low.startsWith('images:')) {
        // 방어: page_text 없이 images로 진입하는 변종.
        section = 'images';
      }
      // 그 외 header key:value 라인은 무시(본문 파싱 대상 아님).
      continue;
    }

    if (section === 'page_text') {
      if (low.startsWith('images:')) {
        section = 'images';
        continue;
      }
      // "P<n>\t<문장>" — 첫 탭 이후 전부를 텍스트로(문장 내부 탭 보존). 순서 유지.
      if (/^P\d+\t/.test(line)) {
        const tab = line.indexOf('\t');
        // "@@" 줄바꿈 마커를 \n으로 치환(normalizePageText가 trim도 수행).
        texts.push(normalizePageText(line.slice(tab + 1)));
      }
      continue;
    }

    if (section === 'images') {
      if (low.startsWith('translations:') || low.startsWith('page_text:')) {
        section = 'done';
        continue;
      }
      // 상대경로(illustrations/...) 또는 .png 라인만 수집. 순서·중복 그대로(Amd#6 A4).
      if (stripped && (stripped.includes('illustrations/') || low.endsWith('.png'))) {
        images.push(toAbsoluteImageUrl(stripped));
      }
      continue;
    }
  }

  // 짝짓기(Amd#6 A2/A3): max(N,M) 면, 같은 인덱스 느슨 정렬, 한쪽 소진 시 단독 면.
  const pageCount = Math.max(texts.length, images.length);
  const pages: AsbPage[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push({
      text: i < texts.length ? texts[i] : null,
      imageUrl: i < images.length ? images[i] : null,
    });
  }

  return { coverUrl, pages };
}
