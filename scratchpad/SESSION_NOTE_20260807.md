# 세션 재개 메모 — 2026-08-07

## 커밋 지점

| 구분 | 해시 | 내용 |
|---|---|---|
| **HEAD (= origin/main)** | `1ddf255` | feat: 마이페이지·모바일 햄버거 내비게이션 추가 및 Hello Kiki 브랜드 표기 통일 |
| 직전 | `ed0ca8c` | feat: 즐겨찾기 토글 버튼 추가 및 ADR-0024 Accepted 전환 |
| 세션 시작점 | `7ddd179` | chore: 중복 표지 탐지·비활성화 산출물 보존 (231권 확정, 게이트 통과) |

미커밋 보류 **47건** = 세션 시작 시점 baseline 그대로. **전부 커밋 제외 의도분이며 무접촉 유지 중.**

---

## 이번 세션 완료 트랙 (순서대로)

### 1. 즐겨찾기 토글 (`ed0ca8c`)
- `lib/book/favorite.ts` — server action `toggleFavorite(bookId)`. 인증 → `getActiveChild` → `(child_id, book_id)` 조회 → 있으면 DELETE / 없으면 INSERT → `revalidatePath`.
  - **upsert·ON CONFLICT 미사용** — `favorites` RLS에 UPDATE 정책이 없어 INSERT/DELETE 경로만 유효(001 §9.5).
  - 동시 클릭 경합은 `UNIQUE(child_id, book_id)` 위반(23505)을 "이미 추가됨"으로 흡수.
- `components/book/favorite-button.tsx` — 낙관적 UI + `useTransition` + 실패 롤백(`level-selector.tsx` 패턴 차용). `aria-pressed`, Heart `fill-current`.
- `app/(reader)/book/[id]/page.tsx` — 활성 자녀 있을 때만 초기 상태 SELECT 후 ReadButton 옆 배치.

### 2. 마이페이지 (`1ddf255`)
- `lib/mypage/summary.ts` — `getMypageSummary(supabase, childId)` 단일 진입점. **DB 스키마 변경 0건**(reading_sessions·children.points·favorites 읽기 전용).
  - 완독/읽는 중은 **세션 행 수가 아니라 책 종수**. `hasAudio`는 반드시 `toPopularBooks()` 경유(`books.has_audio` 컬럼 직접 읽기 금지 — 배지·재생 불일치 재발 방지).
  - 실패 시 throw 없이 0·빈 배열 폴백 + `degraded` flag.
  - 리스트에서 `is_active=false` 책 제외(책 상세가 notFound라 죽은 링크 방지).
- `app/(reader)/mypage/page.tsx` — 섹션 4개(요약 / StreakChart 재사용 / 읽은 책 / 즐겨찾기). 자녀 0명이면 redirect 없이 온보딩 유도 1장.
- `lib/auth/routes.ts` — `MYPAGE_PATH` + `PROTECTED_PREFIXES`에 `/mypage` 추가.
- `components/library/library-browser.tsx` — `LibraryBookCard` **export 1줄만 추가**(A안). 카드 신규 생성 0건.

### 3. 모바일 햄버거 (`1ddf255`)
- `components/app/mobile-nav.tsx` — md 미만 햄버거 드롭다운. 닫힘 트리거 3종(링크 선택 / 바깥 클릭 / Esc), `aria-expanded`·`aria-controls`·`aria-label`.
- `components/app/app-header.tsx` — md 이상 텍스트 4링크 유지, md 미만 숨김. 좌측 로고 그룹 + 우측 그룹 `justify-between` 구조.
- 헤더는 원래부터 `'use client'`였으나, 몰입 화면 early return이 훅 선언보다 앞서 있어 드롭다운만 분리(rules-of-hooks 회피).

### 4. Hello Kiki 브랜드 표기 전수 통일 (`1ddf255`)
- **표기 확정 = `Hello Kiki`** (영문, 두 단어 띄어쓰기). 한글 병기 없음. 구표기 `Kikibooks`·`키키북스`·`HelloKiki`(붙임) 전부 폐기.
- `lib/brand.ts` 신설 = **단일 출처**(`BRAND_NAME`·`BRAND_TAGLINE`). `'server-only'` 미부착(클라이언트도 참조).
- 반영 범위: 랜딩 copy / metadata 20여 곳 / OG 이미지 / legal 문안(terms·privacy) / 헤더 로고 / 주석 4건.
- `app/`·`components/`·`lib/` 구표기 **잔여 0건**(grep 검증). 단 `lib/brand.ts` 주석의 구표기 3행은 **폐기 이력이므로 의도적 유지 — 제거하지 말 것.**
- `docs/`·ADR·`PLAN.md`의 구표기는 이력 문서라 **무접촉**.

### 5. ADR-0024
- 상태 **Accepted**(2026-08-07 승인).
- Amendment **O1~O5 + O3-R** 반영 완료.
  - O1 즐겨찾기 토글 베타 포함 + 구현 순서 [토글] → [마이페이지]
  - O2 완독 권수 = `is_completed = true`, 읽는 중 별도 표기
  - O3 헤더 4링크 기준(2링크 기술은 구정보로 정정) → **O3-R로 라벨 축약안 폐기, 햄버거 채택**
  - O4 경로 상수 중앙화 = **Moot**(ADR-0021 D5로 이미 완료). `PROTECTED_PREFIXES` 추가만 필수 범위
  - O5 즐겨찾기 목록 귀속지 = 마이페이지 섹션(`/library?fav=true` 태스크 스펙 기술은 구정보, ADR 우선)
- D1~D8 본문은 이력 보존을 위해 **삭제 없이** 그대로 두고 Amendment에서 링크.

---

## 미해결

**없음.** 다음 세션은 **새 트랙 착수** 예정.

관련 백로그(이번 세션에 기록만 하고 미착수):
- `docs/backlog.md` §7.4 **(y) 책 카드 4벌 → 공용 컴포넌트 통합** — 랜딩·홈·라이브러리·쇼케이스 4벌이 거의 동일 마크업. 마이페이지는 A안(export 1줄)으로 우회. 통합은 홈·라이브러리 **회귀 검증 필요**하므로 별도 작업 단위.
- `docs/backlog.md` §7.4 **(a)·②항은 [완료 2026-08-07]로 갱신 완료**(항목 삭제 없이 취소선 보존).

---

## 주의사항 (다음 세션 반드시 확인)

### (1) dev 서버 켜진 상태에서 `pnpm build` 실행 금지 🔴

`next build`와 `next dev`는 **같은 `.next/` 디렉터리를 공유**한다. dev가 떠 있을 때 build를 돌리면 dev 서버의 라우트 매니페스트·청크가 덮어써져 **신규 라우트가 404로 떨어진다.**

- **금일 실제 발생**: `/mypage` 추가 직후 팀장 화면에서 404. 코드·layout·middleware 전부 정상이었고 원인은 워커가 dev 가동 중 build를 3회 실행한 것.
- **규칙**: build가 필요하면 **먼저 팀장에게 dev 중지를 요청**하고, 중지 확인 후 실행한다. 부득이 실행했다면 **즉시 "dev 재시작 필요"를 보고**한다.
- type-check·lint는 `.next`를 건드리지 않으므로 dev 가동 중에도 안전하다.

### (2) `.claude/settings.local.json` — `Write(...)` 규칙 무효 경고

Claude Code **v2.1.222**부터 `settings.local.json`의 `Write(...)` 권한 규칙이 무효 경고를 낸다. **`Edit(...)`로 치환 필요.**
보류 47건 정리 시점에 묶어서 처리 예정 — **단독 착수하지 말 것.**

### (3) 🔴 구정보 재확인 — `scratchpad/dedup/SESSION_NOTE.md`

해당 파일에 중복 표지 정리 트랙이 **"DB 미실행"** 으로 기재돼 있으나 **사실이 아니다.**
팀장이 step1~3(백업 `books_backup_dedup_20260806` 231행 → UPDATE 231행 → 검증)을 **모두 실행 완료**했다. 문서 기재가 구정보다.

**이 파일을 근거로 재실행·재적용을 제안하지 말 것.** (지난 세션에 이어 두 번째 명시)

---

## 운영 규율 (불변 — 매 세션 적용)

- `git add .` 금지. **파일명 명시.** 경로에 `[id]`가 있으면 `--literal-pathspecs` 사용(글롭 오해석 차단).
- add → commit → push **각 단계 별도 승인**.
- commit 메시지는 **단일 `-m`, 트레일러 0건**(ADR-0020).
- push 전 `gh auth status` → `crspiegel` 확인 → 아니면 `gh auth switch --user crspiegel` → 재확인 → 그래도 아니면 **STOP**.
- DB 쓰기는 팀장 전속. 워커는 SQL **파일 작성까지만**. 대량 SQL은 step1/step2/step3 분할.
- 대량 작업은 **전수 드라이런 → 팀장 승인 → 실행**.
- **정찰(read-only) → ADR → 코드** 순서 엄수.
- 예상 외 상황 발견 시 자율 진행 금지. **즉시 STOP 후 보고.**
