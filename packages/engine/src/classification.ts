/**
 * X-SAG Core Engine — Action Classification (MOD-CLASSIFY, TASK-CORE-008)
 *
 * TRD § 10.8: 각 룰에 사전 정의된 actionType 매핑.
 * RuleResult[] → DiagnosisItem[] (contracts schema).
 *
 * 의존성: crypto.randomUUID() (Node 22 내장, 외부 패키지 없음).
 *
 * POLICY § 7.2: aiGenerated=false (규칙 기반 항목).
 */

import type { DiagnosisItem } from "@boina/contracts/diagnosis";
import type { Priority } from "@boina/contracts/enums";
import type { RuleResult } from "./analyzers/types.js";

// ---------------------------------------------------------------------------
// Priority scoring matrix — 우선순위 재계산용
// severity × impact matrix → Priority
// ---------------------------------------------------------------------------

const SEVERITY_SCORE: Record<"high" | "medium" | "low", number> = {
	high: 3,
	medium: 2,
	low: 1,
};

const IMPACT_SCORE: Record<"high" | "medium" | "low", number> = {
	high: 3,
	medium: 2,
	low: 1,
};

/**
 * Derives Priority from severity × expectedImpact.
 *  score ≥ 6 → high, score ≥ 3 → medium, else → low
 */
function derivePriority(
	severity: "high" | "medium" | "low",
	expectedImpact: "high" | "medium" | "low",
): Priority {
	const score = SEVERITY_SCORE[severity] * IMPACT_SCORE[expectedImpact];
	if (score >= 6) return "high";
	if (score >= 3) return "medium";
	return "low";
}

/**
 * Derives impactScore (0-100) from ruleWeight × severityFactor.
 *  severityFactor: high=1.0, medium=0.6, low=0.3
 *  ruleWeight is 0-10 scale → multiply by 10 for 0-100 range.
 */
function deriveImpactScore(
	ruleWeight: number,
	severity: "high" | "medium" | "low",
): number {
	const severityFactor: Record<"high" | "medium" | "low", number> = {
		high: 1.0,
		medium: 0.6,
		low: 0.3,
	};
	const raw = ruleWeight * 10 * severityFactor[severity];
	return Math.min(100, Math.max(0, Math.round(raw)));
}

// ---------------------------------------------------------------------------
// classifyResults — RuleResult[] → DiagnosisItem[]
// ---------------------------------------------------------------------------

export interface ClassifyOptions {
	/** Generate UUID for each item. Default true. */
	generateIds?: boolean;
}

/**
 * Converts rule results into DiagnosisItem contract objects.
 * Only failed rules (passed=false) produce diagnosis items.
 *
 * @param results - Array of RuleResult from analyzers
 * @param options - Classification options
 * @returns Array of DiagnosisItem conforming to contracts schema
 */
export function classifyResults(
	results: RuleResult[],
	options: ClassifyOptions = {},
): DiagnosisItem[] {
	const { generateIds = true } = options;

	return results
		.filter((r) => !r.passed)
		.map((r): DiagnosisItem => {
			const id = generateIds
				? crypto.randomUUID()
				: "00000000-0000-0000-0000-000000000000";
			const priority = derivePriority(r.severity, r.expectedImpact);
			const impactScore = deriveImpactScore(r.ruleWeight, r.severity);

			return {
				id,
				code: r.ruleId,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				category: r.category as any,
				actionType: r.actionType,
				priority,
				title: r.title,
				description: r.description,
				evidence: {
					ruleId: r.ruleId,
					details: r.evidence,
				},
				impactScore,
				difficulty: r.difficulty,
				expectedEffect: r.recommendation,
				isAiGenerated: false,
				recommendationText: r.recommendation,
				relatedSnippetType: null,
				pageUrl: null,
				ruleVersion: "1.0.0",
			};
		});
}

// ---------------------------------------------------------------------------
// groupByActionType
// ---------------------------------------------------------------------------

export interface GroupedItems {
	self_fix: DiagnosisItem[];
	snippet_action: DiagnosisItem[];
	vendor_action: DiagnosisItem[];
	si_action: DiagnosisItem[];
}

/**
 * Groups DiagnosisItems by actionType.
 */
export function groupByActionType(items: DiagnosisItem[]): GroupedItems {
	const groups: GroupedItems = {
		self_fix: [],
		snippet_action: [],
		vendor_action: [],
		si_action: [],
	};

	for (const item of items) {
		groups[item.actionType].push(item);
	}

	return groups;
}

// ---------------------------------------------------------------------------
// getRecommendedExecutionOrder
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<Priority, number> = {
	high: 0,
	medium: 1,
	low: 2,
};

const DIFFICULTY_ORDER: Record<"easy" | "medium" | "hard", number> = {
	easy: 0,
	medium: 1,
	hard: 2,
};

/**
 * Sorts items by priority (high → low) then difficulty (easy → hard).
 * Higher priority items come first; among same priority, easier items first.
 *
 * @param items - DiagnosisItems to sort
 * @returns New sorted array (original is not mutated)
 */
export function getRecommendedExecutionOrder(
	items: DiagnosisItem[],
): DiagnosisItem[] {
	return [...items].sort((a, b) => {
		const priorityDiff =
			PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
		if (priorityDiff !== 0) return priorityDiff;

		const difficultyDiff =
			DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty];
		if (difficultyDiff !== 0) return difficultyDiff;

		// Tiebreak: higher impactScore first
		const impactDiff = b.impactScore - a.impactScore;
		if (impactDiff !== 0) return impactDiff;

		// Final tiebreak: stable, deterministic by id (closes reliance on input
		// order / Array.sort stability for fully-tied items — same input ⇒ same order).
		return a.id.localeCompare(b.id);
	});
}
