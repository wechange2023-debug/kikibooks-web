# 인수인계 — ADR-0035 book_dash 자체 뷰어 Accepted (2026-07-08 세션 종료)

> 다음 워커(Claude Code) 세션의 상태 복원용 재개 메모.

## 세션 요약

- **book_dash 자체 뷰어 전환 결정**: iframe(cross-origin, `bookdash.github.io`) 폐기 → 우리 출처에서 이미지+텍스트 직접 렌더로 전환. same-origin policy로 iframe 내부 자막 하이라이트가 원천 불가한 것이 전환 근거.
- **ADR-0035 Accepted** 확정(2026-07-08). 커밋 `707cfdb`.
  - 설계 근거: 정찰 3건(`scratchpad/asbreader_audio_recon.md`, `scratchpad/bookdash_selfviewer_recon.md`) — 커밋 `1efa790`에 보존.
  - 핵심 결정: D1 자체 뷰어 전환 / D2 면(face) 모델(그림+텍스트+오디오 면 vs 그림만 면, 이미지:오디오 ≠ 1:1) / D3 이미지 창고 복사(방식 B, 핫링크 기각) / D4 형광펜 정렬(marks offset = 렌더 텍스트 단일 진실원) / D5 오디오 재생(표지+본문 순차 플레이리스트) / D6 `getBookById` `has_audio` 추가 + 뷰어까지 `source_platform`·`source_id`·`has_audio` 전달.

## 현재 지점

- HEAD = **707cfdb**, origin/main 동기, working tree clean(로컬 잔여 `.claude/settings.local.json`·`scripts/tts_pilot/HANDOFF.md` 제외).
- 최근 커밋 흐름: `1efa790`(ADR-0035 Proposed + 정찰 3건) → `707cfdb`(Accepted 전환).

## 다음 세션 첫 안건

1. **이미지 창고 복사 스키마·버킷 확정** (ADR-0035 D3) — 버킷명·키 규칙(`{source_platform}-{source_id}/NN.jpg` 제안형) 확정. 스키마/버킷 변경이므로 ADR 선행 필수.
2. **`getBookById` `has_audio` 추가** (D6) — SELECT + Book 인터페이스 + 뷰어 prop threading(`source_platform`·`source_id`·`has_audio`).
3. **자체 뷰어 구현** — 면 렌더(D2)·오디오 재생(D5)·형광펜(D4). 구현 필수 게이트 G1(marks offset 정렬 실검증)·G2(면 종류 판별)·G3(어트리뷰션 유지)·G4(경로 조립 200).

### 권장 순서
**이미지 스키마 정찰/ADR 먼저**(되돌리기 어려운 저장 구조 결정) → 그 다음 뷰어 구현. D6(has_audio)는 뷰어 구현과 함께 진행 가능.

## 미해결/참고

- **무텍스트 제외 권수 5 vs 6 불일치**: 핸드오프 `2026-07-07-...L7`은 "무텍스트 5", 커밋 `4ccd920`은 "무텍스트 이슈 6권". 코호트 **54**·최종 오디오 **44**는 양쪽 일치. ADR-0035 §5는 54(코호트 전체)·44(오디오 대상) 구분 주석 반영 완료. 5 vs 6은 팀장 DB 확인 시 정리 권장(제공 SELECT: `books WHERE source_platform='book_dash' AND content_type='html'` 그룹 카운트).
- **ADR-0027 통합 여부**: ADR-0027(신간 152권 CloudFront 이미지 시퀀스, Proposed)과 본 ADR-0035(기존 54권 GH Pages)의 골격이 호환 — 향후 하나의 이미지-시퀀스 뷰어 트랙으로 통합할지 판단 필요.
- **step3c 3권 UUID/슬러그 불일치**: 직전 TTS 트랙에서 기록된 미해결 항목(핸드오프 `2026-07-07` 참조).
