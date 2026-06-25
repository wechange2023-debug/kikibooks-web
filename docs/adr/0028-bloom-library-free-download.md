# ADR-0028: Bloom Library 무료 다운로드 경로 도입 및 source_platform 'bloom' 추가

**날짜** 2026-06-25
**상태** Proposed
**관련** `docs/adr/0004-source-platform-list.md`(source_platform 화이트리스트) · `docs/adr/0022-content-source-expansion.md`(콘텐츠 소스 확장 원칙) · `docs/adr/0025-asb-content-ingestion.md`(African Storybook 도입 — 8번째 소스 추가 선례) · `docs/guidelines/license-rules.md` · `claude.md` 2절 Hard Rule 1·2·3

## 1. 맥락 (Context)

HelloKiki는 무료·합법 콘텐츠로 라이브러리를 확장 중이다. Book Dash 트랙
종료(활성 206권) 후 다음 소스로 Bloom Library(SIL 운영)를 검토했다.

- Bloom 운영주체 SIL의 Fraser Bennett 회신: openly licensed 책은 어트리뷰션
  조건 하에 자유롭게 다운로드·재배포 가능.
- 접근 경로 두 가지: (a) OPDS API 유료(연 $500) / Enterprise($3000),
  (b) 무료 개별 다운로드(PDF·ePUB).
- ⚠️ Bloom 라이선스는 제각각이다: CC BY / BY-SA / BY-NC / BY-SA-ND /
  BY-NC-ND 혼재. NC·ND 비율이 상당해 필터링이 도입의 핵심 관문이다.
- 품질 편차도 크다.

## 2. 결정 (Decision)

### D1 — 무료 개별 다운로드 경로 채택
Bloom 콘텐츠를 (b) 무료 개별 다운로드(PDF·ePUB) 경로로 탑재한다.
유료 OPDS API($500/Enterprise $3000)는 보류하며, 규모 확장 시 재검토한다.

### D2 — source_platform에 'bloom' 추가 (9번째 소스)
books.source_platform 화이트리스트에 'bloom'을 추가한다. ADR-0004의
7종 원문은 그대로 두고, 본 ADR이 9번째 값을 누적한다(ASB를 ADR-0025로
8번째 추가한 선례와 동일 방식). 실효 화이트리스트: 기존 8종 + bloom = 9종.
DB CHECK 제약 / attribution.py PLATFORM_LABELS / sync 스크립트 화이트리스트
등 코드·DB 반영은 후속 작업에서 수행한다(본 ADR은 결정 근거를 박제).

### D3 — NC/ND 차단은 기존 방어선에 의존
Bloom의 핵심 리스크인 NC·ND 혼재는 기존 license-rules.md 블랙리스트와
enforce_commercial_license 트리거가 이미 100% 차단한다. 별도 라이선스
규칙 추가 없이 기존 방어선을 그대로 재사용한다. 허용 화이트리스트(현 5종:
cc-by-4-0 · cc-by-sa-4-0 · cc-by-3-0 · cc0 · public-domain) 외 전부 차단.

### D4 — 라이선스 화이트리스트 4개소 동시 갱신 규율 적용
Bloom용 sync 스크립트 신설 시, 라이선스 화이트리스트는 4개소
(sync 스크립트 ALLOWED 슬러그 / DB CHECK+트리거 / attribution.py
LICENSE_LABELS / verify_licenses.py)를 동시 갱신하는 기존 규율을 따른다.

### D5 — 스테이징 후 검수 강화 → 일괄 활성화
Bloom 콘텐츠는 is_active=false로 스테이징한 뒤, 품질 편차가 크므로
시각 검수를 강화한다. 검수 통과분만 일괄 is_active=true로 공개한다.

### D6 — 어트리뷰션 4요소 필수
모든 Bloom 책은 어트리뷰션 4요소(제목·저자·라이선스·출처 URL)를
채운다. attribution_text는 NULL 불가(Hard Rule 1).

## 3. 결과 (Consequences)

### Positive
- 초기 비용 0 유지(유료 API 보류). 베타에 필요한 권수 확보 가능.
- NC/ND 방어선·어트리뷰션 장치를 기존 그대로 재사용 → 신규 리스크 최소.
- 향후 OPDS API 전환 여지를 열어둠.

### Negative
- 라이선스가 제각각이라 NC/ND 수동 필터링 부담이 크다.
- 품질 편차로 시각 검수 비용 증가.
- 개별 다운로드 방식이라 대량 자동화에 제약(API 대비 수집 효율 낮음).

## 4. 후속 (Follow-up)
- Bloom 수집 정찰: NC/ND 제외 후 영어 3–7세 대상 실제 권수 추정
  (전량 드라이런을 적재 전 게이트로).
- sync_bloom.py 신설 검토 + 화이트리스트 4개소 동시 갱신.
- source_platform 'bloom' 코드·DB 반영(DB CHECK / attribution.py 등).
- Fraser가 언급한 Pratham(StoryWeaver) 콘텐츠공유 협약 — 향후 연결고리로 추적.

## 5. 상호 참조
- ADR-0004 — source_platform 화이트리스트(7종 원문 유지)
- ADR-0022 — 콘텐츠 소스 순차 확장 원칙
- ADR-0025 — African Storybook 도입(8번째 소스 추가 선례)
- docs/guidelines/license-rules.md — NC/ND 차단 블랙리스트
- claude.md Hard Rule 1(attribution NOT NULL)·2(트리거 보존)·3(NC/ND 금지)

## Amendment #1 (2026-06-25) — cc-by 라이선스 버전 매핑 규칙 확정

### 배경
ADR-0028 본문 D2·D3 작성 시점에는 Bloom의 license 필드가 버전 없는
"cc-by"로만 저장돼 있어, 우리 화이트리스트(버전 명시: cc-by-4-0 등)와의
매핑 규칙이 미확정 상태였다. 이를 실측으로 확정한다.

### 실측 근거
1. libpalaso 소스(Bloom이 라이선스 URL을 생성하는 오픈소스 라이브러리):
   - sillsdev/libpalaso · SIL.Core/ClearShare/CreativeCommonsLicenseInfo.cs
     kDefaultVersion = "4.0" (버전 미지정 시 기본값 4.0 적용)
   - "3.0"은 IGO(정부간기구) 변종(/by/3.0/igo/) 전용이며 일반 cc-by와 무관.
   - 일반 라이선스의 3.0→4.0 마이그레이션 흔적 없음(기본값 자체가 4.0 고정).
2. 실제 책 패키지 HTML에 박힌 라이선스 URL:
   - 표본 3건(© 2014 Book Dash / © 2014 African Storybook / © 2016) 모두
     creativecommons.org/licenses/by/4.0 확인. 연도별 3.0/4.0 분기 없음.
   - ※ 표본 3건 한정 — 전권 일반화는 미검증. 따라서 아래 안전장치를 둔다.

### 결정 (매핑 규칙)
| Bloom license 값 | 우리 DB 표기 | 적재 조건 |
|---|---|---|
| cc-by | cc-by-4-0 | 책 HTML 라이선스 URL이 /by/4.0/ 일 때만 적재 |
| cc-by-sa | cc-by-sa-4-0 | 책 HTML 라이선스 URL이 /by-sa/4.0/ 일 때만 적재 |
| cc0 | cc0 | 그대로 적재(버전 개념 없음) |
| cc-by-nc*, *-nd*, custom 등 | — | 제외(기존 NC/ND 차단 + custom 개별 보류) |

### 안전장치 (소량 표본 일반화 금지 규율 준수)
- 적재 시 각 책의 실제 HTML 라이선스 URL을 파싱해 버전을 검증한다.
- 기대 버전(/by/4.0/ 또는 /by-sa/4.0/)이 아닌 값(예: /by/3.0/, IGO 변종)이
  감지되면 그 책은 적재하지 않고 스킵 로그에 남긴다.
- 이로써 표본에 없던 버전 예외가 있어도 잘못된 라이선스 표기가 원천 차단된다.

### 영향
- sync_bloom 스크립트는 위 매핑 + URL 버전 검증 로직을 포함해야 한다.
- 라이선스 화이트리스트 4개소(sync ALLOWED / DB CHECK+트리거 /
  attribution.py LICENSE_LABELS / verify_licenses.py)는 이미 cc-by-4-0·
  cc-by-sa-4-0·cc0를 포함하므로 라이선스 슬러그 추가 갱신은 불요.
  (source_platform 'bloom' 추가만 별도 후속 작업)

## Amendment #2 (2026-06-25) — sync_bloom 수집·적재 파이프라인 설계

### 배경
정찰(STEP3~9) 완료로 Bloom 수집·적재 설계 재료가 확정됐다. 본 Amendment는
sync_bloom 스크립트가 따를 파이프라인을 박제한다. 핵심: 신규 발명 없이
Book Dash Scheme B 파이프라인(asb_native 재사용)을 그대로 재적용한다.

### 1. 수집 (Parse API)
- 엔드포인트: bloom-parse-server-production.azurewebsites.net/parse/classes/books
  인증 헤더: X-Parse-Application-Id (Bloom 공개 App-Id, 비밀키 불요).
- 필터(서버측 where):
  - 언어: langPointers $inQuery {isoCode:"en"} (영어 표제 objectId가 번역명으로
    분산되므로 단일 ID 금지, $inQuery 필수).
  - 라이선스: cc-by / cc-by-sa / cc0 만 통과. NC·ND·custom 전부 제외.
  - custom(약 1,429 전체)은 licenseNotes 개별판정 필요 → 1차 적재 제외(베타 후 별도 트랙).
- 1차 배치 범위: 영어 + cc-by + tags="computedLevel:1" 또는 "computedLevel:2"
  (유아 타깃, 약 1,056권). 레벨 3·4·cc-by-sa·cc0는 후속 배치로 단계 확장.

### 2. 라이선스 매핑 (Amendment #1 연계)
- cc-by → cc-by-4-0, cc-by-sa → cc-by-sa-4-0, cc0 → cc0.
- 안전장치: 각 책 HTML(index.htm 또는 {title}.htm)의 실제 라이선스 URL을
  파싱해 /by/4.0/ (또는 /by-sa/4.0/) 확인. 불일치(/by/3.0/·IGO 등) 시 스킵+로그.

### 3. 교차중복 제거 (2단 필터)
- 1단: tags의 list:Book Dash / list:African Storybook 제외(기존 보유 사본).
- 2단: 정규화 title 교차대조(기존 ASb·Book Dash sync 방식 재사용) —
  태그 없는 사본 및 GDL 중복(list 태그 0건)까지 포착.
- ※ list:Pratham(약 366)은 우리 미보유 → 중복 아님, 적재 대상.

### 4. 매니페스트 합성 (asb_native 재사용 — AsbReader/parser 변경 0건)
- Book Dash Scheme B와 동형 파이프라인:
  bloomdigital/ 페이지 이미지 URL을 index.htm DOM 순서로 추출
  → build_manifest_from_urls 류로 합성 .txt 매니페스트 생성(images: 섹션)
  → book-manifests Storage 업로드 → content_url = 그 Public URL.
- 페이지 순서: 파일명 숫자정렬이 아니라 index.htm DOM 순서를 권위로 사용
  (ASb 교훈: 강제 정렬 금지·원본 순서 보존).
- 표지: coverImage200.jpg 등 별도 → cover_url에 매핑(pages에 미포함).
- content_type = 'asb_native'.

### 5. source_platform 'bloom' 추가
- ADR-0028 D2 결정대로 9번째 소스. 코드·DB 반영 필요 개소:
  DB CHECK 제약(+트리거 화이트리스트) / attribution.py PLATFORM_LABELS.
  ※ 라이선스 화이트리스트(4개소)는 cc-by-4-0·sa-4-0·cc0 이미 포함 → 추가 불요.
  ※ source_platform 추가는 스키마 변경 → 본 ADR이 그 근거(Hard Rule 8 충족).

### 6. 적재 절차
- is_active=false 스테이징 → 시각 검수 강화(품질 편차 큼) → 일괄 is_active=true.
- 1권 정찰 적재 → 눈으로 확인 → 나머지 배치 패턴 준수.
- 어트리뷰션 4요소(제목·저자·라이선스·출처 URL) 필수, attribution_text NULL 불가.

### 미해결 / 후속
- index.htm DOM 파싱의 전권 정합성은 1차 배치 드라이런으로 검증(표본 1권만 확인됨).
- custom 라이선스 영어분 규모·판정: 베타 후 별도 트랙.
- ePUB/PDF 경로는 본 설계에서 미사용(이미지 시퀀스 채택). 향후 필요 시 재검토.

## Amendment #3 (2026-06-25) — 비그림책·AI생성 콘텐츠 품질 게이트

### 배경
조각4-a 첫 1권 적재 검증 중, 적재된 책이 언어학습 게임 + AI생성 이미지
(author "Google Gemini AI", 이미지명 Gemini_*)로 드러났다. 전량 드라이런
(STEP16)에서도 비그림책 의심 76/780이 집계됐다. 1차 배치 품질 게이트를 확정한다.

### 결정 (차등 처리)
1. 자동 제외 (오탈락 위험 낮은 명확 시그널):
   - AI생성 이미지: 매니페스트 이미지 URL에 Gemini_ / AI_Generated 등
     AI생성 도구 시그널이 포함된 책. (author에 "AI" 표기 동반 시 가중)
   - 명백한 테스트물: title이 "test ..."·"Test Bloom Games"·"... Test"·
     "Testing Book" 등 콘텐츠가 아닌 테스트 산출물.
   → 적재 단계에서 자동 스킵 + 스킵 로그(사유 기록).
2. 검수 리스트 분리 (자동제외 안 함 — 오탈락 위험):
   - 제목 시그널(Unit/Phase/Game/Lesson/Quiz/Worksheet)·topic:Math/Science 등.
   - 자동 제외하지 않고 별도 검수 우선 리스트로 분리 → D5 시각검수에서 판정.
   - 사유: "One Two Three"(정상 숫자 그림책)처럼 정상 콘텐츠 오탈락 가능.

### 근거
- AI생성 이미지·테스트물은 기계적 시그널이 명확하고 한국 유아 영어 그림책
  플랫폼 품질에 명백히 부적합 → 자동 제외 안전.
- 제목/topic 시그널은 정상 그림책과 혼재 → 사람 검수가 정확.

### 영향
- sync_bloom 조각4에 자동제외 필터 + 검수 리스트 분리 로직 추가.
- 자동제외 적용 후 1차 배치 실제 권수는 드라이런 재집계로 확정(STEP18).
