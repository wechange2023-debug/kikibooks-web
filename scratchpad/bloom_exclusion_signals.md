# Bloom 자동제외 규칙 정찰 — 42권 메타 신호 분석 (읽기 전용)

> 작성 2026-06-29 · HEAD=faaf82d · Bloom 공개 Parse API(읽기 전용) 실측.
> 데이터 출처: `50_source_ids.txt`(batch-50 bookInstanceId) → Parse `/classes/books`
> where `bookInstanceId $in` 조회(keys: title·allTitles·tags·pageCount·leveledReaderLevel).
> 통과 27권 word_count는 STEP26 `bloom_level_signals_27.csv` 인용. **DB·코드 무변경.**

## 0. 표본 구성

- batch-50 전수 조회 성공(50/50, ids_not_found=0).
- **탈락 15 + 통과 27 = 42(STEP26 검수 대상)**, 나머지 **8권은 검수 외**(pre-review/비영어 사본).
- 도서명↔source_id 매칭: allTitles["en"] 정확매칭 14건 + 문장형 접두매칭 1건
  (`Look in the sky` → 실제 en_title `"Look in the sky. What do you see?"`). **매칭 실패 0건.**

## 1. 메타표

### 탈락 15권
| 군 | source_id | en_title | cL | lrl | pg | topic | bookshelf |
|---|---|---|---|---|---|---|---|
| 탈락 | `57f32b72` | Animals | 1 | None | 14 | Dictionary | - |
| 탈락 | `2d02e356` | Clothing | 1 | 0 | 9 | Story Book | - |
| 탈락 | `297aa0c6` | Count to Ten | 1 | 0 | 17 | Math | - |
| 탈락 | `12f424e8` | Domestic animals | 1 | 0 | 14 | Story Book | - |
| 탈락 | `3fee9a4b` | Farm Animals | 1 | 0 | 25 | - | - |
| 탈락 | `e2915632` | Have You Seen These Birds? | 1 | None | 14 | Non Fiction | - |
| 탈락 | `17c8986d` | Land Animals | 1 | 0 | 27 | - | - |
| 탈락 | `b9cab47f` | Look in the sky. What do you see? | 1 | 0 | 16 | Environment | - |
| 탈락 | `0a27be07` | One | 1 | 0 | 16 | - | - |
| 탈락 | `dd15fef2` | One Two Three | 1 | 0 | 16 | Math | - |
| 탈락 | `eae89c14` | Parts of the Body | 1 | 0 | 16 | Health | topic-health-eng-H |
| 탈락 | `128e3478` | Parts of the Face | 1 | 0 | 16 | NoTopic;Early Learning;Health | - |
| 탈락 | `f2760406` | The Young Child | 2 | 0 | 11 | Story Book | ACR-Philippines-Ac |
| 탈락 | `fc85ee8b` | Where the Pet Sat? | 2 | 0 | 12 | Animal Stories | - |
| 탈락 | `b30c4a5a` | Wild Animals | 1 | 0 | 21 | - | Little-Zebra-Books |

### 통과 27권 (wc=word_count_est, STEP26 인용)
| 군 | source_id | en_title | cL | lrl | pg | topic | wc |
|---|---|---|---|---|---|---|---|
| 통과 | `71d66196` | Can and Cannot | 2 | 0 | 11 | - | 43 |
| 통과 | `411f6dd4` | Anna's Adventure | 2 | 0 | 12 | Story Book | 101 |
| 통과 | `6c2a2c2f` | The Widow and the Judge | 2 | 0 | 12 | Spiritual | 144 |
| 통과 | `c82262e3` | I Feel | 1 | 0 | 12 | Personal Development | 6 |
| 통과 | `68808917` | Jacob and the Fish | 1 | None | 14 | Story Book | 63 |
| 통과 | `6e57e9aa` | Things we Can Do | 1 | 0 | 14 | - | 16 |
| 통과 | `985f9b3a` | They Can Do Many Things | 2 | 0 | 14 | - | 72 |
| 통과 | `ed9782f9` | Timmi's dream | None | None | 14 | Story Book | 71 |
| 통과 | `b0f2a9ab` | Wewak Boy | 2 | 0 | 15 | - | 153 |
| 통과 | `b1be87dc` | How to Catch the Wind | 2 | 0 | 15 | Science | 88 |
| 통과 | `b30b0142` | Jobs | 2 | 0 | 15 | Community Living | 102 |
| 통과 | `1daac76a` | Where is my bat? | 1 | 3 | 16 | - | 73 |
| 통과 | `409a37a2` | Where Is It? | 1 | 0 | 16 | Animal Stories | 40 |
| 통과 | `7f4681dc` | Didi's knowledge | 2 | 0 | 16 | Story Book | 139 |
| 통과 | `e67a8023` | Little and big | 1 | 0 | 16 | Story Book | 20 |
| 통과 | `0a38c9cf` | A Street, or a Zoo? | 2 | 0 | 17 | - | 172 |
| 통과 | `19b38c09` | The Moon and the Hat | 2 | 0 | 17 | - | 135 |
| 통과 | `25ce9a8d` | Timmy and Pepe | 2 | 0 | 17 | - | 174 |
| 통과 | `468f071b` | Maria's Family | 1 | 0 | 17 | Community Living | 43 |
| 통과 | `6f7c4247` | Let's go | 1 | 0 | 17 | Story Book | 49 |
| 통과 | `7ee7b9b7` | A very tall man | 2 | 0 | 17 | Story Book | 79 |
| 통과 | `4e1a12a3` | 02 - Cat and Dog and the Ball | 2 | 0 | 18 | - | 164 |
| 통과 | `50a63a0a` | Tortoise Finds his House | 1 | 0 | 18 | Animal Stories | 397 |
| 통과 | `cf425be1` | The Three Little Kittens | 2 | 0 | 19 | Animal Stories | 109 |
| 통과 | `64449775` | A5-Colours of a Rainbow | 2 | 0 | 20 | - | 117 |
| 통과 | `05bdb04b` | Noakawir and the Beans | 2 | 0 | 31 | - | 278 |
| 통과 | `bf6fe85c` | 02 - Cat and Dog: Words | 2 | 0 | 39 | Primer | 100 |

### 검수 외 8권 (참고 — 42에 미포함)
| source_id | en_title | cL | pg | topic |
|---|---|---|---|---|
| `0dbbc83b` | Useful Phrases 02 (Phase 1) | 1 | 11 | Dictionary |
| `1e79a574` | Back to School | 1 | 48 | Primer |
| `378efbe1` | More than a Pretty Face (Phase 1) | 1 | 15 | Dictionary |
| `652eaef5` | (Anak Itik dan Ikan Sapat) | 2 | 18 | - |
| `9b664658` | Sign Language Games Templates | 2 | 23 | How To |
| `a39fbc12` | (비영어 — have-you-seen-these-birds 사본) | 2 | 14 | Story Book |
| `bc81a17a` | What type of teeth? | 2 | 14 | Animal Stories |
| `e3bc1a83` | Story Primer 1 | 1 | 12 | Primer |

## 2. 신호 판별력 (탈락 15 포착 / 통과 27 오탈락 / 검수외 8 부수포착)

| 신호 | 탈락 포착 /15 | 통과 오탈락 /27 | 검수외 /8 | 평가 |
|---|---|---|---|---|
| `topic:Dictionary` | 1 | **0** | 2 | 정밀(0 FP)·저재현 |
| `topic:Math`(+Mathematics) | 2 | **0** | 0 | 정밀(0 FP)·저재현(계수책) |
| `topic:Dictionary OR Math` | 3 | **0** | 2 | 정밀(0 FP)·재현 20% |
| `computedLevel == 1` | 13 | **9** | 4 | ❌ 사용불가(통과 33% 오탈락) |
| `pageCount <= 10` | 1 | 0 | 0 | 무의미 |
| 짧은 카테고리명사 제목(≤3단어+명사힌트, 물음표 제외) | 8 | 1 | 0 | 최고재현 단일신호(53%)·FP 1건 |

보조 관찰:
- **leveledReaderLevel**: 양군 모두 대부분 0 → 판별력 없음.
- **pageCount 분포**: 탈락 9~27 / 통과 11~39 — 거의 완전 중첩, 분리 불가.
- **word_count**: 통과군에도 극저빈도 존재(`I Feel`=6, `Things we Can Do`=16, `Little and big`=20)
  → "저텍스트=탈락" 규칙 성립 불가. 단어카드형 판별은 페이지구조(이미지1+단어1 반복) 파싱 필요(메타 불가).
- **bookshelf**: 탈락 3건만 보유(health/ACR/Little-Zebra), 통과에도 다수 → 판별력 없음.

## 3. 결론

### ★ 단독으로 신뢰 가능한 규칙은 없다 — 보수적 복합 규칙 + 인간검수 병행 필요.

1. **탈락 15권은 동질적 집합이 아니다.** 명백한 어휘/카테고리 나열책(Animals, Clothing,
   Land/Wild/Farm/Domestic Animals, One, One Two Three, Count to Ten, Parts of Body/Face)과,
   서술형 제목이나 인간이 부적합 판정한 책(The Young Child, Where the Pet Sat?,
   Have You Seen These Birds?, Look in the sky…)이 혼재. 메타데이터로 후자를 포착할 신호 없음.

2. **오탈락 0(통과 보호)을 최우선**으로 하면 자동제외 가능한 안전 신호는
   **`topic:Dictionary` + `topic:Math/Mathematics` 뿐**(통과 27 중 0건 오탈락).
   단 재현율 3/15(20%)로 낮다. 계수책·그림사전만 확실히 거른다.
   - 참고: 현 `sync_bloom._NONSTORY_TOPIC_TAGS`(Math/Mathematics/Science)는 **자동제외가 아닌
     검수리스트 신호**(L131)이며 `Dictionary`는 미포함. `Dictionary`는 0 FP·picture-dictionary
     명시 마커이므로 신호 추가 가치 높음. (단 통과군 `Science`=1건 존재 → Science는 제외 신호 부적격.)

3. **`computedLevel==1` 단독 자동제외는 금지.** 통과 27 중 9건(33%)을 오탈락 → 양서 대량 손실.

4. **재현율을 높이려면 "짧은 카테고리명사 제목"을 검수플래그(자동제외 아님)로** 추가.
   8/15 포착하나 통과 1건 오탈락 → 자동제외 부적격, **검수 큐 우선순위 상향용**으로만 사용.

5. **권고 복합 규칙(2단)**:
   - **(자동제외, 0 FP)** `topic:Dictionary` OR `topic:Math/Mathematics`
   - **(검수 플래그, FP≤1)** 짧은 카테고리명사 제목 OR 위 자동제외 비해당 잔여
   - **(인간/구조검수)** 서술형 제목 부적합책(question/narrative title)은 메타 신호 부재 →
     기존 시각검수 큐 유지. 단어카드 판별이 핵심이면 index.htm 페이지구조 파싱(이미지1+단어1
     반복률) 별도 구현 필요 — 후속 과제.

### 일반화 경계
표본 15 vs 27(소량). 위 수치는 **700권 적용 전 검증 가설**이며 확정 규칙 아님.
특히 `Dictionary`/`Math` 0 FP는 표본 한정 — 700권 dry-run에서 통과 후보 대상 FP 재측정 필수.
