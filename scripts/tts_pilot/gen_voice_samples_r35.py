#!/usr/bin/env python3
"""gen_voice_samples_r35.py — 라운드 3.5: long-form 감속 음질 개선 샘플.

배경: 팀장 판정 = Danielle/Ruth long-form 스타일 합격.
      단 SSML rate=85% 감속본에서 울림(에코성 왜곡) 발생.
      → 완만한 SSML 감속(90/95%) vs ffmpeg atempo(음높이 유지 타임스트레치) 비교.

★ 로컬 산출물만: out/voice_samples_r35/ 에만 생성. 기존 폴더 무수정.
★ Storage 업로드·DB 쓰기 없음. AWS는 boto3 기본 체인 + region_name 오버라이드만.
★ ffmpeg: 시스템 PATH에 없으면 이미 설치된 imageio_ffmpeg 동봉 바이너리를 사용한다
   (신규 설치 없음). 둘 다 없으면 즉시 중단.

매트릭스(Danielle·Ruth 각각):
  {voice}_lf_native.mp3      평문 원속도(대조군·atempo 원본)
  {voice}_lf_r90.mp3         SSML prosody rate=90%
  {voice}_lf_r95.mp3         SSML prosody rate=95%
  {voice}_lf_atempo85.mp3    native를 ffmpeg atempo=0.85로 후처리
       + {voice}_lf_atempo85.marks.scaled.json  (native marks의 time을 1/0.85배 스케일)

사용: python scripts/tts_pilot/gen_voice_samples_r35.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
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
R35_DIR = OUT_DIR / "voice_samples_r35"

REGION = "us-east-1"
ENGINE = "long-form"
LANG = "en-US"
SAMPLE_RATE = "24000"        # 이번 라운드는 명시(측정 결과 long-form 기본값과 동일)
VOICES = ["Danielle", "Ruth"]
SSML_RATES = [90, 95]
ATEMPO = 0.85

SRC_SLUG = "ann-nem-oh-nee-finds-adventure"
SRC_PAGE = 8
BASELINE_MARKS = AUDIO_DIR / f"{SRC_SLUG}_p{SRC_PAGE}_Ruth_r78.marks.json"


def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return ""


def load_sample_text() -> str:
    scenes = json.loads((OUT_DIR / f"{SRC_SLUG}.json").read_text(encoding="utf-8"))
    for s in scenes:
        if s["page"] == SRC_PAGE:
            return " ".join(s["text"].split())
    raise RuntimeError(f"{SRC_SLUG} p{SRC_PAGE} 없음")


def parse_marks(raw: str) -> list[dict]:
    return [json.loads(l) for l in raw.splitlines() if l.strip()]


def wpm(marks: list[dict]) -> float | None:
    if len(marks) < 2 or not marks[-1].get("time"):
        return None
    return len(marks) / (marks[-1]["time"] / 60000.0)


def ffmpeg_duration_ms(ffmpeg: str, path: Path) -> int | None:
    """ffmpeg -i 의 stderr에서 Duration을 파싱(ffprobe 미동봉 환경 대응)."""
    p = subprocess.run([ffmpeg, "-hide_banner", "-i", str(path)],
                       capture_output=True, text=True)
    for line in p.stderr.splitlines():
        line = line.strip()
        if line.startswith("Duration:"):
            t = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = t.split(":")
            return int((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)
    return None


def synth(polly, payload: str, text_type: str, voice: str, stem: str) -> dict:
    mp3_path = R35_DIR / f"{stem}.mp3"
    marks_path = R35_DIR / f"{stem}.marks.json"
    r = polly.synthesize_speech(
        Text=payload, TextType=text_type, OutputFormat="mp3", VoiceId=voice,
        Engine=ENGINE, LanguageCode=LANG, SampleRate=SAMPLE_RATE,
    )
    data = r["AudioStream"].read()
    mp3_path.write_bytes(data)
    r = polly.synthesize_speech(
        Text=payload, TextType=text_type, OutputFormat="json", VoiceId=voice,
        Engine=ENGINE, LanguageCode=LANG, SpeechMarkTypes=["word"],
    )
    raw = r["AudioStream"].read().decode("utf-8")
    marks_path.write_text(raw, encoding="utf-8")
    marks = parse_marks(raw)
    return {"file": mp3_path.name, "marks_file": marks_path.name, "voice": voice,
            "method": text_type, "bytes": len(data), "words": len(marks),
            "last_mark_ms": marks[-1]["time"] if marks else None,
            "wpm": round(wpm(marks), 1) if wpm(marks) else None, "ok": True}


def main() -> int:
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("[STOP] ffmpeg 미설치 — 시스템 PATH·imageio_ffmpeg 모두 없음. 설치 승인 필요.")
        return 2
    src = "PATH" if shutil.which("ffmpeg") else "imageio_ffmpeg 동봉(신규 설치 없음)"
    print(f"[INFO] ffmpeg = {src}")

    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치")
        return 1

    text = load_sample_text()
    baseline = None
    if BASELINE_MARKS.exists():
        baseline = wpm(parse_marks(BASELINE_MARKS.read_text(encoding="utf-8")))
    print(f"[INFO] region={REGION} engine={ENGINE} SampleRate={SAMPLE_RATE} "
          f"/ 텍스트 {len(text)}자 / 기준 neural Ruth r78 = "
          f"{f'{baseline:.1f}' if baseline else 'n/a'} wpm")

    polly = boto3.client("polly", region_name=REGION)
    R35_DIR.mkdir(parents=True, exist_ok=True)

    results: list[dict] = []
    for v in VOICES:
        # 1) 평문 원속도(대조군 겸 atempo 원본)
        try:
            r = synth(polly, text, "text", v, f"{v}_lf_native")
            r["variant"] = "native (평문 원속도)"
            results.append(r)
            print(f"  [OK] {r['file']} {r['bytes']}B wpm={r['wpm']}")
        except Exception as exc:  # noqa: BLE001
            print(f"  [FAIL] {v}_lf_native — {type(exc).__name__}: {exc}")
            results.append({"file": f"{v}_lf_native.mp3", "voice": v, "ok": False,
                            "error": f"{type(exc).__name__}: {exc}"})
            continue

        # 2) SSML 완만 감속
        for rate in SSML_RATES:
            ssml = f'<speak><prosody rate="{rate}%">{text}</prosody></speak>'
            try:
                r = synth(polly, ssml, "ssml", v, f"{v}_lf_r{rate}")
                r["variant"] = f"SSML prosody rate={rate}%"
                results.append(r)
                print(f"  [OK] {r['file']} {r['bytes']}B wpm={r['wpm']}")
            except Exception as exc:  # noqa: BLE001
                print(f"  [FAIL] {v}_lf_r{rate} — {type(exc).__name__}: {exc}")
                results.append({"file": f"{v}_lf_r{rate}.mp3", "voice": v, "ok": False,
                                "error": f"{type(exc).__name__}: {exc}"})

        # 3) ffmpeg atempo 후처리(음높이 유지) + marks time 스케일
        native_mp3 = R35_DIR / f"{v}_lf_native.mp3"
        dest = R35_DIR / f"{v}_lf_atempo{int(ATEMPO * 100)}.mp3"
        cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(native_mp3),
               "-filter:a", f"atempo={ATEMPO}", "-ar", SAMPLE_RATE, "-q:a", "2", str(dest)]
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode != 0 or not dest.exists():
            print(f"  [FAIL] {dest.name} — ffmpeg rc={p.returncode}: {p.stderr.strip()[:300]}")
            results.append({"file": dest.name, "voice": v, "ok": False,
                            "error": f"ffmpeg rc={p.returncode}"})
            continue
        native_marks = parse_marks((R35_DIR / f"{v}_lf_native.marks.json")
                                   .read_text(encoding="utf-8"))
        scaled = [{**m, "time": int(round(m["time"] / ATEMPO))} for m in native_marks]
        scaled_path = R35_DIR / f"{v}_lf_atempo{int(ATEMPO * 100)}.marks.scaled.json"
        scaled_path.write_text(
            "".join(json.dumps(m, ensure_ascii=False) + "\n" for m in scaled),
            encoding="utf-8")
        w = wpm(scaled)
        results.append({"file": dest.name, "marks_file": scaled_path.name, "voice": v,
                        "method": f"ffmpeg atempo={ATEMPO} (pitch 유지)",
                        "variant": f"atempo {ATEMPO} 후처리",
                        "bytes": dest.stat().st_size, "words": len(scaled),
                        "last_mark_ms": scaled[-1]["time"] if scaled else None,
                        "wpm": round(w, 1) if w else None, "ok": True})
        print(f"  [OK] {dest.name} {dest.stat().st_size}B wpm={round(w,1) if w else None} "
              f"(marks {scaled_path.name})")

    # 실제 재생 길이 실측(마크 프록시와 별개 검증)
    for r in results:
        if r.get("ok"):
            r["duration_ms_measured"] = ffmpeg_duration_ms(ffmpeg, R35_DIR / r["file"])

    report = {
        "round": 3.5,
        "goal": "long-form 감속 시 울림(에코성 왜곡) 없는 방법 확정",
        "engine": ENGINE, "region": REGION, "language": LANG,
        "sample_rate_requested": SAMPLE_RATE,
        "sample_rate_r3_measured": "24000 (미지정이었으나 long-form 기본값이 24000)",
        "sample_source": {"slug": SRC_SLUG, "page": SRC_PAGE, "text": text},
        "baseline_wpm_neural_ruth_r78": round(baseline, 1) if baseline else None,
        "atempo": ATEMPO,
        "marks_scaling": "atempo 산출물은 native marks의 time을 1/atempo 배로 스케일해 별도 저장",
        "samples": results,
    }
    (R35_DIR / "_r35_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    ok = sum(1 for r in results if r.get("ok"))
    print("=" * 64)
    print(f"[DONE] {ok}/{len(results)} 생성 → {R35_DIR}")
    return 0 if ok == len(results) else 3


if __name__ == "__main__":
    sys.exit(main())
