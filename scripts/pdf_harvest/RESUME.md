# pdf_harvest 재개 메모 (2026-07-10 세션 종료 시점)

> 다음 세션이 PDF 텍스트 수확 트랙을 이어받기 위한 인계 문서.

## 지시서 7(게이트 재설계) STEP별 상태

| STEP | 상태 |
|---|---|
| 0 유실 push + 49/54 정산 | 완료 (미채점 5권 = 정본 JSON 부재 무텍스트 5권) |
| 1 좌표 재조립(pdfplumber) | 완료 — 블록 클러스터링 + 조건부 좌/우 반면 분할 + 드롭캡 재부착. pdftotext -layout 비교 완료(우열 없음) |
| 2 정본 유형 분류 | 완료 — NARRATION 43 / MIXED 5 / ALT_DESC 1 / EMPTY 5 |
| 3 게이트 v2 재채점 | 완료·**미통과** — GA-1(산포 조판 2권), GB-1(**튜닝 2회 한도 소진**) |
| 4 문서화 / 5 커밋 | 작업정리 지시서로 대체 수행(게이트 v3 전환 포함) |
| **157권 순회** | **미착수** (게이트 미통과로 차단 → v3 전환으로 재개 조건은 오케스트레이터 결정 대기) |

## 하베스터 현재 구현 (scripts/pdf_harvest/harvest.py)

- 소스: bookdash.org `book-source-files` 브라우저 → ebook형 폴더 동적 탐색(`e-?book`) →
  영어 하위 폴더 → 복수 PDF는 **페이지 수 검증**(<5p 기각)으로 선택.
- 추출: **pdfplumber 좌표 재조립**(라인 밴딩 3.0pt → top-간격 블록 클러스터링 →
  좌/우 반면 분할은 완전 좌·우 블록 공존 & 걸침 블록 부재일 때만 → 드롭캡 선분리·재부착
  크기비 ≥1.5·gap ≤1.2×중앙값). 구두점 앞 공백 제거 1건만 후처리 허용.
- `--reextract`: 네트워크 없이 캐시에서 재추출(`cache_file` 필드/페이지 수로 캐시 재판정).
- ★ **GB-1 튜닝 한도 2회 소진** — 임계값 추가 조정은 오케스트레이터 승인 필요.
- 알려진 한계: 말풍선·낱글자 산포 조판은 기하로 복원 불가(how-about-you `W you? ho are`,
  what-is-it `A a r E e! g h k! n! u R`). v1(pypdf 객체 순서)과 책별 상보적.

## 게이트 v3 결과 (NARRATION 43권)

- **AUTO 29권 (67.4%)** / REVIEW 13권(158면) / MANUAL 1권(how-about-you, 12면)
- 상세: `docs/recon/2026-07-10-harvest-gate-v2.md` §4

## 캐시·산출물

- **PDF 캐시 56파일 — 삭제 금지(재개 경제성)**:
  `C:\Users\dupy2\AppData\Local\Temp\claude\E--claude-code-kikibooks-platform\a412cbab-ddef-4d3f-9340-6fd469c1ba11\scratchpad\pdf_cache\`
  (54권 + 기각 표지 후보 2건 `*.cand1.pdf`/표지 캐시. ⚠️ 시스템 임시 경로라 OS 정리로
  소실될 수 있음 — 소실 시 harvest.py가 재다운로드로 재구축, 권당 1 GET.)
- 수확 산출물 54건: `scripts/pdf_harvest/out/*.pages.json` (커밋됨. ⚠️ .gitignore 전역
  `out/` 규칙 때문에 신규 파일은 `git add -f` 필요 — ocr_pilot처럼 예외 추가 여부는
  오케스트레이터 결정 대기)
- 대조군 채점 데이터(세션 임시): 같은 scratchpad의 `score54_v1.json`(pypdf 기준) /
  `score54_v2.json`(좌표+분류) / `gate_v3.json`(v3 분류) — 임시 경로라 소실 가능,
  확정 수치는 recon 문서에 박제됨.

## 다음 사람이 첫 줄에 칠 명령어

```
python scripts/pdf_harvest/harvest.py --slugs <slug목록.txt> --cache <위 pdf_cache 경로> --reextract
```
(재추출 검증용. 157권 신규 수확이 승인되면 `--reextract`를 빼고 157권 slug 목록으로 실행
— state.json이 재개 인덱스. **첫 안건은 `docs/intent/oracle-without-groundtruth.md` 검증**.)

*문서 끝.*
