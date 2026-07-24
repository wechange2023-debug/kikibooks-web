# 7/27 리허설 점검표 — 7/28 내부 시연용

> **대상**: 팀장(브라우저로 직접 따라가며 점검)
> **작성**: 2026-07-24 (워커) · **리허설**: 2026-07-27 · **시연**: 2026-07-28
> **범위**: 파일럿 12권(TTS 낭독 + 단어 하이라이트). **ADR-0052 D1에 따라 7/27 이후 신규 기능 추가 금지 — 이 문서는 점검용이며 코드 변경 0줄.**
> 접속 주소 기준: `https://www.hellokiki.co.kr` (Production)

---

## 1. 시연 핵심 메시지 (1줄)

> **"무료 영어 그림책을, AI 성우가 읽어주고, 읽는 단어에 자막이 실시간으로 따라붙습니다."**

---

## 2. 리허설 시작 전 사전 점검

시연 동선을 밟기 **전에** 아래 4가지를 먼저 확인합니다.

- [ ] **2-1. Vercel Production 최신 배포 확인** (팀장)
  - Vercel 대시보드 → 프로젝트 → Deployments → 최상단 항목이 **Production / Ready** 이고, 커밋이 `30561d4`(has_audio 배지) 이후인지 확인
  - 아니면 최신 커밋을 Promote to Production
- [ ] **2-2. 12권 서비스 상태 확인 (⚠️ 가장 중요)** (팀장 · SQL Editor)
  - 12권이 **공개 상태(`is_active=true`)** 가 아니면 책 주소로 들어가도 "찾을 수 없는 책이에요"(404)가 뜹니다.
  - 배지(헤드폰 아이콘)는 **`books.has_audio=true`** 인 책만 나옵니다.
  - 확인 SQL은 이 문서 **6절 부록**에 있습니다. 리허설 전에 1회 실행해 12행 결과를 확인하세요.
- [ ] **2-3. 시연용 계정 · 자녀 프로필 준비**
  - 시연에 쓸 계정으로 로그인해 두고, **자녀 프로필이 1개 이상 선택된 상태**인지 확인
  - (자녀 프로필이 없으면 완독 → 축하 화면이 정상 동작하지 않습니다)
- [ ] **2-4. 실기기 확인**
  - 시연에 쓸 **태블릿/노트북 실기기**에서 위 계정으로 로그인해 두기
  - **소리 확인**: 기기 볼륨, 무음 모드 해제, (스피커 연결 시) 출력 장치 선택
  - 브라우저는 최신 Chrome 권장, 시연 탭 외 다른 탭은 닫아두기

---

## 3. 표준 동선 체크리스트 (책 1권 기준)

책 1권으로 아래 a→d를 순서대로 밟습니다. **최소 대표작 1권 + 예비 1권**은 반드시 리허설해 둡니다.

### a. 카드에서 헤드폰 배지 확인
- [ ] `https://www.hellokiki.co.kr/home` 또는 `/library` 접속
- [ ] 대상 책의 **표지 카드 우상단에 헤드폰 아이콘 배지(pill)** 가 보이는가
- [ ] 오디오가 없는 다른 책 카드에는 배지가 **없는** 것도 함께 확인 (대비가 곧 메시지)

### b. 책 상세 진입
- [ ] 카드를 눌러 `/book/{id}` 진입
- [ ] 제목 아래 정보 줄에 **"듣기 지원" 칩**이 보이는가
- [ ] 화면 아래쪽 **어트리뷰션 박스**(📚 출처 / ✍️ 글 / 🎨 그림 / 📜 라이선스 / 🔗 원본 보기)가 보이는가
      → 법적 의무 표시이므로 **비어 있으면 즉시 보고**
- [ ] **"📖 읽기 시작"** 버튼이 보이는가

### c. 리더(뷰어) — 낭독 + 자막 하이라이트 ★시연 핵심
- [ ] "읽기 시작"을 눌러 `/book/{id}/read` 진입
- [ ] **표지 화면**이 먼저 뜨고, 가운데 **"눌러서 시작하기"** 안내가 보이는가
- [ ] 표지를 탭 → **낭독이 시작**되는가 (소리 확인)
- [ ] 본문 화면에서 **읽고 있는 단어에 하이라이트가 실시간으로 따라붙는가** (핵심 장면)
- [ ] 하단 바의 **재생/일시정지 버튼**으로 수동 제어가 되는가
- [ ] 하단 바 **"자동 넘김" 토글이 켜진 상태**에서, 한 면이 끝나면 **자동으로 다음 면으로 넘어가고 낭독이 이어지는가** (연속 듣기)
- [ ] 소리가 없는 면에서는 **"이 페이지는 소리가 없어요"** 안내 + **카운트다운** 후 자동으로 넘어가는가
- [ ] 좌우 화살표로 **수동 페이지 이동**이 되는가 (이동 시 대기 중인 자동 넘김은 취소됨 — 정상)
- [ ] 우상단 **ⓘ(저작권 정보)** 버튼을 누르면 어트리뷰션 팝오버가 뜨는가
- [ ] 우상단 **페이지 위치 표시**('표지' / 'n / 전체')가 맞게 바뀌는가

### d. 완독 → 축하 화면
- [ ] 마지막 면까지 이동
- [ ] 하단 바 오른쪽 **"다 읽었어요"** 버튼 클릭 (버튼은 처음부터 하단에 있음 — 마지막 면에서 누르는 것이 시연 동선)
- [ ] `/book/{id}/celebrate` 로 이동하며 **별 애니메이션 + 포인트 카운트업(+50 포인트) + 완독 배지**가 나오는가
- [ ] **"다른 책 보러 가기"** 링크로 `/library`로 돌아오는가

---

## 4. 파일럿 12권 목록

- **주소 만드는 법**: 상세 = `https://www.hellokiki.co.kr/book/{book_id}` · 리더 = 그 뒤에 `/read` 를 붙임
- **book_id 출처**: `docs/sql/pilot12_danielle_load.sql` [0]절 (2026-07-22 팀장 SQL 확인분)
- **제목 출처**: Book Dash 원본 카탈로그(`scripts/pdf_harvest/data/wp_english_catalog.json`). 대표 3권은 ADR-0052 D2의 DB 제목과 일치 확인. 나머지 9권의 **DB 제목 표기는 미확인**(6절 부록 SQL로 확인 가능)
- **오디오 면수**: `pilot12_danielle_load.sql`에 적재 초안이 있는 본문 면 수 (표지 오디오 12건은 별도 `pilot12_danielle_cover_load.sql`)

| # | 제목 | book_id (상세 URL 뒤에 붙임) | 오디오 면 | 비고 |
|---|---|---|---|---|
| 1 | **A trip to the tap** | `0134f341-7b58-4c7c-b17a-8d4e036dcd72` | 12 | ⭐ **시연 대표작 1순위** — 대표 3권 · 하이라이트 판정 합격 |
| 2 | **Amahle wants to help!** | `f3e5da2f-a04d-4b08-ac81-4dee971c15e8` | 12 | ⭐ 대표 3권 · 하이라이트 판정 합격 (예비 1) |
| 3 | **Baby Babble** | `22a4f65f-df39-44c3-863f-81d7855e35c0` | 12 | ⭐ 대표 3권 · 하이라이트 판정 합격 (예비 2) |
| 4 | A Day Out | `cf26dae0-eba7-40bb-a4d4-6242b379c1ba` | **8** | ⚠️ 소리 없는 면 4개 — 시연 대표작 부적합 |
| 5 | A very busy day! | `3e219305-97f9-49a7-8a80-0c6767145af7` | 11 | 소리 없는 면 1개 |
| 6 | AAAAAHHH!!!! Mmawe! | `87069ecb-b546-4cbe-b8b4-bca723b43f12` | 12 | |
| 7 | Alex's Super Medicine | `2866e4c4-22f2-4acc-a12c-b88552820fe6` | 12 | |
| 8 | Ann-Nem-Oh-Nee finds Adventure | `c5bbb00e-1d95-405a-bb4f-6b35a27c582e` | 12 | |
| 9 | Auntie Boi's Gift | `6e802972-1993-4171-82e0-4c989d19f97a` | 12 | |
| 10 | Baby Talk | `ecd263ae-03ed-4be9-bc7b-29392fc9bbc1` | 12 | |
| 11 | Baby's First Family Photo | `b799bdd3-5278-4e81-afca-71e1c04dc32d` | 11 | 소리 없는 면 1개 |
| 12 | Banzi's Busy Bees | `aaf10a7e-6b50-4840-8999-3f2c76a2c731` | 12 | |

**검수 상태**: 12권 전부 `book_review.status='confirmed'` (2026-07-22 팀장 검수 완료, `tasks/highlight-tts-plan.json` Phase C). 이 중 **하이라이트 타이밍까지 실화면 판정을 통과한 책은 대표 3권(1~3번)** 이므로, 시연 대표작은 1~3번 중에서 고릅니다.

**예시 (1순위 대표작)**
- 상세: `https://www.hellokiki.co.kr/book/0134f341-7b58-4c7c-b17a-8d4e036dcd72`
- 리더: `https://www.hellokiki.co.kr/book/0134f341-7b58-4c7c-b17a-8d4e036dcd72/read`

---

## 5. 장애 폴백 (시연 중 문제가 생기면)

| 증상 | 즉시 대응 |
|---|---|
| 특정 책의 **오디오가 안 나옴 / 하이라이트가 어긋남** | 말 끊지 말고 **대표 3권(A trip to the tap → Amahle wants to help! → Baby Babble)** 순서로 전환. 리허설 때 셋 다 미리 열어 검증해 둘 것 |
| 화면이 **옛날 상태로 보임**(배지 안 뜸, 수정 전 화면) | **강력 새로고침 `Ctrl + Shift + R`** (Mac은 `Cmd + Shift + R`) |
| 강력 새로고침해도 그대로 | 해당 탭 닫고 **주소 직접 입력해 재진입** → 그래도 안 되면 시크릿 창으로 진입 |
| 책 주소가 **"찾을 수 없는 책이에요"(404)** | 그 책은 아직 공개 상태가 아님. **다른 책으로 전환**하고 시연 후 2-2 SQL로 확인 |
| **소리만 안 남** | 기기 볼륨·무음 모드 → 브라우저 탭 음소거 아이콘 → 하단 재생 버튼 수동 탭 순서로 점검 |
| 자동 넘김이 안 넘어감 | 하단 **"자동 넘김" 토글이 켜져 있는지** 확인. 방금 수동 조작을 했으면 대기 타이머가 취소된 것이므로 재생 버튼을 한 번 탭 |
| 완독 후 **축하 화면이 안 뜸** | 자녀 프로필 선택 상태 확인(2-3). 시연에서는 넘어가고 다른 책으로 진행 |

**공통 원칙**: 시연 중에는 **원인을 찾지 말고 폴백으로 전환**합니다. 원인 조사는 시연 종료 후.

---

## 6. 부록 — 리허설 전 확인 SQL (팀장이 Supabase SQL Editor에서 실행, 읽기 전용)

12권의 **공개 여부 · 배지 표시 조건 · 실제 DB 제목 · 오디오 적재 행 수**를 한 번에 확인합니다.
기대 결과: **12행**, `is_active=true`, `has_audio=true`, `audio_rows`가 4절 "오디오 면" 열과 일치.

```sql
SELECT b.source_id                       AS slug,
       b.title,
       b.id                              AS book_id,
       b.is_active,
       b.has_audio,
       r.status                          AS review_status,
       (SELECT count(*) FROM public.book_audio a
         WHERE a.book_id = b.id AND a.kind = 'page') AS audio_rows
  FROM public.books b
  LEFT JOIN public.book_review r ON r.book_id = b.id
 WHERE b.source_id IN (
   'a-day-out','a-trip-to-the-tap','a-very-busy-day','aaaaahhh-mmawe',
   'alexs-super-medicine','amahle-wants-to-help','ann-nem-oh-nee-finds-adventure',
   'auntie-bois-gift','baby-babble','baby-talk','babys-first-family-photo',
   'banzis-busy-bees')
 ORDER BY b.source_id;
```

**결과별 조치**
- `is_active=false` 인 행이 있으면 → 그 책은 시연 동선에서 제외(또는 서비스 ON 절차 진행)
- `has_audio=false` 인데 `audio_rows>0` 이면 → 카드·상세 배지만 안 보이는 상태(리더 재생은 정상). 시연에서 3-a 배지 확인 단계는 그 책으로 하지 말 것
- `title`이 4절 표와 다르면 → 4절 제목 열을 DB 값 기준으로 정정

---

## 7. 참고 문서

- `docs/adr/0052-demo-tts-scope-reduction.md` — 시연 범위 축소(154→12)·대표 3권·7/27 신규 기능 금지선
- `docs/intent/session-resume-2026-07-23.md` — 직전 진행 상태
- `docs/intent/ux-waves-plan-vs-actual-2026-07-23.md` — Wave 1~1.7b 계획 대비 실제
- `docs/sql/pilot12_danielle_load.sql` · `docs/sql/pilot12_danielle_cover_load.sql` — 오디오 적재 초안
