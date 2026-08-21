"""AAAAAHHH 4면 재합성 (R-1) — 표기 후보 시험 → 확정 표기로 재합성.

배경 (R-0 조사 · R-1 시험 확정)
-------------------------------
`AAAAAHHH!!!! Mmawe!` 면의 mp3에 **한 단어 분량이 통째로 없다**.
단독 합성 길이 합은 `AAAAAHHH` 543ms + `Mmawe` 482ms = **1,024ms**인데
실제 발화는 **617ms**뿐이다(무음 탐지 -40dB). 팀장 청취로 `AAAAAHHH` 누락 확인.

★ **대문자 가설은 반증됐다** (2026-08-21 시험).
  `AAAAAHHH!!!! Mmawe!` · `aaaaahhh!!!! Mmawe!` · `Aaaaahhh!!!! Mmawe!` 세 입력의
  mp3가 **바이트 단위로 동일**했다(md5 ad607f70…, 8444B, 발화 617ms, marks 좌표 동일).
  Polly가 합성 전에 대소문자를 정규화하므로 표기 변경만으로는 아무것도 바뀌지 않는다.

  반면 **단독 `aaaaahhh`는 543ms로 정상 발화**한다(단어카드용 자산). 차이는 두 가지뿐이다:
    ① 뒤에 붙은 `!!!!` (연속 문장부호)
    ② 뒤따르는 단어 `Mmawe`
  아래 후보는 이 둘을 **분리 검증**하도록 짰다(d·e가 진단용 대조군).

★ 이 스크립트는 Polly 호출과 로컬 파일 생성만 한다. **Storage 업로드·DB 쓰기 0건.**

marks 바이트 오프셋 문제
------------------------
입력 텍스트가 `book_text.text` 원문과 달라지면 Polly가 돌려주는 marks의
`start`/`end`가 **수정문 기준**이 된다. 그런데 리더는 그 오프셋으로 **원문**을 잘라
표시한다(components/book/highlighted-text.tsx:96-106 — `mark.value`가 아니라
`bytes.slice(m.start, m.end)`). 길이가 달라지면 엉뚱한 글자가 강조된다.

그래서 `remap_marks()`가 합성 후 marks를 **원문 좌표로 되돌린다**. 토큰 순서는
바뀌지 않으므로(문장부호·표기만 손댄다) 순서대로 1:1 재매핑하면 된다.
개수가 어긋나면 STOP한다 — 조용히 어긋난 하이라이트를 내보내지 않는다.

실행
----
    # ① 후보 시험 — mp3만 합성해 발화량 비교 (후보당 Polly 1회)
    python scripts/audit/resynth_caps.py --trial

    # ② 확정 후보로 4면 재합성 (mp3+marks, marks는 원문 좌표로 재매핑)
    python scripts/audit/resynth_caps.py --apply --candidate a_bang1

    # ③ marks 재매핑 자가 시험 (Polly 호출 0건)
    python scripts/audit/resynth_caps.py --selftest

출력: scripts/audit/out/resynth/  (out/ 규칙이라 git 미추적)
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
from run_tts_fullbatch import (  # noqa: E402
    PRESETS,
    MP3_QUALITY,
    find_ffmpeg,
    polly_call,
    synth_unit,
)
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

#: 시험 후보. key → (입력 텍스트, 의도)
#:   a·b·c = 팀장 지시 후보 / d·e = 원인 분리용 진단 대조군
CANDIDATES: dict[str, tuple[str, str]] = {
    "a_bang1":  ("Aaaaahhh! Mmawe!",    "느낌표 축소(!!!! → !)"),
    "b_short":  ("Aaah! Mmawe!",        "표기 단순화 + 느낌표 축소"),
    "c_comma":  ("Aaaaahhh, Mmawe!",    "쉼표 분리(!!!! → ,)"),
    "d_solo":   ("AAAAAHHH!!!!",        "진단: 후속 단어 제거 — !!!!만 남김"),
    "e_nobang": ("AAAAAHHH Mmawe!",     "진단: !!!! 제거 — 후속 단어만 남김"),
}

# ── 원문 좌표 재매핑 ────────────────────────────────────────────────────────
#: 리더가 쓰는 정규화와 동일 규칙(components/book/highlighted-text.tsx:47).
#: `[.!?]` 뒤에 공백 없이 따옴표/대문자가 오면 공백 1칸을 넣는다.
PUNCT_GAP_RE = re.compile(r"([.!?])(?=[“”‘’\"'A-Z])")

#: Polly가 word mark로 끊는 단위와 맞춘 토크나이저(알파벳 + 내부 아포스트로피).
TOKEN_RE = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)*")


def reader_normalize(text: str) -> str:
    """리더가 화면에 그리기 전 적용하는 정규화."""
    return PUNCT_GAP_RE.sub(r"\1 ", text)


def original_token_offsets(original: str) -> list[tuple[int, int, str]]:
    """원문(정규화 후)의 토큰별 **바이트** 오프셋. marks와 같은 좌표계다."""
    norm = reader_normalize(original)
    out: list[tuple[int, int, str]] = []
    for m in TOKEN_RE.finditer(norm):
        sb = len(norm[: m.start()].encode("utf-8"))
        eb = sb + len(m.group(0).encode("utf-8"))
        out.append((sb, eb, m.group(0)))
    return out


def remap_marks(marks: list[dict], original: str) -> list[dict]:
    """합성문 기준 marks를 **원문 기준 좌표**로 되돌린다.

    `time`은 그대로 둔다(실제 오디오의 시각이므로). `start`/`end`/`value`만
    원문 토큰의 것으로 바꾼다. 토큰 개수가 다르면 재매핑이 불가능하므로 예외를 던진다.
    """
    toks = original_token_offsets(original)
    words = [m for m in marks if m.get("type") == "word"]
    if len(words) != len(toks):
        raise RuntimeError(
            f"토큰 개수 불일치 — marks {len(words)}개 vs 원문 {len(toks)}개. "
            "재매핑 불가(하이라이트가 어긋나므로 진행 금지)."
        )
    out = []
    for m, (sb, eb, tok) in zip(words, toks):
        out.append({**m, "start": sb, "end": eb, "value": tok})
    return out


SIL = re.compile(r"silence_(start|end): ([0-9.]+)")


def speech_ms(ffmpeg: str, path: Path) -> tuple[float, float]:
    """(전체 ms, 실제 발화 ms). R-0 조사와 동일한 -40dB / 0.05s 기준.

    encoding="utf-8" 명시 — 로케일 코덱(cp949)으로 두면 한글 경로가 섞인 ffmpeg
    출력에서 UnicodeDecodeError가 나고 stderr가 None이 된다(2026-08-21 R-1 결함).
    """
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
        import botocore.exceptions
    except ImportError:
        raise SystemExit("[FAIL] boto3 미설치")
    client = boto3.client("polly", region_name=preset["region"])
    try:
        boto3.Session().client("sts").get_caller_identity()
    except botocore.exceptions.NoCredentialsError:
        raise SystemExit("[STOP] AWS 자격 증명이 없습니다. 키를 설정한 셸에서 실행하세요.")
    return client


def synth_mp3_only(polly, ffmpeg: str, preset: dict, dest: Path, name: str,
                   text: str) -> Path:
    """시험용 — **Polly 1회**(mp3만). speech marks는 받지 않는다(호출 절감)."""
    dest.mkdir(parents=True, exist_ok=True)
    raw = dest / "_raw"
    raw.mkdir(parents=True, exist_ok=True)
    audio = polly_call(
        polly, Text=text, TextType="text", OutputFormat="mp3",
        VoiceId=preset["voice"], Engine=preset["engine"],
        LanguageCode=preset["lang"], SampleRate=preset["sample_rate"],
    )["AudioStream"].read()
    native = raw / f"{name}.native.mp3"
    native.write_bytes(audio)
    out = dest / f"{name}.mp3"
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(native),
           "-filter:a", f"atempo={preset['atempo']}", "-ar", preset["sample_rate"],
           "-q:a", MP3_QUALITY, str(out)]
    p = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if p.returncode != 0 or not out.exists():
        raise RuntimeError(f"ffmpeg rc={p.returncode}: {(p.stderr or '').strip()[:200]}")
    return out


def run_trial(preset: dict, ffmpeg: str) -> int:
    dest = OUT / "trial2"
    polly = make_polly(preset)
    print(f"[원문] {PHRASE!r}  (현재 발화 617ms — 깨진 상태)")
    print(f"[기준] 두 단어 단독 합 1,024ms · 정상 판정 하한 {EXPECT_MIN_MS}ms")
    print(f"[호출] 후보 {len(CANDIDATES)}개 × Polly 1회 (mp3만)\n")

    rows = []
    for name, (text, intent) in CANDIDATES.items():
        sanitized, _ = sanitize(text)
        mp3 = synth_mp3_only(polly, ffmpeg, preset, dest, name, sanitized)
        total, sp = speech_ms(ffmpeg, mp3)
        # 진단 후보(d·e)는 단어 수가 달라 하한을 그대로 적용하지 않는다.
        diag = name.startswith(("d_", "e_"))
        ok = (sp >= EXPECT_MIN_MS) if not diag else None
        rows.append({"name": name, "text": sanitized, "intent": intent,
                     "total_ms": round(total), "speech_ms": round(sp),
                     "bytes": mp3.stat().st_size, "ok": ok})
        tag = "진단" if diag else ("✅ 정상" if ok else "❌ 부족")
        print(f"[{name}] {sanitized!r}  — {intent}")
        print(f"   전체 {total:>6.0f}ms · 발화 {sp:>6.0f}ms · {mp3.stat().st_size}B  → {tag}")
        print(f"   {mp3}\n")

    (dest / "_trial2_report.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    good = [r for r in rows if r["ok"]]
    print("── 진단 해석 ──")
    d = next((r for r in rows if r["name"] == "d_solo"), None)
    e = next((r for r in rows if r["name"] == "e_nobang"), None)
    if d:
        print(f"  d_solo(!!!!만): {d['speech_ms']}ms → "
              f"{'!!!!가 원인 아님' if d['speech_ms'] >= 400 else '★ !!!! 자체가 발화를 죽인다'}")
    if e:
        print(f"  e_nobang(후속 단어만): {e['speech_ms']}ms → "
              f"{'후속 단어 조합이 원인 아님' if e['speech_ms'] >= EXPECT_MIN_MS else '★ 후속 단어 조합이 원인'}")
    print()
    if not good:
        print("[STOP] a·b·c 모두 기대 발화량 미달. SSML 경로(d항) 설계로 넘어갑니다.")
        return 2
    print(f"[결과] 통과 후보: {[r['name'] for r in good]}")
    print("팀장 청취 후 --apply --candidate <이름> 으로 4면 재합성하세요.")
    return 0


def run_apply(preset: dict, ffmpeg: str, cand: str) -> int:
    if cand not in CANDIDATES:
        print(f"[STOP] 알 수 없는 후보: {cand} (가능: {sorted(CANDIDATES)})")
        return 2
    text, intent = CANDIDATES[cand]
    dest = OUT / "apply" / cand
    raw = dest / "_raw"
    polly = make_polly(preset)
    sanitized, _ = sanitize(text)
    print(f"[후보] {cand} · {sanitized!r} — {intent}")
    print(f"[원문] {PHRASE!r}")
    print(f"[대상] page_index {TARGET_PAGES} (Storage 키 pNN = index+1)\n")

    rows, bad = [], []
    for pi in TARGET_PAGES:
        unit = f"p{pi + 1:02d}"
        synth_unit(polly, ffmpeg, preset, dest, raw, unit, sanitized)
        mp3 = dest / f"{unit}.mp3"
        total, sp = speech_ms(ffmpeg, mp3)

        # marks를 **원문 좌표**로 되돌린다 — 리더 하이라이트가 원문을 자르기 때문.
        mpath = dest / f"{unit}.marks.json"
        marks = [json.loads(l) for l in mpath.read_text(encoding="utf-8").splitlines() if l.strip()]
        remapped = remap_marks(marks, PHRASE)
        mpath.write_text("".join(json.dumps(m, ensure_ascii=False) + "\n" for m in remapped),
                         encoding="utf-8")

        ok = sp >= EXPECT_MIN_MS
        if not ok:
            bad.append(unit)
        rows.append({"page_index": pi, "unit": unit, "total_ms": round(total),
                     "speech_ms": round(sp), "ok": ok,
                     "marks_remapped": [(m["value"], m["start"], m["end"], m["time"])
                                        for m in remapped],
                     "mp3_key": f"{BOOK_SLUG}/{preset['voice_key']}/{unit}.mp3",
                     "marks_key": f"{BOOK_SLUG}/{preset['voice_key']}/{unit}.marks.json"})
        print(f"  {unit}  전체 {total:>6.0f}ms · 발화 {sp:>6.0f}ms  {'✅' if ok else '❌'}"
              f"  marks 원문 좌표 재매핑 완료")

    (dest / "_apply_report.json").write_text(
        json.dumps({"candidate": cand, "text": sanitized, "original": PHRASE,
                    "pages": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n[저장] {dest}")
    if bad:
        print(f"[STOP] 기대 발화량 미달: {bad} — 업로드하지 마십시오.")
        return 2
    print("[완료] 4면 전부 정상. 업로드 단계로 진행 가능합니다.")
    return 0


def run_selftest() -> int:
    """marks 재매핑 자가 시험 — Polly 호출 0건."""
    print("marks 원문 좌표 재매핑 자가 시험 (Polly 호출 0건)\n")
    toks = original_token_offsets(PHRASE)
    print(f"원문 {PHRASE!r}")
    print(f"  정규화: {reader_normalize(PHRASE)!r}")
    print(f"  토큰 오프셋: {toks}\n")

    ok = True
    for name, (text, intent) in CANDIDATES.items():
        norm = reader_normalize(text)
        fake = []
        for i, m in enumerate(TOKEN_RE.finditer(norm)):
            sb = len(norm[: m.start()].encode("utf-8"))
            fake.append({"time": i * 300, "type": "word", "start": sb,
                         "end": sb + len(m.group(0).encode("utf-8")), "value": m.group(0)})
        try:
            re_ = remap_marks(fake, PHRASE)
            norm_orig = reader_normalize(PHRASE)
            b = norm_orig.encode("utf-8")
            sliced = [b[m["start"]:m["end"]].decode("utf-8") for m in re_]
            good = sliced == [t[2] for t in toks]
            ok &= good
            print(f"[{name}] {text!r}")
            print(f"   합성문 marks: {[(m['value'], m['start'], m['end']) for m in fake]}")
            print(f"   재매핑 후   : {[(m['value'], m['start'], m['end']) for m in re_]}")
            print(f"   원문 슬라이스: {sliced}  → {'✅ 일치' if good else '❌ 불일치'}\n")
        except RuntimeError as exc:
            # 토큰 수가 다른 후보(d_solo)는 재매핑 불가가 **정상**이다.
            expected = name.startswith("d_")
            print(f"[{name}] {text!r}")
            print(f"   {'✅ 예상된' if expected else '❌ 예상 밖'} 거부: {exc}\n")
            ok &= expected
    print("[PASS] 전부 통과" if ok else "[FAIL] 확인 필요")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trial", action="store_true", help="후보 시험 합성(후보당 Polly 1회)")
    ap.add_argument("--apply", action="store_true", help="확정 후보로 4면 재합성")
    ap.add_argument("--candidate", help="--apply 시 필수 (a_bang1 등)")
    ap.add_argument("--selftest", action="store_true", help="marks 재매핑 자가 시험(무비용)")
    args = ap.parse_args()

    if args.selftest:
        return run_selftest()

    preset = PRESETS[PRESET_KEY]
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("[STOP] ffmpeg 없음 — atempo 감속 불가.")
        return 2

    if args.trial:
        return run_trial(preset, ffmpeg)
    if args.apply:
        if not args.candidate:
            print(f"[STOP] --candidate 를 지정하세요 (가능: {sorted(CANDIDATES)}).")
            return 2
        return run_apply(preset, ffmpeg, args.candidate)

    print("--trial · --apply --candidate <이름> · --selftest 중 하나를 지정하세요.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
