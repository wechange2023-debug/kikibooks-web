#!/usr/bin/env python3
"""
extract_text.py — Book Dash v1(html) 파일럿 텍스트 추출 (TTS 파일럿 1단계, ADR-0023 실증)

★ 파일럿 전용 격리 스크립트. DB/스키마/Supabase를 절대 건드리지 않는다.
   프로덕션 sync_*.py는 무수정. 본 스크립트는 로컬 산출물(out/{slug}.json)만 만든다.

목적:
  v1 html 코호트(sync_book_dash.py, content_type='html')의 GH Pages HTML을 파싱해
  본문을 '장면(페이지)' 단위로 분리한다. 장면 경계 = <p><img> 마커.
  각 장면 = (이미지 URL, 그 장면 텍스트 문장들). 저작권/어트리뷰션 영역은 제외.

구조 근거(2026-07-02 실측, a-beautiful-day):
  <div id="wrapper"> → <h1>제목</h1> →
    <p><img src="images/01.jpg" alt="..."></p>   # 장면 1 시작
    <p>"문장1"</p> <p>"문장2"</p>                 # 장면 1 텍스트
    <p><img src="images/02.jpg" ...></p>          # 장면 2 시작
    ...
  <blockquote class="copyright-text"> ...          # ← 여기부터 어트리뷰션(본문 제외)

출력: scripts/tts_pilot/out/{slug}.json
  [{ "page": 1, "image_url": "...", "text": "..." }, ...]

사용:
    python scripts/tts_pilot/extract_text.py --slug a-beautiful-day
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

import requests

# Windows 콘솔(cp949) 한글·이모지·커브따옴표 깨짐 방지 (기존 스크립트 패턴)
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

GH_PAGES_BASE = "https://bookdash.github.io/bookdash-books"  # sync_book_dash.py:77 정합
HTTP_TIMEOUT = 30

OUT_DIR = Path(__file__).resolve().parent / "out"

# <p>...</p> 블록(내부 개행 포함), <img src>, 태그 제거용 정규식
_P_BLOCK_RE = re.compile(r"<p\b[^>]*>(.*?)</p>", re.I | re.S)
_IMG_SRC_RE = re.compile(r"<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']", re.I)
_TAG_RE = re.compile(r"<[^>]+>")


def fetch_html(slug: str) -> str:
    url = f"{GH_PAGES_BASE}/{slug}/en/"
    resp = requests.get(url, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    # GH Pages는 UTF-8. requests가 헤더로 못 잡으면 강제.
    if not resp.encoding or resp.encoding.lower() in ("iso-8859-1",):
        resp.encoding = "utf-8"
    return resp.text


def isolate_body(html_text: str) -> str:
    """<div id="wrapper"> 이후 ~ <blockquote class="copyright-text"> 이전만 남긴다.

    저작권/어트리뷰션(<blockquote class="copyright-text">)은 본문에서 제외한다.
    wrapper 마커가 없으면 원문 전체를 반환(방어), copyright 마커 없으면 끝까지.
    """
    start = re.search(r'<div\b[^>]*\bid=[\"\']wrapper[\"\']', html_text, re.I)
    body = html_text[start.start():] if start else html_text
    cut = re.search(r'<blockquote\b[^>]*\bclass=[\"\'][^\"\']*copyright-text', body, re.I)
    if cut:
        body = body[: cut.start()]
    return body


def to_abs_image_url(slug: str, src: str) -> str:
    """상대경로(images/01.jpg)를 GH Pages 절대 URL로. 이미 절대면 그대로."""
    src = src.strip()
    if re.match(r"^https?://", src, re.I):
        return src
    return f"{GH_PAGES_BASE}/{slug}/en/{src.lstrip('/')}"


def clean_text(inner_html: str) -> str:
    """<p> 내부 HTML → 순수 텍스트. 태그 제거 + 엔티티 디코딩 + 공백 정규화."""
    txt = _TAG_RE.sub("", inner_html)
    txt = html.unescape(txt)
    txt = re.sub(r"\s+", " ", txt).strip()
    return txt


def extract_scenes(slug: str, html_text: str) -> list[dict]:
    """본문을 장면(페이지) 단위로 분리. 장면 경계 = <p><img>.

    이미지 <p>를 만나면 새 장면 시작. 이후 텍스트 <p>는 현재 장면에 누적.
    첫 이미지 이전의 텍스트(<h1> 제목 등)는 장면에 넣지 않는다.
    """
    body = isolate_body(html_text)
    scenes: list[dict] = []
    cur: dict | None = None

    for m in _P_BLOCK_RE.finditer(body):
        inner = m.group(1)
        img = _IMG_SRC_RE.search(inner)
        if img:
            # 새 장면 시작 — 직전 장면을 확정(있으면).
            if cur is not None:
                scenes.append(cur)
            cur = {
                "page": len(scenes) + 1,
                "image_url": to_abs_image_url(slug, img.group(1)),
                "_lines": [],
            }
        else:
            text = clean_text(inner)
            if text and cur is not None:
                cur["_lines"].append(text)
            # 첫 이미지 이전 텍스트(cur is None)는 무시(제목 등).

    if cur is not None:
        scenes.append(cur)

    # _lines → text(줄바꿈 결합), 내부 키 정리
    out: list[dict] = []
    for s in scenes:
        out.append(
            {
                "page": s["page"],
                "image_url": s["image_url"],
                "text": "\n".join(s["_lines"]),
            }
        )
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Book Dash v1 html 파일럿 텍스트 추출")
    ap.add_argument("--slug", default="a-beautiful-day", help="대상 책 slug")
    args = ap.parse_args()
    slug = args.slug

    print(f"[INFO] fetch: {GH_PAGES_BASE}/{slug}/en/")
    try:
        html_text = fetch_html(slug)
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] HTML 조회 실패: {exc}")
        return 1

    scenes = extract_scenes(slug, html_text)
    if not scenes:
        print("[FAIL] 장면 0개 — 구조가 예상과 다릅니다(수동 점검 필요).")
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{slug}.json"
    out_path.write_text(
        json.dumps(scenes, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"[OK] 장면 {len(scenes)}개 → {out_path}")
    print("=" * 64)
    for s in scenes:
        preview = s["text"].replace("\n", " ⏎ ")
        print(f"[page {s['page']:>2}] {s['image_url']}")
        print(f"          {preview if preview else '(텍스트 없음 — 이미지만 장면)'}")
    print("=" * 64)
    return 0


if __name__ == "__main__":
    sys.exit(main())
