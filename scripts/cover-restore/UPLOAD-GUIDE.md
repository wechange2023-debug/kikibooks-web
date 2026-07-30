# ASb 745권 표지 업로드 안내서 (팀장용)

> 3단계 2차 (2026-07-30) · 전례: ADR-0032 (Book Dash 206권)
> 순서: **① Storage 업로드 → ② 표본 URL 접근 확인 → ③ SQL 실행(ROLLBACK 시운전 → COMMIT)**
> 워커는 파일만 준비했습니다. 업로드와 SQL 실행은 팀장이 직접 수행합니다.

---

## 준비물 위치

| 파일 | 용도 |
|---|---|
| `scripts/cover-restore/upload/` (745파일) | Storage에 올릴 표지 이미지 — `asb-{N}.png/jpg`, 하위 폴더 없음 |
| `scripts/cover-restore/update-cover-urls.sql` | cover_url 갱신 (백업 테이블 생성 포함, **ROLLBACK으로 끝남**) |
| `scripts/cover-restore/rollback-cover-urls.sql` | 문제 시 이전 값 복원용 (이것도 ROLLBACK으로 끝남) |
| `scripts/cover-restore/cover_url_backup_20260730.csv` | 이전 DB값 로컬 백업 (2026-07-28 실측 기준) |

---

## ① Storage 업로드 (드래그앤드롭)

1. Supabase Dashboard → 왼쪽 메뉴 **Storage** → **`book-covers`** 버킷 클릭
   (기존 Book Dash `bookdash-*.webp` 206개가 이미 있는 버킷입니다. 새 버킷 만들지 마세요.)
2. 버킷 **루트**(폴더 안으로 들어가지 않은 최상위 화면)에서, 탐색기로
   `scripts\cover-restore\upload\` 폴더를 열고 **안의 파일 전체 선택(Ctrl+A) → 드래그앤드롭**
   - 폴더째 끌지 말고 **파일들만** 끌어주세요 (폴더째 끌면 `upload/` 하위 경로가 생겨 URL이 어긋납니다)
   - 745개 한 번에 끌다 브라우저가 버벅이면 **200~300개씩 나눠서** 올려도 됩니다.
     파일명이 전부 고유하므로 순서·중복 걱정 없고, 중간에 끊겨도 이어서 올리면 됩니다.
3. 업로드 완료 후 버킷 파일 수 확인: 기존 206 + 신규 745 = **951개** 근처인지
   (목록이 페이지로 나뉘어 보일 수 있음 — 검색창에 `asb-` 입력해 개수 감 잡는 방법도 있습니다)

## ② 공개 접근 확인 (표본 3건)

브라우저 새 탭에서 아래 3개를 열어 **이미지가 바로 보이면** 통과입니다:

- https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/asb-36111.png (별건 Xam 변종)
- https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/asb-39221.jpg (jpg 표본)
- https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/asb-11932.png (부분결손 → 2번 이미지 승격 건)

JSON 오류(`Object not found`)가 나오면: 파일명 확인(대소문자 포함), 버킷 루트에 올라갔는지(경로에 `upload/`가 끼지 않았는지) 확인하세요.

## ③ SQL 실행 — 2회 실행 방식

Dashboard → **SQL Editor** → `update-cover-urls.sql` 내용 전체 붙여넣기.

**1회차 (시운전 — 파일 그대로 실행):**
- 파일이 `ROLLBACK;`으로 끝나므로 **실제 변경 없이** 결과만 확인됩니다.
- 확인할 것: `backup_count = 745` / `updated_total = 745` / `updated_in_backup = 745`,
  표본 5건의 old_url → new_url이 그럴듯한지.

**2회차 (확정):**
- 맨 마지막 줄 `ROLLBACK;` 을 **`COMMIT;`** 으로 바꿔 다시 실행.
- 실행 후 화면(홈/서재)에서 ASb 표지가 보이는지 육안 확인.

⚠ 주의: 2회차 실행 시 `CREATE TABLE cover_url_backup_20260730`이 다시 실행됩니다.
1회차가 ROLLBACK으로 끝났으면 테이블이 남아있지 않아 문제없습니다.
만약 "already exists" 오류가 나면 이전 실행이 COMMIT됐다는 뜻이니 중단하고 상태를 확인하세요.

## 문제 시 복원

- `cover_url_backup_20260730` 테이블이 살아 있으면 (가장 정확):
  ```sql
  BEGIN;
  UPDATE books b SET cover_url = bk.cover_url
  FROM cover_url_backup_20260730 bk WHERE b.id = bk.id;
  COMMIT;
  ```
- 테이블이 없으면 `rollback-cover-urls.sql` 사용 (2026-07-28 실측 DB값으로 복원,
  역시 ROLLBACK으로 끝나므로 확인 후 COMMIT으로 바꿔 실행).
- Storage의 asb-* 파일은 롤백해도 그대로 둬도 무방합니다 (참조만 끊김 — ADR-0032 원칙).
