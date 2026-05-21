# ADR-0014: GDL 표지 적재 정정 + Book Dash 404 4건 사전 차단 + illustrator·author 범위 결정

**날짜** 2026-05-20
**상태** Accepted (phase-09b CP1)
**관련** `docs/adr/0007-gdl-sync-strategy.md`(GDL sync 원본), `docs/adr/0005-book-dash-sync-strategy.md`(Book Dash sync 원본), `docs/adr/0012-landing-page-static.md`(결정 3 옵션 Y 임시 → 본 ADR로 환원), `docs/adr/0013-cover-attribution-policy.md`(§7 illustrator phase-11 트리거 — 본 ADR 결정 3로 유지 확인), `tasks/phase-09b-content-quality-fix.json`, `scripts/sync_gdl.py`, `scripts/sync_book_dash.py`, `lib/landing/popular-books.ts`, `claude.md` 2절 Hard Rule 8·10

---

## 1. 맥락

phase-09a CP3 진단에서 두 가지 콘텐츠 품질 문제가 드러났다:

1. **GDL 표지 28% 추정 → 측정 33%** — 랜딩 인기 책 6권 중 다수가 깨지는 가시적 회귀. 원인은 `sync_gdl.py`가 h5pId 기반 cover_url 템플릿(`/wp-content/uploads/h5p/content/{h5pId}/images/coverImage.jpg`)을 쓰는데, GDL CDN의 실제 표지 파일은 h5pId와 무관한 별도 경로에 저장돼 있다.
2. **Book Dash 표지 5권 깨짐 추정 → 측정 4건 404** — 87% 정상률. 슬러그 변경 후 GitHub Pages 미배포로 추정.

phase-09a에서는 임시 조치로 옵션 Y(랜딩 popular-books 쿼리에서 `source_platform='book_dash'` 필터)를 적용해 Book Dash 책만 노출했다. 이는 phase-09a 완수를 위한 임시 회피였고, ADR-0012 결정 3에 "phase-09b로 이연" 박제됐다.

본 ADR은 phase-09b에서 두 이슈를 해소하는 방식과, 진단 중 새로 드러난 두 가지 데이터 부재(illustrator·author) 처리 범위를 결정한다.

---

## 2. 현황 진단 (2026-05-20 측정)

### 2.1 GDL API (https://content.digitallibrary.io/wp-json/content-api/v1/books/en)

- 단일 응답에 영어 H5P 책 **1,313권** 전체 (5.7MB)
- 응답 키 25개. **`thumbnail` 필드 존재** — 타입 분포: string URL 1,306권(99.5%) / boolean False 7권(0.5%)
- `illustrator` / `author` 필드 부재. `publisher`만 존재 (현재 sync는 publisher를 books.author 컬럼에 적재 — ADR-0007 §4.2 amendment)

**HEAD 30건 무작위 표본 (random.seed=42, 같은 표본 양 URL 측정)**:

| URL 종류 | 정상률 | 분포 |
|---|---|---|
| 현재 템플릿 (h5pId 기반) | 10/30 = **33%** | 200×10, 404×20 |
| API `thumbnail` 필드 | 30/30 = **100%** | 200×30 |

→ 단일 1줄 교체로 약 33% → 99%+ 도약 가능 (boolean False 7권은 폴백).

### 2.2 Book Dash meta.yml (https://raw.githubusercontent.com/bookdash/bookdash-books/master/_data/meta.yml)

- 영어 책 **54권** 전체. 모든 책에 18개 Dublin Core 필드 100% 존재
- `creator`: 콤마 구분 다중 역할 (예: `"Raeesah Vawda, Lindy Pelzl, Elana Bregin"`) — 순서 보장 없음
- `contributor`: 모든 54권이 `"Book Dash volunteers"` 고정 — illustrator 아님

**HEAD 30건 무작위 표본 (random.seed=42)**:

| URL 종류 | 정상률 | 분포 |
|---|---|---|
| 현재 cover.jpg 템플릿 | 26/30 = **87%** | 200×26, 404×4 |

**404 4 슬러그 (식별)**: `the-lion-who-wouldnt-try`, `i-can-dress-myself`, `hugs-in-the-city`, `katiitis-song`

---

## 3. 결정

### 결정 1 — GDL `cover_url`은 API `thumbnail` 필드 우선, False/누락 시 기존 템플릿 폴백

`scripts/sync_gdl.py` `build_payload()`에서 cover_url 적재 라인을 다음과 같이 정정한다(의사 코드):
```python
thumbnail = book.get("thumbnail")
cover_url = thumbnail if isinstance(thumbnail, str) and thumbnail else COVER_URL_TEMPLATE.format(h5pId=h5p_id)
```
- 폴백 사유: 7권 boolean False 케이스(0.5%) 보호. 폴백된 7권은 추후 verify_gdl_sync에서 추적.
- 적재 전 HEAD 검증은 도입하지 않는다 (결정 5).

### 결정 2 — Book Dash 404 4건은 sync·DB 무변경, **랜딩 쿼리에서 사전 차단**

`scripts/sync_book_dash.py`와 `books` 테이블 모두 무수정. 대신 `lib/landing/popular-books.ts`의 Supabase 쿼리에 다음 4 슬러그 블랙리스트를 적용:
- `the-lion-who-wouldnt-try`
- `i-can-dress-myself`
- `hugs-in-the-city`
- `katiitis-song`

**근거**:
- DB에서 is_active=False로 비활성화하면 향후 슬러그가 GitHub Pages에 복귀해도 자동 회복 안 됨 (수동 재활성화 필요)
- 랜딩 쿼리 블랙리스트는 책 자체는 보존하고 *랜딩 노출만* 차단 → 데이터 보존성 우수
- 비-랜딩 표면(라이브러리·검색 — phase-13)에서는 별도 정책 추후 결정

### 결정 3 — `illustrator` 데이터 부재는 본 페이즈 범위 외 (ADR-0013 §7 유지)

- GDL API: illustrator 필드 자체가 없음 → 외부 enrichment 없이는 불가
- Book Dash: `creator` 콤마 파싱은 순서 보장 없어 위험. `contributor`는 "Book Dash volunteers" 고정으로 illustrator 아님
- **ADR-0013 §7의 "phase-11 진단·재설계" 결정을 본 ADR이 명시적으로 유지·확인**한다. phase-09b는 illustrator 적재 시도 0건.

### 결정 4 — 옵션 Y 환원: 랜딩 `popular-books` 쿼리에서 `source_platform='book_dash'` 필터 제거

ADR-0012 결정 3의 임시 조치를 환원한다. CP3에서 `lib/landing/popular-books.ts` 수정 1줄(필터 제거) + 결정 2의 블랙리스트 4 슬러그 추가. 환원 후 v7(랜딩 표지 정상률 ≥ 90%) 측정으로 검증한다.

미달 시: 옵션 Y 환원을 보류하고 사용자에게 보고(분기점 #3 회귀).

### 결정 5 — sync 시점 HEAD 사전 검증은 **미도입**, CP3에서 사후 측정

- 1313권 × HEAD ≈ 측정 비용·GDL 서버 부하 증가
- 표본 100% 정상률(결정 1 측정)이면 신뢰 가능
- CP3에서 신규/확장된 진단 스크립트(`scripts/diagnose_cover_health.py` 또는 `verify_gdl_sync.py` 확장)로 무작위 100건 표본 HEAD 측정 → v6 통과 판정

**v6에서 95% 미달 시 회귀 절차 (4단계)**:

1. **CP3 보류** — 옵션 Y 환원·`tasks/_index.json` mark_success·메타 커밋 등 CP3 잔여 작업을 즉시 중단. `lib/landing/popular-books.ts`와 `_index.json` 미수정 상태로 보존(또는 이미 수정했다면 되돌리고 보류 사유 명시).
2. **결과 박제** — 미달 정상률(예: 87/100), 실패 표본 슬러그·HEAD 상태 코드 분포·폴백 사용 권수를 본 ADR §5(결과)와 §6(위험/보완)에 보강 기록. 진단 산출 JSON은 `phase-09b-content-quality-fix.json`의 `diagnosis` 필드에도 갱신.
3. **CP2 재진입** — 정정 코드 재설계. 후보 조치: thumbnail 외 추가 폴백 후보(`h5pUrl`·`epubUrl` 표지 추출 등) 검토, sync 시점 HEAD 사전 검증 도입(결정 5 자체 번복), 실패 권에 대한 `is_active=False` 정책 도입(결정 2와 정합 재검토).
4. **결정 1·5 갱신** — 본 ADR 결정 1(cover_url 우선순위) 또는 결정 5(HEAD 검증 정책) 중 영향 받는 결정을 갱신·재승인. 갱신 사유와 새 의사 코드는 본 ADR에 신규 절(§3.5a 등)로 추가하고, 기존 결정은 "Superseded by §3.5a" 표시. tasks/phase-09b-content-quality-fix.json의 verification·completion_criteria도 동시 갱신.

위 회귀 절차는 본 ADR을 살아있는 문서로 유지하기 위함이며, phase-09b를 강제 종료하지 않는다.

### 결정 6 — GDL `author` 컬럼이 `publisher`로 채워진 현황은 phase-11 이연

진단 중 새로 드러난 문제: 현재 GDL 적재 행의 `books.author`는 사실상 출판사 명이다(ADR-0007 §4.2 amendment "정직 폴백 — publisher가 있으면 author로"). 본 ADR은 다음을 박제하고 **phase-09b에서는 무조치**한다:
- phase-11 Screen 03(책 상세) 진입 시, ADR-0013 §7과 동일한 진단 사이클에서 author·illustrator 표시 정책을 재검토한다.
- AttributionBox 표시 시 `author = publisher` 케이스를 그대로 노출할지, "출판사: {publisher}" 형식으로 분리할지 별도 ADR로 결정.

### 결정 7 — 재동기화는 UPSERT 그대로, `is_active` 무변경 정책 명시

- sync_gdl.py는 `on_conflict="source_platform,source_id"` UPSERT (idempotent). 재실행 안전.
- 모든 적재 행은 `is_active=True`로 들어옴(sync_gdl.py:313). 기존 활성 책의 is_active를 본 페이즈는 변경하지 않는다.
- 라이선스 트리거(enforce_commercial_license)는 sync 입력이 모두 cc-by-4-0/sa-4-0이므로 차단 0건 예상. 차단 발생 시 즉시 중단·진단·본 ADR 보강.

---

## 4. 대안 비교

| 영역 | 채택 | 대안 | 기각 이유 |
|---|---|---|---|
| GDL cover_url | thumbnail 필드 우선 + 폴백 | 템플릿 유지 | 33% 정상률, 회귀 가시화 |
| GDL cover_url | thumbnail 필드 우선 + 폴백 | thumbnail 전용(폴백 X) | 7권(0.5%) 보호 위해 폴백 유지 |
| Book Dash 404 | 랜딩 쿼리 블랙리스트 | sync 측 is_active=False | 슬러그 복귀 시 자동 회복 불가 |
| Book Dash 404 | 랜딩 쿼리 블랙리스트 | sync 측 HEAD 검증 후 skip | DB에서 사라짐 → 슬러그 복귀 시 재적재 필요, 옵션 a보다 회복성↓ |
| illustrator | phase-11 이연 (§7 유지) | Book Dash creator 파싱 | 순서 보장 없음 → 잘못된 illustrator 적재 위험 |
| illustrator | phase-11 이연 | 외부 enrichment(별도 DB·CSV) | 범위 폭증, 본 페이즈 1~2일 완수 불가 |
| HEAD 검증 | 미도입 + CP3 사후 측정 | sync 시점 도입 | 1313 요청·GDL 서버 부하·sync 시간 증가. 표본 100%면 불필요 |
| GDL author=publisher | phase-11 이연 | 본 페이즈 정정 | 정정 정의(publisher 분리 vs. author 비우기)가 ADR-0013·AttributionBox 설계와 결합 → phase-11 통합 결정이 적절 |

---

## 5. 결과

- GDL 표지 정상률: 33% → 95%+ 예상 (CP3 v6에서 측정·박제)
- Book Dash: 87% 그대로, 단 깨진 4건은 랜딩에서 미노출
- 옵션 Y 환원으로 랜딩에 GDL+Book Dash 다양성 복원
- illustrator·GDL author 정책은 phase-11 책 상세 화면 설계 시 통합 결정

## 6. 위험 / 보완

- **사용 슬러그 복귀**: Book Dash GitHub Pages가 4 슬러그를 복귀시키면 블랙리스트는 불필요한 차단이 된다. → CP3 verification에 "블랙리스트 슬러그 정기 HEAD 재검증" 메모. 정상화 확인 시 ADR-0014 결정 2 갱신·블랙리스트 축소.
- **GDL API 응답 구조 변경**: 본 ADR은 2026-05-20 응답 기준. WordPress 백엔드의 응답 키 이름이 바뀌면 sync 회귀. → 향후 GDL 응답 모니터링은 phase-06 verify_licenses.py 워크플로 보강 시 함께 고려.
- **`thumbnail=False` 7권의 정체**: 적재 결과에서 폴백 케이스 7권의 라이선스·정상률 별도 추적. CP3 진단 스크립트가 폴백 사용 권수를 카운트하면 좋다.

## 7. 후속 과제 (본 ADR이 박제하는 트리거)

1. **phase-11**: illustrator 데이터 부재 진단(ADR-0013 §7) + author=publisher 정책(본 ADR 결정 6)을 통합 ADR로 결정
2. **phase-13b** (옵션): Book Dash 4 슬러그 정상화 시 블랙리스트 축소 결정
3. **phase-06 보강** (옵션): GDL 응답 스키마 회귀 감지 워크플로

---

*문서 끝.*

---

## Amendment (2026-05-20 CP2 dry-run 측정)

본 ADR §2의 thumbnail=False 7권은 GDL API 응답 전체(1,313권) 기준이다.
CP2 dry-run(`python scripts/sync_gdl.py --dry-run --verbose`)에서 sync 적재 대상(필터 + dedup 후 842권) 기준으로는 폴백 1권만 발생함을 확인했다.

**식별된 폴백 1권**: postId=45239 "I Love My Mom" (thumbnail=False)

**누락된 6권의 행방** (1313 → 842 필터 체인에서 흡수):
- BookDash publisher 중복 33건
- 비-그림책 8건 (H5P.InteractiveVideo + title prefix)
- H5P 기술 변형본 11건
- 동제목 dedup 후순위 44건
- license NC/ND 등 화이트리스트 외 368건
- language/필수필드 결측 7건

**결과적 정상 URL률 추정 (적재 842권 기준)**:
- thumbnail 우선 사용: 841/842 (99.88%)
- 폴백 1권: 표본 정상률 33% 가정 시 0.33권 정상
- 종합 정상률 추정: **약 99.92%** — v6(≥ 95%) 통과 큰 마진

**v6 사후 처리 분기 (CP3에서 측정·결정)**:
- postId=45239 폴백 URL이 200이면: 무조치
- 404이면: lib/landing/popular-books.ts 블랙리스트 추가 검토 (결정 2 패턴 확장)

본 Amendment는 §1~§7 본문을 변경하지 않는다.

---

*Amendment 끝.*

---

## Amendment #2 (2026-05-20 CP3 사후 측정)

CP3 그룹 A (DB 재동기화 + v6 사후 측정) 및 그룹 B (랜딩 환원 + v7 클릭 측정) 실측에서 다음을 박제한다.

### A. 폴백 1권 200 정상 (Amendment #1 보강)

Amendment #1에서 식별한 폴백 1권 postId=45239 "I Love My Mom"의 cover_url
(`https://content.digitallibrary.io/wp-content/uploads/h5p/content/17974/images/coverImage.jpg`)은
CP3 그룹 A4의 단건 HEAD 측정에서 **status=200**으로 확인됐다.

→ Amendment #1의 "v6 사후 처리 분기" 중 "200이면 무조치" 경로 발동. 블랙리스트 추가 0건.
→ Amendment #1의 99.92% 추정은 사실상 100%로 정정될 수 있다(v6 실측 100/100 = 100%).

### B. 슬러그 ↔ UUID 매핑 표 (결정 2 정정)

§2와 결정 2에 박제된 "404 4 슬러그"는 Book Dash `meta.yml`의 cover.jpg URL 인간 식별자다. 실제 `books.source_id` 컬럼에는 `meta.yml`의 `identifier` UUID가 저장된다(`sync_book_dash.py:152`). 따라서 랜딩 쿼리의 블랙리스트는 UUID로 구현돼야 한다.

| 슬러그 (ADR §2 박제) | DB `source_id` (UUID) |
|---|---|
| `the-lion-who-wouldnt-try` | `9ca00316-fe46-11e5-86aa-5e5517507c66` |
| `i-can-dress-myself` | `9c9eb452-fe46-11e5-86aa-5e5517507c66` |
| `hugs-in-the-city` | `9c9eb574-fe46-11e5-86aa-5e5517507c66` |
| `katiitis-song` | `9c9fffba-fe46-11e5-86aa-5e5517507c66` |

`lib/landing/popular-books.ts`의 `BOOK_DASH_404_SOURCE_IDS` 상수가 위 UUID를 사용하며 인라인 슬러그 주석으로 사람 추적성을 보존한다. 향후 슬러그 정상화 시(§6 후속 과제 2) 본 표와 코드 상수를 함께 갱신한다.

### C. UPSERT idempotent 완전 입증 (결정 7 정정 0)

CP3 그룹 A1·A2 측정에서 재동기화 전후 books 분포가 모든 차원에서 변동 0임을 확인했다:

| 항목 | baseline (A1 전) | 재동기화 후 (A2) | 변동 |
|---|---|---|---|
| 전체 권수 | 896 | 896 | +0 |
| 활성 권수 (`is_active=true`) | 896 | 896 | +0 |
| `source_platform='gdl'` 활성 | 842 | 842 | +0 |
| `source_platform='book_dash'` 활성 | 54 | 54 | +0 |
| `illustrator IS NULL` 활성 | 896 (100%) | 896 (100%) | +0 |

→ 결정 7 "UPSERT 그대로, is_active 무변경, books.author=publisher 무변경"이 실측으로 입증됐다. 라이선스 트리거(enforce_commercial_license) 차단도 0건(errors 0).

### D. publisher가 랜딩 카드 라벨로 노출 (결정 6 사용자 가시 증거)

CP3 그룹 B v7 클릭 측정 중 사용자가 랜딩 인기 책 카드에 `StoryWeaver`·`African Storybook` 등 GDL 출판사명이 라벨로 노출됨을 확인했다. 이는 현재 `books.author` 컬럼이 GDL `publisher`로 채워진 결과(`ADR-0007 §4.2 amendment` + 본 ADR 결정 6)가 사용자 화면에 직접 가시되는 첫 증거다.

→ 결정 6 "GDL `author=publisher` 현황은 phase-11 이연" 결정의 phase-11 트리거 우선순위를 보강한다. phase-11 Screen 03(책 상세 + AttributionBox) 설계 시, 카드 라벨과 AttributionBox 행 표시를 통합 결정해야 한다(`publisher` 분리 vs. `author` 비우기 vs. 양쪽 표시).

참조: `lib/landing/popular-books.ts`의 `PopularBook.author` 필드와 Screen 01 카드 라벨 컴포넌트(향후 식별)가 본 결정의 영향 범위.

본 Amendment #2는 §1~§7 본문과 Amendment #1을 변경하지 않는다.

---

*Amendment #2 끝.*

---

## Amendment #3 (2026-05-21 phase-10 CP2-a)

phase-10 CP2-a 진단에서 `BOOK_DASH_404_SOURCE_IDS` 상수의 사용처가 lib/landing/popular-books.ts(랜딩 인기 책)에서 lib/home/recommendations.ts(오늘의 추천 5권) + lib/home/categories.ts(카테고리 결과)로 확장된다. 본 단계의 재사용 방식은 **옵션 A — popular-books.ts에서 `export const`로 1줄 변경, lib/home에서 import**다(phase-10 cp2_decisions d8).

### 옵션 B 트리거 (향후 검토 조건)

다음 조건이 만족되면 `lib/shared/blacklist.ts`로 상수를 이동하는 옵션 B를 진지하게 검토한다:

- 본 블랙리스트를 import하는 표면이 **3개 이상**으로 늘어날 때 (예: phase-11 책 상세에서 직접 차단, phase-12 책 뷰어에서 차단, phase-13 라이브러리 검색에서 차단 등)
- 또는 블랙리스트 항목이 5건 이상으로 늘어나 운영상 단일 파일 관리가 명확히 더 적절한 시점

옵션 B로 이동 시:
1. `lib/shared/blacklist.ts` 신규 — `BOOK_DASH_404_SOURCE_IDS` 상수 + JSDoc(현재 popular-books.ts:38~47의 박제 주석 이전)
2. `lib/landing/popular-books.ts` — import로 전환, 상수 본문 제거
3. `lib/home/recommendations.ts`·`lib/home/categories.ts` — import 경로 변경 1줄
4. 본 ADR-0014에 Amendment #4 박제 (이동 사유 + 사용처 인벤토리)

phase-10에서는 옵션 B로 가지 않는다 — 사용처 2개로 옵션 A의 단순성이 우월.

### 영향 범위 (CP2-a 시점 인벤토리)

| 파일 | 사용 방식 | 단계 |
|---|---|---|
| `lib/landing/popular-books.ts` | 정의 + 사용 (`.neq('source_id', ...)`) | phase-09b CP3 완료 |
| `lib/home/recommendations.ts` | import + 추천 쿼리에서 `.neq('source_id', ...)` 적용 | phase-10 CP2-b 신규 |
| `lib/home/categories.ts` | import + `getCategoryBooks` 카테고리 쿼리에서 `.neq('source_id', ...)` 적용 | phase-10 CP2-b 신규 |

§6 후속 과제 2(Book Dash 4 슬러그 정상화 시 블랙리스트 축소)는 옵션 A·B 어느 쪽이든 단일 진실 공급원에서 1번 갱신하면 모든 표면에 전파되므로 운영 안전성 동일.

본 Amendment #3은 §1~§7 본문, Amendment #1, Amendment #2를 변경하지 않는다.

---

*Amendment #3 끝.*

---

## Amendment #4 (2026-05-21 phase-11 CP1)

phase-11 plan 단계 외부 검토(2026-05-21)에서 블랙리스트 4 UUID의 책 상세 직접 접속(`/book/[id]`) 차단 정책이 박제됐다(phase-11 cp1_decisions d5). ADR-0016과 동시 작성된다. 본 Amendment는 결정 2(랜딩 쿼리 측 블랙리스트)의 적용 범위를 비-랜딩 표면 1건(`/book/[id]`)으로 확장한다.

### 결정 — 책 상세 직접 접속 시 차단 + 404

`app/book/[id]/page.tsx`(phase-11 CP3-b 신규)는 다음 분기를 갖는다:

```ts
// 의사 코드
import { BOOK_DASH_404_SOURCE_IDS } from "@/lib/landing/popular-books";
import { notFound } from "next/navigation";

const book = await getBookById(params.id);
if (!book) notFound();
if (book.source_platform === "book_dash" && BOOK_DASH_404_SOURCE_IDS.includes(book.source_id)) {
  notFound();
}
```

**차단 방식**: Next.js `notFound()` 호출로 `app/book/[id]/not-found.tsx`(phase-11 CP3-b 신규) 공통 404 페이지 렌더. 사용자는 차단 사유를 구분 인지하지 못한다(블랙리스트 vs books 행 NULL vs RLS 차단 모두 동일 UX) — 보안 + UX 일관성.

### 사유

- **비-랜딩 표면 직접 접속 보호**: 블랙리스트 4 UUID 책은 원본 GitHub Pages에서 404 응답하므로 책 상세에 도달해도 표지·메타 외에는 사용자에게 가치 0건. `/book/{uuid}` 직접 URL 입력 또는 외부 링크(예: 검색엔진 캐시·SNS 공유)에서도 깨진 책 노출 방지.
- **표면 일관성**: 랜딩(결정 2) · 홈 추천(Amendment #3 인벤토리) · 홈 카테고리 결과(Amendment #3 인벤토리) · 책 상세(본 Amendment) 4개 표면에서 동일 4 UUID가 차단되어 운영 단일 진실 공급원 정합.
- **사용자 보고 경로 보장**: 차단된 책 표지가 노출되어 학부모가 "이 책을 클릭했더니 깨졌어요" 보고하는 경로가 사라진다 — 즉 사용자 경험 일관성 ↑.

### 영향 범위 (Amendment #4 추가 시점)

| 파일 | 사용 방식 | 단계 |
|---|---|---|
| `lib/landing/popular-books.ts` | 정의 + 사용 (`.neq('source_id', ...)`) | phase-09b CP3 완료 |
| `lib/home/recommendations.ts` | import + 추천 쿼리에서 `.neq('source_id', ...)` 적용 | phase-10 CP2-b 완료 |
| `lib/home/categories.ts` | import + `getCategoryBooks` 카테고리 쿼리에서 `.neq('source_id', ...)` 적용 | phase-10 CP2-b 완료 |
| `app/book/[id]/page.tsx` | import + `BOOK_DASH_404_SOURCE_IDS.includes(book.source_id)` 비교 + `notFound()` 호출 | phase-11 CP3-b 신규 |

→ 사용처가 4개 표면이 됐다. **Amendment #3에서 옵션 B(`lib/shared/blacklist.ts` 이동) 트리거 임계로 박제한 "3개 이상" 조건을 본 Amendment #4 추가로 도달한다.** 단, phase-11에서는 옵션 B 이동을 동반하지 않는다 — 본 CP1 범위는 책 상세 차단 정책 박제이며, 상수 위치 변경은 별도 리팩토링 작업으로 분리한다(추가 트리거 박제).

### 옵션 B 이동 트리거 활성화 (Amendment #3 후속)

phase-11 CP3-b 시점에서 `lib/landing/popular-books.ts`의 `BOOK_DASH_404_SOURCE_IDS`를 import하는 표면이 4개(랜딩 + 추천 + 카테고리 + 책 상세)에 도달한다. Amendment #3의 옵션 B 임계 "사용처 3개 이상"이 충족됐다. 다음 시점에 옵션 B 이동을 검토한다:

- phase-11 종료 후 별도 리팩토링 phase (또는 phase-12 진입 전 정합 정리 단계)
- 옵션 B 이동 시 Amendment #5로 박제: 이동 사유 + 사용처 인벤토리 + import 경로 변경 1줄씩 4 파일

### v 검증 (phase-11)

`tasks/phase-11-screen-03-book-detail.json` v16(블랙리스트 4 UUID 직접 접속 시 404) 측정. 4 UUID 각각 `/book/{uuid}` 직접 접속 시 not-found.tsx 렌더 확인. 통과 시 본 Amendment 정책 발동 입증.

### 슬러그 ↔ UUID 매핑 (Amendment #2 §B 인용)

Amendment #2 §B의 표를 그대로 인용한다(별도 보강 없음):

| 슬러그 | DB `source_id` (UUID) |
|---|---|
| `the-lion-who-wouldnt-try` | `9ca00316-fe46-11e5-86aa-5e5517507c66` |
| `i-can-dress-myself` | `9c9eb452-fe46-11e5-86aa-5e5517507c66` |
| `hugs-in-the-city` | `9c9eb574-fe46-11e5-86aa-5e5517507c66` |
| `katiitis-song` | `9c9fffba-fe46-11e5-86aa-5e5517507c66` |

§6 후속 과제 2(Book Dash 4 슬러그 정상화 시 블랙리스트 축소)는 본 Amendment 추가로 영향 범위가 1개 표면 더 확장됐을 뿐, 단일 진실 공급원 갱신 시 4개 표면 전파 정합은 동일하게 유지된다.

본 Amendment #4는 §1~§7 본문과 Amendment #1·#2·#3을 변경하지 않는다.

---

*Amendment #4 끝.*
