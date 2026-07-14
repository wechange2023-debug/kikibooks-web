# 전체 상태 READ-ONLY 점검 보고서 (STEP 1 · state-audit)

> 작성: 2026-07-14 워커 세션 · HEAD `e6e1483` (main = origin/main)
> 방법: 파일 읽기 + DB/Storage **읽기전용 실측**(`.env.local` 자격 상속, SELECT·list만 — 기존
> `verify_*.py` 패턴, 파일 쓰기·DB 쓰기·Storage 쓰기 0건). 본 보고서가 유일한 쓰기 산출물.
> 판단·결정 없음 — 사실만 기록. 판정 필요 항목은 '확인필요'로 표기.

---

## 1. ADR 전수 목록 (44건 실측)

`docs/adr/*.md` 44건 (0001~0044 결번 없음). 상태는 각 파일 원문 기준.

| ADR | 제목(요약) | 상태 | 신규 파이프라인 기준 판정 |
|---|---|---|---|
| 0001 | 기술 스택 | Accepted | 유효 |
| 0002 | 디자인 시스템 | Accepted | 유효 |
| 0003 | Supabase 신 API 키 | Accepted | 유효 |
| 0004 | source_platform 화이트리스트 | Accepted (+Amd Accepted) | 유효 |
| 0005 | Book Dash 동기화(meta.yml) | Accepted | 유효 |
| 0006 | 베타 언어 영어 단일 | Accepted | 유효 |
| 0007 | GDL 동기화 | Accepted | 유효 |
| 0008 | 베타 목표 900권 | Accepted | 확인필요 — "Book Dash 200여 권 정예 서비스" 방향과 목표 수치의 관계 재정의 필요 가능 |
| 0009 | 인증 아키텍처 | Accepted | 유효 |
| 0010 | SMTP 이연 | Accepted → Resolved | 유효(종결) |
| 0011 | 온보딩 플로우 | Accepted | 유효 |
| 0012 | 랜딩 정적 구현 | Accepted | 유효 |
| 0013 | 표지 어트리뷰션 정책 | Accepted | 유효 |
| 0014 | GDL 표지 + BD 404 차단 | Accepted | 유효 |
| 0015 | Screen 02 카테고리 | Accepted | 유효 |
| 0016 | AttributionBox 5요소 | Accepted | 유효 |
| 0017 | 책 뷰어 아키텍처(iframe 단일 경로) | Accepted + **Amd#1 Proposed**(D8 재조정, 승인 전 착수 금지 → 0018 참조) | **뒤집힘 진행 중** — book_dash 군은 ADR-0035가 대체 예정(0035 D1에 명시, 전환 전 병존) |
| 0018 | 완독 보상 + 라이브러리 | Accepted + **Amd#1 Proposed**(2026-07-01) | 유효(Amd#1 승인 대기) |
| 0019 | Admin 시스템 | Accepted | 유효 — 단 검수 화면은 범위에 없음(§8-b 참조) |
| 0020 | Commit Footer 0건 | Accepted | 유효 |
| 0021 | (reader) route group | Accepted | 유효 |
| 0022 | 콘텐츠 소스 확장 | Accepted + **Amd Proposed** | 유효 |
| 0023 | AI 기능·TTS 정책 | Accepted + Amd#1 Accepted(저장=Storage) | 유효 — 단 **캐릭터별 음성 옵션은 미기재**(공백, §8-(3)) |
| 0024 | 회원 마이페이지 | **Proposed** | 유효(별건) |
| 0025 | ASb 콘텐츠 적재 | Accepted (+Amd 다수 Accepted) | 유효 |
| 0026 | ASb 품질 필터 | Accepted | 유효 |
| 0027 | BD 신간 152권 CloudFront 이미지 시퀀스 | **Proposed** | **뒤집힘 의심** — 핫링크·무복사 정책이 "이미지 DB저장 154 확장"과 상반(0036 §4.2도 상반 명시). 통합/폐기 이월 상태 |
| 0028 | Bloom 무료 다운로드 | Proposed | 유효(별건) |
| 0029 | HTML 엔티티 디코딩 | Proposed | 유효(별건) |
| 0030 | Bloom 1,060 배치 정책 | Accepted | 유효(별건) |
| 0031 | Bloom dedup2 회수 | Accepted | 유효(별건) |
| 0032 | BD 표지 Storage 이관 | Accepted | 유효 |
| 0033 | 카탈로그 캐싱(P0-1) | Accepted | 유효 — has_audio SELECT 추가 시 캐시 무효화 경로 고려 필요(사실 기록) |
| 0034 | TTS 저장 구조(book_audio·book-audio) | Accepted + Amd#1 Accepted(kind) | 유효 — 신규 154권도 이 구조 계승 대상 |
| 0035 | BD 자체 뷰어 전환 | Accepted. Amd#1(일부 Amd#2로 대체) · **Amd#2 Proposed**(E1·E2는 Amd#3로 무효, E3·E4 유효) · Amd#3(K1 — **A안 확정·C안 폐기**) | 유효 — 신규 계획의 뷰어 뼈대. Amendment 체인이 3겹이라 유효 조항 정리본 필요(확인필요) |
| 0036 | BD 이미지 저장(book-images) | Accepted + Amd#1 Accepted(39권 정정) + **Amd#2 Proposed**(cover-only 10·결손 15 지위) | 유효 — 단 적용 범위가 "html 54권 코호트"라 **154권 WP판 확장은 미규정**(공백, §8-(2)) |
| 0037 | cron is_active 불변 | Accepted | 유효 — "사람이 공개 관리" 원칙이 신규 상태흐름의 '서비스 ON'과 정합 |
| 0038 | 콘텐츠 큐레이션(소량 정예·Serviceable 34권) | **Proposed** (팀장 승인 대기) | **충돌 의심** — "소수 정예" 전제가 팀장 결정 H1(전권 서비스, 0035 Amd#2 인용)·신규 계획 (1) "200여 권"과 긴장. 수치(§2 실측)는 여전히 유효 |
| 0039 | OCR 초벌 + 사람 검수 | **Proposed** | **부분 재검토 필요** — "초벌은 사람 검수 후 확정" 원칙은 신규 계획과 정확히 일치. 단 초벌 **소스가 tesseract OCR → PDF harvest v1(ADR-0042·0043)로 이동**한 것으로 보임 → OCR 트랙의 현재 지위 확인필요 |
| 0040 | gh 계정 pre-push 훅 | Accepted | 유효 |
| 0041 | v1/v2 일치도 보조신호 강등 | Accepted | 유효 |
| 0042 | 154권 순회 게이트 사전등록 | Accepted (사전등록 — §5 agree 임계값은 실행 확정 대기) | 유효 |
| 0043 | 정본 텍스트 v1 채택 | Accepted (**잠정** — lock은 Prong-1 기계검증 + Prong-2 사람검증 후 확정) | 유효 — "사람검증" Prong-2가 신규 관리자 검수와 겹침(통합 여부 확인필요) |
| 0044 | 면내 읽기순서 교정 | **Proposed** (구현·수식은 다음 단계) | 유효 — 신규 계획의 초벌 품질 직결 |

---

## 2. 뷰어 구현 실측

**파일 구조** (`app/(reader)/book/[id]/read/page.tsx` — Server Component, content_type 분기):

| content_type | 컴포넌트 | 렌더 방식 |
|---|---|---|
| `html` (book_dash 54권 등) | `components/book/html-reader.tsx` | **외부 GH Pages cross-origin iframe** — 부모가 내부 텍스트 접근 불가(0035 §1) |
| `asb_native` (ASb) | `components/book/asb-reader.tsx` | 자체 렌더 — .txt fetch → parseAsbText → 면(face) 배열 |
| epub·h5p·pdf | (골격) | 미지원 안내 + 원본 링크 |

**AsbReader 실측** (asb-reader.tsx 전문 확인):
- **이미지 위 + 텍스트 아래** 구조 있음(A안과 동일 골격 — 이미지 `object-contain` + 아래 `<p>` 텍스트).
- 페이지 넘김: 이전/다음 버튼 + 키보드 ←→ + 터치 스와이프. **면 단위 넘김(세로 스크롤 아님)**.
- **오디오 재생 코드 0건. TTS 조작버튼(자동재생·다시재생) 0건. 단어 하이라이트 0건.**
  `<audio>`·marks 참조·book_audio 조회 전부 부재.
- **book_dash 자체 뷰어(ADR-0035 대상)는 코드 0줄** — 설계(ADR-0035 Accepted)만 존재, 현행
  book_dash는 여전히 HtmlReader iframe.

---

## 3. DB 스키마 실측 (라이브 조회 — SELECT * limit 1로 실컬럼 열거)

**books (19컬럼 실측)**: id, source_platform, source_id, title, cover_url, content_url,
content_type, language, level, age_min, age_max, license, author, illustrator, original_url,
attribution_text, is_active, synced_at, **has_audio**
(001 마이그레이션 17컬럼 + ADR-0034의 has_audio 추가분과 정합. content_type·source_platform
CHECK는 003~005 마이그레이션 + ADR로 확장됨.)

**book_audio (11컬럼 실측)**: id, book_id, page_index, audio_path, marks_path, voice, engine,
rate, duration_ms, created_at, **kind** (ADR-0034 + Amd#1과 정합. UNIQUE (book_id, kind,
page_index, voice))

**신규 계획이 필요로 하는 컬럼의 존재 여부 — 전부 없음**:

| 필요 항목 | 실측 |
|---|---|
| 검수 상태(추출→검수중→검수완료…) | **없음** (books·book_audio 어디에도 상태 컬럼 0건) |
| 검수·수정된 지문(확정 텍스트) 저장 | **없음** (DB에 본문 텍스트 테이블 자체가 없음 — 텍스트는 로컬 JSON뿐) |
| 검수자·확정 일시 | **없음** (`docs/intent/ocr-review-tool-requirements.md` §5도 "현 스키마에 없음" 명시) |
| 캐릭터-대사 매핑 | **없음** (컬럼·테이블 0건) |

---

## 4. Storage 실측 (list 조회만)

| 버킷 | 실측 | 기대치 대비 | 키 네이밍 |
|---|---|---|---|
| `book-images` | 루트 폴더 **49** (전부 `book_dash-{UUID}`) = **본문 보유 39권**(508객체) + **cover-only 10** | **기대 "54권"과 다름 — 단 문서화된 원인 있음**: 결손 15권 중 10권은 표지만 업로드, 5권은 전무 (ADR-0036 Amd#1·#2 실측과 정확 일치) | `book_dash-{UUID}/01.jpg…NN.jpg`(1-based 2자리) + `cover.jpg` — 샘플 폴더 13파일 확인 |
| `book-audio` | 루트 폴더 **44** (전부 `book_dash-{UUID}`) | 기대 44권 **일치** | `book_dash-{UUID}/p00.mp3 + p00.marks.json`(0-based 2자리) + `cover.mp3 + cover.marks.json` — 샘플 폴더 26파일(13쌍) 확인 |

접두사 주의(기록): 커버 버킷(`book-covers`)만 `bookdash-`(밑줄 없음), 이미지·오디오는
`book_dash-`(밑줄) — 통일은 후속 카드로 이월된 상태(ADR-0034·0036).

---

## 5. 기존 44권 TTS 현황 (라이브 조회)

- `book_audio` 총 **574행** = kind `page` **530** + `cover` **44** · distinct book **44권**
  → 핸드오프(2026-07-07)의 기대치 574/530/44와 **완전 일치** = step7·step8 팀장 SQL 실행 확인됨.
- `books.has_audio = true` = **44권** (전부 `book_dash`).
- mp3 실존: 버킷 44 프리픽스 + 샘플 폴더 pNN.mp3/marks 쌍 확인(§4). 스펙: Ruth · neural · rate 78.
- 참고: 44권 중 **이미지 보유 교집합은 34권**(Serviceable), B집합 5권은 로컬 오디오만 있고
  미업로드(ADR-0038 §4·§5 — 44 = 정예 39 중 34 + 결손 10).

부수 실측(출처별, 2026-07-14): book_dash 활성 206/비활성 3 · african_storybook 2,160/590 ·
bloom 440/23 · gdl 851/0 — ADR-0038 §2 수치와 일치(gdl 카나리아 원복 확인됨).

---

## 6. getBookById / has_audio

`lib/book/detail.ts:126` SELECT 실측 (17컬럼):
`id, title, author, illustrator, cover_url, content_url, content_type, original_url, license,
attribution_text, source_platform, source_id, level, age_min, age_max, language, is_active`

- **has_audio 미포함** (ADR-0035 Amd#1 A6 그대로 — D6 미구현 상태 지속).
- `source_id`·`source_platform`은 **포함** (0036 §5-3 정정과 일치).
- 참고: unstable_cache(`books-catalog` 태그, 1h) 경유 — SELECT 확장 시 캐시 경로도 함께 영향.

---

## 7. staging 스크립트 is_active 하드코딩 (라인 실측)

| 파일 | 라인 | 원문 |
|---|---|---|
| `scripts/sync_asb.py` | **312** | `"is_active": False,  # ★ staging (Amd#3 A6) …` |
| `scripts/sync_bloom.py` | **906** | `"is_active": False,  # ★ 스테이징 — 검수 후 별도 단계에서 공개` |
| `scripts/sync_book_dash_v2.py` | **704** | `"is_active": False,  # 검수 전 스테이징(--inactive, ASb 정책 정합)` |

→ 참고치(312/906/704)와 **전부 일치**. (구형 `sync_book_dash.py`·`sync_gdl.py`는 is_active
미설정 — 신규 행 DB DEFAULT TRUE, ADR-0037 D1·D2.)

---

## 8. 팀장 확정 5방향 대비 공백/충돌표

| 방향 | 판정 | 근거 |
|---|---|---|
| (1) 서비스=BD 200여 권, 하이라이트·TTS=신규154+기존44 | **부분 있음 + 충돌 1** | 모집단 206 활성 실측 있음. 154권 초벌 텍스트 `out_fixed_154` 커밋됨(있음). 154권 TTS·marks **공백**. **충돌**: ADR-0038(Proposed)의 "소수 정예·Serviceable 34" 프레임이 전권 서비스 방향과 긴장 → 개정/폐기 판단 필요 |
| (2) 뷰어=이미지 아래 자막·이미지 DB저장 54→154·세로스크롤 금지·TTS 버튼 | **설계 있음 / 구현 공백** | A안 확정 있음(0035 Amd#3)·이미지 저장 스키마 있음(0036, 39권 업로드 완료). **공백**: ① book_dash 자체 뷰어 코드 0줄 ② TTS 조작버튼 0건 ③ **154권 WP판 이미지 저장 미규정**(0036 적용 범위 = html 54권 한정; 기존 버킷 39권은 GH 무텍스트판 — WP판과 이원화 쟁점 E3 미결) ④ ADR-0027(핫링크)과 정책 **충돌** 미해소 |
| (3) TTS 기본 1인 / 옵션 캐릭터별 / 대사·나레이션 따옴표 초벌+사람확인 | **1인만 있음, 나머지 공백** | 1인(Ruth) 파이프라인 실증 완료. **공백**: 캐릭터별 음성(ADR-0023에 미기재) · 따옴표 기반 대사/화자 분리 초벌 코드 0건(scripts 전수 grep — 따옴표 처리는 정렬·정규화 용도뿐) · 캐릭터-대사 DB 매핑 0건 |
| (4) 기존 44권 Ruth 단일 유지 | **이미 있음** | §5 — 574행·44 프리픽스·has_audio 44 실측 정합. book_audio UNIQUE에 voice 포함이라 향후 멀티보이스와도 공존 가능 |
| (5) 사용자화면 TTS 아이콘(has_audio 노출) | **공백** | 컬럼은 존재+44권 true이나, getBookById SELECT 미포함(§6)·카탈로그 조회·카드 UI 어디에도 has_audio 참조 0건 |

**오케스트레이터 공백 5종**:

| # | 항목 | 실측 |
|---|---|---|
| a | marks.json 생성 단계 | **44권 경로만 있음**(`tts_pilot/generate_tts.py` — Polly word marks). **154권 경로 공백** — 검수 확정본이 기존 TTS 입력 스키마(`[{page,image_url,text}]`)와 호환돼야 한다는 문서 전제만 존재(intent/ocr-review-tool-requirements §5) |
| b | 검수·수정·상태·캐릭터매핑 스키마 | **전부 공백**(§3). 요구사항 문서(intent/ocr-review-tool-requirements)가 필요 필드를 이미 도출해 둠(면 단위 상태·검수 일시·검수자) — 스키마 ADR은 미작성 |
| c | 책별 상태흐름(추출→검수중→검수완료→TTS완료→서비스ON) 추적 | **공백**. 존재하는 것: `books.is_active`(최종 ON만) · ocr.json의 파일 레벨 `status:"raw_unreviewed"` · tasks/_index.json(페이즈 레벨, 책 단위 아님). 중간 단계 추적 장치 0건 |
| d | 캐릭터-대사 자동초벌 | **공백**(코드 0건 — (3) 참조) |
| e | 44권-신규 기준 일관성 | **불일치 요소 4건 실측**: ① 텍스트 원천 이원(44=GH HTML 추출 vs 154=PDF harvest v1) — 표기 규약(curly apostrophe 등) 통일 필요(요구사항 §1-6) ② 이미지 원천 이원(기존 버킷 39=GH 무텍스트판 vs 154=WP baked-in판, E3 미결) ③ 44권은 "무검수 확정"(원본 HTML 신뢰) vs 신규는 사람 검수 — 기존 44권의 검수 이력 표현 방법 미결 ④ 오디오 키(0-based pNN)·book_audio 구조는 공통 적용 가능(일관) |

---

## 9. 미결안건 수거 (코드·문서에 남아있는 형태)

**Proposed/승인 대기 ADR·Amendment**: 0018 Amd#1 · 0022 Amd · 0024 · 0027 · 0028 · 0029 ·
0035 Amd#2(E3·E4만 유효) · 0036 Amd#2 · 0038 · 0039 · 0044. 그리고 0042 §5 agree 임계값
실행 확정 대기, 0043 lock(Prong-2 사람검증) 대기.

**문서에 명시된 이월 트랙**:
- B집합 5권 오디오 업로드 + has_audio 반영 = 즉시 확장 여력(0038 §5, 뷰어 전제조건).
- 결손 15권 지위(WP 15/15 생존 — baked-in 수용 여부) · cover-only 폴더 10개 처분(0036 Amd#2).
- 커버 키 접두사 통일(`bookdash-` vs `book_dash-`) 후속 카드(0034·0036).
- step3c 옛 표지 URL 슬러그키 3권 읽기전용 점검(2026-07-07 핸드오프 미결).
- drift 3권(구·신 slug 이중화, ADR-0037 D6).
- ASb 트랙 잔여: scan 스크립트 커밋·표지 폴백(2026-06-18 핸드오프).
- ADR-0039 D3: CC BY 4.0 전문 확인 1회 권장(로컬 사본 없음).

**미커밋/로컬 잔존물**:
- `scripts/tts_pilot/HANDOFF.md`(?? — 2026-07-03 구버전 인계 메모, 의도적 미커밋 유지) ·
  `.claude/settings.local.json`(M).
- pdf_harvest 중간재료(?? — 재생성 가능): `out_v1/`, `out_v1_154/`, `out_fixed_14/`,
  `_154_state.json`, `_v1_154_state.json`, `population_pilot10.txt`.
  ⚠️ 세션 복원 지시서 목록과 차이: `out_coords_154/`·`out_154/`는 **커밋돼 있고**(untracked
  아님), 목록에 없던 `out_fixed_14/`가 untracked로 존재.
- PDF 캐시 56파일(시스템 임시 경로 — OS 정리로 소실 가능, 소실 시 재다운로드 권당 1 GET,
  `pdf_harvest/RESUME.md`).
- `pdf_harvest/RESUME.md`는 2026-07-10 시점 메모라 **일부 낡음**(157권 순회 "미착수"로 기록
  → 실제로는 이후 154권 순회·교정 완료, `out_fixed_154` 커밋 e6e1483까지 진행됨).
- `.gitignore` 전역 `out/` 규칙 때문에 pdf_harvest 신규 산출물은 `git add -f` 필요 —
  예외 추가 여부 오케스트레이터 결정 대기(RESUME.md).

**TODO/FIXME 주석**: scripts/pdf_harvest 내 0건. 관리자(app/admin)는 대시보드·books·users
3화면만 존재 — 검수 화면 없음(ADR-0019 범위 외).

*보고서 끝.*
