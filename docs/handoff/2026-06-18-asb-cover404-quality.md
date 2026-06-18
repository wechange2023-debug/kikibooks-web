# 인계 문서 — ASb cover_404 품질 검증 세션 (2026-06-18 저녁)

> **용도**: 다음 세션/외부 Claude 검수 인계. 이 파일 1개로 현재 위치·미결정·내일 1순위를 파악.
> **선행 인계**: `docs/handoff/2026-06-18-asb-quality-filter.md`(ADR-0026 트랙 전반). 본 문서는 그 후속(cover_404 790권 공개 보류 결정).

---

## 0. 한 줄 요약

cover_ok 1,416 + probe 1권 공개(active 1,417)까지 진행. probe(11932) 브라우저 검증에서 본문 그림 문제 발견 → **cover_404 나머지 790권 공개 보류**. 원인 규명용 "본문 페이지 이미지 HEAD 정밀 정찰"은 **미완료(중단)** — 내일 재실행이 1순위.

---

## 1. 현재 위치 (실측)

| 항목 | 값 |
|---|---|
| HEAD | `a67a91bc1e4aa1de6eab3eac778fed0196c7b01e` (`fix(book): drop ASb cover face on image load failure (ADR-0026 D2, ADR-0025 Amd#6)`) |
| origin 대비 | **up to date** (ahead 0, 본 문서 커밋 후 ahead 1 예정) |
| 워킹트리 | `.claude/settings.local.json`(M) 1개뿐 — 로컬 설정, 커밋 대상 아님 |
| log -3 | `a67a91b` → `893c99a`(handoff) → `1d6257c`(chore) |

**ASb 공개 현황**: `candidate_cover_ok` 1,416 + probe 1권(`source_id=11932`) = **active 1,417**. 나머지 `candidate_cover_404` **790권은 보류(미공개)**.

---

## 2. 완료된 것

1. **표지 404 폴백 코드** — `components/book/asb-reader.tsx`. 표지 이미지 로드 실패 시 표지면(index 0)을 faces에서 제거(첫 본문이 첫 장, total 자동 보정). 커밋 `a67a91b`, **push 완료**.
2. **cover_ok 1,416 공개 SQL 실행 완료** — `scripts/out/enable_asb_cover_ok.sql`, PM이 Supabase에서 실행, active 1,416 확인.
3. **probe 1권(11932) 공개 + 브라우저 검증** — `enable_asb_cover404_probe.sql` 실행, active 1,417.

---

## 3. probe 검증에서 발견된 문제 (790권 보류 사유)

- **11932 뷰어 관찰**: 1페이지가 텍스트만(그림 없음), 일부 페이지 이미지 동일 반복, 그림체 불일치.
- **정적 품질 정찰 결과**(파서 산출 신호, `_analyze_cover404.py`):
  - 791권 중 데이터 결함(이미지 중복 과다, 고유<50%)은 **9권(1.1%)뿐**.
  - 첫 본문 면 "텍스트만" = 0권, 이미지 도메인 혼재 = 0권 → **첫면·도메인 신호는 깨끗**.
- **추정 원인**: 시각적 증상의 진짜 원인은 **본문 페이지 개별 이미지의 런타임 404**로 보임(정적 파싱으로는 안 잡힘 — 측정 한계). 표지뿐 아니라 본문 이미지도 깨지는 책이 있다는 뜻.

---

## 4. 내일 1순위 — 미완료 정찰 재실행

- **목표**: cover_404 791권의 **본문 페이지 이미지** 전체 HEAD(표지 제외, 표지는 이미 404 확정분).
- **분류**: `clean`(전부 200) / `minor_gap`(1장 깨짐) / `broken`(2장 이상 깨짐).
- **스크립트**: `scripts/out/_head_cover404_pages.py` (작성 완료, gitignore). 동시성 10, HEAD 1회 재시도.
- **★ 개선점(이번 실패 원인)**: Python `print`가 buffered라 백그라운드 진행 로그가 안 보였음 → **재실행 시 `python -u scripts/out/_head_cover404_pages.py` 또는 print(flush=True)** 로 진행률 실시간 출력.
- **주의**: 중단 시점에 `asb_cover404_page_http.csv`는 **생성조차 안 됨**(초기 tarball/파싱 단계에서 종료). 불완전 산출물 없음 — 처음부터 재실행.

---

## 5. 정찰 후 예정 경로

1. **ADR-0026 Amendment 작성(박제 우선)**: "본문 페이지 이미지 HTTP 게이트" 추가. 기존 ADR-0026은 **표지 HTTP만** 봤고 본문 이미지 검증이 빠져 있었음 — 이번 발견의 핵심.
2. **clean 묶음만 공개 SQL 생성** → PM이 Supabase 실행.
3. **minor_gap 처리 정책 — PM 판단 필요**: 본문 그림 1장 깨져 텍스트만 뜨는 면이 유아용으로 허용 가능한가. (현 코드는 깨진 본문 이미지면 자기 자리만 비우고 텍스트는 남김.)
4. **broken은 grey처럼 보류**.

---

## 6. 참고 — 미커밋 로컬 산출물 (전부 `scripts/out/`, gitignore)

| 파일 | 상태 |
|---|---|
| `enable_asb_cover_ok.sql` | 1,416 — **실행 완료분** |
| `enable_asb_cover404_probe.sql` | 1권(11932) — **실행 완료분** |
| `enable_asb_cover404_rest.sql` | 790 — **보류**(정찰 후 폐기/재생성 가능) |
| `asb_cover404_quality.csv` | 정적 정찰 산출(중복 심한 9권 식별) |
| `asb_cover404_page_http.csv` | **미생성**(정찰 중단) — 재실행 시 새로 생성 |
| `_analyze_cover404.py`, `_head_cover404_pages.py` | 일회성 분석 스크립트 |

---

## 7. 운영 원칙 (변동 없음)

- 코드 변경 = 개별 1파일 승인 / 문서 = 묶음 가능
- `git add` 파일명 지정 / add·commit·push **분리**
- **push는 외부 Claude 검수 후 결정** (트레일러/footer 0건 — ADR-0020 Vercel Hobby 제약)
- DB 변경은 **PM이 Supabase SQL Editor에서 직접** (워커 DB 미접근, SQL 텍스트만 제공)
- **워커 실측 수치가 권위** (학습데이터 추측 금지) / **ADR 선행**(코드 먼저 쓰지 않음)
