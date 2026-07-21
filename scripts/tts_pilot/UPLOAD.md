# TTS 오디오 Storage 업로드 절차 (ADR-0052 Phase E · Unit 3 / ADR-0034 결정 ②③)

시범 12권의 로컬 mp3+marks를 Supabase Storage `book-audio` 버킷에 업로드하는 절차다.
**업로드(Storage 쓰기)는 팀장 실행 영역**이다 — 워커는 Storage secret key를 수령하지 않는다(Hard Rule 6).

---

## 1. 대상·산출물

- 대상: 시범 12권(`lib/admin/review/pilot-cohort.ts`). confirmed 텍스트로 생성 완료.
- 로컬 산출물(생성 완료, 재현 가능): `out/audio/{slug}_p{N}_Ruth_r78.mp3` / `.marks.json`,
  권별 매니페스트 `out/{slug}_Ruth_r78.tts.json`. 12권 = mp3 138 + marks 138(빈텍스트 면 제외).

## 2. 키·경로·헤더 규약 (ADR-0034 결정 ②③ 계승)

- 버킷: **`book-audio`** (기존 44권용으로 이미 존재 — 신규 생성 불요).
- 키: **`book-audio/{book_key}/pNN.mp3`** · **`.../pNN.marks.json`**
  - `{book_key} = book_dash-{slug}`. 우리 12권은 `books.source_id = slug`이므로
    `{source_platform}-{source_id}` 규약이 `book_dash-{slug}`로 귀결된다
    (이미지 경로 `book-images/book_dash-{slug}/NN.jpg`와 평행 정합).
  - `NN = page - 1` (0-based), **2자리 zero-pad**(`p00`, `p01` …). DB `page_index`와 1:1.
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
   → 12권 × `book_dash-{slug}/pNN.mp3`·`.marks.json` 키 목록과 로컬 파일 존재 여부 확인.
3. **업로드**:
   ```bash
   python scripts/tts_pilot/upload_tts_pilot12.py            # 전체 12권
   python scripts/tts_pilot/upload_tts_pilot12.py --only a-trip-to-the-tap,amahle-wants-to-help,baby-babble  # 대표 우선
   ```
   - 같은 키 존재 시 기본 skip(`--overwrite`로 덮어쓰기).
4. **확인**: 업로더가 각 책 `p00.mp3` 공개 URL을 GET해 `200 + Content-Type`을 출력한다.

## 5. 업로드 후속 (Phase F · Unit 5, 별도 처리)

- `book_audio` INSERT SQL(kind='page' × 각 면, `voice='Ruth' engine='neural' rate=78`,
  `audio_path`=업로드 키, `duration_ms`=마지막 mark 프록시) + `books.has_audio=true` 반영.
- 워커가 SQL 초안 산출 → **팀장이 SQL Editor에서 실행**(DB 쓰기 = 팀장 영역).
- 이 단계에서 12권 `book_id`가 필요하므로, Unit 5 착수 시 book_id 매핑을 함께 확정한다.
