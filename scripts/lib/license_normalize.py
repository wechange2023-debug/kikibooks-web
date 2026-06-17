#!/usr/bin/env python3
"""
license_normalize.py — 자연어 라이선스 문자열 → 표준 slug 정규화 (fail-safe 차단)

목적:
  African Storybook(asp-raw-db) 등 SPDX 코드가 아닌 자연어 `lic` 문자열
  (예: "Creative Commons: Attribution 4.0")을 우리 표준 slug로 정규화한다.
  ★ fail-safe: NC/ND 라이선스·미매칭·빈 값은 모두 None(차단)으로 반환한다.
     매핑에 확신이 없는 표기는 통과시키지 않는다(Hard Rule 3 NC/ND 금지 정합).

관련:
  docs/adr/0025-asb-content-ingestion.md D3 (라이선스 게이트 확장)
                                         Amendment #2 (공용 모듈화 — D3/D4 공유)
  verify_licenses.py(D3, 감시 cron)와 sync_asb.py(D4, 적재)가 이 함수를 공유한다.
"""

from __future__ import annotations

from typing import Optional

# NC/ND 토큰 — 하나라도 포함되면 차단. attribution 매칭보다 먼저 검사한다.
_NCND_TOKENS = (
    "non commercial",
    "noncommercial",
    "non-commercial",
    "no deriv",
    "noderiv",
    "no-deriv",
    " nc",
    "-nc",
    " nd",
    "-nd",
)


def normalize_asb_license(lic_text: Optional[str]) -> Optional[str]:
    """
    ASb 자연어 lic 문자열을 표준 slug로 정규화한다.

    반환:
      'cc-by-4-0' / 'cc-by-3-0' / 'cc-by-sa-4-0' — 적격
      None — NC/ND 포함, 미매칭, 빈 값(모두 fail-safe 차단)

    규칙 순서 (★NC/ND 검사를 attribution 매칭보다 먼저):
      1. None/빈문자 → None
      2. NC/ND 토큰 포함 → None (차단)
      3. 'attribution' 포함 시: sa/share → cc-by-sa-4-0 / '4.0' → cc-by-4-0 / '3.0' → cc-by-3-0
      4. 그 외 → None (미매칭 fail-safe 차단)
    """
    if not lic_text:
        return None
    low = lic_text.lower()

    # NC/ND 우선 차단 (attribution+nc 혼합 표기도 여기서 걸러짐)
    if any(token in low for token in _NCND_TOKENS):
        return None

    if "attribution" in low:
        if "sa" in low or "share" in low:
            return "cc-by-sa-4-0"
        if "4.0" in low:
            return "cc-by-4-0"
        if "3.0" in low:
            return "cc-by-3-0"
        return None  # attribution이나 버전 미상 → 차단

    return None  # 미매칭 fail-safe 차단
