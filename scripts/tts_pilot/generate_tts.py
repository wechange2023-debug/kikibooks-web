#!/usr/bin/env python3
"""
generate_tts.py — Book Dash v1 파일럿 Polly 음성 생성 (TTS 파일럿 2단계, ADR-0023 §2.4 실증)

★ 파일럿 전용 격리 스크립트. DB/스키마/Supabase를 절대 건드리지 않는다.
   프로덕션 sync_*.py 무수정. 로컬 산출물(out/audio/*, out/{slug}.tts.json)만 만든다.

★ AWS 자격증명은 환경변수(AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_DEFAULT_REGION)에서만
   읽는다. 키를 코드·로그·파일에 절대 출력·기록하지 않는다. boto3 기본 자격증명 체인 사용.

입력 : scripts/tts_pilot/out/{slug}.json  (1단계 extract_text.py 산출물)
동작 : 장면마다 Polly synthesize_speech 2회
        (a) OutputFormat='mp3'  → out/audio/{slug}_p{N}.mp3
        (b) OutputFormat='json', SpeechMarkTypes=['word'] → out/audio/{slug}_p{N}.marks.json
        빈 텍스트 장면(page 4·12 등)은 음성 생성 스킵(audio 없음으로 표기).
출력 : out/{slug}.tts.json  (장면별 mp3/marks 경로·단어수·오디오 길이 프록시 집계)

배치 사전생성(실시간 아님) — ADR-0023 §2.4 정합.

사용:
    python scripts/tts_pilot/generate_tts.py --slug a-beautiful-day
    python scripts/tts_pilot/generate_tts.py --slug a-beautiful-day --voice Ivy
    python scripts/tts_pilot/generate_tts.py --slug a-beautiful-day --rate 85

--rate N (기본 100): N% 말하기 속도. 100이면 기존과 동일(평문 호출, 파일명 무접미사).
    100이 아니면 SSML <prosody rate="N%">로 감싸 TextType='ssml' 호출하고,
    산출물은 _rN 접미사(예: a-beautiful-day_p1_r85.mp3)로 저장해 100% 파일을 보존한다.
    speech marks의 start/end는 SSML 입력 기준 바이트 오프셋으로 반환되므로,
    원문 텍스트 기준 오프셋으로 보정해 저장한다(100% 파일과 포맷 동일).
--natural: 문장부호 기반 <break> 삽입(문장 끝 400ms·줄바꿈 500ms·쉼표 200ms)으로
    동화책 끊어읽기 낭독을 만든다. rate와 독립 사용 가능(지정 시 항상 SSML 호출).
--voice V: 강제 보이스. 지정 시 파일명에 보이스 접미사가 붙는다
    (예: a-beautiful-day_p1_Joanna_r78.mp3, 매니페스트 a-beautiful-day_Joanna_r78.tts.json).
--pages 1,2: 지정 페이지만 생성(보이스 비교 샘플 등 과금 최소화용). 기본 전체.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Windows 콘솔(cp949) 커브따옴표·이모지 깨짐 방지
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

PILOT_DIR = Path(__file__).resolve().parent
OUT_DIR = PILOT_DIR / "out"
AUDIO_DIR = OUT_DIR / "audio"

# 아동 en-US 후보(우선순위). Neural 엔진 사용 가능성은 describe_voices로 확인 후 선택.
CHILD_VOICE_CANDIDATES = ["Ivy", "Justin", "Kevin"]
ENGINE = "neural"
LANGUAGE_CODE = "en-US"

# 문장부호(. ! ?) 뒤에 공백 없이 따옴표/대문자가 바로 오면 공백 1칸 삽입.
# 소수점(3.5)·줄임표(...)는 건드리지 않도록 다음 문자를 따옴표 또는 대문자로 한정.
_PUNCT_GAP_RE = re.compile(r'([.!?])(?=[“”‘’"\'A-Z])')


def normalize_text(text: str) -> str:
    """1단계에서 관찰된 'Mom.“Say' 류만 최소 교정. 그 외 원문(커브따옴표 포함) 보존."""
    return _PUNCT_GAP_RE.sub(r"\1 ", text)


_XML_ESC = {"&": "&amp;", "<": "&lt;", ">": "&gt;"}


def xml_escape_char(ch: str) -> str:
    return _XML_ESC.get(ch, ch)


# 자연 낭독(--natural) break 삽입 지점: 문장 끝(따옴표 닫힘 포함)·쉼표
_BREAK_SENT_RE = re.compile(r'[.!?]+[”’"\']*')
_BREAK_COMMA_RE = re.compile(r',[”’"\']*')


def compute_breaks(text: str) -> dict[int, int]:
    """break를 삽입할 문자 인덱스(해당 위치 문자 '앞'에 삽입) → 지속시간(ms) 맵."""
    breaks: dict[int, int] = {}
    for m in _BREAK_SENT_RE.finditer(text):
        breaks[m.end()] = 400
    for m in _BREAK_COMMA_RE.finditer(text):
        breaks.setdefault(m.end(), 200)
    for i, ch in enumerate(text):
        if ch == "\n":
            breaks[i + 1] = max(breaks.get(i + 1, 0), 500)
    return breaks


def ssml_payload(text: str, rate: int, natural: bool = False) -> tuple[str, dict[int, int]]:
    """SSML 래핑 payload + (SSML 바이트 오프셋 → 원문 바이트 오프셋) 맵 반환.

    Polly speech marks의 start/end는 입력 문자열(UTF-8 바이트) 기준이므로,
    prosody·break 태그와 XML 이스케이프로 밀린 오프셋을 이 맵으로 원문 기준 복원.
    natural=True면 문장부호 위치에 <break> 태그를 끼워 끊어읽기를 만든다.
    """
    breaks = compute_breaks(text) if natural else {}
    head = f'<speak><prosody rate="{rate}%">'
    parts: list[str] = [head]
    ssml_map: dict[int, int] = {}
    sb = len(head.encode("utf-8"))  # SSML 바이트 커서
    ob = 0                          # 원문 바이트 커서
    for i, ch in enumerate(text):
        if i in breaks:
            # 단어 end 오프셋이 break 태그 직전에 올 수 있으므로 태그 앞 위치도 매핑
            ssml_map.setdefault(sb, ob)
            tag = f'<break time="{breaks[i]}ms"/>'
            parts.append(tag)
            sb += len(tag.encode("utf-8"))
        ssml_map[sb] = ob
        esc = xml_escape_char(ch)
        parts.append(esc)
        sb += len(esc.encode("utf-8"))
        ob += len(ch.encode("utf-8"))
    ssml_map[sb] = ob  # 텍스트 끝 경계
    parts.append("</prosody></speak>")
    return "".join(parts), ssml_map


def make_mark_adjuster(ssml_map: dict[int, int]):
    """SSML 오프셋 마크 → 원문 텍스트 바이트 오프셋 마크로 보정하는 함수 생성."""
    def adjust(mark: dict) -> dict | None:
        if str(mark.get("value", "")).startswith("<"):
            return None  # Polly가 <break/> 태그 자체를 word 마크로 반환 → 가짜 단어 폐기
        s = ssml_map.get(mark["start"])
        e = ssml_map.get(mark["end"])
        if s is None or e is None:
            return None  # prosody/break 태그 등 원문 밖 마크는 폐기
        return {**mark, "start": s, "end": e}
    return adjust


def pick_voice(polly, requested: str | None) -> str:
    """describe_voices(Neural, en-US)로 후보 중 실제 사용 가능한 voice 선택.

    --voice 지정 시 그 voice가 Neural 지원이면 사용, 아니면 후보 순차 폴백.
    """
    resp = polly.describe_voices(Engine=ENGINE, LanguageCode=LANGUAGE_CODE)
    neural_ids = {v["Id"] for v in resp.get("Voices", [])}
    order = ([requested] if requested else []) + CHILD_VOICE_CANDIDATES
    for vid in order:
        if vid and vid in neural_ids:
            return vid
    raise RuntimeError(
        f"Neural en-US 후보 음성 사용 불가. 요청={requested} 후보={CHILD_VOICE_CANDIDATES} "
        f"/ 사용가능(en-US neural)={sorted(neural_ids)}"
    )


def synth_mp3(polly, payload: str, text_type: str, voice: str, dest: Path) -> int:
    resp = polly.synthesize_speech(
        Text=payload, TextType=text_type, OutputFormat="mp3", VoiceId=voice,
        Engine=ENGINE, LanguageCode=LANGUAGE_CODE,
    )
    data = resp["AudioStream"].read()
    dest.write_bytes(data)
    return len(data)


def synth_word_marks(polly, payload: str, text_type: str, voice: str, dest: Path,
                     adjust=None) -> list[dict]:
    """word speech marks 생성 후 line-delimited JSON으로 저장.

    adjust가 있으면(SSML 경로) 각 마크의 start/end를 원문 오프셋으로 보정해 저장.
    없으면(평문 100%) Polly 원본 그대로 저장 — 기존 동작과 동일.
    """
    resp = polly.synthesize_speech(
        Text=payload, TextType=text_type, OutputFormat="json", VoiceId=voice,
        Engine=ENGINE, LanguageCode=LANGUAGE_CODE, SpeechMarkTypes=["word"],
    )
    raw = resp["AudioStream"].read().decode("utf-8")
    if adjust is None:
        dest.write_text(raw, encoding="utf-8")  # 원본(line-delimited JSON) 그대로 보존
    marks: list[dict] = []
    for line in raw.splitlines():
        line = line.strip()
        if line:
            marks.append(json.loads(line))
    if adjust is not None:
        marks = [m for m in (adjust(mk) for mk in marks) if m is not None]
        dest.write_text(
            "".join(json.dumps(m, ensure_ascii=False) + "\n" for m in marks),
            encoding="utf-8",
        )
    return marks


def main() -> int:
    ap = argparse.ArgumentParser(description="Book Dash v1 파일럿 Polly TTS 생성")
    ap.add_argument("--slug", default="a-beautiful-day")
    ap.add_argument("--voice", default=None, help="강제 voice(기본: Ivy→Justin→Kevin 폴백)")
    ap.add_argument("--rate", type=int, default=100,
                    help="말하기 속도 %% (기본 100 = SSML 미사용·기존 동일. 20~200)")
    ap.add_argument("--natural", action="store_true",
                    help="문장부호 기반 <break> 삽입(동화책 끊어읽기)")
    ap.add_argument("--pages", default=None,
                    help="쉼표 구분 페이지 제한(예: 1,2). 기본 전체")
    args = ap.parse_args()
    slug = args.slug
    rate = args.rate
    if not 20 <= rate <= 200:
        print(f"[FAIL] --rate 범위 오류: {rate} (허용 20~200)")
        return 1

    src = OUT_DIR / f"{slug}.json"
    if not src.exists():
        print(f"[FAIL] 입력 없음: {src} (1단계 extract_text.py 먼저 실행)")
        return 1
    scenes = json.loads(src.read_text(encoding="utf-8"))
    if args.pages:
        try:
            wanted = {int(p) for p in args.pages.split(",")}
        except ValueError:
            print(f"[FAIL] --pages 형식 오류: {args.pages} (예: 1,2)")
            return 1
        scenes = [s for s in scenes if s["page"] in wanted]
        if not scenes:
            print(f"[FAIL] --pages {args.pages} 에 해당하는 장면 없음")
            return 1

    try:
        import boto3
    except ImportError:
        print("[FAIL] boto3 미설치: pip install boto3 --break-system-packages")
        return 1

    # 자격증명은 boto3 기본 체인(환경변수)에서 로드. 값은 출력하지 않는다.
    try:
        polly = boto3.client("polly")
        voice = pick_voice(polly, args.voice)
    except Exception as exc:  # noqa: BLE001
        # 자격증명·권한 오류 등 — 전문 보고 후 중단(임의 우회 금지).
        print(f"[FAIL] Polly 초기화/voice 선택 실패 — {type(exc).__name__}: {exc}")
        return 2

    # 파일명 접미사: --voice 명시 시 보이스명, rate≠100 시 _rN (기존 기본 산출물 무손상)
    suffix = (f"_{voice}" if args.voice else "") + (f"_r{rate}" if rate != 100 else "")
    print(f"[INFO] engine={ENGINE} voice={voice} rate={rate}% natural={args.natural} "
          f"suffix='{suffix}'")
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    manifest: list[dict] = []
    total_chars = 0
    for s in scenes:
        page = s["page"]
        text_raw = s.get("text", "")
        text = normalize_text(text_raw)
        entry: dict = {
            "page": page,
            "image_url": s.get("image_url"),
            "text": text,
            "audio": None,
            "marks": None,
            "word_count": 0,
            "audio_len_ms_proxy": None,  # 마지막 word mark time(ms) 기반 프록시(정확 길이 아님)
        }
        if not text.strip():
            print(f"  [page {page:>2}] (빈 텍스트 — 음성 스킵)")
            manifest.append(entry)
            continue

        total_chars += len(text)
        mp3_path = AUDIO_DIR / f"{slug}_p{page}{suffix}.mp3"
        marks_path = AUDIO_DIR / f"{slug}_p{page}{suffix}.marks.json"
        if rate == 100 and not args.natural:
            payload, text_type, adjust = text, "text", None
        else:
            payload, ssml_map = ssml_payload(text, rate, args.natural)
            text_type = "ssml"
            adjust = make_mark_adjuster(ssml_map)
        try:
            n_bytes = synth_mp3(polly, payload, text_type, voice, mp3_path)
            marks = synth_word_marks(polly, payload, text_type, voice, marks_path, adjust)
        except Exception as exc:  # noqa: BLE001
            print(f"[FAIL] Polly 호출 실패 (page {page}) — {type(exc).__name__}: {exc}")
            return 3

        last_ms = marks[-1]["time"] if marks else None
        entry.update(
            audio=str(mp3_path.relative_to(PILOT_DIR)),
            marks=str(marks_path.relative_to(PILOT_DIR)),
            word_count=len(marks),
            audio_len_ms_proxy=last_ms,
            mp3_bytes=n_bytes,
        )
        manifest.append(entry)
        print(f"  [page {page:>2}] mp3={n_bytes}B words={len(marks)} lastMark={last_ms}ms")

    man_path = OUT_DIR / f"{slug}{suffix}.tts.json"
    man_path.write_text(
        json.dumps(
            {"slug": slug, "engine": ENGINE, "voice": voice, "rate": rate,
             "natural": args.natural, "total_chars": total_chars, "scenes": manifest},
            ensure_ascii=False, indent=2,
        ),
        encoding="utf-8",
    )
    print("=" * 64)
    print(f"[OK] voice={voice} rate={rate}% 총 문자 수={total_chars} → {man_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
