# ADR-0032 — Book Dash 표지 자산 Storage 이관 및 cover_url 재지정

## Status
Proposed

## Context
- `/showcase`에서 Book Dash 도서(ADR-0027 v2, 206권)를 검수할 때 표지 로딩이 느리다는 보고.
- 읽기전용 정찰 실측(2026-06-30, curl, 표본 3건):

  | 표본 | 크기 | TTFB | total |
  |---|---|---|---|
  | the-window-seat_en_cover.jpg | 1.52 MB | 1.41s | 3.80s |
  | khaya-wants-to-row_en_cover.jpg | 4.32 MB | 1.37s | 8.03s |
  | moms-hands_en_cover.jpg | 3.74 MB | 1.40s | 4.94s |
  | **평균** | **약 3.3 MB** | **약 1.4s** | **약 5.6s** |

- 원인 3종:
  1. 원본이 인쇄 해상도 JPEG(장당 1.5~4.5MB) — 썸네일 용도엔 과대.
  2. origin이 `bookdash.org` WordPress(`/wp-content/uploads/...`)로 TTFB가 일정하게 ~1.4s.
  3. DB `cover_url`이 그 외부 origin 주소를 직접 저장 → 우리 인프라(Supabase, 서울)로
     캐시·최적화 통제 불가. next/image 최적화가 켜져 있어도 콜드 캐시 첫 노출 시
     옵티마이저가 수 MB 원본을 느린 origin에서 먼저 끌어와야 함.
- 표지 출처 조립(sync_book_dash_v2.py:159-166): featured_media(`bookdash.org`) 우선,
  없으면 CloudFront 폴백(`d3qawc7yl9x4zs.cloudfront.net/.../{slug}_en_cover.jpg`).
- 본문(content_url)은 이미 우리 Supabase Storage(`book-manifests/{slug}_en.txt`) 매니페스트라
  본 ADR 범위가 아니다. 본 ADR은 **표지 한정**.

## Decision
1. **대상** = Book Dash 공개도서(is_active=true) 표지 한정, 이번 회차 206건.
   본문 이미지·매니페스트·다른 출처(GDL·ASb·Bloom 등)는 미터치.

2. **변환 사양(잠정)** = 가로 600px 리사이즈, WebP, 품질 80 기준.
   - 600px 근거: 카드 최대 표시폭(`sizes` 최댓값 ~16vw·데스크탑) × DPR 2 여유.
   - 최종 수치(폭·품질)는 **STEP 2에서 표본 변환 후 화질/용량 검증**하고 확정한다.
     본 ADR은 기준값만 박제하고, 확정 시 Amendment로 기록.

3. **저장 위치** = Supabase Storage 신규 **public 버킷 `book-covers`**, 객체 키
   `bookdash-{source_id}.webp` (Book Dash는 `source_id = slug`라 URL-safe).
   - 기존 컨벤션 참고: `book-manifests` 버킷은 public·flat 경로·upsert 업로드
     (sync_book_dash_v2.py:415-433). 본 건은 자산 종류가 달라(매니페스트 vs 이미지)
     별도 버킷으로 분리해 매니페스트 버킷을 오염시키지 않는다.
   - **버킷 생성은 팀장이 Supabase Dashboard에서 수행**(워커는 Storage 관리자 권한 없음).
     public read 정책으로 생성(매니페스트 버킷과 동일, 별도 RLS 불요).
   - 최종 public URL 형태:
     `{SUPABASE_URL}/storage/v1/object/public/book-covers/bookdash-{slug}.webp`.

4. **업로드 방식** = 기존 `sync_bloom --upload-only`(Storage만 쓰기, DB 미터치, 커밋 637562ec
     계열) 패턴을 모델로, STEP 2에서 표지 변환 루틴을 추가한다.
   - 동작: 원본 cover_url(bookdash.org 또는 CloudFront 폴백) GET → 600px WebP 변환
     → `book-covers` 버킷 upsert 업로드. **DB INSERT/UPDATE 0건.**

5. **DB 반영** = `books.cover_url`만 UPDATE. `original_url`·`attribution_text`·기타 컬럼
   전부 미터치(어트리뷰션·출처 추적 보존).
   - **워커는 UPDATE SQL 파일만 산출**한다. 실제 DB UPDATE는 팀장이 SQL Editor에서
     직접 실행(불변 규율 — 워커 DB 직접 쓰기 금지).
   - 매칭 키 = `(source_platform='book_dash', source_id=slug)` 또는 행 `id`.

## 원본 보존 원칙
- 변환은 **사본 생성**이며 원본 파일·원본 라이선스(CC BY 4.0)·출처 표기에 영향 없다.
- `original_url`(원본 책 페이지)은 미터치 → 어트리뷰션 링크·추적성 그대로 유지.
- `attribution_text` NOT NULL(Hard Rule 1) 미접촉. 라이선스 의무 변동 0.
- 변환은 해상도 축소·포맷 변경일 뿐 저작물 내용 변경이 아님(파생물 아님 — 단순 썸네일화).

## 롤백
- STEP 2에서 UPDATE SQL 산출 **직전에** 현재 cover_url 전량을
  `scratchpad/bookdash_cover_url_backup.csv`(컬럼: id, source_id, old_cover_url) 및
  되돌림 UPDATE SQL(`*_rollback.sql`)로 보존한다.
- 롤백 = 백업의 old_cover_url로 `books.cover_url`을 되돌리는 UPDATE를 팀장이 실행.
- Storage 사본은 그대로 두어도 무방(참조만 끊어짐). 필요 시 버킷 객체 별도 삭제.

## 비고
- Book Dash 표지는 bookdash.org가 우선이고 없으면 CloudFront 폴백 → **어느 쪽이든 원본을
  받아 변환**한다(변환 루틴은 DB의 현재 cover_url을 입력으로 사용해 출처 무관 처리).
- next/image `remotePatterns`(next.config.js)에는 신규 Supabase Storage 호스트 등록이
  필요할 수 있다(현재 미등록). 코드 변경 여부는 STEP 2에서 점검·반영.
- 본문(content_type='asb_native', AsbReader)은 CloudFront 핫링크 이미지를 한 면씩
  점진 로딩한다(±인접 프리페치). 표지와 별개 트랙이며 본 ADR 범위 외.

## Consequences
- 표지가 우리 Storage(서울)에서 작은 WebP(예상 수십~수백 KB)로 서빙 → 첫 노출 지연이
  origin 속도(1.4s TTFB)에서 분리되어 `/showcase` 검수 체감 대폭 개선 예상.
- cover_url만 바뀌고 원본·어트리뷰션 무변동이라 라이선스·법적 리스크 0.
- 이관 후 origin(bookdash.org/CloudFront) 표지 가용성 변동에 무관해짐(우리 사본 의존).
- 후속: GDL·기타 출처 표지도 동일 패턴 확장 검토 가능(본 회차는 Book Dash 한정).
