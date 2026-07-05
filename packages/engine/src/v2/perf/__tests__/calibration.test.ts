/**
 * X-SAG Core Engine — PERF 룰 보정 로직 단위 테스트
 *
 * calibration.ts 모듈 검증:
 * - pass rate 계산 정확성
 * - 권고 로직 (keep/raise/lower)
 * - 통계량 계산 (median, p90, p95)
 */

import { describe, expect, it } from "vitest";
import {
	type CalibrationSample,
	type RuleCalibrationReport,
	calibrateRules,
	formatCalibrationReport,
} from "../calibration.js";
import type { LighthouseResult } from "../types.js";

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

/**
 * 기본 LighthouseResult 생성
 */
function createMockResult(
	overrides: Partial<LighthouseResult> = {},
): LighthouseResult {
	return {
		url: "https://example.com",
		strategy: "mobile",
		performance: 75,
		lcp: 2000,
		fid: 80,
		cls: 0.08,
		inp: 150,
		ttfb: 600,
		fcp: 1500,
		measuredAt: new Date().toISOString(),
		cachedAt: new Date().toISOString(),
		source: "mock",
		...overrides,
	};
}

/**
 * CalibrationSample 배열 생성
 */
function createSamples(
	count: number,
	overrides: Partial<LighthouseResult> = {},
): CalibrationSample[] {
	return Array.from({ length: count }, (_, i) => ({
		url: `https://example-${i}.com`,
		category: "cafe",
		lighthouseResult: createMockResult(overrides),
	}));
}

// ---------------------------------------------------------------------------
// 테스트: 기본 동작
// ---------------------------------------------------------------------------

describe("calibrateRules", () => {
	it("should return empty array for empty samples", () => {
		const result = calibrateRules([]);
		expect(result).toEqual([]);
	});

	it("should return 10 reports for valid samples", () => {
		const samples = createSamples(10);
		const reports = calibrateRules(samples);
		expect(reports).toHaveLength(10);
		expect(reports[0].ruleId).toBe("PERF-LCP-001");
		expect(reports[9].ruleId).toBe("PERF-MOBILE-001");
	});

	it("should have required fields in each report", () => {
		const samples = createSamples(5);
		const reports = calibrateRules(samples);

		for (const report of reports) {
			expect(report).toHaveProperty("ruleId");
			expect(report).toHaveProperty("threshold");
			expect(report).toHaveProperty("passRate");
			expect(report).toHaveProperty("median");
			expect(report).toHaveProperty("p90");
			expect(report).toHaveProperty("p95");
			expect(report).toHaveProperty("recommendation");
			expect(report).toHaveProperty("reason");
		}
	});
});

// ---------------------------------------------------------------------------
// 테스트: Pass Rate 계산
// ---------------------------------------------------------------------------

describe("pass rate calculation", () => {
	it("should calculate pass rate for PERF-LCP-001", () => {
		// 5개 중 2개 pass (LCP <= 2500ms: 2000, 2500)
		const samples: CalibrationSample[] = [
			{
				url: "1",
				category: "cafe",
				lighthouseResult: createMockResult({ lcp: 2000 }),
			},
			{
				url: "2",
				category: "cafe",
				lighthouseResult: createMockResult({ lcp: 2500 }),
			},
			{
				url: "3",
				category: "cafe",
				lighthouseResult: createMockResult({ lcp: 3000 }),
			},
			{
				url: "4",
				category: "cafe",
				lighthouseResult: createMockResult({ lcp: 4000 }),
			},
			{
				url: "5",
				category: "cafe",
				lighthouseResult: createMockResult({ lcp: 5000 }),
			},
		];

		const reports = calibrateRules(samples);
		const lcpReport = reports.find((r) => r.ruleId === "PERF-LCP-001");

		expect(lcpReport).toBeDefined();
		expect(lcpReport!.passRate).toBeCloseTo(0.4, 2); // 2/5 = 40%
	});

	it("should handle 100% pass rate", () => {
		const samples = createSamples(5, { lcp: 2000 });
		const reports = calibrateRules(samples);
		const lcpReport = reports.find((r) => r.ruleId === "PERF-LCP-001");

		expect(lcpReport!.passRate).toBe(1.0);
	});

	it("should handle 0% pass rate", () => {
		const samples = createSamples(5, { lcp: 5000 });
		const reports = calibrateRules(samples);
		const lcpReport = reports.find((r) => r.ruleId === "PERF-LCP-001");

		expect(lcpReport!.passRate).toBe(0.0);
	});
});

// ---------------------------------------------------------------------------
// 테스트: 권고 로직
// ---------------------------------------------------------------------------

describe("recommendation logic", () => {
	it("should recommend 'keep' for 50% pass rate", () => {
		const samples: CalibrationSample[] = [
			{
				url: "1",
				category: "cafe",
				lighthouseResult: createMockResult({ lcp: 2000 }),
			},
			{
				url: "2",
				category: "cafe",
				lighthouseResult: createMockResult({ lcp: 3000 }),
			},
		];

		const reports = calibrateRules(samples);
		const lcpReport = reports.find((r) => r.ruleId === "PERF-LCP-001");

		expect(lcpReport!.recommendation).toBe("keep");
	});

	it("should recommend 'raise' for >95% pass rate", () => {
		// 98% pass rate
		const samples: CalibrationSample[] = Array.from({ length: 50 }, (_, i) => ({
			url: `${i}`,
			category: "cafe",
			lighthouseResult: createMockResult({ lcp: i < 49 ? 2000 : 3000 }),
		}));

		const reports = calibrateRules(samples);
		const lcpReport = reports.find((r) => r.ruleId === "PERF-LCP-001");

		expect(lcpReport!.recommendation).toBe("raise");
	});

	it("should recommend 'lower' for <10% pass rate", () => {
		// 6% pass rate
		const samples: CalibrationSample[] = Array.from({ length: 50 }, (_, i) => ({
			url: `${i}`,
			category: "cafe",
			lighthouseResult: createMockResult({ lcp: i < 3 ? 2000 : 5000 }),
		}));

		const reports = calibrateRules(samples);
		const lcpReport = reports.find((r) => r.ruleId === "PERF-LCP-001");

		expect(lcpReport!.recommendation).toBe("lower");
	});
});

// ---------------------------------------------------------------------------
// 테스트: 통계량 계산
// ---------------------------------------------------------------------------

describe("statistics calculation", () => {
	it("should calculate median correctly", () => {
		const samples: CalibrationSample[] = [
			{
				url: "1",
				category: "cafe",
				lighthouseResult: createMockResult({ lcp: 1000 }),
			},
			{
				url: "2",
				category: "cafe",
				lighthouseResult: createMockResult({ lcp: 2000 }),
			},
			{
				url: "3",
				category: "cafe",
				lighthouseResult: createMockResult({ lcp: 3000 }),
			},
		];

		const reports = calibrateRules(samples);
		const lcpReport = reports.find((r) => r.ruleId === "PERF-LCP-001");

		expect(lcpReport!.median).toBe(2000);
	});

	it("should calculate percentiles correctly", () => {
		// 10개: [1000, 2000, 3000, ..., 10000]
		const samples: CalibrationSample[] = Array.from({ length: 10 }, (_, i) => ({
			url: `${i}`,
			category: "cafe",
			lighthouseResult: createMockResult({ lcp: (i + 1) * 1000 }),
		}));

		const reports = calibrateRules(samples);
		const lcpReport = reports.find((r) => r.ruleId === "PERF-LCP-001");

		expect(lcpReport!.p90).toBeGreaterThan(lcpReport!.median);
		expect(lcpReport!.p95).toBeGreaterThanOrEqual(lcpReport!.p90);
	});
});

// ---------------------------------------------------------------------------
// 테스트: 특수 케이스
// ---------------------------------------------------------------------------

describe("special cases", () => {
	it("should handle missing INP value gracefully", () => {
		const samples: CalibrationSample[] = [
			{
				url: "1",
				category: "cafe",
				lighthouseResult: createMockResult({ inp: undefined }),
			},
			{
				url: "2",
				category: "cafe",
				lighthouseResult: createMockResult({ inp: 100 }),
			},
		];

		const reports = calibrateRules(samples);
		const inpReport = reports.find((r) => r.ruleId === "PERF-INP-001");

		expect(inpReport).toBeDefined();
		// undefined 값은 필터링되므로 metric은 0으로 계산, 배열 [0, 100]의 중간값은 50
		// 실제로는 이 케이스를 피해야 하지만, 라이브러리 동작 확인용
		expect(inpReport!.median).toBeGreaterThan(0);
	});

	it("should handle desktop/mobile strategy in PERF-MOBILE-001", () => {
		const samples: CalibrationSample[] = [
			{
				url: "1",
				category: "cafe",
				lighthouseResult: createMockResult({
					strategy: "desktop",
					performance: 40,
				}),
			},
			{
				url: "2",
				category: "cafe",
				lighthouseResult: createMockResult({
					strategy: "mobile",
					performance: 40,
				}),
			},
			{
				url: "3",
				category: "cafe",
				lighthouseResult: createMockResult({
					strategy: "mobile",
					performance: 60,
				}),
			},
		];

		const reports = calibrateRules(samples);
		const mobileReport = reports.find((r) => r.ruleId === "PERF-MOBILE-001");

		// desktop은 통과, mobile 1개는 실패, mobile 1개는 통과 → 2/3 pass = 66%
		expect(mobileReport!.passRate).toBeCloseTo(0.67, 1);
	});
});

// ---------------------------------------------------------------------------
// 테스트: 포맷팅
// ---------------------------------------------------------------------------

describe("formatCalibrationReport", () => {
	it("should return non-empty markdown string", () => {
		const samples = createSamples(5);
		const reports = calibrateRules(samples);
		const markdown = formatCalibrationReport(reports);

		expect(markdown).toContain("# PERF 규칙 보정 보고서");
		expect(markdown).toContain("생성 시각");
		// 실제 보고서는 keep/raise/lower 중 하나만 포함 가능
		const hasSummaryLines =
			markdown.includes("Keep:") ||
			markdown.includes("Raise") ||
			markdown.includes("Lower");
		expect(hasSummaryLines).toBe(true);
	});

	it("should include all rule IDs in markdown", () => {
		const samples = createSamples(5);
		const reports = calibrateRules(samples);
		const markdown = formatCalibrationReport(reports);

		expect(markdown).toContain("PERF-LCP-001");
		expect(markdown).toContain("PERF-CLS-001");
		expect(markdown).toContain("PERF-MOBILE-001");
	});

	it("should include statistics in markdown", () => {
		const samples = createSamples(5);
		const reports = calibrateRules(samples);
		const markdown = formatCalibrationReport(reports);

		expect(markdown).toContain("Pass Rate");
		expect(markdown).toContain("Median");
		expect(markdown).toContain("P90");
		expect(markdown).toContain("P95");
	});
});

// ---------------------------------------------------------------------------
// 테스트: 회귀 테스트 (기존 행동 유지)
// ---------------------------------------------------------------------------

describe("regression test", () => {
	it("should not modify rule IDs", () => {
		const samples = createSamples(1);
		const reports = calibrateRules(samples);

		const expectedIds = [
			"PERF-LCP-001",
			"PERF-LCP-002",
			"PERF-FID-001",
			"PERF-CLS-001",
			"PERF-CLS-002",
			"PERF-INP-001",
			"PERF-TTFB-001",
			"PERF-FCP-001",
			"PERF-PERF-SCORE-001",
			"PERF-MOBILE-001",
		];

		const actualIds = reports.map((r) => r.ruleId);
		expect(actualIds).toEqual(expectedIds);
	});

	it("should maintain threshold values", () => {
		const samples = createSamples(1);
		const reports = calibrateRules(samples);

		const thresholds: Record<string, string | number> = {
			"PERF-LCP-001": "2500ms",
			"PERF-LCP-002": "4000ms",
			"PERF-FID-001": "100ms",
			"PERF-CLS-001": "0.1",
		};

		for (const [ruleId, expectedThreshold] of Object.entries(thresholds)) {
			const report = reports.find((r) => r.ruleId === ruleId);
			expect(report!.threshold).toBe(expectedThreshold);
		}
	});
});
