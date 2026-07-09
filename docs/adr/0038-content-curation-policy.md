# ADR-0038 — 콘텐츠 큐레이션 정책: 소량 정예 서비스 대상 정의

## Status
**Proposed** (2026-07-09, 팀장 승인 대기)

## 관련
- `docs/adr/0035-bookdash-self-viewer.md` §1·§3(소수 정예 원칙 최초 기록) + Amd#1(A안 확정, Proposed)
- `docs/adr/0036-bookdash-image-storage.md` Amd#1(정예 39권)·Amd#2(cover-only 10·결손 15 지위, Proposed)
- `docs/adr/0037-cron-must-not-overwrite-is-active.md` Appendix(2026-07-09 팀장 SQL 실측 — 출처별 수치의 출전)
- `lib/shared/blacklist.ts`(차단 15권 단일 진실원)
- 근거 정찰: `docs/recon/2026-07-09-viewer-architecture-evidence.md`, `docs/recon/2026-07-09-ghpages-and-viewer-decision.md`

---

## 1. 배경 (Context)

수집 4,273권(활성 3,657권) 중 자체 뷰어(ADR-0035)로 실제 서비스할 대상은 소수다("사람이 선별한
소수 정예" — ADR-0035 §1). 그러나 **선별 기준과 대상 목록이 어느 문서에도 없다**(2026-07-09
docs/ 전수 확인 — ADR-0035 §3 미해결 4 "선별 도서 목록 확정(별도 트랙)"이 미결인 채로 유일한 기록).
본 ADR은 (a) 현황을 실측 수치로 박제하고, (b) "서비스 가능(Serviceable)"의 **기술적 최소 조건**을
정의하며, (c) 품질 선별 기준은 팀장 결정 항목으로 명시적으로 남긴다.

## 2. B1 — 현황 실측 (2026-07-09)

### 출처별 수집/활성 (출전: ADR-0037 Appendix, 2026-07-09 팀장 SQL)

| source_platform | 활성 | 비활성 | 계 |
|---|---:|---:|---:|
| african_storybook | 2,160 | 590 | 2,750 |
| bloom | 440 | 23 | 463 |
| book_dash | 206 | 3 | 209 |
| gdl | 851 | 0 | 851 |
| **계** | **3,657** | **616** | **4,273** |

※ 위 수치 이후 ADR-0037 검증용 카나리아 실험으로 gdl 1권(source_id=37775)이 일시 비활성 상태
(실험 종료 후 원복 예정 — 통계 재인용 시 주의).

### book_dash html 코호트(54권)의 자산 현황 (2026-07-09 버킷·로컬 실측)

| 항목 | 수 | 근거 |
|---|---:|---|
| 이미지 보유(book-images 본문 01~NN+cover) | **39** | 버킷 전수 list(508객체 = 38×13 + 14) |
| 오디오 업로드(book-audio, p00~pNN 0-based + cover.mp3 + marks) | **44** | 버킷 전수 list(프리픽스 44) |
| **이미지 ∩ 업로드 오디오** | **34** | 두 목록 교집합 실측 |
| 이미지 ∩ 로컬 오디오(파일럿 산출 포함) | 39 | B집합 5권은 로컬(Ruth_r78)만 존재, 미업로드 |
| blacklist 차단 | 15 | `lib/shared/blacklist.ts:35-53` |
| drift(구·신 slug 이중화) | 3 | ADR-0037 D6 / ADR-0027 Amd#3 §150 |
| cover-only 잔여 폴더 | 10 | ADR-0036 Amd#2 §8.1 |

- 업로드 오디오 44 = 정예 39 중 34 + 결손(표지만) 10. 결손 10권의 오디오는 업로드되어 있으나
  이미지가 없어 자체 뷰어 대상이 아니다.
- has_audio=true는 44권 반영 기록(`scratchpad/step8_book_audio_insert.sql:639`, 팀장 SQL 실행분).
  **현재 DB 상태 실측은 본 ADR 승인 시 팀장 SQL로 재확인**:
  ```sql
  SELECT count(*) FROM books WHERE source_platform='book_dash' AND has_audio = true;
  ```

## 3. B2 — "서비스 가능(Serviceable)" 정의 (기술적 최소 조건)

자체 뷰어(ADR-0035 + Amd#1 A안)가 정상 동작하기 위한 조건. 품질 선별(§5)과 별개의 **하한선**이다.

| # | 조건 | 근거(한 줄) |
|---|---|---|
| S1 | `book-images`에 **무텍스트** 본문 이미지 전권(01~NN) + cover | A안 렌더 원천 — 외부 종속 제거(D3) + 무텍스트 전제(Amd#1 A2) |
| S2 | 텍스트 JSON(장면별 text) 존재 | marks·형광펜의 단일 진실원(D4) — 없으면 하이라이트 성립 불가 |
| S3 | non-empty 전 면의 오디오+marks가 `book-audio`에 업로드 | 재생 URL이 버킷 조립(D5) — 로컬 파일은 서비스가 못 읽음 |
| S4 | `books.has_audio = true` | 뷰어 분기·오디오 UI 노출 조건(D6) |
| S5 | `BOOK_DASH_404_SOURCE_IDS`(blacklist) 미포함 | 5개 표면이 조회 자체를 차단 — 포함 시 도달 불가 |

## 4. B3 — Serviceable 실측: **34권**

S1~S5 전부 충족(2026-07-09 실측; S4는 step8 기록 기준 — 위 SQL로 재확인 조건부): **34권**.

부록 — 34권 slug:
amazing-daisy, bathtub-safari, come-back-cat, gracas-dream, grandpas-gold, how-about-you,
i-will-help-you, is-there-anyone-like-me, karabos-question, lara-the-yellow-ladybird,
little-ants-big-plan, londi-the-dreaming-girl, lory-dory, maddy-moona, miss-helens-magical-world,
queen-of-soweto, rafikis-style, sbus-special-shoes, searching-for-the-spirit-of-spring,
sima-and-siza, sindi-and-the-moon, sindiwe-and-the-fireflies, singing-the-truth, sizwes-smile,
sleepy-mr-sloth, thatos-birthday-surprise, there-must-be-a-rainbow, together-were-strong,
tortoise-finds-his-home, walking-together, what-if, whose-button-is-this, why-is-nita-upside-down,
zanele-situ-my-story

## 5. B4 — 미충족 20권의 결손 항목별 분류 (54권 기준)

| 분류 | 권수 | slug | 결손 항목 |
|---|---:|---|---|
| B집합(오디오 업로드 누락) | 5 | a-beautiful-day, a-dancers-tale, a-fish-and-a-gift, a-house-for-mouse, a-tiny-seed | S3·S4만 미충족 — 이미지·텍스트·**로컬 오디오(Ruth_r78) 완비**, 업로드만 남음 |
| 표지만(이미지 없음) | 10 | hippo-wants-to-dance, little-sock, mrs-penguins-palace, shongololos-shoes, springloaded, the-best-thing-ever, the-elephant-in-the-room, what-is-it, when-i-grow-up, who-is-our-friend | S1 미충족(무텍스트 본문 소스 0/15 — ADR-0036 Amd#2 §8.2). 텍스트·업로드 오디오는 있음 |
| 전무(무텍스트책) | 5 | hugs-in-the-city, i-can-dress-myself, it-wasnt-me, katiitis-song, the-lion-who-wouldnt-try | S1·S2·S3 전부 미충족(이미지·텍스트·오디오 없음) |

→ **즉시 확장 여력 = B집합 5권**(오디오 업로드 1회 + has_audio 반영으로 39권 도달).
표지만 10권·전무 5권은 ADR-0036 Amd#2 §8.2의 지위(무텍스트 소스 부재)에 따름.

## 6. B5 — 품질 선별 기준: 팀장 결정 대기

Serviceable(§3)은 기술 하한선일 뿐이며, "소수 정예"의 **품질 기준은 팀장 결정 사항**이다.
본 ADR은 후보 축만 열거한다 (기준·가중치·컷라인을 정하지 않는다):

- 삽화 품질(해상도·완성도·스타일 일관성)
- 어휘 수준·문장 길이(대상 연령 3~7세 적합성, level/age 필드와의 정합)
- 주제 적합성(연령 정서·문화 감수성)
- 낭독 품질(Ruth 합성음의 자연도 — 78% 기준 통과 여부)
- 페이지 수·호흡(완독 경험 설계와의 정합)

→ **팀장 결정 대기.** 결정 시 본 ADR Amendment로 기준·최종 목록을 박제한다.

## 7. Consequences

- 서비스 대상의 "기술 하한선"이 문서화되어, 이후 선별·확장 논의가 실측 위에서 이뤄진다.
- B집합 5권 업로드 트랙(별도 승인)이 최우선 확장 경로임이 수치로 드러난다.
- 본 ADR은 코드·DB를 변경하지 않는다(문서만).
