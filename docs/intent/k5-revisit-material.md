# K5 재검토 자료 (자료만 — 결정 없음)

> 작업정리 지시서(2026-07-10) STEP 2-3. 팀장 K5 재검토용. **결정을 쓰지 않는다.**
> K4(WP판 화질 교체)와 같은 소스 저장소 폴더를 보므로 **한 덩어리로 다뤄질 수 있음**.

## 1. 새로 확인된 사실 2건

### (a) PDF 텍스트 레이어에 말풍선 대사가 포함된다 — 실측

zanele-situ-my-story: 정본(GH 추출 나레이션)에 없는 **말풍선 대사 67단어**가 PDF
레이어에 실재("What is wrong, doctor?", "We think Zanele has got TB in her spine…" 등).
gracas-dream 32단어·maddy-moona 17단어도 정본 초과 인쇄 텍스트 확인
(`docs/recon/2026-07-10-harvest-gate-v2.md` §5).

**함의**: 157권 자막을 PDF에서 뽑으면 **말풍선 대사가 나레이션 자막·TTS에 섞인다.**
(157권은 정본이 없어 "나레이션만 골라내기"의 기준선이 별도로 필요하다.)

### (b) `_no-text` 무텍스트 이미지 폴더가 소스 저장소에 실재 — 커버리지 미측정

2026-07-10 표본 실측: a-tiny-seed(`ebook/_no-text/` JPG 11장), the-cottonwool-doctor·
the-great-cake-contest(`ebook/no-text`), its-my-book·the-window-seat(`e-book/_no-text`).
54권 하베스트에서도 권별 존재 여부 필드 수집됨(예: how-about-you no-text 14파일,
who-is-our-friend 18파일 — 전량 집계는 out/*.pages.json의 `has_no_text_folder` 필드).
**157권 커버리지는 미측정.**

**함의**: K5의 원래 전제("무텍스트 이미지 확보 불가 → baked-in 이미지 + 자막 중복
허용")가 흔들린다 — 무텍스트 원본이 있는 책은 A안(이미지 아래 텍스트 레이어)을 자막
중복 없이 구현할 수 있다. 단 **커버리지가 부분적이면 "일부 책만 자막 중복"이라는 UX
비일관이 생긴다.**

## 2. 선택지 (나열만)

| 선택지 | 내용 | 미확인 리스크 |
|---|---|---|
| 유지 | baked-in(WP판) 이미지 + 자막 중복 허용(현 K5) | 말풍선 대사와 자막·TTS의 삼중 중복(§1a) 규모 미측정 |
| 전면 교체 | `_no-text` 이미지로 전권 통일 | **커버리지 미측정**(157권 중 몇 권에 폴더가 있는지 모름) · 해상도/종횡비/파일 수의 본문 면 대응 미확인 · 폴더명 변형(`_no-text`/`no-text`) 처리 |
| 부분 교체 | 있는 책만 `_no-text`, 없는 책은 baked-in | 책마다 자막 중복 여부가 갈리는 UX 비일관 · 코호트 관리 복잡도 · 두 이미지 소스의 화질 차 |

공통 미확인: `_no-text` 폴더의 파일 수 ↔ 본문 면수 대응(표본에서도 a-tiny-seed 11장 vs
본문 12면 — page5·6·7·10·11·12 등 일부 번호 부재 관찰), 커버·백매터 포함 여부, 라이선스
표기 동일성.

## 3. 연결 문서

- `docs/recon/2026-07-10-157books-text-source-recon.md` §부수 발견(폴더 실측 원 기록)
- `docs/recon/2026-07-10-harvest-gate-v2.md` §5(EXTRA_TEXT 실측)
- ADR-0035 Amd#3(A안 확정) · ADR-0036(이미지 저장)

*문서 끝 — 자료만, 결정 없음.*
