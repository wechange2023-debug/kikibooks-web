# 표지 결손 정찰 결론 — Bloom 무혐의 · ASb 743권 "표지만 죽음" 확정

작성 2026-07-29 · 기준 HEAD `1114cce` · **읽기 전용 정찰**(DB SELECT 1회 · Storage 접근 0 · 앱 코드 수정 0)
선행 문서: `docs/recon/2026-07-28-cover-url-availability.md`(외부 표지 4,116건 전수 측정)

산출물(로컬, `.gitignore` 대상 — 스크립트로 재생성 가능):
`scripts/recon/out/reconA_bloom_get.json` · `reconB_asb_body.json` · `reconB_asb_body.csv`

---

## 요약 (먼저 읽을 3줄)

1. **Bloom 463권은 무혐의가 유력하다.** 표지 전량 200 · 헤더 민감도 0 · 이중 인코딩 발생 지점 관측 안 됨.
2. **ASb 743권은 "표지만 죽고 본문은 살아 있다."** 표본 11권 중 10권이 본문 전량 생존, 본문 404는 0건.
3. 따라서 **본문 첫 이미지를 표지로 승격하는 경로가 기술적으로 열려 있다.**

---

## 1. 정찰 A — Bloom 표지는 왜 깨져 보이는가

### 1-1. 측정 결과

| 항목 | 결과 |
|---|---|
| URL 구조 | 463건 전량 `https://s3.amazonaws.com/bloomharvest/…` · **전량 `%2f`(인코딩 슬래시) 3개** · 버킷 뒤 실제 슬래시 0건 |
| `next.config.js` remotePatterns | `next.config.js:21-30`에 `s3.amazonaws.com` + `/bloomharvest/**` · `/BloomLibraryBooks/**` 등록됨. 표본 10건 host·첫 경로 세그먼트 전부 일치 |
| GET 4조합 (UA 유/무 × Referer 무/localhost/외부) | 표본 3건 전부 **200 · `image/jpeg`·`image/png` · 실제 이미지 바이트 · 리다이렉트 없음**. 조합 간 응답 차이 0 |
| URL 형태 변형 | `%2f`(원본) = 200 · 디코드 `/` = 200 · **`%252f`(이중 인코딩) = 404 (`application/xml`)** |

표지 렌더 컴포넌트는 5개 표면 모두 `next/image`(일반 `<img>` 아님):
`components/landing/book-cover-card.tsx:76` · `components/library/library-browser.tsx:151` ·
`components/admin/books/admin-books-browser.tsx:217` · `components/book/book-cover-hero.tsx:83` ·
`components/home/recommendation-list.tsx:90`

### 1-2. 결론 — 이중 인코딩 가설은 기각 쪽

`%252f`가 404라는 사실은 **"S3가 이중 인코딩에 취약하다"**는 것만 말해준다.
**실제로 이중 인코딩이 발생하는 코드 지점은 관측되지 않았다** — 파일·라인을 특정할 수 없다.
직전 정찰(`2026-07-28` §3-3)이 bloom 표지의 `/_next/image` 경유 200(image/png)을 이미 확인했고
이번 원본 측정도 전량 200이므로, **Bloom 463권은 DB·원본·헤더·패턴 4단계 모두 정상**으로 본다.

**남은 가설(유력)**: 화면에서 깨져 보인 카드는 bloom이 아니라 **ASb 오인**이다.
카드에서 출처는 하단 badge에만 표시돼 구분이 어렵고, 실제로 ASb는 사용자 화면 743권 ·
관리자 화면 1,237권이 깨져 있다. 지금까지의 모든 측정치가 이 가설과 일치한다.

### 1-3. 미검증 1건 (정직하게 남김)

**실행 중인 앱의 `/_next/image` 엔드포인트를 이번 세션에서 직접 두드리지 않았다.**
새 PC의 `node_modules`가 불완전(`next/dist/compiled/` 부재)하고 배포 URL도 저장돼 있지 않다.
결정적 확인은 **`pnpm install` + 로컬 서버 기동이 선행**돼야 한다.

---

## 2. 정찰 B — ASb 표지404 743권: 표지만 죽었나, 책 전체가 죽었나

### 2-1. 표본 설계와 판정

모집단: 표지 404 + `is_active=true`인 ASb **743권**. 표지번호 `N` 구간별 5권씩 목표.

| ID 구간 | 모집단 | 표본 | (a) 표지만404·본문생존 | (b) 본문도 404 | (c) 판정불가 |
|---|---:|---:|---:|---:|---:|
| N < 30,000 | **1** | 1 | 0 | 0 | 1 |
| 30,000 – 34,999 | 59 | 5 | **5** | 0 | 0 |
| N ≥ 35,000 | 683 | 5 | **5** | 0 | 0 |
| **합계** | **743** | **11** | **10** | **0** | **1** |

- **표본이 15권이 아니라 11권인 이유**: 30,000 미만 구간에 대상이 **1권뿐**이라 5권을 채울 수 없었다.
  743권의 **92%(683권)가 35,000 이상**에 몰려 있다 — 선행 문서 §3-1의 구간 경향과 일치한다.
- **(b) 본문도 404는 0건.** ID 구간과 무관하게 본문은 살아 있다.
- (c) 1건 = `Ekai's First Day In School`(N=11932): 매니페스트 200·이미지 12장이나 1번째 404, 2번째 200 — **부분 결손**.

### 2-2. ⚠ 1차 측정의 "본문 죽음 6건"은 측정 아티팩트

1차 측정에서 6건이 `(b) 본문도 죽음`으로 분류됐으나, 실패 사유가 HTTP 404가 아니라
`TypeError: fetch failed`(연속 요청 중 커넥션 실패)였다.
**직렬 + 지수 백오프로 재측정한 결과 6건 전부 매니페스트·본문 이미지 모두 200**이었다.
→ 네트워크 오류를 404로 읽으면 안 된다. 재측정 없이는 "본문 죽음"으로 오판했을 사안이다.

### 2-3. 본문 경로 구조 — 표지와 완전히 분리돼 있다

| 대상 | URL 패턴 | 호스트 | 상태 |
|---|---|---|---|
| 표지 | `https://africanstorybook.org/illustrations/**covers**/{N}.png` | africanstorybook.org | **1,237건 404** |
| 본문 매니페스트 | `https://raw.githubusercontent.com/global-asp/asp-raw-db/master/data/{N}.txt` | raw.githubusercontent.com | 표본 11/11 **200** |
| 본문 이미지 | `https://africanstorybook.org/illustrations/**pages**/{M}.png` | africanstorybook.org | 표본 21/22 **200** |

- `{N}` = ASb 책 번호. DB `cover_url`의 표지번호와 `content_url`의 매니페스트 번호가 **동일**하다.
- `{M}` = 본문 이미지 번호로 `{N}`과 무관하다. 매니페스트 `images:` 섹션에서 순서대로 읽는다.
- 파싱 규칙은 `lib/book/asb-parser.ts`(ADR-0025 Amd#6)와 동일하게 적용해 측정했다.
- **핵심**: 같은 호스트(`africanstorybook.org`)인데 `/covers/`만 죽고 `/pages/`는 살아 있다.
  즉 호스트·네트워크 문제가 아니라 **원본 표지 파일만 게시되지 않은 것**이다.

### 2-4. "본문 첫 이미지 → 표지 승격" 실현 가능성

**기술적으로 실현 가능하다.** 본문 이미지가 표지와 무관하게 전량 생존하므로,
1권당 매니페스트 `.txt` 1회 fetch로 첫 이미지 URL을 얻을 수 있다
(bloom이 쓰는 ADR-0030 D2 전략, book_dash의 ADR-0032 Storage 이관 선례와 같은 계열).
주의점 2가지: ① 첫 이미지가 404인 부분결손 케이스가 있으므로 **첫 200 응답까지 순회**가 필요하고,
② 승격 후 원본이 더 사라질 수 있으므로 **Supabase Storage 복사**를 함께 두는 편이 안전하다.

---

## 3. 다음 단계 (합의)

| # | 단계 | 상태 |
|---|---|---|
| 1 | `pnpm install` — 새 PC `node_modules` 복구 | 대기 |
| 2 | 로컬 기동 후 화면 검증 (`/_next/image` 실측 · bloom/ASb 카드 육안 확인) | 1단계 이후 |
| 3 | ASb 743권 표지 승격(본문 첫 이미지) + Supabase Storage 복사 | **팀장 승인 대기** |

3단계는 DB `cover_url` 쓰기와 Storage 쓰기를 동반하므로 승인 전에는 착수하지 않는다.

---

## 4. 별건 메모

- **ASb 2권 `cover_url` 데이터 오류**: `'Xam'` / `'Xama'`(둘 다 제목 `Fire on the mountain`, `is_active=true`).
  URL이 아닌 언어명이 들어갔다 — 동기화 스크립트 필드 매핑 오류 가능성. 선행 문서 §4 참조. 미조치.
- **작업 PC 이관 완료**: 신규 경로 `D:\_Claude\헬로키키\kikibooks_platform` (이전 `E:\` 경로 폐기).
  git 2.55.0 · gh 2.96.0(crspiegel) · node v24.18.0 · pnpm 11.17.0 설치 확인.
  **`node_modules`가 불완전하게 복사됐다**(`next/dist/compiled/` 부재) → `pnpm install` 필요.
  **Python은 미설치**(Microsoft Store 스텁만 존재) — 기존 Python 정찰 스크립트
  (`scripts/recon/cover_url_probe.py` 등)는 현재 이 PC에서 실행할 수 없다.
  이번 정찰은 Node 내장 fetch로 대체 수행했다.

---

## 5. 재현

산출물은 `.gitignore` 대상이라 커밋되지 않는다. 필요 시 `scripts/recon/out/`의
`_reconA_simple.mjs` · `_reconB_asb_body.mjs` · `_reconB_retry.mjs`를 `node`로 재실행한다
(`_reconB_asb_body.mjs`는 `.env.local`의 `SUPABASE_SECRET_KEY`로 SELECT 1회만 수행).
