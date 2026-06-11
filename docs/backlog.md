# Kikibooks 백로그 — 자진 신고 항목 단일 출처

**작성** 2026-05-29 · **상태** Active
**근거** phase-13c 종합 진단(옵션 C 변형 채택) · ADR-0020
**역할** phase-13c 동결로 이관되는 자진 신고 항목과 phase-14 베타 차단 항목의 단일 출처(single source of truth).
이 문서가 리포 외부 "인수인계 v2" 구두 문서를 대체한다(외부 문서는 버전 관리 0건·실측 누락으로 신뢰 불가).

> **원칙**: 모든 항목은 grep/view 실측 기반. 파일·라인은 grep으로 확인된 경우만 명시하고, 추정은 0건이다. 확인 못 한 항목은 "미실측"으로 표기한다.

---

## 1. phase-13c 종결 상태

- **완료**: CP1(`c950b2c` placeholder 정정) · CP2(`973837b` ADR-0020 footer 정책). 둘 다 origin push 완료(`9436f23..973837b`).
- **동결**: CP3~CP6. 진단 ③④ 결과 잔여 항목 대부분이 베타 최종 사용자(학부모·유아) 영향 0 → 베타 3개월 전 우선순위에서 후순위.
- **다음**: phase-14 베타 인프라 전환.

---

## 2. 동결 → phase-16 (post-beta) 이관 — 운영자 영역·코드 품질 (5건)

베타 최종 사용자 노출 0. 전부 `/admin`(운영자 1~2명) 영역 또는 내부 코드 품질.

| 신고# | 내용 | 노출 대상 | 베타 영향 | 관련 파일 (grep 확인) |
|---|---|---|---|---|
| #1 | AdminNav `aria-label="관리"` 하드코딩 | /admin | 0 | `components/admin/admin-nav.tsx:90` |
| #2 | 가드 함수 ADR-0019 명시 0건 (문서 갭, 기능 정상) | 문서/코드 품질 | 0 | `lib/admin/gate.ts` (requireAdmin/assertAdmin, 6파일에서 사용) |
| #3 | admin 에러 메시지 한국어 하드코딩 — 사용자 노출 12곳 | /admin | 0 | `lib/admin/gate.ts:225·230` · `lib/admin/users/actions.ts:88·130` · `lib/admin/books/actions.ts:118·137·140·166·185·188·223·237` |
| #11 | stats 아이콘 매핑 하드코딩 (Users/Baby/BookCheck/BookOpen) | /admin | 0 | `components/admin/stats/stats-dashboard.tsx:97·103·109·115` |
| #12 | `toLocaleString('ko-KR')` locale 하드코딩 | /admin 통계 | 0 | `components/admin/stats/stats-dashboard.tsx:79` |

> 참고: #3은 진단 시 사용자 노출 12곳 외에 진단용 `throw new Error` 한국어 10곳(`users/query.ts`·`books/query.ts`·`stats/query.ts`)이 별도 실측됐다. 진단 throw는 개발자용이라 카피 중앙화 대상에서 제외한다.

---

## 3. phase-14 이관 — 사용자 가시 영역 (2건)

| 신고# | 내용 | 노출 대상 | 베타 영향 | 관련 파일 (grep 확인) |
|---|---|---|---|---|
| #5 | 로그아웃 라벨 하드코딩 — home·library는 hotfix(`cd51647`) 완료, admin layout만 잔여 | 일반 사용자 + /admin | 경미 | `app/admin/layout.tsx:92` · `app/home/page.tsx:114` · `app/library/page.tsx:114` |
| #7 | `/book` 트리 페이지 로그아웃 UI 0건 (부재) | 일반 사용자 | 경미 (home·library엔 존재) | 해당 없음 (UI 부재 — 추가 대상) |

---

## 4. phase-14 신규 — 베타 차단 필수

진단 ③에서 식별. 실제 베타 차단 요소(법적·인증·보안). 파일은 phase-14 spec 작성 시 실측 확정.

| 항목 | 내용 | 차단 사유 |
|---|---|---|
| 변호사 검토 | 이용약관·개인정보처리방침 정식 문안 (현재 placeholder) | 법적 컴플라이언스 |
| OG 메타데이터 | 한글화·정합 | 공유 시 노출 |
| SMTP 인프라 | 이메일 발송 (ADR-0010 이연분) | 인증 메일 전달 |
| SUPABASE_SECRET_KEY rotate | 키 교체 | 보안 |
| `app/admin/error.tsx` | 전역 에러 UI (진단 후보 #13) | 운영 안정 |

> **CP7 갱신(2026-06-09)**: SUPABASE_SECRET_KEY rotate **완료** — 신규 키 1개 교체 + .env.local·GitHub Secrets·Vercel env 3곳 갱신 + 재배포(`0c7f192`) 후 가입·인증·DB·재로그인 전체 검증 통과(ADR-0003 §6 Amendment #1).
> **잔여 해소(2026-06-10)**: 노출됐던 옛 `default` secret 키 **폐기(Supabase 대시보드 revoke) 완료** — PM이 대시보드에서 직접 revoke. 신규 키(`SUPABASE_SECRET_KEY`) 전체 검증 통과 + 옛 키 사용처 0건 확인 후 폐기하여 무영향. 키 값·평문 비기록(Hard Rule 6). ADR-0003 §7 Amendment #2에 추기. **이로써 SUPABASE_SECRET_KEY rotate 항목(rotate + 옛 키 폐기) 전체 Resolved.**
> **도메인 연결 완료(2026-06-10)**: `hellokiki.co.kr` 정식 도메인을 Vercel 웹앱에 연결. DNS는 Cloudflare CNAME 2건(apex `@` + `www`, 둘 다 `vercel-dns-017` 값, DNS only), 기존 Resend 메일 레코드 4건(MX/SPF/DKIM/DMARC)은 보존·미변경. 환경변수 `NEXT_PUBLIC_SITE_URL=https://hellokiki.co.kr`(Production, 비-Sensitive) 설정 후 재배포 완료 — apex/www/vercel.app 3개 모두 Valid Configuration·SSL 발급·접속 확인. **코드 변경 0줄**: `lib/site.ts` 단일 출처가 이 변수를 우선순위 #1로 읽어(끝 슬래시 정규화) `app/robots.ts`·`app/sitemap.ts`·`app/layout.tsx`(metadataBase)의 절대 URL이 새 도메인으로 일괄 정정됨(grep 실측). 키 값·민감정보 평문 0건. (도메인 연결은 backlog 미등재 보류분으로 인수인계·메모리에서만 추적되던 항목 → 본 노트로 SSOT 편입.)
> **도메인 연결 후속 — 로그인 버그 2건 해소(2026-06-10)**: 도메인 연결 직후 (A-1) 구글 로그인이 계정 선택까지만 되고 미로그인 상태로 `/home` 이동, (A-2) 로그인 후 `hellokiki.co.kr`→`vercel.app` 임시도메인 이탈 — 2건 발견. **공통 원인**: Supabase Authentication → URL Configuration의 Redirect URLs 허용목록에 `hellokiki.co.kr` 미등록 → Supabase가 새 도메인으로 콜백을 돌려보내지 못함. **해소**: PM이 Supabase 대시보드에서 Site URL을 `hellokiki.co.kr`로 설정 + Redirect URLs에 `hellokiki.co.kr`(및 `www`) 추가, 기존 `vercel.app` 항목 보존. **코드 변경 0줄**(대시보드 설정만). Google Cloud Console OAuth는 콜백 주소로 Supabase 콜백 URL을 사용하므로 도메인 변경 영향 없어 **미변경**(향후 혼선 방지 명시). 검증(PM 직접): 구글 로그인 성공·도메인 유지·이메일 로그인·재로그인·자녀등록·완독 전체 통과. 키 값·프로젝트 시크릿 평문 0건.

---

## 5. 보류 — 영구 또는 phase-16+ 

| 신고# | 내용 | 보류 사유 |
|---|---|---|
| #8 | `lib/admin/users/actions.ts` 박제 위치 (CP4-a vs CP4-b 귀속) | 낮은 우선순위 (문서 귀속만) |
| #9 | `reading_sessions.is_completed` 인덱스 0건 | 베타 규모(~100명)에서 seq scan 무시 가능 |
| #10 | `completed_at` vs `is_completed` 동기 검증 | 보상 로직 영역 (phase-13 범위) |
| #16 | OG 이미지 한글화 (`app/opengraph-image.tsx`) — Noto Sans KR 서브셋 폰트 번들링 + edge ImageResponse 런타임 폰트 로딩 필요 | CP3 B-1(폰트 재선언 0건) 정책 일관성. OG 메타데이터 텍스트는 한국어 완비(phase-14 CP4, `app/layout.tsx`·`app/page.tsx`), 영문 잔존은 이미지 비트맵뿐. post-beta 이관 |

---

## 6. 카운트 정합 메모

- 진단 ③의 잔여 자진 신고 7건(#1·#2·#3·#5·#7·#11·#12) 중 5건(#1·#2·#3·#11·#12) 동결→phase-16, 2건(#5·#7) phase-14 이관.
- (외부 가이드 STEP 3은 동결분을 "6건"으로 적었으나 실제 나열은 5건 — 본 문서는 실측 5건으로 정정한다.)
- 해소 완료분: #4(ADR-0020) · #6(`cd51647` hotfix) · #14(CP1 placeholder) · #15(불발).
- phase-14 CP4 신규: #16(OG 이미지 한글화) §5 보류 추가. OG 메타데이터 텍스트 정합은 CP4에서 완료(`app/layout.tsx` 전역 한국어 OG 기본값). #14는 기존 점유라 신규는 #16 채번(다음 빈 번호).

---

## 7. 베타 품질개선 트랙 (2026-06-10 연장 세션)

phase-14 종결(17/17) 이후 시작한 홈·라이브러리 화면군 UX 개선 트랙. phase 재개가 아니라
출시 전 품질 보강이며, `tasks/_index.json` 진행 카운터는 무변경(이 트랙은 phase 외부).

### 7.1 완료분 (origin/main push 완료)

| 커밋 | 내용 | 핵심 파일 |
|---|---|---|
| `48c811c` | ADR-0015 Amendment #2 — 카테고리 라우팅 5b(`/home?cat=`)→5a(`/library?category=`) 박제 | `docs/adr/0015-screen-02-category-strategy.md` |
| `381b85e` | 작업1 카테고리 URL 동기화 — 칩 클릭 시 shallow `history.replaceState`. **category만**(서버 `app/library/page.tsx`가 category만 복원하는 실측 계약에 맞춤, PM 결정) | `components/library/library-browser.tsx` · `app/library/page.tsx` |
| `0e3e020` | 작업3 홈 그리드 카테고리별 권수 — `getCategoryDistribution` 연결, 카드에 "N권" | `app/home/page.tsx` · `components/home/category-grid.tsx` |
| `267f5d8` | 작업3 라이브러리 `totalCount` — 전체·레벨·키워드(keyset count 쿼리)·카테고리(`matched.length`) 전모드 "총 N권" | `lib/library/query.ts` · `components/library/library-browser.tsx` |
| `29960d0` | D19 spec 결정 정정 — 권수 미표시 결정 철회 박제 | `tasks/phase-10-screen-02-home.json` |

> 직전 배경: `389c7c4`(별도 세션)가 카테고리 카드 → 라이브러리 결과 연결 + 스트릭 월~일 고정을 처리했고, 위 트랙은 그 후속이다.

### 7.2 다음 세션 시작점 — 남은 작업

| 우선 | 작업 | 현황·실측 | 관련 파일 (grep 확인) |
|---|---|---|---|
| 🔧 착수(2026-06-11) | **작업2 공통 네비게이션** | **ADR-0021 발행(후보 A route group `app/(reader)/` + 방안 1 usePathname 분기 박제).** STEP 0 문서 선행 완료 → STEP 1 폴더 이동 → STEP 2 `components/app/app-header.tsx` 신설 → STEP 3 그룹 layout + page 정리 → STEP 4 검증 순. 자녀칩 1차 제외·library h1 page 잔류·컨테이너 미수렴(D2~D5) | `docs/adr/0021-reader-route-group-and-app-header.md`(결정) · `app/layout.tsx`(헤더 0건) · `components/landing/landing-header.tsx`(랜딩 전용) · 각 페이지 인라인 `<header>`: `app/home/page.tsx:94`·`app/library/page.tsx:122`·`app/book/[id]/page.tsx:107` |
| ★ 동반 | **stale spec 정정** | `tasks/phase-10-screen-02-home.json`의 D13·D20·D21·D23·D24가 `/home?cat=` 전제로 박제돼 `389c7c4` 이후 부분 stale. 라우팅 1차 출처는 ADR-0015 Amendment #2(박제 완료)라 급하진 않으나 **작업2 네비 박제 시 함께 정정 검토** | `tasks/phase-10-screen-02-home.json` (cp3_decisions) |
| 무거움 | **작업4 GDL iframe 헤더 노출** | 미착수. 뷰어 외부 콘텐츠 로딩 방식 **실측 선행 필요**. cross-origin 제약이 핵심 난점 | 미실측 (뷰어 컴포넌트 실측 후 확정) |

### 7.3 잔여 F-item (베타 차단 아님)

| 항목 | 내용 | 위치 |
|---|---|---|
| keyset count 재쿼리 | 라이브러리 keyset 모드가 무한 스크롤 페이지마다 count 재쿼리(head:true, 행 전송 0, 활성 ~896권 무부담). 대규모 시 첫 페이지(cursor=null)만 count하도록 최적화 | `lib/library/query.ts` `countKeyset` |
| 작업1 level·keyword URL 미동기화 | URL 동기화는 category만 구현됨. level·keyword는 서버(`app/library/page.tsx`)가 복원하지 않아 의도적 미반영 — 확장하려면 서버 searchParams 계약 동반 확장 필요 | `components/library/library-browser.tsx`(level·keyword 핸들러) · `app/library/page.tsx`(searchParams) |
