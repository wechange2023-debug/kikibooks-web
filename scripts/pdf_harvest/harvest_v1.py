# -*- coding: utf-8 -*-
"""Book Dash 소스 저장소(book-source-files) PDF 텍스트 레이어 하베스터.

작업지시서 2026-07-10 (6). 읽기 전용 — DB·Storage 쓰기 0건, 네트워크 GET만,
OCR 사용 0건(pypdf 추출만), 이미지 다운로드 0건(폴더 목록 확인까지만).

권당 절차:
  1) `?book={slug}` 루트 폴더 목록 → ebook형 폴더를 **동적으로** 탐색
     (알려진 변형 '/ebook', '/e-book'은 후보의 시작점일 뿐 — 루트 목록에서
     정규식 `e-?book`으로 재발견하고, 새 변형은 로그에 남긴다)
  2) ebook 폴더 목록 → 영어 하위 폴더(정규식 `en([_-]|$)|english`) → PDF 링크 1건
  3) PDF는 캐시 경로에 권당 1회만 다운로드(재실행 시 캐시 재사용)
  4) pypdf로 페이지별 텍스트 추출. 페이지 매핑(서비스 M = PDF N − offset)은
     하드코딩하지 않고 **권별 재판정**: Book Dash 정형 안내면("hundred books"
     포함, 100단어 이상)의 위치를 offset으로 삼는다. offset ≠ 4 또는 판정 실패는
     mapping_deviant로 기록.
  5) `_no-text`형 폴더(정규식 `_?no-?text`) census — 존재 여부 + 파일 수(목록만)
  6) 라이선스 힌트: 전체 추출 텍스트에 NC/ND 계열 문구가 보이면 license_warning
     (발견 즉시 상위 절차가 중단 판단 — 팀장 사안)

출력: out/{slug}.pages.json
  { slug, pdf_page_count, body_page_range, mapping_offset, mapping_deviant,
    has_no_text_folder, no_text_file_count, front_matter_word_count,
    license_hint, license_warning, pdf_url, pages: [{page_no, word_count, text}] }

재개: state.json(total/remaining/last_successful_slug/failed[]/started_at)을 매 권
갱신하고, out JSON이 이미 있는 권은 건너뛴다.

사용: python harvest.py --slugs <slug목록.txt> --cache <임시PDF캐시디렉터리>
      (--out, --state 생략 시 스크립트 옆 out/, state.json)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from pypdf import PdfReader

sys.stdout.reconfigure(encoding="utf-8")

BASE = "https://bookdash.org/book-source-files/"
RATE_SEC = 0.6
EBOOK_RE = re.compile(r"e-?book", re.IGNORECASE)
ENG_RE = re.compile(r"(^|/)(en([_-]|$)|[^/]*english)", re.IGNORECASE)
NOTEXT_RE = re.compile(r"_?no-?text", re.IGNORECASE)
KNOWN_EBOOK = ["/ebook", "/e-book"]          # 시작점(하드코딩 아님 — 동적 탐색이 본선)
KNOWN_ENG = ["en_english", "en-english"]     # 신규 변형 발견 시 로그
BOILER_RE = re.compile(r"hundred\s+books", re.IGNORECASE)
LICENSE_BAD_RE = re.compile(r"NonCommercial|NoDerivatives|CC\s*BY-?\s*(NC|ND)", re.IGNORECASE)
LICENSE_HINT_RE = re.compile(
    r"(Creative\s+Commons[^.\n]{0,120}|CC\s*BY[^.\n]{0,60})", re.IGNORECASE)


def log(msg):
    print(msg, flush=True)


def get_retry(url, timeout, tries=3, **kw):
    for attempt in range(1, tries + 1):
        try:
            r = requests.get(url, timeout=timeout, **kw)
            time.sleep(RATE_SEC)
            return r
        except requests.exceptions.RequestException:
            if attempt == tries:
                raise
            time.sleep(5 * attempt)


def links_of(html_text):
    return sorted(set(re.findall(r'href="([^"]+)"', html_text)))


def browse(slug, folder=None):
    params = {"book": slug}
    if folder:
        params["folder"] = folder
    r = get_retry(BASE, timeout=30, params=params)
    if r.status_code != 200:
        return None, None, f"HTTP {r.status_code}"
    ls = links_of(r.text)
    subfolders = [u.split("folder=")[-1] for u in ls
                  if f"book={slug}&folder=" in u and "download-folder" not in u]
    files = [u for u in ls if u.startswith("?download=") and "download-folder" not in u]
    return subfolders, files, None


def norm_ws(s):
    return re.sub(r"\s+", " ", s).strip()


def harvest_one(slug, cache_dir):
    """1권 수확 → (doc dict | None, 실패 사유 | None)."""
    roots, _, err = browse(slug)
    if err:
        return None, f"root:{err}"
    if not roots:
        return None, "folder_unresolved(루트 폴더 0건)"
    # ebook형 폴더 동적 탐색: 알려진 변형 우선, 그 외 루트에서 e-?book 매칭
    ebook = next((f for f in KNOWN_EBOOK if f in roots), None)
    if ebook is None:
        cands = [f for f in roots if EBOOK_RE.search(f)]
        if cands:
            ebook = cands[0]
            log(f"  ★ 새 ebook 폴더 변형 발견: {ebook} (루트: {roots})")
        else:
            return None, f"folder_unresolved(ebook형 없음 — 루트: {roots})"
    subs, direct_files, err = browse(slug, ebook)
    if err:
        return None, f"ebook:{err}"
    # _no-text census (이미지 다운로드 없음 — 목록만)
    nt = [s for s in subs if NOTEXT_RE.search(s.rsplit("/", 1)[-1])]
    has_nt, nt_count = False, None
    if nt:
        has_nt = True
        nsubs, nfiles, nerr = browse(slug, nt[0])
        if not nerr:
            nt_count = len(nfiles)
    # 영어 폴더 → PDF 후보 목록(복수 가능 — 본문 PDF 검증은 다운로드 후 페이지 수로)
    eng = [s for s in subs if ENG_RE.search(s.rsplit("/", 1)[-1])]
    pdf_candidates, eng_used = [], None
    for sub in eng + [None]:
        if sub is None:
            files = direct_files
        else:
            _, files, err = browse(slug, sub)
            if err:
                continue
        pdfs = [u for u in (files or []) if u.lower().endswith(".pdf")]
        if pdfs:
            if len(pdfs) > 1:
                # 파일명 힌트로 정렬만 하고 전 후보 유지 — 1페이지짜리(포스터 등)를
                # 골랐던 사고(how-about-you·why-is-nita) 재발 방지: 페이지 수로 최종 검증
                pdfs.sort(key=lambda u: (0 if re.search(r"(_|-)en|ebook", u.lower()) else 1, len(u)))
                log(f"  PDF 복수({len(pdfs)}건) — 페이지 수 검증으로 선택")
            pdf_candidates = pdfs
            eng_used = sub or ebook
            break
    if not pdf_candidates:
        return None, f"pdf_missing(ebook={ebook}, 하위={subs})"
    if eng_used and eng_used.rsplit("/", 1)[-1] not in KNOWN_ENG and eng_used != ebook:
        log(f"  ★ 새 영어 폴더 변형: {eng_used}")
    # PDF 다운로드 (후보별 1회 — 캐시 재사용). 페이지 수 5 미만이면 본문 PDF가
    # 아닌 것(포스터·표지 단면)으로 보고 다음 후보를 시도한다.
    pdf_link = reader = None
    rejected = []
    for ci, cand in enumerate(pdf_candidates):
        dest = cache_dir / (f"{slug}.pdf" if ci == 0 else f"{slug}.cand{ci}.pdf")
        if not dest.exists():
            r = get_retry(BASE + cand, timeout=300)
            if r.status_code != 200:
                rejected.append((cand, f"HTTP {r.status_code}"))
                continue
            dest.write_bytes(r.content)
        data = dest.read_bytes()
        if data[:5] != b"%PDF-":
            rejected.append((cand, f"매직 {data[:5]!r}"))
            continue
        rd = PdfReader(str(dest))
        if len(rd.pages) < 5 and ci + 1 < len(pdf_candidates):
            rejected.append((cand, f"{len(rd.pages)}페이지 — 본문 PDF 아님 추정"))
            log(f"  후보 기각({len(rd.pages)}p): {cand.rsplit('/', 1)[-1]}")
            continue
        pdf_link, reader = cand, rd
        break
    if reader is None:
        return None, f"pdf_invalid(전 후보 기각: {rejected})"
    # 텍스트 추출 + 매핑 재판정
    texts = [norm_ws(p.extract_text() or "") for p in reader.pages]
    n_pages = len(texts)
    offset, deviant = None, None
    for i, t in enumerate(texts, 1):
        if len(t.split()) >= 100 and BOILER_RE.search(t):
            offset = i
            break
    if offset is None:
        offset = 4
        deviant = "boilerplate_not_found(offset=4 가정)"
    elif offset != 4:
        deviant = f"offset={offset}(표준 4 아님)"
    full = " ".join(texts)
    lic_warn = bool(LICENSE_BAD_RE.search(full))
    m = LICENSE_HINT_RE.search(full)
    pages = [{"page_no": i - offset, "word_count": len(texts[i - 1].split()),
              "text": texts[i - 1]} for i in range(offset + 1, n_pages + 1)]
    doc = {
        "slug": slug,
        "pdf_page_count": n_pages,
        "body_page_range": [1, n_pages - offset],
        "mapping_offset": offset,
        "mapping_deviant": deviant,
        "has_no_text_folder": has_nt,
        "no_text_file_count": nt_count,
        "front_matter_word_count": sum(len(t.split()) for t in texts[:offset]),
        "license_hint": norm_ws(m.group(1)) if m else None,
        "license_warning": lic_warn,
        "pdf_url": BASE + pdf_link,
        "ebook_folder": ebook,
        "eng_folder": eng_used,
        "pages": pages,
    }
    return doc, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", required=True, help="slug 목록 파일(줄당 1개)")
    ap.add_argument("--cache", required=True, help="PDF 캐시 디렉터리(임시 경로 — 레포 밖)")
    here = Path(__file__).resolve().parent
    ap.add_argument("--out", default=str(here / "out"))
    ap.add_argument("--state", default=str(here / "state.json"))
    a = ap.parse_args()

    out_dir = Path(a.out)
    out_dir.mkdir(exist_ok=True)
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    slugs = [s.strip() for s in Path(a.slugs).read_text(encoding="utf-8").splitlines() if s.strip()]

    state_path = Path(a.state)
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
    else:
        state = {"total": len(slugs), "remaining": len(slugs),
                 "last_successful_slug": None, "failed": [],
                 "started_at": datetime.now(timezone.utc).isoformat()}
    state["total"] = len(slugs)

    def save_state():
        done = sum(1 for s in slugs if (out_dir / f"{s}.pages.json").exists())
        state["remaining"] = len(slugs) - done
        state["updated_at"] = datetime.now(timezone.utc).isoformat()
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")

    failed_slugs = {f["slug"] for f in state["failed"]}
    for idx, slug in enumerate(slugs, 1):
        out_f = out_dir / f"{slug}.pages.json"
        if out_f.exists():
            continue
        log(f"[{idx}/{len(slugs)}] {slug}")
        try:
            doc, err = harvest_one(slug, cache)
        except Exception as exc:  # noqa: BLE001 — 개별 권 실패가 전체를 죽이지 않게
            doc, err = None, f"exception:{type(exc).__name__}:{exc}"
        if err:
            log(f"  !! FAIL {err}")
            if slug not in failed_slugs:
                state["failed"].append({"slug": slug, "reason": err})
                failed_slugs.add(slug)
        else:
            out_f.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
            state["last_successful_slug"] = slug
            state["failed"] = [f for f in state["failed"] if f["slug"] != slug]
            failed_slugs.discard(slug)
            body_words = sum(p["word_count"] for p in doc["pages"])
            log(f"  OK pdf {doc['pdf_page_count']}p offset {doc['mapping_offset']}"
                f"{' DEVIANT' if doc['mapping_deviant'] else ''}"
                f" | body {body_words}단어 | no-text {doc['has_no_text_folder']}"
                f"({doc['no_text_file_count']}) | lic_warn {doc['license_warning']}")
        save_state()
    save_state()
    ok_n = sum(1 for s in slugs if (out_dir / f"{s}.pages.json").exists())
    log(f"\n완료: 성공 {ok_n}/{len(slugs)} · 실패 {len(state['failed'])}건")
    for f in state["failed"]:
        log(f"  FAIL {f['slug']}: {f['reason']}")


if __name__ == "__main__":
    main()
