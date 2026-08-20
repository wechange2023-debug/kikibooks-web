"""단어 오디오 Storage 업로드 + 매니페스트 (ADR-0065 Amendment #1 · W-1 3단계).

`gen_all_words.py`가 만든 **감속본**(atempo 0.85, QA-1 확정)을
`book-audio` 버킷의 `_words/{voice}/{key}.mp3` 경로로 올린다(D-A4 경로 규칙).

★ 업로드 경로는 `_words/` **아래로만** 한정한다. 기존 책 오디오 키
  (`{platform}-{slug}/{voice}/pNN.mp3`)와 접두사가 겹치지 않아 무간섭이다.
★ DB 쓰기 0건 — 스키마 무변경 설계(D-A4). 정본은 경로 규칙 + 매니페스트다.

멱등:
  이미 올라간 키는 건너뛴다(`upsert=false` 기본 — 서버가 중복을 거부한다).
  `--overwrite`를 명시할 때만 덮어쓴다.

매니페스트:
  `_words/{voice}/_index.json` — 단어→key 목록·생성일·보이스·총 개수.
  증분 생성(D-A5)의 기준점이며, 런타임이 "이 단어에 오디오가 있는가"를
  404를 만나기 전에 판정하는 근거다.

실행:
    python scripts/wordplay/upload_words.py --dry-run   # 업로드 0건, 대상만 출력
    python scripts/wordplay/upload_words.py             # 업로드 + 매니페스트
    python scripts/wordplay/upload_words.py --verify    # 업로드 후 검증만
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tts_pilot"))

from run_tts_fullbatch import PRESETS  # noqa: E402

SRC = HERE / "out" / "all_words" / "atempo"
STATE = HERE / "out" / "all_words" / "_state.json"
REPORT = HERE / "out" / "all_words" / "_upload_report.json"

BUCKET = "book-audio"
PRESET_KEY = "danielle-longform"
CONTENT_TYPE = "audio/mpeg"
CACHE = "public, max-age=31536000, immutable"
RETRIES = 3
RETRY_WAIT = 1.5
#: 업로드 후 무작위 표본 검증 개수(지시서 W-1 g).
VERIFY_SAMPLE = 10


def prefix(voice_key: str) -> str:
    return f"_words/{voice_key}"


def make_client():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        raise SystemExit(
            "[STOP] SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.\n"
            "  .env.local의 값을 셸에 넣어 실행하세요."
        )
    try:
        from supabase import create_client
    except ImportError:
        raise SystemExit("[FAIL] supabase 미설치: pip install supabase")
    return create_client(url, key), url.rstrip("/")


def existing_keys(client, key_prefix: str) -> set[str]:
    """이미 올라간 키 — 1000개 cap이 있어 offset으로 전량 훑는다."""
    found: set[str] = set()
    offset = 0
    while True:
        try:
            items = client.storage.from_(BUCKET).list(
                key_prefix, {"limit": 1000, "offset": offset}
            )
        except Exception:  # noqa: BLE001
            break
        names = [it["name"] for it in (items or []) if it.get("name")]
        if not names:
            break
        found |= {f"{key_prefix}/{n}" for n in names}
        if len(names) < 1000:
            break
        offset += 1000
    return found


def upload_one(client, key: str, data: bytes, overwrite: bool) -> None:
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            client.storage.from_(BUCKET).upload(
                key, data,
                {"content-type": CONTENT_TYPE, "cache-control": CACHE,
                 "upsert": "true" if overwrite else "false"},
            )
            return
        except Exception as e:  # noqa: BLE001
            last = e
            msg = str(e).lower()
            if "exists" in msg or "duplicate" in msg or "409" in msg:
                raise
            if attempt < RETRIES:
                time.sleep(RETRY_WAIT * attempt)
    raise last  # type: ignore[misc]


def verify(base: str, keys: list[str], n: int) -> list[dict]:
    """무작위 표본 HTTP 검증 — 200 + content-type audio/mpeg."""
    out = []
    for key in random.sample(keys, min(n, len(keys))):
        url = f"{base}/storage/v1/object/public/{BUCKET}/{key}"
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=15) as r:
                out.append({
                    "key": key, "status": r.status,
                    "content_type": r.headers.get("Content-Type"),
                    "length": r.headers.get("Content-Length"),
                })
        except Exception as e:  # noqa: BLE001
            out.append({"key": key, "status": None, "error": str(e)[:120]})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="업로드 0건. 대상만 출력")
    ap.add_argument("--overwrite", action="store_true", help="이미 있는 키도 덮어씀")
    ap.add_argument("--verify", action="store_true", help="업로드 없이 검증만 수행")
    args = ap.parse_args()

    preset = PRESETS[PRESET_KEY]
    voice_key = preset["voice_key"]
    pfx = prefix(voice_key)

    if not STATE.exists():
        raise SystemExit(f"[STOP] {STATE} 없음 — 먼저 gen_all_words.py를 실행하세요.")
    state = json.loads(STATE.read_text(encoding="utf-8"))
    ok_words = {w: v for w, v in state.items() if v.get("status") == "ok"}

    # 로컬 파일 존재 확인 — 상태와 디스크가 어긋나면 조용히 빠뜨린다.
    items = []
    missing = []
    for word, v in sorted(ok_words.items()):
        p = SRC / f"{v['key']}.mp3"
        if p.exists() and p.stat().st_size > 0:
            items.append({"word": word, "key": v["key"], "path": p,
                          "storage_key": f"{pfx}/{v['key']}.mp3"})
        else:
            missing.append(word)

    total_bytes = sum(i["path"].stat().st_size for i in items)
    print(f"[대상] state ok {len(ok_words)}개 · 로컬 파일 확인 {len(items)}개 "
          f"· {total_bytes / 1024 / 1024:.1f}MB")
    if missing:
        print(f"[경고] 로컬 파일 없음 {len(missing)}개: {missing[:10]}")
    print(f"[경로] {BUCKET}/{pfx}/<key>.mp3")
    for i in items[:3]:
        print(f"   {i['word']:12s} → {i['storage_key']}")

    if args.dry_run:
        print("[dry-run] 업로드 0건. 종료.")
        return 0

    client, base = make_client()

    if args.verify:
        keys = [i["storage_key"] for i in items]
        res = verify(base, keys, VERIFY_SAMPLE)
        for r in res:
            print(f"  {r.get('status')} {r.get('content_type')} {r['key']}")
        bad = [r for r in res if r.get("status") != 200]
        print(f"[검증] {len(res) - len(bad)}/{len(res)} 통과")
        return 0 if not bad else 1

    done = existing_keys(client, pfx)
    todo = [i for i in items if args.overwrite or i["storage_key"] not in done]
    print(f"[진행] 이미 있음 {len(items) - len(todo)}개 · 올릴 것 {len(todo)}개")

    uploaded, failed = 0, []
    started = time.time()
    for n, it in enumerate(todo, 1):
        try:
            upload_one(client, it["storage_key"], it["path"].read_bytes(), args.overwrite)
            uploaded += 1
        except Exception as e:  # noqa: BLE001
            failed.append({"word": it["word"], "key": it["storage_key"],
                           "error": str(e)[:180]})
            print(f"  [실패] {it['word']} — {str(e)[:110]}")
        if n % 200 == 0 or n == len(todo):
            el = time.time() - started
            print(f"  ... {n}/{len(todo)}  성공 {uploaded} 실패 {len(failed)}  "
                  f"경과 {el:.0f}s")

    # ── 매니페스트 (D-A5 증분 생성의 기준점) ──
    manifest = {
        "voice": voice_key,
        "engine": preset["engine"],
        "atempo": preset["atempo"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(items),
        "path_rule": f"{pfx}/{{key}}.mp3",
        "words": {i["word"]: i["key"] for i in items},
    }
    man_key = f"{pfx}/_index.json"
    try:
        client.storage.from_(BUCKET).upload(
            man_key, json.dumps(manifest, ensure_ascii=False).encode("utf-8"),
            {"content-type": "application/json", "cache-control": "public, max-age=300",
             "upsert": "true"},
        )
        print(f"[매니페스트] 업로드 완료 — {man_key} ({len(items)}단어)")
    except Exception as e:  # noqa: BLE001
        print(f"[실패] 매니페스트 업로드 — {str(e)[:160]}")
        failed.append({"word": "_index.json", "key": man_key, "error": str(e)[:180]})

    # ── 검증 ──
    keys = [i["storage_key"] for i in items]
    res = verify(base, keys, VERIFY_SAMPLE)
    bad = [r for r in res if r.get("status") != 200]
    print(f"\n[검증] 무작위 {len(res)}개:")
    for r in res:
        print(f"   {r.get('status')} {r.get('content_type')} {r.get('length')}B  {r['key']}")

    after = existing_keys(client, pfx)
    print(f"\n[결과] 이번 업로드 {uploaded} · 실패 {len(failed)}")
    print(f"[Storage 확인] {pfx} 아래 오브젝트 {len(after)}개 "
          f"(mp3 {len([k for k in after if k.endswith('.mp3')])}개 + 매니페스트)")

    REPORT.write_text(json.dumps({
        "uploaded": uploaded, "failed": failed, "total_items": len(items),
        "storage_objects": len(after), "verify": res,
        "manifest_key": man_key,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[보고] {REPORT}")
    return 0 if not failed and not bad else 1


if __name__ == "__main__":
    raise SystemExit(main())
