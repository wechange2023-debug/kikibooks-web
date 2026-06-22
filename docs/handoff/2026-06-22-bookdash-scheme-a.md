# Handoff — Book Dash Scheme A +21 적재 (2026-06-22)

## 현재 위치
- **HEAD=966aef1, ahead 0**. 실서비스 www.hellokiki.co.kr 정상.
- 워킹트리 미커밋 2개(작업무관): `.claude/settings.local.json`(M)·`scripts/check_asb_cover.sql`(untracked).

## 이번 세션 완료 — Book Dash Scheme A +21
- **콘텐츠**: book_dash **54→75**(Scheme A 21권 적재·공개, is_active=true). 라이브러리 활성 총계 = **3,087권** (ASb 2,161 + GDL 851 + Book Dash 75). PM 검증 SELECT 실측.
- **박제(ADR-0027)**: 본문 + Amd#1(매니페스트=Supabase Storage `book-manifests` 버킷, DB 직접저장 대안 폐기) + Amd#2(순증 dedup·버킷 경로) + Amd#3(Scheme A/B 분리 발견, drift 5건, A 21권 우선 적재로 범위 조정).
- **코드**:
  - `lib/book/asb-parser.ts` 이미지 필터에 `.jpg/.jpeg` 수용(edc85e7).
  - `scripts/sync_book_dash_v2.py`(966aef1, Scheme A 전용). 기존 `sync_book_dash.py`(54권 html 경로)는 무변경 보존.
- **방식**: WP API(`/wp/v2/books?languages=621`, 메타·표지) + 책페이지 HTML(작가 Writer/Illustrator 역할분리) + CloudFront(본문 페이지 이미지 핫링크) + 합성 `.txt` 매니페스트(`book-manifests/{slug}_en.txt` Public) + `content_type='asb_native'` 자체뷰어(AsbReader) 재사용. 스키마 변경 0.
- **적재 결과**: 21권 전부 Storage=OK / DB=OK / 17p, 부분상태·실패 0. 전부 is_active=false로 적재 후 검증 통과 → is_active=true 공개.
- **검증**: 2권 뷰어 육안 통과(the-window-seat, aaaaahhh-mmawe) — 18면(표지1+본문17) 카운트·작가·CC BY 어트리뷰션 박스 정상. 무결성 감사(attribution_text NULL / license≠cc-by-4-0) 0건.

## ★ 다음 후속 트랙 — Book Dash Scheme B 185권
- Book Dash 영어 206권 중 **대다수 185권은 Scheme B**: CloudFront `{slug}/e-book/en_english/images/{slug}_en_page{N}.jpg` → **404**.
- 본문이 `wp-content/uploads/{년}/{월}/{slug}_english_pdf-ebook_{date}_Page_{NN}.jpg` 류 **별도 경로**에 존재(zero-pad·날짜·년월폴더 변수). 예: `https://bookdash.org/wp-content/uploads/2014/07/come-back-cat_english_pdf-ebook_20140909_Page_01.jpg`.
- **할 일**: B 경로 공식(zero-pad·날짜·년월 변수) 확정 정찰 → ADR-0027 Amendment 추가 → `sync_book_dash_v2.py`에 B 분기(`#read-book` 정적 HTML 이미지 파싱 등) 추가 → 드라이런 → 실적재.
- **drift 3권**(`maddy-moonas-menagerie`/`mrs-penguins-perfect-palace`/`little-sock-and-the-tiny-creatures`): 기존 UUID source_id 행과 신규 slug 불일치 → 통합 시 중복정리 필요(현재는 skip, 기존 행 유지). WP부재 2건(`i-can-dress-myself`/`springloaded`)은 기존 행 유지.

## 미결 / 이연
- **Book Dash 로딩 속도**: 권당 ~52MB CloudFront 원본 핫링크 → 디자인 리뉴얼 트랙(t)에서 이미지 최적화. ADR-0027 D3 "베타 안정화 후 Supabase Storage 복사 전환" 미래옵션과 연결(별도 ADR).

## 외부 회신 대기
- StoryWeaver / Bloom 회신 시 최우선 처리.

## 로드맵 잔여
- ② 마이페이지 ③ TTS ④ AI 독후활동 ⑤ 디자인 리뉴얼. **PM이 Scheme B 계속 vs 마이페이지 전환 결정 예정.**
