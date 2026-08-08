# 세션 재개 메모 — Book Dash html 39권 회수 트랙 (2026-08-08)

> **읽는 순서**: 본 문서 → `docs/adr/0056-asb-native-book-text-load.md` → 필요 시 ADR-0053 Amd#3 · ADR-0054 Amd#1·#2.
> 본 세션은 **문서 확정만** 했다. 코드·스크립트·DB·Storage 작업은 0건이다.

---

## 1. 세션 종료 상태

| 항목 | 값 |
|---|---|
| 최종 HEAD | 본 커밋(재개 시 `git log --oneline -1`로 확인) |
| 직전 커밋 | `0b6983b` ADR-0056 O4 해소(34권 409면 확정) + 408 정정 철회 · ADR-0054 E4 잔여 5권 확정 |
| 그 이전 | `89b7225` ADR-0056 Book Dash html 34권 편입(703권) + ADR-0053 Amd#3 · ADR-0054 Amd#1 |
| 브랜치 | `main` — `origin/main`과 동기(ahead/behind 0) |
| 미커밋 | **47건** = baseline **45** + 의도적 제외 2(`asb_bloom_targets.csv`·`_progress.jsonl`)<br>※ baseline이 47 → 45로 축소됐다(본 커밋에 원천 json 2건 포함). 아래 §5 참조 |

---

## 2. 확정 범위 — **708권 7,368면**

`book_text` 적재 대상(ADR-0056 D1·D9) 및 Danielle TTS 적용 범위(ADR-0053 Amd#3)가 같은 값이다.

| 코호트 | 권수 | 면수 | 결정문 |
|---|---:|---:|---|
| ASb `asb_native` 활성 | 527 | 5,330 | ADR-0056 D1~D8 |
| Bloom `asb_native` 활성 | 142 | 1,569 | 〃 |
| **소계** | **669** | **6,899** | |
| Book Dash html 활성·오디오 보유 | 34 | 409 | **ADR-0056 D9-a** |
| Book Dash html 활성·무오디오 | 5 | 60 | **ADR-0056 D9-b** |
| **소계** | **39** | **469** | = html 활성 전량 |
| **합계** | **708** | **7,368** | |

- 검산: 669 + 39 = 708 ✅ / 6,899 + 469 = 7,368 ✅ / 409 + 60 = 469 ✅
- **Book Dash html 활성 도서 중 `book_text` 없는 권은 적재 후 0**이 된다.
- 잔여 제외 15권 = 비활성 15권 = **블랙리스트 15권**(slug 1:1 확정, ADR-0056 §5-e). 전원 사용자 비노출.

### 39권의 성격 차이 (혼동 주의)

| | 권수 | 기존 오디오 | 작업 | 추가 조건 |
|---|---:|---|---|---|
| **D9-a** | 34 | `voice='Ruth'` 존재 | **재생성**(Ruth 행은 무접촉 보존) | 없음 — 축 정합 실측 완료 |
| **D9-b** | 5 | **없음** | **신규 합성** | **적재 후 육안 검증 1권** + **이미지 실재 확인(O6)** |

---

## 3. 해소된 게이트 3건

| 게이트 | 해소 내용 |
|---|---|
| **ADR-0056 O4** — 활성 34권 확정 명단 | ✅ 팀장 SQL export로 slug·`source_id`·면수 확정. 워커 전수 대조 통과(json 부재 0 · `ruth_pages` 34/34 · 장면 합계 409 · **블랙리스트 교집합 0**). 명단은 ADR-0056 O4에 표로 박제 |
| **ADR-0054 E4** — 잔여 전환 권수 | ✅ `b=1`(`maddy-moona` 활성)·`c=0`(블랙 교집합 0) 해소 → 잔여 5권 확정. 이후 Amd#2로 **0권** |
| **ADR-0054 O2** — 오디오 `page_index` 재매핑 | ✅ 실질 해소. 34권은 이관, 잔여 5권은 전량 무오디오라 재매핑 대상이 원리적으로 없음 |

---

## 4. 다음 세션 첫 안건

**본문 적재 SQL 생성기 작성** — ADR-0056 D9~D14 구현.

착수 전 반드시 확인:

1. **ADR-0056 Status가 `Accepted`인가** — 현재 `Proposed`다(§6 미승인 1). Proposed 상태로 적재 착수 금지.
2. **`git status --short scripts/tts_pilot/out/` 무출력인가** — 원천 39권의 커밋본 = 작업본 확인(ADR-0056 D10·§5-h).
3. **ADR-0056 O6 결과** — 5권 이미지 육안 확인. 미완이면 **D9-b(5권)를 빼고 D9-a(34권)만** 진행 가능.

구현 시 준수:

- 원천 = `scripts/tts_pilot/out/{slug}.json` **재크롤·`extract_text.py` 재실행 금지**(D10)
- `page_index` = json `page` − 1 (D11) · `source = 'html_scene_json_v1'` (D12)
- 정제는 `tts_targets.sanitize()` **공유**(D6, 복제본 금지)
- 빈 면도 `text=''` 행 적재 — 대상 **1면**(`a-house-for-mouse` p10 = `page_index 9`, D7)
- `book_review`에 **어떤 행도 쓰지 않는다**(D8 실행 규칙 준용, O5 미결)
- **워커는 DB 쓰기 코드 경로를 갖지 않는다**(ADR-0053 D6). SQL 파일 생성까지만

---

## 5. 미커밋 47건 (baseline 45) — 유실 위험 점검 결과

**적재 원천 중 유실 위험 항목은 이번 커밋으로 해소됐다.**

- ✅ **해소**: `scripts/tts_pilot/out/a-beautiful-day.json` · `a-fish-and-a-gift.json` 2건을
  본 커밋에 포함(팀장 승인, baseline 47 → 45). 커밋본이 스크립트 수정 이전 산출물이었다
  — 상세는 **ADR-0056 §Context 5-h**.
- ⏸ **의도적 제외(재생성 가능, 커밋하지 않음)**:
  - `scripts/tts_pilot/out/_fullbatch_dryrun_report.json` (`M`) — 리포트, 적재 원천 아님
  - `scratchpad/text_harvest/asb_bloom_targets.csv` · `_progress.jsonl` — 팀장 SQL export·중간 로그
  - `scripts/pdf_harvest/out_*` · `scratchpad/dedup/*` · `voice_samples_*` 등 — 재생성 가능 산출물
  - `.claude/settings.local.json` · `.bak` — 로컬 설정
- **잔여 47건 중 적재·전환에 필요한 원천은 없다.** 전부 재생성 가능하거나 로컬 전용이다.
- **재개 시 검산**: `git status --short | wc -l` → **47**. 값이 다르면 원인을 규명한 뒤 진행한다.

---

## 6. 팀장 미승인 2건 (착수 차단)

| # | 항목 | 상태 |
|---:|---|---|
| 1 | **ADR-0056 `Accepted` 승인** | 현재 **`Proposed`**. 적재 착수의 선행 조건 |
| 2 | **ADR-0053 D4 드라이런 승인** | 합성 착수의 선행 조건. dry-run은 Polly 0·Storage 0·DB 0 |

---

## 7. 비차단 Open 5건

| # | 항목 | 소재 |
|---|---|---|
| **O5** | html 39권 `book_review` 시드 여부 미결 — **D9-b 육안 검증 위치(`/admin/review`)와 연동** | ADR-0056 |
| **O-a** | 비활성 10권(121면) 비활성 사유 미확인. 중복 비활성화 231권 포함 여부 미대조 | ADR-0056 |
| **O-b** | "오디오 보유·비활성 11권" 중 1권이 html 44권 밖에 존재. 소재 미확인 | ADR-0056 |
| **O-d** | `Slide.imageUrl` non-null — 결손 시 빈 렌더. **ASb·Bloom 적재 시 재검토 필요** | ADR-0056 |
| **O-c** | "ADR-0054 백로그 8번" 원문 특정 실패. 번호 체계 부재 가능성 | ADR-0054 E7 |

추가 미결(비차단):

- **ADR-0054 F6** — 본 ADR Status(`Accepted` 유지 / `Superseded`) **팀장 결정 대기**.
  워커 권고는 **(A) `Accepted` 유지** — ADR-0056은 `book_text`·오디오 트랙만 대체했고
  **이미지 해상도 트랙은 대체하지 않았다**(F4: D1~D6 절차·WP PDF 자산 무폐기).
- **ADR-0054 O4** — 슬라이드 총 수. Amd#2 F3로 **소진(moot)** 처리(전환 대상 0권).

---

## 8. ADR-0056 O6 — 5권 이미지 육안 확인 **결과 미반영**

**본 세션 종료 시점 기준 팀장 확인 결과가 도착하지 않았다.** 문서에는 "⏸ 대기(2026-08-08)"로
기재돼 있다.

- **확인 대상**: `book-images` 버킷 `book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/`
  (`a-beautiful-day`)에 `01.jpg`~`12.jpg` + `cover.jpg` = **13객체**
- **기록 기반 검산은 폐합**: 정예 39권 508객체 = 본문 469(34권 409 + 5권 60) + 표지 39.
  분해식 출처는 **`ADR-0036 Amd#1:128`**(`docs/recon/state-audit.md:110`에는 분해 미기재)
- **성공 시**: ADR-0056 O6 Resolved 처리
- **실패 시**: **D9-b(5권)만 철회**. 범위 708권 7,368면 → **703권 7,308면**.
  5권은 ADR-0054 D2 경로로 복귀하며, 그 절차는 폐기되지 않아 즉시 진행 가능(ADR-0054 Amd#2 F4·F7).
  **D9-a 34권·ASb·Bloom은 영향 없음.**

---

## 9. 이번 세션에서 확정된 운영 교훈 2건 (ADR-0056 §Context 5-c)

1. **면수 분포로 활성/비활성 배분을 추정하지 않는다.** `is_active`와 면수는 독립 축이다.
   **총계 검산은 배분 오류를 잡지 못한다**(408+122도 409+121도 합이 530). 유일해 논증은
   전제를 검증하지 않는다. → 실측은 **집계값이 아니라 slug 단위 export**로 받는다.
2. **원천 파일 인용 시 git 상태(`M`/`??`)까지 확인한다.** 커밋본과 작업본의 괴리는
   `M` 플래그로만 드러나며, 파일을 열면 항상 작업본이 보인다. 이번 건은 **실존·장면 수 검산을
   모두 통과했으나 내용이 달랐다.** → 실존 · 구조 · **git 상태** 3단 확인.
   산출물 커밋 시 **생성 스크립트가 clean인지 함께 확인**한다.

---

## 10. 운영 규율 (불변 — 재개 시 준수)

- git: `git add`는 **파일명 명시**(`git add .` 금지) / add → commit → push **3단계 각각 별도 승인**
  / **단일 `-m`** / 트레일러 0건
- push 전 `gh auth status`로 **crspiegel** 확인 → 아니면 `gh auth switch --user crspiegel`
  → 재확인 실패 시 **STOP**
- 대량 SQL은 step1(backup)/step2(변경)/step3(검증) 분리, 파일은 항상 **`ROLLBACK;`으로 종료**
  (`COMMIT`은 팀장이 SQL Editor에서 직접 타이핑)
- **전수 드라이런이 적재의 게이트.** 소량 표본 일반화 금지
- 게이트 비교 시 `source_id` 단독 비교 금지 — `(source_platform, source_id)` 쌍 또는 `books.id`
- **문서 갱신이 작업의 시작**(코드 전 ADR)
- 지시서에 없던 상황·예상 외 결과가 나오면 **즉시 STOP하고 보고**
