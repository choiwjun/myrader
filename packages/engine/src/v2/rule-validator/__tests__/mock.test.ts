/**
 * v2/rule-validator — MockRuleSemanticValidator 단위 테스트
 *
 * 검증 시나리오:
 *   1. 깨끗한 룰 입력 → issue 0 건
 *   2. critical 이슈 사전 설정 → 결과에 포함
 *   3. 배치(5개씩) 처리에서도 입력 순서 보존
 *   4. 한 배치의 JSON parse 실패가 전체 run 을 깨뜨리지 않음
 *   5. summary 가 카운트와 일치
 *   6. 항상 isAvailable === true
 */

import { describe, expect, it } from "vitest";
import { MockRuleSemanticValidator } from "../mock-provider.js";
import type { RuleDescriptor, RuleSemanticIssue } from "../types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRule(id: string, category = "seo"): RuleDescriptor {
	return {
		ruleId: id,
		category,
		title: `${id} 제목`,
		description: `${id} 설명`,
		intent: `${id} 의도`,
		implementationHint: `${id} 구현 요약`,
	};
}

const cleanRules: RuleDescriptor[] = [
	makeRule("SEO-TITLE-001"),
	makeRule("SEO-TITLE-002"),
	makeRule("SEO-META-001"),
];

const twelveRules: RuleDescriptor[] = Array.from({ length: 12 }, (_, i) =>
	makeRule(`SEO-RULE-${String(i + 1).padStart(3, "0")}`),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MockRuleSemanticValidator — 기본 동작", () => {
	it("isAvailable() 은 항상 true", () => {
		expect(new MockRuleSemanticValidator().isAvailable()).toBe(true);
	});

	it("name 은 'mock'", () => {
		expect(new MockRuleSemanticValidator().name).toBe("mock");
	});

	it("이슈가 사전 설정되지 않은 깨끗한 룰은 issue 0 건을 반환한다", async () => {
		const v = new MockRuleSemanticValidator();
		const report = await v.validate(cleanRules);

		expect(report.totalRules).toBe(3);
		expect(report.reviewed).toBe(3);
		expect(report.issues).toEqual([]);
		expect(report.source).toBe("mock");
	});
});

describe("MockRuleSemanticValidator — preconfiguredIssues", () => {
	it("입력 룰 중 일치하는 ruleId 에 대해 사전 설정 critical 이슈를 반환한다", async () => {
		const issues: RuleSemanticIssue[] = [
			{
				ruleId: "SEO-TITLE-001",
				severity: "critical",
				issue:
					"Intent 가 SEO 친화성을 측정한다고 하지만 구현은 단순 존재 여부만 본다",
				suggestion: "키워드 적합성 검토 룰을 별도로 추가할 것",
			},
		];
		const v = new MockRuleSemanticValidator({ preconfiguredIssues: issues });
		const report = await v.validate(cleanRules);

		expect(report.issues).toHaveLength(1);
		expect(report.issues[0]?.ruleId).toBe("SEO-TITLE-001");
		expect(report.issues[0]?.severity).toBe("critical");
		expect(report.issues[0]?.suggestion).toContain("키워드");
	});

	it("입력 룰에 없는 ruleId 의 사전 이슈는 결과에 포함되지 않는다", async () => {
		const v = new MockRuleSemanticValidator({
			preconfiguredIssues: [
				{
					ruleId: "DOES-NOT-EXIST-001",
					severity: "warn",
					issue: "이건 입력에 없는 룰",
					suggestion: "무시될 것",
				},
			],
		});
		const report = await v.validate(cleanRules);
		expect(report.issues).toEqual([]);
	});
});

describe("MockRuleSemanticValidator — 배치(5개) 처리 + 순서 보존", () => {
	it("12개 룰을 batchSize=5 로 처리해도 issue 순서가 입력 순서를 따라간다", async () => {
		// 배치 0: 룰 1~5, 배치 1: 룰 6~10, 배치 2: 룰 11~12
		// 배치 2 룰부터 이슈 등록 → 입력 순서대로 정렬되면 결과도 11, 12 순.
		const issues: RuleSemanticIssue[] = [
			{
				ruleId: "SEO-RULE-012",
				severity: "info",
				issue: "12 — 배치 2 두 번째",
				suggestion: "—",
			},
			{
				ruleId: "SEO-RULE-001",
				severity: "warn",
				issue: "1 — 배치 0 첫 번째",
				suggestion: "—",
			},
			{
				ruleId: "SEO-RULE-007",
				severity: "warn",
				issue: "7 — 배치 1 두 번째",
				suggestion: "—",
			},
			{
				ruleId: "SEO-RULE-011",
				severity: "info",
				issue: "11 — 배치 2 첫 번째",
				suggestion: "—",
			},
		];

		const v = new MockRuleSemanticValidator({
			preconfiguredIssues: issues,
			batchSize: 5,
		});
		const report = await v.validate(twelveRules);

		expect(report.totalRules).toBe(12);
		expect(report.reviewed).toBe(12);
		expect(report.issues.map((i) => i.ruleId)).toEqual([
			"SEO-RULE-001",
			"SEO-RULE-007",
			"SEO-RULE-011",
			"SEO-RULE-012",
		]);
	});
});

describe("MockRuleSemanticValidator — 일부 배치 parse 실패", () => {
	it("배치 1 만 parse 실패해도 배치 0, 2 의 결과는 살아 있다", async () => {
		// 배치 0 (룰 1~5), 배치 1 (룰 6~10) ← 실패, 배치 2 (룰 11~12)
		const issues: RuleSemanticIssue[] = [
			{
				ruleId: "SEO-RULE-002",
				severity: "warn",
				issue: "배치 0 룰",
				suggestion: "—",
			},
			{
				ruleId: "SEO-RULE-008",
				severity: "critical",
				issue: "배치 1 룰 — 실패 시 무시되어야 함",
				suggestion: "—",
			},
			{
				ruleId: "SEO-RULE-011",
				severity: "info",
				issue: "배치 2 룰",
				suggestion: "—",
			},
		];

		const v = new MockRuleSemanticValidator({
			preconfiguredIssues: issues,
			batchSize: 5,
			failBatchIndices: [1],
		});
		const report = await v.validate(twelveRules);

		// 배치 1 은 미검토 (5개), 나머지 7개만 reviewed
		expect(report.totalRules).toBe(12);
		expect(report.reviewed).toBe(7);
		// 배치 1 의 이슈(SEO-RULE-008)는 누락, 배치 0/2 의 이슈만 살아남음
		expect(report.issues.map((i) => i.ruleId)).toEqual([
			"SEO-RULE-002",
			"SEO-RULE-011",
		]);
		expect(report.summary).toContain("5개 미검토");
	});

	it("모든 배치가 실패하면 reviewed=0 + issues 빈 배열", async () => {
		const v = new MockRuleSemanticValidator({
			preconfiguredIssues: [
				{
					ruleId: "SEO-RULE-001",
					severity: "critical",
					issue: "—",
					suggestion: "—",
				},
			],
			batchSize: 5,
			failBatchIndices: [0, 1, 2],
		});
		const report = await v.validate(twelveRules);
		expect(report.reviewed).toBe(0);
		expect(report.issues).toEqual([]);
	});
});

describe("MockRuleSemanticValidator — summary 텍스트", () => {
	it("이슈 카운트가 summary 에 정확히 반영된다", async () => {
		const issues: RuleSemanticIssue[] = [
			{
				ruleId: "SEO-TITLE-001",
				severity: "critical",
				issue: "c1",
				suggestion: "—",
			},
			{
				ruleId: "SEO-TITLE-002",
				severity: "warn",
				issue: "w1",
				suggestion: "—",
			},
			{
				ruleId: "SEO-META-001",
				severity: "info",
				issue: "i1",
				suggestion: "—",
			},
		];
		const v = new MockRuleSemanticValidator({ preconfiguredIssues: issues });
		const report = await v.validate(cleanRules);

		expect(report.summary).toContain("3개 룰");
		expect(report.summary).toContain("3개 검토 완료");
		expect(report.summary).toContain("이슈 3건");
		expect(report.summary).toContain("critical 1");
		expect(report.summary).toContain("warn 1");
		expect(report.summary).toContain("info 1");
	});

	it("0건 이슈일 때도 summary 가 정상 생성된다", async () => {
		const v = new MockRuleSemanticValidator();
		const report = await v.validate(cleanRules);
		expect(report.summary).toContain("이슈 0건");
		expect(report.summary).toContain("critical 0");
	});
});

describe("MockRuleSemanticValidator — 입력 0개 엣지 케이스", () => {
	it("빈 배열을 받으면 totalRules=0, reviewed=0, issues=[]", async () => {
		const v = new MockRuleSemanticValidator();
		const report = await v.validate([]);
		expect(report.totalRules).toBe(0);
		expect(report.reviewed).toBe(0);
		expect(report.issues).toEqual([]);
	});
});
