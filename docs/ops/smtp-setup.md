# 운영 가이드 — 인증메일 SMTP 설정 (Resend × Supabase Auth)

**상태** 운영 중 (2026-06-09 연결·검증 완료)
**관련** `docs/adr/0010-email-smtp-deferred.md`(§7 이연 해소), `docs/adr/0003-supabase-new-api-keys.md`(키 정책)

> ⚠️ **비밀값 취급 원칙**: 이 문서에는 API Key·DKIM 서명값 등 **비밀값을 평문으로 기록하지 않는다**(Hard Rule 6 / 인수인계 §2).
> 실제 값은 Resend 콘솔·Cloudflare 대시보드·Supabase Dashboard에만 존재하며, 아래 표의 `<...>`는 플레이스홀더다.

---

## 1. 개요 · 구성도

키키북스 인증메일(회원가입 confirmation·비밀번호 재설정 등)은 Supabase Auth가 발송하되,
실제 전송은 Resend 커스텀 SMTP를 경유한다. 발신 도메인은 공개 도메인 `hellokiki.co.kr`이다.

```
[Supabase Auth]
   │  (SMTP: smtp.resend.com:465, Username resend)
   ▼
[Resend]  ── 발신 도메인 hellokiki.co.kr (Verified, Region: Tokyo ap-northeast-1)
   │
   ▼  (SPF·DKIM·DMARC 인증 통과한 메일)
[수신자 메일함]  예: Naver 받은편지함 (스팸 아님)
```

- **공개 도메인**: hellokiki.co.kr (NHN Domain 등록, 네임서버는 Cloudflare로 위임)
- **DNS 관리**: Cloudflare (Free 플랜)
- **SMTP 제공사**: Resend
- **발신 주소(Sender)**: no-reply@hellokiki.co.kr / 발신자명 "키키북스"

> 내부 명칭(레포·Vercel·Supabase 프로젝트)은 여전히 "kikibooks"이며, 공개 도메인만 hellokiki.co.kr이다.

---

## 2. Resend 도메인 인증

| 항목 | 값 |
|---|---|
| 발신 도메인 | `hellokiki.co.kr` |
| 인증 상태 | **Verified** |
| Region | Tokyo (ap-northeast-1) |
| API Key | `<Resend 콘솔 → API Keys에서 발급, 비기록>` |

절차:
1. Resend 콘솔 → **Domains** → `hellokiki.co.kr` 추가.
2. Resend가 제시하는 DNS 레코드(SPF·DKIM·DMARC)를 Cloudflare에 등록(§3).
3. 전파 후 Resend에서 도메인 상태가 **Verified**로 전환되는지 확인.
4. **API Keys**에서 SMTP용 키 발급 → Supabase SMTP Password로 사용(§4). 키 값은 문서·커밋에 남기지 않는다.

---

## 3. Cloudflare DNS 레코드

`hellokiki.co.kr`의 네임서버가 Cloudflare로 위임되어 있으므로, 레코드는 Cloudflare 대시보드에서 관리한다.
아래 값은 **Resend 콘솔이 도메인별로 발급한 실제 값**으로 채운다(플레이스홀더 치환).

| 유형 | 이름(Name) | 값(Content) | 비고 |
|---|---|---|---|
| TXT | `<Resend 지정 호스트>` | `<SPF 레코드 — 예: v=spf1 include:...>` | SPF |
| TXT / CNAME | `<Resend 지정 DKIM 호스트>` | `<DKIM 서명값 — Resend 발급, 비기록>` | DKIM |
| MX | `<Resend 지정 호스트>` | `<Resend MX 호스트>` (우선순위 `<n>`) | 바운스 수신 |
| TXT | `_dmarc` | `<DMARC 정책 — 예: v=DMARC1; p=none; ...>` | DMARC |

> 정확한 호스트·값은 Resend Domains 화면의 "DNS Records"를 그대로 복사한다. Cloudflare에서 해당 레코드의 **Proxy 상태는 DNS only(회색 구름)** 로 둔다(메일 레코드는 프록시 대상 아님).

전파 확인: Resend Domains 상태가 모두 ✅(Verified)가 될 때까지 대기. 전파 지연 시 수 분~수십 분 소요.

---

## 4. Supabase Custom SMTP 설정값

Supabase Dashboard → **Authentication → Emails (SMTP Settings)** → Custom SMTP 활성화.

| 항목 | 값 |
|---|---|
| Enable Custom SMTP | ON |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | `<RESEND_API_KEY — Resend 콘솔에서 발급, 비기록>` |
| Sender email | `no-reply@hellokiki.co.kr` |
| Sender name | `키키북스` |

> Password에는 Resend **API Key**를 넣는다(계정 비밀번호 아님). 이 값은 Supabase Dashboard에만 저장하고 어디에도 평문 기록하지 않는다.
> "Confirm email"은 베타 보안상 **ON 유지**(ADR-0010 §4 결정 직역).

---

## 5. 장애 시 점검 순서

인증메일이 도착하지 않는다는 신고가 들어오면 아래 순서로 좁혀 나간다.

1. **Resend Logs** (1순위) — Resend 콘솔 → **Logs**. 발송 시도·전달(delivered)·바운스(bounced)·스팸 거부 여부 확인.
   - 기록이 아예 없음 → Supabase가 발송을 시도하지 않았거나 SMTP 인증 실패 → 2번으로.
   - bounced/blocked → 수신측 도메인 정책·DNS 인증 문제 → 3번으로.
2. **Supabase Auth Logs** (2순위) — Supabase Dashboard → **Authentication → Logs**(또는 Logs Explorer). `/signup`·`/recover` 요청이 정상 기록되는지, SMTP 에러 메시지가 있는지 확인.
   - 요청은 있으나 SMTP 에러 → §4 설정값(Host/Port/Username/API Key) 재확인.
3. **DNS 인증** (3순위) — Resend Domains 상태가 Verified 유지 중인지, Cloudflare에서 SPF·DKIM·DMARC 레코드가 변경·삭제되지 않았는지 확인.
4. **Rate limit / 평판** (4순위) — 단시간 대량 발송 시 Resend 플랜 한도·도메인 평판 영향. Resend 콘솔의 사용량·평판 지표 확인.

---

## 6. 비밀값 취급 원칙

- API Key·DKIM 서명값 등 비밀값은 **Resend 콘솔 · Cloudflare 대시보드 · Supabase Dashboard · Vercel env**에만 존재한다.
- 이 문서·커밋·작업지시서·ADR에 **평문 기록 0건**(Hard Rule 6, 인수인계 §2).
- 키 노출·교체가 필요하면 `docs/adr/0003-supabase-new-api-keys.md` 키 정책 및 별도 rotate 절차(phase-14 CP7)를 따른다.

---

*문서 끝.*
