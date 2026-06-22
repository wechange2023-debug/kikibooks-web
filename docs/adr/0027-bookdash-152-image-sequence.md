# ADR-0027: Book Dash 신간 152권 — WP API + CloudFront 이미지 시퀀스 적재

**날짜** 2026-06-22
**상태** Proposed
**관련** `docs/adr/0005-book-dash-sync-strategy.md`(기존 54권 meta.yml+GH Pages 전략), `docs/adr/0025-asb-content-ingestion.md`(`asb_native` 자체 렌더·Amd#3 A4 content_url=.txt·Amd#6 페이지 구성), `docs/adr/0026-asb-quality-filter.md`(선별 공개), `docs/adr/0004-source-platform-list.md`(source_platform 화이트리스트), `docs/adr/0022-content-source-expansion.md`(라이선스 화이트리스트 4곳), `scripts/sync_book_dash.py`, `scripts/lib/attribution.py`, `components/book/asb-reader.tsx`, `lib/book/asb-parser.ts`, `supabase/migrations/004_add_asb_native_content_type.sql`, `claude.md` 2절 Hard Rule 8(스키마/정책 변경 시 ADR 선행)

> **표기 규약**: 본 ADR의 수치·URL·동작은 **[실측]**(4차에 걸친 읽기전용 정찰로 확인) / **[추정]**(표본 한정·미검증) / **[제안]**(설계 결정, 미구현)으로 구분 표기한다.

---

## 1. 맥락 (Context)

- **기존 54권 [실측]**: `sync_book_dash.py`는 GitHub `raw.githubusercontent.com/bookdash/bookdash-books/master/_data/meta.yml`(2019 스냅샷) + GH Pages HTML(`bookdash.github.io/bookdash-books/{slug}/en/`)에서 적재. `content_type='html'`, content_url=GH Pages 페이지. 소스가 2019 고정이라 **순증 0**.
- **신간 모수 [실측]**: bookdash.org WP REST API(`/wp-json/wp/v2/`) 활성. 커스텀 타입 `/wp/v2/books` 전체 `X-WP-Total: 1090`(16개 언어 합산, 수어판 다수 포함). 언어 taxonomy English(term id=621) **count=206**.
  - **순증 = 206 − 54 = +152 [실측]** (WP API 영어 권수 − 현 DB `book_dash` 권수).
- **본문 도달 경로 전환 [실측]**:
  - GH Pages 신간 경로(`bookdash.github.io/bookdash-books/{slug}/en/`, `/images/cover.jpg`) → **404**. 2019 스냅샷엔 신간 없음.
  - bookdash.org 책 페이지(`/books/{slug}/`)는 `#read-book`(JS 임베드 리더) + `Download ebook`(`/book-source-files/?book={slug}&folder=/e-book`) 제공.
  - 본문 자산은 **CloudFront(S3 백킹)**에만 존재. 개별 페이지 이미지 직접 접근 가능:
    - `?view-file=`/`?download=` → **302** → `https://d3qawc7yl9x4zs.cloudfront.net/{slug}/e-book/en_english/images/{slug}_en_page{N}.jpg` (서명·만료 파라미터 없는 클린 URL).
    - CloudFront 직접 Range GET → **206 Partial Content, `Content-Type: image/jpeg`** (인증 불필요). → 외부 핫링크 성립.
  - per-book license 필드는 WP API·책 페이지 어디에도 **미노출 [실측]**.
- **4차 정찰 실측 요약 [실측]**:
  - 페이지 이미지 폴더 목록(`/book-source-files/?book={slug}&folder=/e-book/en_english/images`)은 **정적 HTML** — 파일명이 `<a href>`에 직접 포함(JS 렌더 불필요). 권당 **GET 1회 + 정규식 1줄**로 페이지 목록 추출.
  - 명명 규칙: 표본 3권(the-window-seat / khaya-wants-to-row / moms-hands) 모두 `{slug}_en_page{N}.jpg`(zero-pad 없음: page1…page10), 표지 `{slug}_en_cover.jpg` 별도, **중간 누락 없음**. 3권 모두 정확히 **17페이지** [추정: 표본 3권 한정, Book Dash 표준 분량 가능성].
  - 작가: 책 페이지 HTML에 Writer/Illustrator/Editor **역할 분리 표기** 존재(예: Sindeka Mandoyi(Writer), Chloe Veldsman(Illustrator)). WP API `_embed`로는 복구 불가(creator 구조화 필드 없음).
  - 권당 외부 요청 약 3회면 충분: ① WP API(메타·표지) ② 폴더 목록 HTML ③ 작가용 책 페이지 HTML.
- **자체 뷰어 현황 [실측]**: 이미지 시퀀스 책은 현재 `content_type='asb_native'`(004 마이그레이션, 화이트리스트 `html/epub/h5p/pdf/asb_native`)로 적재되고 `AsbReader`가 렌더. 단 ASb는 content_url=단일 `.txt` 매니페스트를 런타임 fetch→`parseAsbText`로 `{text,imageUrl}` 면 배열 생성하는 방식(ADR-0025 Amd#3 A4·Amd#6). DB에 페이지 배열·별도 테이블 없음.

---

## 2. 결정 (Decision)

> 정찰로 확정된 6개 결정. **본 단계 산출물은 본 ADR 문서뿐이며 코드·sync·DB 변경은 다음 트랙**이다.

### D1 — 신간 소스 3원 조합

신간 적재 소스를 다음 3원으로 한다:
1. **WP API** (`/wp/v2/books?languages=621`) — 슬러그·제목·표지(featured_media)·등록일.
2. **책 페이지 HTML** (`bookdash.org/books/{slug}/`) — 작가·그린이(역할 분리).
3. **CloudFront** (`d3qawc7yl9x4zs.cloudfront.net/{slug}/e-book/en_english/images/...`) — 본문 페이지 이미지.

페이지 목록은 `/book-source-files/?book={slug}&folder=/e-book/en_english/images` 정적 HTML 1 GET으로 권별 page{N} 최대값·실재를 **동적 산출**한다(하드코딩 금지 — 17페이지는 표본값[추정]).

### D2 — 본문 전달 = 이미지 시퀀스, 기존 `asb_native` + AsbReader 재사용 [제안]

- **content_type = `asb_native`** 재사용. **스키마 변경 불필요**(화이트리스트에 이미 존재, 004 마이그레이션). PDF 뷰어는 미구현이므로 PDF 경로 미사용.
- **저장 형태**: ASb와 동일하게 **content_url = 권별 합성 `.txt` 매니페스트 URL**. 매니페스트는 `parseAsbText`가 인식하는 문법을 따른다 — `images:` 섹션에 CloudFront 페이지 이미지 URL을 **원문 순서대로** 나열(page_text 섹션은 비움 = 텍스트 없는 그림책 면). 표지는 books.cover_url에 별도 보유(WP featured_media → 또는 `{slug}_en_cover.jpg`).
  - Book Dash 면은 **텍스트가 이미지에 인쇄된 그림책**이므로 별도 텍스트 레이어 불필요. `AsbReader`는 `text=null` 이미지-only 면을 이미 정상 처리(ADR-0025 Amd#6 A3) → **렌더 컴포넌트 무변경**.
- **단, parser 1줄 확장 필수 [실측 근거]**: `lib/book/asb-parser.ts`의 images 섹션 수집 조건이 현재 **`illustrations/` 포함 또는 `.png`로 끝나는 라인만** 허용(`asb-parser.ts:114`). Book Dash는 **`.jpg`** 이므로 이 조건을 그대로 두면 이미지 0장 수집. → 필터를 `.jpg`/`.jpeg` 수용으로 확장해야 재사용 성립. (CloudFront 절대 URL은 `toAbsoluteImageUrl`의 http→https 통과 규칙으로 그대로 사용됨.)
  - 이는 "asb-reader 재사용"이 **완전 무코드가 아니라 parser 이미지 필터 1줄 확장을 포함**함을 의미한다(정직 표기).

### D3 — 저장 = CloudFront 외부 핫링크, Supabase 이미지 복사 안 함 [제안]

- 본문 이미지·표지는 **CloudFront 직링크 핫링크**. Supabase Storage로 **복사하지 않는다**.
- 합성 `.txt` 매니페스트(텍스트 ~수 KB/권)는 이미지가 아니므로 핫링크 대상이 아님 — 호스팅 위치는 D6 미해결로 둔다(이미지 무복사 원칙과 무저촉).
- **미래 옵션**: 베타 안정화 후 본문 이미지를 Supabase Storage로 복사 전환 가능(용량 **~7.9GB/152권 [추정]**: page1=789,644바이트 실측, 폴더 합계 52.2MB/권 × 152). PDF 경유 시 ~0.85GB(5.6MB/권 × 152 [추정]). **전환은 별도 ADR**로 결정.

### D4 — dedup = slug 기준 [제안]

- 기존 54권 source_id는 meta.yml UUID(또는 slug), 신간 WP는 숫자 post id → `(source_platform, source_id)` UNIQUE만으로는 중복 미감지.
- **slug가 양쪽 공통 안정키**(기존 행 `original_url=bookdash.org/books/{slug}/`에 내장, WP는 slug 필드 제공). 신간 후보 slug ∖ 기존 book_dash slug = 진짜 신규.
- **GDL 경유 중복**: Book Dash 일부가 GDL에 재집계됨 → 정규화 title(소문자·공백 단일화) 교차 대조로 `gdl`·`book_dash` 중복 추가 제거.
- 실행은 PM이 Supabase SQL Editor에서 SELECT로 사전 점검(워커 DB 직접 접근 없음).

### D5 — 작가 = 책 페이지 HTML 파싱, 역할 분리 복구 [제안]

- 책 페이지 HTML에서 Writer→author, Illustrator→illustrator로 **역할 분리 복구**. 현 `build_book_dash_attribution`은 creator 단일 슬롯(meta.yml 한계)이나, 신간은 분리 정보가 있으므로 author/illustrator를 각각 채워 어트리뷰션 품질을 높인다.
- 파싱 실패·작가 결측 시 `build_attribution`의 `"Unknown creators"` 폴백으로 **NOT NULL(Hard Rule 1) 보장**(예외 없이 적재 가능).

### D6 — source_id 정책 = slug 채택 [제안]

- 신간 `source_id = slug`. UUID(meta.yml엔 신간 없음)·WP 숫자 post id 대신 **slug**를 채택한다.
- 사유: ① D4 dedup이 slug 기준 ② content/표지/CloudFront URL이 전부 slug로 파라미터화 → URL 구성·중복 대조·디버깅이 source_id와 1:1 일관 ③ WP 숫자 id는 사이트 재색인 시 변동 위험, slug는 사람이 읽고 URL과 직결.

---

## 3. 결과 (Consequences)

- **source_platform='book_dash' 내 본문 전달방식 2종 공존**: 기존 54권(`content_type='html'`, GH Pages iframe) + 신간 152권(`content_type='asb_native'`, 이미지 시퀀스). → `sync_book_dash.py`에 소스/타입 분기 필요(기존 meta.yml 경로 유지 + 신규 WP/CloudFront 경로 추가).
- **라이선스 화이트리스트 4곳 변경 불필요 [실측, 3차까지 확인]**: 신간이 전부 CC BY 4.0이고 source_platform·license 모두 기존 화이트리스트(① sync_gdl ALLOWED_LICENSE_SLUGS ② DB CHECK 002 ③ attribution LICENSE_LABELS/PLATFORM_LABELS ④ verify_gdl_sync ALLOWED_LICENSES)에 포함. `cc-by-4-0`·`book_dash` 모두 기존 적재 실적으로 통과 입증.
  - **명시 리스크**: WP API가 per-book license를 미노출 → "Book Dash = 전부 CC BY 4.0"이라는 **조직 정책 가정에 의존**(현 sync도 cc-by-4-0 하드코딩으로 동일 가정). API상 직접 라이선스 검증 수단 없음. 협상 미필 IP·NC/ND 혼입 여부는 트리거(`enforce_commercial_license`)가 2차 방어.
- **content_type 스키마 변경 없음**: `asb_native` 재사용. 단 **parser `.jpg` 필터 1줄 확장**(D2)은 코드 변경 1건 발생(스키마 아님).
- **외부 CDN(CloudFront) 의존**: 핫링크 차단·버킷 구조 변경 시 본문 깨짐 위험. CloudFront URL은 현재 무서명·무만료[실측]이나 영속성 보장은 없음 → D3 미래 복사 전환으로 완화 가능.
- **매니페스트 생성·호스팅 신규 작업**: 권별 합성 `.txt`를 어디서 생성·서빙할지 결정 필요(D6 미해결). 이미지 무복사 원칙과는 무저촉(텍스트만).

---

## 4. 미해결 / 후속

- **[해결] 스키마 변경 필요 여부**: **불필요**. `content_type='asb_native'` 화이트리스트(004) 재사용으로 DB 마이그레이션 0건. (parser `.jpg` 확장은 앱 코드 변경이며 스키마 아님.)
- **합성 `.txt` 매니페스트 호스팅 위치 미결**: Supabase Storage(텍스트만, ~수KB×152=무시 가능) vs 앱/리포 서빙 vs 동적 생성. → 구현 트랙에서 결정(필요 시 본 ADR Amendment 또는 별도 ADR).
- **권별 페이지 수 확정 방식**: 폴더 목록 HTML 파싱(D1)으로 동적. 17페이지는 표본 3권 한정값[추정] — 전권 일정 여부 미검증.
- **dedup 실측**: D4 SELECT 초안으로 기존 54권 slug ↔ 신간 206권 slug 차집합, GDL 경유 title 중복은 PM이 SQL Editor에서 사전 확인.
- **실제 sync 스크립트 구현**: 다음 트랙(본 ADR 승인 후). WP API 페이지네이션·작가 HTML 파서·매니페스트 생성·parser `.jpg` 확장·dedup SELECT 검증 포함.
- **PDF 경로**: 현 PDF 뷰어 미구현 → 이미지 시퀀스 채택. 향후 PDF 뷰어 도입 시 5.6MB/권 PDF 단일 자산 대안 재검토 가능(별도 ADR).

---

## 5. Amendments

### Amendment #1 (2026-06-22) — 매니페스트 호스팅 위치 확정 + 대안 ③ 폐기

**배경**: §4 "합성 `.txt` 매니페스트 호스팅 위치 미결" 및 D2 대안으로 거론된 ③(페이지 목록을 DB에 직접 저장, parser 우회)의 경량성 여부를 읽기전용 RECON으로 검증.

**RECON 결과 [실측]**:
- **Q1 — AsbReader 입구**: `read/page.tsx`는 `content_url`/`cover_url` 단일 값만 props 전달. `AsbReader`는 클라이언트에서 `fetch(contentUrl) → res.text() → parseAsbText`로 faces 생성(자체 fetch 고정). 페이지 배열 prop 미수용.
- **Q2 — books 스키마**: 컬럼 = id, source_platform, source_id, title, cover_url, content_url, content_type, language, level, age_min, age_max, license, author, illustrator, original_url, attribution_text, is_active, synced_at. 001~004 통틀어 **JSON/JSONB·자유형 컬럼 없음, ADD COLUMN 0건**. 페이지 URL 배열을 담을 기존 칸 없음(content_url 오버로드는 의미 오염).
- **Q3 — parser**: `parseAsbText(raw: string, ...)` 문자열 전용. 단 `AsbBook={coverUrl,pages[]}` 타입·`toFaces()` 존재로 parser 우회 구성은 타입상 가능.

**판정**: 대안 ③(DB 직접 저장)은 **스키마 변경(JSONB 컬럼 ADD + 마이그레이션 + ADR) + 리더 2곳(page.tsx prop 주입 + AsbReader fetch-skip 분기) 변경**을 동반 → ①(현 D2 .txt 매니페스트: parser `.jpg` 1줄 + 스키마·리더·page.tsx 무변경)보다 변경 지점이 많고 무겁다. ③의 유일 이점(외부 호스팅 의존 제거)은 ①에서 매니페스트를 Supabase Storage 텍스트로 두면 동일 흡수됨.

**결정**:
1. 대안 ③ **폐기**. D2의 `.txt` 매니페스트 방식을 **확정 유지**.
2. §4 미결이던 **매니페스트 호스팅 위치 = Supabase Storage(텍스트, ~수 KB/권 × 152 = 무시 가능)** 로 확정. (이미지 무복사 원칙 D3과 무저촉 — 매니페스트는 텍스트이며, 본문 이미지는 여전히 CloudFront 핫링크.)
3. 본 Amendment로 §4 "매니페스트 호스팅 위치 미결" 항목 **종결(closed)**.

**불변 사항**: D1·D3·D4·D5·D6 및 parser `.jpg` 1줄 확장(D2) 전제는 그대로 유효. 스키마 변경 없음(`asb_native` 재사용) 재확인.
