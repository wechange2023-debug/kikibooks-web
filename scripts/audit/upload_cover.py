"""표지 재합성분 Storage 덮어쓰기 (R-1b) — 대상 2파일 한정.

`resynth_caps.py --cover` 산출물을 **기존과 동일한 키**로 덮어쓴다(upsert=true).
경로가 바뀌지 않으므로 `book_audio` 행의 `audio_path`·`marks_path`는 그대로다.

★ 업로드 대상은 **아래 KEYS의 2개뿐**이다. 목록을 코드에 박아 실수 여지를 없앤다.
★ DB 쓰기 0건. `duration_ms` 1460 → 1420 갱신은 `_duration_update_cover.sql`
  (ROLLBACK 포함)로 준비만 하고 팀장 승인 게이트에 맡긴다.

실행:
    python scripts/audit/upload_cover.py --dry-run
    python scripts/audit/upload_cover.py
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "out" / "resynth" / "cover"
BUCKET = "book-audio"
PREFIX = "book_dash-aaaaahhh-mmawe/danielle"
CACHE = "public, max-age=31536000, immutable"

#: 덮어쓸 오브젝트 — 이 2개 **외에는 어떤 것도 건드리지 않는다**.
KEYS = [("cover.mp3", "audio/mpeg"), ("cover.marks.json", "application/json")]

#: 재검증 기준 — 두 단어 단독 합 1,024ms의 85%.
EXPECT_MIN_MS = 870


def bust(url: str) -> str:
    """CDN 캐시 우회 — 갓 덮어쓴 오브젝트를 검증할 때 구 파일을 받으면
    통과/실패 판정이 통째로 뒤집힌다(2026-08-21 R-1b 실측: 8,444B 구 파일을 받아
    발화 617ms로 오판했다). 쿼리스트링을 붙여 원본을 강제로 다시 받는다."""
    import time
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}cb={int(time.time() * 1000)}"


def client():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        raise SystemExit("[STOP] SUPABASE_URL / SUPABASE_SECRET_KEY 필요")
    from supabase import create_client
    return create_client(url, key), url.rstrip("/")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    missing = [n for n, _ in KEYS if not (SRC / n).exists()]
    if missing:
        raise SystemExit(f"[STOP] 로컬 산출물 없음: {missing}\n"
                         "  먼저 resynth_caps.py --cover 를 실행하세요.")

    print(f"[원본] {SRC}")
    print(f"[대상] {BUCKET}/{PREFIX}/ 아래 {len(KEYS)}개 (upsert=true)")
    for n, ct in KEYS:
        print(f"   {PREFIX}/{n:<20} {ct:<18} {(SRC / n).stat().st_size:>7,}B")

    if args.dry_run:
        print("[dry-run] 업로드 0건. 종료.")
        return 0

    sb, base = client()
    done, failed = 0, []
    for n, ct in KEYS:
        key = f"{PREFIX}/{n}"
        try:
            sb.storage.from_(BUCKET).upload(
                key, (SRC / n).read_bytes(),
                {"content-type": ct, "cache-control": CACHE, "upsert": "true"},
            )
            done += 1
            print(f"   ✅ {key}")
        except Exception as e:  # noqa: BLE001
            failed.append({"key": key, "error": str(e)[:180]})
            print(f"   ❌ {key} — {str(e)[:120]}")

    print(f"\n[업로드] 성공 {done} · 실패 {len(failed)}")

    # ── 재검증: 200 + mp3 발화량 + marks 원문 좌표 ──
    sys.path.insert(0, str(HERE))
    sys.path.insert(0, str(HERE.parent / "tts_pilot"))
    spec = importlib.util.spec_from_file_location("rc", HERE / "resynth_caps.py")
    rc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rc)
    from run_tts_fullbatch import find_ffmpeg
    ff = find_ffmpeg()

    tmp = SRC / "_verify"
    tmp.mkdir(parents=True, exist_ok=True)
    bad = []
    print("\n[검증]")
    for n, ct in KEYS:
        key = f"{PREFIX}/{n}"
        url = f"{base}/storage/v1/object/public/{BUCKET}/{key}"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"),
                                        timeout=20) as r:
                status, got_ct, length = r.status, r.headers.get("Content-Type"), \
                    r.headers.get("Content-Length")
        except Exception as e:  # noqa: BLE001
            status, got_ct, length = None, str(e)[:60], "-"
        extra = ""
        if status == 200 and n.endswith(".mp3"):
            p = tmp / n
            urllib.request.urlretrieve(bust(url), p)
            _, sp = rc.speech_ms(ff, p)
            extra = f" · 발화 {sp:.0f}ms {'OK' if sp >= EXPECT_MIN_MS else '★미달'}"
            if sp < EXPECT_MIN_MS:
                bad.append(key)
        if status == 200 and n.endswith(".marks.json"):
            p = tmp / n
            urllib.request.urlretrieve(bust(url), p)
            mk = [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
            b = rc.reader_normalize(rc.PHRASE).encode("utf-8")
            sliced = [b[m["start"]:m["end"]].decode("utf-8") for m in mk]
            good = sliced == ["AAAAAHHH", "Mmawe"]
            extra = f" · 원문 슬라이스 {sliced} {'OK' if good else '★불일치'}"
            if not good:
                bad.append(key)
        if status != 200:
            bad.append(key)
        print(f"   {status} {got_ct:<18} {length:>7}B  {key}{extra}")

    (SRC / "_upload_report.json").write_text(
        json.dumps({"uploaded": done, "failed": failed, "bad": bad},
                   ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n[결과] {'✅ 전부 통과' if not (failed or bad) else '❌ 확인 필요: ' + str(bad)}")
    return 0 if not (failed or bad) else 1


if __name__ == "__main__":
    raise SystemExit(main())
