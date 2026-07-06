HelloKiki 재개 메모 — v1 html 49권 오디오 배치 (정찰 종료 시점)

[코호트 확정 — DB 실측이 정답]
- v1 html(book_dash·html) = 54권(전부 활성). 완료 5권. 남은 49권.
- 문서(HANDOFF·ADR-0034)의 "39"는 오기 → 정리 트랙에서 수정 필요(차단 아님).
- 표지 문장 엔티티(&amp; 등) 이슈 0권.

[비용]
- 49권 총 76,363자 / 권당 평균 1,558자.
- Amazon Polly Neural $16/100만자 기준 예상 $1.22. 무료티어 잔여면 실제 $0(최종은 팀장 콘솔).

[배치 착수 전 결정 2건 (미확정)]
1) springloaded: 본문이 <p>가 아니라 이미지 alt에 있음(약 818자). alt를 낭독 원문으로
   쓸지 결정 + 추출 로직에 alt 경로 추가 필요. 반영 시 +818자(비용 거의 불변).
2) 무텍스트 5권(hugs-in-the-city / i-can-dress-myself / it-wasnt-me / katiitis-song /
   the-lion-who-wouldnt-try): 원본에 낭독할 <p>·alt 모두 없음. 표지 문장(~80자)만 가능.
   → 배치서 제외할지 / 다른 소스로 텍스트 보충할지 결정.
- 위 반영 시 실 페이지 낭독 대상 43권(49 − 무텍스트5 − alt결정대기1).

[배치 스펙(확정)]
- Amazon Polly Neural / Ruth / 78% natural. 표지 문장 "{title}. Created by {author}."

[남은 순서]
(2)로컬 out/ 배치 생성 → (3)marks 무결성 전량 검증 → (4)팀장 표본 청취
→ (5)Storage 업로드 → (6)book_audio INSERT·has_audio=true(팀장 SQL) → (7)AsbReader 통합.
※ (5)부터 실변경 → 단계별 승인. (2)착수 전 비용 승인 필요(예상 $1.22).

[산출물] scratchpad/tts_recon_49.py, tts_recon_49.csv, tts_recon_cohort.sql
