"""AAAAAHHH 4면 재합성 (R-1) — 표기 시험 → 확정 표기로 재합성.

배경 (R-0 조사 확정)
--------------------
`AAAAAHHH!!!! Mmawe!` 면의 mp3에 **한 단어 분량이 통째로 없다**.
단독 합성 길이 합은 `AAAAAHHH` 543ms + `Mmawe` 482ms = **1,024ms**인데
실제 발화는 **617ms**뿐이다(무음 탐지 -40dB). 팀장 청취로 `AAAAAHHH` 누락 확인.

전처리(`tts_targets.sanitize`)는 무죄다 — 텍스트를 한 글자도 바꾸지 않고 그대로
Polly에 넘겼다(`changed: False` 실측). 원인은 Polly의 대문자 표기늘림 렌더링이다.
같은 엔진·보이스로 **소문자 `aaaaahhh`를 단독 합성하면 543ms 정상 발화**가 나온다.

★ 이 스크립트는 Polly 호출과 로컬 파일 생성만 한다. **Storage 업로드·DB 쓰기 0건.**

실행
----
    # ① 표기 시험 — 두 표기를 합성해 발화량 비교 (Polly 4회, 약 $0.008)
    python scripts/audit/resynth_caps.py --trial

    # ② 확정 표기로 4면 재합성 (Polly 8회, 약 $0.015)
    python scripts/audit/resynth_caps.py --apply --notation lower
    python scripts/audit/resynth_caps.py --apply --notation title

출력: scripts/audit/out/resynth/{trial,apply}/...  (out/ 규칙이라 git 미추적)
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PILOT = HERE.parent / "tts_pilot"
sys.path.insert(0, str(PILOT))

# D6 원칙 — 합성 루틴·프리셋을 본문 파이프라인에서 그대로 가져온다(로컬 복제 금지).
# synth_unit은 mp3 + word marks를 만들고 atempo 감속 후 marks time을 1/atempo로
# 스케일해 저장한다(run_tts_fullbatch.py:305-344). 재합성도 같은 산출물이어야 한다.
from run_tts_fullbatch import PRESETS, find_ffmpeg, synth_unit  # noqa: E402
from tts_targets import sanitize  # noqa: E402

OUT = HERE / "out" / "resynth"
PRESET_KEY = "danielle-longform"

#: 대상 문구 — 이 책의 p1·p4·p7·p10이 모두 같은 텍스트다(R-0 실측).
PHRASE = "AAAAAHHH!!!! Mmawe!"
BOOK_SLUG = "book_dash-aaaaahhh-mmawe"
#: book_text.page_index (0-based). Storage 키의 pNN은 page_index+1이다.
TARGET_PAGES = [1, 4, 7, 10]

#: 기대 발화량 하한 — 두 단어 단독 합 1,024ms의 85%.
EXPECT_MIN_MS = 870

#: 대문자 표기늘림 토큰 — 같은 글자가 3연속 이상 들어간 대문자 3자+ 낱말.
#: `NGO`·`USA`·`GOD`·`ABC`·`THE` 같은 약어·강조 대문자는 같은 글자 3연속이 없어
#: 자연히 대상에서 빠진다(R-0 설계 B안 — A안의 약어 오변환 위험을 피한 이유).
CAPS_STRETCH_RE = re.compile(r"\b(?=[A-Z]{3,}\b)(?=\w*?([A-Z])\1{2,})[A-Z]+\b")

#: 규칙에는 걸리지만 **변환하면 안 되는** 토큰 (R-1 지시서 e항).
#:   WWW — 웹 주소 표기다. 소문자화하면 Polly가 낱자로 읽던 것을 다르게 읽을 위험이
#:   있어 원형을 지킨다.
CAPS_STRETCH_KEEP = frozenset({"WWW", "WWWW"})


def to_lower(token: str) -> str:
    return token.lower()


def to_title(token: str) -> str:
    return token[0] + token[1:].lower()


NOTATIONS = {"lower": to_lower, "title": to_title}


def rewrite(text: str, notation: str) -> str:
    """대문자 표기늘림 토큰만 지정 표기로 바꾼다. 다른 대문자는 건드리지 않는다."""
    fn = NOTATIONS[notation]

    def one(m: re.Match[str]) -> str:
        tok = m.group(0)
        return tok if tok in CAPS_STRETCH_KEEP else fn(tok)

    return CAPS_STRETCH_RE.sub(one, text)


SIL = re.compile(r"silence_(start|end): ([0-9.]+)")


def speech_ms(ffmpeg: str, path: Path) -> tuple[float, float]:
    """(전체 ms, 실제 발화 ms). R-0 조사와 동일한 -40dB / 0.05s 기준."""
    # encoding="utf-8" 명시 — errors="replace"만으로는 로케일 코덱(cp949)이 그대로 쓰여
    # 한글 경로가 섞인 ffmpeg 출력이 깨진다. silencedetect 값은 ASCII라 파싱은 되지만
    # 원인 추적이 어려워지므로 인코딩을 고정한다(2026-08-21 R-1).
    r = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", str(path),
         "-af", "silencedetect=noise=-40dB:d=0.05", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    err = r.stderr or ""
    m = re.search(r"Duration: (\d+):(\d+):([0-9.]+)", err)
    if not m:
        return 0.0, 0.0
    total = (int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))) * 1000
    sil = 0.0
    start = None
    for k, v in [(k, float(v) * 1000) for k, v in SIL.findall(err)]:
        if k == "start":
            start = v
        elif start is not None:
            sil += max(0.0, v - start)
            start = None
    if start is not None:
        sil += max(0.0, total - start)
    return total, total - sil


def make_polly(preset: dict):
    try:
        import boto3
    except ImportError:
        raise SystemExit("[FAIL] boto3 미설치")
    import botocore.exceptions
    client = boto3.client("polly", region_name=preset["region"])
    try:
        boto3.Session().client("sts").get_caller_identity()
    except botocore.exceptions.NoCredentialsError:
        raise SystemExit(
            "[STOP] AWS 자격 증명이 없습니다. 키를 설정한 셸에서 실행하세요."
        )
    return client


def run_trial(preset: dict, ffmpeg: str) -> int:
    dest = OUT / "trial"
    raw = dest / "_raw"
    polly = make_polly(preset)
    print(f"[원문] {PHRASE!r}")
    print(f"[기준] 두 단어 단독 합 1,024ms · 정상 판정 하한 {EXPECT_MIN_MS}ms\n")

    rows = []
    for name in ("lower", "title"):
        text = rewrite(PHRASE, name)
        sanitized, diag = sanitize(text)
        info = synth_unit(polly, ffmpeg, preset, dest, raw, name, sanitized)
        mp3 = dest / f"{name}.mp3"
        total, sp = speech_ms(ffmpeg, mp3)
        marks = [json.loads(l) for l in (dest / f"{name}.marks.json")
                 .read_text(encoding="utf-8").splitlines() if l.strip()]
        ok = sp >= EXPECT_MIN_MS
        rows.append({"notation": name, "text": sanitized, "total_ms": round(total),
                     "speech_ms": round(sp), "words": info["words"], "ok": ok,
                     "marks": [(m["value"], m["time"]) for m in marks]})
        print(f"[{name}] {sanitized!r}")
        print(f"   sanitize 변경: {diag['changed']}")
        print(f"   전체 {total:.0f}ms · 실제 발화 {sp:.0f}ms  → {'✅ 정상' if ok else '❌ 여전히 부족'}")
        print(f"   marks: {[(m['value'], m['time']) for m in marks]}")
        print(f"   파일: {mp3}\n")

    (dest / "_trial_report.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    good = [r for r in rows if r["ok"]]
    if not good:
        print("[STOP] 두 표기 모두 기대 발화량에 못 미칩니다. 다른 표기 설계가 필요합니다.")
        return 2
    print(f"[결과] 통과 표기: {[r['notation'] for r in good]}")
    print("팀장 청취 후 --apply --notation <lower|title> 로 4면 재합성하세요.")
    return 0


def run_apply(preset: dict, ffmpeg: str, notation: str) -> int:
    dest = OUT / "apply" / notation
    raw = dest / "_raw"
    polly = make_polly(preset)
    text = rewrite(PHRASE, notation)
    sanitized, _ = sanitize(text)
    print(f"[표기] {notation} · {sanitized!r}")
    print(f"[대상] page_index {TARGET_PAGES} (Storage 키는 pNN = index+1)\n")

    rows = []
    bad = []
    for pi in TARGET_PAGES:
        unit = f"p{pi + 1:02d}"
        info = synth_unit(polly, ffmpeg, preset, dest, raw, unit, sanitized)
        total, sp = speech_ms(ffmpeg, dest / f"{unit}.mp3")
        ok = sp >= EXPECT_MIN_MS
        if not ok:
            bad.append(unit)
        rows.append({"page_index": pi, "unit": unit, "total_ms": round(total),
                     "speech_ms": round(sp), "ok": ok,
                     "mp3": f"{BOOK_SLUG}/{preset['voice_key']}/{unit}.mp3",
                     "marks": f"{BOOK_SLUG}/{preset['voice_key']}/{unit}.marks.json"})
        print(f"  {unit}  전체 {total:>6.0f}ms · 발화 {sp:>6.0f}ms  {'✅' if ok else '❌'}")

    (dest / "_apply_report.json").write_text(
        json.dumps({"notation": notation, "text": sanitized, "pages": rows},
                   ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n[저장] {dest}")
    if bad:
        print(f"[STOP] 기대 발화량 미달: {bad} — 업로드하지 마십시오.")
        return 2
    print("[완료] 4면 전부 정상. 업로드 단계로 진행 가능합니다.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trial", action="store_true", help="두 표기 시험 합성")
    ap.add_argument("--apply", action="store_true", help="확정 표기로 4면 재합성")
    ap.add_argument("--notation", choices=sorted(NOTATIONS), help="--apply 시 필수")
    args = ap.parse_args()

    preset = PRESETS[PRESET_KEY]
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("[STOP] ffmpeg 없음 — atempo 감속 불가.")
        return 2

    if args.trial:
        return run_trial(preset, ffmpeg)
    if args.apply:
        if not args.notation:
            print("[STOP] --notation lower|title 를 지정하세요.")
            return 2
        return run_apply(preset, ffmpeg, args.notation)

    print("--trial 또는 --apply --notation <lower|title> 중 하나를 지정하세요.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
