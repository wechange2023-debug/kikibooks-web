# `&amp;` / HTML 엔티티 디코딩 감사 (1단계, 읽기 전용)

> 작성일 2026-06-29 · HEAD=8c21bbb · 읽기 전용 grep 실측 기반. 추정 없음.
> 판정 범례: ✅ `html.unescape` 적용 · ❌ 미적용 · ⚠️ 부분 · — 해당없음(필드 None 고정)

## 0. 세션 재개 검증
- HEAD = `8c21bbb` (기대값 일치)
- 워킹트리: `.claude/settings.local.json`만 미스테이징 (정상, 손대지 않음)
- `origin/main` 동기화됨 (HEAD == @{u})

## 1. 적재 파이프라인 디코딩 점검

대상 4종 스크립트의 **메타데이터 필드**(books 테이블에 저장되는 author·attribution_text·illustrator·title) 기준.
DB 적재처: 4종 모두 단일 `books` 테이블에 `upsert` (`client.table("books")`).

| 스크립트 | title | author | illustrator | attribution_text | 비고 |
|---|---|---|---|---|---|
| `sync_asb.py` | ❌ L273/296 | ❌ L303 | ❌ L304 | ❌ L282/306 | `parse_asb_header`(L153) raw split만, 디코딩 전무. 스크립트 내 `html.unescape` 0건 |
| `sync_bloom.py` | ❌ L289/793 | ❌ L528/799 | — (None, L800) | ❌ L782 | 유일한 `html.unescape`(L352)는 **page_text 본문**에만 적용 — 메타필드 아님 |
| `sync_book_dash_v2.py` | ✅ L155/693 | ❌ L339/699 | ❌ L339/700 | ⚠️ L646/702 | title만 디코딩. writer/illustrator는 `fetch_creators`(L336-346) 정규식 파싱, 디코딩 없음 → attribution은 title만 디코딩된 혼합 |
| `sync_gdl.py` | ✅ L287/325 | ✅ L291/307/336 | — (None, L337) | ✅ L294/339 | author=publisher(디코딩됨). title·publisher 모두 디코딩 후 attribution 빌드 |

### 필드별 라인 근거 (grep 실측)
- **ASb** (`sync_asb.py`)
  - title: 파싱 L273 `(header.get("title") or "").strip()` → payload L296. 디코딩 없음.
  - author: payload L303 `(header.get("author") or "").strip() or None`. 디코딩 없음.
  - illustrator: payload L304 `... (header.get("artist") or "").strip()`. 디코딩 없음.
  - attribution_text: L282 `build_asb_attribution(...)` → `lib/attribution.py build_attribution`(L75, 디코딩 없음) → payload L306.
  - `parse_asb_header`(L153-187): `raw.split(":",1)` + `.strip()`만 수행, `html.unescape` 없음.
- **Bloom** (`sync_bloom.py`)
  - title: `pick_english_title`(L283) → `_normalize_title`(L278, 공백정규화만) → payload L793. 디코딩 없음.
  - author: `extract_author`(L526-531, data-creator 최빈값 `.strip()`) → payload L799. 디코딩 없음.
  - illustrator: payload L800 고정 `None`.
  - attribution_text: L782 `build_attribution(title=, author=, illustrator=None)`. 입력값 미디코딩.
  - L352 `t = html.unescape(t)` 는 `extract_en_text`(L347, 페이지 본문 텍스트) 내부 — **manifest page_text 전용**, books 메타필드와 무관.
- **Book Dash v2** (`sync_book_dash_v2.py`)
  - title: L155 `html.unescape(... title.rendered ...)` ✅ → payload L693.
  - author(writer): `fetch_creators`(L322) L336-339 `name.strip()` / L346 파일슬러그 → payload L699. 디코딩 없음.
  - illustrator: 동일 `fetch_creators` → payload L700. 디코딩 없음.
  - attribution_text: L646 `build_book_dash_attribution(c["title"], writer, illustrator)` → payload L702. title은 디코딩 / writer·illustrator는 미디코딩 → **부분(⚠️)**.
- **GDL** (`sync_gdl.py`)
  - title: L287 `html.unescape(str(raw_title)).strip()` ✅ → payload L325.
  - author: L291 `publisher = html.unescape(...)` ✅ → L307 raw_author → payload L336.
  - illustrator: payload L337 고정 `None`.
  - attribution_text: L294 `build_gdl_attribution(title=디코딩, publisher=디코딩, ...)` ✅ → payload L339.

## 2. 실제 DB 테이블 구조

- `supabase/migrations/001_initial_schema.sql` `CREATE TABLE books`(L58):
  - `author TEXT`(L92), `illustrator TEXT`(L93), `attribution_text TEXT NOT NULL`(L97).
- `005_add_bloom_platform.sql`: `books.source_platform` 화이트리스트에 `'bloom'` 추가(L23-26)뿐. **별도 테이블/뷰 생성 없음.**
- 4종 스크립트 모두 `client.table("books").upsert(...)`로 동일 `books` 테이블에 적재 (ASb L321/333, Bloom L762/836 등).
- **Bloom은 books 단일 테이블에 들어간다** (별도 테이블/뷰 아님).

## 결론

- **디코딩 누락 파이프라인: `sync_asb.py` (전 필드), `sync_bloom.py` (전 메타필드), `sync_book_dash_v2.py` (author·illustrator — title은 적용됨)**
  - 완전 적용: `sync_gdl.py` 만.
  - 부분 적용: `sync_book_dash_v2.py` (title ✅ / author·illustrator ❌).
  - 전무: `sync_asb.py`, `sync_bloom.py` (메타필드 기준. Bloom의 `html.unescape`는 page_text 본문 전용).
- **author / attribution_text 저장 실제 테이블: `public.books`** (단일 테이블 — author·illustrator·attribution_text 컬럼). 4개 파이프라인 공통. 별도 테이블·뷰 없음.
