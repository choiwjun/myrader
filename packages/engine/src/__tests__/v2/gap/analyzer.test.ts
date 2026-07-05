/**
 * X-SAG Core Engine v2 — GapAnalyzer 단위 테스트
 *
 * 6 케이스:
 * 1. 갭 매트릭스 빌드 — 경쟁사 우위 gap 양수
 * 2. 자기 우위 — gap 음수
 * 3. Top 5 선정 — high priority + self_fix 우선
 * 4. Top 5 — 갭 없으면 빈 배열
 * 5. 자기 우위 항목 추출 (selfStrengths)
 * 6. 시장 평균 계산 (marketAverage)
 */

import { describe, expect, it } from "vitest";
import { GapAnalyzer } from "../../../v2/gap/analyzer.js";
import type {
	CompetitorReport,
	DiagnosisJson,
	GapInput,
} from "../../../v2/gap/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSelfReport(items: DiagnosisJson["diagnosisItems"]): DiagnosisJson {
	return {
		reportId: "self-001",
		websiteUrl: "https://self.example.com",
		diagnosisItems: items,
		overallScore: 70,
		seoScore: 72,
		aeoScore: 68,
		geoScore: 70,
		perfScore: 60,
	};
}

function makeCompetitor(
	url: string,
	items: CompetitorReport["diagnosisItems"],
	scores?: Partial<CompetitorReport>,
): CompetitorReport {
	return {
		competitorUrl: url,
		seoScore: 80,
		aeoScore: 75,
		geoScore: 70,
		perfScore: 65,
		overallScore: 75,
		diagnosisItems: items,
		...scores,
	};
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("GapAnalyzer", () => {
	const analyzer = new GapAnalyzer();

	it("갭 매트릭스 빌드 — 경쟁사 우위 시 gap 양수", () => {
		const input: GapInput = {
			selfReport: makeSelfReport([
				{
					ruleId: "SEO-TITLE-001",
					category: "seo",
					passed: false,
					actionType: "self_fix",
					priority: "high",
				},
			]),
			competitors: [
				makeCompetitor("https://comp1.com", [
					{ ruleId: "SEO-TITLE-001", category: "seo", passed: true },
				]),
				makeCompetitor("https://comp2.com", [
					{ ruleId: "SEO-TITLE-001", category: "seo", passed: true },
				]),
			],
		};

		const result = analyzer.analyze(input);
		const row = result.matrix.find((r) => r.ruleId === "SEO-TITLE-001");

		expect(row).toBeDefined();
		expect(row!.gap).toBeCloseTo(1); // compPassRate(1.0) - selfPassRate(0) = 1.0
		expect(row!.selfPassed).toBe(false);
		expect(row!.competitorPassedCount).toBe(2);
		expect(row!.competitorTotal).toBe(2);
	});

	it("자기 우위 — 자기 통과, 경쟁사 미통과 시 gap 음수", () => {
		const input: GapInput = {
			selfReport: makeSelfReport([
				{
					ruleId: "AEO-FAQ-001",
					category: "aeo",
					passed: true,
					actionType: "snippet_action",
					priority: "medium",
				},
			]),
			competitors: [
				makeCompetitor("https://comp1.com", [
					{ ruleId: "AEO-FAQ-001", category: "aeo", passed: false },
				]),
				makeCompetitor("https://comp2.com", [
					{ ruleId: "AEO-FAQ-001", category: "aeo", passed: false },
				]),
			],
		};

		const result = analyzer.analyze(input);
		const row = result.matrix.find((r) => r.ruleId === "AEO-FAQ-001");

		expect(row!.gap).toBeCloseTo(-1); // compPassRate(0) - selfPassRate(1) = -1
		expect(row!.selfPassed).toBe(true);
		expect(row!.competitorPassedCount).toBe(0);
	});

	it("Top 5 선정 — high priority + self_fix 항목이 우선 선정", () => {
		// high priority self_fix vs low priority si_action
		const input: GapInput = {
			selfReport: makeSelfReport([
				{
					ruleId: "SEO-A",
					category: "seo",
					passed: false,
					actionType: "self_fix",
					priority: "high",
				},
				{
					ruleId: "SEO-B",
					category: "seo",
					passed: false,
					actionType: "si_action",
					priority: "low",
				},
			]),
			competitors: [
				makeCompetitor("https://comp1.com", [
					{ ruleId: "SEO-A", category: "seo", passed: true },
					{ ruleId: "SEO-B", category: "seo", passed: true },
				]),
			],
		};

		const result = analyzer.analyze(input);
		expect(result.priorities.length).toBeGreaterThan(0);
		expect(result.priorities[0].rank).toBe(1);
		// SEO-A: gap(1) × priority(3) × bonus(1.5) = 4.5
		// SEO-B: gap(1) × priority(1) × bonus(0.7) = 0.7
		expect(result.priorities[0].ruleId).toBe("SEO-A");
	});

	it("Top 5 — 경쟁사 우위 항목 없으면 빈 배열", () => {
		const input: GapInput = {
			selfReport: makeSelfReport([
				{
					ruleId: "SEO-X",
					category: "seo",
					passed: true,
					actionType: "self_fix",
					priority: "high",
				},
			]),
			competitors: [
				makeCompetitor("https://comp1.com", [
					{ ruleId: "SEO-X", category: "seo", passed: false },
				]),
			],
		};

		const result = analyzer.analyze(input);
		expect(result.priorities).toHaveLength(0);
	});

	it("selfStrengths — 자기 통과, 경쟁사 절반 이하 통과 항목 추출", () => {
		const input: GapInput = {
			selfReport: makeSelfReport([
				{
					ruleId: "GEO-LOC-001",
					category: "geo",
					passed: true,
					actionType: "vendor_action",
					priority: "medium",
				},
				{
					ruleId: "GEO-LOC-002",
					category: "geo",
					passed: true,
					actionType: "vendor_action",
					priority: "low",
				},
			]),
			competitors: [
				// GEO-LOC-001: 0/2 통과 → 자기 우위
				makeCompetitor("https://comp1.com", [
					{ ruleId: "GEO-LOC-001", category: "geo", passed: false },
					{ ruleId: "GEO-LOC-002", category: "geo", passed: true },
				]),
				makeCompetitor("https://comp2.com", [
					{ ruleId: "GEO-LOC-001", category: "geo", passed: false },
					{ ruleId: "GEO-LOC-002", category: "geo", passed: true },
				]),
			],
		};

		const result = analyzer.analyze(input);
		// GEO-LOC-001: 경쟁사 0/2 통과 → 강점
		expect(result.selfStrengths).toContain("GEO-LOC-001");
		// GEO-LOC-002: 경쟁사 2/2 통과 → 강점 아님
		expect(result.selfStrengths).not.toContain("GEO-LOC-002");
	});

	it("marketAverage — 경쟁사 점수 평균 계산", () => {
		const input: GapInput = {
			selfReport: makeSelfReport([]),
			competitors: [
				makeCompetitor("https://comp1.com", [], {
					seoScore: 80,
					aeoScore: 60,
					geoScore: 70,
					perfScore: 50,
					overallScore: 70,
				}),
				makeCompetitor("https://comp2.com", [], {
					seoScore: 60,
					aeoScore: 80,
					geoScore: 70,
					perfScore: 70,
					overallScore: 70,
				}),
			],
		};

		const result = analyzer.analyze(input);
		expect(result.marketAverage.seo).toBeCloseTo(70);
		expect(result.marketAverage.aeo).toBeCloseTo(70);
		expect(result.marketAverage.geo).toBeCloseTo(70);
		expect(result.marketAverage.perf).toBeCloseTo(60);
		expect(result.marketAverage.overall).toBeCloseTo(70);
	});

	it("경쟁사 없으면 marketAverage 모두 0", () => {
		const input: GapInput = {
			selfReport: makeSelfReport([]),
			competitors: [],
		};

		const result = analyzer.analyze(input);
		expect(result.marketAverage).toEqual({
			seo: 0,
			aeo: 0,
			geo: 0,
			perf: 0,
			overall: 0,
		});
	});
});
