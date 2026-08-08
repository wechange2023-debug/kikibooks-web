# ADR-0056: 본문 텍스트의 book_text 적재 — asb_native 669권 + Book Dash html 34권 (ADR-0025 Amd#6 개정)

## Status

**Proposed** (2026-08-08) / 기준 HEAD `e2f4c14`
본 문서는 **결정 제안만** 담는다. 적재 스크립트·SQL·DB 작업은 승인 후 별도 작업지시서에서 수행한다.
근거가 되는 **669권 전수 드라이런은 이미 완료**되어 산출물이 커밋돼 있다(§Context 3).
**2026-08-08 팀장 검수**: D1~D6 승인, 구 O2·O5를 **D7·D8로 승격 확정**. 잔여 Open 3건은 전부 비차단.

**2026-08-08 개정 (Proposed 유지)** — 적재 범위를 **669권 → 703권**으로 확대한다.
Book Dash html 코호트 중 **활성 34권(408면)** 을 편입하며(**D9~D14** 신규), 팀장 승인 2건에 근거한다.

1. 34권의 기존 `voice='Ruth'` 음원은 **Danielle 재생성**으로 대체한다(Ruth 우회·표기변경 모두 반려).
2. 34권을 **ADR-0054 D2(html → `asb_native` 전환) 대상에서 제외**하고 본 경로로 대체한다.

기존 **D1~D8은 ASb·Bloom 669권 범위로 유지**된다 — 확대의 영향을 받지 않는다. 적용 범위가 갈리는
항목은 각 결정문 머리에 **[ASb·Bloom]** / **[Book Dash html]** / **[전 코호트]** 로 표기한다.

## Deciders

팀장, 오케스트레이터

## 관련 문서

- **개정 대상**: `docs/adr/0025-asb-content-ingestion.md` Amendment #6(본문 텍스트 DB 미저장 결정)
- ADR-0025 Amd#3(자체 렌더 결정·`content_url` 정의) · Amd#6(페이지 구성·짝짓기 규칙)
- ADR-0028 Amd#4(Bloom 본문 텍스트 레이어) · Amd#5(인코딩 정정·무텍스트 게이트)
- ADR-0034 Amd#1(`kind='cover'`) · Amd#2(1-based 파일명 축·성우 층위)
- ADR-0039 D1(Book Dash가 OCR 트랙으로 간 사유 — baked-in 텍스트)
- ADR-0046 D2(`page_index` 0-based) · D3(`text`=낭독본 / `blocks`=검수 원본)
- ADR-0047(적재 대상 확정 방식) · ADR-0048 D1(`source` 라벨 명시 적재)
- ADR-0053(Book Dash 전체 TTS 확장 — 정제 게이트 D3·비용 통제 D4·실행 경계 D6)
  · **Amendment #3**(2026-08-08 — 본 ADR D9의 34권을 Danielle 적용 범위에 편입)
- **D9~D14 신규 관련 문서 (Book Dash html 코호트)**
  - **ADR-0054**(html 54권 중 38권 `asb_native` 전환) **+ Amendment #1**(2026-08-08 — 본 ADR
    D9의 34권을 D2 전환 대상에서 제외) · O2(오디오 `page_index` 재매핑 게이트)
  - ADR-0036 D2·Amd#1(`book-images` 키 규약 `book_dash-{source_id}/NN.jpg` · 정예 39권)
  - ADR-0052 Amd#2(`Danielle / long-form / atempo 0.85` 확정 · Ruth 청취 반려 기록)
  - ADR-0014 Amd#5·#6(블랙리스트 15권) · `lib/shared/blacklist.ts`(단일 진실 공급원)
  - ADR-0023 §2.4(TTS 배치 사전 생성)
- 구현 참조: `lib/book/asb-parser.ts` · `components/book/asb-reader.tsx` ·
  `lib/book/audio-manifest.ts` · `scripts/tts_pilot/tts_targets.py` ·
  `scripts/text_harvest/dryrun_asb_bloom.py`
  · **`scripts/tts_pilot/extract_text.py`**(D10 원천 산출 스크립트 — 재실행 금지)
  · **`components/book/audio-reader.tsx`** · **`app/(reader)/book/[id]/read/page.tsx`**
- 정찰 근거: **2026-08-08 워커 읽기 전용 정찰 #1**(Book Dash html 34권 회수 가능성 —
  텍스트 원천 잔존 / 이미지 키 규칙 대조 / AudioReader 진입 조건). 본 ADR은 그 파일:라인
  근거를 D10·D13·D14와 §Context 5에 인용한다.

---

## Context

### 1. 기존 결정과 그 전제

ADR-0025 Amendment #6은 다음을 명시했다(`docs/adr/0025-asb-content-ingestion.md:223`).

> `asb_native`는 DB에 **`content_url`(raw `.txt` URL)만 보유**하고 본문 텍스트·페이지 이미지는
> 저장하지 않는다(Amd#3 A4: 자체 렌더 참조 식별자). 따라서 뷰어는 렌더 시점에 `.txt`를 받아
> `page_text`/`images` 섹션을 직접 파싱한다(A방식 확정).

이 결정의 전제는 **"열람 전용"** 이었다. 화면이 필요할 때 원본을 받아 그리면 충분했고,
서버가 본문을 따로 들고 있을 이유가 없었다.

### 2. 전제 변경

TTS 낭독 + 본문 하이라이트 요구가 추가되면서, **서버 측에 페이지 단위 확정 텍스트가
있어야만** 성립하는 기능이 생겼다.

- TTS 합성은 배치 사전 생성이다(ADR-0023 §2.4). 렌더 시점 fetch로는 대상 문자수를 미리
  셀 수 없고, 비용 통제 절차(ADR-0053 D4: dry-run 선행·승인 후 실행)를 적용할 수 없다.
- 하이라이트는 `word` speech marks의 오프셋이 **어떤 문자열 기준으로 만들어졌는지**가
  고정돼야 성립한다. 원본이 갱신되면 오프셋이 어긋난다.
- 오디오 리더(`lib/book/audio-manifest.ts:12`)는 이미 `텍스트 = book_text.text (0-based
  page_index)`를 전제로 조립된다. `book_text`가 없으면 ASb·Bloom은 이 경로를 탈 수 없다.

현 상태는 비대칭이다. Book Dash asb_native 151권은 `book_text`가 있으나 매니페스트에는
텍스트가 없고(`sync_book_dash_v2.py:355-366` — `page_text:` 비움), ASb·Bloom은 매니페스트에
텍스트가 있으나 `book_text`가 0행이다.

### 3. 실측 — 2026-08-08 전수 드라이런 (669권)

`scripts/text_harvest/dryrun_asb_bloom.py`로 `is_active=TRUE AND content_type='asb_native'`
전량을 순차 GET·파싱해 집계했다. **DB 쓰기 0 · Storage 쓰기 0 · Polly 호출 0.**

| 항목 | african_storybook | bloom | 합계 |
|---|---|---|---|
| 대상 권수 | 527 | 142 | **669** |
| fetch 성공 / 실패 | 527 / 0 | 142 / 0 | **669 / 0** |
| 무텍스트(`n_text = 0`) | 0 | 0 | **0** |
| P번호 1부터 연속 | 527 | 142 | **669** |
| P번호 비연속 | 0 | 0 | **0** |
| 텍스트 페이지 | 5,330 | 1,569 | **6,899** |
| 이미지 페이지 | 5,729 | 1,569 | **7,298** |
| `chars_billable`(정제 후) | 661,840 | 82,568 | **744,408** |
| 최장 페이지 문자수 | 680 | 418 | **680** |
| Polly 1회 요청 한도(3,000자) 초과 | 0 | 0 | **0** |
| mojibake 의심 | 0 | 0 | **0** |
| `axis_match = False` | 496 | 0 | **496** |
| `empty_pages > 0` 권수 (면수) | 2 (2면) | 19 (95면) | **21 (97면)** |

핵심은 **무텍스트 0권**이다. 669권 전량이 적재 가능하다. 아울러 P번호가 669권 전부
1부터 연속이라 축 변환에 예외 처리가 필요 없다.

`axis_diff`(= `n_text − n_image`) 분포:

| 플랫폼 | 분포 |
|---|---|
| african_storybook | `-7`:1 · `-4`:6 · `-3`:2 · `-2`:24 · **`-1`:433** · `0`:31 · `1`:11 · `2`:4 · `3`:7 · `4`:3 · `6`:1 · `7`:1 · `9`:1 · `13`:1 · `32`:1 |
| bloom | **`0`:142** (전량 일치) |

ASb는 `-1`이 433권(82.2%)으로 지배적이나 규칙으로 단정할 수 없다 — O1 참조.

> ### ※ 본 절 수치의 잠정성
>
> 위 수치는 **2026-08-08 시점 `is_active = TRUE` 기준**이며, **담당자 수동 검수가 진행
> 중이라 잠정치다.**
>
> - 검수 종료 후 활성 COUNT를 **재측정**하고, 적재 대상 CSV를 **재export**한다.
>   **2026-08-08 CSV(`asb_bloom_targets.csv`)를 재사용하지 않는다.**
> - **결정문 D1~D8은 권수와 무관하므로 재측정에 영향받지 않는다.** 권수가 바뀌면
>   §Context 3의 집계표와 비용 추산만 갱신 대상이다.
> - 무텍스트 0권·P번호 연속 669/669 같은 **구조적 판정**은 표본이 줄어도 뒤집히지 않는다
>   (활성 도서가 늘어나는 경우에만 재확인이 필요하다).

### 4. 근거 산출물

커밋 **`e2f4c14`** ("ASb/Bloom asb_native 본문 전수 드라이런 — 669권 무텍스트 0건")

| 파일 | 내용 |
|---|---|
| `scripts/text_harvest/dryrun_asb_bloom.py` | 드라이런 스크립트(파서 이식본 포함) |
| `scratchpad/text_harvest/asb_bloom_dryrun.csv` | 권별 1행 × 669행 |
| `scratchpad/text_harvest/asb_bloom_dryrun_report.json` | 플랫폼별 + 합계 집계 |
| `scratchpad/text_harvest/asb_bloom_anomalies.csv` | 이상징후 해당 권 496행 |

미커밋(재생성 가능): `asb_bloom_targets.csv`(팀장 SQL export), `_progress.jsonl`(실행 중간 로그).

### 5. 실측 — 2026-08-08 팀장 SQL Editor (Book Dash html 코호트 신규 편입 근거)

**출처: 팀장 SQL 실측 2026-08-08.** 아래 수치는 전부 이 실행 결과다(워커 DB 접근 0건).

| 항목 | 값 |
|---|---|
| `book_dash` `content_type` 분포 | `asb_native` **155** / `html` **54** |
| `book_audio` 분포 | `page`+`danielle` **1,486** · `page`+`Ruth` **530** · `cover`+`danielle` **128** · `cover`+`Ruth` **44** |
| html 코호트 중 `kind='page'` 오디오 보유 **AND** `book_text` 0행 | **44권 530면** |
| └ `is_active = true` | **34권 408면** ← **본 개정의 적재 대상** |
| └ `is_active = false` | **10권 122면** ← 이번 범위 제외(D9) |
| 면수 분포(44권) | 12면 **42권** / 13면 **2권** |
| `source_id` 형식 | 44권 **전량 UUID** |
| ASb·Bloom `asb_native` 활성 | **669** (검수 미반영, 2026-08-08 CSV 유효) |

검산: 42×12 + 2×13 = **530** ✅ / 408 + 122 = **530** ✅ / 1,486 + 530 + 128 + 44 = 2,188.

#### 5-a. 정정 이력 ① — "44권 574행"은 `page` + `cover` 합산치였다

- **종전 기재**: ADR-0054 O2 및 `docs/recon/state-audit.md` §5 — "`book_audio` 총 **574행** …
  distinct book **44권**", "44권 전량 `voice='Ruth'`, 574행".
- **실측 정정**: 574 = `page` **530** + `cover` **44** 의 합산치다.
- **본 ADR의 기준 축은 `page` 530행이다.** 표지 트랙(`kind='cover'` 44행)은 `book_text`에
  행을 만들지 않으므로(D3) 적재 면수 계산에서 제외된다.
- 사유: 종전 문서가 `kind`를 구분하지 않고 총행수를 인용해, 본문 면수와 총행수가 같은 값처럼
  읽혔다. 수치 자체는 양쪽 모두 옳으며 **집계 축만 달랐다.**

#### 5-b. 정정 이력 ② — 활성 34권의 **명단**은 정찰 #1 파생 목록과 다르다

- **종전 파생**: 정찰 #1(2026-08-08)은 34권을 `copy_bookdash_images.py:107-113`의 정예 39권에서
  무오디오 5권을 뺀 집합으로 **파생**했고, 그 명단 기준 장면 수를 **409면**으로 집계했다.
  그 파생은 "비활성 10권 = 블랙리스트 보유 오디오 10권"이라는 **가정**에 서 있었다.
- **실측 정정**: 팀장 실측은 활성 34권 **408면**이다. 면수 분포(12면 42권 / 13면 2권)와
  결합하면 **408 = 34 × 12** 가 유일해이므로, **13면 2권은 전원 비활성**이어야 한다.
- 13장면 2권의 정체(워커 로컬 실측, `scripts/tts_pilot/out/*.json` 49개 전수):
  **`who-is-our-friend`(블랙리스트)** 와 **`whose-button-is-this`(비블랙)**. 후자가 13면이므로,
  정찰 #1이 이를 활성에 넣어 409로 센 것이 어긋남의 원인이다.
- **가정이 깨진 근거**: `lib/shared/blacklist.ts:32-33`은 다음을 명시한다 —
  "주간 cron(`sync-book-dash.yml`, 일 02:00)이 `is_active=True`로 되돌리므로 `is_active=false`
  대신 **코드 측 블랙리스트로 차단**한다(cron-proof)". 즉 **블랙리스트 15권은 설계상
  `is_active=TRUE`로 유지**되며, "비활성 = 블랙리스트"는 성립하지 않는다.
- **결론**: 권수 34는 우연히 일치했으나 **구성이 다르다.** 정본은 **팀장 실측 408면**이며,
  **확정 명단은 팀장 SQL export로만 확정 가능**하다 → **O4**(적재 전 게이트).

#### 5-c. 명단과 무관하게 성립하는 사실 — 44권 전량 json 실존

활성 34권이 44권 중 어느 34권이든, **원천 JSON은 전량 존재한다.** 근거는 집합 관계다.

```
html 54
 − 무오디오 5 (a-beautiful-day · a-dancers-tale · a-fish-and-a-gift
                · a-house-for-mouse · a-tiny-seed)          ← ADR-0054 O2 실측
 − 블랙리스트 중 무오디오 5 (hugs-in-the-city · i-can-dress-myself
                · it-wasnt-me · katiitis-song · the-lion-who-wouldnt-try)
 = 44  (오디오 보유 = 팀장 실측 44권과 일치 ✅)
```

워커 로컬 실측: `scripts/tts_pilot/out/{slug}.json`은 html 54권 중 **49권** 존재하며,
**부재 5권이 위 "블랙리스트 중 무오디오 5권"과 정확히 일치**한다(= `copy_bookdash_images.py:111-112`의
"이미지 전무(무텍스트책) 5권"). 따라서 **오디오 보유 44권은 전량 json을 보유**하고,
그 부분집합인 활성 34권도 **명단과 무관하게 전량 실존**한다. → D10의 전제.

### 6. 적재 범위 합산 — 669권 → 703권

| 코호트 | 권수 | 면수 | 출처 |
|---|---:|---:|---|
| ASb `asb_native` 활성 | 527 | 5,330 | §Context 3 (2026-08-08 전수 드라이런) |
| Bloom `asb_native` 활성 | 142 | 1,569 | §Context 3 |
| **소계 (D1~D8 범위)** | **669** | **6,899** | |
| **Book Dash html 활성 (D9~D14 신규)** | **34** | **408** | §Context 5 (팀장 SQL 실측) |
| **합계** | **703** | **7,307** | |

- 669 + 34 = **703** ✅ / 6,899 + 408 = **7,307** ✅
- 신규 편입분은 전체 면수의 **5.6%** (408 ÷ 7,307 = 5.58%).
- ※ **669 쪽 수치는 §Context 3 말미의 잠정성 단서가 그대로 유효**하다(담당자 수동 검수 진행 중,
  검수 종료 후 재측정·재export). 34권 쪽은 별도 코호트라 그 재측정에 연동되지 않는다.

---

## Decision

### D0. 결정문의 적용 범위 (2026-08-08 개정 시 추가)

**D1~D8은 원문 그대로 유효하며 어떤 항목도 개정·재개되지 않는다.** 확대는 **D9~D14 추가**로만
이루어진다. 아래 표는 각 결정문이 어느 코호트에 적용되는지를 명시한다.

| 결정 | 적용 범위 | 비고 |
|---|---|---|
| **D1** 적재 결정 | **[ASb·Bloom]** | Book Dash html의 대응 결정은 **D9** |
| **D2** `page_index` = P번호 − 1 | **[ASb·Bloom]** | 대응 결정은 **D11**. 축(0-based)은 동일 |
| **D3** 표지는 `book_text` 행 없음 | **[전 코호트]** | html 34권도 표지는 `book_audio.kind='cover'`로 분리(Ruth cover 44행 실측). 개정 없음 |
| **D4** 원천 = 매니페스트 `.txt` · `asb-parser.ts` 1:1 | **[ASb·Bloom]** | 대응 결정은 **D10**(원천·파서가 다름) |
| **D5** `source` = `'manifest_txt_v1'` | **[ASb·Bloom]** | 대응 결정은 **D12**(`'html_scene_json_v1'`) |
| **D6** 정제 = `tts_targets.sanitize()` 공유 | **[전 코호트]** | html 34권도 Danielle 합성 대상(ADR-0053 Amd#3)이므로 동일 게이트 통과. 복제본 금지 |
| **D7** 빈 면도 `text=''` 행 적재 | **[전 코호트]** | 규칙은 공통. **단 html 34권의 적용 대상은 0면** — 정찰 #1 실측에서 무텍스트 면 0건 |
| **D8** `book_review` 시드하지 않음 | **[ASb·Bloom]** | **html 34권에 대해서는 본 개정이 결정하지 않는다** → **O5** |
| **D9~D14** | **[Book Dash html]** | 본 개정 신규 |

### D1. asb_native(ASb·Bloom) 본문 텍스트를 `book_text`에 적재한다

- ADR-0025 Amendment #6의 **"본문 텍스트를 DB에 저장하지 않는다"** 결정을
  **`asb_native` 중 ASb·Bloom 범위에서 개정**한다.
- 개정 사유는 §Context 2 — 결정 당시의 "열람 전용" 전제가 TTS·하이라이트 요구로 무효화됐다.
- 개정 범위는 **`book_text` 적재에 한정**한다. Amd#6의 나머지 결정(자체 렌더 방식,
  `content_url`을 뷰어 참조 식별자로 두는 것, A2·A3·A4 짝짓기 규칙)은 **전부 유효하다.**

### D2. `page_index` = 매니페스트 P번호 − 1 (0-based)

- 근거 ①: 669권 **전부** P1부터 빈칸 없이 연속이다(실측, 비연속 0권). 예외 분기가 없다.
- 근거 ②: `lib/book/asb-parser.ts:129-136`이 `texts[i]`를 `pages[i]`에 그대로 싣는다.
  P번호 − 1 = `pages[]` 인덱스이므로 뷰어 면 배열과 축이 일치한다.

```ts
const pageCount = Math.max(texts.length, images.length);
for (let i = 0; i < pageCount; i++) {
  pages.push({
    text: i < texts.length ? texts[i] : null,
    imageUrl: i < images.length ? images[i] : null,
  });
}
```

- 근거 ③: ADR-0046 D2(`page_index` 0-based) · ADR-0048 D1(Book Dash `page_no − 1`)과
  동일 규약이다. 플랫폼 간 축이 갈리지 않는다.

### D3. 표지는 `book_text`에 행을 만들지 않는다

- 표지는 `book_audio.kind='cover'` · `page_index=0` placeholder로 **분리 관리**한다
  (ADR-0034 Amd#1). `book_text`에는 표지 행이 존재하지 않는다.
- 근거: `lib/book/audio-manifest.ts:48-53`

> 표지 트랙 (ADR-0034 Amendment #1 — `book_audio.kind='cover'`, `page_index=0` placeholder).
> 본문 면과 출처가 다르다: 이미지는 `books.cover_url`, 텍스트는 `books.title`.
> Book Dash는 표지가 별도 `images/cover.jpg`이며 본문 `01.jpg`와 구분된다(ADR-0036 §1)
> — 즉 표지는 `book_text`에 행이 없다.

- 화면의 1칸 오프셋은 **리더가 처리**한다. `components/book/audio-reader.tsx:332-341`이
  표지를 `slides[0]`에 앞세우고, `components/book/asb-reader.tsx:76-85`의 `toFaces()`가
  동일하게 `faces[0]`에 `coverUrl`을 넣는다. `book_text.page_index=0`은 표지가 있을 때
  화면 2번째 면에 대응한다.
- 이는 **Book Dash asb_native 151권과 동일한 축**이며, 새로 생기는 어긋남이 아니다.

### D4. 텍스트 원천은 `books.content_url`의 매니페스트 `.txt`이며, 파싱은 `asb-parser.ts`와 1:1 일치시킨다

- 원천 경로는 플랫폼별로 다르나 **문법은 동일**하다.

  | 플랫폼 | `content_url` | 근거 |
  |---|---|---|
  | african_storybook | `https://raw.githubusercontent.com/global-asp/asp-raw-db/master/data/{source_id}.txt` (외부) | `sync_asb.py:86,303` |
  | bloom | `{supabase}/storage/v1/object/public/book-manifests/bloom-{source_id}.txt` (자체 Storage) | `sync_bloom.py:55,912-920` |

- 파싱 규칙은 `lib/book/asb-parser.ts`를 **그대로 이식**한다. 섹션 전이 조건, `^P\d+\t`
  매칭 대상(trim 전 원본 라인), `@@` → 줄바꿈 치환, 이미지 수집 조건을 모두 동일하게 둔다.
- **파서 규칙의 임의 개선을 금지한다.** 서버 사본이 화면과 어긋나면 하이라이트 오프셋이
  깨지고, 사본을 두는 목적 자체가 사라진다. 개선이 필요하면 `asb-parser.ts`를 먼저 고치고
  양쪽을 함께 바꾼다.
- 이식본은 `scripts/text_harvest/dryrun_asb_bloom.py`의 `parse_asb_text()`에 원본 라인번호
  대조 주석과 함께 이미 존재한다(669권 실행 검증 완료).

### D5. `source` 라벨 = `'manifest_txt_v1'`

- 기존 Book Dash 151권의 `'pdf_harvest_v2_orderfix'`(ADR-0048 D1)와 **구분**한다.
  출처 체인이 다르면 라벨이 달라야 한다는 ADR-0048 D1 원칙의 승계다.
- `book_text.source`는 NOT NULL이며 기본값이 제거돼 있다(마이그레이션 007, ADR-0048 D2).
  INSERT에 `source`를 명시하지 않으면 즉시 실패한다(fail-closed).

### D6. 정제는 `tts_targets.sanitize()`를 공유한다

- ADR-0053 D3의 입구 정제 게이트(엔티티 디코딩 → 제어·zero-width 제거 → 공백 정규화 →
  문장부호 뒤 공백 보정)를 **같은 함수로** 통과시킨다.
- **복제본을 만들지 않는다.** 정제 규칙이 갈리면 문자 수 기준이 갈리고, 비용 추산과 실제
  합성 입력이 어긋난다. 드라이런도 이 함수를 import해 산출했으므로 §Context 3의
  `chars_billable` 744,408자는 실제 합성 입력과 동일 기준이다.
- import 실패 시 로컬 폴백 없이 STOP한다(조용한 규칙 분기 금지).

### D7. 빈 면도 `text = ''` 행으로 적재한다 — TTS 대상 선정 단계에서만 제외 (2026-08-08 확정, 구 O2)

- 정제 후 빈 문자열이 되는 P라인도 **`book_text`에 행을 만든다**(`text = ''`).
  낭독 제외는 **적재가 아니라 대상 선정 단계**에서 처리한다.
- 근거 ①: 행을 만들지 않으면 `page_index`에 구멍이 생겨 **D2의 "P번호 − 1" 연속성이
  깨진다.** 뒤 페이지의 인덱스가 전부 밀려 뷰어 면 배열과 어긋난다.
- 근거 ②: **Book Dash 선례와 동일한 구조**다. `scripts/tts_pilot/tts_targets.py:262-265`가
  정제 후 빈 면을 `empty_pages`로 분류해 합성 대상에서 빼되, `book_text` 행 자체는 존재한다.
- 근거 ③: `book_text.text`는 **NOT NULL DEFAULT `''`**이므로 스키마상 허용된다
  (마이그레이션 006, ADR-0046).
- 적용 대상: **21권 97면** (ASb 2권 2면 / Bloom 19권 95면 — §Context 3 실측, 잠정치).

### D8. ASb·Bloom 669권은 `book_review`에 시드하지 않는다 (2026-08-08 확정, 구 O5)

- ADR-0048 D4가 Book Dash 152권에 적용한 `status='draft'` 시드를 **본 코호트에는 하지 않는다.**
- 근거 ①: **검수 목적이 다르다.** ADR-0048 D4의 시드는 PDF/OCR 산출물의 **문자 오류 검수**가
  목적이었다(ADR-0039 D1 — baked-in 텍스트를 OCR로 복원한 결과물). ASb·Bloom은 원본 확정
  텍스트를 그대로 이식하므로 **OCR 오류 유형이 존재하지 않는다.**
- 근거 ②: 현재 담당자 수동 도서 검수가 진행 중이며, **669권 추가는 2026-08-31 베타 일정에
  직접 영향한다.**
- 근거 ③: **가역적 결정이다.** 필요 시 `INSERT ... SELECT` 한 번으로 사후 시드가 가능하다.
- **적재 스크립트는 `book_review`에 어떤 행도 쓰지 않는다.**

---

## Decision — Book Dash html 코호트 (2026-08-08 개정 신규)

> 아래 **D9~D14는 전부 `source_platform='book_dash' AND content_type='html'` 코호트 전용**이다.
> ASb·Bloom 669권에는 적용되지 않으며, D1~D8을 대체하지도 않는다.

### D9. [Book Dash html] 활성 34권(408면)을 `book_text` 적재 범위에 포함한다

- 대상 = `source_platform='book_dash'` AND `content_type='html'` AND `kind='page'` 오디오 보유
  AND `book_text` 0행 AND **`is_active = true`** → **34권 408면**(팀장 SQL 실측 2026-08-08,
  §Context 5).
- 이로써 본 ADR의 총 적재 범위는 **669권 6,899면 → 703권 7,307면**이 된다(§Context 6).
- **비활성 10권(122면)은 이번 범위에서 제외한다.**
  - 사유: **비활성 사유가 미확인**이다. 사유를 모르는 채로 적재하면, 비활성화를 결정한 근거
    (라이선스·중복·품질 중 무엇인지)와 충돌할 수 있다. → **O-a**
  - **가역적 결정이다.** 사유가 규명되면 동일 절차(D10~D14)로 추가 적재할 수 있다. 원천 JSON도
    보존돼 있다(§Context 5-c — 오디오 보유 44권 전량 json 실존).
  - 제외는 **적재 범위 제외이며 도서 차단이 아니다.** `books` 행·`is_active` 값에 접촉하지 않는다.
- **`content_type`은 `'html'`을 그대로 둔다.** 변경 불필요 — 근거는 §Consequences 참조.
- **적재 전 게이트**: 34권의 **확정 slug 명단**은 팀장 SQL export로 확정한 뒤 착수한다.
  워커 파생 목록을 대상으로 쓰지 않는다(§Context 5-b의 어긋남 사유). → **O4**

### D10. [Book Dash html] 원천 = `scripts/tts_pilot/out/{slug}.json`. 재크롤 금지

- **원천은 로컬 커밋 자산이다.** `scripts/tts_pilot/extract_text.py:59,204-208`이 산출한
  `scripts/tts_pilot/out/{slug}.json`을 그대로 읽는다.
- **실존 확인(정찰 #1 실측)**: html 54권 중 **49권** 존재. 부재 5권은 전부 "블랙리스트 중
  무오디오" 권이라 대상 밖이다. **오디오 보유 44권은 전량 실존**하며, 그 부분집합인 활성
  34권도 **명단과 무관하게 전량 실존**한다(§Context 5-c).
- **git 커밋 대상임이 확인됐다** — `.gitignore:6`의 전역 `out/` 규칙에 걸리나
  `.gitignore:15-18`에서 명시 예외 처리된다.

  ```
  !scripts/tts_pilot/out/
  !scripts/tts_pilot/out/**
  scripts/tts_pilot/out/audio/          ← 재무시
  scripts/tts_pilot/out/*.tts.json      ← 재무시
  ```

  즉 순수 `{slug}.json`은 로컬 전용 자산이 아니라 **저장소 이력에 박제**돼 있다.
- **재크롤을 금지한다. `extract_text.py`를 재실행하지 않는다.**
  - 근거 ①: 원본 `bookdash.github.io`는 GH Pages/Fastly 레이트리밋이 있고 **404를 엣지에
    네거티브 캐싱**한다(`copy_bookdash_images.py:39-41`). 재크롤은 멀쩡한 책을 결손으로
    만들 위험을 새로 들인다.
  - 근거 ②: 기존 `voice='Ruth'` 음원의 marks 오프셋이 **이 JSON의 문자열**을 기준으로
    만들어졌다. 원천이 바뀌면 대조 기준선이 사라진다.
  - 근거 ③: 재크롤은 D9의 적재를 **외부 가용성에 종속**시킨다. 로컬 사본은 그렇지 않다.
- **파싱은 기존 JSON 스키마를 그대로 사용하며 임의 개선을 금지한다.**

  ```json
  [ { "page": 1, "image_url": "https://…/{slug}/en/images/01.jpg", "text": "…" }, … ]
  ```

  - `page`는 **1-based**(`extract_text.py:154`), 중첩 없는 flat 배열.
  - 스키마 변경·필드 추가·텍스트 후가공을 하지 않는다. **이유는 D4와 같다** — 서버 사본이
    음원 생성 기준 문자열과 어긋나면 하이라이트 오프셋이 깨진다.
  - 어트리뷰션 영역은 원천 단계에서 이미 제외돼 있다(`extract_text.py:96-107` —
    `<blockquote class="copyright-text">` 이전까지만 본문으로 취급). **추가 필터 불필요.**

### D11. [Book Dash html] `page_index` = JSON `page` − 1 (0-based)

- **D2(ASb·Bloom: 매니페스트 P번호 − 1)와 동일 축**이다. 플랫폼 간 축이 갈리지 않는다.
- 근거 ①: ADR-0046 D2(`page_index` 0-based) · ADR-0048 D1(Book Dash `page_no − 1`) 승계.
- 근거 ②: `page`는 `extract_text.py:154`에서 `len(scenes)+1`로 부여돼 **1부터 빈칸 없이 연속**이다.
  워커 로컬 실측(61개 json 전수): `page N ↔ 이미지 파일명 NN.jpg` **불일치 0건**. 예외 분기가 없다.
- 근거 ③: 기존 `voice='Ruth'` 오디오의 `page_index`가 **0..11(12면)** 이며(ADR-0054 O2 실측),
  D9 대상 34권은 전권 12면이다(§Context 5-b). 즉 **적재될 `book_text`와 기존 오디오 축이
  이미 정합**한다 — 재매핑이 필요 없다.

### D12. [Book Dash html] `source` 라벨 = `'html_scene_json_v1'`

- ASb·Bloom의 `'manifest_txt_v1'`(D5) 및 Book Dash 151권의 `'pdf_harvest_v2_orderfix'`
  (ADR-0048 D1)와 **구분**한다. 출처 체인이 다르면 라벨이 달라야 한다는 ADR-0048 D1 원칙의 승계다.
- 라벨 3종이 공존하게 되며, 이는 의도된 상태다.

  | 라벨 | 코호트 | 원천 |
  |---|---|---|
  | `pdf_harvest_v2_orderfix` | Book Dash `asb_native` 151권 | WP PDF → OCR |
  | `manifest_txt_v1` | ASb·Bloom 669권 | 매니페스트 `.txt` |
  | **`html_scene_json_v1`** | **Book Dash html 34권** | **GH Pages HTML 장면 JSON** |

- `book_text.source`는 NOT NULL이며 기본값이 제거돼 있다(마이그레이션 007, ADR-0048 D2).
  INSERT에 `source`를 명시하지 않으면 즉시 실패한다(fail-closed).
- **되돌리기**: `DELETE FROM book_text WHERE source = 'html_scene_json_v1'` 1문으로 34권분만
  원복된다. 669권분(`manifest_txt_v1`)과 서로 간섭하지 않는다.

### D13. [Book Dash html] 기존 `voice='Ruth'` 행은 수정·삭제·이동하지 않는다

- 대상: `page` **530행** + `cover` **44행**(팀장 SQL 실측 2026-08-08, §Context 5).
  활성 34권분뿐 아니라 **비활성 10권분도 포함해 전량 무접촉**이다.
- **근거 ① — 보존 규정 승계.** ADR-0034 `:256`:
  > v1 html 44권의 기존 `p00~` 축 오브젝트와 `voice='Ruth'` 표기 행은 **수정·삭제·이동하지 않는다.**

  ADR-0053 Non-goals `:145`("구 44권 `p00` 축·`voice='Ruth'` 표기의 신 규약 재정렬 —
  ADR-0034 Amd#2가 백로그로 이연")도 같은 방향이다. **본 개정은 이 백로그를 열지 않는다.**
- **근거 ② — 잔존해도 화면 노출이 없다.** 코드가 `danielle`만 인정한다.
  - `lib/book/audio-manifest.ts:94` — `export const DEFAULT_READER_VOICE = 'danielle';`
  - `lib/book/audio-manifest.ts:152-153` — `.eq('kind', READER_AUDIO_KIND).eq('voice', voice)`
  - `app/(reader)/book/[id]/read/page.tsx:158` — `hasReaderAudio(book.id)` 를 **voice 인자 없이**
    호출 → 기본값 `'danielle'`. `'Ruth' ≠ 'danielle'` 이므로 게이트가 `false`를 반환한다.
  - `book_audio` UNIQUE는 `(book_id, kind, page_index, voice)`이므로(ADR-0034 Amd#1),
    Danielle 행 신규 INSERT가 Ruth 행과 **충돌하지 않는다.**
- **근거 ③ — 팀장이 대안 2종을 반려했다.** 정찰 #1이 제시한 3안 중
  (가) `DEFAULT_READER_VOICE` 코드 수정 · (다) `book_audio.voice` 표기 갱신은 **반려**,
  (나) **Danielle 재생성만 채택**됐다(2026-08-08 팀장 승인). 상세는 ADR-0053 Amendment #3.
  - (가) 반려 사유: `Ruth / neural 78%`는 **2026-07-24 팀장 청취 검수에서 반려**된 음원이다
    (ADR-0052 Amd#2 기록 · ADR-0053 `:154`·`:263`). 코드를 고쳐 노출시키면 반려 판정을 뒤집는다.
  - (다) 반려 사유: 표기만 바꾸면 **DB 값과 실 파일의 성우가 괴리**된다(Storage 오브젝트는
    Ruth 음원 그대로). `book_audio.voice`가 Storage 성우 폴더명과 같아야 한다는
    ADR-0034 Amd#2 규약과 충돌한다.
- **본 결정은 Ruth 행을 "쓰레기"로 규정하지 않는다.** 비교·폴백 자산으로 남긴다
  (ADR-0053 Amd#1 A1이 `ruth-neural` 프리셋을 폐기하지 않고 남긴 것과 같은 취지).

### D14. [Book Dash html] 이미지 URL은 현행 조립을 유지한다 — **잠정 조치**

- `lib/book/audio-manifest.ts`의 현행 조립을 **그대로 둔다.** 코드 변경 0건.

  ```ts
  const slug = book.source_id;                                    // :275
  const nn   = String(pageIndex + 1).padStart(2, '0');            // :282
  imageUrl: `${imageBase}/${IMAGE_STORAGE_PREFIX}/book_dash-${slug}/${nn}.jpg`   // :289
  ```

- **근거 — 실제 업로드 키와 문자열 수준 완전 일치**(정찰 #1 2-2 대조).
  업로드 측은 `scripts/copy_bookdash_images.py:14`(키 규약 주석)·`:139`(`book_key` 생성)·
  `:177`(`plan` 키 조립)이다.

  | 대조 축 | 조립(`audio-manifest.ts`) | 실제 업로드(`copy_bookdash_images.py`) | 판정 |
  |---|---|---|---|
  | 버킷 | `book-images` (`:29`) | `book-images` (`:78`) | ✅ |
  | 접두사 | `book_dash-` (밑줄) (`:289`) | `book_dash-` (밑줄) (`:14,79,139`) | ✅ |
  | 접두사 뒤 값 | `books.source_id` (`:275`) | `source_id` UUID (`:126,138-139`) | ✅ |
  | 진법 | 1-based (`pageIndex+1`, `:282`) | 1-based (원본 파일명 승계, `:160`) | ✅ |
  | 자릿수 | 2자리 `padStart(2,'0')` (`:282`) | 2자리 zero-pad (`:14`) | ✅ |
  | 확장자 | `.jpg` (`:289`) | `.jpg` / `image/jpeg` (`:81,177`) | ✅ |

  §Context 5의 "`source_id` 44권 전량 UUID"(팀장 실측)가 3행째 전제를 확증한다.
- **따라서 이 코호트는 이미지 재업로드·키 마이그레이션이 필요 없다.** 버킷 기존 자산
  (정예 39권 508객체, ADR-0036 Amd#1)을 그대로 쓴다.
- **본 결정은 잠정 조치다.** 안건 3(ASb·Bloom 이미지 URL 방식, **A-1안** 등)은 **여전히 미결**이며
  **본 개정의 대상이 아니다.** A-1안이 채택되면 **이 코호트도 그 방식에 흡수**되므로, D14는
  그때까지의 현상 유지 선언이다. D14를 근거로 A-1안을 배제하지 않는다.
- 참고(범위 밖): `audio-manifest.ts:289`의 `book_dash-` 접두사는 **하드코딩**이라 타 플랫폼
  (ASb·Bloom·GDL)에서는 조용히 404를 만든다. **Book Dash html 코호트에는 발생하지 않으며**,
  타 플랫폼 대응은 안건 3 소관이다.

---

## Consequences

### 얻는 것

- 669권이 TTS·하이라이트·검수 화면 대상이 된다. 현재 이 세 기능은 `book_text` 없이는
  동작하지 않는다.
- 합성 전 비용이 확정 가능해진다(ADR-0053 D4 절차 적용 가능).
- 플랫폼 3종(Book Dash·ASb·Bloom)의 본문 축이 `book_text.page_index` 0-based로 통일된다.

### 잃는 것 / 감수하는 것

- **뷰어(`AsbReader`)는 변경하지 않는다.** 계속 `content_url`을 렌더 시점 fetch한다.
  `book_text`는 **TTS·검수·하이라이트용 서버 측 사본**이며, 화면의 진실은 여전히 원본
  `.txt`다. 즉 같은 텍스트가 두 곳에 존재하는 상태를 의도적으로 받아들인다.
- **원본 `.txt`가 갱신되면 `book_text`와 어긋날 수 있다.** 현재 ASb·Bloom sync는 수동
  전용이고(자동 동기화 cron은 Book Dash·GDL 대상, 2026-08-07 기준 disabled), 마지막 유입
  이후 원본 변동을 감시하는 장치가 없으므로 즉시 문제는 아니다. 다만 재동기화 시
  `book_text` 갱신 절차가 반드시 필요하다 — **O2 참조**.
- ASb 527권은 외부 GitHub raw에 의존한다. 적재 시점 1회 fetch로 사본을 뜨는 것이므로
  이후 외부 가용성에 종속되지 않으나, 재동기화는 외부 가용성에 종속된다.

### 얻는 것 — Book Dash html 34권 (D9~D14 신규)

- **34권이 `content_type='html'`을 유지한 채 AudioReader로 진입한다. `content_type` 변경이
  불필요하다.**
  - 근거: 오디오 리더 분기(`app/(reader)/book/[id]/read/page.tsx:158`)가
    `switch (book.content_type)`(`:195`)보다 **앞**에 있다. `hasReaderAudio()`가 참이면
    `content_type`을 보지 않고 `AudioReader`를 반환한다(`:173-189`).
  - 진입 조건은 3개뿐이며(정찰 #1 3-1 실측), **`content_type` 검사·플랫폼 화이트리스트·
    페이지 수 일치 검사는 전부 존재하지 않는다.**
    1. `hasReaderAudio(book.id)` (`:158`) — `kind='page'` + `voice='danielle'` 행 존재
    2. `audioBook !== null` (`:160`) — `books` 행 존재
    3. `audioBook.audioPageCount > 0` (`:160`, `audio-manifest.ts:312`)
  - 즉 **`book_text` 적재(D9) + Danielle 재생성(ADR-0053 Amd#3) 두 가지만으로 회수가 완결**된다.
    DB 스키마·`books.content_type`·뷰어 코드 어느 것도 건드리지 않는다.
- **세로 스크롤 iframe에서 수평 슬라이드로 전환된다.** `AudioReader`는 가로축 스와이프
  (`components/book/audio-reader.tsx:749-752`)와 좌우 이동 버튼(`:868-874`·`:906-912`),
  3D 플립 전환(`:891-898`)을 갖는 **면 단위 수평 슬라이드**다. 이는 ADR-0054 D2가 겨냥한
  목표와 동일한 결과이며, 그 트랙의 대체 경로가 된다(ADR-0054 Amendment #1).
- **이미지 재작업이 없다.** 버킷 기존 자산을 그대로 쓴다(D14). PDF 재하베스트·렌더·재업로드
  비용이 0이다.
- **ADR-0054 O2(오디오 `page_index` 재매핑 미확정 게이트)가 34권 범위에서 소멸한다.**
  기존 Ruth 축(0..11)과 적재될 `book_text` 축(12면)이 이미 정합하기 때문이다(D11 근거 ③).

### 잃는 것 / 감수하는 것 — Book Dash html 34권

- **해상도.** GH Pages 이미지는 스프레드 1134×567 · 단면 567×567로, 152권 코호트
  (1600×800 / 1600×1600) 대비 **면당 가로 해상도 약 70%**다(ADR-0054 §C2 실측).
  ADR-0054 D2가 경로 (A)를 기각한 사유가 이것이며, **본 경로는 그 열위를 감수한다.**
  대가로 PDF 재하베스트 전 공정과 O2 게이트를 면제받는다. → 판단 근거는 ADR-0054 Amendment #1.
- **면 수가 12면으로 고정된다.** 152권 코호트 표준(13 스프레드 + 1 뒤표지 = 14면)과 다르다.
  같은 서비스 안에서 코호트별 면 구성이 갈리는 상태를 받아들인다.
- **Ruth 음원 530 + 44행이 DB에 잔존한다**(D13). 화면 노출은 없으나 행은 남는다.
- **`content_type='html'`인 채로 AudioReader를 타는 책이 생긴다.** `content_type`이 렌더 경로를
  결정하지 않는 첫 사례다. 값의 의미가 "원천 형식"과 "렌더 경로" 사이에서 흐려진다 —
  현재 코드가 이를 이미 허용하므로 즉시 문제는 아니나, 향후 `content_type` 기반 분기를
  추가할 때 이 코호트가 예외가 된다.

### 되돌리기

- ASb·Bloom: `DELETE FROM book_text WHERE source = 'manifest_txt_v1'` 1문으로 원복된다.
- Book Dash html: `DELETE FROM book_text WHERE source = 'html_scene_json_v1'` 1문으로 원복된다.
- `source` 라벨을 D5·D12로 분리한 이유 중 하나다. **두 코호트는 서로 간섭 없이 개별 원복된다.**
  스키마 변경은 없다.

---

## Non-goals

- `AsbReader` 렌더 경로 변경(`book_text`를 읽도록 바꾸는 것). 본 ADR 범위 밖이다.
- ASb·Bloom TTS 실제 합성·Storage 업로드·`book_audio` INSERT(별도 작업지시서).
- GDL 464권의 본문 확보(별도 트랙, ADR-0055 C안 판정 보류 상태).
- Book Dash asb_native 151권의 `source` 라벨 재정렬.
- (구 항목) `book_review` 시드 여부는 **D8로 결정**됐다 — 더 이상 Non-goal이 아니다.

### Non-goals — Book Dash html 코호트 (2026-08-08 개정 신규)

- **34권 TTS 실제 합성·Storage 업로드·`book_audio` INSERT.** 사양 확대는 ADR-0053 Amendment #3에
  기록되나, **실행은 dry-run 승인 절차(ADR-0053 D4)를 거쳐 별도 작업지시서**로 한다.
- **비활성 10권(122면)의 적재.** D9에서 제외 — 사유 규명 후 별도 판단(O-a).
- **`voice='Ruth'` 행 530 + 44의 정리·재정렬·삭제.** D13이 무접촉을 명시했다.
  ADR-0034 Amd#2 백로그를 열지 않는다.
- **`content_type='html'` → `'asb_native'` 전환.** 불필요하다(§Consequences).
  34권은 ADR-0054 D2 대상에서 제외된다(ADR-0054 Amendment #1).
- **ADR-0054 잔여 전환 대상의 처리.** 34권을 뺀 나머지는 ADR-0054 소관이다.
- **안건 3(ASb·Bloom 이미지 URL 방식 · A-1안)의 판정.** D14는 잠정 조치일 뿐 그 안건을
  선점하지 않는다.
- **`audio-manifest.ts:289`의 `book_dash-` 하드코딩 해소.** 타 플랫폼 대응은 안건 3 소관이다.
- **블랙리스트 15권의 해제·복구**(ADR-0054 D1-c에서 이연된 상태 유지).

---

## Open Questions

### O1. `axis_diff ≠ −1`인 ASb 94권의 텍스트↔이미지 짝 정합 — **미판정**

- `asb-parser.ts:129-136`은 `max(N,M)` **느슨 정렬**을 쓴다(ADR-0025 Amd#6 A2·A4:
  강제 1:1·번호 정렬 매핑 금지). 따라서 `pages[i].text`와 `pages[i].imageUrl`의 짝이
  원본 의도와 맞는지는 **코드로 판정할 수 없다.**
- ASb 527권 중 `-1`이 433권으로 지배적이나, 나머지 94권은 `-7`~`+32`로 흩어져 있다.
  `+32`(1권) 같은 값은 텍스트가 이미지보다 32개 많다는 뜻이다.
- **TTS는 비차단이다** — 합성은 텍스트 순서만 쓰고 이미지를 참조하지 않는다.
- **하이라이트·검수 화면 표시 위치에는 영향이 있다** — 어떤 이미지 옆에 어떤 문장이
  붙는지가 달라진다.
- 해소 방법: `asb_bloom_anomalies.csv`의 94권 중 표본 `.txt` 원문에서 `P<n>` 라인과
  `images:` 줄 순서를 육안 대조한다. 대표 후보: `10427`(7/9) · `14514`(10/13) ·
  `14534`(9/13) · `axis_diff=+32` 1권.

### O2. 원본 `.txt` 갱신 시 `book_text` 재동기화 절차 — **미설계**

- 재적재 방식(전량 DELETE 후 INSERT / 권 단위 upsert / 변경분만), 검수 화면에서 사람이
  수정한 텍스트(`lib/admin/review/actions.ts:181` `book_text.text` UPDATE)를 덮어쓸지
  보존할지, 갱신 감지 방법(해시 비교 등)이 전부 미정이다.
- 사람 수정본을 원본 재동기화가 덮어쓰면 검수 노동이 소실된다 — 설계 시 필수 고려 사항.

### O3. Bloom 매니페스트의 ADR-0028 Amd#4 적용 여부 — **사실상 해소, 코드 경로 확인 미완**

- 드라이런에서 Bloom 142권 **전부** 텍스트를 보유하고 `axis_diff=0`(142/142)으로 확인돼
  실측상으로는 해소됐다.
- 다만 `sync_bloom.py`에는 텍스트 없는 매니페스트를 만드는 `build_manifest_from_urls()`
  (`:483`)가 정의만 되어 있고 호출부가 없는 것으로 보이며, 실제 사용 경로가
  `build_bloom_manifest_text()`(`:504,558`) 단일인지는 전수 확인하지 않았다.
- 비차단 항목이다. 적재 결과에 영향이 없다.

### O4. 활성 34권의 **확정 slug 명단** — **미확정 · D9 적재 전 게이트 (차단)**

- **본 개정에서 유일한 차단 항목이다.** 권수(34)와 면수(408)는 팀장 SQL 실측으로 확정됐으나,
  **어느 34권인지는 확정되지 않았다.**
- 사유: `is_active`는 DB만 아는 값이고, 워커는 DB 접근 권한이 없다. 정찰 #1의 파생 목록은
  "비활성 10 = 블랙리스트 10"이라는 가정에 서 있었으나 그 가정은 깨졌다
  (`lib/shared/blacklist.ts:32-33` — 블랙리스트 15권은 설계상 `is_active=TRUE` 유지). §Context 5-b.
- **해소 방법**: 팀장이 아래 조건으로 SQL export → 워커가 그 CSV를 적재 대상으로 사용한다.

  ```
  source_platform='book_dash' AND content_type='html' AND is_active=true
    AND EXISTS(book_audio WHERE kind='page')  AND NOT EXISTS(book_text)
  ```

- **검산 기준 ①**: 반환 행 **34권**, `slug`(= `content_url`에서 추출) 기준 각 권의
  `scripts/tts_pilot/out/{slug}.json` 장면 수 합계가 **408**이어야 한다.
  - **불일치 시 그 자체가 정지 사유다.** 특히 `whose-button-is-this`(13장면)가 결과에 포함되면
    합계가 409가 되어 실측 408과 어긋난다 → 원인 규명 전 적재 금지.
- **검산 기준 ② — 블랙리스트 교집합을 반드시 함께 조회한다.**
  - **34권에 블랙리스트 도서가 섞여 있을 수 있다.** D9의 대상 정의에는 블랙리스트 조건이
    없고, `lib/shared/blacklist.ts:32-33`에 따라 **블랙리스트 15권은 설계상 `is_active=TRUE`로
    유지**되기 때문이다. 오디오 보유 블랙리스트 도서는 **10권**이다(ADR-0054 O2 실측).
  - 블랙리스트 도서는 5개 표면(랜딩·추천·카테고리·상세·뷰어)에서 차단돼 **사용자에게 노출되지
    않는다.** 그런 권에 `book_text`를 적재하고 Danielle을 합성하면 **보이지 않는 책에 비용이
    투입**된다.
  - 따라서 export SQL에 `source_id IN (BOOK_DASH_404_SOURCE_IDS)` 플래그 컬럼을 함께 넣어
    **교집합 권수를 보고**한다. 교집합이 0이 아니면 **적재 범위에서 뺄지 여부를 팀장이 결정**한다.
    본 ADR은 그 선택을 하지 않는다.
- **검산 기준 ③ — ADR-0054 Amd#1 E4와 같은 회차에 조회한다.** 두 값이 서로 검산된다:
  `E4의 moved_to_adr0056`(= D2 대상 38권 중 이관분) + `maddy-moona` 포함 여부 + 블랙리스트
  교집합 = **34**여야 한다.
- 추정: `whose-button-is-this`는 비활성일 것으로 보이나(408 = 34×12 유일해), **비활성 사유는
  확인되지 않았다.** 이 추정을 적재 근거로 쓰지 않는다.

### O5. Book Dash html 34권의 `book_review` 시드 여부 — **미결정 (비차단)**

- D8은 **ASb·Bloom 669권**에 대한 결정이며, 34권에는 적용 범위를 확대하지 않았다(D0 표).
- 판단 재료(사실만 기록):
  - D8 근거 ①("OCR 오류 유형이 존재하지 않는다")은 34권에도 **성립**한다 — 원천이 원본 HTML의
    `<p>` 텍스트이지 OCR 산출물이 아니다(`extract_text.py:126-131`).
  - 반면 Book Dash 152권은 ADR-0048 D4로 **시드돼 있다.** 같은 플랫폼 안에서 시드 유무가
    갈리게 된다.
  - TTS는 어느 쪽이든 비차단이다 — ADR-0053 D1이 `confirmed` 상태 게이트를 폐지했다.
- **가역적이다.** `INSERT ... SELECT` 한 번으로 사후 시드가 가능하다.
- 적재 착수를 막지 않는다. 미결정 상태에서는 **적재 스크립트가 `book_review`에 쓰지 않는다**
  (D8의 실행 규칙을 보수적으로 준용).

### O-a. 비활성 10권(122면)의 비활성 사유 — **미확인 (비차단)**

- D9가 이 10권을 범위에서 제외한 직접 사유다.
- **중복 비활성화 231권과의 포함 관계가 대조되지 않았다.** 10권이 그 231권의 부분집합인지,
  별개 사유(라이선스·품질·404)인지 불명이다.
- 해소 방법: 팀장이 10권의 `id`·`slug`·비활성화 시점·직전 배치 이력을 조회해 사유를 특정한다.
  사유가 "중복"이면 적재 가치가 없고, "일시 품질"이면 D10~D14 절차로 편입 가능하다.
- 비차단 — 34권 적재는 이 10권과 무관하게 진행된다.

### O-b. "오디오 있는데 비활성 11권" 중 1권의 소재 — **미확인 (비차단)**

- 팀장 실측에서 오디오 보유·비활성 도서가 **11권**으로 집계됐으나, §Context 5의 html 44권
  기준 비활성은 **10권**이다. **차이 1권이 이 44권 밖에 존재**한다.
- 즉 html 코호트가 아닌 곳(`asb_native` 155권 또는 타 플랫폼)에 오디오 보유·비활성 도서가
  1권 있다는 뜻이다. 소재·사유 모두 미확인이다.
- **비차단** — D9의 대상 정의(`content_type='html'`)에 걸리지 않으므로 적재 범위에 영향이 없다.
- 해소 방법: `book_audio` 보유 AND `is_active=false` 전체를 `source_platform`·`content_type`별로
  집계해 그 1권을 특정한다.

### O-d. `Slide.imageUrl` non-null 설계 — **ASb·Bloom 적재 시 재검토 필요 (34권 비차단)**

- `components/book/audio-reader.tsx:311`의 `Slide.imageUrl`과
  `lib/book/audio-manifest.ts:39`의 `ReaderAudioPage.imageUrl`은 **둘 다 `string`(non-null)** 이다.
  `audio-manifest.ts:289`가 항상 문자열을 조립하므로 **"이미지 없음"을 표현할 방법 자체가 없다.**
- 결손 시 동작(정찰 #1 3-3 실측): `<img onError>`(`audio-reader.tsx:183`) →
  `phase='failed'` → `return null`(`:167-169`). **런타임 에러 없이 해당 칸만 빈 렌더**이며
  폴백 이미지가 없다. 자막·오디오·컨트롤은 정상 동작한다.
- **Book Dash html 34권은 비차단**이다 — D14에서 키 일치가 확인돼 결손 발생이 예상되지 않는다.
- **ASb·Bloom 669권 적재 시에는 재검토가 필요하다.**
  - `audio-manifest.ts:289`의 `book_dash-` 접두사가 하드코딩이라 ASb·Bloom은 **전 면이 404**가 되고,
    그 결과가 **에러가 아니라 빈 화면**이다. 즉 실패가 조용하다.
  - O1(ASb 94권 `axis_diff ≠ −1`)과 겹치면 "어느 이미지가 어느 텍스트에 붙는지"에 더해
    "이미지가 아예 안 뜨는지"까지 육안 확인이 어려워진다.
  - 안건 3(이미지 URL 방식 · A-1안) 판정 시 **결손 표현 방식(`imageUrl: string | null` 전환 여부,
    폴백 렌더 유무)을 함께 결정**할 것을 권고한다.

### 확정으로 이동한 항목 (이력 보존)

| 구 번호 | 항목 | 처리 |
|---|---|---|
| 구 O2 | 정제 후 빈 면(21권 97면)의 처리 | **D7로 확정 (2026-08-08)** — `text=''` 행 적재, TTS 대상 선정에서만 제외 |
| 구 O5 | `book_review` 시드 여부(ASb·Bloom) | **D8로 확정 (2026-08-08)** — 시드하지 않음 |

> **채번 주의**: 위 표의 "구 O5"(ASb·Bloom `book_review` 시드)는 D8로 소진됐다.
> 본 개정에서 신설한 **O5는 Book Dash html 34권의 시드 여부**로 주제가 다르다.

### Open 현황 요약 (2026-08-08 개정 후)

| # | 항목 | 범위 | 차단 여부 |
|---|---|---|---|
| O1 | ASb 94권 텍스트↔이미지 짝 정합 | ASb | 비차단 |
| O2 | 원본 `.txt` 갱신 시 재동기화 절차 | ASb·Bloom | 비차단 |
| O3 | Bloom 매니페스트 코드 경로 확인 | Bloom | 비차단 |
| **O4** | **활성 34권 확정 slug 명단** | **Book Dash html** | **⛔ 차단 — 적재 전 게이트** |
| O5 | 34권 `book_review` 시드 여부 | Book Dash html | 비차단 |
| O-a | 비활성 10권 비활성 사유 | Book Dash html | 비차단 |
| O-b | 오디오 보유·비활성 11권 중 1권 소재 | 전 코호트 | 비차단 |
| O-d | `Slide.imageUrl` non-null 결손 표현 | ASb·Bloom(주) | 비차단 |

**ASb·Bloom 669권 적재는 O1·O2·O3 전부 비차단이므로 착수 가능**하다(기존 판정 유지).
**Book Dash html 34권 적재는 O4 해소가 선행 조건**이다.

---

## References

| ADR | 참조 지점 |
|---|---|
| ADR-0025 Amd#3 | 자체 렌더 결정 · `content_url`을 뷰어 참조 식별자로 정의(A4) |
| ADR-0025 Amd#6 | **본 ADR의 개정 대상** — 본문 텍스트 DB 미저장 결정, `.txt` 구조, 짝짓기 A2·A3·A4 |
| ADR-0028 Amd#4 | Bloom 본문 텍스트 레이어(`lang="en"` 추출 → 매니페스트 `page_text`) |
| ADR-0028 Amd#5 | 인코딩 정정(UTF-8 강제) · 무텍스트 게이트 |
| ADR-0034 Amd#1 | `book_audio.kind='cover'` · `page_index=0` placeholder |
| ADR-0034 Amd#2 | 1-based 파일명 축(`NN = page_index + 1`) · 성우 층위 키 |
| ADR-0039 D1 | Book Dash 154권이 OCR 트랙으로 간 사유(baked-in) — ASb·Bloom 비해당 근거 |
| ADR-0046 D2 | `page_index` 0-based |
| ADR-0046 D3 | `text`=낭독본(TTS 입력) / `blocks`=검수 원본 |
| ADR-0047 | 적재 대상을 사전 게이트 산출값으로 확정하는 방식(사후 합리화 금지) |
| ADR-0048 D1 | `source` 라벨 명시 적재 — D5의 선례 |
| ADR-0048 D2 | `source` 기본값 제거(fail-closed, 마이그레이션 007) |
| ADR-0048 D4 | `book_review` draft 시드 — D8이 본 코호트에 대해 배제한 선례 |
| ADR-0053 D3 | 입구 정제 게이트 — D6이 승계 |
| ADR-0053 D4 | dry-run 선행·승인 후 실행 |
| ADR-0053 D6 | 실행 경계 — 워커 DB 읽기 허용, 쓰기·업로드는 팀장 영역 |
| **ADR-0053 `:145`** | **Non-goals — 구 44권 `p00` 축·`voice='Ruth'` 재정렬 이연. D13이 승계** |
| **ADR-0053 `:154`·`:263`** | **`Ruth / neural 78%` 2026-07-24 팀장 청취 반려 기록 — D13 근거 ③** |
| **ADR-0053 Amd#3** | **Danielle 적용 범위 669권 → 703권 확대 (본 ADR D9의 34권 편입)** |
| **ADR-0052 Amd#2** | **`Danielle / long-form / atempo 0.85` 확정 · Ruth 반려 원 기록** |
| **ADR-0034 `:256`** | **v1 html 44권 Ruth 행 보존 규정 — D13 근거 ①** |
| **ADR-0036 D2** | **`book-images` 키 = `book_dash-{source_id}/NN.jpg` — D14 대조 기준** |
| **ADR-0036 Amd#1** | **정예 39권(508객체) 확정 · 이미지 결손 15권 제외** |
| **ADR-0014 Amd#5·#6** | **블랙리스트 15권 — `lib/shared/blacklist.ts` 단일 공급원** |
| **ADR-0054 D2** | **html → `asb_native` 전환 트랙 — Amendment #1로 34권이 대상에서 제외됨** |
| **ADR-0054 O2** | **오디오 `page_index` 재매핑 게이트 — 34권 범위에서 D11로 소멸** |

### 코드 참조 (D9~D14 근거)

| 파일:라인 | 내용 |
|---|---|
| `scripts/tts_pilot/extract_text.py:59,204-208` | 원천 산출 경로 `out/{slug}.json` — D10 |
| `scripts/tts_pilot/extract_text.py:154` | `page` 1-based 부여 — D11 |
| `scripts/tts_pilot/extract_text.py:96-107` | 어트리뷰션(`copyright-text`) 본문 제외 — D10 |
| `.gitignore:6,15-18` | `out/` 전역 무시 + `tts_pilot/out/` 명시 예외 — D10 |
| `scripts/copy_bookdash_images.py:14,139,177` | 실제 업로드 키 규약 — D14 대조 |
| `scripts/copy_bookdash_images.py:39-41` | GH Pages 레이트리밋·404 네거티브 캐싱 — D10 재크롤 금지 근거 ① |
| `scripts/copy_bookdash_images.py:111-112` | 이미지 전무 5권(= json 부재 5권) — §Context 5-c |
| `lib/book/audio-manifest.ts:94,152-153` | `DEFAULT_READER_VOICE='danielle'` 게이트 — D13 근거 ② |
| `lib/book/audio-manifest.ts:275,282,289` | 이미지 URL 조립 — D14 |
| `app/(reader)/book/[id]/read/page.tsx:158,160,195` | AudioReader 분기가 `content_type` switch보다 앞 — §Consequences |
| `components/book/audio-reader.tsx:749-752,868-874,906-912` | 가로축 스와이프·좌우 버튼 = 수평 슬라이드 |
| `components/book/audio-reader.tsx:167-169,183` | 이미지 결손 시 빈 렌더 — O-d |
| `lib/shared/blacklist.ts:32-33` | 블랙리스트는 `is_active=TRUE` 유지(cron-proof) — §Context 5-b |
