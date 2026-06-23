# HelloKiki 외부 Claude 인수인계 — Book Dash Scheme B 정찰·게이트 완료, 적재 직전 (2026-06-23 종료)

## 현재 위치 — 새 세션 워커로 실측 복원 필수
- **확정 HEAD = 8821fb4** (docs(ops): 운영 개선 §7). push 완료, **ahead 0**.
- 워킹트리: `.claude/settings.local.json`(M) + `scripts/check_asb_cover.sql`(untracked) **2개만**. 작업무관, 손대지 말 것.
- **SSOT = `docs/backlog.md`**. 운영 원칙 = `docs/external-claude-usage.md`(§7 운영개선 신규).
- 실서비스: www.hellokiki.co.kr (뷰어 `/book/{UUID}/read`, 목록 `/library`).

## 이번 세션 완료 — Scheme B 정찰·게이트 구현
- **정찰 4차**로 Scheme B(185권) 본문 추출 방식 확정: **파일명 공식 불가 → HTML 컨테이너 파싱**.
  - 레시피 = 책페이지 HTML → `div#read-book` 격리 → `img[data-src]` → `wp-content/uploads` 필터 → `-WxH` 썸네일 접미사 제거 → 중복제거. (Scheme A의 CloudFront `_en_page` 경로와 별개)
- **박제**: ADR-0027 Amd#4(추출 레시피)·#5(게이트①②+dedup A)·#6(게이트③ 표지중복).
- **코드(`sync_book_dash_v2.py`)**: Scheme A/B 판정 분기 + 게이트①(본문 ≤1장 skip) + 게이트②(dedup A=첫 세트만, `_dedup_first_set`) + 게이트③(`apply_cover_dedup`, 첫 장 stem==표지 stem이면 제외). **Scheme A 21권 경로·동작 불변**(the-window-seat 17 회귀없음 실측).
- **전량 드라이런(206권) 통과**: 레시피 100% 성공. 게이트③ D39 = 30 제거 / 7 보존 / warn(과잉제거) 0.

## 실적재 진행 상태 — 5권 스테이징 중 (★재적재 필요)
- 1단계로 **5권 적재 완료(is_active=false)**: `maddy-moonas-menagerie` / `mrs-penguins-perfect-palace` / `little-sock-and-the-tiny-creatures` / `my-special-hair` / `the-three-doof-doofs`.
  - `the-baby-book`은 게이트① skip(본문 0~1장, 미적재).
- 무결성 검증 통과(attribution NULL 0·라이선스 위반 0·전부 is_active=false).
- 뷰어 육안검수(임시 공개→복귀): **표지 2중노출 확인 → 게이트③ 신설 계기**.
- ※ 이 5권은 **게이트③ 적용 전 매니페스트**라 표지중복 잔존 → **재적재(매니페스트 갱신) 필요**.
  - 게이트③ 반영 목표 장수: maddy **12** / penguin **13** / little-sock **17** / my-special-hair **16** / doof-doofs **17**.

## ★다음 작업 — 적재 트랙 (미착수)
1. **스테이징 5권 재적재**(게이트③ 반영 upsert). = 전량 적재 리허설.
2. **Scheme B 전량 적재**(나머지 ~178권 = 185 − 스테이징 5 − 게이트① skip분, is_active=false).
3. **무결성 감사**(PM SELECT: attribution NULL 0·license 위반 0·is_active 전부 false).
4. **표본 뷰어 검수**(임시 공개→복귀): 표지중복 해소 확인 + `a-fish-and-a-gift`(본문 2장, 깨짐 의심) 확인.
5. **일괄 공개(is_active=true)** → 라이브러리 활성 총계 갱신(현 3,087 + 적재분).

## 검수 이연 — 적재 후 표본검수 대상 (적재 차단 아님)
- `a-fish-and-a-gift`: 본문 2장(게이트① ≤1 통과했으나 비정상 짧음). 뷰어 확인 후 제외 판단.
- 게이트③ 제거된 첫 장이 순수 표지인지(제목+본문 겸용 아닌지) 1~2권 육안.
- 작가 성 1토큰 의심 6건(파싱 부분잘림 가능) — Scheme A 잔여과제 동일 계열.

## 외부 회신 대기 — 도착 시 최우선
- **StoryWeaver**: 답장 발송·회신 대기(OPDS feed 받아 확정, 수백~1,000권 순증 기대).
- **Bloom**: 이번 세션 재발송 완료(객관식+사명공감 톤). 회신 대기.

## 운영 원칙 — `docs/external-claude-usage.md` §7 신규 반영
- **변동 없음**: 코드=개별 1.Yes / 문서=묶음 가능, "allow all"·"don't ask again" 거부. git add 파일명 지정, add·commit·push 분리, 커밋 footer/trailer 0건(단일 `-m`). push 계정 `crspiegel`. DB조회 불가(워커)→PM이 Supabase 실행. `source_platform='book_dash'`.
- **§7 개선(이번 세션부터)**: ① 문서커밋 diff 동시첨부(본체코드는 push 전 검토 유지) ② 정찰 지시서 넓게 묶기 ③ ADR 분할 최소화 ④ 지시서 길이 절제.
- **불변 4종(축소금지)**: 본체코드 push 전 diff / `is_active=false` 스테이징 / 뷰어 육안검수 / 전수 드라이런.

## 새 세션 시작 동작
① **워커 복원 실측**: HEAD=8821fb4 + ahead 0 + 워킹트리 2개 + 본 handoff 확인.
② **외부 회신(StoryWeaver/Bloom) 도착 여부 PM 확인** — 왔으면 최우선.
③ **스테이징 5권 재적재부터 재개**(위 ★다음 작업 1번).
