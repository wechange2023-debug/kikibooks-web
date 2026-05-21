# ADR-0015: Screen 02 카테고리 그리드 8개 — 정적 키워드 매핑 전략

**날짜** 2026-05-21
**상태** Accepted (phase-10 CP1)
**관련** `docs/adr/0012-landing-page-static.md`(결정 3 "DB 무변경, 코드 측 처리" 패턴), `docs/adr/0014-gdl-cover-url-and-illustrator-strategy.md`(결정 2 "랜딩 쿼리 블랙리스트" 동일 정합), `docs/adr/0007-gdl-sync-strategy.md`(GDL 메타 한계), `docs/adr/0005-book-dash-sync-strategy.md`(Book Dash 메타 한계), `tasks/phase-10-screen-02-home.json`, `docs/intent/screen-02-home.md`, `supabase/migrations/001_initial_schema.sql`(books 컬럼 진단), `claude.md` 2절 Hard Rule 8·10

---

## 1. 맥락

phase-10 CP1 사전 진단에서 다음을 확인했다:

- `books` 테이블에 `category` / `categories` / `topic` / `tags` **컬럼이 부재**한다(001_initial_schema.sql:58~103).
- PLAN.md 9절 Screen 02 명세는 8개 카테고리 그리드를 요구한다: **동물·가족·ABC·숫자·감정·자연·음식·잠자리**.
- GDL API와 Book Dash meta.yml 모두 카테고리·주제 필드를 제공하지 않는다(ADR-0007·ADR-0005 데이터 진단).
- `books.title`은 영어 텍스트가 보장되며(`language='en' DEFAULT`), age_min/age_max·level이 부분적으로 매핑돼 있다.

phase-09b 결정 2(Book Dash 404 4건 랜딩 쿼리 측 블랙리스트)와 ADR-0012 결정 3(인기 책 랜덤 추출을 RPC 없이 애플리케이션 코드에서)이 보여준 패턴: **DB 스키마는 보존하고 코드 측에서 처리**한다. 본 ADR은 같은 정합으로 카테고리 그리드를 구현한다.

본 ADR은 (1) 4개 후보 옵션 중 하나를 선택하고 (2) 카테고리별 키워드 풀을 박제하며 (3) 매칭 실패 책 처리 정책과 (4) phase-13b 정식 컬럼 도입 트리거 임계를 결정한다.

---

## 2. 후보 옵션 비교

| 옵션 | 방식 | DB 변경 | 정확도 | 운영 비용 | 정합 |
|---|---|---|---|---|---|
| A | `ALTER TABLE books ADD COLUMN categories TEXT[]` + 수동 분류 896권 | 있음 (Hard Rule 8) | 높음 | 896권 수동 라벨링 | 무 |
| B | 클라이언트 측 휴리스틱 (title 길이·age 범위만) | 무 | 낮음 | 0 | 정합 |
| C | 카테고리 탭 UI만, 결과는 phase-13b 라이브러리로 이연 | 무 | — | phase-13b에 이연 | 정합 |
| **D ★ 채택** | `lib/home/categories.ts` 정적 정의 + `title` ILIKE 키워드 매칭 + age 범위 보조 | 무 | 중 | 키워드 풀 유지(8 × 10~20) | **ADR-0012 결정 3·ADR-0014 결정 2와 동일 패턴** |

**기각 사유**:

- A: 896권 수동 분류 + 향후 sync마다 라벨링 부채. 베타 단계에서 과도. Hard Rule 8 신규 ALTER 마이그레이션 자체는 가능하나 정확도 효익이 즉시적이지 않다.
- B: 정확도 너무 낮음. 클릭 시 부적절한 책 노출 가능성.
- C: PLAN.md 9절 "카테고리 그리드 8개" 명세를 phase-10에서 부분적으로만 만족.

---

## 3. 결정

### 결정 1 — 옵션 D 채택: 정적 키워드 풀 + title ILIKE 매핑

`lib/home/categories.ts`에 8개 카테고리와 각 카테고리별 키워드 풀을 박제한다. 카테고리 카드 클릭 시 매칭된 책들을 결과 페이지로 보여준다(결정 5 라우팅 정책).

매칭 알고리즘 (서버 측, server function):

```ts
// 의사 코드
const lowerTitle = book.title.toLowerCase();
const matchedCategories = CATEGORIES.filter(cat =>
  cat.keywords.some(kw => lowerTitle.includes(kw.toLowerCase()))
);
// 한 책이 여러 카테고리에 매칭되면 모두에 포함 (포함 정책)
```

대소문자 무관 정확 일치(`includes`). 단어 경계는 적용하지 않는다 — 자녀용 영어 그림책 title은 짧고 단순하므로 부분 일치로 충분하고, 단어 경계 정규식은 `ABC` 같은 키워드의 매칭률을 떨어뜨린다.

### 결정 2 — 카테고리 8개 + 키워드 풀 박제 (★ 본 ADR의 핵심 데이터)

PLAN.md 9절 8개 카테고리는 그대로 유지한다. 각 카테고리는 영어 키워드 10~20개를 가진다. 키워드는 모두 lowercase 보관, 매칭 시 `book.title.toLowerCase()`와 비교한다.

#### 2.1 카테고리 매핑 표 (slug · 한글 라벨 · accent 토큰)

| # | slug | 한글 라벨 | 디자인 토큰 (design-system §1.4) |
|---|---|---|---|
| 1 | `animals` | 동물 | `--color-accent-green` |
| 2 | `family` | 가족 | `--color-accent-pink` |
| 3 | `abc` | ABC | `--color-tertiary` |
| 4 | `numbers` | 숫자 | `--color-accent-sky` |
| 5 | `emotions` | 감정 | `--color-accent-pink` |
| 6 | `nature` | 자연 | `--color-accent-green` |
| 7 | `food` | 음식 | `--color-accent-yellow` |
| 8 | `bedtime` | 잠자리 | `--color-accent-violet` |

같은 accent 토큰이 두 번 반복되는 카테고리(`animals`/`nature`, `family`/`emotions`)는 카드 내부 일러스트·아이콘이 다르므로 시각적 혼동은 없다(추후 CP3-a 컴포넌트 구현 시 확정).

#### 2.2 카테고리별 키워드 풀

다음 풀은 본 ADR의 단일 진실 공급원이다. 코드(`lib/home/categories.ts`)는 본 표를 그대로 옮겨 적는다.

**1. animals (15)**: `animal`, `dog`, `cat`, `lion`, `tiger`, `bear`, `monkey`, `elephant`, `rabbit`, `bird`, `fish`, `horse`, `pig`, `fox`, `duck`

**2. family (12)**: `family`, `mom`, `dad`, `mother`, `father`, `baby`, `brother`, `sister`, `grandma`, `grandpa`, `parent`, `home`

**3. abc (10)**: `abc`, `alphabet`, `letter`, `letters`, `a is for`, `b is for`, `my first`, `learn letters`, `phonics`, `first words`

**4. numbers (12)**: `number`, `numbers`, `count`, `counting`, `one two`, `ten`, `hundred`, `zero`, `math`, `how many`, `first numbers`, `1 2 3`

**5. emotions (15)**: `feel`, `feeling`, `feelings`, `emotion`, `happy`, `sad`, `angry`, `scared`, `brave`, `kind`, `friend`, `friendship`, `share`, `smile`, `fear`

**6. nature (18)**: `tree`, `flower`, `garden`, `forest`, `mountain`, `river`, `ocean`, `sea`, `sun`, `moon`, `star`, `rain`, `snow`, `season`, `spring`, `summer`, `winter`, `leaf`

**7. food (14)**: `food`, `eat`, `fruit`, `vegetable`, `apple`, `banana`, `bread`, `soup`, `cake`, `cook`, `kitchen`, `hungry`, `meal`, `lunch`

**8. bedtime (12)**: `night`, `sleep`, `bedtime`, `dream`, `good night`, `lullaby`, `tired`, `blanket`, `bed`, `pajama`, `goodnight`, `nap`

**합계**: 8개 카테고리 × 평균 ~13.5 키워드 = 108 키워드. 모두 lowercase·영어.

#### 2.3 키워드 풀 운영 규칙

- 본 ADR을 갱신하지 않고 코드에서 키워드를 추가·삭제·수정하지 않는다.
- 키워드 추가 요청은 ADR-0015 Amendment로 박제 후 코드 반영한다.
- 키워드 풀 변화는 베타 사용자 클릭 데이터(phase-13b Admin) 이후 재검토한다.

### 결정 3 — 매칭 실패 책 처리 정책: **(β) 카테고리 그리드에서만 미노출**

3개 후보 중 (β)를 채택한다.

| 후보 | 처리 | 채택 여부 | 사유 |
|---|---|---|---|
| α | "기타" 9번째 카테고리 자동 신설 | 기각 | PLAN.md 9절 8개 명세 위반. 화면 그리드(2×4)도 깨짐 |
| **β ★** | 카테고리 그리드에서만 미노출 (추천·라이브러리·검색에는 정상 노출) | **채택** | 단순·안전. DB·sync 무변경. ADR-0012 결정 3 정합 |
| γ | age_min/age_max·level 기반 폴백 카테고리 추정 | 기각 | 추정 오답률이 키워드 매칭보다 높음. 사용자 신뢰 훼손 |

(β) 채택의 영향:

- 매칭 실패 권수는 phase-10 CP3 또는 v 검증 단계에서 측정(현재 추정값: 30~50%대 — 키워드 풀 정확도에 비례).
- 매칭 실패 책도 books 테이블에는 그대로 존재하며 `is_active=true`로 유지된다. 오늘의 추천 5권, phase-13 라이브러리, phase-09a 랜딩 인기 책 등 다른 표면에는 정상 노출.
- 카테고리 카드 결과 페이지(결정 5)에서 매칭 결과 0건일 때의 폴백 UI는 본 ADR 결정 6에서 별도로 박제한다.

### 결정 4 — 한 책이 여러 카테고리에 매칭되면 모두에 포함

`tiger family`라는 책이 있다면 `animals`(`tiger`)와 `family`(`family`) 모두에 포함된다.

근거:
- 자녀용 책은 본래 다주제(다카테고리)다. 강제 단일 분류는 사용자 기대와 어긋난다.
- 카테고리 카드 결과 페이지의 중복 노출은 UX상 문제가 되지 않는다(같은 책이 여러 입구에서 보이는 게 자연스러움).
- 키워드 우선순위·점수 모델은 도입하지 않는다 — 부분 일치 boolean만 사용한다.

### 결정 5 — 카테고리 카드 클릭 라우팅

phase-10 단계의 카테고리 카드 클릭은 다음 둘 중 하나로 라우팅한다:

| 옵션 | 라우트 | 구현 비용 | phase-10 범위 |
|---|---|---|---|
| 5a | `/library?category={slug}` (phase-13 라이브러리에서 처리) | 라이브러리 부재 — phase-13까지 라우트 미존재 | **범위 외** |
| 5b ★ | `/home?cat={slug}` (홈 페이지 안에서 카테고리 책 목록 섹션이 확장 표시) | 홈 페이지 단일 라우트, 쿼리 파라미터 | **채택** |

phase-10 채택: **5b**.

근거:
- phase-13 라이브러리 진입 전까지는 `/library` 경로가 존재하지 않는다(임시 라우트 신설은 phase-10 범위 외).
- `/home?cat={slug}`는 홈 페이지 안에서 카테고리 그리드 아래에 "카테고리: {라벨} (n권)" 섹션을 확장하는 패턴. 별도 라우트·페이지를 만들 필요가 없다.
- phase-13 라이브러리 신설 시 라우팅을 `/library?category={slug}`로 이전한다(본 결정은 phase-13 ADR에서 갱신).
- 쿼리 파라미터 없이 `/home`에 진입하면 카테고리 결과 섹션은 표시하지 않는다(기본 상태).

### 결정 6 — 카테고리 결과 0건 폴백 UI

`/home?cat={slug}`에 매칭된 책이 0건이면 다음 폴백 UI를 표시한다:

- "이 카테고리에 아직 책이 없어요. 다른 카테고리를 둘러보세요!" 메시지
- 다른 카테고리 7개 카드로 자동 스크롤 또는 카드 강조
- 베타 키워드 풀 정확도가 낮을 때 신뢰 회복 동선

CP3-a 카테고리 그리드 컴포넌트에서 폴백 UI를 박제한다.

### 결정 7 — phase-13b 정식 컬럼 도입 트리거 임계

다음 두 임계 중 하나라도 만족하면 phase-13b에서 `ALTER TABLE books ADD COLUMN categories TEXT[]` 정식 도입을 검토한다:

| 임계 | 측정 방법 | 임계값 |
|---|---|---|
| **(a) 매칭 정확도** | 베타 운영 중 책 표본 100건의 카테고리 매핑을 사용자가 검토 → 정확도(맞은 책 수/전체 매핑) | **≤ 70%** 시 트리거 |
| **(b) 카테고리 클릭률** | 베타 운영 4주 동안 홈 화면 진입 사용자 중 카테고리 카드 클릭한 사용자 비율 (Vercel Analytics 또는 별도 이벤트) | **≥ 10%** 시 트리거 |

근거:
- (a) 70%: 키워드 매칭의 본질적 정밀도 한계. 70% 미만이면 사용자가 부적절한 책에 자주 노출돼 신뢰가 깨진다.
- (b) 10%: 카테고리 입구가 실제로 자주 사용되는 표면임이 입증되면, 정밀도 투자가 정당화된다. 10% 미만이면 정밀도 투자 ROI가 낮다.

두 임계 중 하나만 만족해도 phase-13b ADR에서 정식 컬럼 도입을 결정한다(AND가 아니라 OR).

phase-13b가 정식 컬럼을 도입하면 본 ADR-0015는 Superseded로 표시하고, `lib/home/categories.ts`의 키워드 풀은 데이터 마이그레이션 후 제거된다.

---

## 4. 결과

- phase-10에서 카테고리 그리드 8개를 정확도 중간 수준으로 구현 가능
- DB 스키마 변경 0건 (Hard Rule 8 회피)
- ADR-0012 결정 3, ADR-0014 결정 2와 동일한 "랜딩·홈 측 처리" 패턴 유지
- phase-13b에서 정식 컬럼 도입 여부는 베타 운영 데이터로 결정 (트리거 임계 박제)

## 5. 위험 / 보완

- **키워드 풀 누락**: 영어 그림책 title이 키워드를 직접 포함하지 않는 경우(예: 비유적 제목)는 매칭 실패. → 결정 3 (β) 폴백 처리 + 결정 7 (a) 임계로 정량 모니터링.
- **다중 매칭 과다**: `bedtime` + `bedtime`이 둘 다 matchable한 책이 한 카테고리에 너무 많이 몰릴 수 있음. → 카테고리 결과 페이지에 책 권수 캡(예: 24권) 적용 — CP3-a 컴포넌트 결정에 위임.
- **레벨 필터 결합**: 카테고리 카드 결과는 `current_level ±1`을 기본 적용할지, 전체 레벨 노출할지 결정 필요. → CP1 intent 문서 §5에서 박제(권장: ±1, 부족 시 ±2 폴백 — 추천 5권 사다리와 정합).
- **언어 가정**: 키워드 풀은 영어 전용. 비영어 책(`language != 'en'`)이 적재되면 매칭 0건. 베타는 영어 콘텐츠 전용이므로 무영향.

## 6. 후속 과제 (본 ADR이 박제하는 트리거)

1. **phase-10 CP3-a**: 카테고리 결과 권수 캡 결정 + 폴백 UI 구현
2. **phase-13**: 라이브러리(`/library`) 신설 시 카테고리 라우팅 5a로 이전 (결정 5 갱신)
3. **phase-13b**: 결정 7 트리거 임계 도달 시 정식 컬럼 도입 ADR 신설
4. **phase-13b**: 키워드 풀 정확도 측정 도구 도입 (Admin에서 책 표본 100건 검토 UI)

---

*문서 끝.*
