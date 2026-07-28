# TTS 전량 업로드·적재 절차 (Book Dash 116권 · Danielle)

> 대상: **팀장**. 실행 주체는 팀장 PowerShell + Supabase SQL Editor다.
> 앞 단계: `docs/ops/tts-fullbatch-run.md`(로컬 생성) — **완료됨**(성공 116 / 실패 0 / 1,464유닛).
> 근거 ADR: `0053`(전량 확장) · `0034`(결정 ①②③ + Amd#1 표지 · Amd#2 성우 층위) · `0052` Amd#2.

## 0. 이 절차가 하는 일 / 하지 않는 일

| 한다 | 하지 않는다 |
|---|---|
| 로컬 mp3·marks → Storage `book-audio` 업로드 | Polly 재호출(비용 0) |
| 업로드 개수·경로 검증 | `books.is_active` 변경 |
| `book_audio` 적재 SQL **실행**(팀장, SQL Editor) | 워커의 DB 쓰기 |

**실행 순서는 ① 업로드 → ② 업로드 검증 → ③ SQL 적재** 이며, 순서를 바꾸면 안 된다.
③을 먼저 하면 DB 행은 생기는데 오브젝트가 없어 **리더가 깨진 채로 열린다**.

**규모 요약**

| | 값 |
|---|---:|
| 대상 권수 | 116 |
| 유닛(= mp3 1개 + marks 1개) | 1,464 (본문 1,348 + 표지 116) |
| **업로드 파일 수** | **2,928** (= 1,464 × 2) |
| `book_audio` INSERT 행 | 1,464 |

---

## 1. 사전 점검 (1회)

```powershell
cd E:\claude-code\kikibooks_platform
python -c "import supabase; print('deps ok')"
```

`deps ok`가 안 나오면:

```powershell
pip install supabase
```

로컬 산출물이 온전한지 먼저 확인한다 — **자격증명 없이 동작한다.**

```powershell
python scripts\tts_pilot\upload_tts_fullbatch.py --dry-run
```

마지막 줄이 아래와 같아야 한다. 다르면 **여기서 멈추고** 워커에게 알린다.

```
[합계] 116권 / 업로드 항목 2928개 ...
[DRY-RUN] 경로·로컬존재 확인 전용 — 업로드 없이 종료.
```

`[STOP] 이상 N건`이 뜨면 진행하지 않는다(빈 파일·누락 파일이 있다는 뜻).

---

## 2. Supabase 키 임시 주입

⚠ **이 창에서만 유효한 임시 주입이다.** 창을 닫으면 사라진다.
`setx`(영구 저장)를 쓰지 말 것. 값은 팀장만 알고 있으며 **어떤 문서·로그·커밋에도 남기지 않는다.**
워커는 이 값을 수령하지 않는다(ADR-0003 · Hard Rule 6).

```powershell
$env:SUPABASE_URL        = "<Supabase 프로젝트 URL>"
$env:SUPABASE_SECRET_KEY = "<secret 키 값>"
```

주입 확인 — **값을 출력하지 않고** 설정 여부만 본다.

```powershell
"URL set : " + [bool]$env:SUPABASE_URL
"KEY set : " + [bool]$env:SUPABASE_SECRET_KEY
```

둘 다 `True`여야 한다.

---

## 3. 업로드

### 3-1. 소규모 선행 (권장)

먼저 3권만 올려 경로·권한을 확인한다.

```powershell
python scripts\tts_pilot\upload_tts_fullbatch.py --limit 3
```

마지막 두 줄에서 `실패 0`과 `성공+스킵 = 기대치` 일치를 확인한다.

### 3-2. 전량

```powershell
python scripts\tts_pilot\upload_tts_fullbatch.py
```

- 이미 올라간 키는 **자동 skip**된다 → 3-1에서 올린 3권은 건너뛴다.
- 중간에 끊기면 **같은 명령을 다시 실행**하면 된다(남은 것만 올라간다).
- 실패가 있으면 실패 키를 출력하고 종료 코드 1을 반환한다. 재실행하면 실패분만 재시도한다.

기대 종료 출력:

```
[업로드] 성공 2928 / 스킵(이미 존재) 0 / 실패 0
[합계 확인] 성공+스킵 = 2928 (기대 2928)
```

> 3-1을 먼저 했다면 `성공 2928-N / 스킵 N`으로 갈리고, **합계 2928**은 그대로다.

---

## 4. 업로드 검증 (③ 진입 전 필수 관문)

### 4-1. 로컬 개수 재확인

```powershell
$root = "scripts\tts_pilot\out\audio_full_danielle"
"mp3   : " + (Get-ChildItem $root -Recurse -Filter *.mp3        | Where-Object { $_.FullName -notlike "*\_raw\*" }).Count
"marks : " + (Get-ChildItem $root -Recurse -Filter *.marks.json | Where-Object { $_.FullName -notlike "*\_raw\*" }).Count
```

기대: **mp3 1464 / marks 1464** (합 2,928 = 업로드 항목 수).

### 4-2. Storage 실제 개수 대조

업로더를 **다시 실행**하는 것이 가장 확실한 대조다. 전부 이미 존재하면 업로드 0건·스킵 2,928건이 된다.

```powershell
python scripts\tts_pilot\upload_tts_fullbatch.py
```

기대:

```
[업로드] 성공 0 / 스킵(이미 존재) 2928 / 실패 0
[합계 확인] 성공+스킵 = 2928 (기대 2928)
```

**`성공 0 / 스킵 2928`이 아니면 ③으로 넘어가지 않는다.**

### 4-3. 공개 URL 표본 확인 (선택)

임의 1권의 표지·첫 면이 실제로 열리는지 본다. `<프로젝트>`만 바꿔 넣는다.

```powershell
$base = "$env:SUPABASE_URL/storage/v1/object/public/book-audio"
foreach ($k in @("book_dash-best-friends/danielle/cover.mp3",
                 "book_dash-best-friends/danielle/p01.mp3",
                 "book_dash-best-friends/danielle/p01.marks.json")) {
  $r = Invoke-WebRequest -Uri "$base/$k" -Method Head -SkipHttpErrorCheck
  "{0}  {1}  {2}" -f $r.StatusCode, $r.Headers.'Content-Type', $k
}
```

기대: `200 audio/mpeg` × 2, `200 application/json; charset=utf-8` × 1.

---

## 5. `book_audio` 적재 (Supabase SQL Editor)

파일: **`docs/sql/fullbatch116_danielle_load.sql`** (워커 생성, 1,464행 INSERT)

### 5-1. 실행 방법

1. Supabase Dashboard → **SQL Editor** → New query
2. 위 파일 **전체**를 붙여넣는다(`BEGIN;` ~ `COMMIT;`).
3. **[0] 사전검증 블록만 먼저 실행**해 수치를 확인한다.

   | 항목 | 기대 |
   |---|---:|
   | `danielle_books` / `danielle_rows` | 12 / 150 |
   | `page_rows` / `cover_rows` | 138 / 12 |
   | `ruth_books` / `ruth_rows` | 44 / 574 |
   | `target_books_found` | **116** |

   `danielle_*`가 12/150이 아니면 **이미 일부 적재된 상태**다. `ON CONFLICT DO UPDATE`라 그대로 진행해도
   안전하지만, 원인(중복 실행? 다른 배치?)을 먼저 확인한다.
   `target_books_found`가 116이 아니면 **중단하고 워커에게 알린다**(대상 책이 DB에서 사라졌다는 뜻).

4. 문제없으면 전체를 실행한다.

### 5-2. 사후 검증 (SQL 안에 포함되어 있음)

> SQL Editor는 결과를 **100행까지만** 표시한다. 그래서 모든 검증문을 `COUNT` 기반으로 작성했다 —
> 행을 나열하지 않으므로 잘려서 오판할 일이 없다.

| 검증문 | 기대 |
|---|---:|
| `danielle_books` / `danielle_rows` | **128 / 1614** |
| `page_rows` / `cover_rows` | **1486 / 128** |
| `books_missing_cover` | **0** |
| `bad_path` (버킷명 혼입·성우 층위 누락) | **0** |
| `ruth_books` / `ruth_rows` | 44 / 574 (변화 없음) |

> 128 = 이번 116권 + 기존 파일럿 12권. 1614 = 1,464 + 150. 두 코호트는 **교집합이 없어** 단순 합이다.

### 5-3. 선택 단계 [2]·[3]

- **[2] `books.has_audio = true`** — 2026-07-28 기준 **앱에서 이 컬럼을 읽는 코드가 0건**이다.
  배지·리더 게이트 전부 `book_audio` 행 존재로 판정하므로(`selectReaderAudioBookIds`),
  이 UPDATE는 화면에 아무 영향이 없다. SQL 레벨 정합용이며 **생략해도 무방**하다.
- **[3] `book_review.status` confirmed → tts_done** — 현재 status 분포는 DB만 안다.
  SQL 안의 분포 조회를 **먼저 실행**해 confirmed 권수를 확인한 뒤 UPDATE 여부를 판단한다.

### 5-4. 되돌리기

- `COMMIT;` 전이면 `ROLLBACK;`.
- 커밋 후라면 `[0]`의 116개 UUID 목록으로 한정해 삭제한다 — **파일럿 12권을 지우지 않도록** 반드시 범위를 건다.
  ```sql
  DELETE FROM public.book_audio
   WHERE voice = 'danielle' AND book_id IN ( /* [0]의 116개 UUID */ );
  ```

---

## 6. 완료 후 확인 (화면)

적재가 끝나면 116권이 **오디오 리더**로 열린다(기존 iframe/AsbReader 경로가 아니라).

1. `/admin/books`에서 대상 책 썸네일에 **오디오 배지**가 뜨는지
2. 썸네일 클릭 → 새 탭에서 **오디오 리더**가 열리고 재생·하이라이트가 동작하는지
3. 책 상세에 **"듣기 지원"** 칩이 뜨는지

배지가 안 보이면 카탈로그 캐시(1시간) 때문일 수 있다 — `/admin/books`의
**「카탈로그 캐시 비우기」** 버튼을 누르면 즉시 반영된다.

---

## 7. 산출물 대조표 (워커 검증 완료 · 2026-07-28)

| 항목 | 값 | 근거 |
|---|---:|---|
| `_fullbatch_report.json` books_ok / failed | 116 / 0 | 리포트 |
| total_units | 1,464 | 리포트 |
| 디스크 권 폴더(`_raw` 제외) | 116 | 리포트 slug 집합과 **완전 일치** |
| 디스크 mp3 / marks(`_raw` 제외) | 1,464 / 1,464 | 실측 |
| 누락·0바이트 파일 | 0 | 실측 |
| 표지 없는 권 | 0 | 매니페스트 units[] |
| 권 내 (kind, page_index) 중복 | 0 | 생성기 `verify_units` |
| SQL VALUES 행 | 1,464 (page 1,348 + cover 116) | 생성 SQL 파싱 |
| SQL 대상 book_id 집합 | 리포트 116과 **완전 일치** | 생성 SQL 파싱 |
| 파일럿 12권 ∩ 본 116권 | **0** (UNIQUE 충돌 없음) | slug 집합 대조 |
