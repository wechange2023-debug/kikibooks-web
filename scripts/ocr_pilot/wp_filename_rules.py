# -*- coding: utf-8 -*-
"""WP(bookdash.org) 본문 이미지 파일명 ↔ 페이지 번호 매핑 규칙 정본.

2026-07-10 39권 전수 게이트(`docs/recon/2026-07-10-39books-text-identity-gate.md`)에서
실측·검증된 규칙의 정본화다. 규칙은 두 방향을 제공한다:

  1) 정방향(파일명 → 페이지): `pdf_page_of(filename)` / `service_page_of(filename)`
     — 실제 매핑의 주 경로. 39권 전권 + 파일럿 7권(594면)에서 검증됨.
  2) 역방향(slug·페이지 → 파일명 후보): `candidate_patterns(slug, service_page)`
     — 파일명에 유도 불가능한 토큰(업로드 날짜 8자리, 언어 세그먼트, 임의 base명,
       WP 중복 접미사)이 포함되므로 **정확한 파일명이 아니라 glob 패턴 후보**를
       우선순위 순으로 반환한다. 실제 확정은 WP read-book 목록과의 대조로 한다.

공통 좌표계: 파일명에서 PDF 페이지 번호 N을 얻고, 서비스 페이지 M = N - 4.
(검증: 2026-07-09 wp-page-mapping-gate + 2026-07-10 39권 게이트)

네트워크 호출 없음 — 순수 문자열 변환만.
"""
from __future__ import annotations

import re

# 서비스 페이지 M = PDF N - 4 (front-matter: 표지·속표지·판권 = PDF 1~4)
FRONT_MATTER_PAGES = 4

_EXT = r"\.(?:jpe?g|png)$"

# WP 중복 업로드 접미사(-1, -2, -3 …): 1차 매칭 실패 시 제거 후 재시도.
# 실제 필요 slug: sima-and-siza (sima-and-siza_Page_05-3.jpg),
#                whose-button-is-this (…_Page_05-1.jpg)
_DEDUP = re.compile(r"-\d+(?=" + _EXT + r")", re.IGNORECASE)


# 규칙 테이블 — (이름, 정규식, n→PDF 변환). ★ 선언 순서 = 매칭 우선순위.
_RULES: list[tuple[str, re.Pattern, "callable"]] = [
    # 1. `_Page_{NN}` → PDF = N
    #    실제 필요 slug: it-wasnt-me (it-wasnt-me_english_20160724_Page_05.jpg)
    ("_Page_N", re.compile(r"_Page_(\d+)" + _EXT, re.IGNORECASE), lambda n: n),
    # 2. `_{날짜8}-{n}` (lion형) → PDF = n
    #    실제 필요 slug: mogaus-gift (mogaus-gift_english_20170331-5.jpg)
    ("_date-n", re.compile(r"_(\d{8})-(\d+)" + _EXT), lambda n: n),
    # 3. `_{날짜8}_{n}` → PDF = n
    #    실제 필요 slug: sizwes-smile (sizwes-smile_english_e-book_20180930_5.jpg)
    ("_date_n", re.compile(r"_(\d{8})_(\d+)" + _EXT), lambda n: n),
    # 4. `_{날짜8}{n}` 연결형(구분자 없음) → PDF = n + 1
    #    실제 필요 slug: a-beautiful-day (a-beautiful-day_interior_spreads_201601044.jpg)
    ("_date{n}+1", re.compile(r"_(\d{8})(\d{1,2})" + _EXT), lambda n: n + 1),
    # 5. 소문자 `_page{n}` → PDF = n + 1
    #    실제 필요 slug: a-tiny-seed (a-tiny-seed_en_20200616_page4.jpg)
    ("_page(n)+1", re.compile(r"_page(\d+)" + _EXT), lambda n: n + 1),
    # 6. `interior-spreads{n}` 무날짜형 → PDF = n + 1
    #    실제 필요 slug: miss-helens-magical-world (miss-helens-magical-world_interior-spreads4.jpg)
    ("spreads{n}+1", re.compile(r"interior-?spre?a?ds(?:-text)?(\d{1,2})" + _EXT), lambda n: n + 1),
    # 7. `Untitled-1{n}`형(slug 무관 base명) → PDF = n + 1
    #    실제 필요 slug: a-fish-and-a-gift (Untitled-14.jpg)
    ("Untitled-1{n}+1", re.compile(r"^Untitled-1(\d{1,2})" + _EXT), lambda n: n + 1),
]


def pdf_page_of(filename: str) -> tuple[int | None, str]:
    """파일명 → (PDF 페이지 번호, 규칙명). 매핑 불가 시 (None, 사유).

    'cover' 포함 파일명은 표지로 본다. 1차로 원명, 2차로 WP 중복 접미사(-k)를
    제거한 이름에 규칙 테이블을 순서대로 적용한다(2차 매칭 시 규칙명에 '(dedup제거)').
    """
    if "cover" in filename.lower():
        return None, "cover"
    for cand, tag in ((filename, ""), (_DEDUP.sub("", filename), "(dedup제거)")):
        for name, rx, to_pdf in _RULES:
            m = rx.search(cand)
            if m:
                return to_pdf(int(m.group(m.lastindex))), name + tag
    return None, "unmapped"


def service_page_of(filename: str) -> tuple[int | None, str]:
    """파일명 → (서비스 페이지 M = PDF - 4, 규칙명). front-matter(M<1)는 (None, 사유)."""
    pdf, rule = pdf_page_of(filename)
    if pdf is None:
        return None, rule
    svc = pdf - FRONT_MATTER_PAGES
    if svc < 1:
        return None, f"front-matter(PDF {pdf}, {rule})"
    return svc, rule


def candidate_patterns(slug: str, service_page: int) -> list[str]:
    """(slug, 서비스 페이지) → 파일명 glob 패턴 후보(우선순위 순).

    날짜·언어 세그먼트·중복 접미사는 유도 불가능하므로 `*`로 둔다.
    Untitled형은 slug와 무관한 base명이라 slug 없는 패턴으로 제공한다.
    """
    pdf = service_page + FRONT_MATTER_PAGES
    n_minus1 = pdf - 1  # n+1 계열 규칙의 파일 내 숫자
    return [
        f"{slug}*_Page_{pdf:02d}*.jpg",          # _Page_N (+dedup 접미사 허용)
        f"{slug}*_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-{pdf}.jpg",   # _date-n
        f"{slug}*_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_{pdf}.jpg",   # _date_n
        f"{slug}*_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]{n_minus1}.jpg",  # _date{n} 연결형
        f"{slug}*_page{n_minus1}.jpg",           # 소문자 _page{n}
        f"{slug}*interior*spr*ds*{n_minus1}.jpg",  # spreads 무날짜형
        f"Untitled-1{n_minus1}.jpg",             # Untitled형(slug 무관)
    ]
