# Bloom 413 매니페스트 Storage 업로드 결과 (sync_bloom --upload-only)

> 실행 2026-06-30 · `python scripts/sync_bloom.py --upload-only --limit 1100 --recovery-ids scratchpad/bloom_recovery_ids.txt`
> Storage(book-manifests) 쓰기만 — DB upsert 0건(books 무변경).
> 원본 콘솔 로그는 .gitignore(*.log) 대상이라 미커밋: scratchpad/bloom_upload_run.log·bloom_upload_plan.log.

## 모드 신설: --upload-only (+ --plan-only)
- 회수 allowlist 주입 상태로 413(신규 281 + 회수 132) 후보를 run_execute와 **동일 게이트
  시퀀스**로 선별 → 각 건 index.htm 재fetch로 매니페스트 본문 재생성 → `upload_manifest`로
  `book-manifests/bloom-{source_id}.txt`에만 업로드.
- DB upsert/INSERT/UPDATE 0건. `--commit`·`--emit-sql`과 동시 사용 차단 가드.
- `--plan-only`: Storage 쓰기 0, 업로드 대상(source_id·content_url)만 출력(사전 점검).
- 기존 50건 source_id 가드 우선 → 기존 매니페스트(활성 27 포함) 미터치.

## 사전 점검(--plan-only) 결과
- 대상 413건 (신규 281 + 회수 132), 기존 50건 가드 skip=50(미포함).
- content_url·source_id가 `bloom_staging_insert.sql`과 **1:1 완전 일치**(차집합 0).

## 실제 업로드 결과
- **업로드 성공: 413 / 실패: 0** (재시도 불요).
- 기존 bloom source_id 50건 미터치(가드 skip=50).

## 표본 Public URL 검증 (HTTP 200)
| source_id | 비고 | 정찰 시 | 업로드 후 |
|---|---|---|---|
| bloom-2babed54… | I Can Climb (회수분) | 400 | **200** |
| bloom-09347bf9… | 정찰 시 미존재 | 400 | **200** |
| bloom-4b67554e… | Domestic animals | — | **200** |
| bloom-9ede074c… | — | — | **200** |
| bloom-45e294c6… | — | — | **200** |

- 본문 정합: asb-parser 포맷(`id`/`title`/`source:bloom`/`page_text` P1..) 정상.

## 후속
- 413건 매니페스트가 Storage에 존재 → `bloom_staging_insert.sql`(팀장 SQL Editor 실행)로
  books INSERT(is_active=false) 후, 인앱검수 통과분만 is_active=true 전환하면 실제 열람 가능.
- 413 명단(source_id)은 커밋된 `bloom_staging_insert.sql`·`bloom_recovery_ids.txt`가 정본.
