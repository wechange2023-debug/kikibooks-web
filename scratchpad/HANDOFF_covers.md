# HANDOFF — Book Dash 커버 이관 종결 (ADR-0032 STEP 3)

작성: 2026-07-04 · 워커(Claude Code)

## 한 일
- Book Dash 미이관 커버 3권 처리:
  - `little-sock-and-the-tiny-creatures`
  - `maddy-moonas-menagerie`
  - `mrs-penguins-perfect-palace`
- 실제 창고(book-covers 버킷) 키가 orchestrator 신규 id 가 아니라
  **old book_dash UUID**(manifest `target_key`)임을 대조 확인
  (`step3s_check_storage.py`, 읽기전용: 신규 id 파일명 3/3 없음, old-uuid 파일명 3/3 있음).
  - slug → 실존 old-uuid:
    - little-sock-and-the-tiny-creatures → 9c9f4da4-fe46-11e5-86aa-5e5517507c66
    - maddy-moonas-menagerie             → 9c9e7dca-fe46-11e5-86aa-5e5517507c66
    - mrs-penguins-perfect-palace        → 9c9eb7e0-fe46-11e5-86aa-5e5517507c66
- `cover_url` 을 실존 Storage URL 로 갱신 (WHERE 키 = slug, URL 키 = old-uuid).
  SQL 파일: `step3c_update_remaining3.sql`. **팀장이 SQL Editor 에서 실행 완료(2026-07-04)**.
- 종결 검증: **209 storage / 0 기타** 확인.

## 결론
- **ADR-0032 STEP 3 완전 종결.**
- Book Dash 커버 **206 → 209 전량 Supabase Storage 이관 완료**.

## 산출물
- `step3b_verify_remaining3.sql` — 잔여 3권 키 진단(읽기전용)
- `step3s_check_storage.py` — 창고 실물 존재 확인(읽기전용)
- `step3c_update_remaining3.sql` — 3권 cover_url UPDATE(팀장 실행 완료)

## 미결/주의
- step3c 롤백 주석의 원주소 도메인 미확정(bookdash.github.io vs bookdash.org 계열).
  롤백 필요 시 실제 최초 원주소 도메인 재확인 요망.

## 다음 안건
- **v1 html 49권 오디오 배치** (v1 html 54 − 파일럿 1 − 소배치 4).
  비용 발생 → **팀장 승인 + 오케스트레이터 작업지시서 후 착수**. 현재는 미착수.
