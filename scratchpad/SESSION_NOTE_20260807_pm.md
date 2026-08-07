## 2026-08-07 오후 세션 종료 메모

### 오늘 완료
- 중복 제거(231권) 검증 통과 — 백업 books_backup_dedup_20260806 231행,
  Book Dash 190 유지, 오디오 보유 중 비활성 0
- 자동 동기화 중단: Sync GDL·Sync Book Dash = disabled_manually
  (Verify Licenses는 active 유지). 복구는 gh workflow enable
  ※ synced_at 최신값 6/15~6/30 → 7월 이후 실제 유입 0건 확인
- ★NC 라이선스 사고 처리: GDL API slug='cc-by-4-0'이나
  h5pFiles 배지가 ccbync*인 199권 발견 → DB 197 / 활성 179 비활성화
  백업 books_backup_nc_20260807 (197행). 오디오 손실 0
- ADR-0055 Proposed 작성 (0055-gdl-license-cross-verification.md)

### 현재 수치 (담당자 수동 검수 진행 중 — 확정값 아님)
활성 1,323 = ASb 527 · GDL 464 · Book Dash 190 · Bloom 142
오디오 보유 172 (활성 161 / 비활성 11)

### 내일 트랙: TTS 전체 생성 + 본문 하이라이트
대상 698권 (GDL 464권 제외 확정)
- ASb asb_native 527
- Bloom asb_native 142
- Book Dash asb_native 24 (151 중 127 완료)
- Book Dash html 5 (39 중 34 완료)

### 미해결 / 이월
- Book Dash 라이선스 상수 부여 문제 (ADR-0055 §4.2, O3)
  → meta.yml에 rights 필드 실재 여부 미확인
- GDL C안(ePub 재수확 → 자체 렌더 전환) 판정 보류. [2-2] 미실행
- 오디오 보유 중 비활성 11권 = 전부 book_dash
  · html 10권: source_id가 UUID 형태(구버전 적재).
    슬러그 재적재로 중복 정리된 것으로 추정
  · asb_native 1권: auntie-bois-gift — 담당자 품질 검수로 내린 것으로
    추정, 복원 여부 미결
- 담당자 수동 검수 종료 후 활성 COUNT 재측정 필요

### 신규 요구사항 (내일 이후 설계)
- 단어카드: 앞면 영문+단어오디오 / 뒤집으면 한글
- 퀴즈: 도서당 3~5문제, 본문 이미지 활용
- 순서 권고: TTS → 단어카드·퀴즈 → 디자인 리뉴얼
