#!/usr/bin/env python3
"""책 퀴즈 질문 음성 합성 (ADR-0065 Amendment #2 D-B4 · Q-2a).

문항 지시문 3종을 **한국어 Polly Seoyeon**으로 합성한다.

★ Storage 업로드 0건 · DB 접근 0건. **로컬 파일만** 만든다(업로드는 팀장 전속).
★ speech marks를 만들지 않는다 — 지시문에는 하이라이트할 것이 없다.
  따라서 SynthesizeSpeech 호출은 **문항당 1회**다(본문 낭독은 mp3+marks로 2회였다).

대본 출처:
  `lib/book/copy.ts`의 `QUIZ_COPY.questionPrompts`를 **파싱해서** 읽는다.
  대본을 이 파일에 복사해 두지 않는다 — 화면 문구와 음성이 어긋나는 경로를 원천 차단한다
  (D-B4 "음성만으로 전달하지 않는다" = 둘은 반드시 같은 문장이어야 한다).

감속(atempo) 방침 — **기본 없음**:
  본문 낭독의 `atempo=0.85`는 **영어를 배우는 한국 아이**를 위한 규칙이었다
  (ADR-0052 Amd#2 · run_tts_fullbatch.py:63-70 `danielle-longform`).
  질문 지시문은 **모국어**라 같은 근거가 성립하지 않는다. 그래서 기본은 원속이고,
  `--atempo 0.85`로 감속본도 만들어 **팀장 청취로 결정**한다.
  두 버전은 서로 다른 폴더에 나온다(native / atempo) — 덮어쓰지 않는다.

Polly 엔진:
  Seoyeon은 long-form을 지원하지 않는다(long-form은 영어 전용). neural을 쓴다.
  region은 기존 파이프라인과 같은 us-east-1.

실행 (팀장 별도 터미널 — AWS 키는 이 세션에 두지 않는다):
    # 1) AWS 자격증명 세팅
    export AWS_ACCESS_KEY_ID=...
    export AWS_SECRET_ACCESS_KEY=...
    #    (PowerShell:  $env:AWS_ACCESS_KEY_ID="..."  $env:AWS_SECRET_ACCESS_KEY="...")

    # 2) 비용·대본 확인만 (과금 0)
    python scripts/quiz_pilot/synth_questions.py --dry-run

    # 3) 원속 3개 생성
    python scripts/quiz_pilot/synth_questions.py

    # 4) 감속본도 만들어 비교 (선택)
    python scripts/quiz_pilot/synth_questions.py --atempo 0.85

출력: scripts/quiz_pilot/out/questions/native/{q1,q2,q3}.mp3
      scripts/quiz_pilot/out/questions/atempo/{q1,q2,q3}.mp3   (--atempo 지정 시)
      scripts/quiz_pilot/out/questions/_report.json
      (out/ 는 .gitignore 대상이라 저장소에 올라가지 않는다)
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "scripts" / "tts_pilot"))

# ADR-0065 Amd#1 D6 원칙 — ffmpeg 탐색·비용 모델·재시도를 본문 파이프라인에서 그대로
# 가져온다. 로컬 복제본을 만들지 않는다(gen_all_words.py:47-53 선례).
from run_tts_fullbatch import (  # noqa: E402
    MP3_QUALITY,
    estimate,
    find_ffmpeg,
    polly_call,
)

OUT = HERE / "out" / "questions"
COPY_TS = ROOT / "lib" / "book" / "copy.ts"

#: 한국어 지시문 프리셋. run_tts_fullbatch.PRESETS에 넣지 않는 이유 —
#: 그 사전은 **책 낭독** 보이스 목록이고, 여기 목소리는 화면 UI 안내용이라 층위가 다르다.
#: 기계 부품(polly_call·find_ffmpeg·estimate)은 위에서 공유하므로 D6 취지는 지켜진다.
PRESET = {
    "voice": "Seoyeon",
    "voice_key": "seoyeon",
    "engine": "neural",        # Seoyeon은 long-form 미지원(영어 전용)
    "region": "us-east-1",
    "lang": "ko-KR",
    "sample_rate": "24000",
    "usd_per_million": 16.0,   # neural 단가
}

#: 기대 문항 수. lib/book/copy.ts에서 파싱한 개수가 다르면 STOP한다.
EXPECTED_QUESTIONS = 3


# ─────────────────────────────────────────────────────────────────────────────
# 대본 — lib/book/copy.ts 단일 출처에서 읽는다
# ─────────────────────────────────────────────────────────────────────────────
_BLOCK_RE = re.compile(r"questionPrompts:\s*\{(.*?)\}", re.S)
_ENTRY_RE = re.compile(r"(q[123])\s*:\s*'([^']*)'")


def load_prompts() -> dict[str, str]:
    """`QUIZ_COPY.questionPrompts`를 파싱한다. 대본 이중화 금지(파일 상단 참조)."""
    if not COPY_TS.exists():
        print(f"[STOP] 대본 출처 없음 - {COPY_TS}")
        raise SystemExit(2)
    src = COPY_TS.read_text(encoding="utf-8")
    block = _BLOCK_RE.search(src)
    if not block:
        print("[STOP] copy.ts에서 questionPrompts 블록을 찾지 못했다. 구조가 바뀌었는가?")
        raise SystemExit(2)
    prompts = dict(_ENTRY_RE.findall(block.group(1)))
    if len(prompts) != EXPECTED_QUESTIONS:
        print(f"[STOP] 지시문 {len(prompts)}개 - {EXPECTED_QUESTIONS}개를 기대했다: {prompts}")
        raise SystemExit(2)
    return prompts


# ─────────────────────────────────────────────────────────────────────────────
# 합성
# ─────────────────────────────────────────────────────────────────────────────
def synth_one(polly, text: str, dest: Path) -> int:
    """평문 1문장 합성. marks 미생성이라 호출 1회."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    audio = polly_call(
        polly,
        Text=text,
        TextType="text",
        OutputFormat="mp3",
        VoiceId=PRESET["voice"],
        Engine=PRESET["engine"],
        LanguageCode=PRESET["lang"],
        SampleRate=PRESET["sample_rate"],
    )["AudioStream"].read()
    dest.write_bytes(audio)
    return len(audio)


def slow_down(ffmpeg: str, atempo: float, src: Path, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
           "-filter:a", f"atempo={atempo}", "-ar", PRESET["sample_rate"],
           "-q:a", MP3_QUALITY, str(dest)]
    # encoding/errors 고정 — 저장소 경로에 한글이 있어 실패 시 로케일 코덱(cp949)으로
    # 디코드하면 진짜 원인 대신 UnicodeDecodeError가 보인다(2026-08-21 R-1 교훈).
    p = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if p.returncode != 0 or not dest.exists():
        raise RuntimeError(f"ffmpeg rc={p.returncode}: {(p.stderr or '').strip()[:200]}")
    return dest.stat().st_size


def main() -> int:
    ap = argparse.ArgumentParser(description="책 퀴즈 질문 음성 합성 (Seoyeon)")
    ap.add_argument("--dry-run", action="store_true",
                    help="대본·비용만 출력하고 Polly를 호출하지 않는다(과금 0)")
    ap.add_argument("--atempo", type=float, default=None, metavar="RATE",
                    help="감속본도 만든다(예: 0.85). 미지정이면 원속만 - 기본은 감속 없음")
    args = ap.parse_args()

    prompts = load_prompts()
    chars = sum(len(t) for t in prompts.values())
    usd = estimate(chars, PRESET["usd_per_million"], 1)  # marks 미생성 -> 호출 1회

    tempo_note = f"atempo={args.atempo} (원속본도 함께 남는다)" if args.atempo else "없음(원속)"

    print(f"[대본] lib/book/copy.ts questionPrompts ({len(prompts)}개)")
    for k in sorted(prompts):
        print(f"   {k}: {prompts[k]}  ({len(prompts[k])}자)")
    print(f"[보이스] {PRESET['voice']} / {PRESET['engine']} / {PRESET['lang']} / {PRESET['region']}")
    print(f"[감속] {tempo_note}")
    print(f"[비용] {chars}자 x ${PRESET['usd_per_million']}/M = ${usd:.5f}")

    if args.dry_run:
        print("\n[dry-run] Polly 호출 0건. 실제 생성은 --dry-run 없이 실행한다.")
        return 0

    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치 - pip install boto3")
        return 1

    ffmpeg = ""
    if args.atempo:
        ffmpeg = find_ffmpeg()
        if not ffmpeg:
            print("[STOP] ffmpeg 없음 - atempo 감속 불가(시스템 PATH·imageio_ffmpeg 모두 없음).")
            return 2

    try:
        polly = boto3.client("polly", region_name=PRESET["region"])
    except Exception as exc:  # noqa: BLE001
        print(f"[STOP] Polly 클라이언트 생성 실패 - {exc}")
        return 2

    started = time.time()
    results = []
    for qid in sorted(prompts):
        text = prompts[qid]
        native = OUT / "native" / f"{qid}.mp3"
        try:
            n_bytes = synth_one(polly, text, native)
            row = {"id": qid, "text": text, "chars": len(text),
                   "native_bytes": n_bytes, "native": str(native)}
            print(f"[OK] {qid} native {n_bytes:,}B")
            if args.atempo:
                slowed = OUT / "atempo" / f"{qid}.mp3"
                a_bytes = slow_down(ffmpeg, args.atempo, native, slowed)
                row.update({"atempo": args.atempo, "atempo_bytes": a_bytes,
                            "slowed": str(slowed)})
                print(f"     {qid} atempo={args.atempo} {a_bytes:,}B")
            results.append(row)
        except Exception as exc:  # noqa: BLE001
            print(f"[FAIL] {qid} - {exc}")
            results.append({"id": qid, "text": text, "error": str(exc)[:200]})

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "_report.json").write_text(json.dumps({
        "preset": PRESET, "atempo": args.atempo,
        "elapsed_sec": round(time.time() - started, 1),
        "usd_estimate": round(usd, 5), "results": results,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    failed = [r for r in results if "error" in r]
    print(f"\n[완료] 성공 {len(results) - len(failed)}/{len(results)} - {OUT / '_report.json'}")
    if failed:
        print("[실패] " + ", ".join(r["id"] for r in failed))
        return 1

    print("\n다음 단계(팀장): 청취 후 채택본을 Storage에 업로드한다.")
    print(f"  버킷 book-audio / 키 _quiz/{PRESET['voice_key']}/{{q1,q2,q3}}.mp3 / Content-Type audio/mpeg")
    return 0


if __name__ == "__main__":
    sys.exit(main())
