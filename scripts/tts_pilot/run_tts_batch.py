"""12권 배치 TTS 생성 러너 (ADR-0052 Phase E · Unit 3).

역할
----
build_tts_input.py가 만든 out/{slug}.json(확정텍스트)을 입력으로,
각 slug에 대해 generate_tts.py를 **Ruth / rate 78 / natural**(ADR-0052 D6)로 호출한다.
generate_tts.py는 무수정 재사용(subprocess). 본 러너는 순회·집계·리포트만 담당한다.

    입력  : scripts/tts_pilot/out/{slug}.json          (build_tts_input.py 산출)
    호출  : generate_tts.py --slug {slug} --voice Ruth --rate 78 --natural
    산출  : out/audio/{slug}_p{N}_Ruth_r78.mp3 / .marks.json  (generate_tts.py가 생성)
            out/{slug}_Ruth_r78.tts.json                       (권별 매니페스트)
            out/_tts_batch_report.json                         (배치 요약, 본 러너)

대표 3권을 항상 **먼저** 처리한다(ADR-0052 D2). 한 권이 실패해도 중단하지 않고
사유를 리포트에 남긴 뒤 다음 권으로 계속한다(지시서 §4).

주의: 실제 Amazon Polly 호출(과금)을 수반한다. 자격증명은 환경변수 상속 전제
(generate_tts.py가 boto3 기본 체인에서 로드). 키 값은 출력하지 않는다.

사용
----
    python scripts/tts_pilot/run_tts_batch.py --rep-only     # 대표 3권만 (1차)
    python scripts/tts_pilot/run_tts_batch.py                # 전체 12권 (대표 우선)
    python scripts/tts_pilot/run_tts_batch.py --slugs baby-babble,a-day-out
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except AttributeError:
        pass

PILOT_DIR = Path(__file__).resolve().parent
OUT_DIR = PILOT_DIR / "out"
GEN_SCRIPT = PILOT_DIR / "generate_tts.py"

VOICE = "Ruth"
RATE = 78
SUFFIX = f"_{VOICE}_r{RATE}"  # generate_tts.py 파일명 접미사(--voice + rate≠100)

# lib/admin/review/pilot-cohort.ts와 동일 집합. build_tts_input.py와 동기화.
PILOT_COHORT = [
    "a-day-out", "a-trip-to-the-tap", "a-very-busy-day", "aaaaahhh-mmawe",
    "alexs-super-medicine", "amahle-wants-to-help", "ann-nem-oh-nee-finds-adventure",
    "auntie-bois-gift", "baby-babble", "baby-talk", "babys-first-family-photo",
    "banzis-busy-bees",
]
REP_SLUGS = ["a-trip-to-the-tap", "amahle-wants-to-help", "baby-babble"]


def rep_first(slugs: list[str]) -> list[str]:
    """대표 3권을 앞으로, 나머지는 뒤로(각 그룹 내 원순서 유지)."""
    rep = [s for s in slugs if s in REP_SLUGS]
    rest = [s for s in slugs if s not in REP_SLUGS]
    return rep + rest


def summarize_manifest(slug: str) -> dict:
    """생성된 매니페스트에서 권별 산출 수치 집계."""
    man_path = OUT_DIR / f"{slug}{SUFFIX}.tts.json"
    if not man_path.exists():
        return {"manifest": None, "note": "매니페스트 없음"}
    man = json.loads(man_path.read_text(encoding="utf-8"))
    scenes = man.get("scenes", [])
    audio_pages = [s["page"] for s in scenes if s.get("audio")]
    marks_pages = [s["page"] for s in scenes if s.get("marks")]
    skipped_pages = [s["page"] for s in scenes if not (s.get("text") or "").strip()]
    # 청취 샘플: 오디오 있는 첫 면 + 중간 면(있으면).
    samples = []
    if audio_pages:
        samples.append(audio_pages[0])
        mid = audio_pages[len(audio_pages) // 2]
        if mid != audio_pages[0]:
            samples.append(mid)
    sample_paths = [str((OUT_DIR / "audio" / f"{slug}_p{p}{SUFFIX}.mp3")) for p in samples]
    return {
        "manifest": str(man_path.relative_to(PILOT_DIR)),
        "pages_total": len(scenes),
        "audio_pages": len(audio_pages),
        "marks_pages": len(marks_pages),
        "skipped_pages": skipped_pages,
        "total_chars": man.get("total_chars"),
        "sample_mp3": sample_paths,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="12권 배치 TTS 생성 (ADR-0052)")
    ap.add_argument("--rep-only", action="store_true", help="대표 3권만 생성(1차)")
    ap.add_argument("--slugs", default=None, help="쉼표구분 slug 화이트리스트")
    args = ap.parse_args()

    if args.slugs:
        targets = [s.strip() for s in args.slugs.split(",") if s.strip()]
    elif args.rep_only:
        targets = list(REP_SLUGS)
    else:
        targets = list(PILOT_COHORT)
    targets = rep_first(targets)

    if not GEN_SCRIPT.exists():
        print(f"[FAIL] generate_tts.py 없음: {GEN_SCRIPT}")
        return 2

    print(f"[INFO] 배치 {len(targets)}권 (대표 우선) · voice={VOICE} rate={RATE}% natural=on")
    print("=" * 72)

    report: list[dict] = []
    ok, failed = 0, 0
    for slug in targets:
        in_path = OUT_DIR / f"{slug}.json"
        is_rep = slug in REP_SLUGS
        tag = "★대표" if is_rep else "     "
        if not in_path.exists():
            print(f"[SKIP] {tag} {slug}: 입력 out/{slug}.json 없음 (브리지 먼저 실행)")
            report.append({"slug": slug, "is_rep": is_rep, "ok": False,
                           "returncode": None, "error": "입력 out/{slug}.json 없음"})
            failed += 1
            continue

        print(f"[RUN]  {tag} {slug} …")
        proc = subprocess.run(
            [sys.executable, str(GEN_SCRIPT), "--slug", slug,
             "--voice", VOICE, "--rate", str(RATE), "--natural"],
            capture_output=True, text=True, encoding="utf-8",
        )
        entry: dict = {"slug": slug, "is_rep": is_rep, "returncode": proc.returncode}
        if proc.returncode != 0:
            # generate_tts.py 실패 메시지 마지막 줄만 사유로 기록.
            err_lines = [l for l in (proc.stdout + proc.stderr).splitlines() if l.strip()]
            reason = err_lines[-1] if err_lines else f"returncode={proc.returncode}"
            entry.update(ok=False, error=reason)
            print(f"[FAIL] {tag} {slug}: {reason}")
            failed += 1
        else:
            entry.update(ok=True, **summarize_manifest(slug))
            print(f"[OK]   {tag} {slug}: audio={entry.get('audio_pages')} "
                  f"marks={entry.get('marks_pages')} skip={len(entry.get('skipped_pages') or [])}")
            ok += 1
        report.append(entry)

    report_path = OUT_DIR / "_tts_batch_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    n_rep_ok = sum(1 for r in report if r.get("is_rep") and r.get("ok"))
    print("=" * 72)
    print(f"[DONE] 성공 {ok} / 실패 {failed} (대표 3권 성공 {n_rep_ok}/3). "
          f"요약={report_path.relative_to(PILOT_DIR)}")
    if ok == 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
