#!/usr/bin/env python3
"""tts_targets.py — Book Dash 전체 TTS 확장의 대상 선정·텍스트 정제 (ADR-0053).

역할
----
Book Dash 활성 도서 중 TTS 생성 대상을 **읽기 전용 조회**로 선정하고, Polly에 넘길
텍스트를 입구에서 정제한다. 이 모듈은 DB를 **읽기만** 한다 — INSERT/UPDATE/DELETE 0건.
Polly 호출·Storage 업로드도 하지 않는다(호출부는 run_tts_fullbatch.py).

선정 규칙 (ADR-0053 D1)
-----------------------
    모집단  books.source_platform='book_dash' AND books.is_active=true
    필수    book_text 행 보유(텍스트 없는 책은 TTS 불가)
    제외 1  회전 페이지 보유 18권      — ROTATED_PAGES (ADR-0050 D1·D3)
    제외 2  제작 메타데이터 오염 6권   — POLLUTED_SLUGS (본 파일 하단 근거)
    제외 3  이미 book_audio 행이 있는 권 (파일럿 생성분 포함)

텍스트 정제 (ADR-0053 D3)
-------------------------
    HTML 엔티티 디코딩(중첩 포함) → 제어·zero-width 문자 제거 → 공백 정규화 →
    문장부호 뒤 공백 보정. 정제 전후 변화는 호출부가 리포트에 남긴다.
"""

from __future__ import annotations

import html
import os
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
ENV_FILE = ROOT / ".env.local"

SOURCE_PLATFORM = "book_dash"

# ─────────────────────────────────────────────────────────────────────────────
# 제외 1 — 회전 페이지 보유 18권 (ADR-0050 D1·D3)
# ─────────────────────────────────────────────────────────────────────────────
# 출처: lib/admin/review/rotation-pages.ts ROTATED_PAGES 키 집합(직교회전 33면 / 18권).
# 회전면은 읽기순서가 역전돼 있어 낭독하면 뜻이 무너진다. 검수 화면에서 텍스트를
# 사람이 고친 뒤에야 TTS 대상이 된다(ADR-0050 D1 — 자동 교정기를 만들지 않는다).
ROTATED_SLUGS: tuple[str, ...] = (
    "catch-that-cat",
    "how-do-you-eat",
    "how-do-you-sleep",
    "khaya-wants-to-row",
    "monkey-business",
    "my-dream-in-the-drawer",
    "pako-the-pigeon-disappears",
    "samoosas",
    "shhhhh",
    "tejus-shadow",
    "the-best-gift",
    "the-box",
    "the-monster-must-go",
    "theres-a-fire-on-the-mountain",
    "theres-an-alien-in-my-house",
    "thulis-tissue",
    "whats-happened-to-our-water",
    "you-yes-you",
)

# ─────────────────────────────────────────────────────────────────────────────
# 제외 2 — 제작 메타데이터 오염 6권
# ─────────────────────────────────────────────────────────────────────────────
# 원본 PDF의 편집용 주석("Story spread N")이 본문 텍스트에 섞여 들어간 권이다.
# 그대로 낭독하면 "스토리 스프레드 텐" 같은 소리가 본문 중간에 들어간다.
#
# 이 목록은 book_text 전수 스캔으로 실측 도출했다(2026-07-27, 읽기 전용):
#   정규식 r"\bstory\s+spread\b" (대소문자 무시) 히트 = 정확히 아래 6권 / 각 1면.
#     and-also p09 · little-goat p03 · look-up p01 ·
#     the-rainbow-cloud p07 · where-is-lulu p08 · yes-you-can p01
#   같은 스캔에서 you-yes-you p12 "Almost at the back cover!"도 걸렸으나 이는 본문
#   문장(오탐)이며, 해당 권은 이미 ROTATED_SLUGS에 포함돼 있어 판정에 영향이 없다.
# 교차검증: lib/admin/review/pilot-cohort.ts 주석의 "회전 18권·오염 6권 제외 후
#   알파벳순 상위 12"를 역산하면 알파벳 선두권에서 and-also 1권만 빠지는데,
#   그 and-also가 위 6권에 포함된다.
POLLUTED_SLUGS: tuple[str, ...] = (
    "and-also",
    "little-goat",
    "look-up",
    "the-rainbow-cloud",
    "where-is-lulu",
    "yes-you-can",
)

EXCLUSION_REASONS = {
    "rotated": "회전 페이지 보유(ADR-0050) — 읽기순서 역전, 검수 수정 선행",
    "polluted": "제작 메타데이터 유입('Story spread N') — 정제 선행",
    "has_audio": "book_audio에 이미 오디오 존재(재생성은 개별 지시)",
    "no_text": "book_text 행 없음 — 낭독할 텍스트 없음",
}


# ─────────────────────────────────────────────────────────────────────────────
# 텍스트 정제 (ADR-0053 D3)
# ─────────────────────────────────────────────────────────────────────────────
_ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍⁠﻿"))
_WS_RE = re.compile(r"[ \t ]+")
_NL_RE = re.compile(r"\s*\n\s*")
# generate_tts.py·run_tts_batch_v2.py와 동일한 최소 교정('Mom.“Say' → 'Mom. “Say').
_PUNCT_GAP_RE = re.compile(r'([.!?])(?=[“”‘’"\'A-Z])')


def unescape_deep(text: str, max_rounds: int = 4) -> tuple[str, int]:
    """HTML 엔티티를 변화가 멈출 때까지 디코딩한다(`&amp;amp;` 같은 중첩 대비).

    반환: (디코딩된 문자열, 실제 수행된 라운드 수). 라운드 수 > 0 이면 엔티티가 있었다는 뜻.
    """
    rounds = 0
    for _ in range(max_rounds):
        decoded = html.unescape(text)
        if decoded == text:
            break
        text = decoded
        rounds += 1
    return text, rounds


def sanitize(text: str | None, *, collapse_newlines: bool = True) -> tuple[str, dict]:
    """Polly 입력용 정제. 반환: (정제문, 진단 dict).

    진단 키: entity_rounds(엔티티 디코딩 라운드), stripped_ctrl(제거된 제어문자 수),
             changed(원문 대비 변화 여부).

    collapse_newlines (ADR-0058 D6, 2026-08-13 좌표계 결정)
    ------------------------------------------------------
        True (기본, **기존 호출부 전원 동작 불변**)
            `\\s*\\n\\s*` → 공백 1개. ADR-0053 D3 원안 그대로다.
        False (D6 요청 처리기 전용)
            개행 접기 단계를 **건너뛴다**. 개행이 Polly 입력에 그대로 들어가고
            speech marks가 **원문 좌표**로 생성돼, 리더(components/book/highlighted-text.tsx —
            PUNCT_GAP만 적용하고 개행을 보존)와 오프셋이 정합한다.

            근거: v1·파일럿 128권은 generate_tts.py normalize_text(PUNCT_GAP만)로 만들어져
            marks가 원문 좌표다. 2026-08-13 실측에서 개행 보유 68면 1,314 mark 전량이
            리더 구현과 일치했다. 신규 코호트도 같은 좌표계로 맞춘다.

            개행은 Polly에서 공백처럼 취급되므로 **음성·억양에는 영향이 없다**.

        두 모드 모두 `_WS_RE`(연속 공백 접기)·`strip()`·`_PUNCT_GAP_RE`는 동일하게 적용한다.
        `_WS_RE`는 `[ \\t ]+`라 개행을 건드리지 않는다 — False 모드에서 " \\n"은 그대로 남는다.
    """
    raw = text or ""
    decoded, rounds = unescape_deep(raw)

    # 제어문자 제거(개행·탭은 공백 정규화 단계에서 처리하므로 여긴 보존).
    kept = [ch for ch in decoded
            if ch in ("\n", "\t") or unicodedata.category(ch)[0] != "C"]
    stripped_ctrl = len(decoded) - len(kept)
    cleaned = "".join(kept).translate(_ZERO_WIDTH)

    if collapse_newlines:
        cleaned = _NL_RE.sub(" ", cleaned)
    cleaned = _WS_RE.sub(" ", cleaned).strip()
    cleaned = _PUNCT_GAP_RE.sub(r"\1 ", cleaned)

    return cleaned, {
        "entity_rounds": rounds,
        "stripped_ctrl": stripped_ctrl,
        "changed": cleaned != raw,
    }


def cover_text(title: str | None, author: str | None) -> str:
    """표지 낭독 문구(ADR-0034 Amendment #1 형식). author 없으면 제목만.

    제목이 이미 종결 부호(? ! .)로 끝나면 마침표를 덧붙이지 않는다.
    (예: 'What is this I hear?' → 'What is this I hear?. Created by …' 이중 구두점 방지.
     ADR-0053 D4 파일럿 청취 지적 · 팀장 보정 지시 2026-08-11)
    """
    t = sanitize(title)[0]
    a = sanitize(author)[0]
    if not t:
        return ""
    stop = t if t[-1] in "?!." else f"{t}."
    return f"{stop} Created by {a}." if a else stop


# ─────────────────────────────────────────────────────────────────────────────
# 대상 선정 — 읽기 전용 조회
# ─────────────────────────────────────────────────────────────────────────────
def load_env() -> tuple[str, str]:
    """.env.local 우선, 없으면 OS 환경변수(기존 sync 스크립트 관행 계승)."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        print("[FAIL] python-dotenv 미설치 — pip install -r requirements.txt")
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
        print("[FAIL] supabase 미설치 — pip install -r requirements.txt")
        raise SystemExit(1)
    return create_client(*load_env())


def _page_all(client, table: str, cols: str, apply_filter=None) -> list[dict]:
    """PostgREST 기본 1,000행 상한을 넘기기 위한 range 페이지네이션."""
    out: list[dict] = []
    start, step = 0, 1000
    while True:
        q = client.table(table).select(cols)
        if apply_filter:
            q = apply_filter(q)
        rows = q.range(start, start + step - 1).execute().data or []
        out.extend(rows)
        if len(rows) < step:
            return out
        start += step


def select_targets(client) -> dict:
    """대상·제외를 한 번에 산출한다. DB 쓰기 0건.

    반환:
      {"targets": [ {slug, book_id, title, author, pages:[{page,page_index,text,chars,diag}], ...} ],
       "excluded": [ {slug, book_id, title, reason} ],
       "stats": {...}}
    """
    books = _page_all(
        client, "books", "id,source_id,title,author,is_active,has_audio",
        lambda q: q.eq("source_platform", SOURCE_PLATFORM),
    )
    active = {b["id"]: b for b in books if b.get("is_active")}

    text_rows = _page_all(client, "book_text", "book_id,page_index,text")
    by_book: dict[str, list[dict]] = {}
    for r in text_rows:
        if r["book_id"] in active:
            by_book.setdefault(r["book_id"], []).append(r)

    audio_book_ids = {r["book_id"] for r in _page_all(client, "book_audio", "book_id")}

    rotated = set(ROTATED_SLUGS)
    polluted = set(POLLUTED_SLUGS)

    targets: list[dict] = []
    excluded: list[dict] = []

    for book_id, book in sorted(active.items(), key=lambda kv: kv[1]["source_id"]):
        slug = book["source_id"]
        rows = by_book.get(book_id)

        if not rows:
            # no_text가 최우선 판정이라 "이미 오디오 보유"와 겹칠 수 있다(v1 html 배치).
            # 보고에서 구성을 밝힐 수 있게 부가 사유를 남긴다.
            excluded.append({"slug": slug, "book_id": book_id, "title": book.get("title"),
                             "reason": "no_text",
                             "also_has_audio": book_id in audio_book_ids})
            continue
        if slug in rotated:
            excluded.append({"slug": slug, "book_id": book_id, "title": book.get("title"),
                             "reason": "rotated"})
            continue
        if slug in polluted:
            excluded.append({"slug": slug, "book_id": book_id, "title": book.get("title"),
                             "reason": "polluted"})
            continue
        if book_id in audio_book_ids:
            excluded.append({"slug": slug, "book_id": book_id, "title": book.get("title"),
                             "reason": "has_audio"})
            continue

        rows.sort(key=lambda r: r["page_index"])
        pages, empty_pages = [], []
        entity_pages, ctrl_pages = [], []
        for r in rows:
            pi = int(r["page_index"])
            clean, diag = sanitize(r.get("text"))
            if diag["entity_rounds"]:
                entity_pages.append(pi + 1)
            if diag["stripped_ctrl"]:
                ctrl_pages.append(pi + 1)
            if not clean:
                empty_pages.append(pi + 1)
                continue
            pages.append({
                "page": pi + 1,             # 1-based 파일명 축 (ADR-0034 Amd#2)
                "page_index": pi,           # 0-based DB 축
                "text": clean,
                "chars": len(clean),
            })

        indices = [int(r["page_index"]) for r in rows]
        missing = sorted(set(range(min(indices), max(indices) + 1)) - set(indices))

        targets.append({
            "slug": slug,
            "book_id": book_id,
            "title": book.get("title"),
            "author": book.get("author"),
            "pages": pages,
            "page_rows": len(rows),
            "audio_pages": len(pages),
            "empty_pages": empty_pages,
            "entity_pages": entity_pages,
            "ctrl_pages": ctrl_pages,
            "page_index_min": min(indices),
            "page_index_max": max(indices),
            "page_index_missing": missing,
            "body_chars": sum(p["chars"] for p in pages),
            "cover_text": cover_text(book.get("title"), book.get("author")),
        })

    stats = {
        "book_dash_total": len(books),
        "book_dash_active": len(active),
        "with_book_text": len(by_book),
        "targets": len(targets),
        "excluded_total": len(excluded),
        "excluded_by_reason": {
            reason: sum(1 for e in excluded if e["reason"] == reason)
            for reason in EXCLUSION_REASONS
        },
        "no_text_also_has_audio": sum(
            1 for e in excluded if e["reason"] == "no_text" and e.get("also_has_audio")),
    }
    return {"targets": targets, "excluded": excluded, "stats": stats}


def _selftest() -> int:
    """정제 규칙 자체 점검. `python tts_targets.py --selftest`."""
    cases = [
        ("Tom &amp; Jerry", "Tom & Jerry"),
        ("Tom &amp;amp; Jerry", "Tom & Jerry"),
        ("&quot;Hi&quot; &#8212; she said", "\"Hi\" — she said"),
        ("a​b", "ab"),
        ("line1\nline2", "line1 line2"),
        ("  spaced   out  ", "spaced out"),
        ("Mom.“Say it”", "Mom. “Say it”"),
        (None, ""),
    ]
    bad = 0
    for raw, want in cases:
        got, _ = sanitize(raw)
        flag = "ok " if got == want else "FAIL"
        if got != want:
            bad += 1
        print(f"  [{flag}] {raw!r} -> {got!r}" + ("" if got == want else f"  (기대 {want!r})"))
    print(f"[{'PASS' if not bad else 'FAIL'}] 정제 자체점검 {len(cases) - bad}/{len(cases)}")

    # ── ADR-0058 D6 좌표계 모드 (collapse_newlines=False) ──────────────────────
    # 위 8케이스는 기본 모드 박제라 **변경하지 않는다**. 아래는 별도 추가 점검이다.
    print("\n[D6] collapse_newlines=False (개행 보존 모드 — ADR-0058 D6)")
    d6_cases = [
        # 개행이 접히지 않고 그대로 Polly 입력에 전달된다
        ("line1\nline2", "line1\nline2"),
        ("Hurry. Hurry! \nHelp me catch that cat!",
         "Hurry. Hurry! \nHelp me catch that cat!"),
        # 개행 주변 공백은 건드리지 않는다(_WS_RE는 [ \t ]만 접는다)
        ("a\n\nb", "a\n\nb"),
        # 연속 공백 접기·trim·PUNCT_GAP은 기본 모드와 동일하게 작동한다
        ("  spaced   out  ", "spaced out"),
        ("Mom.“Say it”", "Mom. “Say it”"),
        ("Tom &amp; Jerry", "Tom & Jerry"),
        (None, ""),
    ]
    d6_bad = 0
    for raw, want in d6_cases:
        got, _ = sanitize(raw, collapse_newlines=False)
        if got != want:
            d6_bad += 1
        print(f"  [{'ok ' if got == want else 'FAIL'}] {raw!r} -> {got!r}"
              + ("" if got == want else f"  (기대 {want!r})"))
    print(f"[{'PASS' if not d6_bad else 'FAIL'}] D6 모드 자체점검 "
          f"{len(d6_cases) - d6_bad}/{len(d6_cases)}")

    # ── 리더 좌표 정합 — D6 정제문 == 리더가 만드는 정규화문 ────────────────────
    # 리더(components/book/highlighted-text.tsx)는 원문.trim()에 PUNCT_GAP만 적용한다.
    # marks 오프셋이 그 문자열 기준이어야 강조가 정위치에 온다.
    print("\n[D6] 리더 좌표 정합 (D6 정제문 == 원문.strip() + PUNCT_GAP)")
    align_cases = [
        "Hurry. Hurry! \nHelp me catch that cat!",
        "“Makhulu, I can’t find my bucket,” says Oluhle. \nMakhulu helps her look.",
        "One line only.",
    ]
    align_bad = 0
    for raw in align_cases:
        polly, _ = sanitize(raw, collapse_newlines=False)
        reader = _PUNCT_GAP_RE.sub(r"\1 ", raw.strip())
        if polly != reader:
            align_bad += 1
        print(f"  [{'ok ' if polly == reader else 'FAIL'}] {raw!r}"
              + ("" if polly == reader else f"\n        polly={polly!r}\n        reader={reader!r}"))
    print(f"[{'PASS' if not align_bad else 'FAIL'}] 좌표 정합 "
          f"{len(align_cases) - align_bad}/{len(align_cases)}")

    total_bad = bad + d6_bad + align_bad
    print(f"\n[{'PASS' if not total_bad else 'FAIL'}] 전체 {total_bad}건 실패")
    return 0 if not total_bad else 1


if __name__ == "__main__":
    for _s in (sys.stdout, sys.stderr):
        if hasattr(_s, "reconfigure"):
            try:
                _s.reconfigure(encoding="utf-8")
            except Exception:
                pass
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    print(__doc__)
    print("직접 실행 대상이 아니다. run_tts_fullbatch.py에서 import해 쓴다.")
    print("정제 규칙 점검: python scripts/tts_pilot/tts_targets.py --selftest")
