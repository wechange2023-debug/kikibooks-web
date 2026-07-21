#!/usr/bin/env python3
"""upload_tts_pilot12.py — 시범 12권 TTS 오디오 → Supabase Storage 'book-audio' 업로드.

ADR-0052 Phase E · Unit 3 (업로더 B안). ADR-0034 결정 ②③ 규약 계승.

★ Storage 전용 쓰기. DB write 0건(book_audio INSERT·has_audio 는 Phase F, 팀장 SQL).
★ 기존 upload_audio.py(구 44권·UUID 키)와 별개 — 이 스크립트는 12권 slug 코호트 전용.
  우리 12권은 books.source_id = slug 이므로 book_key = book_dash-{slug} 로 귀결된다
  (이미지 경로 book-images/book_dash-{slug}/NN.jpg 와 평행 정합).

경로 규칙(ADR-0034 결정 ②):
  book-audio/book_dash-{slug}/pNN.mp3         (NN = page-1, 0-based 2자리 zero-pad)
  book-audio/book_dash-{slug}/pNN.marks.json

Content-Type(ADR-0034 결정 ③, 명시 지정 — 확장자 자동추측 금지):
  mp3        → audio/mpeg
  marks.json → application/json; charset=utf-8
  공통 캐시   → Cache-Control: public, max-age=31536000, immutable

입력: out/{slug}_Ruth_r78.tts.json (generate_tts.py 매니페스트) + out/audio/*.mp3|.marks.json

보안(Hard Rule 6 · ADR-0003):
  secret 키는 환경변수에서만 읽는다. 코드·파일·로그에 절대 출력·기록 금지.
  URL : SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_URL
  KEY : SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY (표준: SUPABASE_SECRET_KEY)
  키 미설정 시 즉시 STOP + 등록 안내(.env 파일 생성/수정 안 함).

사용:
  python scripts/tts_pilot/upload_tts_pilot12.py --dry-run                     # 무비용·자격 불요
  python scripts/tts_pilot/upload_tts_pilot12.py --only a-trip-to-the-tap      # 부분(대표 우선)
  python scripts/tts_pilot/upload_tts_pilot12.py                               # 전체 12권
  python scripts/tts_pilot/upload_tts_pilot12.py --overwrite                   # 기존 키 덮어쓰기
"""
from __future__ import annotations

import argparse
import json
import os
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
AUDIO = OUT / "audio"

BUCKET = "book-audio"
SUFFIX = "_Ruth_r78"  # generate_tts.py 파일명 접미사(voice=Ruth, rate=78)

CT_MP3 = "audio/mpeg"
CT_MARKS = "application/json; charset=utf-8"
CACHE = "public, max-age=31536000, immutable"

# lib/admin/review/pilot-cohort.ts와 동일 집합. build_tts_input.py / run_tts_batch.py와 동기화.
PILOT_COHORT = [
    "a-day-out", "a-trip-to-the-tap", "a-very-busy-day", "aaaaahhh-mmawe",
    "alexs-super-medicine", "amahle-wants-to-help", "ann-nem-oh-nee-finds-adventure",
    "auntie-bois-gift", "baby-babble", "baby-talk", "babys-first-family-photo",
    "banzis-busy-bees",
]
REP_SLUGS = ["a-trip-to-the-tap", "amahle-wants-to-help", "baby-babble"]


def build_plan(slug: str) -> list[dict]:
    """(local_path, key, content_type, label) 업로드 항목 리스트. 매니페스트 없으면 예외."""
    man_path = OUT / f"{slug}{SUFFIX}.tts.json"
    if not man_path.exists():
        raise FileNotFoundError(f"매니페스트 없음: {man_path.name} (run_tts_batch.py 먼저 실행)")
    man = json.loads(man_path.read_text(encoding="utf-8"))
    book_key = f"book_dash-{slug}"
    items: list[dict] = []
    for s in man.get("scenes", []):
        if not s.get("audio"):
            continue  # 빈 텍스트 페이지(음성 스킵) — 업로드 대상 아님
        nn = int(s["page"]) - 1  # ADR-0034: page_index 0-based, 경로 pNN 정합
        mp3 = (PILOT / str(s["audio"]).replace("\\", "/")).resolve()
        marks = (PILOT / str(s["marks"]).replace("\\", "/")).resolve()
        items.append({"local": mp3, "key": f"{book_key}/p{nn:02d}.mp3", "ct": CT_MP3,
                      "label": f"p{nn:02d}.mp3"})
        items.append({"local": marks, "key": f"{book_key}/p{nn:02d}.marks.json", "ct": CT_MARKS,
                      "label": f"p{nn:02d}.marks.json"})
    return items


def init_supabase():
    """OS 환경변수에서만 자격 로드. .env 파일 생성/수정/열람 안 함."""
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "[STOP] Storage 자격증명 미설정 — 업로드 불가.\n"
            "  PowerShell 창에서 실행 직전 아래를 등록하세요(자식 프로세스 상속, .env 만들지 마세요):\n"
            '    $env:SUPABASE_URL = "https://<프로젝트>.supabase.co"\n'
            '    $env:SUPABASE_SECRET_KEY = "sb_secret_..."   # service_role/secret 키\n'
            "  키 값은 절대 이 스크립트나 파일에 넣지 마세요(Hard Rule 6)."
        )
        sys.exit(2)
    try:
        from supabase import create_client
    except ImportError:
        print("[FAIL] supabase 미설치: pip install supabase")
        sys.exit(1)
    return create_client(url, key), url.rstrip("/")


def existing_keys(client, book_key: str) -> set[str]:
    try:
        items = client.storage.from_(BUCKET).list(book_key, {"limit": 1000})
    except Exception:  # noqa: BLE001
        return set()
    return {f"{book_key}/{it['name']}" for it in (items or []) if it.get("name")}


def order_rep_first(slugs: list[str]) -> list[str]:
    return [s for s in slugs if s in REP_SLUGS] + [s for s in slugs if s not in REP_SLUGS]


def main() -> int:
    ap = argparse.ArgumentParser(description="시범 12권 book-audio 업로드 (ADR-0052/0034)")
    ap.add_argument("--dry-run", action="store_true", help="업로드 없이 키·로컬존재만 출력(무비용·자격 불요)")
    ap.add_argument("--only", default=None, help="쉼표구분 slug 부분 업로드(기본 전체 12권)")
    ap.add_argument("--overwrite", action="store_true", help="같은 키 존재 시 덮어쓰기(기본 skip)")
    args = ap.parse_args()

    if args.only:
        targets = [s.strip() for s in args.only.split(",") if s.strip()]
        unknown = [s for s in targets if s not in PILOT_COHORT]
        if unknown:
            print(f"[FAIL] --only 코호트 밖/오타: {unknown}")
            return 1
    else:
        targets = list(PILOT_COHORT)
    targets = order_rep_first(targets)

    print(f"[INFO] 대상 {len(targets)}권 (버킷 {BUCKET}, 키 = book_dash-<slug>)")
    print("=" * 96)

    # 계획 수립 + 로컬 존재 점검(이상 시 진행 중단).
    plans: dict[str, list[dict]] = {}
    anomalies: list[str] = []
    total_items = 0
    for slug in targets:
        try:
            plan = build_plan(slug)
        except FileNotFoundError as e:
            anomalies.append(f"{slug}: {e}")
            print(f"[{slug:34}] ✗ {e}")
            continue
        plans[slug] = plan
        total_items += len(plan)
        tag = "★" if slug in REP_SLUGS else " "
        print(f"[{tag}{slug:33}] key=book_dash-{slug}  items={len(plan)}")
        if args.dry_run:
            for it in plan:
                ok_local = it["local"].exists() and it["local"].stat().st_size > 0
                mark = "" if ok_local else "  ✗로컬없음/빈파일"
                print(f"      {it['key']:48} <- {it['local'].name}{mark}")
                if not ok_local:
                    anomalies.append(f"{slug}: 로컬 없음/빈파일 {it['local'].name}")

    print("=" * 96)
    print(f"[합계] {len(plans)}권 / 업로드 항목 {total_items}개")
    if anomalies:
        print(f"[STOP] 이상 {len(anomalies)}건 — 진행 중단:")
        for a in anomalies:
            print(f"  - {a}")
        return 3

    if args.dry_run:
        print("[DRY-RUN] 경로·로컬존재 확인 전용 — 업로드 없이 종료.")
        return 0

    # ---- 실제 업로드 ----
    client, sb_url = init_supabase()
    up_ok, skip, fail = 0, 0, []
    for slug in targets:
        book_key = f"book_dash-{slug}"
        present = set() if args.overwrite else existing_keys(client, book_key)
        for it in plans[slug]:
            if it["key"] in present:
                skip += 1
                print(f"  skip(존재) {it['key']}")
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
    print("=" * 96)
    print(f"[업로드] 성공 {up_ok} / 스킵(존재) {skip} / 실패 {len(fail)}")
    if fail:
        for k, e in fail:
            print(f"  FAIL {k}: {e}")
        return 1

    # ---- 확인용: 각 책 p00.mp3 공개 URL GET (200 + Content-Type) ----
    try:
        import requests
    except ImportError:
        print("[INFO] requests 미설치 — 공개 URL 확인 생략(업로드 자체는 완료).")
        return 0
    print("\n[확인용 URL] 공개 URL HTTP GET (200 + Content-Type):")
    for slug in targets:
        key = f"book_dash-{slug}/p00.mp3"
        url = f"{sb_url}/storage/v1/object/public/{BUCKET}/{key}"
        try:
            r = requests.get(url, timeout=30)
            print(f"  [{r.status_code}] {r.headers.get('content-type',''):28} {url}")
        except Exception as e:  # noqa: BLE001
            print(f"  [ERR] {type(e).__name__} {url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
