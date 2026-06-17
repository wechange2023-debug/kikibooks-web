# ADR-0025: African Storybook 콘텐츠 적재

**날짜** 2026-06-17 (2026-06-17 PM 승인)
**상태** Accepted (ADR-0022 Amendment #2의 구현 ADR · 실제 적재는 본 ADR 확정 후 마이그레이션 ADR + 작업지시서)
**관련** `docs/adr/0022-content-source-expansion.md`(본 ADR은 그 Amendment #2의 구현 ADR), `claude.md` 2절 Hard Rule 3(CC BY-NC·BY-ND 적재 금지)·Hard Rule 8(스키마 변경 시 ADR 선행), `supabase/migrations/001_initial_schema.sql`(`source_platform` CHECK), `scripts/verify_licenses.py`(라이선스 게이트), `scripts/lib/attribution.py`(`PLATFORM_LABELS`), `docs/backlog.md` §7.4 (i)·(j)

---

## 1. 맥락 (Context)

- ADR-0022 Amendment #2가 **"측정 보류"로 남긴 ASb 영어×CC BY 정확권수를 박제 완료**했다(`docs/backlog.md` §7.4 (j), 커밋 `0c6bf9a`): **영어 전체 2,880 / 적격(NC·ND 제외) 2,795 / GDL 중복 33 차감 시 순증 상한 ≈ 2,762**.
- **적격 내역**: CC BY 4.0 = **2,537**, CC BY 3.0 = **258**. NC 변종 **4표기 합 85 = 배제**.
- **데이터 원천**: GitHub `global-asp/asp-raw-db` (default branch `master`), `data/<id>.txt` **평면 단일 txt**, 메타 헤더 **탭구분 key:value**(필드: `lang`/`lic`/`artist`/`author` 등). **`lic` 값은 SPDX 코드가 아닌 자연어 문자열**(예: `Creative Commons: Attribution 4.0`).
- **현재 스키마/스크립트 정합 이슈 2건(recon 발견)**:
  - (i) `source_platform` CHECK(`001_initial_schema.sql`)에 **ASb 값 부재**.
  - (ii) `verify_licenses.py` `ALLOWED_LICENSE_SLUGS`에 **`cc-by-3-0` 누락** → ASb CC BY 3.0 **258권**이 사후 감시에서 부적격 처리될 위험.

---

## 2. 결정 (Decision)

### D1 — `source_platform` 신규값 추가

`'african_storybook'`을 추가한다. **신규 마이그레이션 파일(다음 번호)**로 001의 CHECK 제약을 `ALTER`하며, 트리거 `DROP`/`DISABLE` 없이(Hard Rule 2) **제약만 교체**한다.

### D2 — 화이트리스트 2곳 동시 갱신

DB CHECK(마이그레이션)와 `scripts/lib/attribution.py`의 `PLATFORM_LABELS`에 `'african_storybook'` → 표시라벨 `'African Storybook'`을 **같은 작업 단위에서** 추가한다.

### D3 — 라이선스 게이트 확장

`verify_licenses.py`에:
- (a) `ALLOWED_LICENSE_SLUGS`에 **`cc-by-3-0` 추가**.
- (b) ASb **자연어 `lic` 문자열 → slug 정규화 파서 신설**(예: `"Creative Commons: Attribution 4.0"` → `cc-by-4-0`, `"Attribution 3.0"` → `cc-by-3-0`).
- (c) NC/ND **부분문자열 배제**는 ASb 측정에서 검증된 매칭(`'non commercial'`, `'noncommercial'`, `'non-commercial'`, `'no deriv'`, `'noderiv'`, `'no-deriv'`, `' nc'`, `'-nc'`, `' nd'`, `'-nd'`) 재사용.

### D4 — staging 적재

`sync_asb.py`는 **`is_active=false`로 적재**한다(기존 sync들의 `True` 하드코딩과 달리). 검수 후 별도 단계에서 공개.

### D5 — dedup

GDL 경유 ASb **33권**은 `source_id` 기준 차감하여 **중복 적재하지 않는다**.

### D6 — illustrator 누락 232권 처리

**232권도 적재한다.** `artist` 빈 값은 attribution 상 illustrator를 **'미상'으로 표시**하며, `author` 기준 저작자표시로 **CC BY 의무를 충족**한다. illustrator 보완은 적재 후 **후속 과제**로 둔다.

### D7 — 적재 범위

`lang` 정확표기 **`'English'` AND 게이트 적격 권만**. 번역본/타 언어 스킵.

---

## 3. 결과 (Consequences)

### Positive

- 순증 상한 **≈2,762권**으로 현 905권 대비 **약 4배 확장**. PM 최우선 목표(콘텐츠 최대 확보)에 직접 기여.

### Negative / 주의

- ASb 라이선스 **자연어 파서는 신규 표기 등장 시 누락 위험** → 파서는 **미매칭 `lic`를 '부적격(차단)'으로 기본 처리(fail-safe)**.
- **232권 illustrator 누락은 품질 부채로 잔존**.
- 실제 적재 전 **이미지 가용성·연령 적합성 검수**는 D4 staging 이후 별도.

---

## 4. 후속 트리거

- 본 ADR **Accepted 시** → (1) 마이그레이션 ADR/파일 작성 작업지시서 → (2) `verify_licenses.py` 게이트 확장 → (3) `sync_asb.py` 신설 순서로 진행.
- 적재 후 → `is_active=false` staging분 검수 → 공개 승인.

---

## 5. 상호 참조

- `docs/adr/0022-content-source-expansion.md` Amendment #2 — 본 ADR의 상위 설계.
- `docs/backlog.md` §7.4 (j) — ASb 정밀측정 박제.
- `supabase/migrations/001_initial_schema.sql` — `source_platform` CHECK.
- `scripts/verify_licenses.py` — 라이선스 게이트.
- `scripts/lib/attribution.py` — `PLATFORM_LABELS`.

---

## Amendment #1: 마이그레이션 명세 (source_platform enum 확장)

**상태** Accepted (2026-06-17)
**근거** D1 구현. Hard Rule 8(스키마 변경 ADR 선행) 충족. 별도 ADR 신설 대신 002 라이선스 추가가 ADR-0022 Amendment로 처리된 선례를 따름.

### 결정

- **A1.** 신규 마이그레이션 파일(다음 번호, 예: `003_add_african_storybook_platform.sql`)을 생성해 `source_platform` CHECK 제약에 `'african_storybook'`을 추가한다.
- **A2.** 변경 방식은 001/002의 기존 패턴을 따른다. **001의 `source_platform` CHECK는 인라인 '무명' 제약**(PostgreSQL 자동 제약명 부여)이므로, **002 `license` 변경과 동일하게** `pg_constraint`에서 해당 무명 CHECK를 동적으로 찾아 DROP한 뒤 **named constraint로 재추가**한다. 탐색 키는 `source_platform` 화이트리스트에만 등장하는 고유 리터럴(예: `'book_dash'`)로 한다(다른 CHECK 오매치 방지). **트리거 `DROP`/`DISABLE` 없음**(Hard Rule 2) — `source_platform`에는 연결 트리거가 없고, `license`의 `enforce_commercial_license` 트리거는 본 변경 대상이 아니므로 무저촉. 멱등(재실행 시 재생성한 named 제약도 함께 DROP). 형태:

  ```sql
  -- (a) 무명 source_platform CHECK 동적 DROP (002 DO 블록 패턴 재사용)
  DO $$
  DECLARE
    v_conname text;
  BEGIN
    FOR v_conname IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.books'::regclass
        AND contype  = 'c'
        AND pg_get_constraintdef(oid) LIKE '%book_dash%'
    LOOP
      EXECUTE format('ALTER TABLE public.books DROP CONSTRAINT %I', v_conname);
    END LOOP;
  END $$;

  -- (b) named constraint로 재추가 (기존 7값 + african_storybook)
  ALTER TABLE public.books
    ADD CONSTRAINT books_source_platform_whitelist_chk
    CHECK (source_platform IN (
      'book_dash',
      'gdl',
      'librivox',
      'pg',
      'jybooks',
      'wjjr',
      'magic_light',
      'african_storybook'
    ));
  ```

- **A3.** 적용 순서(고정): **마이그레이션 SQL 파일 작성 → 레포 push → PM이 Supabase SQL Editor에서 직접 적용 → 그 후에만** `attribution.py` `PLATFORM_LABELS` 갱신 및 `sync_asb.py` 착수.
- **A4.** 동시 갱신 2곳 재확인: ① DB CHECK(이 마이그레이션) ② `scripts/lib/attribution.py` `PLATFORM_LABELS`. 두 곳이 어긋나면 attribution 빌드 실패로 적재 skip되므로 **같은 PR 묶음에서 처리**.

### 결과 (Consequences)

- **Positive**: enum 확장으로 ASb 적재 차단 해제. 기존 데이터·트리거 무영향(제약 확장만).
- **주의**: 마이그레이션은 **PM이 Supabase에 직접 적용해야 효력 발생**(코드 push만으로는 DB 미반영). 적용 전 `sync_asb.py` 실행 시 CHECK가 ASb 행을 거부함 — **순서 A3 엄수**.

---

## Amendment #2: D3 라이선스 정규화기 구현 위치

**상태** Accepted (2026-06-17)
**근거** D3 구현 착수 시 결정. D3·D4(`sync_asb.py`)가 동일한 ASb 자연어 `lic`→slug 변환을 필요로 하므로, 단일 출처(single source of truth) 원칙상 공용 모듈로 분리한다.

### 결정

- **A1.** ASb 자연어 `lic`→slug 정규화 함수는 `scripts/lib/` 하위 **공용 모듈**에 둔다(예: `scripts/lib/license_normalize.py`). `verify_licenses.py`(D3)와 `sync_asb.py`(D4)가 이를 동일하게 import 하여 사용한다.
- **A2.** 이로써 D3 본문의 "`verify_licenses.py`에 파서 신설" 문구는 "**공용 모듈 신설 + `verify_licenses.py`가 import**"로 갱신 해석한다.
- **A3.** 정규화 규칙(**NC/ND 우선 차단 → attribution 4.0/3.0 매핑 → 미매칭 `None` 차단, fail-safe**)은 D3·D4 공통.
- **A4.** `cc-by-3-0`의 `ALLOWED_LICENSE_SLUGS` 추가는 `verify_licenses.py` 내 기존 위치에 그대로 적용(공용 모듈과 별개).

### 결과 (Consequences)

- **Positive**: ASb 라이선스 표기 추가/변경 시 한 곳만 수정 → D3·D4 자동 정합. NC/ND 차단 로직 분산 방지.
- **주의**: 공용 모듈 import 경로 정합 필요. 신규 표기 등장 시 미매칭=차단이라 적격 책이 누락될 수 있음 → 누락분은 sync 로그로 관찰.

---

## Amendment #3: ASb 콘텐츠 렌더 방식 — 자체 렌더 결정

**상태** Accepted (2026-06-17)
**근거** ASb는 임베드용 `content_url`이 없고 텍스트+페이지 이미지 조각만 보유. africanstorybook.org 리더 임베드는 기술적으로 가능(차단 헤더 전무·CORS 개방)하나 (i)제3자 Google Analytics가 유아 화면에서 발화(아동 데이터 리스크) (ii)외부 사이트 가용성·URL 종속의 2대 리스크. CC BY 라이선스상 이미지·텍스트 직접 사용이 허용되므로 자체 렌더가 두 리스크를 모두 제거. PM 결정: 서비스 도서를 직접 확인·통제 가능해야 함 → 자체 렌더 채택.

### 결정

- **A1.** ASb 콘텐츠는 **자체 렌더(self-render)** 방식으로 제공한다. africanstorybook.org 리더 임베드는 채택하지 않는다.
- **A2.** 데이터 출처: raw-db 헤더의 텍스트 + 페이지 이미지(`africanstorybook.org/illustrations/pages/<n>.png`, 커버 `illustrations/covers/<id>.png`). 이미지는 CC BY로 직접 사용.
- **A3.** `content_type` 신규값 `'asb_native'`를 도입한다(기존 `html`·`epub`·`h5p` 외). 단, `content_type` CHECK 제약 변경 여부는 D4 착수 시 워커가 001/현 스키마 실측으로 확인 후 필요 시 마이그레이션 ADR을 동반한다(Hard Rule 8).
- **A4.** `content_url`에는 ASb 페이지 이미지 base 경로(또는 자체 렌더가 참조할 식별자)를 저장한다. 구체 형식은 D4 설계에서 확정.
- **A5.** ★**트랙 분리**: 적재(`sync_asb.py`, Python)와 자체 렌더 뷰어(웹앱 TS/Next)는 별 트랙. 적재가 선행하고 뷰어는 병렬·후행한다.
- **A6.** 적재분은 `is_active=false` staging(D4)로 들어가며, 자체 렌더 뷰어 완성 + 검수 후에만 책별 `is_active=true` 공개.

### 결과 (Consequences)

- **Positive**: 외부 트래킹·외부 종속성 0. 모든 도서 텍스트·이미지를 직접 확인·검수 가능(PM 핵심 요구). 콘텐츠 확보(적재)는 뷰어를 기다리지 않고 즉시 전진.
- **주의**: 자체 렌더 뷰어 컴포넌트 신규 개발 필요(웹앱 트랙). 페이지 이미지 가용성·해상도·페이지 순서 정합은 뷰어 단계에서 검증. 적재 시점엔 책이 staging(비공개)으로만 존재.

---

## Amendment #4: dedup 매칭 방식 + illustrator 빈값 표기 확정

**상태** Accepted (2026-06-17)
**근거** D5(dedup)·D6(illustrator) 구현 세부 확정. GDL 경유 ASb 33권과 직접 적재분 사이에 연결 가능한 공통 키(원본 id 등)가 없음(GDL이 ASb 원본 id 미저장) → 제목 정규화 매칭으로 처리. illustrator는 D6에서 이미 '미상' 적재로 결정됨.

### 결정

- **A1.** dedup(D5)은 **제목 정규화 매칭**으로 한다. DB의 기존 GDL 행 중 publisher/attribution이 African Storybook인 33권의 `title`을 정규화(소문자·공백/문장부호 정리·trim)한 집합을 만들고, ASb 직접 적재 시 정규화 제목이 그 집합에 있으면 skip 한다.
- **A2.** 정규화 제목이 같으나 실제로 다른 책일 수 있는 오매치 가능성을 수용한다(33권 한정·저위험). dedup으로 skip된 건수·제목은 sync 로그에 남겨 추후 검수 가능하게 한다.
- **A3.** illustrator(D6): raw-db `artist` 값이 비어있으면 illustrator 자리에 **'미상'** 문자열을 넣어 적재한다. `author` 기준으로 CC BY 저작자표시 의무를 충족하며, illustrator 보완은 후속 과제.
- **A4.** dedup 기준 집합 산출을 위해 `sync_asb.py`는 실행 시 DB에서 기존 ASb-유래 GDL 행의 `title`을 조회한다(읽기). 조회 방식·식별 조건(publisher 또는 attribution 매칭)은 D4 설계에서 기존 `sync_gdl`의 publisher 표기 실측으로 확정.

### 결과 (Consequences)

- **Positive**: 공통 키 부재 상황에서 현실적 중복 제거. 33권 한정이라 오매치 영향 미미. illustrator 누락분도 손실 없이 전량 적재(콘텐츠 최대 확보).
- **주의**: 제목 정규화 규칙이 느슨하면 동명이책 오skip 위험 → 로그로 관찰. dedup용 DB 조회가 추가되므로 `--dry-run` 시에도 이 조회는 수행하되 쓰기는 없음.

---

## Amendment #5: content_type 'asb_native' 마이그레이션 (004)

**상태** Accepted (2026-06-17)
**근거** Amd#3 A3가 예고한 content_type CHECK 확장. recon 실측 결과 001의 content_type CHECK는 `('html','epub','h5p','pdf')` 인라인 무명 제약으로 `asb_native` 미포함 → INSERT 차단 확인. `sync_asb.py` 적재 전 선행 필요(Hard Rule 8).

### 결정

- **A1.** 신규 마이그레이션 `supabase/migrations/004_add_asb_native_content_type.sql`로 content_type CHECK에 `'asb_native'`를 추가한다.
- **A2.** 003과 동일 패턴: 인라인 무명 CHECK를 `DO $$`로 동적 DROP 후 named constraint(`books_content_type_whitelist_chk` 류)로 재생성하되 IN절 = 기존 4값(`'html','epub','h5p','pdf'`) + `'asb_native'`. 멱등 처리.
- **A3.** 트리거 무저촉(content_type엔 연결 트리거 없음, Hard Rule 2). license `enforce_commercial_license` 무관.
- **A4.** 적용 순서(고정): SQL 작성 → push → PM이 Supabase SQL Editor 직접 적용 → 검증 후에만 `sync_asb.py` 적재.

### 결과 (Consequences)

- **Positive**: ASb 자체 렌더 콘텐츠(`asb_native`) 적재 차단 해제. 기존 4종 content_type 무영향(제약 확장만).
- **주의**: PM이 Supabase에 직접 적용해야 효력 발생. 미적용 시 `sync_asb` 적재가 CHECK로 거부됨 — 순서 A4 엄수.

---

## Amendment #6: ASb 자체 렌더 뷰어 — 페이지 구성 및 텍스트·이미지 짝짓기 규칙

**상태** Accepted (2026-06-17)
**근거** Amd#3(자체 렌더 결정)·A5(뷰어 트랙 분리)의 후속. 뷰어 구현 착수 전, `content_url`이 가리키는 raw `.txt`를 렌더 시점 파싱(A방식)할 때 **page_text와 images를 어떻게 페이지로 짝지을지**를 실측 위에서 확정한다. 읽기 전용 recon(GitHub `global-asp/asp-raw-db` raw `.txt` 표본 GET·본문 미저장)으로 근거를 수집했다.

### 배경

- `asb_native`는 DB에 **`content_url`(raw `.txt` URL)만 보유**하고 본문 텍스트·페이지 이미지는 저장하지 않는다(Amd#3 A4: 자체 렌더 참조 식별자). 따라서 뷰어는 렌더 시점에 `.txt`를 받아 `page_text`/`images` 섹션을 직접 파싱한다(A방식 확정).
- `.txt` 구조: `header`(탭구분 key:value) → `page_text:`(`P1..Pn` 라인) → `images:`(`illustrations/pages/<n>.png` 라인) → `translations:`.

### 실측 근거 (이번 recon)

- English·non-NC 적격 표본을 포함한 **10권**에서 **이미지수 − 텍스트수 차이가 일정하지 않음**: +1이 다수이나 **−1·0도 실재**.
  - 예: `11079`(English, CC BY 3.0) = P10/IMG9 = **−1**, `12685` = P15/IMG15 = **0**, `13201`(English, CC BY 3.0) = P13/IMG14 = **+1**, `1239`(English) = P10/IMG11 = +1.
- **첫 이미지는 표지가 아니다.** 표지는 `thumb` 헤더 = `illustrations/covers/<source_id>.png`로 **별도 제공**되며 DB `cover_url`에 보유. `images:` 섹션은 본문 페이지 일러스트(`illustrations/pages/<n>.png`)만 나열하고 표지를 포함하지 않는다(표지 번호와 첫 본문 이미지 번호가 무관: 예 `1239` 표지 `covers/1239.png` vs 첫 본문 `pages/858.png`).
- **이미지 파일명이 비순차·중복 가능**: `11079`에서 동일 `pages/10379.png`가 1번·5번 **2회 등장**, `13201`에서 `pages/13142.png` 1번·4번 중복 → **번호 정렬 기반 매핑은 위험**.

### 결정 (짝짓기 규칙)

- **A1. 표지면**: DB `cover_url`(= `illustrations/covers/<id>.png`) 단독 1면으로 맨 앞에 둔다. `images:` 섹션과 무관.
- **A2. 본문**: `page_text`(N개)와 `images`(M개)를 **각각 독립 스트림**으로 받아, **같은 인덱스끼리 느슨히 정렬**(`text[i]` + `image[i]`)하여 **`max(N, M)` 면을 생성**한다. 한쪽이 먼저 소진되면 남은 쪽만 단독 표시한다(텍스트만 있는 면 / 이미지만 있는 면 허용).
- **A3. 개수 불일치 흡수**: 차이(+/−/0)는 **모두 정상 케이스로 처리**한다. 빈 텍스트 면·이미지 없는 면을 오류로 보지 않는다.
- **A4. 강제 1:1·번호 정렬 매핑 금지**: page_text와 images의 강제 1:1 매핑, 그리고 이미지 파일명 번호 정렬 기반 매핑은 **금지**한다(중복·비순차로 어긋남이 실측됨).

### 이미지 절대 URL 규칙

- 본문 페이지 이미지: **`https://africanstorybook.org/illustrations/pages/<n>.png`** — `.txt`의 상대경로(`illustrations/pages/<n>.png`) 앞에 도메인 `https://africanstorybook.org/`를 결합한다.
- `http://` 표기는 **`https`로 승격**한다(`sync_asb.py`의 cover_url 처리와 동일 규칙).

### 한계 및 후속

- **정밀 페이지 동기화는 `.txt`만으로 불가**: page_text와 images 사이에 명시적 페이지 링크가 없고 개수도 가변이므로, "이 텍스트가 정확히 이 그림의 페이지"라는 보장은 데이터에 없다. 느슨한 인덱스 정렬은 근사다.
- 정밀 정합이 필요한 책은 **검수 단계에서 책별 수기 보정**하거나, **ASb reader 페이지 구조 추가 조사**(reader.php의 페이지 분할 메타 등)를 후속 과제로 둔다. 본 Amendment는 뷰어 1차 구현의 기본 규칙을 고정하는 데 한정한다.

### 결과 (Consequences)

- **Positive**: 개수 불일치(±·0)·중복·비순차라는 실데이터 변동을 깨지지 않고 흡수. 강제 매핑 제거로 잘못된 텍스트–그림 결합을 원천 차단. cover_url 단독 표지로 표지/본문 책임 분리 명확.
- **주의**: 느슨한 인덱스 정렬은 텍스트–그림 페이지 정합을 보장하지 않음(근사) → staging 검수에서 책별 확인 필요. 정밀 동기화 요구 시 후속 조사·수기 보정 비용 발생.

*문서 끝.*
