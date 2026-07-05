/**
 * X-SAG Core Engine — Classification 단위 테스트 (TASK-CORE-008)
 *
 * 5 케이스:
 * 1. 4가지 actionType 그룹화 (groupByActionType)
 * 2. 우선순위 정렬 (getRecommendedExecutionOrder): priority high→low, difficulty easy→hard
 * 3. ID 생성 (generateIds=true → valid UUID, generateIds=false → placeholder)
 * 4. 빈 입력 → 빈 배열
 * 5. passed=true 항목은 제외 (only failed rules produce items)
 */

import { describe, expect, it } from "vitest";
import type { RuleResult } from "../analyzers/types.js";
import {
	classifyResults,
	getRecommendedExecutionOrder,
	groupByActionType,
} from "../classification.js";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<RuleResult>): RuleResult {
	return {
		ruleId: "SEO-TEST-001",
		category: "seo",
		passed: false,
		severity: "medium",
		title: "Test Rule",
		description: "Test description",
		evidence: [],
		recommendation: "Fix this issue",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 5,
		...overrides,
	};
}

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Test Case 1: 4가지 actionType 그룹화
// ---------------------------------------------------------------------------

describe("Case 1: groupByActionType — 4가지 actionType 그룹화", () => {
	it("각 actionType별로 올바르게 분류된다", () => {
		const rules: RuleResult[] = [
			makeRule({ ruleId: "A", actionType: "self_fix", passed: false }),
			makeRule({ ruleId: "B", actionType: "self_fix", passed: false }),
			makeRule({ ruleId: "C", actionType: "snippet_action", passed: false }),
			makeRule({ ruleId: "D", actionType: "vendor_action", passed: false }),
			makeRule({ ruleId: "E", actionType: "si_action", passed: false }),
		];

		const items = classifyResults(rules);
		const groups = groupByActionType(items);

		expect(groups.self_fix).toHaveLength(2);
		expect(groups.snippet_action).toHaveLength(1);
		expect(groups.vendor_action).toHaveLength(1);
		expect(groups.si_action).toHaveLength(1);
	});

	it("모든 항목이 self_fix이면 나머지 그룹은 빈 배열", () => {
		const rules: RuleResult[] = [
			makeRule({ ruleId: "A", actionType: "self_fix" }),
			makeRule({ ruleId: "B", actionType: "self_fix" }),
		];

		const groups = groupByActionType(classifyResults(rules));

		expect(groups.self_fix).toHaveLength(2);
		expect(groups.snippet_action).toHaveLength(0);
		expect(groups.vendor_action).toHaveLength(0);
		expect(groups.si_action).toHaveLength(0);
	});

	it("actionType이 DiagnosisItem에 올바르게 매핑된다", () => {
		const rules: RuleResult[] = [
			makeRule({ ruleId: "X", actionType: "vendor_action" }),
		];
		const items = classifyResults(rules);
		expect(items[0].actionType).toBe("vendor_action");
	});
});

// ---------------------------------------------------------------------------
// Test Case 2: 우선순위 정렬
// ---------------------------------------------------------------------------

describe("Case 2: getRecommendedExecutionOrder — 우선순위×난이도 정렬", () => {
	it("priority: high → medium → low 순서", () => {
		const rules: RuleResult[] = [
			makeRule({ ruleId: "LOW", severity: "low", expectedImpact: "low" }),
			makeRule({ ruleId: "HIGH", severity: "high", expectedImpact: "high" }),
			makeRule({ ruleId: "MED", severity: "medium", expectedImpact: "medium" }),
		];

		const items = getRecommendedExecutionOrder(classifyResults(rules));

		expect(items[0].priority).toBe("high");
		expect(items[1].priority).toBe("medium");
		expect(items[2].priority).toBe("low");
	});

	it("같은 priority이면 difficulty: easy → medium → hard 순서", () => {
		const rules: RuleResult[] = [
			makeRule({
				ruleId: "HARD",
				severity: "high",
				expectedImpact: "high",
				difficulty: "hard",
			}),
			makeRule({
				ruleId: "EASY",
				severity: "high",
				expectedImpact: "high",
				difficulty: "easy",
			}),
			makeRule({
				ruleId: "MED",
				severity: "high",
				expectedImpact: "high",
				difficulty: "medium",
			}),
		];

		const items = getRecommendedExecutionOrder(classifyResults(rules));

		expect(items[0].difficulty).toBe("easy");
		expect(items[1].difficulty).toBe("medium");
		expect(items[2].difficulty).toBe("hard");
	});

	it("원본 배열을 변경하지 않는다 (immutable sort)", () => {
		const rules = [
			makeRule({ ruleId: "A", severity: "low", expectedImpact: "low" }),
			makeRule({ ruleId: "B", severity: "high", expectedImpact: "high" }),
		];
		const items = classifyResults(rules);
		const original = [...items];

		getRecommendedExecutionOrder(items);

		expect(items[0].code).toBe(original[0].code);
	});
});

// ---------------------------------------------------------------------------
// Test Case 3: ID 생성
// ---------------------------------------------------------------------------

describe("Case 3: ID 생성", () => {
	it("generateIds=true (기본값) → 유효한 UUID 생성", () => {
		const rules = [makeRule({ ruleId: "ID-TEST-001" })];
		const items = classifyResults(rules);

		expect(items[0].id).toMatch(UUID_REGEX);
	});

	it("각 항목마다 고유한 UUID가 생성된다", () => {
		const rules = [
			makeRule({ ruleId: "A" }),
			makeRule({ ruleId: "B" }),
			makeRule({ ruleId: "C" }),
		];
		const items = classifyResults(rules);
		const ids = items.map((i) => i.id);
		const uniqueIds = new Set(ids);

		expect(uniqueIds.size).toBe(3);
	});

	it("generateIds=false → placeholder ID", () => {
		const rules = [makeRule({ ruleId: "NOID-001" })];
		const items = classifyResults(rules, { generateIds: false });

		expect(items[0].id).toBe("00000000-0000-0000-0000-000000000000");
	});

	it("code 필드는 ruleId와 동일하다", () => {
		const rules = [makeRule({ ruleId: "SEO-TITLE-001" })];
		const items = classifyResults(rules);

		expect(items[0].code).toBe("SEO-TITLE-001");
	});
});

// ---------------------------------------------------------------------------
// Test Case 4: 빈 입력
// ---------------------------------------------------------------------------

describe("Case 4: 빈 입력", () => {
	it("빈 배열 입력 → 빈 배열 반환", () => {
		const items = classifyResults([]);
		expect(items).toHaveLength(0);
		expect(Array.isArray(items)).toBe(true);
	});

	it("groupByActionType(빈 배열) → 모든 그룹이 빈 배열", () => {
		const groups = groupByActionType([]);
		expect(groups.self_fix).toHaveLength(0);
		expect(groups.snippet_action).toHaveLength(0);
		expect(groups.vendor_action).toHaveLength(0);
		expect(groups.si_action).toHaveLength(0);
	});

	it("getRecommendedExecutionOrder(빈 배열) → 빈 배열", () => {
		const ordered = getRecommendedExecutionOrder([]);
		expect(ordered).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Test Case 5: passed=true 항목 제외
// ---------------------------------------------------------------------------

describe("Case 5: passed=true 항목은 DiagnosisItem에서 제외", () => {
	it("passed=true인 규칙은 결과에 포함되지 않는다", () => {
		const rules: RuleResult[] = [
			makeRule({ ruleId: "PASS-A", passed: true }),
			makeRule({ ruleId: "FAIL-B", passed: false }),
			makeRule({ ruleId: "PASS-C", passed: true }),
		];

		const items = classifyResults(rules);

		expect(items).toHaveLength(1);
		expect(items[0].code).toBe("FAIL-B");
	});

	it("모두 통과하면 빈 배열", () => {
		const rules = [
			makeRule({ ruleId: "A", passed: true }),
			makeRule({ ruleId: "B", passed: true }),
		];
		const items = classifyResults(rules);
		expect(items).toHaveLength(0);
	});

	it("isAiGenerated는 항상 false (규칙 기반)", () => {
		const rules = [makeRule({ ruleId: "RULE-001", passed: false })];
		const items = classifyResults(rules);
		expect(items[0].isAiGenerated).toBe(false);
	});
});
