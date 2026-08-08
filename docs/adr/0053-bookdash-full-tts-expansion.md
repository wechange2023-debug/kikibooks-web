# ADR-0053: Book Dash 전체 TTS 확장 — 검수 게이트 폐지·키 보관 정책·입구 정제·비용 통제

## Status

Accepted (2026-07-27) / 기준 HEAD `2e79b95`
**Amendment #1(2026-07-27)로 O1·O2 해소** — 보이스 `Danielle / long-form`, 표지 포함 확정.
**Amendment #2(2026-08-08)** — 확정 사양을 ASb·Bloom 669권으로 확대 적용, `run_tts_fullbatch.py`
"팀장 확정 대기" 주석 해소 명시. O3(환율)은 여전히 미확정.

## Deciders

팀장, 오케스트레이터

## Related

- ADR-0023 Amd#1(TTS 엔진·보이스·저장 위치), ADR-0029(입수 시점 HTML 엔티티 디코딩),
  ADR-0034(+Amd#1 `kind`, +Amd#2 1-based·성우 층위)(오디오 저장 구조),
  ADR-0050(회전 페이지), ADR-0051(검수 화면), ADR-0052(+Amd#1·#2)(시연용 범위 축소 12권).
- 상위 계획서: `docs/intent/highlight-tts-master-plan.md`.
- 구현: `scripts/tts_pilot/tts_targets.py`, `scripts/tts_pilot/run_tts_fullbatch.py`.

## Context

- ADR-0052는 **7/28 내부 시연**을 위해 TTS 범위를 시범 12권으로 축소했다. 시연 트랙은
  종료됐다 — 12권 `tts_done`, 뷰어·하이라이트 검수 통과.
- 이제 축소 사유(6일 기한)가 사라졌으므로 **Book Dash 전체로 확장**한다. 확장 시 세 가지가
  실제 병목으로 드러났다.
  1. **검수 게이트**: ADR-0052는 `book_review.status='confirmed'`인 권만 TTS 대상으로 삼았다.
     현재 `draft` 140권 / `tts_done` 12권 — 사람이 140권을 선검수해야 한 줄도 못 만든다.
  2. **키 보관**: AWS 자격증명이 팀장 로컬 PowerShell 환경에만 있어, 생성은 항상 팀장이
     수동 실행해야 한다. 향후 관리자 화면의 '음원생성' 버튼으로 옮기려면 서버가 키를 써야 한다.
  3. **비용 가시성**: 실행 전 몇 권·몇 문자·얼마인지 알 방법이 없었다.
- 실측(2026-07-27, 읽기 전용): `book_dash` 209권 / 활성 206권 / `book_text` 보유 152권 /
  `book_audio` 보유 56권(v1 `Ruth` 44 + 시범 `danielle` 12).

## Decision

### D1. 검수 게이트 폐지 — 전량 자동 생성 + 사후 검수

- ADR-0052의 **`confirmed` 상태 게이트를 폐지**한다. `book_review.status`는 더 이상 TTS
  생성의 **선행 조건이 아니다**.
- `book_dash` **활성 도서 전체**를 자동 생성 대상으로 하고, 들어보고 **문제가 발견된 권만
  재생성**하는 사후 검수 방식으로 전환한다.
- 근거: 오디오는 원본을 훼손하지 않는 **파생물**이고, 재생성 단가가 낮다(D4 실측 기준
  권당 $0.01~$0.20). 140권 선검수의 인건비가 재생성 비용을 압도한다.
- **단, 사전 제외 3종은 유지**한다. 이들은 "품질 취향" 문제가 아니라 **낭독하면 뜻이
  무너지는** 결함이라 사후 검수로 걸러도 무의미하다.

  | 제외 | 권수 | 사유 | 출처 |
  |---|---|---|---|
  | 회전 페이지 보유 | 18 | 90° 회전 인쇄로 읽기순서 역전 — 사람이 텍스트를 고쳐야 함 | ADR-0050 D1·D3, `lib/admin/review/rotation-pages.ts` |
  | 제작 메타데이터 오염 | 6 | 편집용 주석 `Story spread N`이 본문에 유입 | 본 ADR D1-a |
  | 이미 오디오 보유 | 12 | `book_audio` 행 존재 — 재생성은 개별 지시로만 | `book_audio` 실측 |
  | (텍스트 없음) | 54 | `book_text` 행 없음 = 낭독 대상 자체가 없음(그중 44권은 v1 배치로 이미 오디오 보유) | 실측 |

- **D1-a. 오염 6권의 확정 근거**: 목록이 코드·문서 어디에도 남아 있지 않아
  `book_text` 전수 스캔으로 **실측 도출**했다. 정규식 `\bstory\s+spread\b`(대소문자 무시)
  히트가 **정확히 6권 / 각 1면**이었다 —
  `and-also`(p09) · `little-goat`(p03) · `look-up`(p01) · `the-rainbow-cloud`(p07) ·
  `where-is-lulu`(p08) · `yes-you-can`(p01).
  - 교차검증: `lib/admin/review/pilot-cohort.ts` 주석("회전 18권·오염 6권 제외 후 알파벳순
    상위 12")을 역산하면 알파벳 선두에서 `and-also` 1권만 빠지는데, 그 권이 위 6권에 속한다.
  - 같은 스캔에서 `you-yes-you` p12 "Almost at the back cover!"도 걸렸으나 **본문 문장(오탐)**
    이며, 해당 권은 이미 회전 18권에 포함돼 판정에 영향이 없다.
  - 목록은 `scripts/tts_pilot/tts_targets.py`의 `POLLUTED_SLUGS`에 근거 주석과 함께 고정한다.

### D2. 키 보관 정책 — Vercel 서버 환경변수 허용 + 관리자 인증 보호

- **허용**: AWS 자격증명(`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`)을
  **Vercel 서버 환경변수**에 저장할 수 있다. 향후 관리자 화면 '음원생성' 버튼의 전제다.
- **필수 조건 3**:
  1. **`NEXT_PUBLIC_` 접두사 금지.** 서버 컴포넌트·Route Handler·Server Action에서만 읽는다.
     클라이언트 번들 유입 0건을 배포 전 grep으로 확인한다(ADR-0019 CP6-a 선례).
  2. **관리자 인증 보호.** 생성 엔드포인트는 `requireAdmin`(role ∈ admin·curator) +
     zod 검증 + `assertAdmin` 트리플 가드를 통과해야 한다(ADR-0019 D2·D11 승계).
  3. **최소 권한 IAM.** 해당 키는 `polly:SynthesizeSpeech`·`polly:DescribeVoices`만 갖는
     전용 IAM 사용자로 발급한다. S3·기타 권한을 부여하지 않는다.
- **불변(변경 없음)**: **워커 로컬 환경에 AWS·Storage secret 키를 주입하지 않는다.**
  본 ADR은 *서버* 보관을 허용할 뿐, 워커 수령 금지는 그대로다(ADR-0052 D8 승계).
- **Hard Rule 6과의 관계**: Hard Rule 6은 Supabase 비밀 키의 클라이언트 노출 금지다.
  본 결정은 AWS 키를 **서버 전용**으로 두므로 그 원칙과 같은 방향이며, 완화가 아니다.

### D3. 입구 정제 게이트 — Polly 투입 전 필수 정제

- TTS 입력 텍스트는 Polly 호출 **직전에** 반드시 아래 순서로 정제한다
  (`tts_targets.sanitize()` 단일 경로).
  1. **HTML 엔티티 디코딩** — 변화가 멈출 때까지 반복(`&amp;amp;` 같은 중첩 대비, 최대 4회)
  2. **제어문자·zero-width 문자 제거**(`\n`·`\t`는 3에서 처리)
  3. **공백 정규화** — 개행→공백, 연속 공백 1개, 앞뒤 trim
  4. **문장부호 뒤 공백 보정** — `Mom.“Say` → `Mom. “Say`(기존 `generate_tts.py` 규칙 계승)
- 근거: 엔티티가 그대로 넘어가면 Polly가 `&amp;`를 "앰퍼샌드 에이 엠 피"로 읽는다.
  ADR-0029가 **입수 시점** 디코딩을 이미 규정했으나, 본 게이트는 **출구에서 한 번 더** 막는
  이중 방어다. 입수 경로가 늘어나도 낭독 품질이 상류 구현에 의존하지 않는다.
- **실측(2026-07-27)**: 현재 `book_text` 2,128행 중 `&` 문자 포함 행 **0건** — ADR-0029가
  정상 작동 중이다. 즉 본 게이트는 현시점에선 **예방적**이며, 이 사실 자체가 회귀 감시 기준선이다.
- 정제 규칙은 `python scripts/tts_pilot/tts_targets.py --selftest`로 8케이스 자체 점검한다.

### D4. 비용 통제 — dry-run 선행·승인 후 실행을 표준 절차로

- 실제 생성 **전**에 반드시 `--dry-run`을 실행해 **대상 권수 / 총 페이지 / 총 문자수(정제 후)
  / 추산 비용(USD·KRW)** 을 산출하고, **팀장 승인 후** 생성한다. 이를 상시 절차로 명문화한다.
- dry-run은 **Polly 호출 0 · Storage 업로드 0 · DB 쓰기 0**이며, 산출물은 권별 CSV와 요약 JSON이다.
- **추산 비용은 상·하한 두 값으로 보고**한다. 현 구현은 페이지마다 음성 1회 + speech marks
  1회를 호출하므로, marks 요청의 과금 여부에 따라 문자수가 ×1 또는 ×2가 된다.
  실청구서로 확인 전까지 **×2를 보수적 상한**으로 본다.
- 원화 환산 환율은 **가정치**이며 `--krw-rate`로 조정한다(기본 1,380원/USD). 확정 환율은 팀장 확인 사항.

### D5. 기존 유지 규칙 재확인 (변경 없음)

- **페이지별 mp3** — 오디오는 책 단위가 아니라 페이지 단위(ADR-0034 결정 ①).
- **파일명 1-based / 내부 좌표 0-based** — 오브젝트 키의 `NN` = `page_index + 1`,
  `book_audio.page_index`는 0-based 유지(ADR-0034 Amd#2 · ADR-0052 D5).
- **`audio_path`는 버킷명 없는 오브젝트 키만** — `book_dash-{slug}/{voice}/pNN.mp3`
  (ADR-0034 결정 ② + Amd#2 성우 층위). 버킷명 `book-audio`를 값에 넣지 않는다.
- **`book_audio` UNIQUE `(book_id, kind, page_index, voice)`** 준수 — 표지는
  `kind='cover'`·`page_index=0`(ADR-0034 Amd#1).
- **Content-Type 명시 지정** — mp3 `audio/mpeg`, marks `application/json; charset=utf-8`,
  `Cache-Control: public, max-age=31536000, immutable`(ADR-0034 결정 ③).
- **어트리뷰션 승계** — TTS 음성은 CC BY 원문의 2차 저작물(ADR-0023 §2.6). Hard Rule 1 무접촉.
- **보이스·엔진·속도는 O1로 이관** — 작업지시서는 `Neural / Ruth / 78%`를 "유지 규칙"으로
  적었으나 이는 ADR-0052 Amd#2(`Danielle / long-form / atempo 0.85`)와 충돌한다. 아래 O1 참조.

### D6. 실행 경계 — 워커 DB 읽기 허용, 쓰기·업로드는 팀장 영역

- ADR-0052 D3(A안: 팀장 SQL export → 워커 변환)을 **읽기 조회에 한해 개정**한다. 워커 스크립트는
  기존 sync 스크립트와 동일한 `load_env()` 관행으로 **`book_dash` 대상 선정 SELECT를 직접
  수행**할 수 있다. 152권 규모에서 수기 export 왕복은 오류 표면만 넓힌다.
- **불변**: INSERT/UPDATE/DELETE·스키마 변경·Storage 업로드는 **전부 팀장 영역**이다.
  본 트랙 스크립트는 DB 쓰기 코드 경로를 갖지 않는다.

## Consequences

- **얻는 것**: 116권이 사람 선검수 없이 생성 가능해진다. 비용이 실행 전에 보인다.
  정제 게이트로 낭독 품질이 상류 구현에 덜 의존한다. 오염 6권 목록이 근거와 함께 코드에 고정된다.
- **잃는 것**: 사후 검수라 품질 미달본이 일시적으로 존재할 수 있다. 재생성 비용은 감수한다.
- **이연**: 회전 18권·오염 6권은 검수 화면에서 텍스트 수정 후 별도 배치로 처리한다.
  `book_text` 없는 54권(v1 44 + 기타 10)은 OCR/추출 트랙 사안이다.
- **되돌리기**: D1은 상태 게이트를 다시 켜면 원복된다(스키마 무변경). D2는 Vercel 환경변수
  삭제 + IAM 키 폐기로 원복된다.

## Non-goals

- 관리자 '음원생성' 버튼 UI 구현(D2는 그 **전제 정책**만 확정한다).
- Storage 업로드·`book_audio` INSERT·`books.has_audio` 반영(팀장 영역, 별도 지시서).
- 구 44권 `p00` 축·`voice='Ruth'` 표기의 신 규약 재정렬(ADR-0034 Amd#2가 백로그로 이연).
- ASb·Bloom·GDL 등 타 플랫폼 TTS.

## Open (팀장 확인)

### O1. 보이스·엔진 확정 — `Danielle / long-form` vs `Ruth / neural 78%`

작업지시서 Task 1-5는 `Polly Neural / Ruth / 78%`를 "기존 유지 규칙"으로 적었으나,
**최신 확정본은 ADR-0052 Amendment #2(2026-07-22)의 `Danielle / long-form / atempo 0.85`** 이다.
같은 Amendment는 Ruth 78% 산출물이 **팀장 청취 검수에서 반려**됐다고 기록한다.
실제 `book_audio`에도 시범 12권이 `voice='danielle'` 150행으로 적재돼 있다.

| | Ruth / neural 78% | Danielle / long-form |
|---|---|---|
| 근거 ADR | ADR-0023 Amd#1 | ADR-0052 Amd#2 (최신) |
| 청취 판정 | 반려(2026-07-24) | 채택 |
| 단가 | $16 / 1M자 | $100 / 1M자 |
| 116권 추산(×2 상한) | **$3.81 (약 ₩5,253)** | **$23.79 (약 ₩32,829)** |
| 시연 자산 정합 | 불일치(재생성 필요) | 일치 |

**차액은 약 $20(₩27,600)** 로, 6.25배지만 절대액이 작아 **비용은 결정 근거가 되지 못한다.**
따라서 품질·일관성 기준으로 `Danielle / long-form` 승계를 권고하며, 구현 기본 프리셋도
`danielle-longform`으로 두었다(`--preset ruth-neural`로 전환 가능).
팀장이 Ruth로 확정하면 기본값을 바꾸고 본 ADR에 Amendment로 고정한다.

### O2. 표지 낭독 트랙 포함 여부

시범 배치는 표지(`kind='cover'`, `"{title}. Created by {author}."`)를 생성했다.
전체 확장에도 포함할지 미확정. 포함 시 **+5,269자**로 추산이
`$3.97`(neural) / `$24.84`(long-form)가 된다(×2 상한 기준, 차이 약 ₩1,450).
구현은 `--with-cover` 플래그로 대기 중이며 **기본값은 미포함**이다.

### O3. 원화 환산 환율

`--krw-rate` 기본값 1,380원/USD는 워커의 **가정치**다. 확정 환율을 알려주면 반영한다.

---

## Amendment #1 (2026-07-27, 팀장 승인) — O1·O2 해소 + 재개 규약

### A1. 보이스·엔진 확정 (O1 해소)

- **`Danielle / long-form / us-east-1 / atempo 0.85`** 로 확정한다. ADR-0052 Amd#2 승계.
- `ruth-neural` 프리셋은 폐기하지 않고 **비교·폴백용으로 코드에 남긴다**(`--preset ruth-neural`).
- D5의 "보이스·엔진은 O1로 이관" 문구는 본 항으로 대체된다.

### A2. 표지 낭독 트랙 포함 확정 (O2 해소)

- 전량 배치에 **표지 트랙을 포함**한다(`--with-cover`). 116권 전부 표지 문구가 생성된다
  (`"{title}. Created by {author}."`, author 없는 1권은 제목만).
- 표지도 본문과 **동일 규약**을 따른다: mp3 + word marks, `audio_path`는 버킷명 없는
  오브젝트 키(`book_dash-{slug}/danielle/cover.mp3`), DB 적재 시
  `kind='cover'` · `page_index=0` 으로 UNIQUE `(book_id, kind, page_index, voice)` 충족
  (ADR-0034 Amd#1).

### A3. 확정 수치 (dry-run 실측, 2026-07-27)

| 항목 | 값 |
|---|---|
| 대상 | 116권 |
| 유닛 | 1,464 (본문 1,348 + 표지 116) |
| 문자수 | 124,213 (본문 118,944 + 표지 5,269) |
| 추산 비용 | **$24.84 · 약 ₩34,283** (long-form ×2 보수적 상한, 환율 가정 1,380원) |
| Polly 요청당 문자 상한(3,000자) 초과 | 0건 (최대 페이지 657자) |

### A4. 재개(resume) 규약 — 로컬 산출물 기준

- 중단 후 **같은 명령 재실행**이 표준 재개 방법이다. 유닛의 `mp3`·`marks.json`이
  **둘 다 존재하고 둘 다 0바이트가 아닐 때만** 건너뛴다(재과금 방지). 한쪽만 있거나
  0바이트면 다시 합성한다 — mp3 기록 후 marks 기록 전 중단된 경우를 흘리지 않기 위함이다.
- **재개 판정은 `book_audio` 기준이 아니다.** 본 스크립트는 DB에 쓰지 않으므로 중단 시점까지의
  산출물은 디스크에만 있다. `book_audio` 조회는 *대상 선정* 단계에서 이미 적재 완료된 권을
  제외하는 용도다(현재 12권).
- 전량 재생성은 `--force`. 특정 권만은 `--force --slugs a,b`.
- 실행 절차서: **`docs/ops/tts-fullbatch-run.md`**(팀장 PowerShell 복붙용).

---

## Amendment #2 (2026-08-08, 팀장 결정) — 보이스·엔진 확정의 재확인 및 ASb·Bloom 669권 확대 적용

### B0. 선행 사실 — O1은 이미 Amendment #1에서 해소됐다

본 Amendment는 **닫힌 항목을 다시 여는 것이 아니다.** O1은 2026-07-27 Amendment #1 A1에서
`Danielle / long-form / us-east-1 / atempo 0.85`로 이미 확정됐다. 그럼에도 본 항을 추가하는
이유는 둘이다.

1. **적용 범위가 넓어졌다.** Amd#1의 확정은 Book Dash 116권을 전제로 한 것이었다.
   ASb 527 + Bloom 142 = 669권이 신규 대상으로 편입되면서(ADR-0056 D1), 확정된 보이스·엔진을
   이 코호트에도 그대로 적용할지가 새 판단 대상이 됐다.
2. **코드 주석이 확정 이후에도 갱신되지 않았다.** B3 참조.

### B1. 결정 — `Danielle / long-form`을 ASb·Bloom 669권에도 적용한다

- 보이스 **Danielle**, 엔진 **long-form**, 리전 `us-east-1`, 평문 입력 + ffmpeg `atempo=0.85`
  후처리, marks `time × (1/0.85)` 선형 스케일. **Amendment #1 A1과 완전 동일한 사양**이다.
- 적용 범위를 **Book Dash + ASb + Bloom 전 코호트**로 확대한다.
- 결정일 **2026-08-08**, 결정자 **팀장**.

### B2. 결정 근거

1. **음성 일관성** — 기존 128권(시범 12 + 전량 116)이 이미 `Danielle / long-form`으로 합성
   완료돼 있다(`out/_fullbatch_report.json`: `books_ok=116, total_units=1464`).
   엔진을 바꾸면 **동일 서재 안에서 낭독 음성이 이원화**된다. 유아 대상 서비스에서 책마다
   목소리가 바뀌는 것은 품질 문제로 인식된다.
2. **비용이 결정 근거가 되지 못한다** — ASb·Bloom 669권 실측 `chars_billable` **744,408자**
   기준(2026-08-08 전수 드라이런, ADR-0056 §Context 3):

   | 엔진 | 단가 | ×1 (음성만) | ×2 (음성+marks 보수적 상한) |
   |---|---|---|---|
   | long-form | $100 / 1M자 | $74.44 · 약 ₩104,217 | **$148.88 · 약 ₩208,434** |
   | neural | $16 / 1M자 | $11.91 · 약 ₩16,675 | $23.82 · 약 ₩33,349 |

   (환율 가정 **1,400원/USD** — O3은 여전히 미확정이며 본 표도 가정치다)

   long-form ×2 상한이 **약 21만 원**으로 절대 금액이 작다. neural 전환의 절감액
   (×2 기준 약 **$125**, ×1 기준 약 **$63**)은 음성 일관성 손실을 정당화하지 못한다.
   이는 Amd#1이 116권에서 적용한 판단("차액이 6.25배지만 절대액이 작아 비용은 결정 근거가
   되지 못한다")과 동일한 논리이며, 규모가 6배로 커진 뒤에도 결론이 유지됨을 확인한 것이다.
3. **청취 검수 이력** — `Ruth / neural 78%`는 2026-07-24 팀장 청취에서 반려됐다
   (ADR-0052 Amd#2 기록). 이 판정은 번복되지 않았다.

### B3. `run_tts_fullbatch.py`의 "팀장 확정 대기" 주석은 해소됐다

`scripts/tts_pilot/run_tts_fullbatch.py:59-62`에 다음 주석이 남아 있다.

> ⚠ 보이스·엔진은 ADR-0053 Open 항목이다(팀장 확정 대기).

이 문구는 **Amendment #1(2026-07-27) 시점에 이미 사실과 달랐고**, 본 Amendment로 완전히
해소된다. 코드가 사용하는 기본 프리셋(`DEFAULT_PRESET = "danielle-longform"`)은 확정 사양과
일치하므로 **동작상 문제는 없으며, 주석만 낡았다.**

- **코드 수정은 본 Amendment 범위 밖이다.** 주석 갱신은 다음 코드 작업 트랙에서 함께 처리한다.
- `ruth-neural` 프리셋은 Amd#1 A1대로 **비교·폴백용으로 코드에 남긴다**(폐기하지 않는다).

### B4. 본 Amendment가 바꾸지 않는 것

- Amendment #1 A2(표지 트랙 포함), A3(116권 확정 수치), A4(재개 규약)는 **전부 유효**하다.
- O3(원화 환산 환율)은 **여전히 미확정**이다. B2의 1,400원/USD는 가정치이며, 확정 환율이
  나오면 별도 반영한다.
- 본 Amendment는 ASb·Bloom의 **합성 실행을 승인하지 않는다.** 대상 코호트의 `book_text`
  적재(ADR-0056, Proposed)가 선행돼야 하고, 합성 전 dry-run 승인 절차(D4)도 그대로 적용된다.
