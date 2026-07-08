# book_dash 자체 뷰어 — 이미지 창고 스키마 정찰 노트

> 2026-07-08 · **읽기 전용 정찰**. 코드·마이그레이션·DB 쓰기·git 없음.
> 목적: ADR-0035 D3(이미지 = 우리 창고 복사)의 버킷·키 규칙 확정에 필요한 **사실만** 수집.
> 결정은 하지 않는다. 마지막 §F에 미결 질문만 나열.

---

## A. ADR 정합성

### A-1. ADR-0035 D2/D3/D4 핵심 요약 (`docs/adr/0035-bookdash-self-viewer.md`, Accepted)

- **D2 — 페이지 모델 '면(face)' 배열**(L36~43): 도서 = 면 배열. 두 종류 —
  ① 그림+텍스트+오디오 면(이미지1 + 본문 + pNN 오디오 + marks), ② 그림만 면(이미지1만).
  실측 `a-beautiful-day`: **이미지 12면 ≥ 텍스트 10면 = 오디오 10개**. 이미지:오디오 1:1 아님.
  pNN은 **장면 번호를 따르는 gap 방식**(텍스트 없는 면에서 번호 비고 재번호 안 함. 예 p4·p12 없음).
- **D3 — 이미지 확보 = 창고 복사(방식 B)**(L45~48): 원본 `images/NN.jpg`를 **Supabase Storage로 복사**.
  핫링크(방식 A) 기각(외부 GH Pages 종속 회피). 라이선스 CC BY 4.0 → 어트리뷰션 유지 시 재배포 허용.
  **저장 위치·경로 키는 "제안형"**: 이미지 버킷 및 키 `{source_platform}-{source_id}/NN.jpg`
  (오디오 `book_dash-{source_id}/pNN.mp3` 규칙과 대칭, ADR-0034 정합). **실제 버킷·스키마 확정은
  후속 구현 ADR 또는 본 ADR Amendment로 이연**(← 이번 정찰이 그 근거 수집).
- **D4 — 자막 하이라이트 정렬(가장 중요)**(L50~54): marks `start/end`는 **Polly 입력 문자열 기준**.
  뷰어 렌더 문자열을 marks 생성 텍스트와 **동일 문자열**(single source of truth)로 맞춰야 함.
  텍스트를 char-offset으로 `<span>` 분해, `normalizePageText`(`lib/book/asb-parser.ts:58~63`) 등
  렌더 전 변형이 offset을 깨지 않도록 처리. **구현 단계 필수 게이트(G1)**.

### A-2. ADR-0027 대조 (`docs/adr/0027-bookdash-152-image-sequence.md`, Proposed) — 이미지 저장·명명 호환/충돌

| 항목 | ADR-0027 (신간 152권) | ADR-0035 (기존 54권 코호트) | 호환/충돌 |
|---|---|---|---|
| 이미지 호스트 | CloudFront `d3qawc7yl9x4zs.cloudfront.net` | GH Pages `bookdash.github.io` | 다름(둘 다 외부 `.jpg`) |
| 저장 방식 | **CloudFront 외부 핫링크**(D3, 복사 안 함) | **Supabase Storage 복사**(D3) | ⚠️ **정반대 결정** |
| content_type | `asb_native`(매니페스트 `.txt`) 재사용 | D1 자체 뷰어(iframe 폐기). content_type 결정 없음 | 잠재 충돌(아래) |
| 텍스트 층 | 텍스트가 이미지에 인쇄됨 = 텍스트 레이어 없음(그림만 면) | `<p>` 본문 텍스트 실재(형광펜 대상 O) | 다름 |
| parser | `.jpg`/`.jpeg` 필터 확장(`asb-parser.ts:114`) 이미 반영 | 동일 parser 재사용 가능성(§D) | 호환 |
| 명명 | `{slug}_en_page{N}.jpg`(zero-pad 없음, 1-based) | `images/NN.jpg`(2자리 zero-pad, 1-based) | 다름(§B) |

- **골격 호환**: "외부 `.jpg` 이미지 시퀀스를 자체 뷰어(또는 asb_native)로 그린다"는 큰 틀은 동일.
  parser `.jpg` 확장(0027 D2 → asb-parser.ts:114~121에 이미 반영)은 GH Pages `.jpg`에도 적용 가능.
- **명시 충돌 지점**:
  1. **저장 방식 상반** — 0027은 이미지 무복사(핫링크), 0035는 복사. 두 book_dash 코호트가
     **본문 이미지 저장 정책이 갈린다**(0027 D3 §미래옵션엔 "베타 안정화 후 복사 전환 가능"이라
     명시돼 있어 장기적으로는 0035 복사 방향으로 수렴 여지 있음).
  2. **content_type 경로 갈림** — 0027은 `asb_native` + `.txt` 매니페스트 + AsbReader, 0035는
     iframe 폐기 후 신규 자체 뷰어(content_type 결정 미기재). 두 코호트가 같은 뷰어로 수렴할지,
     별도 뷰어 2종이 될지 미결(0035 D1은 "자체 뷰어"라고만 함).

---

## B. 현재 book_dash 이미지 실태 (grep/view만)

### B-1. 이미지 로드 경로 (원본 도메인·패턴)
- **뷰어(현행)**: `components/book/html-reader.tsx`가 `book.content_url`을 **cross-origin iframe** src로
  임베드(L161~170, `sandbox="allow-scripts allow-same-origin"`). 이미지는 iframe 내부 GH Pages 페이지가
  자체 로드 → 부모(키키북스)는 이미지 URL을 직접 참조하지 않음. (자막 하이라이트 원천 불가 = ADR-0035 §1)
- **추출 스크립트**: `scripts/tts_pilot/extract_text.py`
  - `GH_PAGES_BASE = "https://bookdash.github.io/bookdash-books"` (`:47`)
  - 페이지 HTML: `{GH_PAGES_BASE}/{slug}/en/` (`fetch_html`, `:60`)
  - 이미지 절대 URL: `{GH_PAGES_BASE}/{slug}/en/{src}` (`to_abs_image_url`, `:83~88`),
    원본 HTML의 `<img src="images/NN.jpg">` 상대경로를 절대화.

### B-2. 책당 이미지 개수·확장자·명명 규칙 (실측 샘플)
- 샘플 `a-beautiful-day` (`out/a-beautiful-day.json`, 실측):
  - **이미지 12장**, page 1~12. 확장자 **`.jpg`**.
  - 명명 = **2자리 zero-pad, 1-based**: `.../images/01.jpg`, `02.jpg`, …, `12.jpg`
    (인용: page1 `https://bookdash.github.io/bookdash-books/a-beautiful-day/en/images/01.jpg`,
     page12 `.../images/12.jpg`).
  - 이 중 **텍스트 있는 면 10개**, **빈 텍스트 면 2개(page 4·12)** — `text: ""`(그림만 면).
- 오디오 pNN gap 실측(`out/audio/` 파일 목록): `a-beautiful-day_p1..p3, p5..p11`(p4·p12 없음).
  → 빈 텍스트 면(page4·12)에서 오디오 번호가 **비는 gap 방식** 확증(ADR-0035 D2 "예 p4·p12 없음" 일치).
- ⚠️ **명명 규칙 표본 1권 한정**. 44권 전체가 `NN.jpg` 2자리 zero-pad·1-based·연속인지는 **미검증**
  (ADR-0027 Scheme A/B 교훈 = 소량 표본 일반화 금지). §F 질문 참조.
- **주의(번호 체계 3종 혼재)**: 원본 이미지=`01`(1-based, 2자리) / extract_text page=`1`(1-based, 무패딩,
  이미지 장면 순번) / 오디오·DB page_index=`p00`(0-based, 2자리, ADR-0034). 이미지 1장 ↔ 오디오 1개가
  같은 면인데 **파일명 숫자가 서로 다르다**(01.jpg ↔ p00.mp3). 이미지 키 규칙 확정 시 정렬 필요(§F).

---

## C. 기존 창고 키 규칙 재확인 (이미지 키 정합 근거)

- **정본 = `{book_key} = {source_platform}-{source_id}`**
  - 문서: `docs/adr/0034-tts-audio-storage-implementation.md` 결정 ②(L104~130):
    경로 `book-audio/{book_key}/p00.mp3` · `p00.marks.json`, page 2자리 zero-pad·0-based.
    표지는 Amd#1(L175~197) `{book_key}/cover.mp3`.
  - 코드: `scripts/tts_pilot/upload_audio.py`
    - `:62` `SOURCE_PLATFORM = "book_dash"`
    - `:94` `"book_key": f"{SOURCE_PLATFORM}-{source_id}"` (예 주석 `book_dash-9c9e55de-...`)
    - `:112~113` `f"{key}/p{nn:02d}.mp3"` / `.marks.json`, `nn = page-1`(0-based, `:109`)
    - `:118` `f"{key}/cover.mp3"`
    - `:61` `BUCKET = "book-audio"`
- **source_id = Book Dash 메타 고유 UUID**(slug 아님). ADR-0034 §2(L39~43) 실측: 커버 키
  `bookdash-9c9e55de-fe46-11e5-...webp`. 단 **예외 3권**(`upload_audio.py:76`
  `DB_SLUG_SOURCE_ID = {little-sock, maddy-moona, mrs-penguins-palace}`)은 DB `source_id`가 full-slug.
- **book-covers 선례(참고)**: 키 = `bookdash-{source_id}.webp` (flat, 폴더 없음). ADR-0032 근거.
  ⚠️ **접두사 철자 불일치**: 커버 `bookdash-` vs 오디오 `book_dash-`(밑줄). ADR-0034 결정 ②는
  book-audio에 `source_platform` 값 그대로(`book_dash-`)를 채택하고, 커버 통일은 후속 카드로 이연.
- **버킷 네이밍 컨벤션**: `book-covers` · `book-manifests` · `book-audio` = **`book-*`** 접두.

---

## D. 파서 구조 (G1 게이트 사전 이해)

`lib/book/asb-parser.ts` (실측 view 기준):
- **면(face) 배열 타입**(L23~37):
  - `AsbPage = { text: string | null; imageUrl: string | null }` (L24~29) — 텍스트·이미지 중 하나는 null 가능.
  - `AsbBook = { coverUrl: string | null; pages: AsbPage[] }` (L32~37) — 표지 별도, 본문 면 배열.
- **`normalizePageText`**(L58~63, 실측 라인 확인): `text.replace(/\s*@\s*@\s*/g, '\n')`(ASb `@@`
  줄바꿈 마커 → `\n`) → `.replace(/\n{2,}/g, '\n')`(빈 줄 접기) → `.trim()`. **char-offset을 바꾸는 변형**
  → ADR-0035 D4/G1이 지목한 "렌더 전 텍스트 변형" 실체.
- **이미지 수집 필터**(L115~121): `illustrations/` 포함 **또는** `.png`/`.jpg`/`.jpeg`로 끝나는 라인 수집.
  주석 L114 "Book Dash CloudFront 이미지(.jpg/.jpeg) 수용 — ADR-0027 D2" = **`.jpg` 확장 이미 반영됨**.
- **이미지 ↔ 텍스트 매핑(Amd#6 A2/A3)**: page_text·images 독립 스트림 → `max(N,M)` 면,
  같은 인덱스끼리 **느슨 정렬**(L128~130), 한쪽 소진 시 단독 면. **강제 1:1·번호 정렬 금지**(L10 A4).
- **핸드오프 "pNN gap 방식"과의 관계**: asb-parser는 **텍스트/이미지 개수 불일치를 index 정렬로 흡수**
  (텍스트 없는 면 = text null 단독 이미지 면). book_dash html 코호트에서 gap을 만드는 실제 주체는
  **extract_text.py(빈 텍스트 장면) + generate_tts(빈 텍스트 오디오 스킵)**이며, asb-parser는 그 결과
  면 배열을 렌더할 때 index 느슨정렬로 수용하는 구조. (단 html 코호트는 현재 asb-parser를 안 거침 → §E·§F)
- ⚠️ **범위 주의**: asb-parser는 **`content_type='asb_native'`(.txt 매니페스트)** 전용. ADR-0035 대상
  **v1 html 54권 코호트는 현재 asb-parser를 통과하지 않고 iframe으로 렌더**된다. 자체 뷰어가
  asb-parser를 재사용할지(0027과 수렴), 별도 파서를 쓸지는 ADR-0035에 미기재(§F).

---

## E. 재사용 예정 스크립트 (`scripts/tts_pilot/`)

- **`extract_text.py`** — GH Pages HTML → 장면 배열 `[{page, image_url, text}]`(`out/{slug}.json`).
  - 이미지 처리: `<p><img>` = 장면 경계(`:110~123`), `image_url` = **GH Pages 절대 URL 수집**(`:83~88`).
  - **자체 뷰어 재사용 O**: 면별 (이미지 URL + 텍스트) 산출 로직이 곧 자체 뷰어 면 배열 소스.
    이미지 **URL 목록·순서·개수·텍스트 유무(그림만 면 판별)**를 그대로 제공. 창고 복사 시 이 image_url
    목록이 **다운로드 소스**가 된다.
- **`generate_tts.py`** — `out/{slug}.json` 소비. `image_url`을 매니페스트에 **패스스루만**(`:257`),
  이미지를 **다운로드/변형하지 않음**(텍스트만 Polly로). → 이미지 로직 재사용 대상 아님(무접촉 확인).
- **`upload_audio.py`** — `book-audio` 업로드 전용. **이미지 미처리**. 단 **`book_key` 조립 코드
  (`:94`)·Content-Type 명시·캐시 헤더·env-only 자격 로드 패턴**이 이미지 업로드 스크립트의 **템플릿**.
- **부재(gap)**: 원본 이미지를 **다운로드해 Storage에 복사(put)**하는 스크립트는 **현재 없음**.
  ADR-0035 D3(창고 복사)를 실행하려면 신규 필요(extract_text의 image_url 목록 + upload_audio의
  업로드/키/헤더 패턴을 결합하는 형태가 유력하나 **결정 아님**).

---

## F. 이미지 저장 ADR 초안에 필요한 미결 질문 (결정 금지 — 질문만)

1. **이미지 버킷 이름**: `book-*` 컨벤션상 신규 `book-images`? 아니면 다른 이름? (문서·코드에 이미지
   버킷 정의 **없음** — 신규 결정 필요)
2. **이미지 키 파일명 규칙**: 오디오 정합(`{book_key}/p00.jpg`, 0-based·2자리)로 갈지, 원본 유지
   (`{book_key}/01.jpg`, 1-based·2자리)로 갈지, ADR-0035 D3 제안형(`{book_key}/NN.jpg`)의 `NN`을
   어느 체계로 확정할지. (현재 원본 `01`·오디오 `p00`이 같은 면인데 숫자 상이 — §B-2 주의)
3. **그림만 면(무텍스트) 이미지도 복사?**: 렌더엔 필요하므로 12장 전부 복사가 자연스러우나,
   오디오는 10개뿐. 이미지 개수(12)와 오디오 개수(10)가 다른 면 배열을 뷰어가 어떻게 조립할지
   (이미지 키는 gap 없이 01~12 연속인가, 아니면 오디오처럼 gap 반영인가) 확정 필요.
4. **source_id 이형 처리**: full-slug source_id 3권(`little-sock`·`maddy-moona`·`mrs-penguins-palace`,
   `upload_audio.py:76`)의 이미지 키는 오디오와 동일하게 메타 UUID로 통일할지, DB source_id 그대로 쓸지.
5. **접두사 표준**: 이미지 키 접두사를 오디오식 `book_dash-`로 할지 커버식 `bookdash-`로 할지
   (ADR-0034가 남긴 미통일 이슈를 이미지에서 어느 쪽으로 정렬).
6. **Content-Type·캐시 헤더**: 이미지(`image/jpeg`) + `Cache-Control: ...immutable`? (오디오 헤더
   정책 ADR-0034 결정 ③ 준용 여부). 원본이 `.jpg` 외(`.png` 등) 섞인 책이 있는지 전수 확인 필요.
7. **이미지 열거·다운로드 소스**: extract_text.py의 `image_url` 목록을 다운로드 소스로 그대로 쓸지.
   `a-beautiful-day`의 `NN.jpg` 2자리·연속 패턴이 **44권(또는 54권 코호트) 전권에 성립하는지 전수
   드라이런** 필요(표본 1권 일반화 금지 — ADR-0027 교훈).
8. **DB 표현**: 이미지도 `book_audio`처럼 **별도 테이블/컬럼**(예: 면별 image_path)을 둘지,
   아니면 `{book_key}` + page_index 규칙으로 **경로를 관례 조립**(무테이블)할지. (오디오는 book_audio
   테이블 채택 — 이미지는 미정)
9. **뷰어·파서 경로**: 자체 뷰어가 asb-parser(asb_native)를 재사용해 0027과 수렴할지, html 코호트
   전용 파서/렌더를 별도로 둘지. 이미지 매니페스트 형식(`.txt` 재사용 vs 신규)이 여기에 종속됨.
10. **표지 이미지**: 오디오는 `{book_key}/cover.mp3`. 이미지 표지는 이미 `book-covers`
    (`bookdash-{source_id}.webp`)에 존재 — 자체 뷰어가 표지를 book-covers에서 가져올지, 본문 이미지
    창고에 별도 복사할지(중복 방지) 확정 필요.
