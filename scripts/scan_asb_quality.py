#!/usr/bin/env python3
"""
scan_asb_quality.py — ASb 품질 신호 스캔 (읽기 전용, DB 미접근)

목적(ADR-0025 후속 / backlog §7.4 (n) 품질 필터):
  ASb 책별 3개 신호를 산출해 "공개 후보" 선별의 기초 데이터를 만든다.
    ① text_lines  : page_text 섹션의 `P<n>\t` 라인 개수(본문 글줄 수)
    ② image_count : images 섹션의 이미지 라인 개수
    ③ cover_http  : cover_url(thumb→폴백 규칙)에 HEAD 요청한 HTTP 코드(표지 실재)

설계 원칙:
  - DB 접근·파일 쓰기 절대 없음. 출력은 stdout 표뿐(dry-run 전용).
  - sync_asb.py의 검증된 파서/규칙을 재사용(중복 구현 회피):
      · parse_asb_header  — 헤더 dict + images 리스트
      · ASB_RAW_BASE      — raw .txt URL base
      · ASB_COVER_BASE    — 표지 폴백 base
      · cover_url 규칙(thumb http→https, 없으면 {ASB_COVER_BASE}/{id}.png) — sync_asb.py:290-291
  - text_lines만 별도 카운트: parse_asb_header는 page_text 본문을 수집하지 않으므로
    동일 섹션 마커 규약(`page_text:`~`images:`)을 따라 `P<n>\t` 라인만 센다.

사용:
    python scripts/scan_asb_quality.py --ids 36768,37240,38751,38988,39025

관련: ADR-0025 Amd#6, docs/backlog.md §7.4 (n)
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

import requests

# 로컬 lib/모듈 임포트 경로 — scripts/를 sys.path에 추가(sync_asb.py 동일 관례)
_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))

# sync_asb.py의 검증된 파서·필터·상수 재사용(중복 구현 회피)
#  - 전량(--all) 모드는 sync_asb.main()의 적격 판정(English→라이선스→필수필드→dedup)을
#    그대로 미러링한다. 새 필터 기준을 여기서 만들지 않는다(작업 제약 A).
from sync_asb import (  # noqa: E402
    ASB_RAW_BASE,
    ASB_COVER_BASE,
    ENGLISH_LANG,
    parse_asb_header,
    fetch_asb_books,
    build_payload,
    normalize_title,
    build_dedup_skipset,
    normalize_asb_license,
)
from lib.attribution import AttributionError as _AttributionError  # noqa: E402

from concurrent.futures import ThreadPoolExecutor, as_completed  # noqa: E402

# Windows 콘솔(cp949)에서 한글·이모지 깨짐 방지(sync_asb.py 관례)
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

HTTP_TIMEOUT = 30

# page_text 섹션 본문 라인 — "P<n>\t..." (sync_asb.py 파서·asb-parser.ts와 동일 규약)
_PAGE_TEXT_LINE = re.compile(r"^P\d+\t")


def count_text_lines(text: str) -> int:
    """
    page_text 섹션의 `P<n>\t` 라인 개수.
    섹션 경계는 parse_asb_header와 동일 규약: `page_text:` 진입 ~ `images:` 이탈.
    """
    section = "header"
    count = 0
    for raw in text.splitlines():
        low = raw.strip().lower()
        if section == "header":
            if low.startswith("page_text:"):
                section = "page_text"
            elif low.startswith("images:"):
                section = "images"  # page_text 없이 images로 가는 변종 방어
            continue
        if section == "page_text":
            if low.startswith("images:"):
                break
            if _PAGE_TEXT_LINE.match(raw):
                count += 1
    return count


def resolve_cover_url(header: dict, source_id: str) -> str:
    """sync_asb.py:290-291과 동일 규칙: thumb http→https, 없으면 폴백."""
    thumb = (header.get("thumb") or "").strip()
    if thumb:
        return thumb.replace("http://", "https://")
    return f"{ASB_COVER_BASE}/{source_id}.png"


def head_status(url: str, retries: int = 1) -> str:
    """HEAD 요청 → HTTP 코드 문자열. 1회 재시도 후 실패면 ERR:<사유>."""
    last = "ERR:Unknown"
    for attempt in range(retries + 1):
        try:
            resp = requests.head(url, timeout=HTTP_TIMEOUT, allow_redirects=True)
            return str(resp.status_code)
        except Exception as exc:  # noqa: BLE001
            last = f"ERR:{type(exc).__name__}"
    return last


def scan_one(source_id: str) -> dict:
    """단일 id → 신호 3종 dict. 네트워크 오류는 행 내 표기로 흡수(중단 없음)."""
    raw_url = f"{ASB_RAW_BASE}/{source_id}.txt"
    try:
        resp = requests.get(raw_url, timeout=HTTP_TIMEOUT)
    except Exception as exc:  # noqa: BLE001
        return {"id": source_id, "title": f"<GET ERR:{type(exc).__name__}>",
                "text_lines": "-", "image_count": "-", "cover_http": "-"}
    if resp.status_code != 200:
        return {"id": source_id, "title": f"<txt HTTP {resp.status_code}>",
                "text_lines": "-", "image_count": "-", "cover_http": "-"}

    text = resp.text
    header = parse_asb_header(text)
    title = (header.get("title") or "").strip() or "<no title>"
    text_lines = count_text_lines(text)
    image_count = len(header.get("images") or [])
    cover_http = head_status(resolve_cover_url(header, source_id))

    return {
        "id": source_id,
        "title": title,
        "text_lines": text_lines,
        "image_count": image_count,
        "cover_http": cover_http,
    }


def print_table(rows: list[dict]) -> None:
    cols = [
        ("id", "id", 7),
        ("title", "title", 40),
        ("text_lines", "text_lines", 10),
        ("image_count", "image_count", 11),
        ("cover_http", "cover_http", 10),
    ]
    header = " | ".join(h.ljust(w) for _, h, w in cols)
    print(header)
    print("-" * len(header))
    for r in rows:
        line = " | ".join(str(r[k])[:w].ljust(w) for k, _, w in cols)
        print(line)


# ---------------------------------------------------------------------------
# 전량(--all): tarball 1회 fetch → sync_asb 필터 미러링 → 신호 산출 → 표지 HEAD 동시성
# ---------------------------------------------------------------------------
COVER_HEAD_WORKERS = 10  # 표지 HEAD 동시성(작업 제약: 8~10)


def collect_eligible_rows() -> list[dict]:
    """
    tarball 1회 fetch 후 sync_asb.main()의 적격 판정을 그대로 미러링한 행 목록.
    각 행: id/title/text_lines/image_count/cover_url(+cover_http=None 미정).
    DB 미접근 → dedup skipset 빈집합(=dedup 0 skip). 표지 HEAD는 호출자가 채운다.
    """
    books = fetch_asb_books()  # [(fname, text)] — 디스크 잔여 0
    skipset = build_dedup_skipset(None)  # DB 미연결 → 빈 집합(경고 출력)
    rows: list[dict] = []
    for _fname, text in books:
        header = parse_asb_header(text)
        if (header.get("lang") or "").strip() != ENGLISH_LANG:
            continue
        if normalize_asb_license(header.get("lic")) is None:
            continue  # NC/ND·미매칭 차단
        try:
            payload, _ = build_payload(header)
        except _AttributionError:
            continue
        if payload is None:
            continue  # 필수필드 결측
        if normalize_title(payload["title"]) in skipset:
            continue  # dedup(빈 skipset이면 통과)
        rows.append({
            "id": payload["source_id"],
            "title": payload["title"],
            "text_lines": count_text_lines(text),
            "image_count": len(header.get("images") or []),
            "cover_url": payload["cover_url"],  # build_payload가 thumb→폴백 규칙 적용
            "cover_http": None,
        })
    return rows


def fill_cover_http(rows: list[dict]) -> None:
    """표지 HEAD를 동시성으로 채운다(in-place). KeyboardInterrupt 시 부분만 채워진 채 반환."""
    total = len(rows)
    done = 0
    try:
        with ThreadPoolExecutor(max_workers=COVER_HEAD_WORKERS) as ex:
            fut_map = {ex.submit(head_status, r["cover_url"]): r for r in rows}
            for fut in as_completed(fut_map):
                r = fut_map[fut]
                r["cover_http"] = fut.result()
                done += 1
                if done % 200 == 0 or done == total:
                    print(f"  … 표지 HEAD {done}/{total}")
    except KeyboardInterrupt:
        print(f"  ⚠ 중단됨 — 표지 HEAD {done}/{total} 완료. 부분 결과로 분포 출력.")


def _bucket_text(n: int) -> str:
    if n == 0:
        return "0줄"
    if n <= 2:
        return "1~2줄"
    if n <= 5:
        return "3~5줄"
    return "6줄+"


def _bucket_image(n: int) -> str:
    if n == 0:
        return "0장"
    if n == 1:
        return "1장"
    if n <= 4:
        return "2~4장"
    return "5장+"


def _bucket_cover(code) -> str:
    if code == "200":
        return "200"
    if code == "404":
        return "404"
    return "기타"


# 분류 임계 — 단일 출처(분포 교차표·CSV bucket이 동일 함수를 공유해 어긋남 방지).
# 새 기준을 만들지 않고 스캔이 쓰던 임계(글≥3 & 그림≥3, 글0 & 그림≤1)를 그대로 명문화.
# 표지: cover_ok = (cover_http == "200")만 ok. 200이 아닌 값(404·기타·타임아웃 등)은
#       전부 '표지 폴백 필요'(candidate_cover_404) 쪽으로 묶는다(보정 지시).
BUCKET_ORDER = [
    "candidate_cover_404",
    "candidate_cover_ok",
    "empty_dummy",
    "grey",
    "no_text_picture",
]


def classify_bucket(text_lines: int, image_count: int, cover_http) -> str:
    """신호 3종 → bucket 문자열 1개(작업 4단계 규칙 + 표지 200/비200 보정)."""
    if text_lines == 0 and image_count <= 1:
        return "empty_dummy"
    if text_lines == 0 and image_count >= 2:
        return "no_text_picture"
    cover_ok = str(cover_http) == "200"
    if text_lines >= 3 and image_count >= 3:
        return "candidate_cover_ok" if cover_ok else "candidate_cover_404"
    return "grey"


def print_distribution(rows: list[dict]) -> None:
    """신호 3종 분포 + 교차표(임계값 초안 검증용). cover_http 미정(None) 행은 제외 집계."""
    scanned = [r for r in rows if r["cover_http"] is not None]
    n = len(scanned)

    def tally(rows_, keyfn, order):
        c = {k: 0 for k in order}
        for r in rows_:
            c[keyfn(r)] += 1
        return c

    text_dist = tally(scanned, lambda r: _bucket_text(r["text_lines"]),
                      ["0줄", "1~2줄", "3~5줄", "6줄+"])
    image_dist = tally(scanned, lambda r: _bucket_image(r["image_count"]),
                       ["0장", "1장", "2~4장", "5장+"])
    cover_dist = tally(scanned, lambda r: _bucket_cover(r["cover_http"]),
                       ["200", "404", "기타"])

    # 버킷 분류 — CSV와 동일한 classify_bucket 단일 함수 사용(어긋남 방지).
    bucket_of = {
        id(r): classify_bucket(r["text_lines"], r["image_count"], r["cover_http"])
        for r in scanned
    }
    bucket_cnt = {b: 0 for b in BUCKET_ORDER}
    for r in scanned:
        bucket_cnt[bucket_of[id(r)]] += 1

    dummy = [r for r in scanned if bucket_of[id(r)] == "empty_dummy"]
    rescue = [r for r in scanned if bucket_of[id(r)] == "candidate_cover_404"]

    print()
    print("=" * 60)
    print(f" 분포 요약 (집계 대상 {n}권 / 적격 {len(rows)}권)")
    print("=" * 60)
    print(f"  text_lines : 0줄={text_dist['0줄']}  1~2줄={text_dist['1~2줄']}  "
          f"3~5줄={text_dist['3~5줄']}  6줄+={text_dist['6줄+']}")
    print(f"  image_count: 0장={image_dist['0장']}  1장={image_dist['1장']}  "
          f"2~4장={image_dist['2~4장']}  5장+={image_dist['5장+']}")
    print(f"  cover_http : 200={cover_dist['200']}  404={cover_dist['404']}  "
          f"기타={cover_dist['기타']}")
    print()
    print("  [bucket 분류 (classify_bucket — CSV와 동일 함수)]")
    print(f"    candidate_cover_ok  (글≥3 & 그림≥3 & 표지200)   : {bucket_cnt['candidate_cover_ok']}")
    print(f"    candidate_cover_404 (글≥3 & 그림≥3 & 표지≠200)  : {bucket_cnt['candidate_cover_404']}")
    print(f"    empty_dummy         (글0 & 그림≤1)              : {bucket_cnt['empty_dummy']}")
    print(f"    no_text_picture     (글0 & 그림≥2)              : {bucket_cnt['no_text_picture']}")
    print(f"    grey                (그 외)                     : {bucket_cnt['grey']}")
    print(f"    합계                                            : {sum(bucket_cnt.values())}")
    print()
    print("  [empty_dummy source_id 전체]")
    print("    " + (", ".join(r["id"] for r in dummy) if dummy else "(없음)"))
    print()
    print("  [candidate_cover_404 source_id 전체]")
    print("    " + (", ".join(r["id"] for r in rescue) if rescue else "(없음)"))


def write_csv(rows: list[dict], path: str) -> dict:
    """
    권별 1행 CSV(신호 데이터). 컬럼: source_id,title,text_lines,image_count,cover_http,bucket.
    정렬: bucket → source_id(숫자 오름차순). out 폴더 없으면 생성.
    cover_http 미정(None) 행은 스킵(부분 결과 방어). 반환: bucket별 행 수 dict.
    """
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)

    records = []
    for r in rows:
        if r["cover_http"] is None:
            continue
        records.append({
            "source_id": r["id"],
            "title": r["title"],
            "text_lines": r["text_lines"],
            "image_count": r["image_count"],
            "cover_http": r["cover_http"],
            "bucket": classify_bucket(r["text_lines"], r["image_count"], r["cover_http"]),
        })

    def _id_key(s: str):
        try:
            return (0, int(s))
        except (TypeError, ValueError):
            return (1, s)

    records.sort(key=lambda d: (d["bucket"], _id_key(d["source_id"])))

    fields = ["source_id", "title", "text_lines", "image_count", "cover_http", "bucket"]
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(records)

    counts: dict = {}
    for rec in records:
        counts[rec["bucket"]] = counts.get(rec["bucket"], 0) + 1
    return counts


def run_all(csv_path: str | None = None) -> int:
    print("[INFO] ASb 전량 품질 스캔 — tarball 1회 + 표지 HEAD 동시성"
          f"({COVER_HEAD_WORKERS}). DB 미접근.")
    print()
    try:
        rows = collect_eligible_rows()
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] tarball/필터 단계 실패: {type(exc).__name__}: {exc}")
        return 1
    print(f"[INFO] 적격(English+라이선스, dedup=DB미접근→0) {len(rows)}권 — 표지 HEAD 시작")
    print("  ⚠ dedup은 DB 미접근으로 0 skip. 실제 DB 적재분(2,750)보다 클 수 있음"
          " — source_id로 사후 대조.")
    fill_cover_http(rows)  # 중단되어도 부분 결과 보존
    print_distribution(rows)  # 부분 결과라도 분포 출력(방어)

    if csv_path:
        counts = write_csv(rows, csv_path)
        print()
        print("=" * 60)
        print(f" CSV 기록 — {csv_path}")
        print("=" * 60)
        for b in BUCKET_ORDER:
            print(f"    {b:<20}: {counts.get(b, 0)}")
        print(f"    {'합계':<20}: {sum(counts.values())}")
        print("    (분포요약 [bucket 분류] 수치와 일치해야 함)")

    print()
    if csv_path:
        print("  ※ CSV는 신호 데이터일 뿐(공개/DB 변경 아님) — git 커밋 금지·로컬 보관.")
    else:
        print("  ※ 읽기 전용 — DB/파일 쓰기 없음. (전체 행 CSV는 --csv 로 별도 산출)")
    return 0


def run_ids(ids: list[str]) -> int:
    print(f"[INFO] ASb 품질 스캔 {len(ids)}건 — raw GET + 표지 HEAD (DB 미접근)")
    print()
    rows = [scan_one(i) for i in ids]
    print_table(rows)
    print()
    print("  ※ 읽기 전용 — DB/파일 쓰기 없음.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="ASb 품질 신호 스캔(읽기 전용)")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--ids", help="쉼표구분 ASb source_id 목록 (예: 36768,37240)")
    g.add_argument("--all", action="store_true",
                   help="tarball 전량 스캔(English+라이선스 적격 전체, 분포요약 출력)")
    ap.add_argument("--csv", metavar="PATH", default=None,
                    help="(--all 전용) 권별 1행 CSV 출력 경로 (예: scripts/out/asb_quality_scan.csv)")
    args = ap.parse_args()

    if args.csv and not args.all:
        print("[FAIL] --csv 는 --all 과 함께 사용")
        return 1

    if args.all:
        return run_all(args.csv)

    ids = [s.strip() for s in args.ids.split(",") if s.strip()]
    if not ids:
        print("[FAIL] --ids 비어 있음")
        return 1
    return run_ids(ids)


if __name__ == "__main__":
    sys.exit(main())
