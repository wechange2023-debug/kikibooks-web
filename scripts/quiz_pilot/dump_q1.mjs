/**
 * 문항 ① 조립 결과 덤프 (Q-2 긴급 진단 · 읽기 전용).
 *
 * `lib/quiz/build-quiz.ts`를 실물 그대로 불러 지정 책의 문항 ①을 만들고,
 * (문제 오디오 페이지, 정답 이미지 페이지, 보기 페이지들)을 대조 가능한 형태로 찍는다.
 *
 * 실행:
 *   node --conditions=react-server --env-file=.env.local \
 *     --import ./scripts/wordplay/register-hooks.mjs scripts/quiz_pilot/dump_q1.mjs <slug|book_id> [반복수]
 */

import { createClient } from '@supabase/supabase-js';
import { buildQuiz, eligibleQuestionIds } from '../../lib/quiz/build-quiz.ts';
import { isTextPrintedOnImages } from '../../lib/quiz/text-printed.ts';

const [target, repeatArg] = process.argv.slice(2);
const REPEAT = Number(repeatArg ?? 3);
const READER_VOICE = 'danielle';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);

const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(target);
const { data: books } = await supabase
  .from('books')
  .select('id,title,source_id,source_platform')
  [isUuid ? 'eq' : 'eq'](isUuid ? 'id' : 'source_id', target);

const book = books?.[0];
if (!book) {
  console.log('책을 찾지 못했다:', target);
  process.exit(1);
}
console.log(`책: ${book.title}  [${book.source_platform} ${book.source_id}]`);
console.log(`book_id: ${book.id}`);
console.log(`문장 인쇄 계보: ${isTextPrintedOnImages(book)}\n`);

const { data: textRows } = await supabase
  .from('book_text').select('page_index,text,image_url')
  .eq('book_id', book.id).order('page_index');
const { data: audioRows } = await supabase
  .from('book_audio').select('kind,page_index,audio_path,voice,duration_ms')
  .eq('book_id', book.id).eq('voice', READER_VOICE);

const audioByPage = new Map(
  (audioRows ?? []).filter((r) => r.kind === 'page').map((r) => [r.page_index, r]),
);

console.log('=== book_text x book_audio 짝 ===');
for (const r of textRows ?? []) {
  const a = audioByPage.get(r.page_index);
  const t = (r.text ?? '').trim();
  console.log(
    `p${String(r.page_index).padStart(2, '0')} | audio=${a ? a.audio_path.split('/').pop() : '-'}` +
      ` dur=${a?.duration_ms ?? '-'} | img=${r.image_url ? r.image_url.split('/').pop().slice(0, 28) : '-'}`,
  );
  console.log(`      text: ${JSON.stringify(t.slice(0, 72))}`);
}

const source = {
  bookId: book.id,
  pages: (textRows ?? []).map((r) => ({
    pageIndex: r.page_index,
    imageUrl: r.image_url,
    text: (r.text ?? '').trim(),
    audioUrl: audioByPage.has(r.page_index)
      ? `BASE/${audioByPage.get(r.page_index).audio_path}`
      : null,
  })),
  prompts: ['q1', 'q2', 'q3'].map((id) => ({ id, text: id, audioUrl: `BASE/_quiz/seoyeon/${id}.mp3` })),
  textPrintedOnImages: isTextPrintedOnImages(book),
};

console.log('\n출제 가능:', eligibleQuestionIds(source).join(', '));

const byPage = new Map(source.pages.map((p) => [`p${p.pageIndex}`, p]));

for (let i = 1; i <= REPEAT; i++) {
  const q1 = buildQuiz(source).find((q) => q.id === 'q1');
  if (!q1) { console.log(`\n[${i}] q1 미출제`); continue; }
  const ans = byPage.get(q1.answerKey);
  console.log(`\n[${i}회차] answerKey=${q1.answerKey}`);
  console.log(`   clipUrl  = ${q1.clipUrl}`);
  console.log(`   정답면 오디오 = ${ans.audioUrl}`);
  console.log(`   clip == 정답면 오디오 ? ${q1.clipUrl === ans.audioUrl ? 'YES' : '*** NO ***'}`);
  console.log(`   정답면 텍스트 = ${JSON.stringify(ans.text.slice(0, 70))}`);
  console.log(`   보기:`);
  for (const ch of q1.choices) {
    const p = byPage.get(ch.key);
    const mark = ch.key === q1.answerKey ? ' <== 정답' : '';
    const same = ch.imageUrl === p.imageUrl ? '' : ' *** 보기 이미지 != 그 면 이미지 ***';
    console.log(`     ${ch.key}  img=${ch.imageUrl.split('/').pop().slice(0, 30)}${mark}${same}`);
    console.log(`           text=${JSON.stringify(p.text.slice(0, 60))}`);
  }
  const keys = q1.choices.map((ch) => ch.key);
  if (!keys.includes(q1.answerKey)) console.log('   *** 정답 키가 보기에 없다 ***');
  const imgs = new Set(q1.choices.map((ch) => ch.imageUrl));
  if (imgs.size !== q1.choices.length) console.log('   *** 보기 이미지 중복 ***');
}
