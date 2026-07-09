# 정찰 노트 — Book Dash 결손 15권 프로덕션 영향 분석 (2026-07-09, 읽기 전용)

> 워커(Claude Code) 정찰. 이 세션은 전 구간 읽기 전용 — 코드·DB·Storage 무변경, 산출물은 본 노트 1개.
> 관련: `docs/adr/0036-bookdash-image-storage.md` Amd#1(결손 15권 확정), `docs/adr/0035-bookdash-self-viewer.md`, `HANDOFF.md`(2026-07-09).

## 1. 요약

1. **결손 15권은 이미 프로덕션 6개 표면에서 코드 차단 중** — `lib/shared/blacklist.ts`의 `BOOK_DASH_404_SOURCE_IDS` 15건이 결손 15권과 **UUID·slug 집합 완전 일치**(워커 프로그램 대조, §4-e). 상세(`/book/[id]`)·뷰어(`/book/[id]/read`) 모두 notFound → 일반 사용자는 깨진 iframe을 볼 수 없음(예외: `/showcase` — §4-e).
2. **오디오·이미지 자산 불일치 실측**: 오디오 44권 ∩ 이미지 정예 39권이 아님. **A = 오디오 있음 ∧ 이미지 없음 = 10권**(표지만 존재 10권 전부, 이미 블랙리스트 차단 중인데 TTS 배치에 포함됨), **B = 이미지 있음 ∧ 오디오 없음 = 5권**(파일럿 완료 5권 — 로컬 생성만 되고 Storage/DB 미적재). 44 = 39 + 10 − 5 (§4-d).
3. 샘플 4권 + 대조군 1권 HTTP 실측으로 **원본 결손(진짜 404) 재확인**(§3). 자체 뷰어(ADR-0035/0036)로 전환해도 결손 15권은 살아나지 않음(§4-b). 처리 권고 = **현행 블랙리스트 유지 + 재확보 정찰 후 결정**(§5), A 집합 오디오 자산은 보존(§6), 잔여 커버 10개도 보존(§7).

## 2. STEP 2 — 결손 15권 DB 현황 (팀장 SQL Editor 실행)

### 2.1 매핑 근거 (추측 0건)

- slug → source_id(UUID) 매핑 출처: `scratchpad/tts_recon_49.csv` (컬럼 `id`=books.id, `source_id`, `slug`). **15/15 전건 확보, 미확보 0건** (워커 스크립트 대조 출력).
- source_id가 UUID 형식임의 근거: ADR-0036 §1 (팀장 SQL 실측 "No rows returned" = full-slug source_id 없음, 54/54 UUID). ※ 구메모 `upload_audio.py:74~76`·handoff 2026-07-07 L36의 "3권 full-slug" 기술은 ADR-0036(2026-07-08)이 정정한 구버전 믿음.
- 코드가 books를 읽는 경로(grep 실측): `lib/book/detail.ts:120~140`(getBookById, `.eq('is_active', true)` L129), `lib/library/query.ts`, `lib/home/categories.ts`, `lib/home/recommendations.ts`, `lib/landing/popular-books.ts`, `app/showcase/**`, `lib/admin/books/query.ts`.

### 2.2 조회 SQL ① — COUNT (매칭 검증. **15가 아니면 매핑 실패**)

```sql
SELECT COUNT(*) AS matched,
       COUNT(*) FILTER (WHERE is_active)      AS active_cnt,
       COUNT(*) FILTER (WHERE NOT is_active)  AS inactive_cnt,
       COUNT(*) FILTER (WHERE has_audio)      AS has_audio_cnt
FROM books
WHERE source_platform = 'book_dash'
  AND source_id IN (
    '9c9f4976-fe46-11e5-86aa-5e5517507c66',  -- hippo-wants-to-dance
    '9c9f4da4-fe46-11e5-86aa-5e5517507c66',  -- little-sock
    '9c9eb7e0-fe46-11e5-86aa-5e5517507c66',  -- mrs-penguins-palace
    '9c9f41f6-fe46-11e5-86aa-5e5517507c66',  -- shongololos-shoes
    '9c9f450c-fe46-11e5-86aa-5e5517507c66',  -- springloaded
    '9c9f5790-fe46-11e5-86aa-5e5517507c66',  -- the-best-thing-ever
    '9c9ec05a-fe46-11e5-86aa-5e5517507c66',  -- the-elephant-in-the-room
    '9c9ebdc6-fe46-11e5-86aa-5e5517507c66',  -- what-is-it
    '9c9f471e-fe46-11e5-86aa-5e5517507c66',  -- when-i-grow-up
    '9c9f485e-fe46-11e5-86aa-5e5517507c66',  -- who-is-our-friend
    '9c9eb574-fe46-11e5-86aa-5e5517507c66',  -- hugs-in-the-city (무텍스트)
    '9c9eb452-fe46-11e5-86aa-5e5517507c66',  -- i-can-dress-myself (무텍스트)
    '9c9ffed4-fe46-11e5-86aa-5e5517507c66',  -- it-wasnt-me (무텍스트)
    '9c9fffba-fe46-11e5-86aa-5e5517507c66',  -- katiitis-song (무텍스트)
    '9ca00316-fe46-11e5-86aa-5e5517507c66'   -- the-lion-who-wouldnt-try (무텍스트)
  );
```

**워커 예상**: matched=15, has_audio_cnt=10(표지만 그룹 — §4-d A 집합), active_cnt는 실측 대기(주간 cron `sync-book-dash.yml`이 is_active=True로 되돌리는 설계라 15로 예상 — `lib/shared/blacklist.ts:32`).

> 팀장 실행 결과 기입란: matched = ___ / active = ___ / inactive = ___ / has_audio = ___

### 2.3 조회 SQL ② — 15권 목록 (15행, 100행 제한 무관)

```sql
SELECT id, source_id, title, is_active, content_type, has_audio, content_url
FROM books
WHERE source_platform = 'book_dash'
  AND source_id IN (
    '9c9f4976-fe46-11e5-86aa-5e5517507c66', '9c9f4da4-fe46-11e5-86aa-5e5517507c66',
    '9c9eb7e0-fe46-11e5-86aa-5e5517507c66', '9c9f41f6-fe46-11e5-86aa-5e5517507c66',
    '9c9f450c-fe46-11e5-86aa-5e5517507c66', '9c9f5790-fe46-11e5-86aa-5e5517507c66',
    '9c9ec05a-fe46-11e5-86aa-5e5517507c66', '9c9ebdc6-fe46-11e5-86aa-5e5517507c66',
    '9c9f471e-fe46-11e5-86aa-5e5517507c66', '9c9f485e-fe46-11e5-86aa-5e5517507c66',
    '9c9eb574-fe46-11e5-86aa-5e5517507c66', '9c9eb452-fe46-11e5-86aa-5e5517507c66',
    '9c9ffed4-fe46-11e5-86aa-5e5517507c66', '9c9fffba-fe46-11e5-86aa-5e5517507c66',
    '9ca00316-fe46-11e5-86aa-5e5517507c66'
  )
ORDER BY title;
```

> 팀장 실행 결과 기입란: (행수 = ___ ; is_active=false 책 = ___ )

### 2.4 보조 SQL ③ — B 집합 검증 (완료 5권: 이미지 있음 ∧ 오디오 없음, §4-d)

```sql
SELECT b.id, b.source_id, b.title, b.has_audio,
       (SELECT COUNT(*) FROM book_audio a WHERE a.book_id = b.id) AS audio_rows
FROM books b
WHERE b.source_platform = 'book_dash'
  AND b.source_id IN (
    '9c9e94e0-fe46-11e5-86aa-5e5517507c66',  -- a-beautiful-day
    '9c9e8586-fe46-11e5-86aa-5e5517507c66',  -- a-dancers-tale
    '9c9e6754-fe46-11e5-86aa-5e5517507c66',  -- a-fish-and-a-gift
    '9c9e72e4-fe46-11e5-86aa-5e5517507c66',  -- a-house-for-mouse
    '9c9e7a6e-fe46-11e5-86aa-5e5517507c66'   -- a-tiny-seed
  );
-- 워커 예상: 5행 전부 has_audio=false, audio_rows=0 (book_audio 574행 = step8 44권분과 정합)
```

> 팀장 실행 결과 기입란: ___

(UUID 출처: 15권 = `scratchpad/tts_recon_49.csv` 해당 행 / 완료 5권 = `scripts/copy_bookdash_images.py:94~100` DONE_BOOKS.)

## 3. STEP 3 — 프로덕션 iframe 이미지 HTTP 실측 (샘플 4 + 대조군 1)

방법: 각 책 GH Pages HTML GET → `<img src>` 전건 추출 → src별 bare / cache-bust(`?cb=<epoch>`) 상태코드. 요청 간 0.6초 지연, 다운로드 없음(스트림 즉시 close). 총 160건(1차 135 + 대조군 재실측 25), cb=1783558434·1783558747.

**측정 방법 사고와 교정(투명 보고)**: 1차 실행에서 대조군만 전부 404가 났다. 원인은 원본 결손이 아니라 **워커 스크립트의 URL 결합 버그** — 대조군 HTML만 `<img src>`가 루트 절대경로(`/bookdash-books/...`)여서 단순 이어붙임이 경로 중복 URL을 만들었다. `urljoin`으로 교정 후 재실측 = **대조군 13/13 전부 200** → 측정 방법 정상, 결손 4권의 404는 진짜. (부수 검증: 결손 4권 안에서도 실존 파일 `images/book-dash-logo.png`는 bare 200 — 동일 방법·동일 시점 책 내부 양성 대조 성립. 레이트리밋 전면 404 상황 아님.)

| 책 (그룹) | 본문 이미지 | 기대 | bare | cache-bust | 판정 |
|---|---|---|---|---|---|
| hippo-wants-to-dance (표지만) | images/01~12.jpg (12장) | 404 | **12/12 전부 404** | 12/12 전부 404 | 진짜 결손 |
| springloaded (표지만) | images/01~12.jpg (12장) | 404 | 12/12 전부 404 | 12/12 전부 404 | 진짜 결손 |
| hugs-in-the-city (전무) | images/01~12.jpg (12장) | 404 | 12/12 전부 404 | 12/12 전부 404 | 진짜 결손 |
| it-wasnt-me (전무) | images/01~12.jpg (12장) | 404 | 12/12 전부 404 | 12/12 전부 404 | 진짜 결손 |
| a-fish-and-a-gift (**대조군**) | images/01~12.jpg (12장) | 200 | **12/12 전부 200** | 12/12 전부 200 | 원본 실존 |

판정 기준 충족: bare 404 + cache-bust 404 = 진짜 원본 결손 (캐시 문제 아님). 4권 모두 HTML 자체는 200(죽은 `<img>` 참조) — iframe으로 열리면 흰 페이지+깨진 이미지. **단, §4-e의 블랙리스트 때문에 일반 사용자는 이 화면에 도달하지 못한다.**

## 4. STEP 4 — 자체 뷰어(ADR-0035) 관점 영향 분석

### (a) 이미지 경로 조합 규칙

ADR-0036 D5 (`docs/adr/0036-bookdash-image-storage.md:66~67`) 원문:

> **이미지용 신규 테이블·컬럼을 만들지 않는다.** 뷰어가 `source_id`(UUID) + 페이지 번호로 **키를 규칙 조립**한다: `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/book-images/book_dash-{source_id}/{NN}.jpg`.

### (b) 결손 15권에 대한 반환값

규칙 조립은 무조건 URL 문자열을 생성한다(존재 확인 없음). 결손 15권은 `book-images` 버킷에 본문 객체가 0개(표지만 그룹은 `cover.jpg` 1개뿐 — HANDOFF.md L26~27, 버킷 실측 518 = 정예 508 + 잔여 커버 10, 팀장 확정) → 조립된 본문 URL은 **Supabase Storage 404**. 자체 뷰어로 전환해도 결손 15권은 빈 이미지 면만 나온다. **자체 뷰어는 이 15권을 살리지 못한다(확정).**

### (c) getBookById SELECT 컬럼 (grep 재확인)

`lib/book/detail.ts:126` 원문: `'id, title, author, illustrator, cover_url, content_url, content_type, original_url, license, attribution_text, source_platform, source_id, level, age_min, age_max, language, is_active'`

→ **`source_platform`·`source_id` 포함, `has_audio` 미포함.** 직전 세션 메모(= ADR-0036 §5 비고 3) 정확함. ADR-0035 D6(has_audio 추가)은 아직 미구현. 또한 L129 `.eq('is_active', true)` — 비활성 책은 조회 자체가 null.

### (d) 오디오 44권 vs 이미지 39권 교차 대조 (최우선 안건) ★

- **44권 정본 출처(실측)**: `scripts/tts_pilot/upload_audio.py:70~96`(`EXCLUDE` 무텍스트 5권 = L70~73, 코호트 = `tts_recon_49.csv` 49 − 5 = 44) 및 `scratchpad/step8_book_audio_insert.sql:11~56`(선검증 IN절 44개 books.id, 중복 0). 두 목록을 CSV로 역매핑 대조 = **집합 완전 일치**.
- **무텍스트 5권(hugs-in-the-city, i-can-dress-myself, it-wasnt-me, katiitis-song, the-lion-who-wouldnt-try)은 44권에 5/5 전부 미포함.** 텍스트 없는 책에 오디오를 만든 오류는 **없음** → (5)항 해당 없음.
- **차집합 (전체 목록)**:
  - **A = 오디오 있음 ∧ 이미지 없음 = 10권** (기대 5권과 다름): hippo-wants-to-dance, little-sock, mrs-penguins-palace, shongololos-shoes, springloaded, the-best-thing-ever, the-elephant-in-the-room, what-is-it, when-i-grow-up, who-is-our-friend — **"표지만 존재" 10권 전부**. 자체 뷰어 전환 시 "소리는 있는데 그림이 없는" 책. 또한 이 10권은 **2026-06-11부터 블랙리스트 차단 중이었는데 2026-07-07 TTS 배치에 포함**됨(차단 목록 미대조 — 프로세스 개선 항목).
  - **B = 이미지 있음 ∧ 오디오 없음 = 5권** (기대 0권과 다름 — 별도 보고): a-beautiful-day, a-dancers-tale, a-fish-and-a-gift, a-house-for-mouse, a-tiny-seed (= 파일럿 완료 5권, `copy_bookdash_images.py:94~100` DONE_BOOKS). 근거: handoff 2026-07-07 L7 "44 = 54 − 완료 5 − 무텍스트 5" — 파일럿 산출물은 로컬 전용으로 Storage/DB 미적재. 팀장 확정 실측(book_audio 정확히 574행 = step8 예상치)과 정합. **정예 39권 중 이 5권은 자체 뷰어에서 오디오가 없다** → §2.4 SQL로 확정 후, 뷰어 트랙 전에 이 5권 오디오 생성·업로드·적재 필요.
- **산술 정합**: 44(오디오) = 39(이미지) + 10(A) − 5(B). "44−39=5"는 우연의 산술이었음.

### (e) (추가 발견) 결손 15권 = 기존 블랙리스트 15권 동일 집합

`lib/shared/blacklist.ts:35~53` `BOOK_DASH_404_SOURCE_IDS`(2026-06-11 전수 감사, ADR-0014 Amd#6)와 결손 15권의 UUID·slug 집합이 **완전 일치**(워커 프로그램 대조: 차이 0건). 적용 표면 6곳(grep 실측): `lib/landing/popular-books.ts:80`, `lib/home/recommendations.ts:115`, `lib/home/categories.ts:329·459`, `lib/library/query.ts:243·320·360`, `app/(reader)/book/[id]/page.tsx:87`, `app/(reader)/book/[id]/read/page.tsx:114`. 상세·뷰어가 notFound이므로 **결손 15권의 뷰어 진입은 이미 차단 상태**.

미적용 표면: `/showcase`(임시·로그인 전용 시연 — `app/showcase/[source]/page.tsx:73~74`는 is_active+source_platform만 필터, 블랙리스트 0건)와 admin(의도적 — `lib/admin/books/query.ts:20`). celebrate 페이지도 블랙리스트 미적용이나 완독 후에만 도달하므로 실질 영향 미미.

또한 `blacklist.ts:32` 주석: **주간 cron(`sync-book-dash.yml`, 일 02:00)이 is_active=True로 되돌리므로 is_active=false 대신 코드 블랙리스트로 차단(cron-proof)** — §5 방침 평가의 핵심 전제.

## 5. 결손 15권 처리 방침 3안 + 워커 추천

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| 안1 | 15권 is_active=false (삭제 금지 — reading_sessions FK) | DB 단일 스위치, admin 토글 UI 존재 | **주간 cron이 True로 되돌림**(`blacklist.ts:32`) — 단독으론 다음 일요일 02:00에 무효화. cron 수정까지 얹으면 범위 확대. 이미 코드 차단돼 있어 실익이 showcase 정리 정도 |
| 안2 | 표지만 10권 유지 + 뷰어 진입 차단, 무텍스트 5권만 비활성화 | 그룹별 차등 | **현행이 이미 이 상태의 상위 호환** — 15권 전부 상세·뷰어 notFound. 5권만 is_active=false 해도 cron 원복 문제 동일 |
| 안3 | 15권 유지 + 뷰어 "이미지 준비 중" 플레이스홀더 | 카탈로그 권수 유지 | 신규 구현 필요. 유아 그림책에서 그림 없는 책 노출은 사용자 가치 음수. 어차피 블랙리스트가 상세 진입을 막고 있어 플레이스홀더에 도달 불가(차단 해제 필요 = 역행) |

**★ 워커 추천: 현행 코드 블랙리스트 유지(사실상 안2의 달성된 형태) + DB 무변경. 즉 이번에 DB 쓰기 0건.** 근거: (1) 결손 15권 = 블랙리스트 15권 동일 집합이라 사용자 노출은 이미 차단됨(§4-e), (2) is_active 조작은 cron 원복 때문에 설계상 열등(blacklist.ts:32가 이를 명시한 선례), (3) 유일한 잔여 노출인 /showcase는 임시·로그인 전용 시연 페이지라 베타 사용자 영향 0 — 필요 시 별도 소트랙에서 블랙리스트 7번째 표면으로 합류(코드 몇 줄). 후속: HANDOFF §9 (A) **WP/CloudFront 원본 재확보 정찰**을 다음 트랙으로 실행하고, 확보 성공 책은 `--include-imageless` 복사 후 블랙리스트에서 축소(blacklist.ts:33의 설계된 회복 경로), 실패 확정 시 ADR로 영구 제외 박제.

## 6. A 집합(오디오 있음 ∧ 이미지 없음 10권) 처리 권고 (읽기 전용 — 권고만)

- **보존 권고**: Storage `book-audio`의 10권분(mp3+marks)·`book_audio` 행·`has_audio=true`를 당분간 유지. 근거: (1) 재확보 정찰이 성공하면 이 10권은 오디오+이미지 완비로 즉시 정예 편입 가능(재생성 비용 회피), (2) 블랙리스트가 상세·뷰어를 차단 중이라 has_audio=true여도 사용자 표면 부작용 없음, (3) 저장비 소액.
- 단, **뷰어 트랙(ADR-0035 D6) 구현 시 주의**: has_audio 기반 분기를 넣을 때 "has_audio=true ∧ 이미지 없음" 조합이 존재함을 전제할 것(현재 10권). 재확보 실패가 확정되면 그때 오디오 정리(행 삭제/보관) 여부를 별도 결정.
- 프로세스 개선: 향후 배치(오디오·이미지·기타) 코호트 산정 시 `BOOK_DASH_404_SOURCE_IDS` 대조를 선행 게이트로 추가 권고(이번 10권 중복 지출의 재발 방지).

## 7. 버킷 잔여 커버 10개 처리 권고

**보존 권고.** 근거: (1) 재확보 성공 시 `cover.jpg`는 이미 창고 완료분이라 재복사 불요, (2) 완결성 게이트는 코호트(정예 39권)의 book_key만 집계(`copy_bookdash_images.py:351~361` — cohort 순회)하므로 잔여 커버가 게이트를 오염시키지 않음, (3) 용량 미미(커버 10장). 재확보 실패 확정 시 결손 책 관련 자산(커버 10 + A 집합 오디오)을 한 번에 정리하는 편이 운영상 깔끔.

## 8. 다음 세션 첫 안건 제안

1. **(팀장) §2 SQL ①②③ 실행 → 본 노트 기입란 채움** (특히 ③ B 집합 확정).
2. **B 집합 5권 오디오 보충 트랙** — 정예 39권의 뷰어 완비 전제조건(생성→업로드→적재, 기존 스크립트 재사용).
3. HANDOFF §9 (A) **결손 15권 원본 재확보 정찰**(bookdash.org WP REST / CloudFront) — 성공 여부가 §5~§7 권고의 최종 확정 조건.
