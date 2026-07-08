#!/usr/bin/env python3
"""
copy_bookdash_images.py — Book Dash html 코호트 원본 이미지 → Supabase Storage 'book-images' 복사
                          (ADR-0036 스키마 구현). 스크립트 작성 단계 — 실행/업로드는 별도 승인.

★ Storage 전용 쓰기. DB write 0건(뷰어가 source_id로 키 규칙 조립 — ADR-0036 D5, 장부 없음).
★ 프로덕션 sync_*.py 무접촉. GH Pages 원본은 공개 HTTP GET(다운로드), 자격 불요.
★ Supabase 업로드에만 service_role/secret 키 필요(환경변수에서만 로드, 코드·파일·로그 금지).
★ AWS/Polly 자격 불필요(이미지 복사이므로). upload_audio.py 패턴 계승(book_key·헤더·멱등성).

경로 규칙(ADR-0036 D2, 원문 그대로):
  book-images/{book_key}/NN.jpg      본문(NN = 원본과 동일 2자리 zero-pad·1-based·연속. 예 01..12/13)
  book-images/{book_key}/cover.jpg   표지
  {book_key} = book_dash-{source_id}   (source_id = Book Dash 메타 고유 UUID. 접두사 밑줄 = source_platform 값과 통일)
    ※ 주의(ADR-0036 D2): 기존 커버 버킷은 'bookdash-'(밑줄 없음)로 어긋남. 본 스크립트/버킷은 'book_dash-' 유지.

원본(ADR-0036 §1):
  https://bookdash.github.io/bookdash-books/{slug}/en/images/NN.jpg  및  .../images/cover.jpg

Content-Type / 헤더(ADR-0036 D4, 명시 지정 — 확장자 자동추측 금지):
  이미지 → image/jpeg
  캐시   → Cache-Control: public, max-age=31536000, immutable

복사 범위(ADR-0036 D3·Amd#1): 본문 NN.jpg 전부 + cover.jpg.
  ★ 대상 = **정예 39권**(원본 이미지 실존). 원본 이미지 결손 15권(IMAGELESS_BOOKS)은
    GH Pages 2019 스냅샷에 본문 이미지가 없어(HTML 죽은 링크) **기본 제외**한다(ADR-0036 Amd#1).

입력(54권 목록 = source_id UUID + slug), 워커 재구성분 재사용:
  - scratchpad/tts_recon_49.csv (49권: id·source_id·slug)  ← RECON_CSV
  - 완료 5권(CSV 밖, step3_manifest.csv에서 복구한 UUID)  ← DONE_BOOKS
  합계 54권 → **결손 15권 제외 = 정예 39권**(기본 코호트).

멱등성: 이미 존재하는 키는 기본 **건너뜀(skip)** + 로그. --overwrite 시 upsert.
실패: 원본 HTML 조회 실패 → 해당 책 스킵(실패목록 기록). 개별 이미지 404/네트워크 →
      파일 스킵(실패목록 기록). **전체 중단 없음**(요건 7).
완결성 게이트: 실행 후 버킷 실측이 정예 39권의 전 이미지(기대 508)를 다 채웠는지 검증하고,
      **하나라도 미달이면 실패(exit 1)로 종료**한다(팀장 지시 2026-07-08).

원본 스로틀 주의: GH Pages/Fastly는 연속 요청에 레이트리밋(404)을 걸고 그 404를 엣지에
      네거티브 캐싱한다. 다운로드 간 DL_DELAY_S 간격 + 지수 백오프 재시도로 완화하나, 대량
      재실행 시 여전히 스로틀될 수 있음(쿨다운 후 재실행 또는 소량 --only 권장).

사용:
  python scripts/copy_bookdash_images.py --dry-run --limit 2   # 로직 검증(자격 불요)
  python scripts/copy_bookdash_images.py --dry-run             # 정예 39권 계획 출력
  python scripts/copy_bookdash_images.py                       # 정예 39권 업로드 + 완결성 게이트
  python scripts/copy_bookdash_images.py --only <slug>         # 특정 책만
  python scripts/copy_bookdash_images.py --overwrite           # 존재 키 덮어쓰기
  python scripts/copy_bookdash_images.py --include-imageless   # 결손 15권까지 포함(재확보 재시도용)
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from pathlib import Path

import requests

# 파일럿 스크립트 로직 재사용(장면=이미지 열거). 동일 폴더 아님 → 경로 추가.
REPO = Path(__file__).resolve().parent.parent
PILOT_DIR = REPO / "scripts" / "tts_pilot"
sys.path.insert(0, str(PILOT_DIR))
from extract_text import fetch_html, extract_scenes, GH_PAGES_BASE  # noqa: E402

# Windows 콘솔(cp949) 한글·커브따옴표 깨짐 방지(기존 스크립트 패턴)
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

RECON_CSV = REPO / "scratchpad" / "tts_recon_49.csv"

BUCKET = "book-images"
SOURCE_PLATFORM = "book_dash"  # 이 코호트(html 정찰)는 전부 book_dash. 접두사=이 값(밑줄, ADR-0036 D2).

CT_JPEG = "image/jpeg"
CACHE = "public, max-age=31536000, immutable"
COVER_NAME = "cover.jpg"
HTTP_TIMEOUT = 30

# 스로틀 회피(GH Pages/Fastly 레이트리밋 대응). 다운로드 간 소량 지연 + 지수 백오프 재시도.
# 근거: 무지연 연속 ~700요청이 간헐 404를 유발(원본 결손 아님 — 재요청 시 200). tts_recon_49.py:99 선례.
DL_DELAY_S = 0.2        # 다운로드 1건마다 최소 간격
DL_RETRIES = 5          # 404/네트워크 실패 시 재시도 횟수(스로틀 클리어용)
DL_BACKOFF_BASE_S = 1.5  # 백오프 기준(1.5, 3, 6, 12s … 캡)
DL_BACKOFF_CAP_S = 20.0

# 완료 5권 — tts_recon_49.csv 밖. source_id UUID는 step3_manifest.csv(cover 마이그레이션)에서 복구.
DONE_BOOKS = [
    ("a-beautiful-day", "9c9e94e0-fe46-11e5-86aa-5e5517507c66"),
    ("a-dancers-tale", "9c9e8586-fe46-11e5-86aa-5e5517507c66"),
    ("a-fish-and-a-gift", "9c9e6754-fe46-11e5-86aa-5e5517507c66"),
    ("a-house-for-mouse", "9c9e72e4-fe46-11e5-86aa-5e5517507c66"),
    ("a-tiny-seed", "9c9e7a6e-fe46-11e5-86aa-5e5517507c66"),
]

# 원본 이미지 결손 15권 — GH Pages 2019 스냅샷에 본문 `images/NN.jpg`가 실제로 없음(HTML은
# 죽은 링크를 참조). 2026-07-08 cache-bust + 대조군 통과 실측으로 확정(전 페이지·대체경로 404).
# → 자체 뷰어 렌더 불가이므로 정예 코호트에서 제외(ADR-0036 Amendment #1). 팀장 확정: 39권 정예.
#   · 표지만 존재 10권(cover.jpg 200): 본문 결손.  · 이미지 전무 5권(무텍스트책, cover도 404).
# 기본은 제외. 향후 다른 소스(WP/CloudFront) 확보 재시도 시 --include-imageless 로 포함 가능.
IMAGELESS_BOOKS = {
    "hippo-wants-to-dance", "little-sock", "mrs-penguins-palace", "shongololos-shoes",
    "springloaded", "the-best-thing-ever", "the-elephant-in-the-room", "what-is-it",
    "when-i-grow-up", "who-is-our-friend",              # 표지만 존재(본문 결손) 10권
    "hugs-in-the-city", "i-can-dress-myself", "it-wasnt-me", "katiitis-song",
    "the-lion-who-wouldnt-try",                          # 이미지 전무(무텍스트책) 5권
}


def load_cohort(only: set[str] | None, limit: int | None,
                include_imageless: bool = False) -> list[dict]:
    """전체 54권(49 CSV + 5 done) 중 **정예 39권**(결손 15권 제외) → [{slug, source_id, book_key}].

    기본은 IMAGELESS_BOOKS(원본 이미지 결손 15권)를 제외해 39권만 반환(팀장 확정 정예).
    include_imageless=True면 54권 전체(결손 책 원본 재확보 재시도용).
    """
    rows: list[tuple[str, str]] = []
    with RECON_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(((r.get("slug") or "").strip(), (r.get("source_id") or "").strip()))
    rows += DONE_BOOKS
    seen: set[str] = set()
    cohort: list[dict] = []
    for slug, sid in rows:
        if not slug or slug in seen:
            continue
        if not include_imageless and slug in IMAGELESS_BOOKS:
            continue  # 원본 이미지 결손 — 정예 제외(ADR-0036 Amd#1)
        if only and slug not in only:
            continue
        seen.add(slug)
        cohort.append({"slug": slug, "source_id": sid,
                       "book_key": f"{SOURCE_PLATFORM}-{sid}"})
    if limit is not None:
        cohort = cohort[:limit]
    return cohort


def list_source_images(slug: str) -> tuple[list[dict], str | None]:
    """책 1권의 (원본 URL → 파일명) 목록. 실패 시 ([], 사유).

    본문 = GH Pages HTML 장면 이미지(extract_scenes, images/NN.jpg 원문 순서·중복제거).
    표지 = 관례상 images/cover.jpg 1장(ADR-0036 D3, 54/54 실측). 개별 404는 업로드 단계에서 처리.
    """
    try:
        html = fetch_html(slug)
    except Exception as exc:  # noqa: BLE001
        return [], f"HTML 조회 실패({type(exc).__name__}: {exc})"
    scenes = extract_scenes(slug, html)
    items: list[dict] = []
    seen: set[str] = set()
    for s in scenes:
        src = s["image_url"]
        name = src.rsplit("/", 1)[-1]  # NN.jpg
        if name in seen:
            continue
        seen.add(name)
        items.append({"src": src, "name": name})
    # 표지(본문 목록엔 없음 — GH 리딩 HTML 미노출. 관례 조립).
    cover_src = f"{GH_PAGES_BASE}/{slug}/en/images/{COVER_NAME}"
    items.append({"src": cover_src, "name": COVER_NAME})
    return items, None


def build_plan(book: dict) -> tuple[list[dict], str | None]:
    """[{src, key, ct}] 업로드 항목. 열거 실패 시 ([], 사유)."""
    items, err = list_source_images(book["slug"])
    if err:
        return [], err
    key_root = book["book_key"]
    plan = [{"src": it["src"], "key": f"{key_root}/{it['name']}", "ct": CT_JPEG}
            for it in items]
    return plan, None


def existing_keys(client, book_key: str) -> set[str]:
    try:
        items = client.storage.from_(BUCKET).list(book_key, {"limit": 1000})
    except Exception:  # noqa: BLE001
        return set()
    return {f"{book_key}/{it['name']}" for it in (items or []) if it.get("name")}


def init_supabase():
    """OS 환경변수에서만 자격 로드. .env 파일 생성/수정/열람 안 함(Hard Rule 6)."""
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "[STOP] Storage 자격증명 미설정 — 업로드 불가.\n"
            "  PowerShell 창에서 실행 직전 아래를 등록하세요(자식 프로세스 상속, .env 만들지 마세요):\n"
            '    $env:SUPABASE_URL = "https://<프로젝트>.supabase.co"\n'
            '    $env:SUPABASE_SECRET_KEY = "sb_secret_..."   # service_role/secret 키\n'
            "  (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 이름도 인식)\n"
            "  키 값은 절대 이 스크립트나 파일에 넣지 마세요."
        )
        sys.exit(2)
    try:
        from supabase import create_client
    except ImportError:
        print("[FAIL] supabase 미설치: pip install supabase")
        sys.exit(1)
    return create_client(url, key), url.rstrip("/")


def fetch_bytes(url: str) -> tuple[bytes | None, str | None]:
    """원본 GET(스로틀 대응 재시도). 404도 재시도 대상 — GH Pages 스로틀이 404를 반환하기 때문.

    매 시도 전 소량 지연(DL_DELAY_S)으로 원본을 예우하고, 실패 시 지수 백오프 후 재시도.
    최종 실패 시에만 (None, 마지막 사유) 반환(전체 중단 없음 — 호출부가 파일 스킵).
    """
    last = "unknown"
    for attempt in range(DL_RETRIES):
        time.sleep(DL_DELAY_S)  # 예의상 최소 간격(스로틀 재유발 방지)
        try:
            r = requests.get(url, timeout=HTTP_TIMEOUT)
            if r.status_code == 200:
                return r.content, None
            last = f"HTTP {r.status_code}"
        except Exception as exc:  # noqa: BLE001
            last = f"{type(exc).__name__}: {exc}"
        if attempt < DL_RETRIES - 1:
            time.sleep(min(DL_BACKOFF_BASE_S * (2 ** attempt), DL_BACKOFF_CAP_S))
    return None, f"{last} ({DL_RETRIES}회 재시도 후)"


def main() -> int:
    ap = argparse.ArgumentParser(description="book-images 복사 (ADR-0036)")
    ap.add_argument("--dry-run", action="store_true",
                    help="업로드 없이 원본→대상 키 목록만 출력(무비용, 자격 불요)")
    ap.add_argument("--limit", type=int, default=None, help="앞 N권만 처리(드라이런용)")
    ap.add_argument("--only", default=None, help="쉼표구분 slug만 처리(기본 정예 39권)")
    ap.add_argument("--overwrite", action="store_true",
                    help="같은 키 존재 시 덮어쓰기(기본 skip)")
    ap.add_argument("--include-imageless", action="store_true",
                    help="원본 이미지 결손 15권까지 포함(기본 제외 — ADR-0036 Amd#1). 재확보 재시도용")
    args = ap.parse_args()

    only = {s.strip() for s in args.only.split(",")} if args.only else None
    cohort = load_cohort(only, args.limit, args.include_imageless)
    if only:
        missing = only - {b["slug"] for b in cohort}
        if missing:
            excl = missing & IMAGELESS_BOOKS
            hint = f" (이미지 결손 제외분: {sorted(excl)} — --include-imageless 필요)" if excl else ""
            print(f"[FAIL] --only 대상 코호트 밖/오타: {sorted(missing)}{hint}")
            return 1
    if not cohort:
        print("[FAIL] 대상 0권 — 입력/필터 확인.")
        return 1

    scope = "정예 39권" if not args.include_imageless else "전체 54권(결손 포함)"
    print(f"[INFO] 대상 {len(cohort)}권 [{scope}] (버킷 {BUCKET}, 키 = {SOURCE_PLATFORM}-<source_id>/NN.jpg)")
    print(f"[MAP] 매핑 출처: {RECON_CSV.name}(49) + 완료 5권. 이미지 결손 {len(IMAGELESS_BOOKS)}권 제외"
          f"{'(이번엔 포함)' if args.include_imageless else ''}. source_id=메타 UUID. ADR-0036 D2·Amd#1.")
    print("=" * 96)

    # 이상 점검(빈 source_id / book_key 중복)
    anomalies: list[str] = []
    seen_keys: dict[str, str] = {}
    for b in cohort:
        if not b["source_id"]:
            anomalies.append(f"{b['slug']}: source_id 빈값")
        if b["book_key"] in seen_keys:
            anomalies.append(f"{b['slug']}: book_key 중복({b['book_key']} ↔ {seen_keys[b['book_key']]})")
        seen_keys[b["book_key"]] = b["slug"]

    plans: dict[str, list[dict]] = {}
    enum_fail: list[tuple[str, str]] = []
    total_items = 0
    for b in cohort:
        plan, err = build_plan(b)
        if err:
            enum_fail.append((b["slug"], err))
            print(f"[{b['slug']:34}] ✗ 열거실패 — {err} (책 스킵)")
            continue
        plans[b["slug"]] = plan
        total_items += len(plan)
        n_body = sum(1 for it in plan if not it["key"].endswith(f"/{COVER_NAME}"))
        print(f"[{b['slug']:34}] key={b['book_key']}  본문{n_body} + 표지1 = {len(plan)}개")
        if args.dry_run:
            for it in plan:
                print(f"      {it['key']:56} <- {it['src']}")

    print("=" * 96)
    print(f"[합계] 열거 성공 {len(plans)}권 / 열거 실패 {len(enum_fail)}권 / 업로드 항목 {total_items}개")
    if anomalies:
        print(f"[STOP] 키 이상 {len(anomalies)}건 — 진행 중단:")
        for a in anomalies:
            print(f"  - {a}")
        return 3

    if args.dry_run:
        print("[DRY-RUN] 원본→대상 키 확인 전용 — 업로드/다운로드 없이 종료.")
        print(f"[자격] 실제 업로드 시 SUPABASE_URL + SUPABASE_SECRET_KEY(service_role) 필요. GH Pages 다운로드는 자격 불요.")
        if enum_fail:
            print(f"[주의] 열거 실패 {len(enum_fail)}권(원본 조회): {[s for s,_ in enum_fail]}")
        return 0

    # ---- 실제 업로드(다운로드 → 업로드) ----
    client, sb_url = init_supabase()
    up_ok, skip = 0, 0
    file_fail: list[tuple[str, str]] = []
    for b in cohort:
        plan = plans.get(b["slug"])
        if plan is None:
            continue  # 열거 실패 책(이미 enum_fail 기록) — 스킵, 중단 없음
        present = set() if args.overwrite else existing_keys(client, b["book_key"])
        for it in plan:
            if it["key"] in present:
                skip += 1
                print(f"  skip(존재) {it['key']}")
                continue
            data, derr = fetch_bytes(it["src"])
            if derr:
                file_fail.append((it["key"], f"원본 {derr}"))
                print(f"  XX 원본실패 {it['key']} <- {it['src']} ({derr})")
                continue  # 개별 파일 스킵, 전체 중단 없음(요건 7)
            try:
                client.storage.from_(BUCKET).upload(
                    it["key"], data,
                    {"content-type": it["ct"], "cache-control": CACHE,
                     "upsert": "true" if args.overwrite else "false"},
                )
                up_ok += 1
            except Exception as e:  # noqa: BLE001
                file_fail.append((it["key"], f"업로드 {type(e).__name__}: {e}"))
                print(f"  XX 업로드실패 {it['key']}: {type(e).__name__}: {e}")

    print("=" * 96)
    print(f"[업로드] 성공 {up_ok} / 스킵(존재) {skip} / 파일실패 {len(file_fail)} / 열거실패책 {len(enum_fail)}")
    for k, e in file_fail:
        print(f"  FAIL {k}: {e}")
    for s, e in enum_fail:
        print(f"  BOOK-SKIP {s}: {e}")

    # ---- 완결성 게이트: 버킷 실측이 기대 개수(정예 코호트 전 이미지)를 다 채웠는지 검증 ----
    # 하나라도 미달이면 '성공'이 아니라 '실패'로 종료(경고 출력). (팀장 지시 2026-07-08)
    # 기대치는 **정예 39권**(원본 이미지 존재) 기준 — 결손 15권은 코호트에서 이미 제외됨(ADR-0036 Amd#1).
    # 전권(39) 완비 시 기대 508(38권×13 + whose-button-is-this 14). 결손 15권은 게이트 대상 아님.
    print("=" * 96)
    print(f"[검증] 버킷 실측 vs 기대(정예 {len(cohort)}권 전 이미지) 대조 …")
    grand_exp, grand_act = 0, 0
    short: list[tuple[str, int, int]] = []
    for b in cohort:
        plan = plans.get(b["slug"])
        if plan is None:  # 열거 실패 책(원본 HTML 조회 실패) — 미완성으로 집계
            short.append((b["slug"], 0, -1))
            continue
        exp = len(plan)
        act = len(existing_keys(client, b["book_key"]))
        grand_exp += exp
        grand_act += act
        if act < exp:
            short.append((b["slug"], act, exp))
    print(f"[검증] 대상 {len(cohort)}권 · 기대 이미지 {grand_exp} / 실제 버킷 {grand_act}")
    if short or file_fail or enum_fail:
        print(f"[FAIL] 미완성 — 아래 {len(short)}권이 기대치 미달. 스로틀 쿨다운 후 재실행하세요"
              f"(멱등성으로 완비분은 skip):")
        for slug, act, exp in short:
            exps = "열거실패" if exp < 0 else str(exp)
            print(f"  - {slug}: {act}/{exps}")
        print("[FAIL] 전권 완비 아님 → 실패 종료(exit 1).")
        return 1
    print(f"[OK] 전권 완비 — {grand_act}/{grand_exp} 이미지 모두 업로드됨.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
