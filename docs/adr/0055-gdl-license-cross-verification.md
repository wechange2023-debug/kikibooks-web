# ADR-0055: GDL 라이선스 검사 보강 — 메타데이터 slug와 자산 배지 교차 검증

## Status

**Proposed** (2026-08-07) / 기준 HEAD `a2bb402`
본 문서는 **결정 제안만** 담는다. 코드·DB·Storage 작업은 승인 후 별도 작업지시서에서 수행한다.
단, 본 ADR을 촉발한 **2026-08-07 GDL 179권 비활성화는 이미 완료**된 상태다(§7 참조). 본 ADR은 그 사후 기록이자 재발 방지 설계다.

## Deciders

팀장, 오케스트레이터

## 관련 문서

`docs/adr/0007-gdl-sync-strategy.md`(§4.1 매핑 근거) · `docs/adr/0022-content-source-expansion.md`(§2.2 slug 정규화) · `docs/adr/0008-catalog-scope-correction.md`(§6 라이선스 감사 운영 정책) · `docs/guidelines/license-rules.md` · `scripts/sync_gdl.py` · `scripts/sync_asb.py` · `scripts/sync_bloom.py` · `scripts/sync_book_dash.py` · `scripts/verify_licenses.py`
Hard Rule 3(CC BY-NC·ND 어떤 형태로도 적재 금지) 직결 문서다.

---

## 1. Context

### 1.1 ADR-0007이 slug 단독 검사를 채택한 경위

ADR-0007 §4.1은 2026-05-14 실측을 근거로 GDL API 응답에 `authors[]`·`illustrators[]`·`license.url` 필드가 **존재하지 않음**을 확인하고, license-rules.md 4.3절의 기존 가정을 정정했다.

> **실측된 응답 키 (전체):**
> `postId, title, description, topicCategory, post_type, post_name, postLink, url, lastChanged, h5pId, h5pUrl, epubUrl, downloadPdfLocalURL, mainCategory, topic, resourceType, collectionTag, thumbnail, publisher, contentsource, h5pLibrary, language, level, license, bookId, h5pFiles`
> — ADR-0007 §4.1
>
> **해결:** 새 매핑: `author = publisher`, `illustrator = 없음`, **`license = license[0].slug`**
> — ADR-0007 §4.1

즉 라이선스 판정 근거를 `license[0].slug` **단일 필드**로 좁힌 것은, 그 외에 라이선스를 가리키는 필드가 응답에 없다는 실측에 따른 것이었다. 이후 ADR-0022 §2.2가 GDL 내부 변형 slug(`cc-by-sa-4-0-2`)를 표준 slug로 정규화하는 규칙을 더했으나, **판정 근거가 `license[0].slug` 하나라는 구조는 그대로 유지**되었다.

현재 구현: `scripts/sync_gdl.py:87` `ALLOWED_LICENSE_SLUGS = {"cc-by-4-0", "cc-by-sa-4-0", "cc-by-3-0"}` · `:90` `LICENSE_SLUG_NORMALIZE = {"cc-by-sa-4-0-2": "cc-by-sa-4-0"}` · `:270-277` `build_payload()` 내 화이트리스트 게이트.

### 1.2 2026-08-07에 드러난 불일치

목록 API 전수(1,313권) 저장본 분석 결과, **응답 키 `h5pFiles`(책에 실제로 포함된 자산 파일 URL 목록)에 라이선스 배지 이미지가 들어 있고, 그 배지가 `license[0].slug`와 어긋나는 사례**가 확인되었다.

배지 파일명 실측 5종(해시형 파일명 제외한 명명 자산 전량):

| 배지 파일명 | 등장 건수 |
|---|---|
| `ccbync.png` | 406 |
| `ccby.jpg` | 295 |
| `ccbyncsa.png` | 52 |
| `cc0.png` | 32 |
| `ccby.png` | 32 |

배지 유형 × `license[0].slug` 교차표 (전체 1,313권):

| 배지 \ slug | cc-by-4-0 | cc-by-3-0 | cc-by-sa-4-0 | cc-by-sa-4-0-2 | cc-by-nc-4-0 | cc-by-nc-3-0 | cc-by-nc-sa-4-0 | cc-by-nc-sa-4-0-2 | cc-by-nc-sa-3-0 | (none) | 계 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **NC (`ccbync*`)** | **199** | 0 | 0 | 0 | 238 | 0 | 3 | 18 | 0 | 0 | **458** |
| non-NC (`ccby`/`cc0`) | 321 | 1 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 327 |
| 배지 없음 | 392 | 4 | 14 | 6 | 9 | 1 | 93 | 1 | 1 | 7 | 528 |
| **계** | 912 | 5 | 14 | 6 | 252 | 1 | 96 | 19 | 1 | 7 | 1,313 |

핵심 셀: **`slug='cc-by-4-0'` × 배지 `ccbync*` = 199권.** 이 199권은 slug가 화이트리스트를 통과하므로 `sync_gdl.py:87` 게이트를 **전량 통과**했다.

추가 실측:

- 199권 전량 `publisher` 빈 문자열, 전량 `aflogo.png`/`letsread_asf.jpg` 계열 자산 보유
- 배지 `ccbync*` 보유 458권 **전량**이 `aflogo`/`letsread` 계열 780권 안에 포함 (그 밖에는 0권)
- 199권 중 DB 적재 197권 · 활성 179권 · 비활성 18권 · **오디오 보유 0권**

### 1.3 왜 slug 단독 검사로는 부족한가

1. **판정 근거가 단일 필드다.** `license[0].slug`가 틀리면 방어선이 0이 된다. 교차 확인할 두 번째 근거가 파이프라인에 없다.
2. **불일치가 이미 실재한다.** 199권은 가정이 아니라 실측된 모순이다. 어느 쪽이 참인지는 GDL 측 데이터 품질 문제이며 우리가 통제할 수 없다.
3. **Hard Rule 3은 무과실 책임에 가깝다.** "메타데이터가 그렇게 적혀 있었다"는 사유로 NC 콘텐츠 적재가 정당화되지 않는다. 우리 파이프라인이 확인 가능한 신호를 무시했다는 사실만 남는다.
4. **DB 트리거(`enforce_commercial_license`)도 같은 값을 본다.** 트리거는 `books.license` 컬럼을 검사하는데 그 값의 출처가 바로 `license[0].slug`다. slug가 틀리면 트리거도 통과한다 — **이중 방어가 아니라 동일 근거의 중복 검사**였다.
5. **자산 신호가 이미 응답 안에 있었다.** `h5pFiles`는 우리가 받아 놓고 저장도 검사도 하지 않던 필드다(ADR-0007 §4.1 응답 키 목록에 명시되어 있었다). 추가 네트워크 호출 없이 즉시 교차 검증에 쓸 수 있다.

---

## 2. Decision

### 안1 — `h5pFiles`에 `ccbync`/`ccbyncsa` 배지가 있으면 slug와 무관하게 적재 제외 ★추천

**내용.** `build_payload()`의 라이선스 게이트에 자산 배지 검사를 추가한다. `h5pFiles` 원소의 basename이 NC 배지 집합에 속하면 slug가 화이트리스트를 통과하더라도 `None`을 반환해 skip하고 `skipped_by_nc_badge`로 카운트한다.

| 장점 | 단점 |
|---|---|
| 판정 근거가 2개(메타데이터 + 자산)로 늘어 단일 필드 오류에 견딤 | 배지가 오히려 오적재된 경우(slug가 참) 적격 도서를 잃는다. 실측 199권은 손실 상한이 명확 |
| 추가 네트워크 호출 0 — 이미 받는 응답 안의 필드다 | 배지 없는 528권은 여전히 slug 단독 판정. 커버리지가 전수가 아니다 |
| fail-safe 방향(의심 시 제외)이 Hard Rule 3과 정합 | slug NC·배지 non-NC 조합(5권)은 잡지 못한다 — 다만 이 조합은 slug 게이트가 이미 차단 |
| 구현 표면이 작다(함수 1개, 상수 1개) | |

**놓치는 케이스.** 배지 이미지를 아예 포함하지 않는 책(528권). 이 중 slug가 화이트리스트인 412권은 검증 근거가 여전히 slug 하나뿐이다.

**배지 파일명이 바뀌면.** 문자열 집합 매칭이므로 새 파일명은 통과한다 = **fail-open**. 이를 완화하려면 (i) 매칭을 정확 파일명이 아니라 `basename`에 `nc` 토큰이 포함된 CC 계열 패턴으로 넓히고, (ii) 월 1회 `verify_licenses.py` 실행 시 "알려진 5종 외의 `cc*` 배지 파일명이 새로 등장했는지" 집계해 GitHub Issue로 올린다. 파일명 사전은 코드 상수가 아니라 **관측 가능한 자산 목록**이므로 감시가 가능하다.

### 안2 — 불일치 도서를 `is_active=false`로 staging 적재 후 사람 검수

**내용.** 배지-slug 불일치를 감지하면 skip하지 않고 `is_active=false`로 적재해 검수 큐에 남긴다. 사람이 확인 후 활성화한다.

| 장점 | 단점 |
|---|---|
| 적격 도서를 오차단으로 잃지 않는다 | **Hard Rule 3과 충돌 소지.** "적재 금지"를 비활성 적재로 우회하는 해석이 된다 |
| 검수 이력이 DB에 남는다 | ADR-0037(cron은 `is_active`를 건드리지 않음)과 상충. cron이 `is_active=false`를 쓰려면 그 결정을 뒤집어야 한다 |
| 오탐률을 데이터로 측정할 수 있다 | 199권 검수 = 사람 시간. 판정 기준(어느 쪽이 참인가)도 우리가 세울 수 없다 |

**놓치는 케이스.** 안1과 동일(배지 없는 528권).

**배지 파일명이 바뀌면.** 불일치 감지 자체가 안 되므로 staging에도 들어가지 않고 **정상 활성 적재된다** — 안1보다 위험이 크다. 검수 큐가 비어 있는 것이 "문제 없음"으로 오독된다.

### 안3 — `aflogo`/`letsread` 계열 자산 보유 도서를 통째로 적재 제외

**내용.** 발행 주체(The Asia Foundation "Let's Read" 계열) 단위로 차단한다. 실측상 `ccbync*` 458권 전량이 이 780권 부분집합이므로 NC 의심을 100% 포함한다.

| 장점 | 단점 |
|---|---|
| 이번 사례를 전부 덮는다(재현율 100%) | **과차단.** 780권 중 322권은 NC 배지가 없다. 적격일 수 있는 도서를 대량 폐기 |
| 규칙이 단순하고 감시가 쉽다 | 발행 주체 단위 차단은 라이선스 판단이 아니라 출처 배제다. CC BY로 적법 발행된 건까지 버린다 |
| | GDL 활성 464권에서 추가로 수백 권이 빠져 베타 카탈로그 목표(ADR-0008)에 직접 타격 |

**놓치는 케이스.** `aflogo`/`letsread` 밖에서 NC 배지가 새로 등장하면 잡지 못한다(현재 0권이나 미래 보장 없음).

**배지 파일명이 바뀌면.** 이 안은 배지 파일명에 의존하지 않으므로 **영향을 받지 않는다** — 3안 중 유일하다. 대신 자산 파일명(`aflogo.png`/`letsread_asf.jpg`)이 바뀌면 같은 문제가 발생한다. 의존 대상이 배지에서 브랜딩 자산으로 옮겨갈 뿐이다.

### ★ 추천: 안1 (+ 안3을 감시 규칙으로만 채택)

- **안1을 적재 게이트로 채택한다.** Hard Rule 3의 fail-safe 방향과 정합하고, 손실 상한(199권)이 이미 실측되어 있으며, 구현 표면이 가장 작다.
- **안3은 차단 규칙이 아니라 감시 규칙으로 둔다.** `aflogo`/`letsread` 계열 권수와 그 안의 NC 배지 비율(현재 780 / 458 = 58.7%)을 월 1회 리포트한다. 비율이 급변하면 GDL 측 정책 변화 신호다.
- **안2는 채택하지 않는다.** Hard Rule 3·ADR-0037과 동시에 충돌하며, 파일명 변경 시 안1보다 위험하다.

---

## 3. 구현 범위 (서술만 — 코드는 승인 후 별도 지시서)

### 3.1 검사 삽입 지점

| 위치 | 내용 |
|---|---|
| `scripts/sync_gdl.py:87` 부근 | `NC_BADGE_BASENAMES` 상수 신설. 초기값 `{"ccbync.png", "ccbyncsa.png"}`. 주석에 실측일(2026-08-07)·전수 근거를 남긴다 |
| `scripts/sync_gdl.py` 신규 함수 | `has_nc_badge(book) -> bool`. `book.get("h5pFiles")`의 각 원소를 `os.path.basename().lower()`로 정규화해 상수 집합과 대조. `is_non_picture_book()`·`is_h5p_technical_variant()`(`:233-250`)와 같은 판별 함수 계열에 나란히 둔다 |
| `scripts/sync_gdl.py:270-277` | 기존 license 화이트리스트 게이트 **직후**에 배지 게이트를 배치한다. slug 게이트를 먼저 통과시켜야 "화이트리스트를 통과했는데 배지가 NC"인 건수를 정확히 셀 수 있다 |
| `scripts/sync_gdl.py` 요약 출력부 | `skipped_by_nc_badge` 카운터를 기존 skip 사유 카운터와 같은 형식으로 출력 |

`h5pFiles`는 **payload에 저장하지 않는다.** 스키마 변경을 유발하지 않기 위해 판정에만 쓴다(Hard Rule 8 회피).

### 3.2 검사 실패 시 처리

- `build_payload()`가 `(None, False)`를 반환 → 호출자가 skip 집계. 기존 skip 경로와 동일한 흐름이라 새 분기가 생기지 않는다.
- stderr에 1행 경고: `postId` · `title` · slug 값 · 검출된 배지 파일명. `cover fallback` 경고(`:316-320`)와 같은 형식.
- 실행 요약에 `skipped_by_nc_badge = N`을 출력. GitHub Actions 로그에 남아 사후 추적이 가능하다.

### 3.3 기존 적재분 소급 적용

1. 목록 API 1회 조회 → 배지 NC 도서 `postId` 집합 산출(현재 458, 그중 화이트리스트 통과 199).
2. `source_platform='gdl' AND source_id IN (...)` 조건으로 **백업 테이블 생성** → 행수 확인.
3. 게이트 SELECT(오디오 보유 0 / 대상 활성 권수) 확인 후 `UPDATE books SET is_active=FALSE`.
4. 검증 SELECT(활성 잔존 0 / 플랫폼별 활성 분포 불변) 실행.
5. 모든 SQL은 팀장이 Supabase SQL Editor에서 직접 실행한다. 워커는 SQL 파일 생성까지만 한다.

2026-08-07 실행분은 이 절차를 그대로 따랐다: `scratchpad/gdl/nc_step1_backup.sql` → `nc_step2_deactivate.sql` → `nc_step3_verify.sql`, 백업 테이블 `books_backup_nc_20260807`(197행).

### 3.4 드라이런 게이트 절차

코드 반영 후 **실 동기화 이전에** 다음 순서를 강제한다.

1. `python scripts/sync_gdl.py --dry-run` — DB 미변경. `skipped_by_nc_badge` 값을 확인한다. **기대값 199**(화이트리스트 통과분 기준).
2. 기대값과 다르면 즉시 중단하고 차이 원인을 보고한다. GDL 측 데이터가 바뀌었을 수 있다.
3. `--dry-run --max-books 40`으로 소규모 슬라이스를 먼저 돌려 로그 형식·카운터 동작을 눈으로 확인한다.
4. 1~3 통과 후에만 워크플로를 재활성화한다(`gh workflow enable "Sync GDL (daily)"`). **현재 `Sync GDL (daily)`·`Sync Book Dash (weekly)`는 `disabled_manually` 상태**이며, 본 ADR 승인·구현·드라이런 통과 전까지 재활성화하지 않는다.

---

## 4. 타 소스 파급 검토

### 4.1 소스별 라이선스 검사 방식 (스크립트 실독 기준)

| 소스 | 스크립트 | 라이선스 판정 근거 | 자산 교차 검증 | 미매칭 시 동작 |
|---|---|---|---|---|
| GDL | `sync_gdl.py` | API `license[0].slug` 단일 필드 (`:87` 화이트리스트, `:90` 변형 slug 정규화) | **없음** (본 ADR로 추가 제안) | 화이트리스트 외 → skip |
| ASb | `sync_asb.py` | 헤더 `lic` 자연어 문자열 → `lib/license_normalize.normalize_asb_license()` | **없음** (수집 자산은 표지·페이지 이미지뿐, 배지 자산 없음) | NC/ND 토큰 포함·미매칭·빈 값 → `None` → skip (**fail-safe 차단**) |
| Bloom | `sync_bloom.py` | API `license` 필드 → `LICENSE_MAP`(`:84`) | **있음** — `verify_license_version()`(`:458-469`)이 책 `index.html`에서 `creativecommons.org/licenses/<token>/<ver>` URL을 추출해 기대 버전과 대조 | 매핑 외 → 실패 반환 |
| Book Dash | `sync_book_dash.py` · `sync_book_dash_v2.py` | **없음 — 하드코딩 상수** `LICENSE_CODE = "cc-by-4-0"` (v1 `:81`, v2 `:67`) | 없음 | 해당 없음 (검사 자체가 없음) |

### 4.2 ★ 발견 사항 — Book Dash는 라이선스를 **책 단위로 검사하지 않는다**

`sync_book_dash.py`·`sync_book_dash_v2.py`는 meta.yml에서 `language`·`title`·`creator`·`identifier`만 읽고(`sync_book_dash.py:139-149`), `license` 값은 파일 상단 상수 `LICENSE_CODE = "cc-by-4-0"`를 **모든 책에 무조건 부여**한다. 도서별 권리 표기를 읽는 코드는 두 스크립트 어디에도 없다.

이는 GDL 사례와 **구조가 같지만 더 약하다**. GDL은 최소한 원천이 제공한 필드를 읽어 화이트리스트와 대조했으나, Book Dash는 원천 값을 읽는 단계 자체가 없다. Book Dash NPO가 전 카탈로그를 CC BY 4.0으로 발행한다는 전제가 참인 동안에만 안전하며, 그 전제가 깨져도 **파이프라인은 아무 신호도 내지 않는다**.

미확인 사항(본 ADR에서 네트워크 조회 없이 판정 불가):

- `bookdash-books/_data/meta.yml`에 Dublin Core `rights` 필드가 실제로 존재하는지. `docs/recon/2026-07-09-canary-and-cloudfront-recon.md` §2.2는 "모든 책에 18개 Dublin Core 필드 100% 존재"라고만 기록하고 필드명을 열거하지 않았다.
- 존재한다면 그 값이 책별로 다른지, 전량 동일한지.

**별도 ADR 필요 여부: 필요하다.** 사유 — (i) 대상 소스가 다르고 조사(meta.yml 필드 전수)가 선행되어야 하며, (ii) 하드코딩 상수를 원천 값 판독으로 바꾸는 것은 적재 규칙 변경이라 ADR-0005의 결정을 갱신해야 하고, (iii) 본 ADR의 결정(안1)을 Book Dash에 그대로 적용할 수 없다(meta.yml에는 배지 자산 개념이 없다). 후속 ADR 가제: "Book Dash 라이선스 하드코딩 제거 — meta.yml rights 필드 판독".

### 4.3 메타데이터 외 자산 기반 교차 검증 수단

| 소스 | 가용 수단 | 비고 |
|---|---|---|
| GDL | `h5pFiles` 배지 이미지 파일명 (**추가 호출 0**) · `postLink` 페이지 HTML의 CC URL (권당 1 요청) | 배지 방식이 비용 0이라 우선 |
| Bloom | 이미 채택 중 — 책 `index.html`의 CC URL 파싱 | 선례이자 참조 구현 |
| ASb | 책 페이지 HTML의 라이선스 표기 (권당 1 요청) | 현재 미사용. `lic` 헤더가 사이트 자체 표기라 원천과 동일 소스라는 한계 |
| Book Dash | 책 `index.html`(`bookdash.github.io/bookdash-books/{slug}/en/`)의 CC 표기 (권당 1 요청) | 54권 규모라 전수 검증이 현실적 |

`verify_licenses.py`(월 1회 cron, ADR-0008 §6)가 이미 Book Dash·GDL 두 원천을 재조회해 DB 값과 대조하는 구조를 갖고 있다. 자산 기반 교차 검증은 **새 워크플로를 만들지 말고 이 스크립트를 보강**하는 편이 운영 표면을 늘리지 않는다.

---

## 5. 게이트 설계 교훈

**`books.source_id`는 전역 유일하지 않다.** 플랫폼마다 독립적으로 발급한 식별자를 같은 TEXT 컬럼에 담기 때문이다. 유일성을 보장하는 것은 `UNIQUE(source_platform, source_id)` 복합 키뿐이다.

**혼입 게이트는 반드시 `(source_platform, source_id)` 쌍 또는 `books.id`(UUID PK)로 비교한다.** `source_id` 단독 비교는 서로 무관한 플랫폼의 동일 문자열 ID를 충돌로 잡는다.

**근거 사례 (2026-08-07).** `nc_step2_deactivate.sql`의 안전 게이트 (b)를 `WHERE source_platform <> 'gdl' AND source_id IN (199개)`로 작성했더니 기대값 0 대신 **53**이 반환되었다. 조사 결과 이 53건은 UPDATE가 오작동할 위험이 아니라 **게이트 자체의 위양성**이었다 — UPDATE의 WHERE 최상단에 `source_platform = 'gdl'`가 `AND`로만 연결되어 있고(OR·괄호 그룹 0건), 대상은 `books` 단일 테이블이며 JOIN·상관 서브쿼리가 없어, `source_platform <> 'gdl'`인 행은 구조적으로 UPDATE를 통과할 수 없었다. 게이트가 센 집합과 UPDATE가 바꾸는 집합은 플랫폼 조건이 정반대라 교집합이 공집합이다.

**따라서 게이트 문구를 다음과 같이 표준화한다.** "타 플랫폼 혼입" 게이트가 필요한 경우, 검사 대상은 *UPDATE가 실제로 잡을 수 있는 행 집합*이어야 한다. UPDATE와 동일한 WHERE에 부정 조건 하나만 붙여 세는 방식은, 그 부정 조건이 UPDATE의 WHERE에도 이미 있으면 항상 무의미한 위양성을 낳는다.

---

## 6. Consequences

### 6.1 카탈로그 규모

| 구분 | 이전 | 이후 | 증감 |
|---|---|---|---|
| GDL 활성 | 643 | **464** | −179 |
| 전체 활성 | 1,502 | **1,323** | −179 |
| 자체 렌더 820(asb 527 · book_dash 151 · bloom 142) | 820 | 820 | 0 |
| book_dash html | 39 | 39 | 0 |

ASb·Bloom·Book Dash는 영향 0이다. 감소분은 전량 GDL html 경로다.

### 6.2 TTS 물량에 미치는 영향

- **직접 손실 0.** 비활성화된 179권 중 오디오 보유는 **0권**이다. 이미 지출한 TTS 비용의 손실이 없다.
- **TTS 후보군 자체에는 영향이 없다.** 현재 TTS 파이프라인은 본문 텍스트를 확보한 자체 렌더 경로(asb_native · book_dash 자체 렌더 · bloom)를 대상으로 하며, GDL html 643권은 H5P iframe이라 애초에 후보에 포함되지 않았다. 감소한 179권은 전부 이 GDL html 경로다.
- **잠재 후보군은 줄었다.** GDL ePub 경로(`epubUrl` — 목록 API 전수 기준 동적 생성 837 / 정적 파일 439 / 없음 37)를 통해 GDL을 자체 렌더로 전환하는 트랙이 검토 중이었다. 그 모집단이 643 → 464로 줄었다. 다만 NC 도서를 TTS 대상에 넣는 것은 Hard Rule 3 위반이므로, 이 감소는 손실이 아니라 **애초에 대상이 아니었던 물량의 정정**이다.
- 배지 NC 458권 전체를 차단할 경우 GDL 활성은 464에서 추가로 줄어든다. 나머지 259권은 slug 자체가 NC라 이미 미적재이므로 실제 추가 감소는 0으로 예상되나, DB 실측으로 확인해야 한다.

### 6.3 되돌림 절차

백업 테이블 `books_backup_nc_20260807`(197행, `books` 전체 컬럼 복제)이 기준이다.

```sql
UPDATE books b SET is_active = k.is_active
FROM books_backup_nc_20260807 k
WHERE b.id = k.id;
```

이 문장은 `books.id`(UUID PK) 기준이므로 §5의 교훈에 부합한다. `source_id` 기준 원복은 금지한다.
백업 테이블은 본 ADR이 Accepted로 전환되고 후속 드라이런까지 통과한 뒤에 삭제 여부를 판단한다. 그 전까지 보존한다.

### 6.4 운영 상태

- `Sync GDL (daily)` · `Sync Book Dash (weekly)` = **`disabled_manually`**. 본 ADR 승인 → 코드 반영 → §3.4 드라이런 게이트 통과 전까지 재활성화하지 않는다. 재활성화 전에 워크플로를 켜면 배지 검사 없는 sync가 179권을 되살릴 수 있다(단, ADR-0037 D1·D2에 따라 cron은 `is_active`를 UPDATE하지 않으므로 기존 행의 비활성 상태는 보존된다 — 신규 유입만 위험하다).
- `Verify Licenses (monthly)` = `active` 유지. books에 쓰지 않는 감시 전용이다.

---

## 7. 이미 실행된 조치 (2026-08-07)

본 ADR 승인 이전에 다음이 완료되었다. 본 문서는 그 사후 근거 기록을 겸한다.

| 순서 | 조치 | 결과 |
|---|---|---|
| 1 | `Sync GDL (daily)`·`Sync Book Dash (weekly)` 비활성화 | `disabled_manually` |
| 2 | 목록 API 전수 저장 후 NC 배지 집계 | 458권 / 그중 slug 화이트리스트 통과 199권 |
| 3 | `nc_audit_check.sql` — DB 대조 | 존재 197 · 활성 179 · 비활성 18 · 오디오 0 |
| 4 | `nc_step1_backup.sql` — 백업 | `books_backup_nc_20260807` 197행 |
| 5 | `nc_step2_deactivate.sql` — 게이트 3종 후 비활성화 | (a) 0 ✅ · (b) 53 → 위양성 판정(§5) · (c) 179 ✅ → 179권 비활성화 |
| 6 | `nc_step3_verify.sql` — 검증 | GDL 활성 464 · 전체 활성 1,323 |

산출물 위치: `scratchpad/gdl/` (`nc_audit_check.sql` · `nc_audit_check_all458.sql` · `nc_step1_backup.sql` · `nc_step2_deactivate.sql` · `nc_step3_verify.sql` · `nc_gate_b_detail.sql`)

---

## 8. 미해결 항목

| # | 항목 | 해소 방법 |
|---|---|---|
| O1 | 배지 NC 458권 중 slug도 NC인 259권이 실제로 DB에 미적재인지 | `nc_audit_check_all458.sql` 실행 → 존재 권수 확인 |
| O2 | 배지 없는 528권의 라이선스 검증 수단 | `postLink` HTML CC URL 파싱을 `verify_licenses.py`에 추가할지 판단 |
| O3 | Book Dash `meta.yml`의 `rights` 필드 존재 여부 (§4.2) | 별도 ADR의 선행 조사로 이관 |
| O4 | 배지 파일명 변경 감시를 `verify_licenses.py`에 넣을 때의 출력 형식 | 구현 지시서에서 확정 |
| O5 | 게이트 (b) 53건이 단순 ID 충돌인지 플랫폼 간 중복 적재인지 | `nc_gate_b_detail.sql` 실행 → `제목동일` 컬럼으로 판별 |
