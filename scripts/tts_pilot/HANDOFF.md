> ⚠️ 구버전(2026-07-03, 파일럿 1권 단계). 현행 인계문서는
> tasks/HANDOFF-2026-07-24.md. 본 문서는 이력 보존용.

# TTS 파일럿 — 세션 재개 메모 (2026-07-03 종료 시점)

> 이 메모는 다음 세션이 TTS 트랙을 이어받기 위한 인계 문서다.
> 커밋 여부는 사용자 지시 대기 중(현재 미커밋).

## 확정 사항 (팀장 청취·검증 완료)

- **엔진·보이스·속도**: Amazon Polly **Neural** / 보이스 **Ruth**(성인 여성 — Joanna·Kendra 비교 청취 후 확정) / 기본 **78% 자연낭독**(`--rate 78 --natural` = SSML `<prosody rate="78%">` + 문장부호 기반 `<break>` 끊어읽기)
- **저장 위치**: **Supabase Storage** 확정 — ADR-0023 **Amendment #1** (`docs/adr/0023-ai-features-and-tts-policy.md`, 커밋 `65edba6` push 완료)
- **파일럿 범위**: a-beautiful-day 1권 전권(12장면 중 텍스트 있는 10장면) 오디오+word marks+프리뷰 로컬 생성·검증 완료. **의도적 미커밋** — 스크립트로 언제든 재현 가능하므로 유실 위험 없음.
- **대상 코호트**: Book Dash **v1 html 39권**(텍스트 추출 가능). v2 asb_native 206권은 **OCR 별도 2차 트랙**.

## 로컬 산출물 (미커밋, 재현 가능)

- `generate_tts.py` — 수정분: `--rate` / `--natural` / `--voice`(파일명 접미사) / `--pages` 옵션,
  SSML 바이트 오프셋 원문 보정, `<break>` 가짜 word 마크 필터
- `preview.html` — 카라오케 프리뷰(소스 전환·재생 배속 0.75~1.25×·전체 자동재생).
  실행: 이 폴더에서 `python -m http.server 8000` → `http://localhost:8000/preview.html`
- `out/` — 매니페스트 7종(Ruth_r78 전권 = 기본, Joanna/Kendra 샘플, Ivy 100/85/75/65) + `out/audio/` mp3·marks 108개

재현 명령(확정 파라미터 전권):
```
python scripts/tts_pilot/generate_tts.py --slug a-beautiful-day --voice Ruth --rate 78 --natural
```
(AWS 자격증명은 환경변수 상속 전제. 키 설정·출력 금지.)

## 다음 세션 첫 안건 — 구현 ADR 작성 (ADR-0023 Amd#1 §C 미결 해소)

1. **DB 저장 형태**: `book_audio` 테이블 vs `books.audio_url` 컬럼 (ADR-0023 §2.3 양안 — read-along 페이지·단어 동기화 요구 반영해 확정)
2. **Storage 버킷 구조·경로 네이밍** (예: `book-audio/{slug}/p{N}.mp3` 류)
3. **업로드 Content-Type/charset 헤더** (mp3 · marks JSON)

→ 확정 후: **39권 배치 생성 → Storage 업로드 → 뷰어(AsbReader) 통합** 순서로 진행.

## 주의 (Hard Rule 연계)

- DB 스키마 변경은 반드시 신규 ADR 선행 + 사용자 사전 승인 (claude.md Hard Rule 8, 질문 규칙 3)
- TTS 음성은 원본의 2차 저작물 — 어트리뷰션 의무 승계 (ADR-0023 §2.6, license-rules.md 동반 갱신 예고)
