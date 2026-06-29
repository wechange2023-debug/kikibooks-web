# Bloom 742 적재 전 upsert 동작 확인 + 적재 계획 (읽기 전용)

> 작성 2026-06-29 · HEAD=79259a9 · `sync_bloom.py` grep 실측. **코드·DB 무변경.**
> 목표: 기존 books bloom 50건(활성 27 / 비활성 23, STEP26 큐레이션 완료) 보호.

## 1. upsert 동작 실측 (grep)

`upsert_book`(L908-916):
```python
client.table("books").upsert(payload, on_conflict="source_platform,source_id").execute()
```
- PostgREST upsert → `INSERT ... ON CONFLICT (source_platform, source_id) DO UPDATE SET <payload의 모든 컬럼>`.
- **DO NOTHING 아님. 일부 컬럼 아님 — payload에 담긴 전 컬럼을 덮어쓴다.**

`build_book_payload`(L877-892)가 담는 컬럼(=충돌 시 UPDATE 대상):
`source_platform, source_id, title, cover_url, content_url, content_type, language,
level, license, author, illustrator, original_url, attribution_text, is_active`
- `is_active`는 **하드코딩 `False`**(L891) — 스테이징 고정.
- payload에 **없는** 컬럼(`id`, `created_at`, `age_min`, `age_max` 등)은 **미변경(보존)**.

### ★ 핵심 판정 (코드 근거 yes/no)
**"기존 50건 source_id가 이번 배치에 있으면 그 행의 cover_url·is_active가 덮어써지는가?"**
- **upsert 도달 시: YES.** `cover_url`은 새 값으로 덮어쓰기, `is_active`는 **`False`로 덮어써짐**
  → 현재 활성 27건이 **비활성(미공개)으로 전환되는 회귀 위험**. STEP26 수동 큐레이션
  (cover_url·level)도 새 계산값으로 덮어쓰기.
- **단, upsert 도달 전 `run_execute`의 dedup2(L1005)가 차단**:
  `if _norm_title(res["title"]) in existing: skip`. `existing = fetch_existing_titles`
  = **전 books 정규화 title 집합**. 즉 **기존 책과 정규화 title이 일치하면 upsert 전에 skip**
  → 기존 행 미터치.
- **그러나 이 보호는 title 기반이지 source_id 기반이 아니다.** 누수 경로:
  ① D5 생존 판본의 title이 기존 DB 행 title과 정규화 후 다르면(판본/언어/공백 차이) → skip 안 됨 → **upsert 덮어쓰기 발생**.
  ② source_id가 같아도 title만으로 판단 → source_id 일치 보장 없음.
- **결론: 기존 50건 보호는 "title-dedup에 의존"하며 source_id 단위 보장은 없다.**
  안전 적재를 위해 **source_id 기반 명시 skip 추가 권장**(아래 [A]).

## 2. 배치 742 ∩ 기존 50건 (교집합)

- 이번 배치 적재가능 = **distinct source_id 742** (`scratchpad/bloom_742_source_ids.txt`).
- 워커 오프라인 근사(batch-50 기준): **50건 교집합**. 단 **이는 근사** —
  실제 books 테이블의 bloom source_id와의 정확 대조는 **팀장 SQL 위임**(아래 §4).

## 3. 권장 적재 절차 (2안)

### [A] (★권장) source_id 기반 보호 후 적재 — 기존 50건 100% 미터치
- `run_execute`에 **기존 bloom source_id 조회 → 배치에서 제외(신규 source_id만 INSERT)** 단계 추가
  (title-dedup과 별개의 source_id 가드). 코드 1단 추가 = 다음 작업지시.
- 효과: 기존 50건(활성 27 포함)의 cover_url·is_active·level **절대 미변경**.
  신규(≈692건)만 `is_active=false` 스테이징 적재.
- 장점: title 의존 제거, 회귀 0. is_active 강제덮어쓰기 위험 원천 차단.

### [B] 현 코드(title-dedup) 적재 + 기존 50건 백업/복원
- 현 코드대로 실행(기존은 title-dedup로 대부분 skip)하되, **§1 누수(title 상이)** 대비
  적재 **전** 기존 50건 백업 → 적재 → 누수 발생분 복원.
- 단점: title 일치에 의존, 누수 시 활성 책 비활성화가 일시 발생, 백업/복원 운영 부담.

**→ 권장: [A].** 기존 50건을 코드 레벨에서 아예 안 건드리는 쪽이 안전(회귀 0).
[A] 채택 시에도 적재 전 §4 백업 SQL 1회 확보 권장(안전망).

## 4. 팀장 SQL (워커 DB 미접근 — Dashboard SQL Editor에서 직접 실행)

**(a) 기존 bloom 현황·교집합 정확 대조** — 아래 결과를 `bloom_742_source_ids.txt`와 대조:
```sql
SELECT source_id, is_active, level, left(cover_url, 60) AS cover
FROM books WHERE source_platform = 'bloom' ORDER BY is_active DESC, source_id;
```

**(b) 적재 전 백업(안전망, [A]·[B] 공통 권장)**:
```sql
CREATE TABLE IF NOT EXISTS bloom_pre0030_backup AS
SELECT * FROM books WHERE source_platform = 'bloom';
```

**(c) 공개 전환 — 신규 source_id만 활성화(기존 50건·비활성 23건 미터치)**:
적재 후, **신규로 INSERT된 source_id에만** `is_active=true`. 기존 50건(활성27/비활성23)은
손대지 않는다. "bloom 비활성 전체 공개"는 큐레이션 제외된 23건까지 공개하므로 **금지**.
```sql
-- 신규 source_id 목록(= bloom_742 − 기존50)을 명시 IN-list로 받아 활성화.
-- (기존 50 제외 목록은 (a) 결과와 742 파일 diff로 산출)
UPDATE books SET is_active = true
WHERE source_platform = 'bloom'
  AND is_active = false
  AND source_id IN ( /* 신규 source_id 목록 */ );
```

## 5. 산출물·다음 단계

- `scratchpad/bloom_742_source_ids.txt` — 742 distinct source_id(팀장 SQL 대조용).
- 다음 작업지시(코드 변경 승인 시): [A] source_id 가드 추가 → 표본 dry-run → 실적재.

## 제약 준수
- 읽기 전용. 코드·DB 무변경. upsert 동작은 grep 실측 단정.
- 기존 50건 교집합은 **팀장 SQL 위임**(워커 근사 50은 참고치).
