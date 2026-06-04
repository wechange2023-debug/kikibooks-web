# 키키북스 베타 PRD (Product Requirements Document)

> **적용 범위**: 베타 출시(2026-08 목표) 한정. Phase 2 이후는 별도 풀 PRD.
> **작성**: 2026-06-04
> **출처**: 리포 내 `PLAN.md`, `docs/intent/*`, `docs/adr/*`, `tasks/phase-14-beta-infrastructure.json`
> **성격**: 베타 한정 경량 PRD(재구성판). 분산된 요구사항 정보를 PRD 구조로 정렬·통합한 문서이며, 신규 창작은 페르소나 절(§2)의 ※ 표시 문장으로 한정한다.

---

## 1. 비전

키키북스는 한국 유아(만 3~7세)를 대상으로 한 영어 그림책 e-라이브러리다. 베타는 무료 합법 콘텐츠(CC BY 4.0 / Public Domain) 900권 이상만으로 출시하고, 출시와 동시에 한국 출판사 협상 트랙을 가동한다.

> 출처: `PLAN.md:L33`, `PLAN.md:L35~L39`, `README.md:L3~L4`, `docs/adr/0008-beta-content-target-900.md`

---

## 2. 페르소나

> 본 절의 행동·속성 단서는 리포 발췌이나, PRD 페르소나 형식(목표·불편·맥락)으로 정렬하는 과정에서 일부 문장은 발췌 기반 신규 서술이다. 신규 서술 문장은 **※** 로 표시하고 발췌 근거를 1개 이상 명시한다.
>
> ※ 가명 "지영"(학부모)·"하준"(자녀)은 PRD 페르소나 형식상 부여한 명칭으로, 리포 소스에 직접 출처가 없는 신규 서술이다.

### 2.1 학부모

| 항목 | 내용 |
|---|---|
| 이름(가명) | 지영 |
| 연령대 | 30대 후반 |
| 기기 | 스마트폰 (자녀 동반 시 태블릿 공유) |
| 사용 맥락 | 자녀와 함께 매일 진입, 인사 카드("안녕하세요, [display_name]님 👋")로 시작 |
| 목표 | 자녀의 첫 영어 그림책 서재를 만들고 학습 습관(스트릭)을 시각적으로 확인 |
| 불편(pain) | ※ 유료·불법·광고 결합 콘텐츠에 대한 거부감과 비용 부담 — 베타가 "무료 합법 콘텐츠"를 핵심 가치로 내세우는 전제에서 도출 (근거: `PLAN.md:L35~L39` 핵심 전략, `docs/intent/screen-01-landing.md:L14` 가입 결심 동선) |
| 결심 동선 | 랜딩에서 "무료로 시작하기" → 가입 → 온보딩(자녀 등록) → `/home` |

> 출처: `PLAN.md:L154`, `PLAN.md:L293`, `docs/intent/screen-01-landing.md:L14`, `docs/intent/screen-02-home.md:L12·L63~L64`, `docs/intent/onboarding-flow.md:L54`

### 2.2 자녀

| 항목 | 내용 |
|---|---|
| 이름(가명) | 하준 |
| 연령 | 만 3~7세 |
| 기기 | 태블릿 (학부모 스마트폰 공유 포함) |
| 자율성 한계 | ※ 읽기·조작 자율성이 제한적이라 학부모 동반이 전제 — children 테이블이 다자녀 스키마이나 베타는 1명, 온보딩도 학부모가 자녀 정보를 대신 입력하는 구조에서 도출 (근거: `PLAN.md:L294`, `docs/intent/onboarding-flow.md:L23~L24`) |
| 직접 조작 | 책 뷰어에서 끝까지 읽은 뒤 '다 읽었어요'(FinishButton)를 직접 누름 |
| 보상 동기 | 완독 시 별 3개 애니메이션 + 포인트 +50 + 완독 배지로 짧고 강렬한 성취감 |

> 출처: `PLAN.md:L33`, `PLAN.md:L294`, `docs/intent/screen-05-celebrate.md:L18·L66`, `docs/intent/screen-04-reader.md:L16·L66`

---

## 3. 베타 DoD (Definition of Done)

### 3.1 코드 영역 (phase-14 CP1·CP2·CP3·CP4·CP8 — 완료)

**필수 기능**
- 비로그인 → 랜딩 페이지 정상
- 이메일·구글·카카오 가입·로그인 작동
- 첫 로그인 → 온보딩 → 자녀 등록 → `/home`
- 가입~완독까지 막힘 없이 진행 가능
- **책 상세 페이지 어트리뷰션 박스 100% 표시** (CC BY 4.0 법적 의무)
- Book Dash HTML iframe 정상, GDL H5P 정상
- 완독 시 포인트 +50, 첫 배지 부여
- 로그아웃 → 랜딩으로 복귀

**phase-14 검증 통과분 (2026-06-01)**
- CP1 spec 확정 · CP2 사용자 가시 UI(로그아웃 라벨·`/book` 로그아웃) · CP3 전역 에러 UI(`global-error`·`admin/error`) · CP4 OG 메타데이터 한글화 정합 · CP8 종결 검증
- 자동 검증: lint 0 · type-check 0 · build 통과 · footer 0건(ADR-0020)

> 출처: `PLAN.md:L488~L509`, `tasks/phase-14-beta-infrastructure.json` verification_result · verification(v1~v4·v8·v10)

### 3.2 외부 의존 영역 (외부 의존)

> 아래 항목은 Claude Code가 문서·코드 배선만 담당하고, 실제 외부 행위(변호사 문안·Dashboard 설정·키 재발급)는 사용자 영역이다.

- **CP5 약관·개인정보처리방침** *(외부 의존: 변호사 자문)* — 정식 문안을 `app/terms`·`app/privacy` placeholder에 교체. Claude 문안 작성 0건(법적 책임).
- **CP6 SMTP 인프라** *(외부 의존: 도메인·SMTP 제공사)* — 정식 도메인 등록 후 SMTP 인증(SPF·DKIM·DMARC) → Supabase Dashboard 설정. ADR-0010 이연 해소.
- **CP7 secret key rotation** *(외부 의존: CP6 후속)* — `SUPABASE_SECRET_KEY` 재발급·Vercel env 갱신(ADR-0003 표준). 키 값·env 이름 노출 0건(Hard Rule 6).

> 출처: `tasks/phase-14-beta-infrastructure.json` checkpoints(CP5·CP6·CP7) · verification(v5·v6·v7), `docs/backlog.md` §4, `docs/adr/0010-email-smtp-deferred.md`, `docs/adr/0003-supabase-new-api-keys.md`

### 3.3 비기능

- 모바일(390px) 전체 화면 정상
- Lighthouse Performance ≥ 80, Accessibility ≥ 90
- 책 상세 FCP < 2초
- `SELECT COUNT(*) FROM books WHERE attribution_text IS NULL` → 0
- footer 0건 (ADR-0020, 커밋 trailers 전건 검증)

> 출처: `PLAN.md:L500~L509`, `tasks/phase-14-beta-infrastructure.json` verification(v8·v9·v10), `docs/adr/0020-footer-policy.md`

---

## 4. Out of Scope (베타 제외)

분산된 소스를 한 목록으로 통합한다.

**기능**
- 다자녀 등록·자녀 전환 UI (출시 후, ADR-0011 결정 2)
- 자녀 사진 업로드 (색상 아바타로 대체, ADR-0011 결정 4)
- 자녀 정보 수정·삭제 화면 (phase-10 이후)
- 즐겨찾기 ⭐ 토글 UI (phase-13 라이브러리 시점 통합)
- 결제·학부모 리포트·알림톡 (Phase 3)
- B2B 학원 대시보드 (Phase 3)

**콘텐츠**
- 유명 작가 미협상 IP (Eric Carle·Browne·Donaldson 등 — 협상 트랙, Phase 2~3)
- 한국 출판사 협상 콘텐츠 (베타 출시 후 협상 시작)
- Vooks·Epic·StoryWeaver·LibriVox·Bloom 등 확장 카탈로그 (Phase 2)

**인프라**
- OG 이미지 비트맵 한글화 (#16, post-beta 이관 — 폰트 번들링·edge 런타임 의존)

> 출처: `docs/intent/onboarding-flow.md:L31~L33`, `PLAN.md:L81~L104`, `PLAN.md:L513~L525`, `docs/intent/screen-03-book-detail.md:L41`, `docs/backlog.md` §5(#16)

---

## 5. 베타 KPI (목표)

| 지표 | 목표 |
|---|---|
| 베타 사용자 수 | 50~100명 |
| 완독 세션 | 100건 |
| Lighthouse Performance | ≥ 80 |
| Lighthouse Accessibility | ≥ 90 |
| 어트리뷰션 무결성 | `attribution_text IS NULL` = 0 |

**다음 단계 진입 트리거**
- 베타 정식 공개: 내부 테스터 5~10명이 가입~완독을 막힘 없이 완료 → Vercel Production 배포 + 초대 링크 공유
- Phase 2 진입: 유료 가입 의향 100명 또는 완독 세션 300건

> 출처: `PLAN.md:L102·L411`, `PLAN.md:L483`, `PLAN.md:L619~L620`

---

## 부록 A — 출처 인용

본 PRD의 각 섹션 출처는 해당 절 말미 인용 블록에 명시했다. 핵심 출처 파일 목록:

- `PLAN.md` — 비전·로드맵·Phase 1 체크리스트·KPI·협상 트랙
- `docs/intent/screen-01~05.md`, `auth-flow.md`, `onboarding-flow.md` — 화면별 사용자 의도·동선·Out of Scope 단서
- `docs/adr/0003·0008·0010·0011·0020.md` — 키 정책·콘텐츠 목표·SMTP 이연·온보딩 범위·footer 정책
- `tasks/phase-14-beta-infrastructure.json` — 베타 DoD 검증(v1~v10)·CP 진행·외부 의존 분리
- `docs/backlog.md` — post-beta 이관 항목(#16 등)

> 페르소나(§2)의 ※ 표시 문장은 발췌 기반 신규 서술이며, 각 문장에 발췌 근거를 명시했다. 그 외 모든 항목은 위 출처에서 발췌·재구성한 것이다.
