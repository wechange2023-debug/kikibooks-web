# -*- coding: utf-8 -*-
"""OCR 파일럿 (ADR-0039 D4·D5, 작업지시서 2026-07-10 (2) STEP 3).

- 대상: 파일럿 5권(a-tiny-seed 대조군 / it-wasnt-me / hugs-in-the-city /
  the-window-seat / mogaus-gift) + 무텍스트 확인 2권(the-lion-who-wouldnt-try /
  katiitis-song — 지시서 3-4 "같은 방법으로 확인").
- 입력: bookdash.org WP `#read-book` data-src full-size 이미지(임시 경로 다운로드,
  Storage 업로드 0건. 임시 이미지는 실행 후 별도 삭제).
- 엔진: tesseract 5.4.0 로컬(eng, psm 3), TSV word 레벨(bbox+confidence).
- 산출: scripts/ocr_pilot/out/{slug}.ocr.json (초벌·미검수 — raw_unreviewed).
- 페이지 매핑: 파일명 → PDF 번호(N) → 서비스 페이지 M = N - 4
  (검증된 규칙: `_Page_{NN}`→N / 소문자 `_page{n}`→n+1 / lion형 `_{날짜8자리}-{n}`→n).
- DB·Storage 쓰기 0건. AWS 호출 0건. 유료 API 0건.
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import requests

sys.stdout.reconfigure(encoding="utf-8")

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = Path(__file__).resolve().parent / "out"
OUT_DIR.mkdir(exist_ok=True)
TMP_IMG = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd() / "ocr_pilot_imgs"
TESS = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
WP = "https://bookdash.org/"
THUMB_RE = re.compile(r"-\d+x\d+(?=\.(?:jpe?g|png)$)", re.IGNORECASE)

SLUGS = [
    ("a-tiny-seed", "control"),
    ("it-wasnt-me", "no-text-4"),
    ("hugs-in-the-city", "no-text-4"),
    ("the-window-seat", "new-157"),
    ("mogaus-gift", "wp-repaired"),
    ("the-lion-who-wouldnt-try", "no-text-4(extra)"),
    ("katiitis-song", "no-text-4(extra)"),
]

PAT_UPPER = re.compile(r"_Page_(\d+)\.(?:jpe?g|png)$", re.IGNORECASE)
PAT_LOWER = re.compile(r"_page(\d+)\.(?:jpe?g|png)$")
PAT_LION = re.compile(r"_(\d{8})-(\d+)\.(?:jpe?g|png)$")


def pdf_page_of(fname):
    """파일명 → (PDF 번호, 패턴명). 매핑 불가 시 (None, 'unmapped')."""
    if "cover" in fname.lower():
        return None, "cover"
    m = PAT_UPPER.search(fname)
    if m:
        return int(m.group(1)), "_Page_N"
    m = PAT_LION.search(fname)
    if m:
        return int(m.group(2)), "_date-n"
    m = PAT_LOWER.search(fname)
    if m:
        return int(m.group(1)) + 1, "_page(n)+1"
    return None, "unmapped"


def get_retry(url, timeout, tries=3):
    """일시 타임아웃 대비 재시도(지수 대기). 최종 실패 시 예외 그대로 전파."""
    for attempt in range(1, tries + 1):
        try:
            return requests.get(url, timeout=timeout)
        except requests.exceptions.RequestException:
            if attempt == tries:
                raise
            time.sleep(5 * attempt)


def fetch_readbook_images(slug):
    r = get_retry(urljoin(WP, f"books/{slug}/"), timeout=20)
    time.sleep(0.6)
    if r.status_code != 200:
        return None, f"HTTP {r.status_code}"
    m = re.search(r'<div[^>]*id="read-book"[^>]*>', r.text)
    if not m:
        return None, "read-book div 없음"
    raws = re.findall(r'<img[^>]*\sdata-src="([^"]+)"', r.text[m.start():])
    seen, imgs = set(), []
    for u in raws:
        if "wp-content/uploads" not in u:
            continue
        fu = THUMB_RE.sub("", urljoin(WP, u))
        if fu not in seen:
            seen.add(fu)
            imgs.append(fu)
    return imgs, None


def ocr_page(img_path):
    """tesseract TSV 실행 → (텍스트, words[], 이미지 크기, 평균 conf)."""
    base = img_path.with_suffix("")
    subprocess.run([TESS, str(img_path), str(base), "-l", "eng", "--psm", "3", "tsv"],
                   check=True, capture_output=True)
    rows = [l.split("\t") for l in base.with_suffix(".tsv").read_text(encoding="utf-8").splitlines()[1:]]
    img_w = img_h = None
    words = []
    lines = {}  # (block, par, line) -> [word...]
    for c in rows:
        if len(c) < 12:
            continue
        level = c[0]
        if level == "1":
            img_w, img_h = int(c[8]), int(c[9])
        if level != "5":
            continue
        text = c[11].strip()
        conf = float(c[10])
        if not text or conf < 0:
            continue
        w = {"t": text, "x": int(c[6]), "y": int(c[7]),
             "w": int(c[8]), "h": int(c[9]), "conf": round(conf, 1)}
        words.append(w)
        lines.setdefault((int(c[2]), int(c[3]), int(c[4])), []).append(text)
    text = "\n".join(" ".join(ws) for _, ws in sorted(lines.items()))
    mean_conf = round(sum(w["conf"] for w in words) / len(words), 1) if words else None
    return text, words, (img_w, img_h), mean_conf


def norm(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip()


def lev(a, b):
    R, H = len(a), len(b)
    d = [[0] * (H + 1) for _ in range(R + 1)]
    for i in range(R + 1):
        d[i][0] = i
    for j in range(H + 1):
        d[0][j] = j
    for i in range(1, R + 1):
        for j in range(1, H + 1):
            c = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
    return d[R][H]


def main():
    TMP_IMG.mkdir(parents=True, exist_ok=True)
    summary = []
    for slug, role in SLUGS:
        print(f"\n===== {slug} ({role}) =====")
        imgs, err = fetch_readbook_images(slug)
        if err:
            print(f"  !! WP 목록 실패: {err}")
            continue
        # 파일명 → 서비스 페이지 매핑
        mapped, skipped = [], []
        for u in imgs:
            fname = u.rsplit("/", 1)[-1]
            pdf, pat = pdf_page_of(fname)
            if pdf is None:
                skipped.append((fname, pat))
                continue
            svc = pdf - 4
            if svc >= 1:
                mapped.append((svc, pdf, pat, u, fname))
            else:
                skipped.append((fname, f"front-matter(PDF {pdf})"))
        mapped.sort()
        svcs = [m[0] for m in mapped]
        gaps = [n for n in range(1, max(svcs) + 1) if n not in svcs] if svcs else []
        print(f"  WP 이미지 {len(imgs)}장 → 본문 매핑 {len(mapped)}면 "
              f"(서비스 {svcs[0] if svcs else '-'}..{svcs[-1] if svcs else '-'}, gap={gaps}), "
              f"제외 {[(f, why) for f, why in skipped]}")

        book_dir = TMP_IMG / slug
        book_dir.mkdir(exist_ok=True)
        pages = []
        for svc, pdf, pat, url, fname in mapped:
            dest = book_dir / f"svc{svc:02d}.jpg"
            if not dest.exists():
                resp = get_retry(url, timeout=30)
                resp.raise_for_status()
                dest.write_bytes(resp.content)
                time.sleep(0.6)
            text, words, (iw, ih), mconf = ocr_page(dest)
            pages.append({"page": svc, "pdf_page": pdf, "pattern": pat,
                          "image_url": url, "image_file": fname,
                          "image_width": iw, "image_height": ih,
                          "ocr_text": text, "char_count": len(text),
                          "word_count": len(words), "mean_conf": mconf,
                          "words": words})
            print(f"  p{svc:02d} ({fname}): {len(words)}단어 {len(text)}자 conf={mconf}")

        doc = {"slug": slug, "role": role, "status": "raw_unreviewed",
               "engine": "tesseract 5.4.0 (eng, psm 3)",
               "source": "bookdash.org WP read-book full-size (thumbnail 접미사 제거)",
               "page_rule": "서비스 M = PDF N - 4",
               "created": "2026-07-10",
               "skipped_files": [{"file": f, "reason": why} for f, why in skipped],
               "service_page_gaps": gaps,
               "pages": pages}
        (OUT_DIR / f"{slug}.ocr.json").write_text(
            json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
        tw = sum(p["word_count"] for p in pages)
        confs = [p["mean_conf"] for p in pages if p["mean_conf"] is not None]
        summary.append((slug, len(pages), tw,
                        round(sum(confs) / len(confs), 1) if confs else None, gaps))

    # ── 대조군 재현 검증
    truth = json.loads((REPO / "scripts/tts_pilot/out/a-tiny-seed.json").read_text(encoding="utf-8"))
    ocr = json.loads((OUT_DIR / "a-tiny-seed.ocr.json").read_text(encoding="utf-8"))
    ocr_by_page = {p["page"]: p["ocr_text"] for p in ocr["pages"]}
    print("\n===== 대조군 재현 검증 (a-tiny-seed) =====")
    tot_ref = tot_err = 0
    for s in truth:
        ref = norm(s["text"]).split()
        hyp = norm(ocr_by_page.get(s["page"], "")).split()
        e = lev(ref, hyp)
        tot_ref += len(ref)
        tot_err += e
        print(f"  p{s['page']:02d}: 정답 {len(ref)}단어 오류 {e}")
    acc = 100 * (1 - tot_err / tot_ref)
    print(f"  전체: {tot_ref}단어 오류 {tot_err} → 단어 정확도 {acc:.2f}%")

    # ── 무텍스트 4권 판정 자료 (페이지별 추출 문자열)
    print("\n===== 무텍스트 4권 추출 내용 =====")
    for slug in ("it-wasnt-me", "hugs-in-the-city",
                 "the-lion-who-wouldnt-try", "katiitis-song"):
        f = OUT_DIR / f"{slug}.ocr.json"
        if not f.exists():
            print(f"  {slug}: 산출물 없음")
            continue
        doc = json.loads(f.read_text(encoding="utf-8"))
        print(f"  -- {slug}")
        for p in doc["pages"]:
            t = p["ocr_text"].replace("\n", " ⏎ ")
            print(f"    p{p['page']:02d} {p['char_count']:4d}자: {t[:150]}")

    print("\n===== 요약 =====")
    for slug, np_, tw, mc, gaps in summary:
        print(f"  {slug}: {np_}면 / {tw}단어 / 평균conf {mc} / gap {gaps}")


if __name__ == "__main__":
    main()
