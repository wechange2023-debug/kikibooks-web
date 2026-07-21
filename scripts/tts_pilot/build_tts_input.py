"""book_text(DB export) → TTS 입력 브리지 (ADR-0052 D3 A안 / Phase E Unit 2).

역할
----
팀장이 Supabase SQL Editor에서 export한 confirmed 도서의 book_text JSON을 읽어,
파일럿 TTS 스크립트(generate_tts.py)가 그대로 소비하는 입력 형식으로 변환한다.
    입력  : scripts/tts_pilot/in/book_text_export.json   (팀장 SQL export, BRIDGE.md 참조)
    출력  : scripts/tts_pilot/out/{slug}.json            = [{page, image_url, text}, ...]
    부산물: scripts/tts_pilot/out/_bridge_report.json    (권별 검증 요약)

워커는 DB에 직접 접근하지 않는다(ADR-0052 D3). 이 스크립트는 export JSON만 읽는다.

입력 export 스키마 (BRIDGE.md의 SQL 산출과 동일)
------------------------------------------------
JSON 배열, 각 행:
    { "slug": str(=books.source_id), "book_id": str, "title": str,
      "status": str, "page_index": int(0-based), "text": str|null }

변환 규칙 (ADR-0052 D4·D5)
--------------------------
    page      = page_index + 1                      (= 이미지 파일명 NN, mp3 파일명 p{N})
    image_url = {base}/storage/v1/object/public/book-images/book_dash-{slug}/{NN}.jpg
                NN = page 2자리 zero-pad. base = NEXT_PUBLIC_SUPABASE_URL(env) 또는 --image-base.
    text      = book_text.text (null/공백은 빈 문자열 → generate_tts.py가 음성 스킵)

검증 요약 (지시서 §2-1: 권별 페이지 수·총 문자 수·빈 페이지 여부)
    권별: pages, empty_text_pages, total_chars, page_index 연속성(min/max/누락), status.

사용
----
    python scripts/tts_pilot/build_tts_input.py                 # in/book_text_export.json 전권
    python scripts/tts_pilot/build_tts_input.py --rep-only      # 대표 3권만
    python scripts/tts_pilot/build_tts_input.py --slugs baby-babble,a-day-out
    python scripts/tts_pilot/build_tts_input.py --export <경로> --out-dir <경로>
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except AttributeError:
        pass

PILOT_DIR = Path(__file__).resolve().parent
DEFAULT_EXPORT = PILOT_DIR / "in" / "book_text_export.json"
DEFAULT_OUT_DIR = PILOT_DIR / "out"

# 시범 12권 코호트 — lib/admin/review/pilot-cohort.ts와 동일 집합(수기 동기화 대상).
PILOT_COHORT = [
    "a-day-out",
    "a-trip-to-the-tap",
    "a-very-busy-day",
    "aaaaahhh-mmawe",
    "alexs-super-medicine",
    "amahle-wants-to-help",
    "ann-nem-oh-nee-finds-adventure",
    "auntie-bois-gift",
    "baby-babble",
    "baby-talk",
    "babys-first-family-photo",
    "banzis-busy-bees",
]
# 대표 3권 (ADR-0052 D2).
REP_SLUGS = ["a-trip-to-the-tap", "amahle-wants-to-help", "baby-babble"]

STORAGE_TMPL = "storage/v1/object/public/book-images/book_dash-{slug}/{nn}.jpg"


def rel(path: Path) -> str:
    """표시용 상대경로. pilot 폴더 밖(커스텀 --out-dir)이면 절대경로로 폴백."""
    try:
        return str(path.relative_to(PILOT_DIR))
    except ValueError:
        return str(path)


def build_image_url(base: str | None, slug: str, page: int) -> str:
    """canonical 이미지 URL(ADR-0052 D4). base 없으면 storage 상대 키로 폴백(경고)."""
    nn = f"{page:02d}"
    rel = STORAGE_TMPL.format(slug=slug, nn=nn)
    if base:
        return f"{base.rstrip('/')}/{rel}"
    return rel


def load_export(path: Path) -> list[dict]:
    if not path.exists():
        print(f"[FAIL] export 파일 없음: {path}")
        print("       → BRIDGE.md의 SQL을 SQL Editor에서 실행하고 결과를 이 경로에 저장하세요.")
        raise SystemExit(2)
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        print(f"[FAIL] export 파일 비어 있음: {path}")
        raise SystemExit(2)
    data = json.loads(raw)
    # json_agg 결과를 셀 그대로 붙이면 [{...}] 배열. 혹시 {"export":[...]} 형태여도 수용.
    if isinstance(data, dict) and "export" in data:
        data = data["export"]
    if not isinstance(data, list):
        print(f"[FAIL] export 형식 오류: 최상위가 배열이 아님({type(data).__name__})")
        raise SystemExit(2)
    return data


def main() -> int:
    ap = argparse.ArgumentParser(description="book_text export → TTS 입력 브리지 (ADR-0052)")
    ap.add_argument("--export", default=str(DEFAULT_EXPORT), help="팀장 SQL export JSON 경로")
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="출력 out/{slug}.json 디렉터리")
    ap.add_argument("--rep-only", action="store_true", help="대표 3권만 변환")
    ap.add_argument("--slugs", default=None, help="쉼표구분 slug 화이트리스트(우선순위 최상)")
    ap.add_argument("--image-base", default=None,
                    help="이미지 URL base. 미지정 시 env NEXT_PUBLIC_SUPABASE_URL 사용")
    args = ap.parse_args()

    export_path = Path(args.export)
    out_dir = Path(args.out_dir)
    image_base = args.image_base or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    if not image_base:
        print("[WARN] NEXT_PUBLIC_SUPABASE_URL 미설정·--image-base 미지정 "
              "→ image_url을 storage 상대 키로 기록(뷰어 통합 전 무방, TTS엔 무영향).")

    rows = load_export(export_path)

    # slug 화이트리스트 결정: --slugs > --rep-only > 코호트 전체.
    if args.slugs:
        wanted = [s.strip() for s in args.slugs.split(",") if s.strip()]
    elif args.rep_only:
        wanted = list(REP_SLUGS)
    else:
        wanted = list(PILOT_COHORT)
    wanted_set = set(wanted)

    # slug별 그룹핑.
    by_slug: dict[str, list[dict]] = {}
    titles: dict[str, str] = {}
    statuses: dict[str, str] = {}
    for r in rows:
        slug = r.get("slug")
        if slug not in wanted_set:
            continue
        by_slug.setdefault(slug, []).append(r)
        if r.get("title") is not None:
            titles[slug] = r["title"]
        if r.get("status") is not None:
            statuses[slug] = r["status"]

    out_dir.mkdir(parents=True, exist_ok=True)
    report: list[dict] = []
    ok_count = 0

    # 요청 순서(대표 우선 정렬): wanted 순서 그대로 처리.
    for slug in wanted:
        page_rows = by_slug.get(slug)
        if not page_rows:
            print(f"[MISS] {slug}: export에 행 없음 (confirmed 아님·SQL 범위 밖?)")
            report.append({"slug": slug, "status": statuses.get(slug), "found": False,
                           "pages": 0, "note": "export에 행 없음"})
            continue

        page_rows.sort(key=lambda r: r["page_index"])
        indices = [int(r["page_index"]) for r in page_rows]

        scenes: list[dict] = []
        empty_pages: list[int] = []
        total_chars = 0
        for r in page_rows:
            pi = int(r["page_index"])
            page = pi + 1
            text = (r.get("text") or "").strip()
            if not text:
                empty_pages.append(page)
            else:
                total_chars += len(text)
            scenes.append({
                "page": page,
                "image_url": build_image_url(image_base, slug, page),
                "text": text,
            })

        # 연속성 점검: 0..max 누락 여부.
        expected = list(range(min(indices), max(indices) + 1))
        missing = sorted(set(expected) - set(indices))
        starts_at_zero = min(indices) == 0

        out_path = out_dir / f"{slug}.json"
        out_path.write_text(json.dumps(scenes, ensure_ascii=False, indent=2), encoding="utf-8")
        ok_count += 1

        status = statuses.get(slug)
        status_flag = "" if status in ("confirmed", "tts_done") else f"  ⚠status={status}"
        cont_flag = "" if (not missing and starts_at_zero) else \
            f"  ⚠page_index 이상(start={min(indices)} missing={missing})"
        print(f"[OK]   {slug:34s} pages={len(scenes):2d} empty={len(empty_pages)} "
              f"chars={total_chars:5d}{status_flag}{cont_flag}")

        report.append({
            "slug": slug,
            "title": titles.get(slug),
            "status": status,
            "found": True,
            "pages": len(scenes),
            "empty_text_pages": empty_pages,
            "total_chars": total_chars,
            "page_index_min": min(indices),
            "page_index_max": max(indices),
            "page_index_missing": missing,
            "out": rel(out_path),
        })

    report_path = out_dir / "_bridge_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    n_rep = sum(1 for x in report if x["slug"] in REP_SLUGS and x.get("found"))
    print(f"\n[DONE] 변환 {ok_count}/{len(wanted)}권 (대표 3권 확보 {n_rep}/3). "
          f"요약={rel(report_path)}")
    if ok_count == 0:
        print("[FAIL] 변환된 권 0 — export 범위/slug를 확인하세요.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
