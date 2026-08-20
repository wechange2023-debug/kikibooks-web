/**
 * Node ESM resolve 훅 — tsconfig의 `@/*` → 프로젝트 루트 alias를 해소한다.
 *
 * 드라이런 스크립트가 lib/wordplay/*.ts를 **실물 그대로** 불러 실행하기 위한 배선이다
 * (로직을 스크립트에 복제하면 검증 의미가 사라진다).
 *
 * 외부 라이브러리 0개 — Node 내장 module hooks만 쓴다(Hard Rule 11).
 * TypeScript 자체는 Node 24의 내장 타입 스트리핑이 처리하므로 트랜스파일러도 불필요하다.
 *
 * 사용: node --conditions=react-server --import ./scripts/wordplay/register-hooks.mjs <script>
 *   - `--conditions=react-server`는 `server-only` 패키지를 empty.js로 해소하기 위함이다
 *     (기본 조건에서는 index.js가 throw한다 — node_modules/server-only/package.json).
 */

import { pathToFileURL } from 'node:url';

const ROOT = pathToFileURL(process.cwd() + '/').href;

/** alias 대상이 확장자 없이 적히므로 후보를 순서대로 시도한다. */
const SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx', ''];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = new URL(specifier.slice(2), ROOT).href;
    let lastError;
    for (const suffix of SUFFIXES) {
      try {
        return await nextResolve(base + suffix, context);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
  return nextResolve(specifier, context);
}
