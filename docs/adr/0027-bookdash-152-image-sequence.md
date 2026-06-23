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

### Amendment #2 (2026-06-22) — 순증 +152 확정 + 매니페스트 버킷 경로 확정

**dedup 사전 점검 [실측, PM Supabase SQL Editor 실행]**:
- source_platform별 권수: african_storybook 활성 2,161 / 비활성 589, gdl 851, **book_dash 54**.
- 기존 book_dash 54권 slug 목록 확보(original_url에서 추출, source_id=UUID 형식 `9c9e...`).
- GDL 경유 Book Dash 중복: original_url·attribution_text에 bookdash 흔적 검색 → **0건**.
- **순증 확정 = 206(WP API 영어) − 54(기존 book_dash) − 0(GDL 중복) = +152**.
- 잔여 검산: WP 206권 실제 slug를 기존 54 slug와 정밀 차집합 대조는 **드라이런 단계에서 수행**(slug 표기 미세차 대비).

**매니페스트 호스팅 확정 [실측]**:
- 기존 Supabase Storage 버킷 0개(ASb .txt·이미지는 모두 외부 호스팅이었음) → 신규 생성.
- **버킷 = `book-manifests` (Public)**. File size limit Unset(50MB), MIME Any.
- **경로 규칙 [제안] = `book-manifests/{slug}_en.txt`** (영어 단일 언어이므로 `_en` 접미. 향후 다국어 시 `{slug}_{lang}.txt`로 확장).
- content_url = 해당 객체의 Public URL(`.../storage/v1/object/public/book-manifests/{slug}_en.txt`).
- 업로드 권한: sync 스크립트가 **service_role 키로 업로드**(Storage 정책 우회). 읽기는 Public 버킷이라 정책 불요. → 별도 Storage Policy 설정 없이 진행, 업로드 차단 시 정책 추가로 대응.

**불변**: D1~D6, parser .jpg 확장, asb_native 재사용, 이미지 CloudFront 핫링크 모두 유효.

### Amendment #3 (2026-06-22) — 전량 드라이런으로 Scheme A/B 분리 발견, A 21권 우선 적재로 범위 조정

**배경**: 206 전량 드라이런(`--dry-run --limit 206 --existing-slugs <54>`)에서 표본(5~10권)에선 안 보이던 두 사실 발견. ADR 본문 D1/D3의 "CloudFront 단일 경로" 가정이 일부 깨짐.

**발견 1 — 본문 경로 2종(Scheme A/B) [실측, CloudFront page1 전수 분류]**:
- **Scheme A = 21권**: CloudFront `{slug}/e-book/en_english/images/{slug}_en_page{N}.jpg` → 200/206. 본 ADR 본문 D1 공식 그대로 적용 가능. slug 목록:
  `aaaaahhh-mmawe, banzis-busy-bees, best-friends, going-places, grumpy-cloud, how-do-you-eat, i-hate-winter, its-my-book, jock-and-me, julia-loves-books, khaya-wants-to-row, little-shoots, mazi-learns-to-play, moms-hands, oyisa-and-the-giant-tree, samoosas, tata-comes-home, the-window-seat, thulis-tissue, whats-happened-to-our-water, why-the-owl-never-sleeps`
- **Scheme B = 185권(대다수)**: 위 CloudFront 경로 → 404. 본문이 `wp-content/uploads/{년}/{월}/{slug}_english_pdf-ebook_{date}_Page_{NN}.jpg` 류 별도 구조에 존재(zero-pad·날짜·년월폴더 변수). 경로 예시: `https://bookdash.org/wp-content/uploads/2014/07/come-back-cat_english_pdf-ebook_20140909_Page_01.jpg`. 현 v2 스크립트로는 0장 수집. → 별도 경로 파서 필요.
- 정찰 표본 3권(the-window-seat·khaya-wants-to-row·moms-hands)이 모두 Scheme A였던 표본 편향이 원인(전부 2025 신간).

**발견 2 — slug drift로 dedup 불완전(이중적재 위험) [실측]**:
- 기존 54 ↔ WP 206 대조 시 5건 불일치:
  - slug 변경(같은 책, 신규 slug): `maddy-moona`→`maddy-moonas-menagerie`, `mrs-penguins-palace`→`mrs-penguins-perfect-palace`, `little-sock`→`little-sock-and-the-tiny-creatures`
  - WP 부재: `i-can-dress-myself`, `springloaded`
- slug 기준 dedup(D4/D6)은 49권만 매칭, drift 3권은 신규 slug로 들어와 기존 UUID 행과 이중적재 위험. 실제 overlap=52(49+3), 진짜 순신규≈154(206−52)로 본 ADR 본문 +152(Amd#2)와도 상이.

**정정**:
- 본문 D1/D3의 CloudFront 경로는 **Scheme A에만 유효**. Scheme B는 미해결(아래 결정).
- 순증 수치 +152(Amd#2)는 Scheme/drift 미반영 추정치였음 → 정정: 전량 시 순신규≈154이나, 본 Amendment로 **적재 범위를 Scheme A 21권으로 한정**.

**결정**:
1. **Scheme A 21권만 우선 적재**(--execute 1차 범위). 파이프라인(매니페스트→Storage 업로드→asb_native 적재→자체뷰어 렌더) 전 과정을 A로 실증.
2. **Scheme B 185권은 별도 후속 트랙**으로 분리. B 경로 공식(zero-pad·날짜·년월 변수) 확정 정찰 후 별도 Amendment/구현.
3. **drift 3권 처리**: 신규 slug로 적재 시 기존 UUID 행과 중복 → 적재 전 drift 책은 skip 목록에 포함(기존 행 유지). 통합 정리는 후속. (단 drift 3권 중 Scheme A 해당분만 1차 범위에서 의미 있음.)
4. 작가 정규식 입자 보강(van/de/du 등)은 성공 검증 완료(best-friends=van Wyk, du Plessis, de Klerk 온전). 잔여 성 1토큰 10건은 책 페이지 표기 자체 한계(후속 점검).

**불변**: asb_native 재사용·parser .jpg 확장·CloudFront 핫링크(A 한정)·매니페스트 book-manifests 버킷·license 화이트리스트 4곳 무변경.

### Amendment #4 (2026-06-23) — Scheme B 본문 추출 방식 확정 (HTML 컨테이너 파싱)

**배경**: Amd#3에서 Scheme B(약 185권)는 CloudFront `_en_page` 경로가 404이고 본문이 `wp-content/uploads/{년}/{월}/{slug}_english_pdf-ebook_{date}_Page_{NN}.jpg` 류 별도 경로에 있다고 **[추정]**했다(`come-back-cat` 예시 1건 한정). 이 추정이 전권에 일반화 가능한 "파일명 공식"인지 4차 정찰(읽기전용 GET)로 검증.

**정찰 결론 — 파일명 공식 맞히기 불가 [실측, 표본 3권]**:
- 표본 3권의 본문 파일명 규약이 **전부 다름**:
  - `maddy-moonas-menagerie`: `maddy-moona_interior-spreads_<날짜><번호>` (zero-pad 없음, slug≠파일stem)
  - `mrs-penguins-perfect-palace`: `mrs-penguins-perfect-palace_en_<날짜>_page{N}-scaled` (slug=stem, `_en_`)
  - `little-sock-and-the-tiny-creatures`: `little-sock_english_<날짜>_Page_{NN}` (zero-pad 있음, slug≠stem)
- → Amd#3의 `_english_pdf-ebook_Page_{NN}` 추정 경로는 **일부 코호트의 한 변형일 뿐**이며, stem·날짜·zero-pad·표지명이 책마다 달라 **공식화(formula) 불가**. Amd#3의 "B 경로 공식 확정 정찰" 방향은 본 Amendment로 **HTML 파싱 방식으로 대체**한다.

**확정된 추출 레시피 [실측, 3/3 표본 검증]**:
1. 책 페이지 HTML GET: `https://bookdash.org/books/{slug}/`
2. `div#read-book` 컨테이너(모달, class `expose_content modal jsExposeContent...`) 격리.
3. 컨테이너 내부 `img`의 **`data-src` 속성** 수집. ※ `src`가 아님 — `src`는 lazy-load 플레이스홀더(`preload-16x9.svg`)이고 실제 URL은 `data-src`에 있다.
4. `wp-content/uploads` 만 통과(`themes/` svg 닫기버튼 등 제거). ※ `data-src`만 수집하면 닫기버튼(`x.svg`, `src` 사용)은 자동 배제되므로 사실상 여분의 안전망.
5. `-WxH` 썸네일 접미사 제거 → 풀사이즈 stem 확보.
6. 중복 제거 → 본문 이미지 목록. **발견된 것만 원문 순서대로** 사용(번호 연속성 가정 금지 — penguin은 page4~17에 page16 결손 관찰).
- 검증 실측: 3/3 표본에서 컨테이너 매칭 성공, 컨테이너 내 non-uploads 노이즈 0건, 본문 추출 **13/14/18장**(0장 결손 없음).

**표지 처리 결정 [제안, PM 합의]**:
- 표지는 매니페스트 본문에서 **제외**. WP `featured_media`의 표지를 `cover_url`로 사용(Scheme A·기존 75권과 동일 방식, 검증됨).
- 근거: `#read-book` 컨테이너의 "첫 이미지=표지" 규칙은 책마다 결과가 달라 채택 불가(penguin 첫 본문이 `_page4`, maddy는 표지가 목록 중간/말미에 혼입).
- **미결(드라이런 집계 대상)**: `little-sock`처럼 `Page_01`이 표지를 겸하는(별도 cover 파일 없는) 케이스가 185권 중 몇 권인지 집계 후 별도 판단. 소수면 현행 유지, 다수면 후속 처리.

**구현 영향 (다음 트랙 예고 — 본 Amendment 범위 아님)**:
- `sync_book_dash_v2.py`의 `fetch_page_list`(현재 `/book-source-files/?folder=...` 정적 폴더 리스팅, Scheme A 전용)를 **B용 HTML 컨테이너 파싱 분기로 대체/병행**.
- `build_manifest_text`를 CloudFront URL 자체조립이 아닌 **URL 직접 수신** 형태로 소폭 일반화.
- 페이지 0장 skip(현 `525`행 부근)이 B를 거르던 경계 → B 분기 통과하도록 조정.

**다음 단계 (별도 지시서)**:
- 읽기전용 **전량 드라이런**: 185권 후보 전체에 레시피 적용 → (a) 컨테이너 매칭 실패율 (b) 본문 0장 책 (c) `Page_01` 표지혼입 분포 (d) drift 3권 통합 영향 집계. 적재 전 게이트.
- (Scheme A 교훈: 소량 표본 일반화 금지 → 전수 분류. Amd#3에서 표본 3권이 전부 Scheme A였던 편향을 재발 방지.)

**불변**: asb_native 재사용·parser .jpg 확장·매니페스트 book-manifests 버킷·license 화이트리스트 4곳 무변경. Scheme A 21권 적재분(Amd#3 결정)도 그대로 유효. 본 Amendment는 **추출 방식만** 확정하며 코드·DB 변경은 동반하지 않는다.

### Amendment #5 (2026-06-23) — Scheme B 적재 게이트: 중복 제거 보강 + 본문 0~1장 skip

**배경**: Amd#4 추출 레시피를 Book Dash 영어책 206권 **전량**에 읽기전용 드라이런(`dryrun_book_dash_scheme_b.py`, 적재·DB쓰기 없음) 적용. 레시피 자체는 206/206 성공(컨테이너 부재·본문 0장 코호트 0). 단 slug 단위 검수에서 적재 부적합 3종이 드러남 → 본체 이식 전 게이트 규칙 박제.

**드라이런 실측 [실측, 206권]**:
- 카테고리 A(본문≥1장) **206/206**. B(컨테이너 부재)·C(본문 0장)·ERR 모두 0건.
- 순 B 후보 = 206 − Scheme A 21 = **185** (교집합 검산 A∩SchemeA21 = 21/21).
- 본문 장수 분포: 최빈 **14장(126권)**, 13~18장이 표준대(avg 15.0). 1장·34장·35장 이상치 3건.

**발견된 적재 부적합 3종 + 처리 결정**:
1. **본문 0~1장 책 [실측]**: `the-baby-book` — `#read-book` 모달에 `..._cover-3.jpg` **표지 1장만**, 본문 0장.
   - **결정**: Scheme B 적재 **제외**(본문 부재 → 그림책 부적합, PM 판정).
   - **일반 규칙 [제안]**: 본문 추출 장수 **≤ 1 이면 자동 skip**(게이트 ①). 별도 blacklist 불요 — 게이트로 자연 제외.
2. **모달 내 페이지 세트 중복 2벌 [실측]**:
   - `my-special-hair` (34장) = `page2~17`(17장) + 동일 본문 `-1` 충돌접미사판 17장.
   - `the-three-doof-doofs` (35장) = 동일 본문이 날짜만 다른 2벌(`20170320` 17장 / `20170315` 18장).
   - **원인**: Amd#4 dedup(풀스템 기준)이 `page2` vs `page2-1`, 날짜차를 별개 파일로 보아 미병합.
   - **결정 [제안]**: dedup 보강 — WP 충돌접미사 `-N` 정규화 + **페이지번호 기준 중복 제거**(또는 첫 세트만 채택). 실제 분량 ~17장으로 적재(게이트 ②).
3. **카테고리 D(cover-명명 파일 부재) 40권 [실측·휴리스틱]**: Scheme A 중복 `oyisa-and-the-giant-tree` 1권 제외 시 **순 B 39권**.
   - 표지는 `featured_media`로 별도 보유(Amd#4) → **적재 무관**.
   - `Page_01` 표지겸용의 뷰어 중복표시 여부는 실적재 후 표본검수 항목(미결).

**본체(`sync_book_dash_v2.py`) B분기 이식 시 필수 포함 (다음 트랙 예고 — 본 Amendment 범위 아님)**:
- **게이트 ①**: 본문 ≤1장 자동 skip + skip 사유 로깅.
- **게이트 ②**: dedup 보강(충돌접미사 `-N` 정규화 + 페이지번호 dedup).
- `the-baby-book`은 게이트 ①로 자연 제외(별도 blacklist 불요, 단 사유 로그 확인).

**불변**: Amd#4 추출 레시피(컨테이너 격리·data-src·`-WxH` 접미사 제거) 유지. 표지=`featured_media` 결정 유지. asb_native·book-manifests 버킷·license 화이트리스트 4곳·Scheme A 21권 적재분 불변. 본 Amendment는 **게이트 규칙만** 박제하며 코드·DB 변경은 동반하지 않는다.

**미결 (실적재 후 검수)**:
- D 39권 중 `Page_01` 표지겸용의 뷰어 표시 품질.
- dedup '첫 세트 채택' vs '번호 정규화 병합' 최종 택1은 코드 이식 시 확정.

### Amendment #6 (2026-06-23) — Scheme B 게이트 ③: 본문 첫 장 표지중복 제거

**배경 [실측]**: 실적재 1단계(Scheme B 5권 `is_active=false` 스테이징) 후 임시 공개 뷰어 육안검수에서, `maddy-moonas-menagerie`·`mrs-penguins-perfect-palace` 2권 모두 **표지가 2회 노출**(`cover_url` 표지 1회 + 본문 첫 면이 동일 표지 1회).
- 나머지 렌더(면 카운트·어트리뷰션 박스·완독)는 정상 — 결함은 **표지중복에 한정**.
- 원인: Amd#4 추출이 `#read-book` 컨테이너 내 본문 이미지를 모두 수집하는데, 일부 책은 **첫 면에 표지 이미지가 포함**됨(Amd#5의 D 39권 = cover-명명 파일 부재 코호트와 관련 [추정]). maddy 실측: 본문 첫 URL = `..._front-cover_20140922.jpg`.

**결정 (PM 합의)**:
- **게이트 ③ 신설**: 본문 첫 이미지가 `cover_url`(featured_media 표지)과 **동일 그림**이면 본문 매니페스트에서 제외.
- **[제안] 판정 방식 후보 (드라이런서 택1 확정)**:
  - (a) featured_media 표지 파일 stem ↔ 본문 첫 이미지 stem 비교 → 일치 시 제외.
  - (b) (a) 부족 시 보조 신호 추가(예: 첫 이미지 해상도/바이트 비교 등).
- **파일명 키워드(`front-cover`/`cover` 문자열) 단독 의존은 불채택**: `little-sock`류처럼 표지가 `Page_01`이라 키워드 부재인 변종을 놓침(파일명 불신뢰 원칙 — Amd#4와 일관).

**적용 범위 (실측 전 [추정])**:
- D 39권(cover-명명 파일 부재) 중심으로 의심되나, **전량 드라이런 전엔 확정 불가**.
- 게이트 ③은 **첫 이미지 1장만 검사**(둘째 장 이후 본문은 보존). 과잉제거 방지.

**검증 게이트 (다음 트랙 — 본 Amendment 범위 아님)**:
- 게이트 ③ 구현 후 39권+표준책 표본에 **읽기전용 드라이런**: (1) 표지중복으로 첫 장 제외되는 책 수 (2) 오판(표지 아닌데 제외) 0건 확인 (3) `my-special-hair`/`maddy` 등 기존 케이스 장수 변화 점검.
- 드라이런 통과 후에만 코드 확정 → 전량 적재.

**불변**: Amd#4 추출 레시피·게이트①②·dedup A·표지=`featured_media`·Scheme A 21권 적재분 불변. 게이트 ③은 **매니페스트 본문 목록 조정**일 뿐 `cover_url`·DB 스키마 변경 아님.

**미결**:
- 판정 방식 (a)/(b) 최종 택1은 드라이런 실측 후.
- 적재 1단계 5권(스테이징 중)은 게이트 ③ 반영 위해 **재적재(매니페스트 갱신)** 필요 여부도 드라이런 후 결정.
