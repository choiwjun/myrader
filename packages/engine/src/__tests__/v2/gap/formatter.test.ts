/**
 * X-SAG Core Engine v2 — Gap Formatter 단위 테스트
 *
 * 5 케이스:
 * 1. groupByActionType — 4개 그룹으로 분리
 * 2. groupByActionType — 각 그룹 gap 내림차순 정렬
 * 3. groupByCategory — 4개 카테고리로 분리
 * 4. filterCompetitorAdvantage / filterSelfStrength
 * 5. computeSummaryStats — 통계 정확성
 */

import { describe, expect, it } from "vitest";
import {
	computeSummaryStats,
	filterCompetitorAdvantage,
	filterSelfStrength,
	groupByActionType,
	groupByCategory,
} from "../../../v2/gap/formatter.js";
import type { GapMatrixRow } from "../../../v2/gap/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRow(
	overrides: Partial<GapMatrixRow> & Pick<GapMatrixRow, "ruleId">,
): GapMatrixRow {
	return {
		ruleId: overrides.ruleId,
		category: "seo",
		selfPassed: false,
		competitorPassedCount: 1,
		competitorTotal: 2,
		gap: 0.5,
		actionType: "self_fix",
		priority: "medium",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("groupByActionType", () => {
	it("4개 actionType 그룹으로 분리한다", () => {
		const rows: GapMatrixRow[] = [
			makeRow({ ruleId: "A", actionType: "self_fix" }),
			makeRow({ ruleId: "B", actionType: "snippet_action" }),
			makeRow({ ruleId: "C", actionType: "vendor_action" }),
			makeRow({ ruleId: "D", actionType: "si_action" }),
			makeRow({ ruleId: "E", actionType: "self_fix" }),
		];

		const grouped = groupByActionType(rows);

		expect(grouped.self_fix).toHaveLength(2);
		expect(grouped.snippet_action).toHaveLength(1);
		expect(grouped.vendor_action).toHaveLength(1);
		expect(grouped.si_action).toHaveLength(1);
	});

	it("각 그룹 내부는 gap 내림차순 정렬", () => {
		const rows: GapMatrixRow[] = [
			makeRow({ ruleId: "A", actionType: "self_fix", gap: 0.3 }),
			makeRow({ ruleId: "B", actionType: "self_fix", gap: 0.9 }),
			makeRow({ ruleId: "C", actionType: "self_fix", gap: 0.6 }),
		];

		const grouped = groupByActionType(rows);

		expect(grouped.self_fix.map((r) => r.ruleId)).toEqual(["B", "C", "A"]);
	});
});

describe("groupByCategory", () => {
	it("seo/aeo/geo/perf 4개 카테고리로 분리한다", () => {
		const rows: GapMatrixRow[] = [
			makeRow({ ruleId: "SEO-A", category: "seo" }),
			makeRow({ ruleId: "AEO-A", category: "aeo" }),
			makeRow({ ruleId: "GEO-A", category: "geo" }),
			makeRow({ ruleId: "PERF-A", category: "perf" }),
			makeRow({ ruleId: "SEO-B", category: "seo" }),
		];

		const grouped = groupByCategory(rows);

		expect(grouped.seo).toHaveLength(2);
		expect(grouped.aeo).toHaveLength(1);
		expect(grouped.geo).toHaveLength(1);
		expect(grouped.perf).toHaveLength(1);
	});
});

describe("filterCompetitorAdvantage / filterSelfStrength", () => {
	const rows: GapMatrixRow[] = [
		makeRow({ ruleId: "A", gap: 0.5 }), // 경쟁사 우위
		makeRow({ ruleId: "B", gap: -0.5 }), // 자기 우위
		makeRow({ ruleId: "C", gap: 0 }), // 동률
		makeRow({ ruleId: "D", gap: 1.0 }), // 경쟁사 우위
	];

	it("filterCompetitorAdvantage — gap > 0 항목만 반환", () => {
		const result = filterCompetitorAdvantage(rows);
		expect(result.map((r) => r.ruleId)).toEqual(["A", "D"]);
	});

	it("filterSelfStrength — gap < 0 항목만 반환", () => {
		const result = filterSelfStrength(rows);
		expect(result.map((r) => r.ruleId)).toEqual(["B"]);
	});
});

describe("computeSummaryStats", () => {
	it("올바른 통계를 반환한다", () => {
		const rows: GapMatrixRow[] = [
			makeRow({ ruleId: "A", gap: 0.5 }),
			makeRow({ ruleId: "B", gap: -0.5 }),
			makeRow({ ruleId: "C", gap: 0 }),
			makeRow({ ruleId: "D", gap: 1.0 }),
		];

		const stats = computeSummaryStats(rows);

		expect(stats.totalRules).toBe(4);
		expect(stats.competitorAdvantageCount).toBe(2);
		expect(stats.selfStrengthCount).toBe(1);
		expect(stats.parityCount).toBe(1);
		expect(stats.avgGap).toBeCloseTo(0.25); // (0.5 + -0.5 + 0 + 1.0) / 4
	});

	it("빈 배열이면 0 반환", () => {
		const stats = computeSummaryStats([]);

		expect(stats.totalRules).toBe(0);
		expect(stats.avgGap).toBe(0);
	});
});
