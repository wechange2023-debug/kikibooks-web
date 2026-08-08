# ADR-0056: asb_native 본문 텍스트의 book_text 적재 (ADR-0025 Amd#6 개정)

## Status

**Proposed** (2026-08-08) / 기준 HEAD `e2f4c14`
본 문서는 **결정 제안만** 담는다. 적재 스크립트·SQL·DB 작업은 승인 후 별도 작업지시서에서 수행한다.
근거가 되는 **669권 전수 드라이런은 이미 완료**되어 산출물이 커밋돼 있다(§Context 참조).
**2026-08-08 팀장 검수**: D1~D6 승인, 구 O2·O5를 **D7·D8로 승격 확정**. 잔여 Open 3건은 전부 비차단.

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
- 구현 참조: `lib/book/asb-parser.ts` · `components/book/asb-reader.tsx` ·
  `lib/book/audio-manifest.ts` · `scripts/tts_pilot/tts_targets.py` ·
  `scripts/text_harvest/dryrun_asb_bloom.py`

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

---

## Decision

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

### 되돌리기

- `DELETE FROM book_text WHERE source = 'manifest_txt_v1'` 1문으로 원복된다.
  `source` 라벨을 D5로 분리한 이유 중 하나다. 스키마 변경은 없다.

---

## Non-goals

- `AsbReader` 렌더 경로 변경(`book_text`를 읽도록 바꾸는 것). 본 ADR 범위 밖이다.
- ASb·Bloom TTS 실제 합성·Storage 업로드·`book_audio` INSERT(별도 작업지시서).
- GDL 464권의 본문 확보(별도 트랙, ADR-0055 C안 판정 보류 상태).
- Book Dash asb_native 151권의 `source` 라벨 재정렬.
- (구 항목) `book_review` 시드 여부는 **D8로 결정**됐다 — 더 이상 Non-goal이 아니다.

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

### 확정으로 이동한 항목 (이력 보존)

| 구 번호 | 항목 | 처리 |
|---|---|---|
| 구 O2 | 정제 후 빈 면(21권 97면)의 처리 | **D7로 확정 (2026-08-08)** — `text=''` 행 적재, TTS 대상 선정에서만 제외 |
| 구 O5 | `book_review` 시드 여부 | **D8로 확정 (2026-08-08)** — 시드하지 않음 |

잔여 Open 3건(O1·O2·O3)은 **전부 비차단**이다. 적재 착수를 막지 않는다.

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
