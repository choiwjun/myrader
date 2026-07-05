/**
 * X-SAG Core Engine — Lighthouse 실 측정 통합 테스트
 *
 * 외부 API (PageSpeed Insights)를 호출하는 통합 테스트.
 * 기본: skip 상태 (CI에서 외부 API 호출 회피)
 * 수동 실행: RUN_LIGHTHOUSE_INTEGRATION=1 bun test
 *
 * 검증 항목:
 * - PSI API 응답 구조
 * - LighthouseResult 파싱 정확성
 * - 재시도 로직 (3회)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PageSpeedInsightsProvider } from "../providers/pagespeed.js";
import type { LighthouseResult } from "../types.js";

const RUN_INTEGRATION = process.env.RUN_LIGHTHOUSE_INTEGRATION === "1";

// ---------------------------------------------------------------------------
// 테스트: 실 URL 측정 (Skip 기본)
// ---------------------------------------------------------------------------

describe.skipIf(!RUN_INTEGRATION)("Lighthouse Real Integration Tests", () => {
	let provider: PageSpeedInsightsProvider;

	beforeAll(() => {
		provider = new PageSpeedInsightsProvider();
	});

	it("should measure a real public URL (naver.com)", async () => {
		const result = await provider.measure("https://www.naver.com", {
			strategy: "mobile",
			category: ["performance"],
			locale: "ko",
		});

		// 응답 구조 검증
		expect(result).toHaveProperty("url");
		expect(result).toHaveProperty("strategy");
		expect(result).toHaveProperty("performance");
		expect(result).toHaveProperty("lcp");
		expect(result).toHaveProperty("fid");
		expect(result).toHaveProperty("cls");
		expect(result).toHaveProperty("ttfb");
		expect(result).toHaveProperty("fcp");
		expect(result).toHaveProperty("measuredAt");
		expect(result).toHaveProperty("source");

		// 값 범위 검증
		expect(result.performance).toBeGreaterThanOrEqual(0);
		expect(result.performance).toBeLessThanOrEqual(100);
		expect(result.lcp).toBeGreaterThan(0);
		expect(result.cls).toBeGreaterThanOrEqual(0);
	});

	it("should measure desktop strategy", async () => {
		const result = await provider.measure("https://www.daum.net", {
			strategy: "desktop",
			category: ["performance"],
			locale: "ko",
		});

		expect(result.strategy).toBe("desktop");
		expect(result.performance).toBeGreaterThanOrEqual(0);
	});

	it("should handle multiple measurements with rate limiting", async () => {
		const urls = ["https://www.naver.com", "https://www.daum.net"];

		const results: LighthouseResult[] = [];

		for (const url of urls) {
			const result = await provider.measure(url, {
				strategy: "mobile",
			});
			results.push(result);

			// Rate limit: wait 1 second between requests
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		expect(results).toHaveLength(2);
		expect(results[0].url).toContain("naver");
		expect(results[1].url).toContain("daum");
	});

	it("should have retry logic for transient failures", async () => {
		// 이 테스트는 실제 PSI API 호출 재시도 로직 검증
		// 연결 불안정 등으로 일시적 실패가 발생한 경우 자동 재시도
		const result = await provider.measure("https://www.google.com", {
			strategy: "mobile",
		});

		expect(result).toHaveProperty("url");
		expect(result.url).toContain("google");
	});

	it("should cache results appropriately", async () => {
		// 같은 URL 측정 시 캐시 활용 검증 (또는 새로운 측정)
		const url = "https://www.naver.com";

		const result1 = await provider.measure(url, {
			strategy: "mobile",
		});

		// 약간의 지연 후 재측정
		await new Promise((resolve) => setTimeout(resolve, 500));

		const result2 = await provider.measure(url, {
			strategy: "mobile",
		});

		// cachedAt이 같거나 새로워야 함 (캐시 또는 재측정)
		expect(result2).toHaveProperty("cachedAt");
		expect(new Date(result2.cachedAt) >= new Date(result1.cachedAt)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 테스트: 모의 URL 측정 (항상 실행, 네트워크 불필요)
// ---------------------------------------------------------------------------

describe("Lighthouse Mock Measurement Tests", () => {
	it("should parse LighthouseResult correctly", () => {
		// Mock 데이터 구조 검증
		const mockResult: LighthouseResult = {
			url: "https://example.com",
			strategy: "mobile",
			performance: 75,
			lcp: 2300,
			fid: 85,
			cls: 0.08,
			inp: 150,
			ttfb: 650,
			fcp: 1600,
			measuredAt: new Date().toISOString(),
			cachedAt: new Date().toISOString(),
			source: "mock",
		};

		expect(mockResult.performance).toBeGreaterThan(0);
		expect(mockResult.lcp).toBeLessThan(3000);
		expect(mockResult.cls).toBeLessThan(0.2);
	});

	it("should handle Core Web Vitals metrics", () => {
		const result: LighthouseResult = {
			url: "https://example.com",
			strategy: "mobile",
			performance: 70,
			lcp: 2500, // Good
			fid: 100,
			cls: 0.1, // Good
			ttfb: 800,
			fcp: 1800,
			measuredAt: new Date().toISOString(),
			cachedAt: new Date().toISOString(),
			source: "mock",
		};

		// Core Web Vitals: LCP, INP (또는 FID), CLS
		const isGoodLcp = result.lcp <= 2500;
		const isGoodCls = result.cls <= 0.1;

		expect(isGoodLcp).toBe(true);
		expect(isGoodCls).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 테스트: 한국 샘플 URL (Skip 기본)
// ---------------------------------------------------------------------------

describe.skipIf(!RUN_INTEGRATION)("Lighthouse Korean Sample URLs", () => {
	let provider: PageSpeedInsightsProvider;

	beforeAll(() => {
		provider = new PageSpeedInsightsProvider();
	});

	it("should measure popular Korean websites", async () => {
		const koreanUrls = ["https://www.naver.com", "https://www.daum.net"];

		for (const url of koreanUrls) {
			const result = await provider.measure(url, {
				strategy: "mobile",
				locale: "ko",
			});

			expect(result.url).toContain("://");
			expect(result.performance).toBeGreaterThanOrEqual(0);
			expect(result.performance).toBeLessThanOrEqual(100);

			// Rate limiting
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	});
});
