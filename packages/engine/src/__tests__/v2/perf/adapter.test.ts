import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLighthouseAdapter } from "../../../v2/perf/adapter.js";
import { MockLighthouseProvider } from "../../../v2/perf/providers/mock.js";
import { PageSpeedInsightsProvider } from "../../../v2/perf/providers/pagespeed.js";

describe("createLighthouseAdapter()", () => {
	const originalEnv = process.env.X_SAG_LIGHTHOUSE;
	const originalPageSpeedKey = process.env.PAGESPEED_API_KEY;
	const originalGooglePageSpeedKey = process.env.GOOGLE_PAGESPEED_API_KEY;

	function clearPerfEnv() {
		delete process.env.X_SAG_LIGHTHOUSE;
		delete process.env.PAGESPEED_API_KEY;
		delete process.env.GOOGLE_PAGESPEED_API_KEY;
	}

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.X_SAG_LIGHTHOUSE;
		} else {
			process.env.X_SAG_LIGHTHOUSE = originalEnv;
		}
		if (originalPageSpeedKey === undefined) {
			delete process.env.PAGESPEED_API_KEY;
		} else {
			process.env.PAGESPEED_API_KEY = originalPageSpeedKey;
		}
		if (originalGooglePageSpeedKey === undefined) {
			delete process.env.GOOGLE_PAGESPEED_API_KEY;
		} else {
			process.env.GOOGLE_PAGESPEED_API_KEY = originalGooglePageSpeedKey;
		}
	});

	it("returns MockLighthouseProvider when X_SAG_LIGHTHOUSE=mock", () => {
		clearPerfEnv();
		process.env.X_SAG_LIGHTHOUSE = "mock";
		const adapter = createLighthouseAdapter();
		expect(adapter).toBeInstanceOf(MockLighthouseProvider);
		expect(adapter.name).toBe("mock");
	});

	it("returns PageSpeedInsightsProvider when PAGESPEED_API_KEY is set", () => {
		clearPerfEnv();
		process.env.PAGESPEED_API_KEY = "psi-test-key";
		const adapter = createLighthouseAdapter();
		expect(adapter).toBeInstanceOf(PageSpeedInsightsProvider);
		expect(adapter.name).toBe("psi");
		expect(adapter.isAvailable()).toBe(true);
	});

	it("returns PageSpeedInsightsProvider when legacy GOOGLE_PAGESPEED_API_KEY is set", () => {
		clearPerfEnv();
		process.env.GOOGLE_PAGESPEED_API_KEY = "legacy-psi-test-key";
		const adapter = createLighthouseAdapter();
		expect(adapter).toBeInstanceOf(PageSpeedInsightsProvider);
		expect(adapter.isAvailable()).toBe(true);
	});

	it("returns an unavailable adapter without an API key", async () => {
		clearPerfEnv();
		const adapter = createLighthouseAdapter();
		expect(adapter.name).toBe("unavailable");
		expect(adapter.isAvailable()).toBe(false);
		await expect(adapter.measure("https://example.co.kr/")).rejects.toThrow(
			"PAGESPEED_API_KEY not set",
		);
	});

	it("explicit pagespeed mode returns PSI but remains unavailable without a key", () => {
		clearPerfEnv();
		process.env.X_SAG_LIGHTHOUSE = "pagespeed";
		const adapter = createLighthouseAdapter();
		expect(adapter).toBeInstanceOf(PageSpeedInsightsProvider);
		expect(adapter.isAvailable()).toBe(false);
	});
});

describe("PageSpeedInsightsProvider", () => {
	const originalPageSpeedKey = process.env.PAGESPEED_API_KEY;
	const originalGooglePageSpeedKey = process.env.GOOGLE_PAGESPEED_API_KEY;

	afterEach(() => {
		if (originalPageSpeedKey === undefined) {
			delete process.env.PAGESPEED_API_KEY;
		} else {
			process.env.PAGESPEED_API_KEY = originalPageSpeedKey;
		}
		if (originalGooglePageSpeedKey === undefined) {
			delete process.env.GOOGLE_PAGESPEED_API_KEY;
		} else {
			process.env.GOOGLE_PAGESPEED_API_KEY = originalGooglePageSpeedKey;
		}
	});

	it("isAvailable() requires a PageSpeed API key", () => {
		delete process.env.PAGESPEED_API_KEY;
		delete process.env.GOOGLE_PAGESPEED_API_KEY;
		expect(new PageSpeedInsightsProvider().isAvailable()).toBe(false);

		process.env.PAGESPEED_API_KEY = "psi-test-key";
		expect(new PageSpeedInsightsProvider().isAvailable()).toBe(true);

		delete process.env.PAGESPEED_API_KEY;
		process.env.GOOGLE_PAGESPEED_API_KEY = "legacy-psi-test-key";
		expect(new PageSpeedInsightsProvider().isAvailable()).toBe(true);
	});

	describe("measure() timeout", () => {
		afterEach(() => {
			vi.restoreAllMocks();
			vi.useRealTimers();
		});

		it("aborts at the default 60s when no timeoutMs is given", async () => {
			vi.useFakeTimers();
			process.env.PAGESPEED_API_KEY = "psi-test-key";
			let captured: AbortSignal | undefined;
			// fetch 가 abort 되기 전까지 영원히 pending — signal 만 캡처한다.
			vi.stubGlobal(
				"fetch",
				vi.fn(
					(_url: string, init?: { signal?: AbortSignal }) =>
						new Promise((_resolve, reject) => {
							captured = init?.signal;
							captured?.addEventListener("abort", () =>
								reject(new DOMException("aborted", "AbortError")),
							);
						}),
				),
			);

			const provider = new PageSpeedInsightsProvider();
			const p = provider.measure("https://heavy.example.kr/");
			const assertion = expect(p).rejects.toThrow();

			// 59s 시점엔 아직 abort 안 됨
			await vi.advanceTimersByTimeAsync(59_000);
			expect(captured?.aborted).toBe(false);
			// 60s 시점에 abort
			await vi.advanceTimersByTimeAsync(1_500);
			expect(captured?.aborted).toBe(true);
			await assertion;
		});

		it("respects an explicit timeoutMs override", async () => {
			vi.useFakeTimers();
			process.env.PAGESPEED_API_KEY = "psi-test-key";
			let captured: AbortSignal | undefined;
			vi.stubGlobal(
				"fetch",
				vi.fn(
					(_url: string, init?: { signal?: AbortSignal }) =>
						new Promise((_resolve, reject) => {
							captured = init?.signal;
							captured?.addEventListener("abort", () =>
								reject(new DOMException("aborted", "AbortError")),
							);
						}),
				),
			);

			const provider = new PageSpeedInsightsProvider();
			const p = provider.measure("https://heavy.example.kr/", {
				timeoutMs: 5_000,
			});
			const assertion = expect(p).rejects.toThrow();

			// 기본 60s 가 아니라 override 한 5s 에 abort 되어야 한다.
			await vi.advanceTimersByTimeAsync(4_900);
			expect(captured?.aborted).toBe(false);
			await vi.advanceTimersByTimeAsync(200);
			expect(captured?.aborted).toBe(true);
			await assertion;
		});
	});
});

describe("MockLighthouseProvider", () => {
	let provider: MockLighthouseProvider;

	beforeEach(() => {
		provider = new MockLighthouseProvider();
	});

	it("isAvailable() returns true", () => {
		expect(provider.isAvailable()).toBe(true);
	});

	it("name = 'mock'", () => {
		expect(provider.name).toBe("mock");
	});

	it("measure() returns a complete LighthouseResult", async () => {
		const result = await provider.measure("https://example.co.kr/");
		expect(result.url).toBe("https://example.co.kr/");
		expect(result.source).toBe("mock");
		expect(result.strategy).toBe("mobile");
		expect(typeof result.performance).toBe("number");
		expect(typeof result.lcp).toBe("number");
		expect(typeof result.fid).toBe("number");
		expect(typeof result.cls).toBe("number");
		expect(typeof result.ttfb).toBe("number");
		expect(typeof result.fcp).toBe("number");
		expect(typeof result.measuredAt).toBe("string");
		expect(typeof result.cachedAt).toBe("string");
	});

	it("measure() respects strategy=desktop", async () => {
		const result = await provider.measure("https://example.co.kr/", {
			strategy: "desktop",
		});
		expect(result.strategy).toBe("desktop");
	});

	it("returns deterministic mock values", async () => {
		const result = await provider.measure("https://example.co.kr/");
		expect(result.performance).toBe(75);
		expect(result.lcp).toBe(2200);
		expect(result.fid).toBe(85);
		expect(result.cls).toBe(0.08);
		expect(result.inp).toBe(180);
		expect(result.ttfb).toBe(600);
		expect(result.fcp).toBe(1500);
	});
});
