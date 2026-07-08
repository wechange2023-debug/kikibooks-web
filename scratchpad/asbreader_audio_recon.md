# AsbReader 뷰어 오디오 통합 — 사전 정찰 메모

작성일 2026-07-08 · 정찰 전용(코드/DB/push 없음). 근거는 grep/view 실측만.

---

## 1) AsbReader 컴포넌트 위치 / 뷰어 라우트

- **컴포넌트 정의**: `components/book/asb-reader.tsx` — `'use client'`, `export function AsbReader(...)`.
- **사용처(뷰어 라우트)**: `app/(reader)/book/[id]/read/page.tsx`
  - Server Component. `switch (book.content_type)` 분기에서 `case 'asb_native':` 일 때 `<AsbReader ... />` 렌더(라인 141~155).
  - `content_type === 'html'`은 `<HtmlReader>`(iframe). ASb만 자체 렌더.

## 2) 뷰어가 받는 책 데이터 (오디오 경로 조립 가능성)

- 데이터 소스: `lib/book/detail.ts` `getBookById → getBookByIdCached`.
- **SELECT 컬럼**(detail.ts 라인 124~127): `id, title, author, illustrator, cover_url, content_url, content_type, original_url, license, attribution_text, source_platform, source_id, level, age_min, age_max, language, is_active`
  - ✅ `source_platform` **있음** (Book 인터페이스 라인 56)
  - ✅ `source_id` **있음** (라인 63, NOT NULL) — 오디오 경로 조립에 필요한 키 확보됨
  - ❌ `has_audio` **쿼리에 없음** — SELECT·Book 인터페이스 모두 미포함
- **AsbReader에 전달되는 props**(read/page.tsx 라인 143~154): `bookId, contentUrl, coverUrl, title, originalUrl, originalLinkLabel, readerCopy, bookDetailHref`
  - → `source_id`·`source_platform`·`has_audio` 어느 것도 **뷰어까지 전달되지 않음**. 현재 AsbReader는 오디오 존재 여부·경로 키를 전혀 모른다.

## 3) 본문 텍스트 렌더링 구조 (하이라이트 붙일 지점)

- **DOM 구조**: 한 면(face)의 본문 텍스트는 **단일 `<p>` 통짜 렌더**(asb-reader.tsx 라인 377~381):
  ```
  {face.text && (
    <p className="... whitespace-pre-line break-keep ...">{face.text}</p>
  )}
  ```
  - 문장/단어 단위 span 분리 **없음**. `whitespace-pre-line`으로 개행만 보존. → 단어 하이라이트를 붙이려면 `face.text`를 단어(또는 marks의 start/end 오프셋) 단위로 **쪼개 span으로 감싸는 렌더 변경이 필요**.
- **페이지 상태 관리**: `const [index, setIndex] = useState(0)` (라인 159). `goPrev/goNext`가 `setIndex` 함수형 업데이트로 클램프(라인 221~225). 버튼·키보드(←/→)·터치 스와이프 공용.
  - **face 배열 구성**(`toFaces`, 라인 76~85): `index 0 = 표지면`(coverUrl 있을 때), `index 1..N = pages[0..N-1]`. → **face index ≠ page 번호**. face N ↔ pNN 매핑 시 표지 유무만큼 오프셋 보정 필요.
  - 표지 이미지 404 시 `handleCoverError`가 표지면을 faces에서 제거(라인 350~353) → 오디오 트랙 매핑도 이 재배열에 영향받음(주의).
- **기존 오디오 코드**: `grep`으로 `lib/components/app` 전 범위에서 `<audio` / `new Audio` / `useAudio` / `audioRef` / `has_audio` / `book_audio` / `audio_path` / `.marks` **0건**. 완전 신규 구현.

## 4) marks 포맷 실물 (본문 vs 표지)

- 본문 예: `scripts/tts_pilot/out/audio/a-beautiful-day_p1_Ruth_r78.marks.json`
- 표지 예: `scripts/tts_pilot/out/audio/a-tiny-seed-cover.marks.json`
- **형식**: JSONL(줄당 1 객체). 실제 키 그대로:
  ```
  {"time": 137, "type": "word", "start": 3, "end": 7, "value": "What"}
  ```
  - `time`: 오디오 재생 밀리초(ms) 기준 해당 단어 시작 시각.
  - `type`: `"word"` (관측된 전 행 동일).
  - `start`/`end`: **문자 오프셋**(단어가 텍스트 원문에서 차지하는 char index 범위).
  - `value`: 단어 문자열.
- **본문·표지 형식 동일** — 두 파일 모두 같은 스키마(`time/type/word/start/end/value`). 표지는 제목+저자 낭독의 마크.

## 5) 환경변수

- Supabase 공개 URL: **`NEXT_PUBLIC_SUPABASE_URL`** (detail.ts 라인 94, categories.ts 라인 423, supabase/client.ts 라인 15에서 동일 사용).
- 재생 URL 조립 예상형: `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/book-audio/{audio_path}` (창고 경로는 book_audio 장부/ADR-0034 기준, 이번 정찰 범위 밖 — 설계 시 확정).

---

## 오디오 통합에 필요한데 현재 없는 것 (요약)

1. **오디오 메타가 뷰어까지 안 옴**: `getBookById` SELECT에 `has_audio` 없고, `source_id`/`source_platform`도 AsbReader props로 미전달 → 쿼리 컬럼 추가 + prop threading 필요.
2. **본문이 통짜 `<p>`**: 단어 하이라이트를 위해 `face.text`를 marks의 `start/end` char 오프셋 기준으로 span 분해하는 렌더 변경 필요. 단, `parseAsbText`의 `normalizePageText`(`@ @`→개행·공백 축약·trim, asb-parser.ts 58~63)가 렌더 텍스트를 변형하므로 **marks의 char 오프셋이 AsbReader가 실제 그리는 문자열과 정확히 정렬되는지 설계 단계에서 반드시 검증**해야 함(오프셋 기준 원문 불일치 시 하이라이트 어긋남).
3. **오디오 재생/트랙 매핑 계층 전무**: `<audio>`·재생상태·time→word 하이라이트 동기화 코드 0건이며, face index(표지 오프셋·표지 404 재배열 포함) ↔ 오디오 트랙(cover/pNN) 매핑 규칙을 새로 정의해야 함.

---

# 추가 정찰 — HtmlReader 오디오 통합 타당성 (2026-07-08)

배경 정정: **오디오 착지된 44권은 AsbReader가 아니라 HtmlReader(iframe)에서 렌더된다.** 위 §1~5의 AsbReader 분석은 `asb_native` 책 대상이었고, 이번 44권과는 렌더 경로가 다르다. 이 절이 실제 대상(html 44권)의 타당성을 판정한다.

## 1) 44권 content_type 확정

- **판정: `content_type = 'html'`.** 근거:
  - `scratchpad/tts_recon_cohort.sql` — TTS 대상 코호트 정의 자체가 `WHERE source_platform = 'book_dash' AND content_type = 'html'` (Q1·Q2 모두). 즉 오디오 대상 선정 기준이 html.
  - `scratchpad/tts_recon_49.csv` — 대상 44/49권의 `content_url`이 전부 `https://bookdash.github.io/bookdash-books/{slug}/en/` 형(GH Pages). content_type='html' 책의 iframe src와 동일.
  - `scratchpad/step8_book_audio_insert.sql` — 이 코호트에 `has_audio` 반영(44권). 대상 = 위 html 코호트.
- **확정용 SELECT 문안**(팀장 실행, 읽기 전용):
  ```sql
  SELECT content_type, source_platform, COUNT(*)
  FROM books
  WHERE has_audio = true
  GROUP BY content_type, source_platform;
  -- 기대: html | book_dash | 44
  ```

## 2) HtmlReader의 iframe src 출처 (핵심 판정)

- 컴포넌트: `components/book/html-reader.tsx`.
- **iframe src = `book.content_url`**(라인 66 prop `src`, 라인 162 `<iframe src={src}>`). read/page.tsx 라인 133에서 `src={book.content_url}` 전달.
- **출처 = 외부 도메인(다른 출처)**: content_url = `bookdash.github.io`(§1 근거). 우리 도메인(hellokiki.co.kr)과 **cross-origin**. 컴포넌트 주석도 명시 — 라인 12~13 "외부 호스팅 책 본문(Book Dash bookdash.github.io · GDL content.digitallibrary.io)을 cross-origin iframe으로 임베드".
- **sandbox 속성 있음**: 라인 164 `sandbox="allow-scripts allow-same-origin"`. 주석(라인 18~20) 명시 — `allow-same-origin`은 **iframe 자기 출처(bookdash.github.io) 기준**이라 부모(키키북스 origin) 탈출 불가. 즉 부모 페이지 JS는 iframe 내부 DOM에 접근 불가.

## 3) book_dash 44권 '페이지별 이미지' 확보 여부 (자체 뷰어 재료)

- **판정: 이 44권(html)에 대해서는 페이지별 이미지 재료 DB/파싱 로직 모두 없음.**
  - `lib/book/detail.ts` Book 인터페이스·SELECT에 이미지 컬럼은 `cover_url` 단 하나. 페이지별 이미지 배열/URL 컬럼 **없음**(image/img/page-url grep 0건).
  - `parseAsbText`(asb-parser.ts)는 `asb_native` 전용. html 책은 이 파서를 타지 않는다(read/page.tsx 분기). html 44권의 본문 이미지는 전부 **외부 iframe HTML 내부**에만 존재.
- **참고(별개 트랙)**: `docs/adr/0027-bookdash-152-image-sequence.md`(상태 **Proposed·미구현**)는 Book Dash **신간 152권**을 CloudFront 페이지 이미지 시퀀스 + `asb_native`로 적재하는 설계다. 단 이는 (a)미구현이고 (b)오디오 대상인 **기존 54권(html)이 아니라 신간 152권**을 다룬다. 즉 현재 오디오 44권에는 적용되지 않는다.

## iframe 내부 하이라이트 가능/불가능 — 한 줄 판정

**불가능.** iframe src가 외부 도메인(`bookdash.github.io`)이고 sandbox `allow-same-origin`이 iframe 자기 출처 기준이라, 부모(키키북스) 페이지는 same-origin policy상 iframe 내부 텍스트 노드에 접근·하이라이트를 칠할 수 없다 — 하이라이트를 하려면 iframe을 버리고 본문을 **우리 출처에서 직접 렌더**하는 경로가 전제이며, 그 경우 44권(html)에는 페이지 이미지 재료가 현재 없어 별도 이미지 시퀀스 적재(ADR-0027류)가 선행되어야 한다.
