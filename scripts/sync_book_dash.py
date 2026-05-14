#!/usr/bin/env python3
"""
sync_book_dash.py — Book Dash 1차 동기화 스크립트 (Phase 04)

데이터 출처:
  https://raw.githubusercontent.com/bookdash/bookdash-books/master/_data/meta.yml
  → ADR-0005 단일 출처 채택 (sitemap/Firebase 후보 배제)

규칙:
  - language='en'인 책만 적재 (ADR-0006 베타 언어 스코프)
  - 번역본(translations 하위) 스킵
  - source_id = meta.yml의 identifier UUID (없으면 슬러그)
  - content_url = https://bookdash.github.io/bookdash-books/{slug}/en/
  - cover_url   = https://bookdash.github.io/bookdash-books/{slug}/en/images/cover.jpg
  - license     = cc-by-4-0 고정
  - attribution_text = scripts/lib/attribution.py로 생성 (license-rules.md 4.2)

Hard Rule 보호:
  1. attribution_text 빌드 실패 시 해당 책 skip (NOT NULL 충돌 방지)
  2. 트리거가 1차 방어 — 비정상 라이선스는 어차피 DB가 거부
  6. SUPABASE_SECRET_KEY는 .env.local에서만 로드 (출력 금지)

사용:
    pip install -r requirements.txt --break-system-packages
    python scripts/sync_book_dash.py [--dry-run]

옵션:
    --dry-run    DB INSERT 없이 메타데이터 파싱·어트리뷰션 빌드만 수행
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

import requests
import yaml

# 로컬 lib 모듈 임포트 — scripts/를 sys.path에 추가
_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))
from lib.attribution import build_book_dash_attribution, AttributionError  # noqa: E402

# Windows 콘솔(cp949)에서 한글·이모지 깨짐 방지
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

try:
    from dotenv import load_dotenv
    from supabase import create_client, Client
except ImportError:
    print(
        "[FAIL] 의존성 누락. 다음을 먼저 실행하세요:\n"
        "       pip install -r requirements.txt --break-system-packages"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"

META_YAML_URL = (
    "https://raw.githubusercontent.com/bookdash/bookdash-books/master/_data/meta.yml"
)

GH_PAGES_BASE = "https://bookdash.github.io/bookdash-books"
ORG_BASE = "https://bookdash.org/books"

SOURCE_PLATFORM = "book_dash"
LICENSE_CODE = "cc-by-4-0"
CONTENT_TYPE = "html"
LANGUAGE = "en"

HTTP_TIMEOUT = 30


# ---------------------------------------------------------------------------
# 환경변수 로드
# ---------------------------------------------------------------------------
def load_env() -> tuple[str, str]:
    """
    환경변수 로드. 로컬은 .env.local에서, CI(GitHub Actions)는 OS 환경변수에서.
    .env.local이 있으면 거기서 우선 로드(기존 동작 유지), 없으면 OS env로 폴백.
    """
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    if not url or not secret:
        print(
            "[FAIL] 환경변수 누락 — 로컬은 .env.local, CI는 GitHub Secrets로 설정:\n"
            "       NEXT_PUBLIC_SUPABASE_URL\n"
            "       SUPABASE_SECRET_KEY"
        )
        sys.exit(1)
    return url, secret


# ---------------------------------------------------------------------------
# meta.yml fetch & parse
# ---------------------------------------------------------------------------
def fetch_meta_yaml() -> dict[str, Any]:
    print(f"[INFO] meta.yml 다운로드: {META_YAML_URL}")
    resp = requests.get(META_YAML_URL, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    data = yaml.safe_load(resp.text)
    if not isinstance(data, dict) or "titles" not in data:
        raise ValueError(
            "meta.yml 구조 이상: 'titles' 키가 없습니다 (ADR-0005 재검토 트리거 발동 가능)"
        )
    titles = data["titles"]
    if not isinstance(titles, dict):
        raise ValueError("meta.yml의 'titles'가 dict가 아닙니다.")
    print(f"[INFO] 파싱 완료: titles 키 {len(titles)}개")
    return data


# ---------------------------------------------------------------------------
# 단일 책 항목 → INSERT payload 변환
# ---------------------------------------------------------------------------
def build_payload(slug: str, entry: dict[str, Any]) -> Optional[dict[str, Any]]:
    """
    meta.yml의 titles[slug] 항목을 books 테이블 row로 변환.
    영어 아니면 None 반환 (호출자가 skip 카운터에 집계).
    어트리뷰션 빌드 실패도 None 반환 (예외는 호출자가 캐치).
    """
    # 언어 필터 (ADR-0006)
    lang = (entry.get("language") or "en").strip().lower()
    if lang != "en":
        return None

    title = entry.get("title")
    if not title or not isinstance(title, str):
        return None  # 호출자가 skipped_by_attribution로 집계

    creator = entry.get("creator")
    # source_id: identifier(UUID) > slug
    raw_id = entry.get("identifier")
    source_id = str(raw_id).strip() if raw_id else slug

    # 어트리뷰션 생성 — 실패 시 예외가 호출자로 전파됨
    attribution_text = build_book_dash_attribution(
        title=title,
        creator=creator,
        slug=slug,
    )

    return {
        "source_platform": SOURCE_PLATFORM,
        "source_id": source_id,
        "title": title.strip(),
        "cover_url": f"{GH_PAGES_BASE}/{slug}/en/images/cover.jpg",
        "content_url": f"{GH_PAGES_BASE}/{slug}/en/",
        "content_type": CONTENT_TYPE,
        "language": LANGUAGE,
        # level / age_min / age_max 은 Phase 5+ 에서 채움
        "license": LICENSE_CODE,
        "author": (creator or "").strip() or None,
        "illustrator": None,  # Book Dash는 creator 단일 필드 (ADR-0005, attribution.py)
        "original_url": f"{ORG_BASE}/{slug}/",
        "attribution_text": attribution_text,
        "is_active": True,
    }


# ---------------------------------------------------------------------------
# Supabase UPSERT (idempotent)
# ---------------------------------------------------------------------------
def upsert_book(client: Client, payload: dict[str, Any]) -> tuple[bool, str]:
    """
    books에 UPSERT. UNIQUE(source_platform, source_id) 기반 idempotent.
    반환: (성공 여부, 메시지)
    """
    try:
        client.table("books").upsert(
            payload, on_conflict="source_platform,source_id"
        ).execute()
        return True, "upsert OK"
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {str(exc)[:140]}"


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Book Dash 동기화 (Phase 04)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="DB 없이 파싱·어트리뷰션 빌드만 수행 (개발/검증용)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print(" Book Dash 동기화 (Phase 04)")
    print("=" * 60)
    print(f"  meta.yml      : {META_YAML_URL}")
    print(f"  HTML base     : {GH_PAGES_BASE}")
    print(f"  language scope: {LANGUAGE} only (ADR-0006)")
    print(f"  license       : {LICENSE_CODE}")
    print(f"  dry-run       : {args.dry_run}")
    print()

    # 1. meta.yml fetch
    try:
        data = fetch_meta_yaml()
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] meta.yml 가져오기 실패: {exc}")
        return 1

    # 2. (dry-run이 아닐 때만) Supabase 클라이언트
    client: Optional[Client] = None
    if not args.dry_run:
        url, secret = load_env()
        client = create_client(url, secret)
        print(f"[INFO] Supabase 연결: {url}")
        print()

    # 3. 순회
    titles: dict[str, Any] = data["titles"]
    stats = {
        "total": len(titles),
        "inserted_or_updated": 0,
        "skipped_by_language": 0,
        "skipped_by_attribution": 0,
        "errors": 0,
    }
    error_samples: list[str] = []

    start = time.time()
    for slug, entry in titles.items():
        if not isinstance(entry, dict):
            stats["errors"] += 1
            error_samples.append(f"  - {slug}: entry not a dict")
            continue

        try:
            payload = build_payload(slug, entry)
        except AttributionError as exc:
            stats["skipped_by_attribution"] += 1
            print(f"  ⊘ skip [attribution]: {slug} — {exc}")
            continue
        except Exception as exc:  # noqa: BLE001
            stats["errors"] += 1
            error_samples.append(f"  - {slug}: {type(exc).__name__}: {exc}")
            continue

        if payload is None:
            # 영어가 아니거나 title 누락
            lang = (entry.get("language") or "en").strip().lower()
            if lang != "en":
                stats["skipped_by_language"] += 1
            else:
                stats["skipped_by_attribution"] += 1
            continue

        if args.dry_run:
            stats["inserted_or_updated"] += 1
            print(f"  ✓ [dry-run] {slug} → source_id={payload['source_id']}")
            continue

        ok, msg = upsert_book(client, payload)
        if ok:
            stats["inserted_or_updated"] += 1
            print(f"  ✓ upserted: {slug} ({payload['title'][:50]})")
        else:
            stats["errors"] += 1
            error_samples.append(f"  - {slug}: {msg}")
            print(f"  ✗ ERROR: {slug} — {msg}")

    elapsed = time.time() - start

    # 4. 요약
    print()
    print("=" * 60)
    print(" 동기화 요약")
    print("=" * 60)
    print(f"  meta.yml titles 총합 : {stats['total']}")
    print(f"  inserted/updated     : {stats['inserted_or_updated']}")
    print(f"  skipped (language)   : {stats['skipped_by_language']}")
    print(f"  skipped (attribution): {stats['skipped_by_attribution']}")
    print(f"  errors               : {stats['errors']}")
    print(f"  소요 시간            : {elapsed:.1f}s")
    if error_samples:
        print()
        print("  [에러 샘플 최대 5건]")
        for line in error_samples[:5]:
            print(line)

    print()
    if args.dry_run:
        print("  ※ dry-run 모드 — DB에는 아무것도 쓰이지 않았습니다.")
    print("  다음 단계: python scripts/verify_book_dash_sync.py")

    return 0 if stats["errors"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
