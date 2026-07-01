#!/usr/bin/env python3
"""
step3_resource_fix.py — STEP 3 dead-mirror 재소싱 (ADR-0032, 팀장 승인 2026-07-01)

배경: book_dash 활성책 5권의 DB cover_url(bookdash.github.io 미러)이 404 죽은 링크라
변환 실패(HTML→UnidentifiedImageError). 5권 모두 bookdash.org WP featured_media에서
정상 표지(200 image/jpeg) 확보 가능 — 기존 152건과 동일 origin.

원칙(팀장 지시):
  - 재소싱은 '변환 입력 source'만 교체. target_key·rollback baseline은 불변.
  - 롤백 baseline = manifest의 old_cover_url(=실제 DB값, github.io 404) 그대로.
  - 재소싱 5건은 step3_resourced.csv에 감사기록(STEP 3-B ADR 반영용).

변환본은 step3_out/bookdash-{source_id}.webp 에 저장(나머지 201건과 동일 위치·명명).
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import requests

# 변환 사양은 convert_bookdash_covers 모듈 재사용(600px·WebP·q80 동일 보장)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from convert_bookdash_covers import STEP3_OUT, convert_to_webp  # noqa: E402

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scratchpad" / "step3_manifest.csv"
AUDIT = ROOT / "scratchpad" / "step3_resourced.csv"
WP_BOOKS = "https://bookdash.org/wp-json/wp/v2/books"
HTTP_TIMEOUT = 60

# 재소싱 대상 5건 (source_id → slug). slug는 죽은 github.io URL에서 확인.
RESOURCE = {
    "9c9eb452-fe46-11e5-86aa-5e5517507c66": "i-can-dress-myself",
    "9c9eb574-fe46-11e5-86aa-5e5517507c66": "hugs-in-the-city",
    "9c9ffed4-fe46-11e5-86aa-5e5517507c66": "it-wasnt-me",
    "9c9fffba-fe46-11e5-86aa-5e5517507c66": "katiitis-song",
    "9ca00316-fe46-11e5-86aa-5e5517507c66": "the-lion-who-wouldnt-try",
}


def wp_featured_media(slug: str) -> str:
    resp = requests.get(WP_BOOKS, params={"slug": slug, "_embed": 1}, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        raise ValueError(f"WP API: slug '{slug}' 책 없음")
    fm = (data[0].get("_embedded") or {}).get("wp:featuredmedia") or []
    src = (fm[0] or {}).get("source_url") if fm else None
    if not src:
        raise ValueError(f"WP API: slug '{slug}' featured_media 없음")
    return src


def main() -> int:
    # manifest에서 각 대상의 죽은 old_cover_url(감사기록용) 확보
    dead = {r["source_id"]: r["old_cover_url"] for r in csv.DictReader(MANIFEST.open(encoding="utf-8"))}
    STEP3_OUT.mkdir(parents=True, exist_ok=True)

    audit_rows = []
    ok = 0
    failed = []
    for sid, slug in RESOURCE.items():
        try:
            wp_url = wp_featured_media(slug)
            raw = requests.get(wp_url, timeout=HTTP_TIMEOUT).content
            webp, (ow, oh), (nw, nh) = convert_to_webp(raw)
            key = f"bookdash-{sid}.webp"
            (STEP3_OUT / key).write_bytes(webp)
            ok += 1
            print(f"  OK  {slug:28} {len(raw)/1024/1024:5.2f}MB→{len(webp)/1024:6.1f}KB {nw}x{nh}")
            audit_rows.append(
                {
                    "source_id": sid,
                    "slug": slug,
                    "dead_github_io_url": dead.get(sid, ""),
                    "resourced_wp_url": wp_url,
                    "webp_bytes": len(webp),
                }
            )
        except Exception as e:  # noqa: BLE001
            failed.append((slug, f"{type(e).__name__}: {e}"))
            print(f"  XX  {slug:28} {type(e).__name__}: {e}")

    with AUDIT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f, fieldnames=["source_id", "slug", "dead_github_io_url", "resourced_wp_url", "webp_bytes"]
        )
        w.writeheader()
        w.writerows(audit_rows)

    print(f"\n재소싱 변환 {ok}/{len(RESOURCE)}  감사기록: {AUDIT}")
    if failed:
        print("[FAIL] 재소싱 실패:")
        for slug, err in failed:
            print(f"  - {slug}: {err}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
