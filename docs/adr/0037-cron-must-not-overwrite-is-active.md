# ADR-0037 — cron sync는 is_active를 덮어쓰지 않는다 (가시성은 사람이 관리)

**날짜** 2026-07-09
**상태** Accepted (2026-07-09, 팀장 승인 — D2는 본 ADR과 동일 커밋에서 구현. Verification 동적 항목은 다음 cron 이후 후속 확인)
**관련** `docs/ops/emergency-takedown.md`(긴급 내림 절차 — 본 ADR의 수혜자), `lib/shared/blacklist.ts`(코드 레벨 차단 — 이중 방어로 유지), `docs/adr/0014-gdl-cover-url-and-illustrator-strategy.md`(블랙리스트 원 결정), `docs/adr/0031-bloom-dedup2-recovery.md`(Bloom 중복판 비활성화), `docs/adr/0036-bookdash-image-storage.md` §4.1(html 코호트 한정), `scripts/sync_book_dash.py`, `scripts/sync_gdl.py`, `.github/workflows/sync-book-dash.yml`, `.github/workflows/sync-gdl.yml`, `claude.md` 2절 Hard Rule 3·4

---

## Context

- cron 2개가 sync 시 upsert payload에 `"is_active": True`를 명시한다:
  - `scripts/sync_gdl.py:340` — **매일** 03:00 UTC (`.github/workflows/sync-gdl.yml:21`)
  - `scripts/sync_book_dash.py:173` — **주간** 일 02:00 UTC (`.github/workflows/sync-book-dash.yml:20`)
  - 둘 다 `upsert(payload, on_conflict="source_platform,source_id")`로 기존 행을 덮어쓴다
    (`sync_book_dash.py:186~188`, `sync_gdl.py:356~358`).
- 운영 절차 `docs/ops/emergency-takedown.md`(L21~22, L43)의 **유일 차단 수단이 `is_active=false`**다
  (라이선스 위반·Hard Rule 3·4 사안의 긴급 내림). cron 원복에 대한 경고는 문서 전체에 0건이었다.
- **결과**: 사람이 내린 gdl/book_dash 책이 다음 cron(gdl은 최대 24시간, book_dash는 최대 7일 내)에
  자동 부활하는 구조. `verify_licenses.py --apply`(`:432`)의 `is_active=FALSE` 조치도 동일하게 무효화된다.
- `lib/shared/blacklist.ts`(결손 15권 코드 차단)가 존재하는 이유가 바로 이것이나
  (`blacklist.ts:32` "주간 cron이 is_active=True로 되돌리므로 is_active=false 대신 코드 측 블랙리스트로
  차단한다(cron-proof)"), **그 근거가 주석 외 어떤 문서(ADR)에도 기록돼 있지 않았다.**
- **2026-07-09 DB 실측**(팀장 SQL, Appendix): gdl 비활성 0건 → **실제 피해는 아직 미발생.**
  book_dash 비활성 3건(slug 형식)은 부활 위험 없음이 실측으로 확정됐다:
  - meta.yml 실측(2026-07-09, HTTP 200): titles 54건 전원 en + `identifier`(UUID) 보유, slug 폴백 0건
    → v1 cron의 upsert 키 집합 = **UUID 54개뿐**. 비활성 slug 3키는 titles에 존재하지 않아 도달 불가.
  - 팀장 SQL 교차 실측: `uuid_form × false = 0행` — cron이 도달 가능한 v1 코호트에 비활성 책 없음.
  - 비활성 slug 3권(`little-sock-and-the-tiny-creatures`·`mrs-penguins-perfect-palace`·
    `maddy-moonas-menagerie`)은 Scheme B(v2) 의도적 스테이징의 drift 3권이다
    (`docs/handoff/2026-06-23-bookdash-scheme-b-gates.md:17`, `docs/backlog.md:245`). 테이크다운 아님.

## Decision

**D1. 원칙 — "cron은 카탈로그 메타데이터를 관리한다. 가시성(is_active)은 사람이 관리한다."**

**D2.** `scripts/sync_book_dash.py`, `scripts/sync_gdl.py`의 upsert payload에서 **`is_active` 키를 제거**한다.
- 신규 행: DB DEFAULT로 삽입된다 — `supabase/migrations/001_initial_schema.sql:99`
  `is_active BOOLEAN NOT NULL DEFAULT TRUE` → 동작 불변(신규 책은 여전히 공개로 들어옴).
- 기존 행: is_active가 **보존**된다. 근거(supabase-py 2.30.0 실측, `pip show` 확인):
  - postgrest `upsert()`는 `Prefer: resolution=merge-duplicates`로 요청하며
    (`postgrest/base_request_builder.py:179~180`), 충돌(merge) 시 **payload에 있는 컬럼만** UPDATE한다.
  - 공식 docstring(`postgrest/_sync/request_builder.py:386~389`): 누락 필드 처리는
    "only applies when **inserting new rows, not when merging with existing rows**" — 병합 시
    payload에 없는 컬럼은 건드리지 않는다.
  - bulk upsert(gdl `batch_upsert`)의 INSERT 컬럼 목록은 payload 키의 합집합으로 구성되므로
    (`base_request_builder.py:187~188` `columns=_unique_columns(json)`), 모든 payload가 동일하게
    is_active를 뺀 본 수정에서는 컬럼 목록 자체에서 빠져 신규 행에 DEFAULT TRUE가 적용된다.

**D3.** `lib/shared/blacklist.ts`는 **제거하지 않는다.** 이중 방어(defense in depth)로 유지한다.

**D4.** `verify_licenses.py --apply`로 끈 책은 이제 cron 이후에도 꺼진 상태를 유지한다.

**D5.** staging 스크립트 3종(`sync_asb.py:312` / `sync_bloom.py:906` / `sync_book_dash_v2.py:704`)은
payload에 `is_active=False`를 명시하고 동일 키(`source_platform,source_id`)로 upsert한다.
cron이 없어 자동 발화는 없으나, **수동 재실행 1회로 현재 활성 상태인 다음 책들이 일괄 비활성화된다**
(2026-07-09 팀장 SQL 실측 기준, Appendix):

| 스크립트 | 일괄 비활성화 대상(현재 활성) |
|---|---|
| `sync_book_dash_v2.py` | 152권 (v2 slug 코호트) |
| `sync_asb.py` | 2,160권 |
| `sync_bloom.py` | 440권 |
| **합계** | **2,752권 = 전체 활성 3,657권의 약 75%** |

이는 D2가 고치는 cron 문제(자동·켜짐)의 **거울상(수동·꺼짐)**이다. 기존 경고는
`sync_bloom.py:821~822`에 주석으로만 존재하며 ADR에 기록된 적이 없다.

★ **이번 ADR에서 고치지 않는다.** 이유: staging 스크립트는 신규 행에 대해 is_active=False가
반드시 필요하므로, cron처럼 키를 단순 삭제할 수 없다. "신규 행에만 False, 기존 행은 보존"이라는
조건부 동작이 필요하고 이는 upsert 호출 구조 변경을 수반한다. **별도 ADR·별도 트랙**으로 처리한다.
→ Known Issue 등록 (backlog 항목 추가는 팀장 승인 후 별도 진행).

**D6.** book_dash는 v1(source_id=**UUID**, html 코호트 54권)과 v2(source_id=**slug**, Scheme B 코호트
155권)가 `source_platform='book_dash'`를 공유하는 **이중 키 체계**다. 근거:
- `sync_book_dash.py:80`(platform), `:148~150`(identifier→UUID, 폴백 slug — 실측상 폴백 발생 0)
- `sync_book_dash_v2.py:66`(동일 platform), `:693`(source_id=slug, D6), `:765`(키 체계 경고 자체 출력)
- 팀장 SQL 실측(2026-07-09): uuid_form 54(전부 활성) / slug_form 155(활성 152, 비활성 3)

ADR-0036 D5의 `book_dash-{UUID}` 버킷 키 전제는 ADR-0036 §4.1(html 코호트 한정)에 따라 유효.
이중 키 체계 자체는 결함이 아니라 의도된 설계이므로 이번 ADR에서 변경하지 않는다.
단 **drift 3권 통합(`docs/backlog.md:245`)이 미해결 상태**임을 Known Issue로 함께 기록한다.

## Consequences

- `docs/ops/emergency-takedown.md`의 절차가 **이제 실제로 작동한다** (내린 책이 내려간 채로 유지).
- 신규 책 삽입 동작은 변하지 않는다 (DB DEFAULT TRUE가 동일 값을 제공).
- 소스에서 사라진 책을 자동 비활성화하는 기능은 여전히 없다(현행 유지 — 본 ADR 범위 아님).
- **자동 복구 상실 (의도된 결과).** 종전에는 `verify_licenses.py --apply` 또는 수동 조치로
  꺼진 gdl/book_dash 책이, 원인 해소 후 다음 cron upsert에서 is_active=True로
  자동 재활성화됐다. D2 이후로는 자동 복구되지 않으며, 사람이 명시적으로
  is_active=true로 되돌려야 한다. 이는 D1 원칙의 직접적 귀결이며 결함이 아니다.
  → 재활성화 절차를 `docs/ops/emergency-takedown.md`에 "복구" 항으로 추가한다.

## Verification

- **정적**: 두 스크립트에서 payload 내 `is_active` 0건 (`grep -n "is_active" scripts/sync_book_dash.py
  scripts/sync_gdl.py` 출력을 구현 커밋 보고에 첨부).
- **동적**: 다음 cron 실행 후 팀장이 아래 SQL 재실행해 비활성 목록 유지 확인. (이번 세션 범위 밖)

```sql
SELECT source_platform, source_id, title FROM books
WHERE source_platform IN ('gdl','book_dash') AND is_active = FALSE
ORDER BY source_platform, title;
```

(2026-07-09 기준 기대 결과: gdl 0행 + book_dash slug 3행 — drift 3권이 그대로면 정상.)

## Rollback

- `git revert` 1건으로 원복. DB 변경 없음.

## Appendix — 2026-07-09 DB 실측 (팀장 SQL)

총 4,273행 / 활성 3,657권.

| source_platform | is_active=true | is_active=false |
|---|---:|---:|
| african_storybook | 2,160 | 590 |
| bloom | 440 | 23 |
| book_dash | 206 | 3 |
| gdl | 851 | 0 |

- Hard Rule 감사: active_nc 0 / active_nd 0 / missing_attribution 0.
- book_dash source_id 형식 분포: **uuid 54(전부 활성) / slug 155(활성 152, 비활성 3)** — 총 209.
- gdl 비활성 0건 → cron 원복 함정의 **실제 피해 미발생** (본 ADR은 예방 조치).
