"""
level_estimator.py — 책 난이도 임시 분류 (provisional classification)

★ 본 모듈은 정확한 난이도 추정이 아니라 '시드값 생성기'다. ADR-0007 §4.3 참조.

GDL의 응답 `level` 필드는 대부분 비어 있다(2026-05-14 실측). 그러나 phase-09(랜딩
추천)과 phase-10(홈 '오늘의 추천 5권') 알고리즘은 books.level / age_min / age_max
컬럼이 non-null이어야 동작한다. 본 모듈은 description 단어 수 휴리스틱으로 임시
값을 부여하여 추천 알고리즘이 일단 작동하도록 한다.

향후 정확도 보정 경로:
  1. 큐레이터(profiles.role='curator')가 books.level을 직접 UPDATE
  2. reading_sessions 데이터 누적 후 자녀별 완독률 기반 역추정 (Phase 9+)

한계:
  - 단어 수 = 문장 길이 ≠ 인지 난이도
  - 추상 어휘·문법 복잡도·문화 배경 미반영
"""

from __future__ import annotations

from typing import Optional


# (level, age_min, age_max) — 키키북스 design-system.md 1.8절 레벨 1~5와 동기
LEVEL_TABLE: dict[int, tuple[int, int]] = {
    1: (3, 4),
    2: (4, 5),
    3: (5, 6),
    4: (6, 7),
    5: (7, 7),
}

DEFAULT_LEVEL = 2  # 정보 없음 → 가장 흔한 베타 타깃(만 4~5세)
DEFAULT_AGE_MIN, DEFAULT_AGE_MAX = LEVEL_TABLE[DEFAULT_LEVEL]


def estimate_from_text(text: Optional[str]) -> tuple[int, int, int]:
    """
    description(또는 다른 본문 텍스트)에서 단어 수로 레벨을 추정한다.
    반환: (level, age_min, age_max). 모두 books 스키마 CHECK 제약(level BETWEEN 1 AND 5)을 만족.

    임계값(임시):
      ≤30 단어 → level 1
      ≤60 단어 → level 2
      ≤120 단어 → level 3
      ≤200 단어 → level 4
      그 이상  → level 5
    """
    if not text or not text.strip():
        return DEFAULT_LEVEL, DEFAULT_AGE_MIN, DEFAULT_AGE_MAX

    word_count = len(text.strip().split())

    if word_count <= 30:
        level = 1
    elif word_count <= 60:
        level = 2
    elif word_count <= 120:
        level = 3
    elif word_count <= 200:
        level = 4
    else:
        level = 5

    age_min, age_max = LEVEL_TABLE[level]
    return level, age_min, age_max


def estimate_from_gdl_response(
    description: Optional[str],
    level_field: Optional[list],
) -> tuple[int, int, int]:
    """
    GDL 응답에서 level/age를 결정한다.
      1. level 배열이 채워져 있으면 그것을 우선 사용
      2. 비어 있으면 description 단어 수 휴리스틱

    GDL level 명명은 다양하다 (예: "Level 1", "Beginner Reader", "Read aloud").
    숫자가 추출되면 사용, 아니면 description으로 폴백.
    """
    if level_field and isinstance(level_field, list) and len(level_field) > 0:
        first = level_field[0]
        # GDL term object는 dict로 옴 — name 필드 시도
        if isinstance(first, dict):
            name = (first.get("name") or "").lower()
            for digit in "12345":
                if digit in name:
                    lvl = int(digit)
                    a_min, a_max = LEVEL_TABLE[lvl]
                    return lvl, a_min, a_max
    return estimate_from_text(description)


# ---------------------------------------------------------------------------
# 개발용 자가 검증
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    samples = [
        ("", "기본값"),
        ("Tiny words.", "초단문"),
        ("The cat sat on the mat. It was a sunny day. " * 4, "중간"),
        ("Lorem ipsum dolor sit amet, " * 80, "긴 책"),
    ]
    for text, label in samples:
        lvl, a_min, a_max = estimate_from_text(text)
        wc = len(text.split())
        print(f"  [{label}] 단어 {wc} → level={lvl} age={a_min}~{a_max}")
