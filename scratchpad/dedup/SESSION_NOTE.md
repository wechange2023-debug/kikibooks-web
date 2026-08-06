# 중복 표지 탐지 · 비활성화 트랙 — 세션 재개 메모

**작성** 2026-08-06 · **상태** 산출물 확정, **DB 미실행**

---

## 1. 현재본 = 231권 비활성화 기준

| 항목 | 값 |
|---|---|
| 분석 대상(활성 도서 전량) | 1,852권 |
| 중복 그룹 | 166 (A 확정 131 + B 의심 35) |
| 유지 | 131권 |
| **비활성화 확정** | **231권** |
| 활성 잔여 예상 | **1,621권** |

플랫폼별 비활성화: african_storybook 114 / gdl 84 / bloom 33 / **book_dash 0**

유지판 결정 우선순위(A그룹): ① 오디오 보유 → ② book_dash → ④ 비-GDL(GDL은 H5P라 TTS 불가)
→ ③ 표지 해상도 최대(오적재 표지는 비교 제외) → ⑤ id 최소

B그룹(의심 35 = cover 오탐 의심 8 + 제목 소멸 27) 규칙: 오디오·book_dash판만 유지, 그 외 전원 비활성화.
**실측 결과 B그룹 83권에는 오디오·book_dash판이 0권이라 35그룹 전부 유지판 없이 전원 비활성화된다.**

## 2. ⚠️ SQL 실행 여부는 팀장 확인 필요 (미실행 상태)

`step1_backup.sql` → `step2_deactivate.sql` → `step3_verify.sql` 순서로 **팀장이 직접 실행**한다.
Claude Code는 DB에 접근하지 않았고, 파일 생성까지만 수행했다.

- step1: `books_backup_dedup_20260806` 백업 테이블 생성 (기대 231행). 행수 불일치 시 step2 진입 금지
- step2: `UPDATE books SET is_active = FALSE` — id 231건 명시 나열. **DELETE 없음.** 하단에 비상 원복문 주석
- step3: 검증 SELECT 4종 — 비활성화 231 / 활성 잔여 1,621 / 오디오 보유 도서 전원 활성(0행) / book_dash 활성 190 불변

안전 게이트 4종 전량 통과: (a) 비활성화 ∩ 오디오 = 0건 [절대 조건] · (b) A그룹 유지판 정확히 1권 ·
(c) 중복 id 없음 · (d) B그룹 book_dash 비활성화 0건

**감수 항목(팀장 확정)**: 비활성화 후 카탈로그에서 제목이 완전히 사라지는 도서 **83권**
(asb 63 / gdl 11 / bloom 9). 육안 확인 트랙과 게이트 e(소멸 0건)는 폐지 방침으로 적용하지 않았다.

## 3. 대기 트랙 — 표지 재적재 38행

`cover_reload_candidates_v3.csv` (38행). **이번 비활성화 대상이 아니다.** 별도 처리 필요.

- 바이트 동일 표지를 제목이 다른 도서들이 공유: 15그룹 / 37권 (최대 ASB 7권 그룹)
  → 중복 도서가 아니라 **표지 오적재**. 커밋 `2bfce41` first-body-image 승격 과정 의심
- 다운로드 실패 1권: `The harden criminal in the village` — ASB 원본 404
  (`https://africanstorybook.org/illustrations/covers/39834.png`)
- 이 중 2권은 **오적재이면서 동시에 중복**이라 리포트에도 교차 편입되어 있다
  (`중복 판정 대기(리포트 그룹 64 / 150)` 비고 참조)

## 4. 파일 안내

| 파일 | 내용 |
|---|---|
| `deactivate_final.csv` | **현재본** 231권 확정 목록 (그룹유형 A/B 컬럼 포함) |
| `deactivate_final_prev3.csv` | 직전본 188권 (①②④③⑤ · 오탐 8그룹 제외) |
| `deactivate_final_prev.csv` | 전전본 188권 (①②③④⑤ · GDL 유지 38권) |
| `duplicate_report_v3.csv/.md` | 166그룹 최종 리포트 (md는 썸네일 포함) |
| `duplicate_report_v2 / (v1)` | 임계값·분류 변경 이력 보존용 |
| `find_duplicates.py` | v1 수집·phash·그룹핑 (해밍 8) |
| `find_duplicates_v2.py` | 해밍 4 + 해상도 추천 + 바이트동일 분리 |
| `find_duplicates_v3.py` | 제목 기준 재분류 + 교차 편입 |
| `finalize_deactivation.py` | 확정 목록·SQL 생성 (import 금지 가드 있음) |

**미커밋 제외**: `covers/` 표지 1,851장(약 330MB) · `phash_cache.json` · `run.log` — 재생성 가능.
표지 재수집이 필요하면 `python find_duplicates.py` 실행 (이미 받은 파일은 건너뛰는 이어받기 지원, 약 15분).

## 5. 재개 시 첫 질문

**팀장이 step1~3 SQL을 이미 실행했는지 먼저 확인할 것.** 실행 여부에 따라 다음 작업이 갈린다.

- 미실행 → 실행 여부 판단 대기 (소멸 83권 감수 재확인 권고)
- 실행 완료 → step3 검증 4종 결과 확인 후, 표지 재적재 38행 트랙 착수
