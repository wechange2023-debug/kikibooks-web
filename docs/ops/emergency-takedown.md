# 운영 가이드 — 도서 긴급 내림 (Emergency Takedown)

**상태** 운영 절차 (2026-07-01 제정)
**관련** `docs/adr/0033-catalog-data-caching-strategy.md`(카탈로그 캐싱·Amendment #1 즉시 무효화),
`docs/guidelines/license-rules.md`(§라이선스 감사 — 위반 시 `is_active=false` 즉시 비활성화),
`claude.md` 2절 Hard Rule 3·4(NC/ND·미협상 IP 차단), `lib/book/detail.ts`(getBookById 캐시),
`lib/admin/books/actions.ts`(is_active 토글)

> ⚠️ **DB 직접 쓰기는 팀장만** — 워커는 DB write 불가. 아래 SQL은 팀장이 Supabase Dashboard
> → SQL Editor에서 직접 실행한다(워커는 텍스트만 제공).

---

## 1. 언제 쓰는가

라이선스 위반·부적절 콘텐츠 등으로 **특정 도서를 즉시 노출 중단**해야 할 때. 근거:
- `docs/guidelines/license-rules.md` — 외부 출처의 라이선스가 바뀌어 위반이 감지되면
  해당 책을 `is_active = false`로 **즉시 비활성화**한다.
- claude.md Hard Rule 3·4 — NC/ND·미협상 IP는 어떤 형태도 노출 금지. 발견 즉시 차단.

**차단 수단 = `is_active = false`**. 목록·상세·뷰어 6표면이 모두 `is_active=true`만 노출하므로,
이 한 컬럼으로 전 표면에서 사라진다.

## 2. ★캐시 때문에 "즉시"가 자동이 아니다 (반드시 이해)

`ADR-0033`으로 책 상세(`getBookById`)가 **캐시**된다(tag `books-catalog`, revalidate **3600초**).
즉 `is_active=false`로 바꿔도 **캐시가 살아있는 동안(최대 1시간) `/book/[id]`가 이전 상태(그
책을 노출)를 계속 보여줄 수 있다.** 이는 캐싱의 트레이드오프이며, 아래 절차로 **즉시 무효화**한다.

> **주의**: 팀장이 SQL Editor에서 `is_active`를 직접 바꾸면 앱을 거치지 않으므로, 앱의 자동
> 태그 무효화(admin UI 토글 시 발동)가 걸리지 않는다. 그래서 아래 3단계(캐시 비우기)가 필요하다.

## 3. 긴급 내림 절차

### 1단계 — 책 비활성화 (팀장, SQL Editor)

```sql
-- <BOOK_ID>를 대상 도서의 books.id(UUID)로 치환. 실행 전 대상 확인:
SELECT id, title, source_platform, license, is_active
FROM books WHERE id = '<BOOK_ID>';

-- 비활성화:
UPDATE books SET is_active = false WHERE id = '<BOOK_ID>';
```

> 여러 권을 한 번에 내릴 때는 `WHERE id IN ('<ID1>','<ID2>', ...)` 또는 조건(예:
> `WHERE source_platform = '<...>' AND ...`)을 쓰되, **실행 전 반드시 SELECT로 대상 범위를 확인**한다.

### 2단계 — 캐시 즉시 비우기 (즉시 반영)

`is_active=false`만으로는 최대 1시간 지연될 수 있으므로, 다음 중 하나로 캐시를 즉시 무효화한다.

| 수단 | 방법 | 특성 |
|---|---|---|
| **1차 — admin "카탈로그 캐시 비우기" 버튼** | 관리자로 로그인 → `/admin/books` → **"카탈로그 캐시 비우기"** 클릭 | `revalidateTag('books-catalog')` 호출 → 책 상세 캐시 즉시 무효화. 가장 빠름·가벼움. 관리자 인증 뒤에서만 동작 |
| **백업 — 재배포** | Vercel에서 재배포(또는 새 커밋 배포) | 전체 데이터 캐시 초기화 → 즉시 반영. 버튼이 없거나 실패할 때. 수 분 소요 |

> admin UI에서 **토글로** 내리는 경우(SQL 대신 admin 화면의 is_active 토글 사용)는 토글 자체가
> `revalidateTag('books-catalog')`를 동반하므로 **2단계가 자동으로 포함**된다(별도 버튼 클릭 불요).
> 위 절차는 팀장이 **SQL로 직접** 내리는 주경로를 위한 것이다.

### 3단계 — 반영 확인

- 대상 도서의 `/book/<BOOK_ID>` 및 `/book/<BOOK_ID>/read`에 접속 → **`notFound`(책을 찾을 수
  없음)** 로 바뀌면 정상. (getBookById가 `is_active=true`만 반환하므로 캐시 무효화 후 null → notFound.)
- 목록(`/library`)·홈에서도 사라졌는지 확인.

## 4. 요약 흐름

```
문제 도서 발견
  → [1] SQL: UPDATE books SET is_active=false WHERE id='<BOOK_ID>'   (팀장, SQL Editor)
  → [2] 캐시 비우기: admin "카탈로그 캐시 비우기" 버튼 (1차)  또는  재배포 (백업)
  → [3] /book/<id> 가 notFound 로 바뀌는지 확인
```

캐시 비우기를 생략하면 최대 1시간 뒤 시간 기반 revalidate로 결국 반영되나, **긴급 시에는 반드시
2단계를 수행**한다(Hard Rule 3·4 — 즉시 차단 규율).

---

*문서 끝. 캐시 무효화 수단(admin 버튼·revalidateTag)의 설계 근거는 ADR-0033 Amendment #1 참조.*
