#!/usr/bin/env python3
"""dryrun_asb_bloom.py — ASb 527 / Bloom 142 asb_native 본문 전수 드라이런.

목적
----
`book_text` 적재 설계에 필요한 실측치를 전량 확보한다. **세어보기 전용**이다.

★ 본 스크립트는 아무것도 적재하지 않는다.
    DB 접속 0건 · DB 쓰기 0건 · Storage 쓰기 0건 · AWS/Polly 호출 0건.
    하는 일은 (1) 팀장 export CSV 읽기 (2) content_url GET (3) 파싱·집계 (4) scratchpad 기록뿐이다.

★ 파싱 규칙은 `lib/book/asb-parser.ts`(ADR-0025 Amendment #6 구현)를 **그대로 옮긴 것**이다.
  규칙을 개선하지 않는다 — 화면(AsbReader)이 실제로 그리는 것과 어긋나면 이 실측은 무의미하다.
  이식 대조표는 본 파일 `parse_asb_text()` 주석 참조.

★ 인코딩: 브라우저 `Response.text()`는 Content-Type charset을 무시하고 항상 UTF-8로 디코딩한다.
  `requests`는 charset 부재 시 ISO-8859-1로 오판해 mojibake(â€™ 류)를 만든다
  (ADR-0028 Amd#5 ① 사고와 동일 원인). 따라서 `resp.encoding = "utf-8"`을 강제해
  화면과 동일한 문자열을 얻는다.

입력
----
    scratchpad/text_harvest/asb_bloom_targets.csv   (팀장 SQL Editor export)
    필수 컬럼: id, source_platform, source_id, title, content_url
    조건     : is_active = TRUE AND content_type = 'asb_native'
               AND source_platform IN ('african_storybook','bloom')

출력 (전부 scratchpad/text_harvest/ 아래)
----------------------------------------
    asb_bloom_dryrun.csv          권별 1행
    asb_bloom_dryrun_report.json  플랫폼별 + 합계 집계
    asb_bloom_anomalies.csv       이상징후 해당 권만
    _progress.jsonl               권별 원시 결과(재개용). --resume 이 읽는다.

사용
----
    python scripts/text_harvest/dryrun_asb_bloom.py --check-input   # CSV만 점검(네트워크 0)
    python scripts/text_harvest/dryrun_asb_bloom.py                 # 전수 실행
    python scripts/text_harvest/dryrun_asb_bloom.py --resume        # 중단 후 이어서
    python scripts/text_harvest/dryrun_asb_bloom.py --platform bloom --limit 5   # 소규모 선행

STOP 조건 (지시서: 예상 밖 상황 시 즉시 중단 후 보고)
----------------------------------------------------
    20권 이상 처리한 뒤,
      · fetch 실패율   > 20% → STOP (대량 404·차단 의심)
      · mojibake 의심율 > 5%  → STOP (인코딩 파이프라인 이상)
    STOP 시에도 그 시점까지의 산출물 3종을 기록하고 종료코드 4로 끝낸다.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

REPO = Path(__file__).resolve().parent.parent.parent
OUT_DIR = REPO / "scratchpad" / "text_harvest"
DEFAULT_INPUT = OUT_DIR / "asb_bloom_targets.csv"

# 정제 규칙은 TTS 파이프라인과 **동일 함수**를 쓴다(문자 수 기준이 갈리면 비용 추정이 무의미).
# tts_targets 는 import 시점에 DB에 접속하지 않는다(supabase/dotenv 는 함수 내부 import).
sys.path.insert(0, str(REPO / "scripts" / "tts_pilot"))
try:
    from tts_targets import sanitize  # noqa: E402
except ImportError as exc:  # pragma: no cover
    print(f"[STOP] tts_targets.sanitize 임포트 실패 — {exc}\n"
          "  정제 규칙을 TTS 파이프라인과 공유해야 한다. 로컬 복제본을 만들지 말 것.")
    raise SystemExit(2) from exc

REQUIRED_COLS = ("id", "source_platform", "source_id", "title", "content_url")
VALID_PLATFORMS = ("african_storybook", "bloom")

HTTP_TIMEOUT = 30
SLEEP_BETWEEN = 0.3       # 지시서: 동시성 1, 요청 간 0.3초
MAX_RETRIES = 3           # 지시서: 3회 재시도 후 fail
RETRY_SLEEP = 1.5

POLLY_CHAR_LIMIT = 3000   # SynthesizeSpeech 1회 요청 과금 문자 상한
USD_PER_MILLION = {"long-form": 100.0, "neural": 16.0}
DEFAULT_KRW_RATE = 1400.0

STOP_MIN_SAMPLE = 20      # 이 권수 이상 처리한 뒤부터 STOP 판정
# 실패 임계 20%(팀장 조정 2026-08-08): ASb는 GitHub raw 재fetch라 링크 부패가 일부 예상되고,
# 실패는 CSV에 기록되므로 조기 중단보다 전수 완주가 이득이다.
STOP_FAIL_RATE = 0.20
# mojibake 임계 5% 유지: 인코딩·파서 문제는 산출물 전량을 무효화하므로 조기 발견이 이득이다.
STOP_MOJIBAKE_RATE = 0.05

# UTF-8 바이트를 cp1252/latin-1로 잘못 디코딩했을 때 나타나는 대표 시퀀스.
_MOJIBAKE_MARKERS = ("â€™", "â€œ", "â€\x9d", "â€“", "â€”", "Ã©", "Ã¡", "Ã¨", "Â ")


# ─────────────────────────────────────────────────────────────────────────────
# 파서 — lib/book/asb-parser.ts 이식 (규칙 변경 금지)
# ─────────────────────────────────────────────────────────────────────────────
ASB_IMAGE_BASE = "https://africanstorybook.org/"   # asb-parser.ts:21
_P_LINE_RE = re.compile(r"^P(\d+)\t")              # asb-parser.ts:100  /^P\d+\t/
_HTTP_RE = re.compile(r"^https?://", re.I)         # asb-parser.ts:46
_HTTP_ONLY_RE = re.compile(r"^http://", re.I)      # asb-parser.ts:47


def normalize_page_text(text: str) -> str:
    """asb-parser.ts:58-63 normalizePageText — "@@" 줄바꿈 마커 → "\\n", 빈 줄 접기, trim."""
    text = re.sub(r"\s*@\s*@\s*", "\n", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def to_absolute_image_url(path: str) -> str:
    """asb-parser.ts:44-51 toAbsoluteImageUrl — 절대 URL은 http→https 승격, 상대경로는 base 결합."""
    trimmed = path.strip()
    if _HTTP_RE.match(trimmed):
        return _HTTP_ONLY_RE.sub("https://", trimmed, count=1)
    return ASB_IMAGE_BASE + re.sub(r"^/+", "", trimmed)


def parse_asb_text(raw: str) -> tuple[list[str], list[str], list[int]]:
    """asb-parser.ts:72-138 parseAsbText 이식.

    반환: (texts, images, p_numbers)
      texts     — page_text 섹션의 `P<n>\\t` 라인 본문(normalize_page_text 적용). 원본과 동일.
      images    — images 섹션의 이미지 URL(절대화). 원본과 동일.
      p_numbers — 원본에는 없는 **추가 수집분**. P 번호 연속성 판정 전용이며 texts/images
                  산출에는 일절 영향을 주지 않는다(파싱 규칙 무변경).

    원본과의 대조:
      · 섹션 전이(header→page_text→images→done) 조건문 순서·비교 대상 동일
      · `stripped = line.trim()` / `low = stripped.toLowerCase()` 동일
      · P 라인 매칭은 **trim 전 원본 line** 기준(원본 `/^P\\d+\\t/.test(line)`) — 선행 공백이
        있는 라인은 원본도 버리므로 그대로 둔다
      · 이미지 수집 조건 `illustrations/ 포함 || .png|.jpg|.jpeg 로 끝남` 동일(ADR-0027 D2)
      · texts/images 강제 1:1·번호 정렬 금지(Amd#6 A4) — 순서·중복 원문 그대로
    """
    texts: list[str] = []
    images: list[str] = []
    p_numbers: list[int] = []
    section = "header"

    for line in re.split(r"\r?\n", raw):
        if section == "done":
            break

        stripped = line.strip()
        low = stripped.lower()

        if section == "header":
            if low.startswith("page_text:"):
                section = "page_text"
            elif low.startswith("images:"):
                # 방어: page_text 없이 images로 진입하는 변종(원본 주석 그대로).
                section = "images"
            continue

        if section == "page_text":
            if low.startswith("images:"):
                section = "images"
                continue
            m = _P_LINE_RE.match(line)
            if m:
                tab = line.index("\t")
                p_numbers.append(int(m.group(1)))
                texts.append(normalize_page_text(line[tab + 1:]))
            continue

        if section == "images":
            if low.startswith("translations:") or low.startswith("page_text:"):
                section = "done"
                continue
            if stripped and (
                "illustrations/" in stripped
                or low.endswith(".png")
                or low.endswith(".jpg")
                or low.endswith(".jpeg")
            ):
                images.append(to_absolute_image_url(stripped))
            continue

    return texts, images, p_numbers


# ─────────────────────────────────────────────────────────────────────────────
# fetch
# ─────────────────────────────────────────────────────────────────────────────
def fetch_text(session, url: str, retry_4xx: bool) -> tuple[int | None, str | None, str]:
    """content_url GET. 반환 (http_status, body, error).

    재시도: 네트워크 예외·5xx는 최대 MAX_RETRIES회. 4xx는 기본 재시도하지 않는다
    (진짜 결손이며 669권 × 3회 재시도는 순수 낭비 — `--retry-4xx`로 강제 가능).
    인코딩은 UTF-8 강제 — 브라우저 Response.text()와 동일하게 맞춘다.
    """
    last_status: int | None = None
    last_err = ""
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = session.get(url, timeout=HTTP_TIMEOUT)
            last_status = resp.status_code
            if resp.status_code == 200:
                resp.encoding = "utf-8"
                return resp.status_code, resp.text, ""
            last_err = f"HTTP {resp.status_code}"
            if 400 <= resp.status_code < 500 and not retry_4xx:
                return resp.status_code, None, last_err
        except Exception as exc:  # noqa: BLE001
            last_err = f"{type(exc).__name__}: {str(exc)[:120]}"
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_SLEEP * (attempt + 1))
    return last_status, None, last_err


# ─────────────────────────────────────────────────────────────────────────────
# 권별 측정
# ─────────────────────────────────────────────────────────────────────────────
def measure(row: dict, status: int | None, body: str | None, error: str) -> dict:
    """권 1건의 산출 항목을 만든다. body가 None이면 fetch 실패 행."""
    base = {
        "book_id": row["id"],
        "platform": row["source_platform"],
        "source_id": row["source_id"],
        "title": row.get("title") or "",
        "content_url": row["content_url"],
        "http_status": status if status is not None else "",
        "fetch_ok": body is not None,
        "error": error,
        "n_text": 0,
        "n_image": 0,
        "axis_match": "",
        "axis_diff": "",
        "empty_pages": 0,
        "chars_raw": 0,
        "chars_billable": 0,
        "max_page_chars": 0,
        "p_numbers_contiguous": "",
        "p_min": "",
        "p_max": "",
        "mojibake_suspect": "",
        "flags": "",
    }
    if body is None:
        base["flags"] = "FETCH_FAIL"
        return base

    texts, images, p_numbers = parse_asb_text(body)

    # chars_raw     = 파서 산출 텍스트(= 화면에 그려지는 문자열)의 총 문자 수
    # chars_billable= 그것을 TTS 정제(tts_targets.sanitize)한 뒤의 총 문자 수
    chars_raw = sum(len(t) for t in texts)
    cleaned = [sanitize(t)[0] for t in texts]
    empty_pages = sum(1 for c in cleaned if not c)
    chars_billable = sum(len(c) for c in cleaned)
    max_page_chars = max((len(c) for c in cleaned), default=0)

    contiguous = bool(p_numbers) and p_numbers == list(range(1, len(p_numbers) + 1))
    mojibake = any(mk in body for mk in _MOJIBAKE_MARKERS)

    flags = []
    if not texts:
        flags.append("NO_TEXT")
    if not images:
        flags.append("NO_IMAGE")
    if len(texts) != len(images):
        flags.append("AXIS_MISMATCH")
    if texts and not contiguous:
        flags.append("P_NOT_CONTIGUOUS")
    if empty_pages:
        flags.append("EMPTY_PAGES")
    if max_page_chars > POLLY_CHAR_LIMIT:
        flags.append("OVER_POLLY_LIMIT")
    if mojibake:
        flags.append("MOJIBAKE_SUSPECT")

    base.update(
        n_text=len(texts),
        n_image=len(images),
        axis_match=(len(texts) == len(images)),
        axis_diff=len(texts) - len(images),
        empty_pages=empty_pages,
        chars_raw=chars_raw,
        chars_billable=chars_billable,
        max_page_chars=max_page_chars,
        p_numbers_contiguous=contiguous,
        p_min=min(p_numbers) if p_numbers else "",
        p_max=max(p_numbers) if p_numbers else "",
        mojibake_suspect=mojibake,
        flags=";".join(flags),
    )
    return base


# ─────────────────────────────────────────────────────────────────────────────
# 집계
# ─────────────────────────────────────────────────────────────────────────────
def aggregate(rows: list[dict], krw_rate: float) -> dict:
    ok = [r for r in rows if r["fetch_ok"]]
    fail = [r for r in rows if not r["fetch_ok"]]
    chars = sum(r["chars_billable"] for r in ok)

    cost = {}
    for engine, price in USD_PER_MILLION.items():
        u1 = chars * price / 1_000_000.0
        cost[engine] = {
            "usd_per_million": price,
            "usd_x1": round(u1, 4),
            "krw_x1": round(u1 * krw_rate),
            # ×2 = 페이지마다 음성 1회 + speech marks 1회를 부르는 현 구현 기준 보수적 상한
            # (run_tts_fullbatch.py 관례). marks 과금 여부는 실청구서로 확인해야 한다.
            "usd_x2": round(u1 * 2, 4),
            "krw_x2": round(u1 * 2 * krw_rate),
        }

    return {
        "books_total": len(rows),
        "fetch_ok": len(ok),
        "fetch_fail": len(fail),
        "fetch_fail_status": dict(Counter(str(r["http_status"]) for r in fail)),
        "no_text_books": sum(1 for r in ok if r["n_text"] == 0),
        "no_image_books": sum(1 for r in ok if r["n_image"] == 0),
        "axis_mismatch_books": sum(1 for r in ok if r["axis_match"] is False),
        "axis_diff_distribution": dict(
            sorted(Counter(r["axis_diff"] for r in ok).items(), key=lambda kv: kv[0])
        ),
        "p_not_contiguous_books": sum(
            1 for r in ok if r["n_text"] and r["p_numbers_contiguous"] is False),
        "empty_pages_books": sum(1 for r in ok if r["empty_pages"] > 0),
        "empty_pages_total": sum(r["empty_pages"] for r in ok),
        "over_polly_limit_books": sum(
            1 for r in ok if r["max_page_chars"] > POLLY_CHAR_LIMIT),
        "mojibake_books": sum(1 for r in ok if r["mojibake_suspect"] is True),
        "pages_text_total": sum(r["n_text"] for r in ok),
        "pages_image_total": sum(r["n_image"] for r in ok),
        "chars_raw_total": sum(r["chars_raw"] for r in ok),
        "chars_billable_total": chars,
        "max_page_chars_overall": max((r["max_page_chars"] for r in ok), default=0),
        "cost_estimate": cost,
    }


CSV_COLS = [
    "book_id", "platform", "source_id", "title", "http_status", "fetch_ok",
    "n_text", "n_image", "axis_match", "axis_diff", "empty_pages",
    "chars_raw", "chars_billable", "max_page_chars",
    "p_numbers_contiguous", "p_min", "p_max", "mojibake_suspect",
    "error", "flags", "content_url",
]


def write_outputs(rows: list[dict], krw_rate: float, stopped: str | None) -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with (OUT_DIR / "asb_bloom_dryrun.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    anomalies = [r for r in rows if r["flags"]]
    with (OUT_DIR / "asb_bloom_anomalies.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLS, extrasaction="ignore")
        w.writeheader()
        w.writerows(anomalies)

    by_platform = {
        p: aggregate([r for r in rows if r["platform"] == p], krw_rate)
        for p in sorted({r["platform"] for r in rows})
    }
    report = {
        "mode": "dry_run_count_only",
        "note": ("본 산출물은 세어보기 전용이다. DB 쓰기 0 · Storage 쓰기 0 · Polly 호출 0. "
                 "파싱 규칙은 lib/book/asb-parser.ts 이식본(무변경)."),
        "stopped": stopped,
        "krw_rate_assumed": krw_rate,
        "polly_char_limit": POLLY_CHAR_LIMIT,
        "by_platform": by_platform,
        "total": aggregate(rows, krw_rate),
        "anomaly_flag_counts": dict(
            Counter(f for r in rows for f in r["flags"].split(";") if f)),
        "outputs": {
            "per_book_csv": "scratchpad/text_harvest/asb_bloom_dryrun.csv",
            "anomalies_csv": "scratchpad/text_harvest/asb_bloom_anomalies.csv",
            "report_json": "scratchpad/text_harvest/asb_bloom_dryrun_report.json",
        },
    }
    (OUT_DIR / "asb_bloom_dryrun_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


# ─────────────────────────────────────────────────────────────────────────────
def load_input(path: Path, platform: str | None, limit: int | None) -> list[dict]:
    if not path.exists():
        print(f"[STOP] 입력 CSV 없음: {path}\n"
              "  팀장 SQL Editor export(asb_bloom_targets.csv)를 이 경로에 저장하세요.")
        raise SystemExit(2)
    with path.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        print(f"[STOP] 입력 CSV 0행: {path}")
        raise SystemExit(2)

    missing = [c for c in REQUIRED_COLS if c not in rows[0]]
    if missing:
        print(f"[STOP] 필수 컬럼 누락: {missing}\n  실제 헤더: {list(rows[0])}")
        raise SystemExit(2)

    bad_platform = sorted({r["source_platform"] for r in rows} - set(VALID_PLATFORMS))
    if bad_platform:
        print(f"[STOP] 대상 밖 source_platform 혼입: {bad_platform}\n"
              f"  허용: {list(VALID_PLATFORMS)} — SQL 조건을 확인하세요.")
        raise SystemExit(2)

    no_url = [r["source_id"] for r in rows if not (r.get("content_url") or "").strip()]
    if no_url:
        print(f"[STOP] content_url 빈 행 {len(no_url)}건: {no_url[:10]}")
        raise SystemExit(2)

    if platform:
        rows = [r for r in rows if r["source_platform"] == platform]
    if limit:
        rows = rows[:limit]
    return rows


def load_progress() -> dict[str, dict]:
    p = OUT_DIR / "_progress.jsonl"
    if not p.exists():
        return {}
    done: dict[str, dict] = {}
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        done[r["book_id"]] = r
    return done


def main() -> int:
    ap = argparse.ArgumentParser(
        description="ASb/Bloom asb_native 본문 전수 드라이런 (세어보기 전용)")
    ap.add_argument("--input", default=str(DEFAULT_INPUT), help="팀장 export CSV 경로")
    ap.add_argument("--check-input", action="store_true",
                    help="CSV 유효성·건수만 점검하고 종료(네트워크 요청 0)")
    ap.add_argument("--platform", choices=VALID_PLATFORMS, default=None,
                    help="한 플랫폼만 처리(소규모 선행용)")
    ap.add_argument("--limit", type=int, default=None, help="앞에서 N권만")
    ap.add_argument("--resume", action="store_true",
                    help="_progress.jsonl 에 있는 권은 건너뛰고 이어서 진행")
    ap.add_argument("--retry-4xx", action="store_true",
                    help="4xx도 재시도(기본은 즉시 fail — 진짜 결손으로 본다)")
    ap.add_argument("--krw-rate", type=float, default=DEFAULT_KRW_RATE,
                    help=f"원화 환산 가정 환율 (기본 {DEFAULT_KRW_RATE:.0f})")
    args = ap.parse_args()

    targets = load_input(Path(args.input), args.platform, args.limit)
    counts = Counter(r["source_platform"] for r in targets)
    print(f"[INFO] 대상 {len(targets)}권 — " +
          " / ".join(f"{p} {n}" for p, n in sorted(counts.items())))

    if args.check_input:
        print("[CHECK-INPUT] CSV 유효. 네트워크 요청 0건으로 종료.")
        return 0

    try:
        import requests
    except ImportError:
        print("[STOP] requests 미설치 — pip install -r requirements.txt")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    done = load_progress() if args.resume else {}
    if done:
        print(f"[RESUME] 기존 진행분 {len(done)}권 재사용")

    rows: list[dict] = []
    stopped: str | None = None
    session = requests.Session()
    session.headers.update({"User-Agent": "kikibooks-text-harvest-dryrun/1.0 (read-only)"})
    prog = (OUT_DIR / "_progress.jsonl").open("a", encoding="utf-8")

    try:
        pending = [t for t in targets if t["id"] not in done]
        rows.extend(done[t["id"]] for t in targets if t["id"] in done)

        for i, t in enumerate(pending, 1):
            status, body, err = fetch_text(session, t["content_url"].strip(), args.retry_4xx)
            rec = measure(t, status, body, err)
            rows.append(rec)
            prog.write(json.dumps(rec, ensure_ascii=False) + "\n")
            prog.flush()

            mark = "ok " if rec["fetch_ok"] else "FAIL"
            print(f"[{i:>4}/{len(pending)}] {rec['platform']:<17} {rec['source_id']:<24} "
                  f"{mark} text={rec['n_text']:>3} img={rec['n_image']:>3} "
                  f"chars={rec['chars_billable']:>6} {rec['flags']}")

            n = len(rows)
            if n >= STOP_MIN_SAMPLE:
                fails = sum(1 for r in rows if not r["fetch_ok"])
                moji = sum(1 for r in rows if r["mojibake_suspect"] is True)
                if fails / n > STOP_FAIL_RATE:
                    stopped = (f"fetch 실패율 {fails}/{n} = {fails / n:.1%} > "
                               f"{STOP_FAIL_RATE:.0%} — 대량 404·차단 의심")
                    break
                if moji / n > STOP_MOJIBAKE_RATE:
                    stopped = (f"mojibake 의심 {moji}/{n} = {moji / n:.1%} > "
                               f"{STOP_MOJIBAKE_RATE:.0%} — 인코딩 파이프라인 이상")
                    break

            if i < len(pending):
                time.sleep(SLEEP_BETWEEN)
    finally:
        prog.close()

    report = write_outputs(rows, args.krw_rate, stopped)
    tot = report["total"]

    print("=" * 84)
    if stopped:
        print(f"[STOP] {stopped}")
        print(f"  {len(rows)}권까지의 산출물을 기록하고 중단했다. 팀장·오케스트레이터 판단 필요.")
    print(f"[집계] 권수 {tot['books_total']} (성공 {tot['fetch_ok']} / 실패 {tot['fetch_fail']})")
    print(f"  무텍스트(n_text=0)      {tot['no_text_books']}권")
    print(f"  축 불일치(axis_match=F) {tot['axis_mismatch_books']}권  "
          f"분포(n_text-n_image) {tot['axis_diff_distribution']}")
    print(f"  P번호 비연속           {tot['p_not_contiguous_books']}권")
    print(f"  빈 페이지 보유          {tot['empty_pages_books']}권 (총 {tot['empty_pages_total']}면)")
    print(f"  3,000자 초과 페이지 보유 {tot['over_polly_limit_books']}권 "
          f"(최장 {tot['max_page_chars_overall']}자)")
    print(f"  총 텍스트 페이지        {tot['pages_text_total']:,} / "
          f"이미지 {tot['pages_image_total']:,}")
    print(f"  과금 대상 문자수        {tot['chars_billable_total']:,}")
    for engine, c in tot["cost_estimate"].items():
        print(f"  {engine:<10} ${c['usd_per_million']:.0f}/1M → "
              f"×1 ${c['usd_x1']:.2f}/₩{c['krw_x1']:,} · ×2 ${c['usd_x2']:.2f}/₩{c['krw_x2']:,}")
    print("=" * 84)
    print("  산출물 → scratchpad/text_harvest/ (dryrun.csv · dryrun_report.json · anomalies.csv)")
    print("  적재는 하지 않았다. DB 쓰기 0 · Storage 쓰기 0 · Polly 호출 0.")
    return 4 if stopped else 0


if __name__ == "__main__":
    raise SystemExit(main())
