/**
 * 부분결손 1권(N=11932, Ekai's First Day In School) 현재 상태 조사. read-only.
 * 매니페스트 + 본문 이미지 전체(HEAD 아닌 GET, 바이트 수만 기록)의 생존 여부를 출력한다.
 */
const UA = 'kikibooks-cover-restore/1.0 (partial-loss probe; read-only)';
const ASB_IMAGE_BASE = 'https://africanstorybook.org/';
const MANIFEST = 'https://raw.githubusercontent.com/global-asp/asp-raw-db/master/data/11932.txt';

function extractImages(raw) {
  const images = [];
  let section = 'header';
  for (const line of raw.split(/\r?\n/)) {
    if (section === 'done') break;
    const stripped = line.trim();
    const low = stripped.toLowerCase();
    if (section === 'header') {
      if (low.startsWith('page_text:')) section = 'page_text';
      else if (low.startsWith('images:')) section = 'images';
      continue;
    }
    if (section === 'page_text') { if (low.startsWith('images:')) section = 'images'; continue; }
    if (section === 'images') {
      if (low.startsWith('translations:') || low.startsWith('page_text:')) { section = 'done'; continue; }
      if (stripped && (stripped.includes('illustrations/') || low.endsWith('.png') || low.endsWith('.jpg') || low.endsWith('.jpeg'))) {
        images.push(/^https?:\/\//i.test(stripped) ? stripped.replace(/^http:\/\//i, 'https://') : ASB_IMAGE_BASE + stripped.replace(/^\/+/, ''));
      }
    }
  }
  return images;
}

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25_000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctl.signal });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, bytes: buf.length, body: buf };
  } catch (e) {
    return { status: null, error: `${e.name}: ${e.message}` };
  } finally { clearTimeout(t); }
}

const man = await get(MANIFEST);
console.log(`manifest ${MANIFEST} → ${man.status ?? man.error} (${man.bytes ?? 0} bytes)`);
if (man.status !== 200) process.exit(0);
const imgs = extractImages(man.body.toString('utf8'));
console.log(`images in manifest: ${imgs.length}`);
for (let i = 0; i < imgs.length; i++) {
  const r = await get(imgs[i]);
  console.log(`  [${i + 1}] ${r.status ?? r.error} ${r.bytes ?? ''}B ${imgs[i]}`);
  await new Promise((s) => setTimeout(s, 200));
}
