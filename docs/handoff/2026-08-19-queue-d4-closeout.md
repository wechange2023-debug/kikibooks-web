# 2026-08-19 세션 종료 메모 — 큐 D-4 종결

> **읽는 순서**: 본 문서 → `docs/ops/schedule-2026-08.md`(정본 = 작업 큐) →
> `docs/adr/0060-design-system-v2.md`(디자인 v2) · `docs/adr/0061-global-footer-legal-links.md`(푸터) ·
> `docs/adr/0062-main-page-unification.md`(메인 통합 + Amendment 1·2).
>
> ★ **본 세션은 `design-renewal` 브랜치에서 작업했다. main은 무접촉이다.**

---

## 1. 세션 종료 상태

| 항목 | 값 |
|---|---|
| 작업 브랜치 | **`design-renewal`** |
| 브랜치 HEAD | **`cb5bb09`** feat: 큐 D-4c 히어로 구도 통일 (ADR-0062 Amd.2) |
| origin/design-renewal | **동기 (ahead 0 / behind 0)** |
| `main` (로컬·origin) | **`294f214`** fix: 큐 D-3 elev-cta 오적용 완화 및 celebrate 대비 교정 — **D-3 이후 무접촉** |
| 이번 세션 push | design-renewal 1회 (`294f214..cb5bb09`, **15커밋**) |
| 미커밋 | 의도적 보존 **2건뿐** (아래 §5) |

※ 본 메모 커밋은 위 15건 **이후**다. **재개 시 `git log --oneline -1`로 실제 HEAD를 확인할 것.**
※ 재개 시 브랜치도 확인할 것 — `git branch --show-current`가 `design-renewal`이어야 한다.

---

## 2. 큐 D 진척

| 단계 | 상태 | 위치 |
|---|---|---|
| D-0 현황 조사 | ✅ 완료 | (읽기 전용, 산출물 없음) |
| D-1 ADR-0060·0061 초안 + 법정대리인 문구 정합화 | ✅ 완료 | **main** |
| D-2 `docs/design-system.md` v2 전면 개정 | ✅ 완료 | **main** |
| D-3 디자인 토큰 레이어 구현 | ✅ 완료 | **main** (`294f214`) |
| D-4 화면 리뉴얼 1차 (CTA 위계·공통 푸터·홈/랜딩 패턴) | ✅ 완료 | **design-renewal** |
| D-4b 메인 통합 ADR-0062 초안 | ✅ 완료 | design-renewal |
| D-4c 메인 통합 구현 + Amendment 1·2 | ✅ 완료 | design-renewal (`cb5bb09`) |
| **D-5** | **미착수 — 다음 착수 대상** | — |

### D-5 범위 (이번 세션에서 의도적으로 손대지 않음)

- **O-8 비활성 도서** — 목록 표시 **유지** + 뷰어 진입 **차단** + 3~7세 안내 문구.
  현재 구현은 목록에서도 **차단**이라 팀장 결정(ADR-0059 O-8)과 **반대**다.
  진입점은 `read-button.tsx` · `preview-mode.ts` **2곳뿐**이며 둘 다
  `lib/book/detail.ts:150`의 `.eq('is_active', true)`를 지나므로 차단 자체는 이미 성립한다.
  실제 작업은 **`notFound()`를 안내 화면으로 교체**하는 것 + 마이페이지 목록 복원이다.
- **`degraded` 문구(O-3)** — `app/(reader)/mypage/page.tsx:127` 1곳. **표시 제거는 선택지가 아니다**(ADR-0059 O-3). 표현만 다듬는다.
- **마이페이지 P2 디자인**.

---

## 3. main 병합 정책 (중요)

**main push·병합 전면 금지.** 큐 D **전체 완료 + 팀장 최종 승인 후 별도 지시서로만** 진행한다.
D-5도 `design-renewal` 브랜치에서 이어서 작업한다.

---

## 4. 이번 세션 주요 결정 (되돌리기 전에 읽을 것)

git log에 남지 않는 판단들이다.

1. **`/`가 단일 메인이 됐다** (ADR-0062 D1·D8). 로그인 사용자를 `/home`으로 보내던
   ADR-0012 결정 4를 supersede하고, **리다이렉트 대신 블록을 바꿔 렌더**한다.
   단 *"미들웨어는 이 분기를 하지 않는다"* 는 원칙은 유지된다(ADR-0009 3.4절).
2. **`/home` → `/` 308은 `next.config.js` redirects에 둔다** (D2, O-M1).
   **실측 근거**: Next 14.2.35에서 `redirects()`가 미들웨어보다 **먼저** 평가된다 —
   비로그인 `/home`이 `/login` 경유 없이 홉 1회로 `/`에 도착한다.
   (대조군 `/library`·`/mypage`는 미들웨어가 307로 `/login`에 보냈다.)
   미들웨어로 옮기려 하기 전에 이 실측을 먼저 확인할 것.
3. **에러·복구 화면 4곳(not-found·admin/error·global-error·auth-error)의 버튼은
   CTA로 올리지 않는다** — `error`(#B3261E)와 `cta`(#CE3D1A)가 육안으로 가까워
   오류 화면이 가장 혼동되기 쉽다(팀장 확정).
4. **비로그인 카테고리 타일은 `/signup`으로 간다**(O-M2). `/library`가 보호 라우트라
   `/login`으로 튀어 카테고리가 미끼로만 끝나기 때문이다.
5. **히어로는 `components/main/main-hero.tsx` 한 곳이 클래스를 소유한다**(Amd.2 A2-2).
   상태별 히어로를 두 개 두면 "두 상태가 동일한가"가 매번 검수 항목이 되지만,
   한 곳에 두면 구조적으로 동일해진다. **상태별 히어로 컴포넌트를 다시 만들지 말 것.**
6. **표지 중복은 허용한다**(Amd.1 부수결정 3 · Amd.2 A2-5). 히어로 3장이 아래
   섹션과 겹치나 제거하지 않는다 — 추천 로직 변경은 D-5 이후 별건이다.
7. **`level-N`은 스트로크·도트 전용, 텍스트 배경 금지**(design-system v2 §1.7 규칙 1).
   레벨 1~4는 흰 글자 대비가 3.96~4.21:1로 AA 미달이다. 라벨은
   `level-N-container` + `text` 조합을 쓴다.

---

## 5. 미커밋 보존분 2건 (건드리지 말 것)

```
 M .claude/settings.local.json
 M scripts/tts_pilot/out/_fullbatch_dryrun_report.json
```

이전 세션부터 의도적으로 보존 중이다. 커밋·되돌리기 모두 하지 않는다.

---

## 6. 재개 시 함정 2가지 (이번 세션에서 실제로 밟았음)

1. **dev 서버가 떠 있는 동안 `pnpm build`를 돌리지 말 것.**
   두 명령이 같은 `.next`를 쓴다. 빌드가 dev의 산출물을 덮어써 **전 화면이 CSS 없이
   렌더**되고, 이후 새 워커가 `EPIPE`로 죽어 `/book/[id]`가 500이 된다.
   해소법: dev 종료 → `rm -rf .next` → 재기동.
2. **dev 서버를 넘기기 전 "콜드 라우트"를 실제 브라우저 세션으로 진입해 확인할 것.**
   `curl`로 `/home`·`/library`가 200을 반환해도 **세션이 없어 `/login`으로 리다이렉트된
   응답**일 수 있다. 이미 컴파일된 라우트만 확인하면 깨진 상태를 놓친다.

---

## 7. 확인하지 못한 것 (다음 세션 인계)

- **Vercel 미리보기 URL** — 이 환경에 Vercel CLI가 없어 조회하지 못했다.
  GitHub Checks 또는 Vercel 대시보드의 `design-renewal` 배포에서 확인할 것.
- **390px 반응형 실측** — `resize_window`가 두 번 다 창을 줄이지 못해(최대화 상태로 추정)
  **클래스 값 기반 산술로만** 판정했다. 실측이 아니다. DevTools 기기 툴바(390×844)로
  확인이 필요하다.
- **`/celebrate` 육안 확인** — 완독을 트리거해야 해서 실데이터가 바뀐다.
  공통 푸터 미렌더는 SSR HTML로만 확인했다(푸터·헤더 부재 확인 완료).
- **오디오 리더 ⓘ 팝오버 육안** — 확인에 쓴 책이 html 경로라 오디오 분기를 밟지 못했다.

---

*문서 끝.*
