/**
 * X-SAG Core Engine — Rule-Based NLP Provider (always-on fallback)
 *
 * LLM 없이 정규식 + 한국어 휴리스틱으로 NLP 분석.
 * 폴백 의미 — 정확도는 LLM(ChatMock) 보다 낮지만 결정적이고 빠르다.
 *
 * POLICY § 7.1: 결정적·재현 가능.
 */

import type {
	KeywordDensityItem,
	NlpEeat,
	NlpInput,
	NlpKeywordDensity,
	NlpProvider,
	NlpReadability,
	NlpResult,
	NlpSemanticRelevance,
	NlpTopic,
	TopNoun,
} from "../types.js";
import { KoreanMorphologyAnalyzer } from "./korean-morphology.js";

// Phase R-C: 형태소 분석기 — keyword density / top nouns 정확도 보강.
const MORPH = new KoreanMorphologyAnalyzer();

// ---------------------------------------------------------------------------
// 한국어 stopwords (조사·접속사·일반 대명사)
// ---------------------------------------------------------------------------
const KOREAN_STOPWORDS = new Set([
	"이",
	"그",
	"저",
	"것",
	"수",
	"등",
	"및",
	"또는",
	"그리고",
	"또한",
	"하지만",
	"그러나",
	"그래서",
	"때문",
	"위해",
	"통해",
	"대한",
	"있는",
	"없는",
	"있습니다",
	"없습니다",
	"합니다",
	"됩니다",
	"있다",
	"없다",
	"하다",
	"되다",
	"같은",
	"다른",
	"더",
	"덜",
	"매우",
	"정말",
	"아주",
	"너무",
	"이런",
	"그런",
	"저런",
	"어떤",
	"모든",
	"어떻게",
	"왜",
	"무엇",
]);

// ---------------------------------------------------------------------------
// Tokenizer / Sentence splitter
// ---------------------------------------------------------------------------

/** 한국어 + 영문 어절 분리 (공백/구두점 기준). 길이 ≥ 2, stopword 제외. */
function tokenize(text: string): string[] {
	if (!text) return [];
	return text
		.split(/[\s,.;:!?()\[\]{}"'`~|/\\<>@#$%^&*+=\-_]+/u)
		.map((t) => t.trim())
		.filter((t) => t.length >= 2 && !KOREAN_STOPWORDS.has(t));
}

/** 문장 분리 — 마침표/물음표/느낌표/줄바꿈 기준. 한국어 어미 고려. */
function splitSentences(text: string): string[] {
	if (!text) return [];
	return text
		.split(/[.!?。！？\n]+/u)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/** 단락 분리 — 빈 줄 기준. 빈 줄이 없으면 문장 그룹으로 묶기. */
function splitParagraphs(text: string): string[] {
	if (!text) return [];
	// 빈 줄(연속 \n) 기준 우선
	const byBlank = text
		.split(/\n\s*\n+/u)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	if (byBlank.length > 1) return byBlank;
	// 빈 줄이 없으면 단일 단락
	return [text.trim()].filter((p) => p.length > 0);
}

// ---------------------------------------------------------------------------
// Keyword density
// ---------------------------------------------------------------------------

function calculateKeywordDensity(
	bodyText: string,
	targetKeywords: string[],
): NlpKeywordDensity {
	const tokens = tokenize(bodyText);
	const totalWords = Math.max(tokens.length, 1);

	// Target keyword counts: 전체 본문에서 substring 매칭 (count 는 정확성 보존).
	// Density 는 형태소 분석 기반 정확 계산으로 보강.
	const targetItems: KeywordDensityItem[] = targetKeywords.map((kw) => {
		if (!kw || kw.length === 0) {
			return { keyword: kw, count: 0, density: 0 };
		}
		const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const re = new RegExp(safe, "giu");
		const matches = bodyText.match(re);
		const count = matches ? matches.length : 0;
		// density: 형태소 분석기로 정확 계산 (조사 제거된 어절 매칭).
		const morphDensity = MORPH.calculateKeywordDensity(bodyText, kw);
		// 폴백: morph 가 0 인데 substring 매칭이 있는 경우 휴리스틱 계산
		const fallbackDensity = Math.min(count / totalWords, 1);
		const density = morphDensity > 0 ? morphDensity : fallbackDensity;
		return {
			keyword: kw,
			count,
			density: Math.round(density * 10000) / 10000,
		};
	});

	// Top nouns: 형태소 분석기로 명사만 정확하게 추출 (조사/어미 제거 후).
	// 폴백: 형태소 결과가 빈 경우 기존 토큰 빈도.
	const morphNouns = MORPH.extractNouns(bodyText, { minLength: 2, topN: 10 });
	let topNouns: TopNoun[];
	if (morphNouns.length > 0) {
		topNouns = morphNouns.map((n) => ({ word: n.word, count: n.count }));
	} else {
		const freq = new Map<string, number>();
		for (const t of tokens) {
			const lower = t.toLowerCase();
			freq.set(lower, (freq.get(lower) ?? 0) + 1);
		}
		topNouns = Array.from(freq.entries())
			.map(([word, count]) => ({ word, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);
	}

	return { targetKeywords: targetItems, topNouns };
}

// ---------------------------------------------------------------------------
// Topics — H1/H2 + target keywords 를 토픽으로 간주 (휴리스틱)
// ---------------------------------------------------------------------------

function extractTopics(input: NlpInput): NlpTopic[] {
	const topics: NlpTopic[] = [];
	const seen = new Set<string>();

	function add(topic: string, relevance: number): void {
		const trimmed = topic.trim();
		if (trimmed.length === 0) return;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		topics.push({ topic: trimmed, relevance });
	}

	if (input.h1) add(input.h1, 0.9);
	for (const h2 of input.h2.slice(0, 3)) {
		add(h2, 0.7);
	}
	for (const kw of input.targetKeywords.slice(0, 3)) {
		add(kw, 0.6);
	}
	add(input.industry, 0.5);
	add(input.region, 0.4);

	return topics.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Readability
// ---------------------------------------------------------------------------

function calculateReadability(bodyText: string): NlpReadability {
	const sentences = splitSentences(bodyText);
	const paragraphs = splitParagraphs(bodyText);

	if (sentences.length === 0) {
		return { avgSentenceLength: 0, avgParagraphLength: 0, score: 0 };
	}

	const sentenceWordCounts = sentences.map(
		(s) => s.split(/\s+/u).filter((w) => w.length > 0).length,
	);
	const avgSentenceLength =
		sentenceWordCounts.reduce((a, b) => a + b, 0) / sentences.length;

	const paragraphSentenceCounts = paragraphs.map(
		(p) => splitSentences(p).length,
	);
	const avgParagraphLength =
		paragraphSentenceCounts.reduce((a, b) => a + b, 0) /
		Math.max(paragraphs.length, 1);

	// 한국어 권장: 평균 어절 25 이하, 단락당 문장 5 이하.
	const sentencePenalty = Math.max(0, avgSentenceLength - 25);
	const paragraphPenalty = Math.max(0, avgParagraphLength - 5) * 5;
	const score = Math.max(
		0,
		Math.min(100, 100 - sentencePenalty - paragraphPenalty),
	);

	return {
		avgSentenceLength: Math.round(avgSentenceLength * 100) / 100,
		avgParagraphLength: Math.round(avgParagraphLength * 100) / 100,
		score: Math.round(score),
	};
}

// ---------------------------------------------------------------------------
// E-E-A-T signals
// ---------------------------------------------------------------------------

function extractEeat(input: NlpInput): NlpEeat {
	const body = input.bodyText;

	// Author 존재
	const authorPattern =
		/글쓴이|작성자|저자|글:\s|by\s+[가-힣A-Za-z]+|writer|편집자/iu;
	const hasAuthor = authorPattern.test(body);

	// Expertise signals — 카운트
	const expertisePattern =
		/경력\s*\d+\s*년|\d+\s*년\s*(경력|업력|운영|이상)|자격증|박사|석사|교수|전문가|전문의|전문직|인증|공인|면허|특허|연구원|학위|마스터|장인|10년|20년|N년/gu;
	const expertiseMatches = body.match(expertisePattern) ?? [];
	const hasExpertiseSignals = expertiseMatches.length;

	// Trust signals — 카운트
	const trustPattern =
		/수상|인증|후기|리뷰|평점|별점|만족도|TOP\s*\d+|\d+\s*명\s*(이상\s*)?(이용|선택|방문)|추천\s*\d+|구독자|회원\s*\d+/gu;
	const trustMatches = body.match(trustPattern) ?? [];
	const hasTrustSignals = trustMatches.length;

	// Freshness — 날짜 패턴
	const datePattern =
		/\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b|\d{4}\s*년\s*\d{1,2}\s*월|최근\s*업데이트|업데이트:\s*\d{4}/u;
	const hasFreshness = datePattern.test(body);

	// Score: hasAuthor*30 + min(hasExpertiseSignals*10, 30) + min(hasTrustSignals*10, 20) + hasFreshness*20
	const score =
		(hasAuthor ? 30 : 0) +
		Math.min(hasExpertiseSignals * 10, 30) +
		Math.min(hasTrustSignals * 10, 20) +
		(hasFreshness ? 20 : 0);

	return {
		hasAuthor,
		hasExpertiseSignals,
		hasTrustSignals,
		hasFreshness,
		score: Math.min(100, score),
	};
}

// ---------------------------------------------------------------------------
// Semantic relevance
// ---------------------------------------------------------------------------

function calculateSemanticRelevance(input: NlpInput): NlpSemanticRelevance {
	// titleBodyAlignment: title 토큰 중 body 에 등장하는 비율
	let titleBodyAlignment = 0;
	if (input.title) {
		const titleTokens = tokenize(input.title);
		if (titleTokens.length > 0) {
			const bodyLower = input.bodyText.toLowerCase();
			const matched = titleTokens.filter((t) =>
				bodyLower.includes(t.toLowerCase()),
			);
			titleBodyAlignment = matched.length / titleTokens.length;
		}
	}

	// keywordIntegration: 본문 문장 중 키워드가 자연스럽게 등장하는 비율
	// — 키워드가 등장한 문장 / 키워드가 본문에 등장한 횟수의 비율을 근사
	let keywordIntegration = 0;
	if (input.targetKeywords.length > 0) {
		const sentences = splitSentences(input.bodyText);
		let totalCovered = 0;
		let anyKwExists = false;
		for (const kw of input.targetKeywords) {
			if (!kw) continue;
			const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const re = new RegExp(safe, "iu");
			const bodyMatches = (input.bodyText.match(new RegExp(safe, "giu")) ?? [])
				.length;
			if (bodyMatches > 0) anyKwExists = true;
			const sentencesWithKw = sentences.filter((s) => re.test(s)).length;
			// 자연스러운 등장 = 한 문장 내에서 키워드가 1회 이하로 등장
			if (bodyMatches > 0) {
				const ratio = Math.min(sentencesWithKw / bodyMatches, 1);
				totalCovered += ratio;
			}
		}
		const presentKeywords = input.targetKeywords.filter((kw) => {
			if (!kw) return false;
			const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			return new RegExp(safe, "iu").test(input.bodyText);
		}).length;
		keywordIntegration =
			anyKwExists && presentKeywords > 0
				? Math.min(totalCovered / presentKeywords, 1)
				: 0;
	}

	return {
		titleBodyAlignment: Math.round(titleBodyAlignment * 10000) / 10000,
		keywordIntegration: Math.round(keywordIntegration * 10000) / 10000,
	};
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class RuleBasedNlpProvider implements NlpProvider {
	readonly name = "rule-based" as const;

	isAvailable(): boolean {
		return true;
	}

	async analyze(input: NlpInput): Promise<NlpResult> {
		const keywordDensity = calculateKeywordDensity(
			input.bodyText,
			input.targetKeywords,
		);
		const topics = extractTopics(input);
		const readability = calculateReadability(input.bodyText);
		const eeat = extractEeat(input);
		const semanticRelevance = calculateSemanticRelevance(input);

		return {
			keywordDensity,
			topics,
			readability,
			eeat,
			semanticRelevance,
			source: "rule-based",
			analyzedAt: new Date().toISOString(),
		};
	}
}
