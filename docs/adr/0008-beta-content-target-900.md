# ADR-0008 — 베타 콘텐츠 목표 권수 1,300 → 900으로 하향

**상태** Accepted
**날짜** 2026-05-14
**관련** `tasks/_index.json` global_verification, `docs/adr/0004-source-platform-list.md`, `docs/adr/0005-book-dash-sync-strategy.md`, `docs/adr/0006-beta-language-scope.md`, `docs/adr/0007-gdl-sync-strategy.md` (특히 §7 amendment), `docs/guidelines/license-rules.md` 6.2절(verify_licenses 운영)

---

## 1. 배경

키키북스 베타 출시 시점의 카탈로그 목표 권수는 PLAN.md 4절(베타 콘텐츠 스코프) 기준으로 **1,300권**이었다. Phase 04(Book Dash)와 Phase 05(GDL)를 거치며 실제 적재 결과는 다음과 같다.

| 출처 | 적재 권수 |
|---|---|
| Book Dash (Phase 04) | 54 |
| GDL (Phase 05) | 842 |
| **합계** | **896** |

1,300 목표 대비 404권 부족. 베타 진입 전 추가 보강을 위해 새 출처를 도입할지, 목표를 하향 조정할지 결정해야 한다.

---

## 2. 결정

**베타 출시 시점 콘텐츠 목표 권수를 1,300 → 900으로 하향한다.**

- 현재 적재 896권으로 새 목표(900권)를 사실상 충족 (4권 여유분은 향후 GDL 신간 또는 큐레이션 추가로 자연스럽게 채워짐)
- **권수 보강은 베타 출시 후 Phase 2로 미룸** — 협상 트랙 체결 + 시장 피드백 반영 후 진행
- Phase 06 cron이 정기 동기화를 책임지므로 GDL 신간이 자동 추가될 여지는 유지됨

---

## 3. 근거

### 3.1 품질 vs 권수 트레이드오프 — 품질 우선
- ADR-0007 §7 amendment에서 비-그림책·H5P 기술 변형본·BookDash 중복을 자동 skip하는 정책을 채택하며 19권을 의도적으로 제거
- 추가로 큐레이션 위임 약 12권은 `is_active=false`로 노출 차단 예정 → 사용자 화면에는 ~880권만 노출 가능
- 무리하게 1,300권을 채우려면 ① 라이선스 화이트리스트 완화 (Hard Rule 위반) 또는 ② 비-그림책 혼입 허용 (UX 저하) 가운데 하나가 필요 — 둘 다 받아들일 수 없음

### 3.2 베타 사용자 학습 흐름 기준 충분성
- 만 3~7세 영어 그림책 베타 사용자의 평균 일 완독 권수: 1~3권 (PLAN.md 13절 KPI 추정)
- 900권 = 만 3~7세 자녀 1명이 매일 1권 읽어도 **약 2.5년 분량**
- 자녀 2~3명 가정에서도 1년치 이상의 비중복 콘텐츠 확보

### 3.3 보강 보류의 구체적 근거
- ADR-0005 §3.4 메모 1: Book Dash HTML이 2019 빌드라 신간 자동 반영 기대 불가 → 보강하려면 다른 경로(sitemap PDF) 필요, 별도 페이즈 작업
- ADR-0006: 영어 only 스코프 유지 — 다국어 확장으로 권수를 부풀리지 않음
- ADR-0007 §7.2: GDL publisher 결측 65%, 더 깊은 보강은 큐레이터 수동 작업 필요
- Phase 2 신규 출처 후보: ① JYBooks/웅진주니어 협상 (ADR-0004) ② African Storybook 등 GDL 외 CC BY 플랫폼 ③ Book Dash 신간 sitemap 적재

### 3.4 PLAN.md와의 정합
- PLAN.md 4절의 1,300권 목표는 본 ADR 발행으로 정정됨
- PLAN.md가 리포지토리 루트에 추가되는 시점(Phase 07 예정)에 PLAN.md 4절도 본 ADR 참조 표기로 갱신 필요

---

## 4. 결과

- `tasks/_index.json`의 `global_verification`에 있던 1,300권 관련 기재(만약 있다면)는 900권으로 정정
- `scripts/verify_gdl_sync.py`의 `BETA_CONTENT_TARGET = 1300`은 본 ADR 발행과 함께 900으로 변경 검토 (현재는 info-only 출력이라 통과/실패에 영향 없음)
- Phase 06 cron이 매일 03:00 UTC에 GDL 신간을 자동 흡수 → 자연스러운 권수 증가
- Phase 07(인증) 이후 화면 페이즈에서 추천 알고리즘이 목표 권수 900 기준으로 설계됨을 명시

---

## 5. 미반영 항목 (의도적 보류)

- **다국어 콘텐츠 추가** — ADR-0006 §3.5 재검토 트리거 도달 시 별도 ADR
- **큐레이터 수동 추가 인터페이스 (Phase 9~10)** — 본 ADR 범위 외
- **유료 라이선스 콘텐츠 (JYBooks 등)** — PLAN.md 10절 협상 트랙 + 별도 ADR

---

## 6. 운영 보강 — `verify_licenses` 자동 적용 정책 (Phase 06과 연동)

본 ADR과 같은 사이클(Phase 06)에서 작성되는 `scripts/verify_licenses.py`의 운영 정책을 1줄로 영구 기록한다.

**정책**: `verify_licenses.py`는 **기본 동작이 dry-run**(감지·보고만)이며, `--apply` 플래그가 명시될 때만 `books.is_active = FALSE` UPDATE를 수행한다. GitHub Actions의 월 1회 cron은 dry-run 모드로 실행되어 변경 감지를 GitHub Issue로만 보고하고, 사람이 로그 검토 후 별도 트리거(`workflow_dispatch` + `apply=true`)로 적용 모드를 켠다.

근거: 라이선스 자동 감지의 false positive(원천 사이트 일시 장애·응답 형식 변경 등)가 정상 콘텐츠 노출 차단으로 직결되는 위험을 차단. CC BY 4.0 라이선스는 영구이므로 자동 적용을 며칠 미뤄도 법적 위험 없음. 사용자 신뢰 보호 > 자동화 속도.

---

## 7. 재검토 트리거

- 베타 사용자 1,000명 도달 후 완독률 분석에서 콘텐츠 부족이 명백한 페인포인트로 확인됨
- JYBooks/웅진주니어 협상 체결 → 한국어/유료 콘텐츠 1,000권 이상 추가 확보 → 목표 권수 재정의
- Phase 06 cron 누적 결과 900권을 자연 도달했고, 큐레이션 위임 책 중 활성 비율이 80% 이상으로 회복됨

---

*문서 끝.*
