#!/usr/bin/env python3
"""
upload_audio.py — v1 html 배치 오디오 → Supabase Storage 'book-audio' 업로드 (ADR-0034 결정 ②③)

★ Storage 전용 쓰기. DB write 0건(book_audio INSERT·has_audio 는 다음 단계, 팀장 SQL).
★ 파일럿 격리 스크립트. 프로덕션 sync_*.py 무접촉.

경로 규칙(ADR-0034 결정 ②, 원문 그대로):
  book-audio/{book_key}/pNN.mp3         (본문 페이지 오디오, NN = 0-based 2자리 zero-pad)
  book-audio/{book_key}/pNN.marks.json  (동 word speech-marks)
  book-audio/{book_key}/cover.mp3       (표지 오디오 — ADR-0034 미정의, 아래 [주의] 참조)
  book-audio/{book_key}/cover.marks.json
  {book_key} = {source_platform}-{source_id}  (예: book_dash-9c9e55de-...)
    · source_id = Book Dash 메타 고유 UUID (ADR-0034 §2: 커버 컨벤션 bookdash-{UUID} 계승, slug 아님)

Content-Type(ADR-0034 결정 ③, 명시 지정 — 확장자 자동추측 금지):
  mp3        → audio/mpeg
  marks.json → application/json; charset=utf-8
  공통 캐시   → Cache-Control: public, max-age=31536000, immutable

[주의 — 표지 DB 표현 미정]
  ADR-0034 스키마(book_audio)는 page_index(0-based, CHECK>=0)만 있고 '표지' 슬롯이 없다.
  표지 오디오는 이 배치에서 추가된 산출물로, 파일은 {book_key}/cover.mp3 에 co-location 업로드하되
  DB 적재 형태(별도 컬럼 / page 예약값 등)는 ADR-0034 Amendment 로 확정 필요(다음 단계 전 결정).

보안(Hard Rule 6 · ADR-0003):
  service_role/secret 키는 **환경변수에서만** 읽는다. 코드·파일·로그에 절대 출력·기록 금지.
  URL  : SUPABASE_URL  또는  NEXT_PUBLIC_SUPABASE_URL
  KEY  : SUPABASE_SECRET_KEY  또는  SUPABASE_SERVICE_ROLE_KEY  (프로젝트 표준은 SUPABASE_SECRET_KEY)
  키 미설정 시 즉시 STOP + PowerShell 등록 안내(.env 파일 생성/수정 안 함).

사용:
  python scripts/tts_pilot/upload_audio.py --dry-run
  python scripts/tts_pilot/upload_audio.py --only springloaded,sima-and-siza,together-were-strong
  python scripts/tts_pilot/upload_audio.py --only <slug> --overwrite
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path

import requests

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

PILOT = Path(__file__).resolve().parent
OUT = PILOT / "out"
AUDIO = OUT / "audio"
REPO = PILOT.parent.parent
RECON_CSV = REPO / "scratchpad" / "tts_recon_49.csv"

BUCKET = "book-audio"
SOURCE_PLATFORM = "book_dash"  # 이 코호트(v1 html 정찰)는 전부 book_dash. 가정 아님(구성 자체).
VOICE_SUFFIX = "_Ruth_r78"     # 배치 스펙 파일 접미사

CT_MP3 = "audio/mpeg"
CT_MARKS = "application/json; charset=utf-8"
CACHE = "public, max-age=31536000, immutable"

# 무텍스트 5권(본문 배치 제외분) — 업로드 코호트에서도 제외
EXCLUDE = {
    "hugs-in-the-city", "i-can-dress-myself", "it-wasnt-me",
    "katiitis-song", "the-lion-who-wouldnt-try",
}
# STEP 4d 실증: 이 3권만 DB books.source_id 가 full-slug(대부분은 UUID).
#   Storage 키는 ADR-0034 커버 컨벤션대로 메타 UUID 사용(커버 파일과 정합) → 드라이런에서 플래그.
DB_SLUG_SOURCE_ID = {"little-sock", "maddy-moona", "mrs-penguins-palace"}


def load_cohort(only: set[str] | None) -> list[dict]:
    rows = list(csv.DictReader(RECON_CSV.read_text(encoding="utf-8").splitlines()))
    cohort = []
    for r in rows:
        slug = (r.get("slug") or "").strip()
        if not slug or slug in EXCLUDE:
            continue
        if only and slug not in only:
            continue
        source_id = (r.get("source_id") or "").strip()  # 메타 UUID (ADR-0034 §2 키 컨벤션)
        cohort.append({
            "slug": slug,
            "book_id": (r.get("id") or "").strip(),      # books.id (다음 단계 INSERT용)
            "source_platform": SOURCE_PLATFORM,
            "source_id": source_id,
            "book_key": f"{SOURCE_PLATFORM}-{source_id}",
        })
    return cohort


def build_plan(book: dict) -> list[dict]:
    """(local_path, key, content_type, kind) 업로드 항목 리스트."""
    slug = book["slug"]
    key = book["book_key"]
    man_path = OUT / f"{slug}{VOICE_SUFFIX}.tts.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    items: list[dict] = []
    for s in man["scenes"]:
        if not s.get("audio"):
            continue  # 빈 텍스트 페이지(음성 스킵) — 업로드 대상 아님
        nn = int(s["page"]) - 1  # ADR-0034: page_index 0-based, 경로 pNN 정합
        mp3 = (PILOT / str(s["audio"]).replace("\\", "/")).resolve()
        marks = (PILOT / str(s["marks"]).replace("\\", "/")).resolve()
        items.append({"local": mp3, "key": f"{key}/p{nn:02d}.mp3", "ct": CT_MP3, "kind": f"body p{nn:02d}"})
        items.append({"local": marks, "key": f"{key}/p{nn:02d}.marks.json", "ct": CT_MARKS, "kind": f"body p{nn:02d} marks"})
    # 표지 (ADR-0034 미정의 — co-location 업로드, DB 표현은 Amendment 대기)
    cov_mp3 = AUDIO / f"{slug}-cover.mp3"
    cov_marks = AUDIO / f"{slug}-cover.marks.json"
    if cov_mp3.exists():
        items.append({"local": cov_mp3, "key": f"{key}/cover.mp3", "ct": CT_MP3, "kind": "cover"})
    if cov_marks.exists():
        items.append({"local": cov_marks, "key": f"{key}/cover.marks.json", "ct": CT_MARKS, "kind": "cover marks"})
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
            "  (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 이름도 인식)\n"
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


def main() -> int:
    ap = argparse.ArgumentParser(description="book-audio 업로드 (ADR-0034)")
    ap.add_argument("--dry-run", action="store_true", help="업로드 없이 경로 키만 출력(무비용, 자격 불요)")
    ap.add_argument("--only", default=None, help="쉼표구분 slug 부분 업로드(기본 전체 44권)")
    ap.add_argument("--overwrite", action="store_true", help="같은 키 존재 시 덮어쓰기(기본 skip)")
    args = ap.parse_args()

    only = {s.strip() for s in args.only.split(",")} if args.only else None
    cohort = load_cohort(only)
    if only:
        missing = only - {b["slug"] for b in cohort}
        if missing:
            print(f"[FAIL] --only 대상 코호트 밖/오타: {sorted(missing)}")
            return 1
    print(f"[INFO] 대상 {len(cohort)}권 (버킷 {BUCKET}, 키 = {SOURCE_PLATFORM}-<source_id>)")
    print(f"[MAP] 매핑 출처: {RECON_CSV.name} (source_id=메타 UUID / book_id=books.id). ADR-0034 §2 키 컨벤션.")
    print("=" * 96)

    # 이상 점검(빈 source_id / 중복 book_key)
    anomalies = []
    seen_keys: dict[str, str] = {}
    for b in cohort:
        if not b["source_id"]:
            anomalies.append(f"{b['slug']}: source_id 빈값")
        if b["book_key"] in seen_keys:
            anomalies.append(f"{b['slug']}: book_key 중복({b['book_key']} ↔ {seen_keys[b['book_key']]})")
        seen_keys[b["book_key"]] = b["slug"]

    total_items = 0
    plans = {}
    for b in cohort:
        plan = build_plan(b)
        plans[b["slug"]] = plan
        total_items += len(plan)
        flag = "  ⚠DB source_id=slug(키는 UUID 유지)" if b["slug"] in DB_SLUG_SOURCE_ID else ""
        print(f"[{b['slug']:34}] key={b['book_key']}  items={len(plan)}{flag}")
        if args.dry_run:
            for it in plan:
                exists_local = it["local"].exists()
                mark = "" if exists_local else "  ✗로컬없음"
                print(f"      {it['key']:52} <- {it['local'].name}{mark}")
                if not exists_local:
                    anomalies.append(f"{b['slug']}: 로컬 없음 {it['local'].name}")

    print("=" * 96)
    print(f"[합계] {len(cohort)}권 / 업로드 항목 {total_items}개")
    if anomalies:
        print(f"[STOP] 이상 {len(anomalies)}건 — 진행 중단:")
        for a in anomalies:
            print(f"  - {a}")
        return 3

    if args.dry_run:
        print("[DRY-RUN] 경로 확인 전용 — 업로드 없이 종료.")
        if any(b["slug"] in DB_SLUG_SOURCE_ID for b in cohort):
            print("[플래그] 위 ⚠ 3권은 DB books.source_id가 slug이나, Storage 키는 커버 컨벤션대로 메타 UUID 사용.")
        return 0

    # ---- 실제 업로드 ----
    client, sb_url = init_supabase()
    up_ok, skip, fail = 0, 0, []
    for b in cohort:
        present = set() if args.overwrite else existing_keys(client, b["book_key"])
        for it in plans[b["slug"]]:
            if it["key"] in present:
                skip += 1
                print(f"  skip(존재) {it['key']}")
                continue
            try:
                client.storage.from_(BUCKET).upload(
                    it["key"], it["local"].read_bytes(),
                    {"content-type": it["ct"], "cache-control": CACHE, "upsert": "true" if args.overwrite else "false"},
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

    # ---- 확인용: 각 책 cover.mp3 + p00.mp3 공개 URL GET (200 + content-type) ----
    print("\n[확인용 URL] 공개 URL HTTP GET (200 + Content-Type):")
    for b in cohort:
        for suffix in ("cover.mp3", "p00.mp3", "p00.marks.json"):
            key = f"{b['book_key']}/{suffix}"
            url = f"{sb_url}/storage/v1/object/public/{BUCKET}/{key}"
            try:
                r = requests.get(url, timeout=30)
                print(f"  [{r.status_code}] {r.headers.get('content-type',''):32} {url}")
            except Exception as e:  # noqa: BLE001
                print(f"  [ERR] {type(e).__name__} {url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
