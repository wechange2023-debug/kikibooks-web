#!/usr/bin/env python3
"""gen_cover_danielle.py — 시범 12권 표지 제목 낭독 생성 (ADR-0034 Amd#1 kind='cover').

★ 본문과 100% 동일 파이프라인: run_tts_batch_v2.py의 함수·상수를 그대로 import한다.
   (VOICE/ENGINE/REGION/SAMPLE_RATE/ATEMPO/MP3_QUALITY/normalize_text/synth 흐름)
   파라미터를 재선언하지 않으므로 본문과 표지가 어긋날 수 없다.
   — 기존 gen_cover.py가 generate_tts.py를 import한 것과 동일한 선례.

★ 로컬 산출물만: out/audio_danielle/{slug}/cover.* + _raw/{slug}/cover.native.*
   Storage 업로드·DB 쓰기 없음. AWS는 boto3 기본 체인 + region_name 오버라이드만.

낭독 문장 = books.title **원문 그대로**(브리지 export의 title).
   ※ 구 44권 배치는 "{title}. Created by {author}." 였으나, 이번 확정 사양은 제목만이다.
   ※ 정규화는 본문과 동일한 normalize_text만 적용한다. 임의 치환(느낌표 축약 등) 금지 —
     marks의 start/end가 이 문자열 기준 바이트 오프셋이라, 뷰어가 표시하는 문자열과
     1바이트라도 다르면 하이라이트가 어긋난다.

사용:
    python scripts/tts_pilot/gen_cover_danielle.py --dry-run   # 문장만 출력(비용 0)
    python scripts/tts_pilot/gen_cover_danielle.py             # 12권 생성(⚠️ Polly 과금)
    python scripts/tts_pilot/gen_cover_danielle.py --slugs baby-babble
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from run_tts_batch_v2 import (  # noqa: E402
    ATEMPO,
    DEST_ROOT,
    ENGINE,
    LANG,
    MP3_QUALITY,
    OUT_DIR,
    PILOT_COHORT,
    RAW_ROOT,
    REGION,
    REP_SLUGS,
    SAMPLE_RATE,
    VOICE,
    duration_ms,
    find_ffmpeg,
    normalize_text,
    parse_marks,
    polly_call,
    write_marks,
)

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

BRIDGE_EXPORT = OUT_DIR.parent / "in" / "book_text_export.json"


def load_titles() -> dict[str, str]:
    """브리지 export(팀장 SQL export)의 books.title — 낭독 정본."""
    rows = json.loads(BRIDGE_EXPORT.read_text(encoding="utf-8"))
    titles: dict[str, str] = {}
    for r in rows:
        titles.setdefault(r["slug"], r["title"])
    return titles


def synth_cover(polly, ffmpeg: str, slug: str, text: str) -> dict:
    """표지 1건: 평문 합성 → 원본 보존 → atempo 감속 → marks 스케일. 본문 페이지와 동일."""
    raw_dir = RAW_ROOT / slug
    dest_dir = DEST_ROOT / slug
    raw_dir.mkdir(parents=True, exist_ok=True)
    dest_dir.mkdir(parents=True, exist_ok=True)

    native_mp3 = raw_dir / "cover.native.mp3"
    native_marks_p = raw_dir / "cover.native.marks.json"
    dest_mp3 = dest_dir / "cover.mp3"
    dest_marks_p = dest_dir / "cover.marks.json"

    r = polly_call(polly, Text=text, TextType="text", OutputFormat="mp3",
                   VoiceId=VOICE, Engine=ENGINE, LanguageCode=LANG,
                   SampleRate=SAMPLE_RATE)
    native_mp3.write_bytes(r["AudioStream"].read())

    r = polly_call(polly, Text=text, TextType="text", OutputFormat="json",
                   VoiceId=VOICE, Engine=ENGINE, LanguageCode=LANG,
                   SpeechMarkTypes=["word"])
    raw = r["AudioStream"].read().decode("utf-8")
    native_marks_p.write_text(raw, encoding="utf-8")
    native_marks = parse_marks(raw)

    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(native_mp3),
           "-filter:a", f"atempo={ATEMPO}", "-ar", SAMPLE_RATE,
           "-q:a", MP3_QUALITY, str(dest_mp3)]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0 or not dest_mp3.exists():
        raise RuntimeError(f"ffmpeg rc={p.returncode}: {p.stderr.strip()[:200]}")

    scaled = [{**m, "time": int(round(m["time"] / ATEMPO))} for m in native_marks]
    write_marks(dest_marks_p, scaled)

    nat_ms = duration_ms(ffmpeg, native_mp3)
    out_ms = duration_ms(ffmpeg, dest_mp3)
    ratio = round(out_ms / nat_ms, 4) if nat_ms and out_ms else None
    return {
        "kind": "cover", "file": "cover.mp3", "marks_file": "cover.marks.json",
        "text": text, "words": len(scaled), "chars": len(text),
        "native_ms": nat_ms, "out_ms": out_ms,
        "ratio": ratio, "ratio_theoretical": round(1 / ATEMPO, 4),
        "ratio_err_pct": round((ratio / (1 / ATEMPO) - 1) * 100, 3) if ratio else None,
        "mp3_bytes": dest_mp3.stat().st_size,
        "last_mark_ms": scaled[-1]["time"] if scaled else None,
        "ok": True,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="시범 12권 표지 제목 낭독 (Danielle long-form)")
    ap.add_argument("--dry-run", action="store_true", help="문장만 출력(Polly 호출 0)")
    ap.add_argument("--slugs", default=None, help="쉼표구분 slug 화이트리스트")
    args = ap.parse_args()

    titles = load_titles()
    targets = ([s.strip() for s in args.slugs.split(",") if s.strip()]
               if args.slugs else list(PILOT_COHORT))
    targets = ([s for s in targets if s in REP_SLUGS]
               + [s for s in targets if s not in REP_SLUGS])

    missing = [s for s in targets if s not in titles]
    if missing:
        print(f"[FAIL] 브리지 export에 title 없음: {missing}")
        return 1

    print(f"[INFO] {len(targets)}권 표지 · voice={VOICE} engine={ENGINE} region={REGION} "
          f"atempo={ATEMPO} rate={SAMPLE_RATE}Hz")
    for s in targets:
        print(f"  {'★' if s in REP_SLUGS else ' '} {s:<32} “{normalize_text(titles[s])}”")
    if args.dry_run:
        print("[DRY-RUN] 문장 확인 전용 — Polly 호출 없이 종료.")
        return 0

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("[STOP] ffmpeg 미설치 — 시스템 PATH·imageio_ffmpeg 모두 없음.")
        return 2
    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치")
        return 1
    polly = boto3.client("polly", region_name=REGION)

    print("=" * 72)
    results, ok, failed = [], 0, 0
    for slug in targets:
        text = normalize_text(titles[slug])
        try:
            entry = synth_cover(polly, ffmpeg, slug, text)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            msg = f"{type(exc).__name__}: {exc}"
            print(f"[FAIL] {slug}: {msg}")
            results.append({"slug": slug, "ok": False, "error": msg})
            continue
        ok += 1
        entry["slug"] = slug
        results.append(entry)
        print(f"[OK]   {slug:<32} words={entry['words']} {entry['out_ms']}ms "
              f"ratio={entry['ratio']} err={entry['ratio_err_pct']}%")

        # 권별 매니페스트에 cover 항목 병합(기존 pages 보존).
        man_p = DEST_ROOT / slug / "_manifest.json"
        if man_p.exists():
            man = json.loads(man_p.read_text(encoding="utf-8"))
            man["cover"] = entry
            man_p.write_text(json.dumps(man, ensure_ascii=False, indent=2), encoding="utf-8")

    rp = OUT_DIR / "_tts_cover_danielle_report.json"
    errs = [r["ratio_err_pct"] for r in results if r.get("ok") and r.get("ratio_err_pct")]
    rp.write_text(json.dumps(
        {"voice": VOICE, "engine": ENGINE, "region": REGION, "atempo": ATEMPO,
         "sample_rate": SAMPLE_RATE, "encode": f"VBR -q:a {MP3_QUALITY}",
         "text_source": "books.title (브리지 export) — 원문 그대로, normalize_text만 적용",
         "ratio_err_pct_min": min(errs) if errs else None,
         "ratio_err_pct_max": max(errs) if errs else None,
         "covers": results}, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 72)
    print(f"[DONE] 성공 {ok} / 실패 {failed} → {rp.name}")
    return 0 if failed == 0 else 3


if __name__ == "__main__":
    raise SystemExit(main())
