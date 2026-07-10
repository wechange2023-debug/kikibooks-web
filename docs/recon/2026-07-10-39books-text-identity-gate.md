# 무텍스트 39권 텍스트 동일성 게이트 (2026-07-10)

> 작업지시서 2026-07-10 (3). 목적: "버킷 무텍스트 39권을 WP판(텍스트 인쇄)으로 갈아끼워도
> 되는가"(ADR-0035 Amd#2 E3, 팀장 결정 J3)의 근거 수집. 읽기 전용 — DB·Storage 쓰기 0건,
> 이미지 교체·적재·오디오 재생성 0건. AWS·유료 API 호출 0건. tesseract 5.4.0 로컬만.

## STEP 1 — 39권 텍스트 동일성 전수 검증

### 방법

- 대상 39권 = v1 54(slug↔source_id 전량: `scratchpad/step3_manifest.csv`) − blacklist 15.
- 각 책의 WP판 본문 이미지를 임시 경로에 다운로드(0.6s 간격·재시도 3회) → tesseract OCR
  (word bbox+conf, `scripts/ocr_pilot/run_pilot.py` 함수 재사용) → 정답
  `scripts/tts_pilot/out/{slug}.json`과 페이지별 대조. 산출 `scripts/ocr_pilot/out/{slug}.ocr.json`.
- 정규화: HTML 엔티티 디코딩 + 유니코드 따옴표(’ ‘ “ ”)·대시(– —)·말줄임(…) 통일 + 공백 압축.
  **대소문자 유지**. empty 면(정답 text 공백)은 비교 대상 제외.
- 삽입 토큰(정답에 없는 OCR 토큰)은 삽화 노이즈로 보고 **정확도에서 제외하되 전량 나열**(부록).
  실질 불일치 = **치환(SUB) + 누락(DEL)**. 페이지 완전 일치 = SUB+DEL 0.
- **UNCERT 기준(명시)**: 오류가 있는 페이지들의 mean confidence가 **전부 70 미만**이면
  OCR 품질로 판정 불가로 본다. (해당 책 0권이었음.)

### ★ 실행 중 발견 — v1 구권 WP 파일명 패턴 4종 신규 확인 (매핑 규칙 확장)

1차 실행에서 18권이 페이지 매핑 실패(0~1면)로 전량 누락 판정이 나왔다. 원인은 기존 검증
규칙 3종(`_Page_{NN}`→N / 소문자 `_page{n}`→n+1 / `_{날짜8}-{n}`→n) 밖의 파일명이었다.
실측으로 확인한 추가 패턴(사실):

| 패턴 | 예 | PDF 번호 규칙 | 해당 책 |
|---|---|---|---|
| `_{날짜8}{n}` 연결형(구분자 없음) | `a-beautiful-day_interior_spreads_201601044.jpg` | n+1 | 11권 |
| `interior-spreads{n}` 무날짜형 | `miss-helens-magical-world_interior-spreads4.jpg` | n+1 | 1권 |
| `Untitled-1{n}`형 | `Untitled-14.jpg` (a-fish-and-a-gift) | n+1 | 1권 |
| `_{날짜8}_{n}`형 | `sizwes-smile_english_e-book_20180930_5.jpg` | n | 1권 |
| WP 중복 접미사 `-{k}` | `sima-and-siza_Page_01-3.jpg`, `…_Page_05-1.jpg` | 접미사 제거 후 기존 규칙 | 3권 |

n+1 규칙의 검증: 각 책의 파일 번호 분포(4..15 + 후행 17/18)가 검증된 소문자 `_page{n}` 분포와
동일하며, 확장 적용 후 해당 책들의 페이지별 정답 대조가 성립(예: a-fish-and-a-gift 98.17%,
whose-button-is-this 97.89%)함으로 실증. 확장 매핑으로 **39권 전권 본문 매핑 성공**(잔여
unmapped는 sleepy-mr-sloth의 번호 없는 `sleepy-mr-sloth.jpg` 1건 — 표지 추정, 비교 불영향).

### 집계 — SAME 1권 / DIFF 38권 / UNCERT 0권 / 총 39권

- 단어 정확도 분포: **≥99% 7권 / 95~99% 8권 / 80~95% 16권 / <80% 8권** (중앙값 92.67%).
- 완전 일치(SAME): karabos-question 1권(12/12면 100%).
- 실질 불일치 총량: SUB 720 + DEL 474 (제외한 INS 1,008 — 부록에 전량).
- 특기 사실(원인 단정 없이 기록):
  - SUB의 다수가 문자 단위 오독형 치환(예: `Wangari's`→`Wangariss`, `I`→`|`, `If`→`lf`,
    `Graça`→`Graga`, `transfixed:`→`transhxed:`, 단어 앞부분 절단 `Sindi`→`di`).
  - <80% 책들(how-about-you 34.57, come-back-cat 43.59, a-beautiful-day 51.2,
    bathtub-safari 63.46 등)은 문장 블록 통누락(DEL 연쇄)과 어순 뒤섞임이 동반된다.
  - **zanele-situ-my-story의 INS에 문장 연쇄 실재**: "What is wrong, doctor?", "We think
    Zanele has got TB in her spine. …" 등 — **정답 텍스트에 없는 인쇄 텍스트(말풍선)가
    WP판 이미지에 존재**함을 뜻한다(사실).
  - a-tiny-seed는 99.76%로 대조군 재현과 정합(SUB 1건 = `Wangari's`→`Wangariss`).

### 전수 검증표

| slug | 비교면(비-empty) | 완전일치 | 단어 정확도 % | 판정 |
|---|---|---|---|---|
| a-beautiful-day | 10 | 0 | 51.2 | DIFF |
| a-dancers-tale | 12 | 1 | 94.4 | DIFF |
| a-fish-and-a-gift | 12 | 5 | 98.17 | DIFF |
| a-house-for-mouse | 11 | 7 | 88.42 | DIFF |
| a-tiny-seed | 12 | 11 | 99.76 | DIFF |
| amazing-daisy | 12 | 4 | 81.6 | DIFF |
| bathtub-safari | 12 | 2 | 63.46 | DIFF |
| come-back-cat | 12 | 4 | 43.59 | DIFF |
| gracas-dream | 12 | 1 | 92.8 | DIFF |
| grandpas-gold | 12 | 9 | 97.28 | DIFF |
| how-about-you | 12 | 0 | 34.57 | DIFF |
| i-will-help-you | 12 | 8 | 80.49 | DIFF |
| is-there-anyone-like-me | 12 | 6 | 75.44 | DIFF |
| karabos-question | 12 | 12 | 100.0 | SAME |
| lara-the-yellow-ladybird | 12 | 6 | 75.24 | DIFF |
| little-ants-big-plan | 12 | 10 | 98.52 | DIFF |
| londi-the-dreaming-girl | 12 | 7 | 82.63 | DIFF |
| lory-dory | 12 | 5 | 84.3 | DIFF |
| maddy-moona | 12 | 0 | 77.44 | DIFF |
| miss-helens-magical-world | 12 | 1 | 82.63 | DIFF |
| queen-of-soweto | 12 | 8 | 99.02 | DIFF |
| rafikis-style | 12 | 8 | 84.29 | DIFF |
| sbus-special-shoes | 12 | 4 | 78.75 | DIFF |
| searching-for-the-spirit-of-spring | 12 | 7 | 87.32 | DIFF |
| sima-and-siza | 12 | 4 | 93.17 | DIFF |
| sindi-and-the-moon | 12 | 0 | 93.07 | DIFF |
| sindiwe-and-the-fireflies | 12 | 10 | 99.27 | DIFF |
| singing-the-truth | 12 | 1 | 89.55 | DIFF |
| sizwes-smile | 12 | 9 | 99.42 | DIFF |
| sleepy-mr-sloth | 12 | 5 | 96.85 | DIFF |
| thatos-birthday-surprise | 12 | 9 | 98.58 | DIFF |
| there-must-be-a-rainbow | 12 | 11 | 99.29 | DIFF |
| together-were-strong | 12 | 9 | 99.16 | DIFF |
| tortoise-finds-his-home | 12 | 1 | 85.12 | DIFF |
| walking-together | 12 | 6 | 96.3 | DIFF |
| what-if | 12 | 10 | 98.68 | DIFF |
| whose-button-is-this | 13 | 11 | 97.89 | DIFF |
| why-is-nita-upside-down | 12 | 8 | 92.67 | DIFF |
| zanele-situ-my-story | 12 | 0 | 88.07 | DIFF |

### DIFF 상세 — 실질 불일치(치환·누락) 전량 + 제외 토큰(INS) 전량

표기: `SUB 정답→OCR` / `DEL 정답측 누락` / INS = 정확도 계산에서 제외한 삽입 토큰(노이즈 취급) 전량.

**a-beautiful-day** (정확도 51.2%, SUB 30·DEL 31·INS 104)
- p01: `"Hello`→`s` · `says`→`Nicholas."` · `Nicholas.`→`a` · `birds."`→`birds.`
- p02: `friend`→`r` · `Jacob`→`/` · `come?"`→`¢` · `asks`→`"Let's` · `Nicholas.`→`have` · DEL`"Let's` · DEL`have` · DEL`river."` · DEL`"Can` · DEL`my`
- p03: DEL`"Don't` · DEL`forget` · DEL`me.` · DEL`I` · DEL`love` · DEL`picnics!"` · DEL`says` · DEL`Donkey.` · DEL`"And` · DEL`me.` · DEL`I` · DEL`want` · DEL`to` · DEL`come` · DEL`too!"` · DEL`says` · DEL`Dog.` · DEL`"Follow` · DEL`us,"` · DEL`say` · DEL`the` · DEL`birds.`
- p05: `"I'll`→`'Tl` · `tree,"`→`tree,`
- p06: `"I`→`"IT` · `won,"`→`won,`
- p07: `you`→`ee` · `can't`→`ss` · `do`→`ae` · `this,"`→`;` · `Jacob.`→`Nicholas.` · DEL`says` · DEL`Nicholas.` · DEL`"I` · DEL`bet`
- p08: `"Here's`→`-Heres` · `spot,"`→`8` · `says`→`ite` · `Dad.`→`ae`
- p09: `Jacob.`→`|`
- p10: `eat,`→`}` · `boys`→`;` · `and`→`ae` · `girls,"`→`i` · `says`→`oh` · `Mom.`→`en`
- p11: `Mom."Say`→`"Say`
- INS(제외분): p01: `.` `a` `'\` `|` `au` `:` `|` `ae` `:` `|` `_` `Hello` `"says` / p02: `-` `'Ce` `%` `a` `*` `s` `4` `f` `Can` `my` `friend` `Jacob` `come?"` `asks.` `Nicholas.` `"` `39` `°` `1ver` `j` `e` `.` / p05: `/` / p06: `%` / p07: `|` `"RC` `ee` `he` `Sou` `ee` `ee` / p08: `6` `'` `°` `:` `3` `"` `spot,` `SaysWae` / p09: `-~` `~e` `a<_ee` `1` / p10: `.` `.` `wee` `eat` `2` `Soe` `,` `;` `ier` `eae` `ae` `ae` `:` `at` `Ly` `;` `:` `at` `we` `3` `;` `.` `A` `;` `:` `wn` `i` `i.` `;` `AD` `t` `5` `;` `:` `K` `'` `L` `Yah` `¥` `'` `nit` `:` `:` `Ci` `¥` `i` / p11: `Mom.` `Ld`

**a-dancers-tale** (정확도 94.4%, SUB 23·DEL 0·INS 5)
- p02: `transfixed:`→`transhxed:`
- p03: `was`→`Was` · `starting`→`STAITING`
- p04: `fit`→`ft` · `pirouetting,`→`plrouetting,` · `smiling!`→`smiling]`
- p05: `spread`→`soread`
- p06: `they'd`→`d`
- p07: `isn't`→`isnt` · `tough,she`→`she` · `best.'Good'`→`'Good`
- p08: `magic`→`Magic` · `in`→`IN`
- p09: `you're`→`re` · `Assoluta',`→`Assoluta)`
- p10: `Philip`→`Philio`
- p11: `way`→`Way` · `to`→`TO` · `All,`→`All`
- p12: `help`→`helo` · `feats,inspiring`→`Inspiring` · `us,`→`Us,` · `too,`→`TOO,`
- INS(제외분): p06: `they` / p07: `tough,` `best.` / p09: `you` / p12: `feats,`

**a-fish-and-a-gift** (정확도 98.17%, SUB 12·DEL 0·INS 18)
- p02: `Whaaat?"`→`Whaaat?'`
- p06: `Whaaat?"`→`Whaaat?'`
- p07: `Don't`→`Dont`
- p08: `"Don't`→`"Dont` · `silly,"`→`silly,'` · `"You'll`→`"Youll` · `Whaaat?"`→`Whaaat?'` · `supper?"`→`supper?`
- p09: `Whaaat?"`→`Whaaat?'` · `everybody,"`→`everybody,`
- p10: `Whaaat?"`→`Whaaat?'`
- p12: `Whaaat?"`→`Whaaat?'`
- INS(제외분): p04: `Sets` `-` `=.` `-=` `Te` `=` `=` `------` / p08: `Ly` `S` / p12: `y,` `Y` `J` `L` `/` `/` `yy,` `Y`

**a-house-for-mouse** (정확도 88.42%, SUB 11·DEL 0·INS 76)
- p03: `me,"`→`me,'`
- p04: `That`→`me)` · `night,`→`a` · `Mouse's`→`0)` · `dreams`→`val` · `were`→`aj` · `bouncy`→`S` · `and`→`That` · `muddy.`→`night,`
- p05: `me,"`→`me,'`
- p07: `me,"`→`me,'`
- INS(제외분): p02: `Ee` `lweey,` `Seeeer` `eres` `ee` `evreste` `yo` `Rahey` `SBE` `4y` `taceer` `*` `rarer:` `myc` `cacse` `Aodinks` `corereree` `sie` `seeie` `Se` `isisteralgogias` `en` `Saat` / p04: `~` `me)` `me)` `5` `&` `me)` `c` `fae}` `PN` `(So)` `c` `aj` `O` `-O` `0)` `o` `S` `~n` `&` `fas}` `0)` `a` / p05: `ieee` `i` `a,` `i,` `j` `i` `|` `!` `Hitt:` `rf,` `Fi` `ire` `i` `iJ` `i` `HH` `,` `Hine` `Ia` `'` / p11: `aE` `a` `OE` `SE` `LPL` `Me` `Eg` / p12: `a` `te.` `fe` `bid`

**a-tiny-seed** (정확도 99.76%, SUB 1·DEL 0·INS 8)
- p10: `Wangari's`→`Wangariss`
- INS(제외분): p02: `®` / p08: `es` `ow` `\iQ` `Fer'` `VAI` / p12: `a` `oe`

**amazing-daisy** (정확도 81.6%, SUB 33·DEL 29·INS 27)
- p01: `time`→`atime` · `near`→`lived` · `there`→`chicken` · `lived`→`near` · `chicken`→`village` · DEL`a` · DEL`village`
- p02: `high`→`But` · `into`→`all` · `sky,"`→`other` · `Daisy`→`chickens` · `said.`→`high` · `But`→`into` · `all`→`the` · `the`→`sky,"` · `other`→`Daisy` · `chickens`→`said.`
- p03: DEL`"We` · DEL`won't` · DEL`play` · DEL`with` · DEL`you` · DEL`anymore."`
- p06: DEL`She` · DEL`would` · DEL`lift` · DEL`off` · DEL`the` · DEL`ground` · DEL`but` · DEL`fall` · DEL`down` · DEL`again.`
- p07: `to`→`"Daisy,` · `Mama.`→`you` · `"The`→`are` · `others`→`different` · `are`→`from` · `right."`→`the` · `"Daisy,`→`to` · `you`→`Mama.` · `are`→`"The` · `different`→`others` · `from`→`are` · `the`→`right."`
- p08: `...`→`wings...` · `...`→`wings...` · `...`→`and...` · DEL`wings` · DEL`wings` · DEL`and`
- p09: `loud."Ha`→`"Ha` · DEL`BAM!`
- p10: `and`→`wings.` · `...`→`yy` · DEL`Flap,` · DEL`flap,` · DEL`flap,` · DEL`Daisy` · DEL`flapped` · DEL`her` · DEL`wings.`
- INS(제외분): p01: `there` / p03: `"We` `won't` `play` `with` `you` `anymore."` `SS` / p06: `She` `would` `lift` `off` `the` `ground` `but` `fall` `down` `again.` / p09: `loud.` `/` / p10: `and...` `Flap,` `flap,` `flap,` `Daisy` `flapped` `her`

**bathtub-safari** (정확도 63.46%, SUB 6·DEL 32·INS 5)
- p01: `'I'll`→`'ll` · `a`→`ina` · `ears.'`→`ears:` · DEL`in`
- p02: DEL`There's` · DEL`a` · DEL`SWOOSH.` · DEL`And` · DEL`a` · DEL`swish` · DEL`of` · DEL`a` · DEL`tail.` · DEL`And` · DEL`then...`
- p04: `turn..`→`turn...` · DEL`Look` · DEL`at` · DEL`what's` · DEL`coming!`
- p05: DEL`TOOOT!`
- p06: DEL`and...`
- p07: DEL`SPLASH!`
- p09: DEL`AAAAAAH`
- p10: DEL`ROAR`
- p11: `I`→`|` · `bed.'`→`bed?`
- p12: DEL`Jack` · DEL`is` · DEL`fast` · DEL`asleep` · DEL`in` · DEL`bed` · DEL`surrounded` · DEL`by` · DEL`his` · DEL`toy` · DEL`animals.`
- INS(제외분): p04: `Look` `at` `what's` `coming!` / p06: `and...`

**come-back-cat** (정확도 43.59%, SUB 25·DEL 19·INS 25)
- p01: `me.`→`b` · DEL`back,` · DEL`cat!` · DEL`Play` · DEL`with`
- p04: `Come`→`3` · `back,`→`Don` · `cat!`→`!` · `Don't`→`b)` · `go`→`Come` · `outside.`→`back,`
- p05: DEL`Cat` · DEL`runs` · DEL`outside` · DEL`and` · DEL`chases` · DEL`butterflies.`
- p08: `Come`→`~Come` · `cat.`→`c` · `That's`→`:` · `not`→`3` · `your`→`ur`
- p09: `back?`→`back`
- p10: DEL`Stay` · DEL`in` · DEL`your` · DEL`basket.` · DEL`It's` · DEL`nap` · DEL`time` · DEL`now.`
- p11: DEL`Cat?`
- p12: `Cat`→`cami` · `sleeps`→`raw` · `peacefully`→`Bt` · `on`→`prions` · `the`→`ise` · `couch`→`yrannsn` · `with`→`he!` · `the`→`ENA` · `feathers,`→`Abe` · `thread`→`aaciaal` · `and`→`ANS` · `snail.`→`oat`
- INS(제외분): p03: `Aa` `hppa` `-` `7` `ro` `Povrmemet=` `ite` `ton` `oat` `Gi` `Wi` `Myst` `9` `any` `i` `ABC` `Mone` / p04: `t` `go` `outs` `de.` `1` / p09: `2` / p12: `ie` `POD`

**gracas-dream** (정확도 92.8%, SUB 38·DEL 0·INS 22)
- p01: `Graça`→`Graga` · `Graça's`→`Graga's` · `opportunities.`→`opportunities`
- p02: `Graça`→`Graga` · `true.`→`true`
- p03: `Graça.`→`Graca.` · `Graça`→`Graga` · `Graça`→`Gra¢ga`
- p04: `Graça`→`Graga` · `a`→`c`
- p05: `Graça`→`Graga` · `Graça`→`Graga` · `was`→`was.` · `sad...`→`sad`
- p06: `Graça`→`Graga`
- p08: `Graça's`→`Graga's` · `Samora`→`Sarnora` · `married.`→`married`
- p09: `Graça`→`Graga` · `hands.`→`hands`
- p10: `Graça`→`Graga` · `family`→`farnily` · `hopeful.`→`hopeful` · `crash.`→`crash`
- p11: `Graça`→`Graga` · `freedom,`→`freedorn,` · `people.`→`people` · `Graça`→`Graga` · `children.`→`children`
- p12: `Here's`→`become` · `book,`→`for` · `my`→`her` · `child.`→`country.` · `What`→`She` · `will`→`made` · `inspire`→`and` · `you`→`opportunities` · `do?`→`too.`
- INS(제외분): p12: `Graca's` `dreams` `had` `come` `true.` `She` `had` `teacher.` `She` `had` `celebrated` `freedom` `possible` `for` `more` `children` `to` `have` `education,` `achieve` `great` `things`

**grandpas-gold** (정확도 97.28%, SUB 3·DEL 2·INS 1)
- p06: `a`→`ina` · DEL`in`
- p07: `doesn't!`→`doesnt!`
- p11: `...`→`enough...` · DEL`enough`
- INS(제외분): p12: `V7`

**how-about-you** (정확도 34.57%, SUB 27·DEL 26·INS 5)
- p01: DEL`Who` · DEL`are` · DEL`you?`
- p02: DEL`Is` · DEL`that` · DEL`goo?` · DEL`Eeuw!` · DEL`I` · DEL`want` · DEL`some` · DEL`too.`
- p03: `We`→`Le` · `you?`→`you!`
- p04: `I`→`two` · `like`→`shoes.` · `blue.`→`}` · `Do`→`\` · `you`→`ike` · `too?`→`blue.` · `I`→`"Which` · `choose`→`do` · `two`→`»` · `shoes.`→`Do` · `Which`→`you` · `do`→`too?`
- p05: `Horseshoes!?`→`C%`
- p06: `I`→`\`
- p07: `eurgghhh...aargh!`→`eurgghhhes.` · DEL`We` · DEL`make` · DEL`lots` · DEL`of` · DEL`noise.` · DEL`Whaaa!`
- p08: `I`→`\` · `nap`→`nae`
- p09: DEL`I` · DEL`don't` · DEL`nap!`
- p10: `all`→`rough` · `through`→`the` · `the`→`n` · `night.`→`ight.` · DEL`I` · DEL`stay` · DEL`upright`
- p11: `ROCK!`→`THUWSCK!` · DEL`THWOCK!` · DEL`Buddy,` · DEL`you`
- p12: `That's`→`Thats` · `we`→`Wwe` · `you?`→`you!`
- INS(제외분): p04: `\` `choose` / p05: `Horseshoes?` `eS` / p06: `Aap`

**i-will-help-you** (정확도 80.49%, SUB 15·DEL 9·INS 1)
- p02: `am`→`"Iam` · DEL`"I` · DEL`"Please` · DEL`help` · DEL`me."`
- p04: `"I`→`"T` · `you,"`→`you,'`
- p06: `to`→`On` · `shop`→`way,` · `to`→`he` · `buy`→`stops` · `bread.`→`to` · `On`→`play` · `the`→`with` · `way,`→`to` · `he`→`the` · `stops`→`shop` · `play`→`buy` · `with`→`bread.`
- p09: DEL`"Why` · DEL`are` · DEL`you` · DEL`crying,` · DEL`Lungile?"`
- INS(제외분): p03: `\`

**is-there-anyone-like-me** (정확도 75.44%, SUB 4·DEL 24·INS 10)
- p02: `the`→`tha`
- p04: DEL`Someone` · DEL`with` · DEL`my` · DEL`eyes` · DEL`my` · DEL`ears.`
- p05: `...`→`d` · DEL`can` · DEL`do` · DEL`what` · DEL`I` · DEL`do`
- p08: `...`→`down...` · DEL`down`
- p09: DEL`...` · DEL`at` · DEL`every` · DEL`single` · DEL`face.`
- p11: `true!`→`true` · DEL`There's` · DEL`only` · DEL`one` · DEL`me` · DEL`in` · DEL`the` · DEL`world!`
- INS(제외분): p01: `,` `=` / p02: `en` `ae` `eee` `.` / p10: `Fi` `4` `z` `£`

**lara-the-yellow-ladybird** (정확도 75.24%, SUB 2·DEL 49·INS 19)
- p02: DEL`Everyone` · DEL`loved` · DEL`her` · DEL`yellow` · DEL`wings.`
- p03: DEL`At` · DEL`school,` · DEL`she` · DEL`played` · DEL`with` · DEL`lots` · DEL`of` · DEL`friends.`
- p04: `I`→`|` · `Mama,"`→`Mama,'`
- p07: DEL`And` · DEL`when` · DEL`she` · DEL`got` · DEL`there,` · DEL`none` · DEL`of` · DEL`her` · DEL`friends` · DEL`said` · DEL`hello.`
- p09: DEL`Lara's` · DEL`classmates` · DEL`were` · DEL`shocked.` · DEL`"Your` · DEL`wings` · DEL`are` · DEL`special!"` · DEL`"So` · DEL`unique!""So` · DEL`rare!"`
- p11: DEL`Back` · DEL`home,` · DEL`Lara` · DEL`took` · DEL`a` · DEL`long` · DEL`bath` · DEL`and` · DEL`scrubbed` · DEL`until` · DEL`her` · DEL`golden` · DEL`wings` · DEL`gleamed.`
- INS(제외분): p02: `Everyone` `loved` `her` `yellow` `wings.` / p03: `aoailt` `At` `school,` `she` `played` `with` `lots` `of` `friends.` / p08: `i` `a)` `[` `j` `y`

**little-ants-big-plan** (정확도 98.52%, SUB 3·DEL 0·INS 9)
- p06: `I`→`|`
- p12: `I`→`|` · `I`→`|`
- INS(제외분): p02: `ae` `=` `Ni,` `WAN` `i` / p04: `e` `fe` `a` `e`

**londi-the-dreaming-girl** (정확도 82.63%, SUB 15·DEL 22·INS 59)
- p05: `hopped`→`crept` · `over`→`past` · `the`→`Mama` · `rocks.`→`Neli's` · `She`→`house.` · `crept`→`She` · `past`→`hopped` · `Mama`→`over` · `Neli's`→`the` · `house.`→`rocks.`
- p06: DEL`"We'll` · DEL`have` · DEL`to` · DEL`wait.` · DEL`Let's` · DEL`stay` · DEL`in` · DEL`line.` · DEL`No` · DEL`dreaming` · DEL`away!"`
- p08: DEL`Or` · DEL`something` · DEL`else...`
- p11: DEL`"Come` · DEL`let's` · DEL`go,` · DEL`my` · DEL`dreaming` · DEL`girl,"` · DEL`said` · DEL`Gogo.`
- p12: `"Look,`→`att` · `Gogo!`→`te` · `There's`→`keel` · `pink`→`There'sapink` · `pig`→`pig»`
- INS(제외분): p02: `%` `aaog` `Rae` `c` `-` `f` `%` `{` `é` `ead` `"` / p04: `|` `)` `\` `7` `f` / p06: `"We'll` `have` `to` `wait.` `Let's` `stay` `in` `line.` `No` `dreaming` `away!"` `|` `|` `-` / p07: `4` `4` `;` `me` `Asis` `Wh` `Mh` `ay` `vy` `Step` `Nil` `1)` / p11: `"Come` `let's` `go,` `my` `dreaming` `girl,"` `said` `Gogo.` / p12: `~` `ee` `.` `thigh` `"Look,` `Gogo!` `°` `hae` `Ki`

**lory-dory** (정확도 84.3%, SUB 8·DEL 27·INS 0)
- p04: DEL`You'd` · DEL`only` · DEL`see` · DEL`Lory` · DEL`when` · DEL`rain` · DEL`hit` · DEL`her` · DEL`head,`
- p05: `names.`→`ae` · DEL`Lory` · DEL`was` · DEL`left` · DEL`out` · DEL`of` · DEL`all` · DEL`the` · DEL`kids'` · DEL`games.` · DEL`They` · DEL`teased` · DEL`her` · DEL`and` · DEL`they` · DEL`called` · DEL`her`
- p06: `I`→`|`
- p07: `in`→`notin` · DEL`not`
- p10: `I`→`'|` · `I`→`|`
- p11: `true?'`→`true?"`
- p12: `I`→`|` · `I`→`|` · DEL`I`

**maddy-moona** (정확도 77.44%, SUB 116·DEL 9·INS 17)
- p01: `is`→`Is` · `and`→`And` · `I'm`→`'m` · `turning`→`Turning` · `I`→`|` · `a`→`A` · `We'll`→`Well` · `searching`→`Searching` · `until`→`Until` · `perfect`→`pertect` · `I`→`|` · `I'll`→`Ill`
- p02: `to`→`y` · `get`→`brother` · `an`→`Bi` · `elephant.`→`m` · `I'll`→`going` · `ride`→`to` · `on`→`os` · `it`→`an` · `to`→`cleat` · `school.`→`1.` · `My`→`f` · `brother`→`i` · `Billy`→`Yj` · `can`→`y` · `walk`→`<r` · `behind,`→`ed` · `he'll`→`behind` · `think`→`inks` · `I'm`→`'id` · `I`→`|` · `she'd`→`shed` · `sneeze....`→`sneeze...` · DEL`I'm` · DEL`going`
- p03: `want`→`Il` · `a`→`keep` · `Nile`→`him` · `crocodile`→`in` · `sent`→`the` · `to`→`bathtub` · `me`→`and` · `by`→`brush` · `the`→`his` · `pharaohs.`→`pearly` · `I'll`→`whites,` · `call`→`|` · `him`→`want` · `Tut`→`a` · `and`→`Nile` · `feed`→`crocodile` · `him`→`But...` · `soup,`→`what` · `fish`→`if` · `fingers,`→`flossing` · `and`→`all` · `baby`→`those` · `marrows.`→`teeth` · `I'll`→`sent` · `keep`→`to` · `him`→`me` · `in`→`by` · `bathtub`→`pharaohs.` · `and`→`takes` · `brush`→`me` · `his`→`all` · `pearly`→`day` · `whites,`→`and` · `But...`→`night?` · `what`→`Il` · `if`→`call` · `flossing`→`him` · `all`→`Tut` · `those`→`and` · `teeth`→`feed` · `takes`→`him` · `me`→`soup,` · `all`→`fish` · `day`→`fingers,` · `night?`→`Marrows.` · DEL`I`
- p04: `cops.`→`COpS.` · `I`→`|` · `the`→`ao` · `firing`→`ye` · `line?`→`ee` · DEL`sharp-shooting` · DEL`pals` · DEL`put` · DEL`me` · DEL`in`
- p05: `I`→`|` · `funk!`→`funk'` · `isn't`→`isnt` · `earth.`→`earth` · `I`→`|` · `I`→`|` · `I`→`|`
- p06: `It`→`|` · `rampage?`→`°` · `I'm`→`lim` · `'til`→`'` · `I'm`→`hy` · `gran's`→`\` · `age.`→`tes,`
- p07: `I`→`|` · `I`→`|` · `biltong...`→`biltong..` · `won't`→`t` · `satisfy.`→`satisty.` · `he'll`→`ll`
- p08: `I`→`|` · `I`→`|` · `he'll`→`ll` · `I`→`|` · `And`→`7` · `can't`→`cant`
- p09: `aren't`→`arent` · `I`→`|` · `I'll`→`I'l`
- p10: `I`→`|`
- p11: `I`→`|` · `I`→`|`
- p12: DEL`I`
- INS(제외분): p03: `baby` / p06: `7` `rampage` `til` `lim` `grans` `OGe.` `NX` `ner` `j` `cf` / p07: `won` `he` / p08: `he` `Dolio` `aa)` `J`

**miss-helens-magical-world** (정확도 82.63%, SUB 89·DEL 42·INS 55)
- p01: `It`→`LT` · `was`→`WAS` · `called`→`CALLED` · `'The`→`"THE` · `Owl`→`QWL` · `House'.`→`HOUSE".`
- p02: `From`→`FROM` · `the`→`THE` · `start,`→`START,` · `Helen`→`HELEN` · `did`→`DID` · `things`→`THINGS` · `differently`→`DIFFERENTLY` · `from`→`FROM` · `most`→`MOST` · `people.`→`PEOPLE.`
- p03: `In`→`IN` · `her`→`HER` · `mind`→`MIND` · `Helen`→`HELEN` · `saw`→`SAW` · `princes`→`PRINCES` · `and`→`AND` · `pyramids`→`PYRAMIDS` · `and`→`AND` · `camels`→`CAMELS` · `in`→`IN` · `the`→`ThE` · `sand.`→`SAND.`
- p04: `all!`→`D` · DEL`But` · DEL`of` · DEL`course,` · DEL`owls` · DEL`were` · DEL`always` · DEL`her` · DEL`favourite` · DEL`things` · DEL`of`
- p05: `He`→`HER` · `convinced`→`TO` · `her`→`RUN` · `to`→`AWAY` · `run`→`WITH` · `away`→`HIM.` · `with`→`Bees` · `him.`→`oe`
- p06: `When`→`WHEN` · `Helen's`→`HELEN'S` · `mother`→`MOTHER` · `became`→`BECAME` · `very`→`VERY` · `sick,`→`SICK,` · `she`→`SHE` · `decided`→`DECIDED` · `it`→`11` · `was`→`WAS` · `time`→`TIME` · `to`→`10` · `go`→`GO` · `back`→`BACK` · `home.`→`HOME.`
- p08: `my`→`zi` · `world'.`→`SAID:` · DEL`It` · DEL`said:` · DEL`'This` · DEL`is`
- p09: `with`→`SHE` · `the`→`WOULD` · `best`→`ALWAYS` · `view`→`CHOOSE` · `of`→`THE` · `the`→`ONE` · `moon`→`WITH` · `and`→`THE` · `the`→`BEST` · `stars.`→`STARS.` · DEL`She` · DEL`would` · DEL`always` · DEL`choose` · DEL`the` · DEL`one`
- p10: `Helen'.`→`Helen'` · `she`→`IN` · `wrote:`→`HER` · `"In`→`DIARY` · `my`→`SHE` · `loneliness`→`WROTE:` · `I`→`|` · `am`→`AM` · `happy."`→`HAPPY."` · DEL`In` · DEL`her` · DEL`diary`
- p11: `The`→`THE` · `garden`→`GARDEN` · `grew`→`GREW` · `and`→`AND` · `grew,`→`GREW,` · `until`→`UNTIL` · `there`→`THERE` · `was`→`WAS` · `hardly`→`HARDLY` · `space`→`SPACE` · `left`→`LEFT` · `for`→`FOR` · `any`→`ANY` · `more`→`MORE` · `creatures.`→`CREATURES.`
- p12: DEL`And` · DEL`we` · DEL`still` · DEL`stand` · DEL`here` · DEL`today,` · DEL`just` · DEL`the` · DEL`way` · DEL`she` · DEL`left` · DEL`us,` · DEL`in` · DEL`the` · DEL`garden` · DEL`she` · DEL`made,` · DEL`looking` · DEL`East.`
- INS(제외분): p02: `-` / p04: `Chrenrg` `orp` / p05: `Chron` `np` `he` `Ge` `HE` `CONVINCED` / p06: `">` `,` `*` `2` `.` `F;` `Pd` `a` `al` `es` `£` `Cs` `*-` `'` `oH` `"a` `=` `Mowe` `SES` `x` `;` `*` `>` `Z` `ez,` `3` / p07: `;` `rth` `AND` `REMEMBER,` `WE` `OWLS` `WERE` `THERE` `100.` `WE` `WATCHED` `OVER` `HER,` `CALLING` `WOO-WOOH!` `a` / p11: `ey` `WD` `TT` `LEY`

**queen-of-soweto** (정확도 99.02%, SUB 7·DEL 0·INS 38)
- p01: `parents'`→`parents`
- p07: `"fierce,`→`'fierce,` · `fools".`→`fools'.` · `wasn't`→`wasnt`
- p11: `privilege".`→`privilege'.`
- p12: `success`→`cess` · `course".`→`course'.`
- INS(제외분): p03: `580002` `"001` `0.98)` `600992` `0` `I` `|` `2S` `=` `LO` `O` `3088898` `rH` `°` `°` `Re` `Boe` `000000050` `5` `QV.` `)` `o-` `O92` `om` `29` `0,` `©` `B20` `raw.` `sLoioIoTonslelo=es:` / p05: `+` `at` `ea]` / p12: `suc-` `Ee` `iF` `:` `[=`

**rafikis-style** (정확도 84.29%, SUB 2·DEL 20·INS 4)
- p01: DEL`On` · DEL`Sunday,` · DEL`Jimmy` · DEL`Zogba` · DEL`scored` · DEL`the` · DEL`winning` · DEL`goal.`
- p09: `bling.""Bling,`→`"Bling,`
- p10: `weekend,`→`,` · DEL`The` · DEL`next`
- p12: DEL`Rafiki` · DEL`shrugged.` · DEL`"I` · DEL`look` · DEL`like` · DEL`me;` · DEL`this` · DEL`style` · DEL`is` · DEL`mine."`
- INS(제외분): p09: `bling."` / p10: `The` `next` `weekend`

**sbus-special-shoes** (정확도 78.75%, SUB 10·DEL 7·INS 22)
- p01: `Sbu's`→`Sbu''s`
- p02: `I`→`|`
- p03: `I`→`|`
- p04: `I`→`|`
- p05: `I`→`|`
- p08: `I`→`|`
- p10: DEL`Watch` · DEL`me` · DEL`jump` · DEL`and` · DEL`catch` · DEL`the` · DEL`moon.`
- p12: `in`→`|` · `Sbu's`→`©` · `special`→`Y)` · `shoes.`→`&`
- INS(제외분): p05: `4` `-=` `}f` `fin` `a` `|` `|` `|` `|` `we` `en` / p12: `wi` `Le)` `Oo` `Cc` `wn` `Re` `UO` `Le)` `(on` `[7p)` `4`

**searching-for-the-spirit-of-spring** (정확도 87.32%, SUB 5·DEL 81·INS 2)
- p03: `"I`→`"|` · `backthe`→`the`
- p06: `people`→`people.` · `gift.She`→`She`
- p10: DEL`a`
- p11: `With`→`needed.With` · DEL`needed.`
- p12: DEL`When` · DEL`she` · DEL`arrived` · DEL`home` · DEL`the` · DEL`villagers` · DEL`gathered` · DEL`around` · DEL`her` · DEL`to` · DEL`hear` · DEL`of` · DEL`her` · DEL`adventures.` · DEL`She` · DEL`told` · DEL`them` · DEL`the` · DEL`tales` · DEL`of` · DEL`what` · DEL`she` · DEL`had` · DEL`seen,` · DEL`heard,` · DEL`and` · DEL`eaten.` · DEL`Then` · DEL`she` · DEL`opened` · DEL`her` · DEL`bag` · DEL`to` · DEL`share` · DEL`the` · DEL`gifts` · DEL`given.` · DEL`The` · DEL`people` · DEL`rejoiced` · DEL`to` · DEL`receive` · DEL`these` · DEL`treasures.` · DEL`Through` · DEL`the` · DEL`generosity` · DEL`of` · DEL`others` · DEL`and` · DEL`the` · DEL`courage` · DEL`of` · DEL`Nkanyezi,` · DEL`the` · DEL`villagers` · DEL`again` · DEL`found` · DEL`the` · DEL`colour,` · DEL`song` · DEL`and` · DEL`dance` · DEL`in` · DEL`their` · DEL`lives.` · DEL`And` · DEL`so` · DEL`the` · DEL`spirit` · DEL`of` · DEL`celebration` · DEL`was` · DEL`restored` · DEL`to` · DEL`the` · DEL`village` · DEL`of` · DEL`Ndlovu.`
- INS(제외분): p03: `back` / p06: `gift.`

**sima-and-siza** (정확도 93.17%, SUB 19·DEL 0·INS 0)
- p04: `Sima's`→`Sima''s`
- p05: `'What`→`"What` · `nurse,'`→`nurse;` · `Sima.`→`Sima,` · `me?'`→`me?"` · `soccer,'`→`soccer,`
- p07: `park.'`→`park:`
- p08: `'Why`→`"Why`
- p09: `...`→`..` · `ambulance!'`→`ambulancel'`
- p10: `'He`→`"He` · `stitches`→`stiches` · `thing,'`→`thing,`
- p11: `'You're`→`"You're` · `day.'`→`day.` · `I`→`|` · `you,'`→`you;`
- p12: `'Thank`→`"Thank` · `Sima,'`→`Sima,`

**sindi-and-the-moon** (정확도 93.07%, SUB 33·DEL 4·INS 121)
- p01: `Sindi`→`di` · `loved`→`ved` · `a`→`ona` · DEL`on`
- p02: `One`→`ne` · `school.`→`*` · `"Sindi`→`Sindi`
- p03: `When`→`hen`
- p04: `When`→`We`
- p05: `As`→`A:` · `"School`→`School` · `serious,"`→`serious,`
- p06: `The`→`he`
- p07: `Sindi`→`di` · `"Dear`→`ear` · `"I`→`company?'` · `am`→`"lam` · DEL`company?"`
- p08: `Sindi`→`di` · `made`→`ade`
- p09: `gentle`→`entle` · `"Dear`→`ear` · `friends.""But`→`"But` · `beautiful."`→`beautiful.'` · DEL`A`
- p10: `Sindi`→`di` · `She`→`he` · `Sindi,"it`→`Sindi,'it`
- p11: `The`→`he`
- p12: `about`→`bout` · `"I`→`"|` · `now,"`→`now,'` · `I`→`|` · `I`→`|` · `I`→`|` · `dance!"`→`dance!'` · DEL`By`
- INS(제외분): p02: `O` `°` `school.'` `e` `*` `oe` `hs` / p03: `SHSHSHSHS` `HSH` `SH` `SESH` `SHAH` `RESH` `AH` `RGTSHADARARABARSRS` `TE` `RARE` `RSET` `ETT` `ET` `ee` `1` `4` `4` `peeeeeeee` `sy` `sllcballabellcbglletelectellebelict` `4` `"eo` `er"` `on` `<=` `SHSASESAS` `HS` `HSH` `SORE` `TORT` `SETH` `AGA` `SEA` `HARARARSRERSE` `SHARED` `SECO` `GEaE` `DE` `Ow` `Pesegeasgea` `eds` `a` `es` `ee` `bl` `ae` `S` `Ey` `5` `SPS` `USES` `HERO` `HES` `SHH` `IHS` `O` `RE` `AH` `AGS` `TORS` `DSRADARSRSRETCHARGREN` `GH` `OR` `GEST` `OW` `pececweeeeen` `d` `_` `a` `ri` `aenee` `=` `|` `Meececereresessus` `es;` `Benen` `2.` `venen` `ae` `riveyvirn` `Piaguvavovavavavnvuvdwscuesersseny` `a` `rs` `Mt` `Tene` `asacusnvasavuvowneneneneneny` `reverie` `rir` / p04: `@` `ez` / p05: `3.` `uw` `.` `.` `n` `.` `®` `"ee.` `os` `dew!` `v7` `i` `Pay` `°°` `e` `°` `0` `¢` `"` `i` / p06: `|` `T` / p09: `friends."` / p11: `T`

**sindiwe-and-the-fireflies** (정확도 99.27%, SUB 2·DEL 1·INS 2)
- p07: `off!`→`offt`
- p11: `a`→`ona` · DEL`on`
- INS(제외분): p06: `|` / p11: `~`

**singing-the-truth** (정확도 89.55%, SUB 49·DEL 0·INS 29)
- p02: `in`→`IN`
- p03: `to`→`To` · `I`→`|` · `I`→`|` · `I`→`|`
- p04: `I`→`|` · `I`→`|` · `I`→`|` · `helped`→`heloed` · `I`→`|` · `I`→`|`
- p05: `I`→`|` · `to`→`TO` · `singing`→`SINGING` · `strong.`→`.`
- p06: `I`→`|`
- p07: `a`→`oa` · `place`→`olace` · `music`→`Music` · `people`→`oeople`
- p08: `I`→`|` · `I`→`|` · `people`→`oeople` · `in`→`In` · `country.`→`COUNTTY.` · `I`→`|` · `I`→`|` · `I`→`|`
- p09: `my`→`My` · `helped`→`heloed` · `I`→`|`
- p10: `I`→`|` · `I`→`|` · `people`→`oeople` · `I`→`|` · `in`→`In` · `country,`→`COUNTTY,` · `people`→`oeople`
- p11: `to`→`TO` · `I`→`|` · `in`→`IN`
- p12: `I`→`|` · `sing`→`sINg` · `in`→`IN` · `I`→`|` · `helped`→`heloed` · `happen`→`hagopen` · `I`→`|` · `I`→`|`
- INS(제외분): p01: `<` `%` `ee` `<` / p04: `"oo` `£` / p05: `sTrONng.` `A` `a` / p06: `r` `1` `H` `|` `yy` `/` `\` / p07: `\` `)` `hit` `fil` `TUTTLE` `LLL` `ELEL` `LLL` / p09: `aa` `a` `A` `/` `4`

**sizwes-smile** (정확도 99.42%, SUB 4·DEL 0·INS 3)
- p02: `Look!"`→`Look`
- p09: `Mme`→`Mrs`
- p10: `closingher`→`book.` · `book."Aw,`→`"Aw,`
- INS(제외분): p02: `Thad` / p10: `closing` `her`

**sleepy-mr-sloth** (정확도 96.85%, SUB 7·DEL 0·INS 0)
- p03: `Don't`→`Dont`
- p04: `you're`→`youre`
- p05: `Don't`→`Dont`
- p06: `You'll`→`Youll`
- p07: `Don't`→`Dont`
- p09: `Don't`→`Dont`
- p10: `You'll`→`Youll`

**thatos-birthday-surprise** (정확도 98.58%, SUB 3·DEL 0·INS 9)
- p03: `Maybe`→`"Maybe`
- p05: `moon.`→`moon."`
- p11: `asks:"What`→`"What`
- INS(제외분): p02: `Ss` / p04: `lll` `sl` `<=` `xx` `a` `ZO` `6004` / p11: `asks:`

**there-must-be-a-rainbow** (정확도 99.29%, SUB 1·DEL 1·INS 1)
- p08: `a`→`bea` · DEL`be`
- INS(제외분): p11: `eee`

**together-were-strong** (정확도 99.16%, SUB 14·DEL 0·INS 6)
- p03: `Qingqiwe,`→`Qinggiwe,`
- p05: `must`→`is` · `apply,`→`the` · `my`→`prize?"` · `clever`→`asked` · `friend."`→`Yo` · `"What`→`must` · `is`→`apply,` · `the`→`my` · `prize?"`→`clever` · `asked`→`friend.` · `sure.`→`sure."` · `"Albertina`→`Albertina`
- p08: `You'll`→`Youll`
- INS(제외분): p03: `aoe` / p05: `What` / p09: `ie` `Sith` `PETE` `TiIe,`

**tortoise-finds-his-home** (정확도 85.12%, SUB 45·DEL 9·INS 135)
- p01: `searching`→`looking` · `searching.`→`looking.` · `I'm`→`''m` · `it?"`→`oe`
- p03: `we're`→`I'm` · `Tortoise's`→`my` · `it?"`→`Said:`
- p04: `Sparrow`→`He` · `"You're`→`re` · `fast!"`→`me,` · `called`→`complained` · `walked`→`carried` · `on`→`on,`
- p05: `we're`→`I'm` · `Tortoise's`→`my` · `it?"`→`chance?"`
- p06: `Ladybird`→`She` · `shell.`→`he` · `Tortoise`→`went,` · `walked`→`|` · `on`→`-`
- p07: `I'll`→`it,` · `help`→`by` · `you`→`any` · `look!"`→`chance?"` · DEL`it?"` · DEL`"No,` · DEL`I` · DEL`haven't,` · DEL`but`
- p08: `jumped`→`hopped` · `on`→`on,` · `Tortoise.`→`al` · DEL`the`
- p09: `Tortoise`→`asked` · `sighed.`→`Tortoise.` · `drip`→`Drip-drip` · DEL`stronger` · DEL`and` · DEL`Drip,`
- p10: `whipped`→`whipped.` · `and`→`It`
- p11: `"Eek!"`→`tip.` · `squeaked`→`|` · `with`→`got` · `a`→`s` · `fright,`→`such` · `and`→`a` · `he`→`fright` · `shrank`→`he` · `back`→`Ste` · `cosy`→`\` · `inside.`→`\`
- p12: `house!"`→`house`
- INS(제외분): p01: `Then` `he` `went` `past` `Snail.` `Snail,` `it,` `by` `any` `chance?"` / p02: `Snail` `said:` `The` `sun` `was` `high` `-` `inthe` `sky.` `¢` / p03: `A` `little` `later` `they` `passed` `Sparrow.` `Sparrow,` `it,` `by` `any` `chance?"` `Sparrow` / p04: `"But` `you` `fast` `for` `Sparrow` `came` `back.` `The` `sun` `had` `inched` `lower` `in` `the` `Sky.` `Ziti` `'2` / p05: `A` `little` `later` `they` `passed` `Ladybird.` `Ladybird,` `it,` `by` `any` / p06: `Ladybird` `said:` `>` `back` `and` `on` `:` / p07: `A` `little` `later` `they` `passed` `Mouse.` `He` `was` `making` `a` `garland` `of` `daisies.` / p08: `said:` `"No,` `I` `haven't,` `but` `I'll` `help` `you` `look!"` `He` `"Wait,` `I` `can't` `leave` `my` `flowers` `behind."` `Tortoise` `waited.` `Mouse` `stretched` `and` `stretched` `and` `scooped` `up` `his` `daisies.` `Tortoise's` `feet.` `Tortoise` `got` `tired.` `"You` `lot` `are` `heavy,'` `he` `sighed.` `|` `g` `SY,` / p10: `~` `.` / p11: `\` `|` `And` `then` `came` `ths` `hail,` `tip-` `tip:` `cosy'` `tere` / p12: `|"`

**walking-together** (정확도 96.3%, SUB 6·DEL 2·INS 5)
- p02: `am`→`Lam` · DEL`I`
- p03: `I'll`→`rl`
- p04: `I'll`→`ll`
- p07: `I`→`|`
- p08: `If`→`lf`
- p11: `us`→`tellus` · DEL`tell`
- INS(제외분): p11: `|` `HH` `]` `Hh` `PE`

**what-if** (정확도 98.68%, SUB 2·DEL 0·INS 6)
- p09: `I`→`|`
- p12: `wondering,"`→`wondering,'`
- INS(제외분): p03: `gt` / p10: `.` `)` `/` `\` `oe`

**whose-button-is-this** (정확도 97.89%, SUB 3·DEL 0·INS 6)
- p09: `"I've`→`"T've`
- p12: `"I`→`"T` · `yours,"he`→`he`
- INS(제외분): p04: `|` `-` / p09: `|` / p12: `yours,"` / p13: `-___` `ds`

**why-is-nita-upside-down** (정확도 92.67%, SUB 4·DEL 13·INS 0)
- p03: `'I'm`→`'Tm` · `in.`→`in'`
- p05: DEL`There` · DEL`are` · DEL`children` · DEL`playing` · DEL`on` · DEL`a` · DEL`slide,` · DEL`swings,` · DEL`a` · DEL`seesaw` · DEL`and` · DEL`a` · DEL`merry-go-round.`
- p06: `freckled.`→`freckled,`
- p08: `Bambam's`→`Bambam''s`

**zanele-situ-my-story** (정확도 88.07%, SUB 43·DEL 15·INS 153)
- p01: `I`→`|`
- p02: `I`→`|` · `I`→`|` · `I`→`|` · `I`→`|`
- p03: `I`→`|` · `I`→`|` · `I`→`|` · `I`→`|` · `I`→`|`
- p04: `I`→`|`
- p05: `I`→`|` · `I`→`|` · `I`→`|` · `I`→`|` · `I`→`|`
- p06: `I`→`|` · `I`→`|` · DEL`sports,` · DEL`so` · DEL`I` · DEL`trained` · DEL`very` · DEL`hard.`
- p07: `I`→`|` · `I`→`|` · `I`→`|`
- p08: `athletes`→`But` · `world`→`Paralympics,` · `compete`→`the` · `for`→`athletes` · `gold,`→`are` · `silver`→`Olympics,` · `and`→`where` · `bronze`→`the` · `medals.`→`best` · `But`→`athletes` · DEL`the` · DEL`Olympics,` · DEL`where` · DEL`best` · DEL`the` · DEL`Paralympics,` · DEL`athletes` · DEL`are`
- p09: `I`→`|` · `I`→`|`
- p10: `I`→`|` · `I`→`|` · `I`→`|`
- p11: `I`→`|` · `I`→`|` · `I`→`|` · `I`→`|`
- p12: `Azamazi.`→`---_` · `am`→`lam` · `I`→`|` · DEL`I`
- INS(제외분): p01: `SS` `7` `SESs==s` `al` / p02: `What` `is` `wrong,` `doctor?` `|` `don't` `know.` `We` `must` `do` `some` `special` `tests` `to` `find` `out.` / p03: `J` `We` `think` `Zanele` `has` `got` `TB` `in` `her` `spine.` `It` `has` `attacked` `her` `nerves.` `|` `am` `very` `sorry,` `but` `she` `will` `be` `in` `a` `wheelchair` `for` `the` `rest` `of` `her` `life.` `yy` `/` `[|` `E` `-f` / p04: `Zanele,` `how` `far` `can` `you` `throw` `this` `javelin?` `ano` `|` `of` `ad` `ml` `a.` `oo` `|` `'ok` `ae` `Ww` `oo` `oP` `(¢` `~h` `°` `ay` `we` `\\` `71` `/` `¥` `We` `a` `1` / p05: `UW` `he` `te` `[°°` `00` `0` `Fc` `OoO9` `0000` `OFC` `eo` `oO]` `nia.` `Yoo0o0°79000` `0000000000]` `LH` `Ara` `@e` `[°°` `00` `090000` `00` `0` `0007` / p06: `Well` `done,` `Zanele` `-` `you` `are` `really` `improving!` `ys` `a%` `sports,` `so` `|` `trained` `very` `hard.` / p08: `world` `compete` `for` `gold,` `silver` `and` `bronze` `medals.` / p09: `ee` `Yo` `boo` `|` `«alt` `SO` `.` `.` `\` `excited!` / p10: `Feo` `Ae` `ear` / p12: `-_` `AZamazi.`

## STEP 2 — 이미지 규격 비교 (본문 1장 = svc01, 39권 전수)

- 버킷판: `book-images/book_dash-{source_id}/01.jpg` public GET(읽기 전용 — upload/delete 0건).
- WP판: 해상도는 OCR 산출물의 실측(image_width/height), 크기는 임시 파일 실측.
- **WP판 해상도가 버킷판보다 낮은 책: 0권** — 39권 전부 WP판이 더 크다
  (버킷 553~1,575px 폭 vs WP 1,512~4,725px 폭).
- 단, **종횡비가 다른 책 20권**: 버킷판 ~1:1(정사각 단면, 예 567×567)인데 WP판은 39권 전부
  ~2:1(스프레드) — a-dancers-tale·a-fish-and-a-gift·a-house-for-mouse·karabos-question·
  lara-the-yellow-ladybird(0.975)·little-ants-big-plan·maddy-moona·miss-helens-magical-world·
  queen-of-soweto·sima-and-siza·sindi-and-the-moon·singing-the-truth·sizwes-smile·
  sleepy-mr-sloth(1.003)·thatos-birthday-surprise·there-must-be-a-rainbow·together-were-strong·
  whose-button-is-this·why-is-nita-upside-down·walking-together(0.995).
  교체 시 이 20권은 화면에 나가는 그림의 구도(잘림 범위)가 달라진다(사실 — 품질 평가는 안 함).
- 나머지 19권은 양판 모두 ~2:1로 종횡비 동일.

### 규격 비교표 (39권 전수)

| slug | 버킷(무텍스트) | KB | WP(인쇄) | KB | 버킷 비율 | WP 비율 |
|---|---|---|---|---|---|---|
| a-beautiful-day | 1134x567 | 116 | 4724x2362 | 1219 | 2.0 | 2.0 |
| a-dancers-tale | 567x567 | 39 | 4724x2362 | 1941 | 1.0 | 2.0 |
| a-fish-and-a-gift | 567x567 | 36 | 4725x2363 | 771 | 1.0 | 2.0 |
| a-house-for-mouse | 567x567 | 33 | 4725x2363 | 814 | 1.0 | 2.0 |
| a-tiny-seed | 1134x567 | 48 | 3937x1969 | 1778 | 2.0 | 1.999 |
| amazing-daisy | 1134x567 | 62 | 1575x788 | 132 | 2.0 | 1.999 |
| bathtub-safari | 1575x788 | 131 | 1575x788 | 129 | 1.999 | 1.999 |
| come-back-cat | 1134x567 | 66 | 4725x2363 | 3508 | 2.0 | 2.0 |
| gracas-dream | 1134x567 | 91 | 1575x788 | 220 | 2.0 | 1.999 |
| grandpas-gold | 1134x567 | 59 | 1575x788 | 75 | 2.0 | 1.999 |
| how-about-you | 1134x567 | 45 | 1575x788 | 108 | 2.0 | 1.999 |
| i-will-help-you | 1134x567 | 91 | 4724x2362 | 712 | 2.0 | 2.0 |
| is-there-anyone-like-me | 1134x567 | 46 | 4725x2363 | 1309 | 2.0 | 2.0 |
| karabos-question | 567x567 | 60 | 1512x756 | 73 | 1.0 | 2.0 |
| lara-the-yellow-ladybird | 553x567 | 105 | 1575x788 | 140 | 0.975 | 1.999 |
| little-ants-big-plan | 567x567 | 77 | 3150x1575 | 327 | 1.0 | 2.0 |
| londi-the-dreaming-girl | 1134x567 | 67 | 4724x2362 | 687 | 2.0 | 2.0 |
| lory-dory | 1134x567 | 61 | 1575x788 | 134 | 2.0 | 1.999 |
| maddy-moona | 567x567 | 108 | 4725x2363 | 1253 | 1.0 | 2.0 |
| miss-helens-magical-world | 567x567 | 61 | 4725x2363 | 1916 | 1.0 | 2.0 |
| queen-of-soweto | 567x567 | 64 | 4725x2363 | 1167 | 1.0 | 2.0 |
| rafikis-style | 1134x567 | 83 | 1575x788 | 96 | 2.0 | 1.999 |
| sbus-special-shoes | 1134x567 | 31 | 1575x788 | 42 | 2.0 | 1.999 |
| searching-for-the-spirit-of-spring | 1134x567 | 60 | 1575x788 | 83 | 2.0 | 1.999 |
| sima-and-siza | 567x567 | 49 | 1575x788 | 77 | 1.0 | 1.999 |
| sindi-and-the-moon | 567x567 | 69 | 3150x1575 | 273 | 1.0 | 2.0 |
| sindiwe-and-the-fireflies | 1134x567 | 45 | 1575x788 | 124 | 2.0 | 1.999 |
| singing-the-truth | 567x567 | 37 | 4725x2363 | 734 | 1.0 | 2.0 |
| sizwes-smile | 567x567 | 26 | 2205x1102 | 128 | 1.0 | 2.001 |
| sleepy-mr-sloth | 1024x1021 | 139 | 4725x2363 | 680 | 1.003 | 2.0 |
| thatos-birthday-surprise | 567x567 | 59 | 1575x788 | 83 | 1.0 | 1.999 |
| there-must-be-a-rainbow | 567x567 | 122 | 1575x788 | 77 | 1.0 | 1.999 |
| together-were-strong | 567x567 | 118 | 4725x2363 | 1567 | 1.0 | 2.0 |
| tortoise-finds-his-home | 1134x567 | 49 | 4725x2363 | 1666 | 2.0 | 2.0 |
| walking-together | 564x567 | 65 | 1512x756 | 49 | 0.995 | 2.0 |
| what-if | 1134x567 | 47 | 1575x788 | 57 | 2.0 | 1.999 |
| whose-button-is-this | 567x567 | 30 | 3150x1575 | 206 | 1.0 | 2.0 |
| why-is-nita-upside-down | 567x567 | 115 | 1575x788 | 83 | 1.0 | 1.999 |
| zanele-situ-my-story | 1134x567 | 54 | 4725x2363 | 828 | 2.0 | 2.0 |

## STEP 3 — it-wasnt-me 처리 근거 (팀장 결정 J1: 비활성화 안 함, near-wordless)

- 페이지별 재확인(`out/it-wasnt-me.ocr.json`): **p03 "Oh, no!"(conf 94.7/96.7) ·
  p08 "Hiss!"(conf 95.6)** 2건만 존재. 나머지 11면(p01·02·04~07·09~12·14)은 **word 0건 완전
  공백**(OCR 검출 자체 없음).
- Wordless 16권(WP term 643)과의 차이(사실):
  - 태그: it-wasnt-me = **English(621)**·영어 모집단 206 포함 / Wordless 16권 = 643, 206 밖.
  - 텍스트: it-wasnt-me = 인쇄 감탄사 2건 실측 / Wordless 16권은 미실측(그중 v1 소속
    springloaded는 GH alt 텍스트 12면 JSON 보유, i-can-dress-myself는 JSON 없음).
  - DB: it-wasnt-me = v1 존재(source_id 9c9ffed4-…)·blacklist 15 포함. Wordless 16 중
    DB 존재는 v1 소속 2권뿐(v2 수집 필터 languages=621이 구조적으로 배제).
  - 오디오: it-wasnt-me는 has_audio=true 44권 반영 SQL(`scratchpad/step8_book_audio_insert.sql`)에
    **미포함**(DB 현재값은 미조회 — 팀장 확인 사안).
- ADR-0035 Amd#1 **A4 원문**: "**empty 면은 오디오가 없는 것이 정상이다** — 뷰어는 이를 로딩
  실패로 처리하지 말 것." + 면 3종(body/alt/empty) taxonomy.
  - **판정: 적용 가능** — it-wasnt-me는 body 2면(감탄사, J1에 따라 TTS 대상) + empty 11면으로
    A4 모델에 그대로 들어맞고, empty 면 무오디오 규약도 그대로 성립한다.
  - 부족한 지점 1건(사실 지적): A4의 empty/body 판정은 **GH HTML 추출 결과**를 근거로
    설계되었는데, 이 책의 body 2면은 GH 추출로는 잡히지 않고 **OCR+검수로만 확보**된다.
    "판정 소스가 OCR 검수 확정본으로 바뀌는 경우"의 규정은 A4에 없다(ADR-0039 트랙에서
    보완 대상).

## STEP 4 — .gitignore 예외 및 용량 추정

- 원문 인용(`.gitignore:7`, "# Next.js build output" 블록): `out/`
- 추가한 예외(기존 규칙 유지):
  ```
  !scripts/ocr_pilot/out/
  !scripts/ocr_pilot/out/**
  ```
- 실효 검증: `git check-ignore -v`가 신규 파일에 대해 `.gitignore:13:!scripts/ocr_pilot/out/**`
  (부정 패턴)을 매치하고, `git status`에서 신규 `.ocr.json`이 `??`(비무시·미추적)로 표시됨을
  확인. 기추적 파일도 무시 아님(exit 1).
- 용량 추정: 현 산출 45권 = 2,043KB(책당 평균 45.4KB).
  - 지시서 공식(파일럿 7건 188KB × 154/7) ≈ **4.1MB**
  - 45권 실측 평균 기준 154권 ≈ **7.0MB**
  - 수 MB 규모 — git 저장소에 부적절한 규모는 아니다(사실만 기록, 대안 결정 없음).

## 오케스트레이터 판단 요청 사항

1. **판정 도구의 분해능 한계**: 본 게이트의 SAME/DIFF는 "OCR 오독"과 "실제 문구 차이"를
   기계적으로 구분하지 못한다. DIFF 38권 중 상위 15권은 정확도 95% 이상으로 불일치가
   오독형 패턴에 집중되는 반면, 하위 8권(<80%)은 통누락·어순 뒤섞임이 동반된다.
   "오디오·marks 재사용 가능" 판단을 이 표만으로 내릴지, 상위권부터 육안 표본 확인을
   거칠지 결정 필요.
2. **zanele-situ-my-story의 말풍선 텍스트**: 정답(GH 추출) 텍스트에 없는 인쇄 문장이 WP판에
   실재한다. WP 통일(E3-가) 시 이 책은 "화면 인쇄 텍스트 ⊃ 오디오 낭독 텍스트"가 된다 —
   C안 하이라이트 대상 범위 결정 필요.
3. **종횡비 변경 20권**(STEP 2): WP 교체 시 그림 구도가 정사각→스프레드로 바뀐다.
   품질 판단(팀장 육안)을 거칠지, 교체 대상에서 구분 취급할지.
4. **매핑 규칙 확장분의 정본화**: 신규 패턴 4종+중복 접미사 규칙이 현재 임시 드라이버에만
   있다. `scripts/ocr_pilot/run_pilot.py`(커밋본)에 반영할지, 별도 모듈로 정리할지 —
   코드 변경이므로 별도 지시 대기.
5. **how-about-you 등 하위 8권**: 전권 확대(154권) 시 같은 유형(장식 서체·말풍선·비정형
   배치)의 저품질 초벌이 재현될 것으로 보이는 표본이다. 검수 도구 요구사항의
   "재타이핑 큐"(intent 문서 §4) 우선순위 판단 재료.

*문서 끝.*
