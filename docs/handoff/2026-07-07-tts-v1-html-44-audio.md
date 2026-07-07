# 인수인계 — TTS v1 html 44권 오디오 트랙 (2026-07-07 세션 종료)

> 다음 세션이 이 트랙을 이어받기 위한 재개 메모. 워커(Claude Code) 기준.

## 이번 세션 완료 요약

- **코호트**: Book Dash v1 html 54권 중 완료 5 · 무텍스트 5 제외 → **44권** 오디오화.
- **스펙(불변)**: Amazon Polly **Neural / Ruth / rate 78 / natural**. 표지 문장 `"{title}. Created by {author}."`.
- **로컬 생성·검증(워커 확인 완료)**:
  - 본문 오디오 530페이지(mp3+word marks) + 표지 44(cover mp3+marks) 생성.
  - marks 무결성 전량 통과(mp3 존재·크기>0, 마지막 mark ≤ 실제 오디오 길이, 단어/mark 정합).
  - `extract_text.py` **alt 폴백** 추가(springloaded: 본문이 이미지 alt에 있는 책 대응).
  - springloaded 원본 오타 `bounches→bounces` 1곳 교정 후 재생성.
- **Storage 업로드(팀장 실행)**: 버킷 `book-audio`, 키 `book_dash-{source_id}/pNN.mp3`·`cover.mp3`(+`.marks.json`).
  Content-Type 명시(mp3 `audio/mpeg` / marks `application/json; charset=utf-8`), `Cache-Control: public,max-age=31536000,immutable`.
  STEP 5에서 3권(springloaded·sima-and-siza·together-were-strong) URL 검증 통과 → 나머지 41권 전량.
- **스키마 개정**: `book_audio`에 **`kind`(page/cover)** 컬럼 추가, UNIQUE 재정의 `(book_id,kind,page_index,voice)`
  → **ADR-0034 Amendment #1**(Accepted, 2026-07-07). 실행 SQL `scratchpad/step7_book_audio_cover_schema.sql`.
- **장부 적재 SQL 초안**: `scratchpad/step8_book_audio_insert.sql` — 574행(page 530 + cover 44) INSERT
  `ON CONFLICT DO NOTHING` + `books.has_audio=true`(44권). `audio_path`는 **버킷명 제외 객체 키**(ADR-0034 라인71 정합).
- **저자 오타 교정 완료**: sima-and-siza 원본 오타 `CClaire→Claire`를 `author`+`attribution_text` 둘 다.
  실행 SQL `scratchpad/step4d_fix_sima_credit.sql`. 대상 키 `source_platform='book_dash', source_id='9c9ea96c-…'`(UUID 실증).

## 다음 세션 첫 안건

1. **(팀장 SQL 실행 확인)** step7(스키마) → step8(적재) → step4d(저자교정)가 SQL Editor에서 실행됐는지 후검증 수치로 확인:
   `book_audio` 574행 / kind별 page 530·cover 44 / `has_audio=true` 44권.
2. **AsbReader 뷰어 오디오 통합**(ADR-0017 결합점, ADR-0034 다음단계 (5)):
   - 재생 URL = `{SUPABASE_URL}/storage/v1/object/public/book-audio/` **+ `book_audio.audio_path`**
     (audio_path에 버킷명 없음 — 뷰어가 붙인다).
   - 페이지 오디오(kind='page', page_index 0-based) + word marks 하이라이트, 표지(kind='cover')는 표지 화면 재생.

## 미해결 / 별도 트랙 참고

- **표지 DB 표현은 kind='cover'로 확정**(안 A). page_index=0 고정 placeholder.
- **3권 슬러그-예외**(little-sock·maddy-moona·mrs-penguins-palace): DB `books.source_id`가 full-slug이나
  Storage 키·`book_audio`는 UUID/`books.id`로 연결 → 오디오 트랙 무영향.
- **step3c 옛 표지 URL(cover_url) 슬러그키 3권**: 실제 반영 여부는 **읽기전용 점검 별도 트랙**(오디오와 무관).
- 파일럿 로컬 산출물(`scripts/tts_pilot/out/`)은 gitignore(스크립트로 재현 가능). `HANDOFF.md`(구버전)는 미커밋 유지.

## 재현 명령(참고)

```
python scripts/tts_pilot/extract_text.py --slug <slug>
python scripts/tts_pilot/generate_tts.py --slug <slug> --voice Ruth --rate 78 --natural
python scripts/tts_pilot/gen_cover.py [--only <slug>]        # 표지
python scripts/tts_pilot/upload_audio.py --dry-run           # 업로드(키는 env, 팀장 실행)
```
