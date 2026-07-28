#!/usr/bin/env python3
"""html54_slide_feasibility.py — content_type='html' 54권 가로 슬라이드 전환 가능성 전량 드라이런.

작업지시서 2026-07-28. **읽기 전용** — DB 쓰기 0, Storage 쓰기 0, 앱 코드 수정 0.
네트워크는 GET만(원본 HTML + 이미지 헤더). 이미지 본문은 치수 판독에 필요한 앞부분만 받는다.

대상: scripts/pdf_harvest/longscroll_check_urls.csv (54행, origin_html_url = GH Pages)
표본 정찰 금지 — 54권 **전량**을 돈다.

권별 절차:
  1) origin_html_url GET → <div id="wrapper"> ~ <blockquote class="copyright-text"> 사이만 본문으로 격리
     (scripts/tts_pilot/extract_text.py isolate_body와 동일 기준 — 같은 코퍼스에서 검증된 경계)
  2) 본문의 <p> 블록을 문서 순서로 훑어 '장면(scene)'을 만든다. 장면 경계 = <p><img>.
     이미지 <p>를 만나면 새 장면, 이후 텍스트 <p>는 현재 장면에 누적.
  3) 1:1 짝짓기를 깨는 구조 이상을 **따로 센다**:
       - img_outside_p : <p>로 감싸이지 않은 본문 <img> (파서 사각지대)
       - p_multi_img   : 한 <p> 안에 <img>가 2개 이상 (장면 경계 모호)
       - orphan_text   : 첫 이미지보다 앞에 오는 본문 텍스트 <p> (제목 h1은 <p>가 아니라 제외됨)
       - tail_text     : 마지막 이미지 뒤에만 오는 텍스트는 마지막 장면에 흡수되므로 이상 아님
  4) 장면 이미지의 실제 픽셀 치수를 잰다(Range GET 앞부분 → PIL 파서).
  5) 위 수치로 권을 4분류한다(CLEAN / MINOR / MANUAL / FAIL). 판정 기준은 classify() 참조.

출력:
  out/html54_feasibility.json  — 권별 전체 레코드(장면·치수 포함)
  out/_state.json              — total/remaining/last_successful_slug/failed (재개용)
재개: out JSON에 이미 있는 slug은 건너뛴다(--force로 무시).

사용:
    python scripts/recon/html54_slide_feasibility.py
    python scripts/recon/html54_slide_feasibility.py --limit 3      # 스모크
    python scripts/recon/html54_slide_feasibility.py --no-image-dims
"""

from __future__ import annotations

import argparse
import csv
import html as html_mod
import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from PIL import ImageFile

# Windows 콘솔(cp949) 깨짐 방지 — 기존 스크립트 패턴 정합
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "out"
DEFAULT_CSV = HERE.parent / "pdf_harvest" / "longscroll_check_urls.csv"

GH_ORIGIN = "https://bookdash.github.io"
GH_PAGES_BASE = f"{GH_ORIGIN}/bookdash-books"
HTTP_TIMEOUT = 30
SLEEP_HTML = 0.2
SLEEP_IMAGE = 0.1
# 이미지 치수는 JPEG 헤더(SOF)만 있으면 판독된다. 앞 64KB면 충분하고,
# 안 되면 전체를 받는다(폴백). 전량 다운로드를 피하려는 목적.
IMAGE_HEAD_BYTES = 65536

_P_BLOCK_RE = re.compile(r"<p\b[^>]*>(.*?)</p>", re.I | re.S)
_IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.I)
_IMG_SRC_RE = re.compile(r"<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']", re.I)
_IMG_ALT_RE = re.compile(r"<img\b[^>]*?\balt=([\"'])(.*?)\1", re.I | re.S)
_TAG_RE = re.compile(r"<[^>]+>")


# ── HTML 파싱 ────────────────────────────────────────────────────────────────


def isolate_body(html_text: str) -> tuple[str, bool, bool]:
    """본문 영역만 남기고 (본문, wrapper발견, copyright발견)을 반환한다.

    extract_text.py isolate_body와 동일 기준. 마커가 없으면 방어적으로 넓게 잡되
    그 사실을 플래그로 남겨 분류에 반영한다.
    """
    start = re.search(r"<div\b[^>]*\bid=[\"']wrapper[\"']", html_text, re.I)
    has_wrapper = start is not None
    body = html_text[start.start():] if start else html_text

    cut = re.search(
        r"<blockquote\b[^>]*\bclass=[\"'][^\"']*copyright-text", body, re.I
    )
    has_copyright = cut is not None
    if cut:
        body = body[: cut.start()]
    return body, has_wrapper, has_copyright


def clean_text(inner_html: str) -> str:
    txt = _TAG_RE.sub("", inner_html)
    txt = html_mod.unescape(txt)
    return re.sub(r"\s+", " ", txt).strip()


def to_abs_image_url(slug: str, src: str) -> str:
    """<img src> → 절대 URL.

    이 코퍼스에는 src 규약이 **두 가지** 섞여 있다(2026-07-28 실측):
      - 상대경로  `images/01.jpg`                              → 책 폴더 기준 (대다수)
      - 루트절대  `/bookdash-books/{slug}/en/images/01.jpg`     → 사이트 루트 기준 (a-fish-and-a-gift)
    루트절대를 lstrip('/') 후 책 폴더에 이어붙이면 경로가 두 번 겹쳐 404가 난다.
    (scripts/tts_pilot/extract_text.py to_abs_image_url이 그 형태다 — 본 정찰에서 발견,
     해당 스크립트는 읽기 전용 원칙에 따라 수정하지 않고 보고서에 남긴다.)
    """
    src = src.strip()
    if re.match(r"^https?://", src, re.I):
        return src
    if src.startswith("//"):
        return f"https:{src}"
    if src.startswith("/"):
        return f"{GH_ORIGIN}{src}"
    return f"{GH_PAGES_BASE}/{slug}/en/{src}"


def parse_structure(slug: str, html_text: str) -> dict:
    """본문을 장면 목록 + 구조 이상 카운터로 환원한다."""
    body, has_wrapper, has_copyright = isolate_body(html_text)

    # <p> 밖에 있는 <img> 탐지 — <p> 블록 구간을 지운 나머지에서 <img>를 센다.
    outside = _P_BLOCK_RE.sub(" ", body)
    img_outside_p = len(_IMG_TAG_RE.findall(outside))

    scenes: list[dict] = []
    cur: dict | None = None
    p_multi_img = 0
    orphan_text_blocks = 0
    n_p_blocks = 0
    n_text_p = 0

    for m in _P_BLOCK_RE.finditer(body):
        n_p_blocks += 1
        inner = m.group(1)
        imgs = _IMG_SRC_RE.findall(inner)

        if imgs:
            if len(imgs) > 1:
                p_multi_img += 1
            if cur is not None:
                scenes.append(cur)
            alts = [clean_text(a.group(2)) for a in _IMG_ALT_RE.finditer(inner)]
            cur = {
                "page": len(scenes) + 1,
                "image_url": to_abs_image_url(slug, imgs[0]),
                "extra_image_urls": [to_abs_image_url(slug, s) for s in imgs[1:]],
                "_lines": [],
                "alt_text": " ".join(a for a in alts if a),
            }
        else:
            text = clean_text(inner)
            if not text:
                continue
            n_text_p += 1
            if cur is None:
                # 첫 이미지보다 앞선 텍스트 = 어느 장면에도 못 붙는 고아 텍스트
                orphan_text_blocks += 1
            else:
                cur["_lines"].append(text)

    if cur is not None:
        scenes.append(cur)

    for s in scenes:
        s["text"] = "\n".join(s.pop("_lines"))
        s["text_len"] = len(s["text"])
        s["has_text"] = bool(s["text"].strip())
        s["alt_len"] = len(s["alt_text"])

    return {
        "has_wrapper": has_wrapper,
        "has_copyright_block": has_copyright,
        "n_p_blocks": n_p_blocks,
        "n_text_p": n_text_p,
        "img_outside_p": img_outside_p,
        "p_multi_img": p_multi_img,
        "orphan_text_blocks": orphan_text_blocks,
        "scenes": scenes,
    }


# ── 이미지 치수 ──────────────────────────────────────────────────────────────


def image_size(session: requests.Session, url: str) -> tuple[int | None, int | None, str]:
    """(width, height, note). Range로 앞부분만 받아 PIL 파서로 헤더를 읽는다.

    5xx는 1회 재시도한다 — 전량 정찰 중 GH Pages가 간헐적으로 503을 준다(실측:
    walking-together/09.jpg. 재요청하면 200). 재시도 없이 세면 멀쩡한 이미지가
    '결손'으로 집계돼 판정이 틀어진다. 404는 재시도하지 않는다(진짜 결손).
    """
    chunk = b""
    for attempt in (1, 2):
        try:
            resp = session.get(
                url,
                timeout=HTTP_TIMEOUT,
                headers={"Range": f"bytes=0-{IMAGE_HEAD_BYTES - 1}"},
                stream=True,
            )
            if resp.status_code in (200, 206):
                chunk = resp.content
                break
            if 500 <= resp.status_code < 600 and attempt == 1:
                time.sleep(1.0)
                continue
            return None, None, f"http_{resp.status_code}"
        except Exception as exc:  # noqa: BLE001
            if attempt == 1:
                time.sleep(1.0)
                continue
            return None, None, f"error:{type(exc).__name__}"

    parser = ImageFile.Parser()
    try:
        parser.feed(chunk)
        if parser.image is not None:
            return parser.image.size[0], parser.image.size[1], "range"
    except Exception:  # noqa: BLE001
        pass

    # 폴백 — 전체 수신 후 판독
    try:
        full = session.get(url, timeout=HTTP_TIMEOUT)
        if full.status_code != 200:
            return None, None, f"http_{full.status_code}"
        p2 = ImageFile.Parser()
        p2.feed(full.content)
        if p2.image is not None:
            return p2.image.size[0], p2.image.size[1], "full"
    except Exception as exc:  # noqa: BLE001
        return None, None, f"error:{type(exc).__name__}"

    return None, None, "undecodable"


# ── 분류 ─────────────────────────────────────────────────────────────────────


def classify(rec: dict) -> tuple[str, list[str]]:
    """권 1건을 4분류한다. 기준은 '가로 슬라이드 1:1 짝짓기를 자동으로 만들 수 있는가'.

    CLEAN  — 구조 이상 0 + 모든 장면에 텍스트. 그대로 (이미지, 텍스트) 슬라이드가 나온다.
    MINOR  — 구조 이상 0. 텍스트 없는 장면이 있으나 '무텍스트 슬라이드'로 렌더하면 되므로 자동 처리 가능.
    MANUAL — 구조 이상 ≥1(고아 텍스트·<p> 밖 이미지·한 <p>에 이미지 2장) 또는 텍스트 장면 0개.
             장면 경계나 텍스트 귀속을 사람이 봐야 한다.
    FAIL   — HTML 조회 실패 또는 장면 0개(구조가 이 코퍼스 규약과 다름).
    """
    if not rec.get("ok"):
        return "FAIL", [rec.get("error") or "fetch_failed"]

    scenes = rec["scenes"]
    if not scenes:
        return "FAIL", ["scenes_zero"]

    reasons: list[str] = []
    if rec["orphan_text_blocks"]:
        reasons.append(f"orphan_text={rec['orphan_text_blocks']}")
    if rec["img_outside_p"]:
        reasons.append(f"img_outside_p={rec['img_outside_p']}")
    if rec["p_multi_img"]:
        reasons.append(f"p_multi_img={rec['p_multi_img']}")
    if not rec["has_wrapper"]:
        reasons.append("no_wrapper_marker")

    n_with_text = sum(1 for s in scenes if s["has_text"])
    if n_with_text == 0:
        reasons.append("no_text_scene_at_all")

    if reasons:
        return "MANUAL", reasons

    n_imageonly = len(scenes) - n_with_text
    if n_imageonly == 0:
        return "CLEAN", []
    return "MINOR", [f"image_only_scenes={n_imageonly}"]


# ── 실행 ─────────────────────────────────────────────────────────────────────


def load_targets(csv_path: Path) -> list[dict]:
    with io.open(csv_path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    out = []
    for r in rows:
        url = (r.get("origin_html_url") or "").strip()
        m = re.search(r"bookdash-books/([^/]+)/en/?", url)
        out.append(
            {
                "title": (r.get("title") or "").strip(),
                "source_id": (r.get("source_id") or "").strip(),
                "slug": m.group(1) if m else "",
                "origin_html_url": url,
                "csv_has_audio": (r.get("has_audio") or "").strip().lower() == "true",
            }
        )
    return out


def run(args: argparse.Namespace) -> int:
    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"[STOP] CSV 없음: {csv_path}")
        return 2

    targets = load_targets(csv_path)
    print(f"[INFO] 대상 {len(targets)}권 (CSV: {csv_path.name})")
    if args.limit:
        targets = targets[: args.limit]
        print(f"[INFO] --limit {args.limit} 적용")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "html54_feasibility.json"
    state_path = OUT_DIR / "_state.json"

    done: dict[str, dict] = {}
    if out_path.exists() and not args.force:
        try:
            done = {r["slug"]: r for r in json.loads(out_path.read_text("utf-8"))}
            print(f"[INFO] 기존 결과 {len(done)}권 재사용(--force로 무시)")
        except Exception:  # noqa: BLE001
            done = {}

    session = requests.Session()
    session.headers["User-Agent"] = "kikibooks-recon/1.0 (read-only structure audit)"

    results: list[dict] = []
    failed: list[str] = []

    for i, t in enumerate(targets, 1):
        slug = t["slug"]
        if slug in done:
            results.append(done[slug])
            continue

        rec: dict = dict(t)
        try:
            resp = session.get(t["origin_html_url"], timeout=HTTP_TIMEOUT)
            rec["http_status"] = resp.status_code
            resp.raise_for_status()
            if not resp.encoding or resp.encoding.lower() == "iso-8859-1":
                resp.encoding = "utf-8"
            parsed = parse_structure(slug, resp.text)
            rec.update(parsed)
            rec["ok"] = True
            rec["error"] = None
        except Exception as exc:  # noqa: BLE001
            rec["ok"] = False
            rec["error"] = f"{type(exc).__name__}: {exc}"
            rec["scenes"] = []
            failed.append(slug)

        # 이미지 치수
        if rec.get("ok") and not args.no_image_dims:
            for s in rec["scenes"]:
                w, h, note = image_size(session, s["image_url"])
                s["width"], s["height"], s["dim_note"] = w, h, note
                s["aspect_hw"] = round(h / w, 4) if (w and h) else None
                time.sleep(SLEEP_IMAGE)

        rec["verdict"], rec["reasons"] = classify(rec)
        rec["n_scenes"] = len(rec.get("scenes", []))
        rec["n_scenes_with_text"] = sum(
            1 for s in rec.get("scenes", []) if s.get("has_text")
        )
        results.append(rec)

        print(
            f"[{i:>2}/{len(targets)}] {slug:<38} {rec['verdict']:<6} "
            f"scenes={rec['n_scenes']:>2} text={rec['n_scenes_with_text']:>2} "
            f"{','.join(rec['reasons']) if rec['reasons'] else ''}"
        )

        out_path.write_text(
            json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        state_path.write_text(
            json.dumps(
                {
                    "total": len(targets),
                    "remaining": len(targets) - i,
                    "last_successful_slug": slug if rec.get("ok") else None,
                    "failed": failed,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                ensure_ascii=False,
                indent=1,
            ),
            encoding="utf-8",
        )
        time.sleep(SLEEP_HTML)

    summarize(results)
    print(f"\n[OK] 결과 → {out_path}")
    return 0


def summarize(results: list[dict]) -> None:
    from collections import Counter

    print("\n" + "=" * 72)
    verdicts = Counter(r["verdict"] for r in results)
    for v in ("CLEAN", "MINOR", "MANUAL", "FAIL"):
        print(f"  {v:<7} {verdicts.get(v, 0):>3}권")

    scene_counts = [r["n_scenes"] for r in results if r.get("ok")]
    if scene_counts:
        print(f"\n  장면 수: 합계 {sum(scene_counts)} / "
              f"최소 {min(scene_counts)} / 최대 {max(scene_counts)} / "
              f"중앙값 {sorted(scene_counts)[len(scene_counts) // 2]}")

    dims = Counter()
    for r in results:
        for s in r.get("scenes", []):
            if s.get("width"):
                dims[(s["width"], s["height"])] += 1
    if dims:
        print("\n  이미지 해상도 상위:")
        for (w, h), n in dims.most_common(10):
            print(f"    {w}x{h}  (h/w {h / w:.3f})  {n}장")
    print("=" * 72)


def main() -> int:
    ap = argparse.ArgumentParser(description="html 54권 슬라이드 전환 가능성 드라이런(read-only)")
    ap.add_argument("--csv", default=str(DEFAULT_CSV))
    ap.add_argument("--limit", type=int, default=0, help="앞 N권만(스모크용). 0=전량")
    ap.add_argument("--force", action="store_true", help="기존 결과 무시하고 재조회")
    ap.add_argument("--no-image-dims", action="store_true", help="이미지 치수 측정 생략")
    return run(ap.parse_args())


if __name__ == "__main__":
    sys.exit(main())
