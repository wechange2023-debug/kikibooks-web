// CSS·이미지 등 비-TS 모듈을 위한 ambient 선언.
// Next.js 빌드 시 .next/types에 자동 생성되는 것과 동일한 역할.
declare module '*.css';

// server-only는 type 없는 가드 패키지. import만 남으면 클라이언트 번들에서 빌드 에러 발생.
declare module 'server-only';
