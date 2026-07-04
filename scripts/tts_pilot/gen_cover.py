#!/usr/bin/env python3
"""
gen_cover.py — 소배치 4권 표지(cover) 오디오 생성 (TTS 파일럿 보조, 로컬 전용)

★ 파일럿 전용 격리 스크립트. DB/스키마/Supabase 무접촉. 로컬 out/audio/ 만 쓴다.
★ 본문과 100% 동일 파이프라인: generate_tts.py의 함수(normalize_text·ssml_payload·
   make_mark_adjuster·synth_mp3·synth_word_marks·pick_voice)를 그대로 import해 사용.
   파라미터도 본문과 동일: engine=neural, voice=Ruth, rate=78, natural=True.

입력 : 아래 COVERS 딕셔너리(팀장 확정 'Created by' 낭독 문구, 2026-07-04).
출력 : out/audio/{slug}-cover.mp3, out/audio/{slug}-cover.marks.json (본문 파일과 구분되는 이름).

AWS 자격증명은 boto3 기본 체인(~/.aws)에서 로드. 키값 출력·기록 금지.
"""
from __future__ import annotations

import sys
from pathlib import Path

# 본문 파이프라인 함수 재사용 (동일 폴더)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_tts import (  # noqa: E402
    AUDIO_DIR,
    normalize_text,
    ssml_payload,
    make_mark_adjuster,
    synth_mp3,
    synth_word_marks,
    pick_voice,
)

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

VOICE = "Ruth"
RATE = 78
NATURAL = True

# 팀장 확정(2026-07-04) — 소스 'Created by' 표기 충실. meta.yml/저작권블록에 역할 구분 없음.
COVERS = {
    "a-dancers-tale": "A Dancer’s Tale. Created by Samantha Cutler, Thea Nicole De Klerk, Roberto Pita.",
    "a-fish-and-a-gift": "A Fish and a Gift. Created by Liesl Jobson, Jesse Breytenbach, Andy Thesen.",
    "a-house-for-mouse": "A House for Mouse. Created by Michele Fry, Amy Uzzell, Jennifer Jacobs.",
    "a-tiny-seed": "A Tiny Seed. Created by Nicola Rijsdijk, Maya Marshak, Karen Lilje.",
}


def main() -> int:
    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치")
        return 1
    try:
        polly = boto3.client("polly")
        voice = pick_voice(polly, VOICE)
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] Polly 초기화/voice 실패 — {type(exc).__name__}: {exc}")
        return 2

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[INFO] engine=neural voice={voice} rate={RATE}% natural={NATURAL}")

    for slug, raw in COVERS.items():
        text = normalize_text(raw)
        # 본문의 rate!=100 / natural 경로와 동일: SSML + 원문 오프셋 보정
        payload, ssml_map = ssml_payload(text, RATE, NATURAL)
        adjust = make_mark_adjuster(ssml_map)
        mp3_path = AUDIO_DIR / f"{slug}-cover.mp3"
        marks_path = AUDIO_DIR / f"{slug}-cover.marks.json"
        try:
            n = synth_mp3(polly, payload, "ssml", voice, mp3_path)
            marks = synth_word_marks(polly, payload, "ssml", voice, marks_path, adjust)
        except Exception as exc:  # noqa: BLE001
            print(f"[FAIL] Polly 호출 실패 ({slug}) — {type(exc).__name__}: {exc}")
            return 3
        last = marks[-1]["time"] if marks else None
        print(f"  [{slug:20}] mp3={n}B words={len(marks)} lastMark={last}ms  \"{text}\"")

    print("[OK] 표지 오디오 4권 생성 완료 → out/audio/{slug}-cover.mp3 / .marks.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
