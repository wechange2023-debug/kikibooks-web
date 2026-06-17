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
| 변호사 검토 | 이용약관·개인정보처리방침 정식 문안 (✅ 종결 — 아래 CP5 노트) | 법적 컴플라이언스 |
| OG 메타데이터 | 한글화·정합 | 공유 시 노출 |
| SMTP 인프라 | 이메일 발송 (ADR-0010 이연분) | 인증 메일 전달 |
| SUPABASE_SECRET_KEY rotate | 키 교체 | 보안 |
| `app/admin/error.tsx` | 전역 에러 UI (진단 후보 #13) | 운영 안정 |

> **CP7 갱신(2026-06-09)**: SUPABASE_SECRET_KEY rotate **완료** — 신규 키 1개 교체 + .env.local·GitHub Secrets·Vercel env 3곳 갱신 + 재배포(`0c7f192`) 후 가입·인증·DB·재로그인 전체 검증 통과(ADR-0003 §6 Amendment #1).
> **잔여 해소(2026-06-10)**: 노출됐던 옛 `default` secret 키 **폐기(Supabase 대시보드 revoke) 완료** — PM이 대시보드에서 직접 revoke. 신규 키(`SUPABASE_SECRET_KEY`) 전체 검증 통과 + 옛 키 사용처 0건 확인 후 폐기하여 무영향. 키 값·평문 비기록(Hard Rule 6). ADR-0003 §7 Amendment #2에 추기. **이로써 SUPABASE_SECRET_KEY rotate 항목(rotate + 옛 키 폐기) 전체 Resolved.**
> **도메인 연결 완료(2026-06-10)**: `hellokiki.co.kr` 정식 도메인을 Vercel 웹앱에 연결. DNS는 Cloudflare CNAME 2건(apex `@` + `www`, 둘 다 `vercel-dns-017` 값, DNS only), 기존 Resend 메일 레코드 4건(MX/SPF/DKIM/DMARC)은 보존·미변경. 환경변수 `NEXT_PUBLIC_SITE_URL=https://hellokiki.co.kr`(Production, 비-Sensitive) 설정 후 재배포 완료 — apex/www/vercel.app 3개 모두 Valid Configuration·SSL 발급·접속 확인. **코드 변경 0줄**: `lib/site.ts` 단일 출처가 이 변수를 우선순위 #1로 읽어(끝 슬래시 정규화) `app/robots.ts`·`app/sitemap.ts`·`app/layout.tsx`(metadataBase)의 절대 URL이 새 도메인으로 일괄 정정됨(grep 실측). 키 값·민감정보 평문 0건. (도메인 연결은 backlog 미등재 보류분으로 인수인계·메모리에서만 추적되던 항목 → 본 노트로 SSOT 편입.)
> **도메인 연결 후속 — 로그인 버그 2건 해소(2026-06-10)**: 도메인 연결 직후 (A-1) 구글 로그인이 계정 선택까지만 되고 미로그인 상태로 `/home` 이동, (A-2) 로그인 후 `hellokiki.co.kr`→`vercel.app` 임시도메인 이탈 — 2건 발견. **공통 원인**: Supabase Authentication → URL Configuration의 Redirect URLs 허용목록에 `hellokiki.co.kr` 미등록 → Supabase가 새 도메인으로 콜백을 돌려보내지 못함. **해소**: PM이 Supabase 대시보드에서 Site URL을 `hellokiki.co.kr`로 설정 + Redirect URLs에 `hellokiki.co.kr`(및 `www`) 추가, 기존 `vercel.app` 항목 보존. **코드 변경 0줄**(대시보드 설정만). Google Cloud Console OAuth는 콜백 주소로 Supabase 콜백 URL을 사용하므로 도메인 변경 영향 없어 **미변경**(향후 혼선 방지 명시). 검증(PM 직접): 구글 로그인 성공·도메인 유지·이메일 로그인·재로그인·자녀등록·완독 전체 통과. 키 값·프로젝트 시크릿 평문 0건.
> **CP5(약관·개인정보) 종결 정합화(2026-06-12)**: 본 "변호사 검토" 행은 **2026-06-10 정식 문안 적용·커밋 `936bdc5`로 이미 종결**됨(`app/terms/page.tsx` 이용약관 13개조 + `app/privacy/page.tsx` 개인정보처리방침 14개조, placeholder·베타 배너 제거, 시행일 2026-07-01). tasks JSON 2파일은 당시 이미 phase-14·CP5-legal-copy를 `success` 마킹. **2026-06-12 PM 결정**: 법률 전문가 검토 **없이** 현재 **자체 작성본을 그대로 적용·확정**하고 CP5를 종결한다 — 단 "법률 검토 1회(결제 도입·사용자 증가 전 필수)"는 **후속 항목으로 §7.3에 등재**. 직전 핸드오버(§7.4)가 CP5를 "법률 검토 대기 보류 1건"으로 stale 표기하던 것을 본 노트로 정합화(JSON 무수정, 옵션 B). 키 값·민감정보 0건.

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
| `c7788b6` | **작업2 공통 네비게이션 완료(2026-06-11)** — 로그인 후 화면 공통 헤더 + `(reader)` route group. 3커밋 묶음: `f575655`(ADR-0021 발행) → `09c4749`(home·library·book → `app/(reader)/` 이동, URL 불변) → `c7788b6`(AppHeader 신설·layout 연결·page 헤더 수렴). usePathname으로 read·celebrate 미렌더, book not-found는 노출(Am#1). routes.ts `HOME_PATH`·`LIBRARY_PATH` 중앙화. Vercel 배포 success | `docs/adr/0021-reader-route-group-and-app-header.md` · `app/(reader)/layout.tsx` · `components/app/app-header.tsx` · `lib/auth/routes.ts` |
| `954fd80` | **stale spec 정정 완료(2026-06-11)** — phase-10 JSON D13·D20·D21·D23·D24 + v8 로그 2곳 superseded 표기(원문 보존). intent/screen-02-home.md `/home?cat=`→`/library?category=` 현행 갱신(§4.3 재작성). `_index.json` 무변경. Vercel 배포 success | `tasks/phase-10-screen-02-home.json` · `docs/intent/screen-02-home.md` |

> 직전 배경: `389c7c4`(별도 세션)가 카테고리 카드 → 라이브러리 결과 연결 + 스트릭 월~일 고정을 처리했고, 위 트랙은 그 후속이다.

### 7.2 다음 세션 시작점 — 남은 작업

> 작업2 공통 네비게이션(`c7788b6`)·stale spec 정정(`954fd80`)은 2026-06-11 완료(§7.1 이관). **작업4 트랙은 2026-06-12 완전 종결**(GDL 헤더 · nav-bar 띠 · 이미지 404 · 증상 B 4건 전부 종결, 아래 표). 본 트랙에 베타 차단 잔여 작업 0건 — 잔여는 §7.3 F-item(비차단)뿐.

| 우선 | 작업 | 현황·실측 | 관련 파일 (grep 확인) |
|---|---|---|---|
| ✅ 종결 | **작업4-GDL iframe 헤더 노출** | **PM 브라우저 검증 통과·종결**. 원인=GDL content_url이 postLink(사이트 전체 페이지: gdl-header·쿠키배너·Read 랜딩)였음. 해결=B-lite로 content_url을 H5P 전용 embed URL(`admin-ajax.php?action=h5p_embed&id={h5pId}`)로 전환(코드 `12016dc` + 842권 실 upsert, ADR-0017 Amendment #3). 검증 SELECT 통과(embed 842/postLink 0/BookDash 54 무변경/attribution NULL 0) + PM 브라우저 확인 완료 | `scripts/sync_gdl.py`(content_url=EMBED_URL_TEMPLATE) · 뷰어/미들웨어 무변경 |
| ✅ 종결 | **작업4-BookDash nav-bar 띠 노출** | **PM 브라우저 검증 통과·종결**(띠 소멸·본문 무손실). Book Dash 54권 외부 페이지 상단 `#nav-bar`(`position:fixed`, breadcrumb 띠) 부모 레벨 클리핑. 본문 h1이 `#wrapper padding-top:4em`(≈76.8px, 뷰포트 비의존)에서 시작 → iframe 74px 위로(absolute, 부모 overflow-hidden) 띠만 제거(2줄 와핑 64px<74<76.8). 코드 `f8a37c1`. GDL은 embed로 chrome 부재라 클리핑 0 | `app/(reader)/book/[id]/read/page.tsx`(clipNavBar) · `components/book/html-reader.tsx`(CLIP_NAVBAR_CLASS) |
| ✅ 종결 | **작업4-BookDash 본문 이미지 404** | **차단 완료**. 전수 감사(54권) — 15권 본문 이미지 전부 404(원본 미배포). 기존 표지 블랙리스트 4권 + **신규 11권**을 `BOOK_DASH_404_SOURCE_IDS`에 추가(코드 `4e574fb`, ADR-0014 Amendment #6). is_active=false는 주간 cron이 되돌려 부적합 → 코드 측 블랙리스트(cron-proof). 노출 가능 881권(§7.3 F-item 참조) | `lib/shared/blacklist.ts`(15건) |
| ✅ 종결 | **작업4-증상 B: /read 직접 진입 폴백 오발동** | **근본 수정·PM 검증 통과**. 증상=`/book/{id}/read` URL **직접 진입**(주소창·새로고침) 시 본문 대신 "책을 불러올 수 없어요" 폴백 노출(상세 **경유** 진입은 정상). 원인=`HtmlReader`가 SSR되어 iframe `src`가 초기 HTML에 인라인 + `loading="eager"` → 브라우저가 **hydration 전 로드 완료** → `onLoad`(hydration 시 부착)가 load 이벤트 **유실** → 5초 타임아웃이 error 폴백 오발동. 수정=iframe을 `mounted` 게이트로 **클라이언트 마운트 후에만 렌더** + 타이머도 mounted 이후 시작("리스너 부착 후 로딩 시작" 보장, **타임아웃 상향 아님**). 코드 `04ff946`(1파일), ADR-0017 Amendment #4. 검증=PM 프로덕션 5회(Book Dash 직접 3 + 경유 1 + GDL 직접 1) 전부 정상 | `components/book/html-reader.tsx`(mounted 게이트) |

### 7.3 잔여 F-item (베타 차단 아님)

| 항목 | 내용 | 위치 |
|---|---|---|
| keyset count 재쿼리 | 라이브러리 keyset 모드가 무한 스크롤 페이지마다 count 재쿼리(head:true, 행 전송 0, 활성 ~896권 무부담). 대규모 시 첫 페이지(cursor=null)만 count하도록 최적화 | `lib/library/query.ts` `countKeyset` |
| 작업1 level·keyword URL 미동기화 | URL 동기화는 category만 구현됨. level·keyword는 서버(`app/library/page.tsx`)가 복원하지 않아 의도적 미반영 — 확장하려면 서버 searchParams 계약 동반 확장 필요 | `components/library/library-browser.tsx`(level·keyword 핸들러) · `app/library/page.tsx`(searchParams) |
| ✅ 종결 — 노출 가능 905권 (목표 900 +5) | **순서4 종결(2026-06-15)**: 전체 is_active = **905권**(GDL 851 + 그 외 54). ADR-0008 베타 목표 900권 **+5 달성**. GDL 851 = 842 + cc-by-3-0 4 + sa-4-0-2 정규화 흡수 5(ADR-0022 Amendment #1 실측). | `lib/shared/blacklist.ts`(15 차단) · `scripts/sync_gdl.py` |
| Book Dash 원본 이미지 404 재감사 | 차단 11권은 원본(bookdash.github.io) 미배포가 원인 — 원본 측 복구 시 블랙리스트 해제 가능. **분기별 전수 이미지 재감사**로 복구 여부 확인(ADR-0014 §6 후속 과제 2, Amendment #6) | `lib/shared/blacklist.ts` · 전수 HEAD 감사 스크립트(리포 외부) |
| ✅ 종결 — 구 vercel.app 주소 canonical | **리다이렉트 설정 완료(2026-06-12, 코드 0줄)** — PM이 Vercel 대시보드 Settings → Domains에서 `kikibooks-web.vercel.app`을 "Redirect to Another Domain" → `www.hellokiki.co.kr`, **307 Temporary Redirect**로 설정. curl 실측: 루트 `307 → https://www.hellokiki.co.kr/`, `/library` `307 → https://www.hellokiki.co.kr/library`(경로 유지·Server: Vercel). 코드 내 vercel.app 하드코딩 0건(직전 조사) — auth 콜백·redirectTo는 요청 host/`window.location.origin` 상대라 무간섭. **후속 1건**: 307 → 308(영구) 승격 — 수일 운영 후 대시보드 설정 변경만(코드 0줄) | Vercel 도메인 설정(리포 외부) |
| ✅ 종결 — legacy 키 폴백 제거 | `SUPABASE_SERVICE_ROLE_KEY` 폴백 7건(`?? / or`) **제거 완료(2026-06-12, 커밋 `170b148`)** — server.ts 1 + scripts 6. `SUPABASE_SECRET_KEY` 단독 참조, 미설정 시 명시 실패(throw / [FAIL]+exit). ADR-0003 Amendment #3 | `lib/supabase/server.ts` · `scripts/*.py`(6종) |
| GitHub Actions Node 20 deprecation | `verify-licenses` 수동 실행(2026-06-12)에서 **Node.js 20 deprecation 경고** 확인 — `checkout@v4`·`setup-python@v5`의 Node 20 런타임이 향후 Node 24로 강제 전환 예정 안내. 현행 3개 워크플로 모두 v4/v5 사용, **현재 동작 정상(비차단)**. `checkout@v5`·`setup-python@v6` 안정화 시 일괄 승격 검토 | `.github/workflows/*.yml`(3종) |
| 약관·개인정보처리방침 법률 검토 1회 | **결제 도입·사용자 증가 전 필수.** 베타는 2026-06-12 PM 결정으로 **자체 작성본**(936bdc5, 변호사 미검토)을 그대로 적용해 CP5 종결(§4 CP5 노트). 결제 게이트 도입 또는 사용자 본격 증가 시점 이전에 법률 전문가 검토 1회를 거쳐 문안 보정 | `app/terms/page.tsx` · `app/privacy/page.tsx` |

### 7.4 새 세션 인수인계 (2026-06-13 갱신)

- **origin/main HEAD**: `7aed470` (working tree clean) — 본 문서 커밋 직후 신규 해시로 갱신 예정(기존 관례 유지).
- **phase-14 = 완료 / 보류 0건**: tasks JSON 2파일(`tasks/_index.json`·`tasks/phase-14-beta-infrastructure.json`)은 **2026-06-10 시점에 이미 phase-14 `success`·CP1~7 전건 종결로 마킹**됨(`completed_phases: 17`·`remaining_phases: 0`). 마지막 미정합이던 CP5만 본 세션에서 문서 정합화 → **베타 차단 보류 0건**. (옵션 B: 이미 success인 JSON은 무수정, 문서만 정합화.)
- **2026-06-12 세션 종결 내역**:
  - ✅ **legacy secret 키 폐기 확인** — 2026-06-10 PM revoke 완료분 재확인. secret key는 `SUPABASE_SECRET_KEY` 표준 단일 키만 유효.
  - ✅ **legacy 키 폴백 7건 제거**(`170b148` 코드 + `176b0c6` 문서) — `SUPABASE_SERVICE_ROLE_KEY` 폴백(`?? / or`) server.ts 1 + scripts 6 **전건 삭제**, 미설정 시 명시 실패(throw/[FAIL]+exit). ADR-0003 Amendment #3. (직전 §7.4가 "폴백 7건뿐·무영향"으로 두던 stale 표기를 본 갱신에서 '제거 완료'로 정합화.)
  - ✅ **도메인 연결 정합화**(`1b8c80f`) — `hellokiki.co.kr` 연결 종결 반영(§3 도메인 노트·§4와 정합).
  - ✅ **vercel.app 307 리다이렉트**(`ef01134`, 대시보드 설정·코드 0줄) — `kikibooks-web.vercel.app` → `www.hellokiki.co.kr` 307 Temporary Redirect(경로 유지). curl 실측 통과(§7.3).
  - ✅ **CP5 stale 정합화**(이번 커밋) — §4 CP5 종결 노트 + §7.3 법률 검토 후속 F-item 등재. JSON 무수정.
- **2026-06-13 세션 종결 내역(계획 v2 문서 트랙)**:
  - ✅ **PLAN.md v2.0 개정**(`a24631b`) — HelloKiki 명칭 + Phase 1.5 베타 보강(트랙A 콘텐츠 확장·트랙B AI/TTS) 신설, §4 cc-by-3-0·StoryWeaver/Bloom/ASB 분리, §5 $0 종료(AI·TTS·스토리지 한정), §12 위험 4행, §13 트리거 Phase 1.5 기준.
  - ✅ **prd-beta.md v2 개정**(`5e960e5`) — §3.4 Phase 1.5 DoD(AI 옵션 A·낭독 TTS·~960권), §4 Out of Scope 재조정(StoryWeaver·Bloom Phase 1.5 조건부, 옵션 C=v1.1).
  - ✅ **license-rules v1.1 + ADR-0004 Amendment #1**(`7aed470`) — §1 cc-by-3-0 화이트리스트 추가(DB CHECK 반영은 순서4 대기), §4.4 TTS 음성(2차 저작물) 어트리뷰션 절, ADR-0004 §3.3 StoryWeaver·ASB 보류 해제(enum 값 추가는 미실행).
  - (선행) ✅ **ADR-0022·0023**(`a796750`) — 콘텐츠 소스 확장 / AI 기능·TTS 정책. 위 3개 문서 트랙의 근거.
- **구조 변경 주의(유지)**: 로그인 후 화면 3종이 `app/(reader)/` route group(URL 불변). 경로 `app/(reader)/home`·`app/(reader)/library`·`app/(reader)/book/[id]`. 공통 헤더 `components/app/app-header.tsx`(usePathname 분기) + `app/(reader)/layout.tsx` 주입. ADR-0021 참조.
- **신규 발생 사항(진행 상태)**:
  - (a) **플랫폼 명칭 변경 결정(2026-06-12): 키키북스 → HelloKiki(헬로키키)** — **부분 반영**(신규 v2 문서 텍스트는 HelloKiki: PLAN v2.0·PRD v2·license v1.1 신규 문장). **전수 반영 잔여**(backlog·README·UI 라벨·design-system·메타데이터·legal 문안 등) 전수 조사 후 반영 필요. (도메인 `hellokiki.co.kr`은 이미 명칭과 정합.)
  - (b) **PM 신규 계획 수립(2026-06-12)** — **베타 전**: 내부 테스트 → 피드백 기능 보강 → **디자인 리뉴얼**(출시 가능 수준) + **자체 제작 e-book 23권**(Beatrix Potter PD). **베타 후**: AI 콘텐츠 develop / 자체 e-book·영상 제작. → **✅ `PLAN.md` v2.0 반영 완료(`a24631b`) + PRD v2·license v1.1 동반 완료**. 실측 조사 결과(스키마 CHECK·라이선스 공백·Beatrix Potter 미실행 추적 공백 등)는 2026-06-12 조사 보고 참조.
  - (c) **추가도서 확장 트랙(2026-06-15 recon 완료, 읽기 전용)** — 핵심 결과: ① ADR-0022에 2차(StoryWeaver)/3차(Bloom) 로드맵 **이미 문서화** — 실제 적재 착수 시 **Amendment #2 필요**(`source_platform` enum 값 + dedup 키 + `is_active=false` staging 정책 확정용). ② `source_platform` 화이트리스트 **공유 지점 2곳**(DB CHECK `001_initial_schema.sql:62-70` + `scripts/lib/attribution.py` `PLATFORM_LABELS`) — 신규 소스 추가 시 **동시 갱신 필수**. ③ 현 sync 스크립트가 `is_active=True` **하드코딩**(`sync_gdl.py:340` 등) → 미검수 콘텐츠 staging(`is_active=false`) 위해 **수정 필요**(미수정 시 주간 cron upsert가 True로 리셋). (부수) `attribution.py:97` stale 문자열 `"4종"`→`"5종"` 정정 대기(비긴급, LICENSE_LABELS 실제 5종).
  - (d) **외부 소스 공식 접근 신청 발송(2026-06-15)** — StoryWeaver(`storyweaver@prathambooks.org`)·Bloom(`subscriptions@bloomlibrary.org`) 공식 접근 신청 메일 발송 완료 → **회신 대기 중**. 회신 전까지 **코드 트랙 대기(정상)**. StoryWeaver 공개 API는 재실측에도 403(우회 금지)·Bloom은 공식 OPDS API+키발급 경로 확인됨. **회신 수신 시 첫 작업 = 영어·라이선스 필터(NC/ND 제외)로 실사용 가능 권수 측정.**
  - (e) **StoryWeaver(Pratham Books) 회신 수신 + recon 박제(2026-06-15, 문서 전용·코드 0줄)** — (d)의 후속. 4개 트랙:
    - **회신 내용**: vetted 파트너에게 **OPDS 경로로 bulk 콘텐츠 공유 가능**. 전제 — (1) **Content Sharing Agreement 체결**, (2) 계약서 템플릿 수령(인도 관할 / 1년 / CC BY 4.0 / 분기 사용통계 공유 의무 / 한쪽 면책 / 기부는 라이선스 조건 아님 명문화). **Article 3** = 플랫폼 외부 범용·파운데이션 모델 학습 금지, 플랫폼 내 런타임 AI(낭독·번역·튜터링·개인화)는 **명시적 허용**. → **서명 전 변호사 검토 1회 필요**(인도 관할·한쪽 면책·분기 보고 의무 3개 포인트).
    - **실사용 권수 recon(Supabase Dashboard 실측)**: 전체 **905**권 / GDL 851 / Book Dash 54. GDL 속 Pratham·StoryWeaver 추정 = **265권**(이미 GDL 경유로 적재됨). **순증 상한 추정 ≈ 586권**(851−265) — 단 이는 상한이며 다국어 포함 → **실제 영어 순증은 회신(영어 타이틀 수)으로 확정 필요**.
    - **illustrator/attribution 원인 (나) 확정**: illustrator 컬럼 빈 책 **905/905(100%)**. ① Book Dash 54권: `attribution_text`·`author`에 실제 창작자 이름 존재(역할 라벨만 미분리). ② GDL 경유 StoryWeaver 265권: `author`가 사람 이름이 아닌 플랫폼명("StoryWeaver")으로 적재 → 개별 글·그림작가 이름 자체가 **upstream 메타데이터에 없음(우리 측 보완 불가)**. ③ 렌더링 코드(`lib/book/attribution.ts`·`components/book/attribution-box.tsx`)는 illustrator 값 있으면 표시하도록 **이미 구현됨 → 프론트 버그 아님**, sync/원천 데이터 문제. ④ **해소 경로 = StoryWeaver 정식 메타데이터 수령(계약의 숨은 핵심 가치)**.
    - **답장 발송 완료**: 서면 선호(통화 사양) / 기부 내부 논의 중 / attribution 265건 공백 솔직 설명 / 4개 질문 답변 + 우리 질문 2개 — A) 영어 타이틀 수, B) 개별 author·illustrator 메타데이터 제공 가능 여부. → **회신 대기**. **회신 도착 시 첫 작업 = B 답변 기준으로 계약 실익(순증 + 265건 정상화 가치) 최종 판정.**
  - (f) **회원 마이페이지(/mypage) 도입 결정(2026-06-15, 문서 전용·코드 0줄 → ADR-0024 Proposed)**:
    - **미존재 확정(recon 실측 — 폴더·grep)**: 사용자 라우트에 mypage/account/report/history/favorite **0건**, 전역 헤더(`app-header.tsx`)에도 진입 링크 없음. 단 데이터 소스(`reading_sessions`·`favorites`·`children.points`)는 **이미 존재** → **DB 변경 없이 신규 화면만 필요**. (부수 recon: `favorites` 테이블은 스키마만 존재, **즐겨찾기 추가/표시 UI 0건** — `favorites` 코드 참조 0건, read-button 주석에 "즐겨찾기 4-다 미구현" 박제.)
    - **PM 결정 — 베타 범위 포함**: 통합형 **단일 화면(`/mypage`)**에 [읽은 책 리스트 + 간단 독서 리포트 + 누적 포인트 + 즐겨찾기] 집약. 독서 리포트는 베타에선 **간단형**(총 권수·누적 포인트·최근 읽은 책·주간 스트릭 재활용), 상세 통계·화면 분리는 정식 단계 보류.
    - **근거**: 재방문·구독 유지 핵심 동력 + 향후 B2B(학원·교사 리포트) 확장 자산.
    - **세부 설계 = ADR-0024**(`docs/adr/0024-member-mypage.md`, Status: Proposed). 확정 후 별도 작업지시서로 화면 구현. **즐겨찾기 섹션은 추가 버튼이 선행 구현돼야 목록이 의미 있음**(ADR-0024 D5에 별도 작업 단위 제안).
  - (g) **Bloom OPDS 접근 recon 완료(2026-06-16, 읽기 전용 GET·본문 미저장·코드 0줄)** — (d) Bloom 신청 트랙의 후속. 4개 결과:
    - **① 접근 경로 확정**: 정식 피드 base = `https://api.bloomlibrary.org/v1/opds`, **모든 호출에 `key=ACCOUNT:KEY` 필수**. 앞선 404는 네트워크 차단이 아니라 **키 부재의 정상 거절**(워커 물리적 접근은 가능, exit 0 실측). `bloomlibrary.org/opds`는 문서 사이트로 302 리다이렉트(피드 아님).
    - **② 키 발급 = Enterprise 구독 또는 파트너십 협약 + 이메일 신청**(계정 이메일 선등록 후 `subscriptions@bloomlibrary.org` 문의). 회신·계약 전 자동 측정 불가 → **"실사용 가능 권수 측정"은 키 수령 후로 보류**(현재 (d) 신청 메일 회신 대기와 동일 상태).
    - **③ ★라이선스 서버 필터 없음(Hard Rule 직결)** — 제공 파라미터 7종(`key`·`lang`·`ref`·`tag`·`organizeby`·`minimalnavlinks`·`epub`)에 라이선스 필터 부재. 라이선스는 결과 entry 내 `<dcterms:license>`로만 표기되며, **문서 예시 피드에 `cc-by-nc-nd` 혼입 실증**. 적재 시 **client-side `<dcterms:license>` 파싱 게이트로 NC/ND 전량 배제 필수** → 기존 `enforce_commercial_license` 트리거(Hard Rule 2)와 정합. **ADR-0022 Amendment #2 반영 대상**.
    - **④ 운영 제약**: 언어 필터 `lang=`(BCP47, 예 `lang=en`) 지원. **rate-limit 없음 → "일 1회 캐시" 사용 규약 준수 의무**(썸네일 포함, 문서 명시). → **Bloom 키 수령 시 첫 작업 = `lang=en` + `<dcterms:license>` NC/ND 배제 게이트로 실사용 가능 영어 권수 측정.**
  - (h) **추가 E-book 확보 실행 플랜 승인(2026-06-16, PM 결정 · 문서 전용·코드 0줄 → ADR-0022 Amendment #2 Proposed)** — 신규 합법 소스 조사 결과를 우리 DB에 적용하는 단계 계획.
    - **4대 가드레일**: ① 합법 라이선스(CC BY/SA·CC0·PD)만, NC/ND 자동차단(Hard Rule 2·3) 유지 ② illustrator 원본 직접 수집(GDL 경유 누락 265권 회피) ③ GDL 851 중복 제거(소스 전체권수 ≠ 순증) ④ `is_active=false` staging 후 검수 공개.
    - **Phase A(즉시·회신 무관, 전량 CC BY)**: Book Dash 확대 / Storybooks Canada(텍스트+CC BY 오디오) / StoryWeaver 텍스트(영상 NC-ND 제외). ★계약·회신 없이 라이선스만으로 적재 가능.
    - **Phase B(필터링 후)**: Let's Read · African Storybook · Literacy Cloud(Room to Read) — CC BY/NC 혼합 → 타이틀 라이선스 파싱 게이트 선행, 영어 권수 직접 측정.
    - **Phase C(후순위·영상)**: 오픈 영상 e-book 희소(StoryWeaver 영상 = NC-ND 부적격). CC BY 텍스트 + CC BY/PD 음원으로 자체 read-along 제작 우선. Blender/Wikimedia는 ND 제외·연령 검수 후 보조.
    - **부적격 확인**: Unite for Literacy(비CC 자체저작권), Mustard Seed · 3asafeer · Word Scientists(NC 계열).
    - **박제 경로**: 본 플랜 → **ADR-0022 Amendment #2**(소스 확장·dedup·staging·라이선스 게이트 확정) → Phase A 순증 측정 → 소스별 sync 작업지시서.
  - (i) **Phase A/B 순증 측정 recon 완료(2026-06-16, 읽기 전용·다운로드/저장 0 · 코드 0줄)** — (h) 플랜의 소스별 실측. ADR-0022 Amendment #2에 보강 반영.
    - **Book Dash**: 동결 GitHub repo(`bookdash-books`)는 **2019 스냅샷 54권 = 우리 기존분과 동일 → 순증 0**. 현행 카탈로그(`bookdash.org`, WordPress)는 **WP REST API**(`wp-json/wp/v2/books`)·`books-sitemap` 보유, **영어(택소노미 eng) 206권** 실측 → **순증 상한 152권**. GDL 내 Book Dash 중복 = **0**(SQL 실측) → dedup 손실 거의 없음. illustrator는 REST 기본필드 미노출 → **content 파싱 필요**(가드레일 ②).
    - **African Storybook**: **순증 잠재력 최대**. `asp-raw-db`(GitHub) 전체 **~12,085권**(전 언어), `asp-source` 큐레이션 2,126권 중 **영어 367권**. ★**라이선스 혼합** — 표본에서 **CC BY-NC 3.0 실증** → **NC/ND 파싱 게이트 필수**(Hard Rule 3). raw-db에 **`artist`(illustrator) 필드 원천 존재** → 가드레일 ② 충족 가능. GitHub raw 무인증 200. GDL 내 ASb 중복 = **33**(SQL 실측). ※ **"영어 AND CC BY(비NC) 정확 권수"는 12k 전수집계 필요 → 측정 보류**(rate-limit 배치로 별도).
    - **Storybooks Canada**: `global-asp/sbc-source` repo **확정(자동 적재 가능)**, **~40권** 소량. 동일 org에 Global Storybooks 네트워크 다수(향후 확장 후보 풀).
    - **StoryWeaver 텍스트**: `storyweaver.org.in` **Cloudflare 403**(무인증 차단·우회 금지) → 대량 측정 불가, **회신/계약 경로((e))로만**. 현 GDL 경유 **265 추정분**으로 갈음.
    - **적재 트랙 언어 = Python**(기존 `sync_*.py` 트랙). 신규 sync는 `sync_<src>.py`, 라이선스 게이트 = `verify_licenses.py` 확장, illustrator = `attribution.py` 확장. **웹앱(TS/Next 14)은 무관**(별 트랙).
    - **순증 우선순위(현재)**: ① **African Storybook**(NC 제외 후 수백~수천, 본체) ② **Book Dash 현행**(+152 확정) ③ **Storybooks Canada**(~40). StoryWeaver는 회신 대기.
  - (j) **African Storybook 정밀측정 확정(2026-06-17, codeload archive 1회 GET·헤더만 파싱·/tmp 처리·영구파일 0·코드 0줄)** — (i)의 ASb "측정 보류"분을 전수 집계로 확정.
    - **`asp-raw-db` 전수 12,085권 파싱 100%** (`global-asp/asp-raw-db`, default branch `master`, `data/<id>.txt` 평면 단일 txt, 메타 헤더 탭구분 key:value).
    - **영어 전체 2,880권**.
    - **영어 lic 5종**: CC BY 4.0 = **2,537** / CC BY 3.0 = **258** → **적격 합 2,795** / NC 변종 4표기 합 **85** = 배제.
    - ★ **English AND 적격(NC/ND 제외) = 2,795권** (PM 핵심 숫자, 검산 2,880−85=2,795).
    - **GDL 중복 33 적용 시 순증 상한 ≈ 2,762권**.
    - **illustrator(`artist`) 누락 232권(8.3%)** = 가드레일 ② 보완 대상.
    - lic 값이 SPDX 코드 아닌 **자연어 문자열** → NC/ND 게이트는 **부분문자열 매칭**으로 설계.
    - **순증 우선순위 갱신**: ① **ASb ≈2,762**(압도적) ② **Book Dash +152** ③ **SBC ~40**.
  - (k) **ASb 적재 완료(2026-06-17, ADR-0025 D4~D7 전량 staging 적재)** — (j) 측정분을 실제 DB에 적재.
    - **`sync_asb.py` 신설**(커밋 `031ad9d`): codeload tarball 1회 + 다필드 헤더 파서 + `normalize_asb_license`(공용 모듈) 재사용 + `is_active=false` staging + 제목정규화 dedup + illustrator '미상'.
    - **적용 마이그레이션**: `003`(source_platform += `african_storybook`), `004`(content_type += `asb_native`) — 둘 다 Supabase 적용·검증 완료.
    - **실적재 확정 수치(DB SELECT 검증)**: **적재 2,750권 전건 성공**(오류 0), 전부 **`is_active=false` staging**.
    - **라이선스 내역**: `cc-by-4-0` = **2,504** / `cc-by-3-0` = **246**, **NC/ND 누수 0**(Hard Rule 3 준수), **attribution 누락 0**(Hard Rule 1 준수).
    - **illustrator '미상'** = **232권**(artist 원천 누락분, Amd#4 A3).
    - **dedup skip = 45권**(GDL ASb 33제목 정규화 매칭, Amd#4 A2 오skip 수용 — measure '≈2762' 1:1추정 대비 **실측 2,750**).
    - ★**공개 미완**: 자체 렌더 뷰어(웹앱 TS/Next 트랙, Amd#3 A5) 완성 + 검수 후 책별 `is_active=true` 전환 필요. **현재는 비공개.**
    - **전체 콘텐츠**: 905 → **3,655권**(GDL 851 + Book Dash 54 + ASb 2,750), ASb는 **staging 비공개분**.
- **잔여 F-item·후속(베타 차단 아님, §7.3)**: 노출 가능 **→ 순서4 종결: 재집계 완료(GDL 851 / 전체 905, 목표 900 +5), 2026-06-15** (자체 e-book 23권 추가 시 ~928) / Book Dash 이미지 분기별 재감사 / keyset count 재쿼리 최적화 / 작업1 level·keyword URL 미동기화 / vercel.app 307→308 승격(수일 운영 후) / GitHub Actions Node 20 deprecation(v5/v6 안정화 시 일괄 승격) / **약관·개인정보 법률 검토 1회**(결제 도입·사용자 증가 전).
- **다음 후보 작업**: ① **【착수】순서4 스키마 마이그레이션**(`002_*.sql`: CHECK+트리거에 `cc-by-3-0` 추가, ADR-0022 선행) + **GDL 심화 sync**(`sync_gdl` ALLOWED에 cc-by-3-0 추가·`cc-by-sa-4-0-2` 정규화 → 842→~937) ② HelloKiki 명칭 **전수 반영 잔여**(backlog·README·UI 등) ③ 작업1 level·keyword URL 동기화(코드) ④ 307→308 승격(대시보드, 수일 후) ⑤ 자체 e-book 23권(~960권) ⑥ Phase 1.5 트랙B **TTS·캐릭터 AI 구현 ADR**(ADR-0023 후속).
