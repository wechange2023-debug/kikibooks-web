# ADR-0016: illustrator 데이터 부재 + GDL `author=publisher` 처리 + AttributionBox 5요소 사유 박제

**날짜** 2026-05-21
**상태** Accepted (phase-11 CP1)
**관련** `docs/adr/0013-cover-attribution-policy.md` §7(illustrator phase-11 진단 트리거 — 본 ADR 결정 1로 해소), `docs/adr/0014-gdl-cover-url-and-illustrator-strategy.md` 결정 3·6 + Amendment #2 §C·§D(illustrator·author=publisher phase-11 이연 트리거 — 본 ADR 결정 1·2로 해소), `docs/adr/0014-gdl-cover-url-and-illustrator-strategy.md` Amendment #4(블랙리스트 책 상세 차단 — 본 ADR과 동시 작성), `docs/adr/0012-landing-page-static.md` 결정 3(DB 무변경 패턴), `docs/adr/0015-screen-02-category-strategy.md`(phase-10 카테고리 매핑 — DB 무변경 정합 인용), `docs/guidelines/license-rules.md` §4·§5·§7.2(CC BY 4.0 4요소·AttributionBox·외부 링크 안전 속성), `docs/intent/screen-03-book-detail.md`, `tasks/phase-11-screen-03-book-detail.json`, `supabase/migrations/001_initial_schema.sql`(books — author·illustrator·attribution_text NOT NULL), `PLAN.md` 9절 Week 6 + 15절 CC BY 4.0, `claude.md` 2절 Hard Rule 1·8·10

---

## 1. 맥락

phase-11 Screen 03(책 상세 + AttributionBox)는 베타 법적 의무인 어트리뷰션 표시가 사용자에게 직접 노출되는 첫 페이지다. PLAN.md 9절 Week 6은 AttributionBox에 5개 요소(📚 출처 / ✍️ 글 / 🎨 그림 / 📜 라이선스 / 🔗 원본)를 명시했고, license-rules.md §5.1은 같은 5요소를 박제했다. 그러나 다음 3가지 데이터·법적 공백이 phase-11 진입 전에 결정되어야 한다:

1. **illustrator 데이터 100% 부재** — phase-09a CP2 + ADR-0013 §7 + ADR-0014 Amendment #2 §C 실측에서 활성 책 896/896 = 100% `illustrator` NULL을 확인했다. PLAN.md 9절 "🎨 그림: {illustrator}" 명세는 데이터로 채울 수 없다.
2. **GDL `author = publisher`** — ADR-0007 §4.2 amendment + ADR-0014 결정 6 + Amendment #2 §D 가시 증거에서 GDL 적재 행의 `books.author`는 사실상 출판사명임을 확인했다. phase-10 랜딩·홈 카드 라벨에 `StoryWeaver`·`African Storybook` 등 출판사명이 저자 자리에 노출되는 상황이 사용자에게 가시화된 상태다.
3. **AttributionBox 5요소 vs CC BY 4.0 4요소 법적 충분성** — PLAN.md·license-rules.md의 5요소(출처·글·그림·라이선스·원본)는 CC BY 4.0 법적 4요소(저작자·**제목**·라이선스URL·원본URL)와 다음 두 가지 점에서 다르다: (a) "제목"이 5요소에 부재, (b) "출처"가 5요소에 추가됨. 이 비대칭의 법적 정당성을 ADR 차원에서 박제하지 않으면 phase-14 베타 직전 변호사 검토에서 재설계 위험.

ADR-0013 §7과 ADR-0014 결정 3·6은 본 3건을 "phase-11 통합 ADR로 결정"한다고 박제했다. 본 ADR이 그 통합 결정을 박제한다.

phase-11 plan 단계(2026-05-21) 외부 검토에서 본 ADR의 범위와 결정 방향을 사용자가 확정했고, CP1에서 본 ADR이 작성된다.

---

## 2. 후보 옵션 비교 (ADR 범위)

| 옵션 | 범위 | 장점 | 단점 |
|---|---|---|---|
| **(a) ★ 채택** | illustrator + author/publisher + AttributionBox 5요소 사유 박제 | ADR 범위 명료, 통과 빠름, ADR-0014 §6 후속 과제 2와 정합(블랙리스트는 ADR-0014 잔류) | 블랙리스트 책 상세 차단 정책이 ADR-0014 Amendment #4로 분리 박제 |
| (b) | (a) + 블랙리스트 비-랜딩 표면 차단 정책 통합 | 책 상세 차단 정책 한 ADR에 박제 | ADR 범위 광범위, 결정 항목 4종 검토 부담 |
| (c) | ADR-0016=illustrator/publisher+5요소, ADR-0017(별도)=블랙리스트 | 각 ADR 단일 관심사 | CP1 ADR 2개 작성 → 작업량 증가 |

**채택**: 옵션 (a). 사유:
- ADR-0014 결정 2가 이미 블랙리스트 박제이므로 같은 ADR에 Amendment #4로 잔류시키는 것이 자연스럽다.
- Amendment 패턴이 이미 ADR-0014에 #1~#3까지 누적 사용 중이라 #4 추가는 관리 부담이 작다.
- 옵션 b는 4 결정 항목 동시 검토로 의사결정 비용 증가, 옵션 c는 ADR 폭증.

---

## 3. 결정

### 결정 1 — illustrator 데이터 부재: 행 자체 생략 (옵션 1-가)

AttributionBox에서 `book.illustrator IS NULL`이면 **'🎨 그림' 행 자체를 DOM에서 생략**한다. placeholder("그림 정보 없음")나 sync 보강 후 행 추가는 본 페이즈에서 채택하지 않는다.

- license-rules.md §5.1은 이미 "🎨 그림: {illustrator}     ← 없으면 행 자체 생략"으로 박제돼 있다 — 본 결정은 이 박제를 phase-11 코드 레벨에서 명시적으로 따른다.
- 활성 책 896/896 = 100% NULL인 현 상황에서는 모든 책에서 '🎨 그림' 행이 생략된다. 행 1개가 사라지는 것은 4요소 충족도에는 영향이 없다 — '저작자(글)'·'제목(H1)'·'라이선스URL'·'원본URL'로 CC BY 4.0 4요소는 충족된다(결정 3 참조).
- 데이터 입수 경로 확립은 별도 sync 보강 phase로 이연(F8 트리거, `tasks/phase-11-screen-03-book-detail.json` `phase_11_follow_up_triggers`).

**기각된 후보**:
- (1-나) placeholder "그림 정보 없음" — 모든 책에 동일 placeholder가 노출되면 큐레이션 품질 메시지 약화.
- (1-다) sync 보강 후 행 추가 — 본 페이즈 범위 폭증. 별도 phase에서 진행해야 정합.

### 결정 2 — GDL `author = publisher`: 분리 표시 (옵션 2-나)

GDL 적재 책(`source_platform='gdl'`)의 AttributionBox는 다음과 같이 표시한다:

- `book.author`가 사실상 publisher이므로 **'✍️ 글: {author}' 행을 생략**한다 (또는 author 컬럼이 NULL인 행이면 자연 생략).
- **'🏢 출판사: {publisher}' 행을 별도 추가**한다. publisher 값은 `book.author` 컬럼에서 추출한다(현 DB 적재 상태 그대로 — Hard Rule 8 무변경).
- Book Dash 적재 책(`source_platform='book_dash'`)은 author 컬럼이 실제 글쓴이이므로 '✍️ 글' 행 노출 + '🏢 출판사' 행 부재로 동작한다.

UI 레이어(`lib/book/attribution.ts`)에서 `source_platform` 분기로만 처리한다. DB 스키마·sync 로직·`books.author` 적재 정책은 무변경(Hard Rule 8).

**일관성 박제 — 외부 검토 보강 2**:
> **랜딩 카드 publisher 표시는 phase-10 박제 유지, 책 상세는 분리 표시 — 이 비일관은 의도된 것이다.** 카드 라벨(랜딩 인기 책 / 홈 추천 5권 / 카테고리 결과)은 좁은 공간 + 시각 균일성을 위해 `author` 컬럼을 그대로 노출하며 결과적으로 GDL은 publisher가 라벨에 나타난다(ADR-0014 Amendment #2 §D). 책 상세는 어트리뷰션 의무 페이지로서 사용자가 콘텐츠 원천을 정확히 인지해야 하므로 '출판사' 행을 분리한다. 두 표면의 표시 정책 차이는 표면별 정보 밀도·법적 의무 차이에서 비롯된 의도된 비일관이며, 일관화는 phase-13b 카드 라벨 재설계 또는 별도 phase에서 결정한다.

**기각된 후보**:
- (2-가) "출처" 행에 publisher 노출 — 출처(플랫폼명: GDL/Book Dash)와 출판사는 별도 개념이므로 합치면 사용자 혼란.
- (2-다) author 행에 publisher 그대로 노출 + JSDoc만 박제 — Amendment #2 §D 가시 증거에 대한 정직한 답이 아님. 책 상세 어트리뷰션 의무 페이지에서 publisher가 author 라벨로 표시되면 'reasonable to the medium' 위반 우려.

### 결정 3 — AttributionBox 5요소 사유 박제 + CC BY 4.0 4요소 충족 메커니즘

AttributionBox 5요소(PLAN.md 9절 + license-rules.md §5.1)는 CC BY 4.0 법적 4요소와 다음 두 가지 점에서 다르다:

**"제목" 누락 사유** (외부 검토 #2 박제 요구):

> 책 상세 페이지는 책 제목을 H1 태그로 페이지 상단에 별도 표시한다. AttributionBox는 표지 직하단·읽기 버튼 직상단에 배치되어 H1과 시각·DOM 모두 인접한다(license-rules.md §5.3). H1 제목 + AttributionBox는 사용자가 한 번에 인지하는 **'통합 어트리뷰션 단위'**로 기능한다. CC BY 4.0의 'reasonable to the medium' 원칙은 4요소가 같은 표시 단위에 함께 나타날 것을 요구하며, H1과 AttributionBox의 인접성으로 충족된다. AttributionBox 내부에 제목을 중복 표시하면 시각 노이즈가 발생하고, 모바일 390px에서 fold above 위치 보장(§5.3)이 어렵다.

**"출처" 추가 사유** (외부 검토 #2 박제 요구):

> 키키북스는 무료 합법 콘텐츠(CC BY 4.0 / Public Domain)를 큐레이션한다. 학부모가 콘텐츠의 원천(Book Dash · GDL · 향후 협상 출판사)을 인지하는 것은 (a) 큐레이션 투명성 (b) 향후 협상 출판사 콘텐츠 추가 시 출처 분리 표시 가능 (c) `attribution_text` 표준 포맷(license-rules.md §4.2)에 `source_platform`이 포함된 사실과 정합 — 세 가지 이유로 필수다. CC BY 4.0의 4요소를 초과하는 추가 표시이며, 법적 최소를 넘어 사용자 신뢰를 보강한다.

**법적 충분성 결론**:

| CC BY 4.0 4요소 | 표시 위치 | 충족 메커니즘 |
|---|---|---|
| 저작자 | AttributionBox '✍️ 글' 행 또는 '🏢 출판사' 행(GDL 케이스, 결정 2) | 5요소 내 포함 |
| 제목 | BookCoverHero H1 태그 | H1 + AttributionBox 통합 단위(license-rules.md §5.3 인접 배치) |
| 라이선스(+URL) | AttributionBox '📜 라이선스' 행(외부 링크 포함) | 5요소 내 포함 |
| 원본 URL | AttributionBox '🔗 원본 보기' 행(외부 링크) | 5요소 내 포함 |

→ 5요소 + H1 = **4요소 충족 보장**.

**검증**: `tasks/phase-11-screen-03-book-detail.json` v7 4 sub-case가 4요소를 개별 측정한다.

**법무 검토 트리거**: 본 결정 3 박제 문안의 법적 타당성('통합 어트리뷰션 단위' 가정의 reasonable to the medium 해석)은 기술 검토만으로 확정 불가하다. phase-14 베타 직전 변호사 검토 단계에서 본 ADR §3 결정 3 박제 문안 + license-rules.md §5 전체를 함께 검토한다. 이견 발생 시 본 ADR 갱신 + AttributionBox 표시 항목 재설계(예: 제목 행 추가 또는 안내 문구 보강). F9 트리거 박제(`tasks/phase-11-screen-03-book-detail.json` `phase_11_follow_up_triggers`).

---

## 4. 대안 비교

| 영역 | 채택 | 대안 | 기각 이유 |
|---|---|---|---|
| illustrator 부재 | 행 자체 생략(1-가) | placeholder "그림 정보 없음"(1-나) | 모든 책에 동일 placeholder 노출 시 큐레이션 품질 메시지 약화 |
| illustrator 부재 | 행 자체 생략(1-가) | sync 보강 후 행 추가(1-다) | 본 페이즈 범위 폭증. 외부 enrichment 비용·정확도 미확정 |
| author=publisher | '🏢 출판사' 분리 행(2-나) | "출처" 행에 publisher 통합(2-가) | 출처(플랫폼)와 출판사는 별도 개념. 사용자 혼란 |
| author=publisher | '🏢 출판사' 분리 행(2-나) | author 행에 publisher 노출 + JSDoc 박제(2-다) | 어트리뷰션 의무 페이지에서 'reasonable to the medium' 위반 우려 |
| 5요소 사유 | H1 + AttributionBox 통합 단위 박제(3) | AttributionBox 내부에 제목 행 추가 | 시각 노이즈 + 모바일 fold above 보장 어려움 |
| ADR 범위 | (a) illustrator + author/publisher + 5요소만 | (b) 블랙리스트 통합 | 결정 항목 4종으로 검토 부담 + ADR-0014에 블랙리스트가 자연 잔류 |
| ADR 범위 | (a) | (c) ADR-0016 + ADR-0017 분리 | CP1 ADR 2개 작성 → 작업량 증가. Amendment 패턴이 더 가벼움 |

---

## 5. 결과

- phase-11 AttributionBox는 illustrator NULL 시 행 생략, GDL은 '🏢 출판사' 분리 행, Book Dash는 '✍️ 글' 행으로 동작한다.
- CC BY 4.0 4요소(저작자·제목·라이선스URL·원본URL)는 BookCoverHero H1 + AttributionBox 통합 단위로 충족된다.
- DB 스키마·sync 로직 무변경(Hard Rule 8). 본 ADR 결정은 모두 UI 레이어(`lib/book/attribution.ts` + `components/book/attribution-box.tsx`)에서만 처리한다.
- illustrator 데이터 입수 경로(F8) + AttributionBox 박제 문안 법무 검토(F9)는 별도 phase·시점으로 이연 박제.

---

## 6. 위험 / 보완

- **법무 검토 시 박제 문안 변경 가능성**: 결정 3의 'H1 + AttributionBox 통합 단위' 가정이 변호사 검토에서 이견을 받으면 AttributionBox 표시 항목 재설계 필요. → F9 트리거로 phase-14 베타 직전 박제. 이견 발생 시 본 ADR §3 결정 3 갱신 + license-rules.md §5 동시 갱신.
- **GDL publisher 컬럼 정정 가능성**: 향후 `books.author` 적재 정책이 정정되어 publisher가 별도 컬럼으로 이관되면 본 ADR 결정 2의 'source_platform='gdl' 분기' 로직이 무효화된다. → 별도 sync 보강 phase에서 본 ADR 결정 2 갱신·Superseded by 표기.
- **랜딩·홈 카드 라벨 비일관 사용자 혼란**: 결정 2 박제 문안의 '의도된 비일관'이 사용자에게 인지될 수 있다. → phase-13b 카드 라벨 재설계 시 일관화 검토. 베타에서는 책 상세 어트리뷰션 의무 페이지의 정확성이 우선.

---

## 7. 후속 과제 (본 ADR이 박제하는 트리거)

1. **별도 sync 보강 phase**: illustrator 데이터 입수 경로 확립. Book Dash meta.yml 진단(sync 누락 vs 원천 부재) + GDL 응답 스키마 모니터링 + 외부 enrichment(Open Library API, ISBN DB) 비용·정확도 평가. (F8 트리거, `tasks/phase-11-screen-03-book-detail.json` `phase_11_follow_up_triggers`)
2. **phase-14 베타 직전**: AttributionBox 박제 문안(§3 결정 3) + license-rules.md §5 변호사 검토. (F9 트리거)
3. **phase-13b 또는 별도 phase**: 랜딩·홈 카드 라벨 publisher 표시 일관화 검토. 책 상세 분리 표시와의 비일관 해소 결정.
4. **별도 sync 보강 phase**: GDL `author=publisher` 적재 정책 정정 검토. publisher 별도 컬럼 이관 시 본 ADR 결정 2 갱신 트리거.

---

*문서 끝.*

---

## Amendment #1 (2026-05-22 phase-12 CP1)

본 ADR 본문(결정 1·2·3)은 책 상세(`/book/[id]`) 단일 표면을 전제로 작성됐다. phase-12 책 뷰어(`/book/[id]/read`)는 URL 직접 진입 시 책 상세를 우회하므로, 어트리뷰션 의무 표시를 책 뷰어 표면으로 확장한다(ADR-0017 D1 iframe 단일 경로와 동시 작성).

### 결정 — 어트리뷰션 표시 범위: 책 상세 + 책 뷰어 양쪽

책 뷰어 상단에 **미니 어트리뷰션 바**(1줄)를 표시한다. iframe 콘텐츠 직상단에 위치한다. 표시 항목:

```
{책 제목}    ✍️ {author}     · 📜 CC BY 4.0 · 🔗 출처      ← Book Dash 케이스
{책 제목}    🏢 {publisher}  · 📜 CC BY 4.0 · 🔗 출처      ← GDL 케이스 (결정 2 분기 재사용)
```

- **저작자 분기**: Book Dash → `✍️ {author}` / GDL → `🏢 {publisher}`. 본 ADR 결정 2(`source_platform='gdl'` 분기)를 그대로 따른다.
- **라이선스**: `📜 CC BY 4.0` — 라이선스 URL 외부 링크(new tab, `rel="noopener noreferrer"`, license-rules.md §7.2).
- **출처**: `🔗 출처` — `book.original_url` 외부 링크(new tab, `rel="noopener noreferrer"`).
- **제목**: 책 제목을 미니 바(또는 페이지 헤더)에 노출해 결정 3의 '제목 + 어트리뷰션 = 통합 어트리뷰션 단위' 메커니즘을 책 뷰어 표면에서도 충족한다.
- **illustrator 행 생략**: 미니 바는 공간 제약으로 '🎨 그림' 행을 표시하지 않는다. 활성 책 896/896 = 100% illustrator NULL(결정 1 + ADR-0014 Amendment #2 §C)이므로 실질 영향 0건이며, 결정 1의 '행 자체 생략' 정책과 정합한다.

### 4요소 충족 (책 뷰어 표면)

| CC BY 4.0 4요소 | 표시 위치 | 충족 메커니즘 |
|---|---|---|
| 저작자 | 미니 바 `✍️ {author}`(Book Dash) 또는 `🏢 {publisher}`(GDL) | 본 ADR 결정 2 분기 재사용 |
| 제목 | 미니 바(또는 뷰어 페이지 헤더) 책 제목 | 제목 + 어트리뷰션 통합 단위(결정 3) |
| 라이선스(+URL) | 미니 바 `📜 CC BY 4.0` 외부 링크 | 책 상세 AttributionBox와 동일 |
| 원본 URL | 미니 바 `🔗 출처` 외부 링크 | 책 상세 AttributionBox와 동일 |

### 구현 책임 — 단일 출처 재사용

미니 어트리뷰션 바(`components/book/reader-attribution-bar.tsx`)는 `lib/book/attribution.ts`의 `buildAttributionRows(book, copy)` source_platform 분기를 **그대로 재사용**한다(1줄 압축 형태). 신규 분기 로직·신규 카피를 만들지 않는다 — 책 상세 AttributionBox와 동일한 단일 출처에서 파생한다(ADR-0012 결정 2 카피 단일 출처 정합). DB 스키마·sync·`books.author` 적재 정책은 무변경(Hard Rule 8) — 본 Amendment도 본문 결정 2와 동일하게 UI 레이어만 처리한다.

### F9 법무 검토 연계

본문 §3 결정 3의 법무 검토 트리거(F9, phase-14 베타 직전)는 책 상세 AttributionBox 단일 표면을 전제했다. 본 Amendment로 책 뷰어 미니 바가 추가됐으므로, **phase-14 법무 검토는 책 상세 AttributionBox + 책 뷰어 미니 어트리뷰션 바 양 표면을 함께 포함**한다. 미니 바의 'reasonable to the medium' 충족(저작자/출판사 + CC BY + 출처 + 제목 노출)도 검토 대상이다. 이견 발생 시 본문 결정 3 + 본 Amendment + license-rules.md §5를 동시 갱신한다. (`tasks/phase-12-screen-04-reader.json` F17 트리거 — phase-11 F9와 통합 검토.)

본 Amendment #1은 §1~§7 본문(결정 1·2·3)을 변경하지 않는다.

---

*Amendment #1 끝.*
