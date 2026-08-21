"""단어 오디오 **전량 생성** (ADR-0065 Amendment #1 · W-1 2단계).

카드가 되는 고유 단어 전량을 Danielle/long-form으로 합성하고 atempo 0.85로 감속한다
(QA-1 팀장 확정 2026-08-20 — 본문 낭독과 같은 속도·같은 목소리).

★ Storage 업로드 0건 · DB 접근 0건. **로컬 파일만** 만든다(업로드는 W-1 3단계).
★ speech marks를 만들지 않는다 — 단어 안에는 하이라이트할 것이 없다.
  따라서 SynthesizeSpeech 호출은 **단어당 1회**다(본문은 mp3+marks로 2회였다).

멱등(재실행 안전):
  이미 감속본이 만들어진 단어는 건너뛴다. 중단 후 같은 명령을 다시 실행하면
  못 만든 것부터 이어서 만든다. 상태는 매 단어마다 `_state.json`에 즉시 기록하므로
  프로세스가 죽어도 진행분이 남는다.

재시도:
  `polly_call`(scripts/tts_pilot/run_tts_fullbatch.py:288)이 백오프로 **3회**까지
  시도한다. 그래도 실패한 단어는 `_failures.json`과 화면 목록으로 남는다.

실행:
    python scripts/wordplay/gen_all_words.py --dry-run   # 개수·비용만, 과금 0
    python scripts/wordplay/gen_all_words.py             # 전량 생성

출력: scripts/wordplay/out/all_words/{native,atempo}/{key}.mp3
      scripts/wordplay/out/all_words/_state.json · _failures.json
      (out/ 규칙이라 git 미추적)
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
PILOT = HERE.parent / "tts_pilot"
sys.path.insert(0, str(PILOT))

# D6 원칙 — 프리셋·ffmpeg 탐색·비용 모델·재시도를 본문 파이프라인에서 그대로 가져온다.
# 로컬 복제본을 만들지 않는다(scripts/tts_pilot/run_tts_full708.py:64-71 선례).
from run_tts_fullbatch import (  # noqa: E402
    PRESETS,
    MP3_QUALITY,
    estimate,
    find_ffmpeg,
    polly_call,
)

OUT = HERE / "out" / "all_words"
STATE = OUT / "_state.json"
FAILURES = OUT / "_failures.json"

PRESET_KEY = "danielle-longform"

#: 드라이런 산출물에서 기대하는 고유 단어 수. 다르면 STOP한다(지시서 W-1 d).
EXPECTED_WORDS = 1874

#: 요청 간 최소 간격(초). long-form 엔진은 TPS가 낮아 몰아치면 스로틀링이 난다.
REQUEST_DELAY_S = 0.15

#: key 허용 문자 — ADR-0065 D-A4 경로 규칙.
KEY_ALLOWED_RE = re.compile(r"[^a-z0-9-]")


def fetch_manifest(voice_key: str) -> dict | None:
    """Storage의 매니페스트를 받는다 — D-A5 증분 생성의 기준점.

    공개 오브젝트라 자격 증명이 필요 없다(dry-run도 그대로 동작한다).
    """
    import os

    base = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    if not base:
        return None
    url = (f"{base.rstrip('/')}/storage/v1/object/public/book-audio"
           f"/_words/{voice_key}/_index.json")
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:  # noqa: BLE001
        return None


def word_to_key(word: str) -> str:
    """정규형 단어 → Storage 파일 key (ADR-0065 D-A4).

    `'`는 제거하고, 그 밖에 [a-z0-9-] 아닌 문자도 제거한다.
        said       → said
        buzz-buzz  → buzz-buzz
        don't      → dont
    """
    return KEY_ALLOWED_RE.sub("", word.replace("'", ""))


def load_words(path: Path | None) -> tuple[list[str], Path]:
    """드라이런 산출 JSON에서 고유 단어 목록을 읽는다."""
    if path is None:
        candidates = sorted(HERE.glob("out/wordplay-dryrun-*.json"))
        if not candidates:
            raise SystemExit(
                "[STOP] 드라이런 산출물이 없습니다. 먼저 실행하세요:\n"
                "  node --conditions=react-server --env-file=.env.local "
                "--import ./scripts/wordplay/register-hooks.mjs scripts/wordplay/dryrun.mjs"
            )
        path = candidates[-1]
    data = json.loads(path.read_text(encoding="utf-8"))
    w0 = data.get("w0")
    if not w0 or not w0.get("unique_words"):
        raise SystemExit(f"[STOP] {path.name}에 w0.unique_words가 없습니다.")
    return list(w0["unique_words"]), path


def load_state() -> dict:
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("[경고] _state.json 손상 — 새로 시작합니다(파일 존재 여부로 멱등 유지).")
    return {}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")


def already_done(key: str, state: dict) -> bool:
    """감속본이 실제로 존재하고 비어있지 않으면 완료로 본다(파일이 정본)."""
    dest = OUT / "atempo" / f"{key}.mp3"
    try:
        return dest.stat().st_size > 0
    except OSError:
        return False


def synth_word(polly, preset: dict, word: str, dest: Path) -> int:
    resp = polly_call(
        polly,
        Text=word,
        TextType="text",
        OutputFormat="mp3",
        VoiceId=preset["voice"],
        Engine=preset["engine"],
        LanguageCode=preset["lang"],
        SampleRate=preset["sample_rate"],
    )
    data = resp["AudioStream"].read()
    if not data:
        raise RuntimeError("Polly가 빈 오디오를 반환")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return len(data)


def slow_down(ffmpeg: str, preset: dict, src: Path, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
        "-filter:a", f"atempo={preset['atempo']}",
        "-ar", preset["sample_rate"], "-q:a", MP3_QUALITY, str(dest),
    ]
    # 성공 시엔 -loglevel error로 출력이 없지만, 실패 시 경로가 섞인 오류문이 나온다.
    # 로케일 코덱(cp949)으로 디코드하면 진짜 원인이 UnicodeDecodeError에 가려진다
    # (2026-08-21 R-1에서 run_tts_fullbatch.duration_ms가 같은 이유로 터졌다).
    p = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if p.returncode != 0 or not dest.exists() or dest.stat().st_size == 0:
        raise RuntimeError(f"ffmpeg rc={p.returncode}: {(p.stderr or '').strip()[:200]}")
    return dest.stat().st_size


def fmt_eta(sec: float) -> str:
    m, s = divmod(int(sec), 60)
    h, m = divmod(m, 60)
    return f"{h}시간 {m}분" if h else (f"{m}분 {s}초" if m else f"{s}초")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="대상 개수·비용만 출력. Polly 호출 0건(과금 0).")
    ap.add_argument("--words-json", type=Path, default=None,
                    help="드라이런 산출 JSON 경로(기본: out/ 최신 파일)")
    ap.add_argument("--expect", type=int, default=EXPECTED_WORDS,
                    help=f"기대 단어 수. 다르면 STOP (기본 {EXPECTED_WORDS})")
    ap.add_argument("--limit", type=int, default=None,
                    help="앞에서 N개만 — 소규모 시험용(선택)")
    ap.add_argument("--incremental", action="store_true",
                    help="D-A5 증분 — Storage 매니페스트에 없는 단어만 대상으로 삼는다. "
                         "개수 게이트(--expect)는 적용하지 않는다.")
    args = ap.parse_args()

    preset = PRESETS[PRESET_KEY]
    words, src_path = load_words(args.words_json)

    # ── key 충돌 검사 — 서로 다른 단어가 같은 파일로 덮이면 조용히 오디오가 뒤바뀐다 ──
    keys: dict[str, str] = {}
    collisions: list[tuple[str, str, str]] = []
    for w in words:
        k = word_to_key(w)
        if not k:
            collisions.append((w, "", "key가 빈 문자열"))
        elif k in keys and keys[k] != w:
            collisions.append((w, k, f"'{keys[k]}'와 충돌"))
        else:
            keys[k] = w
    if collisions:
        print("[STOP] key 충돌/무효 발견 — 경로 규칙 재검토 필요:")
        for w, k, why in collisions[:20]:
            print(f"   {w!r} → {k!r} : {why}")
        return 2

    chars = sum(len(w) for w in words)
    usd = estimate(chars, preset["usd_per_million"], 1)  # marks 미생성 → 호출 1회

    print(f"[출처] {src_path.name}")
    print(f"[대상] 고유 단어 {len(words)}개 · {chars}자")
    print(f"[프리셋] {preset['voice']} / {preset['engine']} / atempo {preset['atempo']} "
          f"/ {preset['region']}")
    print(f"[비용] ${usd:.4f} (단어당 호출 1회 — speech marks 미생성)")
    print("[경로 예시]")
    for w in ("said", "buzz-buzz", "don't"):
        if w in words or True:
            print(f"   {w:12s} → _words/{preset['voice_key']}/{word_to_key(w)}.mp3")

    # ── D-A5 증분 모드 — 매니페스트 차집합 ──
    if args.incremental:
        manifest = fetch_manifest(preset["voice_key"])
        if manifest is None:
            print("[STOP] 매니페스트를 받지 못했습니다. "
                  "NEXT_PUBLIC_SUPABASE_URL 환경변수와 네트워크를 확인하세요.")
            return 2
        have = set(manifest.get("words", {}))
        missing = [w for w in words if w not in have]
        print("")
        print(f"[증분] 매니페스트 {len(have)}단어 · 카드 단어 {len(words)}개 "
              f"-> 없는 단어 {len(missing)}개")
        for w in missing:
            print(f"   + {w:16s} → _words/{preset['voice_key']}/{word_to_key(w)}.mp3")
        inc_chars = sum(len(w) for w in missing)
        print(f"[증분 비용] {inc_chars}자 · "
              f"${estimate(inc_chars, preset['usd_per_million'], 1):.4f}")
        words = missing
        if not words:
            print("[완료] 새로 만들 단어가 없습니다.")
            return 0

    # ── 개수 게이트 (지시서 W-1 d) — 증분 모드에는 적용하지 않는다 ──
    if not args.incremental and len(words) != args.expect:
        print(f"\n[STOP] 기대 {args.expect}개와 다릅니다(실제 {len(words)}개). "
              "선정 규칙이나 원문이 바뀐 것이므로 확인 후 --expect로 명시하세요.")
        return 2

    state = load_state()
    todo = [w for w in words if not already_done(word_to_key(w), state)]
    if args.limit:
        todo = todo[: args.limit]
    print(f"\n[진행] 완료 {len(words) - len([w for w in words if not already_done(word_to_key(w), state)])}개 "
          f"· 남은 {len(todo)}개")

    if args.dry_run:
        print("[dry-run] Polly 호출 0건. 종료.")
        return 0

    if not todo:
        print("[완료] 모든 단어가 이미 생성돼 있습니다.")
        return 0

    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치")
        return 1

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("[STOP] ffmpeg 없음 — atempo 감속 불가.")
        return 2

    try:
        polly = boto3.client("polly", region_name=preset["region"])
    except Exception as exc:  # noqa: BLE001
        print(f"[STOP] Polly 클라이언트 생성 실패 — {exc}")
        return 2

    started = time.time()
    ok = 0
    failed: list[dict] = []

    for i, word in enumerate(todo, 1):
        key = word_to_key(word)
        native = OUT / "native" / f"{key}.mp3"
        slowed = OUT / "atempo" / f"{key}.mp3"
        try:
            n_bytes = synth_word(polly, preset, word, native)
            a_bytes = slow_down(ffmpeg, preset, native, slowed)
            state[word] = {
                "key": key, "status": "ok",
                "native_bytes": n_bytes, "atempo_bytes": a_bytes,
            }
            ok += 1
        except Exception as exc:  # noqa: BLE001
            msg = f"{type(exc).__name__}: {exc}"[:200]
            state[word] = {"key": key, "status": "failed", "error": msg}
            failed.append({"word": word, "key": key, "error": msg})
            print(f"  [실패] {word} — {msg}")

        # 매 단어마다 기록 — 중단해도 진행분이 남는다(멱등의 근거).
        save_state(state)
        time.sleep(REQUEST_DELAY_S)

        if i % 50 == 0 or i == len(todo):
            elapsed = time.time() - started
            eta = elapsed / i * (len(todo) - i)
            print(f"  ... {i}/{len(todo)}  성공 {ok} 실패 {len(failed)}  "
                  f"경과 {fmt_eta(elapsed)} / 남은 {fmt_eta(eta)}")

    FAILURES.write_text(json.dumps(failed, ensure_ascii=False, indent=1), encoding="utf-8")

    done_total = sum(1 for w in words if already_done(word_to_key(w), state))
    print(f"\n[결과] 이번 실행 성공 {ok} · 실패 {len(failed)}")
    print(f"[누적] 전체 {len(words)}개 중 완료 {done_total}개")
    if failed:
        print(f"[실패 목록] {FAILURES}")
        for f in failed[:30]:
            print(f"   {f['word']}  {f['error'][:90]}")
        print("  같은 명령을 다시 실행하면 실패분만 재시도합니다(멱등).")
    else:
        print("[실패] 없음")
    print(f"[저장] {OUT}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
