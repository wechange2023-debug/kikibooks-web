#!/usr/bin/env python3
"""
analyze_bloom_dedup2.py — Bloom dedup2 제외 411권 분석 (읽기 전용)

목적(작업지시서):
  Bloom 1차 배치 적재(run_execute, REPORT 실측)에서 title 기반 dedup2(2단)로
  제외된 411건이 진짜 중복(true-dup)인지, 제목만 겹친 신규(false-positive)인지
  분류한다. 분류는 표지 검수 규모 결정(281 → 더 늘릴지)의 근거가 된다.

원칙:
  - sync_bloom.py 를 **수정하지 않는다**. candidate 생성 / dedup2 / title 정규화
    함수를 import 해서 **그대로 재사용**한다(재구현 금지 — 실제 dedup2와 어긋나면 안 됨).
  - dedup2는 run_execute 루프의 **마지막 게이트**다(test_artifact → source_id 가드 →
    manifest 합성 → AI → gate① → gate② → dedup2). 411과 정확히 일치시키려면 그 앞
    게이트를 **동일 순서**로 통과시켜야 하므로 build_bloom_manifest(index.htm fetch)를
    그대로 호출한다. 이 fetch가 new_author(extract_author)도 함께 제공한다.
  - DB는 **SELECT(읽기)만**. INSERT/UPDATE/Storage 업로드 절대 없음. --commit 류 없음.

산출물:
  - scratchpad/bloom_dedup2_excluded.csv
    컬럼: new_title, new_source_id, new_author, new_level,
          matched_existing_title, matched_existing_source_platform,
          matched_existing_author, classification, match_scope

사용:
    python scripts/../scratchpad/analyze_bloom_dedup2.py
    (리포 루트에서) python scratchpad/analyze_bloom_dedup2.py
"""

from __future__ import annotations

import csv
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Optional

import requests

# scripts/ 를 sys.path 에 추가 후 sync_bloom 함수 재사용(재구현 금지).
ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

# 모듈 레벨 부작용 없음 확인: sync_bloom 은 main()을 if __name__=="__main__" 로 가드.
# import 시 네트워크/DB 쓰기 트리거 없음(상수·정규식·stdout reconfigure 뿐).
import sync_bloom as sb  # noqa: E402

# Windows 콘솔 UTF-8 (sync_bloom 와 동일 패턴 — 한글/키릴 깨짐 방지)
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

CSV_PATH = ROOT / "scratchpad" / "bloom_dedup2_excluded.csv"


# ---------------------------------------------------------------------------
# 기존 books 메타 로드 (읽기 전용 SELECT — dedup2 매칭 메타 보강용, 재구현 아님)
# ---------------------------------------------------------------------------
def load_existing_rows(client: Any) -> list[dict[str, Any]]:
    """기존 books 전건(읽기). title·source_platform·author·source_id 만.

    sync_bloom.fetch_existing_titles 는 title 집합만 반환하므로 matched_existing_*
    컬럼(author·platform)을 채울 수 없다. 동일 대상(books 전체)을 읽되 필요한
    컬럼을 함께 가져온다. 정규화 키는 sync_bloom._norm_title 그대로 사용.
    """
    rows = (
        client.table("books")
        .select("title,source_platform,author,source_id")
        .execute()
        .data
        or []
    )
    return rows


def build_existing_map(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """norm_title(_norm_title) → 기존행 리스트. dedup2 매칭 시 메타 조회용."""
    m: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        t = r.get("title") or ""
        if not t:
            continue
        key = sb._norm_title(t)
        if not key:
            continue
        m.setdefault(key, []).append(r)
    return m


# ---------------------------------------------------------------------------
# 저자 정규화·유사도 (분석 로컬 — dedup2 재구현 아님, 분류용 보조 지표)
# ---------------------------------------------------------------------------
def norm_author(a: Optional[str]) -> str:
    """저자 비교용 정규화 — 소문자·영숫자만·공백 단일화."""
    return re.sub(r"[^a-z0-9]+", " ", (a or "").lower()).strip()


def author_tokens(a: str) -> set[str]:
    return {w for w in a.split() if len(w) > 1}


def authors_similar(a: str, b: str) -> bool:
    """정규화 저자 유사 판정 — 동일/포함/토큰 Jaccard≥0.6."""
    if not a or not b:
        return False
    if a == b:
        return True
    if a in b or b in a:
        return True
    ta, tb = author_tokens(a), author_tokens(b)
    if not ta or not tb:
        return False
    inter = len(ta & tb)
    union = len(ta | tb)
    return union > 0 and inter / union >= 0.6


def pick_matched_row(
    new_author_n: str, rows: list[dict[str, Any]]
) -> tuple[dict[str, Any], bool]:
    """동일 norm_title 기존행 중 매칭행 선택.

    저자 유사행이 있으면 그 행(true-dup 유리하게 선택)을, 없으면 첫 행을 반환.
    → (선택행, author_match 여부).
    """
    if new_author_n:
        for r in rows:
            if authors_similar(new_author_n, norm_author(r.get("author"))):
                return r, True
    return rows[0], False


# ---------------------------------------------------------------------------
# 메인 분석 — run_execute 루프 충실 복제(REPORT, 쓰기 0)
# ---------------------------------------------------------------------------
def main() -> int:
    print("=" * 64)
    print(" Bloom dedup2 제외 411 분석 (읽기 전용 — DB write 0, --commit 없음)")
    print("=" * 64)

    # 1) Supabase 연결(읽기 전용으로만 사용).
    client, _supabase_url = sb.init_supabase()

    # 2) 후보 수집 — run_execute 와 동일 파이프라인(전량 풀).
    where = sb.build_where()
    print("[INFO] Parse 수집(전량)...")
    collected = sb.fetch_books(where, limit=None)
    after_tag, tag_excluded = sb.apply_tag_dedup(collected)
    candidates, no_en, bad_json = sb.apply_english_filter(after_tag)
    candidates, dup_removed = sb.dedup_latest_by_source_id(candidates)  # ADR-0030 D5
    print(
        f"[INFO] 수집 {len(collected)} → tagdedup {len(after_tag)} "
        f"→ 영어필터 {len(candidates) + dup_removed} → D5(-{dup_removed}) {len(candidates)}"
    )

    # 3) 기존 books 로드 — 정규화 title 집합(dedup2 정본) + 매칭 메타맵 + source_id 가드.
    existing_rows = load_existing_rows(client)
    existing = {
        sb._norm_title(r.get("title", ""))
        for r in existing_rows
        if r.get("title")
    }
    existing_map = build_existing_map(existing_rows)
    existing_ids = sb.fetch_existing_source_ids(client)
    print(
        f"[INFO] 기존 books {len(existing_rows)}행 / norm title {len(existing)}개 / "
        f"기존 bloom source_id(보호) {len(existing_ids)}개"
    )

    # 4) run_execute 루프 충실 복제. dedup2 drop 만 기록.
    #    순서: test_artifact → source_id 가드 → manifest 합성 → AI → gate① → gate②
    #         → dedup2. (skip_review=False → 검수리스트 skip 없음, 배치와 동일.)
    excluded: list[dict[str, Any]] = []
    # 배치 내 INSERT 확정 norm_title → 그 책의 메타(내부 dedup 충돌의 매칭 대상).
    # run_execute 의 existing.add 와 동형이되, 분류용으로 author/title 까지 보존.
    batch_inserted: dict[str, dict[str, Any]] = {}
    skip: Counter = Counter()
    inserted = 0
    n = len(candidates)
    for i, b in enumerate(candidates, 1):
        title = sb.pick_english_title(b)
        if sb.is_test_artifact(title):
            skip["자동제외:테스트물"] += 1
            continue
        source_id = sb._book_source_id(b)
        if source_id in existing_ids:
            skip["기존source_id(보호·미터치)"] += 1
            continue
        try:
            res = sb.build_bloom_manifest(b)
        except requests.RequestException:
            skip["네트워크에러"] += 1
            continue
        if not res.get("ok"):
            r = res.get("reason", "기타")
            key = (
                "합성:이미지0장" if "이미지 0장" in r
                else "합성:fetch실패" if "fetch" in r
                else "합성:라이선스" if "라이선스" in r
                else "합성:기타"
            )
            skip[key] += 1
            continue
        if sb.is_ai_generated(res):
            skip["자동제외:AI생성"] += 1
            continue
        if res["page_count"] < sb.GATE1_MIN_PAGES:
            skip["gate①:1p이하"] += 1
            continue
        if res.get("text_count", 0) == 0:
            skip["gate②:무텍스트"] += 1
            continue

        # --- dedup2 (마지막 게이트, run_execute line 1035 와 동일) ---
        norm = sb._norm_title(res["title"])
        if norm in existing:
            # drop. 매칭 출처 판별: 기존 DB 행 우선, 없으면 배치 내 동일제목(within-batch).
            new_author = res.get("author")
            new_author_n = norm_author(new_author)
            new_level = sb.bloom_level(b)
            if norm in existing_map:
                matched, author_match = pick_matched_row(
                    new_author_n, existing_map[norm]
                )
                match_scope = "db"
                m_title = matched.get("title")
                m_platform = matched.get("source_platform")
                m_author = matched.get("author")
            else:
                # DB엔 없고 같은 배치 앞 후보와 제목 충돌(within-batch dup).
                # 매칭 대상 = 먼저 INSERT 확정된 동일 정규화제목의 신규 bloom 책.
                match_scope = "batch"
                author_match = False
                prior = batch_inserted.get(norm, {})
                m_title = prior.get("title") or res["title"]
                m_platform = "bloom(batch)"
                m_author = prior.get("author")
            # 분류: 저자 일치=true-dup / 양쪽 저자 존재+불일치=false-positive
            #       / 한쪽이라도 저자 결측=unknown(판정 불가).
            m_author_n = norm_author(m_author)
            if author_match or (new_author_n and authors_similar(new_author_n, m_author_n)):
                classification = "true-dup"
            elif new_author_n and m_author_n:
                classification = "false-positive"
            else:
                classification = "unknown(author-missing)"
            excluded.append({
                "new_title": res["title"],
                "new_source_id": source_id,
                "new_author": new_author or "",
                "new_level": "" if new_level is None else new_level,
                "matched_existing_title": m_title or "",
                "matched_existing_source_platform": m_platform or "",
                "matched_existing_author": m_author or "",
                "classification": classification,
                "match_scope": match_scope,
            })
            skip["dedup2:기존제목"] += 1
        else:
            existing.add(norm)       # run_execute: existing.add(...) (배치 내 중복 방지)
            # 첫 등장만 보존(이후 동일제목은 이 책과 충돌). author 결측 책이 먼저여도
            # run_execute 와 동일하게 첫 INSERT 책이 매칭 기준.
            batch_inserted.setdefault(norm, {
                "title": res["title"],
                "author": res.get("author"),
            })
            inserted += 1

        if i % 50 == 0 or i == n:
            print(
                f"  [{i}/{n}] insert={inserted} "
                f"dedup2={skip.get('dedup2:기존제목', 0)} "
                f"skip합={sum(skip.values())}"
            )

    # 5) CSV 기록.
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    cols = [
        "new_title", "new_source_id", "new_author", "new_level",
        "matched_existing_title", "matched_existing_source_platform",
        "matched_existing_author", "classification", "match_scope",
    ]
    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(excluded)

    # 6) 집계 출력.
    cls = Counter(r["classification"] for r in excluded)
    scope = Counter(r["match_scope"] for r in excluded)
    total = len(excluded)
    print()
    print("=" * 64)
    print(" 스킵 사유별 (run_execute 충실 복제)")
    print("=" * 64)
    for reason, cnt in skip.most_common():
        print(f"  {reason:24s}: {cnt}")
    print(f"  {'INSERT 예정':24s}: {inserted}")
    print()
    print("=" * 64)
    print(f" dedup2 제외 {total}건 분류")
    print("=" * 64)
    for k in ("true-dup", "false-positive", "unknown(author-missing)"):
        c = cls.get(k, 0)
        pct = (100.0 * c / total) if total else 0.0
        print(f"  {k:26s}: {c:4d}  ({pct:5.1f}%)")
    print(f"  {'(매칭 출처) db':26s}: {scope.get('db', 0)}")
    print(f"  {'(매칭 출처) batch내부':26s}: {scope.get('batch', 0)}")
    fp = cls.get("false-positive", 0)
    unk = cls.get("unknown(author-missing)", 0)
    print()
    print(f"  false-positive 추정 비율(저자불일치/{total}) : "
          f"{(100.0*fp/total if total else 0):.1f}%")
    print(f"  ※ unknown(저자결측) {unk}건은 판정 불가 — false-positive 상한은 "
          f"{(100.0*(fp+unk)/total if total else 0):.1f}% (fp+unknown).")
    print()
    print(f"[INFO] CSV 저장: {CSV_PATH}")
    print("[INFO] DB write 0 · Storage 0 · --commit 미사용 (읽기 전용).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
