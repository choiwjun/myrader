/**
 * X-SAG Core Engine — Korean Morphology Analyzer (pure TS, zero deps)
 *
 * Phase R-C: 한국어 형태소 분석기 — 외부 의존성 없이 휴리스틱으로 명사/동사/형용사를 추출한다.
 *
 * 동기:
 * - mecab-ko 같은 네이티브 의존은 빌드 복잡도가 너무 크다.
 * - 정확한 형태소 분석은 어렵지만, 명사 추출/조사 제거/어미 제거는 패턴 기반으로 80%+ 가능.
 *
 * 알고리즘:
 * 1. 한글 어절 분리 (공백/구두점 기준)
 * 2. 조사 제거 (은/는/이/가/을/를/에/에서/의/으로 등 20+ 패턴)
 * 3. 어미 제거 (다/요/까/는/한/할/것 등 15+ 패턴)
 * 4. 한국어 명사 패턴 매칭 (2~4글자 위주, 한자/숫자/영문 포함 가능)
 * 5. stopword 필터 (50+ 단어)
 *
 * 동사/형용사는 추정만 가능 (활용형이 매우 다양). 활용 어미가 발견된 경우만 분류한다.
 *
 * POLICY § 7.1: 결정적·재현 가능.
 */

// ---------------------------------------------------------------------------
// 한국어 조사 (postposition) 패턴 — 명사 뒤에 붙어 격을 표시
// 길이가 긴 것부터 짧은 순으로 정렬해서 매칭 누락 방지.
// ---------------------------------------------------------------------------
const POSTPOSITIONS: readonly string[] = [
	// 주격/보격/관형격/처격/도구격/공동격 등
	"으로부터",
	"에서는",
	"에서도",
	"에서의",
	"에게는",
	"에게도",
	"에게서",
	"이라는",
	"라는",
	"에서",
	"에게",
	"에는",
	"에도",
	"에서",
	"으로",
	"이라",
	"라고",
	"보다",
	"처럼",
	"만큼",
	"마다",
	"까지",
	"부터",
	"조차",
	"마저",
	"이나",
	"이며",
	"이라",
	"은",
	"는",
	"이",
	"가",
	"을",
	"를",
	"의",
	"에",
	"로",
	"와",
	"과",
	"도",
	"만",
	"나",
	"며",
	"야",
];

// ---------------------------------------------------------------------------
// 한국어 동사 어미 — 명백히 동사인 활용형만 (긴 것부터)
// "한/은/ㄴ/는" 같은 조사와 헷갈리는 어미는 제외 (postposition 으로 처리).
// ---------------------------------------------------------------------------
const VERB_ENDINGS: readonly string[] = [
	"었습니다",
	"았습니다",
	"겠습니다",
	"습니다",
	"ㅂ니다",
	"합니다",
	"됩니다",
	"입니다",
	"겠다",
	"ㄴ다",
	"는다",
	"한다",
	"됐다",
	"했다",
	"였다",
	"이다",
	"예요",
	"에요",
	"어요",
	"아요",
	"해요",
	"돼요",
];

// 형용사 어미 — 명백히 형용사 파생형만.
// 짧은 "한/은/ㄴ" 은 너무 모호해서 제외.
const ADJ_ENDINGS: readonly string[] = [
	"스럽다",
	"스러운",
	"스럽게",
	"로운",
	"롭다",
	"답다",
	"다운",
	"있는",
	"없는",
	"있다",
	"없다",
];

// ---------------------------------------------------------------------------
// 한국어 stopwords (조사·접속사·대명사·일반 부사·수식어)
// 50+ 단어. rule-based.ts 의 KOREAN_STOPWORDS 와 일부 중복 OK.
// ---------------------------------------------------------------------------
const KOREAN_STOPWORDS: ReadonlySet<string> = new Set([
	// 대명사
	"이",
	"그",
	"저",
	"것",
	"수",
	"곳",
	"분",
	"이것",
	"그것",
	"저것",
	"여기",
	"거기",
	"저기",
	"우리",
	"저희",
	"그들",
	"자기",
	"본인",
	// 의문사
	"무엇",
	"어떻게",
	"어디",
	"언제",
	"왜",
	"누구",
	"얼마",
	"몇",
	// 접속사
	"그리고",
	"그러나",
	"하지만",
	"또는",
	"또한",
	"그래서",
	"따라서",
	"그러면",
	"그래도",
	"그런데",
	"즉",
	"예를",
	// 일반 부사
	"더",
	"덜",
	"매우",
	"정말",
	"아주",
	"너무",
	"조금",
	"약간",
	"거의",
	"이미",
	"아직",
	"지금",
	"오늘",
	"어제",
	"내일",
	// 수식어 (관형사)
	"이런",
	"그런",
	"저런",
	"어떤",
	"모든",
	"각",
	"다른",
	"같은",
	"여러",
	"이러한",
	"그러한",
	"저러한",
	// 의존명사
	"등",
	"및",
	"위해",
	"통해",
	"대한",
	"때문",
	"경우",
	"때",
	"후",
	"전",
	"동안",
	"위",
	"아래",
	// 일반 verbs (활용형)
	"있다",
	"없다",
	"하다",
	"되다",
	"있는",
	"없는",
	"있습니다",
	"없습니다",
	"합니다",
	"됩니다",
	"있어요",
	"없어요",
	// 기타
	"안",
	"못",
	"잘",
	"좀",
	"꼭",
	"다",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MorphologyWordItem {
	word: string;
	count: number;
	positions: number[];
}

export interface MorphologyVerbItem {
	word: string;
	count: number;
}

export interface MorphologyResult {
	nouns: MorphologyWordItem[];
	verbs: MorphologyVerbItem[];
	adjectives: MorphologyVerbItem[];
	totalTokens: number;
	uniqueTokens: number;
	/** 한국어 비율 (한자/영문/숫자 제외) — 0.0 ~ 1.0 */
	koreanRatio: number;
}

export interface ExtractNounsOptions {
	/** 최소 명사 길이. 기본 2. */
	minLength?: number;
	/** 상위 N 개만 반환. 기본 무제한. */
	topN?: number;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** 한글 음절 범위 (가-힣). */
const KOREAN_SYLLABLE_RE = /[가-힣]/u;

/** 한 글자가 한글 음절인지. */
function isKoreanChar(ch: string): boolean {
	return KOREAN_SYLLABLE_RE.test(ch);
}

/** 어절을 공백/구두점으로 분리. 한국어 + 영문/숫자 토큰 보존. */
function splitEojeol(text: string): string[] {
	if (!text) return [];
	// 구두점·괄호·특수문자 분리. 마침표는 포함 (URL/소수점은 흔하지 않은 케이스).
	return text
		.split(/[\s.,;:!?。！？()\[\]{}"'`~|/\\<>@#$%^&*+=]+/u)
		.map((t) => t.trim())
		.filter((t) => t.length > 0);
}

/** 한국어 어절에서 조사를 제거. 길이가 긴 조사부터 시도. */
function stripPostposition(eojeol: string): string {
	if (!eojeol || eojeol.length < 2) return eojeol;
	// 마지막 글자가 한글이 아니면 (영문/숫자만) 조사 없음
	const lastCh = eojeol[eojeol.length - 1];
	if (!lastCh || !isKoreanChar(lastCh)) return eojeol;

	for (const post of POSTPOSITIONS) {
		if (eojeol.length > post.length && eojeol.endsWith(post)) {
			const stem = eojeol.slice(0, eojeol.length - post.length);
			// 어간 최소 2자 보존 (한글 명사는 보통 2자 이상)
			if (stem.length >= 2) return stem;
		}
	}
	return eojeol;
}

/** 동사/형용사 어미 매칭. 어미가 발견되면 분류 가능. */
function detectVerbStem(
	eojeol: string,
): { stem: string; isVerb: boolean } | null {
	if (!eojeol || eojeol.length < 2) return null;
	const lastCh = eojeol[eojeol.length - 1];
	if (!lastCh || !isKoreanChar(lastCh)) return null;

	for (const ending of VERB_ENDINGS) {
		if (eojeol.length > ending.length && eojeol.endsWith(ending)) {
			const stem = eojeol.slice(0, eojeol.length - ending.length);
			if (stem.length >= 1) return { stem, isVerb: true };
		}
	}
	return null;
}

function detectAdjStem(
	eojeol: string,
): { stem: string; isAdj: boolean } | null {
	if (!eojeol || eojeol.length < 2) return null;
	const lastCh = eojeol[eojeol.length - 1];
	if (!lastCh || !isKoreanChar(lastCh)) return null;

	for (const ending of ADJ_ENDINGS) {
		if (eojeol.length > ending.length && eojeol.endsWith(ending)) {
			const stem = eojeol.slice(0, eojeol.length - ending.length);
			// 어간 ≥ 1 (한 글자 어간도 형용사 가능: "맛"+"있는")
			if (stem.length >= 1) return { stem, isAdj: true };
		}
	}
	return null;
}

/** 어절이 명사 후보인지 추정 — 한글/영문/숫자, 길이 2~6, stopword 아님. */
function isNounCandidate(word: string, minLength: number): boolean {
	if (word.length < minLength) return false;
	if (word.length > 12) return false;
	if (KOREAN_STOPWORDS.has(word)) return false;
	// 숫자만 있는 토큰은 명사 아님
	if (/^[\d.]+$/u.test(word)) return false;
	// 1글자만 있는 한글은 일반적으로 명사 아님 (이미 minLength 로 컷)
	return true;
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export class KoreanMorphologyAnalyzer {
	/**
	 * 텍스트 전체 분석 — 명사/동사/형용사 카운트 + 한국어 비율.
	 */
	analyze(text: string): MorphologyResult {
		if (!text || text.length === 0) {
			return {
				nouns: [],
				verbs: [],
				adjectives: [],
				totalTokens: 0,
				uniqueTokens: 0,
				koreanRatio: 0,
			};
		}

		const eojeols = splitEojeol(text);
		const totalTokens = eojeols.length;

		const nounMap = new Map<string, { count: number; positions: number[] }>();
		const verbMap = new Map<string, number>();
		const adjMap = new Map<string, number>();

		eojeols.forEach((eojeol, idx) => {
			// 1) 형용사 어미 우선 검사 (verb 보다 좁은 패턴 우선)
			const adj = detectAdjStem(eojeol);
			if (adj?.isAdj) {
				// 형용사 어간이 stopword 가 아닌 경우만
				if (!KOREAN_STOPWORDS.has(adj.stem)) {
					adjMap.set(adj.stem, (adjMap.get(adj.stem) ?? 0) + 1);
				}
				return;
			}

			// 2) 동사 어미 검사
			const verb = detectVerbStem(eojeol);
			if (verb?.isVerb) {
				if (!KOREAN_STOPWORDS.has(verb.stem)) {
					verbMap.set(verb.stem, (verbMap.get(verb.stem) ?? 0) + 1);
				}
				return;
			}

			// 3) 명사 후보 — 조사 제거 후 검증
			const stripped = stripPostposition(eojeol);
			if (isNounCandidate(stripped, 2)) {
				const existing = nounMap.get(stripped);
				if (existing) {
					existing.count += 1;
					existing.positions.push(idx);
				} else {
					nounMap.set(stripped, { count: 1, positions: [idx] });
				}
			}
		});

		const nouns: MorphologyWordItem[] = Array.from(nounMap.entries())
			.map(([word, v]) => ({ word, count: v.count, positions: v.positions }))
			.sort((a, b) => b.count - a.count);

		const verbs: MorphologyVerbItem[] = Array.from(verbMap.entries())
			.map(([word, count]) => ({ word, count }))
			.sort((a, b) => b.count - a.count);

		const adjectives: MorphologyVerbItem[] = Array.from(adjMap.entries())
			.map(([word, count]) => ({ word, count }))
			.sort((a, b) => b.count - a.count);

		const uniqueTokens = nouns.length + verbs.length + adjectives.length;

		// 한국어 비율 — 전체 글자 중 한글 음절 비율
		let koreanChars = 0;
		let totalChars = 0;
		for (const ch of text) {
			if (ch.trim().length === 0) continue;
			totalChars += 1;
			if (isKoreanChar(ch)) koreanChars += 1;
		}
		const koreanRatio =
			totalChars > 0
				? Math.round((koreanChars / totalChars) * 10000) / 10000
				: 0;

		return {
			nouns,
			verbs,
			adjectives,
			totalTokens,
			uniqueTokens,
			koreanRatio,
		};
	}

	/**
	 * 명사만 빠르게 추출. analyze() 의 nouns 와 동일하지만 topN/minLength 옵션 제공.
	 */
	extractNouns(
		text: string,
		opts: ExtractNounsOptions = {},
	): Array<{ word: string; count: number }> {
		const minLength = opts.minLength ?? 2;
		if (!text || text.length === 0) return [];

		const eojeols = splitEojeol(text);
		const nounMap = new Map<string, number>();

		for (const eojeol of eojeols) {
			// 형용사/동사 어미면 명사 아님
			if (detectAdjStem(eojeol)?.isAdj) continue;
			if (detectVerbStem(eojeol)?.isVerb) continue;

			const stripped = stripPostposition(eojeol);
			if (isNounCandidate(stripped, minLength)) {
				nounMap.set(stripped, (nounMap.get(stripped) ?? 0) + 1);
			}
		}

		const list = Array.from(nounMap.entries())
			.map(([word, count]) => ({ word, count }))
			.sort((a, b) => b.count - a.count);

		return opts.topN !== undefined ? list.slice(0, opts.topN) : list;
	}

	/**
	 * 형태소 기반 키워드 밀도 — 단어 단위로 정확하게 계산.
	 *
	 * 기존 substring 매칭의 부정확성을 보완:
	 * - "가죽공방의" 가 있어도 "가죽공방" 키워드로 카운트되도록 조사 제거.
	 * - 단, 키워드 자체가 명사가 아니면 substring 폴백.
	 *
	 * @returns 0.0 ~ 1.0 (전체 어절 대비 키워드 매칭 비율)
	 */
	calculateKeywordDensity(text: string, keyword: string): number {
		if (!text || !keyword || text.length === 0 || keyword.length === 0) {
			return 0;
		}

		const eojeols = splitEojeol(text);
		const totalWords = Math.max(eojeols.length, 1);

		let matchCount = 0;
		for (const eojeol of eojeols) {
			// 1) 정확 매칭
			if (eojeol === keyword) {
				matchCount += 1;
				continue;
			}
			// 2) 조사 제거 후 매칭 (한국어 어절)
			const stripped = stripPostposition(eojeol);
			if (stripped === keyword) {
				matchCount += 1;
				continue;
			}
			// 3) substring 매칭 — 키워드가 어절의 일부일 수 있음
			// (예: "강남구청" 어절 안에 "강남" 키워드)
			if (eojeol.includes(keyword)) {
				matchCount += 1;
			}
		}

		const density = matchCount / totalWords;
		return Math.min(Math.round(density * 10000) / 10000, 1);
	}
}
