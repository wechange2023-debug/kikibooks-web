# 인계 문서 — ASb 품질 필터 트랙 (2026-06-18)

> **용도**: 다음 세션/외부 Claude 검수 인계. 이 파일 1개만 읽으면 현재 상태·미결정·다음 단계를 전부 파악 가능.
> **작성 시점**: 2026-06-18, 컴퓨터 재시작 직전. **push·코드 트랙은 외부 검수 대기 상태로 정지.**

---

## 0. 한 줄 요약

ASb 2,750권 "전량 공개"→"선별 공개" 정책을 **ADR-0026(Accepted)**로 확정하고, 근거 신호 스캔·CSV 대조·문서 2건 커밋까지 완료. **아직 push 안 함**(외부 검수 후 승인 대기). 공개 가능 모수 = **2,207권(80.3%)**.

---

## 1. 현재 git 상태 (정확값)

| 항목 | 값 |
|---|---|
| 브랜치 | `main`, **ahead 2** (origin/main 대비), **push 안 됨** |
| HEAD | `61e90fbf1c14abd28a69c58b62fd3b76387e7f89` (`docs(backlog): record ADR-0026 acceptance and dedup-diff follow-up (o)(p)`) |
| HEAD~1 | `efb0044d728b53a814f05a6f28a7174969ed6c5f` (`docs(adr): add ADR-0026 ASb quality filter (Accepted)`) |
| HEAD~2 (push된 마지막) | `25473333223718647f06da9c6d14acd7999d712d` (세션 시작점, (n)) |

**커밋 규칙(ADR-0020 준수)**: trailer/footer **0건**. `Co-Authored-By` 금지 — Vercel Hobby plan이 협업으로 오인해 배포 차단하기 때문. (이 트랙의 두 커밋 모두 단일 subject 라인, 트레일러 없음.)

### 미커밋 잔여 (의도적으로 안 건드림)
- `scripts/scan_asb_quality.py` — **untracked**. ⚠️ ADR-0026이 SSOT로 참조하는 코드인데 미커밋(아래 §4 미결정 1).
- `scripts/out/asb_quality_scan.csv`, `scripts/out/asb_db_reconcile.csv` — 로컬 데이터 산출물(미커밋이 맞음).
- `.claude/settings.local.json` (M), `scripts/**/__pycache__/*.pyc` (M/??) — 캐시·로컬설정, 커밋 대상 아님.

---

## 2. 이번 트랙에서 한 일 (1~6단계)

1. **세션 복원 점검** — HEAD 2547333 / clean 확인.
2. **데이터 recon** — ASb `.txt`는 리포에 없음. `sync_asb.py`가 `global-asp/asp-raw-db` tarball을 **메모리에서** 처리(디스크 잔여 0). 신호 3종 출처 확정:
   - ① 본문 글줄 = `.txt` `page_text` 섹션 `P<n>` 라인 수
   - ② 이미지 장수 = `images` 섹션 라인 수
   - ③ 표지 = `cover_url`(thumb→폴백 규칙, `sync_asb.py:290-291`) HEAD HTTP 코드
3. **소량 dry-run** — `scripts/scan_asb_quality.py --ids` 신규 작성. 검증 5권(36768/37240/38751/38988/39025) 손계산 일치.
4. **전량 스캔** — `--all` 모드(tarball 1회 + 표지 HEAD 동시성 10). 적격 English+CC **2,795권** 분포 산출.
5. **CSV 산출 + DB 대조** — `--csv` 옵션. PM의 DB export(`source_id,is_active`, 2,750행)와 set 연산:
   - A(스캔−DB)=**45** (GDL 중복 dedup 누락, 정상) / B(DB−스캔)=**0** / C(공통)=**2,750**
   - is_active 전부 false(임시 공개 원복 완료 확인)
6. **ADR-0026 기안→Accepted** + backlog §7.4 (o)(p) 기록 + 문서 2건 분리 커밋.

---

## 3. 확정 숫자 — ADR-0026 "실제 공개 가능 모수" (DB 실재 2,750 기준)

| bucket | 권수 | 정의 | 처리 |
|---|---|---|---|
| `candidate_cover_ok` | **1,416** | 글≥3 & 그림≥3 & 표지200 | 즉시 공개 후보 |
| `candidate_cover_404` | **791** | 글≥3 & 그림≥3 & 표지≠200 | **표지 폴백 코드 후** 공개 |
| `empty_dummy` | **173** | 글0 & 그림≤1 | 공개 제외(영구) |
| `no_text_picture` | **49** | 글0 & 그림≥2 | 공개 제외(이번 범위)·PM 정책 |
| `grey` | **321** | 게이트 미달 경계 | 보류(별도 상태 보존) |
| **합계** | **2,750** | | |

- **공개 가능 모수 = 1,416 + 791 = 2,207권 (80.3%)** — 표지 폴백 1건 구현으로 전체 도달.
- 분류 SSOT = `scripts/scan_asb_quality.py`의 `classify_bucket` 함수. 표지 기준 `cover_ok = (cover_http == "200")`, 200 아니면 전부 cover_404쪽.

**재현 명령**:
```
python scripts/scan_asb_quality.py --all --csv scripts/out/asb_quality_scan.csv
# 그 후 DB의 (source_id, is_active) export CSV와 set 대조
```

---

## 4. 외부 Claude 검수 요청 / 미결정 사항

1. **[핵심] scan 스크립트 커밋 여부** — `scripts/scan_asb_quality.py`가 ADR-0026의 SSOT인데 untracked. 지금 push하면 "Accepted ADR이 미추적 코드를 참조"하는 정합성 공백. **권장: push 전 별도 커밋** `feat(scripts): add ASb quality signal scanner (ADR-0026 SSOT)`. 외부 검수 의견 필요.
2. **`.gitignore`** — `scripts/out/`(CSV 데이터)와 `scripts/**/__pycache__/`가 ignore에 없으면 추후 실수 커밋 위험. ignore 추가 권장.
3. **push 승인** — 현재 ahead 2(문서 2커밋). 외부 검수 통과 시 push. (scan 스크립트 커밋 결정이 먼저.)
4. **dedup 33↔45 (backlog (p))** — ADR-0025 D5는 33권(적재 전 추정), ADR-0026은 45권(적재 후 실측). 12권 차이 원인 규명은 경미 트랙. 결론(정상 누락)은 동일.

---

## 5. 다음 단계 (ADR-0026 범위 밖, 순서)

1. **표지 404 폴백 코드** — `components/book/asb-reader.tsx` 표지면이 cover_http≠200일 때 폴백(표지 스킵 또는 첫 본문 이미지). **791권 공개의 선행 필수.** 별도 코드 트랙(ADR-0025 Amd#6 뷰어 연장선).
2. **공개 전환 SQL** — 검수 후 `candidate_cover_ok` + `candidate_cover_404` → `is_active=true`. PM이 Supabase SQL Editor에서 직접 실행(워커는 DB 미접근). empty_dummy/no_text_picture는 false 유지(삭제 아님).
3. **grey 321 개별 검토** — 베타 후. 필요 시 ADR-0026 Amendment.

---

## 6. 관련 파일

- `docs/adr/0026-asb-quality-filter.md` (Accepted, 커밋됨 efb0044)
- `docs/backlog.md` §7.4 (o)(p) (커밋됨 61e90fb)
- `scripts/scan_asb_quality.py` (신호 스캔, **미커밋**)
- `scripts/out/asb_quality_scan.csv` (2,795행 권별 신호, 로컬)
- `scripts/out/asb_db_reconcile.csv` (2,795행 CSV↔DB 대조, 로컬)
- 참조 ADR: `docs/adr/0025-asb-content-ingestion.md` (특히 D5 dedup, Amd#6 뷰어)
