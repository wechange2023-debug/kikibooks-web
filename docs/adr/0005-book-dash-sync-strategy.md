# ADR-0005 — Book Dash 동기화 전략: `_data/meta.yml` 단일 출처 채택

**상태** Accepted
**날짜** 2026-05-14
**관련** `tasks/phase-04-book-dash-sync.json`, `docs/adr/0004-source-platform-list.md`, `docs/guidelines/license-rules.md` 4.2절

---

## 1. 배경

Phase 04에서 Book Dash 콘텐츠를 `books` 테이블에 적재한다. 후보 데이터 소스가 3가지 있었다.

| 후보 | 데이터 형태 | 추정 권수 | HTML 본문 |
|---|---|---|---|
| A. `github.com/bookdash/bookdash-books` 의 `_data/meta.yml` | 정형 YAML + 마크다운/이미지 | 영어 ~60권 + 번역본 | `bookdash.github.io`에 HTML 호스팅 |
| B. `bookdash.org` `books-sitemap.xml` 스크래핑 | sitemap → 상세 페이지 HTML 스크래핑 | 600+권 URL | PDF/ePub 다운로드 링크 |
| C. `bookdash/bookdash-android-app`의 Firebase JSON dump | Firebase export | 불명 | Android 앱 전용 |

---

## 2. 결정

**후보 A(`_data/meta.yml`)를 단일 출처로 채택한다.** Phase 04의 영어 콘텐츠 1차 적재는 이 한 가지 경로만 사용하며, B/C는 사용하지 않는다.

source_id = meta.yml의 `identifier` UUID (없는 항목은 슬러그 fallback).
content_url = `https://bookdash.github.io/bookdash-books/{slug}/en/`.

---

## 3. 근거

### 3.1 정형 데이터 vs. HTML 스크래핑
- meta.yml은 YAML로 작성된 단일 파일이며, 모든 책의 메타데이터(title, creator, date, ISBN, identifier UUID, language, translations)가 일관된 스키마로 들어 있다.
- bookdash.org의 책 상세 페이지는 WordPress 테마 기반이며 마크업이 시간이 지나면 변경될 가능성이 있다. 스크래핑 코드는 잘 깨지고, 깨지면 sync가 조용히 0건을 적재할 위험이 있다.

### 3.2 Phase 12 reader spec과의 정합
- Phase 12의 verification 항목은 "Book Dash HTML iframe 정상"으로 명시되어 있다.
- `bookdash.github.io`는 HTML 페이지를 그대로 제공하므로 `content_type='html'` + `content_url=GitHub Pages URL` 조합으로 즉시 임베드 가능하다.
- bookdash.org의 PDF/ePub 경로를 선택했다면 Phase 12에서 PDF.js 뷰어를 추가로 구축해야 했다.

### 3.3 iframe·CORS 호환성 사전 검증 결과 (2026-05-14)
- `HEAD https://bookdash.github.io/bookdash-books/a-beautiful-day/en/` 응답:
  - `200 OK`
  - `X-Frame-Options` 없음 ✅ — iframe 임베드 차단 안 함
  - `Content-Security-Policy` 없음 ✅
  - `Access-Control-Allow-Origin: *` ✅ — CORS 완전 개방
- 헤더 검사는 본 페이즈 시작 전에 PowerShell `Invoke-WebRequest -Method Head`로 직접 수행했으며, 결과를 Phase 04 plan 단계에서 사용자 승인 받았다.

### 3.4 미래 디버깅을 위한 주의 메모

**메모 1 — Book Dash HTML이 2019년 빌드 결과물이다.**
- 검증 시 `Last-Modified: Mon, 04 Nov 2019 09:04:47 GMT` 헤더 확인.
- `bookdash-books` 저장소의 마크다운→HTML 변환 워크플로가 2019년 이후 활발히 재실행되지 않았음을 시사한다.
- 그러나 ① CC BY 4.0 라이선스는 **영구**이고 ② 정적 HTML은 변하지 않으며 ③ Book Dash 신간은 bookdash.org PDF에는 추가되지만 GitHub HTML 빌드에는 빠질 수 있다.
- 결과적으로 키키북스가 적재하는 ~60권은 **안정적이지만 신간 자동 반영은 기대하지 말 것**. 신간 보강은 Phase 6 GitHub Actions cron 외에 별도 보강 페이즈(예: Phase 04.5)로 검토한다.
- 향후 "왜 새 책이 안 들어오지?"라는 디버깅 시 이 메모를 가장 먼저 참고할 것.

**메모 2 — `Access-Control-Allow-Origin: *`가 열려 있다.**
- Phase 12 reader는 기본적으로 `<iframe src="...">`로 임베드하지만, CORS가 개방되어 있으므로 향후 필요 시 `fetch()`로 HTML 본문을 가져와 React 컴포넌트로 렌더하는 옵션이 열려 있다.
- 예: 페이지 단위 진도 추적(reading_sessions.pages_read)을 정확히 하려면 iframe 내부 페이지 수를 계산해야 하는데, fetch로 직접 파싱하는 편이 iframe postMessage보다 단순할 수 있다.
- 본 ADR 시점에는 채택하지 않지만, Phase 12 구현 시 검토할 옵션으로 남긴다.

### 3.5 후보 B(sitemap 스크래핑) 배제 이유
- 검색·확인 결과 sitemap이 영어 원본과 번역본을 구분하지 않고 600+ URL을 평면 나열한다. 언어 필터링이 상세 페이지 진입 후에야 가능 → N+1 fetch 발생.
- 본문 형식이 PDF/ePub뿐이라 Phase 12 HTML 뷰어 spec과 어긋난다.
- HTML 마크업 변경 시 sync가 무음 실패할 가능성이 높다.
- bookdash.org에 대한 fetch 부하를 늘리는 것이 NPO에 대한 예의 측면에서도 바람직하지 않다.

### 3.6 후보 C(Firebase JSON dump) 배제 이유
- `bookdash-android-app/server/book-dash-a93c3-export.json`은 Android 앱 전용 데이터로, 라이선스 표기가 누락된 책이 섞여 있을 수 있다 (앱 내 별도 표시 UI에 의존).
- 갱신 주기가 더 불투명하다.
- 형식이 Firebase Realtime Database export 구조라 우리 스키마로 변환하는 매핑 로직이 무거워진다.

---

## 4. 결과

- `scripts/sync_book_dash.py`는 `https://raw.githubusercontent.com/bookdash/bookdash-books/master/_data/meta.yml`만 fetch한다.
- 본 ADR의 메모 1·2는 미래의 디버깅(특히 "왜 신간이 안 들어오지?" / "fetch로 본문 가져올 수 있나?")에 대한 명시적 참고점이다. 메모 삭제는 별도 ADR 발행을 거친다.
- 데이터 출처 변경(예: meta.yml 경로 이전, Book Dash가 별도 JSON API 제공) 시 본 ADR을 갱신하거나 후속 ADR을 발행한다.

---

## 5. 재검토 트리거 (이런 일이 생기면 본 ADR을 다시 본다)

- bookdash-books 저장소가 archive 처리되거나 redirect됨
- meta.yml의 필드 스키마가 변경됨 (creator → authors[] 등)
- bookdash.github.io에 `X-Frame-Options` 헤더가 추가되어 iframe 임베드가 차단됨
- 키키북스 베타 콘텐츠 부족으로 sitemap 보강이 필요해짐 → Phase 04.5 ADR로 분리
- Phase 12 reader가 페이지 단위 추적을 요구하여 fetch 방식 채택이 필요해짐

---

*문서 끝.*
