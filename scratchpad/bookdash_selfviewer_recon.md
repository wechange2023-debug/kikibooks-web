# Book Dash 자체 뷰어 타당성 정찰 — 페이지 이미지+텍스트 추출 가능성

작성일 2026-07-08 · 정찰 전용(DB 쓰기·적재·이미지 다운로드·push 없음). curl로 HTML 구조 읽기까지만.
표본 2권: **a-beautiful-day**(본문 12면), **a-dancers-tale**(img 13). 근거는 실측 curl/파일만.

---

## 1) 원본 HTML 구조 확인

- content_url = `https://bookdash.github.io/bookdash-books/{slug}/en/` (GH Pages, 정적 HTML ~5KB).
- **한 면(장면)의 마크업**(a-beautiful-day 실측):
  ```html
  <div id="wrapper"> … <h1>제목</h1>
    <p><img src="images/01.jpg" alt="Mom and baby greet Nicholas …" /></p>   ← 장면 경계
    <p>“What a beautiful day,” says Mom. “Wake up Nicholas.”</p>              ← 그 면 텍스트
    <p>“Hello sun,” says Nicholas. “Good morning birds.”</p>
    <p><img src="images/02.jpg" alt="…" /></p>                                ← 다음 장면
    …
  <blockquote class="copyright-text"> …                                       ← 어트리뷰션 경계(본문 제외)
  ```
  - **페이지 이미지**: `<p><img>`로 표현. **src = 상대경로 `images/NN.jpg`**(01.jpg…). alt 텍스트도 보유.
  - **텍스트**: `<p>…</p>`(이미지 아닌 p). 커브따옴표(“”) 포함 원문.
  - **어트리뷰션 경계**: `<blockquote class="copyright-text">` — 두 표본 모두 존재(본문/저작권 분리 마커).
- **이미지 직접 접근성(HEAD 실측)**: `.../images/01.jpg` → **HTTP 200, `image/jpeg`, 119,175B**. a-dancers-tale도 200 image/jpeg. → GH Pages 이미지 **외부 직링크(핫링크) 성립**.
- **텍스트 출처 검증됨**: `scripts/tts_pilot/extract_text.py`가 **바로 이 구조를 이미 파싱**한다 — `isolate_body`(wrapper~copyright-text 절단) → `extract_scenes`(`<p><img>` 경계로 장면 분리, image_url 절대화 + `<p>`텍스트 누적). 이 스크립트 산출물로 44권 오디오를 생성했으므로 **텍스트·이미지 추출 경로는 이미 실증 완료**. 자체 뷰어는 동일 파서를 재사용 가능.

## 2) 페이지-이미지-텍스트-marks 정합성

- **표본 a-beautiful-day 실측 대조**:
  - 이미지 장면(scenes): **12면**(images/01~12.jpg).
  - 텍스트 있는 면: **10면** (page 4·12는 `text=""` = 이미지만 면).
  - 생성된 오디오 pNN(Ruth_r78): **10개** — `p1,p2,p3,p5,p6,p7,p8,p9,p10,p11`. **p4·p12 없음**(텍스트 없는 면은 오디오 미생성).
  - → **정렬 규칙: 이미지 N(12) ≥ 텍스트 M(10) = 오디오 M(10).** ⚠️ **이미지:오디오는 1:1이 아니다.** pNN 번호는 **장면 page 번호를 그대로 따르고**(텍스트 없는 면에서 번호가 비는 gap 방식, 재번호 없음) → 오디오 트랙을 장면 번호로 직접 매핑 가능.
- **marks value ↔ 원본 페이지 텍스트 일치(1권 확인)**:
  - `a-beautiful-day_p1_Ruth_r78.marks.json` value 이어붙임: `What a beautiful day says Mom Wake up Nicholas Hello sun says Nicholas Good morning birds`
  - 원본 page1 텍스트: `“What a beautiful day,” says Mom. “Wake up Nicholas.” “Hello sun,” says Nicholas. “Good morning birds.”`
  - → **단어 시퀀스 완전 일치**(marks는 구두점·따옴표 제거된 단어 토큰). 하이라이트용 단어 정렬 성립.
  - ⚠️ 단, marks의 `start/end`(char offset)는 **Polly에 입력된 문자열 기준**이다(p1 첫 단어 "What"의 start=3 → 원본 커브따옴표+공백 등 선행문자 존재 암시). 자체 뷰어가 실제 렌더하는 문자열과 offset 원점이 같은지는 **설계 단계에서 반드시 확정**(offset로 span 자르기 vs value 매칭으로 자르기 중 택1).

## 3) 이미지 확보 방식 (제안만, 실행 금지)

| 후보 | 장점 | 단점 |
|---|---|---|
| **A. 원본 URL 직접 핫링크**(`bookdash.github.io/.../images/NN.jpg`) | 복사·저장비용 0, 즉시 사용, 파이프라인 불요 | 외부(GH Pages) 가용성·정책에 종속(깨지면 뷰어 손상), 우리 통제 밖 |
| **B. Supabase Storage로 복사** | 가용성·CDN을 우리 통제(오디오와 같은 창고 일원화), 외부 종속 제거 | 복사 파이프라인·저장비용 발생, 라이선스 어트리뷰션 유지 의무 |

- **ADR-0027 대조**: ADR-0027(Proposed)은 Book Dash **신간 152권**을 **CloudFront `.jpg`** 이미지 시퀀스 + `asb_native` 매니페스트로 적재하는 설계. 이번 표본은 **기존 54권**의 **GH Pages `.jpg`** 이미지.
  - **호환**: "외부 `.jpg` 이미지 시퀀스를 `asb_native`(또는 유사 이미지-시퀀스 렌더)로 그린다"는 골격이 동일. ADR-0027 D2의 **parser `.jpg` 필터 확장**(asb-parser.ts:114)이 GH Pages `.jpg`에도 그대로 적용 가능.
  - **차이**: (a)이미지 호스트(CloudFront vs GH Pages), (b)텍스트 층 — 신간은 "텍스트가 이미지에 인쇄"(별도 텍스트 레이어 없음)라 가정, **기존 54권은 `<p>` 본문 텍스트가 실재**(하이라이트 대상 O) → 자체 뷰어가 이미지+텍스트+marks를 함께 다뤄야 함.

---

## 자체 뷰어 추출 가능/불가능/조건부 — 한 줄 판정

**조건부 가능.** 페이지 이미지(`images/NN.jpg`, HTTP 200 핫링크)·텍스트(`<p>`)·marks 추출은 `extract_text.py`로 이미 실증됐고 단어 시퀀스도 marks와 정렬된다 — 다만 (a)이미지:텍스트가 1:1이 아니어서(텍스트 없는 이미지-only 면 존재) 뷰어가 텍스트 유무 면을 구분 렌더해야 하고, (b)marks char-offset 원점이 렌더 문자열과 일치하는지 확정해야 하며, (c)이미지 확보 방식(핫링크 A vs 창고 복사 B)을 ADR에서 결정해야 성립한다.
