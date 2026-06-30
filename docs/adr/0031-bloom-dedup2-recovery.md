# ADR-0031 — Bloom 배치 dedup2 제외분 중 DB매칭 의심 132건 회수

## Status
Accepted

## Context
- Bloom 1차 배치(ADR-0030)에서 title 기반 dedup2(2단)가 411건 제외.
- `scratchpad/bloom_dedup2_excluded.csv` 분석 결과:
  - true-dup(저자 일치) 240건 — 올바른 제외, 유지.
  - 의심 171건 = false-positive 87 + unknown 84.
- 의심 171을 매칭 출처로 재분류:
  - DB 매칭 132건(fp 75 + unknown 57) = 기존 DB에 동일 제목 다른 저자가 있어
    막힌 신규 bloom책. 라이브러리에 없는 새 콘텐츠. 회수 가치 높음.
  - 배치 내 충돌 39건(fp 12 + unknown 27) = bloom끼리 충돌. dedup2가 이미 한 권
    적재했으므로 나머지는 사실상 중복판. 회수 가치 낮음.
- 기존 DB author란에 'StoryWeaver' 등 플랫폼명이 저자로 기록된 케이스가 섞여
  저자 비교 신뢰도가 완전하지 않음 → 자동 확정 적재 부적합, 사람 검수 필요.

## Decision
1. 회수 대상 = CSV에서 classification ∈ {false-positive, unknown} AND
   match_source = db 인 행. (= DB매칭 의심 132건)
2. 회수분은 is_active=false staging으로만 적재. 공개(is_active=true) 전환은
   팀장이 인앱검수 통과분에 한해 별도 SQL로 수행.
3. 진짜중복 240 + 배치내충돌 39(총 279건)는 이번 배치 제외 유지(영구삭제 아님,
   차기 배치 재검토 가능).
4. 최종 staging 적재 규모 = 기존 INSERT 281 + 회수 132 = 413건.
5. 적재 실행 방식: sync_bloom은 Supabase 직접 INSERT를 하지 않고 INSERT SQL
   파일을 산출. 실제 DB 적재는 팀장이 SQL Editor에서 실행(불변 규율).

## Consequences
- 새 콘텐츠 132건 회수로 누락 위험 해소. 진짜중복 240은 검수 부담 없이 차단.
- staging 단계가 검수 게이트 역할. 자동 분류 오류는 인앱검수에서 최종 보정.
- 차기 배치(L3·L4)에서 배치내충돌 39 및 unknown 재평가 가능.
