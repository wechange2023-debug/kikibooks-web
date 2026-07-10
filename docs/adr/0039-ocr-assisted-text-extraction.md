# ADR-0039 — OCR 초벌 + 사람 검수 기반 텍스트 확보 트랙

## Status
**Proposed** (2026-07-10) — 팀장 결정 I1~I6(작업지시서 2026-07-10 (2)) 반영. 본 문서는 결정 기록만 담고, 코드·DB·Storage 변경은 후속 트랙에서 수행한다.

## 관련
- `docs/recon/2026-07-10-ocr-provenance-and-accuracy.md` — 출처 규명(판정 MENTION)·정확도 실측(판정 O-HIGH)의 원 기록.
- `docs/recon/2026-07-09-bookdash-full-catalog-survey.md` — 모집단 206권·텍스트 원천 48/154 실측.
- `docs/adr/0035-bookdash-self-viewer.md` Amendment #2 — 본 ADR의 bbox를 하이라이트(C안)에 사용.
- `docs/adr/0023-ai-features-and-tts-policy.md` — TTS 정책(OCR "별도 2차 트랙" 언급의 출전).
- `docs/guidelines/license-rules.md` — 라이선스 근거(§D3).

---

## D1. 배경

Book Dash 영어 모집단 206권 중 텍스트 원천(GH Pages HTML → `scripts/tts_pilot/out/{slug}.json`) 보유는 **48권**뿐이다. **154권(실측 2,316페이지)은 텍스트 원천이 없다** — 신규 157권은 GH Pages HTML이 전량 404이고(2026-07-09 전수 HEAD 실측 0/157), 문장이 WP(bookdash.org)판 **이미지에 인쇄(baked-in)**되어 있다. 팀장 결정 H1(전권 서비스)·H2(baked-in 허용) 하에서 이 154권에 자막·오디오를 제공하려면 이미지로부터 텍스트를 확보하는 경로가 필요하다.

## D2. "OCR 금지" 규칙의 부재 (2026-07-10 규명 — 박제)

2026-07-10 레포 전수 grep(`OCR|ocr`, `인페인팅|inpaint(ing)`, `텍스트 제거|text removal|baked`) 결과, **"OCR을 하지 않는다/금지한다"는 결정 기록은 0건**이다. 유일한 언급은 다음 1문장(및 미커밋 메모의 동일 문장)뿐이다:

> `docs/adr/0023-ai-features-and-tts-policy.md:134` — "**대상 코호트**: Book Dash **v1 html 39권**(텍스트 추출 가능 — §1.1). v2 asb_native 206권은 **OCR 별도 2차 트랙**(본 Amendment 범위 외)."

즉 OCR은 **이연(별도 트랙)**으로만 기록되었고 사유는 미명시였다. "OCR 금지"는 근거 문서 없이 작업지시서 문안으로만 존재했던 규칙이며(판정 MENTION), 본 ADR이 이 상태를 종결한다. 인페인팅은 언급조차 0건이었다.

## D3. 라이선스 근거

- Book Dash 적재 라이선스 = **cc-by-4-0** (`scripts/sync_book_dash_v2.py:67`).
- `docs/guidelines/license-rules.md:25`:
  > "| `cc-by-4-0` | ✅ 가능 | ✅ 필수 | ✅ **가능** | Book Dash, GDL 주력 |" (변경/2차 저작물 열 = 가능)
- 같은 문서 §4.4(:137)는 TTS 낭독을 이미 2차 저작물로 허용 전제하고 있다:
  > "HelloKiki가 도서 텍스트로 **배치 사전 생성**하는 낭독 음성(TTS)은 **원본 텍스트의 2차 저작물(derivative)**이다. 따라서 **원본 라이선스 의무를 그대로 승계**한다."
- 이미지에서 텍스트를 추출·별도 표시하는 행위도 동일하게 2차 저작물 범주이며, 어트리뷰션 의무 승계(Hard Rule 1)를 전제로 허용된다. (CC BY 4.0 전문 사본은 로컬에 없음 — 전문 확인 1회 권장, recon 문서 판단 요청 2번.)

## D4. 결정 — OCR 초벌 + 사람 검수

**OCR(tesseract, 로컬·무료)로 초벌 텍스트를 추출하고, 사람이 최종 검수·확정한다.**

- 근거(팀장 결정 I1): 금지 출처 없음(D2) + CC BY 2차 저작물 허용(D3) + 대조군 단어 정확도 97.82%(D7).
- **OCR 출력은 절대 무검수로 TTS·서비스에 투입하지 않는다.** 검수 확정본만이 TTS 입력·뷰어 렌더 텍스트가 될 수 있다.
- 유료 OCR API는 사용하지 않는다(로컬 tesseract만 — 파일럿 기준 5.4.0/eng).
- 파일럿 5권 → 문제 없으면 전권 확대(팀장 결정 I4). 검수 도구 요구사항은 `docs/intent/ocr-review-tool-requirements.md`(I6 — 도출만, 구현 별도).

## D5. bbox 좌표 저장

OCR 시 **word 레벨 bounding box(left/top/width/height) + confidence를 텍스트와 함께 보존**한다(팀장 결정 I3).

- 용도 ①: **이미지 내 인쇄 텍스트 위 좌표 하이라이트(C안)** — ADR-0035 Amd#2 E2의 좌표 소스.
- 용도 ②: **재추출 비용 회피** — 검수 단계에서 텍스트만 고치고 좌표는 재사용, 향후 필요 시 재OCR 불필요.
- 저장 위치: `scripts/ocr_pilot/out/{slug}.ocr.json` (파일럿 산출 스키마 — 확정 스키마는 검수 도구 트랙에서).

## D6. 인페인팅 불채택 — "금지"가 아니라 "현시점 불필요"

이미지에서 글자를 지우는 **인페인팅은 채택하지 않는다**. 사유: 팀장 결정 **H2로 텍스트 인쇄 이미지를 그대로 서비스하기로 결정했으므로 지울 필요 자체가 없다**. 이것은 근거 없는 금지 규칙이 아니라 **필요가 소멸한 데 따른 불채택**이며, 전제(H2)가 바뀌면 재검토할 수 있다.

## D7. 정확도 근거 (a-tiny-seed 12페이지 실측, 2026-07-10)

WP판(baked-in) 12장 vs 정답 텍스트(`out/a-tiny-seed.json`): **단어 정확도 97.82%** (412단어 중 오류 9), 완전 일치 8/12페이지. 오류 분류:

| 분류 | 건수 | 내용 |
|---|---|---|
| 실제 오독(치환) | **1** | p10 `Wangari's` → `Wangariss` (아포스트로피 오독) |
| 삽화 노이즈(삽입) | **8** | p02 `®` / p08 `es`,`ow`,`\iQ`,`Fer'`,`VAI` / p12 `a`,`oe` |
| 본문 누락(삭제) | 0 | — |

상세 페이지별 표: `docs/recon/2026-07-10-ocr-provenance-and-accuracy.md` STEP 3.

## D8. Known Issue — 삽화 노이즈

일러스트 영역이 글자로 오인되어 노이즈 단어(`\iQ`, `VAI`, `®` 등)가 **텍스트에 삽입**된다(D7 오류 9건 중 8건). 이 노이즈는 **검수 단계에서 사람이 제거해야 한다**. confidence 임계 필터로 자동 억제할 여지가 있으나 임계값 설정은 파일럿 데이터 기반의 후속 결정 사항이다.

---

*ADR-0039 끝.*
