# OCR 파일럿 5권 결과 (2026-07-10)

> 작업지시서 2026-07-10 (2) STEP 3. 실행 스크립트 `scripts/ocr_pilot/run_pilot.py`,
> 산출 `scripts/ocr_pilot/out/{slug}.ocr.json`(7권 — 파일럿 5 + 무텍스트 확인 2).
> tesseract 5.4.0 로컬(eng, psm 3). DB·Storage 쓰기 0건, AWS·유료 API 호출 0건.
> 임시 다운로드 이미지·중간 TSV 184파일 삭제 완료(산출 JSON만 잔존).

## 파일럿 5권 결과표 (+확인 2권)

| slug | 역할 | 본문 매핑 면 | 추출 단어 | 평균 conf | 서비스 gap |
|---|---|---|---|---|---|
| a-tiny-seed | 대조군 | 13 | 424 | 88.2 | [13] |
| it-wasnt-me | 무텍스트4 | 13 | **3** | 95.7 | [13] |
| hugs-in-the-city | 무텍스트4 | 13 | 176 | 82.3 | [13] |
| the-window-seat | 신규157 | 13 | 166 | 91.6 | [13] |
| mogaus-gift | WP 보수 | 13 | 135 | 82.8 | [13] |
| the-lion-who-wouldnt-try | 무텍스트4(확인) | 13 | 203 | 91.1 | [] |
| katiitis-song | 무텍스트4(확인) | 14 | 109 | 95.2 | [] |

- gap [13] = 후행 back matter 앞에서 PDF 1면이 건너뛰어진 것(본문 1..12는 연속).
  후행 면(svc 13·14)은 판권·뒤표지로 0~4단어 노이즈만 추출됨 — 검수 범위 밖 표시 대상.
- 0자 면 존재: mogaus-gift p05·p06, the-window-seat p01, lion p08·p10·p12 등 —
  진짜 empty 면인지 OCR 미검출인지 **미확인**(검수 단계 확인 항목).

## 대조군 재현 검증 — 재현 O (97.82%)

`out/a-tiny-seed.json` 정답 12면 vs 본 파이프라인(TSV word 조합) OCR:
**412단어 중 오류 9 → 단어 정확도 97.82%** — 2026-07-10 오전 실측(txt 출력 기반)과
페이지별 오류 분포까지 완전 일치(p02=1, p08=5, p10=1, p12=2, 나머지 0).
파이프라인(TSV 단어 조합)과 어제 파이프라인(txt 출력)이 동등함을 확인.

## 무텍스트 4권 판정

| slug | 판정 | 근거 (페이지별 추출) |
|---|---|---|
| **hugs-in-the-city** | **W-TEXT** | 12/13면에서 서사 문장. p01 "Today, I hugged most of the cats in town!", p08 "I hugged a Mommy cat, and every kitten she had." 등 — 총 176단어 |
| **the-lion-who-wouldnt-try** | **W-TEXT** | 9/13면에서 서사 문장. p01 "Tt was a sunny day in the jungle. All the animals were out playing."(Tt=It 오독) 등 — 총 203단어 |
| **katiitis-song** | **W-TEXT** | 12/14면에서 서사 문장. p01 "Katiiti lived in a village next to a forest." 등 — 총 109단어 |
| **it-wasnt-me** | **W-NONE** | 13면 중 11면 0자. 추출 전량 = p03 "Oh, no!"(7자) + p08 "Hiss!"(5자) — 서사 문장 0. 단 이 2건은 노이즈가 아니라 실제 인쇄된 감탄사(conf 95.6~95.7) |

- **함의(사실)**: "무텍스트 4권"은 GH HTML에 텍스트가 없다는 판정이었을 뿐, 3권은 책 자체에
  글이 있다(WP판 이미지에 인쇄). 진짜 글 없는 책은 it-wasnt-me 1권(감탄사 2건 제외)이다.
- 비활성화 SQL은 실행하지 않음(팀장 결정 I5 — it-wasnt-me의 "진짜 글 없음" 해당 여부는
  감탄사 2건의 취급에 달림 → 판단 요청 1).

## 페이지 대응 확인 — 5권 중 5권 성립 (+확인 2권도 성립)

기존 규칙(파일명→PDF 번호 N, 서비스 M=N−4)이 7권 전부에서 성립. 세 파일명 패턴 모두 출현:

| 패턴 | 책 | 성립 |
|---|---|---|
| 소문자 `_page{n}` (PDF=n+1) | a-tiny-seed·hugs·the-window-seat | O — 대조군은 정답 12면과 1:1 정합(97.82%가 그 증명) |
| `_Page_{NN}` (PDF=N) | it-wasnt-me·katiitis-song | O — Page_01은 front-matter(PDF 1)로 제외, Page_05부터 svc 1 |
| `_{날짜8}-{n}` (PDF=n) | mogaus-gift·the-lion-who-wouldnt-try | O — -1은 front-matter, -5부터 svc 1 |

어긋난 책 0권. 공통 특이점: 본문 뒤 후행 면(svc 13/14)이 목록에 포함됨(위 결과표 gap 참조).

## 산출 스키마와 기존 out/{slug}.json의 관계 (사실 기재)

- `{slug}.ocr.json` = 초벌(raw_unreviewed): page/pdf_page/image_url/이미지 크기/ocr_text/
  char·word_count/mean_conf/words[{t,x,y,w,h,conf}] — bbox·conf 보존(ADR-0039 D5).
- 기존 `out/{slug}.json` = TTS 파이프라인 입력 스키마 `[{page, image_url, text}]`.
- 두 파일은 현재 **별도**다. 검수 확정 텍스트가 기존 스키마로 나가야 TTS 경로가 그대로
  동작한다(사실). 병합/별도 유지는 결정하지 않음 → 판단 요청 2.

## 오케스트레이터 판단 요청 사항

1. **it-wasnt-me 처분**: 서사 문장 0(W-NONE)이나 실제 인쇄 감탄사 2건("Oh, no!", "Hiss!")이
   있다. 이를 "진짜 글 없음"(I5 비활성화 요건)으로 볼지, 감탄사 2건만으로 오디오 면을 만들지.
2. **산출물 이원화 확정**: 초벌 `{slug}.ocr.json`(bbox 보존) → 검수 → 확정 `{slug}.json`
   (TTS 호환) 흐름을 정식 채택할지, 확정 파일에 bbox까지 병합한 단일 스키마로 갈지.
3. **ADR-0035 Amd#2 E3 (가/나) 결정 재료**: 대조군 1권 기준 WP판 인쇄 본문과 기존 GH 텍스트가
   사실상 동일(97.82% OCR 일치가 방증)함을 확인 — (가) WP 통일 시 기존 오디오·marks 재사용
   가능성이 높다는 사실이 추가됨. 결정은 팀장.
4. **저신뢰 페이지 정책**: hugs p07(conf 57.3, 장식 배치)류는 초벌 무가치 — conf 임계로
   "재타이핑 큐"를 분리할지, 임계값을 어떤 실측으로 정할지.
5. **0자 면 확인 절차**: empty vs 미검출 판별을 검수 도구에서 사람이 하기로 하되(요구사항 §3),
   전권 확대 전에 파일럿 0자 면 7~8건만 육안 선확인할지.
6. **전권 확대 요청량**: 154권 × 평균 15장 ≈ 2,300 다운로드 + OCR — 실행 시점·속도(0.6s 간격
   기준 약 40분+) 승인 필요.

*문서 끝.*
