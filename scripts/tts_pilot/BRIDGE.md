# TTS 입력 브리지 절차 (ADR-0052 Phase E · Unit 2)

book_text(DB) → TTS 입력(`out/{slug}.json`) 변환 절차다.
워커는 DB에 직접 접근하지 않는다(ADR-0052 D3 A안). 아래 **STEP 1(SQL)은 팀장이 SQL Editor에서 직접 실행**하고,
**STEP 2(변환)는 워커/로컬에서 실행**한다.

---

## STEP 1 — 팀장: confirmed 12권 book_text export (Supabase SQL Editor)

아래 SQL을 실행하면 결과가 **한 행·한 셀(`export` 컬럼)** 로 나온다. 그 셀 값(JSON 배열)을 통째로 복사해
`scripts/tts_pilot/in/book_text_export.json` 파일로 저장한다(UTF-8). `in/` 폴더가 없으면 만든다.

```sql
select json_agg(t order by t.slug, t.page_index) as export
from (
  select b.source_id   as slug,
         b.id           as book_id,
         b.title        as title,
         r.status       as status,
         tx.page_index  as page_index,
         tx.text        as text
  from books b
  join book_review r on r.book_id = b.id
  join book_text  tx on tx.book_id = b.id
  where r.status in ('confirmed','tts_done')
    and b.source_id in (
      'a-day-out','a-trip-to-the-tap','a-very-busy-day','aaaaahhh-mmawe',
      'alexs-super-medicine','amahle-wants-to-help','ann-nem-oh-nee-finds-adventure',
      'auntie-bois-gift','baby-babble','baby-talk','babys-first-family-photo','banzis-busy-bees'
    )
) t;
```

- 조건: `status in ('confirmed','tts_done')` — 검수 확정본만 내보낸다(draft/in_review 제외).
- slug 목록 = 시범 12권 코호트(`lib/admin/review/pilot-cohort.ts`). 12권 전부 confirmed면 12권×페이지 행이 나온다.
- 이 export 파일은 **로컬 전용, 커밋하지 않는다**(SQL로 언제든 재생성). `git add`는 파일명 명시 원칙이라
  실수로 포함될 일은 없다.

---

## STEP 2 — 변환 실행 (build_tts_input.py)

export 저장 후 실행한다. **대표 3권을 먼저** 뽑아 빠르게 확보하고(ADR-0052 D2), 이어 전체 12권을 돌린다.

```bash
# (1) 대표 3권 우선
python scripts/tts_pilot/build_tts_input.py --rep-only

# (2) 전체 12권
python scripts/tts_pilot/build_tts_input.py
```

- 출력: `scripts/tts_pilot/out/{slug}.json` = `[{page, image_url, text}, ...]`
  (generate_tts.py가 그대로 읽는 형식. page = page_index+1, image_url = 검수 화면과 동일 canonical URL.)
- `image_url` base는 env `NEXT_PUBLIC_SUPABASE_URL`에서 읽는다. 없으면 storage 상대 키로 기록하고 경고한다
  (TTS 생성엔 무영향 — generate_tts.py는 text만 사용. 뷰어(Phase D) 통합 전까지 무방).
- 옵션: `--export <경로>` `--out-dir <경로>` `--slugs a,b,c` `--image-base <url>`.

---

## STEP 3 — 검증 요약 확인 (`out/_bridge_report.json`)

변환 시 콘솔과 `out/_bridge_report.json`에 권별 요약이 출력된다. **대표 3권은 아래 항목을 개별 확인**한다(지시서 §2-1).

| 필드 | 의미 | 기대값(대표 3권) |
|---|---|---|
| `found` | export에 해당 slug 행 존재 | `true` |
| `status` | book_review.status | `confirmed` |
| `pages` | 변환된 페이지 수 | 14 (SQL page_rows와 일치) |
| `empty_text_pages` | 빈 텍스트 페이지 번호(음성 스킵 대상) | 참고값(권당 소수) |
| `total_chars` | 본문 총 문자 수 | 0 초과 |
| `page_index_missing` | 0..max 사이 누락 page_index | **빈 배열 `[]` 여야 정상** |

- 콘솔에 `⚠status=...`(confirmed 아님) 또는 `⚠page_index 이상`(0 시작 아님·누락)이 뜨면 **원인 확인 전 TTS 생성 금지**.
- `[MISS] <slug>: export에 행 없음` = 해당 권이 아직 confirmed 아니거나 SQL 범위 밖. 팀장에게 상태 확인 요청.

---

## 다음(Unit 3, 별도 승인 후)

`out/{slug}.json` 확보 뒤 `generate_tts.py --slug <slug> --voice Ruth --rate 78 --natural`로 권별 mp3+marks 생성 →
Storage 업로드(팀장). 상세 절차는 Unit 3에서 정리한다.
