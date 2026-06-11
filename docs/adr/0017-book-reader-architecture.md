# ADR-0017: 책 뷰어 아키텍처 — iframe 단일 경로 + 명시 완독 + 페이지 추적 포기

**날짜** 2026-05-22
**상태** Accepted (phase-12 CP1)
**관련** `docs/adr/0014-gdl-cover-url-and-illustrator-strategy.md` Amendment #5(블랙리스트 `lib/shared/blacklist.ts` 추출 — 본 ADR과 동시 작성, 뷰어가 5번째 차단 표면), `docs/adr/0016-illustrator-author-publisher-attributionbox.md` Amendment #1(어트리뷰션 표시 범위 책 상세+책 뷰어 확장 — 본 ADR과 동시 작성), `docs/adr/0013-cover-attribution-policy.md` 결정 4(closed environment 보호 라우트), `docs/adr/0012-landing-page-static.md` 결정 3(DB 무변경 패턴), `docs/intent/screen-04-reader.md`, `tasks/phase-12-screen-04-reader.json`, `supabase/migrations/001_initial_schema.sql`(books.content_type·content_url·reading_sessions·RLS §9.4), `lib/home/active-child.ts`(`getActiveChild`), `lib/book/attribution.ts`(`buildAttributionRows`), `docs/design-system.md` §7.2 Reader 토큰, `docs/guidelines/license-rules.md` §5·§7.2, `PLAN.md` 4절 콘텐츠-기술 매트릭스 + 5절 시나리오 C + 6절 기술 스택 + 9절 Week 6, `claude.md` 2절 Hard Rule 1·3·6·8·9·10

---

## 1. 맥락 (Context)

phase-12 Screen 04 책 뷰어(`/book/[id]/read`)는 자녀가 실제로 책을 펼쳐 읽는 화면이다. PLAN.md 4절·5절 시나리오 C·6절·9절 Week 6은 `content_type`별 3분기(html→iframe, epub→epub.js, h5p→h5p-standalone)와 "페이지 넘김마다 reading_sessions 업데이트 → 마지막 페이지 완독 처리"를 명세했다. 그러나 CP1 진입 전 실데이터 측정과 외부 헤더 진단에서 이 명세가 베타 데이터로는 그대로 구현 불가함이 드러났다.

### 1.1 content_type 실데이터 측정 (2026-05-22, 인라인 진단 1회)

| 측정 | 결과 |
|---|---|
| 활성 책 총수 | 896권 (전체 896, 비활성 0) |
| content_type 분포 | **`html` 896 (100%)** — epub·h5p·pdf **0건** |
| content_type NULL | 0건 (001 line 76 `content_type TEXT NOT NULL CHECK`) |
| source_platform × content_type | `book_dash`×`html` 54 · `gdl`×`html` 842 |

→ PLAN의 3분기는 베타 데이터상 **iframe 단일 경로**로 수렴한다. GDL은 PLAN §4에서 "h5p-standalone" 대상이었으나 실제 sync(`sync_gdl.py`)는 digitallibrary.io 리더 URL을 `content_type='html'`로 적재했다.

### 1.2 content_url 형태 + iframe 임베드 가능성 진단 (HEAD→GET, 2026-05-22)

| source | content_url 형태 | HEAD 진단 |
|---|---|---|
| `book_dash` (54) | `https://bookdash.github.io/bookdash-books/{slug}/en/` | 200 · X-Frame-Options 없음 · CSP frame-ancestors 없음 → **임베드 가능** |
| `gdl` (842) | `https://content.digitallibrary.io/en/book/{slug}/` | 200 · X-Frame-Options 없음 · CSP frame-ancestors 없음 → **임베드 가능** |

→ 두 출처 모두 프레임 차단 헤더 부재. 프록시/리라이트 불필요. 단 보안 헤더가 전무하므로 임베드 방어 책임은 전적으로 키키북스 쪽(sandbox + CSP frame-src)에 있다.

### 1.3 PLAN 명세 한계 진단

- 두 content_url은 **외부 cross-origin 리더 페이지를 통째로 임베드**하는 형태다(페이지 단위 콘텐츠가 아님). 부모 페이지는 cross-origin iframe 내부 페이지네이션을 관측할 수 없다(postMessage 미지원 시).
- 따라서 PLAN의 "페이지 넘김마다 reading_sessions 업데이트"·"마지막 페이지 자동 완독 감지"는 현 데이터로 직접 구현 불가하다.
- ADR-0012 결정 3·ADR-0014 결정 2가 보인 "DB·sync 보존 + 코드 측 처리" 패턴을 본 ADR도 따른다 — DB 스키마·sync 무변경(Hard Rule 8).

본 ADR은 이 진단 위에서 뷰어 아키텍처 결정 7건(D1~D7)을 박제한다. 블랙리스트 차단 표면 확장은 ADR-0014 Amendment #5, 어트리뷰션 표시 범위 확장은 ADR-0016 Amendment #1로 동시 분리 박제한다(각 단일 관심사).

---

## 2. 결정 (Decision)

### D1 — 뷰어 아키텍처 = iframe 단일 경로 (HtmlReader 실구현, Epub/H5p 골격만)

`content_type='html'` 896/896(100%) 근거로 베타 뷰어는 `<iframe>` 단일 경로로 구현한다. `components/book/html-reader.tsx`(HtmlReader)만 실구현하고, `epub`·`h5p`·`pdf`는 분기 골격(미구현 안내 + 원본 보기 폴백)만 둔다. 분기 지점을 남겨 향후 실데이터 발생 시 자연 합류한다.

### D2 — epub.js·h5p-standalone 미설치 (실데이터 발생 시 도입 트리거)

`epub.js`·`h5p-standalone`는 설치하지 않는다(`package.json` 무변경). 사용처 0건인 라이브러리를 번들에 추가하지 않는다. **트리거**: `content_type ≠ 'html'` 실데이터가 1건 이상 적재되면 해당 리더(EpubReader/H5pReader)를 실구현하고 라이브러리를 도입한다(PLAN §6 기술 스택 정합 — 그때 EpubReader=epub.js, H5pReader=h5p-standalone).

### D3 — 페이지 단위 진도 추적 포기

cross-origin iframe 내부 페이지네이션 관측 불가(§1.3)로 페이지 단위 추적을 포기한다. `reading_sessions.pages_read`(001 line 127 `INT NOT NULL DEFAULT 0`)는 DEFAULT 0을 유지하고 UPDATE하지 않는다. design-system §7.2 "페이지 넘김 인디케이터(진행률 바)" 토큰은 html 경로에 적용하지 않는다(향후 epub 실구현 시 적용 가능).

### D4 — 완독 감지 = 명시 '다 읽었어요' 버튼 단독

자동 마지막-페이지 감지가 불가능하므로 완독은 사용자 명시 행동으로 매듭짓는다. `components/book/finish-button.tsx`(FinishButton) 클릭 → `completeReadingSession` server action → `/book/[id]/celebrate` redirect. 스크롤·타이머 휴리스틱·postMessage 자동 완독은 채택하지 않는다(§4 Trade-offs).

### D5 — reading_sessions INSERT(진입) + UPDATE(완독) 양쪽 활성화

`reading_sessions`(001 lines 121~130)에 두 쓰기를 활성화한다. 자동 페이지 갱신 모델을 폐기했으므로 두 쓰기 모두 **명시적 사용자 행동에 1:1 대응**하며, 이전 plan 단계의 "UPDATE dry-run 박제"는 본 결정으로 해소된다.

- **INSERT (세션 시작)**: 리더 진입 시 `startReadingSession(bookId)`. `child_id`는 `lib/home/active-child.ts`의 `getActiveChild`(children created_at ASC LIMIT 1) 재사용. **중복 가드(옵션 Y, spec d11)**: `child_id + book_id + completed_at IS NULL` 행이 있으면 재사용·INSERT 0건, 없을 때만 INSERT. 새로고침·재진입에도 in-progress 세션이 1건으로 유지된다(KPI '완독 세션 100건' 통계 위생).
- **UPDATE (완독)**: `completeReadingSession(bookId)`가 미완료 세션의 `completed_at = NOW()`·`is_completed = true`로 UPDATE.
- RLS(001 §9.4 lines 260~273)의 "parents can insert/update own children sessions"(`child_id IN own children`)를 본인 세션 클라이언트로 충족한다(Hard Rule 6).

### D6 — iframe 보안 = sandbox + CSP frame-src 화이트리스트

§1.2에서 두 외부 사이트의 보안 헤더가 전무하므로 방어 책임은 키키북스 쪽에 있다.

- **sandbox**: `iframe sandbox="allow-scripts allow-same-origin"`. 외부 리더 JS 동작에 필수. `allow-same-origin`은 iframe **자기 출처**(bookdash.github.io / content.digitallibrary.io) 기준이라 부모(키키북스 origin) 탈출 불가. 추가 권한은 부여하지 않는다(GDL SPA 동작 미달 시 `allow-forms`·`allow-popups` 최소 보강 — F14).
- **CSP frame-src**: `middleware.ts`에 응답 헤더 `Content-Security-Policy: frame-src 'self' https://bookdash.github.io https://content.digitallibrary.io` 보강. phase-07 `updateSession` 인증 흐름은 무변경(헤더만 추가). 화이트리스트 외 출처 임베드 0건(Hard Rule 9 YouTube 등 임의 임베드 차단과 정합).

### D7 — points·badges는 phase-12 범위 외 (phase-13 전속 경계)

완독 처리에서 `children.points += 50`·`child_badges` INSERT·별 3개 SVG 애니메이션(design-system §7.3)은 **phase-13 전속**이다. phase-12 완독은 `reading_sessions` UPDATE + `/celebrate` redirect까지만 수행하고, `children`·`child_badges` 테이블 쓰기는 0건이다(이중 구현 방지). `/book/[id]/celebrate`는 minimal placeholder로만 구현한다.

---

## 3. 결과 (Consequences)

### Positive

- 베타 즉시 구현 가능 — 외부 호스팅 콘텐츠를 추가 가공 없이 임베드.
- 번들 경량 — 라이브러리 0 추가(D2). epub.js·h5p-standalone 미설치.
- 보안 표면 명확 — CSP frame-src 2호스트로 한정(D6).
- 정합 재사용 — `getActiveChild`(child_id)·`buildAttributionRows`(미니 바)·블랙리스트(Amendment #5)를 그대로 재사용.
- DB·sync 무변경(Hard Rule 8) — ADR-0012 결정 3·ADR-0014 결정 2 패턴 유지.

### Negative

- 진도율·페이지 통계 부재 — KPI는 '세션 시작'·'완독' 2점만 측정(D3). 페이지별 이탈 분석 불가.
- 완독 자기신고 신뢰 — 버튼 클릭 기반(D4)이라 과대/과소 집계 가능(F16). 중복 가드(D5)로 통계 위생 일부 보강.
- 외부 사이트 의존 — 리더 UX·다국어·접근성·가용성을 키키북스가 통제 불가. 외부 다운 시 폴백 UI로 1차 방어(F15).
- 적법성 잔여 — iframe 임베드의 ToS/핫링크 측면은 CC BY 라이선스와 별개로 베타 출시 전 확인 필요(F13).

---

## 4. 대안 비교 (Trade-offs)

| 기각 대안 | 내용 | 기각 사유 |
|---|---|---|
| postMessage 진도 연동 | iframe 내부 페이지 이벤트를 postMessage로 부모에 전달받아 페이지 단위 추적·자동 완독 | Book Dash·GDL 외부 리더가 postMessage 프로토콜을 제공하지 않음 → 구현 불가. 외부 사이트 코드 통제 불가 |
| 자체 리더 재구현 | 외부 콘텐츠 페이지를 추출해 키키북스 자체 페이지네이션 리더로 재구성 | 범위 폭증. 표지·본문 재가공 시 CC BY 어트리뷰션·레이아웃 무결성 위험 + 콘텐츠 미러 인프라 필요(베타 1~2주 완수 불가) |
| epub.js·h5p-standalone 선제 설치 | PLAN §6 정합 위해 라이브러리를 미리 설치하고 EpubReader/H5pReader 골격 구현 | 사용처 0건(content_type 전부 html). 번들·의존성 낭비. D2 '실데이터 발생 시 도입' 트리거가 정합 |
| 자동 완독 감지(스크롤·타이머 휴리스틱) | 체류 시간·스크롤 비율로 완독을 자동 판정 | cross-origin이라 iframe 내부 스크롤 관측 불가 + 휴리스틱 오탐 시 완독 보상 신뢰도 훼손. 명시 버튼(D4)이 정확·단순 |

---

## 5. 후속 트리거 (본 ADR이 박제하는 트리거)

상세 박제는 `tasks/phase-12-screen-04-reader.json`의 `phase_12_follow_up_triggers`에 있다(F13~F17, 전부 blocker=false). 요약:

1. **F13 — iframe ToS/핫링크 적법성**: CC BY는 콘텐츠 재사용 라이선스이며 제3자 호스팅 리더 임베드는 ToS·핫링크 별개 이슈. 베타 출시 전 Book Dash·GDL 임베드 정책 확인 의무(phase-12 진행 불방지). 임베드 불가 판명 시 §4 기각된 자체 호스팅 대안 재논의.
2. **F14 — GDL SPA sandbox 완전성**: `allow-scripts allow-same-origin`만으로 digitallibrary.io SPA 리더가 정상 동작하는지 CP3-a 시각 검수. 미달 시 `allow-forms`·`allow-popups` 최소 보강 + 본 ADR D6 사후 박제.
3. **F15 — iframe 외부 가용성**: 외부 CDN 다운 시 뷰어 백지 → HtmlReader onError/5초 타임아웃 폴백으로 1차 방어. 상시 다운 빈발 시 미러링(PLAN §6 GitHub Pages+jsDelivr) 트리거.
4. **F16 — 완독 자기신고 신뢰도**: 버튼 단독 완독(D4)의 KPI 정확도. phase-2 정밀 추적 시 postMessage 재조사·체류/스크롤 보조 지표 검토.
5. **F17 — 어트리뷰션 법무 검토 표면 확장(F9 연계)**: ADR-0016 Amendment #1로 책 뷰어 미니 바가 추가됨 → phase-14 법무 검토에 책 상세 + 책 뷰어 양 표면 통합 검토.

---

## 6. 상호 참조

- **ADR-0014 Amendment #5** (동시 작성): `BOOK_DASH_404_SOURCE_IDS`를 `lib/shared/blacklist.ts`로 추출. 책 뷰어(`/book/[id]/read`)가 5번째 차단 표면. D1 iframe 임베드가 블랙리스트 책의 깨진 GitHub Pages를 로드하지 않도록 4-가드 3번 차단을 상속한다.
- **ADR-0016 Amendment #1** (동시 작성): 어트리뷰션 표시 범위를 책 상세 + 책 뷰어로 확장. 책 뷰어 미니 어트리뷰션 바는 `buildAttributionRows` source_platform 분기를 재사용(저작자=Book Dash author / GDL publisher) + CC BY 4.0 + 출처 + 제목 노출로 '통합 어트리뷰션 단위'(ADR-0016 결정 3) 충족.
- **PLAN.md** §4 콘텐츠-기술 매트릭스(html→iframe) · §5 시나리오 C(content_type 분기) · §6 기술 스택(책 뷰어 epub.js+iframe+h5p-standalone — 본 ADR D1·D2로 베타는 iframe만) · §9 Week 6(책 뷰어 분기 + 완독 처리).
- **claude.md** Hard Rule 8(DB 스키마 무변경 — content_url·content_type SELECT 추가는 스키마 무변경) · Hard Rule 9(YouTube 등 임의 임베드 금지 — CSP frame-src 2호스트 한정) · Hard Rule 10(raw HEX 0건 — design-system §7.2 Reader 토큰).
- **design-system.md** §7.2 Reader 토큰(html 행: `--color-surface-3` 배경 · `radius-lg` · `elevation-2` · 여백 16/32/64px).

---

*문서 끝.*

---

## Amendment #1 (2026-05-27 phase-12 CP4 종료)

phase-12 종료 시점 D1~D7 결정은 전부 정합 확인됐다(커밋 `359de0e..4e8e9e2`). 본문 D1~D7은 무수정한다(phase-end ADR 본문 보존 관례 — ADR-0016 Amendment 패턴 정합). 사후 박제 2건:

1. **§5 후속 트리거 요약 정정** — CP1 작성 시점의 "(F13~F17, 전부 blocker=false)"는 CP3-a 시각 검수(2026-05-27)에서 F18·F19·F20이 추가되며 갱신됐다. 최신 범위는 **F13~F20**이다. F18(phase-11 intent↔spec 갭 — `/home` 추천 카드 `/book/[id]` Link 미활성화)은 **blocker=true**였고 CP3-a-6에서 즉시 해소됐다. F14(GDL SPA sandbox 완전성)는 CP3-a 검수에서 `allow-scripts allow-same-origin`만으로 정상 동작이 확인되어 해소됐다(D6 보강 불요). F19(iframe 다운로드 차단 → CC BY 4.0 ETM 해석)·F20(GDL SPA 내부 헤더 → Closed Environment 충돌)은 blocker=false로 각각 phase-14 법무·phase-2+로 이연한다. 트리거 상세 박제의 단일 출처는 `tasks/phase-12-screen-04-reader.json`의 `phase_12_follow_up_triggers`다.

2. **호출 지점·세션 시그니처 확정** — D5의 두 server action(`startReadingSession`·`completeReadingSession`)은 본문 명세대로 모두 `bookId`만 받는다(결정 #2 sessionId 미전달 — D5와 이미 정합, 컴포넌트 간 sessionId threading 0건). `completeReadingSession`은 server에서 `(child_id, book_id, completed_at IS NULL)`로 미완료 세션을 재조회하며, 이는 `startReadingSession`의 중복 가드 키와 대칭이라 StrictMode 2회·재진입·race를 동일 가드로 흡수한다. `startReadingSession` 호출 지점은 `docs/intent/screen-04-reader.md` §5.1 L104의 옵션 A(`html-reader.tsx` `useEffect` 마운트 1회)로 확정했다(결정 #1) — 호출 지점은 구현 세부이므로 D5 본문은 무수정하고 intent에 박제한다. 외부 교차 검토의 옵션 B(Server Component 호출) 권고와의 충돌은 `claude.md` §1(의도→문서→코드)에 따라 옵션 A 정정으로 마무리했다.

---

*Amendment #1 끝.*

---

## Amendment #2 (2026-05-28 phase-13 CP1-adr)

D7(points·badges·별 3개 SVG 애니메이션 phase-13 전속 경계)을 **ADR-0018(완독 보상 + 라이브러리)이 해소**한다. phase-12 완독은 본문 D7대로 `reading_sessions` UPDATE + `/celebrate` redirect까지만 수행했고, `children`·`child_badges` 쓰기 0건을 지켰다. phase-13은 그 경계를 열어 보상 시스템(옵션 B secret 키 child_badges INSERT · 매 완독 +50 누적 · 보상 멱등 앵커 · §7.3 모션)을 구현하며, 그 결정은 ADR-0018 D1~D14에 박제한다. 본 ADR 본문 D1~D7은 무수정한다(phase-end ADR 본문 보존 관례 — Amendment #1 정합). 보상 쓰기 아키텍처의 단일 출처는 ADR-0018이다.

---

*Amendment #2 끝.*

---

## Amendment #3 (2026-06-11 베타 품질개선 — GDL content_url을 H5P embed URL로 전환)

**배경.** 본문 §1.2·§1.3·D6은 GDL `content_url`을 사이트 리더 페이지 `https://content.digitallibrary.io/en/book/{slug}/`(=postLink)로 적재한다. 베타 브라우저 실측(2026-06-11, backlog §7.4 작업4)에서 이 URL은 책 본문이 아니라 **GDL 사이트 전체 페이지**임이 확인됐다 — iframe 안에 ① `gdl-header`(로고·검색·언어·메뉴) ② 좌하단 쿠키배너(매 세션 재등장) ③ 'Read' 재클릭 랜딩이 노출돼 Closed Environment(ADR-0013 결정 4)·몰입(ADR-0021 D3)과 충돌했다. 본문 §1.3이 박제한 "외부 cross-origin 리더 페이지를 통째로 임베드"의 부작용이 실증된 것이다(F20 — Amendment #1 §5 GDL SPA 내부 헤더 ↔ Closed Environment 충돌의 구체화).

**결정 (B-lite).** `sync_gdl.py`가 적재하는 GDL `content_url`을 postLink에서 **H5P 전용 embed URL** `https://content.digitallibrary.io/wp-admin/admin-ajax.php?action=h5p_embed&id={h5pId}`로 전환한다. 이 URL은 책 본문 H5P 플레이어만 렌더하며 gdl-header·쿠키배너·Read 랜딩이 전무하다(2026-06-11 curl 실측). `h5pId`는 `sync_gdl.py`의 picture-book 가드(필수 필드 검증)에서 이미 확보되므로 신규 API 의존 0건이다.

**범위·정합.**
- **D1 무변경** — embed URL도 `text/html` 응답이라 `content_type='html'` 유지, HtmlReader iframe 단일 경로 그대로(뷰어 컴포넌트·미들웨어 수정 0줄).
- **D6 무변경** — embed URL 도메인이 `content.digitallibrary.io`로 동일해 CSP frame-src 화이트리스트(본문 D6) 수정 불요. sandbox `allow-scripts allow-same-origin` 그대로.
- **§1.2 표 정정** — GDL content_url 형태가 `/en/book/{slug}/`(postLink)에서 `admin-ajax.php?action=h5p_embed&id={h5pId}`로 바뀐다. 본문 표는 phase-end 보존 관례로 무수정하고 본 Amendment가 사후 박제한다.
- **`original_url`은 postLink 유지** — 어트리뷰션 '원본 보기'는 사이트 페이지가 맞다(ADR-0016 정합).
- **A안(부모 레벨 클리핑/오버레이) 기각** — STEP A-0 조사에서 클리핑 단독으로 cross-origin 쿠키배너 제거 불가(부모에서 사전 해제 불가)가 확인돼, content_url 교체(B-lite)가 더 적은 변경으로 근본 해소한다.

**전환 실행 (2026-06-11).** 사전 검증: 활성 GDL 842권 전수 `postId↔h5pId` 매칭 100%, embed URL 전수 HEAD 842/842=200(실패 0). 코드 커밋 `12016dc` push 후 `sync_gdl.py` 1회 실 upsert(842건 update, errors 0). 검증 SELECT: ① admin-ajax embed=842 ② postLink 잔존=0 ③ Book Dash 54 무변경 ④ attribution NULL=0.

**리스크.**
- `admin-ajax.php?action=h5p_embed`는 H5P 플러그인의 **비공식 임베드 엔드포인트**다 — GDL 사이트와 운명을 공유하며 GDL이 엔드포인트·H5P 버전을 바꾸면 깨질 수 있다. `license-rules.md` §6.2에 월 1회 embed URL 생존 표본 확인을 추가했다(F15 외부 가용성 연계).
- H5P 진행상태(admin-ajax `h5p_setFinished`)는 본 뷰어에서 사용하지 않는다(완독은 D4 명시 버튼). referrer는 `no-referrer` 유지.

**잔여 검증 (브라우저).** H5P embed iframe이 풀스크린 컨테이너(부모 resizer 없이)에서 높이·페이지 넘김 정상 표시되는지, H5P 자체 표지→시작이 '사이트 헤더'와 구분돼 허용되는지는 PM 브라우저 최종 확인 대상이다(backlog §7.4).

본 ADR 본문 D1~D7은 무수정한다(phase-end ADR 본문 보존 관례 — Amendment #1·#2 정합).

---

*Amendment #3 끝.*
