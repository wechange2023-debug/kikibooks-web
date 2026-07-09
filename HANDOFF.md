# 세션 인계 메모 — book_dash 이미지 창고 복사 트랙 (2026-07-09 종료)

> 이 문서는 다음 세션이 book_dash 자체 뷰어 **이미지 복사 트랙**을 이어받기 위한 인계 메모다.
> 관련 ADR: `docs/adr/0036-bookdash-image-storage.md`(+ Amendment #1), `docs/adr/0035-bookdash-self-viewer.md`.

## 1. 마지막 커밋
- **HEAD `016a43d`** (`2be33cb..016a43d`, branch `main`, **origin 동기화 완료**).
- 커밋 메시지: `feat: bookdash image copy elite-39 cohort + ADR-0036 Amd#1 (39/54 source images)`.
- 직전 관련 커밋: `2be33cb`(스크립트 최초 추가) · `bac2a79`(ADR-0036 + 정찰 노트).

## 2. 확정 결정 — 1안 (팀장 확정)
- **정예 39권 확정, "704 목표" 폐기.** 704는 HTML `<img>` 참조 기준 수치였고, 원본 파일 실존은 39/54뿐이었음.
- 근거·상세: ADR-0036 **Amendment #1**(2026-07-08, Accepted).

## 3. 코호트 (scripts/copy_bookdash_images.py)
- **`IMAGELESS_BOOKS` 상수로 결손 15권 제외** → 기본 대상 = **정예 39권**.
- `--include-imageless` 플래그 지정 시에만 **전체 54권** 포함(결손 원본 재확보 재시도용).
- 매핑 출처: `scratchpad/tts_recon_49.csv`(49) + 완료 5권(`step3_manifest.csv` UUID 복구). 키 = `book_dash-{source_id_UUID}/NN.jpg` + `cover.jpg`(ADR-0036 D2).

## 4. 완결성 게이트
- 기대치 = **정예 39권 전 이미지 = 508** (38권×13 + `whose-button-is-this` 14).
- 실행 후 버킷 실측이 기대치 **미달이면 `[FAIL]` + `exit 1`**(성공으로 끝나지 않음). 팀장 지시(2026-07-08).
- 다운로드 스로틀 대응: `DL_DELAY_S` 간격 + 지수 백오프 재시도 내장.

## 5. Supabase 실측 (최종 상태)
- **버킷 총 518객체** = 정예 39권 **508** + 결손책 잔여 커버 **10**.
- 정예 39권 **불완전 0권** (전권 완비, 게이트 `[OK]` 통과 예상).
- **DB 쓰기 0건** — 이미지 장부 테이블 없음. 뷰어가 `source_id`(UUID)로 키를 규칙 조립(ADR-0036 D5).

## 6. 결손 15권 전체 목록 (원본 이미지 부재 — GH Pages 2019 스냅샷)
**표지만 존재(본문 `images/NN.jpg` 결손) 10권**:
`hippo-wants-to-dance, little-sock, mrs-penguins-palace, shongololos-shoes, springloaded, the-best-thing-ever, the-elephant-in-the-room, what-is-it, when-i-grow-up, who-is-our-friend`
(이 10권은 `images/cover.jpg`만 200 → 버킷에 커버 1개씩 = 잔여 커버 10)

**이미지 전무(본문·표지 모두 404) 5권 — 무텍스트책**:
`hugs-in-the-city, i-can-dress-myself, it-wasnt-me, katiitis-song, the-lion-who-wouldnt-try`

## 7. 실패 원인 3겹 (진단 완료)
1. **GH Pages/Fastly 레이트리밋** — 무지연 연속 요청(~700건)이 간헐 404를 유발(가짜 실패). → 스크립트에 지연+백오프 추가.
2. **Fastly 엣지 네거티브 캐싱** — 위 404가 엣지에 캐싱되어 bare URL 재요청도 계속 404. cache-bust(`?x=`)로 우회 시 origin 실상(200/404) 노출.
3. **진짜 원본 결손 15권** — cache-bust + 대조군 통과 + 대체경로 전부 404로 확정된 **영구 결손**(우리 스크립트 무관). a-fish-and-a-gift는 ①②의 피해였을 뿐 원본 실존 → 별도 페이스 업로드로 완비(39번째).

## 8. 미커밋 유지 파일 (의도적 제외)
- `.claude/settings.local.json` (M) — 로컬 설정.
- `scripts/tts_pilot/HANDOFF.md` (??) — 기존 TTS 파일럿 인계 메모.

## 9. 다음 세션 후보
- **(A) 결손 15권 원본 재확보 정찰** — bookdash.org WP REST / CloudFront(ADR-0027 신간 경로)에 이 구권 이미지가 있는지 확인 → 가능 시 `--include-imageless` + 해당 경로 파서로 복사, 불가 시 영구 제외 확정.
- **(B) 프로덕션 iframe 이미지 깨짐 확인** — 결손 10권(표지만 존재)이 현행 iframe 뷰어에서 본문 이미지가 죽은 링크로 깨져 보이는지 점검.
- **(C) 잔여 커버 10개 정리 여부 결정** — 결손 10권의 `book-images` 버킷 잔여 `cover.jpg`(정예 코호트 아님)를 남길지/삭제할지.

## 10. 참고 산출물
- ADR: `docs/adr/0036-bookdash-image-storage.md`(D1~D5 + Amendment #1).
- 스크립트: `scripts/copy_bookdash_images.py`(`IMAGELESS_BOOKS`·게이트·스로틀 백오프).
- 정찰/드라이런: `scratchpad/bookdash_image_storage_recon.md`, `scratchpad/bookdash_image_dryrun.md`.
