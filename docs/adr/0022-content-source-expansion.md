# ADR-0022: 콘텐츠 소스 확장 — GDL 심화 + 순차 확장 원칙

**날짜** 2026-06-12
**상태** Accepted (계획 v2 1단계 · phase 외부 · 동반 문서 갱신은 후속 지시서)
**관련** `docs/adr/0004-source-platform-list.md`(§3.3 StoryWeaver/ASB "베타 후 검토" 보류 — 본 ADR로 해제), `docs/adr/0007-gdl-sync-strategy.md`(GDL 동기화 전략·`sync_gdl.py`), `docs/adr/0008-beta-content-target-900.md`(베타 목표 900권), `docs/guidelines/license-rules.md`(§1 허용 라이선스 화이트리스트 — 동반 갱신 예고), `PLAN.md` 4절(콘텐츠-기술 매트릭스)·12절(위험 요소), `claude.md` 2절 Hard Rule 2·3·8, `docs/backlog.md` §7.3(잔여 F-item)

---

## 1. 맥락

PM이 계획 v2를 확정(2026-06-12)하면서 **추가도서 확보를 베타 전 최우선 트랙**으로 격상했다(베타 상품성 강화). 본 ADR은 그 1단계로, 콘텐츠 소스 확장의 **순서·라이선스 적격성·중복 처리·큐레이션 정책 개정 방향**을 영구 기록한다. 구체 코드·스키마·`license-rules.md`·`PLAN.md` 본문 갱신은 본 ADR을 근거로 **후속 지시서**에서 수행한다(본 ADR은 문서 전용, 코드 0줄).

### 1.1 직전 실측 조사(2026-06-12, read-only)에서 확정한 사실

`https://content.digitallibrary.io/wp-json/content-api/v1/books/en` 전수 조회 결과:

- **GDL 영어 카탈로그 = 총 1,313권.** 라이선스 분포: `cc-by-4-0` 912 · `cc-by-sa-4-0` 20(변형 slug 포함) · `cc-by-3-0` 5 = **영리 사용 적격 약 937권** / `cc-by-nc-*`·`cc-by-nc-sa-*` 369권(상업 불가 — 트리거 자동 차단 대상).
- **현재 적재 842권** → 적격분 대비 **약 +95권 회복 여지**(주원인: `cc-by-3-0`가 현 license CHECK 화이트리스트에 부재 + 일부 slug 변형 `cc-by-sa-4-0-2` 미매핑).
- **GDL은 aggregator다.** `publisher` 필드 분포: **StoryWeaver 289 · 3asafeer 79 · African Storybook 34 · BookDash 33** · Google 10 · 기타 + 미표기 856. 즉 StoryWeaver/ASB/BookDash 콘텐츠 일부가 **이미 GDL 경유로 적재 가능**하다.
- **StoryWeaver 직접 API = Cloudflare 봇차단(403 Forbidden, "Just a moment…").** 공개 무인증 접근 불가.
- **Bloom Library = Parse 백엔드 존재하나 크리덴셜·약관 미검증**(probe 빈 응답/404).
- **African Storybook = 공개 REST API 부재**(404).

### 1.2 기존 보류 상태

ADR-0004 §3.3은 **African Storybook / Pratham StoryWeaver를 "라이선스 혼재 → 베타 후 별도 ADR로 검토 예정"으로 보류**했다. 계획 v2와 GDL aggregator 실측 발견으로 이 보류를 재검토할 근거가 생겼다.

---

## 2. 결정

### 2.1 ADR-0004 §3.3 "베타 후 검토" 보류 공식 해제

StoryWeaver·African Storybook의 콘텐츠 검토를 **베타 전 트랙으로 끌어올린다**. 사유: ① PM 계획 v2 결정(베타 상품성 강화) ② GDL이 이미 두 소스를 집계함을 실측으로 확인(라이선스 혼재 우려는 **책별 license 필드로 필터 가능**함이 입증됨 — §1.1).

### 2.2 1차 = GDL 심화 (즉시 · 무신규소스)

- **license CHECK 화이트리스트에 `cc-by-3-0` 추가.** 근거: CC BY 3.0은 **영리 사용·2차 저작(형식 변환·번역) 허용** + 어트리뷰션 의무가 CC BY 4.0과 동일 → 화이트리스트 적격. NC/ND 차단 원칙(Hard Rule 2·3) 무저촉.
- **slug 변형 매핑**: `cc-by-sa-4-0-2` 등 GDL 내부 변형 slug를 표준 `cc-by-sa-4-0`로 정규화.
- 효과: **842 → 약 937권**(목표 900 회복). `sync_gdl.py` 기존 패턴 재사용, **신규 source_platform 0건**.
- **license CHECK 변경은 스키마 변경(Hard Rule 8)** — 본 ADR이 그 선행 ADR이다. 실제 `ALTER`·`enforce_commercial_license` 트리거 화이트리스트 동기 갱신 + `license-rules.md` §1 표 갱신은 후속 지시서에서 수행(license-rules.md §1 화이트리스트에 `cc-by-3-0` 행 추가를 **동반 갱신으로 명시**).

### 2.3 2차 = StoryWeaver (공식 API 확보 선행)

- StoryWeaver는 영어 CC-BY 최대 풀(전체 ~40k+, GDL 경유분 289는 일부)이나 **직접 API가 Cloudflare 차단**.
- **선행 조건**: Pratham Books StoryWeaver의 **공식 bulk 다운로드 / 파트너 API / 데이터 덤프 확보.** **스크래핑·봇차단 우회·비공식 엔드포인트 접근은 금지**(이용약관·법적 위험).
- 확보 시: `source_platform` CHECK에 `storyweaver` 값 추가(ALTER + 트리거 화이트리스트 동기) → **후속 ADR 또는 본 ADR Amendment**로 처리. 라이선스는 책별 CC 필드 기반 필터(NC 제외).

### 2.4 3차 = Bloom Library (조건부)

- **조건**: Parse API 크리덴셜 확보 + 이용약관(상업적 재배포 허용 범위) 확인 + 책별 라이선스 메타 필터 가능성 검증.
- 조건 충족 시 2차와 동일 절차(`source_platform` ALTER + ADR/Amendment).
- ASB는 공개 API 부재로 **후순위**(필요 시 GDL 경유분 34권으로 갈음).

### 2.5 중복 제거(dedup) 원칙

GDL이 이미 집계한 StoryWeaver/ASB/BookDash 콘텐츠와 신규 소스 **직접 적재분이 중복**될 수 있다. `UNIQUE(source_platform, source_id)`는 **출처가 다르면 중복을 막지 못한다**(같은 책이 `gdl`·`storyweaver` 두 행으로 적재 가능). 따라서:

- 신규 소스 적재 시 **콘텐츠 단위 dedup**(제목+저자 정규화 또는 원본 식별자 대조)을 동기화 스크립트 단계에 둔다.
- 우선순위 규칙(예: 직접 소스 > GDL 경유, 또는 라이선스 관대순)은 구현 ADR에서 확정.

### 2.6 큐레이션 정책 개정 (전수 수동 → 표본 검수)

PM 결정 4번에 따라 큐레이션 정책을 개정한다:

- **기존**: 전수 수동 승인(소량 베타 전제).
- **개정**: **소스 신뢰도 기반 표본 검수 + 신고/즉시 차단 안전망.** 신뢰 소스(GDL·StoryWeaver 등 CC 검증된 aggregator)는 표본 추출 검수로 갈음하고, 사용자 신고 + admin 즉시 비활성(`is_active=false`) + 블랙리스트(`lib/shared/blacklist.ts`, cron-proof)를 안전망으로 둔다.
- **PLAN.md 12절 위험표 대응책 개정 예고**: "전수 수동 검수" 전제를 "표본 검수 + 신고 안전망"으로 갱신(후속 지시서).

---

## 3. 근거

- **GDL 우선**: 검증된 `sync_gdl.py` 패턴 재사용 → 신규 ADR 위험·anti-bot 우회 0건으로 즉시 +95권. 최저 비용·최저 위험.
- **순차 확보**: PM이 "1종씩 순차"로 확정 — 1종 검증 완료 후 다음 착수. 동시 다발 적재의 라이선스·중복·품질 리스크를 차단.
- **라이선스 적격성**: CC BY 3.0은 4.0과 동일하게 영리·2차 저작 허용 → 화이트리스트 적격. NC/ND는 트리거(Hard Rule 2)가 INSERT 자체를 차단하므로 코드 버그가 우회 불가.
- **합법 접근 원칙**: StoryWeaver 봇차단 우회 금지 — 공식 채널만 사용(법적·약관 리스크 회피). 키키북스의 "무료 합법 콘텐츠" 정체성 유지.

---

## 4. 결과

- **동반 갱신 예고(후속 지시서, 본 ADR 근거)**: `supabase/migrations/`(license CHECK + 트리거에 `cc-by-3-0` 추가) · `scripts/sync_gdl.py`(slug 변형 매핑) · `docs/guidelines/license-rules.md` §1(화이트리스트 `cc-by-3-0` 행) · `docs/adr/0004`(§3.3 보류 해제 Amendment + 추후 `storyweaver`/`bloom` 값) · `docs/adr/0008`(목표 권수 재확인) · `PLAN.md` 4절·12절.
- **목표치**: GDL 심화 842→약 937 + 자체 e-book 23권(ADR 별도 트랙) → 베타 노출 약 960권(ADR-0008 목표 900 초과 회복).
- **본 ADR 자체는 코드·스키마·연계 문서 변경 0건** — 결정 기록 전용.

---

## 5. 미반영 항목 (의도적 보류)

- **StoryWeaver/Bloom의 `source_platform` 값·라이선스 코드 확정** — 공식 API/크리덴셜 확보 후 후속 ADR/Amendment.
- **dedup 우선순위 규칙 상세** — 구현 ADR.
- **다국어 확장**(현 영어 베타 범위, ADR-0006) — 별도 결정.
- **큐레이션 표본 비율·신고 워크플로 상세** — admin 시스템 확장 ADR(ADR-0019 후속).

---

## Amendment #1 (순서4, 2026-06-15)

- **동반 갱신 대상 누락 보정**: §2.2·§83 목록에 `scripts/lib/attribution.py` `LICENSE_LABELS`가 빠져 있었음. 순서4에서 `cc-by-3-0` 적재 차단의 직접 원인이었음(어트리뷰션 라벨 미발급 → `AttributionError` → 미적재).
- **라이선스 화이트리스트는 실제 4곳에 분산됨을 명시**:
  - ① `scripts/sync_gdl.py` `ALLOWED_LICENSE_SLUGS`
  - ② DB CHECK 제약 + `enforce_commercial_license()` 트리거 (002 마이그레이션)
  - ③ `scripts/lib/attribution.py` `LICENSE_LABELS`
  - ④ `scripts/verify_gdl_sync.py` `ALLOWED_LICENSES`
  - 신규 적격 라이선스 추가 시 4곳 모두 동기화 필요.
- **순서4 실측 결과**: GDL is_active 851 / 전체 is_active 905 (베타 목표 900 +5).
- **연계 정정**: 본 Amendment를 근거로 `license-rules.md` §1·§3의 stale 기술("DB CHECK 대기"·"4종")을 DB 현실(5종, 002 적용 완료)에 맞춰 정정함.

---

*문서 끝.*
