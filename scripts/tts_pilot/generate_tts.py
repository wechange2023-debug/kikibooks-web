#!/usr/bin/env python3
"""
generate_tts.py — Book Dash v1 파일럿 Polly 음성 생성 (TTS 파일럿 2단계, ADR-0023 §2.4 실증)

★ 파일럿 전용 격리 스크립트. DB/스키마/Supabase를 절대 건드리지 않는다.
   프로덕션 sync_*.py 무수정. 로컬 산출물(out/audio/*, out/{slug}.tts.json)만 만든다.

★ AWS 자격증명은 환경변수(AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_DEFAULT_REGION)에서만
   읽는다. 키를 코드·로그·파일에 절대 출력·기록하지 않는다. boto3 기본 자격증명 체인 사용.

입력 : scripts/tts_pilot/out/{slug}.json  (1단계 extract_text.py 산출물)
동작 : 장면마다 Polly synthesize_speech 2회
        (a) OutputFormat='mp3'  → out/audio/{slug}_p{N}.mp3
        (b) OutputFormat='json', SpeechMarkTypes=['word'] → out/audio/{slug}_p{N}.marks.json
        빈 텍스트 장면(page 4·12 등)은 음성 생성 스킵(audio 없음으로 표기).
출력 : out/{slug}.tts.json  (장면별 mp3/marks 경로·단어수·오디오 길이 프록시 집계)

배치 사전생성(실시간 아님) — ADR-0023 §2.4 정합.

사용:
    python scripts/tts_pilot/generate_tts.py --slug a-beautiful-day
    python scripts/tts_pilot/generate_tts.py --slug a-beautiful-day --voice Ivy
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Windows 콘솔(cp949) 커브따옴표·이모지 깨짐 방지
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

PILOT_DIR = Path(__file__).resolve().parent
OUT_DIR = PILOT_DIR / "out"
AUDIO_DIR = OUT_DIR / "audio"

# 아동 en-US 후보(우선순위). Neural 엔진 사용 가능성은 describe_voices로 확인 후 선택.
CHILD_VOICE_CANDIDATES = ["Ivy", "Justin", "Kevin"]
ENGINE = "neural"
LANGUAGE_CODE = "en-US"

# 문장부호(. ! ?) 뒤에 공백 없이 따옴표/대문자가 바로 오면 공백 1칸 삽입.
# 소수점(3.5)·줄임표(...)는 건드리지 않도록 다음 문자를 따옴표 또는 대문자로 한정.
_PUNCT_GAP_RE = re.compile(r'([.!?])(?=[“”‘’"\'A-Z])')


def normalize_text(text: str) -> str:
    """1단계에서 관찰된 'Mom.“Say' 류만 최소 교정. 그 외 원문(커브따옴표 포함) 보존."""
    return _PUNCT_GAP_RE.sub(r"\1 ", text)


def pick_voice(polly, requested: str | None) -> str:
    """describe_voices(Neural, en-US)로 후보 중 실제 사용 가능한 voice 선택.

    --voice 지정 시 그 voice가 Neural 지원이면 사용, 아니면 후보 순차 폴백.
    """
    resp = polly.describe_voices(Engine=ENGINE, LanguageCode=LANGUAGE_CODE)
    neural_ids = {v["Id"] for v in resp.get("Voices", [])}
    order = ([requested] if requested else []) + CHILD_VOICE_CANDIDATES
    for vid in order:
        if vid and vid in neural_ids:
            return vid
    raise RuntimeError(
        f"Neural en-US 후보 음성 사용 불가. 요청={requested} 후보={CHILD_VOICE_CANDIDATES} "
        f"/ 사용가능(en-US neural)={sorted(neural_ids)}"
    )


def synth_mp3(polly, text: str, voice: str, dest: Path) -> int:
    resp = polly.synthesize_speech(
        Text=text, OutputFormat="mp3", VoiceId=voice, Engine=ENGINE,
        LanguageCode=LANGUAGE_CODE,
    )
    data = resp["AudioStream"].read()
    dest.write_bytes(data)
    return len(data)


def synth_word_marks(polly, text: str, voice: str, dest: Path) -> list[dict]:
    """word speech marks 생성. Polly는 line-delimited JSON 스트림 반환 → 원본 그대로 저장."""
    resp = polly.synthesize_speech(
        Text=text, OutputFormat="json", VoiceId=voice, Engine=ENGINE,
        LanguageCode=LANGUAGE_CODE, SpeechMarkTypes=["word"],
    )
    raw = resp["AudioStream"].read().decode("utf-8")
    dest.write_text(raw, encoding="utf-8")  # 원본(line-delimited JSON) 그대로 보존
    marks: list[dict] = []
    for line in raw.splitlines():
        line = line.strip()
        if line:
            marks.append(json.loads(line))
    return marks


def main() -> int:
    ap = argparse.ArgumentParser(description="Book Dash v1 파일럿 Polly TTS 생성")
    ap.add_argument("--slug", default="a-beautiful-day")
    ap.add_argument("--voice", default=None, help="강제 voice(기본: Ivy→Justin→Kevin 폴백)")
    args = ap.parse_args()
    slug = args.slug

    src = OUT_DIR / f"{slug}.json"
    if not src.exists():
        print(f"[FAIL] 입력 없음: {src} (1단계 extract_text.py 먼저 실행)")
        return 1
    scenes = json.loads(src.read_text(encoding="utf-8"))

    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치: pip install boto3 --break-system-packages")
        return 1

    # 자격증명은 boto3 기본 체인(환경변수)에서 로드. 값은 출력하지 않는다.
    try:
        polly = boto3.client("polly")
        voice = pick_voice(polly, args.voice)
    except Exception as exc:  # noqa: BLE001
        # 자격증명·권한 오류 등 — 전문 보고 후 중단(임의 우회 금지).
        print(f"[FAIL] Polly 초기화/voice 선택 실패 — {type(exc).__name__}: {exc}")
        return 2

    print(f"[INFO] engine={ENGINE} voice={voice} (아동 en-US)")
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    manifest: list[dict] = []
    total_chars = 0
    for s in scenes:
        page = s["page"]
        text_raw = s.get("text", "")
        text = normalize_text(text_raw)
        entry: dict = {
            "page": page,
            "image_url": s.get("image_url"),
            "text": text,
            "audio": None,
            "marks": None,
            "word_count": 0,
            "audio_len_ms_proxy": None,  # 마지막 word mark time(ms) 기반 프록시(정확 길이 아님)
        }
        if not text.strip():
            print(f"  [page {page:>2}] (빈 텍스트 — 음성 스킵)")
            manifest.append(entry)
            continue

        total_chars += len(text)
        mp3_path = AUDIO_DIR / f"{slug}_p{page}.mp3"
        marks_path = AUDIO_DIR / f"{slug}_p{page}.marks.json"
        try:
            n_bytes = synth_mp3(polly, text, voice, mp3_path)
            marks = synth_word_marks(polly, text, voice, marks_path)
        except Exception as exc:  # noqa: BLE001
            print(f"[FAIL] Polly 호출 실패 (page {page}) — {type(exc).__name__}: {exc}")
            return 3

        last_ms = marks[-1]["time"] if marks else None
        entry.update(
            audio=str(mp3_path.relative_to(PILOT_DIR)),
            marks=str(marks_path.relative_to(PILOT_DIR)),
            word_count=len(marks),
            audio_len_ms_proxy=last_ms,
            mp3_bytes=n_bytes,
        )
        manifest.append(entry)
        print(f"  [page {page:>2}] mp3={n_bytes}B words={len(marks)} lastMark={last_ms}ms")

    man_path = OUT_DIR / f"{slug}.tts.json"
    man_path.write_text(
        json.dumps(
            {"slug": slug, "engine": ENGINE, "voice": voice,
             "total_chars": total_chars, "scenes": manifest},
            ensure_ascii=False, indent=2,
        ),
        encoding="utf-8",
    )
    print("=" * 64)
    print(f"[OK] voice={voice} 총 문자 수={total_chars} → {man_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
