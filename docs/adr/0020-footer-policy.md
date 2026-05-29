# ADR-0020: 키키북스 Commit Footer 0건 정책

**날짜** 2026-05-29
**상태** Accepted
**관련** 자진 신고 #4 · phase-13b CP1~CP6 · phase-13c CP1~CP2 · git log -10 trailers 검증

## 1. 맥락 (Context)

Vercel Hobby plan에서는 Co-Authored-By: 등의 commit trailer가 존재하면 "collaboration 협업"으로 인식하여 team owner 자동 조정을 시도합니다. 이로 인해 다음과 같은 배포 차단 현상이 발생했습니다:

- phase-13b CP3-b(e7ad643) 이후부터 배포 신뢰도 저하
- phase-13b 중반(ffff812부터) footer 0건 정책 임시 운영 시작 → 배포 안정화
- 누적: ffff812 · 58cf4a5 · cd51647 · CP4~CP6 · CP1 = 총 9개 commits 검증(2026-05-29)
- 정책 시작 이전 e7ad643 등 commits는 footer 포함 → 소급 적용 불가(history rewrite 회피 원칙)

## 2. 결정 (Decision)

키키북스 repository의 모든 commit은 다음을 준수합니다:

**D1**: Co-Authored-By: 등 Git trailer 0건 (footer 0건)
**D2**: Vercel Hobby plan 제약 회피 목적
**D3**: commit 메시지는 subject에 `phase-NN CPn:` prefix로 Claude 협업 박제 명시(tracer 보완)
**D4**: 정책 적용 시점 = ffff812(2026-05-13 trigger vercel rebuild) 이후 커밋 박제
**D5**: 소급 적용 0건 (e7ad643 이전 commits는 footer 포함된 그대로 보존)

## 3. 결과 (Consequences)

**긍정**:
- Vercel 배포 차단 0건 (Hobby plan team owner mismatch 회피)
- 배포 안정도 100% 유지(phase-13b 후반~현재)

**부정**:
- AI 협업 메타데이터(Co-Authored-By) 손실 → git trailer로 추적 불가
- 보완: subject prefix `phase-NN CPn:` 박제로 단계별 소유권 표기

## 4. 대안 비교 (Trade-offs)

| 대안 | 장점 | 단점 | 선택 |
|---|---|---|---|
| (a) Footer 유지 + Vercel team 재설정 | AI 협업 메타데이터 보존 | Vercel 설정 변경 필요, 신뢰도 0건 | ✗ |
| (b) Vercel Pro plan 업그레이드($25/월) | 제약 0건, 협업 메타데이터 보존 | 비용 증가 | ✗ (현재 phase) |
| (c) Footer 0건 정책 | Hobby 무료, 배포 안정 | 메타데이터 손실(prefix로 보완) | ✅ 선택 |

## 5. 후속 트리거 (Follow-up Actions)

- **Vercel Pro 업그레이드 시점** (예상: MAU 1,000 또는 DB 400MB): ADR-0020 재검토 → footer 허용 여부 재평가
- **GitHub API 변경**: Co-Authored-By 대체 수단 조사(예: commit message prefix 강화)

## 6. 상호 참조 (References)

- 자진 신고 #4: hotfix/trigger commits footer 4회 누적 관찰 (phase-13b 중반)
- phase-13c CP1: placeholder 정정(c950b2c) footer 0건 검증
- git log trailers 측정(2026-05-29): 최근 10 commits 9건 footer 0건 확인
- ADR-0019: 관리자 시스템 결정 기록 (동일 house style 참조)
