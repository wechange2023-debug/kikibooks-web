# ADR-0029: sync 파이프라인 HTML 엔티티 디코딩 — ingestion 경계 1회 디코딩 방침

**날짜** 2026-06-29
**상태** Proposed
**관련** `docs/adr/0025-asb-content-ingestion.md` · `docs/adr/0027-bookdash-152-image-sequence.md` · `docs/adr/0028-bloom-library-free-download.md` · `docs/adr/0007-gdl-sync-strategy.md` · `docs/guidelines/license-rules.md`(4.2절 어트리뷰션) · `claude.md` 2절 Hard Rule 1(`attribution_text` NOT NULL) · `scratchpad/amp_decode_audit.md`(1단계 감사)

> 본 ADR은 **방침 확정용 초안**이다. 실제 코드 수정은 본 ADR 승인 후 별도 작업지시서에서 수행한다. 본 작업은 문서 전용 — `sync_*.py` / `attribution.py` 등 코드 파일 무변경.

---

## 1. 맥락 (Context)

4개 sync 파이프라인이 외부 API/HTML에서 읽은 책 메타데이터를 `books` 테이블
(단일 테이블 — `author`·`illustrator`·`attribution_text` 컬럼, ADR-0025·0028 공통)에
적재한다. 이 중 일부 경로가 HTML 엔티티(`&amp;`·`&#8217;` 등)를 **디코딩 없이**
그대로 저장하여, 화면에 `Mom&#8217;s`·`Tom &amp; Jerry`처럼 노출되는 잠재 버그가 있다.

### 1.1 grep 실측 — 디코딩 적용/누락 (1단계 감사 인용)

books 메타필드 4종 기준. ✅ `html.unescape` 적용 / ❌ 미적용 / ⚠️ 부분 / — 해당없음(None 고정).

| 스크립트 | title | author | illustrator | attribution_text | 비고 |
|---|---|---|---|---|---|
| `sync_asb.py` | ❌ L296 | ❌ L303 | ❌ L304 | ❌ L306 | `parse_asb_header`(L153) raw split만. 스크립트 내 `html.unescape` 0건 |
| `sync_bloom.py` | ❌ L793 | ❌ L799 | — (None L800) | ❌ L782 | 유일한 `html.unescape`(L352)는 **page_text 본문 전용** — 메타필드 미보호 |
| `sync_book_dash_v2.py` | ✅ L155 | ❌ L699 | ❌ L700 | ⚠️ L702 | title만 디코딩. writer/illustrator는 `fetch_creators`(L336-346) 미디코딩 |
| `sync_gdl.py` | ✅ L287 | ✅ L336 | — (None L337) | ✅ L339 | author=publisher(L291 디코딩). **이미 완전 — 변경 없음** |

### 1.2 DB 실측 오염 현황

작업지시서 제공 실측치: 현재 `books`에서 메타필드 엔티티 오염 **3건 전부 `bloom`**
(`&amp;` 형태). 즉 활성 오염원은 Bloom 파이프라인뿐이며, asb·book_dash는 현재
오염 적재분은 없으나 디코딩이 누락된 상태(예방 대상).

---

## 2. 결정 (Decision)

### D1 — 디코딩은 ingestion 경계에서 1회만 적용 (핵심 방침)
모든 sync 파이프라인은 외부 API/HTML에서 메타필드(title·author·illustrator)를
**읽는 지점(ingestion 경계)** 에서 `html.unescape`를 1회 적용한다. payload 조립
직전이나 attribution 빌드 직전에 산발적으로 넣지 않는다 — 읽는 즉시 디코딩하여
이후 모든 소비처(payload 컬럼 + `attribution_text`)가 자동으로 깨끗한 값을 받는다.

### D2 — `attribution.py`는 수정하지 않는다 (호출순서 실측 근거)
**1단계 호출순서 grep 실측 결론**: `lib/attribution.py`의
`build_attribution`(L75)·`build_book_dash_attribution`(L147)·`build_gdl_attribution`(L196)은
**전부 전달받은 인자만으로 동작하는 순수 함수**다. 함수 본문에 `requests.`·`open(`·
`read(`·raw 필드 재조회(`.get(`)가 **0건** — 외부 데이터를 독립적으로 다시 읽지
않는다. 각 호출부도 payload에 넣는 것과 **동일한 값**을 인자로 넘긴다:

- ASb: `build_asb_attribution`(L193 래퍼)→`build_attribution`(L205), 호출 L282. 인자 = header 값(payload L296/303/304와 동일 출처).
- Bloom: `build_attribution` 호출 L782, 인자 `title=res["title"]`·`author=res.get("author")`(payload와 동일).
- book_dash_v2: 로컬 `build_attr`(L391)→`build_attribution`(L401), 인자 title(L155 디코딩됨)·writer/illustrator(미디코딩).
- GDL: `build_gdl_attribution`(L294), 인자 이미 디코딩됨(L287·L291).

따라서 **ingestion에서 디코딩하면 `attribution_text`는 자동으로 정정**된다.
`attribution.py`에 방어용 디코딩을 추가할 필요가 없다(중복 디코딩·책임 분산 회피).
단, D1을 반드시 **읽는 지점**에 두어야 한다 — payload 조립부에만 넣고 build_attribution
호출 전에 누락하면 attribution만 오염되는 분기 버그가 남으므로 ingestion 경계 단일화가 전제다.

### D3 — 적용 대상 파일·라인 (후속 작업 범위 명시)

| 파일 | 디코딩 추가 위치 | 비고 |
|---|---|---|
| `sync_bloom.py` | title: `pick_english_title`(L283-289) 반환 경로 / author: `extract_author`(L526-531) 반환 경로 | 메타필드 ingestion 지점에서 디코딩. L352(page_text)는 이미 적용·유지 |
| `sync_asb.py` | `parse_asb_header`(L153) 헤더 값 채택 시 또는 `build_payload`(L267) title·author·artist 채택부 | 4필드 모두 동일 출처(header)이므로 헤더 파싱 단계 디코딩이 최단 |
| `sync_book_dash_v2.py` | `fetch_creators`(L336-346) writer·illustrator 채택부 | title(L155)은 이미 적용 — **건드리지 않음** |
| `sync_gdl.py` | — | title(L287)·publisher(L291) 이미 완전. **변경 없음** |
| `lib/attribution.py` | — | D2에 따라 **변경 없음**(순수 함수, raw 재조회 없음) |

### D4 — 우선순위
- **필수(블로킹)**: `sync_bloom.py` — 약 700권 배치 적재가 진행 중/예정이며 현 오염 3건의 활성 소스. 디코딩 누락이 신규 오염을 계속 생성하므로 배치 전 선결.
- **예방적(비블로킹)**: `sync_asb.py`·`sync_book_dash_v2.py` — 재적재 예정 없음. 기존 오염분 없음. 코드 위생·재실행 대비 차원의 보강. GDL은 대상 아님.

### D5 — 멱등성 보장
`html.unescape`는 이미 디코딩된 문자열에 **무해(no-op)** 하다 — 추가 엔티티가 없으면
원문 그대로 반환. 따라서 GDL처럼 이미 적용된 경로에 중복 노출돼도 안전하며, 재실행·
부분 적용 상황에서 이중 디코딩으로 인한 손상이 발생하지 않는다.
(주의: `&amp;amp;`처럼 이중 인코딩된 원본은 1회 unescape로 `&amp;`까지만 풀린다 —
이는 소스 데이터 자체의 이중 인코딩 문제이며 본 방침 범위 밖. 발견 시 별도 처리.)

---

## 3. 검증 계획 (후속 작업에서 실행)

1. **dry-run 엔티티 스캔**: 각 sync 스크립트 dry-run 출력의 메타필드(title·author·
   illustrator·attribution_text)에 대해 엔티티 정규식 `&(amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);`
   매칭 **0건** 확인.
2. **Bloom 배치 선검증**: 700권 배치 적재 전 dry-run에서 위 정규식 0건 게이트 통과.
3. **DB 사후 확인(SQL 텍스트 제공)**: 적재 후 `books`에서 메타필드 엔티티 잔존
   0건 확인용 SELECT를 사용자에게 SQL 텍스트로 제공(사용자가 Dashboard SQL Editor 실행).
4. **회귀 방지**: GDL 경로는 변경하지 않으므로 기존 동작 유지 — 회귀 없음 확인.

---

## 4. 대안 및 기각 사유

- **(기각) `attribution.py`에서 일괄 디코딩**: build_attribution 진입 시 인자를 unescape.
  → 책임 분산. payload 컬럼(author·title 등)은 여전히 오염 — attribution만 깨끗해지는
  불일치 발생. 또한 attribution.py가 순수 함수라는 단순성을 해친다. ingestion 단일화(D1)가 우월.
- **(기각) DB 사후 일괄 UPDATE만 수행**: 코드 미수정 시 재적재마다 오염 재발. 근본 해결 아님.
  (단, 기존 오염 3건은 본 방침 적용 후 별도 UPDATE로 정정 — 후속 작업.)

---

## 5. 영향

- **Hard Rule 1·2 무영향**: 디코딩은 `attribution_text` 내용 표기만 정정. NOT NULL·
  NC/ND 트리거 로직과 무관(값 존재 여부·라이선스 코드 불변).
- **라이선스 적법성**: CC BY 어트리뷰션 텍스트가 사람이 읽을 수 있는 정확한 표기로
  정정되어 오히려 license-rules.md 4.2절 의무 이행도가 향상된다.
- **코드 변경 규모(후속)**: 3개 파일 소규모 디코딩 추가. GDL·attribution.py·DB 스키마 무변경.
