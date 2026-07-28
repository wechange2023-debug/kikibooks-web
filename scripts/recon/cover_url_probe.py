#!/usr/bin/env python3
"""cover_url_probe.py — 외부 표지 URL 전수 응답 측정 (read-only).

작업지시서 2026-07-28. **DB는 SELECT만 · Storage 쓰기 0 · 앱 코드 수정 0.**
네트워크는 원본 표지에 대한 HEAD(필요 시 Range GET 1바이트)만 보낸다 — 본문을 받지 않는다.

배경(확정 사실):
  관리자·사용자 카드의 표지 플레이스홀더는 `<Image onError>` 하나로만 발동한다.
  next.config remotePatterns 미등록은 원인이 아님이 이미 확인됐다(전 host 등록됨).
  남은 원인은 **개별 원본 URL의 응답**이므로, 전수를 직접 두드려 확정한다.

측정 규칙:
  · HEAD 우선. 405/501(HEAD 미지원 서버)이면 Range: bytes=0-0 GET으로 1회 승격 재시도.
  · 5xx·네트워크 오류는 최대 RETRIES회 재시도(GH Pages 간헐 503 실측 교훈, 2026-07-28).
  · 4xx는 재시도하지 않는다 — 진짜 결손이므로 반복해도 같고 원본 서버만 괴롭힌다.
  · 동시성 CONCURRENCY(기본 5) + 요청 간 SLEEP — 원본 서버 부하를 낮게 유지한다.
  · 호스트별 직렬화는 하지 않되 동시성이 낮아 초당 요청이 수십 건을 넘지 않는다.

출력(scripts/recon/out/ — .gitignore 대상, 스크립트로 재생성 가능):
  cover_probe.json        전 행 측정 결과(id·source_platform·is_active·url·status·note)
  cover_probe_failed.csv  실패 행만(2xx/3xx 아닌 전부)
  cover_probe_state.json  진행 상태(재개용)

재개: cover_probe.json에 이미 있는 id는 건너뛴다(--force로 무시).

사용:
  python scripts/recon/cover_url_probe.py --limit 50     # 스모크
  python scripts/recon/cover_url_probe.py                # 전량
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import requests

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
OUT_DIR = HERE / "out"
ENV_FILE = REPO / ".env.local"

TIMEOUT = 25
RETRIES = 3            # 5xx·네트워크 오류 총 시도 횟수(= 재시도 2회)
RETRY_SLEEP = 1.5
CONCURRENCY = 5
SLEEP_PER_REQ = 0.05   # 워커별 요청 간 간격
UA = "kikibooks-recon/1.0 (cover availability audit; read-only)"

_print_lock = threading.Lock()


# ── DB 조회 (SELECT 전용) ────────────────────────────────────────────────────


def load_env() -> tuple[str, str]:
    """.env.local 우선, 없으면 OS 환경변수. 값은 읽기만 하고 출력하지 않는다."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        print("[FAIL] python-dotenv 미설치 — pip install python-dotenv")
        raise SystemExit(1)
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not secret:
        print("[FAIL] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 누락")
        raise SystemExit(1)
    return url, secret


def make_client():
    try:
        from supabase import create_client
    except ImportError:
        print("[FAIL] supabase 미설치 — pip install supabase")
        raise SystemExit(1)
    return create_client(*load_env())


def page_all(client, table: str, cols: str) -> list[dict]:
    """PostgREST 기본 1,000행 상한을 넘기기 위한 range 페이지네이션(SELECT 전용)."""
    out: list[dict] = []
    start, step = 0, 1000
    while True:
        rows = client.table(table).select(cols).range(start, start + step - 1).execute().data or []
        out.extend(rows)
        if len(rows) < step:
            return out
        start += step


# ── 측정 ────────────────────────────────────────────────────────────────────


def probe(session: requests.Session, url: str) -> tuple[int | None, str]:
    """(status, note). status=None이면 네트워크 실패(note에 예외명)."""
    method = "HEAD"
    for attempt in range(1, RETRIES + 1):
        try:
            if method == "HEAD":
                r = session.head(url, timeout=TIMEOUT, allow_redirects=True)
            else:
                r = session.get(url, timeout=TIMEOUT, allow_redirects=True,
                                headers={"Range": "bytes=0-0"}, stream=True)
                r.close()
            code = r.status_code
            # HEAD 미지원 서버 → Range GET으로 1회 승격
            if code in (405, 501) and method == "HEAD":
                method = "GET"
                continue
            if 500 <= code < 600 and attempt < RETRIES:
                time.sleep(RETRY_SLEEP)
                continue
            return code, ("range_get" if method == "GET" else "head")
        except requests.RequestException as exc:
            if attempt < RETRIES:
                time.sleep(RETRY_SLEEP)
                continue
            return None, f"error:{type(exc).__name__}"
    return None, "exhausted"


def worker(rec: dict) -> dict:
    session = _local.session
    status, note = probe(session, rec["cover_url"])
    rec = dict(rec)
    rec["status"] = status
    rec["note"] = note
    time.sleep(SLEEP_PER_REQ)
    return rec


class _Local(threading.local):
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers["User-Agent"] = UA


_local = _Local()


# ── 집계 ────────────────────────────────────────────────────────────────────


def ok(status: int | None) -> bool:
    return status is not None and 200 <= status < 400


def summarize(rows: list[dict]) -> None:
    from collections import Counter, defaultdict

    print("\n" + "=" * 78)
    by_plat: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        key = str(r["status"]) if r["status"] is not None else r["note"]
        by_plat[r["source_platform"]][key] += 1

    print(" source_platform × 응답코드")
    print("-" * 78)
    for plat in sorted(by_plat):
        c = by_plat[plat]
        total = sum(c.values())
        parts = "  ".join(f"{k}:{v}" for k, v in sorted(c.items(), key=lambda x: -x[1]))
        print(f"  {plat:<14} 총 {total:>5}   {parts}")

    fails = [r for r in rows if not ok(r["status"])]
    print("-" * 78)
    print(f"  실패 합계 {len(fails)} / 측정 {len(rows)}")
    if fails:
        fa = [r for r in fails if r.get("is_active")]
        print(f"  ★ 실패 중 is_active=true(사용자 노출) : {len(fa)}권")
        cp: dict[str, Counter] = defaultdict(Counter)
        for r in fails:
            cp[r["source_platform"]][bool(r.get("is_active"))] += 1
        for plat in sorted(cp):
            print(f"      {plat:<14} active={cp[plat][True]:>4}  inactive={cp[plat][False]:>4}")
    print("=" * 78)


# ── main ────────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description="외부 표지 URL 전수 응답 측정(read-only)")
    ap.add_argument("--limit", type=int, default=0, help="앞 N건만(스모크). 0=전량")
    ap.add_argument("--force", action="store_true", help="기존 결과 무시하고 재측정")
    ap.add_argument("--concurrency", type=int, default=CONCURRENCY)
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    res_path = OUT_DIR / "cover_probe.json"
    csv_path = OUT_DIR / "cover_probe_failed.csv"
    state_path = OUT_DIR / "cover_probe_state.json"

    print("[INFO] books 조회 중(SELECT 전용)…")
    client = make_client()
    books = page_all(client, "books", "id,source_platform,cover_url,is_active,title")
    print(f"[INFO] books 총 {len(books)}행")

    external, non_url, internal = [], [], []
    for b in books:
        u = (b.get("cover_url") or "").strip()
        if not u:
            non_url.append(b)
        elif not u.lower().startswith("http"):
            non_url.append(b)
        elif "/storage/v1/object/public/" in u:
            internal.append(b)
        else:
            external.append(b)

    print(f"[INFO] 외부 URL {len(external)} / Supabase Storage {len(internal)} "
          f"/ URL 아님·빈값 {len(non_url)}")
    if non_url:
        print("[INFO] URL 아님·빈값 목록(측정 제외):")
        for b in non_url:
            print(f"    {b['source_platform']:<10} {b['id']}  cover_url={b.get('cover_url')!r}"
                  f"  is_active={b.get('is_active')}  title={b.get('title')!r}")

    done: dict[str, dict] = {}
    if res_path.exists() and not args.force:
        try:
            done = {r["id"]: r for r in json.loads(res_path.read_text("utf-8"))}
            print(f"[INFO] 기존 결과 {len(done)}건 재사용(--force로 무시)")
        except Exception:  # noqa: BLE001
            done = {}

    todo = [b for b in external if b["id"] not in done]
    if args.limit:
        todo = todo[: args.limit]
    print(f"[INFO] 이번 측정 대상 {len(todo)}건 (동시성 {args.concurrency})")

    results: list[dict] = [done[b["id"]] for b in external if b["id"] in done]
    started = time.time()
    n_done = 0

    with ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        for rec in ex.map(worker, todo):
            results.append(rec)
            n_done += 1
            if not ok(rec["status"]):
                with _print_lock:
                    print(f"  [{rec['status'] if rec['status'] is not None else rec['note']}] "
                          f"{rec['source_platform']:<10} {rec['cover_url'][:88]}")
            if n_done % 200 == 0:
                el = time.time() - started
                with _print_lock:
                    print(f"  … {n_done}/{len(todo)}  ({el:.0f}s, {n_done / max(el, 1):.1f} req/s)")
                res_path.write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")
                state_path.write_text(json.dumps(
                    {"total": len(external), "measured": len(results),
                     "remaining": len(todo) - n_done,
                     "updated_at": datetime.now(timezone.utc).isoformat()},
                    ensure_ascii=False, indent=1), encoding="utf-8")

    res_path.write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")
    state_path.write_text(json.dumps(
        {"total": len(external), "measured": len(results), "remaining": 0,
         "non_url": [{"id": b["id"], "source_platform": b["source_platform"],
                      "cover_url": b.get("cover_url"), "is_active": b.get("is_active"),
                      "title": b.get("title")} for b in non_url],
         "internal_storage": len(internal),
         "updated_at": datetime.now(timezone.utc).isoformat()},
        ensure_ascii=False, indent=1), encoding="utf-8")

    fails = [r for r in results if not ok(r["status"])]
    with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["source_platform", "book_id", "is_active", "status", "note", "title", "cover_url"])
        for r in sorted(fails, key=lambda x: (x["source_platform"], str(x["status"]))):
            w.writerow([r["source_platform"], r["id"], r.get("is_active"),
                        r["status"], r["note"], r.get("title"), r["cover_url"]])

    summarize(results)
    print(f"\n[OK] 결과 {res_path}")
    print(f"[OK] 실패 CSV {csv_path}  ({len(fails)}행)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
