/**
 * X-SAG Core Engine v2 — Gap Matrix Formatter
 *
 * GapMatrixRow 배열을 actionType 또는 category 별로 그룹화하는 헬퍼.
 */

import type {
	ActionType,
	CategoryGroupedMatrix,
	GapMatrixRow,
	GroupedGapMatrix,
	Priority,
} from "./types.js";

// ---------------------------------------------------------------------------
// actionType별 그룹화
// ---------------------------------------------------------------------------

/**
 * GapMatrixRow 배열을 actionType 별로 그룹화한다.
 * 각 그룹은 gap 내림차순으로 정렬된다.
 */
export function groupByActionType(rows: GapMatrixRow[]): GroupedGapMatrix {
	const result: GroupedGapMatrix = {
		self_fix: [],
		snippet_action: [],
		vendor_action: [],
		si_action: [],
	};

	for (const row of rows) {
		result[row.actionType].push(row);
	}

	// 각 그룹 내부도 gap 내림차순
	for (const key of Object.keys(result) as ActionType[]) {
		result[key].sort((a, b) => b.gap - a.gap);
	}

	return result;
}

// ---------------------------------------------------------------------------
// category별 그룹화
// ---------------------------------------------------------------------------

/**
 * GapMatrixRow 배열을 category 별로 그룹화한다.
 */
export function groupByCategory(rows: GapMatrixRow[]): CategoryGroupedMatrix {
	const result: CategoryGroupedMatrix = {
		seo: [],
		aeo: [],
		geo: [],
		perf: [],
	};

	for (const row of rows) {
		result[row.category].push(row);
	}

	return result;
}

// ---------------------------------------------------------------------------
// 필터 헬퍼
// ---------------------------------------------------------------------------

/**
 * gap > 0 (경쟁사 우위) 항목만 반환.
 */
export function filterCompetitorAdvantage(
	rows: GapMatrixRow[],
): GapMatrixRow[] {
	return rows.filter((r) => r.gap > 0);
}

/**
 * gap < 0 (자기 우위) 항목만 반환.
 */
export function filterSelfStrength(rows: GapMatrixRow[]): GapMatrixRow[] {
	return rows.filter((r) => r.gap < 0);
}

/**
 * priority 필터.
 */
export function filterByPriority(
	rows: GapMatrixRow[],
	priority: Priority,
): GapMatrixRow[] {
	return rows.filter((r) => r.priority === priority);
}

// ---------------------------------------------------------------------------
// 요약 통계
// ---------------------------------------------------------------------------

export interface GapSummaryStats {
	totalRules: number;
	competitorAdvantageCount: number;
	selfStrengthCount: number;
	parityCount: number;
	avgGap: number;
}

/**
 * 갭 매트릭스 요약 통계를 반환한다.
 */
export function computeSummaryStats(rows: GapMatrixRow[]): GapSummaryStats {
	const n = rows.length;
	if (n === 0) {
		return {
			totalRules: 0,
			competitorAdvantageCount: 0,
			selfStrengthCount: 0,
			parityCount: 0,
			avgGap: 0,
		};
	}

	let competitorAdvantageCount = 0;
	let selfStrengthCount = 0;
	let parityCount = 0;
	let gapSum = 0;

	for (const row of rows) {
		if (row.gap > 0) competitorAdvantageCount++;
		else if (row.gap < 0) selfStrengthCount++;
		else parityCount++;
		gapSum += row.gap;
	}

	return {
		totalRules: n,
		competitorAdvantageCount,
		selfStrengthCount,
		parityCount,
		avgGap: gapSum / n,
	};
}
