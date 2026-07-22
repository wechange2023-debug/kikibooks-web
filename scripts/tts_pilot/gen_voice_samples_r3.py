#!/usr/bin/env python3
"""gen_voice_samples_r3.py — 성우 샘플 라운드 3(en-US '생동감' 후보) 생성.

배경: 팀장 요구 = en-US / 밝고 상냥한 젊은 여성 / 동화 구연처럼 생동감.
      r1·r2 샘플 전부 '밋밋함' 반려.

★ 로컬 산출물만 만든다: out/voice_samples_r3/ 만 생성. 기존 파일 무수정.
★ Storage 업로드·DB 쓰기 없음. AWS 자격증명은 boto3 기본 체인만 사용(출력·기록 금지).

동작:
  1) 태그 지원 프로브 — neural 엔진에서 prosody rate/volume/pitch, emphasis, break를
     각각 최소 호출로 시험해 지원 여부를 실측한다(미지원 태그는 최종 SSML에서 제외).
  2) 지원 태그만으로 '생동감' 연출 SSML을 만들어 후보 보이스별 mp3 1개씩 생성.
     연출 = 문장 간 <break 400ms> + 감탄문 rate 상향 + 감탄문 볼륨 강조.
  3) out/voice_samples_r3/_r3_report.json 에 파라미터·결과 기록.

사용: python scripts/tts_pilot/gen_voice_samples_r3.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

PILOT_DIR = Path(__file__).resolve().parent
OUT_DIR = PILOT_DIR / "out"
R3_DIR = OUT_DIR / "voice_samples_r3"

ENGINE = "neural"
LANG = "en-US"

# 샘플 텍스트 출처(비교 공정성 위해 전 샘플 동일 텍스트)
SRC_SLUG = "ann-nem-oh-nee-finds-adventure"
SRC_PAGE = 8

BASE_RATE = 85      # 기본 말하기 속도 %
EXCLAIM_RATE = 92   # 감탄문 상향(+7%p)
SENT_BREAK_MS = 400

# (파일명 stem, VoiceId, 비고)
CANDIDATES = [
    ("Salli_lively", "Salli", "en-US neural, 생동감 연출"),
    ("Joanna_lively", "Joanna", "en-US neural, 생동감 연출"),
    ("Kimberly_lively", "Kimberly", "en-US neural, 생동감 연출"),
    ("Ivy_child", "Ivy", "en-US neural, 어린이 성우 참고용(연출 동일)"),
]

_XML_ESC = {"&": "&amp;", "<": "&lt;", ">": "&gt;"}
# 문장 경계: .!? + 닫는 따옴표(커브 포함)까지 한 덩어리
_SENT_RE = re.compile(r'[^.!?]*[.!?]+[”’"\']*\s*', re.S)


def xml_escape(text: str) -> str:
    return "".join(_XML_ESC.get(c, c) for c in text)


def load_sample_text() -> str:
    src = OUT_DIR / f"{SRC_SLUG}.json"
    scenes = json.loads(src.read_text(encoding="utf-8"))
    for s in scenes:
        if s["page"] == SRC_PAGE:
            # 줄바꿈은 문장 구분자로만 쓰이므로 공백 1칸으로 평탄화
            return " ".join(s["text"].split())
    raise RuntimeError(f"{SRC_SLUG} p{SRC_PAGE} 없음")


def split_sentences(text: str) -> list[str]:
    out = [m.group(0).strip() for m in _SENT_RE.finditer(text)]
    out = [s for s in out if s]
    tail = text[sum(len(m.group(0)) for m in _SENT_RE.finditer(text)):].strip()
    if tail:
        out.append(tail)
    return out


def probe_tags(polly) -> dict[str, bool]:
    """neural 엔진에서 각 SSML 태그가 통과하는지 최소 호출로 실측."""
    probes = {
        "prosody_rate":   f'<speak><prosody rate="{BASE_RATE}%">Hello there.</prosody></speak>',
        "prosody_volume": '<speak><prosody volume="loud">Hello there.</prosody></speak>',
        "prosody_pitch":  '<speak><prosody pitch="+8%">Hello there.</prosody></speak>',
        "emphasis":       '<speak><emphasis level="strong">Hello there.</emphasis></speak>',
        "break":          '<speak>Hello.<break time="400ms"/>There.</speak>',
    }
    support: dict[str, bool] = {}
    for name, ssml in probes.items():
        try:
            r = polly.synthesize_speech(
                Text=ssml, TextType="ssml", OutputFormat="mp3",
                VoiceId="Salli", Engine=ENGINE, LanguageCode=LANG,
            )
            r["AudioStream"].read()
            support[name] = True
            print(f"  [probe] {name:<15} OK")
        except Exception as exc:  # noqa: BLE001
            support[name] = False
            print(f"  [probe] {name:<15} UNSUPPORTED — {type(exc).__name__}: {exc}")
    return support


def build_ssml(sentences: list[str], support: dict[str, bool]) -> str:
    parts = ["<speak>"]
    for i, sent in enumerate(sentences):
        excl = "!" in sent
        body = xml_escape(sent)
        if support.get("emphasis") and excl:
            body = f'<emphasis level="strong">{body}</emphasis>'
        attrs = []
        if support.get("prosody_rate"):
            attrs.append(f'rate="{EXCLAIM_RATE if excl else BASE_RATE}%"')
        if support.get("prosody_volume") and excl:
            attrs.append('volume="loud"')
        if support.get("prosody_pitch") and excl:
            attrs.append('pitch="+8%"')
        if attrs:
            body = f'<prosody {" ".join(attrs)}>{body}</prosody>'
        parts.append(body)
        if support.get("break") and i < len(sentences) - 1:
            parts.append(f'<break time="{SENT_BREAK_MS}ms"/>')
    parts.append("</speak>")
    return "".join(parts)


def main() -> int:
    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치")
        return 1

    text = load_sample_text()
    sentences = split_sentences(text)
    print(f"[INFO] 샘플 텍스트 출처 = {SRC_SLUG} p{SRC_PAGE} / {len(text)}자 / {len(sentences)}문장")
    for s in sentences:
        print(f"   - {'[!]' if '!' in s else '[ ]'} {s}")

    polly = boto3.client("polly")
    R3_DIR.mkdir(parents=True, exist_ok=True)

    print("[INFO] SSML 태그 지원 프로브(neural):")
    support = probe_tags(polly)

    ssml = build_ssml(sentences, support)
    (R3_DIR / "_r3_ssml_payload.xml").write_text(ssml, encoding="utf-8")
    print(f"[INFO] SSML {len(ssml)}자 → _r3_ssml_payload.xml")

    results = []
    for stem, voice, note in CANDIDATES:
        dest = R3_DIR / f"{stem}.mp3"
        try:
            r = polly.synthesize_speech(
                Text=ssml, TextType="ssml", OutputFormat="mp3",
                VoiceId=voice, Engine=ENGINE, LanguageCode=LANG,
            )
            data = r["AudioStream"].read()
            dest.write_bytes(data)
            print(f"  [OK] {dest.name} voice={voice} {len(data)}B")
            results.append({"file": dest.name, "voice": voice, "engine": ENGINE,
                            "bytes": len(data), "note": note, "ok": True})
        except Exception as exc:  # noqa: BLE001
            print(f"  [FAIL] {dest.name} voice={voice} — {type(exc).__name__}: {exc}")
            results.append({"file": dest.name, "voice": voice, "engine": ENGINE,
                            "error": f"{type(exc).__name__}: {exc}", "ok": False})

    report = {
        "round": 3,
        "goal": "en-US / bright young female / lively storytelling",
        "engine": ENGINE,
        "language": LANG,
        "long_form": "excluded — engine not supported in configured region",
        "sample_source": {"slug": SRC_SLUG, "page": SRC_PAGE,
                          "text": text, "sentences": len(sentences)},
        "direction": {"base_rate_pct": BASE_RATE, "exclaim_rate_pct": EXCLAIM_RATE,
                      "sentence_break_ms": SENT_BREAK_MS,
                      "exclaim_volume": "loud" if support.get("prosody_volume") else None},
        "ssml_tag_support": support,
        "samples": results,
    }
    (R3_DIR / "_r3_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("=" * 64)
    ok = sum(1 for r in results if r["ok"])
    print(f"[DONE] {ok}/{len(results)} 생성 → {R3_DIR}")
    return 0 if ok == len(results) else 3


if __name__ == "__main__":
    sys.exit(main())
