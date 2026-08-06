# ADR-0054: Book Dash html 54권 중 38권 수평 슬라이드 뷰어 전환 — WP PDF 재하베스트 경로

## Status

**Accepted** (2026-08-05) / 기준 HEAD `cfaaf71`
초안 **Proposed**(2026-07-30, 기준 HEAD `2bfce41`) → 오케스트레이터 회신으로 미해결 항목 **O1·O2·O3·O5 해소** 후 승인.
본 문서는 **결정 확정만** 담는다. 코드·DB·Storage 작업은 승인 후 별도 작업지시서에서 수행한다.
드라이런(D6) 실행은 **후속 작업지시서 소관**이며, 그 산출로 확정되는 슬라이드 총 수(**O4**)는 Amendment로 고정한다.

## Deciders

팀장, 오케스트레이터

## Related

- **직접 근거 정찰 2건**
  - `docs/recon/2026-07-27-bookdash-longscroll-audit.md` — "세로 형식"의 정체가 `content_type='html'` 54권의 iframe 임베드임을 확정. 세로로 긴 이미지는 book_dash 전 코퍼스에 0장.
  - `docs/recon/2026-07-28-html54-slide-feasibility.md` — 54권 **전량** 드라이런. 파싱 실패 0권, 전환 재료 경로 (A)/(B) 제시.
- ADR-0014 Amendment #6(블랙리스트 15권 확정), ADR-0017(뷰어 아키텍처 — HtmlReader iframe 단일 경로),
  ADR-0025(`asb_native` 자체 렌더), ADR-0027(152권 이미지 시퀀스·매니페스트), ADR-0035(+Amd#1·#3)(자체 뷰어·A안 하이라이트),
  ADR-0036(이미지 창고 복사), ADR-0047(206권 적재 회계 — DUP skip 49), ADR-0049(페이지 이미지 원천),
  ADR-0050(회전 페이지), ADR-0053(+Amd#1)(전체 TTS 확장 — 본 전환의 후행 트랙).
- 구현 자산(재사용 대상, 신규 개발 없음): `scripts/pdf_harvest/harvest.py` · `render_page_images.py` ·
  `upload_page_images.py` · `gen_book_text_sql.py` · `scripts/sync_book_dash_v2.py`(매니페스트 합성·업로드).
- 블랙리스트 단일 공급원: `lib/shared/blacklist.ts`(`BOOK_DASH_404_SOURCE_IDS`).

---

## Context

### C1. 문제

`source_platform='book_dash'` 209권은 렌더 경로가 두 갈래다(`app/(reader)/book/[id]/read/page.tsx`).

| content_type | 권수 | 렌더 | 화면 |
|---|---:|---|---|
| `html` | **54** | `HtmlReader` → `bookdash.github.io` **cross-origin iframe** | 외부 원본의 **세로 스크롤 문서** |
| `asb_native` | 155 | `AsbReader` 자체 렌더 | **페이지 단위 수평 슬라이드** |

54권만 서비스 표준(수평 슬라이드)에서 이탈해 있다. 원인은 원본 구조 차이가 **아니라 적재 순서**다 —
v1(`sync_book_dash.py`, GH Pages HTML)이 먼저 적재했고, v2(`sync_book_dash_v2.py`, WP PDF→이미지)가
같은 책을 DUP로 건너뛰었다(ADR-0047 회계의 **DUP skip 49 = 이 54권 중 49권**). 그 결과 이 코호트는
PDF 하베스트·페이지 이미지 렌더·`book_text` 적재를 **한 번도 거치지 않았다**(2026-07-28 정찰 §3).

### C2. 실측으로 확정된 사실 (2026-07-28 전량 드라이런, 54권 표본 0)

- **파싱 실패 0권.** 장면 경계를 깨는 구조 이상(고아 텍스트·`<p>` 밖 이미지·한 `<p>`에 이미지 2장)이
  54권 통틀어 **0건**. 마커 존재율 `wrapper` 54/54 · `copyright-text` 54/54.
- 분류: CLEAN 41 / MINOR 7 / MANUAL 6 / FAIL 0. **사람 판단이 필요한 MANUAL 6권은 전원 블랙리스트 소속**이라
  사용자 노출 39권 기준 MANUAL은 **0권**이다.
- 블랙리스트 15권은 원본 본문 이미지가 **전량 404**(181장)다. 비블랙 39권은 **469장 결손 0**.
- **세로로 긴 이미지 0장** — h/w ≥ 1.25가 한 장도 없다(2026-07-27 감사 결론의 재확인).
- **해상도 격차**: GH Pages 이미지는 스프레드 1134×567 · 단면 567×567로, 152권 코호트(1600×800 / 1600×1600)
  대비 **면당 가로 해상도가 약 70%**다. 태블릿 전체화면에서 확대 열화 우려.
- **재료 두 갈래**: (A) GH Pages 이미지 재사용 — 즉시 가능하나 저해상도.
  (B) **WP 카탈로그 PDF 재하베스트** — 비블랙 39권 중 **38권 가능**(없는 건 `maddy-moona` 1권뿐),
  해상도·정합성이 152권과 **동일**해진다.

---

## Decision

### D1. 대상 — html 54권 중 **38권**만 전환. 블랙 15권 제외, PDF 미확보 1권 보류(hold)

```
54  (content_type='html' 전량)
 −15 블랙리스트 (BOOK_DASH_404_SOURCE_IDS) ······· 제외(exclude)
 = 39  사용자 노출 코호트
 − 1 maddy-moona (WP 카탈로그에 PDF 부재) ········· 보류(hold)
 = 38  ← 본 ADR의 전환 대상
```

**D1-a. 제외 15권과 그 사유** — 사유는 단일하다: **원본(`bookdash.github.io`)의 본문 이미지가 전량 404**
(15권 181장, 2026-06-11 전수 감사 = ADR-0014 Amendment #6). 즉 GH Pages 원본에서 복원할 재료가 없다.
2026-07-28 정찰은 이 15권이 **전원 html 54권 안에 있음**을 재확인했다 — 이미지 결손은 v1 html 코호트 고유 문제다.

| # | slug | 404 판정 | 정찰 분류 |
|---:|---|---|---|
| 1 | `the-lion-who-wouldnt-try` | 표지 404(2026-05-20) + 본문 404 | MANUAL(텍스트·alt 모두 0) |
| 2 | `i-can-dress-myself` | 표지 404 + 본문 404 | MANUAL(텍스트·alt 모두 0) |
| 3 | `hugs-in-the-city` | 표지 404 + 본문 404 | MANUAL(텍스트·alt 모두 0) |
| 4 | `katiitis-song` | 표지 404 + 본문 404 | MANUAL(텍스트·alt 모두 0) |
| 5 | `it-wasnt-me` | 본문 404 | MANUAL(텍스트·alt 모두 0) |
| 6 | `springloaded` | 본문 404 | MANUAL(`<p>` 0, **alt 12/12면 818자 존재**) |
| 7 | `hippo-wants-to-dance` | 본문 404 | MINOR(무텍스트 면 12) |
| 8 | `shongololos-shoes` | 본문 404 | MINOR(무텍스트 면 12) |
| 9 | `little-sock` | 본문 404 | CLEAN |
| 10 | `the-elephant-in-the-room` | 본문 404 | CLEAN |
| 11 | `what-is-it` | 본문 404 | CLEAN |
| 12 | `when-i-grow-up` | 본문 404 | CLEAN |
| 13 | `who-is-our-friend` | 본문 404 | CLEAN(13장면) |
| 14 | `the-best-thing-ever` | 본문 404 | CLEAN |
| 15 | `mrs-penguins-palace` | 본문 404 | CLEAN |

> **블랙리스트 근거 출처 확정(2026-08-05 — O5 해소)**: 위 15권의 **단일 진실 공급원은
> `lib/shared/blacklist.ts`의 `BOOK_DASH_404_SOURCE_IDS`**(source_id UUID 15건 + slug 주석)다.
> 2026-07-28 정찰 문서는 사유·권수(15권)·MANUAL/MINOR 소속만 기록하고 15권 **전체 이름은
> 담고 있지 않으므로**, 본 표의 slug은 **코드에서 직접 인용**했다. 향후 목록 변경은 코드 1곳
> 갱신으로 5표면에 전파되며(ADR-0014 Amendment #5), 본 ADR의 표는 그 사본이다 — 불일치 시
> **코드가 우선한다.**

**D1-b. 보류 1권** — `maddy-moona`. WP 카탈로그에 같은 slug이 없어 PDF를 확보하지 못했다. 부재가 아니라
**slug 표기 불일치일 가능성이 크나 미확인**이다(정찰이 WP 카탈로그 제목 대조를 실시하지 않음).
따라서 **삭제·차단이 아니라 `hold`** 로 둔다 — 현행 `content_type='html'` iframe 렌더를 그대로 유지하고,
제목 대조로 PDF가 발견되면 동일 절차로 편입한다.

**D1-c. 제외 15권의 향후 여지(이번 전환에서는 닫는다)** — 정찰 §6-4는 **15권 중 11권은 WP 카탈로그에
PDF가 있다**고 기록한다(미검증). 즉 PDF 경로로 이미지 404를 우회할 여지가 원리적으로 존재한다.
그러나 본 ADR은 이를 **채택하지 않는다**: 이 11권은 블랙리스트가 5개 표면(랜딩·추천·카테고리·상세·뷰어)에서
차단 중이라 전환해도 사용자에게 노출되지 않으며, 블랙리스트 해제는 별도 판단 사안이기 때문이다.
별도 트랙으로 이연한다(Non-goals).

### D2. 방식 — WP 원본 PDF를 **기존 파이프라인**에 태운다. 신규 뷰어 개발 0

정찰 §3의 **경로 (B)** 를 채택한다. 경로 (A)(GH Pages 이미지 재사용)는 **기각**한다 — 152권 대비 가로 해상도
70%로, 같은 서비스 안에서 도서마다 화질이 갈린다.

전환 후 38권은 152권 코호트와 **완전히 동일한 자산 형태**를 갖는다.

| 단계 | 재사용 자산 | 산출 |
|---|---|---|
| 1. PDF 하베스트 | `scripts/pdf_harvest/harvest.py` | 페이지별 텍스트·좌표 |
| 2. 페이지 이미지 렌더 | `render_page_images.py` | 1600×800 스프레드 / 1600×1600 뒤표지 |
| 3. Storage 업로드 | `upload_page_images.py` | `book-images/book_dash-{source_id}/NN.jpg` |
| 4. `book_text` SQL 생성 | `gen_book_text_sql.py` | `page_index` 0-based · `blocks` JSONB |
| 5. 매니페스트 합성·업로드 | `sync_book_dash_v2.py` 형식 | `book-manifests/{slug}_en.txt` → Public URL |
| 6. 뷰어 | **기존 `AsbReader`** | 수평 슬라이드 |

- **뷰어 코드 신규 개발 0.** `content_type`이 `asb_native`가 되는 순간 기존 `AsbReader` 경로로 렌더된다.
- **스프레드 분할 없음.** 152권 파이프라인을 그대로 쓰므로 1600×800 2면 스프레드는 **1슬라이드로 유지**된다.
  정찰이 남긴 선행 결정 D-2(분할 여부)는 이로써 "분할하지 않음"으로 답해진다. 이는 2026-07-27 감사가
  경고한 "분할 시 116권 전 권 페이지 번호 변경" 위험을 회피하는 방향과 같다.
- **비정형 이미지 문제 소멸.** 정찰 §4-2가 지적한 폭이 들쭉날쭉한 12장(`together-were-strong` 8장 등)과
  §4-1의 "권 안에서 스프레드·단면 혼재 15권"은 GH Pages 원본 고유 현상이다. PDF 렌더 경로에서는 152권과
  같은 균일 규격으로 재생성되므로 별도 처리가 필요 없다.
- **`extract_text.py` 루트절대 src 버그**(정찰 §6-1)도 GH Pages 경로를 쓰지 않으므로 본 트랙과 무관하다
  (이미 `urljoin` 방식으로 수정 완료, HEAD `b3ba162`).

### D3. DB 영향 — `books` 38행 UPDATE. **스키마 변경 아님.** 실행은 팀장 SQL Editor

| 컬럼 | 변경 전 | 변경 후 |
|---|---|---|
| `content_type` | `'html'` | `'asb_native'` |
| `content_url` | `https://bookdash.github.io/bookdash-books/{slug}/en/` | `book-manifests/{slug}_en.txt` Public URL |

부수 적재: `book_text` 신규 INSERT(38권분), Storage `book-images/book_dash-{source_id}/` 신규 객체.

- **스키마 무변경**: `asb_native`는 `supabase/migrations/004_add_asb_native_content_type.sql`의
  `content_type` 화이트리스트에 **이미 존재**한다. 제약·트리거·컬럼을 건드리지 않는다.
- **Hard Rule 정합**: `attribution_text`·`license`는 **무접촉**이다(Hard Rule 1).
  `enforce_commercial_license` 트리거는 `NEW.license = OLD.license`이므로 통과한다(Hard Rule 2 무접촉).
  원본은 CC BY 4.0이며 어트리뷰션 박스는 `AsbReader` 경로에서도 100% 유지된다.
- **실행 주체 = 팀장**(Supabase SQL Editor). 워커는 SQL 파일 생성까지만 수행하고 DB 쓰기 코드 경로를 갖지 않는다
  (ADR-0053 D6 승계). 스키마 변경은 아니나 **데이터 대량 UPDATE**이므로 ADR 선행 원칙을 적용한다.
- **단계 분할 필수**: 긴 단일 트랜잭션 실행 시 백업 미반영 이슈가 확인된 바 있어 **step 파일로 분할**한다.
  각 step 파일은 **`ROLLBACK;`으로 종결해 저장**하고, 팀장이 검증 후 `COMMIT`으로 바꿔 실행한다.

  | 파일 | 내용 | 쓰기 |
  |---|---|---|
  | `step1_backup.sql` | 백업 테이블 `bookdash_html54_backup_20260730` 생성 + 38행 `id`·`slug`·`content_type`·`content_url` 스냅샷 INSERT + 행수 검증 | 백업만 |
  | `step2_book_text.sql` | `book_text` 38권분 INSERT (`gen_book_text_sql.py` 산출) | 신규 적재 |
  | `step3_switch.sql` | `books` 38행 `content_type`·`content_url` UPDATE + 사후 검증 SELECT | 전환 |

### D4. 롤백 — 3중 백업. **원본 html 콘텐츠는 삭제하지 않는다**

1. **DB 백업 테이블** `bookdash_html54_backup_20260730` (step1에서 생성. 표지 트랙의
   `cover_url_backup_20260730` 선례와 동일 규약).
2. **CSV 백업** — 전환 전 38행의 `id`·`slug`·`content_type`·`content_url`을 CSV로 떠 저장소에 커밋.
3. **원복 SQL** `rollback_html54.sql` — 백업 테이블 조인으로 `content_type`·`content_url`을 원값으로 되돌린다.
   `ROLLBACK;` 종결로 저장.

**보존 원칙**: 원본 GH Pages HTML은 **우리 자산이 아니라 외부 URL이므로 삭제 대상 자체가 없다.**
전환은 `content_url` **참조를 바꿀 뿐**이며, 백업된 원 URL 문자열만 있으면 iframe 렌더로 즉시 복귀한다.
Storage에 새로 올라간 페이지 이미지·매니페스트도 롤백 시 **삭제하지 않고 방치**한다(재전환 시 재사용,
고아 객체 정리는 별도 사안).

**롤백 단위**: 권 단위다. 특정 권만 문제가 있으면 그 `id`만 원복한다 — 38권 전량 원복은 필요 없다.

### D5. 후속 효과 — 38권이 TTS 파이프라인 적용 대상이 된다

ADR-0053 D1은 html 54권을 **"`book_text` 행 없음 = 낭독 대상 자체가 없음"** 이라는 사유로 TTS 116권에서
사전 제외했다. 본 전환은 그 제외 사유를 **직접 소멸시킨다** — D2 단계 4에서 `book_text`가 적재되기 때문이다.

즉 본 ADR은 **Book Dash 오디오 확대 계획의 선행 단계**다. 전환 완료 38권은 후속 TTS 배치의 신규 대상이 되며,
ADR-0053 A3의 확정 규약(`Danielle / long-form / atempo 0.85`, 페이지별 mp3 + word marks, 표지 트랙 포함,
dry-run 선행 후 팀장 승인)을 그대로 승계한다. **본 ADR은 TTS를 실행하지 않는다**(Non-goals).

**오디오 상한 회계 (2026-08-05 확정 — O1 해소)**

| 단계 | 셈 | 상한 |
|---|---|---:|
| 현재 | danielle 배치 116 + 시범 12 | 128 |
| **① 본 ADR — 38권 전환 완료 시** | 128 + 38 | **166** |
| ② 회전 페이지 18권 복구 | 166 + 18 | 184 |
| ③ 제작 메타데이터 오염 6권 복구 | 184 + 6 | **190** |

- **본 ADR 단독의 기여분은 +38권이며, 그 결과 상한은 166권이다.**
- **"최대 190권"은 본 ADR 단독 결과가 아니다.** 후속 트랙 2건(② 회전 18 + ③ 오염 6 =
  ADR-0053 D1의 사전 제외 24권)의 텍스트 복구까지 모두 완료했을 때의 **최종 상한**이다.
- ②③은 본 ADR의 Non-goals이며, 각각 별도 트랙·별도 승인으로 진행한다.

### D6. 실행 게이트 — 전량 드라이런 통과 전 실 적재 금지

38권 **전량**(표본 아님)에 대해 하베스트~렌더 드라이런을 먼저 수행하고, 그 결과를 팀장이 승인한 뒤에만
Storage 업로드·SQL 실행으로 넘어간다. ADR-0053 D4가 TTS 비용 통제를 위해 세운 "dry-run 선행 · 승인 후 실행"
절차를 본 트랙에도 적용한다. 드라이런은 **DB 쓰기 0 · Storage 쓰기 0**이며, 산출은 권별 페이지 수·해상도
분포·이상 권 목록이다.

---

## 검증 계획 (Verification)

### V1. 페이지 수 3자 일치 (자동 · 게이트)

권별로 다음 세 값이 **완전히 일치**해야 한다. 1권이라도 불일치 시 그 권을 전환 대상에서 뺀다.

```
렌더된 페이지 이미지 수  ==  book_text 행 수  ==  매니페스트 항목 수
```

> ⚠️ **기준 정의 주의**: 이 값은 **전환 전 html 장면 수(38권 합계 457장면)와 일치하지 않는 것이 정상이다.**
> html 원본은 권당 12장면(38권 중 `whose-button-is-this`만 13장면)이고 뒤표지 면이 장면으로 들어 있지 않다.
> 반면 152권 PDF 렌더 코호트는 권당 **13 스프레드 + 1 정사각 뒤표지 = 14면**이 표준이다.
> 따라서 "페이지 수 일치"의 대상은 **전환 전후 비교가 아니라 전환 후 3자산 사이의 정합**이다.
> **이 재정의는 2026-08-05 확정됐다(O3 해소)** — "전환 전후 페이지 수 보존"은 경로 (B)에서
> 원리적으로 불가하며, **본 트랙의 요구사항이 아니다.**

### V2. 라이선스 감사 (자동 · Hard Rule)

- `SELECT COUNT(*) FROM books WHERE attribution_text IS NULL` → **0**
- `SELECT COUNT(*) FROM books WHERE license LIKE '%nc%'` → **0**
- 전환 38행의 `license`·`attribution_text`가 전환 전후 **동일**함을 백업 테이블 조인으로 확인.

### V3. 전환 회계 (자동 · 게이트)

- `content_type='html' AND source_platform='book_dash'` 잔여 = **16권**(블랙 15 + hold 1).
- `content_type='asb_native' AND source_platform='book_dash'` = 155 + 38 = **193권**.
- `book_text` 보유 book_dash 권수 = 152 + 38 = **190권**.

### V4. 실서비스 표본 육안 검증 (팀장)

전환 38권 중 **최소 5권**을 `/book/{id}/read`에서 직접 열어 확인한다. 표본은 정찰 분류가 갈리는 권으로 고른다
(CLEAN 3 + MINOR 2 — MINOR 5권: `a-beautiful-day` · `a-house-for-mouse` · `bathtub-safari` ·
`come-back-cat` · `why-is-nita-upside-down`).

| 확인 항목 | 통과 기준 |
|---|---|
| 렌더 경로 | 세로 스크롤 iframe이 아니라 **수평 슬라이드**로 열린다 |
| 페이지 수 | 슬라이드 총 수가 V1 값과 같다 |
| 이미지 품질 | 태블릿 전체화면에서 확대 열화가 152권 수준과 같다 |
| 어트리뷰션 | `AttributionBox`가 화면에 보인다 |
| 무텍스트 면 | MINOR 권의 텍스트 없는 면이 **에러가 아니라 그림만 있는 면**으로 정상 렌더된다(ADR-0035 Amd#1 A4) |

### V5. 회귀 확인

- 블랙 15권·hold 1권이 **여전히 `html`이고 차단 상태 유지**(5개 표면).
- 기존 152권·155권 코호트에 변화 0.
- `pnpm lint` · `pnpm type-check` · `pnpm build` 통과(코드 변경이 발생한 경우에 한함 — 본 트랙은 뷰어 코드 무변경이 원칙).

---

## Consequences

- **얻는 것**: 서비스 안에서 세로 스크롤 iframe 도서가 54권 → **16권(전부 비노출)** 으로 줄어, 사용자가 보는
  Book Dash 도서는 **전권 수평 슬라이드**가 된다. 38권의 화질이 152권과 같아진다. 외부 GH Pages 종속이 38권만큼 사라진다.
  `book_text` 190권 확보로 TTS·하이라이트·완독 판정의 적용 범위가 넓어진다.
- **잃는 것/비용**: PDF 하베스트·렌더·업로드 파이프라인 재실행 비용(시간·Storage). 38권분 신규 객체 저장비.
  전환 후 페이지 번호 체계가 html 장면 번호와 달라진다(V1 주의 참조).
- **위험**: 전환 대상 38권 중 **기존 v1 오디오 보유 권**은 기존 `book_audio.page_index`가 새 페이지 체계와
  어긋난다(html 12장면 기준 → PDF 렌더 약 14면). **교집합 규모는 O2에서 실측됐으나, 처리 방안은 미확정이다.**
  **step3 전환 SQL 실행 전에 O2의 게이트(팀장 재확인 SELECT + 처리 방안 결정)를 반드시 통과해야 한다.**
- **되돌리기**: D4의 3중 백업으로 권 단위 원복 가능. 스키마 무변경이라 마이그레이션 되돌리기는 없다.

---

## Non-goals

- 블랙리스트 15권의 복구·해제(D1-c에서 이연). 그중 11권의 WP PDF 존재 여부 실검증도 포함.
- `maddy-moona`의 WP 카탈로그 제목 대조(hold 해제 조건).
- 전환 38권에 대한 **TTS 실행**(ADR-0053 규약 승계 후 별도 배치·별도 승인).
- 스프레드 좌/우 분할(D2에서 "분할하지 않음"으로 확정 — 분할을 하려면 별도 ADR).
- `HtmlReader` 코드 삭제. 블랙 15 + hold 1권이 남으므로 iframe 경로는 계속 필요하다.
- 회전 18권·오염 6권(ADR-0053 D1 사전 제외분)의 처리.

---

## Open 해소 현황 (2026-08-05 오케스트레이터 회신 반영)

| # | 주제 | 상태 |
|---|---|---|
| **O1** | 오디오 "128 → 최대 190권"의 산술 근거 | ✅ **해소** — D5에 회계 확정 |
| **O2** | 전환 38권 ∩ 기존 오디오 코호트 교집합 | ✅ **규모 실측 완료** / ⏸ **처리 방안 미확정 — step3 게이트 유지** |
| **O3** | V1 "페이지 수 일치"의 기준 정의 | ✅ **해소** — 3자산 정합으로 재정의 확정 |
| **O4** | 전환 후 슬라이드 총 수 | ⏸ **미해소** — D6 드라이런 산출로 확정(승인 조건 아님) |
| **O5** | 블랙리스트 15권의 근거 출처 | ✅ **해소** — `lib/shared/blacklist.ts` 인용으로 확정 |

> **채번 주의**: 오케스트레이터 회신의 네 번째 항목(블랙리스트 출처 확정)은 초안 O4(슬라이드 총 수)와
> 주제가 다르므로 **O5로 신규 채번**했다. 초안 O4는 소진되지 않았으며 아래에 그대로 남는다.

### O1. 오디오 상한 회계 — **해소**

"128 → 최대 190권"은 **본 ADR 단독 결과가 아니다.** 확정 회계는 **D5**에 기입했다.

- 본 ADR 38권 전환 완료 시 = **166권**(128 + 38).
- 회전 18권·오염 6권(ADR-0053 D1 사전 제외 24권) 복구까지 완료 시 = **190권**.
- 따라서 190 달성에는 **별도 복구 트랙 2건이 추가로 필요**하며, 둘 다 본 ADR의 Non-goals다.

### O2. 전환 38권 ∩ 기존 오디오 — **규모 실측 완료 · 처리 방안 미확정 (step3 게이트 유지)**

**초안의 문서 모순은 정정됐다.** `docs/recon/2026-07-28-html54-slide-feasibility.md` §5의
"비블랙 39권 중 44권"은 **모집단 표기 오류**다. 44권의 올바른 모집단은 **html 54권**이며
(ADR-0053 D1 표와 일치), "39권 중 44권"은 산술적으로 성립하지 않는다.

**워커 읽기 전용 실측 (2026-08-05, DB 쓰기 0 · Storage 접근 0)**

| 구분 | 권수 |
|---|---:|
| `content_type='html'` · `source_platform='book_dash'` | 54 |
| 그중 `book_audio` 보유 | **44** (전량 `voice='Ruth'`, 574행) |
| └ `page_index` 범위 | 42권 = `0..11`(12면) · 2권 = `0..12`(13면) |
| − 블랙리스트 15권 중 오디오 보유분 | 10 |
| − `maddy-moona`(hold, 오디오 보유) | 1 |
| **= 전환 대상 38권 ∩ 오디오 보유** | **33** |
| 전환 대상 중 무오디오 | **5** (`a-beautiful-day` · `a-dancers-tale` · `a-fish-and-a-gift` · `a-house-for-mouse` · `a-tiny-seed`) |

검산: 33 + 5 = 38 ✅ / 44 − 10 − 1 = 33 ✅

**이 수치는 확정이 아니라 게이트의 입력이다.** 전환 대상 38권의 확정 목록은 D6 드라이런 산출과 함께
고정되므로, **step3 실행 전에 팀장이 읽기 전용 SELECT 1건으로 재확인한다**(초안은 **부록 A**).

**미확정으로 남기는 것 — 처리 방안.** 겹치는 권은 기존 `book_audio.page_index`가 html 장면 번호
(권당 12) 기준이라 전환 후 PDF 렌더 면 번호(권당 약 14)와 어긋나 **엉뚱한 페이지에 붙는다.**
대응은 (가) 해당 권 오디오 폐기 후 danielle 재생성 / (나) `page_index` 재매핑 / (다) 해당 권을
전환 대상에서 제외 중 하나이며, **본 ADR은 이 선택을 하지 않는다.** 팀장의 재확인 SELECT 결과를
보고한 뒤 **오케스트레이터·팀장이 별도로 결정**한다.

> **게이트(불변)**: 이 결정이 내려지기 전에는 **step3 전환 SQL을 실행하지 않는다.**

### O3. V1 "페이지 수 일치"의 기준 정의 — **해소 (재정의 확정)**

V1은 **"전환 후 3자산(페이지 이미지 · `book_text` · 매니페스트) 사이의 정합"** 으로 확정한다.

**"전환 전후 페이지 수 보존"은 요구사항이 아니다.** 경로 (B)(WP PDF 재하베스트)를 채택한 이상
전환 전후 페이지 수는 **원리적으로 일치할 수 없다**(html 12장면 → PDF 렌더 약 14면). 보존이
요구사항이었다면 경로 (A)로 D2를 재검토해야 했으나, D2는 해상도 사유로 (A)를 기각했고 그 결정은 유지된다.

### O4. 전환 후 슬라이드 총 수 — **미해소 (D6 드라이런으로 확정)**

152권 코호트 규약(13 + 1 = 14면)을 적용하면 38권 × 14 = **532면**이 예상되나 이는 **추정치**다.
PDF 실물의 면 구성은 권마다 다를 수 있고, 정찰은 PDF를 열어보지 않았다(WP 카탈로그에 slug이 존재한다는
사실까지만 확인). **D6 드라이런 산출로 확정**하며, 그 숫자를 Amendment로 고정한다.
**본 항목은 Accepted의 조건이 아니다** — 드라이런은 DB·Storage 쓰기 0이며 후속 작업지시서 소관이다.

참고로 전환 전 html 장면 수는 정확히 **457장면**이다(비블랙 39권 469장면 − `maddy-moona` 12장면).

### O5. 블랙리스트 15권의 근거 출처 — **해소 (코드 인용으로 확정)**

- **단일 진실 공급원 = `lib/shared/blacklist.ts`의 `BOOK_DASH_404_SOURCE_IDS`** (source_id UUID 15건 +
  slug 주석). D1-a 표는 그 **사본**이며, 불일치 시 **코드가 우선한다.**
- 근거 ADR = ADR-0014 결정 2 + Amendment #2·#3·#5·#6. 차단 사유는 원본 `bookdash.github.io`의
  표지 또는 본문 이미지 404(15권 181장, 2026-06-11 전수 감사).
- **정찰 §6-4의 "15권 중 11권은 WP 카탈로그에 PDF가 있다"(미검증)는 본 ADR 범위 밖이다.**
  D1-c에서 이연한 대로 **별도 트랙으로 유지**한다 — 이 11권은 블랙리스트가 5개 표면에서 차단 중이라
  전환해도 사용자에게 노출되지 않으며, 블랙리스트 해제는 별도 판단 사안이다(Non-goals).

---

## 부록 A. O2 재확인용 읽기 전용 SELECT (step3 실행 전 · 팀장 1회 실행)

> **읽기 전용이다.** `SELECT`만 있으며 DB 쓰기·스키마 변경 구문은 없다.
> 워커는 **작성만** 하고 실행하지 않는다(ADR-0053 D6 승계 — DB 실행 주체는 팀장).
> 실행 위치는 Supabase SQL Editor다. 결과를 오케스트레이터에 보고한 뒤 O2 처리 방안을 결정한다.

```sql
-- ADR-0054 O2 재확인 (읽기 전용)
-- 전환 대상 38권 = book_dash html 54 − 블랙리스트 15 − maddy-moona(hold) 1
WITH targets AS (
  SELECT b.id, b.title, b.source_id, b.content_url
  FROM books b
  WHERE b.source_platform = 'book_dash'
    AND b.content_type    = 'html'
    AND b.source_id NOT IN (   -- lib/shared/blacklist.ts · BOOK_DASH_404_SOURCE_IDS (15건)
      '9ca00316-fe46-11e5-86aa-5e5517507c66',  -- the-lion-who-wouldnt-try
      '9c9eb452-fe46-11e5-86aa-5e5517507c66',  -- i-can-dress-myself
      '9c9eb574-fe46-11e5-86aa-5e5517507c66',  -- hugs-in-the-city
      '9c9fffba-fe46-11e5-86aa-5e5517507c66',  -- katiitis-song
      '9c9f4976-fe46-11e5-86aa-5e5517507c66',  -- hippo-wants-to-dance
      '9c9ffed4-fe46-11e5-86aa-5e5517507c66',  -- it-wasnt-me
      '9c9f4da4-fe46-11e5-86aa-5e5517507c66',  -- little-sock
      '9c9f41f6-fe46-11e5-86aa-5e5517507c66',  -- shongololos-shoes
      '9c9f450c-fe46-11e5-86aa-5e5517507c66',  -- springloaded
      '9c9ec05a-fe46-11e5-86aa-5e5517507c66',  -- the-elephant-in-the-room
      '9c9ebdc6-fe46-11e5-86aa-5e5517507c66',  -- what-is-it
      '9c9f471e-fe46-11e5-86aa-5e5517507c66',  -- when-i-grow-up
      '9c9f485e-fe46-11e5-86aa-5e5517507c66',  -- who-is-our-friend
      '9c9f5790-fe46-11e5-86aa-5e5517507c66',  -- the-best-thing-ever
      '9c9eb7e0-fe46-11e5-86aa-5e5517507c66'   -- mrs-penguins-palace
    )
    AND b.content_url NOT LIKE '%/maddy-moona/%'   -- D1-b hold 1권 제외
)
-- (1) 권별 상세 — 오디오 보유 여부 · voice · page_index 범위
SELECT
  t.title,
  t.content_url,
  COUNT(a.id)                                    AS audio_rows,
  COALESCE(STRING_AGG(DISTINCT a.voice, ','), '-') AS voices,
  MIN(a.page_index)                              AS page_index_min,
  MAX(a.page_index)                              AS page_index_max
FROM targets t
LEFT JOIN book_audio a ON a.book_id = t.id
GROUP BY t.id, t.title, t.content_url
ORDER BY audio_rows DESC, t.title;
```

```sql
-- (2) 요약 1행 — 전환 대상 권수 · 오디오 보유 권수 · 무오디오 권수 · 총 오디오 행수
WITH targets AS (
  SELECT b.id
  FROM books b
  WHERE b.source_platform = 'book_dash'
    AND b.content_type    = 'html'
    AND b.source_id NOT IN (
      '9ca00316-fe46-11e5-86aa-5e5517507c66','9c9eb452-fe46-11e5-86aa-5e5517507c66',
      '9c9eb574-fe46-11e5-86aa-5e5517507c66','9c9fffba-fe46-11e5-86aa-5e5517507c66',
      '9c9f4976-fe46-11e5-86aa-5e5517507c66','9c9ffed4-fe46-11e5-86aa-5e5517507c66',
      '9c9f4da4-fe46-11e5-86aa-5e5517507c66','9c9f41f6-fe46-11e5-86aa-5e5517507c66',
      '9c9f450c-fe46-11e5-86aa-5e5517507c66','9c9ec05a-fe46-11e5-86aa-5e5517507c66',
      '9c9ebdc6-fe46-11e5-86aa-5e5517507c66','9c9f471e-fe46-11e5-86aa-5e5517507c66',
      '9c9f485e-fe46-11e5-86aa-5e5517507c66','9c9f5790-fe46-11e5-86aa-5e5517507c66',
      '9c9eb7e0-fe46-11e5-86aa-5e5517507c66'
    )
    AND b.content_url NOT LIKE '%/maddy-moona/%'
)
SELECT
  (SELECT COUNT(*) FROM targets)                                        AS target_books,
  COUNT(DISTINCT a.book_id)                                             AS books_with_audio,
  (SELECT COUNT(*) FROM targets) - COUNT(DISTINCT a.book_id)            AS books_without_audio,
  COUNT(a.id)                                                           AS audio_rows_total
FROM targets t
LEFT JOIN book_audio a ON a.book_id = t.id;
```

**기대값(워커 2026-08-05 실측 기준)**: `target_books=38` · `books_with_audio=33` ·
`books_without_audio=5` · `voices` 전량 `Ruth`. **값이 다르면 그 자체가 정지 사유**이며,
차이 원인을 규명하기 전에는 step3로 넘어가지 않는다.

---

*ADR-0054 끝. Accepted 2026-08-05 — O1·O2(규모)·O3·O5 해소. 잔여 O2(처리 방안)·O4는*
*후속 작업지시서(드라이런 · 팀장 재확인 SELECT) 산출로 Amendment 고정한다.*
