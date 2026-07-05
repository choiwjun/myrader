import { afterEach, describe, expect, it, vi } from "vitest";

import { RuleSemanticChatMockValidator } from "../providers/chatmock.js";
import type { RuleDescriptor } from "../types.js";

const descriptor: RuleDescriptor = {
	ruleId: "RULE-1",
	category: "seo",
	title: "Title",
	description: "Description",
	intent: "Check the title.",
	implementationHint: "title.length > 0",
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("rule-validator provider path compatibility", () => {
	it("exports the ChatMock rule semantic validator from providers/chatmock", () => {
		const validator = new RuleSemanticChatMockValidator({
			batchSize: 1,
			rateLimitMs: 0,
		});

		expect(validator.name).toBe("chatmock");
	});

	it("requires API keys for explicit real provider configs", () => {
		const validator = new RuleSemanticChatMockValidator({
			providerConfig: {
				id: "openai",
				baseUrl: "https://api.openai.com/v1",
				apiKey: "",
				model: "gpt-4o",
			},
		});

		expect(validator.isAvailable()).toBe(false);
	});

	it("applies Anthropic provider request and response transforms", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: RequestInit) => {
				calls.push({ url, init });
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "[]" }] }),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}),
		);

		const validator = new RuleSemanticChatMockValidator({
			batchSize: 1,
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

		const report = await validator.validate([descriptor]);

		expect(report.reviewed).toBe(1);
		expect(calls).toHaveLength(1);
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

	it("applies Gemini provider request and response transforms", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: RequestInit) => {
				calls.push({ url, init });
				return new Response(
					JSON.stringify({
						candidates: [{ content: { parts: [{ text: "[]" }] } }],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}),
		);

		const validator = new RuleSemanticChatMockValidator({
			batchSize: 1,
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

		const report = await validator.validate([descriptor]);

		expect(report.reviewed).toBe(1);
		expect(calls).toHaveLength(1);
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

	it("requests JSON-only Gemini responses for semantic rule review", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: RequestInit) => {
				calls.push({ url, init });
				return new Response(
					JSON.stringify({
						candidates: [{ content: { parts: [{ text: "[]" }] } }],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}),
		);

		const validator = new RuleSemanticChatMockValidator({
			batchSize: 1,
			rateLimitMs: 0,
			providerConfig: {
				id: "gemini",
				baseUrl: "https://generativelanguage.example/v1beta",
				apiKey: "gemini-key",
				model: "gemini-test",
				requestTransform: (body) => {
					const req = body as {
						messages?: Array<{ role: string; content: string }>;
						max_tokens?: number;
						temperature?: number;
						response_format?: { type?: string };
					};
					return {
						contents: (req.messages ?? [])
							.filter((m) => m.role !== "system")
							.map((m) => ({
								role: "user",
								parts: [{ text: m.content }],
							})),
						generationConfig: {
							maxOutputTokens: req.max_tokens,
							temperature: req.temperature,
							responseMimeType:
								req.response_format?.type === "json_object"
									? "application/json"
									: undefined,
						},
					};
				},
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

		const report = await validator.validate([descriptor]);

		expect(report.reviewed).toBe(1);
		const body = JSON.parse(String(calls[0]?.init.body)) as {
			generationConfig?: { responseMimeType?: string };
		};
		expect(body.generationConfig?.responseMimeType).toBe("application/json");
	});

	it("logs provider HTTP failures instead of hiding them as plain parse failures", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return new Response(
					JSON.stringify({
						error: { status: "RESOURCE_EXHAUSTED", message: "quota exceeded" },
					}),
					{ status: 429, statusText: "Too Many Requests" },
				);
			}),
		);

		const validator = new RuleSemanticChatMockValidator({
			batchSize: 1,
			rateLimitMs: 0,
			providerConfig: {
				id: "gemini",
				baseUrl: "https://generativelanguage.example/v1beta",
				apiKey: "gemini-key",
				model: "gemini-test",
			},
		});

		const report = await validator.validate([descriptor]);

		expect(report.reviewed).toBe(0);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("provider HTTP 429"),
		);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("quota exceeded"));
	});
});
