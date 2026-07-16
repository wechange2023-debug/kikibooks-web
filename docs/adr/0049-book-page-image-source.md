# ADR-0049: book_text 검수·뷰어용 페이지 이미지 출처 — bookdash.org WP PDF 렌더

## Status
Proposed (2026-07-16) / 기준 HEAD 7a706ca

## Context

- `/admin/review` 검수 화면은 **페이지 이미지가 전제**다. 확정 텍스트(`book_text`)만으로는 검수자가 원문을 복원할 수 없어 판정이 추측이 된다(SFX/대사 재분류·읽기순서 확인은 원본 그림면 대조가 필수).
- 기존 `book-images` 버킷 = **39권 / 518객체**, 출처는 **GH Pages 구판**(bookdash.github.io), 키 = `book_dash-{UUID}`. 이 39권은 **book_text 152권(WP scheme-B)과 교집합 0**이다(작업지시서 #7 정찰: 152권 전권이 버킷에 이미지 0장).
- 기존 업로드 스크립트 `copy_bookdash_images.py`는 **GH Pages·39권 전용**(출처·코호트·키 소스 모두 상이) → 152권에 재사용 불가.
- 반면 `book_text`의 확정 텍스트(`out_fixed_154`)는 **bookdash.org WP source-files의 PDF**에서 나왔고(`harvest.py` → `reextract_coords.py` → `order_fix.py`), PDF→이미지 렌더 라이브러리(PyMuPDF 등)가 로컬에 가용하다(작업지시서 #8 정찰).

## Decision

### D1. 152권 페이지 이미지의 출처 = book_text와 동일한 bookdash.org WP PDF
- 근거: `out_fixed_154` 텍스트가 이 PDF에서 나왔으므로 **글 1페이지 = 그림 1페이지가 구조적으로 보장**된다.
- WP scheme-B 이미지(모달 JPG 세트)는 출처가 달라 장수 불일치 위험이 있고(백로그 "이미지 파서 페이지 과소검출" 기재), 검수 화면에서 글·그림이 1칸만 밀려도 검수가 무의미해진다.

### D2. 렌더 대상 = PDF 페이지 = page_no + mapping_offset
- 권별 `mapping_offset`은 `out_154/{slug}.pages.json`의 값을 그대로 쓴다(권별 상이, 통상 4).
- `page_no + mapping_offset`은 **1-based PDF 페이지 번호**다(실측: a-day-out offset 4·pdf_page_count 18·page_no 1~14 → max 14+4=18=총장수). PyMuPDF는 0-based이므로 렌더 시 페이지 인덱스는 `page_no + mapping_offset − 1`이다.

### D3. 버킷 키 = book-images/book_dash-{slug}/NN.jpg
- `NN` = zero-pad 2자리, 1-based, **NN = book_text.page_index + 1** (= page_no).
- ADR-0036 D2(`{book_key} = book_dash-{source_id}`) 규약을 그대로 따른다.
- 본 코호트는 `books.source_id = slug`이므로(ADR-0047 D1 조인 근거) 기존 UUID 39권 폴더(`book_dash-{UUID}`)와 **키 충돌하지 않는다**.

### D4. PDF 캐시·렌더 이미지는 git 미추적
- 근거: 웹 → PDF → 이미지 재생성 체인이 전량 커밋돼 있고(`harvest.py`, `reextract_coords.py`, `order_fix.py`), 영구 사본은 Supabase Storage다.
- `out_fixed_154`는 재생성에 네트워크가 필요해 커밋했으나, 원료(PDF·렌더 이미지)는 부피 대비 실익이 없다.
- `.gitignore`에 `scripts/pdf_harvest/_pdf_cache/`·`scripts/pdf_harvest/out_images_154/` 추가.

### D5. DB에 이미지 장부(테이블·컬럼)를 만들지 않는다
- 뷰어가 규칙으로 URL을 조립한다(ADR-0036 D5 계승): `{SUPABASE_URL}/storage/v1/object/public/book-images/book_dash-{slug}/{NN}.jpg`.
- 페이지 수는 `book_text`의 `max(page_index)+1`로 도출한다.

### D6. 파일럿 3권 게이트
- 전량 진행 전 3권(`a-day-out`·`catch-that-cat`·`a-trip-to-the-tap`)을 렌더해 팀장이 글·그림 정합을 눈으로 확인한다.
- 불일치 시 전량 중단하고 offset 규약을 재설계한다.

## Consequences

- **얻는 것**: 글·그림 정합이 출처 동일성으로 보장. 서비스 뷰어(Phase D)도 동일 이미지 재사용 가능.
- **잃는 것**: bookdash.org에 154회 요청 필요(팀장 승인 완료). 로컬 디스크 사용.
- **되돌리기**: Storage 객체 삭제. DB 무변경이라 롤백 비용 낮음.

## Non-goals

- 39권 GH 코호트 처리 / WP scheme-B 이미지(모달 JPG) 트랙 / 검수 화면 UI 설계.

## Open (팀장 확인)

- 없음.
