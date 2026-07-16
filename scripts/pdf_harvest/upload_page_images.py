# -*- coding: utf-8 -*-
"""ADR-0049 — 152권 페이지 이미지 → Supabase Storage 'book-images' 업로드.

★ Storage 전용 쓰기. DB write 0건(ADR-0049 D5 — 이미지 장부 없음, 뷰어가 규칙 조립).
★ 인증은 OS 환경변수에서만(SUPABASE_SECRET_KEY). .env 생성/열람·키 파일기록 절대 금지(Hard Rule 6).
★ copy_bookdash_images.py의 인증·업로드 호출 패턴 재사용(키 규약·출처·코호트는 다르므로 스크립트 신규).

키 규약 (ADR-0049 D3, ADR-0036 D2 계승):
  book-images/book_dash-{slug}/{NN}.jpg   (NN = 로컬 파일명 그대로 = 2자리 zero-pad·1-based = page_index+1)
  ※ source_id = slug 코호트(ADR-0047 D1 조인 근거) → 기존 UUID 39권 폴더와 키 충돌 없음.

로컬 입력: {images}/{slug}/{NN}.jpg  (render_page_images.py 산출, 152권 × 14 = 2128장)

멱등성: 기존 객체 있으면 skip(기본). --overwrite 시 upsert.
완결성 게이트: 업로드 계획 대상이 2128건이 아니면 시작 전 raise(파일 미업로드).

사용:
  python scripts/pdf_harvest/upload_page_images.py --slugs scripts/pdf_harvest/population_152.txt \
      --images scripts/pdf_harvest/out_images_154 --dry-run
  python scripts/pdf_harvest/upload_page_images.py --slugs scripts/pdf_harvest/population_152.txt \
      --images scripts/pdf_harvest/out_images_154
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

BUCKET = "book-images"
SOURCE_PLATFORM = "book_dash"
CT_JPEG = "image/jpeg"
CACHE = "public, max-age=31536000, immutable"  # ADR-0036 D4 정합
EXPECT_OBJECTS = 2128
EXPECT_BOOKS = 152

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass


def build_plan(slugs: list[str], images_root: Path) -> list[dict]:
    """[{slug, local, key}] 업로드 계획. slug 폴더의 *.jpg 전부."""
    plan: list[dict] = []
    for slug in slugs:
        d = images_root / slug
        if not d.is_dir():
            raise SystemExit(f"[STOP] 이미지 폴더 부재: {d}")
        jpgs = sorted(d.glob("*.jpg"))
        if not jpgs:
            raise SystemExit(f"[STOP] {slug}: jpg 0장")
        book_key = f"{SOURCE_PLATFORM}-{slug}"
        for f in jpgs:
            plan.append({"slug": slug, "local": f, "key": f"{book_key}/{f.name}"})
    return plan


def init_supabase():
    """OS 환경변수에서만 자격 로드(copy_bookdash_images.py 패턴). .env 생성/열람 안 함."""
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "[STOP] Storage 자격증명 미설정 — 업로드 불가.\n"
            "  PowerShell 창에서 실행 직전 아래를 등록하세요(자식 프로세스 상속, .env 만들지 마세요):\n"
            '    $env:SUPABASE_URL = "https://<프로젝트>.supabase.co"\n'
            '    $env:SUPABASE_SECRET_KEY = "sb_secret_..."   # service_role/secret 키\n'
            "  (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 이름도 인식)\n"
            "  키 값은 절대 이 스크립트나 파일에 넣지 마세요."
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
    ap = argparse.ArgumentParser(description="page image 업로드 (ADR-0049)")
    ap.add_argument("--slugs", required=True)
    ap.add_argument("--images", required=True, help="이미지 루트({slug}/{NN}.jpg)")
    ap.add_argument("--dry-run", action="store_true", help="업로드 없이 키 목록만(자격 불요)")
    ap.add_argument("--limit", type=int, default=None, help="앞 N권만")
    ap.add_argument("--overwrite", action="store_true", help="기존 키 덮어쓰기(기본 skip)")
    a = ap.parse_args()

    images_root = Path(a.images)
    slugs = [s.strip() for s in Path(a.slugs).read_text(encoding="utf-8").splitlines() if s.strip()]
    if a.limit is not None:
        slugs = slugs[: a.limit]

    plan = build_plan(slugs, images_root)
    n_books = len({p["slug"] for p in plan})
    print(f"[INFO] 대상 {n_books}권 · 객체 {len(plan)}건 (버킷 {BUCKET}, 키 book_dash-<slug>/NN.jpg)")

    # 완결성 게이트 — limit 미사용 시에만 2128 강제(부분 실행은 게이트 면제)
    if a.limit is None:
        if n_books != EXPECT_BOOKS:
            raise SystemExit(f"[STOP] 권 수 {n_books} != {EXPECT_BOOKS}")
        if len(plan) != EXPECT_OBJECTS:
            raise SystemExit(f"[STOP] 객체 수 {len(plan)} != {EXPECT_OBJECTS} — 미업로드")

    print("키 샘플 3개:")
    for p in plan[:3]:
        print(f"  {p['key']}  <- {p['local']}")

    if a.dry_run:
        print(f"[DRY-RUN] 업로드/자격 없이 종료. 계획 {len(plan)}건.")
        return 0

    # ---- 실제 업로드 ----
    client, sb_url = init_supabase()
    t0 = time.time()
    up_ok, skip = 0, 0
    fails: list[tuple[str, str]] = []
    present_cache: dict[str, set[str]] = {}
    per_slug: dict[str, list[int]] = {}  # slug -> [up, skip]

    for p in plan:
        slug, key, local = p["slug"], p["key"], p["local"]
        per_slug.setdefault(slug, [0, 0])
        book_key = f"{SOURCE_PLATFORM}-{slug}"
        if not a.overwrite:
            if book_key not in present_cache:
                present_cache[book_key] = existing_keys(client, book_key)
            if key in present_cache[book_key]:
                skip += 1
                per_slug[slug][1] += 1
                continue
        try:
            data = local.read_bytes()
            client.storage.from_(BUCKET).upload(
                key, data,
                {"content-type": CT_JPEG, "cache-control": CACHE,
                 "upsert": "true" if a.overwrite else "false"},
            )
            up_ok += 1
            per_slug[slug][0] += 1
        except Exception as e:  # noqa: BLE001
            fails.append((key, f"{type(e).__name__}: {e}"))

    dt = time.time() - t0
    print("=" * 72)
    for slug in sorted(per_slug):
        u, s = per_slug[slug]
        print(f"  {slug:40} up {u:2} / skip {s:2}")
    print("=" * 72)
    print(f"[합계] 업로드 {up_ok} / skip {skip} / 실패 {len(fails)} / 소요 {dt:.1f}s")
    for k, e in fails:
        print(f"  FAIL {k}: {e}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
