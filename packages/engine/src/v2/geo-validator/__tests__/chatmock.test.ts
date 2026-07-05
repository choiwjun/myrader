/**
 * v2/geo-validator — ChatMockGeoValidator 단위 테스트
 *
 * 검증 시나리오:
 * 1. isAvailable() — 환경변수 분기 (CHATMOCK_ENABLED, CHATMOCK_BASE_URL)
 * 2. validate() — OpenAI 호환 JSON 응답 → citations 변환
 * 3. fetch 실패 시 빈 응답 처리 (배치 계속)
 * 4. 질의 간 rate limit
 * 5. 모델/base URL 환경변수 반영
 * 6. 사용자 정의 queries 우선
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMockGeoValidator } from "../providers/chatmock.js";
import type { GeoQuery, GeoValidationInput } from "../types.js";

// ---------------------------------------------------------------------------
// Fixtures / env helpers
// ---------------------------------------------------------------------------

const baseInput: GeoValidationInput = {
	url: "https://test-cafe.kr",
	businessName: "테스트카페",
	industry: "카페",
	region: "서울 강남",
	targetKeywords: ["핸드드립"],
};

const ENV_KEYS = [
	"CHATMOCK_ENABLED",
	"CHATMOCK_BASE_URL",
	"CHATMOCK_API_KEY",
	"CHATMOCK_MODEL",
] as const;

const originalEnv: Partial<
	Record<(typeof ENV_KEYS)[number], string | undefined>
> = {};

function snapshotEnv(): void {
	for (const k of ENV_KEYS) {
		originalEnv[k] = process.env[k];
	}
}

function restoreEnv(): void {
	for (const k of ENV_KEYS) {
		const v = originalEnv[k];
		if (v === undefined) {
			delete process.env[k];
		} else {
			process.env[k] = v;
		}
	}
}

function clearEnv(): void {
	for (const k of ENV_KEYS) {
		delete process.env[k];
	}
}

function mockFetchSequence(
	sequence: Array<{
		ok: boolean;
		status?: number;
		statusText?: string;
		json?: () => Promise<unknown>;
		text?: () => Promise<string>;
	}>,
): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn();
	for (const r of sequence) {
		fetchMock.mockResolvedValueOnce({
			ok: r.ok,
			status: r.status ?? (r.ok ? 200 : 500),
			statusText: r.statusText ?? "",
			json: r.json ?? (async () => ({})),
			text: r.text ?? (async () => ""),
		});
	}
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function chatMockResponse(content: string): {
	ok: true;
	json: () => Promise<unknown>;
} {
	return {
		ok: true,
		json: async () => ({
			choices: [{ message: { content } }],
		}),
	};
}

beforeEach(() => {
	snapshotEnv();
	clearEnv();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	restoreEnv();
});

// ---------------------------------------------------------------------------
// Scenario 1: isAvailable()
// ---------------------------------------------------------------------------

describe("ChatMockGeoValidator.isAvailable()", () => {
	it("환경변수 미설정이면 false", () => {
		expect(new ChatMockGeoValidator().isAvailable()).toBe(false);
	});

	it("CHATMOCK_ENABLED=true 면 true", () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		expect(new ChatMockGeoValidator().isAvailable()).toBe(true);
	});

	it("CHATMOCK_ENABLED=TRUE 대소문자 무관", () => {
		process.env["CHATMOCK_ENABLED"] = "TRUE";
		expect(new ChatMockGeoValidator().isAvailable()).toBe(true);
	});

	it("CHATMOCK_BASE_URL 만 설정해도 true", () => {
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		expect(new ChatMockGeoValidator().isAvailable()).toBe(true);
	});

	it("name 은 'chatmock'", () => {
		expect(new ChatMockGeoValidator().name).toBe("chatmock");
	});
});

describe("ChatMockGeoValidator providerConfig routing", () => {
	it("requires API keys for explicit real provider configs", () => {
		const validator = new ChatMockGeoValidator({
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
						content: [
							{ type: "text", text: "?뚯뒪?몄뭅?섎뒗 媛뺣궓 移댄럹?낅땲??" },
						],
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}),
		);

		const validator = new ChatMockGeoValidator({
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

		const result = await validator.validate(baseInput, [
			{ query: "Q", facet: "brand-mention" },
		]);

		expect(result.citations[0]?.llmResponse).not.toBe("");
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
								content: {
									parts: [{ text: "?뚯뒪?몄뭅?섎뒗 媛뺣궓 移댄럹?낅땲??" }],
								},
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}),
		);

		const validator = new ChatMockGeoValidator({
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

		const result = await validator.validate(baseInput, [
			{ query: "Q", facet: "brand-mention" },
		]);

		expect(result.citations[0]?.llmResponse).not.toBe("");
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

// ---------------------------------------------------------------------------
// Scenario 2: validate() — 정상 응답
// ---------------------------------------------------------------------------

describe("ChatMockGeoValidator.validate() — 정상 응답", () => {
	it("질의 1개 → citation 1개를 반환한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		mockFetchSequence([
			chatMockResponse("테스트카페는 강남에 위치한 카페입니다."),
		]);

		const validator = new ChatMockGeoValidator({ rateLimitMs: 0 });
		const queries: GeoQuery[] = [
			{ query: "테스트카페에 대해 알려줘", facet: "brand-mention" },
		];

		const result = await validator.validate(baseInput, queries);
		expect(result.source).toBe("chatmock");
		expect(result.citations).toHaveLength(1);
		expect(result.citations[0]?.hasMention).toBe(true);
		expect(result.citations[0]?.isDirectMention).toBe(true);
		expect(result.metrics.mentionRate).toBe(1);
	});

	it("여러 질의를 순차 처리해 citations 배열을 채운다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		mockFetchSequence([
			chatMockResponse("테스트카페는 좋은 곳입니다."),
			chatMockResponse("강남에는 스타벅스 카페, 투썸 카페가 인기입니다."),
		]);

		const validator = new ChatMockGeoValidator({ rateLimitMs: 0 });
		const queries: GeoQuery[] = [
			{ query: "테스트카페에 대해 알려줘", facet: "brand-mention" },
			{ query: "강남 카페 추천", facet: "industry-region" },
		];

		const result = await validator.validate(baseInput, queries);
		expect(result.citations).toHaveLength(2);
		expect(result.metrics.mentionRate).toBe(0.5);
	});

	it("queries 미지정 시 generateDefaultQueries() 결과로 호출한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		// 기본 질의는 최소 5건 — 5건 응답 준비
		const responses = Array.from({ length: 12 }, () =>
			chatMockResponse("일반 응답"),
		);
		const fetchMock = mockFetchSequence(responses);

		const validator = new ChatMockGeoValidator({ rateLimitMs: 0 });
		const result = await validator.validate(baseInput);

		expect(result.citations.length).toBeGreaterThanOrEqual(5);
		expect(fetchMock).toHaveBeenCalledTimes(result.citations.length);
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: fetch 실패 처리
// ---------------------------------------------------------------------------

describe("ChatMockGeoValidator.validate() — 실패 케이스", () => {
	it("HTTP 5xx 응답이면 해당 citation 은 빈 응답으로 기록한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		// GAP 3: 일시적 5xx 는 maxAttempts(3) 까지 재시도된다. 3회 모두 500(이후 fetch 는
		// undefined → throw 도 일시적 취급)으로 소진되면 빈 응답("")으로 기록된다.
		vi.useFakeTimers();
		try {
			mockFetchSequence([
				{ ok: false, status: 500, statusText: "Internal Server Error" },
				{ ok: false, status: 500, statusText: "Internal Server Error" },
				{ ok: false, status: 500, statusText: "Internal Server Error" },
			]);

			const validator = new ChatMockGeoValidator({ rateLimitMs: 0 });
			const queries: GeoQuery[] = [
				{ query: "테스트카페?", facet: "brand-mention" },
			];

			const p = validator.validate(baseInput, queries);
			await vi.runAllTimersAsync();
			const result = await p;
			expect(result.citations).toHaveLength(1);
			expect(result.citations[0]?.llmResponse).toBe("");
			expect(result.citations[0]?.hasMention).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("일부 질의가 실패해도 다음 질의는 계속 진행한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		// GAP 3: 일시적 5xx 는 maxAttempts(3) 까지 재시도된다. Q1 은 3회 모두 500 으로
		// 소진되어 빈 응답("") 으로 기록되고, Q2 는 정상 성공한다. 재시도 백오프 sleep 은
		// fake timer 로 즉시 처리해 결정론·고속을 유지한다.
		vi.useFakeTimers();
		try {
			mockFetchSequence([
				{ ok: false, status: 500 },
				{ ok: false, status: 500 },
				{ ok: false, status: 500 },
				chatMockResponse("테스트카페는 카페입니다."),
			]);

			const validator = new ChatMockGeoValidator({ rateLimitMs: 0 });
			const queries: GeoQuery[] = [
				{ query: "Q1", facet: "brand-mention" },
				{ query: "Q2", facet: "brand-mention" },
			];

			const p = validator.validate(baseInput, queries);
			await vi.runAllTimersAsync();
			const result = await p;
			expect(result.citations).toHaveLength(2);
			expect(result.citations[0]?.hasMention).toBe(false);
			expect(result.citations[1]?.hasMention).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("HTTP 429(quota)는 throw — 배치가 실패로 기록(가짜 0-mention 오염 방지)", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		mockFetchSequence([
			{ ok: false, status: 429, statusText: "Too Many Requests" },
		]);
		const validator = new ChatMockGeoValidator({ rateLimitMs: 0 });
		const queries: GeoQuery[] = [{ query: "Q1", facet: "brand-mention" }];
		await expect(validator.validate(baseInput, queries)).rejects.toThrow(
			/HTTP 429/,
		);
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: 환경변수 반영
// ---------------------------------------------------------------------------

describe("ChatMockGeoValidator.validate() — 환경변수", () => {
	it("CHATMOCK_BASE_URL/CHATMOCK_MODEL 값이 fetch 요청에 반영된다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		process.env["CHATMOCK_BASE_URL"] = "http://custom-host:9000/v1";
		process.env["CHATMOCK_MODEL"] = "gpt-4o-mini";

		const fetchMock = mockFetchSequence([chatMockResponse("응답")]);

		const validator = new ChatMockGeoValidator({ rateLimitMs: 0 });
		await validator.validate(baseInput, [
			{ query: "Q", facet: "brand-mention" },
		]);

		const call = fetchMock.mock.calls[0];
		expect(call?.[0]).toBe("http://custom-host:9000/v1/chat/completions");
		const body = JSON.parse((call?.[1] as { body: string }).body) as {
			model: string;
		};
		expect(body.model).toBe("gpt-4o-mini");
	});

	it("CHATMOCK_BASE_URL 끝의 슬래시는 정규화된다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		process.env["CHATMOCK_BASE_URL"] = "http://custom-host:9000/v1/";

		const fetchMock = mockFetchSequence([chatMockResponse("응답")]);

		const validator = new ChatMockGeoValidator({ rateLimitMs: 0 });
		await validator.validate(baseInput, [
			{ query: "Q", facet: "brand-mention" },
		]);

		const call = fetchMock.mock.calls[0];
		expect(call?.[0]).toBe("http://custom-host:9000/v1/chat/completions");
	});
});
