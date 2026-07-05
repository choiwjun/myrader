/**
 * v2/geo-validator/providers — askChatMock 신뢰성 wiring 테스트 (GAP 3)
 *
 * 실제 retry/breaker 가 fetch 호출 지점에 연결되었는지 검증한다 (global fetch mock).
 *
 * 검증:
 * 1. systemic 429 → 재시도하지 않음 (fetch 호출 1회) + validate 가 throw (배치 실패)
 * 2. 일시적 5xx → maxAttempts(3) 까지 재시도 후 mention=빈응답 → validate 는 resolve,
 *    citation.mentioned=false (배치 계속, "" 계약 보존)
 * 3. systemic 429 가 반복되면 breaker 가 open → 같은 인스턴스의 다음 validate 는
 *    fetch 를 더 두드리지 않고 fail-fast (호출 횟수 억제)
 *
 * sleep 실타이머 회피: retry 의 기본 base=200ms 이지만 maxAttempts=3 이라 최대 2회 대기.
 * 결정론·속도 위해 ChatMockGeoValidator 의 재시도 지연을 직접 제어할 수 없으므로,
 * vi.useFakeTimers 로 setTimeout 을 즉시 처리한다.
 */

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { LlmProviderConfig } from "../../../llm-provider/index.js";
import { ChatMockGeoValidator } from "../chatmock.js";

const PROVIDER: LlmProviderConfig = {
	id: "openai",
	baseUrl: "https://api.openai.com/v1",
	apiKey: "sk-test",
	model: "gpt-4o-mini",
};

const GEO_INPUT = {
	url: "https://test-cafe.example.kr/",
	businessName: "르카페",
	industry: "카페",
	region: "강남",
	targetKeywords: ["강남 카페"],
};

// 단일 질의만 보내도록 직접 query 를 주입한다 (rate-limit sleep 회피).
const SINGLE_QUERY = [
	{ query: "강남 카페 추천", facet: "industry-region" as const },
];

function jsonResponse(content: string): Response {
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		json: async () => ({ choices: [{ message: { content } }] }),
	} as unknown as Response;
}

function errorResponse(status: number, statusText: string): Response {
	return {
		ok: false,
		status,
		statusText,
		json: async () => ({}),
		text: async () => "error body",
	} as unknown as Response;
}

describe("ChatMockGeoValidator — GAP 3 retry/breaker wiring", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		// 재시도 백오프 sleep 을 즉시 처리하기 위해 가짜 타이머 사용.
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("systemic 429 는 재시도하지 않는다 (fetch 호출 1회) — validate 가 throw", async () => {
		fetchSpy.mockResolvedValue(errorResponse(429, "Too Many Requests"));

		const validator = new ChatMockGeoValidator({
			providerConfig: PROVIDER,
			rateLimitMs: 0,
		});

		const p = validator.validate(GEO_INPUT, SINGLE_QUERY);
		// rejection 핸들러를 먼저 붙여 unhandled rejection 을 피한다.
		const assertion = expect(p).rejects.toBeTruthy();
		await vi.runAllTimersAsync();
		await assertion;
		expect(fetchSpy).toHaveBeenCalledTimes(1); // 429 는 재시도 안 함
	});

	it("일시적 5xx 는 maxAttempts(3) 까지 재시도 후 빈응답으로 배치를 계속한다", async () => {
		fetchSpy.mockResolvedValue(errorResponse(503, "Service Unavailable"));

		const validator = new ChatMockGeoValidator({
			providerConfig: PROVIDER,
			rateLimitMs: 0,
		});

		const p = validator.validate(GEO_INPUT, SINGLE_QUERY);
		await vi.runAllTimersAsync();
		const result = await p;

		// 3회 시도 (1 + 2 재시도)
		expect(fetchSpy).toHaveBeenCalledTimes(3);
		// "" 계약 보존 — 배치는 resolve, citation 은 미언급 처리
		expect(result.citations).toHaveLength(1);
		expect(result.citations[0]?.hasMention).toBe(false);
	});

	it("transient 후 성공하면 1회 재시도 뒤 응답을 반영한다", async () => {
		fetchSpy
			.mockResolvedValueOnce(errorResponse(500, "Internal Server Error"))
			.mockResolvedValueOnce(jsonResponse("르카페는 강남 핸드드립 카페입니다."));

		const validator = new ChatMockGeoValidator({
			providerConfig: PROVIDER,
			rateLimitMs: 0,
		});

		const p = validator.validate(GEO_INPUT, SINGLE_QUERY);
		await vi.runAllTimersAsync();
		const result = await p;

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(result.citations).toHaveLength(1);
	});

	it("systemic 429 가 threshold 만큼 반복되면 breaker 가 open → 이후 fetch 를 막는다", async () => {
		fetchSpy.mockResolvedValue(errorResponse(429, "Too Many Requests"));

		const validator = new ChatMockGeoValidator({
			providerConfig: PROVIDER,
			rateLimitMs: 0,
		});

		// threshold=3: 3회 validate 시도(각 1 fetch, 429 throw) → breaker open
		for (let i = 0; i < 3; i++) {
			const p = validator.validate(GEO_INPUT, SINGLE_QUERY);
			const assertion = expect(p).rejects.toBeTruthy();
			await vi.runAllTimersAsync();
			await assertion;
		}
		expect(fetchSpy).toHaveBeenCalledTimes(3);

		// 4번째: 회로 open → fetch 미호출, 빈응답으로 배치 계속(throw 아님: CircuitOpenError → "")
		const p4 = validator.validate(GEO_INPUT, SINGLE_QUERY);
		await vi.runAllTimersAsync();
		const result = await p4;
		expect(fetchSpy).toHaveBeenCalledTimes(3); // 증가하지 않음 — provider hammering 방지
		expect(result.citations[0]?.hasMention).toBe(false);
	});
});
