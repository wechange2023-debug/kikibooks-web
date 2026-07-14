# ADR-0044: 면내 읽기순서 교정 — 좌표 재추출 기반 블록 정렬 + 판별자 사전등록

- 상태: Proposed (구현·튜닝은 다음 단계 — 본 ADR은 설계·정답지 고정)
- 날짜: 2026-07-14
- 관련: ADR-0043(v1 정본 잠정)·scripts/pdf_harvest/golden/order_golden.json(정답지)·
  scripts/pdf_harvest/out_coords_154/(좌표 원료, 미추적·재생성 가능)

## 1. Context

- Prong-2 사람검수(25권 표본)에서 **ORDER 결함이 REVIEW·AUTO 공통 발견**
  (예: AUTO인 dudus-hat·its-my-book·yapo-saves-the-day에서 순서 뒤바뀜) →
  **"AUTO = 무검수 통과" 전제 폐기.**
- marks.json 하이라이트는 단어순서 의존 → 순서가 틀리면 아이 화면에서 하이라이트 붕괴.
- 이 축은 W-NOLAYER 0%(ADR-0042 중단기준 통과)와 **무관한 별개 축** — 자동경로
  폐기 기준이 아니라 교정 단계 추가 사안.

## 2. 원료

- pages.json(v1·v2)에는 좌표가 없다 — v2는 추출 시 계산하고도 저장에서 버림
  (harvest.py:148), v1(pypdf)은 좌표 개념 없음. (2026-07-14 정찰 실측)
- `reextract_coords.py`로 캐시 PDF에서 word bbox+size 재추출 완료:
  `out_coords_154/{slug}.words.json` 154권, 권당 평균 230단어, **네트워크 0**.
- extraction 계보: `pdfplumber extract_words(extra_attrs=["size"])` — 정렬·병합
  없는 원료 그대로.

## 3. 정렬 설계 (다음 단계 구현 대상 — 여기선 명세)

- **블록화**: 근접 word를 줄→블록으로 묶기(y겹침·x간격 임계).
- **블록 읽기순**: 단순 top 정렬 불가(2단 배치 실패 실증: dudus-hat p09 —
  v1·v2 둘 다 오답) → **열(column) 감지** 후 열내 top순, 열간 좌→우.
  임계값은 구현 시 golden으로 튜닝.
- **SPLIT 병합**: 단독대문자+후속소문자 근접(드롭캡 'Y ou') 병합 /
  산포낱글자('j i g g l e')는 size 이상치로 장식 판정.
- **IMG_TEXT/장식 제외**: size 이상치(본문 대비) + 공간이격 판별자.
  이미지 bbox 방식은 무효(전면 배경이미지·벡터텍스트 실증 — 'TINO KUMA'는
  page.images 0개).
- **SFX**: 제거 아님. 블록으로 보존하되 읽기순 배치만 교정
  (골든셋 SFX_POLICY — whats-happened-to-our-water 등은 교정 후 팀장 재검토).

## 4. 검증 사전등록 (★데이터 보기 전 고정 — 사후 합리화 금지)

- **정답지 = `golden/order_golden.json`** (팀장 육안검수 55항목:
  ORDER 32 / SPLIT 13 / SFX 6 / IMG_TEXT 4). 구현 후 교정출력을 golden의
  expected와 자동 채점(면 단위 pass/fail).
- **합격선**: golden **ORDER면 ≥ 90%** 자동교정 일치. 미달 시 규칙 재튜닝 또는
  해당 권 MANUAL(K6). **SPLIT면 ≥ 95%**.
- **무결성**: 위 임계값은 지금 고정. 사후 하향조정은 관측분포 첨부 ADR 개정으로만.
- **한계**: 열감지 실패형·의미적 순서(문법으로만 판별되는 순서)는 자동 미검출
  가능 → 잔여 MANUAL 세트로 분리, 사람 최종.

## 5. 범위

- **AUTO 115 재검증 필요**(표본에서 AUTO 오염 확인됨) — 교정은 **154 전권** 대상.
- 교정 후 전권 재-Prong 표본검수(표본 설계는 교정 구현 후 지시서).
