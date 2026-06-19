# ADR-0026: African Storybook 품질 필터 (선별 공개)

**날짜** 2026-06-18
**상태** Accepted (2026-06-18, PM 검토 완료)
**관련** `docs/adr/0025-asb-content-ingestion.md`(특히 Amendment #6 페이지 구성·텍스트/이미지 짝짓기), `docs/backlog.md` §7.4 (n)(표본 20권 검수 → 품질 필터 필요 확정), `scripts/scan_asb_quality.py`(신호 스캔·`classify_bucket` SSOT), `scripts/out/asb_db_reconcile.csv`(CSV↔DB 대조 산출물·로컬), `components/book/asb-reader.tsx`(표지 폴백 선행 코드 트랙), `claude.md` 2절 Hard Rule 8(스키마/정책 변경 시 ADR 선행)

---

## 1. 맥락 (Context)

- ASb **2,750권 전량 `is_active=false` 스테이징** 상태(ADR-0025 D4 적재 정책). 공개 전환은 검수 후 별도 단계로 유보돼 있었다.
- backlog §7.4 (n): ADR-0025 Amd#6 뷰어 구현 후 **표본 20권 첫 공개 검수에서 12권+ 문제** 발견(빈 책/테스트 더미, 표지 404, 무텍스트 등). 이로써 정책을 **"전량 공개"에서 "선별 공개"로 전환**할 필요가 확정됐다.
- 3단계 신호 스캔(`scripts/scan_asb_quality.py`)으로 ASb 적격 전권에 대해 권별 3개 신호를 산출했다:
  - ① **본문 글줄 수**(`text_lines`) — `.txt` `page_text` 섹션 `P<n>` 라인 개수.
  - ② **이미지 장수**(`image_count`) — `images` 섹션 라인 개수.
  - ③ **표지 HTTP**(`cover_http`) — `cover_url`(ADR-0025 thumb→폴백 규칙) HEAD 응답 코드.
- 4·5단계 CSV↔DB 대조로 **실제 모수**를 확정했다(아래 D3 권수는 DB 실재 2,750 기준 확정값).

---

## 2. 결정 (Decision)

### D1 — 공개 게이트

**`text_lines >= 3` AND `image_count >= 3`** 를 공개 후보 1차 게이트로 한다(표본 근거 임계).

### D2 — 표지 폴백을 공개 선행 조건으로 못박음

`cover_http != 200`(404·ERR·타임아웃 등 200 외 전부)은 뷰어에서 **표지면 폴백 처리**(표지 스킵 또는 첫 본문 이미지로 대체)한다. **이 폴백 코드가 없으면 791권이 빈 표지로 묶이므로**, 표지 폴백(`asb-reader.tsx`)을 공개 전환의 **필수 선행 코드**로 확정한다.

### D3 — bucket 정의 및 처리 방향 (DB 실재 2,750 기준 확정 권수)

분류는 `scripts/scan_asb_quality.py`의 단일 함수 `classify_bucket`이 산출하며(표지는 `cover_ok = (cover_http == "200")` 기준), 권수는 5단계 reconcile 확정값이다.

| bucket | 권수 | 정의 | 처리 방향 |
|---|---|---|---|
| `candidate_cover_ok` | **1,416** | 글≥3 & 그림≥3 & 표지200 | 즉시 공개 후보 |
| `candidate_cover_404` | **791** | 글≥3 & 그림≥3 & 표지≠200 | 표지 폴백 코드(D2) 후 공개 |
| `empty_dummy` | **173** | 글0 & 그림≤1 | **공개 제외(영구)** — 빈 더미/테스트 |
| `no_text_picture` | **49** | 글0 & 그림≥2 | **공개 제외(이번 범위)** — 무텍스트 그림책, PM 정책 결정 반영 |
| `grey` | **321** | 위 어디에도 미해당(게이트 미달 경계) | **보류(미결정)** — `empty_dummy`(영구제외)와 구분해 별도 상태로 보존, 베타 후 개별 검토 |
| **합계** | **2,750** | | |

### D4 — 공개 가능 모수

`candidate_cover_ok` + `candidate_cover_404` = **2,207권 (80.3%)**. 표지 폴백(D2) 1건 구현으로 이 모수 전체가 공개 가능선에 든다.

### D5 — dedup 누락 45권은 정상

스캔(2,795)에는 있으나 DB(2,750)에 없는 **45권**[^dedup]은 GDL 경유 ASb 중복으로 ADR-0025 D5 dedup이 차감한 **의도된 정상 누락**이다. 재적재 대상이 아니다. (전체 목록은 `scripts/out/asb_db_reconcile.csv`의 `in_db=False` 행 참조 — 본문 나열 불필요.)

[^dedup]: ※ ADR-0025 D5는 dedup 누락을 **33권**으로 기재했으나, 본 ADR은 실적재 후 reconcile **관측값 45권**을 사용한다(12권 차이). 33은 **적재 전 추정**, 45는 **적재 후 실측**으로 자연 편차 가능성이 높다. 원인 규명(dedup 로직/GDL 데이터 변동 여부)은 본 ADR 범위 밖의 **경미 트랙**으로 분리하며, `docs/backlog.md` §7.4에 후속 항목으로 기록한다. 두 값 모두 **'의도된 정상 누락'이라는 결론은 동일**하다.

---

## 3. 결과 (Consequences)

### Positive

- **공개 가능 모수 2,207권 확정** — 표본 추정이 아닌 전권 신호 + DB 대조로 확정한 수치. ADR-0026 임계의 근거가 재현 가능(스크립트 + CSV).
- 같은 "표지 404"라도 본문 신호로 (A 표지구제 791) vs (B 영구제외)가 자동 분리됨이 입증됨 → 폴백 1건이 791권을 살린다.

### Negative / 비용

- **선행 코드 1건 필수**: 뷰어 표지 404 폴백(`asb-reader.tsx` 표지면) — 별도 코드 트랙으로 분리.
- 공개 전환(`is_active=true`)은 검수 후 **별도 SQL 단계**. 본 ADR은 **정책만 확정, DB 미변경**.

### 보존·되돌림

- `empty_dummy`(173)·`no_text_picture`(49)는 **`is_active=false` 유지**(노출 안 함)일 뿐 **삭제 아님** — 데이터 보존. 향후 정책 변경 시 재평가 가능.
- 분류 기준값(`>=3`/`>=3`)은 표본 근거. `grey`(321) 재검토나 임계 조정은 **Amendment로 추가** 가능.

---

## 4. 비기능 메모

- **SSOT**: 신호 분류는 `scripts/scan_asb_quality.py`의 `classify_bucket` 단일 함수가 산출(분포요약·CSV·본 ADR 권수가 동일 함수에서 파생).
- **산출물**: `scripts/out/asb_quality_scan.csv`(권별 신호·bucket, 2,795행), `scripts/out/asb_db_reconcile.csv`(CSV↔DB 대조, 2,795행). 둘 다 **로컬 보관·git 미커밋**(신호 데이터, 공개/DB 변경 아님).
- **재현 절차**: `python scripts/scan_asb_quality.py --all --csv scripts/out/asb_quality_scan.csv` → DB `source_id,is_active` export와 대조.

---

## 5. 후속 (이 ADR 범위 밖)

1. 표지 404 폴백 코드(`asb-reader.tsx`) — 별도 코드 트랙(D2 선행 조건).
2. 공개 전환 SQL 단계(`candidate_cover_ok` + `candidate_cover_404` → `is_active=true`, 검수 후).
3. `grey`(321) 베타 후 개별 검토 → 필요 시 Amendment.

---

## Amendment #1 — 본문 페이지 이미지 HTTP 게이트 추가 (2026-06-19)

### 맥락
원본 ADR-0026의 품질 게이트는 **표지 이미지 HTTP(cover_http)** 만 검사했다. 그러나 cover_404로 분류된 791권을 probe 검증한 결과(source_id 11932, "Ekai's First Day In School"), PM이 직접 열어본 화면에서 표지와 무관한 본문 결함이 발견되었다.

- 1페이지가 그림 없이 텍스트만 표시
- 2페이지와 6페이지의 그림이 동일(중복)
- 그림체가 페이지마다 불일치(수채화풍 ↔ 디지털 만화풍)

즉 표지 HTTP만으로는 본문 품질을 보증할 수 없으며, **본문 페이지 개별 이미지의 런타임 생사(HTTP 코드)** 가 게이트에서 누락되어 있었다.

### 결정
cover_404 보류분에 대해 **본문 페이지 이미지 HTTP 게이트**를 추가한다.

- 측정: 표지를 제외한 본문 페이지 이미지 전체에 HEAD 요청(GET 본문 다운로드 없음, 동시성 10).
- 분류 기준(권별 비200 이미지 수 b):
  - `clean` : b = 0 (본문 이미지 전부 200)
  - `minor_gap` : b = 1 (본문 1장 깨짐 → 그 면이 텍스트만 표시)
  - `broken` : b ≥ 2 (본문 2장 이상 깨짐)
- 공개 정책:
  - `clean` → 공개 후보
  - `minor_gap` → 보류 (PM 판단 대기)
  - `broken` → 보류

### 게이트의 한계 (중요)
본 게이트는 **이미지의 HTTP 생사만** 판정한다. HTTP 200으로 살아있어도 다음 내용 결함은 잡지 못한다.

- 이미지 중복(서로 다른 페이지에 동일 그림)
- 그림체 불일치(페이지 간 화풍 혼재)

probe 11932가 이를 입증한다: 본문 12장 중 1장만 비200(minor_gap)으로, "1페이지 텍스트만" 증상은 HEAD 게이트가 설명하나, "2·6페이지 중복"과 "그림체 불일치"는 설명하지 못한다. 따라서 내용 결함 검출은 별도 정적 정찰(이미지 중복 비율 등)과 향후 표본 검수에 의존한다.

### 측정 결과 (2026-06-19, cover_404 791권)
| klass | 권수 | 비율 |
|---|---|---|
| clean | 744 | 94.1% |
| minor_gap | 37 | 4.7% |
| broken | 10 | 1.3% (중 50%↑ 깨짐 4권) |

비200 이미지 총 70개 / 6915개(1.01%), ERR 오염 없음.

### 후속 조치
1. **1차 공개**: clean 744권 전체를 `is_active = true` 로 전환(PM이 Supabase 직접 실행). — PM 결정(2026-06-19)
2. minor_gap 37권 + broken 10권은 보류.
3. 정적 정찰에서 "이미지 중복 의심"으로 잡힌 9권은 clean에 일부 포함될 수 있으나, HEAD 게이트로는 거를 수 없다. 베타 이후 grey 321권 검토 트랙에서 함께 재점검한다.

---
