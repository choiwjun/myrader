/**
 * X-SAG Core Engine — NLP Rules tests
 *
 * Phase P-A: NLP 기반 룰 8개 검증 (각 룰 pass/fail + nlpResult 없을 때).
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { NlpResult } from "../../../v2/nlp/types.js";
import type { RuleContext } from "../../types.js";
import {
	nlpEeatAuthor001,
	nlpEeatExpertise001,
	nlpEeatTrust001,
	nlpKeywordDensity001,
	nlpReadability001,
	nlpSemanticAlign001,
	nlpSentenceLength001,
	nlpTopicRelevance001,
} from "../nlp-rules.js";

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example.co.kr/",
		statusCode: 200,
		title: "테스트",
		description: "테스트 설명",
		h1: "테스트",
		h2: [],
		meta: {},
		bodyText: "테스트 본문",
		wordCount: 2,
		internalLinks: [],
		externalLinks: [],
		images: [],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: null,
		robotsMeta: null,
		...overrides,
	};
}

function makeNlp(overrides: Partial<NlpResult> = {}): NlpResult {
	return {
		keywordDensity: {
			targetKeywords: [{ keyword: "키워드", count: 5, density: 0.02 }],
			topNouns: [{ word: "키워드", count: 5 }],
		},
		topics: [{ topic: "테스트 업종 강남", relevance: 0.8 }],
		readability: {
			avgSentenceLength: 18,
			avgParagraphLength: 3,
			score: 80,
		},
		eeat: {
			hasAuthor: true,
			hasExpertiseSignals: 3,
			hasTrustSignals: 3,
			hasFreshness: true,
			score: 90,
		},
		semanticRelevance: {
			titleBodyAlignment: 0.8,
			keywordIntegration: 0.7,
		},
		source: "mock",
		analyzedAt: "2025-01-15T00:00:00.000Z",
		...overrides,
	};
}

function makeCtx(
	nlp?: NlpResult,
	pageOverrides: Partial<ParsedPage> = {},
	profile?: Partial<RuleContext["businessProfile"]>,
): RuleContext {
	const mainPage = makePage(pageOverrides);
	return {
		pages: [mainPage],
		mainPage,
		businessProfile: {
			businessName: "테스트업체",
			industry: "테스트 업종",
			region: "강남",
			mainServices: ["서비스1"],
			targetKeywords: ["키워드"],
			...profile,
		},
		...(nlp ? { nlpResult: nlp } : {}),
	};
}

// ---------------------------------------------------------------------------
// NLP-KEYWORD-DENSITY-001
// ---------------------------------------------------------------------------
describe("NLP-KEYWORD-DENSITY-001", () => {
	it("passes when most keywords in 1~3% range", () => {
		const ctx = makeCtx(
			makeNlp({
				keywordDensity: {
					targetKeywords: [{ keyword: "키워드", count: 5, density: 0.02 }],
					topNouns: [],
				},
			}),
		);
		const r = nlpKeywordDensity001(ctx);
		expect(r.ruleId).toBe("NLP-KEYWORD-DENSITY-001");
		expect(r.category).toBe("seo");
		expect(r.passed).toBe(true);
	});

	it("fails when density too low", () => {
		const ctx = makeCtx(
			makeNlp({
				keywordDensity: {
					targetKeywords: [{ keyword: "키워드", count: 0, density: 0 }],
					topNouns: [],
				},
			}),
		);
		expect(nlpKeywordDensity001(ctx).passed).toBe(false);
	});

	it("fails when density too high (keyword stuffing)", () => {
		const ctx = makeCtx(
			makeNlp({
				keywordDensity: {
					targetKeywords: [{ keyword: "키워드", count: 100, density: 0.15 }],
					topNouns: [],
				},
			}),
		);
		expect(nlpKeywordDensity001(ctx).passed).toBe(false);
	});

	it("passes when no nlpResult (info unavailable)", () => {
		const ctx = makeCtx();
		expect(nlpKeywordDensity001(ctx).passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// NLP-TOPIC-RELEVANCE-001
// ---------------------------------------------------------------------------
describe("NLP-TOPIC-RELEVANCE-001", () => {
	it("passes when industry in topics", () => {
		const ctx = makeCtx(
			makeNlp({ topics: [{ topic: "테스트 업종 클래스", relevance: 0.9 }] }),
		);
		expect(nlpTopicRelevance001(ctx).passed).toBe(true);
	});

	it("passes when region in topics", () => {
		const ctx = makeCtx(
			makeNlp({ topics: [{ topic: "강남 인근", relevance: 0.7 }] }),
			{},
			{ industry: "전혀다른업종" },
		);
		expect(nlpTopicRelevance001(ctx).passed).toBe(true);
	});

	it("fails when neither industry nor region in topics", () => {
		const ctx = makeCtx(
			makeNlp({ topics: [{ topic: "다른 주제", relevance: 0.5 }] }),
			{},
			{ industry: "독특한업종", region: "어딘가" },
		);
		expect(nlpTopicRelevance001(ctx).passed).toBe(false);
	});

	it("passes when nlpResult missing", () => {
		expect(nlpTopicRelevance001(makeCtx()).passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// NLP-READABILITY-001
// ---------------------------------------------------------------------------
describe("NLP-READABILITY-001", () => {
	it("passes when readability score ≥ 60", () => {
		const ctx = makeCtx(
			makeNlp({
				readability: {
					avgSentenceLength: 15,
					avgParagraphLength: 3,
					score: 75,
				},
			}),
		);
		expect(nlpReadability001(ctx).passed).toBe(true);
	});

	it("fails when score < 60", () => {
		const ctx = makeCtx(
			makeNlp({
				readability: {
					avgSentenceLength: 40,
					avgParagraphLength: 8,
					score: 30,
				},
			}),
		);
		expect(nlpReadability001(ctx).passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// NLP-SENTENCE-LENGTH-001
// ---------------------------------------------------------------------------
describe("NLP-SENTENCE-LENGTH-001", () => {
	it("passes when avg sentence length ≤ 25", () => {
		const ctx = makeCtx(
			makeNlp({
				readability: {
					avgSentenceLength: 20,
					avgParagraphLength: 3,
					score: 80,
				},
			}),
		);
		const r = nlpSentenceLength001(ctx);
		expect(r.passed).toBe(true);
		expect(r.severity).toBe("low");
	});

	it("fails when > 25 어절", () => {
		const ctx = makeCtx(
			makeNlp({
				readability: {
					avgSentenceLength: 35,
					avgParagraphLength: 3,
					score: 60,
				},
			}),
		);
		expect(nlpSentenceLength001(ctx).passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// NLP-EEAT-AUTHOR-001
// ---------------------------------------------------------------------------
describe("NLP-EEAT-AUTHOR-001", () => {
	it("passes when hasAuthor=true", () => {
		const ctx = makeCtx(
			makeNlp({
				eeat: {
					hasAuthor: true,
					hasExpertiseSignals: 0,
					hasTrustSignals: 0,
					hasFreshness: false,
					score: 30,
				},
			}),
		);
		const r = nlpEeatAuthor001(ctx);
		expect(r.passed).toBe(true);
		expect(r.category).toBe("aeo");
	});

	it("fails when hasAuthor=false", () => {
		const ctx = makeCtx(
			makeNlp({
				eeat: {
					hasAuthor: false,
					hasExpertiseSignals: 5,
					hasTrustSignals: 5,
					hasFreshness: true,
					score: 70,
				},
			}),
		);
		expect(nlpEeatAuthor001(ctx).passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// NLP-EEAT-EXPERTISE-001
// ---------------------------------------------------------------------------
describe("NLP-EEAT-EXPERTISE-001", () => {
	it("passes when expertise signals ≥ 2", () => {
		const ctx = makeCtx(
			makeNlp({
				eeat: {
					hasAuthor: false,
					hasExpertiseSignals: 3,
					hasTrustSignals: 0,
					hasFreshness: false,
					score: 30,
				},
			}),
		);
		expect(nlpEeatExpertise001(ctx).passed).toBe(true);
	});

	it("fails when expertise signals < 2", () => {
		const ctx = makeCtx(
			makeNlp({
				eeat: {
					hasAuthor: true,
					hasExpertiseSignals: 1,
					hasTrustSignals: 5,
					hasFreshness: true,
					score: 60,
				},
			}),
		);
		expect(nlpEeatExpertise001(ctx).passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// NLP-EEAT-TRUST-001
// ---------------------------------------------------------------------------
describe("NLP-EEAT-TRUST-001", () => {
	it("passes when trust signals ≥ 2", () => {
		const ctx = makeCtx(
			makeNlp({
				eeat: {
					hasAuthor: false,
					hasExpertiseSignals: 0,
					hasTrustSignals: 3,
					hasFreshness: false,
					score: 30,
				},
			}),
		);
		expect(nlpEeatTrust001(ctx).passed).toBe(true);
	});

	it("passes when hasFreshness=true (even with 0 trust)", () => {
		const ctx = makeCtx(
			makeNlp({
				eeat: {
					hasAuthor: false,
					hasExpertiseSignals: 0,
					hasTrustSignals: 0,
					hasFreshness: true,
					score: 20,
				},
			}),
		);
		expect(nlpEeatTrust001(ctx).passed).toBe(true);
	});

	it("fails when trust < 2 and no freshness", () => {
		const ctx = makeCtx(
			makeNlp({
				eeat: {
					hasAuthor: true,
					hasExpertiseSignals: 5,
					hasTrustSignals: 1,
					hasFreshness: false,
					score: 40,
				},
			}),
		);
		expect(nlpEeatTrust001(ctx).passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// NLP-SEMANTIC-ALIGN-001
// ---------------------------------------------------------------------------
describe("NLP-SEMANTIC-ALIGN-001", () => {
	it("passes when titleBodyAlignment ≥ 0.5", () => {
		const ctx = makeCtx(
			makeNlp({
				semanticRelevance: { titleBodyAlignment: 0.7, keywordIntegration: 0.5 },
			}),
		);
		expect(nlpSemanticAlign001(ctx).passed).toBe(true);
	});

	it("fails when alignment < 0.5", () => {
		const ctx = makeCtx(
			makeNlp({
				semanticRelevance: { titleBodyAlignment: 0.2, keywordIntegration: 0.1 },
			}),
		);
		expect(nlpSemanticAlign001(ctx).passed).toBe(false);
	});

	it("passes when nlpResult missing", () => {
		expect(nlpSemanticAlign001(makeCtx()).passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// General rule contract
// ---------------------------------------------------------------------------
describe("NLP rule contract", () => {
	it("all rules return correct ruleId and weight", () => {
		const ctx = makeCtx(makeNlp());
		const rules = [
			{ fn: nlpKeywordDensity001, id: "NLP-KEYWORD-DENSITY-001", weight: 6 },
			{ fn: nlpTopicRelevance001, id: "NLP-TOPIC-RELEVANCE-001", weight: 6 },
			{ fn: nlpReadability001, id: "NLP-READABILITY-001", weight: 6 },
			{ fn: nlpSentenceLength001, id: "NLP-SENTENCE-LENGTH-001", weight: 3 },
			{ fn: nlpEeatAuthor001, id: "NLP-EEAT-AUTHOR-001", weight: 6 },
			{ fn: nlpEeatExpertise001, id: "NLP-EEAT-EXPERTISE-001", weight: 6 },
			{ fn: nlpEeatTrust001, id: "NLP-EEAT-TRUST-001", weight: 6 },
			{ fn: nlpSemanticAlign001, id: "NLP-SEMANTIC-ALIGN-001", weight: 6 },
		];
		for (const { fn, id, weight } of rules) {
			const r = fn(ctx);
			expect(r.ruleId).toBe(id);
			expect(r.ruleWeight).toBe(weight);
			expect(["seo", "aeo"]).toContain(r.category);
		}
	});
});
