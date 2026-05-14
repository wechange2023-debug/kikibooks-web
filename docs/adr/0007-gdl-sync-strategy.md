# ADR-0007 — Global Digital Library 동기화 전략: WP REST API + postLink iframe

**상태** Accepted
**날짜** 2026-05-14
**관련** `tasks/phase-05-gdl-sync.json`, `docs/adr/0004-source-platform-list.md`, `docs/adr/0005-book-dash-sync-strategy.md`, `docs/adr/0006-beta-language-scope.md`, `docs/guidelines/license-rules.md` 4.3절(본 ADR로 정정)

---

## 1. 배경

Phase 05에서 GDL 콘텐츠를 600권 이상 적재한다. 후보 데이터 소스는 다음과 같았다.

| 후보 | 인증 | 본문 형식 | 비고 |
|---|---|---|---|
| A. WP REST API + postLink iframe | 불필요 | GDL이 H5P를 자체 렌더 | Book Dash 1안과 동일 패턴 |
| B. .h5p 파일 다운로드 + h5p-standalone | 불필요 | 자체 호스팅 | Supabase Storage 비용·뷰어 복잡도 |
| C. epubUrl + epub.js | 불필요 | 동적 변환 epub | H5P 인터랙티브 손실, 변환 지연 |

---

## 2. 결정

**후보 A를 채택한다.**

- API: `https://content.digitallibrary.io/wp-json/content-api/v1/books/en`
- 본문 URL: `book.postLink` (예: `https://content.digitallibrary.io/en/book/{slug}/`)
- 표지: `https://content.digitallibrary.io/wp-content/uploads/h5p/content/{h5pId}/images/coverImage.jpg`
- `content_type = 'html'` (Phase 12 reader는 Book Dash와 동일하게 iframe 한 줄로 처리)
- `source_id = postId` (정수 UUID 대용, 안정적인 primary identifier)

---

## 3. 근거 (2026-05-14 실측 기반)

### 3.1 API 접근성
- `GET /wp-json/content-api/v1/books/en?posts_per_page=2&_skip=0` → `200 OK`, `application/json`
- 인증 헤더 불필요. API key 또는 OAuth 미요구
- robots.txt(`content.digitallibrary.io/robots.txt`) — `User-agent: * / Disallow:` 전체 크롤링 허용
- lastChanged 필드가 `2026-03-23`로 확인됨 → 운영 중

### 3.2 iframe·CORS 호환성
- `HEAD https://content.digitallibrary.io/en/book/{slug}/`
  - `X-Frame-Options`: 없음 ✅
  - `Content-Security-Policy`: 없음 ✅
  - `Access-Control-Allow-Origin`: 없음 (CORS 닫힘 → iframe 외 fetch 불가)
- `h5pLibrary.embedTypes`: `iframe` → GDL 페이지가 자체 H5P 플레이어를 iframe 내부에 임베드
- 결론: 우리는 GDL postLink를 iframe으로 한 번 더 감싸기만 하면 됨. H5P 라이브러리를 우리 코드에 들이지 않아도 됨

### 3.3 영어 + CC BY 권수 (실측)
- 영어 language taxonomy count: **2,622권**
- 전 언어 cc-by-4-0 license taxonomy count: 9,391권 (영어 교집합 추정 90%+)
- 검증 목표 600권 달성 여유 충분

### 3.4 후보 B(h5p-standalone) 배제
- .h5p 파일 크기: 책당 약 50~200MB
- 600권 적재 시 Supabase Storage 60~120GB → 무료 티어 1GB 초과 → 비용 발생
- 클라이언트 측 h5p-standalone JS 의존성 추가 → Phase 12 reader 코드량 3배
- GDL 사이트가 이미 H5P 렌더링을 책임지고 있으므로 차별점 없음

### 3.5 후보 C(epub.js + epubUrl) 배제
- `epubUrl`은 `/wp-json/epub-generator/v1/book/{h5pId}` 동적 변환 엔드포인트 — 첫 호출 시 H5P → epub 변환 비용 발생
- H5P 인터랙티브 요소(드래그·터치·오디오 트리거)가 epub 변환 과정에서 손실
- Phase 12 reader가 HTML(iframe) + epub(epub.js) 두 분기를 유지해야 함 → 유지보수 부담

---

## 4. 핵심 구현 메모

### 4.1 publisher → author 매핑 (★ license-rules.md 4.3 정정)

**문제:** license-rules.md 4.3절은 GDL의 author 필드로 `authors[]` 첫 항목, illustrator 필드로 `illustrators[]` 첫 항목, license URL로 `license.url` API 필드를 사용한다고 명시되어 있었으나, **2026-05-14 실측 결과 해당 필드들은 GDL API 응답에 존재하지 않는다.** 학습 데이터 cutoff 이전 가정으로 작성된 표였다.

**실측된 응답 키 (전체):**
```
postId, title, description, topicCategory, post_type, post_name,
postLink, url, lastChanged, h5pId, h5pUrl, epubUrl, downloadPdfLocalURL,
mainCategory, topic, resourceType, collectionTag, thumbnail, publisher,
contentsource, h5pLibrary, language, level, license, bookId, h5pFiles
```

**author/illustrator/creator 필드는 어디에도 없다.** 유일한 creator 정보는 `publisher` 필드 (예: `"StoryWeaver"`).

**해결:**
- license-rules.md 4.3절의 `gdl` 행만 실측에 맞게 수정 (다른 플랫폼 행은 건드리지 않음)
- 새 매핑: `author = publisher`, `illustrator = 없음`, `license = license[0].slug`
- publisher마저 결측된 책은 `AttributionError`로 skip → `skipped_by_attribution` 카운트

### 4.2 publisher를 author로 표기하는 CC BY 4.0 정당성

CC BY 4.0의 attribution 요건(license-rules.md 4.1):
1. 저작자 이름
2. 저작물 제목
3. 라이선스 종류 + URL
4. 원본 출처 URL

**publisher 사용이 요건 1을 충족하는 근거:**
- StoryWeaver(Pratham Books 산하), African Storybook 등 GDL의 주요 publisher는 자체적으로 CC BY 라이선스로 책을 발행하는 큐레이션 플랫폼이다.
- CC BY 4.0 §3(a)(1)(A)(i)는 "creator and/or attribution parties"의 indication을 요구하며, 원저자가 비공개일 때 큐레이션 주체를 attribution party로 표기하는 것이 일반적 관행이다.
- GDL이 publisher만 노출하는 것은 의도적 선택(원저자 익명·다수·복합 저작 등의 사정)이므로, 우리가 GDL이 노출하는 정보를 그대로 따라가는 것이 적절하다.
- 결과적으로 우리 attribution_text는 다음과 같이 생성된다:
  ```
  "I Love My Mom" by StoryWeaver, Global Digital Library.
  Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
  Original: https://content.digitallibrary.io/en/book/i-love-my-mom-3/
  ```
- 위 텍스트는 4가지 요건을 모두 만족한다.

**한계:** 향후 GDL이 author 필드를 별도로 노출하면 본 ADR을 갱신하고 attribution을 author 우선으로 변경한다. 본 ADR §5(재검토 트리거) 참조.

### 4.3 level/age 자동 추정은 임시 분류(provisional)

- GDL 응답의 `level` 배열은 대부분 비어 있다 (실측 샘플 `i-love-my-mom-3`: `level: []`).
- `scripts/lib/level_estimator.py`는 description 단어 수 휴리스틱으로 level 1~5와 age_min/age_max를 계산한다.
- **이는 정확한 추정이 아니라 임시 분류**다.
  - 단어 수 = 문장 길이 ≠ 인지 난이도
  - 추상 어휘, 문법 복잡도, 문화 배경 등은 반영되지 않음
- 본 임시 분류의 목적: phase-09(Screen 01 랜딩) 추천 알고리즘과 phase-10(Screen 02 홈) "오늘의 추천 5권" 알고리즘이 동작하기 위한 **non-null 시드값** 제공.
- **Phase 9~10에서 큐레이터(`profiles.role = 'curator'`)가 books.level 컬럼을 직접 UPDATE할 수 있도록 RLS 정책이 설계되어 있다(001_initial_schema.sql 참조).** 큐레이터가 점진적으로 정확도를 끌어올린다.
- 또한 reading_sessions 데이터가 누적되면 phase-9 이후에 "자녀별 완독률"을 역추정하여 level을 자동 보정하는 알고리즘 도입 가능.
- 따라서 휴리스틱의 정확도가 낮더라도 시스템 전체가 점진적으로 개선되는 구조 (ADR-0006 §3.5 미래 확장 경로와 같은 사고).

### 4.4 rate limit 미공개 → 보수적 sleep
- GDL 공식 문서에 rate limit 미명시
- 페이지당 0.5초 sleep + 429 응답 시 30초 backoff × 3회 재시도
- 131페이지 × ~3초 평균 = 약 7분 동기화 시간

### 4.5 payload 다이어트
- 페이지당 응답 ~2.8MB (h5pFiles 등 큰 배열 포함)
- DB에는 essential 필드만 저장: postId, title, description, post_name, postLink, language, license, publisher, level, h5pId
- h5pFiles, mainCategory, topic 등은 폐기

### 4.6 batch upsert
- 100건 단위 묶음 UPSERT — `client.table("books").upsert([row1, ..., row100], on_conflict="source_platform,source_id")`
- 600권 ÷ 100 = 6번 호출. UNIQUE 제약으로 idempotent.

---

## 5. 결과

- license-rules.md 4.3절 GDL 행은 본 ADR 발행과 동시에 실측에 맞게 수정됨 (다른 플랫폼 행은 변경 없음)
- `scripts/sync_gdl.py`는 단일 출처(WP REST API)만 사용
- 본 ADR의 §4.2(publisher 정당성) + §4.3(level 임시 분류)은 큐레이션·법적 감사 시 1차 참조 문서

---

## 6. 재검토 트리거 (이런 일이 생기면 본 ADR을 다시 본다)

- GDL이 author/illustrator 필드를 응답에 추가함 → attribution 우선순위 변경
- GDL이 API 인증을 요구하기 시작함 → 키 발급 + .env.local 갱신
- WP REST API가 다른 path로 이전됨 (예: `/wp-json/gdl/v2/`)
- iframe 차단 헤더가 추가됨 (X-Frame-Options 등) → h5p-standalone 자체 호스팅 재검토
- StoryWeaver/Pratham Books가 별도 라이선스로 GDL에서 분리됨 → 출처 분리 검토
- 큐레이터의 level 정정 비율이 30% 이상 발생 → 휴리스틱 알고리즘 교체 필요

---

## 7. 개정 이력 (Amendment 2026-05-14 · dry-run 후 실측 정정)

`scripts/sync_gdl.py --dry-run --max-pages 2` 실행 결과 본 ADR 작성 시점 가정의 3가지가 실측과 어긋남을 발견했다. 본 ADR을 후속 ADR로 분리하지 않고 §7로 직접 정정한다.

### 7.1 §3.3 권수 정정
- 기존 기재: 영어 책 약 2,622권 추정
- **실측**: API `/wp-json/content-api/v1/books/en` 단일 응답에 **1,313권**만 포함됨
- 원인: language taxonomy의 `count: 2622` 메타데이터는 게임·인터랙티브 등 전체 리소스 타입을 합산한 값으로 추정됨. 실제 H5P 책 엔드포인트의 응답 권수와는 다른 지표
- 영향: 600권 검증선은 여전히 통과 가능 (1,313권 → 필터·dedup 후 ~1,200권 예상)

### 7.2 §4.1·4.2 publisher 결측률 정정 (★ 핵심 정정)
- 기존 기재: "publisher 결측은 < 5% 추정"
- **실측**: 1,313권 중 **856권(65.2%)이 publisher 빈 문자열**
- 대체 필드 스캔: `contentsource` 1건, `mainCategory`/`collectionTag` 모두 빈 배열 → **대체 가능 creator 필드 없음**
- 채워진 publisher 분포: StoryWeaver 289, 3asafeer 79, African Storybook 34, **BookDash 33**, Google 10, 기타 19
- **C안 정직 폴백 채택** (2026-05-14 사용자 결정):
  - publisher 결측 시 author 슬롯에 `"Global Digital Library (creator information not provided by source)"` 명시
  - `build_gdl_attribution()`은 `AttributionError` 대신 `(text, used_fallback: bool)` 튜플 반환
  - sync 통계에 `inserted_with_fallback_author` 카운터 추가
- **CC BY 4.0 법적 정당성**: §3(a)(1)(A)(i)는 "라이선서가 요구한 합리적 방식으로" creator를 표시할 것을 요구하며, 라이선서가 attribution 정보를 제공하지 않은 경우 라이선시는 가진 정보만 표기해도 컴플라이언스 유지. 폴백 텍스트는 사용자에게 메타데이터 한계를 정직하게 노출하는 추가 가치도 가진다.

### 7.3 §4.4 페이지네이션 미작동 (★ API 동작 정정)
- 기존 기재: "posts_per_page=20, _skip=N 페이지네이션, 페이지간 0.5초 sleep"
- **실측**: 다음 모든 파라미터가 무시되며 단일 응답에 1,313권 전체가 반환됨
  - `posts_per_page=2&_skip=0`, `posts_per_page=2&_skip=20`
  - `per_page=2`, `page=1&per_page=2`
  - `offset=0&limit=2`
  - `posts_per_page=2`
  - (파라미터 없음)
- 모든 응답에서 첫 책 `postId=45239`, 마지막 `postId=19522`로 동일
- GDL의 `content.digitallibrary.io/api/` 공식 문서가 명시한 "20 items per page"는 WP 일반 REST API에 대한 설명이며 이 커스텀 엔드포인트에는 적용되지 않음
- **변경**: `sync_gdl.py`는 1회 GET → 메모리 처리 + slice 옵션(`--max-books N`)
- 소요 시간 추정: 7분 → **약 30초** (sleep·다중 요청 불필요)

### 7.4 §4.7 신설 — 동제목 중복 처리
- 실측 결과 같은 정규화 title 그룹 다수 발견 (예: "I Love My Mom" × 3, "Going to School" × 2 등). `h5pId`도 5건 중복
- bookId 1,253건 채워짐, 그 중 unique 1,019개 → "원본 책 1건 → H5P 변환본 N개" 구조로 추정 (예: `i-love-my-mom-arrow-navigation`, `i-love-my-mom-column`)
- **정책**: title.lower().strip() 그룹에서 `lastChanged` 최신 1건만 채택, 나머지는 `skipped_by_title_duplicate` 카운트
- `--verbose` 옵션 시 어떤 책을 선택·기각했는지 상세 로그 출력 (디버깅용)

### 7.5 §4.8 신설 — Book Dash publisher 중복 회피
- GDL이 Book Dash 33권을 자체 publisher로 호스팅하나, Phase 04에서 우리는 Book Dash GitHub Pages 54권을 더 풍부한 메타데이터로 직접 적재했음
- **정책**: `publisher == "BookDash"`인 책은 sync_gdl.py 단계에서 skip + `skipped_by_book_dash_duplicate` 카운트
- 결과적으로 같은 책이 두 source_platform으로 보이는 카탈로그 품질 저하 방지
- UNIQUE(source_platform, source_id) 제약과는 무관 (제약 위반 자체는 발생 안 함)

### 7.6 §4.9 신설 — 한국어 화면 표시 (Phase 11 메모)
- `attribution_text` 컬럼에는 영어 폴백 문구가 그대로 저장됨:
  ```
  "Animal Hide-and-Seek" by Global Digital Library (creator information not provided by source), Global Digital Library.
  Licensed under CC BY 4.0 (...).
  Original: ...
  ```
- 그러나 Phase 11(`docs/intent/screen-03-book-detail.md`) `AttributionBox` UI는 한국 학부모를 대상으로 한국어로 표시되어야 한다
- **변환 가능성 (구현은 Phase 11에서)**:
  - 영어 폴백 패턴 `"creator information not provided by source"` 감지 시 → `"글: 정보 미제공 (Global Digital Library 제공)"` 같은 한국어 라벨로 치환
  - 일반 publisher 표기는 `"글: StoryWeaver (Global Digital Library 제공)"` 형태
- DB의 `attribution_text`는 영어 원본을 유지해야 함 (라이선스 감사·법적 기록의 기준점이므로). UI 변환은 화면 컴포넌트 레이어 책임
- 본 메모는 Phase 11 구현 시 1차 참조점

### 7.7 §6 재검토 트리거 추가
- API가 페이지네이션 파라미터를 다시 지원하기 시작함 → sync 구조 단순화 복원
- publisher 결측률이 30% 이하로 개선됨 → 폴백 사용 비중 재검토 (C안 → A안 환원 가능)
- title dedup 그룹의 평균 크기가 ≥ 2.5로 늘어남 → 별도 dedup 전략 필요

### 7.8 신설 — 비-그림책·H5P 변형본 필터링 + 큐레이션 위임 정책

**배경**: dry-run 미리보기에서 두 종류의 부적합 콘텐츠 발견.
- 비-그림책: "Introduction to translation of math games" 등 학습 자료/메타 콘텐츠
- H5P 변형본: "I love my mom (Arrow navigation)" 같은 동일 본책의 H5P 레이아웃 변형

**자동 분류 신호 실측 결과** (1,313권 전수, 2026-05-14):
- `post_type` / `resourceType[0].name`: 1,313권 모두 "book" → 분류 신호로 사용 **불가**
- `h5pLibrary.name` 분포:
  - `H5P.InteractiveBookSimple`: 1,275 (그림책 표준)
  - `H5P.Column`: 11 (★ 위양성 위험 — 정상 책 "Big Buck Bunny", "Spring" 등도 이 라이브러리 사용)
  - `H5P.InteractiveBook`: 7
  - `H5P.CuriousReader`: 5
  - `H5P.InteractiveVideo`: 2 (★ 명확한 비-그림책)
  - (empty): 13 (★ 불확실 — 그림책 9 + 학습자료 4 혼재)

**자동 skip 정책 (sync_gdl.py 단계)**:

| 정책 | 영향 권수 | 근거 |
|---|---|---|
| `h5pLibrary.name == "H5P.InteractiveVideo"` skip | 2권 | 우리 iframe reader는 그림책 H5P만 처리. 비디오 H5P는 UX 깨짐 |
| `title` prefix skip: `Introduction to `, `Numeracy Level`, `Literacy Level`, `World Around Us` | ~6권 | 명백한 학습자료·시스템 메타 |
| `title` 정규식 skip: `\((Arrow navigation\|Column\|Column, .*\|Comprehension after book\|Comprehension in book.*\|Arrow.*comprehension.*)\)` | 11권 | 동일 본책의 H5P 변형. 괄호 안 명시 라벨은 GDL이 의도적으로 부여한 기술 식별자 |

**자동 skip 불가 케이스 — 큐레이션 위임**:

`h5pLibrary.name == "H5P.Column"`을 기준으로 skip하면 정상 그림책 5~6권("Big Buck Bunny", "Spring", "The Ocean Dream (CAB – sv)" 등)이 함께 잘리는 위양성 발생. 따라서 H5P.Column 자체는 skip 기준에서 제외.

큐레이션 위임 대상(약 12권 추정):
- `h5pLibrary=(empty)` 9권 중 정상 그림책으로 보이는 케이스
- 데모/테스트 콘텐츠("Big Buck Bunny", "Spring", "Lllamigos – test extended version" 등)
- 사용자 신고로 추가되는 부적합 콘텐츠

**큐레이션 잔여 후보 식별 SQL** (Phase 9~10 큐레이터가 사용):

```sql
-- 1순위: title 휴리스틱 (데모/테스트/언어 변형)
SELECT id, source_id, title, content_url
FROM books
WHERE source_platform = 'gdl'
  AND (
    title ILIKE '%test%'
    OR title ILIKE '%demo%'
    OR title ILIKE '%sample%'
    OR title ~ '\([a-z]{2}\)\s*$'        -- 끝에 (sv), (en) 같은 언어 코드 패턴
    OR title ILIKE '%(cab%'              -- "Column After Book" 등 GDL 내부 약어
  )
ORDER BY title;

-- 2순위: publisher 결측 + author NULL (h5pLibrary empty 케이스의 대다수)
-- 사용자 화면 노출 전 큐레이터 검토 권장
SELECT id, source_id, title, attribution_text
FROM books
WHERE source_platform = 'gdl'
  AND author IS NULL
  AND attribution_text LIKE '%creator information not provided%'
ORDER BY title
LIMIT 100;

-- 큐레이터가 부적합 판정 시 노출 차단 (DB는 그대로 보존)
UPDATE books SET is_active = FALSE
WHERE source_platform = 'gdl' AND source_id = '<postId>';
```

**라이선스 영향 없음**: 본 필터링은 큐레이션 결정이며 라이선스 요건과 무관. CC BY 4.0 콘텐츠를 적재만 하고 화면 노출만 차단하는 것은 라이선스 위반이 아님 (CC BY 4.0 §2: 권한이지 의무가 아님).

### 7.9 신설 — HTML 엔티티 정규화

**배경**: dry-run 미리보기에서 title에 `&amp;`, `&#039;` 같은 HTML 엔티티가 그대로 노출됨.

**실측 결과 (1,313권)**:
- title에 HTML 엔티티 포함: **19권 (1.4%)**
- description: 0건

**정책**: `sync_gdl.py`의 `build_payload()`에서 `html.unescape()`를 title / description / publisher에 적용. Python 표준 라이브러리이므로 의존성 추가 없음.

**예시**:
- `"Cat &amp; Dog and the Rain"` → `"Cat & Dog and the Rain"`
- `"Domu &amp; Lamu's Big Adventure, Part 4: Rain Dance"` → `"Domu & Lamu's Big Adventure, Part 4: Rain Dance"`

attribution_text는 정규화된 title로 빌드되므로 자동 반영. 라이선스 감사·법적 기록의 기준점이 영어 원본인 점은 §7.6과 동일하게 유지.

---

*문서 끝. §7 amendment는 본 ADR 본문 §3~§6과 동등한 권위를 가진다.*
