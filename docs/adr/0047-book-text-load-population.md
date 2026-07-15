# ADR-0047: book_text 적재 대상 확정 — 152권 (population 154 − 게이트① 탈락 2)

## Status
Proposed (2026-07-15) / 기준 HEAD 93ce82d

## Context

- 전수 정합 (A-3b 팀장 DB 실측 + A-3c 정찰):
  ```
  WP 카탈로그 206  = DUP skip 49 + v2 적재 155 + 게이트① skip 2
  books slug 코호트 155 = population 겹침 152 + drift 3(is_active=false)
  population_154        = 206 − 49 − drift 3 = 154
  154 − 152 = 2 (= 게이트① 탈락 2권)
  → 미설명 잔여 0권. 모든 행이 문서화된 규칙으로 설명됨.
  ```
- Q1~Q4 실측(`scratchpad/a3_slug_reconcile.sql` 팀장 실행): Q1 결손 2행 / Q2 잉여 3행 / Q3 0행 / Q4 매칭 152.

## Decision

### D1. book_text 적재 대상 = 152권 (population_154 ∩ books slug 코호트)으로 확정
- 게이트①(본문 ≤1장 skip)은 2026-06-23 문서화된 **사전 기준**이며(`docs/handoff/2026-06-23-bookdash-scheme-b-gates.md`), 후보 157권 전원에 균일 적용되어 2권만 탈락시켰다(`scripts/sync_book_dash_v2.py:669-675`, 로그 `scratchpad/bookdash_dryrun_full.txt:227, 231`).
- 152는 결과를 보고 정한 숫자가 아니라 **사전 게이트가 산출한 숫자**다 — ADR-0042 무결성 조항(사후 합리화 금지)에 저촉되지 않는다.

### D2. 결손 2권(mogaus-gift, the-baby-book)은 이번 트랙에서 제외하고 백로그로 이관
- 두 권은 PDF 텍스트 수확은 성공(`out_fixed_154` 실재, the-baby-book 14p/37,794B)했으나 WP scheme B 이미지가 `body_pages=1`이다.
- 자체 뷰어(Phase D)는 페이지 이미지가 전제이므로, 텍스트만 적재해도 노출 경로가 없다. **이미지 확보가 선행 조건**이다.

### D3. drift 3권은 본 트랙 대상이 아니다
- 구→신 slug 변경분으로 제외 52에 포함(`docs/adr/0042-...md:21-22`, `docs/recon/2026-07-09-bookdash-full-catalog-survey.md:32-35`).
- books에 존재하나 확정 텍스트가 없고(`out_fixed_154`에 부재), `is_active=false`다.
- 점등 여부는 별개 안건(계획서 §11).

### D4. population_154.txt는 수정하지 않는다
- "텍스트 수확 집합"으로서 154는 규칙상 정확하다. 적재 집합 152와 다른 것은 오류가 아니라 트랙(텍스트 수확 ↔ 이미지 sync) 간 대상 차이다.
- 적재 스크립트가 books 조인 결과로 152를 산출하게 하고, **파일 숫자를 손대지 않는다**.

## Consequences

- **얻는 것**: 적재 대상이 사전 게이트 산출값 152로 확정돼 사후 합리화 없이 진행 가능. 미설명 잔여 0권으로 데이터 정합이 감사 가능.
- **잃는 것**: 결손 2권은 이번 트랙에서 노출 불가(백로그). drift 3권도 대상 외로 남는다.
- **되돌리기**: 2권은 books 선적재만 되면 동일 스크립트로 추가 적재 가능(스키마 변경 불요).

## Non-goals

- 결손 2권의 이미지 확보 방법 / drift 3권 점등 / 게이트① 재설계.

## Open (팀장 확인)

- 없음.
