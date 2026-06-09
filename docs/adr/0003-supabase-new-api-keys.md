# ADR 0003 — Supabase 새 API 키 시스템 채택 (Publishable / Secret)

**ADR 번호** ADR-0003
**상태** Accepted
**결정일** 2026-05-13
**작성자** 키키북스 팀
**관련 문서** `claude.md` 2절 Hard Rule 6, `ADR-0001` 2.2 (Supabase 선택), `lib/supabase/`, `.env.example`

---

## 1. 컨텍스트

Supabase는 2025년 중반부터 새 API 키 시스템을 도입했다. 키키북스는 2026년 5월 신규 프로젝트라 신규 시스템이 기본 발급 형태다.

| 시스템 | 공개 키 (브라우저) | 비밀 키 (서버) |
|---|---|---|
| Legacy (~2024) | `anon` (`eyJ...` JWT) | `service_role` (`eyJ...` JWT) |
| **새 시스템 (2025+)** | **Publishable (`sb_publishable_xxx`)** | **Secret (`sb_secret_xxx`)** |

새 시스템은 다음 이점이 있다.

- 키 형태(접두사)만으로 공개/비밀 구분 가능 → 실수 노출 시 즉시 식별
- Legacy `service_role` JWT는 페이로드에 권한이 박혀 있어 회전이 어려운 반면, Secret 키는 서버 측에서 즉시 무효화 가능
- 키 사용 통계·로그 분리 강화

이번 결정의 직접 트리거: **Legacy `service_role` 키 노출 사건**으로 키 회전이 필요해졌고, 회전 시점에 새 시스템으로 전환하는 것이 합리적이다.

---

## 2. 결정

키키북스는 다음 환경변수 이름을 표준으로 사용한다.

| 환경변수 | 값 형태 | 사용처 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | 클라이언트·서버 공통 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_xxx` | 브라우저(`createBrowserClient`) + 서버 SSR(`createServerClient`) |
| `SUPABASE_SECRET_KEY` | `sb_secret_xxx` | ★ 서버 전용. cron·시드·관리자 라우트 |

`SUPABASE_SECRET_KEY`는 **`NEXT_PUBLIC_` 접두사가 없는** 점이 핵심이다. Next.js는 빌드 시 `NEXT_PUBLIC_*`만 클라이언트 번들에 포함시킨다. 추가로 `lib/supabase/server.ts`는 `import 'server-only'`로 클라이언트에 포함될 경우 빌드를 실패시킨다.

### 2.1 Legacy fallback 정책

`lib/supabase/client.ts`와 `lib/supabase/server.ts`는 **새 이름이 비어 있을 때만** 옛 이름을 fallback으로 인식한다.

```ts
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const secretKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
```

이는 다음 시나리오를 모두 지원한다.

- **신규 사용자**: 새 이름만 설정 → 정상 작동
- **기존 사용자가 옛 이름으로 입력**: 옛 이름이 fallback으로 인식되어 작동 (전환 유예)
- **양쪽 다 설정 시**: 새 이름 우선

Legacy 키 자체는 Supabase가 비활성화하면 키 검증 단계에서 자연스럽게 실패한다. 코드는 이름만 다리 놓을 뿐이다.

---

## 3. 영향 (Consequences)

### 3.1 즉시 영향

- `.env.example`이 새 이름으로 갱신됨
- 기존 `.env.local`을 가진 사용자는 새 이름으로 갱신 권장 (옛 이름도 당분간 작동)
- README의 환경변수 섹션이 새 이름 기준으로 변경됨

### 3.2 후속 작업

- **사용자 작업**: Supabase 대시보드 → Project Settings → API → "API keys"에서 Publishable 키와 Secret 키를 발급받아 `.env.local`에 입력
- **GitHub Secrets** (Phase 6): 콘텐츠 동기화 워크플로의 Repository Secret을 새 이름으로 갱신
- **Vercel 환경변수** (배포 시): Vercel 프로젝트 환경변수도 새 이름으로 등록

### 3.3 Legacy fallback 제거 시점

다음 조건이 모두 충족되면 fallback 코드(2.1절)를 제거한다.

1. Supabase가 Legacy 키를 완전 비활성화 발표 (현재 시점 미정, 6개월~1년 유예 예상)
2. 키키북스의 모든 환경(.env.local, GitHub Secrets, Vercel)이 새 이름으로 통일됨
3. 후속 ADR로 fallback 제거 결정 기록

---

## 4. 대안 검토

| 대안 | 사유 | 채택 여부 |
|---|---|---|
| 옛 이름 유지 (`anon`/`service_role`) | 수정 작업 0 | ❌ Legacy 키 비활성화 예정 + 노출 사건으로 회전 필요 |
| 새 이름만 채택 (fallback 없음) | 단순 | ❌ 사용자가 옛 이름으로 입력 시 무성 실패 위험 |
| **새 이름 + Legacy fallback (선택)** | 전환 안전망 + 명확한 표준 | ✅ |

---

## 5. 미래 자신을 위한 메모

1. Supabase는 키 시스템 외에도 RLS·Auth API를 자주 갱신한다. 환경변수 이름 변경 같은 "외관" 변경은 fallback으로 흡수하되, **권한 모델 자체가 변하면 별도 ADR을 작성**한다.
2. `SUPABASE_SECRET_KEY`는 비밀번호 매니저에만 보관한다. 이 ADR을 포함한 어떤 문서·커밋·로그에도 실제 값이 등장해선 안 된다.
3. 노출 의심 시 1순위 행동: Supabase 대시보드에서 즉시 키 회전 → `.env.local`·GitHub Secrets·Vercel 환경변수를 새 값으로 업데이트.

---

## 6. 갱신 (2026-06-09) — 키 회전 완료 (Amendment #1)

§1이 본 ADR 생성의 직접 트리거로 명시한 "Legacy `service_role` 키 노출 사건"의 후속 조치를 phase-14 CP7에서 실행했다(§3.2 후속 작업·§5 메모 3 "노출 시 1순위 행동" 직역).

- **회전 일자**: 2026-06-09
- **대상**: `SUPABASE_SECRET_KEY` — 신규 secret 키 1개로 교체 (키 값·평문 비기록, Hard Rule 6)
- **갱신 지점 3곳**: `.env.local` / GitHub Secrets / Vercel 환경변수 — 모두 §2 표준 이름 `SUPABASE_SECRET_KEY` 그대로 유지(이름 변경 없음, 값만 교체)
- **검증**: 신규 키로 재배포(배포 `0c7f192` 환경) 후 회원가입·이메일 인증·DB 쓰기·재로그인 전체 정상 동작 확인
- **잔여(후속 조치)**: 노출됐던 옛 secret 키(대시보드 라벨 `default`)의 **폐기(revoke)는 미완** — PM 결정으로 보류. 신규 키 검증이 끝나 옛 키는 사용처가 없다. `docs/backlog.md`에 폐기 잔여로 등재했으며, 폐기 완료 시 본 절에 추기한다.

이로써 §3.2 후속 작업의 `.env.local`·GitHub Secrets·Vercel 갱신 항목은 충족됐다. §3.3 Legacy fallback 코드 제거는 별개 트리거(Supabase의 Legacy 키 전체 비활성화 발표)에 따르며 본 회전과 무관하다.

---

*문서 끝. 본 ADR의 변경은 새 ADR로 작성하고, 본 문서는 "Superseded by ADR-XXXX" 표시 후 유지합니다.*
