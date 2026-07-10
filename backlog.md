# Backlog

> 트랙에 배정되지 않은 확인·수리 항목. 항목 추가 시 날짜와 근거 문서를 남긴다.

## 2026-07-10

1. **ALT_DESC·MIXED 6권 — 뷰어 자막이 그림 설명문(img alt)을 나레이션으로 송출 중일 가능성**
   - slug: springloaded(전면 alt) / bathtub-safari / come-back-cat / hippo-wants-to-dance /
     shongololos-shoes / why-is-nita-upside-down (alt 면 일부)
   - 근거: 정본 유형 분류(`docs/recon/2026-07-10-harvest-gate-v2.md`, 분류 근거 =
     dryrun alt-only 면 표 × 정본 해당 면 텍스트 존재). 현행 out/{slug}.json의 alt 병합
     텍스트가 TTS·자막에 그대로 들어갔는지 육안·청취 확인 필요. 코드 수정은 별도 지시.

2. **EMPTY 5권 — 정본 JSON 부재. 54권 코호트 정합성 재확인 필요**
   - slug: hugs-in-the-city / i-can-dress-myself / it-wasnt-me / katiitis-song /
     the-lion-who-wouldnt-try
   - 근거: 49 vs 54 정산(지시서 7 STEP 0-3). 이 중 3권은 OCR 실측으로 서사 텍스트
     보유 확인(W-TEXT — `docs/recon/2026-07-10-ocr-pilot-5books.md`), PDF 레이어
     수확물도 존재(scripts/pdf_harvest/out/) — "무텍스트 5권" 분류 자체의 재검토 대상.

3. **★ [환경 결함] gh 계정 드리프트 — 자동 확인 절차 필요** (2026-07-10 등급 상향)
   - 증상: crspiegel로 전환해도 유지되지 않고 활성 계정이 wechange275-design 등으로
     되돌아감. 2026-07-10 하루 **5회 관측** — 전환 후에도 다음 push 시점마다 재드리프트,
     그중 2회는 push 403 실패로 표면화(전환·재푸시로 복구). 사실상 **매 push 전
     확인·전환이 필수**인 상태.
   - 필요: 세션 시작·push 직전 `gh auth status --active` 자동 확인 절차(수단은 별도 결정).
     드리프트 원인(타 세션/도구의 계정 전환) 규명도 미해결.
