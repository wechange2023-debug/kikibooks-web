# ADR-0025: African Storybook 콘텐츠 적재

**날짜** 2026-06-17
**상태** Proposed (ADR-0022 Amendment #2의 구현 ADR · 실제 적재는 본 ADR 확정 후 마이그레이션 ADR + 작업지시서)
**관련** `docs/adr/0022-content-source-expansion.md`(본 ADR은 그 Amendment #2의 구현 ADR), `claude.md` 2절 Hard Rule 3(CC BY-NC·BY-ND 적재 금지)·Hard Rule 8(스키마 변경 시 ADR 선행), `supabase/migrations/001_initial_schema.sql`(`source_platform` CHECK), `scripts/verify_licenses.py`(라이선스 게이트), `scripts/lib/attribution.py`(`PLATFORM_LABELS`), `docs/backlog.md` §7.4 (i)·(j)

---

## 1. 맥락 (Context)

- ADR-0022 Amendment #2가 **"측정 보류"로 남긴 ASb 영어×CC BY 정확권수를 박제 완료**했다(`docs/backlog.md` §7.4 (j), 커밋 `0c6bf9a`): **영어 전체 2,880 / 적격(NC·ND 제외) 2,795 / GDL 중복 33 차감 시 순증 상한 ≈ 2,762**.
- **적격 내역**: CC BY 4.0 = **2,537**, CC BY 3.0 = **258**. NC 변종 **4표기 합 85 = 배제**.
- **데이터 원천**: GitHub `global-asp/asp-raw-db` (default branch `master`), `data/<id>.txt` **평면 단일 txt**, 메타 헤더 **탭구분 key:value**(필드: `lang`/`lic`/`artist`/`author` 등). **`lic` 값은 SPDX 코드가 아닌 자연어 문자열**(예: `Creative Commons: Attribution 4.0`).
- **현재 스키마/스크립트 정합 이슈 2건(recon 발견)**:
  - (i) `source_platform` CHECK(`001_initial_schema.sql`)에 **ASb 값 부재**.
  - (ii) `verify_licenses.py` `ALLOWED_LICENSE_SLUGS`에 **`cc-by-3-0` 누락** → ASb CC BY 3.0 **258권**이 사후 감시에서 부적격 처리될 위험.

---

## 2. 결정 (Decision)

### D1 — `source_platform` 신규값 추가

`'african_storybook'`을 추가한다. **신규 마이그레이션 파일(다음 번호)**로 001의 CHECK 제약을 `ALTER`하며, 트리거 `DROP`/`DISABLE` 없이(Hard Rule 2) **제약만 교체**한다.

### D2 — 화이트리스트 2곳 동시 갱신

DB CHECK(마이그레이션)와 `scripts/lib/attribution.py`의 `PLATFORM_LABELS`에 `'african_storybook'` → 표시라벨 `'African Storybook'`을 **같은 작업 단위에서** 추가한다.

### D3 — 라이선스 게이트 확장

`verify_licenses.py`에:
- (a) `ALLOWED_LICENSE_SLUGS`에 **`cc-by-3-0` 추가**.
- (b) ASb **자연어 `lic` 문자열 → slug 정규화 파서 신설**(예: `"Creative Commons: Attribution 4.0"` → `cc-by-4-0`, `"Attribution 3.0"` → `cc-by-3-0`).
- (c) NC/ND **부분문자열 배제**는 ASb 측정에서 검증된 매칭(`'non commercial'`, `'noncommercial'`, `'non-commercial'`, `'no deriv'`, `'noderiv'`, `'no-deriv'`, `' nc'`, `'-nc'`, `' nd'`, `'-nd'`) 재사용.

### D4 — staging 적재

`sync_asb.py`는 **`is_active=false`로 적재**한다(기존 sync들의 `True` 하드코딩과 달리). 검수 후 별도 단계에서 공개.

### D5 — dedup

GDL 경유 ASb **33권**은 `source_id` 기준 차감하여 **중복 적재하지 않는다**.

### D6 — illustrator 누락 232권 처리

**232권도 적재한다.** `artist` 빈 값은 attribution 상 illustrator를 **'미상'으로 표시**하며, `author` 기준 저작자표시로 **CC BY 의무를 충족**한다. illustrator 보완은 적재 후 **후속 과제**로 둔다.

### D7 — 적재 범위

`lang` 정확표기 **`'English'` AND 게이트 적격 권만**. 번역본/타 언어 스킵.

---

## 3. 결과 (Consequences)

### Positive

- 순증 상한 **≈2,762권**으로 현 905권 대비 **약 4배 확장**. PM 최우선 목표(콘텐츠 최대 확보)에 직접 기여.

### Negative / 주의

- ASb 라이선스 **자연어 파서는 신규 표기 등장 시 누락 위험** → 파서는 **미매칭 `lic`를 '부적격(차단)'으로 기본 처리(fail-safe)**.
- **232권 illustrator 누락은 품질 부채로 잔존**.
- 실제 적재 전 **이미지 가용성·연령 적합성 검수**는 D4 staging 이후 별도.

---

## 4. 후속 트리거

- 본 ADR **Accepted 시** → (1) 마이그레이션 ADR/파일 작성 작업지시서 → (2) `verify_licenses.py` 게이트 확장 → (3) `sync_asb.py` 신설 순서로 진행.
- 적재 후 → `is_active=false` staging분 검수 → 공개 승인.

---

## 5. 상호 참조

- `docs/adr/0022-content-source-expansion.md` Amendment #2 — 본 ADR의 상위 설계.
- `docs/backlog.md` §7.4 (j) — ASb 정밀측정 박제.
- `supabase/migrations/001_initial_schema.sql` — `source_platform` CHECK.
- `scripts/verify_licenses.py` — 라이선스 게이트.
- `scripts/lib/attribution.py` — `PLATFORM_LABELS`.

*문서 끝.*
