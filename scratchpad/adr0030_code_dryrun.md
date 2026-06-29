# ADR-0030 코드 적용 셀프 검증 (표본 dry-run, DB 미반영)

> 작성 2026-06-29 · HEAD(코드 적용 전 기준) 648df49 · 표본 = batch-50 전수.
> 실 파이프라인(`build_bloom_manifest`→`build_book_payload`)을 네트워크 포함 실행, **DB write 없음**.
> 검증 하네스(임시): temp scratchpad `dryrun_adr0030.py` — **코드 diff·커밋 미포함**.

## 변경 요약 (`sync_bloom.py` 단일 파일)

| 변경 | 위치 | 내용 |
|---|---|---|
| import | 상단 | `from urllib.parse import quote, unquote` 추가 |
| D1 | `_NONSTORY_TOPIC_TAGS` | Science 제거 + Dictionary 추가 → `{Math, Mathematics, Dictionary}`. 용도는 검수 플래그 그대로(자동제외·is_active 강제 없음) |
| D2 | `bloom_cover_url` | 200px 썸네일 → 첫 페이지 본문 이미지. `prefix(harvest base) + quote(unquote(filename))`. 폴백=coverImage200(방어적) + `res['cover_fallback']` 기록 |
| D3 | `bloom_level` 헬퍼 + `build_book_payload` | computedLevel:N → level 1:1(1~5), 부재·범위밖 시 NULL. payload에 `"level"` 추가 |

attribution.py·기타 sync 스크립트 무변경.

## 검증 결과 (표본 50권)

| 항목 | 결과 | 판정 |
|---|---|---|
| 표본 처리 | 50권 중 **49 적재가능 / 1 스킵** | — |
| 스킵 1건 | `ed9782f9` Timmi's dream — `index.htm fetch 실패`(S3 일시 오류; STEP26 통과책 → 네트워크 변동, 코드 무관) | 일시적 |
| 표지 HTTP 200 | **49/49** | ✅ |
| 표지 폴백(coverImage200) 발생 | **0건** | ✅ |
| 이중인코딩 `%2520`(또는 `%25`) | **0건** (49권 전수) | ✅ |
| 표지 해상도(width) | min 232 / **median 599** / max 1280 (구 200px 썸네일 대비 대폭 상향) | ✅ |
| 200px 이하 잔존 | **0건** | ✅ |
| level 부여 분포 | **L1=26 · L2=23 · NULL=0** (배치-50은 computedLevel 1\|2만) | ✅ |
| Science 제거 검증 | `How to Catch the Wind`(topic:Science 보유) → `flag_review_list` = **`[]`** | ✅ |

### 특이 케이스 — baseUrl 식별자 ≠ source_id (STEP26 'Let's go')
- `6f7c4247` (en: *Let's go*) 표지 = `…/bloomdigital%2fASP_124_lets_go_0_Page_02_Image_0001.jpg`,
  해상도 **719×754**. 표지 prefix가 source_id가 아니라 **harvester baseUrl 파생**
  (`harvest_bloomdigital_base`)임을 실측 확인 — 정상.

## 결론

- ADR-0030 D1·D2·D3 코드 적용이 표본에서 **전 항목 통과**.
  · 표지 고해상도 이식(median 200→599) + `%2520` 0건 + 폴백 0건.
  · level 1:1 부여(L1/L2만, NULL 0).
  · Science 제거로 양서 오검수 해제.
- 멱등 정규화 `quote(unquote())`로 이미 %-인코딩된 파일명(`Face%20cover.jpg` 등)이
  이중인코딩 없이 단일 인코딩 유지됨을 단위·표본 양면에서 확인.
- **후속(다음 지시)**: 전량 1,060권 dry-run. index.htm 일시 fetch 실패(1건 발생)는
  재시도/재실행으로 회복 가능하나, 전량 dry-run 산출물에 스킵 사유별 집계 권장.

## 제약 준수
- `sync_bloom.py` 외 코드 무변경. DB 접근/실적재 없음(표본 dry-run, manifest 합성·표지 GET만).
- 표지 URL 규칙·baseUrl 파생은 STEP26 검증 로직(`prefix + quote(unquote(filename))`) 준수.
