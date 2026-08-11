#!/usr/bin/env python3
"""run_tts_pilot3.py — ADR-0053 D4 소량 게이트 파일럿(3권) 합성기.

708권 전량 착수 **전** 팀장 청취 확인용으로 코호트별 1권씩만 합성한다.
대상은 _d4_dryrun_708_final.json 기준 코호트별 **유닛 수 중간값** 책이다.

운영 규율 (ADR-0052 D8 · 3자 구조)
---------------------------------
  · DB 쓰기 0건 · Storage 업로드 0건. 산출은 로컬 mp3/marks/매니페스트뿐이다.
  · DB는 **SELECT 전용**(books · book_text · book_audio 충돌 검사).
  · AWS 자격증명은 환경변수에서만 읽는다(boto3 기본 체인). 키를 출력하지 않는다.

프리셋 (ADR-0052 Amd#2 · ADR-0053 Amd#1)
---------------------------------------
  Danielle / long-form / us-east-1 / 평문 → ffmpeg atempo=0.85 → -q:a 2 / 24000 Hz
  → run_tts_fullbatch.PRESETS['danielle-longform'] 를 **그대로 재사용**한다(복제 금지).

경로 규칙 (ADR-0034 · 기존 book_audio 실측 확인)
----------------------------------------------
  기존 voice='Ruth'      : '{platform}-{source_id}/{unit}.mp3'          (voice 세그먼트 없음)
  기존 voice='danielle'  : '{platform}-{slug}/danielle/{unit}.mp3'      (Book Dash PDF 128권)
  본 파일럿             : '{platform}-{source_id}/danielle/{unit}.mp3'
    · ASb·Bloom은 books에 slug 컬럼이 없어 source_id가 유일한 안정 키다.
    · bd_html 39권은 source_id가 UUID다(PDF 코호트와 달리 slug≠source_id).
    · '/danielle/' 세그먼트가 Ruth 행과 자연 분리한다(gen_book_audio_sql.py 판별식과 동일).
  audio_path는 **버킷명 미포함 오브젝트 키**다.

유닛 규칙
--------
  본문 unit = 'p{page_index+1:02d}'  (book_text.page_index 0-based → 파일명 1-based, D5/D11)
  표지 unit = 'cover'                (page_index=0 placeholder, ADR-0034 Amd#1)
  정제 후 빈 면은 유닛을 만들지 않는다(D7 — book_text 행은 있으나 오디오는 없음).

사용
----
  python scripts/tts_pilot/run_tts_pilot3.py --dry-run   # Polly 호출 0건, 수량·비용만
  python scripts/tts_pilot/run_tts_pilot3.py             # 실제 합성
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PILOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PILOT_DIR))

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

# D6 — 정제기·프리셋·합성 루틴 공유. 로컬 복제본을 만들지 않는다.
from tts_targets import cover_text, make_client, sanitize  # noqa: E402
from run_tts_fullbatch import (  # noqa: E402
    PRESETS,
    POLLY_CHAR_LIMIT,
    already_done,
    estimate,
    find_ffmpeg,
    synth_unit,
)

OUT_DIR = PILOT_DIR / "out"
DEST_ROOT = OUT_DIR / "audio_pilot"
RAW_ROOT = DEST_ROOT / "_raw"
REPORT = OUT_DIR / "_pilot3_report.json"
COVER_CSV = PILOT_DIR / "cover_targets_708.csv"

KRW_RATE = 1380.0  # 환산 가정치(D4 리포트와 동일 기준). 확정 환율은 팀장 확인.

# ADR-0053 D4 코호트별 유닛 수 중간값 책 (선정 근거는 _pilot3_report.json 에 기록)
TARGETS = [
    {"cohort": "asb",     "platform": "african_storybook",
     "source_id": "23015",                                  "median_units": 10},
    {"cohort": "bloom",   "platform": "bloom",
     "source_id": "06388454-77ed-4950-936c-18c9a9531b53",   "median_units": 10},
    {"cohort": "bd_html", "platform": "book_dash",
     "source_id": "9c9e5f48-fe46-11e5-86aa-5e5517507c66",   "median_units": 12},
]


def load_cover_authors() -> dict[tuple[str, str], dict]:
    """cover_targets_708.csv — D4 표지 과금의 단일 진실. 여기서 title·author를 취한다."""
    import csv

    out: dict[tuple[str, str], dict] = {}
    with COVER_CSV.open(encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            out[(row["source_platform"], row["source_id"])] = row
    return out


def build_targets(client) -> list[dict]:
    """books · book_text를 SELECT해 합성 대상을 조립한다. DB 쓰기 0건."""
    covers = load_cover_authors()
    built: list[dict] = []

    for t in TARGETS:
        key = (t["platform"], t["source_id"])
        books = (client.table("books")
                 .select("id,source_platform,source_id,title,author,is_active")
                 .eq("source_platform", t["platform"])
                 .eq("source_id", t["source_id"]).execute().data)
        if len(books) != 1:
            raise SystemExit(f"[STOP] {key} books 행 {len(books)}건 — 1건이어야 한다")
        book = books[0]
        if not book["is_active"]:
            raise SystemExit(f"[STOP] {key} is_active=false")

        crow = covers.get(key)
        if not crow:
            raise SystemExit(f"[STOP] {key} cover_targets_708.csv 미등재")
        if crow["id"] != book["id"]:
            raise SystemExit(f"[STOP] {key} cover CSV book_id 불일치")

        rows = (client.table("book_text").select("page_index,text")
                .eq("book_id", book["id"]).order("page_index").execute().data)
        if not rows:
            raise SystemExit(f"[STOP] {key} book_text 0행 — 적재 확인 필요")

        idxs = [r["page_index"] for r in rows]
        if idxs != list(range(len(idxs))):
            raise SystemExit(f"[STOP] {key} page_index 불연속 — {idxs}")

        pages, empty = [], []
        for r in rows:
            clean, diag = sanitize(r["text"])
            if not clean:
                empty.append(r["page_index"])
                continue
            if len(clean) > POLLY_CHAR_LIMIT:
                raise SystemExit(
                    f"[STOP] {key} p{r['page_index'] + 1} {len(clean)}자 "
                    f"> Polly 상한 {POLLY_CHAR_LIMIT} — 분할 설계 필요")
            pages.append({
                "unit": f"p{r['page_index'] + 1:02d}",
                "page_index": r["page_index"],
                "text": clean,
                "chars": len(clean),
                "resanitized": diag["changed"],
            })

        ctext = cover_text(crow["title"], crow["author"])
        if not ctext:
            raise SystemExit(f"[STOP] {key} 표지 문구 생성 실패")

        book_key = f"{t['platform']}-{t['source_id']}"
        built.append({
            "cohort": t["cohort"],
            "median_units": t["median_units"],
            "book_id": book["id"],
            "platform": t["platform"],
            "source_id": t["source_id"],
            "title": book["title"],
            "author": crow["author"],
            "book_key": book_key,
            "key_prefix": f"{book_key}/danielle",
            "page_rows": len(rows),
            "empty_pages": empty,
            "cover_text": ctext,
            "cover_chars": len(ctext),
            "body_chars": sum(p["chars"] for p in pages),
            "pages": pages,
        })
    return built


def check_conflicts(client, built: list[dict]) -> list[dict]:
    """기존 book_audio 행과 경로·UNIQUE 충돌이 없는지 확인한다. SELECT 전용."""
    report = []
    for b in built:
        rows = (client.table("book_audio")
                .select("kind,page_index,voice,engine,audio_path")
                .eq("book_id", b["book_id"]).execute().data)
        clash_path = [r for r in rows
                      if (r["audio_path"] or "").startswith(b["key_prefix"] + "/")]
        clash_uniq = [r for r in rows if (r["voice"] or "").lower() == "danielle"]
        if clash_path or clash_uniq:
            raise SystemExit(
                f"[STOP] {b['book_key']} 기존 행 충돌 — "
                f"경로 {len(clash_path)}건 · voice=danielle {len(clash_uniq)}건")
        report.append({
            "book_key": b["book_key"],
            "existing_rows": len(rows),
            "existing_voices": sorted({r["voice"] for r in rows}),
            "existing_path_sample": rows[0]["audio_path"] if rows else None,
            "pilot_key_prefix": b["key_prefix"],
            "conflict": False,
        })
    return report


def summarize(built: list[dict], preset: dict) -> dict:
    body = sum(b["body_chars"] for b in built)
    cover = sum(b["cover_chars"] for b in built)
    units = sum(len(b["pages"]) + 1 for b in built)
    upm = preset["usd_per_million"]
    return {
        "books": len(built),
        "body_units": sum(len(b["pages"]) for b in built),
        "cover_units": len(built),
        "total_units": units,
        "body_chars": body,
        "cover_chars": cover,
        "total_chars": body + cover,
        "usd_x1": round(estimate(body + cover, upm, 1), 6),
        "usd_x2": round(estimate(body + cover, upm, 2), 6),
        "krw_1380_x2": round(estimate(body + cover, upm, 2) * KRW_RATE, 1),
        "note": "x2 = mp3 + speech-marks 2회 호출 모두 과금(실비용). x1은 참고치.",
    }


def generate(built: list[dict], preset: dict, force: bool) -> list[dict]:
    import boto3

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise SystemExit("[STOP] ffmpeg 없음 — atempo 후처리 불가")
    polly = boto3.client("polly", region_name=preset["region"])

    results = []
    for b in built:
        dest = DEST_ROOT / b["book_key"]
        raw = RAW_ROOT / b["book_key"]
        units, skipped = [], []
        todo = [("cover", b["cover_text"])] + [(p["unit"], p["text"]) for p in b["pages"]]

        # 재개용 캐시는 **직전 _manifest.json**뿐이다. 매니페스트에 없는 유닛은
        # mp3가 남아 있어도 재합성한다(부분 산출물을 근거로 수치를 지어내지 않기 위함).
        prev: dict[str, dict] = {}
        prev_man = dest / "_manifest.json"
        if not force and prev_man.exists():
            prev = {u["unit"]: u
                    for u in json.loads(prev_man.read_text(encoding="utf-8"))["units"]}

        for unit, text in todo:
            cached = prev.get(unit)
            if cached and cached.get("text") == text and already_done(dest, unit):
                skipped.append(unit)
                units.append(cached)
                continue
            info = synth_unit(polly, ffmpeg, preset, dest, raw, unit, text)
            units.append(info)
            print(f"  {b['book_key']} {unit}  {info['chars']}자 "
                  f"{info['out_ms']}ms {info['mp3_bytes']}B")

        man = {
            "cohort": b["cohort"], "book_id": b["book_id"],
            "platform": b["platform"], "source_id": b["source_id"],
            "title": b["title"], "author": b["author"],
            "voice": preset["voice"], "voice_key": preset["voice_key"],
            "engine": preset["engine"], "region": preset["region"],
            "sample_rate": preset["sample_rate"], "atempo": preset["atempo"],
            "rate_pct": preset["rate_pct"],
            "key_prefix": b["key_prefix"],
            "page_rows": b["page_rows"], "audio_units": len(units),
            "empty_pages": b["empty_pages"], "reused_units": skipped,
            "failed": [], "units": units,
        }
        (dest / "_manifest.json").write_text(
            json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")
        results.append(man)
    return results


def main() -> int:
    ap = argparse.ArgumentParser(description="ADR-0053 D4 파일럿 3권 합성(DB 쓰기 0건)")
    ap.add_argument("--dry-run", action="store_true", help="Polly 호출 0건 — 수량·비용만")
    ap.add_argument("--force", action="store_true", help="기존 로컬 산출물 무시하고 재합성")
    args = ap.parse_args()

    preset = PRESETS["danielle-longform"]

    for var in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION"):
        if not os.environ.get(var):
            return int(bool(print(f"[STOP] 환경변수 {var} 미설정")) or 2)

    client = make_client()
    built = build_targets(client)
    conflicts = check_conflicts(client, built)

    summary = summarize(built, preset)
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    for b in built:
        print(f"[{b['cohort']:8s}] {b['book_key']}  본문 {len(b['pages'])}유닛 "
              f"{b['body_chars']}자 · 표지 {b['cover_chars']}자 · 빈면 {b['empty_pages']}")
        print(f"           key_prefix = {b['key_prefix']}")

    if args.dry_run:
        print("[dry-run] Polly 호출 0건 — 종료")
        return 0

    print(f"[WARN] 실제 Polly 호출 — {summary['total_units']}유닛 "
          f"/ {summary['total_chars']}자 / 추정 ${summary['usd_x2']}")
    manifests = generate(built, preset, args.force)

    REPORT.write_text(json.dumps({
        "adr": "ADR-0053 D4 소량 게이트 파일럿(3권)",
        "basis": "scripts/tts_pilot/out/_d4_dryrun_708_final.json 코호트별 유닛 수 중간값",
        "preset": {k: preset[k] for k in
                   ("voice", "voice_key", "engine", "region", "sample_rate",
                    "atempo", "text_type", "usd_per_million")},
        "path_rule": "{platform}-{source_id}/danielle/{unit}.mp3 (버킷명 미포함 오브젝트 키)",
        "db_writes": 0, "storage_uploads": 0,
        "conflict_check": conflicts,
        "summary": summary,
        "books": [{k: v for k, v in m.items() if k != "units"} |
                  {"units": [{kk: vv for kk, vv in u.items() if kk != "text"}
                             for u in m["units"]]}
                  for m in manifests],
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[OK] 리포트 → {REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
