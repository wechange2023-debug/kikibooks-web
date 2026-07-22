#!/usr/bin/env python3
"""probe_longform_marks.py — Polly long-form 엔진의 word speech marks 지원 여부 검증(STEP 1 게이트).

★ 로컬 산출물만 만든다(out/voice_samples_r3/_probe_*). Storage/DB 무접근.
★ AWS 자격증명은 boto3 기본 체인만 사용. 키를 출력·기록하지 않는다.

동작: Danielle(en-US, long-form)로 1문장을
      (a) OutputFormat='mp3'  (b) OutputFormat='json', SpeechMarkTypes=['word']
      두 번 호출해 각각의 성공/실패와 응답 요약을 출력한다.

--region R: boto3 client 생성 시에만 리전 오버라이드(~/.aws config 무수정).
    long-form 엔진은 일부 리전에만 배포되어 있어 기본 리전에서 실패할 수 있다.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

PILOT_DIR = Path(__file__).resolve().parent
OUT_DIR = PILOT_DIR / "out" / "voice_samples_r3"

PROBE_TEXT = "Which shoes? You choose!"
VOICE = "Danielle"
ENGINE = "long-form"
LANG = "en-US"


def main() -> int:
    ap = argparse.ArgumentParser(description="Polly long-form word marks 게이트 프로브")
    ap.add_argument("--region", default=None,
                    help="boto3 client 리전 오버라이드(~/.aws config 무수정)")
    args = ap.parse_args()

    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치")
        return 1

    polly = boto3.client("polly", region_name=args.region) if args.region \
        else boto3.client("polly")
    print(f"[INFO] region={args.region or '(기본 체인)'} engine={ENGINE} voice={VOICE}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 0) 엔진별 사용 가능 보이스 확인
    try:
        resp = polly.describe_voices(Engine=ENGINE, LanguageCode=LANG)
        ids = sorted(v["Id"] for v in resp.get("Voices", []))
        print(f"[INFO] describe_voices(engine={ENGINE}, {LANG}) → {ids}")
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] describe_voices — {type(exc).__name__}: {exc}")
        return 2

    # a) mp3 합성
    try:
        r = polly.synthesize_speech(
            Text=PROBE_TEXT, TextType="text", OutputFormat="mp3",
            VoiceId=VOICE, Engine=ENGINE, LanguageCode=LANG,
        )
        data = r["AudioStream"].read()
        dest = OUT_DIR / "_probe_Danielle_longform.mp3"
        dest.write_bytes(data)
        print(f"[PASS-a] mp3 {len(data)}B → {dest.name}")
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL-a] mp3 합성 실패 — {type(exc).__name__}: {exc}")
        return 3

    # b) word speech marks
    try:
        r = polly.synthesize_speech(
            Text=PROBE_TEXT, TextType="text", OutputFormat="json",
            VoiceId=VOICE, Engine=ENGINE, LanguageCode=LANG,
            SpeechMarkTypes=["word"],
        )
        raw = r["AudioStream"].read().decode("utf-8")
        marks = [json.loads(l) for l in raw.splitlines() if l.strip()]
        dest = OUT_DIR / "_probe_Danielle_longform.marks.json"
        dest.write_text(raw, encoding="utf-8")
        print(f"[PASS-b] word marks {len(marks)}개 → {dest.name}")
        for m in marks:
            print(f"    {m}")
        print("[RESULT] long-form word speech marks = PASS" if marks
              else "[RESULT] long-form word speech marks = FAIL (0개 반환)")
        return 0 if marks else 4
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL-b] speech marks 실패 — {type(exc).__name__}: {exc}")
        print("[RESULT] long-form word speech marks = FAIL")
        return 4


if __name__ == "__main__":
    sys.exit(main())
