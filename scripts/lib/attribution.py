"""
attribution.py — license-rules.md 4.2절 표준 어트리뷰션 텍스트 빌더

CC BY 4.0 / CC BY-SA 4.0 / CC0 / public-domain 4가지 라이선스에 대한
표준 포맷 문자열을 생성한다. 결과는 books.attribution_text 컬럼에 그대로
INSERT되며, Hard Rule 1(NOT NULL)을 충족하기 위해 빈 문자열을 반환하지
않는다 — 필수 정보가 빠지면 예외를 던져 호출자가 해당 책을 skip하도록 한다.

표준 포맷 (CC BY 4.0):
    "{title}" by {author} (illustrated by {illustrator}), {platform_label}.
    Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
    Original: {original_url}

illustrator가 없으면 "(illustrated by ...)" 절을 통째로 생략한다.
"""

from __future__ import annotations

from typing import Optional


# ---------------------------------------------------------------------------
# 라이선스 → 인간 가독 라벨 + URL
# ---------------------------------------------------------------------------
LICENSE_LABELS: dict[str, tuple[str, Optional[str]]] = {
    # license_code: (display_label, license_url)
    "cc-by-4-0": (
        "CC BY 4.0",
        "https://creativecommons.org/licenses/by/4.0/",
    ),
    "cc-by-sa-4-0": (
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0/",
    ),
    "cc0": (
        "CC0 1.0 Universal (Public Domain Dedication)",
        "https://creativecommons.org/publicdomain/zero/1.0/",
    ),
    "public-domain": (
        "Public Domain",
        None,  # PD는 URL 불필요
    ),
}


# ---------------------------------------------------------------------------
# 소스 플랫폼 → 어트리뷰션 표기용 이름
# ADR-0004의 source_platform 화이트리스트와 1:1 매핑
# ---------------------------------------------------------------------------
PLATFORM_LABELS: dict[str, str] = {
    "book_dash": "Book Dash",
    "gdl": "Global Digital Library",
    "librivox": "LibriVox",
    "pg": "Project Gutenberg",
    "jybooks": "JYBooks",
    "wjjr": "Woongjin Junior",
    "magic_light": "Magic Light Pictures",
}


class AttributionError(ValueError):
    """필수 필드 누락으로 어트리뷰션 생성 실패."""


def build_attribution(
    *,
    title: str,
    author: Optional[str],
    illustrator: Optional[str],
    source_platform: str,
    license_code: str,
    original_url: str,
) -> str:
    """
    license-rules.md 4.2절 포맷으로 attribution_text를 빌드한다.

    Raises:
        AttributionError: title 또는 original_url이 비어 있을 때,
                          또는 알 수 없는 license_code/source_platform일 때.
                          호출자는 해당 책을 skip하고 카운터에 기록한다.
    """
    if not title or not title.strip():
        raise AttributionError("title이 비어 있어 어트리뷰션 생성 불가")
    if not original_url or not original_url.strip():
        raise AttributionError("original_url이 비어 있어 어트리뷰션 생성 불가")

    if license_code not in LICENSE_LABELS:
        raise AttributionError(
            f"알 수 없는 license_code: '{license_code}' (4종 화이트리스트 외)"
        )
    if source_platform not in PLATFORM_LABELS:
        raise AttributionError(
            f"알 수 없는 source_platform: '{source_platform}' (ADR-0004 화이트리스트 외)"
        )

    license_label, license_url = LICENSE_LABELS[license_code]
    platform_label = PLATFORM_LABELS[source_platform]

    # 1행: "title" by author (illustrated by illustrator), Platform.
    author_part = (author or "Unknown creators").strip()
    parts = [f'"{title.strip()}" by {author_part}']

    if illustrator and illustrator.strip() and illustrator.strip() != author_part:
        parts.append(f"(illustrated by {illustrator.strip()})")

    parts.append(f", {platform_label}.")
    line1 = " ".join(parts[:-1]) + parts[-1]  # 마지막은 공백 없이 ", Platform."

    # 2행: 라이선스 + URL (PD는 URL 생략)
    if license_url:
        line2 = f"Licensed under {license_label} ({license_url})."
    else:
        line2 = f"{license_label} (no license URL required)."

    # 3행: 원본 URL
    line3 = f"Original: {original_url.strip()}"

    return "\n".join([line1, line2, line3])


# ---------------------------------------------------------------------------
# Book Dash 전용 헬퍼 — meta.yml의 'creator' 단일 필드를 처리
# ---------------------------------------------------------------------------
def build_book_dash_attribution(
    *,
    title: str,
    creator: Optional[str],
    slug: str,
) -> str:
    """
    Book Dash meta.yml의 'creator' 필드는 쉼표로 구분된 자유 텍스트로,
    작가와 그림작가가 함께 들어 있어 신뢰성 있게 분리할 수 없다 (예:
    "Raeesah Vawda, Lindy Pelzl, Elana Bregin"). 따라서 모두 author 슬롯에
    넣고 illustrator는 비워둔다. 이는 license-rules.md 4.3절 변환 규칙
    (Book Dash는 'creator' API 필드 사용)을 따른다.
    """
    return build_attribution(
        title=title,
        author=creator,
        illustrator=None,
        source_platform="book_dash",
        license_code="cc-by-4-0",
        original_url=f"https://bookdash.org/books/{slug}/",
    )


# ---------------------------------------------------------------------------
# GDL 전용 헬퍼 — publisher → author 매핑, 결측 시 정직 폴백 (C안)
# ---------------------------------------------------------------------------
# 2026-05-14 실측: GDL 영어 책 1,313권 중 856권(65.2%)이 publisher 빈 문자열.
# 다른 creator-like 필드(contentsource/mainCategory/collectionTag)도 거의 비어
# 있음. ADR-0007 §7 amendment(C안 정직 폴백)에 따라, publisher가 없는 경우
# author 슬롯에 명시적 폴백 텍스트를 사용한다. CC BY 4.0 §3(a)(1)(A)(i)에
# 따르면 라이선서가 attribution 정보를 제공하지 않은 경우 라이선시는 그들이
# 제공한 만큼 표기하면 되므로, 폴백 텍스트는 메타데이터 한계를 사용자에게
# 투명하게 알리는 역할도 한다.
GDL_FALLBACK_AUTHOR = (
    "Global Digital Library (creator information not provided by source)"
)


def build_gdl_attribution(
    *,
    title: str,
    publisher: Optional[str],
    post_link: str,
    license_code: str,
) -> tuple[str, bool]:
    """
    Returns:
        (attribution_text, used_fallback)
        - attribution_text: books.attribution_text 컬럼에 그대로 INSERT
        - used_fallback: True면 publisher 결측으로 GDL_FALLBACK_AUTHOR 사용됨

    sync_gdl.py는 used_fallback이 True인 건수를 `inserted_with_fallback_author`
    카운터에 집계한다.

    title/post_link/license_code 결측 시에만 AttributionError를 던진다.
    """
    used_fallback = False
    author = (publisher or "").strip()
    if not author:
        author = GDL_FALLBACK_AUTHOR
        used_fallback = True

    text = build_attribution(
        title=title,
        author=author,
        illustrator=None,
        source_platform="gdl",
        license_code=license_code,
        original_url=post_link,
    )
    return text, used_fallback


# ---------------------------------------------------------------------------
# CLI 자가 검증 (개발용)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    sample_bd = build_book_dash_attribution(
        title="A Beautiful Day",
        creator="Raeesah Vawda, Lindy Pelzl, Elana Bregin",
        slug="a-beautiful-day",
    )
    print("[Book Dash 샘플]")
    print(sample_bd)
    print()
    sample_gdl, _ = build_gdl_attribution(
        title="I Love My Mom",
        publisher="StoryWeaver",
        post_link="https://content.digitallibrary.io/en/book/i-love-my-mom-3/",
        license_code="cc-by-4-0",
    )
    print("[GDL 샘플 — publisher 있음]")
    print(sample_gdl)
    print()
    sample_gdl_fb, used_fb = build_gdl_attribution(
        title="Animal Hide-and-Seek",
        publisher=None,
        post_link="https://content.digitallibrary.io/en/book/animal-hide-and-seek/",
        license_code="cc-by-4-0",
    )
    print(f"[GDL 샘플 — publisher 없음, 정직 폴백 (used_fallback={used_fb})]")
    print(sample_gdl_fb)
    print()
    print(f"BD: {len(sample_bd)}자 / GDL: {len(sample_gdl)}자 / "
          f"GDL-fallback: {len(sample_gdl_fb)}자  "
          f"(50자 기준 통과 여부: "
          f"{'OK' if min(len(sample_bd), len(sample_gdl), len(sample_gdl_fb)) >= 50 else 'FAIL'})")
