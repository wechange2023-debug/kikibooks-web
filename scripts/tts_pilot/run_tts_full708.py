#!/usr/bin/env python3
"""run_tts_full708.py — ADR-0053 D4 전량 합성기 (708권 · 본문 + 표지).

파일럿 3권(ADR-0053 D4 소량 게이트) 청취 승인 후의 전량 실행 트랙이다.
**실행은 팀장 터미널 전속.** 워커는 본 스크립트 작성까지만 담당한다.

운영 규율 (ADR-0052 D8 · 3자 구조)
---------------------------------
  · DB 쓰기 0건 · Storage 업로드 0건. 산출은 로컬 mp3/marks/매니페스트뿐이다.
  · DB는 **SELECT 전용**(books · book_text). 적재 SQL은 별도 생성기가 담당한다.
  · AWS 자격증명은 환경변수에서만 읽는다(boto3 기본 체인). 키를 출력·기록하지 않는다.

사양 (ADR-0052 Amd#2 · ADR-0053 Amd#1 · 파일럿 확정본)
----------------------------------------------------
  Danielle / long-form / us-east-1 / 평문 합성 → mp3 + word speech-marks
  후처리 ffmpeg  atempo=0.85 · -q:a 2 · -ar 24000
  ⚠ **음량 정규화 필터(loudnorm 등) 추가 금지** — 2026-08-11 음량 게이트 실측 결과
     파일럿 35유닛 −23.31 LUFS(σ 0.37) · 기존 116권 표본 −23.31 LUFS로 이미 균질하고
     True Peak 최대 −7.0 dBTP로 클리핑 여유가 6 dB다. 필터 추가는 기존 1,464 트랙과의
     음량 불일치만 새로 만든다. 프리셋은 run_tts_fullbatch.PRESETS를 **그대로 재사용**한다.

경로 규칙 (ADR-0034 Amd#2 · 파일럿 승인본)
-----------------------------------------
  audio_path = '{platform}-{source_id}/danielle/{unit}.mp3'   (버킷명 미포함 오브젝트 키)
  본문 unit  = 'p{page_index+1:02d}'   표지 unit = 'cover'
  정제 후 빈 면은 유닛을 만들지 않는다(D7).

중단 안전 (요구사항 4)
---------------------
  유닛 1개를 마칠 때마다 out/_full708_checkpoint.json 을 **원자적 교체**로 갱신한다.
  재실행하면 완료 유닛을 건너뛰고 이어서 진행한다. 강제 종료·정전에도 재과금은
  마지막 1유닛(≈$0.00004)으로 제한된다.

사용
----
  # (a) 사전 점검 — Polly 호출 0건 · 파일 쓰기 0건. 안전장치만 검증한다.
  PYTHONUTF8=1 python scripts/tts_pilot/run_tts_full708.py --dry-run

  # (b) 전량 합성 (중단해도 같은 명령으로 재개)
  PYTHONUTF8=1 python scripts/tts_pilot/run_tts_full708.py
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import sys
import time
from pathlib import Path

PILOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PILOT_DIR))

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

# D6 — 정제기·표지 문구·프리셋·합성 루틴 공유. 로컬 복제본을 만들지 않는다.
from tts_targets import cover_text, make_client, sanitize  # noqa: E402
from run_tts_fullbatch import (  # noqa: E402
    PRESETS,
    POLLY_CHAR_LIMIT,
    estimate,
    find_ffmpeg,
    synth_unit,
)

REPO = PILOT_DIR.parent.parent
OUT_DIR = PILOT_DIR / "out"
DEST_ROOT = OUT_DIR / "audio_full708"
RAW_ROOT = DEST_ROOT / "_raw"
PILOT_ROOT = OUT_DIR / "audio_pilot"

CHECKPOINT = OUT_DIR / "_full708_checkpoint.json"
FAILURES = OUT_DIR / "_full708_failures.json"
SUMMARY = OUT_DIR / "_full708_summary.json"
LOGFILE = OUT_DIR / "_full708_log.txt"

# 명단 원천 (ADR-0056 roster_of_record)
ASB_BLOOM_ROSTER = REPO / "scratchpad" / "text_harvest" / "asb_bloom_targets.csv"
BD_HTML_SLUGMAP = OUT_DIR / "sql" / "_bd_html39_slugmap.csv"
COVER_CSV = PILOT_DIR / "cover_targets_708.csv"

# 안전장치 (요구사항 8) — ADR-0053 D4 드라이런 확정치
EXPECT_BOOKS = 708
D4_TOTAL_CHARS = 853797
CHAR_TOLERANCE = 0.01          # ±1%
KRW_RATE = 1380.0              # 환산 가정치(D4와 동일 기준)
PROGRESS_EVERY = 100           # 화면 진행률 출력 간격(유닛)


# ─────────────────────────────────────────────────────────────────────────────
# 로그
# ─────────────────────────────────────────────────────────────────────────────
class Log:
    """상세는 파일로, 화면은 요약만(요구사항 6)."""

    def __init__(self, path: Path, enabled: bool):
        self.fh = path.open("a", encoding="utf-8") if enabled else None

    def detail(self, msg: str) -> None:
        if self.fh:
            self.fh.write(msg + "\n")
            self.fh.flush()

    def screen(self, msg: str) -> None:
        print(msg, flush=True)
        self.detail(msg)

    def close(self) -> None:
        if self.fh:
            self.fh.close()


# ─────────────────────────────────────────────────────────────────────────────
# 명단 · 대상 조립 (SELECT 전용)
# ─────────────────────────────────────────────────────────────────────────────
def load_roster() -> list[tuple[str, str]]:
    """확정 708권 = asb_bloom_targets.csv(669) + _bd_html39_slugmap.csv(39)."""
    roster: list[tuple[str, str]] = []
    with ASB_BLOOM_ROSTER.open(encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            roster.append((row["source_platform"], row["source_id"]))
    with BD_HTML_SLUGMAP.open(encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            roster.append(("book_dash", row["source_id"]))
    if len(set(roster)) != len(roster):
        raise SystemExit("[STOP] 명단에 중복 (platform, source_id)가 있다")
    return roster


def load_covers() -> dict[tuple[str, str], dict]:
    with COVER_CSV.open(encoding="utf-8-sig") as fh:
        return {(r["source_platform"], r["source_id"]): r for r in csv.DictReader(fh)}


def fetch_books(client, roster: list[tuple[str, str]]) -> dict[tuple[str, str], dict]:
    """플랫폼별로 books를 페이지네이션 조회한 뒤 명단과 조인한다."""
    want = set(roster)
    found: dict[tuple[str, str], dict] = {}
    for plat in sorted({p for p, _ in roster}):
        start = 0
        while True:
            rows = (client.table("books")
                    .select("id,source_platform,source_id,title,is_active")
                    .eq("source_platform", plat)
                    .range(start, start + 999).execute().data) or []
            for b in rows:
                key = (b["source_platform"], b["source_id"])
                if key in want:
                    found[key] = b
            if len(rows) < 1000:
                break
            start += 1000
    return found


def fetch_book_text(client, book_ids: list[str]) -> dict[str, list[dict]]:
    """book_text를 book_id 청크로 나눠 조회한다(URL 길이 한계 회피)."""
    out: dict[str, list[dict]] = {bid: [] for bid in book_ids}
    CHUNK = 40
    for i in range(0, len(book_ids), CHUNK):
        chunk = book_ids[i:i + CHUNK]
        start = 0
        while True:
            rows = (client.table("book_text").select("book_id,page_index,text")
                    .in_("book_id", chunk)
                    .range(start, start + 999).execute().data) or []
            for r in rows:
                out[r["book_id"]].append(r)
            if len(rows) < 1000:
                break
            start += 1000
    for bid in out:
        out[bid].sort(key=lambda r: r["page_index"])
    return out


def build_targets(client, log: Log) -> list[dict]:
    roster = load_roster()
    covers = load_covers()
    log.screen(f"[명단] {len(roster)}권 로드 · 표지 CSV {len(covers)}행")

    books = fetch_books(client, roster)
    missing = [k for k in roster if k not in books]
    if missing:
        raise SystemExit(f"[STOP] books 미발견 {len(missing)}권 — 예: {missing[:3]}")
    inactive = [k for k, b in books.items() if not b["is_active"]]
    if inactive:
        raise SystemExit(f"[STOP] is_active=false {len(inactive)}권 — 예: {inactive[:3]}")

    ids = [books[k]["id"] for k in roster]
    texts = fetch_book_text(client, ids)
    log.screen(f"[본문] book_text {sum(len(v) for v in texts.values())}행 로드")

    targets: list[dict] = []
    for key in roster:
        book = books[key]
        rows = texts[book["id"]]
        if not rows:
            raise SystemExit(f"[STOP] {key} book_text 0행")
        idxs = [r["page_index"] for r in rows]
        if idxs != list(range(len(idxs))):
            raise SystemExit(f"[STOP] {key} page_index 불연속 (행 {len(idxs)})")

        pages, empty = [], []
        for r in rows:
            clean = sanitize(r["text"])[0]
            if not clean:
                empty.append(r["page_index"])
                continue
            if len(clean) > POLLY_CHAR_LIMIT:
                raise SystemExit(f"[STOP] {key} p{r['page_index'] + 1} "
                                 f"{len(clean)}자 > Polly 상한 {POLLY_CHAR_LIMIT}")
            pages.append({"unit": f"p{r['page_index'] + 1:02d}", "text": clean,
                          "chars": len(clean)})

        crow = covers.get(key)
        if not crow:
            raise SystemExit(f"[STOP] {key} 표지 CSV 미등재")
        if crow["id"] != book["id"]:
            raise SystemExit(f"[STOP] {key} 표지 CSV book_id 불일치")
        ctext = cover_text(crow["title"], crow["author"])
        if not ctext:
            raise SystemExit(f"[STOP] {key} 표지 문구 생성 실패")

        book_key = f"{key[0]}-{key[1]}"
        targets.append({
            "book_id": book["id"], "platform": key[0], "source_id": key[1],
            "title": book["title"], "author": crow["author"],
            "book_key": book_key, "key_prefix": f"{book_key}/danielle",
            "page_rows": len(rows), "empty_pages": empty,
            "cover_text": ctext, "cover_chars": len(ctext),
            "body_chars": sum(p["chars"] for p in pages),
            "pages": pages,
        })
    return targets


# ─────────────────────────────────────────────────────────────────────────────
# 안전장치 (요구사항 8)
# ─────────────────────────────────────────────────────────────────────────────
def safety_gate(targets: list[dict], log: Log) -> dict:
    books = len(targets)
    body_units = sum(len(t["pages"]) for t in targets)
    body_chars = sum(t["body_chars"] for t in targets)
    cover_chars = sum(t["cover_chars"] for t in targets)
    total_chars = body_chars + cover_chars
    total_units = body_units + books

    lo = D4_TOTAL_CHARS * (1 - CHAR_TOLERANCE)
    hi = D4_TOTAL_CHARS * (1 + CHAR_TOLERANCE)
    dev = (total_chars - D4_TOTAL_CHARS) / D4_TOTAL_CHARS * 100

    log.screen(f"[안전장치] 권수 {books} · 유닛 {total_units} "
               f"(본문 {body_units} + 표지 {books})")
    log.screen(f"[안전장치] 총 문자 {total_chars:,} "
               f"(본문 {body_chars:,} + 표지 {cover_chars:,})")
    log.screen(f"[안전장치] D4 기준 {D4_TOTAL_CHARS:,} 대비 {dev:+.3f}% "
               f"· 허용 ±{CHAR_TOLERANCE * 100:.0f}% [{lo:,.0f} ~ {hi:,.0f}]")

    if books != EXPECT_BOOKS:
        raise SystemExit(f"[STOP] 권수 {books} ≠ 기대 {EXPECT_BOOKS} — 명단 확인 필요")
    if not (lo <= total_chars <= hi):
        raise SystemExit(
            f"[STOP] 총 문자 {total_chars:,}자가 D4 기준 {D4_TOTAL_CHARS:,}자 대비 "
            f"{dev:+.3f}%로 허용 ±{CHAR_TOLERANCE * 100:.0f}%를 벗어났다.\n"
            f"        사유 후보: book_text 재적재/수정 · sanitize() 규칙 변경 · "
            f"cover_text() 서식 변경 · 명단 교체.\n"
            f"        원인을 확인하고 D4 드라이런을 재산출하기 전에는 실행하지 않는다.")
    log.screen("[안전장치] 통과 ✅")

    upm = PRESETS["danielle-longform"]["usd_per_million"]
    return {"books": books, "body_units": body_units, "cover_units": books,
            "total_units": total_units, "body_chars": body_chars,
            "cover_chars": cover_chars, "total_chars": total_chars,
            "deviation_pct": round(dev, 4),
            "usd_x2": round(estimate(total_chars, upm, 2), 4),
            "krw_1380_x2": round(estimate(total_chars, upm, 2) * KRW_RATE)}


# ─────────────────────────────────────────────────────────────────────────────
# 체크포인트 (요구사항 4)
# ─────────────────────────────────────────────────────────────────────────────
def load_checkpoint() -> dict:
    if not CHECKPOINT.exists():
        return {}
    try:
        return json.loads(CHECKPOINT.read_text(encoding="utf-8")).get("units", {})
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"[STOP] 체크포인트 손상 — 수동 확인 필요: {exc}")


def save_checkpoint(units: dict) -> None:
    """원자적 교체. 쓰기 도중 종료돼도 기존 체크포인트가 살아남는다."""
    tmp = CHECKPOINT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"units": units}, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, CHECKPOINT)


def seed_from_pilot(targets: list[dict], done: dict, log: Log) -> int:
    """파일럿 3권 35유닛을 텍스트 일치 시 복사 재사용한다(재과금 방지, 요구사항 1)."""
    if not PILOT_ROOT.exists():
        log.screen("[재사용] audio_pilot/ 없음 — 재사용 0건")
        return 0
    by_key = {t["book_key"]: t for t in targets}
    reused = 0
    for man_path in sorted(PILOT_ROOT.glob("*/_manifest.json")):
        book_key = man_path.parent.name
        tgt = by_key.get(book_key)
        if not tgt:
            continue
        man = json.loads(man_path.read_text(encoding="utf-8"))
        want = {"cover": tgt["cover_text"]} | {p["unit"]: p["text"] for p in tgt["pages"]}
        dest = DEST_ROOT / book_key
        for u in man["units"]:
            unit = u["unit"]
            ck = f"{book_key}/{unit}"
            if ck in done or want.get(unit) != u.get("text"):
                continue
            src_mp3 = man_path.parent / u["file"]
            src_marks = man_path.parent / u["marks_file"]
            if not (src_mp3.exists() and src_marks.exists()):
                continue
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_mp3, dest / u["file"])
            shutil.copy2(src_marks, dest / u["marks_file"])
            done[ck] = {k: v for k, v in u.items() if k != "text"} | {"status": "reused_pilot"}
            reused += 1
            log.detail(f"REUSE {ck} <- audio_pilot ({u['chars']}자)")
    if reused:
        save_checkpoint(done)
    log.screen(f"[재사용] 파일럿에서 {reused}유닛 복사 (재과금 없음)")
    return reused


def write_manifest(tgt: dict, done: dict, preset: dict) -> None:
    """권 완료 시 매니페스트 기록 — book_audio 적재 SQL 생성기 입력."""
    order = ["cover"] + [p["unit"] for p in tgt["pages"]]
    units = [done[f"{tgt['book_key']}/{u}"] for u in order
             if f"{tgt['book_key']}/{u}" in done
             and done[f"{tgt['book_key']}/{u}"].get("status") != "failed"]
    dest = DEST_ROOT / tgt["book_key"]
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "_manifest.json").write_text(json.dumps({
        "book_id": tgt["book_id"], "platform": tgt["platform"],
        "source_id": tgt["source_id"], "title": tgt["title"], "author": tgt["author"],
        "voice": preset["voice"], "voice_key": preset["voice_key"],
        "engine": preset["engine"], "region": preset["region"],
        "sample_rate": preset["sample_rate"], "atempo": preset["atempo"],
        "rate_pct": preset["rate_pct"], "key_prefix": tgt["key_prefix"],
        "page_rows": tgt["page_rows"], "empty_pages": tgt["empty_pages"],
        "audio_units": len(units), "units": units,
    }, ensure_ascii=False, indent=1), encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# 합성 루프
# ─────────────────────────────────────────────────────────────────────────────
def fmt_eta(sec: float) -> str:
    if sec < 90:
        return f"{sec:.0f}초"
    if sec < 5400:
        return f"{sec / 60:.1f}분"
    return f"{sec / 3600:.1f}시간"


def run(targets: list[dict], gate: dict, preset: dict, log: Log) -> dict:
    import boto3

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise SystemExit("[STOP] ffmpeg 없음 — atempo 후처리 불가 "
                         "(pip install imageio-ffmpeg 로 해결 가능)")
    polly = boto3.client("polly", region_name=preset["region"])

    done = load_checkpoint()
    if done:
        log.screen(f"[재개] 체크포인트에 완료 {len(done)}유닛 — 건너뛰고 이어서 진행")
    reused = seed_from_pilot(targets, done, log)

    total = gate["total_units"]
    n_ok = n_fail = n_skip = 0
    chars_synth = 0
    failures: list[dict] = []
    t0 = time.time()
    seen = 0

    for tgt in targets:
        todo = [("cover", tgt["cover_text"])] + [(p["unit"], p["text"]) for p in tgt["pages"]]
        for unit, text in todo:
            seen += 1
            ck = f"{tgt['book_key']}/{unit}"
            prev = done.get(ck)
            if prev and prev.get("status") != "failed":
                n_skip += 1
            else:
                try:
                    info = synth_unit(polly, ffmpeg, preset,
                                      DEST_ROOT / tgt["book_key"],
                                      RAW_ROOT / tgt["book_key"], unit, text)
                    done[ck] = {k: v for k, v in info.items() if k != "text"} | \
                        {"status": "ok"}
                    save_checkpoint(done)
                    n_ok += 1
                    chars_synth += len(text)
                    log.detail(f"OK    {ck} {len(text)}자 {info['out_ms']}ms "
                               f"{info['mp3_bytes']}B")
                except Exception as exc:  # noqa: BLE001 — 요구사항 5: 기록 후 계속
                    n_fail += 1
                    rec = {"unit_key": ck, "book_id": tgt["book_id"],
                           "book_key": tgt["book_key"], "unit": unit,
                           "chars": len(text), "error": f"{type(exc).__name__}: {exc}"}
                    failures.append(rec)
                    done[ck] = {"unit": unit, "status": "failed",
                                "error": rec["error"][:300]}
                    save_checkpoint(done)
                    FAILURES.write_text(json.dumps(failures, ensure_ascii=False, indent=1),
                                        encoding="utf-8")
                    log.detail(f"FAIL  {ck} {rec['error'][:200]}")

            if seen % PROGRESS_EVERY == 0:
                el = time.time() - t0
                rate = (n_ok / el) if (n_ok and el > 0) else 0
                left = (total - seen) / rate if rate > 0 else 0
                log.screen(f"[진행] {seen}/{total} ({seen / total * 100:.1f}%) · "
                           f"성공 {n_ok} 실패 {n_fail} 스킵 {n_skip} · "
                           f"경과 {fmt_eta(el)} · 잔여추정 {fmt_eta(left)}")

        write_manifest(tgt, done, preset)

    save_checkpoint(done)
    FAILURES.write_text(json.dumps(failures, ensure_ascii=False, indent=1), encoding="utf-8")

    upm = preset["usd_per_million"]
    summary = {
        "adr": "ADR-0053 D4 전량 합성(708권)",
        "preset": {k: preset[k] for k in ("voice", "voice_key", "engine", "region",
                                          "sample_rate", "atempo", "text_type",
                                          "usd_per_million")},
        "loudness_normalization": False,
        "path_rule": "{platform}-{source_id}/danielle/{unit}.mp3 (버킷명 미포함 오브젝트 키)",
        "db_writes": 0, "storage_uploads": 0,
        "gate": gate,
        "counts": {"total_units": total, "ok": n_ok, "failed": n_fail,
                   "skipped_checkpoint": n_skip, "reused_pilot": reused},
        "chars_synthesized_this_run": chars_synth,
        "billing": {
            "chars_billed_this_run": chars_synth * 2,
            "usd_this_run": round(estimate(chars_synth, upm, 2), 4),
            "krw_1380_this_run": round(estimate(chars_synth, upm, 2) * KRW_RATE),
            "note": "x2 = mp3 + speech-marks 2회 호출. 재사용·스킵분은 과금 없음.",
        },
        "elapsed_sec": round(time.time() - t0, 1),
        "dest": str(DEST_ROOT),
    }
    SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(
        description="ADR-0053 D4 708권 전량 TTS 합성 (DB 쓰기 0건 · 중단 안전)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Polly 호출 0건 · 파일 쓰기 0건. 안전장치만 검증한다.")
    args = ap.parse_args()

    preset = PRESETS["danielle-longform"]
    log = Log(LOGFILE, enabled=not args.dry_run)
    try:
        if not args.dry_run:
            for var in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION"):
                if not os.environ.get(var):
                    print(f"[STOP] 환경변수 {var} 미설정")
                    return 2
            OUT_DIR.mkdir(parents=True, exist_ok=True)
            log.detail(f"===== RUN {time.strftime('%Y-%m-%d %H:%M:%S')} =====")

        targets = build_targets(make_client(), log)
        gate = safety_gate(targets, log)

        if args.dry_run:
            print(json.dumps(gate, ensure_ascii=False, indent=1))
            print("[dry-run] Polly 호출 0건 · 파일 쓰기 0건 — 종료")
            return 0

        log.screen(f"[시작] {gate['total_units']}유닛 · {gate['total_chars']:,}자 · "
                   f"예상 청구 ${gate['usd_x2']} (약 {gate['krw_1380_x2']:,}원) "
                   f"— 재사용·스킵분 제외 전 총액")
        s = run(targets, gate, preset, log)
        c, b = s["counts"], s["billing"]
        log.screen(f"[완료] 성공 {c['ok']} · 실패 {c['failed']} · "
                   f"재사용 {c['reused_pilot']} · 스킵 {c['skipped_checkpoint']} · "
                   f"합성 문자 {s['chars_synthesized_this_run']:,} · "
                   f"청구 ${b['usd_this_run']} (약 {b['krw_1380_this_run']:,}원) · "
                   f"경과 {fmt_eta(s['elapsed_sec'])} · 요약 {SUMMARY.name}")
        return 1 if c["failed"] else 0
    finally:
        log.close()


if __name__ == "__main__":
    raise SystemExit(main())
