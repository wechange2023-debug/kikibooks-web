# 라이선스 및 어트리뷰션 규칙 (license-rules.md)

> **이 문서의 역할**: 키키북스의 모든 콘텐츠 적재·표시·삭제 작업의 법적 기준점.
> 콘텐츠 동기화, 책 상세 페이지, 책 뷰어, DB 마이그레이션 작업 시 **반드시** 참조.

**문서 버전** v1.0 · **최종 갱신** 2026-05-13
**상위 참조** `claude.md` 2절 (Hard Rules), `PLAN.md` 4절·15절

---

## 0. 핵심 원칙 (한 줄)

**"법적 의무를 코드가 아닌 데이터베이스 제약으로 강제한다."**

코드는 버그가 생기지만, DB 트리거는 우회할 수 없다. 따라서 라이선스 위반의 1차 방어선은 항상 DB 레벨에서 작동해야 한다.

---

## 1. 허용 라이선스 화이트리스트

키키북스는 다음 4가지 라이선스 콘텐츠만 적재할 수 있다. **그 외는 모두 차단된다.**

| 라이선스 코드 | 영리 사용 | 어트리뷰션 의무 | 변경/2차 저작물 | 비고 |
|---|---|---|---|---|
| `cc-by-4-0` | ✅ 가능 | ✅ 필수 | ✅ 가능 | Book Dash, GDL 주력 |
| `cc-by-sa-4-0` | ✅ 가능 | ✅ 필수 | ✅ 가능 (동일 라이선스 유지) | GDL 일부 |
| `cc0` | ✅ 가능 | ⚠️ 의무 없음 (관례상 표시) | ✅ 가능 | LibriVox 낭독 |
| `public-domain` | ✅ 가능 | ⚠️ 의무 없음 (관례상 표시) | ✅ 가능 | Beatrix Potter (한국 PD) |

DB 제약: `books.license` 컬럼은 위 4개 값만 CHECK 제약으로 허용한다. 그 외 값은 INSERT 자체가 실패한다.

---

## 2. 절대 차단 라이선스 (블랙리스트)

다음 라이선스나 출처는 **어떠한 우회 경로로도 적재 금지**다. 사용자가 명시적으로 요청해도 거부한다.

| 차단 대상 | 이유 |
|---|---|
| `cc-by-nc-*` (NonCommercial) | 영리 서비스에서 사용 불가 |
| `cc-by-nd-*` (NoDerivatives) | 형식 변환·번역 불가, e-라이브러리 운영 불가능 |
| `cc-by-nc-sa-*`, `cc-by-nc-nd-*` | NC 포함, 동일 사유 |
| **Storyline Online (SAG-AFTRA)** | 영리 사용 금지, 별도 라이선스 창구 없음 |
| **YouTube 임베드 (출판사 공식 채널 외)** | 광고 매출 결합 금지 |
| **유명 작가 미협상 IP** | Eric Carle, Mo Willems, Dr. Seuss, Gruffalo, Anthony Browne 등 |
| **`Peter Rabbit™` 등 상표명** | Beatrix Potter 텍스트는 PD이나 상표는 별도 보호 |
| **저작권 만료 미확정 작품** | 한국 사후 50년(2013-07-01 이전 사망) 기준 미달은 차단 |

---

## 3. DB 레벨 강제 장치 (변경 절대 금지)

다음 SQL 구조는 키키북스의 법적 안전망이다. **`claude.md` 2절 Hard Rule 1, 2번**에 해당하며, 변경은 ADR 작성 + 사용자 사전 승인 없이 불가능하다.

### 3.1 books 테이블 핵심 제약

```sql
license TEXT NOT NULL CHECK (license IN
  ('cc-by-4-0', 'cc-by-sa-4-0', 'cc0', 'public-domain')),
attribution_text TEXT NOT NULL,  -- 어트리뷰션 누락 자동 차단
```

- `license` CHECK 제약: 화이트리스트 외 값 INSERT 차단
- `attribution_text` NOT NULL: 어트리뷰션 누락 시 INSERT 자체 실패

### 3.2 상업 사용 강제 트리거

```sql
CREATE OR REPLACE FUNCTION enforce_commercial_license()
RETURNS trigger AS $$
BEGIN
  IF NEW.license NOT IN ('cc-by-4-0', 'cc-by-sa-4-0', 'cc0', 'public-domain') THEN
    RAISE EXCEPTION '상업 사용 불가 라이선스 차단: %', NEW.license;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER books_license_check
BEFORE INSERT OR UPDATE ON books
FOR EACH ROW EXECUTE FUNCTION enforce_commercial_license();
```

**이 트리거는 절대 DROP하거나 DISABLE하지 않는다.** 코드 버그로 NC 라이선스가 들어와도 DB가 마지막 방어선이다.

---

## 4. 어트리뷰션 텍스트 작성 규칙 (CC BY 4.0 법적 요건)

CC BY 4.0은 다음 4가지를 모두 표시해야 라이선스가 유지된다. 하나라도 빠지면 **라이선스 자동 종료 + 법적 분쟁 위험**.

### 4.1 필수 4요소

1. **저작자(author) 이름** — 글쓴이, 그린이 모두
2. **저작물 제목(title)** — 원제 그대로
3. **라이선스 종류 + 라이선스 URL** — `CC BY 4.0` 및 `https://creativecommons.org/licenses/by/4.0/`
4. **원본 출처 URL** — 사용자가 원본을 찾아갈 수 있는 영구 링크

### 4.2 `attribution_text` 컬럼 표준 포맷

```
"{title}" by {author} (illustrated by {illustrator}), {source_platform}.
Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Original: {original_url}
```

**예시 (Book Dash)**:
```
"Anna and the Magic Mirror" by Sandiso Ngcobo (illustrated by Magriet Brink), Book Dash.
Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Original: https://bookdash.org/books/anna-and-the-magic-mirror/
```

**예시 (Beatrix Potter, Public Domain)**:
```
"The Tale of Peter Rabbit" by Beatrix Potter, Public Domain (Korea, deceased 1943).
Original text source: Project Gutenberg (https://www.gutenberg.org/ebooks/14838).
```
※ Public Domain은 라이선스 URL 불필요. 대신 PD 근거를 명시.

### 4.3 변환 규칙

콘텐츠 동기화 스크립트는 다음 매핑으로 `attribution_text`를 자동 생성한다:

| 소스 플랫폼 | author 필드 | illustrator 필드 | 라이선스 URL |
|---|---|---|---|
| `book_dash` | `creator` API 필드 | `illustrator` API 필드 | CC BY 4.0 URL 고정 |
| `gdl` | `publisher` API 필드 (실측: GDL 응답에 authors/illustrators 미제공, ADR-0007 §4.1·4.2 참조) | (없음) | `license[0].slug` API 필드 (예: `cc-by-4-0`) |
| `librivox` | `authors[]` 첫 항목 | (없음, "Audio narration by {readers}") | CC0 URL |
| `pg` (Project Gutenberg) | `author` 필드 | (PD 작품 대부분 없음) | PD 근거 |

---

## 5. AttributionBox 컴포넌트 필수 표시 규칙

`docs/intent/screen-03-book-detail.md`와 연동되는 UI 규칙. **모든 책 상세 페이지에 100% 표시 의무**.

### 5.1 표시 항목 (최소)

```
📚 출처: {source_platform 한국어명}
✍️ 글: {author}
🎨 그림: {illustrator}     ← 없으면 행 자체 생략
📜 라이선스: {license 한국어명} (링크는 외부 새 탭)
🔗 원본 보기 (new tab, rel="noopener noreferrer")
```

### 5.2 컴포넌트 구현 강제 조항

- `AttributionBox` 컴포넌트는 `book.attribution_text`를 **필수 prop**으로 받는다 (`required` 타입)
- prop 누락 시 TypeScript 컴파일 에러 발생 (사실상 빌드 차단)
- 책 상세 페이지 JSX에서 `AttributionBox` 호출이 없으면 페이지 자체가 렌더되지 않도록 설계

### 5.3 표시 위치

- 책 표지 이미지 직하단, 읽기 버튼 직상단
- 모바일(390px)에서도 절대 fold 아래(스크롤 영역)로 내려가지 않도록 배치
- 폰트 크기 최소 12px, 색상 대비 WCAG AA 이상

---

## 6. 정기 라이선스 감사 (Verification)

`claude.md` 7절 검증 자동화와 연동된다.

### 6.1 매 페이즈 완료 시 자동 실행

```sql
-- 검증 1: 어트리뷰션 누락 확인 (결과 0이어야 함)
SELECT COUNT(*) FROM books WHERE attribution_text IS NULL;

-- 검증 2: NC 라이선스 침입 확인 (결과 0이어야 함)
SELECT COUNT(*) FROM books WHERE license LIKE '%nc%' OR license LIKE '%nd%';

-- 검증 3: 빈 attribution_text 확인 (결과 0이어야 함)
SELECT COUNT(*) FROM books WHERE attribution_text = '' OR LENGTH(attribution_text) < 50;
```

### 6.2 월 1회 외부 라이선스 변경 감지

`scripts/verify_licenses.ts`를 GitHub Actions cron으로 월 1회 실행:
- GDL API에서 각 책의 현재 라이선스를 다시 조회
- DB의 `license` 값과 다르면 알림 + 해당 책 `is_active = false`로 즉시 비활성화
- 변경 로그는 `docs/adr/`에 자동 기록
- GDL `content_url`(H5P embed URL, ADR-0017 Amendment #3) 생존 표본 확인 — 활성 GDL에서 30권 표본 추출해 `admin-ajax.php?action=h5p_embed` URL을 HEAD, 비-200 발견 시 알림(비공식 엔드포인트라 GDL 사이트와 운명 공유)

### 6.3 긴급 중단 조건

다음 발견 시 **즉시 작업 중단 + 사용자 알림**:
- 어트리뷰션 누락 1건 이상
- NC/ND 라이선스 1건 이상
- AttributionBox 누락 페이지 1건 이상
- 외부 라이선스가 CC BY에서 NC로 변경된 경우

---

## 7. 작업별 체크리스트

### 7.1 콘텐츠 동기화 스크립트 작성 시

- [ ] API 응답의 license 필드를 가장 먼저 확인하는 코드 작성
- [ ] 화이트리스트 외 라이선스는 `continue`로 건너뜀 (예외 발생 아님, 단순 스킵)
- [ ] `attribution_text` 생성 함수를 별도 모듈로 분리 (`lib/attribution.ts`)
- [ ] 동기화 결과 로그에 `skipped_due_to_license` 카운트 포함

### 7.2 책 상세 페이지 작업 시

- [ ] `AttributionBox` 컴포넌트 import 확인
- [ ] `book.attribution_text` prop 전달 확인
- [ ] 원본 URL은 `rel="noopener noreferrer"` 속성으로 새 탭 오픈
- [ ] 모바일에서 fold above 위치 확인 (Lighthouse 또는 수동)

### 7.3 DB 마이그레이션 작업 시

- [ ] license CHECK 제약 변경 시 ADR 사전 작성 (Hard Rule 8)
- [ ] attribution_text NULL 허용 변경 시도 자체를 금지 (Hard Rule 1)
- [ ] `enforce_commercial_license` 트리거 DROP 시도 자체를 금지 (Hard Rule 2)

---

## 8. 협상 이후 라이선스 추가 절차 (Phase 2 이후 참조용)

베타 출시 후 JYBooks, 웅진주니어 등과 협상 체결 시:

1. 신규 `source_platform` 값 추가 (예: `jybooks`, `wjjr`)
2. 신규 `license` 값 추가 시 ADR 작성 후 CHECK 제약 ALTER
   - 협상 라이선스는 보통 `commercial-licensed` 같은 별도 코드 사용
   - 상업 라이선스이므로 트리거 화이트리스트에 추가
3. 어트리뷰션 텍스트 포맷을 협상 계약서 문구에 맞춰 변경
4. `AttributionBox`에 협상 라이선스 표시 분기 추가
5. 계약서 PDF는 `docs/contracts/` (gitignore 처리, Supabase Storage 별도 보관)

상세는 `PLAN.md` 10절 협상 트랙 참조.

---

## 9. 자주 묻는 질문 (FAQ)

**Q1. 어트리뷰션을 푸터에만 표시하면 안 되나요?**
A. 안 됩니다. CC BY 4.0은 "저작물 자체와 함께(reasonable to the medium)" 표시를 요구합니다. 책 상세 페이지 = 저작물 페이지이므로 그 페이지에 표시되어야 합니다. 푸터는 보조 수단입니다.

**Q2. 학부모가 어트리뷰션 박스를 닫을 수 있게 해도 되나요?**
A. 안 됩니다. UI에서 영구 표시되어야 합니다. 접기/펴기 기능도 권장하지 않습니다.

**Q3. CC0 콘텐츠도 어트리뷰션을 표시하나요?**
A. 법적 의무는 없으나 키키북스 표준으로 표시합니다. 사용자 신뢰와 콘텐츠 큐레이션 투명성을 위해.

**Q4. Beatrix Potter 책 표지에 토끼 그림을 그려도 되나요?**
A. 위험합니다. 원본 삽화는 PD지만 "Peter Rabbit" 캐릭터 디자인은 Frederick Warne의 상표로 등록되어 있습니다. 직접 일러스트를 새로 제작하거나, 원본 1902년판 삽화를 정확히 사용하되 상표명을 함께 사용하지 않습니다.

**Q5. 협상이 결렬되면 라이선스 규칙을 완화해도 되나요?**
A. 안 됩니다. 협상 결렬은 콘텐츠 부족 문제이지 법적 기준 완화 사유가 아닙니다. 무료 콘텐츠 900권(ADR-0008로 1,300→900 정정)으로도 베타는 충분합니다.

---

*문서 끝. 본 문서의 변경은 ADR(`docs/adr/`)에 반드시 기록합니다.*
