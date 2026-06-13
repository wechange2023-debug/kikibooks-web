# ADR-0004 — `books.source_platform` 화이트리스트 7종 확정

**상태** Accepted
**날짜** 2026-05-14
**관련** `supabase/migrations/001_initial_schema.sql` 3절, `claude.md` 2절(Hard Rules), `docs/guidelines/license-rules.md` 4.3절

---

## 1. 배경

`books.source_platform` 컬럼은 CHECK 제약으로 enum 화이트리스트를 강제한다. 본 ADR은 베타 출시(1,300권) 시점에 허용되는 7개 값과 그 근거를 영구 기록한다. **CHECK 제약 변경은 본 ADR 갱신(또는 후속 ADR 발행) 없이 불가**하다 (Hard Rule 8).

기존 ADR-0001(기술 스택)에서 콘텐츠 출처를 개괄적으로 언급했지만, `source_platform` enum 자체에 대한 단독 결정 기록이 빠져 있어 본 ADR로 보강한다.

---

## 2. 결정

`books.source_platform`은 다음 7개 값만 허용한다.

| 값 | 라이선스 기본값 | 베타 적재 시점 | 비고 |
|---|---|---|---|
| `book_dash` | `cc-by-4-0` | Phase 04 | 남아공 NPO, ~60권 영어 원본 (Phase 04 단독 처리) |
| `gdl` | `cc-by-4-0` / `cc-by-sa-4-0` | Phase 05 | Global Digital Library, 영어 600+권 |
| `librivox` | `cc0` | Phase 0 외 (스코프 외 베타 보류) | 오디오 낭독, 영어 추가 |
| `pg` | `public-domain` | 스코프 외 (Beatrix Potter 등 한정) | Project Gutenberg, 텍스트 본 |
| `jybooks` | (협상 라이선스 별도 코드) | Phase 2+ | JYBooks 협상 체결 후 |
| `wjjr` | (협상 라이선스 별도 코드) | Phase 2+ | 웅진주니어 협상 체결 후 |
| `magic_light` | (협상 라이선스 별도 코드) | Phase 2+ | Magic Light Pictures (Gruffalo 등) |

---

## 3. 근거

### 3.1 화이트리스트 방식을 채택한 이유
- 자유 텍스트 컬럼은 오타·중복 출처(`book-dash`, `BookDash`, `book_dash`)를 양산하여 카탈로그 큐레이션 통계와 라이선스 감사를 불가능하게 만든다.
- CHECK 제약은 DB가 직접 강제하므로 코드 버그가 우회할 수 없다 (license-rules.md 0절 원칙).
- 신규 출처는 ADR + 마이그레이션 ALTER로 명시적 추가만 허용 — "조용한 추가"를 차단한다.

### 3.2 7개 값 각각의 선정 사유

**`book_dash`** — 남아공 비영리 출판사. 100% CC BY 4.0 발행 (https://bookdash.org 라이선스 페이지 확인, 2026-05-14). 베타 영어 콘텐츠의 핵심 1차 적재 출처.

**`gdl`** — Global Digital Library(노르웨이 NORAD 지원). 다국어 그림책 6,000+권 보유. 책별 라이선스가 cc-by-4-0 또는 cc-by-sa-4-0로 분리 표기되며 API가 안정적이다 (Phase 05).

**`librivox`** — CC0 퍼블릭 도메인 낭독 오디오. 본격 적재는 Phase 1(오디오 플레이어 UI) 이후로 보류하나, enum은 미리 등록하여 DB 변경 없이 추가 가능하도록 한다.

**`pg`** (Project Gutenberg) — 한국 사후 50년 PD 기준을 충족하는 Beatrix Potter 등에 한정. 상표(Peter Rabbit™ 등) 우회는 license-rules.md 2절 블랙리스트 + Hard Rule 5에 따른다.

**`jybooks`, `wjjr`, `magic_light`** — 협상 트랙(PLAN.md 10절) 체결 후 사용할 예약값. 협상 라이선스는 `commercial-licensed` 같은 별도 라이선스 코드를 사용할 예정이며, CHECK 제약 변경은 별도 후속 ADR로 처리한다.

### 3.3 제외된 값들
- **Storyline Online** — SAG-AFTRA 라이선스로 영리 사용 불가 (license-rules.md 2절)
- **YouTube 채널 임베드** — 출판사 공식 채널 외 광고 매출 결합 금지 (Hard Rule 9)
- **African Storybook / Pratham StoryWeaver** — 라이선스 혼재. 베타 후 별도 ADR로 검토 예정
- **Free Kids Books / FundZa 등 미러 사이트** — 원천이 아니라 재배포 사이트. `book_dash`와 같은 원천을 직접 사용한다

---

## 4. 결과

- 신규 출처가 필요할 때마다 본 ADR 갱신(또는 후속 ADR) → ALTER TABLE → enforce 트리거 화이트리스트 동시 갱신
- 동기화 스크립트는 `source_platform`을 하드코딩 상수로 사용 (Hard Rule 7 페이즈 순서 보호와 동일한 정신)
- 라이선스 감사 SQL(`license-rules.md` 6.1절)은 본 화이트리스트를 기준으로 작동

---

## 5. 미반영 항목 (의도적 보류)

- **다국어 출처 분리** (예: `gdl_no`, `gdl_sw`) — language 컬럼으로 처리, source_platform은 출처(provider) 기준 유지
- **콘텐츠 형식별 출처 분리** (예: `book_dash_pdf`, `book_dash_html`) — content_type 컬럼으로 처리

---

## Amendment #1 (2026-06-13) — §3.3 StoryWeaver·ASB "베타 후 검토" 보류 해제

**상태** Accepted · **근거** `docs/adr/0022-content-source-expansion.md` §2.1·§2.3·§2.4

§3.3 원문("African Storybook / Pratham StoryWeaver — 라이선스 혼재. 베타 후 별도 ADR로 검토 예정")은 **원문 그대로 보존**하되, 그 **"베타 후 검토" 보류 상태를 해제**한다.

- **해제 = 트랙 격상**: 두 소스 검토를 **베타 전(Phase 1.5) 트랙A**로 끌어올린다. 사유 — PM 계획 v2 결정 + GDL이 이미 두 소스를 집계함을 실측 확인(라이선스 혼재 우려는 책별 `license` 필드 필터로 해소 가능, ADR-0022 §1.1·§2.1).
- **단, `source_platform` enum 값 추가는 미실행**: 본 Amendment는 **검토 보류 해제일 뿐**, `storyweaver`(또는 ASB) enum 값을 §2 화이트리스트에 **추가하지 않는다**. StoryWeaver enum 추가는 **공식 bulk/파트너 API 확보를 선행**한 뒤 **별도 ADR 또는 본 ADR 후속 Amendment**로 처리한다(ADR-0022 §2.3, 공개 API Cloudflare 403·우회 금지).
- **ASB는 갈음**: African Storybook은 공개 REST API 부재로 직접 적재 후순위 — **GDL 경유분 34권으로 갈음**한다(ADR-0022 §2.4).

> 본 Amendment는 문서·결정 기록 전용. `source_platform` CHECK 제약·트리거·마이그레이션 변경 0건(enum 값 추가 시 별도 ADR + ALTER로 처리).

---

*문서 끝.*
