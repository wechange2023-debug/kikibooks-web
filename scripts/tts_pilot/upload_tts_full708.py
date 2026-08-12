#!/usr/bin/env python3
"""upload_tts_full708.py — D4 전량 708권 TTS 오디오 → Supabase Storage 'book-audio' 업로드.

ADR-0053 D4-c 1단계. 키 규약은 ADR-0034 결정 ②③ + Amendment #1·#2.
기존 128권 업로더(`upload_tts_pilot12.py` 12권 / `upload_tts_fullbatch.py` 116권)와
**동일한 방식**이며, 708권 규모에서 달라지는 점만 요약하면:

  · 입력 루트   out/audio_full_danielle → **out/audio_full708**
  · 대상 식별   slug → **book_key = {platform}-{source_id}**
                 708권은 Book Dash 단일 플랫폼이 아니다
                 (african_storybook 527 · bloom 142 · book_dash 39).
                 따라서 `book_dash-{slug}` 재조립을 절대 하지 않고
                 **매니페스트 key_prefix를 그대로 신뢰한다**(생성 시점 정본).
  · 대상 목록   _fullbatch_report.json(books[]) → **매니페스트 전수 + 요약 게이트 대조**
                 (_full708_summary.json 에는 books[] 가 없다)
  · 재개        '키 존재 시 skip'(기존과 동일) + **로컬 체크포인트**를 추가한다.
                 15,956개 규모에서 매 재실행마다 708회 list() 왕복을 반복하지 않기 위함이다.

★ Storage 전용 쓰기. **DB write 0건** — book_audio INSERT·has_audio 갱신은 별도 SQL로
  팀장이 SQL Editor에서 실행한다(ADR-0053 D6 · D4-c 2단계).
★ `_raw/`(감속 전 원속도 원본)는 업로드 대상이 아니다 — units[]에만 의존하므로 구조적으로 제외된다.

경로 규칙 (ADR-0034 Amendment #2 — 성우 층위 + 1-based 축):
  book-audio/{platform}-{source_id}/danielle/pNN.mp3          (NN = page_index+1, 2자리 zero-pad)
  book-audio/{platform}-{source_id}/danielle/pNN.marks.json
  book-audio/{platform}-{source_id}/danielle/cover.mp3        (ADR-0034 Amd#1 표지 트랙)
  book-audio/{platform}-{source_id}/danielle/cover.marks.json
  ※ 로컬 파일명이 이미 1-based(pNN)라 축 변환 없이 그대로 통과시킨다.
  ※ 구 44권 키(성우 층위 없음·0-based)는 무수정 이력 보존 — 본 스크립트가 건드리지 않는다.

Content-Type (ADR-0034 결정 ③ — 확장자 자동추측 금지):
  mp3 → audio/mpeg · marks.json → application/json; charset=utf-8
  공통 Cache-Control: public, max-age=31536000, immutable

덮어쓰기 방지 (2중):
  ① 업로드 전 프리픽스 list() 로 기존 키를 조회해 skip
  ② upsert='false' 로 요청 — 경합으로 ①을 통과해도 서버가 거부한다
  --overwrite 를 명시할 때만 upsert='true' 로 전환된다.

보안 (Hard Rule 6 · ADR-0003):
  secret 키는 **환경변수에서만** 읽는다. 코드·파일·로그에 출력·기록하지 않는다.
  URL : SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_URL
  KEY : SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY (표준: SUPABASE_SECRET_KEY)
  미설정 시 즉시 STOP + 안내(.env 파일을 만들거나 열지 않는다).

사용:
  python scripts/tts_pilot/upload_tts_full708.py --dry-run        # 무비용·자격 불요(권장 선행)
  python scripts/tts_pilot/upload_tts_full708.py --limit 3        # 앞 3권만(소규모 선행)
  python scripts/tts_pilot/upload_tts_full708.py --only bloom-bf26d12c-f74e-44b8-8dd4-50bed0d71aa1
  python scripts/tts_pilot/upload_tts_full708.py                  # 전체 708권
  python scripts/tts_pilot/upload_tts_full708.py --overwrite      # 기존 키 덮어쓰기(기본 금지)
재개: 중단 후 같은 명령을 재실행하면 체크포인트+기존키 조회로 남은 것만 올린다.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

PILOT = Path(__file__).resolve().parent
OUT = PILOT / "out"
AUDIO_ROOT = OUT / "audio_full708"                 # run_tts_full708.py 산출 루트
SUMMARY = OUT / "_full708_summary.json"            # 게이트 수치 대조용
FAILURES = OUT / "_full708_failures.json"          # 합성 실패 목록(비어 있어야 한다)
CKPT = OUT / "_upload708_checkpoint.json"          # 업로드 재개 체크포인트

BUCKET = "book-audio"
VOICE = "danielle"

CT_MP3 = "audio/mpeg"
CT_MARKS = "application/json; charset=utf-8"
CACHE = "public, max-age=31536000, immutable"

RETRIES = 3            # 일시적 네트워크 오류 재시도(15,956개 장시간 업로드 대비)
RETRY_WAIT = 2.0       # 초, 선형 백오프
CKPT_EVERY = 25        # N권마다 체크포인트 flush

_UNIT_RE = re.compile(r"^p(\d+)$")


# ---------------------------------------------------------------- 대상 로드

def load_gate() -> dict:
    """요약 JSON의 게이트 수치. 매니페스트 전수와 대조해 코호트 결손을 잡는다."""
    if not SUMMARY.exists():
        print(f"[STOP] 합성 요약 없음: {SUMMARY}\n"
              "  run_tts_full708.py 생성이 먼저 끝나야 합니다.")
        sys.exit(2)
    s = json.loads(SUMMARY.read_text(encoding="utf-8"))
    counts = s.get("counts", {})
    if counts.get("failed"):
        print(f"[STOP] 합성 실패 {counts['failed']}유닛 — 업로드 전 해결 필요.")
        sys.exit(3)
    if FAILURES.exists():
        fails = json.loads(FAILURES.read_text(encoding="utf-8"))
        if fails:
            print(f"[STOP] _full708_failures.json 이 비어 있지 않음({len(fails)}건) — 업로드 중단.")
            sys.exit(3)
    return s.get("gate", {})


def load_books() -> list[str]:
    """book_key 목록 = 매니페스트를 가진 디렉터리 전수(_raw 제외). 정렬 고정."""
    if not AUDIO_ROOT.exists():
        print(f"[STOP] 산출 루트 없음: {AUDIO_ROOT}")
        sys.exit(2)
    keys = sorted(
        d.name for d in AUDIO_ROOT.iterdir()
        if d.is_dir() and d.name != "_raw" and (d / "_manifest.json").exists()
    )
    if not keys:
        print(f"[STOP] 매니페스트를 가진 책 디렉터리가 없음: {AUDIO_ROOT}")
        sys.exit(2)
    return keys


def build_plan(book_key: str) -> list[dict]:
    """(local, key, ct, label) 업로드 항목. 매니페스트 units[]가 유일한 근거."""
    book_dir = AUDIO_ROOT / book_key
    man = json.loads((book_dir / "_manifest.json").read_text(encoding="utf-8"))

    # key_prefix는 생성 시점 확정값을 그대로 쓴다(재조립 금지 — 플랫폼별 규약이 갈릴 여지 제거).
    key_prefix = man.get("key_prefix")
    if not key_prefix:
        raise ValueError(f"{book_key}: 매니페스트에 key_prefix 없음")
    if not key_prefix.endswith(f"/{VOICE}"):
        raise ValueError(f"{book_key}: key_prefix가 성우 층위가 아님 — {key_prefix}")
    if key_prefix.split("/", 1)[0] != book_key:
        raise ValueError(f"{book_key}: key_prefix가 디렉터리명과 불일치 — {key_prefix}")
    if key_prefix.startswith(f"{BUCKET}/"):
        raise ValueError(f"{book_key}: key_prefix에 버킷명이 포함됨 — {key_prefix}")

    items: list[dict] = []
    for u in man.get("units", []):
        unit = u["unit"]
        if unit != "cover" and not _UNIT_RE.fullmatch(unit):
            raise ValueError(f"{book_key}: 알 수 없는 unit 이름 — {unit}")
        items.append({"local": book_dir / u["file"],
                      "key": f"{key_prefix}/{u['file']}", "ct": CT_MP3,
                      "label": u["file"], "bytes": u.get("mp3_bytes")})
        if u.get("marks_file"):
            items.append({"local": book_dir / u["marks_file"],
                          "key": f"{key_prefix}/{u['marks_file']}", "ct": CT_MARKS,
                          "label": u["marks_file"], "bytes": None})
    return items


# ---------------------------------------------------------------- 체크포인트

def load_ckpt() -> set[str]:
    if not CKPT.exists():
        return set()
    try:
        return set(json.loads(CKPT.read_text(encoding="utf-8")).get("done_keys", []))
    except Exception:  # noqa: BLE001
        print("[WARN] 체크포인트 파손 — 무시하고 기존키 조회로만 재개합니다.")
        return set()


def save_ckpt(done: set[str]) -> None:
    tmp = CKPT.with_suffix(".tmp")
    tmp.write_text(json.dumps({"bucket": BUCKET, "voice": VOICE,
                               "done_count": len(done),
                               "done_keys": sorted(done)},
                              ensure_ascii=False), encoding="utf-8")
    tmp.replace(CKPT)


# ---------------------------------------------------------------- Storage

def init_supabase():
    """OS 환경변수에서만 자격 로드. .env 파일을 만들거나 열지 않는다."""
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "[STOP] Storage 자격증명 미설정 — 업로드 불가.\n"
            "  PowerShell 창에서 실행 직전 아래를 등록하세요(자식 프로세스 상속, .env 만들지 마세요):\n"
            '    $env:SUPABASE_URL = "https://<프로젝트>.supabase.co"\n'
            '    $env:SUPABASE_SECRET_KEY = "<secret 키 값>"\n'
            "  키 값은 절대 이 스크립트나 문서·로그에 넣지 마세요(Hard Rule 6)."
        )
        sys.exit(2)
    try:
        from supabase import create_client
    except ImportError:
        print("[FAIL] supabase 미설치: pip install supabase")
        sys.exit(1)
    return create_client(url, key), url.rstrip("/")


def existing_keys(client, key_prefix: str) -> set[str]:
    """성우 폴더 안만 조회 — 구 44권 키(성우 층위 없음)와 무간섭.
    한 권 최대 86개(43유닛×2)라 limit 1000 단일 호출로 충분하다."""
    try:
        items = client.storage.from_(BUCKET).list(key_prefix, {"limit": 1000})
    except Exception:  # noqa: BLE001
        return set()
    return {f"{key_prefix}/{it['name']}" for it in (items or []) if it.get("name")}


def upload_one(client, it: dict, overwrite: bool) -> None:
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            client.storage.from_(BUCKET).upload(
                it["key"], it["local"].read_bytes(),
                {"content-type": it["ct"], "cache-control": CACHE,
                 "upsert": "true" if overwrite else "false"},
            )
            return
        except Exception as e:  # noqa: BLE001
            last = e
            msg = str(e).lower()
            # 이미 존재 = 덮어쓰기 방지가 작동한 것. 재시도 무의미.
            if "exists" in msg or "duplicate" in msg or "409" in msg:
                raise
            if attempt < RETRIES:
                time.sleep(RETRY_WAIT * attempt)
    raise last  # type: ignore[misc]


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="D4 전량 708권 book-audio 업로드 (ADR-0053 D4-c)")
    ap.add_argument("--dry-run", action="store_true",
                    help="업로드 없이 키·로컬존재만 점검(무비용·자격 불요)")
    ap.add_argument("--only", default=None, help="쉼표구분 book_key 부분 업로드")
    ap.add_argument("--limit", type=int, default=0, help="앞에서 N권만")
    ap.add_argument("--overwrite", action="store_true",
                    help="같은 키 존재 시 덮어쓰기(기본: 금지·skip)")
    ap.add_argument("--ignore-checkpoint", action="store_true",
                    help="체크포인트 무시하고 기존키 조회로만 판정")
    args = ap.parse_args()

    gate = load_gate()
    all_keys = load_books()

    if args.only:
        targets = [s.strip() for s in args.only.split(",") if s.strip()]
        unknown = [s for s in targets if s not in all_keys]
        if unknown:
            print(f"[FAIL] --only 대상 밖/오타: {unknown}")
            return 1
    else:
        targets = all_keys
    if args.limit:
        targets = targets[: args.limit]

    full_run = not args.only and not args.limit
    print(f"[INFO] 대상 {len(targets)}권 / 코호트 전체 {len(all_keys)}권 "
          f"(버킷 {BUCKET}, 키 = <platform>-<source_id>/{VOICE}/…)")
    if args.overwrite:
        print("[WARN] --overwrite 지정 — 기존 오브젝트를 덮어씁니다.")
    print("=" * 96)

    plans: dict[str, list[dict]] = {}
    anomalies: list[str] = []
    total_items = 0
    for bk in targets:
        try:
            plan = build_plan(bk)
        except (FileNotFoundError, ValueError, KeyError) as e:
            anomalies.append(f"{bk}: {e}")
            print(f"[{bk:46}] ✗ {e}")
            continue
        plans[bk] = plan
        total_items += len(plan)
        # 로컬 존재·크기는 dry-run이 아니어도 항상 검사한다(빈 파일 업로드 방지).
        for it in plan:
            if not it["local"].exists() or it["local"].stat().st_size == 0:
                anomalies.append(f"{bk}: 로컬 없음/빈파일 {it['label']}")
            elif it["bytes"] and it["local"].stat().st_size != it["bytes"]:
                anomalies.append(f"{bk}: 바이트 불일치 {it['label']}")
        if args.dry_run:
            print(f"[{bk:46}] items={len(plan):>3}  prefix={plan[0]['key'].rsplit('/', 1)[0]}")

    units = total_items // 2
    print("=" * 96)
    print(f"[합계] {len(plans)}권 / 유닛 {units:,}개 / 업로드 항목 {total_items:,}개 (mp3+marks)")

    # 전량 실행일 때만 요약 게이트와 대조한다(부분 실행은 대조 대상이 아니다).
    if full_run and gate:
        exp_books, exp_units = gate.get("books"), gate.get("total_units")
        print(f"[게이트 대조] 요약 기대 {exp_books}권 / {exp_units:,}유닛 "
              f"→ 실측 {len(plans)}권 / {units:,}유닛 "
              f"{'✅ 일치' if (len(plans) == exp_books and units == exp_units) else '❌ 불일치'}")
        if len(plans) != exp_books or units != exp_units:
            anomalies.append(f"게이트 불일치: {len(plans)}권/{units}유닛 vs {exp_books}권/{exp_units}유닛")

    if anomalies:
        print(f"[STOP] 이상 {len(anomalies)}건 — 진행 중단:")
        for a in anomalies[:20]:
            print(f"  - {a}")
        return 3

    if args.dry_run:
        print("[DRY-RUN] 경로·로컬존재·게이트 확인 전용 — 업로드 없이 종료.")
        return 0

    done = set() if args.ignore_checkpoint else load_ckpt()
    if done:
        print(f"[재개] 체크포인트 {len(done):,}개 완료분 확인 — 해당 키는 건너뜁니다.")

    client, _ = init_supabase()
    up_ok, skip, fail = 0, 0, []
    for i, bk in enumerate(targets, 1):
        plan = plans[bk]
        key_prefix = plan[0]["key"].rsplit("/", 1)[0]
        # 체크포인트가 이 권을 전부 덮으면 list() 왕복도 생략한다.
        if not args.overwrite and all(it["key"] in done for it in plan):
            skip += len(plan)
            if i % 25 == 0 or i == len(targets):
                print(f"[{i:>3}/{len(targets)}] {bk:<46} 누적 up={up_ok} skip={skip} fail={len(fail)}")
            continue
        present = set() if args.overwrite else (existing_keys(client, key_prefix) | done)
        for it in plan:
            if it["key"] in present:
                skip += 1
                done.add(it["key"])
                continue
            try:
                upload_one(client, it, args.overwrite)
                up_ok += 1
                done.add(it["key"])
            except Exception as e:  # noqa: BLE001
                fail.append((it["key"], f"{type(e).__name__}: {e}"))
                print(f"  XX {it['key']}: {type(e).__name__}: {e}")
        if i % CKPT_EVERY == 0 or i == len(targets):
            save_ckpt(done)
            print(f"[{i:>3}/{len(targets)}] {bk:<46} 누적 up={up_ok} skip={skip} fail={len(fail)}")

    save_ckpt(done)
    print("=" * 96)
    print(f"[업로드] 성공 {up_ok:,} / 스킵(이미 존재) {skip:,} / 실패 {len(fail):,}")
    print(f"[합계 확인] 성공+스킵 = {up_ok + skip:,} (기대 {total_items:,})")
    print(f"[체크포인트] {CKPT.name} — 완료 키 {len(done):,}개 기록")
    if fail:
        print("[FAIL] 실패 목록:")
        for k, e in fail[:30]:
            print(f"  {k}: {e}")
        print("  → 같은 명령을 재실행하면 성공분은 skip되고 실패분만 다시 시도합니다.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
