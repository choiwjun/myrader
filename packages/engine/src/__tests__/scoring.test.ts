/**
 * X-SAG Core Engine — Scoring Engine 단위 테스트 (TASK-CORE-006)
 *
 * 기존 5 케이스 + v2.0.0 신규 케이스 (Phase M-A):
 * 1. 모든 규칙 pass=true → 100점
 * 2. 모든 규칙 fail (클립) → 0점 하한 보장
 * 3. 가중 평균 (v2: perf 미포함 재정규화 가중치)
 * 4. 차감 합계가 100 초과 시 0으로 클립
 * 5. scoringVersion === "2.0.0"
 * 6. perf 미포함 → perfScore null
 * 7. perf 포함 → SEO35/AEO25/GEO25/PERF15 가중치
 * 8. v2.0.0 하위 호환 검증
 */

import { describe, expect, it } from "vitest";
import type { AnalyzerResult, RuleResult } from "../analyzers/types.js";
import {
	GRADED_SCORING_VERSION,
	SCORING_VERSION,
	scoreDiagnosis,
} from "../scoring.js";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<RuleResult>): RuleResult {
	return {
		ruleId: "SEO-TEST-001",
		category: "seo",
		passed: true,
		severity: "medium",
		title: "Test Rule",
		description: "Test description",
		evidence: [],
		recommendation: "Test recommendation",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 5,
		...overrides,
	};
}

function makeAnalyzerResult(
	category: "seo" | "aeo" | "geo",
	results: RuleResult[],
): AnalyzerResult {
	return { category, results };
}

// ---------------------------------------------------------------------------
// Test Case 1: 모든 규칙 pass=true → 카테고리별 100점
// ---------------------------------------------------------------------------

describe("Case 1: 모든 규칙 통과 → 100점", () => {
	it("모든 passed=true이면 seoScore=100, aeoScore=100, geoScore=100", () => {
		const seo = makeAnalyzerResult("seo", [
			makeResult({ category: "seo", passed: true, ruleWeight: 10 }),
			makeResult({ category: "seo", passed: true, ruleWeight: 5 }),
		]);
		const aeo = makeAnalyzerResult("aeo", [
			makeResult({ category: "aeo", passed: true, ruleWeight: 8 }),
		]);
		const geo = makeAnalyzerResult("geo", [
			makeResult({ category: "geo", passed: true, ruleWeight: 3 }),
		]);

		const output = scoreDiagnosis({ seo, aeo, geo });

		expect(output.seoScore).toBe(100);
		expect(output.aeoScore).toBe(100);
		expect(output.geoScore).toBe(100);
		expect(output.overallScore).toBe(100);
	});

	it("빈 결과 배열도 100점", () => {
		const seo = makeAnalyzerResult("seo", []);
		const aeo = makeAnalyzerResult("aeo", []);
		const geo = makeAnalyzerResult("geo", []);

		// v2 레거시: 빈 결과 = 차감 없음 = 100 (graded 는 룰 0개 → 0). v2 모드 명시.
		const output = scoreDiagnosis({ seo, aeo, geo }, { mode: "v2" });

		expect(output.seoScore).toBe(100);
		expect(output.overallScore).toBe(100);
	});
});

// ---------------------------------------------------------------------------
// Test Case 2: 모두 fail → 0점 하한 (클립)
// ---------------------------------------------------------------------------

describe("Case 2: 모든 규칙 실패 → 0점 하한 보장", () => {
	it("다수의 high severity/priority 규칙이 실패하면 0점으로 클립", () => {
		// ruleWeight=10, severity=high → deduction = 10*10*0.20 = 20 per rule
		// 10개 fail → deduction = 200 → clamp to 0
		const failedRules = Array.from({ length: 10 }, (_, i) =>
			makeResult({
				ruleId: `SEO-FAIL-${i.toString().padStart(3, "0")}`,
				category: "seo",
				passed: false,
				severity: "high",
				ruleWeight: 10,
			}),
		);

		const seo = makeAnalyzerResult("seo", failedRules);
		const aeo = makeAnalyzerResult("aeo", []);
		const geo = makeAnalyzerResult("geo", []);

		const output = scoreDiagnosis({ seo, aeo, geo });

		expect(output.seoScore).toBe(0);
		expect(output.seoScore).toBeGreaterThanOrEqual(0);
	});
});

// ---------------------------------------------------------------------------
// Test Case 3: 가중 평균 (v2.0.0 perf 미포함 재정규화 가중치)
// ---------------------------------------------------------------------------

describe("Case 3: 가중 평균 (v2.0.0 perf 미포함: 재정규화 가중치)", () => {
	it("알려진 카테고리 점수로 overallScore를 검증한다 (perf 미포함)", () => {
		// SEO: 100점 (pass)
		// AEO: ruleWeight=5, severity=medium → deduction = 5*10*0.10 = 5 → score = 95
		// GEO: ruleWeight=10, severity=high → deduction = 10*10*0.20 = 20 → score = 80
		// perf 미포함: 가중치 재정규화 0.35/0.85, 0.25/0.85, 0.25/0.85
		// overall = round(100*(0.35/0.85) + 95*(0.25/0.85) + 80*(0.25/0.85))
		//         = round(41.176 + 27.941 + 23.529) = round(92.647) = 93

		const seo = makeAnalyzerResult("seo", [
			makeResult({ category: "seo", passed: true }),
		]);
		const aeo = makeAnalyzerResult("aeo", [
			makeResult({
				category: "aeo",
				passed: false,
				severity: "medium",
				ruleWeight: 5,
			}),
		]);
		const geo = makeAnalyzerResult("geo", [
			makeResult({
				category: "geo",
				passed: false,
				severity: "high",
				ruleWeight: 10,
			}),
		]);

		const output = scoreDiagnosis({ seo, aeo, geo }, { mode: "v2" });

		expect(output.seoScore).toBe(100);
		expect(output.aeoScore).toBe(95);
		expect(output.geoScore).toBe(80);
		expect(output.overallScore).toBe(93);
	});

	it("모든 카테고리 50점이면 overallScore=50 (perf 미포함, 재정규화)", () => {
		// 재정규화 가중치 합 = 1.0 → 모두 50점이면 overallScore=50
		const makeFailRules = (category: "seo" | "aeo" | "geo") =>
			Array.from({ length: 5 }, (_, i) =>
				makeResult({
					ruleId: `${category.toUpperCase()}-FAIL-${i}`,
					category,
					passed: false,
					severity: "high",
					ruleWeight: 5,
				}),
			);

		const seo = makeAnalyzerResult("seo", makeFailRules("seo"));
		const aeo = makeAnalyzerResult("aeo", makeFailRules("aeo"));
		const geo = makeAnalyzerResult("geo", makeFailRules("geo"));

		const output = scoreDiagnosis({ seo, aeo, geo }, { mode: "v2" });

		expect(output.seoScore).toBe(50);
		expect(output.aeoScore).toBe(50);
		expect(output.geoScore).toBe(50);
		expect(output.overallScore).toBe(50);
	});
});

// ---------------------------------------------------------------------------
// Test Case 4: 차감 합계 100 초과 시 0 클립
// ---------------------------------------------------------------------------

describe("Case 4: 차감 합계 100 초과 → 0 클립", () => {
	it("총 차감이 100을 초과해도 점수는 0 미만이 되지 않는다", () => {
		// ruleWeight=10, severity=high: deduction=20 per rule × 6 rules = 120 > 100 → clamp to 0
		const failedRules = Array.from({ length: 6 }, (_, i) =>
			makeResult({
				ruleId: `SEO-CLIP-${i}`,
				category: "seo",
				passed: false,
				severity: "high",
				ruleWeight: 10,
			}),
		);

		const seo = makeAnalyzerResult("seo", failedRules);
		const aeo = makeAnalyzerResult("aeo", []);
		const geo = makeAnalyzerResult("geo", []);

		const output = scoreDiagnosis({ seo, aeo, geo });

		expect(output.seoScore).toBe(0);
		expect(output.seoScore).not.toBeLessThan(0);
		expect(output.overallScore).toBeGreaterThanOrEqual(0);
	});

	it("overallScore도 0 이상을 보장한다", () => {
		const makeAllFail = (category: "seo" | "aeo" | "geo") =>
			Array.from({ length: 10 }, (_, i) =>
				makeResult({
					ruleId: `${category}-ALL-FAIL-${i}`,
					category,
					passed: false,
					severity: "high",
					ruleWeight: 10,
				}),
			);

		const output = scoreDiagnosis({
			seo: makeAnalyzerResult("seo", makeAllFail("seo")),
			aeo: makeAnalyzerResult("aeo", makeAllFail("aeo")),
			geo: makeAnalyzerResult("geo", makeAllFail("geo")),
		});

		expect(output.overallScore).toBe(0);
		expect(output.overallScore).toBeGreaterThanOrEqual(0);
	});
});

// ---------------------------------------------------------------------------
// Test Case 5: scoringVersion v2.0.0
// ---------------------------------------------------------------------------

describe("Case 5: scoringVersion 2.1.0 (graded 기본 승격)", () => {
	it("기본 scoringVersion은 '2.1.0'이다 (graded)", () => {
		const output = scoreDiagnosis({
			seo: makeAnalyzerResult("seo", []),
			aeo: makeAnalyzerResult("aeo", []),
			geo: makeAnalyzerResult("geo", []),
		});

		expect(output.scoringVersion).toBe("2.1.0");
		expect(output.scoringVersion).toBe(SCORING_VERSION);
	});

	it("SCORING_VERSION 상수도 '2.1.0'이다 (graded 기본 승격)", () => {
		expect(SCORING_VERSION).toBe("2.1.0");
	});
});

// ---------------------------------------------------------------------------
// Test Case 6: perf 미측정 → perfScore null
// ---------------------------------------------------------------------------

describe("Case 6: perf 미측정 → perfScore null", () => {
	it("perf를 제공하지 않으면 perfScore가 null이다", () => {
		const output = scoreDiagnosis({
			seo: makeAnalyzerResult("seo", []),
			aeo: makeAnalyzerResult("aeo", []),
			geo: makeAnalyzerResult("geo", []),
		});

		expect(output.perfScore).toBeNull();
	});

	it("perf 미포함 시 전체 100점이면 overallScore=100", () => {
		const output = scoreDiagnosis({
			seo: makeAnalyzerResult("seo", [
				makeResult({ category: "seo", passed: true }),
			]),
			aeo: makeAnalyzerResult("aeo", [
				makeResult({ category: "aeo", passed: true }),
			]),
			geo: makeAnalyzerResult("geo", [
				makeResult({ category: "geo", passed: true }),
			]),
		});

		expect(output.perfScore).toBeNull();
		expect(output.overallScore).toBe(100);
	});
});

// ---------------------------------------------------------------------------
// Test Case 7: perf 포함 → SEO35/AEO25/GEO25/PERF15 가중치
// ---------------------------------------------------------------------------

describe("Case 7: perf 포함 → SEO35/AEO25/GEO25/PERF15 가중치", () => {
	it("모든 카테고리 100점이면 perf 포함 시도 overallScore=100", () => {
		const output = scoreDiagnosis({
			seo: makeAnalyzerResult("seo", [
				makeResult({ category: "seo", passed: true }),
			]),
			aeo: makeAnalyzerResult("aeo", [
				makeResult({ category: "aeo", passed: true }),
			]),
			geo: makeAnalyzerResult("geo", [
				makeResult({ category: "geo", passed: true }),
			]),
			perf: makeAnalyzerResult("geo", [
				makeResult({ category: "geo", passed: true }),
			]),
		});

		expect(output.seoScore).toBe(100);
		expect(output.aeoScore).toBe(100);
		expect(output.geoScore).toBe(100);
		expect(output.perfScore).toBe(100);
		expect(output.overallScore).toBe(100);
	});

	it("seo 0점, 나머지 100점 → overall = round(0*0.35 + 100*0.25 + 100*0.25 + 100*0.15) = 65", () => {
		const failedSeo = Array.from({ length: 5 }, (_, i) =>
			makeResult({
				ruleId: `SEO-ZERO-${i}`,
				category: "seo",
				passed: false,
				severity: "high",
				ruleWeight: 10,
			}),
		);

		const output = scoreDiagnosis({
			seo: makeAnalyzerResult("seo", failedSeo),
			aeo: makeAnalyzerResult("aeo", [
				makeResult({ category: "aeo", passed: true }),
			]),
			geo: makeAnalyzerResult("geo", [
				makeResult({ category: "geo", passed: true }),
			]),
			perf: makeAnalyzerResult("geo", [
				makeResult({ category: "geo", passed: true }),
			]),
		});

		expect(output.seoScore).toBe(0);
		expect(output.aeoScore).toBe(100);
		expect(output.geoScore).toBe(100);
		expect(output.perfScore).toBe(100);
		// overall = round(0*0.35 + 100*0.25 + 100*0.25 + 100*0.15) = round(65) = 65
		expect(output.overallScore).toBe(65);
	});

	it("perf 0점이면 overall = round(100*0.35 + 100*0.25 + 100*0.25 + 0*0.15) = 85", () => {
		const failedPerf = Array.from({ length: 5 }, (_, i) =>
			makeResult({
				ruleId: `PERF-ZERO-${i}`,
				category: "geo",
				passed: false,
				severity: "high",
				ruleWeight: 10,
			}),
		);

		const output = scoreDiagnosis({
			seo: makeAnalyzerResult("seo", [
				makeResult({ category: "seo", passed: true }),
			]),
			aeo: makeAnalyzerResult("aeo", [
				makeResult({ category: "aeo", passed: true }),
			]),
			geo: makeAnalyzerResult("geo", [
				makeResult({ category: "geo", passed: true }),
			]),
			perf: makeAnalyzerResult("geo", failedPerf),
		});

		expect(output.seoScore).toBe(100);
		expect(output.aeoScore).toBe(100);
		expect(output.geoScore).toBe(100);
		expect(output.perfScore).toBe(0);
		// overall = round(100*0.35 + 100*0.25 + 100*0.25 + 0*0.15) = round(85) = 85
		expect(output.overallScore).toBe(85);
	});
});

// ---------------------------------------------------------------------------
// Test Case 8: v2.0.0 하위 호환 — 출력 필드 검증
// ---------------------------------------------------------------------------

describe("Case 8: v2.0.0 하위 호환성 검증", () => {
	it("perf 없이 호출 시 모든 출력 필드가 존재한다", () => {
		const output = scoreDiagnosis({
			seo: makeAnalyzerResult("seo", []),
			aeo: makeAnalyzerResult("aeo", []),
			geo: makeAnalyzerResult("geo", []),
		});

		expect(output).toHaveProperty("seoScore");
		expect(output).toHaveProperty("aeoScore");
		expect(output).toHaveProperty("geoScore");
		expect(output).toHaveProperty("perfScore");
		expect(output).toHaveProperty("overallScore");
		expect(output).toHaveProperty("scoringVersion");
	});

	it("v2 가중치 정규화: seo=100, 나머지 0 → overall = round(100*(0.35/0.85)) = 41", () => {
		const failFive = (category: "seo" | "aeo" | "geo") =>
			Array.from({ length: 5 }, (_, i) =>
				makeResult({
					ruleId: `${category.toUpperCase()}-ZERO-${i}`,
					category,
					passed: false,
					severity: "high",
					ruleWeight: 10,
				}),
			);

		const output = scoreDiagnosis({
			seo: makeAnalyzerResult("seo", [
				makeResult({ category: "seo", passed: true }),
			]),
			aeo: makeAnalyzerResult("aeo", failFive("aeo")),
			geo: makeAnalyzerResult("geo", failFive("geo")),
		});

		// seo=100, aeo=0, geo=0 → 100*(0.35/0.85) = 41.176 → round = 41
		expect(output.seoScore).toBe(100);
		expect(output.aeoScore).toBe(0);
		expect(output.geoScore).toBe(0);
		expect(output.overallScore).toBe(41);
	});
});

// ---------------------------------------------------------------------------
// WS6: graded (비포화) 채점 모드 — 실 SMB 검증으로 드러난 포화 문제 해소
// ---------------------------------------------------------------------------

describe("WS6 graded 모드 (비포화)", () => {
	const onePass = (category: "aeo" | "geo") =>
		makeAnalyzerResult(category, [makeResult({ category, passed: true })]);

	it("고-심각도 일부 실패해도 통과 비율로 변별 (v2는 0 포화)", () => {
		// 10 pass(high,w10) + 5 fail(high,w10): v2 차감 5×20=100 → 0 (변별 불가)
		const seoRules = [
			...Array.from({ length: 10 }, () =>
				makeResult({
					category: "seo",
					passed: true,
					severity: "high",
					ruleWeight: 10,
				}),
			),
			...Array.from({ length: 5 }, () =>
				makeResult({
					category: "seo",
					passed: false,
					severity: "high",
					ruleWeight: 10,
				}),
			),
		];
		const input = {
			seo: makeAnalyzerResult("seo", seoRules),
			aeo: onePass("aeo"),
			geo: onePass("geo"),
		};
		const v2 = scoreDiagnosis(input, { mode: "v2" });
		const graded = scoreDiagnosis(input, { mode: "graded" });

		expect(v2.seoScore).toBe(0); // 포화 — 정상 SMB 사이트도 0
		expect(graded.seoScore).toBe(67); // 통과 가중 200 / 전체 300 = 66.7
		expect(graded.seoScore).toBeGreaterThan(v2.seoScore);
	});

	it("전부 통과 → 100, 전부 실패 → 0", () => {
		const allPass = makeAnalyzerResult("seo", [
			makeResult({ passed: true, severity: "high", ruleWeight: 10 }),
		]);
		const allFail = makeAnalyzerResult("seo", [
			makeResult({ passed: false, severity: "high", ruleWeight: 10 }),
		]);
		expect(
			scoreDiagnosis(
				{ seo: allPass, aeo: onePass("aeo"), geo: onePass("geo") },
				{ mode: "graded" },
			).seoScore,
		).toBe(100);
		expect(
			scoreDiagnosis(
				{ seo: allFail, aeo: onePass("aeo"), geo: onePass("geo") },
				{ mode: "graded" },
			).seoScore,
		).toBe(0);
	});

	it("graded scoringVersion === GRADED_SCORING_VERSION", () => {
		const out = scoreDiagnosis(
			{ seo: onePass("geo"), aeo: onePass("aeo"), geo: onePass("geo") },
			{ mode: "graded" },
		);
		expect(out.scoringVersion).toBe(GRADED_SCORING_VERSION);
	});

	it("옵션 없으면 기본 graded (2.1.0 승격)", () => {
		const out = scoreDiagnosis({
			seo: onePass("geo"),
			aeo: onePass("aeo"),
			geo: onePass("geo"),
		});
		expect(out.scoringVersion).toBe(SCORING_VERSION);
	});
});
