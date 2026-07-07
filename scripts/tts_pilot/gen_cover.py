#!/usr/bin/env python3
"""
gen_cover.py — v1 html 배치 표지(cover) 오디오 생성 (TTS 파일럿 보조, 로컬 전용)

★ 파일럿 전용 격리 스크립트. DB/스키마/Supabase 무접촉. 로컬 out/audio/ 만 쓴다.
★ 본문과 100% 동일 파이프라인: generate_tts.py의 함수(normalize_text·ssml_payload·
   make_mark_adjuster·synth_mp3·synth_word_marks·pick_voice)를 그대로 import해 사용.
   파라미터도 본문과 동일: engine=neural, voice=Ruth, rate=78, natural=True.

데이터 소스(44권 동적): scratchpad/tts_recon_49.csv(팀장 DB export)의 slug·title·author.
   무텍스트 5권 제외 → 44권. 표지 문장 = "{title}. Created by {author}." (html.unescape 적용).
출력 : out/audio/{slug}-cover.mp3, out/audio/{slug}-cover.marks.json (본문 파일과 구분되는 이름).

사용:
    python scripts/tts_pilot/gen_cover.py --dry-run   # 44권 문장만 출력(비용 0, 게이트)
    python scripts/tts_pilot/gen_cover.py             # 표지 오디오 44권 생성(⚠️ Polly 비용)

AWS 자격증명은 boto3 기본 체인에서 로드. 키값 출력·기록 금지.
"""
from __future__ import annotations

import argparse
import csv
import html
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

REPO = Path(__file__).resolve().parent.parent.parent
RECON_CSV = REPO / "scratchpad" / "tts_recon_49.csv"

# 무텍스트 5권 — 표지 배치에서도 제외(본문 배치와 동일 코호트 유지)
EXCLUDE = {
    "hugs-in-the-city", "i-can-dress-myself", "it-wasnt-me",
    "katiitis-song", "the-lion-who-wouldnt-try",
}


def load_covers() -> tuple[list[tuple[str, str]], list[tuple[str, str, str]]]:
    """(slug, cover_sentence) 44건 + 이상목록(author/title 비었거나 이상) 반환."""
    if not RECON_CSV.exists():
        raise FileNotFoundError(f"데이터 소스 없음: {RECON_CSV}")
    rows = list(csv.DictReader(RECON_CSV.read_text(encoding="utf-8").splitlines()))
    covers: list[tuple[str, str]] = []
    bad: list[tuple[str, str, str]] = []
    for r in rows:
        slug = (r.get("slug") or "").strip()
        if not slug or slug in EXCLUDE:
            continue
        title = html.unescape((r.get("title") or "").strip())
        author = html.unescape((r.get("author") or "").strip())
        if not title or not author:
            bad.append((slug, title, author))
        covers.append((slug, f"{title}. Created by {author}."))
    return covers, bad


def main() -> int:
    ap = argparse.ArgumentParser(description="v1 html 배치 표지 오디오 생성")
    ap.add_argument("--dry-run", action="store_true",
                    help="Polly 호출 없이 44권 표지 문장만 출력(생성 전 눈 확인 게이트)")
    ap.add_argument("--only", default=None,
                    help="지정 slug 1권만 처리(부분 재생성용). 기본 전체 44권")
    args = ap.parse_args()

    covers, bad = load_covers()
    if args.only:
        covers = [(s, t) for s, t in covers if s == args.only]
        bad = [b for b in bad if b[0] == args.only]
        if not covers:
            print(f"[FAIL] --only {args.only!r} 대상 없음(코호트 44권 밖 또는 오타)")
            return 1
    print(f"[INFO] 표지 대상 {len(covers)}권 (49 - 제외 {len(EXCLUDE)})")
    print("=" * 88)
    for slug, sentence in covers:
        print(f"  {slug:36} {sentence}")
    print("=" * 88)

    if bad:
        print(f"[STOP] author/title 이상 {len(bad)}권 — 표지 생성 중단(팀장 확인 필요):")
        for slug, title, author in bad:
            print(f"  - {slug}: title={title!r} author={author!r}")
        return 2
    print(f"[OK] author/title 이상 0건 / 대상 {len(covers)}권")

    if args.dry_run:
        print("[DRY-RUN] 문장 확인 전용 — Polly 호출 없이 종료.")
        return 0

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

    ok, fail = 0, []
    for slug, raw in covers:
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
            print(f"  [{slug:36}] FAIL — {type(exc).__name__}: {exc}")
            fail.append(slug)
            continue
        last = marks[-1]["time"] if marks else None
        ok += 1
        print(f"  [{slug:36}] mp3={n}B words={len(marks)} lastMark={last}ms")

    print("=" * 88)
    print(f"[DONE] 표지 성공 {ok}권 / 실패 {len(fail)}권")
    if fail:
        for slug in fail:
            print(f"  FAIL {slug}")
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
