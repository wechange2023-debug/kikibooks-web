# 뷰어 아키텍처 결정 근거 (2026-07-09)

> 읽기 전용 정찰: DB 쓰기 0 · Storage 쓰기/삭제 0 · sync/업로드/TTS 스크립트 실행 0 (카나리아 무접촉).
> 문서 원문 확인 + 데이터 실존 확인만 수행. ADR 작성·설계 확정은 다음 지시서 범위.

## 팀장 결정 D1~D4 (원문 그대로 전재)

- (D1) Book Dash 이미지에 텍스트가 인쇄되어 있어도 무방하다.
- (D2) TTS와 자막 하이라이트는 이미지와 별개로 진행한다.
- (D3) 이미지에 인쇄된 텍스트 "위에" 하이라이트를 줄 수 있는지 확인하고, 가능한 방향으로 간다.
- (D4) 서비스 도서는 품질 선별로 소량이다. 작업량이 늘어도 자체 뷰어로 최상 품질을 낸다.

---

## STEP 1 — 문서 정본 확인

### 1-1. ADR-0035 (전문 정독, 96행)

**(a) 텍스트 렌더 위치 = 미규정.**
- D2(`0035:38`): 면 구성을 "이미지 1장 + 본문 텍스트 + 오디오(pNN) + marks"로 **나열**만 하고,
  텍스트를 이미지 위에 겹칠지 별도 패널/영역에 둘지는 어디에도 없음.
- D4(`0035:53`): "텍스트를 **char-offset으로 분해해 `<span>`으로 렌더**하고, marks의 `time` →
  해당 span에 하이라이트를 입힌다." — 렌더 **방식**(span)만 규정, **배치**는 미규정.

**(b) 하이라이트 대상 = "우리가 그린 텍스트"로 규정됨.**
- D4(`0035:52`): "'오디오/marks 생성에 사용한 바로 그 텍스트'를 뷰어 렌더의 **단일 진실원**으로
  삼는다. marks를 만든 텍스트와 화면에 그리는 텍스트를 **동일 문자열**로 맞춘다."
- "이미지 속 텍스트"에 하이라이트를 준다는 언급은 **0건**.

**(c) 이미지의 텍스트 유무 전제 = 부분 존재.**
- §5 차이(b)(`0035:95`): "신간은 **'텍스트가 이미지에 인쇄'**(텍스트 레이어 없음) 가정,
  **기존 54권 코호트 중 텍스트 있는 44권은 `<p>` 본문 텍스트 실재**".
- 즉 신간(0027 코호트)=baked-in **가정 명시**, 기존 코호트의 **이미지 자체**가 무텍스트인지는
  명시 없음 → 본 정찰 STEP 3가 39권 전수 실측으로 보강(전권 무텍스트).

**(d) pNN-gap 가정 = 있음, 이미 정정 예고된 상태.**
- D2(`0035:41`): "pNN은 **장면 번호를 그대로 따르는 gap 방식**(텍스트 없는 면에서 번호가 비고
  재번호하지 않음. 예: p4·p12 없음)" + "이미지 12면 ≥ 텍스트 10면 = 오디오 10개".
- 어긋나는 지점(ADR-0036 §5-1, `0036:98` 원문): "**pNN gap ≠ 진짜 빈 면**: 현 배치의 오디오 pNN gap은
  **추출 버전 drift 산물**로, a-beautiful-day(page 4·12)·a-house-for-mouse(page 10) **2권만 잔존**…
  **진짜 '그림만 면'(본문·alt 모두 없음)은 무텍스트 5권뿐**… ADR-0035 D2/D4의 '빈 면 = gap' 전제는
  뷰어 구현 시 이 사실로 정정 필요".
- 또한 D2는 면을 **2종**(그림+텍스트 / 그림만)으로 모델링하나, 실제 taxonomy는 **3종**(body/alt/empty,
  `0036:99`)이고 alt-only 8권의 처리(낭독·형광펜 대상 여부)가 **뷰어 트랙 안건으로 미결**.

### 1-2. ADR-0027 / ADR-0036의 이미지 텍스트 유무 언급

- ADR-0027(`0027:49`): "Book Dash 면은 **텍스트가 이미지에 인쇄된 그림책**이므로 별도 텍스트 레이어
  불필요. `AsbReader`는 `text=null` 이미지-only 면을 이미 정상 처리 … → 렌더 컴포넌트 무변경."
  (v2 신간 코호트 관점 — WP/CloudFront 이미지에 대한 서술.)
- ADR-0036: 이미지 자체의 텍스트 유무 언급 **없음**. 관련 문장은 면 taxonomy(`0036:98-99`)와
  "무텍스트 면 이미지도 포함 복사"(`0036:58`), "무텍스트책 5권"(`0036:121`)뿐 — 모두 **HTML 텍스트
  층** 기준이지 이미지 픽셀의 텍스트 여부가 아님.

### 1-3. "소량 큐레이션"(D4) 기록 여부

- **기록 있음**: ADR-0035 §1(`0035:22`) "서비스 대상은 **사람이 선별한 소수 정예** book_dash 도서로
  한정한다" + §3(`0035:69`) "서비스가 **소수 정예**이므로 총량 감당 가능. 대상 도서 목록은 사람이
  선별(별도 트랙)".
- 단 **선별 기준("품질")과 도서 목록 자체는 미기록** — §3 미해결 4 "선별 도서 목록 확정(별도 트랙)"이
  미결 상태 그대로. (ADR-0026의 "선별"은 ASb 코호트 품질 필터로 book_dash와 별개.)

### 1-4. PLAN.md의 뷰어 기술 (grep으로 해당 라인만 확인 — 전체 로드 금지 규약 준수)

- `PLAN.md` 레포 루트에 존재(42,174B). 뷰어 기술 원문:
  - `:225-227` "HTML → iframe 임베드 / ePub → epub.js / H5P → h5p-standalone"
  - `:260` "| 책 뷰어 | **epub.js + iframe + h5p-standalone** | HTML(Book Dash) → iframe, …"
  - `:482` "content_type === 'html' → HtmlReader (iframe + sandbox)"
- → **오케스트레이터 전제와 일치**(iframe/epub.js/h5p-standalone). 단 이는 ADR-0035(자체 뷰어 전환,
  Accepted)와 **괴리** — PLAN.md는 book_dash=iframe 시절 기술을 유지 중.

---

## STEP 2 — 좌표·타이밍 데이터 실존

### 2-1. `out/{slug}.json` 스키마 = 3키뿐, 렌더링 정보 없음

키: `page`(int) · `image_url`(str) · `text`(str). 좌표·bbox·x/y·폰트 크기 **일절 없음**.
a-tiny-seed.json 전문(12항목):

```json
[
  {"page": 1,  "image_url": ".../a-tiny-seed/en/images/01.jpg", "text": "In a village on the slopes of Mount Kenya in East Africa, a little girl worked in the fields with her mother. Her name was Wangari."},
  {"page": 2,  "image_url": ".../images/02.jpg", "text": "Wangari loved being outside. In her family’s food garden she broke up the soil with her machete. She pressed tiny seeds into the warm earth."},
  {"page": 3,  "image_url": ".../images/03.jpg", "text": "Her favourite time of day was just after sunset. When it got too dark to see the plants, Wangari knew it was time to go home.\nShe would follow the narrow paths through the fields, crossing rivers as she went."},
  {"page": 4,  "image_url": ".../images/04.jpg", "text": "Wangari was a clever child and couldn’t wait to go to school. But her mother and father wanted her to stay and help them at home.\nWhen she was seven years old, her big brother persuaded her parents to let her go to school."},
  {"page": 5,  "image_url": ".../images/05.jpg", "text": "She liked to learn!\nWangari learnt more and more with every book she read.\nShe did so well at school that she was invited to study in the United States of America.\nWangari was excited! She wanted to know more about the world."},
  {"page": 6,  "image_url": ".../images/06.jpg", "text": "At the American university Wangari learnt many new things. She studied plants and how they grow. And she remembered how she grew: playing games with her brothers in the shade of the trees in the beautiful Kenyan forests."},
  {"page": 7,  "image_url": ".../images/07.jpg", "text": "The more she learnt, the more she realised that she loved the people of Kenya. She wanted them to be happy and free. The more she learnt, the more she remembered her African home."},
  {"page": 8,  "image_url": ".../images/08.jpg", "text": "When she had finished her studies, she returned to Kenya. But her country had changed. Huge farms stretched across the land.\nWomen had no wood to make cooking fires. The people were poor and the children were hungry."},
  {"page": 9,  "image_url": ".../images/09.jpg", "text": "Wangari knew what to do. She taught the women how to plant trees from seeds.\nThe women sold the trees and used the money to look after their families.\nThe women were very happy. Wangari had helped them to feel powerful and strong."},
  {"page": 10, "image_url": ".../images/10.jpg", "text": "As time passed, the new trees grew into forests, and the rivers started flowing again. Wangari’s message spread across Africa.\nToday, millions of trees have grown from Wangari’s seeds."},
  {"page": 11, "image_url": ".../images/11.jpg", "text": "Wangari had worked hard. People all over the world took notice, and gave her a famous prize. It is called the Nobel Peace Prize, and she was the first African woman ever to receive it."},
  {"page": 12, "image_url": ".../images/12.jpg", "text": "Wangari died in 2011, but we can think of her every time we see a beautiful tree."}
]
```
(image_url 앞부분 `https://bookdash.github.io/bookdash-books/a-tiny-seed/en` 은 지면상 축약. 원문은 절대 URL.)

### 2-2. 원천 = 좌표 없는 플로우 HTML + 래스터 JPEG → 좌표 원천 없음 (케이스 (c))

- `extract_text.py`가 읽는 원본 = GH Pages **HTML**: `<div id="wrapper">` 내 `<p><img …></p>`(장면 경계)
  + `<p>텍스트</p>` 플로우(`extract_text.py:52-55` 정규식, `:99-145` 파싱; ADR-0035 `0035:24`).
  텍스트 노드에 좌표를 부여하는 CSS 절대배치·SVG 구조 **없음**(플레인 플로우 마크업).
- 이미지 = **JPEG 래스터**(GH Pages·WP·버킷 모두) — 선택 가능한 텍스트 레이어 없음.
- 파이프라인에 PDF/SVG 원본 **없음**.
- → **단어별 좌표(bounding box)의 원천이 존재하지 않는다.** (좌표 생성 방법 제안은 지시서에 따라 생략.)

### 2-3. word-level timing = 존재

- 경로: `scripts/tts_pilot/out/audio/{slug}_p{N}[_{voice}_r{RR}].marks.json` (mp3와 1:1).
- 샘플(`a-tiny-seed_p1_Ruth_r78.marks.json` 앞 3행):
  ```json
  {"time": 137, "type": "word", "start": 0, "end": 2, "value": "In"}
  {"time": 281, "type": "word", "start": 3, "end": 4, "value": "a"}
  {"time": 362, "type": "word", "start": 5, "end": 12, "value": "village"}
  ```
- `time` = 단어 **시작** 시각(ms), `start/end` = **문자 offset**. 단어별 **종료 시각 필드는 없음**
  (다음 마크의 time이 사실상 종료 경계 — Polly word mark 사양).

### 2-4. 판정: **C-PART**

word timing **존재**(marks 전량 보유) ∧ 단어별 **좌표 원천 부재**(2-2).
→ "이미지에 인쇄된 텍스트 위" 단어 하이라이트는 현존 자산만으로는 불가.
(별도 텍스트(우리가 그린 span)에 대한 하이라이트는 D4 원안대로 성립 — 좌표 불필요.)

---

## STEP 3 — 버킷 전권 텍스트 유무 (전수, 표본 아님)

### 3-1. list 결과

`book-images` 버킷 `book_dash-*` 프리픽스 **49개** =
- **본문 보유 39권**: 38권 × 13객체(01–12.jpg + cover.jpg) + 1권 × 14객체(whose-button-is-this,
  01–13.jpg + cover — 13페이지 책) = **508객체** (ADR-0036 Amd#1 "508객체" 기록과 일치).
- **cover.jpg 1개뿐인 폴더 10개** — UUID 대조 결과 = 결손 15권 중 **"표지만 존재" 10권**과 정확히
  일치(mrs-penguins-palace·what-is-it·the-elephant-in-the-room·shongololos-shoes·springloaded·
  when-i-grow-up·who-is-our-friend·hippo-wants-to-dance·little-sock·the-best-thing-ever).
  ADR-0036에 이 잔존물 언급 없음(신규 관찰).

### 3-2·3-3. 판정 방법

책당 본문 1장(전권 05.jpg) download → 재현 가능 지표: 폭 1000 그레이스케일에서
**강한 수평 에지(|Δx|>90) 밀도**(전체 + 20행 슬라이딩 윈도 최대) + 어두운 픽셀 비율.
baked-in 양성 대조군이 버킷에 없어 절대 임계는 설정 불가 → **지표 상위 3권을 육안 교차 검증**:
londi-the-dreaming-girl(0.0450)·why-is-nita-upside-down(0.0438)·miss-helens-magical-world(0.0376)
— 3권 모두 에지 원인은 **선화(잉크 라인)**이며 본문 텍스트 0(miss-helens는 삽화 속 칠판 소품
"1+1=2"뿐 — 본문 아님). 상위가 무텍스트이므로 그 이하 전권 동일 판정.

### 3-4. 결과표 (edge_win = 20행 윈도 에지 밀도 최대값, 내림차순)

| slug | 객체 수 | 텍스트 | 근거(edge_win) |
|---|---:|---|---|
| londi-the-dreaming-girl | 13 | N | 0.0450 + 육안 |
| why-is-nita-upside-down | 13 | N | 0.0438 + 육안 |
| miss-helens-magical-world | 13 | N | 0.0376 + 육안 |
| a-beautiful-day | 13 | N | 0.0333 |
| karabos-question | 13 | N | 0.0327 |
| amazing-daisy | 13 | N | 0.0290 |
| a-fish-and-a-gift | 13 | N | 0.0249 |
| grandpas-gold | 13 | N | 0.0233 |
| i-will-help-you | 13 | N | 0.0216 |
| queen-of-soweto | 13 | N | 0.0181 |
| sindiwe-and-the-fireflies | 13 | N | 0.0164 |
| rafikis-style | 13 | N | 0.0162 |
| sleepy-mr-sloth | 13 | N | 0.0154 |
| whose-button-is-this | **14** | N | 0.0144 |
| gracas-dream | 13 | N | 0.0143 |
| zanele-situ-my-story | 13 | N | 0.0130 |
| thatos-birthday-surprise | 13 | N | 0.0103 |
| what-if | 13 | N | 0.0100 |
| there-must-be-a-rainbow | 13 | N | 0.0084 |
| tortoise-finds-his-home | 13 | N | 0.0066 |
| singing-the-truth | 13 | N | 0.0046 |
| searching-for-the-spirit-of-spring | 13 | N | 0.0043 |
| sindi-and-the-moon | 13 | N | 0.0043 |
| little-ants-big-plan | 13 | N | 0.0035 |
| sizwes-smile | 13 | N | 0.0034 |
| is-there-anyone-like-me | 13 | N | 0.0032 |
| bathtub-safari | 13 | N | 0.0029 |
| sima-and-siza | 13 | N | 0.0028 |
| lara-the-yellow-ladybird | 13 | N | 0.0024 |
| lory-dory | 13 | N | 0.0022 |
| a-dancers-tale | 13 | N | 0.0020 |
| maddy-moona | 13 | N | 0.0013 |
| a-house-for-mouse | 13 | N | 0.0004 |
| together-were-strong | 13 | N | 0.0003 |
| sbus-special-shoes | 13 | N | 0.0003 |
| a-tiny-seed | 13 | N | 0.0002 |
| walking-together | 13 | N | 0.0000 |
| come-back-cat | 13 | N | 0.0000 |
| how-about-you | 13 | N | 0.0000 |

**무텍스트 39권 / baked-in 0권 / 애매 0권 / 총 39권** (본문 보유 39권 기준. cover-only 10폴더는 본문 판정 대상 아님)

### 3-5. 임시 파일 삭제

step3_scan/ 39파일 삭제 완료(Test-Path → False 확인).

---

## 문서 갱신이 필요한 항목 목록 (사실만)

1. ADR-0035 D2/D4의 "빈 면 = pNN gap" 전제 — ADR-0036 §5-1(`0036:98`)이 정정 예고(추출 drift 산물,
   잔존 2권뿐; 진짜 그림만 면 = 무텍스트 5권). 뷰어 트랙에서 이행 미완.
2. ADR-0035 D2의 면 2종 모델 — 실제 taxonomy 3종(body/alt/empty, `0036:99`) + alt-only 8권 처리 미결.
3. ADR-0035 `0035:27` "source_platform·source_id 미전달" — 부정확(0036 §5-3: 미전달은 has_audio뿐).
4. PLAN.md `:225-227`·`:260`·`:482` — book_dash=iframe 기술이 ADR-0035(자체 뷰어 Accepted)와 괴리.
5. "품질 선별" 기준·도서 목록 미기록(ADR-0035 §3 미해결 4 그대로).
6. book-images 버킷의 cover-only 10폴더(결손 10권 잔존물) — ADR-0036에 미기록.
7. (기존 요청 유지) ADR-0027 Amd#3 "WP 부재: springloaded·i-can-dress-myself" → "languages=643으로 필터 밖" 정정.

## 오케스트레이터 판단 요청 사항

1. **[D3 실현성]** 판정 C-PART: 단어별 좌표 원천이 없어 "이미지 속 텍스트 위" 단어 하이라이트는
   현존 자산으로 불가. 단 **버킷 39권은 전권 무텍스트 실측** → 이 코호트에서는 D3의 전제(이미지에
   인쇄된 텍스트) 자체가 없고, ADR-0035 D4 원안(우리가 그린 span 하이라이트)이 그대로 성립.
   baked-in 상황은 **WP 재확보 15권에서만** 발생 — D3 질문의 실효 범위를 15권으로 한정할지 결정 요청.
2. **[15권 방향]** (i) WP 이미지 + 별도 span 텍스트(이미지 속 텍스트와 이중 표시 감수)
   (ii) 15권은 하이라이트 없이 이미지+오디오만 (iii) 보류 — 택일 요청.
3. **[cover-only 10폴더]** 잔존물 처분(유지/삭제). 삭제는 Storage 쓰기라 별도 승인 필요.
