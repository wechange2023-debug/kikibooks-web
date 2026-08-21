"""단어 mp3 변형 합성 — 귀 검수 지적분 재작업용 (지시서 E-2c-6 STEP 1).

기존 단어 파이프라인과 **같은 사양**으로만 만든다:
  Danielle · long-form · 24kHz · ffmpeg atempo 0.85
사양(보이스·엔진·감속률) 변경은 금지다 — 1,904개 전체와 일관성이 깨진다.

★ Storage 업로드 0건. DB 접근 0건. **로컬 파일만** 만든다.
★ 기존 out/all_words/ 를 건드리지 않는다 — 별도 디렉터리에 쓴다.

실행:
    python scripts/wordcard_pilot/synth_variants.py --dry-run   # 호출 0건, 대상·문자수만
    python scripts/wordcard_pilot/synth_variants.py
출력: scripts/wordcard_pilot/out/variants/{native,atempo}/{label}.mp3
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tts_pilot"))

from run_tts_fullbatch import (  # noqa: E402
    PRESETS,
    MP3_QUALITY,
    find_ffmpeg,
    polly_call,
)

OUT = HERE / "out" / "variants"
PRESET_KEY = "danielle-longform"

#: (라벨, 입력 텍스트, text_type, 설명)
#: 비교 기준본은 **합성하지 않는다** — 지금 Storage에 올라가 있는 실물을 그대로 복사한다.
#: 같은 입력을 다시 합성하면 "적재본과 같은 소리"라는 보장이 없고 호출만 낭비된다.
DEPLOYED = HERE.parent / "wordplay" / "out" / "all_words" / "atempo" / "ta-ta.mp3"

VARIANTS: list[tuple[str, str, str, str]] = [
    ("ta-ta_a_space", "ta ta", "text",
     "(a) 하이픈 → 공백"),
    ("ta-ta_b_bang", "Ta-ta!", "text",
     "(b) 대문자 + 감탄부호 — 인사말 억양 유도"),
    ("ta-ta_c_phoneme",
     '<speak><phoneme alphabet="ipa" ph="ˌtɑːˈtɑː">ta-ta</phoneme></speak>', "ssml",
     "(c) SSML phoneme 지정 — 영국식 작별 인사 발음 /ˌtɑːˈtɑː/"),
]


def slow_down(ffmpeg: str, preset: dict, src: Path, dest: Path) -> int:
    """gen_all_words.slow_down 과 동일 — 사양을 복제하지 않고 같은 인자를 쓴다."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
        "-filter:a", f"atempo={preset['atempo']}",
        "-ar", preset["sample_rate"], "-q:a", MP3_QUALITY, str(dest),
    ]
    p = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if p.returncode != 0 or not dest.exists() or dest.stat().st_size == 0:
        raise RuntimeError(f"ffmpeg rc={p.returncode}: {(p.stderr or '').strip()[:200]}")
    return dest.stat().st_size


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Polly 호출 0건")
    args = ap.parse_args()

    preset = PRESETS[PRESET_KEY]
    total_chars = sum(len(v[1]) for v in VARIANTS)
    usd = total_chars * preset["usd_per_million"] / 1_000_000.0

    print(f"[대상] 변형 {len(VARIANTS)}개 · 입력 문자 합계 {total_chars}자 · ${usd:.4f}")
    for label, text, tt, note in VARIANTS:
        print(f"   {label:20s} {len(text):3d}자 [{tt}] {note}")
    print(f"[사양] {preset['voice']} · {preset['engine']} · {preset['sample_rate']}Hz "
          f"· atempo {preset['atempo']}")

    if args.dry_run:
        print("[dry-run] Polly 호출 0건. 종료.")
        return 0

    import boto3
    import shutil
    polly = boto3.client("polly", region_name=preset["region"])
    ffmpeg = find_ffmpeg()

    # 비교 기준본 — 적재본 복사(합성 0회)
    (OUT / "atempo").mkdir(parents=True, exist_ok=True)
    shutil.copy2(DEPLOYED, OUT / "atempo" / "ta-ta_00_deployed.mp3")
    print(f"  [복사] ta-ta_00_deployed  ← 현재 적재본 ({DEPLOYED.stat().st_size}B, Polly 호출 0회)")

    report = []
    for label, text, tt, note in VARIANTS:
        native = OUT / "native" / f"{label}.mp3"
        atempo = OUT / "atempo" / f"{label}.mp3"
        try:
            resp = polly_call(
                polly,
                Text=text,
                TextType=tt,
                OutputFormat="mp3",
                VoiceId=preset["voice"],
                Engine=preset["engine"],
                LanguageCode=preset["lang"],
                SampleRate=preset["sample_rate"],
            )
            data = resp["AudioStream"].read()
            if not data:
                raise RuntimeError("Polly가 빈 오디오를 반환")
            native.parent.mkdir(parents=True, exist_ok=True)
            native.write_bytes(data)
            size = slow_down(ffmpeg, preset, native, atempo)
            print(f"  [OK] {label:20s} native {len(data):6d}B → atempo {size:6d}B")
            report.append({"label": label, "text": text, "text_type": tt, "note": note,
                           "chars": len(text), "ok": True, "bytes": size})
        except Exception as e:  # noqa: BLE001
            print(f"  [실패] {label:20s} — {type(e).__name__}: {str(e)[:200]}")
            report.append({"label": label, "text": text, "text_type": tt, "note": note,
                           "chars": len(text), "ok": False, "error": str(e)[:300]})

    ok = [r for r in report if r["ok"]]
    billed = sum(r["chars"] for r in ok)
    print(f"\n[결과] 성공 {len(ok)}/{len(report)} · 호출 {len(report)}회 "
          f"· 문자 {billed}자 · ${billed * preset['usd_per_million'] / 1_000_000.0:.4f}")
    (OUT / "_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[보고] {OUT / '_report.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
