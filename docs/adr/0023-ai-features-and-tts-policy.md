# ADR-0023: AI 기능·정책 통합 — 캐릭터 AI(옵션 A) + 낭독 TTS

**날짜** 2026-06-12
**상태** Accepted (계획 v2 1단계 · phase 외부 · 상세 설계·SDK 선정은 구현 ADR로 후속 분리) · **Amendment #1 (2026-07-03, Accepted)** — TTS 산출물 저장 위치 = Supabase Storage 확정(§2.5 대체) + 파일럿 검증 결과 반영. 아래 「## Amendment #1」 참조.
**관련** `docs/adr/0001-tech-stack.md`(기술 스택 — 본 ADR로 LLM/TTS 의존성 확장), `docs/adr/0003-supabase-new-api-keys.md`(비밀 키 서버 전용 원칙 — AI API 키에 동일 적용), `docs/adr/0017-book-reader-architecture.md`(뷰어 구조 — 오디오 재생 결합점), `docs/adr/0018-completion-rewards-and-library.md`(완독 동선 — AI 대화 진입점), `docs/adr/0011-onboarding-flow.md`·`docs/intent/onboarding-flow.md`(자녀 프로필·법정대리인 동의), `docs/guidelines/license-rules.md`(2차 저작물 어트리뷰션 — 동반 갱신 예고), `app/privacy/page.tsx`(개인정보처리방침 — 개정 예고), `docs/backlog.md` §7.3(법률 검토 1회 F-item — AI 항목 추가 연계), `PLAN.md` 5절(인프라)·6절(기술 스택)·12절(위험 요소), `claude.md` 2절 Hard Rule 6·8

---

## 1. 맥락

PM이 계획 v2를 확정(2026-06-12)하며 베타 상품성 강화를 위해 **두 AI 기능**을 도입한다: ① **캐릭터 AI 대화**(완독/읽기 동선의 학습 상호작용) ② **도서 낭독 TTS**(read-along 음성). 본 ADR은 두 기능의 **결정·기술 의존성·스키마 필요 항목·스토리지·라이선스·아동 안전·비용 원칙**을 영구 기록한다. **상세 설계(구체 SDK·테이블 DDL·프롬프트)는 구현 단계 ADR로 후속 분리**한다. 본 ADR은 문서 전용, 코드·스키마 0줄.

### 1.1 직전 실측 조사(2026-06-12, read-only) 인용

- **Supabase Storage 사용 0건**(`storage`/`bucket`/`upload`/`getPublicUrl` grep 전무) → 음성 파일 저장소는 신규 설계.
- **`books` 테이블에 본문 텍스트·오디오 컬럼 없음**. 메타데이터 + 외부 `content_url`만(`001_initial_schema.sql:58-103`). `content_type` CHECK = `html`·`epub`·`h5p`·`pdf`(audio 부재).
- **텍스트 추출 가능**(TTS 입력 확보): Book Dash = HTML DOM `<p>`+`<img alt>`(페이지 분리 가능), GDL = epub-generator 엔드포인트 200 `application/epub+zip`(페이지 분리 가능).
- **AI 대화 진입점 후보**: `app/(reader)/book/[id]/celebrate/page.tsx`(+`components/book/celebrate-rewards.tsx`), `app/(reader)/book/[id]/read/page.tsx`(+`components/book/html-reader.tsx`). 책·자녀 컨텍스트(`book.title`·`child.name`) 기존 로드됨.
- **오디오 재생 결합점**: `read/page.tsx`의 `<footer>`(현 `FinishButton`) 또는 `HtmlReader` 형제 컴포넌트. iframe이 cross-origin이라 본문 하이라이트 동기화 불가 → **오디오 컨트롤은 부모(키키북스 origin) 레이어 독립 배치**.

---

## 2. 결정

### 2.1 캐릭터 AI = 옵션 A(선택형 대화) 확정, B/C 단계화

- **옵션 A(선택형 대화) = 베타 확정**: 자녀는 **AI가 제시한 선택지(버튼)**로만 상호작용한다. **자유 텍스트 입력 없음**. 책 내용 기반 간단한 이해 확인·캐릭터 반응.
- **옵션 B(자유 텍스트 입력)** = 단계적 검토(베타 데이터·안전성 확인 후).
- **옵션 C(음성 롤플레잉)** = **v1.1 유보**(실시간 음성 입출력).
- 근거: 옵션 A는 자유 입력 부재로 **구조적 저위험**(부적절 입력 유도·PII 유출 경로 차단) + 비용 예측 용이(선택지 생성 토큰 상한).

### 2.2 신규 기술 의존성 — ADR-0001 기술 스택 확장

- **LLM API**(캐릭터 대화 선택지·반응 생성) + **TTS API**(낭독 음성 생성)를 기술 스택에 추가한다. ADR-0001의 "월 $0 무료 인프라" 전제는 본 ADR로 **확장·갱신**된다(§2.8).
- **구체 제공사·SDK 선정은 구현 ADR로 후속 분리**(예: LLM은 Claude 등, TTS는 제공사 비교 후). 본 ADR은 "AI 의존성을 도입한다"는 상위 결정만 기록.
- **AI API 키 = 비밀 키.** Hard Rule 6 정신 직역 — **서버 컴포넌트·API Route·배치 스크립트에서만** 사용, 클라이언트 코드·공개 환경변수 노출 금지(ADR-0003 표준 적용).

### 2.3 신규 스키마 필요 항목 선언 (상세 DDL = 구현 ADR)

본 ADR은 **필요성만 선언**하고 Hard Rule 8의 선행 ADR 역할을 한다. 실제 마이그레이션은 구현 ADR + 후속 지시서.

- **대화 기록 테이블**(예: `ai_conversations`) — 자녀별 캐릭터 대화 로그. **RLS 필수**(자녀→법정대리인 소유 체인, `children` RLS 패턴 상속). 보호자 열람·파기 대상.
- **이해도 결과**(comprehension) — 선택형 응답의 정오/이해 지표. **신규 테이블 vs `reading_sessions` 확장 — 양안, 구현 ADR에서 확정**.
- **도서 오디오 URL** — **양안 기록**:
  - (a) `books.audio_url` 단일 컬럼(nullable) — 책 1개당 오디오 1개(단순).
  - (b) 별도 `book_audio` 테이블(book_id FK + page_index + audio_url) — **페이지 단위 read-along 동기화에 적합**(페이지별 음성 분리).
  - 판정: read-along 페이지 동기화 요구 시 (b) 우위 — 구현 ADR에서 확정. **`content_type` CHECK는 변경 불필요**(오디오는 본문 형식 교체가 아니라 부가 자산 → 컬럼/테이블 additive).

### 2.4 TTS 파이프라인 = 배치 사전 생성

- **구조**: `책 텍스트 추출(§1.1) → TTS 생성 → 스토리지 업로드 → DB URL 등록 → 뷰어 재생`. **기존 동기화 스크립트 패턴 재사용**(`scripts/sync_*.py`와 동형 — 배치·idempotent·UPSERT).
- **실시간 TTS 금지(베타)**: 페이지 로드 시 즉석 생성은 비용·지연 리스크 → **사전 생성 자산만 재생**.
- **실시간 음성은 v1.1 캐릭터 음성(옵션 C) 전용으로 유보**.

### 2.5 스토리지 = Cloudflare R2 우선 검토

- 현 Supabase Storage 사용 0건(§1.1). 음성 자산 저장소를 **신규 도입**.
- **R2 우선 검토** 근거: ① **전송비(egress) 무료**(음성 스트리밍 반복 재생에 유리) ② 용량 단가 ③ **기존 Cloudflare 계정 보유**(도메인 DNS가 이미 Cloudflare — backlog §4). vs Supabase Storage(통합 단순하나 egress 과금).
- **최종 확정은 PM 계정·요금 확인 후**(구현 ADR). 어느 쪽이든 공개 읽기 URL은 closed-environment 정책(ADR-0013) 정합 검토.

### 2.6 AI 생성물 라이선스 정책

- **TTS 음성 = 원본 텍스트의 2차 저작물(derivative).** 원본 라이선스 의무를 승계한다:
  - `cc-by-4-0`/`cc-by-3-0` 원본 → 음성도 **어트리뷰션 표기 필수**.
  - `cc-by-sa-4-0` 원본 → 음성도 **동일 라이선스(BY-SA) 유지 의무**(share-alike 전파).
  - `cc0`/`public-domain` → 의무 없음(관례상 표기).
- **어트리뷰션 표기**: 오디오 재생 UI 또는 책 상세에 "낭독: 키키북스 AI 생성 / 원작: {원본 어트리뷰션}" 형태. `license-rules.md`에 **2차 저작물(음성) 어트리뷰션 절 추가 예고**(동반 갱신 후속 지시서).
- **캐릭터 AI 출력**(선택지·반응)은 책 내용 파생이나 단문·비저장 배포 → 어트리뷰션 단위는 대화 UI 맥락에서 원작 표기로 갈음(구현 ADR에서 확정).

### 2.7 아동 안전·개인정보

- **옵션 A 구조적 저위험**: 자유 입력 부재 → 부적절 발화 유도·PII 자유 유출 경로 없음. AI 출력은 책 컨텍스트 한정 프롬프트 + 사전 안전 가드레일(구현 ADR).
- **대화 기록 수집 시**:
  - `app/privacy/page.tsx` **개정 필요** — 수집 항목에 "AI 대화 로그·이해도 결과" 추가, 처리목적·보관·파기 명시.
  - **법률 검토 범위에 AI 항목 추가** — backlog §7.3 "법률 검토 1회(결제·사용자 증가 전)" F-item에 **AI 대화·아동 데이터 처리 적법성**을 명시 연계.
  - **보호자 열람 원칙**: 법정대리인이 자녀 AI 대화 기록 열람·삭제·동의 철회 가능(개인정보처리방침 정합).
  - **보관·파기 골격**: 최소 보관(서비스 제공·이해도 추적 목적 한정), **회원 탈퇴·동의 철회 시 지체 없이 파기**, 익명 통계 외 장기 보관 0.

### 2.8 비용 — $0 체계 종료, 베타 월 상한 원칙

- **"월 운영비 $0"(ADR-0001·PLAN.md 5절) 체계 종료를 선언**한다. AI API + TTS API + 스토리지(egress)로 **유료 운영 진입**.
- **베타 기간 월 비용 상한 원칙**: 옵션 A 선택지 생성·배치 TTS는 토큰·문자 상한으로 예산 통제. **상한 금액은 제공사 선정 후 PM 확정**(미정).
- PLAN.md 5절(월 운영 비용)·12절(위험 요소) **갱신 예고**(후속 지시서).

---

## 3. 근거

- **옵션 A 우선**: 안전·비용·구현 난이도 모두 최소. 자유 입력(B)·음성(C)은 베타 데이터로 위험·수요 검증 후 단계화.
- **배치 TTS**: 실시간 대비 비용·지연 예측 가능 + 기존 sync 패턴 재사용으로 구현 위험 최소.
- **R2 우선**: 음성은 반복 스트리밍 → egress 과금이 누적 비용의 핵심 → 무료 egress가 결정적.
- **2차 저작물 의무 승계**: CC BY-SA의 share-alike는 음성에도 전파 — 라이선스 적법성은 키키북스 정체성의 핵심(Hard Rule 2·3 정신).
- **아동 데이터 보수성**: 옵션 A의 구조적 저위험 + 보호자 통제 + 법률 검토 연계로 규제(만 14세 미만·법정대리인 동의) 정합.

---

## 4. 결과

- **동반 갱신 예고(후속 지시서·구현 ADR 근거)**: `app/privacy/page.tsx`(AI 데이터 항목) · `docs/guidelines/license-rules.md`(2차 저작물 음성 어트리뷰션 절) · `docs/adr/0001`(기술 스택 AI 의존성) · `PLAN.md` 5절·12절 · `docs/backlog.md` §7.3(법률 검토 F-item에 AI 추가) · `supabase/migrations/`(대화·이해도·오디오 — 구현 ADR 선행 후).
- **후속 구현 ADR 분리 항목**: LLM/TTS 제공사·SDK 선정, 테이블 DDL·RLS 정책, 프롬프트·안전 가드레일, 스토리지 최종 확정, 비용 상한 금액.
- **본 ADR 자체는 코드·스키마·연계 문서 변경 0건** — 결정·정책 기록 전용.

---

## 5. 미반영 항목 (의도적 보류)

- **옵션 B(자유 입력)·C(음성 롤플레잉, v1.1)** — 베타 후 별도 결정.
- **구체 제공사·SDK·요금 상한 금액** — 구현 ADR + PM 확정.
- **오디오 컬럼 vs `book_audio` 테이블 최종 선택** — read-along 동기화 요구 확정 시 구현 ADR.
- **read-along 문장 단위 타임스탬프** — TTS 생성 시 산출 여부는 구현 단계 검토(페이지 단위는 §1.1로 확보).

---

*문서 끝.*

---

## Amendment #1 (2026-07-03) — TTS 산출물 저장 위치 = Supabase Storage 확정 (§2.5 대체) + 파일럿 검증 결과

### A. 결정 — 저장 위치

- **TTS 오디오(mp3)·단어 타이밍(word speech marks JSON) 저장 위치 = Supabase Storage 확정.** §2.5의 "Cloudflare R2 우선 검토"는 본 Amendment로 **대체(superseded)** 된다.
- **근거**:
  1. **기존 파이프라인 재사용** — §1.1 실측(2026-06-12) 당시 Supabase Storage 사용 0건이었으나, 이후 ADR-0032(Book Dash 표지 Storage 마이그레이션)로 `book-covers`·`book-manifests` 버킷을 이미 운영 중. 업로드·공개 URL 발급 패턴이 확보되어 신규 서비스 학습·연동 비용 0.
  2. **베타 규모 충분** — 대상 코호트 Book Dash v1 39권(§B) 기준 용량이 무료 한도(1GB) 내로 충분. 파일럿 실측: 1권(12장면) mp3+marks 약 0.5MB → 39권 외삽 약 20MB 수준.
  3. **되돌리기 쉬운 결정** — 트래픽이 대규모로 커질 경우 Cloudflare R2로 이전 가능(ADR-0032 이미지 마이그레이션과 동일 방식). 지금 R2 미도입은 잠금(lock-in)을 만들지 않는다.
- **기각안: Cloudflare R2** — 전송비(egress) 무료가 강점이나, 신규 서비스 도입 복잡도(계정 연동·업로드 파이프라인·권한 체계 신설)가 현 단계 편익을 초과. 사용자 규모가 커져 egress 비용이 체감되는 시점의 후속 카드로 보류(§2.5의 근거 자체는 유효 — 채택 시점만 이연).

### B. 파일럿 검증 결과 (a-beautiful-day 1권, 2026-07-03 완료)

- **엔진·보이스·속도 확정**: Amazon Polly **Neural** · 보이스 **Ruth**(성인 여성 — Joanna·Kendra 샘플 비교 청취 후 확정) · 기본 속도 **78% 자연낭독**(SSML `<prosody rate="78%">` + 문장부호 기반 `<break>` 끊어읽기).
- **word speech marks 정합 검증**: SSML 태그·이스케이프로 밀리는 바이트 오프셋을 원문 텍스트 기준으로 보정하고 `<break>` 태그가 word 마크로 반환되는 현상을 필터링 — 전 페이지 단어 수가 평문 원본과 일치함을 확인. read-along 단어 단위 동기화 실증(§5 "read-along 문장 단위 타임스탬프" 검토 항목을 **단어 단위로 상회 달성**).
- **프리뷰 검증**(`scripts/tts_pilot/preview.html`, 로컬 전용): 단어 카라오케 하이라이트 · 전체 자동재생(무텍스트 페이지 자동 통과) · 재생 배속 0.75~1.25× 동작 확인.
- **대상 코호트**: Book Dash **v1 html 39권**(텍스트 추출 가능 — §1.1). v2 asb_native 206권은 **OCR 별도 2차 트랙**(본 Amendment 범위 외).
- **비용 기준(§2.8 정합)**: 배치 사전 생성(§2.4)·Polly Neural 문자 과금, 1권 698자 — 39권 외삽 시 수만 자 규모로 베타 상한 내 통제 가능.
- 파일럿 산출물은 로컬 전용(미커밋)이며 Storage 업로드는 후속 구현 단계에서 수행.

### C. 미결 유지 (후속 구현 ADR 대상 — 본 Amendment에서 결정하지 않음)

- **DB 저장 형태** — §2.3의 (a) `books.audio_url` 컬럼 vs (b) `book_audio` 테이블 양안 그대로 유지.
- **Storage 버킷 구조·경로 네이밍** (버킷명·`{slug}/p{N}.mp3` 류 경로 규칙).
- **업로드 시 Content-Type/charset 헤더** (mp3·marks JSON).

> 본 Amendment는 §1~§5 본문을 변경하지 않는다(§2.5는 본 Amendment가 대체함을 상태 라인과 본 절로 기록). 코드·스키마·Storage 업로드 0건 — 문서 전용.

*Amendment #1 끝.*
