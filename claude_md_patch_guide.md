# claude.md 패치 안내 (디자인 시스템 도입)

> **이 파일은 일회성 가이드입니다.** 패치 적용 후 삭제하거나 보관용으로 남기세요.
> 패치 완료 후 `tasks/` 또는 별도 archive 폴더로 이동 권장.

**패치 대상** `claude.md` (프로젝트 루트)
**패치 사유** ADR-0002 디자인 시스템 채택에 따른 라우팅 테이블 업데이트
**작업 시간** 약 2분

---

## 패치 내용 1 — 5절 라우팅 테이블 업데이트

`claude.md`의 **5절 라우팅 테이블**에 있는 화면 구현 행들을 다음과 같이 수정하세요.

### Before (현재)

```markdown
| Screen 01 (랜딩) 구현 | `docs/intent/screen-01-landing.md` + `design.md` | 9절 |
| Screen 02 (홈) 구현 | `docs/intent/screen-02-home.md` + `design.md` | 9절 |
| Screen 03 (책 상세) 구현 | `docs/intent/screen-03-book-detail.md` + `docs/guidelines/license-rules.md` | 9절 |
| Screen 04 (책 뷰어) 구현 | `docs/intent/screen-04-reader.md` | 9절 |
| Screen 05 (완독 보상) 구현 | `docs/intent/screen-05-celebrate.md` | 9절 |
```

### After (수정 후)

```markdown
| Screen 01 (랜딩) 구현 | `docs/intent/screen-01-landing.md` + `docs/design-system.md` | 9절 |
| Screen 02 (홈) 구현 | `docs/intent/screen-02-home.md` + `docs/design-system.md` | 9절 |
| Screen 03 (책 상세) 구현 | `docs/intent/screen-03-book-detail.md` + `docs/design-system.md` + `docs/guidelines/license-rules.md` | 9절 |
| Screen 04 (책 뷰어) 구현 | `docs/intent/screen-04-reader.md` + `docs/design-system.md` (7.2 Reader 토큰) | 9절 |
| Screen 05 (완독 보상) 구현 | `docs/intent/screen-05-celebrate.md` + `docs/design-system.md` (7.3 Celebrate 모션) | 9절 |
| **디자인 시스템·토큰 변경** | `docs/design-system.md` + `docs/adr/0002-design-system.md` + 신규 ADR 작성 | — |
| **Tailwind 설정 변경** | `docs/design-system.md` 10절 (필수) | — |
```

**핵심 변경점**:
1. `design.md` → `docs/design-system.md`로 교체
2. Screen 04·05는 특정 섹션 번호까지 명시 (Reader 토큰 7.2, Celebrate 모션 7.3)
3. 디자인 시스템 변경·Tailwind 설정 변경 2개 행 신규 추가

---

## 패치 내용 2 — 2절 Hard Rules에 1개 추가

`claude.md`의 **2절 절대 위반 금지 규칙** 마지막에 다음 항목 추가:

```markdown
10. **디자인 토큰은 raw value(예: `#FF7A45`) 직접 사용 금지** — `docs/design-system.md`의 semantic 토큰(`var(--color-primary)` 또는 Tailwind 클래스)만 사용. 일러스트·차트는 예외.
```

---

## 패치 내용 3 — tasks/_index.json 업데이트

`tasks/_index.json`의 `phase-02-design-md`를 다음과 같이 수정:

### Before

```json
{
  "id": "phase-02-design-md",
  "name": "design.md 작성 (5개 화면 시안)",
  ...
  "verification": [
    "design.md에 컬러 토큰 정의",
    "design.md에 5개 화면 와이어프레임 포함",
    "design.md에 타이포·간격·border-radius 명세 포함"
  ]
}
```

### After

```json
{
  "id": "phase-02-design-system",
  "name": "디자인 시스템 확정 (Claude Design 추출 + 키키북스 보강)",
  ...
  "status": "success",
  "completed_at": "2026-05-13T00:00:00Z",
  "verification": [
    "docs/design-system.md v1.0 작성 완료",
    "docs/adr/0002-design-system.md 작성 완료",
    "claude.md 라우팅 테이블 갱신 완료",
    "AttributionBox/Reader/Celebrate/Streak/Level 컬러 매핑 5종 보강 완료"
  ]
}
```

**의미**: 이 페이즈가 이미 완료 처리되어 다음 페이즈(Phase 0 나머지 또는 Phase 1)로 진입 가능.

---

## 패치 적용 방법 — 비개발자용 단계별 안내

### 방법 A — Claude Code에 위임 (가장 권장)

VS Code의 Claude Code 터미널에 다음 프롬프트를 입력하세요.

```
docs/design-system.md와 docs/adr/0002-design-system.md를 방금 새로 추가했어.
"claude_md_patch_guide.md" 파일을 참조해서 다음 3가지를 적용해줘:

1. claude.md 5절 라우팅 테이블 업데이트 (design.md → docs/design-system.md 교체 + 2개 행 추가)
2. claude.md 2절 Hard Rule 10번 추가
3. tasks/_index.json의 phase-02 항목 갱신 및 success 처리

작업 완료 후 변경 사항을 요약해서 보고해줘.
```

### 방법 B — 직접 수동 수정

VS Code에서 `claude.md` 파일을 열고 5절 표와 2절 목록을 직접 편집한 뒤, `tasks/_index.json`도 텍스트 에디터로 수정.

비개발자 사용자에게는 **방법 A를 강력 권장**합니다. Claude Code가 정확히 수정하고 검증까지 합니다.

---

## 패치 적용 후 검증

다음 명령으로 상태를 확인하세요.

```bash
python scripts/run_phase.py --status
```

기대 결과:
- `phase-02-design-system` 상태가 `✅ success`로 표시
- `last_successful_state`가 `phase-02-design-system`으로 갱신
- `completed_phases`가 1 이상

---

## 다음 단계

패치 완료 시 다음 페이즈로 진입 가능합니다.

1. **phase-00-setup** — 아직 미완료 시 계정 셋업 진행
2. **phase-01-nextjs-init** — Next.js + Tailwind + shadcn 초기화
   - 이때 `docs/design-system.md` 10절의 Tailwind 매핑 가이드를 그대로 적용
3. **phase-03-db-schema** — Supabase 마이그레이션 (병렬 가능)

---

*가이드 끝. 패치 완료 후 본 파일은 보관 또는 삭제하셔도 됩니다.*
