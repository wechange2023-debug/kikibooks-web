# TTS 전량 생성 실행 절차 (Book Dash 116권 · Danielle long-form)

> 대상: **팀장**. 실행 주체는 팀장 PowerShell이다. 워커는 AWS 키를 수령하지 않는다(ADR-0053 D2).
> 근거 ADR: `docs/adr/0053-bookdash-full-tts-expansion.md` (+ Amendment #1로 표지 포함 확정).
> 확정 사양: **Danielle / long-form / us-east-1 / atempo 0.85 / 표지 포함 / 116권**.

## 0. 이 절차가 하는 일 / 하지 않는 일

| 한다 | 하지 않는다 |
|---|---|
| Polly 호출로 mp3 + word marks 로컬 생성 | Storage 업로드 |
| 권별 `_manifest.json` 기록 | `book_audio` INSERT · `books.has_audio` 갱신 |
| 배치 요약 `out/_fullbatch_report.json` 기록 | DB 쓰기 일체 |

업로드·DB 적재는 **다음 지시서**에서 별도로 다룬다.

---

## 1. 실행 전 확인 (1회)

```powershell
cd E:\claude-code\kikibooks_platform
python -c "import boto3, imageio_ffmpeg; print('deps ok')"
```

`deps ok`가 출력되지 않으면 아래를 먼저 실행한다.

```powershell
pip install boto3 imageio-ffmpeg
```

---

## 2. AWS 키 임시 주입

⚠ **이 창에서만 유효한 임시 주입이다.** 창을 닫으면 사라진다.
`setx`(영구 저장)를 쓰지 말 것. 값은 팀장만 알고 있으며 **어떤 문서·로그·커밋에도 남기지 않는다.**

```powershell
$env:AWS_ACCESS_KEY_ID     = "<AWS_ACCESS_KEY_ID 값>"
$env:AWS_SECRET_ACCESS_KEY = "<AWS_SECRET_ACCESS_KEY 값>"
$env:AWS_DEFAULT_REGION    = "us-east-1"
```

주입 확인 — **키 값 자체를 출력하지 않고** 설정 여부만 본다.

```powershell
if ($env:AWS_ACCESS_KEY_ID -and $env:AWS_SECRET_ACCESS_KEY) { "AWS 키 주입됨" } else { "미주입" }
```

> 스크립트는 boto3 기본 자격증명 체인을 쓴다. `~/.aws/credentials`에 이미 프로파일이 있으면
> 위 주입 없이도 동작한다. 리전은 코드가 `us-east-1`로 오버라이드하므로 `~/.aws` 설정은 건드리지 않는다.

---

## 3. 실제 생성 실행 (드라이런 아님)

```powershell
python scripts/tts_pilot/run_tts_fullbatch.py --with-cover
```

- 대상 116권 · 유닛 1,464개(본문 1,348 + 표지 116).
- 소요는 유닛당 수 초 — **1~2시간 규모**다. 창을 닫지 말 것.
- 산출물: `scripts/tts_pilot/out/audio_full_danielle/{slug}/pNN.mp3` · `pNN.marks.json` · `cover.mp3` · `cover.marks.json` · `_manifest.json`
- 원속도 원본은 `out/audio_full_danielle/_raw/{slug}/`에 보존된다(디버그용).

로그를 파일로 남기려면:

```powershell
python scripts/tts_pilot/run_tts_fullbatch.py --with-cover 2>&1 | Tee-Object -FilePath scripts\tts_pilot\out\_fullbatch_run.log
```

---

## 4. 중간 실패 시 재개

**같은 명령을 그대로 다시 실행하면 된다.**

```powershell
python scripts/tts_pilot/run_tts_fullbatch.py --with-cover
```

재개 판정 기준 — **로컬 산출물 기준이지 `book_audio` 기준이 아니다.**

- 유닛의 `pNN.mp3`와 `pNN.marks.json`이 **둘 다 존재하고 둘 다 0바이트가 아니면** 건너뛴다(Polly 재호출 없음 = 재과금 없음).
- 둘 중 하나만 있거나 0바이트면 **다시 합성**한다. mp3는 썼는데 marks를 쓰기 전에 끊긴 경우가 여기 해당한다.
- 콘솔에 `units=N (재사용 M)`으로, 리포트에는 `reused_units`로 표시된다.

> **왜 `book_audio` 기준이 아닌가**: 이 스크립트는 DB에 쓰지 않는다. 중단 시점까지 만든 것은
> DB에 없고 디스크에만 있다. `book_audio` 조회는 *대상 선정* 단계에서 "이미 적재 완료된 권"을
> 빼는 데만 쓰인다(현재 12권).

전량 다시 만들어야 할 때만:

```powershell
python scripts/tts_pilot/run_tts_fullbatch.py --with-cover --force
```

특정 권만 다시:

```powershell
python scripts/tts_pilot/run_tts_fullbatch.py --with-cover --force --slugs egg,best-friends
```

---

## 5. 종료 후 결과 확인

```powershell
cd E:\claude-code\kikibooks_platform

# 5-1. 생성 파일 수 (기대: mp3 1464 / marks 1464)
$root = "scripts\tts_pilot\out\audio_full_danielle"
"mp3   : " + (Get-ChildItem $root -Recurse -Filter *.mp3 | Where-Object { $_.FullName -notlike "*\_raw\*" }).Count
"marks : " + (Get-ChildItem $root -Recurse -Filter *.marks.json | Where-Object { $_.FullName -notlike "*\_raw\*" }).Count
"권수  : " + (Get-ChildItem $root -Directory | Where-Object { $_.Name -ne "_raw" }).Count

# 5-2. 실패 목록·요약
$r = Get-Content scripts\tts_pilot\out\_fullbatch_report.json -Raw -Encoding UTF8 | ConvertFrom-Json
"성공 {0}권 / 실패 {1}권 / 총 {2}유닛 (재사용 {3})" -f $r.books_ok, $r.books_failed, $r.total_units, $r.reused_units
if ($r.books_failed -gt 0) { "실패 권: " + ($r.failed_books -join ", ") }

# 5-3. 0바이트 산출물 (있으면 안 됨)
Get-ChildItem $root -Recurse -File | Where-Object { $_.Length -eq 0 } | Select-Object FullName
```

**정상 판정 기준**

| 항목 | 기대값 |
|---|---|
| 권 폴더 수 | 116 |
| mp3 수 (`_raw` 제외) | 1,464 |
| marks 수 (`_raw` 제외) | 1,464 |
| `books_failed` | 0 |
| 0바이트 파일 | 0건 |

실패가 남으면 5-2의 실패 권 목록으로 4절 재개 명령을 돌린다. 2회 재시도 후에도 같은 권이
실패하면 **중단하고 로그와 함께 보고**한다.

---

## 6. 마친 뒤 — 세션 종료

```powershell
Remove-Item Env:\AWS_ACCESS_KEY_ID, Env:\AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
```

이 창을 닫아도 동일하다. 다음 단계(업로드 · `book_audio` 적재)는 별도 지시서를 기다린다.
