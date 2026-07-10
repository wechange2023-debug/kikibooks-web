# Book Dash 전권 전환 — 모집단·이미지·비용 실측 (2026-07-09)

> 작업지시서 2026-07-09 (7)의 정찰 결과. 탐침은 2026-07-09 완료, 본 문서는
> 지시서 2026-07-10 (1) STEP 5에 따라 확정 기입. 읽기 전용 정찰 — DB·Storage·코드 변경 0건.

## 0. 팀장 결정 (H1~H5, 확정 — 재론 금지)

- **H1** Book Dash 전권 서비스를 목표로 한다.
- **H2** 이미지 baked-in 텍스트를 허용한다 — 이전 "결손 15권 포기"를 철회.
  ADR-0035 Amd#1 **A2(무텍스트 전제)는 수정 대상**.
- **H3** 품질 기준 = 배제 기준(어휘/주제/삽화 3축).
- **H4** 뷰어 = A안(이미지 아래 분리 텍스트 레이어 + marks 하이라이트) 유지.
- **H5** OCR·인페인팅은 하지 않는다.
  (H5의 레포 내 출처 규명·OCR 정확도 실측: `docs/recon/2026-07-10-ocr-provenance-and-accuracy.md`)

## 1. STEP 1 — 언어 taxonomy 규명 (판정 EN1)

- `GET /wp-json/wp/v2/taxonomies` → `languages` taxonomy rest_base 확인 후 term 직접 조회:
  - term **621** = `{"id": 621, "name": "English", "slug": "eng", "count": 206}`
  - term **643** = `{"id": 643, "name": "Wordless", "slug": "zxx", "count": 16}`
- `scripts/sync_book_dash_v2.py:59-69` — `ENGLISH_LANG_TERM = 621`, 수집 필터는
  `languages=621` 단일 조건(:107-141 `fetch_english_slugs`, per_page=100 페이지네이션, 기타 조건 없음).
  → **Wordless 16권은 v2 수집에서 구조적으로 배제**된다.
- **판정 EN1**: 621 = 영어 본편(206권), 643 = Wordless(16권). "WP 부재"로 보였던
  springloaded·i-can-dress-myself는 부재가 아니라 **Wordless 태그**였다.

## 2. STEP 2 — WP 영어 전량 206권 ↔ v1 대조

- WP 영어(621) 전량 = **206권**(X-WP-Total=206). slug·id·title·featured cover 수집
  (로컬 `wp_english_catalog.json`, 임시 경로 — 미커밋).
- v1 54 slug 대조:
  - **동일 slug 매핑 49** / **drift 매핑 3**(little-sock→little-sock-and-the-tiny-creatures,
    mrs-penguins-palace→mrs-penguins-perfect-palace, maddy-moona→maddy-moonas-menagerie)
  - **미매핑 2** = springloaded·i-can-dress-myself(= Wordless 643, 206 밖)
- **WP-only(신규) 154권** = 206 − (49 + drift 신slug 3).
- blacklist 15 중 **13권이 206에 포함**(미포함 2 = 위 Wordless 2권).
- DB 대조: DB 직접 조회는 미실행(3자 구조상 SQL은 팀장 실행). 기존 실측으로 book_dash
  209행 = v1 UUID 54 + v2 slug 155. v2 155 ↔ WP 206의 정확한 차분은 **미확인**.
- ★ **코호트 판별 주의**: `length(source_id)=36`은 UUID 판별에 쓸 수 없다 —
  slug `thats-not-thabi-thats-a-hippopotamus`가 정확히 36자. 정확한 분할 =
  **v1 UUID 54 / v2 slug 155(활성 152 + 비활성 3)**. 향후 `^[0-9a-f]{8}-` 패턴으로 판별할 것.

## 3. STEP 3 — 이미지 소스 실존 (이미지 확보 206/206, 확보 불가 0권)

- 실행: 대조군 a-tiny-seed GH cover+01~12 **전부 200 PASS** 후 신규 157권(WP-only 154
  + drift 신slug 3) 탐침. GH 우선(HTML HEAD + 01.jpg HEAD) → 404 시 WP 폴백
  (책 페이지 GET → `#read-book` data-src 추출(ADR-0027 Amd#4 레시피) → cover+본문 전량 HEAD).
  **총요청 3,001건**(상한 3,000 운용), 0.6s 간격, 다운로드 0건.
- 신규 157권: **GH 0 / WP만 157 / 없음 0** (GH HTML 200 = 0/157, GH 이미지 0/157,
  WP는 cover·본문 전량 200).
- 206 모집단 분류(기실측 재사용 포함):

| 소스 | 권수 | 구성 |
|---|---|---|
| GH(버킷 기확보, 무텍스트) | **39** | 정예 38(동일 slug) + maddy-moona(drift) |
| WP만(baked-in) | **167** | WP-only 154 + 표지만 9(동일 7 + drift 2) + 무텍스트책 4 |
| 확보 불가 | **0** | — |

- 장수 분포(WP 신규 157): **153권 13~35장**(평균 15.1) + **the-baby-book 1장**
  (불완전 카탈로그 의심 — 아래 mogaus-gift 전례 참조) + drift 3권 13~14장.
- 특기:
  - **mogaus-gift: 6/23 드라이런 1장 → 7/09 14장 전 200** — WP 카탈로그가 보수되고
    있다(살아있는 카탈로그). the-baby-book도 동일 경과 가능성.
  - **the-three-doof-doofs 35장 · my-special-hair 34장** — ADR-0035 Amd#5 드라이런
    이상치와 일치(중복 세트 혼입 의심, 편입 시 gate 검증 대상).

## 4. STEP 4 — 텍스트 자산 실존 (텍스트 원천 보유 48권)

- 텍스트 JSON(`scripts/tts_pilot/out/{slug}.json`) 보유: **206 중 48권**
  = 정예 39 + 표지만 9 (drift 3권은 구 slug JSON으로 커버됨).
- 신규 157권 GH HTML 200 = **0건** → **WP-only 154권은 텍스트 원천 없음**
  (WP판은 텍스트가 이미지에 인쇄됨).
- v1 무텍스트책 4권(the-lion-who-wouldnt-try·hugs-in-the-city·katiitis-song·it-wasnt-me):
  GH HTML은 200이나 본문 텍스트 0 — 원래 글 없는 책인지 여부는 **미확인**(WP판 육안 필요).
- ★ 정밀 분해(판정줄 "없음 157"은 신규 157 기준 표현): **보유 48 / 원천 없음 154 /
  무텍스트책 4 = 합 206**. 사람 작성 대상은 157이 아니라 **154권**이다(drift 3권 JSON 보유).
- 206 밖 Wordless 2권: springloaded는 alt 텍스트 JSON(12면) 보유, i-can-dress-myself는 없음.

## 5. STEP 5 — TTS 비용 계산 (AWS 호출 0건)

- 보유 JSON 49권 전량(48 + springloaded) 실측: **총 82,795자**, 책당 평균 1,689.7자
  (min 379 sbus-special-shoes / max 9,516 together-were-strong).
- 단가: Polly Neural **$16/100만 자**(`scratchpad/RESUME_tts.md:10` 기록.
  ADR-0023 :131-135에는 엔진·보이스 확정만 있고 단가 수치는 없음).
- **신규 TTS 필요 = 0자, $0** — H5(OCR 안 함) 하에서 텍스트 원천 없는 154권은
  낭독 생성 자체가 불가하므로 비용이 발생하지 않는다.
- 참고 외삽: 154권 텍스트를 사람이 작성할 경우 약 33.0만 자
  (2,316면 × 페이지당 평균 142.6자) → TTS 약 **$5.3** 규모.

## 6. 최종 요약

| 구분 | 권수 |
|---|---|
| 이미지 ∧ 텍스트 (자막·오디오 가능 후보) | **48** |
| 이미지만 (H5 유지 시 자막·오디오 불가) | **158** (원천없음 154 + 무텍스트책 4) |
| 확보 불가 | **0** |
| 계 | **206** |

(+ 206 밖 Wordless 2권도 WP 이미지 생존 — 편입 여부는 별도 안건)

**판정줄**: STEP1 = EN1 · STEP2 = 영어 전량 206권 · STEP3 = GH 39 / WP만 167 / 없음 0
(신규 탐침 157: GH 0 / WP 157 / 없음 0, 총요청 3,001) · STEP4 = 텍스트원천 보유 48권
· STEP5 = 신규 0자, $0

## 7. 후속 이관

OCR 금지(H5)의 출처 규명과 OCR 정확도 실측, 사람 작성 작업량 산정은
`docs/recon/2026-07-10-ocr-provenance-and-accuracy.md`로 이관. ADR 개정
(ADR-0035 Amd#1 A2 / ADR-0038 / ADR-0036 Amd#2의 H2 반영)은 다음 세션 안건.

*문서 끝.*
