/**
 * 단어카드 후보에서 제외할 불용어 (ADR-0065 §단어 선정 규칙 초안).
 *
 * 판정 리터럴을 **이 파일 한 곳에만** 둔다. 오디오 배지 판정을
 * `selectReaderAudioBookIds`(lib/book/audio-manifest.ts:144) 한 곳에 모은 것과 같은
 * 원칙이다 — 목록이 여러 곳에 흩어지면 화면마다 다른 단어가 나온다.
 *
 * 외부 불용어 라이브러리를 쓰지 않는다(Hard Rule 11 — PLAN.md 미명시 라이브러리 금지).
 *
 * ★ 수록 기준 — **기능어만 넣는다.**
 *   표준 영어 불용어 목록(약 170개)보다 의도적으로 **작게** 잡았다. `run`·`big`·`eat`처럼
 *   3~7세가 배울 가치가 있는 쉬운 내용어가 실수로 걸러지면 파일럿의 재미가 사라지기
 *   때문이다(ADR-0065 §단어 선정 규칙 초안, 제안 범위 80~120개).
 *
 * ★ **2자 이하 기능어는 싣지 않는다**(`a`·`i`·`is`·`it`·`in`·`on`·`of`·`to` 등).
 *   select-words.ts의 길이 하한(MIN_WORD_LENGTH = 3)이 토큰 단계에서 이미 전부 걸러내므로
 *   목록에 넣어도 판정에 관여하지 못한다. 넣으면 개수만 부풀어 제안 범위를 넘긴다.
 *   ※ 길이 하한을 3 미만으로 낮추려면 이 목록에 2자 기능어를 함께 복원해야 한다.
 *
 * ★ 의도적으로 **넣지 않은** 것들 — 판단 근거를 남긴다:
 *   - 공간·방향어(`over`·`under`·`out`·`off`·`down`·`above`·`below`): 문법상 전치사이나
 *     유아 영어에서는 어휘로 가르치는 내용어다.
 *   - `said`·`says`: 그림책에서 압도적으로 빈출하지만 내용 동사다. 위 수록 기준상 제외
 *     대상이 아니다. 다만 **거의 모든 책에서 상위 빈도를 차지**하므로 실제 카드 품질은
 *     E-2b 검수에서 재판단이 필요하다(본 파일럿은 ADR 규칙 그대로 간다).
 *   - 고유명사(등장인물 이름): 목록으로 막을 수 없다. select-words.ts가
 *     `alwaysCapitalized` 신호를 함께 반환하되 **필터에는 쓰지 않는다**(ADR 미규정).
 */

/** 불용어 집합. 전부 소문자·정규화된 형태(굽은 따옴표는 `'`로 통일된 뒤 대조된다). */
export const STOPWORDS: ReadonlySet<string> = new Set([
  // 관사·한정사 (16)
  'the', 'this', 'that', 'these', 'those',
  'some', 'any', 'all', 'both', 'each', 'every', 'other', 'another', 'such', 'same', 'own',

  // 대명사 (23)
  'you', 'she', 'they', 'him', 'her', 'them',
  'your', 'his', 'its', 'our', 'their',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',
  'who', 'whom', 'whose', 'which', 'what',

  // be · have · do (기능 용법) (12)
  'are', 'was', 'were', 'been', 'being',
  'has', 'have', 'had', 'having',
  'does', 'did', 'doing',

  // 조동사 (9)
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',

  // 전치사 — 문법 기능 전용(공간·방향어는 위 주석대로 제외) (14)
  'for', 'with', 'from', 'about', 'into', 'onto', 'through',
  'between', 'among', 'against', 'before', 'after', 'during', 'without',

  // 접속사·종속절 표지 (16)
  'and', 'but', 'nor', 'yet', 'then', 'than',
  'because', 'while', 'when', 'where', 'why', 'how',
  'until', 'though', 'although', 'whether',

  // 부사·기타 기능어 (17)
  'not', 'very', 'too', 'also', 'just', 'only',
  'more', 'most', 'here', 'there', 'now', 'again', 'still',
  'never', 'always', 'once', 'ever',

  // 축약형 — 굽은 따옴표 정규화 후 형태. 빈출 상위만 싣는다 (12)
  "don't", "doesn't", "didn't", "isn't", "can't", "won't",
  "i'm", "it's", "he's", "she's", "that's", "there's",
]);

/** 불용어 개수 — ADR-0065 제안 범위(80~120개) 준수를 코드로 확인 가능하게 노출한다. */
export const STOPWORD_COUNT = STOPWORDS.size;
