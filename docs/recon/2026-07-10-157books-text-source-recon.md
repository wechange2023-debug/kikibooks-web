# 157권 텍스트 원천 정찰 — PDF 텍스트 레이어 / WP content.rendered (2026-07-10)

> 작업지시서 5. 읽기 전용 정찰 — DB·Storage 쓰기 0건, 네트워크 GET만, OCR 사용 0건
> (STEP 2는 "텍스트 레이어 존재 판정"이므로 OCR을 쓰면 실험이 무효 — pypdf 추출만 사용).
> PDF는 임시 경로에만 다운로드(레포 미포함).

## 0. 배경

텍스트 원천 없는 154권(+무텍스트책 4권) × 약 2,300페이지의 확보 수단으로 (경로 B) Book Dash
PDF의 live text layer, (경로 A) WP REST `content.rendered`를 검증했다. 사람 타이핑(33.0만 자
외삽)과 OCR 초벌+검수(ADR-0039)의 대체·보완 경로 판정이 목적.

## 1. 대조군 설계와 근거

- **대조군 = a-tiny-seed**: v1 html 코호트라 정본 텍스트(`scripts/tts_pilot/out/a-tiny-seed.json`,
  12면 412단어)를 보유 → 추출 결과를 **채점**할 수 있는 유일한 부류. (실패 가능한 설계 원칙)
- PDF 소재: 상세페이지에 `.pdf` 직링크는 0건이나, **"Download ebook" 버튼이
  `/book-source-files/?book={slug}&folder=/ebook` 소스파일 브라우저로 연결**됨을 발견.
  언어 폴더(`en_english`) 안에 `a-tiny-seed_en.pdf` 실재 —
  `https://bookdash.org/book-source-files/?download=a-tiny-seed/ebook/en_english/a-tiny-seed_en.pdf`
  (879,482B, `%PDF-` 매직 확인, 로그인·유료 벽 없음).

### 대조군 판정: **T-OK — 단어 일치율 100.00% (412/412, 오류 0)**

pypdf 추출, PDF 18페이지(표지 1 + 앞부속 2~4 + 본문 5~16 + 뒷부속 17~18):

| 서비스 면 | PDF 페이지 | 정답 단어 | 오류 | | 서비스 면 | PDF 페이지 | 정답 단어 | 오류 |
|---|---|---|---|---|---|---|---|---|
| p01 | p05 | 26 | 0 | | p07 | p11 | 34 | 0 |
| p02 | p06 | 25 | 0 | | p08 | p12 | 38 | 0 |
| p03 | p07 | 40 | 0 | | p09 | p13 | 43 | 0 |
| p04 | p08 | 44 | 0 | | p10 | p14 | 29 | 0 |
| p05 | p09 | 43 | 0 | | p11 | p15 | 35 | 0 |
| p06 | p10 | 38 | 0 | | p12 | p16 | 17 | 0 |

- **서비스 M = PDF N − 4 매핑이 12/12면 정확히 재확인**됨(기존 게이트 규칙과 정합).
- OCR(동일 책 97.82%)과 달리 오독·노이즈 0 — 원본 조판 텍스트 그대로.

## 2. STEP 2 — 표본 5권 (경로 B)

**선정 기준(무작위 금지)**: WP-only 154권을 업로드 연도(cover URL `/uploads/YYYY/`)로 층화
— 2017(31권)·2018(25)·2019(23)·2020(6)·2021(14)·2022(20)·2023(14)·2024(10)·2025(10)·불명(1).
연도 분산 + 파일명 스킴 상이(표준 `_page{n}` / dedup 접미사 변형 / **unmapped 이상치**) +
파일럿 기실측 1권(삼각 대조용)으로 5권 확정. (Scheme B 185권 교훈 — 표본이 신간에 쏠리지
않도록 최고(最古) 연도 버킷 포함.)

| slug | 연도 | 선정 사유 | PDF | 페이지 수 | 본문부(텍스트 있는 면) | 페이지 비율 | 판정 |
|---|---|---|---|---|---|---|---|
| the-cottonwool-doctor | 2017 | 최고 연도 버킷 | `ebook/en-english/…_english.pdf` 1.1MB | 18 | p05~p16 전부(36~103단어) | 2.0(스프레드) | **T-OK** |
| the-great-cake-contest | 2018 | dedup 접미사 스킴 | `ebook/en-english/…_en.pdf` 8.0MB | 18 | p05~p16 전부 + p18(뒷면 질문 5단어) | 2.0 | **T-OK** |
| the-memory-tree | 2022 | 본문 파일명 unmapped 이상치 | `ebook/en-english/…-en-20221202.pdf` 1.1MB | 18 | p05~p16 전부(16~51단어) | 2.0 | **T-OK** |
| its-my-book | 2024 | 신간 버킷 | `e-book/en_english/…_en.pdf` 3.3MB | 18 | p05~p16 중 11면(p14=0단어 — 그림만 면으로 판단, 인접 면 정상) | 2.0 | **T-OK** |
| the-window-seat | 2025 | 파일럿 OCR 기실측(삼각 대조) | `e-book/en_english/…_en.pdf` 5.6MB | 18 | p05~p16 전부(9~19단어) | 2.0 | **T-OK** |

- 페이지별 단어 수·첫 본문 30자 전량 실측 완료(위 표는 요약. 예: the-window-seat 첫 본문
  "Every December Gugu and Cici t…" — 파일럿 OCR p01 추출과 정합. its-my-book p06
  "Come back SILLY goose! …" — 말풍선 텍스트도 레이어에 존재).
- **PDF 페이지 수 vs 이미지 수 대응**: 5권 전부 PDF 18페이지 = 표지 1 + 앞부속 3 + 본문 12
  + 뒷부속 2. WP read-book 이미지(13~15장 = cover + 본문 12 + 뒷부속 1~2)와 본문 12면이
  1:1 대응(M=N−4). 버킷 이미지는 이 154권에 존재하지 않음(비교 불가 — WP 장수로 대체).
- 폴더명 변형 실측: `/ebook` vs `/e-book`(2024·2025 신간), `en_english` vs `en-english`.
  → 전수 순회 시 변형 처리 필요.

### 부수 발견 (이번 지시서 범위 밖 — 기록만)

1. **`_no-text`/`no-text` 폴더 실재**: a-tiny-seed(`ebook/_no-text/` — 무텍스트 JPG 11장),
   the-cottonwool-doctor(`ebook/no-text`), the-great-cake-contest(`ebook/no-text`),
   its-my-book·the-window-seat(`e-book/_no-text`). **무텍스트 이미지 원본이 소스파일
   저장소에 존재**한다 — K1(A안: 무텍스트 이미지 + 별도 텍스트 레이어)의 이미지 소스
   후보(전수 존재 여부는 미확인).
2. 소스 저장소에 `audiobook`·`print-ready`·`working-files` 폴더도 존재(a-tiny-seed 실측).

## 3. STEP 3 — WP content.rendered (경로 A)

동일 표본 5권, `GET /wp-json/wp/v2/books?slug={slug}` (0.6s 간격):

| slug | rendered 길이 | 텍스트 | `<img>` | 본문 문장 포함 | 판정 |
|---|---|---|---|---|---|
| the-cottonwool-doctor | 252B | 244자 | 0 | 없음 | **A-SUMMARY** |
| the-great-cake-contest | 110B | 102자 | 0 | 없음 | **A-SUMMARY** |
| the-memory-tree | 122B | 114자 | 0 | 없음 | **A-SUMMARY** |
| its-my-book | 120B | 106자 | 0 | 없음 | **A-SUMMARY** |
| the-window-seat | 63B | 55자 | 0 | 없음 | **A-SUMMARY** |

- 내용은 전부 뒤표지형 소개문(55~244자, 예: "Two sisters, one window seat, and a magical
  train ride!"). 페이지 본문 아님 → **경로 A는 텍스트 원천이 될 수 없음**(요약문으로서의
  별도 용도는 가능 — 판단 밖).

## 4. 최종 판정

> **"157권 텍스트를 PDF에서 자동 확보 가능한가? — 조건부 YES"**

조건(정확히):
1. 표본 6권(대조군 포함, 연도 2015~2025·스킴 4종) 전부 live text layer 실재·대조군 100%
   일치였으나, **157권 전수의 PDF 존재·레이어 유무는 미확인** — 전수 순회(권당 GET 3~5회,
   약 700회 + PDF 다운로드)로 각 권을 확정해야 하며, 실패 권은 예외 큐(OCR/타이핑)로 분리.
2. 폴더명 변형(`/ebook`·`/e-book`, `en_english`·`en-english` 등)을 처리해야 함(표본에서 2종
   실측 — 다른 변형 존재 가능).
3. 그림만 면(empty)은 레이어에 텍스트가 없는 것이 정상(its-my-book p14) — "0단어 = 실패"로
   오판하지 말 것.
4. 페이지 귀속은 M=N−4로 성립(대조군 12/12 실증)하나 정본 채점은 대조군 1권뿐 —
   나머지는 첫 30자·단어 수 수준 확인. 전수 수확 시 스팟 검수(사람) 필요.

## 5. 남은 리스크

- 2017년 이전 업로드가 없는 분포(최고 2017)라 그 이전 조판 PDF의 레이어 품질은 이번
  표본으로 미커버 — 단 WP-only 154권 자체가 2017+ 분포라 실위험 낮음(v1 39권은 정본 보유).
- ligature·특수문자(’ vs ') 등 조판 문자 차이는 대조군에서 0건이었으나 전수에서 발생 가능
  (정규화 규약은 기존 norm 규칙 재사용).
- `book-source-files` 브라우저는 공식 REST가 아닌 사이트 기능 — 구조 변경 리스크.

## 6. 다음 권고 (1개)

★ **157권 전수 "소스 저장소 1회 순회"**: 각 권에 대해 (a) 영어 ebook PDF 존재·레이어 확인
+ 텍스트 수확, (b) 같은 순회에서 `_no-text` 폴더 존재 여부 기록(A안 이미지 소스 후보 조사).
산출: 권별 {PDF URL, 레이어 유무, 페이지별 텍스트, no-text 폴더 유무} 장부. 이 장부가
타이핑 33.0만 자·OCR 검수 2,316면을 대체/축소하는 분기 근거가 된다.

*문서 끝.*
