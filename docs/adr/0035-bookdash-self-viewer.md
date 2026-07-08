# ADR-0035 — Book Dash 자체 뷰어 전환 (iframe 폐기 · 이미지+텍스트 직접 렌더 · 자막 하이라이트)

## Status
Proposed (2026-07-08) — 팀장 승인 후 Accepted. 본 문서는 설계 확정만 담고, 코드·DB·이미지 복사·적재는 후속 트랙에서 수행한다.

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
