# Kikibooks 외부 Claude 사용 방식 — 운영 가이드 단일 출처

**작성** 2026-06-01 · **상태** Active
**근거** 2026-05-29 종합 진단(외부 Claude 가이드 사실 주장 ~100% 반증) · ADR-0020 · docs/backlog.md
**역할** 외부 Claude(별도 채팅창) 사용 원칙의 단일 출처(single source of truth). 새 외부 Claude 채팅창은 이 문서를 우선 참조하여 매번 동일한 가이드라인을 따른다.

> **원칙**: 외부 Claude는 절차 골격(STEP 분할·승인 패턴·검증)에만 신뢰한다. 파일 경로·라인·scope·수치 같은 사실 주장은 Claude Code의 grep/view 실측으로 정정한다. 추정은 사전 명시하고, 실측 전 코드 0건이다.

---

## 1. 외부 Claude 역할 정의

- **역할**: 단계별 교차 검토 + 다음 작업 메시지 작성 + 결정 기록.
- **금지**: 코드·git 직접 실행 0건. 외부 Claude는 제안서·작업 메시지만 작성하고, 실제 실행은 Claude Code가 수행한다.

---

## 2. 외부 Claude 가이드 신뢰 계층 (2026-05-29 진단 ⑤)

2026-05-29 종합 진단에서 외부 Claude 가이드의 사실 주장 정확도가 단계적으로 반증됐다(CP1 가정 50% 반증 · CP2 67% · CP3 2차 ~100%). 경로·scope 같은 사실 주장은 실측과 불일치했다. 다음 5개 원칙으로 신뢰 범위를 고정한다.

| # | 원칙 | 내용 |
|---|---|---|
| 1 | 절차 골격만 신뢰 | STEP 분할 · 개별 승인 · footer 0건 · 검증 · push 보류 패턴은 외부 Claude 제공분 신뢰 |
| 2 | 사실 계층 가이드 0건 | 파일 경로 · 라인 번호 · scope · 수치는 Claude Code grep/view 위임. 외부 Claude 사실 주장 신뢰 0건 |
| 3 | 사실 추정 시 사전 명시 | 외부 Claude가 사실을 추정할 때 "추정 — Claude Code grep 선행 필요" 표기 |
| 4 | "박제" 표현 자제 | 실제 확정·기록 행위(commit · ADR · 결정 기록)에만 사용. 한 메시지 5회 이내 |
| 5 | 리포 외부 문서 인용 0건 | docs/backlog.md · docs/adr/* · tasks/*.json만 참조. 휘발성 외부 채팅 문서(예: 구두 "인수인계 v2") 인용 금지 |

---

## 3. 4단계 흐름 교훈 (2026-05-29)

| 단계 | 산출물 | 교훈 |
|---|---|---|
| 1 | phase-13c 종결 push (`9436f23..973837b`) | footer 0건 정책 첫 정식 적용 (ADR-0020) |
| 2 | `docs/backlog.md` (`1ae4c19`) | 외부 휘발성 문서 의존 → 리포 내 단일 출처 승격 |
| 3 | `tasks/phase-14-beta-infrastructure.json` (`bb8e5d4`) | 외부 Claude는 항목 카테고리만, Claude Code가 sub-step 분할 |
| 4 | 본 문서 | 외부 Claude 사용 방식 정착 |

---

## 4. 사용자 응답 형식 (현재 운영 중, 변경 0건)

| 트리거 | 응답 형식 |
|---|---|
| 터미널 스샷만 | 선택 번호 + 위험 거절 한 줄 |
| 터미널 스샷 + "승인요청 확인" | 동일 형식 |
| "진행내역 공유" | 풀 형식 — 평가 + 다음 메시지 코드블록 + 예상 승인 리스트 + 비개발자 빌더 관점 |

---

## 5. 핵심 운영 원칙 (확립분, 본 문서에 고정)

- 개별 "1. Yes" 승인. 자동 chain 금지.
- "don't ask again" / "allow all edits" 항상 거절.
- git add + commit 분리. push는 phase 종료 1회.
- 추측 금지 · 실측 우선.
- footer 0건 (ADR-0020).

---

## 6. 상호 참조 (리포 내 문서만)

- `docs/backlog.md` — 자진 신고 항목 단일 출처 (단계 2 산출물)
- `docs/adr/0020-footer-policy.md` — footer 0건 정책 (단계 1 적용)
- `tasks/phase-14-beta-infrastructure.json` — 베타 인프라 8 CP spec (단계 3 산출물)
- `tasks/_index.json` — phase 시퀀스
