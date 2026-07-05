/**
 * v2/aeo-validator — MockAeoValidator + 분석 로직 단위 테스트
 *
 * 결정론적 응답, 프로미넌스 계산, URL 인용 탐지, 메트릭 집계 검증.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { generateDefaultAeoQueries } from "../prompt-templates.js";
import { ChatMockAeoValidator } from "../providers/chatmock.js";
import { MockAeoValidator } from "../providers/mock.js";
import type { AeoCitation, AeoQuery, AeoValidationInput } from "../types.js";
import { analyzeAeoCitation, computeAeoMetrics } from "../validator.js";

const input: AeoValidationInput = {
	url: "https://test-clinic.kr",
	businessName: "테스트치과",
	industry: "치과",
	mainServices: ["임플란트", "교정"],
	targetKeywords: ["충치치료", "신경치료"],
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. generateDefaultAeoQueries
// ---------------------------------------------------------------------------

describe("generateDefaultAeoQueries", () => {
	it("5~10개 사이의 질의를 생성하고 mainServices 가 포함된다", () => {
		const queries = generateDefaultAeoQueries(input);

		expect(queries.length).toBeGreaterThanOrEqual(5);
		expect(queries.length).toBeLessThanOrEqual(10);

		// mainServices 각각이 어딘가의 질의에 포함되어야 한다
		for (const svc of input.mainServices) {
			const hasSvc = queries.some((q) => q.query.includes(svc));
			expect(hasSvc).toBe(true);
		}

		// facet 다양성 — 최소 best-of, how-to, service-howto 포함
		const facets = new Set(queries.map((q) => q.facet));
		expect(facets.has("best-of")).toBe(true);
		expect(facets.has("how-to")).toBe(true);
		expect(facets.has("service-howto")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 2. analyzeAeoCitation — 위치별 비즈니스명 탐지
// ---------------------------------------------------------------------------

describe("analyzeAeoCitation — 비즈니스명 위치", () => {
	const q: AeoQuery = { query: "치과 추천", facet: "best-of" };

	it("응답 시작부 언급은 prominence 가 1.0 에 가깝다", () => {
		const response = "테스트치과는 신뢰성 있는 치과입니다.";
		const c = analyzeAeoCitation(q, response, input);

		expect(c.mentioned).toBe(true);
		expect(c.firstMentionIndex).toBe(0);
		expect(c.prominence).toBe(1);
		expect(c.context).toBe("primary");
	});

	it("응답 말미 언급은 prominence 가 0 에 가깝다", () => {
		// 비즈니스명을 응답 거의 끝에 배치
		const filler = "이 분야는 다양한 후보가 있습니다. ".repeat(10);
		const response = `${filler}테스트치과`;
		const c = analyzeAeoCitation(q, response, input);

		expect(c.mentioned).toBe(true);
		expect(c.firstMentionIndex).toBeGreaterThan(0);
		expect(c.prominence).toBeLessThan(0.1);
	});

	it("미언급 응답은 mentioned=false, prominence=0", () => {
		const response = "치과는 다양한 치료를 제공합니다.";
		const c = analyzeAeoCitation(q, response, input);

		expect(c.mentioned).toBe(false);
		expect(c.firstMentionIndex).toBe(-1);
		expect(c.prominence).toBe(0);
		expect(c.context).toBe("none");
	});
});

// ---------------------------------------------------------------------------
// 3. analyzeAeoCitation — URL 인용 탐지
// ---------------------------------------------------------------------------

describe("analyzeAeoCitation — URL 인용", () => {
	const q: AeoQuery = { query: "치과 추천", facet: "best-of" };

	it("응답에 도메인이 포함되면 urlCited=true", () => {
		const response = "테스트치과 (https://test-clinic.kr) 를 추천합니다.";
		const c = analyzeAeoCitation(q, response, input);

		expect(c.urlCited).toBe(true);
	});

	it("응답에 도메인이 없으면 urlCited=false", () => {
		const response = "테스트치과를 추천합니다.";
		const c = analyzeAeoCitation(q, response, input);

		expect(c.urlCited).toBe(false);
	});

	it("도메인이 www. prefix 로 등장해도 매칭된다", () => {
		const response = "공식 사이트는 www.test-clinic.kr 입니다.";
		const c = analyzeAeoCitation(q, response, input);

		expect(c.urlCited).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 4. computeAeoMetrics — 위치 감쇠 평균
// ---------------------------------------------------------------------------

describe("computeAeoMetrics", () => {
	it("빈 배열은 모든 지표 0", () => {
		const m = computeAeoMetrics([]);
		expect(m.appearanceRate).toBe(0);
		expect(m.prominenceScore).toBe(0);
		expect(m.citationRate).toBe(0);
	});

	it("위치 감쇠된 프로미넌스의 평균을 계산한다", () => {
		// 인위적 citation 3건: prominence 1.0 / 0.5 / 0.0 → 평균 0.5
		const fakeCitations: AeoCitation[] = [
			{
				query: "q1",
				facet: "best-of",
				llmResponse: "x",
				mentioned: true,
				firstMentionIndex: 0,
				prominence: 1,
				urlCited: true,
				context: "primary",
				measuredAt: "2025-01-01T00:00:00.000Z",
			},
			{
				query: "q2",
				facet: "how-to",
				llmResponse: "x",
				mentioned: true,
				firstMentionIndex: 50,
				prominence: 0.5,
				urlCited: false,
				context: "in-list",
				measuredAt: "2025-01-01T00:00:00.000Z",
			},
			{
				query: "q3",
				facet: "price",
				llmResponse: "x",
				mentioned: false,
				firstMentionIndex: -1,
				prominence: 0,
				urlCited: false,
				context: "none",
				measuredAt: "2025-01-01T00:00:00.000Z",
			},
		];

		const m = computeAeoMetrics(fakeCitations);

		expect(m.appearanceRate).toBeCloseTo(2 / 3, 3);
		expect(m.prominenceScore).toBeCloseTo(0.5, 3);
		expect(m.citationRate).toBeCloseTo(1 / 3, 3);
	});
});

// ---------------------------------------------------------------------------
// 5. MockAeoValidator — 엔드투엔드
// ---------------------------------------------------------------------------

describe("MockAeoValidator", () => {
	it("isAvailable() 은 항상 true 이고 name 은 'mock'", () => {
		const v = new MockAeoValidator();
		expect(v.isAvailable()).toBe(true);
		expect(v.name).toBe("mock");
	});

	it("결정론적 — 동일 입력은 동일 결과를 반환한다", async () => {
		const v = new MockAeoValidator();
		const r1 = await v.validate(input);
		const r2 = await v.validate(input);
		expect(r1).toEqual(r2);
	});

	it("결과 구조가 AeoValidationResult 계약을 만족한다", async () => {
		const v = new MockAeoValidator();
		const result = await v.validate(input);

		expect(result.url).toBe(input.url);
		expect(result.businessName).toBe(input.businessName);
		expect(result.source).toBe("mock");
		expect(Array.isArray(result.citations)).toBe(true);
		expect(result.citations.length).toBeGreaterThan(0);
		expect(typeof result.metrics.appearanceRate).toBe("number");
		expect(typeof result.metrics.prominenceScore).toBe("number");
		expect(typeof result.metrics.citationRate).toBe("number");
		expect(typeof result.validatedAt).toBe("string");
	});

	it("best-of 질의는 mock 응답에서 항상 비즈니스명을 포함 (appearanceRate=1)", async () => {
		const v = new MockAeoValidator();
		const result = await v.validate(input, [
			{ query: "치과 추천 좀 해주세요", facet: "best-of" },
		]);
		expect(result.metrics.appearanceRate).toBe(1);
		// best-of 응답은 응답 시작부에 비즈니스명을 배치 → primary 맥락
		expect(result.citations[0]?.context).toBe("primary");
	});

	it("price 질의는 mock 응답에서 비즈니스명을 포함하지 않는다 (appearanceRate=0)", async () => {
		const v = new MockAeoValidator();
		const result = await v.validate(input, [
			{ query: "치과 가격 알려주세요", facet: "price" },
		]);
		expect(result.metrics.appearanceRate).toBe(0);
		expect(result.metrics.prominenceScore).toBe(0);
	});
});

describe("ChatMockAeoValidator providerConfig routing", () => {
	it("requires API keys for explicit real provider configs", () => {
		const validator = new ChatMockAeoValidator({
			providerConfig: {
				id: "openai",
				baseUrl: "https://api.openai.com/v1",
				apiKey: "",
				model: "gpt-4o",
			},
		});

		expect(validator.isAvailable()).toBe(false);
	});

	it("applies Anthropic endpoint, headers, request transform, and response transform", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: RequestInit) => {
				calls.push({ url, init });
				return new Response(
					JSON.stringify({
						content: [{ type: "text", text: "provider transformed response" }],
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}),
		);

		const validator = new ChatMockAeoValidator({
			rateLimitMs: 0,
			providerConfig: {
				id: "anthropic",
				baseUrl: "https://anthropic.example/v1",
				apiKey: "anthropic-key",
				model: "claude-test",
				requestTransform: (body) => ({ transformed: "anthropic", body }),
				responseTransform: (body) => {
					const content = (body as { content?: Array<{ text?: string }> })
						.content;
					return {
						choices: [{ message: { content: content?.[0]?.text ?? "" } }],
					};
				},
			},
		});

		const result = await validator.validate(input, [
			{ query: "Q", facet: "best-of" },
		]);

		expect(result.citations[0]?.llmResponse).toBe(
			"provider transformed response",
		);
		expect(calls[0]?.url).toBe("https://anthropic.example/v1/messages");
		expect(calls[0]?.init.headers).toMatchObject({
			"Content-Type": "application/json",
			"x-api-key": "anthropic-key",
			"anthropic-version": "2023-06-01",
		});
		expect(calls[0]?.init.headers).not.toHaveProperty("Authorization");
		expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
			transformed: "anthropic",
		});
	});

	it("applies Gemini endpoint, request transform, and response transform", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: RequestInit) => {
				calls.push({ url, init });
				return new Response(
					JSON.stringify({
						candidates: [
							{
								content: { parts: [{ text: "provider transformed response" }] },
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}),
		);

		const validator = new ChatMockAeoValidator({
			rateLimitMs: 0,
			providerConfig: {
				id: "gemini",
				baseUrl: "https://generativelanguage.example/v1beta",
				apiKey: "gemini-key",
				model: "gemini-test",
				requestTransform: (body) => ({ transformed: "gemini", body }),
				responseTransform: (body) => {
					const candidates = (
						body as {
							candidates?: Array<{
								content?: { parts?: Array<{ text?: string }> };
							}>;
						}
					).candidates;
					return {
						choices: [
							{
								message: {
									content: candidates?.[0]?.content?.parts?.[0]?.text ?? "",
								},
							},
						],
					};
				},
			},
		});

		const result = await validator.validate(input, [
			{ query: "Q", facet: "best-of" },
		]);

		expect(result.citations[0]?.llmResponse).toBe(
			"provider transformed response",
		);
		expect(calls[0]?.url).toBe(
			"https://generativelanguage.example/v1beta/models/gemini-test:generateContent?key=gemini-key",
		);
		expect(calls[0]?.init.headers).toEqual({
			"Content-Type": "application/json",
		});
		expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
			transformed: "gemini",
		});
	});
});
