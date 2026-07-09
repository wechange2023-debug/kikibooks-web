# 정찰 결과 2026-07-09

> 읽기 전용 정찰 3건 (카나리아 관측 가능성 / CloudFront 결손 15권 / B집합 mp3 실존).
> 워커: Claude Code. HEAD c1af704 / main / 예외 허용 2건 외 clean.
> 본 문서는 미커밋 상태로 둔다 (커밋은 다음 지시서에서).

---

## STEP 1 — 카나리아 관측 가능성

### 판정: **B — 관측 불가** (사유: 1-1 (b) — synced_at은 upsert-UPDATE 시 갱신되지 않음)

"gdl 책 1권 is_active=false → 다음 cron 후 유지 확인" 실험 자체는 유효하나,
**"cron이 그 행을 실제로 UPDATE했다"는 양성 대조군을 synced_at으로 삼을 수 없다.**
synced_at이 안 변한 것이 "cron이 안 건드림"인지 "원래 UPDATE에서 안 변하는 컬럼"인지 구분 불가 —
후자가 사실이므로 synced_at 대조군은 무효.

### (a) payload 생성 지점 / is_active 제거 여부

- payload dict 생성: `scripts/sync_gdl.py:322-342` (`build_payload` 내).
- **is_active 키 없음 — 확인.** payload 키: source_platform, source_id, title, cover_url,
  content_url, content_type, language, level, age_min, age_max, license, author,
  illustrator, original_url, attribution_text (15개).
- `scripts/sync_gdl.py:340` 주석 원문:
  `# is_active는 cron이 관리하지 않는다 — 신규 행은 DB DEFAULT TRUE, 기존 행 보존 (ADR-0037 D1·D2)`

### (b) synced_at 갱신 경로 — **없음 (UPDATE 시)**

- payload에 synced_at **미포함** (위 (a) 키 목록).
- `supabase/migrations/001_initial_schema.sql:100`:
  `synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),` — DEFAULT는 **INSERT 시에만** 적용.
- UPDATE 갱신 트리거 부재: books에 걸린 트리거는 `books_license_check`
  (`001_initial_schema.sql:176-177`, BEFORE INSERT OR UPDATE — 라이선스 차단용)뿐.
  `touch_updated_at` 트리거는 profiles(`:192-194`)·children(`:196-198`)에만 존재.
- books에는 **updated_at 컬럼 자체가 없음** (updated_at은 `001:28` profiles, `001:47` children뿐).
- 마이그레이션 002~005 전수 grep: TRIGGER 추가 0건.
- **한계**: 위는 레포 SQL 기준. 실 DB에 수동 생성 트리거가 있을 가능성은 미확인.
  팀장 확인용 SQL (읽기 전용):
  ```sql
  SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
  WHERE tgrelid = 'books'::regclass AND NOT tgisinternal;
  ```

### (c) diff/skip 로직 — **없음 (전량 upsert)** ← 이 항목은 관측에 유리

- 스크립트 전체에서 기존 행 조회·해시/필드 비교·continue 코드 **부재**.
  유일한 DB 접근은 `batch_upsert` (`scripts/sync_gdl.py:348-377`).
- 필터(BookDash skip·비그림책·변형본·dedup·license) 통과분 전량이 **매 실행 무조건 upsert**됨
  (`:511-540`에서 pending 구성 → `:559`에서 batch_upsert 호출).
- → 카나리아 행도 매 cron마다 merge-UPDATE 대상이 된다. 문제는 (b) — 그 UPDATE를 DB에서 관측할 컬럼이 없다는 것.

### (d) upsert 호출부 원문

- `scripts/sync_gdl.py:356-358`:
  ```python
  client.table("books").upsert(
      chunk, on_conflict="source_platform,source_id"
  ).execute()
  ```
- 1건 재시도 경로 `:368-370` 동일 옵션.
- `ignore_duplicates` 미지정 → supabase-py 기본 `Prefer: resolution=merge-duplicates`
  (ADR-0037 D2에 postgrest 2.30.0 실측 근거 기록: 병합 시 **payload에 있는 컬럼만** UPDATE).

### (e) GDL API 수집 범위 — **전량, 비증분**

- `scripts/sync_gdl.py:69` `API_URL = ".../wp-json/content-api/v1/books/en"` — **영어 전용 엔드포인트**.
- `:147-171` `fetch_all_books` — 단일 GET 1회, 페이지네이션 미작동으로 1,313권 전체 수신
  (`:9-11` 주석: 모든 페이지네이션 파라미터 무시, 5.7MB 단일 응답).
- 증분(lastChanged 이후만) 아님. 매 실행 전체 재수집 후 client-side 필터
  (language=en 재검증 `:262-268`, license 화이트리스트 `:270-277`).

### 1-2. 워크플로

- `.github/workflows/` 전체 3개: `sync-book-dash.yml`, `sync-gdl.yml`, `verify-licenses.yml`.
- gdl sync 실행 워크플로 = **`sync-gdl.yml`**.
  - cron 원문: `- cron: '0 3 * * *'` (`sync-gdl.yml:21`)
  - on: 트리거 = `schedule` + `workflow_dispatch`(inputs: dry_run, max_books) (`:17-33`)
  - disabled 아님 — 파일에 비활성 설정 없음 + 아래 실행 이력으로 매일 schedule 발화 확인.
- `gh run list --workflow=sync-gdl.yml --limit 5` 결과 — **5/5 success (schedule)**:

  | 일시(UTC) | 결론 | 소요 |
  |---|---|---|
  | 2026-07-08 06:03 | success | 26s |
  | 2026-07-07 06:52 | success | 20s |
  | 2026-07-06 07:19 | success | 24s |
  | 2026-07-05 06:47 | success | 25s |
  | 2026-07-04 06:25 | success | 20s |

  ※ 실제 발화 시각이 cron 03:00 UTC 대비 3~4시간 지연됨(GitHub schedule 지연으로 보이나 원인 미확인 — 사실만 기록).
  실험 시 "다음 cron"의 대기 창은 03:00이 아니라 **~07:30 UTC까지** 잡아야 함.

### 판정 B — 대안 대조군

1. **title `[CANARY]` 마커 (권장, 코드로 성립 확인됨)**
   - 근거: title은 payload에 포함(`sync_gdl.py:325`) ∧ 전량 upsert(위 (c)) ∧ merge 시 payload 컬럼만 UPDATE(위 (d)).
   - 설계: 팀장 SQL로 canary 행 `title = title || ' [CANARY]'` + `is_active = false` →
     다음 cron 후 ① title이 API 원제로 **원복되어 있으면** = cron이 그 행을 UPDATE했다는 양성 신호,
     ② 동시에 `is_active = false` **유지**면 = ADR-0037 D2 검증 성공. ①∧② 둘 다 관측되어야 유효.
   - 안전성 확인: `H5P_VARIANT_TITLE_REGEX`(`:105-115`)·동제목 dedup(`:186-227`)은 **API 응답 title에만** 적용 —
     DB 쪽 마커는 sync 로직에 영향 없음. 마커는 대괄호라 변형본 정규식(소괄호 매치)과도 무충돌.
2. **GitHub Actions 실행 로그 (보조)**: run success + 요약의 `inserted/updated` 카운트(≈851)로
   gdl 전량 upsert 실행 자체는 증빙 가능. 단 행 단위 증거는 아님.
3. **updated_at 컬럼**: books에 존재하지 않음 → **사용 불가**.

---

## STEP 2 — CloudFront 정찰 (결손 15권 중 표본 4권 + 대조군 1권)

### 분기: **Z — 대조군 404 → 즉시 STOP** (지시대로 추측 재시도 없음)

### ADR-0027 원문 확인 (2-1)

- `docs/adr/0027-bookdash-152-image-sequence.md:20`:
  `?view-file=/?download= → 302 → https://d3qawc7yl9x4zs.cloudfront.net/{slug}/e-book/en_english/images/{slug}_en_page{N}.jpg (서명·만료 파라미터 없는 클린 URL)`
- `:25`: `{slug}_en_page{N}.jpg`(zero-pad 없음: page1…page10), 표지 `{slug}_en_cover.jpg`
- → **인수인계 참고값과 일치.** URL 조립은 이 패턴 그대로 수행함 (urljoin, HEAD, 0.6s 간격).

### 요청 20건 결과 (requests.head, timeout=10, allow_redirects=True)

**대조군 (별도 명시): `a-fish-and-a-gift` — 4/4 전부 404** (Content-Type: application/xml = S3 오류 XML, Content-Length 헤더 없음)

| slug | cover | page1 | page2 | page3 |
|---|---|---|---|---|
| **a-fish-and-a-gift (대조군)** | **404** | **404** | **404** | **404** |
| hippo-wants-to-dance | 404 | 404 | 404 | 404 |
| springloaded | 404 | 404 | 404 | 404 |
| hugs-in-the-city | 404 | 404 | 404 | 404 |
| it-wasnt-me | 404 | 404 | 404 | 404 |

20/20 전부 404, 전부 `Content-Type: application/xml`, Content-Length 헤더 미반환.
URL 전문은 패턴 `https://d3qawc7yl9x4zs.cloudfront.net/{slug}/e-book/en_english/images/{slug}_en_{cover|page1|page2|page3}.jpg` 그대로 (스크립트: 세션 임시폴더 `cf_probe.py`, 레포 외부).

### 분기 Z 해석 — ADR 문서 내 근거와 다른 후보 패턴

- **404의 원인은 ADR-0027 자체에 이미 기록돼 있음**: Amendment #3 (`0027:142-145`) —
  이 CloudFront 경로는 **"Scheme A = 21권"에만 유효**하고, 그 21권 slug 목록(`0027:144`)에
  이번 5권(대조군 포함)은 **하나도 없다**. `Scheme B = 185권(대다수)`는 같은 경로가 404 (`0027:145`).
  즉 "원본이 없다"가 아니라 **"이 URL 패턴이 이 책들에 적용되지 않는다"**.
- 문서에 있는 다른 후보 패턴/방식 (재시도는 하지 않았음):
  1. **Scheme B 경로** `bookdash.org/wp-content/uploads/{년}/{월}/{slug}_english_pdf-ebook_{date}_Page_{NN}.jpg` 류 (`0027:145`).
     단 Amendment #4 (`0027:170-175`)가 **파일명 공식화 불가**를 실측 확정 —
     stem·날짜·zero-pad가 책마다 달라 URL 조립 불가, **HTML 컨테이너 파싱 방식으로 대체**가 확정된 레시피(`0027:177` 이하).
  2. **v1 54권 코호트의 GH Pages 원본** `bookdash.github.io/{slug}/... /images/NN.jpg`
     (ADR-0035 §1 실측: `.../images/01.jpg` = HTTP 200, image/jpeg, 119,175B).
     결손 15권은 v1 54권 코호트 소속이므로, 재확보 정찰의 1차 후보는 CloudFront가 아니라 이쪽일 가능성.
     (단 "결손"이 GH Pages에도 없어서 생긴 것인지는 이번 정찰 범위 밖 — 미확인.)

---

## STEP 3 — B집합 5권 mp3 로컬 실존

프로젝트 전체 *.mp3 = **679개, 전부 단일 폴더** `E:\claude-code\kikibooks_platform\scripts\tts_pilot\out\audio\` (그 외 위치 0건).
B집합 5권 **전부 발견**. 서비스 후보 세트는 확정 변형 `_Ruth_r78` (파일명: `{slug}_p{N}_Ruth_r78.mp3`).

| slug | Ruth_r78 파일 수 | Ruth_r78 용량 | 페이지 번호 | 연속성 |
|---|---:|---:|---|---|
| a-beautiful-day | 10 | 451.6 KB | 1–3, 5–11 | **p4 결번** |
| a-dancers-tale | 12 | 1,144.6 KB | 1–12 | 연속 |
| a-fish-and-a-gift | 12 | 2,063.1 KB | 1–12 | 연속 |
| a-house-for-mouse | 11 | 274.3 KB | 1–9, 11–12 | **p10 결번** |
| a-tiny-seed | 12 | 1,069.4 KB | 1–12 | 연속 |

- a-beautiful-day는 파일럿 변형본 포함 총 54개(r65/r75/r85/무접미/Joanna/Kendra/Ruth) 2,297.3 KB —
  **모든 변형에서 p4가 일관되게 결번** (특정 변형의 누락이 아니라 소스 단계부터 p4 부재).
- 나머지 4권은 Ruth_r78 단일 변형만 존재.

---

## 오케스트레이터 판단 요청 사항

1. **[STEP 1]** synced_at 대조군 무효(판정 B) → **title `[CANARY]` 마커 방식** 채택 여부.
   채택 시 마커 부착/판독/원복은 모두 팀장 SQL로 수행(워커는 SQL 문안만 작성).
   보조로 실 DB 트리거 부재 확인 SQL(§STEP 1 (b)) 1회 실행 권장.
2. **[STEP 1]** cron 실제 발화가 03:00이 아닌 06~07시 UTC대(실측 5일 연속) —
   실험 판독 시각을 07:30 UTC(한국 16:30) 이후로 잡을 것.
3. **[STEP 2]** 분기 Z: CloudFront `_en_page` 패턴은 이 5권에 부적용(Scheme A 21권 한정, ADR-0027 Amd#3).
   재확보 정찰을 계속한다면 다음 중 재정찰 경로 지정 필요:
   (i) GH Pages `bookdash.github.io` 원본 확인(v1 코호트 소속이므로 1차 후보),
   (ii) bookdash.org HTML 컨테이너 파싱(ADR-0027 Amd#4 확정 레시피).
4. **[STEP 3]** a-beautiful-day p4·a-house-for-mouse p10 결번이
   "이미지-only 면(텍스트 없음 → 오디오 원래 없음)"인지 "생성 누락"인지 판정 필요 —
   `extract_text.py` 산출 텍스트와 대조하면 확정 가능(이번 지시서 범위 밖이라 미수행).

---
---

# 정찰 결과 2026-07-09 (2) — 재설계 정찰

> 위 1차 결과(대조군 포함 20/20 404)는 실패 기록으로 보존한다. 원인은 URL 오류가 아니라
> **모집단 불일치**(CloudFront `_en_page` 패턴 = Scheme A 21권 전용, 5권 모두 목록 밖)였다.

## STEP 1 재설계 — 카나리아 후보

### 방법
- API 호출 함수 = `fetch_all_books` (`scripts/sync_gdl.py:147-171`). 단일 GET 1회
  (페이지네이션 파라미터 전부 무시가 API 특성 — `:9-11` 주석. "3페이지 이상" 요건은
  단일 응답에 전량 1,313권이 실리므로 해당 없음).
- 동일 요청을 임시 스크립트(세션 임시폴더 `gdl_feed_probe.py`, 레포 외부)로 재현.
  DB 접근 0건. sync의 필터 체인(BookDash skip → 비그림책 → H5P 변형본 → 동제목 dedup →
  build_payload의 language·license·필수필드 가드)을 전부 미러링.
- **교차 검증**: 미러링 후 생존 851권 = ADR-0037 Appendix의 gdl 활성 851권과 정확히 일치.

### 후보 선정 (기준: 피드 실존 ∧ payload 경로 포함 ∧ 짧고 깨끗한 제목 ∧ 최근 lastChanged)
- title이 payload에 실리는 경로 재확인: `sync_gdl.py:287` `title = html.unescape(str(raw_title)).strip()`
  → `:325` `"title": title` — payload 포함 확정.
- 깨끗한 제목 조건: html.unescape 전후 동일(엔티티 0) ∧ ASCII 영문/숫자/공백만 ∧ 20자 이하 ∧
  동제목 그룹 크기 1(dedup 탈락 위험 0). 충족 380권 중 lastChanged 최신순 상위에서 선정.

**1순위 — postId `37775` / title `Big Buck Bunny`** (앞뒤 공백 없음, repr `'Big Buck Bunny'`)
- lastChanged `2024-01-17 12:29:39` — 깨끗한 제목 후보군 중 **피드 전체 최신**.
- license `cc-by-3-0`(화이트리스트 `:87` 포함), language en, h5pId 14993, publisher 빈값(정직 폴백 경로 — 적재엔 무영향).
- h5pLibrary `H5P.Column` — 변형본 정규식은 **제목의 괄호 패턴**만 보므로(`:105-115`) 무관.
  (`:104` 주석이 명시적으로 "Big Buck Bunny…정상 책"이라 기록.)
- 피드 응답 원문 조각:
  ```json
  {"postId": 37775, "title": "Big Buck Bunny", "lastChanged": "2024-01-17 12:29:39",
   "publisher": "", "license": [{"slug": "cc-by-3-0", "name": "CC-BY-3.0"}],
   "language": [{"slug": "en", "name": "English"}], "h5pId": "14993",
   "postLink": "https://content.digitallibrary.io/en/book/big-buck-bunny/"}
  ```

**2순위(예비) — postId `38972` / title `Bow Meow Wow`** (앞뒤 공백 없음, repr `'Bow Meow Wow'`)
- lastChanged `2023-09-22 11:31:57`, license `cc-by-4-0`(표준), h5pId 15529.
- 피드 응답 원문 조각:
  ```json
  {"postId": 38972, "title": "Bow Meow Wow", "lastChanged": "2023-09-22 11:31:57",
   "publisher": "", "license": [{"slug": "cc-by-4-0", "name": "CC-BY-4.0"}],
   "language": [{"slug": "en", "name": "English"}], "h5pId": "15529",
   "postLink": "https://content.digitallibrary.io/en/book/bow-meow-wow/"}
  ```

### 팀장 실행용 — 현재 상태 조회 SQL (읽기 전용)
```sql
SELECT source_id, title, is_active, synced_at, license
FROM books
WHERE source_platform = 'gdl' AND source_id IN ('37775', '38972');
```

## STEP 2 재설계 — 모집단 재판정 및 결과

### 분기: **X — 대조군 성공 ∧ 대상 4/4 전부 성공. 원본 생존, 재확보 트랙 가능.**

### 2-1. 문서 원문 (요지 인용)
- **ADR-0027 Amd#3 Scheme A 21권 전체** (`0027:144`):
  `aaaaahhh-mmawe, banzis-busy-bees, best-friends, going-places, grumpy-cloud, how-do-you-eat, i-hate-winter, its-my-book, jock-and-me, julia-loves-books, khaya-wants-to-row, little-shoots, mazi-learns-to-play, moms-hands, oyisa-and-the-giant-tree, samoosas, tata-comes-home, the-window-seat, thulis-tissue, whats-happened-to-our-water, why-the-owl-never-sleeps`
  → **대상 4권·1차 대조군 모두 이 목록에 없음** (1차 20/20 404의 원인).
- **ADR-0027 Amd#4 레시피** (`0027:177-183`):
  1. `GET https://bookdash.org/books/{slug}/` 2. `div#read-book` 컨테이너 격리
  3. img의 **`data-src`** 수집(`src` 아님 — lazy-load 플레이스홀더) 4. `wp-content/uploads`만 통과
  5. `-WxH` 썸네일 접미사 제거 6. 중복 제거, **발견된 것만 원문 순서대로**(번호 연속성 가정 금지).
  표지 = WP `featured_media` (`0027:187`).
- **ADR-0035 §1** (`0035:24-25`): GH Pages 원본 = `<div id="wrapper">` 구조,
  `.../images/01.jpg` 직접 접근 HTTP 200 실측. 단 ADR-0036 Amd#1(`0036:116-123`)이
  **결손 15권은 GH Pages 2019 스냅샷에 본문 이미지 부재(영구 404)**를 cache-bust·대조군·대체경로로
  이미 확정 → GH Pages 경로는 이 15권 재확보에 사용 불가. 남은 경로 = WP(본 정찰)/CloudFront(1차에서 배제).

### 2-2. 대상 4권 Scheme 판정 + DB 키 형태
근거: 206권 전량 드라이런 실측 기록 `scratchpad/bookdash_dryrun_full.txt`(WP API `X-WP-Total=206`).

| slug | Scheme (드라이런 실측) | WP 추출 본문 장수 | DB source_id (tts_recon_49.csv 2열, UUID) |
|---|---|---:|---|
| hippo-wants-to-dance | **B** (`:300`) | 14 | `9c9f4976-fe46-11e5-86aa-5e5517507c66` (`:7`) |
| springloaded | **206목록 부재** (0027:151 "WP 부재") — 단 아래 실측 참조 | — | `9c9f450c-fe46-11e5-86aa-5e5517507c66` (`:35`) |
| hugs-in-the-city | **B** (`:284`) | 14 | `9c9eb574-fe46-11e5-86aa-5e5517507c66` (`:9`) |
| it-wasnt-me | **B** (`:288`) | 13 | `9c9ffed4-fe46-11e5-86aa-5e5517507c66` (`:13`) |

- 4권 모두 v1 html 코호트 → `source_platform='book_dash'`, **source_id=UUID 형태** (ADR-0037 D6, 레포 CSV 기준 — DB 실측은 팀장 SQL).
- **springloaded 신규 실측**: `wp-json/wp/v2/books?slug=springloaded` 직접 조회 = **존재**(featured_media 포함).
  206목록(`books?languages=621`) 부재는 언어 taxonomy 필터에서 빠진 것으로 보임(원인 자체는 미확인 — 사실만 기록).

### 2-3. 대조군 유도 (데이터 근거)
**선정: `a-tiny-seed`** — 근거 3건:
1. **동일 모집단·동일 Scheme**: 드라이런 실측 `a-tiny-seed(14p/B)` — 대상 3권과 같은 Scheme B, 같은 WP 206 피드.
2. **이미지 정상 존재 입증**: 정예 39권 소속(`scripts/copy_bookdash_images.py:94-100` DONE_BOOKS —
   book-images 버킷 업로드 코호트, IMAGELESS_BOOKS 15권 목록 `:107-113`에 없음).
3. 1차 대조군 후보였던 a-fish-and-a-gift는 WP 추출이 **2장뿐**(`bookdash_dryrun_full.txt:371`)이라 대조군 부적합 → 배제.

### 2-4. 실측 결과 (Amd#4 레시피 재현, HEAD, timeout=10, urljoin, 0.6s 간격)
**대조군 선행 → PASS 후에만 대상 실행** (스크립트: 세션 임시폴더 `wp_recipe_probe.py`, 레포 외부).

| slug | WP api | 본문 추출 장수 | cover HEAD | page1~3 HEAD (추출 상위 3장) |
|---|---|---:|---|---|
| **a-tiny-seed (대조군)** | ok | **14** | **200** jpeg 2,026,850B | **200/200/200** jpeg |
| hippo-wants-to-dance | ok | **15** | 200 jpeg 123,276B | 200/200/200 jpeg |
| springloaded | ok | **14** | 200 jpeg 75,859B | 200/200/200 jpeg |
| hugs-in-the-city | ok | **14** | 200 jpeg 152,052B | 200/200/200 jpeg |
| it-wasnt-me | ok | **14** | 200 jpeg 144,726B | 200/200/200 jpeg |

- 20/20 요청 전부 200 · image/jpeg. **결손 15권 중 표본 4권의 원본은 bookdash.org WP에 생존.**
- 파일명 규약은 책마다 상이(`_english_20160324_Page_01` / `_english_20161230_page4` / `_en_20200616_page4` 혼재)
  — Amd#4의 "공식화 불가, 발견된 것만 순서대로" 결론과 정확히 일치.

### 분기 X — 15권 전량 드라이런 설계안 (제안만, 실행 금지)
1. **대상**: IMAGELESS_BOOKS 15권 전량 (`copy_bookdash_images.py:107-113`).
   drift 주의: `little-sock`→WP slug `little-sock-and-the-tiny-creatures`,
   `mrs-penguins-palace`→`mrs-penguins-perfect-palace`(0027:150) — WP 조회는 신 slug로.
   `i-can-dress-myself`는 0027:151에서 "WP 부재"였으나 springloaded 선례(slug 직접 조회로 존재)가
   있으므로 slug 직접 조회로 재확인.
2. **방법**: 권당 ① `wp-json/wp/v2/books?slug={slug}&_embed`(피드 실존+featured_media)
   ② Amd#4 레시피로 본문 전 장 추출 ③ 추출 전량 HEAD(표본 3장이 아니라 전 페이지 —
   "표본으로 결론내지 않는다") ④ Amd#5 게이트 적용(본문 ≤1장 skip, 중복 2벌 dedup, cover 혼입 dedup).
3. **산출**: 권별 CSV(slug, WP실존, 추출 장수, HEAD 200 비율, 게이트 판정) — 적재 전 게이트.
4. **불변 준수**: 읽기 전용(GET/HEAD만), DB·Storage 쓰기 0, 요청 간 0.6s.
5. **후속 연결**: 15권 확보 확정 시 `copy_bookdash_images.py --include-imageless`(`:49`)의
   원본 소스를 GH Pages → WP URL 직접 수신으로 바꾸는 개조가 필요(별도 ADR-0036 Amendment 안건).

## STEP 3 — 결번 성격 규명

### face 데이터 소재 (3-1)
- 실체 = `scripts/tts_pilot/out/{slug}.json` (extract_text.py 산출: page·image_url·text).
- alt 폴백은 추출 단계에서 이미 text로 병합됨(`extract_text.py:135-140` — `<p>` 본문이 비어 있고
  `_alts`가 있으면 alt를 text로 사용). → **text=="" = empty면(본문·alt 모두 없음)**,
  ADR-0036 §5의 body/alt/empty taxonomy 중 empty에 해당. 별도 face 컬럼·DB 저장은 없음.

### 판정표 (3-3) — 전권 **P**
| slug | 총 페이지 | mp3 개수(Ruth_r78) | 결번 페이지 | 해당 페이지 face | 판정 |
|---|---:|---:|---|---|---|
| a-beautiful-day | 12 | 10 | **p4, p12** | 둘 다 empty (text="") | **P** |
| a-dancers-tale | 12 | 12 | 없음 | — | **P** |
| a-fish-and-a-gift | 12 | 12 | 없음 | — | **P** |
| a-house-for-mouse | 12 | 11 | **p10** | empty (text="") | **P** |
| a-tiny-seed | 12 | 12 | 없음 | — | **P** |

- 교차 검증: "text 있는데 mp3 없음"(Q후보) = **5권 전부 0건**, "mp3 있는데 text 빈값" = 0건.
- **1차 보고 정정**: a-beautiful-day 결번은 p4 한 개가 아니라 **p4·p12 두 개**(1차에는 mp3 최대
  페이지 11까지만 보고 p12를 놓침). 둘 다 empty이므로 판정은 동일하게 P.
- 판정 P = 정상 결번(텍스트 없는 면), TTS 누락 아님 → 오디오 업로드 차단 사유 없음.

## 오케스트레이터 판단 요청 사항 (2차)

1. **[카나리아]** 1순위 Big Buck Bunny(37775) 채택 여부. 채택 시 실험 SQL 세트
   (① is_active=false + title 마커 부착 ② 다음 cron 후 판독 ③ 원복)는 다음 지시서에서
   문안 작성 지시 바람 — 이번 지시서 범위 밖이라 미작성.
2. **[결손 15권]** 분기 X 확정 — 15권 전량 드라이런(위 설계안) 실행 승인 여부.
   승인 시 drift 2권의 WP slug 매핑과 i-can-dress-myself 재확인을 포함해야 함.
3. **[B집합 5권]** 전권 판정 P → 오디오 업로드 게이트 통과. 업로드 실행은 별도 지시 대기.
4. **[기록 갱신 후보]** ADR-0027 Amd#3의 "WP 부재: springloaded" 문구는
   "206목록(languages=621) 부재, slug 직접 조회로는 존재"로 정정 필요(실측 근거 본 문서).
