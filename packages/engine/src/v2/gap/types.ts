/**
 * X-SAG Core Engine v2 — Gap Analysis Types
 *
 * TRD § 19.2.5 GapAnalyzer 타입 정의.
 */

// ---------------------------------------------------------------------------
// Score Snapshot — 카테고리별 점수 스냅샷
// ---------------------------------------------------------------------------

export interface ScoreSnapshot {
	seo: number;
	aeo: number;
	geo: number;
	perf: number;
	overall: number;
}

// ---------------------------------------------------------------------------
// CompetitorReport — Gap 분석에 사용되는 경쟁사 리포트 요약
// ---------------------------------------------------------------------------

export interface CompetitorReport {
	competitorUrl: string;
	competitorName?: string;
	serpRank?: number;
	seoScore?: number;
	aeoScore?: number;
	geoScore?: number;
	perfScore?: number;
	overallScore?: number;
	diagnosisItems: CompetitorDiagnosisItem[];
	isAnonymized?: boolean;
}

export interface CompetitorDiagnosisItem {
	ruleId: string;
	category: "seo" | "aeo" | "geo" | "perf";
	passed: boolean;
}

// ---------------------------------------------------------------------------
// DiagnosisJson — 자기 진단 결과 요약 (Gap 분석 입력)
// ---------------------------------------------------------------------------

export interface DiagnosisJson {
	reportId: string;
	websiteUrl: string;
	diagnosisItems: DiagnosisJsonItem[];
	seoScore?: number;
	aeoScore?: number;
	geoScore?: number;
	perfScore?: number;
	overallScore?: number;
}

export interface DiagnosisJsonItem {
	ruleId: string;
	category: "seo" | "aeo" | "geo" | "perf";
	passed: boolean;
	actionType: ActionType;
	priority: Priority;
}

// ---------------------------------------------------------------------------
// Action / Priority Enums
// ---------------------------------------------------------------------------

export type ActionType =
	| "self_fix"
	| "snippet_action"
	| "vendor_action"
	| "si_action";

export type Priority = "high" | "medium" | "low";

// ---------------------------------------------------------------------------
// GapAnalyzer I/O — TRD § 19.2.5
// ---------------------------------------------------------------------------

export interface GapInput {
	selfReport: DiagnosisJson;
	competitors: CompetitorReport[];
}

export interface GapResult {
	matrix: GapMatrixRow[];
	priorities: PriorityGap[];
	selfStrengths: string[];
	marketAverage: ScoreSnapshot;
}

export interface GapMatrixRow {
	ruleId: string;
	category: "seo" | "aeo" | "geo" | "perf";
	selfPassed: boolean;
	competitorPassedCount: number;
	competitorTotal: number;
	selfScore?: number;
	competitorAvg?: number;
	top1Score?: number;
	/** 음수 = 자기 우위, 양수 = 경쟁사 우위 */
	gap: number;
	actionType: ActionType;
	priority: Priority;
}

export interface PriorityGap {
	rank: 1 | 2 | 3 | 4 | 5;
	ruleId: string;
	reason: string;
	actionType: ActionType;
	expectedImpact: "low" | "medium" | "high";
}

// ---------------------------------------------------------------------------
// Formatter types
// ---------------------------------------------------------------------------

export interface GroupedGapMatrix {
	self_fix: GapMatrixRow[];
	snippet_action: GapMatrixRow[];
	vendor_action: GapMatrixRow[];
	si_action: GapMatrixRow[];
}

export interface CategoryGroupedMatrix {
	seo: GapMatrixRow[];
	aeo: GapMatrixRow[];
	geo: GapMatrixRow[];
	perf: GapMatrixRow[];
}
