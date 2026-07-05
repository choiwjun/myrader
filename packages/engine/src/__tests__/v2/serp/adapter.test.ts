import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSerpAdapter } from "../../../v2/serp/adapter.js";
import { MockSerpProvider } from "../../../v2/serp/providers/mock.js";
import { NaverSerpProvider } from "../../../v2/serp/providers/naver.js";
import { SerpApiProvider } from "../../../v2/serp/providers/serpapi.js";

const SERP_ENV_KEYS = [
	"X_SAG_SERP",
	"SERPAPI_KEY",
	"SERPAPI_API_KEY",
	"NAVER_CLIENT_ID",
	"NAVER_CLIENT_SECRET",
] as const;

describe("createSerpAdapter", () => {
	const originalEnv: Partial<Record<(typeof SERP_ENV_KEYS)[number], string>> =
		{};

	beforeEach(() => {
		for (const key of SERP_ENV_KEYS) {
			originalEnv[key] = process.env[key];
			delete process.env[key];
		}
	});

	afterEach(() => {
		for (const key of SERP_ENV_KEYS) {
			const value = originalEnv[key];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	it("returns MockSerpProvider only when X_SAG_SERP=mock", () => {
		process.env["X_SAG_SERP"] = "mock";
		const adapter = createSerpAdapter();
		expect(adapter).toBeInstanceOf(MockSerpProvider);
		expect(adapter.name).toBe("mock");
		expect(adapter.isAvailable()).toBe(true);
	});

	it("explicit X_SAG_SERP=serpapi selects only SerpAPI", () => {
		process.env["X_SAG_SERP"] = "serpapi";
		process.env["SERPAPI_KEY"] = "serpapi-test-key";
		process.env["NAVER_CLIENT_ID"] = "naver-client-id";
		process.env["NAVER_CLIENT_SECRET"] = "naver-client-secret";

		const adapter = createSerpAdapter();

		expect(adapter).toBeInstanceOf(SerpApiProvider);
		expect(adapter.name).toBe("serpapi");
		expect(adapter.isAvailable()).toBe(true);
	});

	it("explicit X_SAG_SERP=naver selects only Naver", () => {
		process.env["X_SAG_SERP"] = "naver";
		process.env["SERPAPI_KEY"] = "serpapi-test-key";
		process.env["NAVER_CLIENT_ID"] = "naver-client-id";
		process.env["NAVER_CLIENT_SECRET"] = "naver-client-secret";

		const adapter = createSerpAdapter();

		expect(adapter).toBeInstanceOf(NaverSerpProvider);
		expect(adapter.name).toBe("naver");
		expect(adapter.isAvailable()).toBe(true);
	});

	it("explicit X_SAG_SERP=auto preserves the real-provider fallback chain", () => {
		process.env["X_SAG_SERP"] = "auto";
		process.env["SERPAPI_KEY"] = "serpapi-test-key";
		process.env["NAVER_CLIENT_ID"] = "naver-client-id";
		process.env["NAVER_CLIENT_SECRET"] = "naver-client-secret";

		const adapter = createSerpAdapter();

		expect(adapter.name).toBe("chain");
		expect(adapter.isAvailable()).toBe(true);
	});

	it("returns an unavailable adapter when no real provider keys are configured", async () => {
		const adapter = createSerpAdapter();
		expect(adapter.name).toBe("unavailable");
		expect(adapter.isAvailable()).toBe(false);
		await expect(adapter.search({ keyword: "강남 카페" })).rejects.toThrow(
			"SERP provider key not configured",
		);
	});

	it("uses SerpAPI when SERPAPI_KEY is configured", async () => {
		process.env["SERPAPI_KEY"] = "serpapi-test-key";
		const adapter = createSerpAdapter();
		expect(adapter.name).toBe("chain");
		expect(adapter.isAvailable()).toBe(true);
	});

	it("uses SerpAPI when legacy SERPAPI_API_KEY is configured", () => {
		process.env["SERPAPI_API_KEY"] = "legacy-serpapi-test-key";
		const adapter = createSerpAdapter();
		expect(adapter.name).toBe("chain");
		expect(adapter.isAvailable()).toBe(true);
		expect(new SerpApiProvider().isAvailable()).toBe(true);
	});

	it("uses Naver when Naver credentials are configured", () => {
		process.env["NAVER_CLIENT_ID"] = "naver-client-id";
		process.env["NAVER_CLIENT_SECRET"] = "naver-client-secret";
		const adapter = createSerpAdapter();
		expect(adapter.name).toBe("chain");
		expect(adapter.isAvailable()).toBe(true);
		expect(new NaverSerpProvider().isAvailable()).toBe(true);
	});

	it("selfDomain matching still works in explicit mock mode", async () => {
		process.env["X_SAG_SERP"] = "mock";
		const adapter = createSerpAdapter();
		const result = await adapter.search(
			{ keyword: "강남 카페" },
			"starbucks.co.kr",
		);
		expect(result.rank).toBe(1);
	});
});
