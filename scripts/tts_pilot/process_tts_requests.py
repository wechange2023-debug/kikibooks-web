#!/usr/bin/env python3
"""process_tts_requests.py — 관리자 화면 TTS 요청 큐 처리기 (ADR-0058 D6).

관리자 검수 화면의 [TTS 생성 요청] 버튼은 `book_review.status`를 `tts_requested`로
바꿀 뿐이고(ADR-0058 D1), 실제 합성·업로드·적재는 **팀장 로컬의 본 스크립트**가 한다.

운영 규율 (ADR-0053 D6 개정본 · ADR-0058 D7)
--------------------------------------------
  · DB 쓰기 **0건** — 큐 조회·대상 검증 전부 SELECT다. `book_audio` INSERT와
    `book_review` → `tts_done` 전이는 생성된 .sql을 **팀장이 SQL Editor에서** 실행한다.
  · Storage 업로드는 팀장 실행 영역(③)이라 `--upload` 단계에서만 일어난다.
  · AWS·Supabase 자격증명은 **환경변수에서만** 읽는다. 값 출력·기록 0건.
  · 과금 승인 = **팀장이 `--execute`를 직접 타이핑하는 행위**다(ADR-0053 D4 절차 유지).
    플래그 없이 실행하면 드라이런으로 끝난다 — Polly 0 · 업로드 0 · DB 0.

좌표계 (2026-08-13 확정 — 1안 원문 좌표 통일)
---------------------------------------------
  `sanitize(..., collapse_newlines=False)`를 쓴다. 개행을 접지 않고 Polly에 그대로
  넘겨 speech marks가 **원문 좌표**로 생성되게 한다. 리더(highlighted-text.tsx)는
  원문에 PUNCT_GAP만 적용해 오프셋을 해석하므로 이래야 강조가 정위치에 온다.
  (v1·파일럿 128권 선례. 2026-08-13 실측: 개행 68면 1,314 mark 불일치 0.)
  개행은 Polly에서 공백처럼 취급돼 **음성에는 영향이 없다**.

  ★ 좌표 정합 게이트: 유닛마다 `polly_text == reader_text`(= 원문.strip() + PUNCT_GAP)를
    확인한다. 어긋나면 드라이런에서 경고하고 `--execute`는 거부한다
    (`--allow-offset-drift`로만 강행 가능). 연속 공백·비표준 공백이 있는 면이 여기 걸린다.

사양 (ADR-0053 D5 · ADR-0034 Amd#1·#2 — 기존 배치와 동일 규약)
--------------------------------------------------------------
  Danielle / long-form / us-east-1 / 평문 → mp3 + word marks
  후처리 ffmpeg atempo=0.85 · -q:a 2 · -ar 24000, marks time ×(1/0.85)
  audio_path = '{platform}-{source_id}/danielle/{unit}.mp3'  (버킷명 미포함 오브젝트 키)
  본문 unit = 'p{page_index+1:02d}' · 표지 unit = 'cover' · 정제 후 빈 면은 유닛 미생성

3단 구조 (기존 파이프라인과 동일 — 단계마다 팀장이 결과를 보고 다음으로 넘어간다)
--------------------------------------------------------------------------------
  ① 합성   process_tts_requests.py [--execute]      → out/audio_requests/{run_id}/
  ② 업로드 process_tts_requests.py --upload         → Storage book-audio/
  ③ 적재   process_tts_requests.py --sql            → docs/sql/adr0058/requests/{run_id}.sql

사용
----
  # ① 드라이런(기본) — 큐·게이트·문자수·비용만 출력. 무비용.
  PYTHONUTF8=1 python scripts/tts_pilot/process_tts_requests.py

  # ② 합성 (중단해도 같은 --run-id로 재실행하면 이어서 진행)
  PYTHONUTF8=1 python scripts/tts_pilot/process_tts_requests.py --execute

  # ③ Storage 업로드 (--dry-run 선행 권장)
  PYTHONUTF8=1 python scripts/tts_pilot/process_tts_requests.py --upload --dry-run
  PYTHONUTF8=1 python scripts/tts_pilot/process_tts_requests.py --upload

  # ④ 적재 SQL 생성 → 팀장이 SQL Editor에서 실행(파일 끝 ROLLBACK을 COMMIT으로 수정)
  PYTHONUTF8=1 python scripts/tts_pilot/process_tts_requests.py --sql

  # 정제·좌표 규칙 점검
  PYTHONUTF8=1 python scripts/tts_pilot/tts_targets.py --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

PILOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PILOT_DIR))

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

# 기존 모듈 재사용 — 로컬 복제본을 만들지 않는다(ADR-0056 D6 원칙 계승).
from tts_targets import (  # noqa: E402
    _PUNCT_GAP_RE,
    cover_text,
    make_client,
    sanitize,
)
from run_tts_fullbatch import (  # noqa: E402
    PRESETS,
    POLLY_CHAR_LIMIT,
    already_done,
    estimate,
    find_ffmpeg,
    synth_unit,
)

REPO = PILOT_DIR.parent.parent
OUT_DIR = PILOT_DIR / "out"
RUNS_ROOT = OUT_DIR / "audio_requests"
SQL_OUT_DIR = REPO / "docs" / "sql" / "adr0058" / "requests"

PRESET_KEY = "danielle-longform"
VOICE = "danielle"          # book_audio.voice 표기(ADR-0034 Amd#2 성우 층위)
ENGINE = "long-form"
RATE = 85                   # atempo 0.85의 실효 속도(SSML prosody 아님 — ADR-0052 Amd#2)
KRW_RATE = 1380.0           # 환산 가정치(ADR-0053 O3 미확정)

BUCKET = "book-audio"
CT_MP3 = "audio/mpeg"
CT_MARKS = "application/json; charset=utf-8"
CACHE = "public, max-age=31536000, immutable"
UPLOAD_RETRIES = 3
UPLOAD_WAIT = 2.0

REQUESTED = "tts_requested"
# 개행 유지로 늘어나는 문자수의 허용 상한(ADR-0053 D4 기준 대비). 초과 시 중단한다.
CHAR_DELTA_TOLERANCE_PCT = 1.0

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")


class Stop(Exception):
    """진행 중단 사유. 게이트 위반 시 어떤 부수효과도 남기지 않고 종료한다."""


def reader_text(raw: str) -> str:
    """리더(components/book/highlighted-text.tsx)가 marks 오프셋을 해석하는 문자열.

    audio-manifest.ts가 `.trim()`한 원문에 PUNCT_GAP만 적용한 결과다. Polly 입력이
    이것과 같아야 강조가 정위치에 온다.
    """
    return _PUNCT_GAP_RE.sub(r"\1 ", (raw or "").strip())


# ─────────────────────────────────────────────────────────────────────────────
# ① 큐 조회 — SELECT 전용
# ─────────────────────────────────────────────────────────────────────────────
def fetch_queue(client) -> list[dict]:
    """book_review.status='tts_requested' 인 책을 books 조인해 가져온다."""
    rows = (client.table("book_review")
            .select("book_id, status, updated_at")
            .eq("status", REQUESTED)
            .execute().data) or []
    if not rows:
        return []

    ids = [r["book_id"] for r in rows]
    books: dict[str, dict] = {}
    for i in range(0, len(ids), 40):
        chunk = ids[i:i + 40]
        got = (client.table("books")
               .select("id, source_platform, source_id, title, is_active")
               .in_("id", chunk).execute().data) or []
        for b in got:
            books[b["id"]] = b

    out = []
    for r in rows:
        b = books.get(r["book_id"])
        if not b:
            raise Stop(f"books 행 없음 — book_id {r['book_id']} (FK 위반? 수동 확인)")
        out.append({**b, "book_id": r["book_id"], "requested_at": r["updated_at"]})
    out.sort(key=lambda x: (x["source_platform"], x["source_id"]))
    return out


def fetch_text(client, book_ids: list[str]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {b: [] for b in book_ids}
    for i in range(0, len(book_ids), 40):
        chunk = book_ids[i:i + 40]
        start = 0
        while True:
            rows = (client.table("book_text").select("book_id, page_index, text")
                    .in_("book_id", chunk)
                    .range(start, start + 999).execute().data) or []
            for r in rows:
                out[r["book_id"]].append(r)
            if len(rows) < 1000:
                break
            start += 1000
    for b in out:
        out[b].sort(key=lambda r: r["page_index"])
    return out


def fetch_audio_owners(client, book_ids: list[str]) -> set[str]:
    """book_audio 행이 1행이라도 있는 book_id 집합 (voice 무관 — ADR-0058 D4)."""
    owners: set[str] = set()
    for i in range(0, len(book_ids), 40):
        chunk = book_ids[i:i + 40]
        rows = (client.table("book_audio").select("book_id")
                .in_("book_id", chunk).execute().data) or []
        owners.update(r["book_id"] for r in rows)
    return owners


# ─────────────────────────────────────────────────────────────────────────────
# ② 대상 조립 + 게이트
# ─────────────────────────────────────────────────────────────────────────────
def build_targets(client) -> tuple[list[dict], list[dict]]:
    """큐 → 합성 대상. 반환 (대상, 제외목록). 제외 사유는 화면 D4와 이중 방어다."""
    queue = fetch_queue(client)
    if not queue:
        return [], []

    ids = [q["book_id"] for q in queue]
    texts = fetch_text(client, ids)
    owners = fetch_audio_owners(client, ids)

    targets: list[dict] = []
    excluded: list[dict] = []

    for q in queue:
        bid = q["book_id"]
        book_key = f"{q['source_platform']}-{q['source_id']}"

        if not _UUID.fullmatch(bid):
            raise Stop(f"{book_key}: book_id UUID 아님 — {bid}")
        if not _SAFE_ID.fullmatch(q["source_id"]):
            raise Stop(f"{book_key}: source_id에 경로 위험 문자 — {q['source_id']}")

        # 게이트 1 — 이미 오디오 보유(UNIQUE 충돌 예방). 화면 D4와 같은 판정을 서버 밖에서 재확인.
        if bid in owners:
            excluded.append({**q, "book_key": book_key,
                             "reason": "book_audio 행 존재 — 재생성 미지원(ADR-0058 D4)"})
            continue

        rows = texts.get(bid) or []
        # 게이트 2 — 낭독할 텍스트 없음
        if not rows:
            excluded.append({**q, "book_key": book_key, "reason": "book_text 0행"})
            continue

        # 게이트 3 — page_index 연속성(0..N-1)
        idxs = [r["page_index"] for r in rows]
        if idxs != list(range(len(idxs))):
            raise Stop(f"{book_key}: page_index 불연속 (행 {len(idxs)}, 최대 {max(idxs)})")

        pages, empty, drifted = [], [], []
        chars_std = 0
        for r in rows:
            raw = r["text"] or ""
            polly = sanitize(raw, collapse_newlines=False)[0]   # ← D6 좌표계
            std = sanitize(raw)[0]                              # 기존 규칙(비용 비교 기준)
            chars_std += len(std)
            if not polly:
                empty.append(r["page_index"])
                continue
            if len(polly) > POLLY_CHAR_LIMIT:
                raise Stop(f"{book_key} p{r['page_index'] + 1}: "
                           f"{len(polly)}자 > Polly 상한 {POLLY_CHAR_LIMIT}")
            # 좌표 정합 — 어긋나면 하이라이트가 밀린다. 여기서 잡고 실행을 막는다.
            if polly != reader_text(raw):
                drifted.append(r["page_index"])
            pages.append({"unit": f"p{r['page_index'] + 1:02d}", "text": polly,
                          "chars": len(polly)})

        ctext = cover_text(q["title"], None)
        if not ctext:
            raise Stop(f"{book_key}: 표지 문구 생성 실패(title 비어 있음)")

        targets.append({
            "book_id": bid, "platform": q["source_platform"], "source_id": q["source_id"],
            "title": q["title"], "is_active": q["is_active"],
            "book_key": book_key, "key_prefix": f"{book_key}/{VOICE}",
            "requested_at": q["requested_at"],
            "page_rows": len(rows), "empty_pages": empty, "drift_pages": drifted,
            "cover_text": ctext, "cover_chars": len(ctext),
            "body_chars": sum(p["chars"] for p in pages),
            "chars_std": chars_std + len(ctext),
            "pages": pages,
        })

    return targets, excluded


def report(targets: list[dict], excluded: list[dict]) -> dict:
    """드라이런 출력 + 비용/좌표 게이트 판정. 반환: 요약 dict."""
    print("=" * 74)
    print(" ADR-0058 D6 — TTS 요청 큐 처리기 (드라이런: Polly 0 · 업로드 0 · DB 쓰기 0)")
    print("=" * 74)

    if excluded:
        print(f"\n[제외] {len(excluded)}권 — 요청 상태이나 합성 대상이 아니다")
        for e in excluded:
            print(f"   · {e['book_key']:38} {e['reason']}")
        print("   ※ 제외분은 status가 tts_requested로 남는다. 화면에서 철회하거나")
        print("     팀장이 SQL로 정리할 것(본 스크립트는 DB에 쓰지 않는다).")

    if not targets:
        print("\n[대상] 0권 — 합성할 것이 없다.")
        return {"books": 0}

    body_units = sum(len(t["pages"]) for t in targets)
    total_units = body_units + len(targets)
    body_chars = sum(t["body_chars"] for t in targets)
    cover_chars = sum(t["cover_chars"] for t in targets)
    total_chars = body_chars + cover_chars
    std_chars = sum(t["chars_std"] for t in targets)
    delta_pct = ((total_chars - std_chars) / std_chars * 100) if std_chars else 0.0

    print(f"\n[대상] {len(targets)}권 · 유닛 {total_units} (본문 {body_units} + 표지 {len(targets)})")
    print(f"{'book_key':40} {'면':>3} {'빈면':>4} {'유닛':>4} {'문자':>7}  요청시각")
    for t in targets:
        print(f"  {t['book_key']:38} {t['page_rows']:>3} {len(t['empty_pages']):>4} "
              f"{len(t['pages']) + 1:>4} {t['body_chars'] + t['cover_chars']:>7}  "
              f"{t['requested_at'][:19]}")

    print(f"\n[문자수] 총 {total_chars:,}자 (본문 {body_chars:,} + 표지 {cover_chars:,})")
    print(f"[문자수] 기존 정제 규칙 대비 {delta_pct:+.3f}% "
          f"(개행 유지분 {total_chars - std_chars:+,}자 · 허용 ±{CHAR_DELTA_TOLERANCE_PCT}%)")

    upm = PRESETS[PRESET_KEY]["usd_per_million"]
    usd1, usd2 = estimate(total_chars, upm, 1), estimate(total_chars, upm, 2)
    print(f"[비용]   ×1 ${usd1:.4f} / ×2(보수적 상한) ${usd2:.4f} "
          f"(₩{usd2 * KRW_RATE:,.0f} @ {KRW_RATE:g})")
    print("         ×2 = mp3 + speech marks 2회 호출. 실청구 확인 전까지 상한으로 본다(ADR-0053 D4).")

    drifted = [(t["book_key"], t["drift_pages"]) for t in targets if t["drift_pages"]]
    if drifted:
        print(f"\n[⚠ 좌표 경고] {sum(len(p) for _, p in drifted)}면 — "
              f"Polly 입력이 리더 표시 텍스트와 다르다")
        for key, pages in drifted:
            print(f"   · {key:38} p{[p + 1 for p in pages]}")
        print("   원인 후보: 연속 공백·비표준 공백·제어문자. 그대로 합성하면 그 면의")
        print("   단어 하이라이트가 밀린다. book_text를 먼저 정리하거나,")
        print("   밀림을 감수하려면 --allow-offset-drift 로 강행할 것.")
    else:
        print("\n[좌표] 전 유닛 정합 ✅ — Polly 입력 == 리더 표시 텍스트")

    ok = True
    if abs(delta_pct) > CHAR_DELTA_TOLERANCE_PCT:
        print(f"\n[STOP] 문자수 편차 {delta_pct:+.3f}% > 허용 ±{CHAR_DELTA_TOLERANCE_PCT}% "
              f"— 원인 확인 전 합성 금지(ADR-0053 D4)")
        ok = False

    print("\n" + "-" * 74)
    print(" 다음 단계: --execute 로 합성 (이 실행이 곧 과금 승인이다 — ADR-0053 D4)")
    print("-" * 74)

    return {"books": len(targets), "total_units": total_units, "total_chars": total_chars,
            "std_chars": std_chars, "delta_pct": round(delta_pct, 4),
            "usd_x1": round(usd1, 4), "usd_x2": round(usd2, 4),
            "drift_pages": sum(len(p) for _, p in drifted), "cost_gate_ok": ok}


# ─────────────────────────────────────────────────────────────────────────────
# ③ 합성 — 유닛 단위 체크포인트
# ─────────────────────────────────────────────────────────────────────────────
def run_dir(run_id: str) -> Path:
    return RUNS_ROOT / run_id


def latest_run_id() -> str | None:
    if not RUNS_ROOT.is_dir():
        return None
    dirs = sorted((d.name for d in RUNS_ROOT.iterdir() if d.is_dir()), reverse=True)
    return dirs[0] if dirs else None


def load_checkpoint(run_id: str) -> dict:
    p = run_dir(run_id) / "_checkpoint.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8")).get("units", {})
    except Exception as exc:  # noqa: BLE001
        raise Stop(f"체크포인트 손상 — 수동 확인 필요: {exc}")


def save_checkpoint(run_id: str, units: dict) -> None:
    """원자적 교체 — 쓰기 도중 종료돼도 기존 체크포인트가 살아남는다."""
    d = run_dir(run_id)
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "_checkpoint.json.tmp"
    tmp.write_text(json.dumps({"units": units}, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, d / "_checkpoint.json")


def write_manifest(run_id: str, tgt: dict, preset: dict, done: dict) -> None:
    order = [p["unit"] for p in tgt["pages"]] + ["cover"]
    units = [done[f"{tgt['book_key']}/{u}"] for u in order
             if f"{tgt['book_key']}/{u}" in done
             and done[f"{tgt['book_key']}/{u}"].get("status") != "failed"]
    dest = run_dir(run_id) / tgt["book_key"]
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "_manifest.json").write_text(json.dumps({
        "book_id": tgt["book_id"], "platform": tgt["platform"],
        "source_id": tgt["source_id"], "title": tgt["title"],
        "voice": preset["voice"], "voice_key": preset["voice_key"],
        "engine": preset["engine"], "region": preset["region"],
        "sample_rate": preset["sample_rate"], "atempo": preset["atempo"],
        "rate_pct": preset["rate_pct"], "key_prefix": tgt["key_prefix"],
        "collapse_newlines": False,          # ADR-0058 D6 좌표계 — 적재 SQL 생성기가 확인한다
        "page_rows": tgt["page_rows"], "empty_pages": tgt["empty_pages"],
        "audio_units": len(units), "units": units,
    }, ensure_ascii=False, indent=1), encoding="utf-8")


def synthesize(run_id: str, targets: list[dict]) -> int:
    preset = PRESETS[PRESET_KEY]
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise Stop("ffmpeg 미설치 — 시스템 PATH·imageio_ffmpeg 모두 없음")
    try:
        import boto3
    except ImportError:
        raise Stop("boto3 미설치 — pip install -r requirements.txt")
    # 자격증명은 boto3 기본 체인(환경변수)에서 로드. 값은 출력하지 않는다.
    polly = boto3.client("polly", region_name=preset["region"])

    done = load_checkpoint(run_id)
    total = sum(len(t["pages"]) + 1 for t in targets)
    n = ok = skipped = failed = 0
    chars_synth = 0
    started = time.time()

    for tgt in targets:
        dest = run_dir(run_id) / tgt["book_key"]
        raw_dir = run_dir(run_id) / "_raw" / tgt["book_key"]
        work = [(p["unit"], p["text"]) for p in tgt["pages"]] + [("cover", tgt["cover_text"])]
        for unit, text in work:
            n += 1
            ck = f"{tgt['book_key']}/{unit}"
            if ck in done and done[ck].get("status") != "failed":
                skipped += 1
                continue
            if already_done(dest, unit):
                skipped += 1
                continue
            try:
                entry = synth_unit(polly, ffmpeg, preset, dest, raw_dir, unit, text)
                done[ck] = {k: v for k, v in entry.items() if k != "text"} | {"status": "ok"}
                ok += 1
                chars_synth += len(text)
            except Exception as exc:  # noqa: BLE001
                done[ck] = {"unit": unit, "status": "failed", "error": str(exc)[:200]}
                failed += 1
                print(f"  [FAIL] {ck}: {str(exc)[:160]}")
            save_checkpoint(run_id, done)
            if n % 20 == 0 or n == total:
                el = time.time() - started
                print(f"  [진행] {n}/{total} · 생성 {ok} · 스킵 {skipped} · 실패 {failed} "
                      f"· 경과 {el / 60:.1f}분")
        write_manifest(run_id, tgt, preset, done)

    upm = preset["usd_per_million"]
    print(f"\n[완료] 생성 {ok} · 스킵 {skipped} · 실패 {failed}")
    print(f"[과금] 이번 실행 합성 문자 {chars_synth:,} → "
          f"×2 ${estimate(chars_synth, upm, 2):.4f} (₩{estimate(chars_synth, upm, 2) * KRW_RATE:,.0f})")
    print(f"[산출] {run_dir(run_id)}")
    if failed:
        print("[다음] 실패분은 같은 명령을 재실행하면 그 유닛만 다시 시도한다.")
        return 1
    print(f"[다음] python scripts/tts_pilot/process_tts_requests.py --upload --run-id {run_id}")
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# ④ 업로드 — Storage 전용(DB 쓰기 0)
# ─────────────────────────────────────────────────────────────────────────────
def collect_upload_items(run_id: str) -> list[dict]:
    root = run_dir(run_id)
    if not root.is_dir():
        raise Stop(f"산출물 없음: {root}")
    items: list[dict] = []
    for man_path in sorted(root.glob("*/_manifest.json")):
        m = json.loads(man_path.read_text(encoding="utf-8"))
        prefix = m["key_prefix"]
        for u in m["units"]:
            for fname, ct in ((u["file"], CT_MP3), (u["marks_file"], CT_MARKS)):
                local = man_path.parent / fname
                if not local.exists() or local.stat().st_size == 0:
                    raise Stop(f"{man_path.parent.name}/{fname}: 로컬 파일 없음·0바이트")
                items.append({"key": f"{prefix}/{fname}", "local": local, "ct": ct})
    return items


def upload(run_id: str, dry: bool, overwrite: bool) -> int:
    items = collect_upload_items(run_id)
    print(f"[업로드] run {run_id} · 객체 {len(items)}개 "
          f"(mp3 {sum(1 for i in items if i['ct'] == CT_MP3)} + "
          f"marks {sum(1 for i in items if i['ct'] == CT_MARKS)})")
    if dry:
        for i in items[:6]:
            print(f"   {i['key']}  ({i['local'].stat().st_size:,}B)")
        if len(items) > 6:
            print(f"   … 외 {len(items) - 6}개")
        print("[드라이런] 업로드 0건. 자격증명 불요.")
        return 0

    client = make_client()   # SUPABASE_SECRET_KEY는 환경변수에서만 — 출력 0건
    store = client.storage.from_(BUCKET)
    up = skip = 0
    for i, it in enumerate(items, 1):
        last = None
        for attempt in range(1, UPLOAD_RETRIES + 1):
            try:
                store.upload(it["key"], it["local"].read_bytes(),
                             {"content-type": it["ct"], "cache-control": CACHE,
                              "upsert": "true" if overwrite else "false"})
                up += 1
                last = None
                break
            except Exception as exc:  # noqa: BLE001
                last = exc
                msg = str(exc).lower()
                # 이미 존재 = 덮어쓰기 방지가 작동한 것. 재시도 무의미.
                if "exists" in msg or "duplicate" in msg or "409" in msg:
                    skip += 1
                    last = None
                    break
                if attempt < UPLOAD_RETRIES:
                    time.sleep(UPLOAD_WAIT * attempt)
        if last is not None:
            raise Stop(f"업로드 실패 {it['key']}: {str(last)[:160]}")
        if i % 50 == 0 or i == len(items):
            print(f"  [진행] {i}/{len(items)} · 업로드 {up} · 기존키 스킵 {skip}")
    print(f"[완료] 업로드 {up} · 스킵 {skip}")
    print(f"[다음] python scripts/tts_pilot/process_tts_requests.py --sql --run-id {run_id}")
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# ⑤ 적재 SQL 생성 — 실행은 팀장
# ─────────────────────────────────────────────────────────────────────────────
def sql_literal(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def build_sql(run_id: str) -> Path:
    root = run_dir(run_id)
    if not root.is_dir():
        raise Stop(f"산출물 없음: {root}")

    rows: list[tuple] = []
    book_ids: list[str] = []
    for man_path in sorted(root.glob("*/_manifest.json")):
        m = json.loads(man_path.read_text(encoding="utf-8"))
        if m.get("engine") != ENGINE or m.get("voice_key") != VOICE:
            raise Stop(f"{man_path.parent.name}: 프리셋 불일치 — "
                       f"voice={m.get('voice_key')} engine={m.get('engine')}")
        if m.get("collapse_newlines") is not False:
            raise Stop(f"{man_path.parent.name}: 좌표계 표기 없음 — "
                       f"ADR-0058 D6 이전 산출물이다. 재합성 필요")
        book_ids.append(m["book_id"])
        prefix = m["key_prefix"]
        for u in m["units"]:
            unit = u["unit"]
            if u.get("out_ms") is None:
                raise Stop(f"{man_path.parent.name}/{unit}: out_ms 없음 — duration_ms NULL 불가")
            if unit == "cover":
                kind, page_index = "cover", 0        # ADR-0034 Amd#1 표지 placeholder
            else:
                mm = re.fullmatch(r"p(\d+)", unit)
                if not mm:
                    raise Stop(f"{man_path.parent.name}: 유닛명 이상 — {unit}")
                kind, page_index = "page", int(mm.group(1)) - 1   # 1-based 파일명 → 0-based 컬럼
            rows.append((m["book_id"], kind, page_index,
                         f"{prefix}/{u['file']}", f"{prefix}/{u['marks_file']}",
                         int(u["out_ms"])))

    if not rows:
        raise Stop("적재할 행이 0건이다")

    seen = set()
    for r in rows:
        key = (r[0], r[1], r[2])
        if key in seen:
            raise Stop(f"UNIQUE 충돌 예상 — book_id/kind/page_index 중복: {key}")
        seen.add(key)

    SQL_OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = SQL_OUT_DIR / f"{run_id}.sql"
    a: list[str] = []
    a.append("-- =============================================================================")
    a.append(f"-- {run_id}.sql — TTS 요청분 book_audio 적재 + book_review 전이 (ADR-0058 D6)")
    a.append("--")
    a.append("-- 생성: scripts/tts_pilot/process_tts_requests.py --sql  (DB 접속 0건 · 쓰기 0건)")
    a.append("-- 실행: 팀장 (Supabase SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0053 D6-①).")
    a.append("--")
    a.append(f"-- 적재 대상: {len(book_ids)}권 / {len(rows)}행 "
             f"(page {sum(1 for r in rows if r[1] == 'page')} + "
             f"cover {sum(1 for r in rows if r[1] == 'cover')})")
    a.append(f"-- 값       : voice='{VOICE}' · engine='{ENGINE}' · rate={RATE}"
             " (atempo 0.85의 실효 속도, SSML prosody 아님 — ADR-0052 Amd#2)")
    a.append("--            duration_ms = 감속 후 mp3 실측(ffmpeg). audio_path = 버킷명 미포함 오브젝트 키.")
    a.append("--            좌표계 = 원문(개행 보존, ADR-0058 D6 — 리더 오프셋 정합).")
    a.append("--")
    a.append("-- ★ 본 파일은 BEGIN … ROLLBACK 리허설이다. 기대값이 맞으면 맨 끝 ROLLBACK 을")
    a.append("--   COMMIT 으로 직접 고쳐 타이핑한 뒤 재실행할 것 (ADR-0053 E9 규약).")
    a.append("-- ★ 선행 조건: Storage 업로드(--upload) 완료. 업로드 없이 적재하면 재생이 404가 된다.")
    a.append("-- =============================================================================")
    a.append("")
    a.append("BEGIN;")
    a.append("")
    a.append("-- [1] book_audio 적재 — ON CONFLICT 절 없음(덮어쓰기 구조적 불가, load708 선례)")
    a.append("INSERT INTO public.book_audio")
    a.append("  (book_id, kind, page_index, audio_path, marks_path, voice, engine, rate, duration_ms)")
    a.append("VALUES")
    vals = []
    for bid, kind, pidx, ap, mp, ms in rows:
        vals.append(f"  ({sql_literal(bid)}, {sql_literal(kind)}, {pidx}, "
                    f"{sql_literal(ap)}, {sql_literal(mp)}, {sql_literal(VOICE)}, "
                    f"{sql_literal(ENGINE)}, {RATE}, {ms})")
    a.append(",\n".join(vals) + ";")
    a.append("")
    a.append("-- [2] 검수 상태 전이 tts_requested → tts_done (ADR-0058 D2·D6)")
    a.append("--     조건부 UPDATE — 배치 도중 화면에서 철회된 권은 덮어쓰지 않는다(ADR-0058 O2).")
    a.append("UPDATE public.book_review SET status = 'tts_done'")
    a.append(f" WHERE status = '{REQUESTED}'")
    a.append("   AND book_id IN (")
    a.append(",\n".join(f"     {sql_literal(b)}" for b in sorted(set(book_ids))))
    a.append("   );")
    a.append("")
    a.append("-- [3] 후검증 — 마지막 SELECT만 SQL Editor에 표시된다")
    a.append(f"-- 기대: inserted_rows {len(rows)} / null_duration 0 / dup_unique 0 / "
             f"tts_done {len(set(book_ids))}")
    a.append("SELECT")
    a.append("  (SELECT count(*) FROM public.book_audio a WHERE a.book_id IN (")
    a.append(",\n".join(f"     {sql_literal(b)}" for b in sorted(set(book_ids))))
    a.append(f"   )) AS inserted_rows,")
    a.append("  (SELECT count(*) FROM public.book_audio WHERE duration_ms IS NULL) AS null_duration,")
    a.append("  (SELECT count(*) FROM (SELECT 1 FROM public.book_audio")
    a.append("     GROUP BY book_id, kind, page_index, voice HAVING count(*) > 1) t) AS dup_unique,")
    a.append("  (SELECT count(*) FROM public.book_review r WHERE r.status = 'tts_done'")
    a.append("     AND r.book_id IN (")
    a.append(",\n".join(f"       {sql_literal(b)}" for b in sorted(set(book_ids))))
    a.append("     )) AS tts_done_books,")
    a.append("  CASE WHEN (SELECT count(*) FROM public.book_audio WHERE duration_ms IS NULL) = 0")
    a.append("        AND (SELECT count(*) FROM (SELECT 1 FROM public.book_audio")
    a.append("              GROUP BY book_id, kind, page_index, voice HAVING count(*) > 1) t) = 0")
    a.append("       THEN 'PASS — ROLLBACK을 COMMIT으로 고쳐 재실행할 것'")
    a.append("       ELSE 'FAIL — 수치를 워커에게 전달할 것'")
    a.append("  END AS verdict;")
    a.append("")
    a.append("ROLLBACK;   -- ← 기대값 일치 시 COMMIT 으로 고쳐 재실행")
    path.write_text("\n".join(a) + "\n", encoding="utf-8")
    return path


# ─────────────────────────────────────────────────────────────────────────────
# main
# ─────────────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(
        description="ADR-0058 D6 — 관리자 TTS 요청 큐 처리기 (기본 드라이런)")
    ap.add_argument("--execute", action="store_true",
                    help="실제 합성. 이 플래그 자체가 과금 승인이다(ADR-0053 D4)")
    ap.add_argument("--upload", action="store_true", help="Storage 업로드 단계")
    ap.add_argument("--sql", action="store_true", help="적재 SQL 생성 단계")
    ap.add_argument("--dry-run", action="store_true", help="--upload와 함께: 업로드 없이 점검만")
    ap.add_argument("--run-id", default=None, help="산출물 디렉터리 이름(재개·업로드·SQL용)")
    ap.add_argument("--only", default=None, help="쉼표구분 book_key 부분 처리")
    ap.add_argument("--overwrite", action="store_true", help="--upload: 기존 키 덮어쓰기(기본 금지)")
    ap.add_argument("--allow-offset-drift", action="store_true",
                    help="좌표 경고를 무시하고 합성 강행(하이라이트 밀림 감수)")
    args = ap.parse_args()

    try:
        # ── 업로드·SQL 단계는 로컬 산출물만 본다(큐 조회 불요) ──
        if args.upload:
            run_id = args.run_id or latest_run_id()
            if not run_id:
                raise Stop("run_id를 찾을 수 없다 — 먼저 --execute로 합성할 것")
            return upload(run_id, args.dry_run, args.overwrite)

        if args.sql:
            run_id = args.run_id or latest_run_id()
            if not run_id:
                raise Stop("run_id를 찾을 수 없다 — 먼저 --execute로 합성할 것")
            path = build_sql(run_id)
            print(f"[생성] {path}")
            print("[다음] 팀장이 Supabase SQL Editor에서 실행 → 기대값 확인 → ROLLBACK을 COMMIT으로")
            return 0

        # ── 큐 조회 → 게이트 → 드라이런/합성 ──
        client = make_client()
        targets, excluded = build_targets(client)
        if args.only:
            keep = {s.strip() for s in args.only.split(",") if s.strip()}
            targets = [t for t in targets if t["book_key"] in keep]
        summary = report(targets, excluded)

        if not args.execute:
            return 0
        if not targets:
            print("\n[STOP] 대상 0권 — 합성할 것이 없다.")
            return 1
        if not summary.get("cost_gate_ok", True):
            print("\n[STOP] 비용 게이트 미통과 — 합성하지 않는다.")
            return 1
        if summary.get("drift_pages") and not args.allow_offset_drift:
            print("\n[STOP] 좌표 경고 면이 있다 — book_text 정리 후 재시도하거나")
            print("       --allow-offset-drift 로 강행할 것(하이라이트 밀림 감수).")
            return 1

        run_id = args.run_id or datetime.now().strftime("%Y%m%d-%H%M%S")
        print(f"\n[합성] run_id={run_id} · 대상 {len(targets)}권 "
              f"{summary['total_units']}유닛 {summary['total_chars']:,}자")
        return synthesize(run_id, targets)

    except Stop as exc:
        print(f"\n[STOP] {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
