#!/usr/bin/env python3
"""gen_voice_samples_r3_longform.py — 라운드 3 long-form 샘플(Danielle·Ruth) 생성.

전제: probe_longform_marks.py --region us-east-1 = PASS (word speech marks 지원 확인).
      long-form 엔진은 기본 리전(ap-southeast-2) 미배포 → client 생성 시에만 us-east-1 오버라이드.
      ~/.aws config 는 건드리지 않는다. 자격증명은 boto3 기본 체인(출력·기록 금지).

★ 로컬 산출물만: out/voice_samples_r3/ 에만 추가. Storage 업로드·DB 쓰기 없음.

동작:
  1) gen_voice_samples_r3.py 와 동일 텍스트(ann-nem-oh-nee-finds-adventure p8) 사용.
  2) 평문(SSML 없음)으로 Danielle·Ruth long-form mp3 + word marks 생성
     → long-form 자체 낭독 톤 평가용.
  3) marks로 실측 WPM을 구해 기존 neural Ruth r78 산출물과 비교.
     long-form 평문이 유의하게 빠르면(+10% 초과) prosody rate 85% 버전을 _r85 로 추가 생성.
  4) _r3_report.json 에 이번 결과를 추가 기록(기존 항목 보존).
"""

from __future__ import annotations

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
OUT_DIR = PILOT_DIR / "out"
AUDIO_DIR = OUT_DIR / "audio"
R3_DIR = OUT_DIR / "voice_samples_r3"

REGION = "us-east-1"
ENGINE = "long-form"
LANG = "en-US"
VOICES = ["Danielle", "Ruth"]

SRC_SLUG = "ann-nem-oh-nee-finds-adventure"
SRC_PAGE = 8
BASELINE_MARKS = AUDIO_DIR / f"{SRC_SLUG}_p{SRC_PAGE}_Ruth_r78.marks.json"

RATE_PCT = 85           # 필요 시 추가 생성할 감속 버전
WPM_MARGIN = 1.10       # 기준 대비 10% 초과로 빠르면 감속본 추가


def load_sample_text() -> str:
    scenes = json.loads((OUT_DIR / f"{SRC_SLUG}.json").read_text(encoding="utf-8"))
    for s in scenes:
        if s["page"] == SRC_PAGE:
            return " ".join(s["text"].split())
    raise RuntimeError(f"{SRC_SLUG} p{SRC_PAGE} 없음")


def parse_marks(raw: str) -> list[dict]:
    return [json.loads(l) for l in raw.splitlines() if l.strip()]


def wpm(marks: list[dict]) -> float | None:
    """word marks 기반 실측 분당 단어수(마지막 마크 시각 기준 프록시)."""
    if len(marks) < 2 or not marks[-1].get("time"):
        return None
    return len(marks) / (marks[-1]["time"] / 60000.0)


def synth(polly, text: str, text_type: str, voice: str, stem: str) -> dict:
    mp3_path = R3_DIR / f"{stem}.mp3"
    marks_path = R3_DIR / f"{stem}.marks.json"
    r = polly.synthesize_speech(
        Text=text, TextType=text_type, OutputFormat="mp3",
        VoiceId=voice, Engine=ENGINE, LanguageCode=LANG,
    )
    data = r["AudioStream"].read()
    mp3_path.write_bytes(data)
    r = polly.synthesize_speech(
        Text=text, TextType=text_type, OutputFormat="json",
        VoiceId=voice, Engine=ENGINE, LanguageCode=LANG, SpeechMarkTypes=["word"],
    )
    raw = r["AudioStream"].read().decode("utf-8")
    marks_path.write_text(raw, encoding="utf-8")
    marks = parse_marks(raw)
    w = wpm(marks)
    print(f"  [OK] {mp3_path.name} voice={voice} {len(data)}B words={len(marks)} "
          f"lastMark={marks[-1]['time'] if marks else None}ms wpm={w:.1f}" if w
          else f"  [OK] {mp3_path.name} voice={voice} {len(data)}B words={len(marks)}")
    return {"file": mp3_path.name, "marks_file": marks_path.name, "voice": voice,
            "engine": ENGINE, "region": REGION, "text_type": text_type,
            "bytes": len(data), "words": len(marks),
            "last_mark_ms": marks[-1]["time"] if marks else None,
            "wpm": round(w, 1) if w else None, "ok": True}


def main() -> int:
    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치")
        return 1

    text = load_sample_text()
    print(f"[INFO] region={REGION} engine={ENGINE} / 텍스트 {len(text)}자 ({SRC_SLUG} p{SRC_PAGE})")

    baseline_wpm = None
    if BASELINE_MARKS.exists():
        baseline_wpm = wpm(parse_marks(BASELINE_MARKS.read_text(encoding="utf-8")))
        print(f"[INFO] 기준 neural Ruth r78 실측 = {baseline_wpm:.1f} wpm ({BASELINE_MARKS.name})")
    else:
        print(f"[WARN] 기준 marks 없음: {BASELINE_MARKS.name} — 감속본 판단은 스킵")

    polly = boto3.client("polly", region_name=REGION)
    R3_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    print("[INFO] 평문(SSML 없음) long-form 샘플:")
    for v in VOICES:
        try:
            results.append(synth(polly, text, "text", v, f"{v}_longform"))
        except Exception as exc:  # noqa: BLE001
            print(f"  [FAIL] {v} — {type(exc).__name__}: {exc}")
            results.append({"file": f"{v}_longform.mp3", "voice": v, "ok": False,
                            "error": f"{type(exc).__name__}: {exc}"})

    # 감속본 필요 판단: 평문 WPM이 기준 대비 WPM_MARGIN 초과로 빠른가
    plain_wpm = [r["wpm"] for r in results if r.get("ok") and r.get("wpm")]
    need_slow = bool(baseline_wpm and plain_wpm
                     and max(plain_wpm) > baseline_wpm * WPM_MARGIN)
    print(f"[INFO] 감속본(_r{RATE_PCT}) 추가 여부 = {need_slow} "
          f"(평문 max {max(plain_wpm) if plain_wpm else None} vs 기준×{WPM_MARGIN})")

    rate_supported = None
    if need_slow:
        ssml = f'<speak><prosody rate="{RATE_PCT}%">{text}</prosody></speak>'
        print(f"[INFO] prosody rate {RATE_PCT}% long-form 샘플:")
        for v in VOICES:
            try:
                results.append(synth(polly, ssml, "ssml", v, f"{v}_longform_r{RATE_PCT}"))
                rate_supported = True
            except Exception as exc:  # noqa: BLE001
                rate_supported = False
                print(f"  [FAIL] {v} r{RATE_PCT} — {type(exc).__name__}: {exc}")
                results.append({"file": f"{v}_longform_r{RATE_PCT}.mp3", "voice": v,
                                "ok": False, "error": f"{type(exc).__name__}: {exc}"})

    # 기존 리포트 보존하며 추가 기록
    rp = R3_DIR / "_r3_report.json"
    report = json.loads(rp.read_text(encoding="utf-8")) if rp.exists() else {}
    report["long_form_round"] = {
        "gate": "PASS — word speech marks 반환 확인(us-east-1)",
        "region_override": REGION,
        "aws_config_changed": False,
        "engine": ENGINE,
        "voices_available_en_US": ["Danielle", "Gregory", "Patrick", "Ruth"],
        "text_type": "text (SSML 연출 없음)",
        "baseline_wpm_neural_ruth_r78": round(baseline_wpm, 1) if baseline_wpm else None,
        "slow_variant_generated": need_slow,
        "slow_variant_rate_pct": RATE_PCT if need_slow else None,
        "prosody_rate_supported_longform": rate_supported,
        "samples": results,
    }
    rp.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    ok = sum(1 for r in results if r.get("ok"))
    print("=" * 64)
    print(f"[DONE] {ok}/{len(results)} 생성 → {R3_DIR} / 리포트 갱신 {rp.name}")
    return 0 if ok == len(results) else 3


if __name__ == "__main__":
    sys.exit(main())
