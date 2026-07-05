/**
 * X-SAG Core Engine — ChatMockNlpProvider tests
 *
 * Phase P-A: ChatMock 기반 NLP 분석기 검증 (fetch mocking).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ChatMockNlpProvider,
	parseNlpResponse,
} from "../providers/chatmock.js";
import type { NlpInput } from "../types.js";

function makeInput(overrides: Partial<NlpInput> = {}): NlpInput {
	return {
		url: "https://example.co.kr/",
		title: "강남 가죽공방",
		description: "강남 가죽공방 클래스",
		bodyText: "강남 가죽공방 본문 내용입니다.",
		h1: "강남 가죽공방",
		h2: ["클래스"],
		targetKeywords: ["가죽공방"],
		industry: "가죽공방",
		region: "강남",
		...overrides,
	};
}

function buildChatMockResponse(content: string): Response {
	return new Response(
		JSON.stringify({
			choices: [{ message: { content } }],
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
}

describe("ChatMockNlpProvider — availability", () => {
	const originalEnabled = process.env["CHATMOCK_ENABLED"];
	const originalBase = process.env["CHATMOCK_BASE_URL"];

	afterEach(() => {
		if (originalEnabled === undefined) delete process.env["CHATMOCK_ENABLED"];
		else process.env["CHATMOCK_ENABLED"] = originalEnabled;
		if (originalBase === undefined) delete process.env["CHATMOCK_BASE_URL"];
		else process.env["CHATMOCK_BASE_URL"] = originalBase;
	});

	it("isAvailable() false when no env vars set", () => {
		delete process.env["CHATMOCK_ENABLED"];
		delete process.env["CHATMOCK_BASE_URL"];
		const p = new ChatMockNlpProvider();
		expect(p.isAvailable()).toBe(false);
	});

	it("isAvailable() true when CHATMOCK_ENABLED=true", () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		delete process.env["CHATMOCK_BASE_URL"];
		const p = new ChatMockNlpProvider();
		expect(p.isAvailable()).toBe(true);
	});

	it("isAvailable() true when CHATMOCK_BASE_URL is set", () => {
		delete process.env["CHATMOCK_ENABLED"];
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:9999/v1";
		const p = new ChatMockNlpProvider();
		expect(p.isAvailable()).toBe(true);
	});
});

describe("ChatMockNlpProvider — analyze with mock fetch", () => {
	const originalEnabled = process.env["CHATMOCK_ENABLED"];
	let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

	beforeEach(() => {
		process.env["CHATMOCK_ENABLED"] = "true";
	});

	afterEach(() => {
		fetchSpy?.mockRestore();
		fetchSpy = null;
		if (originalEnabled === undefined) delete process.env["CHATMOCK_ENABLED"];
		else process.env["CHATMOCK_ENABLED"] = originalEnabled;
	});

	it("parses valid JSON response into NlpResult", async () => {
		const llmJson = JSON.stringify({
			keywordDensity: {
				targetKeywords: [{ keyword: "가죽공방", count: 5, density: 0.025 }],
				topNouns: [{ word: "가죽공방", count: 5 }],
			},
			topics: [{ topic: "가죽공방 클래스", relevance: 0.9 }],
			readability: {
				avgSentenceLength: 18,
				avgParagraphLength: 4,
				score: 80,
			},
			eeat: {
				hasAuthor: true,
				hasExpertiseSignals: 3,
				hasTrustSignals: 4,
				hasFreshness: true,
				score: 85,
			},
			semanticRelevance: {
				titleBodyAlignment: 0.8,
				keywordIntegration: 0.7,
			},
		});

		fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(buildChatMockResponse(llmJson));

		const provider = new ChatMockNlpProvider();
		const result = await provider.analyze(makeInput());

		expect(result.source).toBe("chatmock");
		expect(result.keywordDensity.targetKeywords[0]?.keyword).toBe("가죽공방");
		expect(result.keywordDensity.targetKeywords[0]?.count).toBe(5);
		expect(result.topics[0]?.topic).toBe("가죽공방 클래스");
		expect(result.readability.score).toBe(80);
		expect(result.eeat.hasAuthor).toBe(true);
		expect(result.eeat.score).toBe(85);
		expect(result.semanticRelevance.titleBodyAlignment).toBeCloseTo(0.8);
	});

	it("retries without response_format on 400/422", async () => {
		const llmJson = JSON.stringify({
			keywordDensity: { targetKeywords: [], topNouns: [] },
			topics: [],
			readability: { avgSentenceLength: 10, avgParagraphLength: 2, score: 50 },
			eeat: {
				hasAuthor: false,
				hasExpertiseSignals: 0,
				hasTrustSignals: 0,
				hasFreshness: false,
				score: 0,
			},
			semanticRelevance: { titleBodyAlignment: 0, keywordIntegration: 0 },
		});

		fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response("bad request", { status: 400 }))
			.mockResolvedValueOnce(buildChatMockResponse(llmJson));

		const provider = new ChatMockNlpProvider();
		const result = await provider.analyze(makeInput());

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(result.source).toBe("chatmock");
		expect(result.readability.score).toBe(50);
	});

	it("throws on non-2xx, non-retriable response", async () => {
		fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response("server error", { status: 500 }));

		const provider = new ChatMockNlpProvider();
		await expect(provider.analyze(makeInput())).rejects.toThrow(
			/ChatMock NLP API error/,
		);
	});

	it("fills missing target keywords with 0 count", async () => {
		const llmJson = JSON.stringify({
			keywordDensity: { targetKeywords: [], topNouns: [] },
			topics: [],
			readability: { avgSentenceLength: 0, avgParagraphLength: 0, score: 0 },
			eeat: {
				hasAuthor: false,
				hasExpertiseSignals: 0,
				hasTrustSignals: 0,
				hasFreshness: false,
				score: 0,
			},
			semanticRelevance: { titleBodyAlignment: 0, keywordIntegration: 0 },
		});

		fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(buildChatMockResponse(llmJson));

		const provider = new ChatMockNlpProvider();
		const result = await provider.analyze(
			makeInput({ targetKeywords: ["키워드A", "키워드B"] }),
		);
		expect(result.keywordDensity.targetKeywords).toHaveLength(2);
		expect(
			result.keywordDensity.targetKeywords.every((t) => t.count === 0),
		).toBe(true);
	});

	it("clamps out-of-range values (density > 1, score > 100, etc.)", () => {
		const text = JSON.stringify({
			keywordDensity: {
				targetKeywords: [{ keyword: "k", count: -3, density: 2.5 }],
				topNouns: [],
			},
			topics: [{ topic: "t", relevance: 5 }],
			readability: { avgSentenceLength: 10, avgParagraphLength: 2, score: 250 },
			eeat: {
				hasAuthor: true,
				hasExpertiseSignals: 2,
				hasTrustSignals: 1,
				hasFreshness: true,
				score: -5,
			},
			semanticRelevance: { titleBodyAlignment: 1.5, keywordIntegration: -0.5 },
		});
		const parsed = parseNlpResponse(text, makeInput({ targetKeywords: ["k"] }));
		expect(parsed.keywordDensity.targetKeywords[0]?.density).toBe(1);
		expect(parsed.topics[0]?.relevance).toBe(1);
		expect(parsed.readability.score).toBe(100);
		expect(parsed.eeat.score).toBe(0);
		expect(parsed.semanticRelevance.titleBodyAlignment).toBe(1);
		expect(parsed.semanticRelevance.keywordIntegration).toBe(0);
	});

	it("extracts JSON block from fenced response", () => {
		const text = `응답:\n\`\`\`json\n${JSON.stringify({
			keywordDensity: { targetKeywords: [], topNouns: [] },
			topics: [{ topic: "t", relevance: 0.5 }],
			readability: {
				avgSentenceLength: 10,
				avgParagraphLength: 2,
				score: 70,
			},
			eeat: {
				hasAuthor: false,
				hasExpertiseSignals: 0,
				hasTrustSignals: 0,
				hasFreshness: false,
				score: 10,
			},
			semanticRelevance: { titleBodyAlignment: 0.3, keywordIntegration: 0.2 },
		})}\n\`\`\`\n`;
		const parsed = parseNlpResponse(text, makeInput());
		expect(parsed.readability.score).toBe(70);
		expect(parsed.topics[0]?.topic).toBe("t");
	});

	it("returns empty result on unparseable response", () => {
		const parsed = parseNlpResponse("this is not json at all", makeInput());
		expect(parsed.readability.score).toBe(0);
		expect(parsed.eeat.hasAuthor).toBe(false);
		// input target keywords still preserved with 0 count
		expect(parsed.keywordDensity.targetKeywords).toHaveLength(1);
		expect(parsed.keywordDensity.targetKeywords[0]?.count).toBe(0);
	});

	it("preserves topNouns and topics limits (≤10, ≤5)", () => {
		const longNouns = Array.from({ length: 20 }, (_, i) => ({
			word: `w${i}`,
			count: 20 - i,
		}));
		const longTopics = Array.from({ length: 20 }, (_, i) => ({
			topic: `t${i}`,
			relevance: 0.5,
		}));
		const text = JSON.stringify({
			keywordDensity: { targetKeywords: [], topNouns: longNouns },
			topics: longTopics,
			readability: { avgSentenceLength: 10, avgParagraphLength: 2, score: 50 },
			eeat: {
				hasAuthor: false,
				hasExpertiseSignals: 0,
				hasTrustSignals: 0,
				hasFreshness: false,
				score: 0,
			},
			semanticRelevance: { titleBodyAlignment: 0, keywordIntegration: 0 },
		});
		const parsed = parseNlpResponse(text, makeInput({ targetKeywords: [] }));
		expect(parsed.keywordDensity.topNouns.length).toBe(10);
		expect(parsed.topics.length).toBe(5);
	});
});
