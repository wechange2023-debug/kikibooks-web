/** node-hooks.mjs를 ESM 로더로 등록한다. `node --import ./scripts/wordplay/register-hooks.mjs` */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./node-hooks.mjs', pathToFileURL(import.meta.filename));
