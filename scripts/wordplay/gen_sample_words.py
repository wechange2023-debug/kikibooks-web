"""단어 오디오 표본 생성 (ADR-0065 Amendment #1 · W-0 항목 4).

고유 단어 1,874개 중 **표본 20개**만 Danielle로 합성해 팀장 청취용으로 남긴다.
전량 생성은 W-1이며 **팀장 게이트 이후**다 — 본 스크립트는 표본만 만든다.

★ Storage 업로드 0건 · DB 쓰기 0건. 로컬 파일만 만든다.

두 버전을 나란히 만든다 (§감속 판단 근거):
  native/  원속 그대로            — Polly Danielle long-form 원본
  atempo/  ffmpeg atempo=0.85 감속 — 본문 TTS와 동일 후처리

  본문 낭독은 문장을 따라 읽는 아이를 위해 0.85로 늦췄다(ADR-0052 Amd#2). 그러나
  **단어 하나를 또렷이 들려주는 용도에는 감속이 불리할 수 있다** — 원속 발음이 사전
  발음에 가깝고, 감속은 모음이 늘어져 오히려 부정확하게 들릴 수 있다. 판단 근거를
  귀로 확인할 수 있도록 두 벌을 만든다.

  ※ 단어 오디오에는 speech marks가 필요 없다(단어 안에서 하이라이트할 것이 없다).
    따라서 SynthesizeSpeech 호출은 단어당 **1회**다(본문은 mp3+marks로 2회였다).

실행 (AWS 자격 증명 필요):
    python scripts/wordplay/gen_sample_words.py --dry-run   # 문자수·비용만, 과금 0
    python scripts/wordplay/gen_sample_words.py             # 실제 합성(표본 20개)

출력: scripts/wordplay/out/sample_words/{native,atempo}/{word}.mp3
      (out/ 규칙이라 git 미추적)
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

PILOT = Path(__file__).resolve().parent.parent / "tts_pilot"
sys.path.insert(0, str(PILOT))

# D6 원칙 — 프리셋·ffmpeg 탐색·비용 모델을 본문 파이프라인에서 그대로 가져온다.
# 로컬 복제본을 만들지 않는다(scripts/tts_pilot/run_tts_full708.py:64-71 선례).
from run_tts_fullbatch import (  # noqa: E402
    PRESETS,
    estimate,
    find_ffmpeg,
    MP3_QUALITY,
)

OUT = Path(__file__).resolve().parent / "out" / "sample_words"

#: 표본 20단어 — 858권 드라이런의 고유 단어 목록에서 결정론적으로 뽑았다.
#: 등장 책 수 내림차순(동점은 사전순)으로 길이대별 상위를 취해 대표성을 확보한다.
#: 구성: 짧은 5(3~4자) · 중간 10(5~7자) · 긴/하이픈 3 · 의성어 2 (지시서 W-0 4-e).
SAMPLE_WORDS: list[str] = [
    # 짧은 단어 5 (3~4자)
    "said", "one", "day", "says", "like",
    # 중간 10 (5~7자)
    "school", "mother", "people", "friends", "house",
    "animals", "father", "water", "asked", "village",
    # 긴 단어 1 + 하이픈 복합어 2 (규칙 C 검증)
    "children", "buzz-buzz", "bye-bye",
    # 의성어·감탄사 2 (규칙 D 검증)
    "ha-ha", "hooray",
]

PRESET_KEY = "danielle-longform"


def synth(polly, preset: dict, word: str, dest: Path) -> int:
    """단어 1개 합성 → mp3 바이트 수 반환. marks는 만들지 않는다."""
    resp = polly.synthesize_speech(
        Text=word,
        TextType="text",
        OutputFormat="mp3",
        VoiceId=preset["voice"],
        Engine=preset["engine"],
        LanguageCode=preset["lang"],
        SampleRate=preset["sample_rate"],
    )
    data = resp["AudioStream"].read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return len(data)


def slow_down(ffmpeg: str, preset: dict, src: Path, dest: Path) -> int:
    """본문과 동일한 atempo 후처리본을 만든다(비교용)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
        "-filter:a", f"atempo={preset['atempo']}",
        "-ar", preset["sample_rate"], "-q:a", MP3_QUALITY, str(dest),
    ]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0 or not dest.exists():
        raise RuntimeError(f"ffmpeg rc={p.returncode}: {p.stderr.strip()[:200]}")
    return dest.stat().st_size


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="문자수·비용만 출력. Polly 호출 0건(과금 0).")
    args = ap.parse_args()

    preset = PRESETS[PRESET_KEY]
    chars = sum(len(w) for w in SAMPLE_WORDS)
    # 단어 오디오는 marks 미생성 → 단어당 호출 1회(multiplier=1).
    usd = estimate(chars, preset["usd_per_million"], 1)

    print(f"[표본] {len(SAMPLE_WORDS)}단어 · {chars}자")
    print(f"[프리셋] {preset['voice']} / {preset['engine']} / {preset['region']}")
    print(f"[비용] 표본 ${usd:.4f} (marks 미생성이라 단어당 호출 1회)")

    if args.dry_run:
        print("[dry-run] Polly 호출 0건. 종료.")
        return 0

    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치")
        return 1

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("[STOP] ffmpeg 없음 — atempo 비교본을 만들 수 없다.")
        return 2

    polly = boto3.client("polly", region_name=preset["region"])
    report: list[dict] = []

    for word in SAMPLE_WORDS:
        native = OUT / "native" / f"{word}.mp3"
        slowed = OUT / "atempo" / f"{word}.mp3"
        n_bytes = synth(polly, preset, word, native)
        a_bytes = slow_down(ffmpeg, preset, native, slowed)
        report.append({
            "word": word, "chars": len(word),
            "native_bytes": n_bytes, "atempo_bytes": a_bytes,
        })
        print(f"  {word:14s} native {n_bytes:6,}B  atempo {a_bytes:6,}B")

    avg = sum(r["native_bytes"] for r in report) / len(report)
    (OUT / "_report.json").write_text(
        json.dumps({
            "preset": PRESET_KEY, "words": len(SAMPLE_WORDS),
            "chars": chars, "usd": round(usd, 4),
            "avg_native_bytes": round(avg), "items": report,
        }, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(f"\n[저장] {OUT}")
    print(f"[평균 파일 크기] native {avg:,.0f}B — 전량 1,874개 추정 "
          f"{avg * 1874 / 1024 / 1024:.1f}MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
