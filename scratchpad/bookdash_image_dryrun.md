# book_dash html 54권 — 이미지 전권 드라이런 (읽기 전용)

> 2026-07-08 · 원본 GH Pages HTML **54권 GET**(이미지 미다운로드) · 면별 **body/alt/empty** 분류 ·
> 배치 오디오 매니페스트(`scripts/tts_pilot/out/*_Ruth_r78.tts.json`, audio=null) 대조 · 표지=`scratchpad/step3_manifest.csv`(DB cover_url).

> 면 종류 정의 — **body**: `<p>` 본문 텍스트 있음(형광펜·오디오 대상). **alt-only**: 본문 없음·`<img alt>`만 있음(extract_text alt-fallback이 채움). **empty**: 본문·alt 모두 없음(진짜 그림만 면).

## 요약 (실측)

- **대상 54권** = tts_recon_49.csv 49 + 완료 5(step3_manifest UUID). **조회 실패 0**.
- **이미지 명명 = 54/54 전권 동일**: `images/NN.jpg` · **2자리 zero-pad · 1-based · 연속(gap 없음)** · 확장자 **.jpg** · 첫 이미지 **`01.jpg`(본문 page1, 표지 아님)**.
- **이미지 개수**: 12장 **52권** / 13장 **2권**(who-is-our-friend · whose-button-is-this). 그 외 편차 없음.
- **표지 = 54/54 전권 별도 `images/cover.jpg`** (본문 `01.jpg`과 구분). GH Pages 리딩 HTML(`/en/`) `<img>`엔 **미노출** — DB `cover_url`·`book-covers` 버킷에만 존재(step3_manifest 54/54가 `images/cover.jpg`).
- **면 종류는 body/alt/empty 3종 — 표본 1권(a-beautiful-day)보다 복잡**:
  - **empty(진짜 그림만 면)**: **무텍스트 5권**(hugs-in-the-city·i-can-dress-myself·it-wasnt-me·katiitis-song·the-lion-who-wouldnt-try)의 **전 면**뿐. 그 외 49권엔 empty 면 **0개**.
  - **alt-only 면**(본문 없음·alt만): **8권** — bathtub-safari(12면), come-back-cat(5·12면), hippo-wants-to-dance(12면), shongololos-shoes(12면), **springloaded(1~12면 전부)**, why-is-nita-upside-down(5면), a-beautiful-day(4·12면), a-house-for-mouse(10면). 특히 **springloaded는 12면 전부 alt-only**(본문 0, 무텍스트책 아님).
- **⚠️ 오디오 pNN gap ≠ 진짜 빈 면 (핵심 발견)**:
  - 현 배치 매니페스트 오디오 gap: **a-beautiful-day(page 4·12), a-house-for-mouse(page 10)** + 무텍스트 5권(오디오 0).
  - 그런데 이 gap 면들은 **지금 재추출하면 alt로 채워진다**(위 2권의 gap 위치 = 현 alt-only 위치와 동일). 즉 a-beautiful-day(4·12)·a-house-for-mouse(10)의 gap은 **추출 버전 drift 산물**(이 2권은 alt-fallback 도입 **전** 배치됨). come-back-cat(5·12)·bathtub-safari(12) 등 뒤에 배치된 책의 alt 면은 오디오가 **생성됨**.
  - ⇒ **pNN gap 집합은 불안정**(추출 시점 의존). 자체 뷰어가 재추출·재배치하면 텍스트책 gap은 **무텍스트 5권 외 소멸** 가능. 단 alt 텍스트를 낭독·형광펜 대상으로 삼을지는 **콘텐츠 판단 필요**(alt=이미지 설명이지 본문 아님).
- **오디오 pNN ↔ 이미지 NN 정합**: 이미지 stem NN = 면 page N(1-based) = 오디오 index+1(0-based `p{N-1:02d}`). 표본 대조 일치(01.jpg↔page1↔p00).
- **source_id = 54/54 UUID(`9c9e…`)**. 이형 3권도 CSV·cover 매니페스트상 **UUID**(판정 §하단).

## 54권 표

| # | 책(slug) | 이미지수 | 명명 | body면 | alt-only면(위치) | empty면 | 현배치 오디오gap | 표지 | source_id | 이상 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | amazing-daisy | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e7b9a(UUID) | 표준 |
| 2 | bathtub-safari | 12 | 표준 | 11 | [12] | – | 없음 | cover.jpg별도 | 9c9e86da(UUID) | alt-only 1면 |
| 3 | come-back-cat | 12 | 표준 | 10 | [5, 12] | – | 없음 | cover.jpg별도 | 9c9e7820(UUID) | alt-only 2면 |
| 4 | gracas-dream | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e71cc(UUID) | 표준 |
| 5 | grandpas-gold | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e6524(UUID) | 표준 |
| 6 | hippo-wants-to-dance | 12 | 표준 | 11 | [12] | – | 없음 | cover.jpg별도 | 9c9f4976(UUID) | alt-only 1면 |
| 7 | how-about-you | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e819e(UUID) | 표준 |
| 8 | hugs-in-the-city | 12 | 표준 | 0 | – | 전면 | 오디오없음 | cover.jpg별도 | 9c9eb574(UUID) | 무텍스트책 |
| 9 | i-can-dress-myself | 12 | 표준 | 0 | – | 전면 | 오디오없음 | cover.jpg별도 | 9c9eb452(UUID) | 무텍스트책 |
| 10 | i-will-help-you | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e9396(UUID) | 표준 |
| 11 | is-there-anyone-like-me | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e8c0c(UUID) | 표준 |
| 12 | it-wasnt-me | 12 | 표준 | 0 | – | 전면 | 오디오없음 | cover.jpg별도 | 9c9ffed4(UUID) | 무텍스트책 |
| 13 | karabos-question | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e9e5e(UUID) | 표준 |
| 14 | katiitis-song | 12 | 표준 | 0 | – | 전면 | 오디오없음 | cover.jpg별도 | 9c9fffba(UUID) | 무텍스트책 |
| 15 | lara-the-yellow-ladybird | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9f566e(UUID) | 표준 |
| 16 | little-ants-big-plan | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e55de(UUID) | 표준 |
| 17 | little-sock | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9f4da4(UUID) | source_id충돌 |
| 18 | londi-the-dreaming-girl | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e96ac(UUID) | 표준 |
| 19 | lory-dory | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e83b0(UUID) | 표준 |
| 20 | maddy-moona | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e7dca(UUID) | source_id충돌 |
| 21 | miss-helens-magical-world | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e6196(UUID) | 표준 |
| 22 | mrs-penguins-palace | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9eb7e0(UUID) | source_id충돌 |
| 23 | queen-of-soweto | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e640c(UUID) | 표준 |
| 24 | rafikis-style | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e6e52(UUID) | 표준 |
| 25 | sbus-special-shoes | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e9fc6(UUID) | 표준 |
| 26 | searching-for-the-spirit-of-spring | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e76ea(UUID) | 표준 |
| 27 | shongololos-shoes | 12 | 표준 | 11 | [12] | – | 없음 | cover.jpg별도 | 9c9f41f6(UUID) | alt-only 1면 |
| 28 | sima-and-siza | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9ea96c(UUID) | 표준 |
| 29 | sindi-and-the-moon | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9ea21e(UUID) | 표준 |
| 30 | sindiwe-and-the-fireflies | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e596c(UUID) | 표준 |
| 31 | singing-the-truth | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e62ea(UUID) | 표준 |
| 32 | sizwes-smile | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e87f2(UUID) | 표준 |
| 33 | sleepy-mr-sloth | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e7cb2(UUID) | 표준 |
| 34 | springloaded | 12 | 표준 | 0 | 전면 | – | 없음 | cover.jpg별도 | 9c9f450c(UUID) | alt-only 12면 |
| 35 | thatos-birthday-surprise | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9eb68c(UUID) | 표준 |
| 36 | the-best-thing-ever | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9f5790(UUID) | 표준 |
| 37 | the-elephant-in-the-room | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9ec05a(UUID) | 표준 |
| 38 | the-lion-who-wouldnt-try | 12 | 표준 | 0 | – | 전면 | 오디오없음 | cover.jpg별도 | 9ca00316(UUID) | 무텍스트책 |
| 39 | there-must-be-a-rainbow | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9ea48a(UUID) | 표준 |
| 40 | together-were-strong | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e663c(UUID) | 표준 |
| 41 | tortoise-finds-his-home | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e6f9c(UUID) | 표준 |
| 42 | walking-together | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e9102(UUID) | 표준 |
| 43 | what-if | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9f3292(UUID) | 표준 |
| 44 | what-is-it | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9ebdc6(UUID) | 표준 |
| 45 | when-i-grow-up | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9f471e(UUID) | 표준 |
| 46 | who-is-our-friend | 13 | 표준 | 13 | – | – | 없음 | cover.jpg별도 | 9c9f485e(UUID) | 13장 |
| 47 | whose-button-is-this | 13 | 표준 | 13 | – | – | 없음 | cover.jpg별도 | 9c9eb2cc(UUID) | 13장 |
| 48 | why-is-nita-upside-down | 12 | 표준 | 11 | [5] | – | 없음 | cover.jpg별도 | 9c9e5f48(UUID) | alt-only 1면 |
| 49 | zanele-situ-my-story | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e6d12(UUID) | 표준 |
| 50 | a-beautiful-day | 12 | 표준 | 10 | [4, 12] | – | [4, 12] | cover.jpg별도 | 9c9e94e0(UUID) | alt-only 2면; 배치gap(stale) |
| 51 | a-dancers-tale | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e8586(UUID) | 표준 |
| 52 | a-fish-and-a-gift | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e6754(UUID) | 표준 |
| 53 | a-house-for-mouse | 12 | 표준 | 11 | [10] | – | [10] | cover.jpg별도 | 9c9e72e4(UUID) | alt-only 1면; 배치gap(stale) |
| 54 | a-tiny-seed | 12 | 표준 | 12 | – | – | 없음 | cover.jpg별도 | 9c9e7a6e(UUID) | 표준 |

## 표본과 다른 패턴 발견 목록

1. **alt-only 면 존재(8권)** — 표본 a-beautiful-day는 빈면 2개를 '텍스트 없음'으로 봤으나, 실제로는 img `alt`가 있는 면(alt-fallback 대상)이다. body/alt/empty 3분류 필요.
2. **springloaded = 본문 0·alt 12** — 사실상 무텍스트 그림책인데 alt로 12면 전부 오디오가 생성돼 있음(텍스트책으로 분류됨). 형광펜 대상 본문이 없음.
3. **13장 책 2권**(who-is-our-friend·whose-button-is-this) — 나머지 52권은 12장.
4. **오디오 gap이 추출 버전에 따라 다름** — a-beautiful-day(4·12)·a-house-for-mouse(10)만 배치 gap 존재하고, 동일 성격의 alt 면을 가진 다른 책은 gap 없음(배치 시점 차이).

## 이형 3권 판정 (little-sock · maddy-moona · mrs-penguins-palace)

- **이미지·표지 관점: 이상 없음** — 3권 모두 12장·2d·연속·jpg·first=01, 표지 `images/cover.jpg` 별도. 다른 51권과 동일.
- **source_id 관점: 아티팩트 간 충돌** —
  - `tts_recon_49.csv`(팀장 `SELECT b.source_id FROM books` Q2 유래) + `step3_manifest.csv`(cover 마이그레이션 target_key) 모두 이 3권을 **UUID**로 표기: little-sock=`9c9f4da4…`, maddy-moona=`9c9e7dca…`, mrs-penguins-palace=`9c9eb7e0…`.
  - 반면 `scripts/tts_pilot/upload_audio.py:74-76`는 **'STEP 4d 실증: 이 3권만 DB books.source_id 가 full-slug'** 라고 명시(그래서 Storage 키는 CSV의 UUID를 대신 사용).
  - ⇒ **DB 라이브 값이 UUID인지 full-slug인지 아티팩트만으로 확정 불가**. 이미지 키를 (a)DB 자연키 source_id로 짤지 (b)오디오·커버처럼 메타 UUID로 짤지에 직결되는 문제.
  - **필요 조치(팀장 SQL, 읽기전용)**: `SELECT id, source_id FROM books WHERE id IN ('724aff4e-525a-424f-9c53-e8b946533f6e','0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c','ef15e04e-276e-43e2-9d0e-3e1baf4329bf');`
  - **실무 영향 완화**: 커버(`bookdash-{UUID}.webp`)·오디오(`book_dash-{UUID}`)가 이미 **메타 UUID**로 통일돼 있어, 이미지도 같은 UUID를 쓰면 Storage 키는 3권 모두 정합. 충돌은 **DB 자연키 JOIN 시에만** 문제.

## 남은 미해결 질문

1. **alt 텍스트 처리**: alt-only 면(8권, springloaded 전면 포함)의 alt를 (a)낭독+형광펜 본문으로 쓸지, (b)그림만 면으로 렌더(오디오·형광펜 없음)할지. alt는 이미지 설명이라 본문 낭독 적합성 = 콘텐츠 판단.
2. **오디오 재배치 여부**: a-beautiful-day·a-house-for-mouse gap을 alt로 채워 재생성할지, 현 gap 유지할지. pNN gap 불안정성 해소 방향 결정 필요.
3. **이미지 키 명명**: 원본 `01`(1-based·2d) vs 오디오 `p00`(0-based·2d) 중 이미지 키 체계 확정(§B 표본 노트의 미결 재확인). 이미지는 gap 없이 01~NN 연속이므로 오디오처럼 gap 반영 불요.
4. **표지 이미지 출처**: 자체 뷰어 표지를 기존 `book-covers`(`bookdash-{UUID}.webp`)에서 가져올지, 본문 이미지 창고에 `images/cover.jpg`를 별도 복사할지(중복 회피).
5. **이형 3권 DB source_id 확정**(위 SQL) — 이미지 키 자연키 정합의 전제.
6. **springloaded 등 무본문 alt책 취급**: 텍스트책으로 볼지, 무텍스트 그림책(그림만 렌더)으로 재분류할지.
