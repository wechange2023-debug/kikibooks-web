# PDF 하베스트 게이트 v2 실측 + v3 권별 분류 전환 (2026-07-10)

> 작업지시서 7(게이트 재설계) 실측 + 작업정리 지시서(게이트 v3 확정) 기록.
> 대상 = 54권 코호트 중 정본 보유 채점 가능 권. DB·Storage 쓰기 0건, OCR 0건.

## 1. 게이트 v1·v2가 각각 잘못 측정한 것

- **v1**(지시서 6): 순서 민감 편집거리 단일 지표 — **'누락'과 '순서 뒤섞임'을 한 숫자에
  혼재**시켰다. "PDF에 글자가 있는가"(경로 B의 근간)와 "우리 도구가 잘 조립했는가"(도구
  품질)를 분리하지 못해, 도구 결함이 경로 폐기 신호처럼 보였다.
- **v2**(지시서 7): A축(완전성)/B축(순서)을 분리했으나 **"전권 자동 수확" 전제의 전권
  통과 기준**(min ≥95)이었다 — 말풍선·낱글자 산포 조판 책이 존재하는 실측 앞에서 이
  전제 자체가 반증됨(오케스트레이터 결정으로 GB-1 폐기, 권별 분류 v3로 전환).

## 2. GA-1 "미달" 2권의 실제 원인 — 낱글자 산포 조판 (누락 아님)

recall 중앙값 99.73%. 최저 2권의 원인은 텍스트 레이어 부재가 아니라 **단어 해체**:

- how-about-you p1: 정본 `Who are you?` → 추출 `W you? ho are` (여러 줄에 걸친 드롭캡)
- what-is-it p9: 정본 `Aargh! Eek! Run!` → 추출 `A a r E e! g h k! n! u R` (낱글자 대각 산포)

글자는 전부 레이어에 실재함을 다중집합 대조로 확인(누락으로 집계된 토큰들이 낱글자
형태로 전량 존재). **경로 B(PDF 텍스트 레이어) 유효** — 미달 2권은 '누락'이 아니라
'단어 해체'로 재분류(오케스트레이터 결정).

## 3. v1(객체 순서) vs v2(좌표 재조립) 상보성

두 전략은 **책별로 승자가 다르다** — B축 중앙값은 비등(v1 98.44 / v2 98.17)하나
개선 12권 / 후퇴 14권:

| 대표 사례 | v1 | v2 | 비고 |
|---|---|---|---|
| a-beautiful-day | 56.8 | **98.4** | v1 객체 순서가 무작위였던 책 |
| a-house-for-mouse | 72.63 | **100.0** | 드롭캡·공백 해소 |
| the-best-thing-ever | 59.02 | **79.78** | 부분 개선 |
| lory-dory | 91.48 | **99.55** | 개선 |
| mrs-penguins-palace | **95.27** | 60.81 | v2 블록 순서가 틀린 책 |
| little-sock | **98.44** | 67.19 | 〃 |
| londi-the-dreaming-girl | **100.0** | 92.49 | 〃 |

- **oracle(권별 최적 선택)로도 최저는 zanele 78.4** — 하한은 전략 선택이 아니라
  말풍선·산포 조판 책의 본질적 한계다.
- `pdftotext -layout` 비교: 중앙값 98.10 / 최저 0 — v2(98.17)와 **우열 없음**.
- 튜닝 이력(한도 2회, 소진): 1회차 = 블록 클러스터링 + 좌/우 반면 분할(sindi류 중앙선
  걸침 단일 흐름 책에서 역효과 실측) → 2회차 = 반면 분할을 "완전 좌·우 블록 공존 &
  걸침 블록 부재"일 때만 적용 + top-간격 블록 결합 + 여러 줄 드롭캡 재부착.

## 4. 게이트 v3 — 권별 분류 (오케스트레이터 확정 기준)

기준: **AUTO** recall ≥99 & B축(권별 우세 전략) ≥95 / **REVIEW** 미달이나 recall ≥95 /
**MANUAL** recall <95. recall은 v2 기준(드롭캡 병합으로 v1 대비 동등 이상), B축은
v1·v2 중 우세값(전략 병기).

### 집계 — NARRATION 43권

| 분류 | 권수 | 비율/페이지 |
|---|---|---|
| **AUTO** | **29** | **67.4%** |
| **REVIEW** | 13 | 총 158면 |
| **MANUAL** | 1 (how-about-you) | 12면 |
| 사람 손 잔여 | 14권 | **170면** (전체 522면의 32.6%) |

### 권별 표

| 분류 | slug | recall | B축 | 우세 전략 | 면 |
|---|---|---|---|---|---|
| AUTO | a-beautiful-day | 99.2 | 98.4 | v2 | 10 |
| AUTO | a-dancers-tale | 99.27 | 98.54 | v2 | 12 |
| AUTO | a-fish-and-a-gift | 99.08 | 98.17 | v2 | 12 |
| AUTO | a-house-for-mouse | 100.0 | 100.0 | v2 | 11 |
| AUTO | a-tiny-seed | 100.0 | 100.0 | v2 | 12 |
| AUTO | grandpas-gold | 100.0 | 100.0 | v2 | 12 |
| AUTO | i-will-help-you | 100.0 | 98.37 | v1 | 12 |
| AUTO | is-there-anyone-like-me | 100.0 | 100.0 | v1 | 12 |
| AUTO | karabos-question | 100.0 | 100.0 | v2 | 12 |
| AUTO | little-ants-big-plan | 100.0 | 100.0 | v2 | 12 |
| AUTO | londi-the-dreaming-girl | 100.0 | 100.0 | v1 | 12 |
| AUTO | lory-dory | 99.55 | 99.55 | v2 | 12 |
| AUTO | maddy-moona | 99.1 | 98.74 | v1 | 12 |
| AUTO | miss-helens-magical-world | 100.0 | 96.55 | v1 | 12 |
| AUTO | queen-of-soweto | 100.0 | 99.58 | v1 | 12 |
| AUTO | rafikis-style | 99.29 | 98.57 | v1 | 12 |
| AUTO | sbus-special-shoes | 100.0 | 100.0 | v2 | 12 |
| AUTO | searching-for-the-spirit-of-spring | 99.12 | 98.82 | v2 | 12 |
| AUTO | sima-and-siza | 99.64 | 99.64 | v2 | 12 |
| AUTO | sindiwe-and-the-fireflies | 100.0 | 100.0 | v2 | 12 |
| AUTO | singing-the-truth | 100.0 | 100.0 | v2 | 12 |
| AUTO | sizwes-smile | 99.56 | 99.27 | v2 | 12 |
| AUTO | the-elephant-in-the-room | 99.73 | 99.73 | v2 | 12 |
| AUTO | there-must-be-a-rainbow | 100.0 | 100.0 | v2 | 12 |
| AUTO | together-were-strong | 99.88 | 99.88 | v2 | 12 |
| AUTO | tortoise-finds-his-home | 99.45 | 99.45 | v1 | 12 |
| AUTO | walking-together | 100.0 | 100.0 | v2 | 12 |
| AUTO | what-if | 100.0 | 100.0 | v2 | 12 |
| AUTO | when-i-grow-up | 100.0 | 100.0 | v2 | 12 |
| REVIEW | amazing-daisy | 99.41 | 88.72 | v1 | 12 |
| REVIEW | gracas-dream | 100.0 | 93.94 | v2 | 12 |
| REVIEW | lara-the-yellow-ladybird | 99.51 | 93.69 | v2 | 12 |
| REVIEW | little-sock | 97.66 | 98.44 | v1 | 12 |
| REVIEW | mrs-penguins-palace | 98.31 | 95.27 | v1 | 12 |
| REVIEW | sindi-and-the-moon | 97.38 | 97.0 | v2 | 12 |
| REVIEW | sleepy-mr-sloth | 99.55 | 87.39 | v1 | 12 |
| REVIEW | thatos-birthday-surprise | 98.58 | 98.1 | v2 | 12 |
| REVIEW | the-best-thing-ever | 97.81 | 79.78 | v2 | 12 |
| REVIEW | what-is-it | 95.29 | 96.47 | v1 | 12 |
| REVIEW | who-is-our-friend | 100.0 | 94.95 | v2 | 13 |
| REVIEW | whose-button-is-this | 97.89 | 98.59 | v1 | 13 |
| REVIEW | zanele-situ-my-story | 100.0 | 78.4 | v2 | 12 |
| MANUAL | how-about-you | 93.83 | 97.53 | v1 | 12 |

## 5. EXTRA_TEXT (본문 면 한정 precision 재계산)

- **진짜 초과 인쇄 문장 3권**: zanele-situ-my-story **67단어**(말풍선 대사 —
  "What is wrong, doctor?" 등 정본에 없는 문장), gracas-dream **32단어**(p12 판본 상이
  연관), maddy-moona **17단어**("But...", "Searching", "Until" 등).
- **산포 조판 잔여 5권**(초과분이 낱글자·드롭캡 파편): sleepy-mr-sloth(56),
  miss-helens(53), what-is-it(12), how-about-you(9), little-sock(12).
- **계측 혼입 1권**: a-house-for-mouse — 전 페이지 집계 시 precision 65.5로 보였으나
  **후행 판권면 텍스트 포함 탓**. 본문 면 한정 시 **100.0%** (계측 정의 문제였음).

## 6. 판본 상이 의심 — 사람 눈 필요

- **gracas-dream p12**: 정본 `Here's a book, my child. What will it inspire you to do?`
  vs PDF `Graça's dreams had come true. She had become a teacher…` — 문구 자체가 다름.
  GH 추출본과 PDF의 판(edition) 차이 가능성. **사람 육안 확인 항목.**

## 7. 드롭캡 임계값 근거 (감이 아니라 실측)

- 실측(sindi-and-the-moon `S`): 드롭캡 size **70** vs 본문 22(비 3.2), 다음 단어와의
  gap **4.9pt** vs 단어 간 중앙값 ~8pt(비 0.6).
- 채택 임계값: 단일 영문자 & **크기비 ≥1.5** & 다음 단어 소문자 시작 & **gap ≤1.2×중앙값**.
- 여러 줄에 걸친 드롭캡(how-about-you `W`)은 밴드 내 병합으로 불가 → 세로 범위 교차 +
  x 근접(≤0.35×글자 크기) 라인의 선두에 재부착하는 선분리 방식 추가(2회차 튜닝).

## 8. 부수 결함 2건과 수정

1. **표지 PDF 캐시 오염**: 복수 PDF 중 기각된 1페이지 표지가 `{slug}.pdf`로 캐시되고
   재추출이 그 파일을 읽어 how-about-you가 0%로 보인 사고 → 산출물에 `cache_file`
   필드 기록 + 재추출 시 페이지 수 일치로 캐시 재판정.
2. **복수 PDF 선택**: 파일명 힌트만으로 첫 항목을 고르던 것을 다운로드 후 **페이지 수
   검증**(<5p 기각, 다음 후보)으로 변경 (how-about-you·why-is-nita 실측 사고).

## 9. 다음 권고 (1개)

★ 정답지 없는 157권에서 권별 우세 전략을 고를 수 없는 문제의 검증 설계는
`docs/intent/oracle-without-groundtruth.md`(신규) — **다음 세션 첫 안건**.

*문서 끝.*
