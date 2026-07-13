# ADR-0042: 안건 #4 순회 게이트 — 모집단 고정·신호 분리·중단 기준 사전등록

- 상태: Accepted (사전등록). 단 §5 agree 임계값은 **실행 확정 대기**.
- 날짜: 2026-07-14
- 관련: ADR-0035(자막 A안)·ADR-0041(agree 보조신호 강등)·
  docs/recon/2026-07-09-bookdash-full-catalog-survey.md(survey)·
  docs/recon/2026-07-10-157books-text-source-recon.md·
  docs/recon/2026-07-10-harvest-gate-v2.md(게이트 v3)

## 1. Context

- Book Dash 하이라이트 트랙 K1 = A안(이미지 아래 텍스트 레이어 + marks.json).
- 신규 154권의 텍스트 레이어 수확이 필요하다. 43권 대조군과 달리 **정답지가 없다**
  (survey §4: 텍스트 원천 보유는 206 중 48뿐 → Levenshtein oracle 채점 불가).
- 따라서 품질판정은 "정답 대비 정확도"가 아니라 **구조신호 + 교차추출 일치도**에 의존한다.

## 2. 모집단 (확정)

- **정본 대상 = 154권** (WP 206 − 제외 52). `scripts/pdf_harvest/population_154.txt`
  가 순회의 **유일 정본 입력**이다 (2026-07-14 실측: 206/52/154 정확 일치).
- "157"은 탐침 시 표현(154 WP-only + drift 3 — drift 3은 이미 v2 수확 완료). **재론 금지.**
- 제외 52 = 동일 slug 49 + drift 신slug 3. 도출식·근거 문서: survey §2.
- 소실위험 제거: `wp_english_catalog.json` 스냅샷(206항목)을
  `scripts/pdf_harvest/data/`에 커밋 (사전 정찰 Risk-1 종결).
- 범위 밖 2권(springloaded, i-can-dress-myself) = Wordless(WP term 643), 순회 대상 아님.

## 3. 신호 분리 (★핵심 — 두 종류 실패를 절대 합산하지 않는다)

권당 아래 신호를 **독립적으로** 기록한다.

| 신호 | 의미 | 라우팅 |
|---|---|---|
| W-WORDLESS | 원래 글 없는 그림책 | WORDLESS-OK. 하이라이트 불필요. 실패 아님 |
| W-NOLAYER | 글은 있으나 추출가능 텍스트 레이어 없음 | MANUAL(사람입력/OCR초벌 K6). 추출 실패 |
| mapping_deviant | 텍스트-이미지 면대응이 표준 이탈 | REVIEW(정렬 검수) |
| folder_unresolved | _no-text 폴더 매핑 실패 | K5-플래그. 텍스트 라우팅과 독립 |
| license_warning | NC/ND 힌트 | LICENSE-HOLD(Hard Rule 3). 텍스트 상태 무관 보류 |
| agree(v1×v2) | 교차추출 텍스트 일치도 | 낮으면 REVIEW(단방향). 높다고 AUTO 보증 아님 |

- W-WORDLESS vs W-NOLAYER 판별규칙:
  - (a) 알려진 Wordless 목록 우선 (§6 의존성 — 단 154권은 English(621) 태그 모집단이라
    643 태그 기반 목록은 원칙상 미발화; near-wordless 변칙 대비 참조용).
  - (b) 추출텍스트≈0 + `_no-text` 폴더 있음/글 존재 근거 → **W-NOLAYER**.
  - (c) 추출텍스트≈0 + `_no-text` 폴더 없음 + 이미지전용 구조 → **W-WORDLESS**.
- 최종 상태: **AUTO / REVIEW / MANUAL / WORDLESS-OK / LICENSE-HOLD**.
  folder_unresolved·K5-플래그는 주석(배타 상태 아님).

## 4. 중단 기준 (★"무엇이 나오면 이 길을 포기하는가" — 데이터 보기 전 사전등록)

분모 = 글 있는 책 = 154 − W-WORDLESS 수.

- W-NOLAYER 비율 **< 15%** → 자동 경로 건강. AUTO 집합 marks.json 진행.
- **15~40%** → 자동 유지, W-NOLAYER는 소수 예외로 MANUAL 큐.
- **≥ 40%** → 자동-우선 폐기, OCR초벌/사람입력(K6)을 주 경로로 전환.

근거: 43대조군 MANUAL은 1/43(≈2.3%)로 매우 건강. 15%까지 후퇴해도 자동 유효,
40%는 "코퍼스 다수가 깨짐 → 전략 전환" 선.

**무결성 조항**: 위 숫자는 순회 실행 전에 고정됨 → 결과 사후 합리화 불가.
변경은 반드시 관측분포 첨부한 ADR 개정으로만. 무단 조정 금지.

## 5. agree 임계값 (ADR-0041, 이 순회 분포로 확정 — 실행 확정 대기)

- 순회 후 154권 agree 분포(min/median/max/std/IQR)를 보고한다. 43대조군 형식 동일.
- **사전등록 규칙: agree < Q1(하위 25%) → REVIEW.** 순수 분포상대 기준.
  43대조군 절대수치(62.9/97.1 등) 이식 금지("대조군 요령 그대로 가정 금지").
- 명시할 한계: rho=0.47(약한 proxy), "함께 틀림" 실재(gracas-dream·who-is-our-friend)
  → agree 높음이 정확 보증 아님. 오직 **단방향(낮음→검수) 필터**로만 사용(ADR-0041).
- 분포 퇴화(예: >90% 단일값)면 Q1 완화 가능 — 단 관측분포 첨부 ADR 개정으로만.

## 6. 실행 지시서로 넘기는 의존성 (이 ADR 아님)

- agree엔 v1+v2 둘 다 필요(harvest.py는 agree 미산출). v2 먼저 캐시 →
  harvest_v1.py 캐시 재추출(네트워크 0) 권장. v1의 공유캐시 수용 여부 실행 전 확인.
- 신규 순회는 별도 `--state` 경로(54권 잔재 분리).
- out/ .gitignore 예외 결정은 실행 산출물 커밋 시 처리.
- Wordless 참조목록: 레포 내 16권 slug 목록 **미발견** (2026-07-14 STEP B).
  존재 출처 = survey §1의 taxonomy 정의(term 643 `zxx`, count 16,
  docs/recon/2026-07-09-bookdash-full-catalog-survey.md:20) +
  `scripts/sync_book_dash_v2.py:61`(621 필터 — 643 구조적 배제, 하드코딩 목록 없음) +
  알려진 slug 2건(springloaded·i-can-dress-myself). 전체 16권 목록이 필요하면
  WP REST `?languages=643` 1회 조회로 확보(실행 지시서에서 재탐색·결정).
