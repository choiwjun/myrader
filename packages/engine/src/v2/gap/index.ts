/**
 * X-SAG Core Engine v2 — Gap Analysis 공개 API
 *
 * TRD § 19.2.5 GapAnalyzer.
 */

export { GapAnalyzer } from "./analyzer.js";

export {
	groupByActionType,
	groupByCategory,
	filterCompetitorAdvantage,
	filterSelfStrength,
	filterByPriority,
	computeSummaryStats,
} from "./formatter.js";

export type {
	ActionType,
	CategoryGroupedMatrix,
	CompetitorDiagnosisItem,
	CompetitorReport,
	DiagnosisJson,
	DiagnosisJsonItem,
	GapInput,
	GapMatrixRow,
	GapResult,
	GroupedGapMatrix,
	Priority,
	PriorityGap,
	ScoreSnapshot,
} from "./types.js";

export type { GapSummaryStats } from "./formatter.js";
