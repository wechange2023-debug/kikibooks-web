#!/usr/bin/env python3
"""gen_voice_samples_r35_atempo90.py — 라운드 3.5 보강: atempo 0.90 비교 샘플.

기존 out/voice_samples_r35/{voice}_lf_native.mp3 를 원본으로 재사용한다.
**Polly 재호출 없음**(AWS 호출 0건). ffmpeg 후처리 + marks time 스케일만 수행.

★ 산출물은 out/voice_samples_r35/ 에만 추가. 기존 파일 무수정.
★ ffmpeg: 시스템 PATH → 없으면 imageio_ffmpeg 동봉본(승인됨, 신규 설치 없음).

산출:
  {voice}_lf_atempo90.mp3                    atempo=0.90, VBR -q:a 2 (atempo85와 동일 정책)
  {voice}_lf_atempo90.marks.scaled.json      native marks의 time × 1/0.90

사용: python scripts/tts_pilot/gen_voice_samples_r35_atempo90.py
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
R35_DIR = PILOT_DIR / "out" / "voice_samples_r35"

VOICES = ["Danielle", "Ruth"]
ATEMPO = 0.90
SAMPLE_RATE = "24000"


def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return ""


def parse_marks(raw: str) -> list[dict]:
    return [json.loads(l) for l in raw.splitlines() if l.strip()]


def wpm(marks: list[dict]) -> float | None:
    if len(marks) < 2 or not marks[-1].get("time"):
        return None
    return len(marks) / (marks[-1]["time"] / 60000.0)


def ffmpeg_duration_ms(ffmpeg: str, path: Path) -> int | None:
    p = subprocess.run([ffmpeg, "-hide_banner", "-i", str(path)],
                       capture_output=True, text=True)
    for line in p.stderr.splitlines():
        line = line.strip()
        if line.startswith("Duration:"):
            t = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = t.split(":")
            return int((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)
    return None


def main() -> int:
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("[STOP] ffmpeg 미설치 — 시스템 PATH·imageio_ffmpeg 모두 없음.")
        return 2
    print(f"[INFO] ffmpeg = {'PATH' if shutil.which('ffmpeg') else 'imageio_ffmpeg 동봉'} "
          f"/ atempo={ATEMPO} / Polly 호출 없음")

    tag = f"atempo{int(ATEMPO * 100)}"
    results = []
    for v in VOICES:
        native_mp3 = R35_DIR / f"{v}_lf_native.mp3"
        native_marks_p = R35_DIR / f"{v}_lf_native.marks.json"
        if not native_mp3.exists() or not native_marks_p.exists():
            print(f"[FAIL] 원본 없음: {native_mp3.name} / {native_marks_p.name}")
            return 1

        dest = R35_DIR / f"{v}_lf_{tag}.mp3"
        cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(native_mp3),
               "-filter:a", f"atempo={ATEMPO}", "-ar", SAMPLE_RATE, "-q:a", "2", str(dest)]
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode != 0 or not dest.exists():
            print(f"[FAIL] {dest.name} — ffmpeg rc={p.returncode}: {p.stderr.strip()[:300]}")
            results.append({"file": dest.name, "voice": v, "ok": False,
                            "error": f"ffmpeg rc={p.returncode}"})
            continue

        native_marks = parse_marks(native_marks_p.read_text(encoding="utf-8"))
        scaled = [{**m, "time": int(round(m["time"] / ATEMPO))} for m in native_marks]
        scaled_p = R35_DIR / f"{v}_lf_{tag}.marks.scaled.json"
        scaled_p.write_text(
            "".join(json.dumps(m, ensure_ascii=False) + "\n" for m in scaled),
            encoding="utf-8")

        dur = ffmpeg_duration_ms(ffmpeg, dest)
        nat_dur = ffmpeg_duration_ms(ffmpeg, native_mp3)
        w = wpm(scaled)
        results.append({
            "file": dest.name, "marks_file": scaled_p.name, "voice": v,
            "method": f"ffmpeg atempo={ATEMPO} (pitch 유지)",
            "variant": f"atempo {ATEMPO} 후처리", "source": native_mp3.name,
            "polly_called": False, "bytes": dest.stat().st_size, "words": len(scaled),
            "last_mark_ms": scaled[-1]["time"] if scaled else None,
            "wpm": round(w, 1) if w else None,
            "duration_ms_measured": dur, "native_duration_ms": nat_dur,
            "duration_ratio_measured": round(dur / nat_dur, 4) if dur and nat_dur else None,
            "duration_ratio_theoretical": round(1 / ATEMPO, 4),
            "ok": True,
        })
        print(f"  [OK] {dest.name} {dest.stat().st_size}B wpm={round(w,1) if w else None} "
              f"dur={dur}ms ratio={round(dur/nat_dur,4) if dur and nat_dur else None} "
              f"(이론 {round(1/ATEMPO,4)})")

    rp = R35_DIR / "_r35_report.json"
    report = json.loads(rp.read_text(encoding="utf-8")) if rp.exists() else {}
    report["atempo90_addendum"] = {
        "atempo": ATEMPO,
        "source": "기존 {voice}_lf_native.mp3 재사용 — Polly 재호출 없음",
        "encode_policy": "VBR -q:a 2, -ar 24000 (atempo85와 동일)",
        "marks_scaling": "native marks time × 1/0.90",
        "samples": results,
    }
    rp.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    ok = sum(1 for r in results if r.get("ok"))
    print("=" * 64)
    print(f"[DONE] {ok}/{len(results)} 생성 → {R35_DIR} / 리포트 갱신 {rp.name}")
    return 0 if ok == len(results) else 3


if __name__ == "__main__":
    sys.exit(main())
