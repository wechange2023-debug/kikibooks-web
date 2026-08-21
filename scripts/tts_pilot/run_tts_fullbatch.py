#!/usr/bin/env python3
"""run_tts_fullbatch.py — Book Dash 전체 TTS 확장 배치 (ADR-0053).

파일럿 스크립트(run_tts_batch_v2.py)를 전체 코호트로 확장한 판이다.
대상 선정을 DB **읽기 전용** 조회로 바꾸고, 실행 전 비용을 산출하는 `--dry-run`을 더했다.

★ 기존 경로 무수정: generate_tts.py · run_tts_batch.py · run_tts_batch_v2.py ·
  out/audio/(Ruth 산출물) · out/audio_danielle/(파일럿 12권)는 손대지 않는다.
★ 본 스크립트는 **Storage 업로드·DB 쓰기를 하지 않는다**(ADR-0052 D8 · ADR-0053 D2).
  산출물은 전부 로컬 파일이다. 업로드·INSERT는 팀장 영역이다.

모드
----
  --dry-run   Polly 호출 0건. 대상 권수·페이지·문자수·추산 비용만 산출(CSV+콘솔).
  (기본)      Polly 호출로 mp3+marks를 로컬 생성. 실행 전 반드시 dry-run 승인을 받는다.

사용
----
    python scripts/tts_pilot/run_tts_fullbatch.py --dry-run
    python scripts/tts_pilot/run_tts_fullbatch.py --dry-run --with-cover
    python scripts/tts_pilot/run_tts_fullbatch.py --dry-run --preset ruth-neural
    python scripts/tts_pilot/run_tts_fullbatch.py --slugs a-day-out,egg      # 실제 생성
"""

from __future__ import annotations

import argparse
import csv
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts_targets import (  # noqa: E402
    EXCLUSION_REASONS,
    POLLUTED_SLUGS,
    ROTATED_SLUGS,
    make_client,
    select_targets,
)

PILOT_DIR = Path(__file__).resolve().parent
OUT_DIR = PILOT_DIR / "out"

# ─────────────────────────────────────────────────────────────────────────────
# 엔진 프리셋
# ─────────────────────────────────────────────────────────────────────────────
# ⚠ 보이스·엔진은 ADR-0053 Open 항목이다(팀장 확정 대기).
#   danielle-longform = ADR-0052 Amendment #2(2026-07-22) 시연 확정본 — 현 기본값.
#   ruth-neural       = ADR-0023 Amendment #1 초기 확정본. ADR-0052 Amd#2에서
#                       "청취 반려"로 대체됐으나 단가가 1/6.25다.
PRESETS: dict[str, dict] = {
    "danielle-longform": {
        "voice": "Danielle", "voice_key": "danielle", "engine": "long-form",
        "region": "us-east-1", "lang": "en-US", "sample_rate": "24000",
        "atempo": 0.85, "rate_pct": None, "text_type": "text",
        "usd_per_million": 100.0,
        "note": "평문 합성 → ffmpeg atempo=0.85 → marks time×(1/0.85) (ADR-0052 Amd#2)",
    },
    "ruth-neural": {
        "voice": "Ruth", "voice_key": "ruth", "engine": "neural",
        "region": "us-east-1", "lang": "en-US", "sample_rate": "24000",
        "atempo": None, "rate_pct": 78, "text_type": "ssml",
        "usd_per_million": 16.0,
        "note": "SSML <prosody rate='78%'> 감속 (ADR-0023 Amd#1)",
    },
}
DEFAULT_PRESET = "danielle-longform"

MP3_QUALITY = "2"
RETRY = 2
# SynthesizeSpeech 1회 요청의 과금 문자 상한(3,000자). 초과 유닛은 요청이 거부되므로
# 분할이 필요하다 — dry-run에서 미리 잡는다. 현 실측 최대 페이지는 657자.
POLLY_CHAR_LIMIT = 3000
DEFAULT_KRW_RATE = 1380.0     # 환산용 가정치. 확정 환율은 팀장 확인(--krw-rate로 조정).


# ─────────────────────────────────────────────────────────────────────────────
# 비용 모델
# ─────────────────────────────────────────────────────────────────────────────
def estimate(chars: int, usd_per_million: float, multiplier: int) -> float:
    """Polly 문자 과금 추산. multiplier = 권당 SynthesizeSpeech 호출 계열 수."""
    return chars * multiplier * usd_per_million / 1_000_000.0


# ─────────────────────────────────────────────────────────────────────────────
# dry-run
# ─────────────────────────────────────────────────────────────────────────────
def dry_run(sel: dict, preset: dict, with_cover: bool, krw_rate: float,
            csv_path: Path) -> int:
    targets, excluded, stats = sel["targets"], sel["excluded"], sel["stats"]

    body_chars = sum(t["body_chars"] for t in targets)
    cover_chars = sum(len(t["cover_text"]) for t in targets) if with_cover else 0
    total_chars = body_chars + cover_chars
    audio_pages = sum(t["audio_pages"] for t in targets)
    cover_units = len(targets) if with_cover else 0
    page_rows = sum(t["page_rows"] for t in targets)

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow([
            "slug", "book_id", "title", "page_rows", "audio_pages", "empty_pages",
            "body_chars", "cover_chars", "billable_chars",
            "usd_neural_x2", "usd_longform_x2", "key_prefix",
            "entity_pages", "ctrl_pages", "page_index_missing", "flags",
        ])
        for t in targets:
            cc = len(t["cover_text"]) if with_cover else 0
            billable = t["body_chars"] + cc
            flags = []
            if not t["pages"]:
                flags.append("NO_AUDIBLE_PAGE")
            if t["page_index_missing"]:
                flags.append("PAGE_INDEX_GAP")
            if t["page_index_min"] != 0:
                flags.append("PAGE_INDEX_NOT_ZERO_BASED")
            if t["entity_pages"]:
                flags.append("HTML_ENTITY_DECODED")
            if t["ctrl_pages"]:
                flags.append("CTRL_CHAR_STRIPPED")
            if t["audio_pages"] and t["body_chars"] / t["audio_pages"] < 15:
                flags.append("VERY_SHORT_PAGES")
            if any(p["chars"] > POLLY_CHAR_LIMIT for p in t["pages"]):
                flags.append("OVER_POLLY_LIMIT")
            w.writerow([
                t["slug"], t["book_id"], t["title"], t["page_rows"], t["audio_pages"],
                len(t["empty_pages"]), t["body_chars"], cc, billable,
                f'{estimate(billable, 16.0, 2):.4f}',
                f'{estimate(billable, 100.0, 2):.4f}',
                f'book_dash-{t["slug"]}/{preset["voice_key"]}',
                ";".join(map(str, t["entity_pages"])),
                ";".join(map(str, t["ctrl_pages"])),
                ";".join(map(str, t["page_index_missing"])),
                ";".join(flags),
            ])

    bar = "=" * 78
    print(bar)
    print(" Book Dash 전체 TTS 확장 — DRY-RUN (Polly 호출 0 · 업로드 0 · DB 쓰기 0)")
    print(bar)
    print(f"  book_dash 총 {stats['book_dash_total']}권 / 활성 {stats['book_dash_active']}권 "
          f"/ book_text 보유 {stats['with_book_text']}권")
    print()
    print(f"  ▶ 대상        {stats['targets']:4d}권")
    for reason, n in stats["excluded_by_reason"].items():
        if n:
            extra = ""
            if reason == "no_text" and stats.get("no_text_also_has_audio"):
                extra = (f" (그중 {stats['no_text_also_has_audio']}권은 이미 오디오 보유"
                         f" — v1 배치)")
            print(f"    제외 {reason:10s} {n:4d}권  — {EXCLUSION_REASONS[reason]}{extra}")
    print(f"    제외 합계    {stats['excluded_total']:4d}권")
    print()
    print(f"  총 book_text 행     {page_rows:6,d}")
    print(f"  낭독 페이지(비어있지 않음) {audio_pages:6,d}")
    print(f"  빈 페이지(음성 스킵) {page_rows - audio_pages:6,d}")
    print(f"  표지 트랙            {cover_units:6,d}  ({'포함' if with_cover else '미포함 --with-cover'})")
    print()
    print(f"  본문 문자수(정제 후) {body_chars:8,d}")
    print(f"  표지 문자수          {cover_chars:8,d}")
    print(f"  과금 대상 문자수     {total_chars:8,d}")
    print()

    print("  [추산 비용] Polly 문자 단가 기준")
    print(f"  {'엔진':<14}{'단가/1M':>10}{'×1(음성만)':>16}{'×2(음성+marks)':>18}")
    for name, price in (("neural", 16.0), ("long-form", 100.0)):
        u1, u2 = estimate(total_chars, price, 1), estimate(total_chars, price, 2)
        print(f"  {name:<14}{'$' + format(price, '.0f'):>10}"
              f"{'$' + format(u1, '.2f') + f' / ₩{u1 * krw_rate:,.0f}':>16}"
              f"{'$' + format(u2, '.2f') + f' / ₩{u2 * krw_rate:,.0f}':>18}")
    print()
    print(f"  선택 프리셋: {preset['voice']} / {preset['engine']} "
          f"(${preset['usd_per_million']:.0f} per 1M) — {preset['note']}")
    sel_u2 = estimate(total_chars, preset["usd_per_million"], 2)
    print(f"  → 프리셋 기준 추산  ${sel_u2:.2f} / 약 ₩{sel_u2 * krw_rate:,.0f} "
          f"(환율 가정 {krw_rate:,.0f}원/USD)")
    print()
    print("  ※ ×2는 페이지마다 음성 합성 1회 + speech marks 1회를 호출하는 현 구현 기준의")
    print("    보수적 상한이다. speech marks 요청의 과금 여부는 실청구서로 확인해야 한다.")

    anomalies = [(t["slug"], f) for t in targets for f in (
        (["NO_AUDIBLE_PAGE"] if not t["pages"] else [])
        + (["PAGE_INDEX_GAP:" + ",".join(map(str, t["page_index_missing"]))]
           if t["page_index_missing"] else [])
        + (["PAGE_INDEX_NOT_ZERO_BASED:" + str(t["page_index_min"])]
           if t["page_index_min"] != 0 else [])
        + (["HTML_ENTITY_DECODED:" + ",".join(map(str, t["entity_pages"]))]
           if t["entity_pages"] else [])
        + (["CTRL_CHAR_STRIPPED:" + ",".join(map(str, t["ctrl_pages"]))]
           if t["ctrl_pages"] else [])
        + ([f"VERY_SHORT_PAGES:{t['body_chars']}자/{t['audio_pages']}면"]
           if t["audio_pages"] and t["body_chars"] / t["audio_pages"] < 15 else [])
        + ([f"OVER_POLLY_LIMIT:p{p['page']:02d}={p['chars']}자"
            for p in t["pages"] if p["chars"] > POLLY_CHAR_LIMIT])
    )]
    print()
    print(f"  [이상 징후] {len(anomalies)}건")
    for slug, flag in anomalies[:40]:
        print(f"    {slug:38s} {flag}")
    if len(anomalies) > 40:
        print(f"    … 외 {len(anomalies) - 40}건 (CSV flags 열 참조)")

    empty_total = sum(len(t["empty_pages"]) for t in targets)
    print(f"  [참고] 빈 텍스트 페이지 {empty_total}면 — 음성 스킵 대상(정상, 표지·판권면 등)")

    report = {
        "mode": "dry_run",
        "preset": {k: v for k, v in preset.items()},
        "with_cover": with_cover,
        "krw_rate_assumed": krw_rate,
        "stats": stats,
        "page_rows": page_rows,
        "audio_pages": audio_pages,
        "body_chars": body_chars,
        "cover_chars": cover_chars,
        "billable_chars": total_chars,
        "cost_usd": {
            "neural_x1": round(estimate(total_chars, 16.0, 1), 4),
            "neural_x2": round(estimate(total_chars, 16.0, 2), 4),
            "longform_x1": round(estimate(total_chars, 100.0, 1), 4),
            "longform_x2": round(estimate(total_chars, 100.0, 2), 4),
        },
        "exclusion_lists": {
            "rotated": list(ROTATED_SLUGS),
            "polluted": list(POLLUTED_SLUGS),
        },
        "excluded": excluded,
        "csv": str(csv_path.relative_to(PILOT_DIR.parent.parent)),
    }
    rp = OUT_DIR / "_fullbatch_dryrun_report.json"
    rp.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print()
    print(f"  CSV    → {csv_path.relative_to(PILOT_DIR.parent.parent)}")
    print(f"  요약   → {rp.relative_to(PILOT_DIR.parent.parent)}")
    print(bar)
    print("  실제 생성은 팀장 승인 후 별도 실행한다(본 모드는 Polly를 호출하지 않았다).")
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# 실제 생성 (승인 후에만)
# ─────────────────────────────────────────────────────────────────────────────
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
    # ★ encoding/errors 필수 (2026-08-21 R-1 결함 수정)
    #   이 호출만 -loglevel을 주지 않아 ffmpeg가 입력 리포트를 stderr로 쏟는다. 그 안에
    #   **파일 경로**가 들어가는데, 저장소 경로에 한글이 있으면 ffmpeg는 UTF-8로 내보내고
    #   text=True는 로케일 코덱(이 PC는 cp949)으로 디코드해 UnicodeDecodeError가 난다.
    #   디코드가 리더 스레드에서 터지면 p.stderr가 None이 되어 곧바로 AttributeError로
    #   이어졌다. 같은 파일 :331·gen_all_words.py의 ffmpeg 호출이 멀쩡했던 이유는
    #   -loglevel error로 성공 시 출력이 아예 없어 디코드할 것이 없었기 때문이다.
    p = subprocess.run([ffmpeg, "-hide_banner", "-i", str(path)],
                       capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    for line in (p.stderr or "").splitlines():
        line = line.strip()
        if line.startswith("Duration:"):
            t = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = t.split(":")
            return int((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)
    return None


def polly_call(polly, **kw):
    last = None
    for attempt in range(RETRY + 1):
        try:
            return polly.synthesize_speech(**kw)
        except Exception as exc:  # noqa: BLE001
            last = exc
            if attempt < RETRY:
                time.sleep(1.5 * (attempt + 1))
    raise last  # type: ignore[misc]


def _ssml(text: str, rate_pct: int) -> str:
    esc = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    return f'<speak><prosody rate="{rate_pct}%">{esc}</prosody></speak>'


def synth_unit(polly, ffmpeg: str, preset: dict, dest_dir: Path, raw_dir: Path,
               unit: str, text: str) -> dict:
    """한 단위(pNN 또는 cover) 합성. 로컬 파일만 만든다."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_mp3 = dest_dir / f"{unit}.mp3"
    dest_marks = dest_dir / f"{unit}.marks.json"

    body = _ssml(text, preset["rate_pct"]) if preset["text_type"] == "ssml" else text
    common = dict(Text=body, TextType=preset["text_type"], VoiceId=preset["voice"],
                  Engine=preset["engine"], LanguageCode=preset["lang"],
                  SampleRate=preset["sample_rate"])

    audio = polly_call(polly, OutputFormat="mp3", **common)["AudioStream"].read()
    marks_raw = polly_call(polly, OutputFormat="json", SpeechMarkTypes=["word"],
                           **common)["AudioStream"].read().decode("utf-8")
    marks = parse_marks(marks_raw)

    atempo = preset["atempo"]
    if atempo:
        raw_dir.mkdir(parents=True, exist_ok=True)
        native = raw_dir / f"{unit}.native.mp3"
        native.write_bytes(audio)
        (raw_dir / f"{unit}.native.marks.json").write_text(marks_raw, encoding="utf-8")
        cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(native),
               "-filter:a", f"atempo={atempo}", "-ar", preset["sample_rate"],
               "-q:a", MP3_QUALITY, str(dest_mp3)]
        # -loglevel error라 성공 시 출력이 없지만, **실패 시**에는 경로가 섞인 오류문이
        # 나온다. 그때 로케일 코덱으로 디코드하면 진짜 원인 대신 UnicodeDecodeError가
        # 보이므로 여기서도 utf-8/replace를 고정한다(2026-08-21 R-1).
        p = subprocess.run(cmd, capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        if p.returncode != 0 or not dest_mp3.exists():
            raise RuntimeError(f"ffmpeg rc={p.returncode}: {(p.stderr or '').strip()[:200]}")
        marks = [{**m, "time": int(round(m["time"] / atempo))} for m in marks]
    else:
        dest_mp3.write_bytes(audio)

    write_marks(dest_marks, marks)
    return {
        "unit": unit, "file": dest_mp3.name, "marks_file": dest_marks.name,
        "words": len(marks), "chars": len(text), "text": text,
        "out_ms": duration_ms(ffmpeg, dest_mp3) if ffmpeg else None,
        "last_mark_ms": marks[-1]["time"] if marks else None,
        "mp3_bytes": dest_mp3.stat().st_size,
    }


def already_done(dest_dir: Path, unit: str) -> bool:
    """이 유닛이 이미 로컬에 온전히 생성돼 있는가(mp3·marks 둘 다 비어있지 않음).

    ⚠ 재개 판정은 **로컬 산출물 기준**이지 `book_audio` 기준이 아니다.
    본 스크립트는 DB에 쓰지 않으므로, 중단 시점까지 만든 것은 DB에 없고 디스크에만 있다.
    `book_audio` 조회는 '배치 전체를 다시 돌릴 때' 이미 적재 완료된 권을 빼는 용도다(대상 선정).
    """
    mp3 = dest_dir / f"{unit}.mp3"
    marks = dest_dir / f"{unit}.marks.json"
    try:
        return mp3.stat().st_size > 0 and marks.stat().st_size > 0
    except OSError:
        return False


def generate(sel: dict, preset: dict, with_cover: bool, dest_root: Path,
             force: bool = False) -> int:
    ffmpeg = find_ffmpeg()
    if preset["atempo"] and not ffmpeg:
        print("[STOP] ffmpeg 미설치 — atempo 후처리 불가(시스템 PATH·imageio_ffmpeg 모두 없음).")
        return 2
    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치")
        return 1
    polly = boto3.client("polly", region_name=preset["region"])

    targets = sel["targets"]
    print(f"[INFO] {len(targets)}권 · voice={preset['voice']} engine={preset['engine']} "
          f"region={preset['region']} cover={'Y' if with_cover else 'N'} "
          f"재개={'끔(--force 전량 재생성)' if force else '켬(기존 산출물 건너뜀)'}")
    print("=" * 78)

    report, ok, failed, skipped_total = [], 0, 0, 0
    for i, t in enumerate(targets, 1):
        slug = t["slug"]
        dest_dir = dest_root / slug
        raw_dir = dest_root / "_raw" / slug
        units, failures, skipped = [], [], []

        work = [(f"p{p['page']:02d}", p["text"]) for p in t["pages"]]
        if with_cover and t["cover_text"]:
            work.insert(0, ("cover", t["cover_text"]))

        for unit, text in work:
            if not force and already_done(dest_dir, unit):
                skipped.append(unit)
                units.append({"unit": unit, "file": f"{unit}.mp3",
                              "marks_file": f"{unit}.marks.json",
                              "chars": len(text), "text": text, "reused": True})
                continue
            try:
                entry = synth_unit(polly, ffmpeg, preset, dest_dir, raw_dir, unit, text)
                units.append(entry)
            except Exception as exc:  # noqa: BLE001
                failures.append({"unit": unit, "error": f"{type(exc).__name__}: {exc}"})
                print(f"    [{unit}] FAIL {type(exc).__name__}: {exc}")
        skipped_total += len(skipped)

        manifest = {
            "slug": slug, "book_id": t["book_id"], "title": t["title"],
            "voice": preset["voice"], "voice_key": preset["voice_key"],
            "engine": preset["engine"], "region": preset["region"],
            "sample_rate": preset["sample_rate"], "atempo": preset["atempo"],
            "rate_pct": preset["rate_pct"],
            "key_prefix": f"book_dash-{slug}/{preset['voice_key']}",
            "page_rows": t["page_rows"], "audio_units": len(units),
            "empty_pages": t["empty_pages"], "reused_units": skipped,
            "failed": failures, "units": units,
        }
        if units:
            dest_dir.mkdir(parents=True, exist_ok=True)
            (dest_dir / "_manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

        entry = {"slug": slug, "book_id": t["book_id"],
                 "ok": bool(units) and not failures,
                 "audio_units": len(units), "reused_units": len(skipped),
                 "failed": failures}
        report.append(entry)
        if entry["ok"]:
            ok += 1
            reuse = f" (재사용 {len(skipped)})" if skipped else ""
            print(f"[OK]   {i:3d}/{len(targets)} {slug:38s} units={len(units)}{reuse}")
        else:
            failed += 1
            print(f"[FAIL] {i:3d}/{len(targets)} {slug:38s} {failures}")

    rp = OUT_DIR / "_fullbatch_report.json"
    rp.write_text(json.dumps(
        {"preset": preset, "with_cover": with_cover, "force": force,
         "books_ok": ok, "books_failed": failed,
         "total_units": sum(r["audio_units"] for r in report),
         "reused_units": skipped_total,
         "failed_books": [r["slug"] for r in report if not r["ok"]],
         "books": report}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("=" * 78)
    print(f"[DONE] 성공 {ok} / 실패 {failed} · 총 {sum(r['audio_units'] for r in report)} 유닛 "
          f"(그중 재사용 {skipped_total}) → {rp.name}")
    if failed:
        print(f"[FAILED] {[r['slug'] for r in report if not r['ok']]}")
    print("업로드·DB INSERT는 수행하지 않았다(팀장 영역).")
    return 0 if failed == 0 else 3


# ─────────────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="Book Dash 전체 TTS 확장 배치 (ADR-0053)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Polly 호출 없이 대상·문자수·추산 비용만 산출")
    ap.add_argument("--preset", default=DEFAULT_PRESET, choices=sorted(PRESETS),
                    help=f"보이스·엔진 프리셋 (기본 {DEFAULT_PRESET})")
    ap.add_argument("--with-cover", action="store_true", help="표지 낭독 트랙 포함")
    ap.add_argument("--force", action="store_true",
                    help="이미 생성된 로컬 산출물도 다시 합성(기본은 건너뛰고 재개)")
    ap.add_argument("--slugs", default=None, help="쉼표구분 slug 화이트리스트")
    ap.add_argument("--limit", type=int, default=None, help="앞에서 N권만")
    ap.add_argument("--krw-rate", type=float, default=DEFAULT_KRW_RATE,
                    help=f"원화 환산 환율 가정치 (기본 {DEFAULT_KRW_RATE:.0f})")
    ap.add_argument("--csv", default=None, help="dry-run CSV 출력 경로")
    ap.add_argument("--dest", default=None, help="생성 산출물 루트(기본 out/audio_full_{voice})")
    args = ap.parse_args()

    preset = PRESETS[args.preset]

    print("[INFO] 대상 선정 조회 중(읽기 전용)…")
    sel = select_targets(make_client())

    if args.slugs:
        wanted = {s.strip() for s in args.slugs.split(",") if s.strip()}
        sel["targets"] = [t for t in sel["targets"] if t["slug"] in wanted]
        sel["stats"]["targets"] = len(sel["targets"])
        missing = wanted - {t["slug"] for t in sel["targets"]}
        if missing:
            print(f"[WARN] 대상 밖 slug {len(missing)}건: {sorted(missing)}")
    if args.limit:
        sel["targets"] = sel["targets"][: args.limit]
        sel["stats"]["targets"] = len(sel["targets"])

    if not sel["targets"]:
        print("[FAIL] 대상 0권 — 필터 조건을 확인하라.")
        return 1

    if args.dry_run:
        csv_path = Path(args.csv) if args.csv else OUT_DIR / "_fullbatch_dryrun.csv"
        return dry_run(sel, preset, args.with_cover, args.krw_rate, csv_path)

    dest = Path(args.dest) if args.dest else OUT_DIR / f"audio_full_{preset['voice_key']}"
    print(f"[WARN] 실제 Polly 호출 모드 — 대상 {len(sel['targets'])}권. "
          "dry-run 승인 없이 실행하지 말 것.")
    return generate(sel, preset, args.with_cover, dest, args.force)


if __name__ == "__main__":
    raise SystemExit(main())
