/**
 * X-SAG Core Engine — NlpAnalyzer chain tests
 *
 * Phase P-A: 체인 우선순위/폴백 동작 검증.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NlpAnalyzerChain, createNlpAnalyzer } from "../analyzer.js";
import { ChatMockNlpProvider } from "../providers/chatmock.js";
import { MockNlpProvider } from "../providers/mock.js";
import { RuleBasedNlpProvider } from "../providers/rule-based.js";
import type { NlpInput, NlpProvider, NlpResult } from "../types.js";

function makeInput(): NlpInput {
	return {
		url: "https://example.com",
		title: "test",
		description: "test",
		bodyText: "test body 안녕하세요 테스트입니다.",
		h1: "h1",
		h2: ["h2"],
		targetKeywords: ["test"],
		industry: "tech",
		region: "seoul",
	};
}

describe("NlpAnalyzerChain", () => {
	it("throws when constructed with no providers", () => {
		expect(() => new NlpAnalyzerChain([])).toThrow();
	});

	it("uses first available provider", async () => {
		const m1 = new MockNlpProvider();
		const m2 = new MockNlpProvider();
		const chain = new NlpAnalyzerChain([m1, m2]);
		const result = await chain.analyze(makeInput());
		expect(result.source).toBe("mock");
	});

	it("falls back to next provider on failure", async () => {
		const failing = new MockNlpProvider();
		failing.setShouldFail(true);
		const fallback = new RuleBasedNlpProvider();

		const chain = new NlpAnalyzerChain([failing, fallback]);
		const result = await chain.analyze(makeInput());
		expect(result.source).toBe("rule-based");
	});

	it("skips unavailable providers", async () => {
		const unavailable: NlpProvider = {
			name: "unavail",
			isAvailable: () => false,
			analyze: async () => {
				throw new Error("should not be called");
			},
		};
		const ok = new RuleBasedNlpProvider();
		const chain = new NlpAnalyzerChain([unavailable, ok]);
		const result = await chain.analyze(makeInput());
		expect(result.source).toBe("rule-based");
	});

	it("throws when all providers fail", async () => {
		const failing1 = new MockNlpProvider();
		failing1.setShouldFail(true);
		const failing2 = new MockNlpProvider();
		failing2.setShouldFail(true);
		const chain = new NlpAnalyzerChain([failing1, failing2]);
		await expect(chain.analyze(makeInput())).rejects.toThrow();
	});
});

describe("createNlpAnalyzer factory", () => {
	const originalEnabled = process.env["CHATMOCK_ENABLED"];
	const originalBase = process.env["CHATMOCK_BASE_URL"];

	beforeEach(() => {
		delete process.env["CHATMOCK_ENABLED"];
		delete process.env["CHATMOCK_BASE_URL"];
	});

	afterEach(() => {
		if (originalEnabled === undefined) delete process.env["CHATMOCK_ENABLED"];
		else process.env["CHATMOCK_ENABLED"] = originalEnabled;
		if (originalBase === undefined) delete process.env["CHATMOCK_BASE_URL"];
		else process.env["CHATMOCK_BASE_URL"] = originalBase;
	});

	it("returns RuleBasedNlpProvider when ChatMock not configured", () => {
		const analyzer = createNlpAnalyzer();
		expect(analyzer.name).toBe("rule-based");
	});

	it("returns chain when CHATMOCK_ENABLED=true", () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		const analyzer = createNlpAnalyzer();
		expect(analyzer.name).toBe("chain");
	});
});
