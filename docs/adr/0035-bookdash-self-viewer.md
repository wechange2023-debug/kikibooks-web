# ADR-0035 — Book Dash 자체 뷰어 전환 (iframe 폐기 · 이미지+텍스트 직접 렌더 · 자막 하이라이트)

## Status
Accepted (2026-07-08). 본 문서는 설계 확정만 담고, 코드·DB·이미지 복사·적재는 후속 트랙에서 수행한다.

## 관련
- `docs/adr/0017-book-reader-architecture.md`(뷰어 아키텍처 — HtmlReader iframe 단일 경로 D1. 본 ADR이 book_dash 도서군에서 이를 대체).
- `docs/adr/0034-tts-audio-storage-implementation.md`(book_audio 테이블·book-audio 버킷·경로 키. 재생 URL·audio_path 규칙의 상위 근거).
- `docs/adr/0025-asb-content-ingestion.md`(`asb_native` 자체 렌더·`parseAsbText`·Amd#6 면 구성 — 이미지-only 면 정상 처리 선례).
- `docs/adr/0027-bookdash-152-image-sequence.md`(Proposed — 신간 152권 이미지 시퀀스 적재. 본 ADR과 골격 호환, §5에서 대조).
- `docs/adr/0032-bookdash-cover-storage-migration.md`(book-covers 버킷·키 컨벤션 선례 — 이미지 창고 복사 경로 참고).
- `docs/adr/0023-ai-features-and-tts-policy.md` Amd#1(TTS 산출물 저장 위치 = Supabase Storage).
- 정찰 메모(근거 자료, 미커밋): `scratchpad/asbreader_audio_recon.md`, `scratchpad/bookdash_selfviewer_recon.md`.

---

## 1. 맥락 (Context)

정찰 3건(2026-07-08, 읽기 전용)으로 확정된 사실만 기술한다.

- **기존 렌더 경로**: book_dash 도서는 `content_type='html'`이며 `components/book/html-reader.tsx`가 외부 도메인(`bookdash.github.io`) 페이지를 **cross-origin iframe**으로 임베드한다(`sandbox="allow-scripts allow-same-origin"`, src = `book.content_url`). `allow-same-origin`은 iframe 자기 출처 기준이라 **부모(키키북스 출처)가 iframe 내부 텍스트 노드에 접근 불가** → 자막 하이라이트(형광펜) 원천 불가.
- **요구**: 모든 book_dash 도서에 **오디오 재생 + 자막 하이라이트**가 되어야 한다. 서비스 대상은 **사람이 선별한 소수 정예** book_dash 도서로 한정한다.
- **실증(정찰 실측)**:
  - `scripts/tts_pilot/extract_text.py`가 원본 GH Pages HTML(`<div id="wrapper">` → `<p><img src="images/NN.jpg" alt="…"></p>`(장면 경계) + `<p>텍스트</p>` → `<blockquote class="copyright-text">`(어트리뷰션 경계)) 구조를 이미 파싱해 44권 오디오를 생성했다. → **이미지·텍스트 추출 경로 실증 완료**.
  - 페이지 이미지 `.../images/01.jpg` 직접 접근 = **HTTP 200, `image/jpeg`, 119,175B**(핫링크 성립).
  - marks value 이어붙임(`a-beautiful-day` p1) = 원본 page1 텍스트와 **단어 시퀀스 완전 일치**(구두점만 제거).
  - 오디오 메타(`has_audio`)·`source_id`·`source_platform`이 현재 `getBookById` SELECT 및 뷰어 props로 **미전달**(정찰 확인).

---

## 2. 결정 (Decision)

### D1 — 자체 뷰어 전환
book_dash 도서를 **자체 뷰어**(우리 출처에서 이미지+텍스트를 직접 렌더)로 전환한다. 기존 iframe 경로(HtmlReader)는 이 도서군에서 **전환 완료 후 폐기 예정**이다(전환 전까지 병존).

### D2 — 페이지 모델: '면(face)' 배열
한 도서는 **면(face)의 배열**이다. 각 면은 두 종류다.
- **그림+텍스트+오디오 면**: 이미지 1장 + 본문 텍스트 + 오디오(pNN) + marks.
- **그림만 면**: 이미지 1장만(텍스트·오디오·형광펜 없음).

정찰 실측(`a-beautiful-day`): **이미지 12면 ≥ 텍스트 10면 = 오디오 10개**. 즉 **이미지:오디오는 1:1이 아니며**, pNN은 **장면 번호를 그대로 따르는 gap 방식**(텍스트 없는 면에서 번호가 비고 재번호하지 않음. 예: p4·p12 없음)이다.

뷰어는 **면 종류를 구분해 렌더**하고, **오디오·형광펜은 텍스트 있는 면에만** 붙인다. 면 종류 판별 로직은 구현 단계 필수 항목(§4)이다.

### D3 — 이미지 확보 = 창고 복사(방식 B)
원본 `images/NN.jpg`를 **Supabase Storage로 복사**해 우리 출처에서 제공한다. 핫링크(방식 A)는 **채택하지 않는다**(외부 GH Pages 종속 회피).
- **라이선스**: book_dash = CC BY 4.0 → **어트리뷰션 유지 시 재배포 허용**. 창고 복사는 재배포에 해당하나 라이선스상 허용된다. 어트리뷰션 박스는 자체 뷰어에서도 **100% 유지**(Hard Rule 1·license-rules §4.2).
- **저장 위치·경로 키(제안형)**: 이미지 버킷 및 키 `{source_platform}-{source_id}/NN.jpg`(오디오 `book_dash-{source_id}/pNN.mp3` 규칙과 대칭, ADR-0034 정합). **실제 버킷·스키마 확정은 후속 구현 ADR 또는 본 ADR의 Amendment에서** 다룬다(이번 문서는 제안형).

### D4 — 자막 하이라이트(형광펜) 정렬 원칙 ⚠️ 가장 중요
marks의 `start/end` char-offset은 **Polly 입력 문자열 기준**이다. 뷰어가 화면에 그리는 본문 문자열이 이와 다르면 하이라이트가 어긋난다. 따라서:
- **원칙**: "오디오/marks 생성에 사용한 바로 그 텍스트"를 뷰어 렌더의 **단일 진실원(single source of truth)**으로 삼는다. marks를 만든 텍스트와 화면에 그리는 텍스트를 **동일 문자열**로 맞춘다.
- 이를 위해 텍스트를 **char-offset으로 분해해 `<span>`으로 렌더**하고, marks의 `time` → 해당 span에 하이라이트를 입힌다.
- `parseAsbText`의 `normalizePageText`(`@ @`→개행·공백 축약·trim, `lib/book/asb-parser.ts:58~63`) 등 **렌더 전 텍스트 변형이 offset을 깨뜨리지 않도록**, (a)변형 후 문자열 기준으로 marks를 재생성하거나 (b)변형을 렌더 경로에서 제거한다. **이 정렬 실검증은 구현 단계 필수 게이트**(§4).

### D5 — 오디오 재생
재생 URL = `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/book-audio/{audio_path}` 형식. `audio_path`는 장부(`book_audio`)에 저장된 `book_dash-{source_id}/pNN.mp3`를 사용한다(버킷명 `book-audio`는 뷰어가 조립 시 붙임 — ADR-0034 접두사 중복 방지 정합).
- 면 이동 시 해당 면의 pNN 오디오를 재생하고, **표지 + 본문 순차 재생(플레이리스트)**을 지원한다(팀장 결정: 표지+본문 전체 순차 재생).

### D6 — 데이터 전달
`getBookById`(`lib/book/detail.ts`) SELECT에 **`has_audio` 추가** + 자체 뷰어까지 **`source_platform`·`source_id`·`has_audio` 전달**(현재 미전달 — 정찰 확인). 뷰어는 이 값으로 오디오·이미지 경로를 조립한다.

---

## 3. 결과 (Consequences)

- **긍정**: iframe 탈피로 형광펜·페이지별 오디오·완독 판정을 **우리가 통제**. 44권 오디오·marks 자산 **재사용**. 외부 도메인 종속 제거.
- **비용/부담**: 이미지 창고 복사 파이프라인 필요, 저장비 소폭. 자체 뷰어 신규 구현.
- **범위**: 서비스가 **소수 정예**이므로 총량 감당 가능. 대상 도서 목록은 사람이 선별(별도 트랙).
- **미해결/후속**:
  1. 이미지 복사 스키마·버킷 확정(구현 ADR 또는 Amendment).
  2. marks offset 정렬 실검증(D4 게이트).
  3. 면 종류 판별 로직(D2).
  4. 선별 도서 목록 확정(별도 트랙).

---

## 4. 구현 단계 필수 검증 항목 (Non-negotiable gates)

- **G1 (D4 정렬)**: marks char-offset 원점 = 뷰어 렌더 문자열임을 표본 1권 이상으로 실검증(단어 경계에서 하이라이트가 정확히 붙는지). 실패 시 구현 중단.
- **G2 (D2 면 종류)**: 이미지-only 면과 텍스트 면을 구분 렌더하고, 텍스트 없는 면에 오디오·형광펜을 붙이지 않음을 확인.
- **G3 (라이선스)**: 자체 뷰어에 AttributionBox 존재 + `attribution_text` NOT NULL 유지(Hard Rule 1, claude.md §7 라이선스 감사).
- **G4 (경로 조립)**: 재생 URL·이미지 URL이 D5·D3 규칙대로 조립됨을 실 파일 200으로 확인.

---

## 5. 기각안 (Alternatives considered)

- **A안 — iframe 유지 + 소리만**: 부모가 iframe 내부 텍스트에 접근 불가(§1) → **형광펜 요구 불충족으로 기각**.
- **방식 A — 이미지 핫링크**(`bookdash.github.io/.../images/NN.jpg` 직참조): 복사·저장비 0이나 외부 GH Pages 가용성·정책에 종속 → **외부 종속으로 기각**(D3).

### ADR-0027 대조
ADR-0027(Proposed)은 book_dash **신간 152권**을 **CloudFront `.jpg`** 이미지 시퀀스 + `asb_native` 매니페스트로 적재한다. 본 ADR은 **기존 54권 코호트**(= `source_platform='book_dash' AND content_type='html'` 전체. 이 중 오디오 생성 대상은 텍스트 있는 **44권** — 코호트 54 − 완료 5 − 무텍스트 5 = 44, §1 "44권 오디오"와 세는 대상이 다름. 근거: `docs/handoff/2026-07-07-tts-v1-html-44-audio.md` L7)의 **GH Pages `.jpg`** 이미지를 대상으로 한다.
- **호환**: "외부 `.jpg` 이미지 시퀀스를 자체 뷰어로 그린다"는 골격이 동일. ADR-0027 D2의 parser `.jpg` 필터 확장(`asb-parser.ts:114`)이 GH Pages `.jpg`에도 적용 가능.
- **차이**: (a)이미지 호스트(CloudFront vs GH Pages), (b)텍스트 층 — 신간은 "텍스트가 이미지에 인쇄"(텍스트 레이어 없음) 가정, **기존 54권 코호트 중 텍스트 있는 44권은 `<p>` 본문 텍스트 실재**(형광펜 대상 O. 무텍스트 면·무텍스트 책은 그림만 렌더 — D2). 본 ADR은 이 텍스트 층 + marks 정렬(D4)을 추가로 다룬다.

---

## Amendment #1 (2026-07-09) — 렌더링 방식 확정(A안)·이미지 전제 명시·면 모델 정정 [⚠️ **Amd#2로 대체**(A1·A2·A3 개정, A2 무효). A4·A5·A6은 유효 유지]

근거 정찰: `docs/recon/2026-07-09-viewer-architecture-evidence.md`(버킷 39권 전수 무텍스트 실측·좌표
원천 부재 판정 C-PART), `docs/recon/2026-07-09-ghpages-and-viewer-decision.md`(원본 레이아웃·GH 결손
재확인), `docs/recon/2026-07-09-recovery-dryrun-and-audio-alignment.md`(pNN 정렬 ALIGN 5/5).

### A1 — 렌더링 방식 = A안: 무텍스트 이미지 + 우리가 렌더한 텍스트(형광펜 레이어)

본문 D2가 미규정으로 남긴 텍스트 배치를 확정한다. **텍스트는 이미지 위에 겹치지 않고, 이미지
아래 별도 영역에 흐름(flow)으로 렌더한다** — 원본 GH Pages 레이아웃과 동일(2026-07-09 실측:
`<p><img …NN.jpg></p>` 다음에 `<p>본문</p>` 문단이 이어지는 순수 플로우 DOM. `web.css` 실측
`#wrapper{max-width:40em;margin:auto}`, `p{margin:0;text-indent:1em}`, `img{max-width:100%;
max-height:50vh}` — 콘텐츠에 position:absolute/overlay 0건, 텍스트 배경색 별도 지정 없음(흰 바탕)).
"오버레이"는 이미지 픽셀 위 겹침이 아니라 **이미지와 분리된 우리 소유 텍스트 레이어**를 뜻한다.

### A2 — 이미지 전제: 서비스 대상 이미지는 무텍스트다

- 근거: 2026-07-09 `book-images` 버킷 **39권 전수 실측 — 무텍스트 39 / baked-in 0 / 애매 0**
  (에지 밀도 지표 + 상위 3권 육안 교차).
- 예외: WP(bookdash.org) 재확보분은 본문 텍스트가 이미지에 인쇄(baked-in)되어 **A안 부적합**.
  결손 15권의 GH Pages 무텍스트 본문은 **0/15 생존**(2026-07-09 HEAD 재확인, 판정 I — 표지만
  10권 200, 본문 01.jpg부터 전멸) → **결손 15권은 A안 코호트에 편입 불가**(처분: ADR-0036 Amd#2).

### A3 — 하이라이트 데이터 소스: 좌표 미사용, marks(time+char offset)만 사용

- 단어별 화면 좌표(bounding box)는 **사용하지 않는다**(원천 자체가 없음 — 원본은 좌표 없는 플로우
  HTML + 래스터 JPEG, 2026-07-09 판정 C-PART).
- 하이라이트 = 우리가 렌더한 `<span>`에 `out/audio/{slug}_p{N}*.marks.json`의
  `time`(단어 **시작** ms) + `start/end`(char offset)를 매핑(D4 원칙 그대로).
- **단어 종료 시각 필드는 marks에 없다**(Polly word mark 사양) — 종료 경계는 **다음 마크의 time**
  에서 유도한다(마지막 단어는 오디오 길이로 폴백).

### A4 — 면(face) 모델 정정: 2종이 아니라 3종(body / alt / empty)

본문 D2의 "면 2종" 모델을 정정한다. 실제 taxonomy는 **body(본문 텍스트) / alt(img alt 폴백 텍스트)
/ empty(둘 다 없음)** 3종이다(ADR-0036 §5-2). alt 면은 추출 단계에서 alt가 text로 병합되므로
뷰어 입장에서는 body와 동일하게 텍스트·오디오·형광펜 대상이다.
**empty 면은 오디오가 없는 것이 정상이다** — 뷰어는 이를 로딩 실패로 처리하지 말 것.
근거 실측: a-beautiful-day p4·p12, a-house-for-mouse p10(empty 면 = mp3 정확히 부재, 그 외
불일치 0건 — 2026-07-09 5권 3소스 대조 ALIGN).

### A5 — "빈 면 = pNN gap" 전제 폐기

본문 D2의 gap 서술("텍스트 없는 면에서 번호가 비고 재번호하지 않음")을 **일반 전제로 삼지 않는다**.
ADR-0036 §5-1 판정을 인용한다: "현 배치의 오디오 pNN gap은 **추출 버전 drift 산물**로,
a-beautiful-day(page 4·12)·a-house-for-mouse(page 10) 2권만 잔존… 진짜 '그림만 면'(본문·alt 모두
없음)은 무텍스트 5권뿐". 번호 체계 자체(pNN = 실제 장면 번호, 재번호 없음)는 유효하며
2026-07-09 ALIGN 5/5로 재검증됨 — 폐기되는 것은 "빈 면이 일반적으로 존재한다"는 가정이다.

### A6 — 뷰어 전제 조건: has_audio가 아직 SELECT되지 않음

`getBookById`의 SELECT(`lib/book/detail.ts:126`)에 **has_audio가 없음**(2026-07-09 원문 확인 —
source_platform·source_id는 포함, has_audio만 부재). D6 구현(SELECT 추가 + 뷰어 전달)이
본 Amendment 적용의 전제 조건이다. (DB에는 has_audio=true 44권이 팀장 SQL로 반영된 기록 —
`scratchpad/step8_book_audio_insert.sql:639`.)

---

## Amendment #2 (2026-07-10) — 하이라이트 방식 C안 전환·A2 무효 [**Proposed** — 팀장 승인 대기]

> ⚠️ **Amd#3 참조**: 본 Amendment의 **E1(C안 전환)·E2(bbox 좌표 소스)는 팀장 결정 K1로
> 무효 처리**되었다(Amd#3 F1). E3(이미지 소스 쟁점)·E4(A2 무효)는 유효 유지.

근거: 팀장 결정 I1~I3(작업지시서 2026-07-10 (2)) + `docs/adr/0039-ocr-assisted-text-extraction.md`
(OCR 초벌 트랙, bbox 저장) + `docs/recon/2026-07-09-bookdash-full-catalog-survey.md`(모집단 206
= GH 무텍스트 39 / WP baked-in 167). **Amd#1의 A1·A2·A3을 개정한다. A4(면 3종)·A5(gap 전제
폐기)·A6(has_audio 전제)은 그대로 유효하다.**

### E1 — 하이라이트 방식 변경: A안 → C안

Amd#1 A1의 A안(이미지 아래 분리 텍스트 레이어)을 **C안(이미지 내 인쇄 텍스트 위 좌표
하이라이트)**로 변경한다(팀장 결정 I2). 팀장 결정 H1·H2(전권 서비스·baked-in 허용)로 서비스
모집단의 다수(167/206)가 텍스트 인쇄(WP판) 이미지가 되면서, 하이라이트의 최선안이 "분리 텍스트
레이어"에서 "인쇄 텍스트 자체 위의 좌표 하이라이트"로 이동했다.

### E2 — 데이터 소스: 좌표 = OCR bbox, 타이밍 = marks.json

- **좌표 소스**: OCR word 레벨 bbox(left/top/width/height + confidence) — ADR-0039 D5.
  Amd#1 A3의 "좌표 원천 자체가 없음(판정 C-PART)"은 원본 HTML 기준의 사실이었고, OCR bbox가
  새 원천이 된다(A3 개정).
- **타이밍 소스**: 기존 그대로 `marks.json`(Polly word marks). **단어 종료 시각 필드 부재 →
  다음 마크의 time으로 유도**(마지막 단어는 오디오 길이 폴백) — Amd#1 A3의 이 부분은 승계.
- 정렬 전제: marks의 단어 시퀀스(char offset 기준) ↔ bbox의 단어 시퀀스(좌표 기준)를 검수
  확정 텍스트를 매개로 1:1 대응시킨다. 대응 검증은 구현 게이트(본문 §4 G1의 C안판)로 승계.

### E3 — ★ 미해결 쟁점: 버킷 기존 39권은 무텍스트라 C안 적용 불가 (결정하지 않음)

`book-images` 버킷의 기존 39권(508객체)은 GH Pages **무텍스트판**이다(2026-07-09 전수 실측).
인쇄 텍스트가 없으므로 **그 위에 칠할 좌표 하이라이트(C안)가 성립하지 않는다.** 선택지 사실만
기록한다 — **결정은 파일럿 이후 팀장이 한다**:

- **(가) 이미지 소스를 WP판(텍스트 인쇄)으로 통일 → 뷰어 1벌**
  - 교체 대상: 버킷 기존 39권 이미지 전량(508객체) 재적재(무텍스트 → WP baked-in).
  - 39권도 OCR bbox 신규 필요(좌표는 WP 이미지 기준이므로 기존 텍스트 JSON으로 대체 불가).
  - 기존 book_audio(오디오·marks)는 텍스트 문자열이 검수 확정본과 동일하게 유지되는 한 재사용
    가능(marks는 char offset 기준 — 이미지 교체와 무관). 단 WP판과 GH판의 본문 문자열 차이
    유무는 미확인(파일럿 대조군 1권 기준 동일).
- **(나) 뷰어 이원화 → 무텍스트 39권 A안, WP 167권 C안**
  - 교체 0권 — 기존 39권 자산(이미지 508객체·업로드 오디오 34권분·marks) 그대로.
  - 뷰어 렌더 경로 2벌 유지(A안: 분리 텍스트 레이어 + span 하이라이트 / C안: bbox 오버레이),
    도서별 분기 기준 필요(이미지 소스 구분 메타).
  - 동일 서비스 내 도서마다 하이라이트 UX가 달라짐(사실 기록 — 평가는 하지 않음).

### E4 — Amd#1 A2(무텍스트 전제)의 무효

Amd#1 **A2 "서비스 대상 이미지는 무텍스트다"는 무효다.** 팀장 결정 H2(baked-in 허용)·H1(전권
서비스)로 전제가 소멸했다. A2에 종속된 "결손 15권은 A안 코호트 편입 불가" 판정도 근거를
상실한다(WP baked-in 이미지로 편입 가능 — 개별 처분은 ADR-0036 Amd#2 개정에서).

*Amendment #2 끝.*

---

## Amendment #3 (2026-07-10) — 하이라이트 방식 A안 확정·C안 폐기 (팀장 결정 K1)

근거: 팀장 결정 **K1 — "하이라이트는 A안(이미지 아래 별도 텍스트 레이어). C안 폐기. 번복
없음."** + C안 폐기 사유의 실측 근거 `docs/recon/2026-07-10-39books-text-identity-gate.md`.

### F1 — Amd#2 E1·E2의 명시적 무효

Amd#2의 **E1(A안→C안 전환)과 E2(좌표 소스 = OCR bbox)는 무효다.** 하이라이트 방식은
Amd#1 A1의 **A안(이미지와 분리된 우리 소유 텍스트 레이어 + marks 기반 span 하이라이트)으로
확정**한다. Amd#2의 E3(버킷 39권 이미지 소스 쟁점)·E4(A2 무텍스트 전제 무효)는 C안과
무관하므로 유효 유지.

### F2 — C안 폐기 사유 (4가지)

1. **OCR 단어 정확도 중앙값 92.67% / 최저 34.57% / 80% 미만 8권** — 39권 전수 게이트 실측.
   C안은 인쇄 단어와 bbox의 1:1 대응이 전제인데 이 정확도로는 좌표-단어 대응 신뢰 불가.
2. **말풍선 읽기 순서 역전 관측** — 다단·말풍선 배치에서 OCR 읽기 순서가 서사 순서와
   뒤바뀌는 사례 실측(how-about-you 등).
3. **정본에 없는 인쇄 문장 실재** — zanele-situ-my-story의 WP판 이미지에 정본(GH 추출)
   텍스트에 없는 말풍선 문장이 인쇄되어 있음. C안이면 낭독·하이라이트와 화면 인쇄 텍스트가
   구조적으로 불일치.
4. **반응형 좌표 변환 복잡도** — 이미지 스케일·뷰포트별 bbox 좌표 변환 레이어가 상시 필요.

### F3 — A안 확정에 따른 정합

- 하이라이트 데이터 소스는 Amd#1 **A3(marks time + char offset, 좌표 미사용)** 그대로 복원
  유효하다(단어 종료 시각은 다음 마크로 유도).
- OCR bbox의 용도는 좌표 하이라이트가 아니라 **텍스트 초벌 추출의 보조 신호**로 재정의된다
  — ADR-0039 D5 개정(2026-07-10) 참조.

*Amendment #3 끝.*
