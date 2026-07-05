/**
 * X-SAG Core Engine — ChatMockProvider 단위 테스트 (Phase O-A)
 *
 * @IMPL packages/core-engine/src/recommendation/providers/chatmock.ts
 *
 * 검증 시나리오:
 * 1. isAvailable() — 환경변수 분기
 * 2. JSON 응답 파싱 (정상 OpenAI 호환 응답)
 * 3. 텍스트 폴백 — JSON 아닌 응답에서 ```json 블록 추출
 * 4. response_format 미지원 시 재시도 (400/422 → JSON mode 제거)
 * 5. 비용 0 검증 (구독 기반)
 * 6. usage 필드 누락 시 안전 동작
 * 7. fetch 실패 (5xx) → throw
 * 8. 모델명 매핑 (CHATMOCK_MODEL 환경변수)
 */

import type { DiagnosisItem } from "@boina/contracts/diagnosis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMockProvider } from "../../recommendation/providers/chatmock.js";
import type { RecommendationInput } from "../../recommendation/types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeMockItem(overrides: Partial<DiagnosisItem> = {}): DiagnosisItem {
	return {
		id: "00000000-0000-0000-0000-000000000001",
		code: "SEO_TITLE_MISSING",
		category: "seo",
		actionType: "quick-win",
		priority: "high",
		title: "타이틀 태그 누락",
		description: "<title> 태그가 비어있습니다.",
		evidence: { url: "https://test.kr/", foundValue: "", expectedValue: "..." },
		impactScore: 80,
		difficulty: "easy",
		expectedEffect: "검색 노출 향상",
		isAiGenerated: false,
		recommendationText: "타이틀을 추가하세요.",
		relatedSnippetType: null,
		pageUrl: "https://test.kr/",
		ruleVersion: "1.0.0",
		...overrides,
	} as DiagnosisItem;
}

function makeInput(
	itemOverrides: Partial<DiagnosisItem> = {},
): RecommendationInput {
	return {
		item: makeMockItem(itemOverrides),
		context: {
			businessName: "테스트카페",
			industry: "카페",
			region: "서울 강남",
			mainServices: ["핸드드립", "원두판매"],
		},
	};
}

// ---------------------------------------------------------------------------
// Test setup: env / fetch mocking
// ---------------------------------------------------------------------------

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

function clearChatMockEnv(): void {
	for (const k of ENV_KEYS) {
		delete process.env[k];
	}
}

/**
 * fetch 응답을 모킹하는 헬퍼.
 * sequence 의 각 항목은 한 번씩 순서대로 반환된다.
 */
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

beforeEach(() => {
	snapshotEnv();
	clearChatMockEnv();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	restoreEnv();
});

// ---------------------------------------------------------------------------
// Scenario 1: isAvailable() 환경변수 분기
// ---------------------------------------------------------------------------

describe("ChatMockProvider.isAvailable()", () => {
	it("환경변수 미설정 시 false 를 반환한다", () => {
		const provider = new ChatMockProvider();
		expect(provider.isAvailable()).toBe(false);
	});

	it("CHATMOCK_ENABLED=true 이면 true 를 반환한다", () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		const provider = new ChatMockProvider();
		expect(provider.isAvailable()).toBe(true);
	});

	it("CHATMOCK_ENABLED=true 는 대소문자 무관", () => {
		process.env["CHATMOCK_ENABLED"] = "TRUE";
		const provider = new ChatMockProvider();
		expect(provider.isAvailable()).toBe(true);
	});

	it("CHATMOCK_ENABLED=false 면 false (CHATMOCK_BASE_URL 없을 때)", () => {
		process.env["CHATMOCK_ENABLED"] = "false";
		const provider = new ChatMockProvider();
		expect(provider.isAvailable()).toBe(false);
	});

	it("CHATMOCK_BASE_URL 만 설정해도 true (명시적 base URL)", () => {
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		const provider = new ChatMockProvider();
		expect(provider.isAvailable()).toBe(true);
	});

	it("provider name 은 'chatmock'", () => {
		expect(new ChatMockProvider().name).toBe("chatmock");
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: 정상 JSON 응답 파싱
// ---------------------------------------------------------------------------

describe("ChatMockProvider.generate() — JSON 응답", () => {
	it("OpenAI 호환 JSON 응답을 정상 파싱한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [
						{
							message: {
								content: JSON.stringify({
									body: "테스트카페에 맞는 타이틀을 추가하세요.",
									examples: ["강남 핸드드립 카페 | 테스트카페", "예시2"],
								}),
							},
						},
					],
					usage: { prompt_tokens: 100, completion_tokens: 50 },
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.provider).toBe("chatmock");
		expect(result.aiGenerated).toBe(true);
		expect(result.body).toBe("테스트카페에 맞는 타이틀을 추가하세요.");
		expect(result.examples).toHaveLength(2);
		expect(result.examples[0]).toBe("강남 핸드드립 카페 | 테스트카페");
		expect(result.costUsd).toBe(0); // 비용 0 검증
	});

	it("usage 필드가 누락되어도 안전하게 동작한다 (비용 0)", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [
						{
							message: {
								content: JSON.stringify({ body: "OK", examples: [] }),
							},
						},
					],
					// usage 누락
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.body).toBe("OK");
		expect(result.costUsd).toBe(0);
	});

	it("CHATMOCK_MODEL 환경변수가 응답 model 필드에 반영된다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		process.env["CHATMOCK_MODEL"] = "gpt-4o-mini";

		const fetchMock = mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"body":"x","examples":[]}' } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.model).toBe("gpt-4o-mini");

		// 요청 body 에도 모델명이 포함되어야 함
		const call = fetchMock.mock.calls[0];
		const body = JSON.parse((call?.[1] as { body: string }).body) as {
			model: string;
		};
		expect(body.model).toBe("gpt-4o-mini");
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: 텍스트 폴백 — JSON 블록 추출
// ---------------------------------------------------------------------------

describe("ChatMockProvider.generate() — 텍스트 폴백", () => {
	it("```json 코드 블록 안의 JSON 을 추출해 파싱한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		const textWithFence =
			'다음과 같이 추천합니다:\n```json\n{"body":"펜스 안 추천","examples":["a","b"]}\n```\n끝.';

		mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: textWithFence } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.body).toBe("펜스 안 추천");
		expect(result.examples).toEqual(["a", "b"]);
	});

	it("일반 텍스트 중 { ... } 블록을 발견해 파싱한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		const bareJsonInText =
			'추천 결과는 {"body":"중간 추출","examples":["x"]} 입니다.';

		mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: bareJsonInText } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.body).toBe("중간 추출");
		expect(result.examples).toEqual(["x"]);
	});

	it("JSON 추출 실패 시 응답 텍스트 자체를 body 로 사용한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: "그냥 평문 추천 텍스트입니다." } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.body).toBe("그냥 평문 추천 텍스트입니다.");
		expect(result.examples).toEqual([]);
		expect(result.costUsd).toBe(0);
	});

	it("응답이 완전히 비어있으면 item.recommendationText 로 폴백한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: "" } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(
			makeInput({ recommendationText: "원본 추천 문구" }),
		);

		expect(result.body).toBe("원본 추천 문구");
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: response_format 미지원 → JSON mode 제거 재시도
// ---------------------------------------------------------------------------

describe("ChatMockProvider.generate() — JSON mode 폴백 재시도", () => {
	it("첫 요청이 400 이면 response_format 없이 재시도한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		const fetchMock = mockFetchSequence([
			// 1차: 400 (response_format 미지원)
			{
				ok: false,
				status: 400,
				text: async () => "unsupported response_format",
			},
			// 2차: 성공 (response_format 제거)
			{
				ok: true,
				json: async () => ({
					choices: [
						{ message: { content: '{"body":"재시도 성공","examples":[]}' } },
					],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.body).toBe("재시도 성공");
		expect(fetchMock).toHaveBeenCalledTimes(2);

		// 1차 요청에는 response_format 포함
		const firstBody = JSON.parse(
			(fetchMock.mock.calls[0]?.[1] as { body: string }).body,
		) as { response_format?: unknown };
		expect(firstBody.response_format).toEqual({ type: "json_object" });

		// 2차 요청에는 response_format 없음
		const secondBody = JSON.parse(
			(fetchMock.mock.calls[1]?.[1] as { body: string }).body,
		) as { response_format?: unknown };
		expect(secondBody.response_format).toBeUndefined();
	});

	it("422 (Unprocessable Entity) 도 동일하게 재시도한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		const fetchMock = mockFetchSequence([
			{ ok: false, status: 422, text: async () => "schema mismatch" },
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"body":"OK","examples":[]}' } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.body).toBe("OK");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: 에러 처리 (5xx)
// ---------------------------------------------------------------------------

describe("ChatMockProvider.generate() — 에러 처리", () => {
	it("5xx 응답 시 throw (재시도 안 함)", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		const fetchMock = mockFetchSequence([
			{ ok: false, status: 503, text: async () => "service unavailable" },
		]);

		const provider = new ChatMockProvider();
		await expect(provider.generate(makeInput())).rejects.toThrow(
			/ChatMock API error 503/,
		);
		expect(fetchMock).toHaveBeenCalledTimes(1); // 5xx 는 재시도 안 함
	});

	it("network error (fetch reject) 시 throw 가 전파된다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		const fetchMock = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new ChatMockProvider();
		await expect(provider.generate(makeInput())).rejects.toThrow(
			"ECONNREFUSED",
		);
	});
});

// ---------------------------------------------------------------------------
// Scenario 6: base URL / API key 환경변수 처리
// ---------------------------------------------------------------------------

describe("ChatMockProvider.generate() — base URL / API key", () => {
	it("CHATMOCK_BASE_URL 환경변수가 요청 URL 에 반영된다", async () => {
		process.env["CHATMOCK_BASE_URL"] = "http://my-chatmock:9000/v1";

		const fetchMock = mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"body":"x","examples":[]}' } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		await provider.generate(makeInput());

		const url = fetchMock.mock.calls[0]?.[0];
		expect(url).toBe("http://my-chatmock:9000/v1/chat/completions");
	});

	it("BASE_URL 끝 슬래시는 정규화된다", async () => {
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1/";

		const fetchMock = mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"body":"x","examples":[]}' } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		await provider.generate(makeInput());

		const url = fetchMock.mock.calls[0]?.[0];
		expect(url).toBe("http://localhost:8000/v1/chat/completions"); // 슬래시 중복 없음
	});

	it("CHATMOCK_API_KEY 가 Authorization 헤더에 포함된다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		process.env["CHATMOCK_API_KEY"] = "my-custom-key";

		const fetchMock = mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"body":"x","examples":[]}' } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		await provider.generate(makeInput());

		const headers = (
			fetchMock.mock.calls[0]?.[1] as {
				headers: Record<string, string>;
			}
		).headers;
		expect(headers["Authorization"]).toBe("Bearer my-custom-key");
	});

	it("CHATMOCK_API_KEY 미설정 시 더미 키 'chatmock-local' 을 사용한다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		const fetchMock = mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"body":"x","examples":[]}' } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		await provider.generate(makeInput());

		const headers = (
			fetchMock.mock.calls[0]?.[1] as {
				headers: Record<string, string>;
			}
		).headers;
		expect(headers["Authorization"]).toBe("Bearer chatmock-local");
	});
});

// ---------------------------------------------------------------------------
// Scenario 7: 비용 0 + 출력 계약
// ---------------------------------------------------------------------------

describe("ChatMockProvider.generate() — 비용 / 출력 계약", () => {
	it("비용은 항상 0 USD (구독 기반)", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"body":"x","examples":[]}' } }],
					usage: { prompt_tokens: 9999, completion_tokens: 9999 }, // 의도적 큰 값
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.costUsd).toBe(0); // usage 값에 무관하게 0
	});

	it("examples 는 최대 3개로 잘린다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [
						{
							message: {
								content: JSON.stringify({
									body: "many examples",
									examples: ["a", "b", "c", "d", "e"],
								}),
							},
						},
					],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.examples).toHaveLength(3);
		expect(result.examples).toEqual(["a", "b", "c"]);
	});

	it("출력에 provider='chatmock', aiGenerated=true 가 포함된다", async () => {
		process.env["CHATMOCK_ENABLED"] = "true";

		mockFetchSequence([
			{
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"body":"x","examples":[]}' } }],
				}),
			},
		]);

		const provider = new ChatMockProvider();
		const result = await provider.generate(makeInput());

		expect(result.provider).toBe("chatmock");
		expect(result.aiGenerated).toBe(true);
		expect(result.model).toBe("gpt-4o"); // 기본 모델
	});
});
