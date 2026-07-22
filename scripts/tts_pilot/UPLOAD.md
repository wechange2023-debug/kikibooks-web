# TTS 오디오 Storage 업로드 절차 (ADR-0052 Phase E · Unit 3 / ADR-0034 결정 ②③ + Amd#2)

시범 12권의 로컬 mp3+marks를 Supabase Storage `book-audio` 버킷에 업로드하는 절차다.
**업로드(Storage 쓰기)는 팀장 실행 영역**이다 — 워커는 Storage secret key를 수령하지 않는다(Hard Rule 6).

> 본 문서는 **Danielle long-form 배치**(ADR-0052 Amendment #2) 기준이다.
> 구 Ruth neural 배치(`out/audio/*_Ruth_r78.*`)는 이력 보존용이며 업로드 대상이 아니다.

---

## 1. 대상·산출물

- 대상: 시범 12권(`lib/admin/review/pilot-cohort.ts`). confirmed 텍스트로 생성 완료.
- 로컬 산출물(생성 완료, 재현 가능):
  - 오디오·마크: **`out/audio_danielle/{slug}/pNN.mp3`** / **`pNN.marks.json`**
  - 권별 매니페스트: **`out/audio_danielle/{slug}/_manifest.json`**
  - 배치 리포트: `out/_tts_batch_danielle_report.json`
  - 12권 = **mp3 138 + marks 138 = 276개 / 약 7.5 MB**(빈텍스트 면 30 제외).
- 업로드 **대상 아님**: `out/audio_danielle/_raw/`(감속 전 원속도 원본, 디버그 보존용),
  `_manifest.json`, `out/audio/`(구 Ruth 배치).

## 2. 키·경로·헤더 규약 (ADR-0034 결정 ②③ + **Amendment #2**)

- 버킷: **`book-audio`** (기존 44권용으로 이미 존재 — 신규 생성 불요).
- 키: **`book-audio/{book_key}/{voice}/pNN.mp3`** · **`.../{voice}/pNN.marks.json`**
  - `{book_key} = book_dash-{slug}`. 우리 12권은 `books.source_id = slug`이므로
    `{source_platform}-{source_id}` 규약이 `book_dash-{slug}`로 귀결된다
    (이미지 경로 `book-images/book_dash-{slug}/NN.jpg`와 평행 정합).
  - `{voice} = danielle` — **성우 층위**(ADR-0034 Amd#2). Storage 폴더명과 DB `book_audio.voice`
    값이 동일한 소문자여야 한다.
  - `NN = page_index + 1` (**1-based**, `p01`부터), **2자리 zero-pad**(`p01`, `p02` …).
    ⚠️ ADR-0034 Amd#2로 **0-based(p00~)에서 개정**됨. 이미지 파일명 `NN.jpg`·뷰어 페이지와 단일 축.
    DB `page_index` 컬럼은 **계속 0-based**이므로 `NN = page_index + 1` 관계다(의도된 차이).
  - 구 44권(`{book_key}/pNN.*`, 성우 층위 없음·0-based)은 **무수정 이력 보존**. 성우 폴더 유무로
    두 규약을 구분한다.
- 예시:
  ```
  book-audio/book_dash-baby-babble/danielle/p01.mp3
  book-audio/book_dash-baby-babble/danielle/p01.marks.json
  ```
- 헤더(확장자 자동추측 금지, 명시 지정):
  - mp3 → `Content-Type: audio/mpeg`
  - marks.json → `Content-Type: application/json; charset=utf-8`
  - 공통 → `Cache-Control: public, max-age=31536000, immutable`

## 3. 업로더 처리 방안 — 비교와 권고

기존 `upload_audio.py`는 코호트를 `scratchpad/tts_recon_49.csv`(구 44권, `source_id=UUID`)에서만
읽어 우리 12권(`source_id=slug`)을 태우지 못한다. 두 방안을 비교한다.

| 항목 | A. 기존 `upload_audio.py` 개조 | **B. 신규 경량 업로더 (권고)** |
|---|---|---|
| 변경 범위 | `--recon-csv` 인자화 + 12권용 CSV 별도 작성 | 신규 `upload_tts_pilot12.py`(~80줄) |
| 재사용 | 헤더·env키안전·중복스킵 로직 유지 | 동 로직 소량 이식(헤더 상수·업로드 루프) |
| 코호트 의미 | 한 파일에 UUID(구44)·slug(신12) **이중 혼재** → 혼동·회귀 위험 | **단일 코호트·단일 의미**(source_id=slug)로 명료 |
| 기존 44권 도구 | **건드림**(회귀 위험) | **무접촉**(회귀 0) |
| 잔존 baggage | `EXCLUDE`·`DB_SLUG_SOURCE_ID`·표지처리 등 구코호트 상수 잔존 | 없음 |
| 단순성 | 중 | **상** |

**권고: B (신규 경량 업로더).** 12권 업로드가 목적이고 "단순한 쪽 우선" 원칙에 부합한다.
기존 44권 업로더를 건드리지 않아 회귀 위험이 0이고, `source_id` 의미가 slug 하나로 고정돼
읽기 쉽다. A는 헤더·안전 로직을 재사용하지만 두 코호트 의미가 한 파일에 섞여 오히려 복잡해진다.

> ✅ **업로더(B) `upload_tts_pilot12.py` 작성 완료**(2026-07-22, dry-run 검증 통과 — 12권 276개 항목·로컬 결손 0). 아래 4~5를 이 도구로 수행한다.
> ✅ **Danielle 구조 반영 완료**(2026-07-22): 매니페스트 `out/audio_danielle/{slug}/_manifest.json`,
> 로컬 `pNN.mp3`, 키 `book_dash-{slug}/danielle/pNN.*`(1-based). dry-run 재검증 276개 통과.

## 4. 실행 흐름 (팀장)

**실행 순서 요약**: ① 자격증명 등록 → ② `--dry-run`으로 키 확인 → ③ 업로드 → ④ 공개 URL 200 확인.

1. **팀장**: 실행 직전 PowerShell 창에서 자격증명 등록(자식 프로세스 상속, `.env` 만들지 말 것):
   ```powershell
   $env:SUPABASE_URL = "https://<프로젝트>.supabase.co"
   $env:SUPABASE_SECRET_KEY = "sb_secret_..."   # service_role/secret 키. 절대 파일·로그에 남기지 말 것
   ```
2. **dry-run**(무비용·자격 불요, 키 경로만 출력):
   ```bash
   python scripts/tts_pilot/upload_tts_pilot12.py --dry-run
   ```
   → 12권 × `book_dash-{slug}/danielle/pNN.mp3`·`.marks.json` 키 목록(276개)과 로컬 파일 존재 여부 확인.
3. **업로드**:
   ```bash
   python scripts/tts_pilot/upload_tts_pilot12.py            # 전체 12권
   python scripts/tts_pilot/upload_tts_pilot12.py --only a-trip-to-the-tap,amahle-wants-to-help,baby-babble  # 대표 우선
   ```
   - 같은 키 존재 시 기본 skip(`--overwrite`로 덮어쓰기).
4. **확인**: 업로더가 각 책 **`p01.mp3`** 공개 URL을 GET해 `200 + Content-Type`을 출력한다.

## 5. 업로드 후속 (Phase F · Unit 5, 별도 처리)

- `book_audio` INSERT SQL + `books.has_audio=true` + `book_review.status` `confirmed→tts_done` 반영.
- **SQL 초안 작성 완료**: `docs/sql/pilot12_danielle_load.sql` (138행 INSERT + 검증 SELECT,
  기본 `ROLLBACK;` — 검증 통과 후 팀장이 `COMMIT;`으로 바꿔 실행).
- 컬럼 값(ADR-0052 Amd#2 / ADR-0034 Amd#2):
  - `kind='page'`, `page_index` = **0-based**(= 파일명 `NN` − 1)
  - `audio_path` = 업로드 키(버킷명 미포함), `marks_path` = 동 marks 키
  - `voice='danielle'` (Storage 성우 폴더명과 동일 소문자)
  - `engine='long-form'`, `rate=85`
    — ※ SSML prosody 값이 아니라 **ffmpeg `atempo=0.85`로 얻은 실효 속도**. SSML 감속은 울림 때문에 금지.
  - `duration_ms` = 감속 후 mp3 **실측 길이**(ffmpeg 측정, 마크 프록시 아님)
- 생성 파라미터(참고): Amazon Polly **Danielle / long-form / 리전 `us-east-1`** (boto3 client 파라미터
  오버라이드, `~/.aws` 기본 리전 무변경) → 평문 합성 → `atempo=0.85` → marks `time × (1/0.85)`.
- **`book_id` 매핑은 확정됨**: 브리지 export `scripts/tts_pilot/in/book_text_export.json`의
  `book_id` 값 12건을 SQL 초안에 하드코딩 완료(대표 3권은 ADR-0052 D2 표와 교차검증 일치).
- 실행은 **팀장이 SQL Editor에서** 수행한다(DB 쓰기 = 팀장 영역, ADR-0052 D8).
