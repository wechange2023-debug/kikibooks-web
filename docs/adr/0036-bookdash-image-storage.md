# ADR-0036 — Book Dash 이미지 저장 스키마 (book-images 버킷 · 창고 복사 · 규칙 조립 키)

## Status
Accepted (2026-07-08) — 팀장 승인. 본 문서는 **저장 스키마 확정**만 담는다. 이미지 복사 스크립트·다운로드·Storage 업로드·DB 쓰기는 **후속 구현 트랙**에서 수행한다(본 ADR 범위 아님).

## 관련
- `docs/adr/0035-bookdash-self-viewer.md`(자체 뷰어 전환 — D3 "이미지 = 창고 복사(방식 B)"의 저장 위치·키를 "제안형"으로 남겼고, **본 ADR이 그 확정판**이다).
- `docs/adr/0034-tts-audio-storage-implementation.md`(book-audio 버킷·`{source_platform}-{source_id}` 키·Content-Type/캐시 헤더 정책 선례 — 본 ADR 키·헤더의 대칭 근거).
- `docs/adr/0032-bookdash-cover-storage-migration.md`(book-covers 버킷·`bookdash-{UUID}.webp` 키 컨벤션 선례 — 접두사 철자 주의의 출처).
- `docs/adr/0027-bookdash-152-image-sequence.md`(Proposed — 신간 152권 이미지 시퀀스. **저장 정책이 본 ADR과 상반**, §5에서 정리).
- `docs/adr/0025-asb-content-ingestion.md`(`asb_native` 자체 렌더·이미지-only 면 정상 처리 선례).
- 근거 자료(정찰·드라이런, 미커밋): `scratchpad/bookdash_image_storage_recon.md`, `scratchpad/bookdash_image_dryrun.md`.

---

## 1. 맥락 (Context)

ADR-0035 D3은 book_dash 자체 뷰어의 본문 이미지를 **Supabase Storage로 복사**(핫링크 기각)하기로 결정했으나, **버킷명·키·DB 매핑은 "제안형"으로 이연**했다(0035 §2 D3, §3 미해결 1). 본 ADR은 그 이연분을 확정한다.

확정의 전제가 된 사실은 **읽기전용 전권 드라이런**(`scratchpad/bookdash_image_dryrun.md`, 2026-07-08, GH Pages HTML 54권 GET·이미지 미다운로드)으로 실측됐다:

- **이미지 명명 규칙 = 54/54 전권 표준**: 원본 `images/NN.jpg` — **2자리 zero-pad · 1-based · 연속(gap 없음)** · 확장자 **`.jpg`** · 첫 이미지 `01.jpg`(본문 page1, 표지 아님). 개수는 12장 52권 / 13장 2권(who-is-our-friend·whose-button-is-this) 외 편차 없음.
  - ⚠️ **Amendment #1 정정(2026-07-08)**: 위 "54/54 표준"은 **HTML `<img>` 참조 기준**이며, **원본 파일의 실제 존재는 39/54**다. 실복사 시 15권의 본문 `images/NN.jpg`가 GH Pages에 **실재하지 않음(HTTP 404)** 을 확인. 상세·목록은 **§7 Amendment #1** 참조.
- **표지 = 54/54 전권 별도 `images/cover.jpg`**(본문 `01.jpg`과 구분). GH Pages 리딩 페이지 `<img>`엔 미노출 — DB `cover_url`·기존 `book-covers` 버킷에만 존재.
- **source_id = 54/54 UUID**(`9c9e…` 형식). 이형 3권(little-sock·maddy-moona·mrs-penguins-palace)도 장부 `source_id`가 **UUID로 확인**됨(팀장 Supabase SQL 실행 — 아래 쿼리, **No rows returned** = full-slug source_id 행 없음). → 이미지 키 예외 처리 불필요.

  ```sql
  -- 팀장 실행(읽기전용): 이형 3권 source_id가 full-slug인지 확인. 결과 No rows returned.
  SELECT id, source_id FROM books
  WHERE id IN ('724aff4e-525a-424f-9c53-e8b946533f6e',
               '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c',
               'ef15e04e-276e-43e2-9d0e-3e1baf4329bf')
    AND source_id !~ '^[0-9a-f-]{36}$';  -- UUID 아닌(=slug) source_id만 매칭
  ```

---

## 2. 결정 (Decision) — 확정 스키마

### D1 — 버킷: 신규 `book-images`
- 오디오(`book-audio`)와 **분리된 신규 버킷 `book-images`**. `book-*` 네이밍 컨벤션 계승(`book-covers`·`book-manifests`·`book-audio`).
- 버킷 생성은 **팀장이 Supabase Dashboard에서 수행**(워커는 Storage 관리자 권한 없음).
- 공개/비공개: 베타에선 covers·audio와 동일하게 **public 버킷**(뷰어가 서명 URL 왕복 없이 바로 렌더). closed-environment(협상용) 요건은 후속 서명 URL 카드로 이연.

### D2 — 키: `book_dash-{source_id}/NN.jpg` + `.../cover.jpg`
- **경로 규칙**:
  ```
  book-images/{book_key}/NN.jpg      (본문 페이지 — NN = 원본과 동일 2자리 zero-pad·1-based, 예 01·02…12)
  book-images/{book_key}/cover.jpg   (표지)
  {book_key} = book_dash-{source_id}   (source_id = Book Dash 메타 고유 UUID)
  ```
- **원본 1:1 대응**: GH Pages `.../{slug}/en/images/NN.jpg` → `book-images/book_dash-{UUID}/NN.jpg`, `images/cover.jpg` → `book-images/book_dash-{UUID}/cover.jpg`. **번호 체계·파일명을 원본 그대로 보존**(2자리 zero-pad·1-based·연속). 오디오의 0-based `p00` 재번호와 달리, 이미지는 원본 `NN`을 유지해 원본-창고 육안 대조를 쉽게 한다.
- **접두사 = `book_dash-`(밑줄 포함)**. `source_platform` 컬럼 값과 **철자 통일**(book-audio 결정 ②와 동일 방향, 코드-데이터 일치).
  - ⚠️ **주의(선례 불일치)**: 기존 커버 버킷은 리터럴 **`bookdash-`(밑줄 없음)** 로 키를 짰다(`bookdash-{UUID}.webp`, ADR-0032). 본 ADR은 **의도적으로 `book_dash-`(밑줄)** 를 택해 `source_platform` 값과 맞춘다. 따라서 **같은 책이 커버는 `bookdash-`, 이미지는 `book_dash-` 접두사를 갖는다**(오디오와는 일치). 커버까지 통일할지는 ADR-0034가 남긴 후속 카드에 병합(본 ADR은 book-images에만 적용, 기존 커버 키 미터치).

### D3 — 복사 범위: 본문 `NN.jpg` 전부 + `cover.jpg`
- 각 책의 본문 이미지 `01.jpg`~`NN.jpg` **전부**(12장 또는 13장)와 표지 `cover.jpg`를 복사한다.
- **무텍스트 면 이미지도 포함**한다 — 텍스트·오디오가 없는 '그림만 면'도 자체 뷰어의 **렌더 대상**(ADR-0035 D2)이므로 이미지가 반드시 있어야 한다. 이미지 개수(예 12)와 오디오 개수(예 10)가 달라도 **이미지는 gap 없이 01~NN 연속 복사**한다.

### D4 — Content-Type / 헤더
- 이미지 → **`image/jpeg`** (charset 불필요).
- 캐시 → **`Cache-Control: public, max-age=31536000, immutable`** (정적 파일 장기 캐시. book-audio 결정 ③ 준용).
- ⚠️ 업로드 시 확장자 자동추측에 의존하지 말고 `contentType`을 **명시 지정**한다(covers·audio 선례 계승).

### D5 — DB 매핑: 신규 테이블 없음, 규칙 조립
- **이미지용 신규 테이블·컬럼을 만들지 않는다.** 뷰어가 `source_id`(UUID) + 페이지 번호로 **키를 규칙 조립**한다:
  `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/book-images/book_dash-{source_id}/{NN}.jpg`.
- **근거**: (a) 이미지 명명이 54/54 전권 표준(2자리·1-based·연속)이라 경로가 완전 결정적. (b) 이미지 개수는 뷰어가 이미 보유한 면 배열(텍스트·오디오 매핑) 길이로 도출 가능. (c) `source_id`(UUID)가 54/54 정합 확인됨(§1 팀장 SQL, No rows returned) → 예외 분기 불요. book_audio처럼 페이지 단위 메타(길이·voice)가 필요한 경우와 달리, 이미지는 순수 경로라 장부가 불필요하다.
- `source_platform`·`source_id`는 `getBookById`(`lib/book/detail.ts:126`) SELECT에 **이미 포함**되어 뷰어로 전달되므로(§4 비고 참조), 추가 SELECT 없이 조립 가능.

---

## 3. 결과 (Consequences)

- **긍정**: 외부 GH Pages 종속 제거(ADR-0035 D3 목표 달성). 키가 커버·오디오 정본(`{source_platform}-{source_id}`, 메타 UUID)과 대칭이라 교차 플랫폼 충돌 없음. DB 마이그레이션 0건(규칙 조립).
- **비용/부담**: `book-images` 버킷 저장비(54권 × ~12장 × 수십~수백 KB = 소규모, 소수 정예 범위). 이미지 복사 파이프라인 신규 구현(후속 트랙).
- **접두사 이원화**: 같은 책이 커버 `bookdash-` / 이미지·오디오 `book_dash-`로 접두사가 갈린다(D2 주의). 통일은 후속 카드.
- **원본 보존·라이선스**: book_dash = CC BY 4.0 → 어트리뷰션 유지 시 재배포 허용(창고 복사 = 재배포, 라이선스상 허용). 자체 뷰어 AttributionBox·`attribution_text` NOT NULL(Hard Rule 1) 100% 유지. 본 ADR은 문서까지이며 코드·DB·Storage 변경 0.

---

## 4. 적용 범위 (Scope) · ADR-0027과의 관계

### 4.1 적용 범위
본 ADR은 **`source_platform='book_dash' AND content_type='html'` 코호트 54권**(자체 뷰어 대상)에 **한정** 적용한다.

### 4.2 ADR-0027(Proposed)과의 충돌 정리
- **저장 정책이 상반됨(명시)**: ADR-0027(신간 152권 이미지 시퀀스)은 **CloudFront 외부 핫링크·무복사**(D3, `asb_native` 경로)를 택한다. **본 ADR은 창고 복사**(자체 뷰어 경로)를 택한다. 두 book_dash 코호트가 본문 이미지 저장 정책이 갈린다.
- **범위 분리**: 본 ADR은 **html 코호트(자체 뷰어)** 에만 적용되고, ADR-0027 범위(**asb_native 신간 152권**)와 **분리**된다. 서로의 결정을 침범하지 않는다.
- **통합/폐기는 이월**: 두 정책의 통일(예: ADR-0027 §D3 미래옵션 "베타 안정화 후 복사 전환")이나 ADR-0027의 통합·폐기 여부는 **본 ADR에서 결정하지 않는다**. 별도 결정으로 이월한다.

---

## 5. 비고 — 뷰어 트랙으로 이월할 사실 (저장 스키마와 무관, 기록만)

아래는 드라이런에서 함께 관찰된 사실로, **저장 스키마와 무관**하며 본 ADR은 **기록만** 한다. 수정·구현은 해당 뷰어 트랙에서 처리한다.

1. **pNN gap ≠ 진짜 빈 면**: 현 배치의 오디오 pNN gap은 **추출 버전 drift 산물**로, a-beautiful-day(page 4·12)·a-house-for-mouse(page 10) **2권만 잔존**한다(두 책은 extract_text의 alt-fallback 도입 전 배치됨 — 재추출 시 alt로 채워짐). **진짜 '그림만 면'(본문·alt 모두 없음)은 무텍스트 5권**(hugs-in-the-city·i-can-dress-myself·it-wasnt-me·katiitis-song·the-lion-who-wouldnt-try)**뿐**이다. → **ADR-0035 D2/D4의 "빈 면 = gap" 전제는 뷰어 구현 시 이 사실로 정정 필요**(본 ADR은 기록만, 정정은 D2/D4 트랙).
2. **면 3종 + alt-only 8권**: 면은 body/alt/empty 3종으로 갈리며, 본문 없이 img `alt`만 있는 alt-only 면이 8권(bathtub-safari·come-back-cat·hippo-wants-to-dance·shongololos-shoes·**springloaded 전 12면**·why-is-nita-upside-down·a-beautiful-day·a-house-for-mouse)에 존재한다. alt 텍스트를 낭독·형광펜 대상으로 삼을지, springloaded(본문 0·alt 12)를 무텍스트 그림책으로 재분류할지는 **뷰어 트랙 안건**.
3. **ADR-0035 L27 문구 정정**: "source_platform·source_id가 getBookById에 미전달"은 부정확. **`source_platform`·`source_id`는 `lib/book/detail.ts:126` SELECT에 이미 포함**되어 있고, 미전달인 것은 **`has_audio`뿐**이다. (ADR-0035 D6 구현 시 반영.)

---

## 6. 후속 (구현 트랙 예고 — 본 ADR 범위 아님)
- [x] `book-images` 버킷 생성(팀장 Dashboard) — **완료**.
- [x] 이미지 복사 파이프라인 — `scripts/copy_bookdash_images.py`(스로틀 백오프 + 완결성 게이트). **정예 39권 업로드 완료(508객체)** — Amd#1.
- [ ] 뷰어 경로 조립: `getBookById` 기반 `source_id`로 이미지 URL 규칙 조립(D5), 실 파일 200 확인(ADR-0035 G4).
- [ ] (뷰어 트랙) §5 이월 사실 반영 — 면 3종 판별·alt 처리·gap 정정.
- [ ] (선택) 결손 15권 원본을 다른 소스(bookdash.org WP/CloudFront, ADR-0027 경로)에서 확보 재시도 — 별도 트랙(Amd#1 §미결).

---

## 7. Amendment #1 (2026-07-08, Accepted) — 원본 이미지 실존 39/54 정정 · 정예 39권 확정

### 배경
§1은 이미지 명명 규칙을 "54/54 표준"으로 기록했으나, 이는 **정찰(HTML `<img>` 참조) 기준**이었다. 실제 복사(다운로드) 단계에서 **15권의 본문 이미지가 GH Pages 2019 스냅샷에 실재하지 않음**(HTTP 404, HTML은 죽은 링크를 참조)을 확인했다. 근거 정찰이 HTML 파싱만 하고 실제 파일 존재를 다운로드로 검증하지 않은 것이 원인.

### 실측 (2026-07-08, cache-bust + 대조군 통과 · 대체 경로 전부 404로 확정)
- **원본 이미지 결손 15권** (본문 `images/NN.jpg` = 404):
  - **표지만 존재(본문 결손) 10권**: hippo-wants-to-dance, little-sock, mrs-penguins-palace, shongololos-shoes, springloaded, the-best-thing-ever, the-elephant-in-the-room, what-is-it, when-i-grow-up, who-is-our-friend (`images/cover.jpg`만 200).
  - **이미지 전무 5권(무텍스트책, cover도 404)**: hugs-in-the-city, i-can-dress-myself, it-wasnt-me, katiitis-song, the-lion-who-wouldnt-try.
- **정예 39권** = 54 − 결손 15. 원본 이미지 실존 확인.
- 검증 confound 3종을 실측으로 분리: (1) GH Pages/Fastly **레이트리밋**(무지연 연속요청이 404 유발), (2) 그 404의 **엣지 네거티브 캐싱**(bare URL 재요청도 404, cache-bust로 우회 시 origin 실상 노출), (3) 그 아래 **진짜 원본 결손 15권**(cache-bust·대조군·대체경로로도 404 = 영구). a-fish-and-a-gift는 (1)(2)의 피해였을 뿐 원본 실존 → 별도 페이스 업로드로 완비.

### 결정 (팀장 확정)
1. **자체 뷰어 정예 코호트 = 39권**(원본 이미지 실존). 결손 15권은 이미지가 없어 렌더 불가이므로 **제외**(무텍스트 5권은 오디오·형광펜 대상도 아님). 본 ADR D3 "복사 범위"는 **정예 39권**에 적용된다(전 54권 아님).
2. **복사 스크립트 기본 대상 = 39권**. `scripts/copy_bookdash_images.py`에 결손 15권 상수(`IMAGELESS_BOOKS`) 추가·기본 제외, `--include-imageless`로만 포함. 원본 재확보 재시도용 여지 보존.
3. **완결성 게이트 기대치 = 정예 39권 기준(508 객체 = 38권×13 + whose-button-is-this 14)**. 미달 시 스크립트가 실패(exit 1)로 종료. **현재 39/39 완비 = 508/508 업로드 확인**(Supabase 실측).
4. 이전 "704"(HTML 참조 기준)는 폐기. 실존 상한 = 정예 39권 = 508 이미지(+결손책 잔여 커버 10 = 버킷 총 518).

### 불변
D1(book-images 버킷)·D2(키 `book_dash-{UUID}/NN.jpg`·접두사)·D4(헤더)·D5(무장부 규칙 조립)는 유효. 본 Amendment는 **적용 범위를 39권으로 좁히고** 결손 사실을 박제할 뿐 스키마·키 규칙은 미변경.

### 미결(별도 트랙)
- 결손 15권 원본을 bookdash.org WP/CloudFront(ADR-0027 신간 경로)에서 확보 가능한지 정찰 → 가능 시 `--include-imageless` + 해당 경로 파서로 복사, 불가 시 영구 제외.
- 결손 10권(표지만 존재)의 현행 프로덕션 iframe 렌더 품질(본문 이미지 죽은 링크) 점검.
