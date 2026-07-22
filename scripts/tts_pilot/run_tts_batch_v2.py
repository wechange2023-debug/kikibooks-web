#!/usr/bin/env python3
"""run_tts_batch_v2.py — 12권 배치 TTS 생성 v2 (ADR-0052 Amendment #2 확정 사양).

확정 사양 (2026-07-22 팀장)
--------------------------
  보이스   Danielle
  엔진     long-form (리전 us-east-1 — boto3 client 파라미터 오버라이드만, ~/.aws 무변경)
  입력     평문 (SSML 미사용 — long-form 내부 타임스트레치 울림 회피)
  감속     ffmpeg atempo=0.85 후처리 (VBR -q:a 2, 24000 Hz)
  marks    원본 time × (1/0.85) 선형 스케일

★ 기존 v1 경로 무수정: generate_tts.py·run_tts_batch.py·out/audio/(Ruth 산출물) 손대지 않는다.
★ Storage 업로드·DB 쓰기 없음. AWS 자격증명은 boto3 기본 체인(출력·기록 금지).

    입력  : out/{slug}.json                                   (build_tts_input.py 산출)
    산출  : out/audio_danielle/{slug}/pNN.mp3                 (감속 최종본)
            out/audio_danielle/{slug}/pNN.marks.json          (스케일된 word marks)
            out/audio_danielle/{slug}/_manifest.json          (권별 매니페스트)
            out/audio_danielle/_raw/{slug}/pNN.native.mp3     (원속도 원본, 디버그 보존)
            out/audio_danielle/_raw/{slug}/pNN.native.marks.json
            out/_tts_batch_danielle_report.json               (배치 요약)

NN = page (= book_text.page_index + 1), 2자리 zero-pad — ADR-0052 D5 축.
대표 3권을 항상 먼저 처리한다(D2). 한 권이 실패해도 중단하지 않고 다음 권으로 계속한다.

사용
----
    python scripts/tts_pilot/run_tts_batch_v2.py --rep-only
    python scripts/tts_pilot/run_tts_batch_v2.py
    python scripts/tts_pilot/run_tts_batch_v2.py --slugs baby-babble,a-day-out
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

PILOT_DIR = Path(__file__).resolve().parent
OUT_DIR = PILOT_DIR / "out"
DEST_ROOT = OUT_DIR / "audio_danielle"
RAW_ROOT = DEST_ROOT / "_raw"

REGION = "us-east-1"
ENGINE = "long-form"
LANG = "en-US"
VOICE = "Danielle"
SAMPLE_RATE = "24000"
ATEMPO = 0.85
MP3_QUALITY = "2"          # libmp3lame VBR -q:a
RETRY = 2                  # Polly 일시 오류 재시도 횟수
RATIO_TOLERANCE = 0.01     # 길이비 실측 오차 경고 임계(1%)

PILOT_COHORT = [
    "a-day-out", "a-trip-to-the-tap", "a-very-busy-day", "aaaaahhh-mmawe",
    "alexs-super-medicine", "amahle-wants-to-help", "ann-nem-oh-nee-finds-adventure",
    "auntie-bois-gift", "baby-babble", "baby-talk", "babys-first-family-photo",
    "banzis-busy-bees",
]
REP_SLUGS = ["a-trip-to-the-tap", "amahle-wants-to-help", "baby-babble"]

# generate_tts.py와 동일한 최소 교정('Mom.“Say' → 'Mom. “Say').
# 평문 입력이므로 marks 오프셋은 이 정규화된 텍스트 기준 → 매니페스트에 그대로 기록한다.
_PUNCT_GAP_RE = re.compile(r'([.!?])(?=[“”‘’"\'A-Z])')


def normalize_text(text: str) -> str:
    return _PUNCT_GAP_RE.sub(r"\1 ", text)


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


def write_marks(path: Path, marks: list[dict]) -> None:
    path.write_text("".join(json.dumps(m, ensure_ascii=False) + "\n" for m in marks),
                    encoding="utf-8")


def duration_ms(ffmpeg: str, path: Path) -> int | None:
    p = subprocess.run([ffmpeg, "-hide_banner", "-i", str(path)],
                       capture_output=True, text=True)
    for line in p.stderr.splitlines():
        line = line.strip()
        if line.startswith("Duration:"):
            t = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = t.split(":")
            return int((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)
    return None


def polly_call(polly, **kw):
    """일시 오류 재시도. 마지막 예외는 그대로 올린다."""
    last = None
    for attempt in range(RETRY + 1):
        try:
            return polly.synthesize_speech(**kw)
        except Exception as exc:  # noqa: BLE001
            last = exc
            if attempt < RETRY:
                time.sleep(1.5 * (attempt + 1))
    raise last  # type: ignore[misc]


def synth_page(polly, ffmpeg: str, slug: str, page: int, text: str) -> dict:
    """한 페이지: 평문 합성 → 원본 보존 → atempo 감속 → marks 스케일."""
    nn = f"p{page:02d}"
    raw_dir = RAW_ROOT / slug
    dest_dir = DEST_ROOT / slug
    raw_dir.mkdir(parents=True, exist_ok=True)
    dest_dir.mkdir(parents=True, exist_ok=True)

    native_mp3 = raw_dir / f"{nn}.native.mp3"
    native_marks_p = raw_dir / f"{nn}.native.marks.json"
    dest_mp3 = dest_dir / f"{nn}.mp3"
    dest_marks_p = dest_dir / f"{nn}.marks.json"

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
        "page": page, "file": f"{nn}.mp3", "marks_file": f"{nn}.marks.json",
        "words": len(scaled), "chars": len(text),
        "native_ms": nat_ms, "out_ms": out_ms,
        "ratio": ratio, "ratio_theoretical": round(1 / ATEMPO, 4),
        "ratio_err_pct": round((ratio / (1 / ATEMPO) - 1) * 100, 3) if ratio else None,
        "mp3_bytes": dest_mp3.stat().st_size,
        "last_mark_ms": scaled[-1]["time"] if scaled else None,
        "ok": True,
    }


def run_slug(polly, ffmpeg: str, slug: str) -> dict:
    src = OUT_DIR / f"{slug}.json"
    if not src.exists():
        return {"slug": slug, "ok": False, "error": f"입력 없음 out/{slug}.json"}
    scenes = json.loads(src.read_text(encoding="utf-8"))

    pages, skipped, failures = [], [], []
    for s in scenes:
        page = s["page"]
        text = normalize_text(s.get("text", "") or "")
        if not text.strip():
            skipped.append(page)
            continue
        try:
            entry = synth_page(polly, ffmpeg, slug, page, text)
            entry["text"] = text          # marks 오프셋 기준 텍스트(뷰어 동기화용)
            entry["image_url"] = s.get("image_url")
            pages.append(entry)
            print(f"    [p{page:02d}] words={entry['words']} {entry['out_ms']}ms "
                  f"ratio={entry['ratio']} err={entry['ratio_err_pct']}%")
        except Exception as exc:  # noqa: BLE001
            msg = f"{type(exc).__name__}: {exc}"
            failures.append({"page": page, "error": msg})
            print(f"    [p{page:02d}] FAIL {msg}")

    manifest = {
        "slug": slug, "voice": VOICE, "engine": ENGINE, "region": REGION,
        "sample_rate": SAMPLE_RATE, "atempo": ATEMPO,
        "encode": f"libmp3lame VBR -q:a {MP3_QUALITY}",
        "marks_scaling": f"native time x {round(1/ATEMPO, 4)}",
        "key_prefix": f"book_dash-{slug}/danielle",
        "pages_total": len(scenes), "audio_pages": len(pages),
        "marks_pages": len(pages), "skipped_pages": skipped,
        "failed_pages": failures, "pages": pages,
    }
    if pages:
        (DEST_ROOT / slug / "_manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    errs = [p["ratio_err_pct"] for p in pages if p.get("ratio_err_pct") is not None]
    return {
        "slug": slug, "ok": not failures and bool(pages),
        "pages_total": len(scenes), "audio_pages": len(pages), "marks_pages": len(pages),
        "skipped_pages": skipped, "failed_pages": failures,
        "ratio_err_pct_min": min(errs) if errs else None,
        "ratio_err_pct_max": max(errs) if errs else None,
        "manifest": f"out/audio_danielle/{slug}/_manifest.json" if pages else None,
    }


def upsert_books(prev: list[dict], current: list[dict]) -> list[dict]:
    """기존 리포트의 권별 항목을 보존한 채 이번 실행분만 갱신(upsert)하고 코호트 순 정렬.

    분할 실행(대표 3권 → 나머지 9권)에서 앞선 실행분이 사라지지 않게 한다.
    """
    by_slug = {b.get("slug"): b for b in prev if isinstance(b, dict) and b.get("slug")}
    for entry in current:
        by_slug[entry["slug"]] = entry
    order = {s: i for i, s in enumerate(PILOT_COHORT)}
    return sorted(by_slug.values(), key=lambda b: order.get(b.get("slug"), 999))


def main() -> int:
    ap = argparse.ArgumentParser(description="12권 배치 TTS v2 (Danielle long-form + atempo)")
    ap.add_argument("--rep-only", action="store_true", help="대표 3권만")
    ap.add_argument("--slugs", default=None, help="쉼표구분 slug 화이트리스트")
    args = ap.parse_args()

    if args.slugs:
        targets = [s.strip() for s in args.slugs.split(",") if s.strip()]
    elif args.rep_only:
        targets = list(REP_SLUGS)
    else:
        targets = list(PILOT_COHORT)
    rep = [s for s in targets if s in REP_SLUGS]
    targets = rep + [s for s in targets if s not in REP_SLUGS]

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

    print(f"[INFO] {len(targets)}권 (대표 우선) · voice={VOICE} engine={ENGINE} "
          f"region={REGION} atempo={ATEMPO} rate={SAMPLE_RATE}Hz")
    print("=" * 72)

    report, ok, failed = [], 0, 0
    for slug in targets:
        tag = "★대표" if slug in REP_SLUGS else "     "
        print(f"[RUN]  {tag} {slug} …")
        entry = run_slug(polly, ffmpeg, slug)
        entry["is_rep"] = slug in REP_SLUGS
        report.append(entry)
        if entry["ok"]:
            ok += 1
            print(f"[OK]   {tag} {slug}: audio={entry['audio_pages']} "
                  f"marks={entry['marks_pages']} skip={len(entry['skipped_pages'])} "
                  f"err={entry['ratio_err_pct_min']}~{entry['ratio_err_pct_max']}%")
        else:
            failed += 1
            print(f"[FAIL] {tag} {slug}: {entry.get('error') or entry.get('failed_pages')}")

    # 배치 리포트는 **병합(upsert)**. 대표 3권 → 나머지 9권처럼 분할 실행해도
    # 앞선 실행분이 남도록, 이번 실행에 포함된 slug 항목만 갱신하고 나머지는 보존한다.
    rp = OUT_DIR / "_tts_batch_danielle_report.json"
    merged: list[dict] = []
    if rp.exists():
        try:
            prev = json.loads(rp.read_text(encoding="utf-8"))
            merged = [b for b in prev.get("books", []) if isinstance(b, dict)]
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[WARN] 기존 리포트 읽기 실패({type(exc).__name__}) — 이번 실행분만 기록")
            merged = []
    books = upsert_books(merged, report)

    rp.write_text(json.dumps(
        {"voice": VOICE, "engine": ENGINE, "region": REGION, "atempo": ATEMPO,
         "sample_rate": SAMPLE_RATE, "encode": f"VBR -q:a {MP3_QUALITY}",
         "books_recorded": len(books),
         "total_audio_pages": sum(b.get("audio_pages") or 0 for b in books),
         "books": books}, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 72)
    print(f"[DONE] 성공 {ok} / 실패 {failed} · 이번 실행 페이지 "
          f"{sum(r.get('audio_pages') or 0 for r in report)} · "
          f"리포트 누적 {len(books)}권/"
          f"{sum(b.get('audio_pages') or 0 for b in books)}페이지 → {rp.name}")
    return 0 if failed == 0 else 3


if __name__ == "__main__":
    raise SystemExit(main())
