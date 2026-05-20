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
