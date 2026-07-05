import type { DiagnosisItem } from "@boina/contracts/diagnosis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultProviderChain } from "../index.js";
import { AnthropicProvider } from "../providers/anthropic.js";
import { GeminiProvider } from "../providers/gemini.js";
import { OpenAIProvider } from "../providers/openai.js";
import type { RecommendationInput } from "../types.js";

const ENV_KEYS = [
	"GEMINI_API_KEY",
	"GOOGLE_AI_API_KEY",
	"CHATMOCK_ENABLED",
	"CHATMOCK_BASE_URL",
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"LLM_PROVIDER",
] as const;

const originalEnv: Partial<
	Record<(typeof ENV_KEYS)[number], string | undefined>
> = {};

beforeEach(() => {
	for (const key of ENV_KEYS) {
		originalEnv[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	vi.restoreAllMocks();
	for (const key of ENV_KEYS) {
		const value = originalEnv[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("Recommendation cloud provider boundaries", () => {
	it("sends readable Korean context in OpenAI recommendation prompts", async () => {
		process.env["OPENAI_API_KEY"] = "openai-phase-b-key";
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify({
									body: "OpenAI recommendation",
									examples: ["example"],
								}),
							},
						},
					],
					usage: {
						prompt_tokens: 100,
						completion_tokens: 50,
					},
				}),
				{ status: 200 },
			),
		);

		const provider = new OpenAIProvider();
		expect(provider.isAvailable()).toBe(true);

		const result = await provider.generate(makeInput());
		const [, init] = fetchMock.mock.calls[0] ?? [];
		const payload = JSON.parse(String(init?.body)) as {
			model: string;
			messages: Array<{ content: string }>;
		};

		expect(payload.model).toBe("gpt-4o-mini");
		expect(payload.messages[1]?.content).toContain("업체 정보");
		expect(payload.messages[1]?.content).toContain("Example Cafe");
		expect(payload.messages[1]?.content).toContain("구체적인 개선 방법");
		expect(result).toMatchObject({
			body: "OpenAI recommendation",
			examples: ["example"],
			aiGenerated: true,
			provider: "openai",
			model: "gpt-4o-mini",
		});
		expect(result.costUsd).toBeGreaterThan(0);
	});

	it("parses fenced JSON from OpenAI recommendation responses", async () => {
		process.env["OPENAI_API_KEY"] = "openai-phase-b-key";
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content:
									'```json\n{"body":"OpenAI fenced recommendation","examples":["fenced"]}\n```',
							},
						},
					],
				}),
				{ status: 200 },
			),
		);

		const result = await new OpenAIProvider().generate(makeInput());

		expect(result.body).toBe("OpenAI fenced recommendation");
		expect(result.examples).toEqual(["fenced"]);
	});

	it("sends readable Korean context in Anthropic recommendation prompts", async () => {
		process.env["ANTHROPIC_API_KEY"] = "anthropic-phase-b-key";
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					content: [
						{
							type: "text",
							text: JSON.stringify({
								body: "Anthropic recommendation",
								examples: ["example"],
							}),
						},
					],
					usage: {
						input_tokens: 100,
						output_tokens: 50,
					},
				}),
				{ status: 200 },
			),
		);

		const provider = new AnthropicProvider();
		expect(provider.isAvailable()).toBe(true);

		const result = await provider.generate(makeInput());
		const [, init] = fetchMock.mock.calls[0] ?? [];
		const payload = JSON.parse(String(init?.body)) as {
			model: string;
			messages: Array<{ content: string }>;
		};

		expect(payload.model).toBe("claude-sonnet-4-6");
		expect(payload.messages[0]?.content).toContain("업체 정보");
		expect(payload.messages[0]?.content).toContain("Example Cafe");
		expect(payload.messages[0]?.content).toContain("구체적인 개선 방법");
		expect(result).toMatchObject({
			body: "Anthropic recommendation",
			examples: ["example"],
			aiGenerated: true,
			provider: "anthropic",
			model: "claude-sonnet-4-6",
		});
		expect(result.costUsd).toBeGreaterThan(0);
	});

	it("uses GEMINI_API_KEY for Gemini recommendation calls", async () => {
		process.env["GEMINI_API_KEY"] = "gemini-phase-b-key";
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					candidates: [
						{
							content: {
								parts: [
									{
										text: JSON.stringify({
											body: "Gemini recommendation",
											examples: ["example"],
										}),
									},
								],
							},
						},
					],
					usageMetadata: {
						promptTokenCount: 100,
						candidatesTokenCount: 50,
					},
				}),
				{ status: 200 },
			),
		);

		const provider = new GeminiProvider();
		expect(provider.isAvailable()).toBe(true);

		const result = await provider.generate(makeInput());
		const [, init] = fetchMock.mock.calls[0] ?? [];
		const payload = JSON.parse(String(init?.body)) as {
			contents: Array<{ parts: Array<{ text: string }> }>;
		};

		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("key=gemini-phase-b-key"),
			expect.objectContaining({ method: "POST" }),
		);
		expect(payload.contents[0]?.parts[0]?.text).toContain("업체 정보");
		expect(payload.contents[0]?.parts[0]?.text).toContain("Example Cafe");
		expect(payload.contents[0]?.parts[0]?.text).toContain("구체적인 개선 방법");
		expect(result).toMatchObject({
			body: "Gemini recommendation",
			examples: ["example"],
			aiGenerated: true,
			provider: "gemini",
			model: "gemini-2.5-flash",
		});
		expect(result.costUsd).toBeGreaterThan(0);
	});

	it("parses fenced JSON from Gemini recommendation responses", async () => {
		process.env["GEMINI_API_KEY"] = "gemini-phase-b-key";
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					candidates: [
						{
							content: {
								parts: [
									{
										text: [
											"응답:",
											"```json",
											'{"body":"Gemini fenced recommendation","examples":["fenced"]}',
											"```",
										].join("\n"),
									},
								],
							},
						},
					],
				}),
				{ status: 200 },
			),
		);

		const result = await new GeminiProvider().generate(makeInput());

		expect(result.body).toBe("Gemini fenced recommendation");
		expect(result.examples).toEqual(["fenced"]);
	});

	it("includes Gemini in the default chain when GEMINI_API_KEY is configured", () => {
		process.env["GEMINI_API_KEY"] = "gemini-phase-b-key";

		const providerNames = buildDefaultProviderChain().map((p) => p.name);

		expect(providerNames).toContain("gemini");
	});

	it("does not let ChatMock shadow an explicit Phase B OpenAI provider", () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		process.env["OPENAI_API_KEY"] = "openai-phase-b-key";
		process.env["GEMINI_API_KEY"] = "gemini-phase-b-key";
		process.env["LLM_PROVIDER"] = "openai";

		const providerNames = buildDefaultProviderChain().map((p) => p.name);

		expect(providerNames[0]).toBe("openai");
		expect(providerNames).not.toContain("chatmock");
		expect(providerNames).toEqual(["openai", "rule-based"]);
	});

	it("uses rule-based only when LLM_PROVIDER=mock", () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		process.env["OPENAI_API_KEY"] = "openai-phase-b-key";
		process.env["LLM_PROVIDER"] = "mock";

		const providerNames = buildDefaultProviderChain().map((p) => p.name);

		expect(providerNames).toEqual(["rule-based"]);
	});
});

function makeInput(): RecommendationInput {
	return {
		item: {
			id: "00000000-0000-0000-0000-000000000001",
			code: "SEO_TITLE_MISSING",
			category: "seo",
			actionType: "quick-win",
			priority: "high",
			title: "Missing title",
			description: "No title tag was found.",
			evidence: {
				url: "https://example.kr/",
				foundValue: "",
				expectedValue: "<title>",
			},
			impactScore: 80,
			difficulty: "easy",
			expectedEffect: "Improve search visibility",
			isAiGenerated: false,
			recommendationText: "Add a title tag.",
			relatedSnippetType: null,
			pageUrl: "https://example.kr/",
			ruleVersion: "1.0.0",
		} as DiagnosisItem,
		context: {
			businessName: "Example Cafe",
			industry: "cafe",
			region: "Seoul",
			mainServices: ["hand drip"],
		},
	};
}
