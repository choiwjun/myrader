/**
 * X-SAG Core Engine — RuleBasedNlpProvider tests
 *
 * Phase P-A: 정규식·휴리스틱 NLP 분석기 검증.
 */

import { describe, expect, it } from "vitest";
import { RuleBasedNlpProvider } from "../providers/rule-based.js";
import type { NlpInput } from "../types.js";

function makeInput(overrides: Partial<NlpInput> = {}): NlpInput {
	return {
		url: "https://example.co.kr/",
		title: "강남 가죽공방 르쿠르",
		description: "강남 가죽공방 클래스 안내",
		bodyText:
			"강남 가죽공방 르쿠르입니다. 가죽공방 클래스를 운영합니다. 가죽공방 강남에서 1대1 수업을 진행합니다.",
		h1: "강남 가죽공방",
		h2: ["수업 안내", "오시는 길"],
		targetKeywords: ["가죽공방", "강남"],
		industry: "가죽공방",
		region: "강남",
		...overrides,
	};
}

describe("RuleBasedNlpProvider", () => {
	const provider = new RuleBasedNlpProvider();

	it("isAvailable() returns true (always available)", () => {
		expect(provider.isAvailable()).toBe(true);
	});

	it("returns source 'rule-based' and ISO timestamp", async () => {
		const result = await provider.analyze(makeInput());
		expect(result.source).toBe("rule-based");
		expect(result.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});

	// -------------------------------------------------------------------------
	// Keyword density
	// -------------------------------------------------------------------------
	describe("keyword density", () => {
		it("counts target keyword occurrences", async () => {
			const result = await provider.analyze(makeInput());
			const kw = result.keywordDensity.targetKeywords.find(
				(t) => t.keyword === "가죽공방",
			);
			expect(kw).toBeDefined();
			expect(kw?.count).toBeGreaterThanOrEqual(3);
			expect(kw?.density).toBeGreaterThan(0);
			expect(kw?.density).toBeLessThanOrEqual(1);
		});

		it("returns 0 count for keyword not in body", async () => {
			const result = await provider.analyze(
				makeInput({
					bodyText: "전혀 다른 내용입니다.",
					targetKeywords: ["없는키워드"],
				}),
			);
			expect(result.keywordDensity.targetKeywords[0]?.count).toBe(0);
			expect(result.keywordDensity.targetKeywords[0]?.density).toBe(0);
		});

		it("extracts top nouns sorted by frequency", async () => {
			const result = await provider.analyze(makeInput());
			expect(result.keywordDensity.topNouns.length).toBeGreaterThan(0);
			expect(result.keywordDensity.topNouns.length).toBeLessThanOrEqual(10);
			// Counts must be non-increasing
			for (let i = 1; i < result.keywordDensity.topNouns.length; i++) {
				const cur = result.keywordDensity.topNouns[i]!.count;
				const prev = result.keywordDensity.topNouns[i - 1]!.count;
				expect(cur).toBeLessThanOrEqual(prev);
			}
		});
	});

	// -------------------------------------------------------------------------
	// Topics
	// -------------------------------------------------------------------------
	describe("topics", () => {
		it("extracts topics from H1, H2 and target keywords", async () => {
			const result = await provider.analyze(makeInput());
			expect(result.topics.length).toBeGreaterThan(0);
			expect(result.topics.length).toBeLessThanOrEqual(5);
			const topicTexts = result.topics.map((t) => t.topic);
			expect(topicTexts).toContain("강남 가죽공방");
		});

		it("relevance is in 0~1 range", async () => {
			const result = await provider.analyze(makeInput());
			for (const t of result.topics) {
				expect(t.relevance).toBeGreaterThanOrEqual(0);
				expect(t.relevance).toBeLessThanOrEqual(1);
			}
		});
	});

	// -------------------------------------------------------------------------
	// Readability
	// -------------------------------------------------------------------------
	describe("readability", () => {
		it("calculates avg sentence length", async () => {
			const result = await provider.analyze(makeInput());
			expect(result.readability.avgSentenceLength).toBeGreaterThan(0);
			expect(result.readability.score).toBeGreaterThanOrEqual(0);
			expect(result.readability.score).toBeLessThanOrEqual(100);
		});

		it("penalizes very long sentences", async () => {
			const longSentence = Array.from({ length: 50 }, () => "어절").join(" ");
			const result = await provider.analyze(
				makeInput({ bodyText: `${longSentence}.` }),
			);
			expect(result.readability.avgSentenceLength).toBeGreaterThan(25);
			expect(result.readability.score).toBeLessThan(100);
		});

		it("returns 0 score on empty bodyText", async () => {
			const result = await provider.analyze(makeInput({ bodyText: "" }));
			expect(result.readability.score).toBe(0);
			expect(result.readability.avgSentenceLength).toBe(0);
		});
	});

	// -------------------------------------------------------------------------
	// E-E-A-T
	// -------------------------------------------------------------------------
	describe("E-E-A-T", () => {
		it("detects author signal", async () => {
			const result = await provider.analyze(
				makeInput({ bodyText: "작성자: 홍길동입니다. 더 자세한 내용은..." }),
			);
			expect(result.eeat.hasAuthor).toBe(true);
		});

		it("does not detect author when missing", async () => {
			const result = await provider.analyze(
				makeInput({ bodyText: "오시는 길과 메뉴 안내입니다." }),
			);
			expect(result.eeat.hasAuthor).toBe(false);
		});

		it("counts expertise signals (경력, 자격증, 박사 등)", async () => {
			const result = await provider.analyze(
				makeInput({
					bodyText:
						"경력 10년 이상의 박사 출신 전문가가 운영합니다. 자격증 보유.",
				}),
			);
			expect(result.eeat.hasExpertiseSignals).toBeGreaterThanOrEqual(2);
		});

		it("counts trust signals (후기, 인증, 수상)", async () => {
			const result = await provider.analyze(
				makeInput({
					bodyText: "수상 경력과 인증을 보유, 1000개 이상의 후기와 4.9 평점.",
				}),
			);
			expect(result.eeat.hasTrustSignals).toBeGreaterThanOrEqual(2);
		});

		it("detects freshness (날짜 패턴)", async () => {
			const result = await provider.analyze(
				makeInput({ bodyText: "최종 업데이트: 2025-01-15 입니다." }),
			);
			expect(result.eeat.hasFreshness).toBe(true);
		});

		it("calculates composite score", async () => {
			const result = await provider.analyze(
				makeInput({
					bodyText:
						"작성자: 홍길동. 경력 15년 박사 출신 전문가. 자격증 보유. 후기 1200건, 수상 경력. 2025-01-15 업데이트.",
				}),
			);
			expect(result.eeat.score).toBeGreaterThanOrEqual(60);
			expect(result.eeat.score).toBeLessThanOrEqual(100);
		});

		it("returns low score on bare content", async () => {
			const result = await provider.analyze(
				makeInput({ bodyText: "간단한 안내입니다." }),
			);
			expect(result.eeat.score).toBeLessThan(50);
		});
	});

	// -------------------------------------------------------------------------
	// Semantic relevance
	// -------------------------------------------------------------------------
	describe("semantic relevance", () => {
		it("computes title-body alignment", async () => {
			const result = await provider.analyze(makeInput());
			expect(result.semanticRelevance.titleBodyAlignment).toBeGreaterThan(0);
			expect(result.semanticRelevance.titleBodyAlignment).toBeLessThanOrEqual(
				1,
			);
		});

		it("returns 0 alignment when title tokens not in body", async () => {
			const result = await provider.analyze(
				makeInput({
					title: "완전다른제목용어",
					bodyText: "본문에는 다른 내용만 있습니다.",
				}),
			);
			expect(result.semanticRelevance.titleBodyAlignment).toBe(0);
		});

		it("calculates keyword integration", async () => {
			const result = await provider.analyze(makeInput());
			expect(
				result.semanticRelevance.keywordIntegration,
			).toBeGreaterThanOrEqual(0);
			expect(result.semanticRelevance.keywordIntegration).toBeLessThanOrEqual(
				1,
			);
		});
	});
});
