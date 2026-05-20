import { ImageResponse } from 'next/og';

/**
 * 랜딩 페이지 소셜 공유 이미지 (Open Graph / Twitter).
 *
 * ADR-0012 결정 7 — 외부 이미지 파일 없이 ImageResponse로 동적 생성한다.
 * 베타 한정 영문 브랜드 텍스트("Kikibooks" + 영문 태그라인) — 한글 글리프 폰트
 * 번들링을 피한다. phase-14 정식 출시 시 Noto Sans KR 서브셋으로 한글화한다.
 *
 * ★ Hard Rule 10 예외 — ImageResponse 렌더러는 Tailwind/CSS 변수에 접근할 수
 *   없어 디자인 토큰 클래스를 쓸 수 없다. design-system.md 6.4 "일러스트 예외"에
 *   따라 OG 이미지(그래픽 자산)는 토큰의 raw HEX 값을 직접 쓴다. 값은
 *   app/globals.css :root의 컬러 토큰과 동일하다.
 */
// next/og의 ImageResponse는 edge 런타임에서 렌더한다 — Node 런타임 변형
// (@vercel/og index.node.js)은 Windows 빌드에서 fileURLToPath "Invalid URL"로
// 프리렌더가 실패한다. edge 런타임이 ImageResponse의 표준 구성이다.
export const runtime = 'edge';

export const alt = 'Kikibooks — 우리 아이의 첫 영어 그림책 서재';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** app/globals.css 1.4 Accent 토큰과 동일 — 히어로 색상 블록과 같은 팔레트. */
const ACCENT_BLOCKS = ['#FFC53D', '#FF6FA8', '#67C7F5', '#7BC96F', '#B07BFF'];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FAF8F5',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', gap: 18, marginBottom: 44 }}>
          {ACCENT_BLOCKS.map((color) => (
            <div
              key={color}
              style={{
                width: 70,
                height: 92,
                borderRadius: 14,
                backgroundColor: color,
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 92,
            fontWeight: 700,
            color: '#FF7A45',
            letterSpacing: -2,
          }}
        >
          Kikibooks
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 34,
            color: '#6C645B',
            marginTop: 14,
          }}
        >
          Free English picture books for ages 3 to 7
        </div>
      </div>
    ),
    size,
  );
}
