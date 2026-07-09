# GH Pages 원본 레이아웃·결손 재확인 및 뷰어 결정 근거 (2026-07-09, 지시서 6)

> 읽기 전용 정찰(STEP 1) + 문서 산출물(ADR-0035 Amd#1 / ADR-0038 / ADR-0036 Amd#2 — 전부 Proposed,
> PLAN.md 정합화)의 입력값 기록. DB 쓰기 0 · Storage 쓰기 0 · sync/업로드 스크립트 실행 0.

## STEP 1-1 — 39권 이미지 소스 (copy_bookdash_images.py 원문)

- (a) 소스 형식: 본문 = `extract_scenes`가 GH Pages HTML에서 수집한 `image_url`
  (`extract_text.py:47` `GH_PAGES_BASE = "https://bookdash.github.io/bookdash-books"`,
  `:88` `f"{GH_PAGES_BASE}/{slug}/en/{src.lstrip('/')}"` → `…/{slug}/en/images/NN.jpg`).
  표지 = `copy_bookdash_images.py:166` `cover_src = f"{GH_PAGES_BASE}/{slug}/en/images/{COVER_NAME}"`.
- (b) 대상 목록: `load_cohort`(`:116-120`)가 54권(49 CSV + DONE 5)에서 `IMAGELESS_BOOKS` 15권을
  **기본 제외**(`--include-imageless`로만 포함, `:49`). 결손 15권은 **최초 실행에서 시도 후
  다운로드 단계 404로 실패**했고(`:102-104` 주석 "2026-07-08 cache-bust + 대조군 통과 실측으로
  확정"), 그 실측이 ADR-0036 Amd#1로 박제되며 목록 밖 상수가 됐다. → "시도 후 실패 → 이후 목록 제외".

## STEP 1-2 — 원본 레이아웃 (a-tiny-seed, HTML GET 1건 + web.css GET 1건 ※CSS 추가 GET은 편차 보고)

- DOM 순서: `<p><img src="images/NN.jpg" alt="…"/></p>` **다음에** `<p>본문 문장</p>` 문단(1~4개)이
  이어짐 — 원문:
  ```html
  <p><img src="images/01.jpg" alt="Wangari and her mother hold hands in a field." /></p>
  <p>In a village on the slopes of Mount Kenya in East Africa, a little girl worked in the fields with her mother. Her name was Wangari.</p>
  ```
- 겹침 여부: HTML 문서 내 `position:`/`absolute`/`overlay`/`z-index` **0건**.
  `web.css` 실측: `#wrapper{clear:both;max-width:40em;margin:auto;padding:0 0.3em}` ·
  `p{margin:0;text-indent:1em}` · `img{max-width:100%;max-height:50vh}` — 콘텐츠 절대배치 없음
  (고정배치는 `#nav-bar{position:fixed}`뿐). → **텍스트는 이미지 아래 흐름(flow), 겹침 아님**.
- 텍스트 영역 배경·여백: 배경색 별도 지정 없음(흰 바탕), 여백은 wrapper 좌우 0.3em + 문단
  들여쓰기 `text-indent:1em`, `line-height:150%`, 폰트 PT Serif 1.2em.
- → ADR-0035 Amd#1 A1의 배치 규정(이미지 아래 flow)의 근거.

## STEP 1-3 — GH Pages 무텍스트 이미지 실존 HEAD (판정 **I**)

대조군 a-tiny-seed: cover=200, 01~13 전부 200(13.jpg는 HTML 미참조 여분), 14.jpg에서 404 — **PASS**.
(1차 실행에서 워커의 게이트 술어를 "정확히 12"로 잘못 좁혀 STOP했다가, 지시서 조건("cover+01~12
전부 200")대로 정정 후 재실행 — 대상 15권은 정정 후에만 실행됨.)

| slug | cover | 최대 NN | 404 최초 지점 | 총 요청 |
|---|---|---:|---|---:|
| the-lion-who-wouldnt-try | 404 | 00 | 01.jpg(404) | 2 |
| i-can-dress-myself | 404 | 00 | 01.jpg(404) | 2 |
| hugs-in-the-city | 404 | 00 | 01.jpg(404) | 2 |
| katiitis-song | 404 | 00 | 01.jpg(404) | 2 |
| hippo-wants-to-dance | 200 | 00 | 01.jpg(404) | 2 |
| it-wasnt-me | 404 | 00 | 01.jpg(404) | 2 |
| little-sock | 200 | 00 | 01.jpg(404) | 2 |
| shongololos-shoes | 200 | 00 | 01.jpg(404) | 2 |
| springloaded | 200 | 00 | 01.jpg(404) | 2 |
| the-elephant-in-the-room | 200 | 00 | 01.jpg(404) | 2 |
| what-is-it | 200 | 00 | 01.jpg(404) | 2 |
| when-i-grow-up | 200 | 00 | 01.jpg(404) | 2 |
| who-is-our-friend | 200 | 00 | 01.jpg(404) | 2 |
| the-best-thing-ever | 200 | 00 | 01.jpg(404) | 2 |
| mrs-penguins-palace | 200 | 00 | 01.jpg(404) | 2 |

- **판정 I(부분 생존)**: 표지 생존 10권(= Amd#1 "표지만" 10권 재현) / 완전 404 5권(= "전무" 5권 재현).
  **본문 이미지 생존 0/15** → 무텍스트 본문 소스 부재 → **15권 A안 편입 불가**(실질적으로 H의 결론).
- ADR-0036 Amd#1(2026-07-08 cache-bust 실측)과 완전 재현 일치. 레이트리밋 교란 가능성은 0.6s
  간격 + 대조군 PASS로 통제됨.

## 산출 문서 (본 지시서에서 작성 — 전부 Proposed)

1. ADR-0035 **Amendment #1**(A1 배치 확정 A안-flow / A2 무텍스트 전제 / A3 marks 소스 /
   A4 면 3종 / A5 gap 전제 폐기 / A6 has_audio 전제) — 팀장 승인 대기.
2. **ADR-0038**(큐레이션 정책): Serviceable 정의 5조건, 실측 **34권** 충족(부록 slug),
   미충족 20권 분류(B집합 5 / 표지만 10 / 전무 5), 품질 기준은 팀장 결정 대기.
3. ADR-0036 **Amendment #2**: cover-only 10 폴더 UUID 박제 + 결손 15권 지위(판정 I).
4. PLAN.md 정합화: 구 iframe 서술 6개소 취소선·주석 처리 + §5 인프라에 Storage 4버킷 표 추가
   (수정 위치: 기존 라인 기준 134, 199 뒤 9행 삽입, 225, 260, 482, 512, 623).

## 정정 1건 (직전 정찰 문서에 대한)

- `2026-07-09-viewer-architecture-evidence.md`의 "cover-only 10폴더 — ADR-0036에 미기록"은
  부분 부정확: Amd#1 `:129`에 "잔여 커버 10(버킷 총 518)" **총량 언급은 있었음**. UUID 단위
  박제가 없었던 것이며, 이번 Amd#2 §8.1로 해소.

## 팀장 결정 필요 항목

1. ADR-0035 Amd#1 / ADR-0038 / ADR-0036 Amd#2 — **Proposed → Accepted 승인 여부**.
2. ADR-0038 §6 품질 선별 기준·최종 서비스 목록(후보 축만 열거된 상태).
3. B집합 5권 오디오 업로드 + has_audio 반영(Serviceable 34→39 확장) — 실행 승인(별도 지시서).
4. cover-only 10 폴더 처분(유지/정리 — ADR-0036 Amd#2 §8.1 제안 2안).
5. has_audio 현재 DB 상태 확인 SQL 1회 실행(ADR-0038 §2 수록).
