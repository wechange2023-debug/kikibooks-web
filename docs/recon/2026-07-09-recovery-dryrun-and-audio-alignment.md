# 정찰 2026-07-09 (3)

> 결손 15권 전수 드라이런(WP, 읽기 전용) + 이미지↔오디오 페이지 정렬 검증.
> 워커: Claude Code. HEAD 59cd126 기준. DB 쓰기·Storage 쓰기·sync 스크립트 실행 0건
> (카나리아 실험 보호 — books 테이블 UPDATE/INSERT 유발 코드 미실행).

---

## STEP 1 — 성공 레시피 확정 · UUID→slug 매핑 · 206목록 불완전성

### 1-1. 성공 레시피 = ADR-0027 Amendment #4 (GH Pages 아님)

- 직전 세션 20/20 200은 **bookdash.org WP** 대상 Amd#4 레시피(`0027:177-183`:
  `GET https://bookdash.org/books/{slug}/` → `div#read-book` 격리 → img `data-src` 수집 →
  `wp-content/uploads` 필터 → `-WxH` 제거 → 중복 제거) + 표지 = WP `featured_media`(`0027:187`)로 얻었다.
- 실제 성공 URL 원문 1건 (a-tiny-seed page2, HEAD 200 · image/jpeg · 1,820,579B):
  `https://bookdash.org/wp-content/uploads/2015/02/a-tiny-seed_en_20200616_page4.jpg`
- ADR-0035 §1의 GH Pages 경로(`bookdash.github.io/bookdash-books/{slug}/en/images/NN.jpg`)는
  이 15권에 대해 ADR-0036 Amd#1(`0036:116-123`)이 **영구 404를 이미 확정**한 경로로, 이번 성공과 무관.

### 방법론 주기 (지시서 2-3과의 정합)
Amd#4가 확정한 사실: WP 파일명은 **공식화 불가**(`0027:170-175` — stem·날짜·zero-pad 책마다 상이)
→ slug만으로 pageN URL을 조립하는 순수 연속 탐침이 **원리적으로 불가능**하다.
따라서 책당 HTML/JSON **GET 2건**(WP API 1 + 책 페이지 HTML 1 — 이미지 바이트 아님)으로
URL 목록을 발견한 뒤, **이미지에는 HEAD만** 사용했다: cover 1건 + 발견 목록 순서대로
연속 HEAD, 최초 404에서 그 책 종료, 상한 60. 이미지 GET(다운로드) 0건.

### 1-2. UUID→slug 매핑 소스 (v1 코호트)

| 소스 | 내용 | 근거 |
|---|---|---|
| `lib/shared/blacklist.ts:35-53` | 결손 15권 UUID 배열 + **각 항목 옆 slug 주석** | 본 STEP 2의 1차 매핑 |
| `scratchpad/tts_recon_49.csv` | 49권 `id,source_id(UUID),slug,…` | 교차 검증(예: `:7` hippo, `:9` hugs, `:13` it-wasnt-me, `:35` springloaded — UUID 일치 확인) |
| `scripts/copy_bookdash_images.py:94-100` | DONE_BOOKS 5권 (slug, UUID) 튜플 | B집합 5권 버킷 키 조립에 사용 |

drift 2권의 WP 조회용 slug는 ADR-0027 Amd#3(`0027:150`):
`little-sock`→`little-sock-and-the-tiny-creatures`, `mrs-penguins-palace`→`mrs-penguins-perfect-palace`.
15권 전부 slug 확정 — **매핑실패 0건**.

### 1-3. springloaded가 206목록에 없었던 이유

- 206목록 생성 주체: `scripts/sync_book_dash_v2.py`의 `fetch_english_slugs`(`:107-141`),
  산출 기록: `scratchpad/bookdash_dryrun_full.txt`(`:11` `X-WP-Total=206`).
- 필터 조건 원문 (`sync_book_dash_v2.py:119-124`):
  ```python
  params = {
      "languages": ENGLISH_LANG_TERM,   # = 621 (:61 "languages taxonomy term id (정찰 실측)")
      "per_page": WP_PER_PAGE,
      "page": page,
      "_embed": 1,
  }
  ```
- 즉 206목록 = **`languages=621` taxonomy가 붙은 책만**. slug 직접 조회(`books?slug=…`)는 이 필터를
  타지 않으므로 springloaded가 조회된다(직전 세션 + 본 세션 실측). → **206목록은 "WP 전체"가 아니라
  "언어 태그가 정리된 부분집합"** — 전수 드라이런의 모집단 정의로 부적합. 본 드라이런은
  slug 직접 조회로 수행했고, 각 책의 `languages` 필드 실측값을 결과에 기록했다(아래 표 비고).

---

## STEP 2 — 결손 15권 전수 드라이런 결과표

### 결과: **15/15 전권 원본 생존 — 404 0건**

대조군 a-tiny-seed 선행 PASS(cover 200 + 본문 14/14 전부 200) 후 15권 전량 실행.
각 책: WP API GET 1 + HTML GET 1(이미지 바이트 아님) + cover HEAD 1 + 본문 추출 목록 연속 HEAD
(최초 404 시 종료, 상한 60 — 도달 책 없음). 총 **290요청**(대조군 17 + 대상 273), 요청 간 0.6s.

| slug (v1) | cover 200? | 확인된 최대 page N | 404 최초 지점 | 총 요청 수 | 비고(WP langs) |
|---|---|---:|---|---:|---|
| the-lion-who-wouldnt-try | 200 | 14 | 없음 | 17 | [621] |
| i-can-dress-myself | 200 | 14 | 없음 | 17 | **[643]** |
| hugs-in-the-city | 200 | 14 | 없음 | 17 | [621] |
| katiitis-song | 200 | 15 | 없음 | 18 | [621] |
| hippo-wants-to-dance | 200 | 15 | 없음 | 18 | [621] |
| it-wasnt-me | 200 | 14 | 없음 | 17 | [621] |
| little-sock (WP: little-sock-and-the-tiny-creatures) | 200 | 18 | 없음 | 21 | [621] |
| shongololos-shoes | 200 | 14 | 없음 | 17 | [621] |
| springloaded | 200 | 14 | 없음 | 17 | **[643]** |
| the-elephant-in-the-room | 200 | 14 | 없음 | 17 | [621] |
| what-is-it | 200 | 18 | 없음 | 21 | [621] |
| when-i-grow-up | 200 | 18 | 없음 | 21 | [621] |
| who-is-our-friend | 200 | 18 | 없음 | 21 | [621] |
| the-best-thing-ever | 200 | 14 | 없음 | 17 | [621] |
| mrs-penguins-palace (WP: mrs-penguins-perfect-palace) | 200 | 14 | 없음 | 17 | [621] |

**200 응답 책 수: 15 / 15** (매핑실패 0건)

### 부수 실측 (사실만 기록)
- **1-3 원인 실증**: `languages` 필드 실측 — 13권 `[621]`, **springloaded·i-can-dress-myself만 `[643]`**.
  206목록 필터(`languages=621`)가 배제한 책 = 정확히 이 2권 = ADR-0027 Amd#3(`0027:151`)의
  "WP 부재" 2권과 일치. → **"WP 부재"가 아니라 "언어 태그 상이로 필터 밖"**이었음이 확정.
- WP 이미지 세트의 구성이 GH Pages 세트(12페이지 연속)와 **다름**:
  다수 책이 `_Page_01`(표지 겸) 시작 → `_Page_05`부터 본문 → `_Page_18` 종료(중간 결번 존재,
  예: it-wasnt-me는 Page_16 다음 Page_18), hippo는 중간에 `hippo-dancing.jpg`(비규약 파일) 혼입,
  who-is-our-friend는 `_english_..._Page_NN`과 `_en_pageN` **두 규약이 한 목록에 혼재**.
  → 원본 생존과 별개로, **서비스 페이지(텍스트 12면)와의 대응 규칙이 자명하지 않다**(판단 요청 2).

---

## STEP 3 — 이미지↔오디오 정렬 검증 (5권 상세표)

### 3-1. "a-tiny-seed 14p"의 출처 — 의혹 해소

- 출처 원문: `scratchpad/bookdash_dryrun_full.txt:351`
  `a-tiny-seed             | A Tiny Seed               | B |  14 | Nicola Rijsdijk | Maya Marshak …`
  (WP 206 드라이런의 **pg 열 = Amd#4 레시피가 bookdash.org 모달에서 추출한 장수**. `:390` 요약에도 `a-tiny-seed(14p/B)`.)
- 직전 세션 재현 실측에서도 WP 추출 14장이었고, 그 **1번이
  `a-tiny-seed_en_20200616_cover.jpg`(표지 혼입)**였다.
- 즉 "14"는 **WP(bookdash.org) 소스의 모달 이미지 세트** 수치다. 실제 서비스 자산(버킷)은
  **GH Pages 소스의 12페이지+표지**(아래 (A) 실측)이며, 텍스트(12)·오디오(12-empty)와 정합.
  **두 수치는 소스가 다른 것이지 모순이 아니다.** 결번 0건도 empty 0건과 일치(아래 표).

### 3-2·3-3. 3소스 독립 실측 및 판정

- **(A) 이미지**: Supabase Storage `book-images` 버킷 **실제 오브젝트 키 list**(읽기 전용,
  경로 `book_dash-{UUID}/`, UUID = copy_bookdash_images.py:94-100). 로컬 대체 아님.
- **(B) 텍스트**: `scripts/tts_pilot/out/{slug}.json` 항목 수(empty 포함).
- **(C) 오디오**: `scripts/tts_pilot/out/audio/{slug}_p{N}_Ruth_r78.mp3` 파일명에서 추출한 N 집합.

5권 모두 (A) 키 목록이 **동일 형태**: `01.jpg, 02.jpg, 03.jpg, 04.jpg, 05.jpg, 06.jpg, 07.jpg, 08.jpg, 09.jpg, 10.jpg, 11.jpg, 12.jpg, cover.jpg` (13개 = 본문 {1..12} + cover).

| slug | (A) 이미지 키 (본문 번호 집합) | (B) 텍스트 페이지 수 | (C) mp3 번호 집합 | (B) empty 번호 | 판정 |
|---|---|---:|---|---|---|
| a-beautiful-day | 01–12 + cover ({1..12}) | 12 | {1,2,3,5,6,7,8,9,10,11} | {4, 12} | **ALIGN** |
| a-dancers-tale | 01–12 + cover ({1..12}) | 12 | {1..12} | {} | **ALIGN** |
| a-fish-and-a-gift | 01–12 + cover ({1..12}) | 12 | {1..12} | {} | **ALIGN** |
| a-house-for-mouse | 01–12 + cover ({1..12}) | 12 | {1,2,3,4,5,6,7,8,9,11,12} | {10} | **ALIGN** |
| a-tiny-seed | 01–12 + cover ({1..12}) | 12 | {1..12} | {} | **ALIGN** |

- 판정 근거: 5권 전부 (C) ∪ (empty) = {1..12} = (B) 전체 = (A) 본문 번호 집합. SHIFT·COUNT 0건.
- 교차 검증: "text 있는데 mp3 없음" 0건, "mp3 있는데 text 빈값" 0건 (5/5).

### 3-4. SHIFT가 구조적으로 불가능한 이유 (44권 확장 판단 근거)

- mp3 파일명의 N은 연번 재부여가 아니라 **장면의 실제 page 번호**다:
  `generate_tts.py:252` `page = s["page"]` → `:270` `mp3_path = AUDIO_DIR / f"{slug}_p{page}{suffix}.mp3"`,
  empty는 `:265`에서 파일 미생성 스킵(번호를 당기지 않음).
- page 번호 자체는 `extract_text.py:119`에서 **이미지(장면) 순서**로 부여 —
  이미지 NN과 동일 원천이므로 정의상 일치.
- 업로드 키도 동일 원천: `upload_audio.py:109` `nn = int(s["page"]) - 1  # ADR-0034: page_index 0-based, 경로 pNN 정합`.
- → 결번 있는 책이든 없는 책이든 같은 로직이므로, **이미 업로드된 44권에 SHIFT가 숨어 있을
  구조적 경로가 없다.** 44권 전수 재검증은 불필요 판단(최종 결정은 오케스트레이터).

---

## 오케스트레이터 판단 요청 사항

1. **[재확보 실행 여부]** 15/15 원본 생존 확정 → 다운로드+book-images 업로드 트랙 승인 여부.
   단 `copy_bookdash_images.py`는 GH Pages 소스 전제(`:17-18` 원본 경로, `extract_scenes` 재사용)라
   WP URL 직접 수신 방식으로 개조가 필요 — 코드 수정은 별도 지시 + ADR-0036 Amendment #2
   (결손 15권 WP 재확보) 작성 선행이 필요하다.
2. **[페이지 대응 게이트]** WP 세트는 표지 겸 Page_01·본문 Page_05 시작·말미 결번·이중 규약 혼재
   등 구성이 GH Pages(01–12 연속)와 다르다. 텍스트(`out/{slug}.json` 방식, GH Pages HTML은 200이므로
   추출 가능)와 이미지의 **페이지 매핑 규칙을 확정하는 게이트** 없이 순서 복사하면 STEP 3에서
   검증한 ALIGN이 깨진다(SHIFT/COUNT 위험). 업로드 전 권별 대응표 산출을 별도 단계로 둘 것을 요청.
3. **[blacklist 축소 시점]** ADR-0014 §6 후속 과제 2(원본 복구 확인 시 축소)는 재확보·검증 완료
   후에만. 이번 결과만으로 blacklist.ts를 줄이지 않았다(코드 무변경).
4. **[v2 모집단 정정]** `languages=621` 필터가 `[643]` 태그 책을 배제함이 실증됨 —
   sync_book_dash_v2.py 모집단 정의(및 ADR-0027 Amd#3 "WP 부재" 문구) 정정 검토.
5. **[44권 재검증 불요 의견]** STEP 3-4 근거(파일명 N = 실제 page 번호, 연번 재부여 없음)로
   기업로드 44권 전수 재검증은 불필요 판단 — 최종 결정은 오케스트레이터.
