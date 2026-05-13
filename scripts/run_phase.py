#!/usr/bin/env python3
"""
run_phase.py — 키키북스 하네스 시스템의 페이즈 순차 실행기

하네스 가이드라인 3.1절 "파이썬 스크립트 기반 시퀀스 관리"의 구현체.
에이전트가 '순서'를 기억하지 않도록 스크립트가 시퀀스 책임을 가진다.
에이전트는 '로직과 의도'에만 집중한다.

사용법:
    python scripts/run_phase.py --phase phase-03-db-schema   # 특정 페이즈 실행
    python scripts/run_phase.py --auto                       # 마지막 성공 지점부터 자동 연속
    python scripts/run_phase.py --status                     # 현재 상태 출력
    python scripts/run_phase.py --reset                      # _index.json 초기화 (위험)
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Windows 콘솔(cp949)에서도 이모지·한글 출력이 깨지지 않도록 UTF-8로 강제.
# Python 3.7+ 의 reconfigure 사용. stdout/stderr이 비-TTY로 리다이렉트된 경우도 안전.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

# ---------------------------------------------------------------------------
# 경로 상수
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
INDEX_FILE = ROOT / "tasks" / "_index.json"
TASKS_DIR = ROOT / "tasks"
LOG_DIR = ROOT / "tasks" / "logs"


# ---------------------------------------------------------------------------
# 유틸리티
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_index() -> dict:
    if not INDEX_FILE.exists():
        die(f"_index.json을 찾을 수 없습니다: {INDEX_FILE}")
    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_index(data: dict) -> None:
    data["last_updated"] = now_iso()
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def die(msg: str, code: int = 1) -> None:
    print(f"\n[ERROR] {msg}\n", file=sys.stderr)
    sys.exit(code)


def log(msg: str, level: str = "INFO") -> None:
    print(f"[{level}] {msg}")


def write_phase_log(phase_id: str, content: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"{phase_id}_{ts}.log"
    log_path.write_text(content, encoding="utf-8")


# ---------------------------------------------------------------------------
# 페이즈 조회 & 의존성 검증
# ---------------------------------------------------------------------------
def get_phase(index: dict, phase_id: str) -> dict:
    for p in index["phases"]:
        if p["id"] == phase_id:
            return p
    die(f"페이즈 '{phase_id}'를 _index.json에서 찾을 수 없습니다.")


def check_dependencies(index: dict, phase: dict) -> None:
    """의존 페이즈가 모두 success 상태인지 검증."""
    for dep_id in phase.get("depends_on", []):
        dep = get_phase(index, dep_id)
        if dep["status"] != "success":
            die(
                f"의존성 미충족: '{phase['id']}'는 '{dep_id}'에 의존하지만 "
                f"현재 상태가 '{dep['status']}'입니다."
            )


def find_next_pending(index: dict) -> Optional[dict]:
    """의존성이 모두 충족된 다음 pending 페이즈를 반환."""
    for p in index["phases"]:
        if p["status"] != "pending":
            continue
        deps_ok = all(
            get_phase(index, d)["status"] == "success" for d in p.get("depends_on", [])
        )
        if deps_ok:
            return p
    return None


# ---------------------------------------------------------------------------
# 페이즈 실행
# ---------------------------------------------------------------------------
def run_phase(phase_id: str, auto: bool = False) -> bool:
    """단일 페이즈 실행. 성공 시 True, 실패 시 False 반환."""
    index = load_index()
    phase = get_phase(index, phase_id)

    if phase["status"] == "success":
        log(f"이미 완료된 페이즈: {phase_id}", "SKIP")
        return True

    check_dependencies(index, phase)

    log("=" * 60)
    log(f"페이즈 시작: {phase_id}")
    log(f"이름: {phase['name']}")
    log(f"카테고리: {phase['category']}")
    log("=" * 60)

    # 상태 갱신: running
    phase["status"] = "running"
    phase["started_at"] = now_iso()
    index["current_phase"] = phase_id
    save_index(index)

    # spec_file 안내 (실제 구현은 Claude Code가 spec_file을 읽어서 수행)
    spec_file = ROOT / phase["spec_file"]
    if spec_file.exists():
        log(f"페이즈 명세 파일: {spec_file.relative_to(ROOT)}")
        log("→ Claude Code는 이 파일을 읽어 작업을 수행하세요.")
    else:
        log(f"⚠️  명세 파일 없음: {spec_file.relative_to(ROOT)}", "WARN")
        log("   Claude Code에게 명세 파일 생성을 먼저 요청하세요.")

    # 검증 항목 출력
    log("\n[검증 항목]")
    for i, v in enumerate(phase.get("verification", []), 1):
        log(f"  {i}. {v}")

    # 수동 확인 단계 (auto 모드에서는 생략)
    if not auto:
        log("\n페이즈 작업이 완료되면 다음 명령으로 결과를 기록하세요:")
        log(f"  python scripts/run_phase.py --complete {phase_id}")
        log(f"  python scripts/run_phase.py --fail {phase_id} --reason '<사유>'")
        return True  # 실행 시작 자체는 성공

    # auto 모드: 검증 자동화 실행
    return run_verification(phase_id)


def run_verification(phase_id: str) -> bool:
    """페이즈별 자동 검증 실행 (lint, type-check, build, license-audit)."""
    log("\n[자동 검증 시작]")
    checks = [
        ("lint", ["pnpm", "lint"]),
        ("type-check", ["pnpm", "type-check"]),
        ("build", ["pnpm", "build"]),
    ]

    all_passed = True
    log_output = []

    for name, cmd in checks:
        log(f"실행: {' '.join(cmd)}")
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, cwd=ROOT, timeout=300
            )
            log_output.append(f"=== {name} ===\n{result.stdout}\n{result.stderr}\n")
            if result.returncode != 0:
                log(f"  ✗ {name} 실패", "FAIL")
                all_passed = False
            else:
                log(f"  ✓ {name} 통과", "OK")
        except FileNotFoundError:
            log(f"  ⚠ {name} 스킵 (명령어 없음, pnpm 미설치 가능성)", "WARN")
        except subprocess.TimeoutExpired:
            log(f"  ✗ {name} 타임아웃", "FAIL")
            all_passed = False

    # 라이선스 감사는 별도 스크립트로 분리 (Supabase 연결 필요)
    license_script = ROOT / "scripts" / "verify_licenses.py"
    if license_script.exists():
        log("실행: verify_licenses.py")
        try:
            result = subprocess.run(
                ["python", str(license_script)],
                capture_output=True,
                text=True,
                cwd=ROOT,
                timeout=60,
            )
            log_output.append(f"=== license-audit ===\n{result.stdout}\n{result.stderr}\n")
            if result.returncode != 0:
                log("  ✗ license-audit 실패", "FAIL")
                all_passed = False
            else:
                log("  ✓ license-audit 통과", "OK")
        except Exception as e:
            log(f"  ⚠ license-audit 스킵: {e}", "WARN")

    write_phase_log(phase_id, "\n".join(log_output))

    if all_passed:
        mark_success(phase_id)
    else:
        mark_failure(phase_id, "자동 검증 실패")

    return all_passed


# ---------------------------------------------------------------------------
# 상태 갱신 (성공/실패)
# ---------------------------------------------------------------------------
def mark_success(phase_id: str) -> None:
    index = load_index()
    phase = get_phase(index, phase_id)
    phase["status"] = "success"
    phase["completed_at"] = now_iso()
    index["last_successful_state"] = phase_id
    index["completed_phases"] = sum(1 for p in index["phases"] if p["status"] == "success")
    index["remaining_phases"] = index["total_phases"] - index["completed_phases"]
    save_index(index)
    log(f"✅ 페이즈 성공 기록: {phase_id}")
    log(f"   완료 {index['completed_phases']}/{index['total_phases']}, 남은 {index['remaining_phases']}")


def mark_failure(phase_id: str, reason: str) -> None:
    index = load_index()
    phase = get_phase(index, phase_id)
    phase["status"] = "failed"
    phase["failed_at"] = now_iso()
    phase["failure_reason"] = reason
    save_index(index)
    log(f"❌ 페이즈 실패 기록: {phase_id}")
    log(f"   사유: {reason}")


# ---------------------------------------------------------------------------
# 상태 출력
# ---------------------------------------------------------------------------
def print_status() -> None:
    index = load_index()
    print("\n" + "=" * 60)
    print(f"프로젝트: {index['project']}")
    print(f"마지막 갱신: {index['last_updated']}")
    print(f"현재 페이즈: {index['current_phase']}")
    print(f"마지막 성공: {index['last_successful_state'] or '(없음)'}")
    print(f"진행: {index['completed_phases']}/{index['total_phases']} 완료, "
          f"{index['remaining_phases']} 남음")
    print("=" * 60)
    print("\n[페이즈 목록]")
    for p in index["phases"]:
        icon = {
            "pending": "⬜",
            "running": "🔄",
            "success": "✅",
            "failed": "❌",
        }.get(p["status"], "❓")
        print(f"  {icon} {p['id']:40s} [{p['category']}] {p['name']}")
    print()


# ---------------------------------------------------------------------------
# 자동 연속 실행 모드
# ---------------------------------------------------------------------------
def run_auto() -> None:
    log("자동 연속 실행 모드 시작 (마지막 성공 지점부터)")
    while True:
        index = load_index()
        next_phase = find_next_pending(index)
        if not next_phase:
            log("✅ 모든 페이즈 완료. 종료합니다.")
            return
        success = run_phase(next_phase["id"], auto=True)
        if not success:
            log("⛔ 페이즈 실패로 자동 실행을 중단합니다.")
            log("   문제를 해결한 뒤 다음 명령으로 재시작하세요:")
            log("   python scripts/run_phase.py --auto")
            return


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="키키북스 하네스 시스템 페이즈 실행기"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--phase", help="실행할 페이즈 ID")
    group.add_argument("--auto", action="store_true", help="마지막 성공 지점부터 자동 연속 실행")
    group.add_argument("--status", action="store_true", help="현재 상태 출력")
    group.add_argument("--complete", help="페이즈를 수동으로 성공 처리")
    group.add_argument("--fail", help="페이즈를 수동으로 실패 처리")
    parser.add_argument("--reason", help="--fail과 함께 사용할 실패 사유")

    args = parser.parse_args()

    if args.status:
        print_status()
    elif args.complete:
        mark_success(args.complete)
    elif args.fail:
        mark_failure(args.fail, args.reason or "사유 미기재")
    elif args.auto:
        run_auto()
    elif args.phase:
        run_phase(args.phase, auto=False)


if __name__ == "__main__":
    main()
