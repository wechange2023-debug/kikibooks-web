# 외부 표지 URL 전수 응답 측정 — 표지 플레이스홀더 원인 확정

작성 2026-07-28 · 기준 HEAD `9b3d593` · **읽기 전용**(DB SELECT만 · Storage 쓰기 0 · 앱 코드 수정 0)
계측 스크립트: `scripts/recon/cover_url_probe.py`
산출물(로컬, `.gitignore:7`): `scripts/recon/out/cover_probe.json` · `cover_probe_failed.csv`(1,242행) · `cover_probe_state.json`

---

## 요약 (먼저 읽을 4줄)

1. **표지 결손의 원인은 원본 404다.** 외부 표지 4,116건을 전수 측정해 **1,242건 실패**(전부 404)를 확인했다.
2. **실패는 사실상 African Storybook 한 곳에 몰려 있다 — 2,748건 중 1,237건(45.0%).**
   나머지 5건은 book_dash이고, **bloom은 463건 전량 200 · gdl은 851건 전량 200**이다.
3. ⚠ **증상 보고의 "bloom 위주"는 측정과 어긋난다.** bloom 표지는 **실패 0건**이다.
   화면에서 비어 보인 카드는 ASb일 가능성이 높다(관리자 목록은 출처 라벨이 카드 하단 badge에만 있어 혼동하기 쉽다).
4. **실패 1,242권 중 748권이 `is_active=true`** — 즉 사용자 화면에 노출되는 책이다(ASb 743 + book_dash 5).

---

## 1. 측정 방법

| 항목 | 내용 |
|---|---|
| 모집단 | `books` 전 4,273행 |
| 측정 대상 | `cover_url`이 `http`로 시작하고 Supabase Storage가 아닌 **외부 URL 4,116건** |
| 측정 제외 | Supabase Storage 155건(자체 버킷) · URL 아님 2건(아래 §4) |
| 방식 | `HEAD` 우선, 405/501이면 `Range: bytes=0-0` GET으로 승격. **본문 미수신** |
| 재시도 | 5xx·네트워크 오류 최대 3회 시도(2회 재시도). **4xx는 재시도 없음** |
| 부하 | 동시성 5 + 요청 간 0.05s → 실측 약 **12.5 req/s**, 전량 약 5분 30초 |
| 재시도 효과 | 최종 결과에 5xx·네트워크 오류 **0건** — 실패는 전부 확정적 404다 |

---

## 2. source_platform × 응답코드

| source_platform | 측정 | 200 | 404 | 404 비율 |
|---|---:|---:|---:|---:|
| **african_storybook** | 2,748 | 1,511 | **1,237** | **45.0%** |
| bloom | 463 | 463 | 0 | 0.0% |
| gdl | 851 | 851 | 0 | 0.0% |
| book_dash | 54 | 49 | **5** | 9.3% |
| **합계** | **4,116** | **2,874** | **1,242** | 30.2% |

404 외의 실패 코드(4xx 기타·5xx·타임아웃)는 **0건**이다.

### 2-1. 사용자 노출 여부 (`is_active`)

| source_platform | 실패 중 `is_active=true` | 실패 중 `false` |
|---|---:|---:|
| african_storybook | **743** | 494 |
| book_dash | **5** | 0 |
| **합계** | **748** | 494 |

`/library`·`/home`·랜딩은 `is_active=true`만 조회하므로 **ASb 743권이 사용자에게 깨진 표지(플레이스홀더)로 보인다**.
`/admin/books`는 `is_active` 기본값이 any라 비활성 494권까지 더해 **1,237권 전부**가 보인다 — 관리자 화면에서
훨씬 도드라지는 이유다.

---

## 3. 실패 상세

### 3-1. African Storybook 1,237건 — 신규 ID 구간에 집중

URL 형태는 성공·실패가 **완전히 동일**하다(`https://africanstorybook.org/illustrations/covers/{N}.png`).
즉 URL 조립 오류가 아니라 **원본에 파일이 없다.**

표지 번호 `{N}` 구간별 404 비율:

| covers ID 구간 | 200 | 404 | 404 비율 |
|---|---:|---:|---:|
| 0 – 9,999 | 220 | 0 | 0.0% |
| 10,000 – 24,999 | 636 | 1 | 0.2% |
| 25,000 – 29,999 | 1 | 0 | 0.0% |
| **30,000 – 34,999** | 256 | 109 | **29.9%** |
| **35,000 – 39,999** | 354 | 1,016 | **74.2%** |
| **40,000 – 44,999** | 44 | 111 | **71.6%** |

**ID 30,000 미만은 사실상 전부 살아 있고(1건 예외), 30,000 이상에서 급격히 무너진다.**
번호가 클수록(=신규 등록물) 표지 이미지가 원본에 게시되지 않은 것으로 보인다.
중앙값도 갈린다 — 200은 22,357 / 404는 37,874.

### 3-2. book_dash 5건 — 전부 기존 블랙리스트

```
hugs-in-the-city / i-can-dress-myself / katiitis-song / the-lion-who-wouldnt-try / it-wasnt-me
→ https://bookdash.github.io/bookdash-books/{slug}/en/images/cover.jpg  (404)
```

5건 모두 `lib/shared/blacklist.ts`의 `BOOK_DASH_404_SOURCE_IDS`(15권)에 이미 포함돼 있다
(앞 4건 = ADR-0014 Amd#2·#3·#5의 "표지 cover.jpg 404 4건", `it-wasnt-me` = Amd#6 본문 404 11건 중 1건).

블랙리스트는 카드 4표면과 상세·뷰어에 `.neq('source_id', …)` / `notFound()`로 걸려 있으나
**`/admin/books`에는 걸려 있지 않다**(`lib/admin/books/query.ts` — "admin은 모든 책을 봐야 함"이 의도).
따라서 이 5권은 **사용자에게는 안 보이고 관리자 목록에만 보인다** — 증상의 "book_dash 일부 포함"과 일치한다.
`is_active=true`이지만 블랙리스트가 앞단에서 막고 있어 사용자 노출은 없다.

### 3-3. bloom 463건 — 실패 0

`https://s3.amazonaws.com/bloomharvest/…` 전량 200. 직전 정찰에서 `/_next/image` 최적화 경유도
200(image/png)임을 확인했으므로, **bloom 표지는 DB·원본·최적화 3단계 모두 정상**이다.

---

## 4. 별건 — `cover_url`이 URL이 아닌 ASb 2권 (측정 제외)

| source_platform | book_id | `cover_url` | is_active | title |
|---|---|---|---|---|
| african_storybook | `b0283a0b-5836-498f-9086-70e81e7c91c2` | `'Xam'` | **true** | Fire on the mountain |
| african_storybook | `08c9be27-76f8-44de-ae73-ebd140ffffb2` | `'Xama'` | **true** | Fire on the mountain |

`books.cover_url`은 `TEXT NOT NULL`이라 NULL은 없지만 **URL이 아닌 문자열은 막히지 않는다.**
두 행 모두 제목이 같아 동일 원본의 언어 변종으로 보이며, 값이 언어명(`Xam`/`Xama` — 코이산어 계열)으로
잘못 들어간 것으로 추정된다. **동기화 스크립트의 필드 매핑 오류 가능성**이 있으나 본 정찰에서 원인까지는
확인하지 않았다. 두 권 모두 `is_active=true`라 사용자에게 노출된다.

---

## 5. 플레이스홀더가 뜨는 경로 (직전 정찰 재확인)

관리자·라이브러리·랜딩 카드 모두 동일 패턴이며 `cover_url` 사전 검사가 없다:

```jsx
{imageError ? <BookOpen 플레이스홀더/> : <Image src={coverUrl} … onError={() => setImageError(true)} />}
```

- `components/admin/books/admin-books-browser.tsx:199`
- `components/library/library-browser.tsx:141`
- `components/landing/book-cover-card.tsx:64`

원본 404 → `/_next/image` 404 → `onError` → 플레이스홀더. §2의 1,242건이 그대로 이 경로를 탄다.
§4의 2건도 `<Image src="Xam">`이 실패해 같은 결과가 된다.

---

## 6. 대응 후보 (나열만 — 실행·결정 아님)

**A. 표지 자체를 고치는 방향**
1. ASb 404 1,237권의 표지를 **본문 첫 이미지로 대체** — bloom이 쓰는 방식(ADR-0030 D2)과 같은 전략.
   ASb 콘텐츠(`content_type='asb_native'`, `.txt` 매니페스트)에 이미지 URL이 있는지 선행 확인 필요.
2. 살아 있는 표지를 **Supabase Storage로 이관**(ADR-0032 book-covers 선례) — 원본이 더 사라져도 안전해진다.
   단 404인 1,237권은 이관할 원본 자체가 없다.
3. ASb 원본에 다른 표지 경로(썸네일·다른 확장자)가 있는지 정찰 — 현재는 `/illustrations/covers/{N}.png` 단일 규약만 확인했다.

**B. 노출 정책으로 다루는 방향**
4. 표지 404 + `is_active=true`인 **743권을 비공개 전환** — ADR-0026 선별공개 기준에 "표지 유효성"을 추가.
5. 블랙리스트 방식처럼 카드 쿼리에서 제외.

**C. 화면에서 다루는 방향**
6. 현재 플레이스홀더(책 아이콘 + 제목)를 유지하되 의도된 폴백으로 정식화 — 사용자 카드는 이미 제목을 함께
   보여주므로 최악은 아니다. 관리자 카드는 제목이 옆에 있어 식별 가능.

**D. 데이터 위생**
7. §4의 2권 `cover_url` 정정 + 동기화 스크립트 매핑 점검.
8. `books.cover_url`에 URL 형식 CHECK 제약 추가 검토(**스키마 변경 → ADR 선행 필수**).

**재측정**: `python scripts/recon/cover_url_probe.py --force` (약 6분). 원본이 복구되면 수치가 바뀐다.

---

## 7. 산출물

| 파일 | 내용 | 커밋 |
|---|---|---|
| `scripts/recon/cover_url_probe.py` | 측정 스크립트(재개 지원) | ✅ |
| `docs/recon/2026-07-28-cover-url-availability.md` | 본 보고서 | ✅ |
| `scripts/recon/out/cover_probe.json` | 4,116건 전 측정 결과 | ❌ `.gitignore:7` |
| `scripts/recon/out/cover_probe_failed.csv` | 실패 1,242행(source_platform·book_id·is_active·status·title·cover_url) | ❌ `.gitignore:7` |

실패 목록 전체가 필요하면 CSV를 열거나 스크립트를 재실행해 재생성한다.
