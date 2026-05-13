# Supabase Migrations

키키북스 데이터베이스 스키마 변경의 단일 진실 공급원입니다.
**모든 스키마 변경은 새 마이그레이션 파일로 기록**합니다 (`claude.md` 2절 Hard Rule 8).

---

## 실행 순서

마이그레이션은 **숫자 prefix 오름차순**으로 한 번씩만 실행합니다.

| 순서 | 파일 | 내용 |
|---|---|---|
| 1 | `001_initial_schema.sql` | 6개 테이블 + 라이선스 트리거 + RLS 정책 + 인덱스 |
| 2 | `002_*.sql` | (향후) 협상 라이선스 추가 등 |
| 3 | `003_*.sql` | (향후) 뱃지·스트릭 RPC 등 |

> 한 번 실행한 마이그레이션은 **재실행 금지**. 변경이 필요하면 새 파일을 추가합니다.

---

## 명명 규칙

```
NNN_<목적>.sql
```

- `NNN` — 3자리 0-패딩 (`001`, `002`, ..., `099`, `100`)
- `<목적>` — kebab-case 영문, 예: `add_jybooks_license_codes`, `create_streak_rpc`

각 파일 첫 줄에 다음 메타정보를 헤더 주석으로 포함합니다.

```sql
-- 목적: 한 줄 설명
-- ADR: docs/adr/0NNN-*.md 참조
-- 적용일: 본 파일을 Supabase에 실행한 날짜 (실행 후 추가)
```

---

## Dashboard에서 실행하는 방법 (단계별)

비개발자 사용자 기준 안내입니다.

1. **Supabase Dashboard 접속**
   → https://supabase.com/dashboard → 키키북스 프로젝트 선택

2. **SQL Editor 열기**
   → 좌측 사이드바 → `SQL Editor` 아이콘 클릭

3. **새 쿼리 시작**
   → 우측 상단 `+ New query` 버튼

4. **마이그레이션 파일 내용 복사**
   → VS Code 또는 GitHub에서 `supabase/migrations/001_initial_schema.sql` 파일 전체를 선택 (Ctrl+A) → 복사 (Ctrl+C)

5. **SQL Editor에 붙여넣기**
   → SQL Editor 입력창에 붙여넣기 (Ctrl+V)

6. **실행**
   → 우측 하단 `Run` 버튼 (또는 Ctrl+Enter)

7. **결과 확인**
   → 하단 결과 창에 `Success. No rows returned` 메시지가 표시되면 성공
   → 에러가 발생하면 메시지를 그대로 캡처해 Claude Code에 보고

8. **테이블 확인**
   → 좌측 사이드바 → `Table Editor` → 6개 테이블이 보이는지 확인:
      `profiles`, `children`, `books`, `reading_sessions`, `favorites`, `child_badges`

9. **자동 검증 실행**
   → 로컬 터미널에서:
   ```
   pip install supabase python-dotenv --break-system-packages
   python scripts/verify_schema.py
   ```
   → 5가지 검증이 모두 ✅로 통과하는지 확인

---

## 자주 묻는 질문

**Q. 잘못 실행해서 다시 처음부터 시작하고 싶어요.**
A. Supabase Dashboard → Settings → General → 프로젝트를 새로 만드는 것이 가장 안전합니다. SQL `DROP TABLE`은 추천하지 않습니다 (데이터 복구 불가능).

**Q. 마이그레이션 실행 시 권한 오류가 나요.**
A. SQL Editor는 기본적으로 `postgres` 역할로 실행됩니다. 권한 문제가 발생할 수 없는 환경입니다. 다른 오류 메시지일 가능성이 높습니다.

**Q. 트리거를 임시로 끄고 NC 콘텐츠를 한 번만 넣어보고 싶어요.**
A. **절대 금지** (`claude.md` 2절 Hard Rule 2). 트리거는 법적 안전망입니다. NC 콘텐츠가 1건이라도 들어오면 라이선스 위반입니다.

---

## 후속 마이그레이션 작성 시 체크리스트

새 마이그레이션을 추가할 때:

- [ ] 새로운 ADR 작성 (`docs/adr/`) — Hard Rule 8
- [ ] 파일명 규칙 준수 (`NNN_*.sql`)
- [ ] `enforce_commercial_license` 트리거를 건드리지 않음
- [ ] `attribution_text` NOT NULL 제약을 건드리지 않음
- [ ] 새 테이블 추가 시 RLS 정책 동시 작성
- [ ] 인덱스 영향 검토
- [ ] `scripts/verify_schema.py`에 검증 항목 추가 (필요 시)
