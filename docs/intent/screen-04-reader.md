# 의도 문서 — Screen 04 책 뷰어 (screen-04-reader)

**대상 페이즈** phase-12-screen-04-reader
**상태** 확정 (phase-12 CP1)
**최종 갱신** 2026-05-22
**관련** `docs/adr/0017-book-reader-architecture.md`(본 페이즈 핵심 — iframe 단일 경로·페이지 추적 포기·명시 완독·세션 쓰기·sandbox/CSP·points phase-13 경계), `docs/adr/0014-gdl-cover-url-and-illustrator-strategy.md` Amendment #5(블랙리스트 `lib/shared/blacklist.ts` 추출 + 5표면), `docs/adr/0016-illustrator-author-publisher-attributionbox.md` Amendment #1(어트리뷰션 표시 범위 책 상세+책 뷰어 확장), `docs/intent/screen-03-book-detail.md`(선행 패턴 — 가드 4종·AttributionBox), `tasks/phase-12-screen-04-reader.json`, `docs/design-system.md`(§7.2 Reader 토큰 + §6.1 Button), `docs/guidelines/license-rules.md`(§4·§5·§7.2), `lib/home/active-child.ts`(`getActiveChild` — `reading_sessions.child_id` 재사용), `lib/book/attribution.ts`(`buildAttributionRows` — 미니 바 재사용), `lib/book/detail.ts`(`getBookById` — content_url·content_type SELECT 확장), `components/book/read-button.tsx`(phase-11 자리 — 본 페이즈 자연 활성화), `middleware.ts`(phase-07 — CSP frame-src 보강), `supabase/migrations/001_initial_schema.sql`(books·reading_sessions·children — RLS §9.4), `PLAN.md` 4절·5절 시나리오 C·9절 Week 6, `claude.md` 2절 Hard Rule 1·3·6·8·9·10

---

## 1. 이 문서의 목적

학부모(또는 자녀)가 책 상세(`/book/[id]`)의 읽기 버튼을 눌러 도달하는 책 뷰어 — `/book/[id]/read` — 가 사용자 입장에서 어떻게 동작해야 하는지를 자연어로 못박는다. 코드는 이 문서를 따른다(claude.md §3-5: 의도 문서 선행). 뷰어 아키텍처의 기술적 "왜"(iframe 단일 경로·페이지 추적 포기·명시 완독)는 `docs/adr/0017-book-reader-architecture.md`에 분리돼 있다.

책 뷰어의 목표는 셋이다:

1. **막힘 없이 책을 펼쳐 보여준다** — 외부 콘텐츠(Book Dash GitHub Pages · GDL digitallibrary.io)를 iframe으로 그대로 임베드해 자녀가 즉시 읽기 시작한다.
2. **어트리뷰션 의무를 뷰어에서도 충족한다** — URL 직접 진입으로 책 상세를 우회해도 미니 어트리뷰션 바로 CC BY 4.0 의무 표시를 유지한다(ADR-0016 Amendment #1).
3. **완독을 명확히 매듭짓는다** — 자동 페이지 감지가 불가능한 cross-origin 환경에서 명시 '다 읽었어요' 버튼으로 완독을 기록하고 축하 화면으로 보낸다.

---

## 2. 범위

**phase-12가 다루는 것**

- `app/book/[id]/read/page.tsx` 정식 페이지 신규 (현재 부재 → ReadButton 자연 활성화)
- `components/book/html-reader.tsx` — content_type='html' iframe 리더(sandbox + onError/타임아웃 폴백 + 세션 시작 트리거)
- `components/book/reader-attribution-bar.tsx` — 미니 어트리뷰션 바 (`buildAttributionRows` 재사용)
- `components/book/finish-button.tsx` — 명시 완독 버튼 ('use client')
- `lib/book/reading-session.ts` — `startReadingSession`·`completeReadingSession` server action
- `app/book/[id]/celebrate/page.tsx` — minimal placeholder (phase-13 정식 구현 착지점)
- `lib/shared/blacklist.ts` 신규 + 5표면 import 정합 (F10 옵션 B, ADR-0014 Amendment #5)
- `lib/book/detail.ts` — `getBookById` SELECT에 content_url·content_type 추가 + Book 인터페이스 확장 (DB 무변경)
- `middleware.ts` — CSP frame-src 화이트리스트 보강 (phase-07 인증 로직 무변경)
- 모바일(390px) + 태블릿 세로(768px) + 태블릿 가로(1024px) + 데스크탑(1280px) 반응형

**phase-12가 다루지 않는 것 (다음으로 연결)**

- epub.js·h5p-standalone 설치 + EpubReader·H5pReader 실구현 — content_type ≠ 'html' 실데이터 0건. 분기 골격(미구현 안내)만. ADR-0017 D2 '실데이터 발생 시 도입' 트리거
- 페이지 단위 진도 추적(`pages_read` UPDATE) — cross-origin 한계로 포기(ADR-0017 D3). `pages_read` DEFAULT 0 유지. design-system §7.2 진행률 바 토큰은 html 경로 미적용
- 완독 보상 본구현 — 별 3개 SVG 애니메이션·`children.points += 50`·`child_badges` INSERT — phase-13 전속(ADR-0017 D7). 본 페이즈 celebrate는 placeholder, children·child_badges 쓰기 0건
- 라이브러리(`/library`) — phase-13. celebrate '다른 책 보러 가기' 버튼은 `/library`로 링크만(목적지는 phase-13)
- 즐겨찾기 ⭐ 토글 — phase-13 라이브러리 시점 통합(phase-11 d4)
- iframe ToS/핫링크 적법성 확인 — 베타 출시 전 의무(F13 트리거, phase-12 진행 불방지)
- 다크 모드 — design-system §9 Phase 2 이후

---

## 3. 라우트 지도

| 경로 | 공개/보호 | 비고 |
|---|---|---|
| `/book/[id]/read` | 보호 (로그인 필수) | 미로그인 → `/login` (middleware). [id]는 books.id UUID. 가드 4종 책 상세 상속(UUID 형식·미인증 redirect·블랙리스트 5번째 차단 notFound·book NULL notFound). content_type='html' iframe 임베드 |
| `/book/[id]/celebrate` | 보호 (로그인 필수) | phase-12 minimal placeholder. 완독 server action redirect 착지점. 정식 구현(별·포인트·배지)은 phase-13 |

**routes.ts·middleware.ts 인증 로직은 수정하지 않는다.** `/book/[id]/read`·`/book/[id]/celebrate`는 phase-07 기존 보호 라우트 prefix(`/book`)에 자연 포함된다. 단 `middleware.ts`에는 CSP frame-src 응답 헤더만 보강하며(§6 보안), `updateSession` 인증 흐름은 무변경이다.

---

## 4. 사용자 흐름 (단계별)

### 4.1 핵심 흐름 (책 상세 → 책 뷰어 → 완독)

1. 학부모/자녀가 `/book/[id]`의 읽기 버튼(ReadButton)을 누른다 → 브라우저가 `/book/[id]/read`로 이동한다.
2. 페이지 상단에 미니 어트리뷰션 바(저작자/출판사 · CC BY 4.0 · 출처 + 책 제목)를 본다.
3. 그 아래 iframe에 책 본문(Book Dash 또는 GDL 외부 리더)이 임베드되어 펼쳐진다. 자녀는 외부 리더의 자체 페이지 넘김으로 끝까지 읽는다.
4. 다 읽으면 화면의 '다 읽었어요' 버튼(FinishButton)을 누른다.
5. 완독이 기록되고(`reading_sessions` UPDATE) `/book/[id]/celebrate`로 이동해 축하 메시지를 본다.

### 4.2 직접 URL 접속 (사용자 또는 외부 링크)

1. 사용자가 `/book/{uuid}/read`로 직접 접속한다(책 상세 우회).
2. 페이지가 4-가드를 적용한다(§4.4). 통과하면 `getBookById`로 books 행을 조회한다(content_url·content_type 포함).
3. 책 상세를 거치지 않았어도 **미니 어트리뷰션 바가 CC BY 4.0 의무 표시를 보장**한다(ADR-0016 Amendment #1) — 어트리뷰션 누락 0건.

### 4.3 완독 처리 흐름 (세션 쓰기)

1. **세션 시작(INSERT)** — 리더 진입 시 `startReadingSession(bookId)`가 호출된다. `getActiveChild`로 `child_id`를 해소한 뒤, `child_id + book_id + completed_at IS NULL` 행이 이미 있으면 그것을 재사용하고 INSERT하지 않는다(옵션 Y 중복 가드, ADR-0017 D5·d11). 없을 때만 신규 INSERT(`started_at` 자동). 새로고침·재진입에도 in-progress 세션이 1건으로 유지된다.
2. **완독(UPDATE)** — '다 읽었어요' 클릭 시 `completeReadingSession(bookId)`가 해당 미완료 세션의 `completed_at = NOW()`·`is_completed = true`로 UPDATE한 뒤 `/book/[id]/celebrate`로 redirect한다.
3. `pages_read`는 건드리지 않는다(DEFAULT 0 유지, D3). `children.points`·`child_badges`는 건드리지 않는다(phase-13 경계, D7·d9).

### 4.4 가드 4종 (책 상세 상속)

`/book/[id]/read`는 `app/book/[id]/page.tsx`의 가드 패턴을 그대로 상속한다(screen-03 §4):

1. `params.id` UUID 형식 불일치 → `notFound()` (DB 호출 방지)
2. 미인증 → `redirect('/login')` (middleware 1차, 페이지 2차 안전망)
3. 블랙리스트 4 UUID 일치 → `notFound()` — `lib/shared/blacklist.ts`의 `BOOK_DASH_404_SOURCE_IDS` 재사용(5번째 표면, ADR-0014 Amendment #5). 블랙리스트 책은 원본 GitHub Pages가 404이므로 iframe이 깨진 페이지를 로드하는 것을 사전 차단
4. books 행 NULL(부재·is_active=false·RLS 차단) → `notFound()`

미로그인·자녀 0명: 미로그인은 가드 2로 차단. 책 뷰어는 자녀 무관 페이지가 아니라 **자녀의 읽기 세션을 기록**하므로 `getActiveChild`가 null이면 세션 쓰기를 건너뛴다(읽기 자체는 가능, 세션 미기록). 자녀 0명 상태의 정식 처리는 온보딩 가드(phase-08)가 1차 담당한다.

---

## 5. 구성요소 (각 컴포넌트 의도)

### 5.1 HtmlReader (content_type='html' iframe 리더)

**의도**: 외부 호스팅 책 본문을 cross-origin iframe으로 안전하게 임베드한다.

- `iframe src = book.content_url` (Book Dash `bookdash.github.io/...` · GDL `content.digitallibrary.io/...`).
- `sandbox="allow-scripts allow-same-origin"` — 외부 리더 JS 동작에 필수. `allow-same-origin`은 iframe **자기 출처** 기준이라 부모(키키북스) 탈출 불가(ADR-0017 D6). GDL SPA 동작 완전성은 CP3-a 검수에서 확인(F14) — 미달 시 `allow-forms`·`allow-popups` 최소 보강.
- **로딩·실패 폴백**: 로딩 스피너 + 5초 타임아웃 또는 `onError` 시 폴백 UI("책을 불러오지 못했어요" + 다시 시도/돌아가기). 백지 화면 방지(F15).
- **세션 시작 트리거**: 마운트 시 `useEffect` 1회 `startReadingSession(bookId)` 호출(중복 가드는 server action 책임, §4.3).
- **토큰** (design-system §7.2 html 행): 배경 `--color-surface-3`, 컨테이너 `radius-lg`(24px) + `elevation-2`. 뷰어 좌우 여백 모바일 16px / 태블릿 32px / 데스크탑 64px. raw HEX 0건(Hard Rule 10).
- `'use client'` — onError·타임아웃 상태 + 세션 시작 effect 때문에 클라이언트 컴포넌트.

### 5.2 ReaderAttributionBar (미니 어트리뷰션 바)

**의도**: 책 상세를 우회한 직접 진입에서도 CC BY 4.0 의무를 충족한다(ADR-0016 Amendment #1).

**표시 항목** (iframe 상단 1줄):

```
{책 제목}    ✍️ {author}  ·  📜 CC BY 4.0  ·  🔗 출처      ← Book Dash 케이스
{책 제목}    🏢 {publisher}  ·  📜 CC BY 4.0  ·  🔗 출처    ← GDL 케이스 (author 자리에 publisher)
```

- **저작자 분기**: Book Dash → `✍️ {author}` / GDL → `🏢 {publisher}`. `lib/book/attribution.ts`의 `buildAttributionRows(book, copy)` source_platform 분기를 그대로 재사용한다(단일 출처, 신규 분기 로직 0건). illustrator 행은 공간 제약으로 미니 바에서 생략(활성 896/896 NULL, 결정 1 정합).
- **라이선스**: `📜 CC BY 4.0` — 라이선스 URL 외부 링크(new tab, `rel="noopener noreferrer"`).
- **출처**: `🔗 출처` — `book.original_url` 외부 링크(new tab, `rel="noopener noreferrer"`, license-rules §7.2).
- **제목 노출**: 책 제목을 바(또는 페이지 헤더)에 표시해 'H1 제목 + 어트리뷰션 = 통합 어트리뷰션 단위'(ADR-0016 결정 3) 메커니즘을 뷰어 표면에서도 충족한다.
- **위치**: iframe 직상단. 모바일에서 1줄(필요 시 wrap).

### 5.3 FinishButton (명시 완독 버튼)

**의도**: 자동 감지 불가한 cross-origin 환경에서 완독을 사용자 명시 행동으로 매듭짓는다(ADR-0017 D4).

- 라벨: "다 읽었어요" (CP3-b 카피, `lib/book/copy.ts`).
- design-system §6.1 Button primary 변형.
- 클릭 → `completeReadingSession(bookId)` server action 호출 → `/book/[id]/celebrate` redirect.
- `children.points`·`child_badges` 쓰기 0건(phase-13 경계).
- 위치: iframe 하단(모바일에서 sticky/고정 권장 — 긴 책에서도 가시).
- `'use client'` — server action 호출 + pending 상태.

### 5.4 celebrate placeholder (`app/book/[id]/celebrate/page.tsx`)

**의도**: phase-12 단독 베타 검수에서 "완독 흐름이 끝까지 작동한다"는 신호를 사용자에게 준다. 정식 보상은 phase-13.

**표시 (minimal UX, ADR-0017 D7 · d13)**:

```
🎉 완독 축하해요!
{자녀 이름}은 《{책 제목}》을 끝까지 읽었어요!
[ 다른 책 보러 가기 ]   → /library
```

- 별 3개 SVG 애니메이션(design-system §7.3 Celebrate 모션)·`points +50`·`child_badges` INSERT는 **phase-13 전속**임을 코드 주석으로 명시.
- 자녀 이름은 `getActiveChild`, 책 제목은 `getBookById`로 조회.
- design-system §6.1 Button + §6.2 Card 토큰 재사용. raw HEX 0건.

### 5.5 Epub/H5p 분기 골격 (미구현)

**의도**: ADR-0017 D1·D2 — 현재 실데이터 0건이나 분기 지점만 남겨 향후 확장 시 자연 합류.

- HtmlReader 내부(또는 read page) content_type switch에서 `epub`·`h5p`·`pdf`는 "아직 지원하지 않는 형식이에요" 안내 + 원본 보기 링크로 폴백.
- epub.js·h5p-standalone 미설치(package.json 무변경). content_type ≠ 'html' 적재 발생 시 도입 트리거(ADR-0017 D2).

---

## 6. 캐싱·성능·보안

- `app/book/[id]/read/page.tsx`·`celebrate/page.tsx`는 `export const dynamic = 'force-dynamic'`(phase-10 d3·phase-11 정합). 세션 쓰기·자녀 의존이 있으므로 캐싱 회피.
- **iframe sandbox**: `allow-scripts allow-same-origin`만(§5.1). 추가 권한은 F14 검수 결과에 따라 최소 부여.
- **CSP frame-src 화이트리스트**: `middleware.ts`에 응답 헤더 `Content-Security-Policy: frame-src 'self' https://bookdash.github.io https://content.digitallibrary.io` 보강(ADR-0017 D6). phase-07 `updateSession` 인증 흐름 무변경 — CSP 헤더만 추가. 두 외부 사이트 모두 X-Frame-Options·CSP frame-ancestors 부재(2026-05-22 HEAD 진단)라 방어 책임이 우리 쪽에 있으므로 frame-src 한정이 핵심.
- 외부 링크(라이선스 URL · 출처 URL)는 `target="_blank"` + `rel="noopener noreferrer"`(license-rules §7.2).
- iframe 외부 가용성 다운 대응은 HtmlReader 폴백 UI(F15). 상시 다운 빈발 시 미러링 트리거.

---

## 7. 검증 (이 문서가 코드에 요구하는 것)

본 의도 문서는 다음을 코드에 요구한다. `tasks/phase-12-screen-04-reader.json` `verification` 필드가 동일 항목을 측정 가능한 명령으로 박제한다.

1. F10 옵션 B 추출 후 기존 4표면 블랙리스트 차단이 회귀 없이 단일 상수 import로 동작한다(v6).
2. `/read`는 4-가드(UUID·미인증·블랙리스트·NULL)를 책 상세에서 상속한다(v7).
3. Book Dash·GDL 책 iframe이 정상 임베드된다(v8·v9).
4. iframe `sandbox` 속성 + CSP `frame-src` 2호스트 화이트리스트가 적용된다(v10).
5. 미니 어트리뷰션 바가 저작자(Book Dash author/GDL publisher) + CC BY 4.0 + 출처 + 제목을 표시한다(v11).
6. 완독 버튼이 `reading_sessions`를 UPDATE하고 `/celebrate`로 redirect한다(v12).
7. 세션 시작 INSERT + 미완료 세션 재사용 가드가 작동한다 — 재진입 시 INSERT 0건(v13).
8. `/celebrate` placeholder가 헤더 + 자녀명·책제목 1줄 + `/library` 버튼을 렌더한다(v14).
9. phase-13 경계 — `children.points`·`child_badges` 쓰기 0건(v15).
10. iframe onError/타임아웃 폴백 UI가 백지 대신 노출된다(v16).
11. Hard Rule 10 — raw HEX 0건(v17).
12. 4 viewport(390/768/1024/1280) 반응형 정합(v18).

### CP3-a/-b 시각 검수 체크리스트

**CP3-a (리더 페이지 + iframe + 미니 바 + CSP)**
- [ ] Book Dash 책 1권 `/read` — iframe에 GitHub Pages 리더 정상 렌더
- [ ] GDL 책 1권 `/read` — iframe에 digitallibrary.io SPA 리더 정상 렌더(F14 sandbox 완전성 확인)
- [ ] 미니 어트리뷰션 바 — Book Dash `✍️ author` / GDL `🏢 publisher` 분기 + CC BY 4.0·출처 외부 링크(rel=noopener) + 책 제목 노출
- [ ] 블랙리스트 4 UUID `/read` 직접 접속 → not-found
- [ ] iframe 폴백 — 차단/실패 시 5초 타임아웃·onError 폴백 UI(백지 아님)
- [ ] CSP frame-src 헤더 2호스트(DevTools Network) + iframe sandbox 속성
- [ ] 4 viewport: 390 / 768 / 1024 / 1280 — iframe 비율·미니 바·여백 정합

**CP3-b (완독 버튼 + 세션 + celebrate)**
- [ ] '다 읽었어요' 클릭 → `/book/[id]/celebrate` redirect
- [ ] Supabase `reading_sessions` — 진입 시 INSERT 1건(`completed_at` NULL), 완독 후 동일 행 UPDATE(`is_completed=true`)
- [ ] 동일 책 재진입/새로고침 → INSERT 0건(중복 가드, 미완료 행 재사용)
- [ ] celebrate placeholder — 헤더 + "{자녀 이름}은 《{책 제목}》…" + '다른 책 보러 가기'(→/library)
- [ ] `children.points`·`child_badges` 변동 0건(phase-13 경계 확인)
- [ ] 4 viewport: 완독 버튼 가시성(특히 390px sticky)

---

*문서 끝.*
