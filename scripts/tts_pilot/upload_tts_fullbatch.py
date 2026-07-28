#!/usr/bin/env python3
"""upload_tts_fullbatch.py — 전량 116권 TTS 오디오 → Supabase Storage 'book-audio' 업로드.

ADR-0053(전량 확장) 실행 2단계. 키 규약은 ADR-0034 결정 ②③ + **Amendment #1·#2**.
파일럿 12권용 `upload_tts_pilot12.py`의 116권판 — 다른 점만 요약하면:
  · 입력 루트  out/audio_danielle → **out/audio_full_danielle**
  · 대상 목록  하드코딩 12 slug → **out/_fullbatch_report.json 의 books[]** (단일 진실)
  · 매니페스트 스키마가 다르다: 파일럿은 pages[]+cover, 전량은 **units[]** 하나로 통합
    (unit == 'cover' 이면 표지, 아니면 'pNN')

★ Storage 전용 쓰기. **DB write 0건** — book_audio INSERT·has_audio 갱신은
  docs/sql/fullbatch116_danielle_load.sql 로 팀장이 SQL Editor에서 실행한다.
★ `_raw/`(감속 전 원본)는 업로드 대상이 아니다 — units[]에만 의존하므로 구조적으로 제외된다.

경로 규칙 (ADR-0034 Amendment #2 — 성우 층위 + 1-based 축):
  book-audio/book_dash-{slug}/danielle/pNN.mp3          (NN = page_index+1, 2자리 zero-pad)
  book-audio/book_dash-{slug}/danielle/pNN.marks.json
  book-audio/book_dash-{slug}/danielle/cover.mp3        (ADR-0034 Amd#1 표지 트랙)
  book-audio/book_dash-{slug}/danielle/cover.marks.json
  ※ 로컬 파일명이 이미 1-based(pNN)라 축 변환 없이 그대로 통과시킨다.
  ※ 구 44권 키(성우 층위 없음·0-based)는 무수정 이력 보존 — 본 스크립트가 건드리지 않는다.
  ※ key_prefix는 추측하지 않고 매니페스트의 key_prefix 값을 그대로 쓴다(생성 시점 정본).

Content-Type (ADR-0034 결정 ③ — 확장자 자동추측 금지):
  mp3 → audio/mpeg · marks.json → application/json; charset=utf-8
  공통 Cache-Control: public, max-age=31536000, immutable

보안 (Hard Rule 6 · ADR-0003):
  secret 키는 **환경변수에서만** 읽는다. 코드·파일·로그에 출력·기록하지 않는다.
  URL : SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_URL
  KEY : SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY (표준: SUPABASE_SECRET_KEY)
  미설정 시 즉시 STOP + 안내(.env 파일을 만들거나 열지 않는다).

사용:
  python scripts/tts_pilot/upload_tts_fullbatch.py --dry-run          # 무비용·자격 불요(권장 선행)
  python scripts/tts_pilot/upload_tts_fullbatch.py --only best-friends
  python scripts/tts_pilot/upload_tts_fullbatch.py --limit 3          # 앞 3권만(소규모 선행)
  python scripts/tts_pilot/upload_tts_fullbatch.py                    # 전체 116권
  python scripts/tts_pilot/upload_tts_fullbatch.py --overwrite        # 기존 키 덮어쓰기
재개: 기본 동작이 '같은 키 존재 시 skip'이라 중단 후 재실행하면 남은 것만 올린다.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

PILOT = Path(__file__).resolve().parent
OUT = PILOT / "out"
AUDIO_ROOT = OUT / "audio_full_danielle"          # run_tts_fullbatch.py 산출 루트
REPORT = OUT / "_fullbatch_report.json"           # 대상 목록 단일 진실

BUCKET = "book-audio"
VOICE = "danielle"

CT_MP3 = "audio/mpeg"
CT_MARKS = "application/json; charset=utf-8"
CACHE = "public, max-age=31536000, immutable"

_UNIT_RE = re.compile(r"^p(\d+)$")


def load_targets() -> list[dict]:
    """_fullbatch_report.json 의 books[] 를 대상 목록으로 삼는다(성공 권만)."""
    if not REPORT.exists():
        print(f"[STOP] 배치 리포트 없음: {REPORT}\n"
              "  run_tts_fullbatch.py 생성이 먼저 끝나야 합니다.")
        sys.exit(2)
    rep = json.loads(REPORT.read_text(encoding="utf-8"))
    if rep.get("books_failed"):
        print(f"[STOP] 생성 실패 권 {rep['books_failed']}권 — 업로드 전 해결 필요: "
              f"{rep.get('failed_books')}")
        sys.exit(3)
    return [b for b in rep.get("books", []) if b.get("ok")]


def build_plan(slug: str) -> list[dict]:
    """(local, key, ct, label) 업로드 항목. 매니페스트 units[]가 유일한 근거."""
    book_dir = AUDIO_ROOT / slug
    man_path = book_dir / "_manifest.json"
    if not man_path.exists():
        raise FileNotFoundError(f"매니페스트 없음: {man_path.relative_to(PILOT)}")
    man = json.loads(man_path.read_text(encoding="utf-8"))

    # key_prefix는 생성 시점에 확정된 값을 그대로 쓴다(재조립 금지 — 규약이 갈릴 여지 제거).
    key_prefix = man.get("key_prefix") or f"book_dash-{slug}/{VOICE}"
    if not key_prefix.endswith(f"/{VOICE}"):
        raise ValueError(f"{slug}: key_prefix가 성우 층위가 아님 — {key_prefix}")

    items: list[dict] = []
    for u in man.get("units", []):
        unit = u["unit"]
        if unit != "cover" and not _UNIT_RE.fullmatch(unit):
            raise ValueError(f"{slug}: 알 수 없는 unit 이름 — {unit}")
        items.append({"local": book_dir / u["file"],
                      "key": f"{key_prefix}/{u['file']}", "ct": CT_MP3,
                      "label": u["file"]})
        if u.get("marks_file"):
            items.append({"local": book_dir / u["marks_file"],
                          "key": f"{key_prefix}/{u['marks_file']}", "ct": CT_MARKS,
                          "label": u["marks_file"]})
    return items


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
    """성우 폴더 안만 조회 — 구 44권 키(성우 층위 없음)와 무간섭."""
    try:
        items = client.storage.from_(BUCKET).list(key_prefix, {"limit": 1000})
    except Exception:  # noqa: BLE001
        return set()
    return {f"{key_prefix}/{it['name']}" for it in (items or []) if it.get("name")}


def main() -> int:
    ap = argparse.ArgumentParser(description="전량 116권 book-audio 업로드 (ADR-0053/0034)")
    ap.add_argument("--dry-run", action="store_true",
                    help="업로드 없이 키·로컬존재만 점검(무비용·자격 불요)")
    ap.add_argument("--only", default=None, help="쉼표구분 slug 부분 업로드")
    ap.add_argument("--limit", type=int, default=0, help="앞에서 N권만")
    ap.add_argument("--overwrite", action="store_true", help="같은 키 존재 시 덮어쓰기(기본 skip)")
    args = ap.parse_args()

    books = load_targets()
    all_slugs = [b["slug"] for b in books]

    if args.only:
        targets = [s.strip() for s in args.only.split(",") if s.strip()]
        unknown = [s for s in targets if s not in all_slugs]
        if unknown:
            print(f"[FAIL] --only 대상 밖/오타: {unknown}")
            return 1
    else:
        targets = all_slugs
    if args.limit:
        targets = targets[: args.limit]

    print(f"[INFO] 대상 {len(targets)}권 / 리포트 전체 {len(all_slugs)}권 "
          f"(버킷 {BUCKET}, 키 = book_dash-<slug>/{VOICE}/…)")
    print("=" * 96)

    plans: dict[str, list[dict]] = {}
    anomalies: list[str] = []
    total_items = 0
    for slug in targets:
        try:
            plan = build_plan(slug)
        except (FileNotFoundError, ValueError) as e:
            anomalies.append(f"{slug}: {e}")
            print(f"[{slug:38}] ✗ {e}")
            continue
        plans[slug] = plan
        total_items += len(plan)
        # 로컬 존재·크기는 dry-run이 아니어도 항상 검사한다(빈 파일 업로드 방지).
        for it in plan:
            if not it["local"].exists() or it["local"].stat().st_size == 0:
                anomalies.append(f"{slug}: 로컬 없음/빈파일 {it['label']}")
        if args.dry_run:
            print(f"[{slug:38}] items={len(plan):>3}  prefix={plan[0]['key'].rsplit('/', 1)[0]}")

    print("=" * 96)
    print(f"[합계] {len(plans)}권 / 업로드 항목 {total_items}개 "
          f"(기대: 권수×(유닛×2) — 전량이면 2,928개 = 1,464유닛 × mp3+marks)")
    if anomalies:
        print(f"[STOP] 이상 {len(anomalies)}건 — 진행 중단:")
        for a in anomalies[:20]:
            print(f"  - {a}")
        return 3

    if args.dry_run:
        print("[DRY-RUN] 경로·로컬존재 확인 전용 — 업로드 없이 종료.")
        return 0

    client, sb_url = init_supabase()
    up_ok, skip, fail = 0, 0, []
    for i, slug in enumerate(targets, 1):
        key_prefix = plans[slug][0]["key"].rsplit("/", 1)[0]
        present = set() if args.overwrite else existing_keys(client, key_prefix)
        for it in plans[slug]:
            if it["key"] in present:
                skip += 1
                continue
            try:
                client.storage.from_(BUCKET).upload(
                    it["key"], it["local"].read_bytes(),
                    {"content-type": it["ct"], "cache-control": CACHE,
                     "upsert": "true" if args.overwrite else "false"},
                )
                up_ok += 1
            except Exception as e:  # noqa: BLE001
                fail.append((it["key"], f"{type(e).__name__}: {e}"))
                print(f"  XX {it['key']}: {type(e).__name__}: {e}")
        print(f"[{i:>3}/{len(targets)}] {slug:<38} 누적 up={up_ok} skip={skip} fail={len(fail)}")

    print("=" * 96)
    print(f"[업로드] 성공 {up_ok} / 스킵(이미 존재) {skip} / 실패 {len(fail)}")
    print(f"[합계 확인] 성공+스킵 = {up_ok + skip} (기대 {total_items})")
    if fail:
        print("[FAIL] 실패 목록:")
        for k, e in fail[:30]:
            print(f"  {k}: {e}")
        print("  → 같은 명령을 재실행하면 성공분은 skip되고 실패분만 다시 시도합니다.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
