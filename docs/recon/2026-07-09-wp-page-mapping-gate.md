# WP↔서비스 페이지 대응 게이트 (2026-07-09)

> 목표: 결손 15권 WP 재확보 시 "어느 WP 파일이 서비스 몇 페이지인가"의 규칙 확정.
> 읽기 전용: DB 쓰기 0 · Storage 쓰기 0 · sync/업로드 스크립트 실행 0 (카나리아 실험 무접촉).
> 네트워크: STEP 1-3 GET 5건(HTML) + STEP 4 GET 13건(지시서 허용분). WP 목록은 재수집 없이
> 직전 드라이런 로그(세션 임시폴더 `wp_dryrun_15.log`, 이미지 URL 전량 기록) 재사용.

---

## STEP 1 — 15권 텍스트 자산 실존

### 1-1·1-2. `scripts/tts_pilot/out/{slug}.json` 실존 (로컬 실측)

| slug | 텍스트 | 총 페이지 | empty | mp3 |
|---|---|---:|---|---|
| hippo-wants-to-dance | YES | 12 | {} | p1–12 (12개) |
| little-sock | YES | 12 | {} | p1–12 |
| shongololos-shoes | YES | 12 | {} | p1–12 |
| springloaded | YES | 12 | {} | p1–12 |
| the-elephant-in-the-room | YES | 12 | {} | p1–12 |
| what-is-it | YES | 12 | {} | p1–12 |
| when-i-grow-up | YES | 12 | {} | p1–12 |
| who-is-our-friend | YES | **13** | {} | p1–13 (13개) |
| the-best-thing-ever | YES | 12 | {} | p1–12 |
| mrs-penguins-palace | YES | 12 | {} | p1–12 |
| the-lion-who-wouldnt-try | **텍스트없음** | — | — | 0 |
| i-can-dress-myself | **텍스트없음** | — | — | 0 |
| hugs-in-the-city | **텍스트없음** | — | — | 0 |
| katiitis-song | **텍스트없음** | — | — | 0 |
| it-wasnt-me | **텍스트없음** | — | — | 0 |

- **텍스트 보유 10/15** — 오디오 보유 10권과 **정확히 일치**(불일치 0건). empty 페이지 0건(10권 전부).
- ※ 유일한 13페이지 책 = who-is-our-friend.

### 1-3. 텍스트 없는 5권 — GH Pages HTML 구조 (책당 GET 1건, 추출 스크립트 미실행)

5권 전부: HTML 200 · `id="wrapper"` 존재 · `copyright-text` 블록 존재 ·
본문 이미지 참조 = `images/01.jpg`~`images/12.jpg` **정확히 12개** + `book-dash-logo.png` 1개.
→ extract_text.py가 기대하는 구조 그대로이며 **서비스 페이지 수(P=12)를 셀 수 있음**. 추출 가능 판정.

---

## STEP 2 — WP 파일명 규약 분류표

소스: 직전 세션 드라이런 로그의 이미지 URL 전량(15권 + 대조군, 각 책 추출 목록 전체 — HEAD 전부 200 확인 완료분).
분류 결과 모든 번호가 **단일 "PDF 페이지 번호" 공간**으로 수렴한다(근거는 각 규약 정의에 병기).

규약 정의:
- **R1** 소문자 `_page{n}`(en 계열, 예: `a-tiny-seed_en_20200616_page4.jpg`) → PDF번호 = n+1
- **R2** `_Page_{NN}`(zero-pad, 예: `springloaded_english_20160324_Page_05.jpg`; 끝의 `-k`는 WP 중복업로드 접미사로 무시) → PDF번호 = NN
- **R2b** lion형 `_{8자리날짜}-{n}.jpg`(Page 토큰 없음) → PDF번호 = n
- **R3** 번호 추출 불가
- **R4** 표지 후보: `_cover` 파일(본문 목록 내) / PDF Page_01 / featured_media(별도)

| slug | 총 | R1 | R2 | R2b | R3 (파일명) | PDF번호 집합 | R4 |
|---|---:|---:|---:|---:|---|---|---|
| the-lion-who-wouldnt-try | 14 | 0 | 0 | 14 | — | {1, 5–17} | PDF01 + featured `_cover` |
| i-can-dress-myself | 14 | 13 | 0 | 0 | — | {5–16, 18} | 본문 내 `_cover`(=featured) |
| hugs-in-the-city | 14 | 13 | 0 | 0 | — | {5–16, 18} | 본문 내 `_cover` / featured=Page_01 |
| katiitis-song | 15 | 0 | 15 | 0 | — | {1, 5–18} | PDF01(=featured) |
| hippo-wants-to-dance | 15 | 0 | 14 | 0 | **`hippo-dancing.jpg`** | {1, 5–16, 18} | PDF01-1(=featured) |
| it-wasnt-me | 14 | 0 | 14 | 0 | — | {1, 5–16, 18} | PDF01(=featured) |
| little-sock | 18 | 0 | 18 | 0 | — | {1–18} | PDF01(=featured) |
| shongololos-shoes | 14 | 0 | 14 | 0 | — | {1, 5–16, 18} | PDF01(=featured) |
| springloaded | 14 | 0 | 14 | 0 | — | {1, 5–16, 18} | PDF01(=featured) |
| the-elephant-in-the-room | 14 | 0 | 14 | 0 | — | {1, 5–16, 18} | PDF01(=featured) |
| what-is-it | 18 | 0 | 18 | 0 | — | {1–18} | PDF01(=featured) |
| when-i-grow-up | 18 | 0 | 18 | 0 | — | {1–18} | PDF01(=featured) |
| who-is-our-friend | 18 | **2** | 16 | 0 | — | {1–18} | PDF01(=featured) |
| the-best-thing-ever | 14 | 0 | 14 | 0 | — | {1, 5–16, 18} | PDF01-1(=featured) |
| mrs-penguins-palace | 14 | 13 | 0 | 0 | — | {5–16, 18} | 본문 내 `_cover`(=featured) |
| (대조군) a-tiny-seed | 14 | 13 | 0 | 0 | — | {5–16, 18} | 본문 내 `_cover` + featured 별도 |

- **R1·R2 공존 = who-is-our-friend 1권**: R1 2건(`_en_page6`, `_en_page8`) ↔ R2 결번(Page_07·Page_09 부재).
  n+1 변환 시 en_page6→PDF07, en_page8→PDF09로 **결번을 정확히 메움** → 같은 페이지의 중복이 아니라
  **서로 다른 페이지의 보완재**. (이 관측이 R1의 "+1" 오프셋의 1차 증거이며, STEP 4에서 재검증됨.)
- 동일 PDF번호에 2개 파일이 걸리는 충돌: **전 책 0건**.
- R3: `hippo-dancing.jpg` **1건**(전 15권 중 유일).

---

## STEP 3 — 매핑 규칙 (문장 기술)

**규칙**: WP 파일명에서 PDF 페이지 번호 N을 추출한다 — `_Page_{NN}`이면 N=NN(끝의 `-k`는 무시),
소문자 `_page{n}`이면 N=n+1, `_{8자리날짜}-{n}`(lion형)이면 N=n.
**단 5 ≤ N ≤ 4+P (P=서비스 페이지 수: 텍스트 JSON 항목 수, 없으면 GH HTML img 수)일 때
N은 서비스 페이지 M = N − 4에 대응한다.** N=1 또는 `_cover` 파일은 표지 후보,
N∈{2,3,4}(앞물)·N>4+P(뒷물)는 서비스 페이지에 대응하지 않는다(제외).
순서(index)는 일절 사용하지 않는다. 본문 목록에 번호 추출 불가 파일이 있는 책은 규칙불가로 분류한다.

- **규칙가능 14/15 · 규칙불가 1권 = hippo-wants-to-dance** (`hippo-dancing.jpg` 1건, 지시서 3-1 기준 적용).
  (참고 사실: hippo의 번호 추출 가능분 {5–16}만으로 서비스 12면이 완결됨 — 처분은 판단 요청 1.)
- 유효창 검산: 12p 책 → N∈{5..16} — 위 표의 모든 12p 책에서 {5–16}이 완전 부분집합으로 실존.
  13p 책(who-is-our-friend) → N∈{5..17} — PDF집합 {1–18}에 실존. 결손 0.

### 3-2. WP 장수(14~18) vs 서비스 페이지 수(12~13)의 차이 설명

- WP 모달의 번호 공간은 **인쇄 PDF 전체 면 세트**다: 표지(01) + 앞물(02–04) + 본문(05..4+P) + 뒷물(17/18).
- 증거(파일명만으로): ① 4권(little-sock·what-is-it·when-i-grow-up·who-is-our-friend)은 {1–18}
  **완전 연속 18면** = PDF 전체가 업로드된 사례. ② 나머지 책은 같은 공간의 **부분 업로드**
  ({1, 5–16, 18} 등 — 02–04·17이 빠진 채 규칙적으로 재현). ③ 대조군 실측(STEP 4)에서
  PDF05=서비스01, PDF16=서비스12 확정 → 차이 = 표지 1 + 앞물 0~3 + 뒷물 1~2.
- 앞물(02–04)·뒷물(17/18)의 **내용**(판권면/후원자면 여부)은 파일명 증거 밖 — **미확인**
  (대응 규칙에는 영향 없음: 유효창 밖이라 제외됨).

---

## STEP 4 — a-tiny-seed 대조군 검증 결과: **MATCH**

### 4-1. 규칙 산출 13개 (서비스 M ← WP 파일)

`01←_en_20200616_page4` `02←page5` `03←page6` `04←page7` `05←page8` `06←page9`
`07←page10` `08←page11` `09←page12` `10←page13` `11←page14` `12←page15`
`cover←_en_20200616_cover` (en_page17=PDF18 뒷물 제외. 전부 `https://bookdash.org/wp-content/uploads/2015/02/` 하위.)

### 4-2. 검증 (WP GET 13건 + 버킷 download 13건, 읽기 전용)

- **바이트 해시(SHA256)**: 13쌍 전부 **상이** — 예상된 결과(버킷=GH Pages 리사이즈판 1134×567,
  WP=원판 3937×1969). 해시로는 판정 불가 → 대체 지표 사용(아래).
- **해상도·가로세로비**: 본문 12쌍 모두 버킷 2.0000 vs WP 1.9995(동일 비율), cover 1.0000/1.0000 동일.
- **64×64 그레이스케일 정규화 상관 + argmax 판별**(실패 가능 설계 — 각 버킷 이미지와 가장 닮은
  WP 파일이 규칙 예측과 다르면 그 자체로 MISS): **13/13 argmax 일치**, 1위-2위 마진 0.20~0.68.
- **시각 확인(모델 육안, 상관 최저 쌍 포함 2쌍)**: 06↔page9, 01↔page4 — **동일 장면** 확정.
- **텍스트 삼중 검증(신규 증거)**: WP 이미지에 새겨진 본문 문장이 서비스 텍스트와 **단어 단위 완전 일치** —
  `out/a-tiny-seed.json` p1 == page4 새김("In a village on the slopes of Mount Kenya…"),
  p6 == page9 새김("At the American university Wangari learnt…").

### 판정: **MATCH** — 12쌍 + cover 전부 대응. 규칙 유효, 15권 확대 적용 가능.

### ★ 부수 발견 (판정과 별개, 서비스 품질 사안)

**WP 렌디션은 본문 텍스트가 이미지에 새겨져(baked-in) 있다.** 버킷의 GH Pages 렌디션은
동일 장면의 **무텍스트판**(텍스트는 HTML로 분리 — 그래서 자막 하이라이트가 성립).
상관값이 쌍마다 0.51~0.99로 갈린 원인이 바로 이 텍스트 블록 유무였다.
→ 결손 15권을 WP판으로 적재하면 뷰어에서 **이미지 속 새김 텍스트 + 자막 레이어 텍스트가
이중 표시**된다. (대조군 a-tiny-seed는 버킷에 무텍스트판이 이미 있으므로 무관. 결손 15권은
무텍스트판의 존재 여부 자체가 미확인.)

임시 다운로드 26파일(step4_wp/·step4_bucket/)은 STEP 종료 후 **삭제 완료**(Test-Path 양쪽 False 확인).

---

## 오케스트레이터 판단 요청 사항

1. **[hippo 처분]** 지시서 기준으로 규칙불가 분류했으나, 번호 추출 가능분 {5–16}만으로 서비스
   12면이 완결되고 R3 파일(`hippo-dancing.jpg`)은 유효창 밖 장식 이미지일 가능성이 있다.
   "R3 존재해도 유효창이 완결되면 규칙 적용 + R3 무시" 완화 여부 결정 요청.
2. **[이중 텍스트]** WP판 baked-in 텍스트 문제(위 부수 발견): (i) 그대로 적재(이중 표시 감수)
   (ii) 자막 하이라이트를 이 15권에서 비활성 (iii) 무텍스트 렌디션 별도 정찰 후 재판단 —
   방향 결정 요청. 텍스트 없는 5권(1-3)은 어차피 자막이 없어 (i)의 부작용이 12p 새김 텍스트 표시뿐.
3. **[표지 선택]** 표지 후보가 책마다 다름(본문 내 `_cover` / PDF Page_01 / featured_media).
   대조군에서는 본문 내 `_cover`가 버킷 cover와 상관 0.999로 매치. 우선순위(본문 `_cover` >
   featured > PDF01) 제안 — 확정 요청.
4. **[다음 게이트]** MATCH 확정으로 15권 확대의 전제는 충족. 실제 적재 전에 남은 것:
   ① ADR-0036 Amendment #2(WP 재확보 결정) 작성 ② copy 스크립트의 WP 분기 개조(코드 수정 승인)
   ③ 텍스트 없는 5권의 텍스트/오디오 생성 여부(별도 트랙) — 순서 지정 요청.
