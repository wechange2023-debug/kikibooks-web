# ADR-0030: Bloom L1·L2 1,060권 배치 적재 정책 — 검수 태그 정정·표지 이식·레벨 매핑·공개 적재

> 파일명은 `0030-bloom-700-batch-load-policy.md`로 유지(git 이력 단순화). 확정 배치 규모는 **L1·L2 1,060권**이며 본문 제목·요약을 정본으로 한다.

**날짜** 2026-06-29
**상태** Accepted (팀장 결정 2026-06-29)
**관련** `docs/adr/0028-bloom-library-free-download.md`(Bloom 도입) · `docs/adr/0029-html-entity-decoding-at-ingestion.md`(디코딩) · `docs/adr/0026-asb-quality-filter.md`(선별공개·검수큐 선례) · `docs/adr/0013-cover-attribution-policy.md`·`docs/adr/0014-gdl-cover-url-and-illustrator-strategy.md`(표지 정책) · `scratchpad/bloom_exclusion_signals.md`(자동제외 신호 정찰) · `claude.md` 2절 Hard Rule 1·2·3

> 본 ADR은 **방침 확정용 초안**이다. 실제 코드 수정(`sync_bloom.py`)은 승인 후 별도 작업지시서에서 수행한다. 본 작업은 문서 전용 — 코드 무변경. 모든 라인번호·태그·분포는 grep/Parse API 실측.

---

## 1. 맥락 (Context)

ADR-0028로 Bloom Library를 9번째 소스로 도입했고, ADR-0029로 적재 디코딩을 정정했다.
이번 배치 = 영어·CC BY·**computedLevel L1·L2 = 1,060권**(실측 L1=487 / L2=573)의
**본격 배치 적재** 동작 3건(검수 신호 / 표지 / 레벨)과 적재 상태(is_active)를 결정으로 확정한다.
L3(680)·L4(986) = 1,666권은 **본 배치 제외**, 별도 후속 배치로 다룬다.

근거 정찰: STEP26 42권 인앱 검수(탈락 15 + 통과 27) 및 `scratchpad/bloom_exclusion_signals.md`
(Bloom 공개 Parse API 실측).

---

## 2. 결정 (Decision)

### D1 — 검수 토픽 태그 멤버 정정: Science 제거 · Dictionary 추가

**현행 실측** (`sync_bloom.py`):
- `_NONSTORY_TOPIC_TAGS`(L131-135) = `topic:Math`, `topic:Mathematics`, `topic:Science`.
- 사용처: `flag_review_list`(L556)의 **검수리스트 신호**(자동제외 아님).

**버그 실측**: 통과(양서) 도서 `How to Catch the Wind`(bookInstanceId `b1be87dc`)의
Parse 태그 = `['topic:Science', 'computedLevel:2', 'list:Pratham']` — **Science 보유**.
즉 `topic:Science`를 제외/검수 신호로 쓰면 양서가 오탈락(false positive)된다.

**정찰 판별력**(탈락 15 / 통과 27, 0 FP 우선):
| 신호 | 탈락 포착 /15 | 통과 오탈락 /27 |
|---|---|---|
| `topic:Dictionary` | 1 | **0** |
| `topic:Math`(+Mathematics) | 2 | **0** |
| `Dictionary OR Math` | 3 | **0** |
| `topic:Science` | — | **1 (양서 오탈락)** |

**결정**:
1. `_NONSTORY_TOPIC_TAGS`에서 **`topic:Science` 제거**(양서 오탈락 방지).
2. **`topic:Dictionary` 추가**(0 FP·picture-dictionary 명시 마커).
3. 확정 멤버 = `{topic:Math, topic:Mathematics, topic:Dictionary}`.
4. **용도는 현행 그대로 "검수 플래그(신호)" 유지** — 멤버만 정정한다. 이 태그는
   `flag_review_list`가 검수 우선순위 신호로 표기할 뿐, **자동제외도 `is_active` 자동 강제도 없다.**
5. **부적합책 제외는 전적으로 팀원 인앱 시각검수가 담당**한다(자동 규칙으로 거르지 않음, ADR-0026 검수큐 선례).
   정찰상 Dictionary/Math 신호의 포착률은 탈락 3/15에 불과하며, 나머지 부적합책은 메타 신호가
   없으므로 인간 검수가 유일한 판별 수단이다.

**영향 범위 명시**: 본 변경은 **이번 1,060권 신규 적재에만** 적용된다. 이미 적재된
African Storybook·기존 Bloom 27권 등에는 **영향 없음**(소급 재분류 없음).

### D2 — 표지: 첫 페이지 본문 이미지 고해상도 이식

**현행 실측**: `bloom_cover_url`(L769-772) = `base + COVER_FILENAME`,
`COVER_FILENAME = "coverImage200.jpg"`(L98) — **200px 썸네일**(저해상도).

**STEP26 수동 보정**(`scratchpad/bloom_cover_update_27.sql`, 27권만 SQL UPDATE):
첫 페이지 본문 이미지 URL로 교체. 예:
`https://s3.amazonaws.com/bloomharvest/{email}%2f{bid}%2fbloomdigital%2fCover.jpg`.

**결정**: STEP26 로직을 `sync_bloom.py`에 이식하여 **적재 시점부터 고해상도 표지**가 박히도록 한다.
- index.htm 파싱 → **첫 페이지 본문 이미지 추출** → `cover_url`로 사용
  (200px 썸네일 `coverImage200.jpg` 대체).
- ★ URL 조립 필수규칙: **`prefix + quote(unquote(filename))`** — 이중인코딩(`%2520`) 방지.
  `unquote`로 1회 디코딩 후 `quote`로 1회만 재인코딩.
- ★ `prefix`는 **source_id가 아니라 Bloom API `baseUrl` 파생**
  (`harvest_bloomdigital_base`, L302-319) — harvester bloomdigital S3 경로.
- 첫 페이지 이미지 부재/추출 실패 시 폴백은 기존 `coverImage200.jpg` 유지(표지 결측 방지).
- **검증**: dry-run에서 표지 해상도(width/height) 분포 확인(`bloom_cover_dryrun_50.csv` 동형).

### D3 — 레벨 매핑: computedLevel n → our level n (1:1) 확정

**현행 실측**: `build_book_payload`(L775-807)는 `level`·`age_min`·`age_max`를 **설정하지 않는다**
(Bloom 책은 현재 레벨 미부여). STEP26은 27권에 `bloom_level_update_27.sql`로 별도 보정.

**computedLevel 분포 실측** (Parse count, English + cc-by, 2026-06-29):

| computedLevel | 권수 | 비고 |
|---|---|---|
| 1 | 487 | |
| 2 | 573 | |
| 3 | 680 | (현 깔때기 제외) |
| 4 | 986 | (현 깔때기 제외) |
| 5 | **0** | 존재하지 않음 |
| 6 | **0** | 존재하지 않음 |
| 미부여(none) | 129 | = 2,855 − (487+573+680+986) |
| **English+cc-by 전체** | **2,855** | |
| **현 깔때기(L1\|L2 $in)** | **1,060** | = 487+573. dedup·영어 allTitles·gate① 후 적재 |

> 주: L1~L4 합 2,726 + 미부여 129 = 전체 2,855(정합). **확정 사실: computedLevel 최댓값 = 4(L5/L6 부재).**

**확정 매핑규칙(팀장 결정)**: `computedLevel n → our level n` **1:1** (computedLevel:1→level 1,
computedLevel:2→level 2). 본 배치는 L1·L2만이므로 우리 레벨 **1~2만 부여**된다.

**결정**:
- 이번 1,060권 배치는 **L1·L2 책만**(깔때기 `FIRST_BATCH_LEVELS` = computedLevel:1|2) →
  1:1 적용 시 우리 레벨 **1~2만 부여**. 유아(3~7세)에 과도하지 않음.
- Bloom computedLevel은 **최대 4**이므로 "5레벨 과도" 우려는 **해당 없음**.
- **age 매핑(레벨→연령)**: 기존 ASb·GDL 적재 방식 확인 후 일치시킨다. 해당 방식이 없으면
  **잠정값을 두고 전 도서 적재 후 일괄 조정**한다(현 시점 미확정 — 코드 작업 단계에서 확정).
- `leveledReaderLevel`·`bookshelf`는 신뢰 낮아 **미사용**(STEP26 방침 유지).
- L3·L4 확장은 본 배치와 **별개 후속 의사결정**(1,666권, 읽기 난이도 검토 필요).

### D4 — 적재 상태: is_active=true 공개 적재

**현행 실측**: `build_book_payload`(L806) = `is_active: False`(스테이징).

**결정**(팀장 결정): **`is_active=true` 공개 적재**. 단 서비스 정식 오픈 전이라 내부만 접근.
- **전량 dry-run 게이트는 불변** — dry-run 통과분만 적재.
- 적재 후 팀원 **인앱 시각검수**로 부적합책을 **사후 `is_active=false` 전환**하는 운영 흐름.
- Hard Rule 1·2(attribution NOT NULL / NC·ND 차단)는 불변 — is_active와 무관.

---

## 3. 검증 계획 (후속 코드 작업에서 실행)

1. **D1**: dry-run에서 검수 플래그 표기 건수 로깅(Dictionary/Math 태그 신호) — 자동제외·
   is_active 강제가 발생하지 않음 확인, Science 신호가 더는 표기되지 않음 확인.
2. **D2**: dry-run 표지 URL의 해상도 분포 수집(200px 썸네일 잔존 0건 목표, 폴백분만 예외).
   `%2520` 이중인코딩 0건 정규식 확인.
3. **D3**: dry-run에서 부여 레벨 분포(level 1·2만 등장) 확인.
4. **D4**: dry-run은 DB 미반영(게이트). 실적재는 별도 승인 후.

---

## 4. 대안 및 기각 사유

- **(기각) `computedLevel==1` 자동제외**: 정찰상 통과 27 중 9건(33%) 오탈락 → 양서 대량 손실.
- **(기각) 짧은 카테고리명사 제목 자동제외**: 재현 8/15로 높으나 통과 1건 오탈락 →
  자동제외 부적격, 검수 플래그로만.
- **(기각) Science 검수/제외 신호 유지**: 양서(How to Catch the Wind) 보유 실측 → 오탈락.
- **(기각) 표지 200px 썸네일 유지**: 저해상도로 카드 UI 품질 저하. STEP26 고해상 보정 이식이 우월.
- **(기각) is_active=false 스테이징 유지**: 팀장 결정(서비스 전 내부 접근)으로 공개 적재 채택.
  품질 통제는 dry-run 게이트 + 사후 인앱검수로 담보.

---

## 5. 영향

- **Hard Rule 무영향**: D1~D4 모두 attribution NOT NULL·NC/ND 트리거 로직과 무관.
- **소급 없음**: 이번 1,060권(L1·L2) 배치 신규 적재에만 적용. 기존 ASb·Bloom 27권 무변경.
- **코드 변경 규모(후속)**: `sync_bloom.py` 단일 파일 — 태그 상수(D1)·표지 함수(D2)·
  payload 레벨/is_active(D3·D4). DB 스키마 무변경(기존 books 컬럼 사용).
