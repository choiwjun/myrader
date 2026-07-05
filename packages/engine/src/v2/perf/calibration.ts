/**
 * X-SAG Core Engine — PERF 룰 임계값 보정 로직
 *
 * 실 측정 데이터를 기반으로 PERF 룰의 임계값이 적절한지 검증:
 * - pass rate가 너무 높으면(>95%) → 임계값 너무 관대 (raise 권고)
 * - pass rate가 너무 낮으면(<10%) → 임계값 너무 엄격 (lower 권고)
 * - 10% ≤ pass rate ≤ 95% → keep (적절함)
 */

import type { LighthouseResult } from "./types.js";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export interface CalibrationSample {
	/** 측정한 URL */
	url: string;
	/** 카테고리 (cafe, restaurant, 등) */
	category: string;
	/** Lighthouse 측정 결과 */
	lighthouseResult: LighthouseResult;
}

export interface RuleCalibrationReport {
	/** PERF 규칙 ID (예: PERF-LCP-001) */
	ruleId: string;
	/** 현재 임계값 */
	threshold: number | string;
	/** 측정 데이터 중 통과한 비율 (0~1) */
	passRate: number;
	/** 측정값 중간값 */
	median: number;
	/** 90 백분위수 */
	p90: number;
	/** 95 백분위수 */
	p95: number;
	/** 권고사항: "keep" (현재 유지), "raise" (더 엄격), "lower" (더 관대) */
	recommendation: "keep" | "raise" | "lower";
	/** 권고 사유 */
	reason: string;
}

// ---------------------------------------------------------------------------
// 평가 함수 모음
// ---------------------------------------------------------------------------

/**
 * PERF-LCP-001: LCP < 2500ms 통과 여부
 */
function evaluatePerfLcp001(sample: CalibrationSample): boolean {
	return sample.lighthouseResult.lcp <= 2500;
}

/**
 * PERF-LCP-002: LCP < 4000ms 통과 여부
 */
function evaluatePerfLcp002(sample: CalibrationSample): boolean {
	return sample.lighthouseResult.lcp <= 4000;
}

/**
 * PERF-FID-001: FID < 100ms 통과 여부
 */
function evaluatePerfFid001(sample: CalibrationSample): boolean {
	return sample.lighthouseResult.fid < 100;
}

/**
 * PERF-CLS-001: CLS <= 0.1 통과 여부
 */
function evaluatePerfCls001(sample: CalibrationSample): boolean {
	return sample.lighthouseResult.cls <= 0.1;
}

/**
 * PERF-CLS-002: CLS <= 0.25 통과 여부
 */
function evaluatePerfCls002(sample: CalibrationSample): boolean {
	return sample.lighthouseResult.cls <= 0.25;
}

/**
 * PERF-INP-001: INP < 200ms 통과 여부
 */
function evaluatePerfInp001(sample: CalibrationSample): boolean {
	if (sample.lighthouseResult.inp === undefined) return true;
	return sample.lighthouseResult.inp < 200;
}

/**
 * PERF-TTFB-001: TTFB < 800ms 통과 여부
 */
function evaluatePerfTtfb001(sample: CalibrationSample): boolean {
	return sample.lighthouseResult.ttfb < 800;
}

/**
 * PERF-FCP-001: FCP <= 1800ms 통과 여부
 */
function evaluatePerfFcp001(sample: CalibrationSample): boolean {
	return sample.lighthouseResult.fcp <= 1800;
}

/**
 * PERF-PERF-SCORE-001: Performance 점수 >= 70 통과 여부
 */
function evaluatePerfPerfScore001(sample: CalibrationSample): boolean {
	return sample.lighthouseResult.performance >= 70;
}

/**
 * PERF-MOBILE-001: 모바일 성능 점수 >= 50 통과 여부
 */
function evaluatePerfMobile001(sample: CalibrationSample): boolean {
	const isMobile = sample.lighthouseResult.strategy === "mobile";
	const score = sample.lighthouseResult.performance;
	return !isMobile || score >= 50;
}

// ---------------------------------------------------------------------------
// 통계 계산 헬퍼
// ---------------------------------------------------------------------------

/**
 * 데이터 배열에서 중간값 계산
 */
function calculateMedian(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1]! + sorted[mid]!) / 2
		: sorted[mid]!;
}

/**
 * 백분위수 계산
 */
function calculatePercentile(values: number[], percentile: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((percentile / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)]!;
}

// ---------------------------------------------------------------------------
// 메인 보정 함수
// ---------------------------------------------------------------------------

/**
 * 모든 PERF 규칙의 임계값을 보정 샘플 기준으로 평가한다.
 *
 * @param samples CalibrationSample[] — 실 측정 데이터
 * @returns RuleCalibrationReport[] — 각 규칙별 보정 권고
 */
export function calibrateRules(
	samples: CalibrationSample[],
): RuleCalibrationReport[] {
	if (samples.length === 0) {
		return [];
	}

	const rules: Array<{
		ruleId: string;
		threshold: number | string;
		evaluate: (sample: CalibrationSample) => boolean;
		metric: (sample: CalibrationSample) => number;
	}> = [
		{
			ruleId: "PERF-LCP-001",
			threshold: "2500ms",
			evaluate: evaluatePerfLcp001,
			metric: (s) => s.lighthouseResult.lcp,
		},
		{
			ruleId: "PERF-LCP-002",
			threshold: "4000ms",
			evaluate: evaluatePerfLcp002,
			metric: (s) => s.lighthouseResult.lcp,
		},
		{
			ruleId: "PERF-FID-001",
			threshold: "100ms",
			evaluate: evaluatePerfFid001,
			metric: (s) => s.lighthouseResult.fid,
		},
		{
			ruleId: "PERF-CLS-001",
			threshold: "0.1",
			evaluate: evaluatePerfCls001,
			metric: (s) => s.lighthouseResult.cls,
		},
		{
			ruleId: "PERF-CLS-002",
			threshold: "0.25",
			evaluate: evaluatePerfCls002,
			metric: (s) => s.lighthouseResult.cls,
		},
		{
			ruleId: "PERF-INP-001",
			threshold: "200ms",
			evaluate: evaluatePerfInp001,
			metric: (s) => s.lighthouseResult.inp ?? 0,
		},
		{
			ruleId: "PERF-TTFB-001",
			threshold: "800ms",
			evaluate: evaluatePerfTtfb001,
			metric: (s) => s.lighthouseResult.ttfb,
		},
		{
			ruleId: "PERF-FCP-001",
			threshold: "1800ms",
			evaluate: evaluatePerfFcp001,
			metric: (s) => s.lighthouseResult.fcp,
		},
		{
			ruleId: "PERF-PERF-SCORE-001",
			threshold: "70",
			evaluate: evaluatePerfPerfScore001,
			metric: (s) => s.lighthouseResult.performance,
		},
		{
			ruleId: "PERF-MOBILE-001",
			threshold: "50",
			evaluate: evaluatePerfMobile001,
			metric: (s) => s.lighthouseResult.performance,
		},
	];

	const reports: RuleCalibrationReport[] = [];

	for (const rule of rules) {
		const results = samples.map(rule.evaluate);
		const passCount = results.filter(Boolean).length;
		const passRate = passCount / samples.length;

		// 메트릭 값 수집 (NaN, undefined 제외)
		const values = samples
			.map(rule.metric)
			.filter((v) => typeof v === "number" && !Number.isNaN(v));

		const median = calculateMedian(values);
		const p90 = calculatePercentile(values, 90);
		const p95 = calculatePercentile(values, 95);

		// 권고 로직
		let recommendation: "keep" | "raise" | "lower" = "keep";
		let reason = `Pass rate: ${(passRate * 100).toFixed(1)}% (good)`;

		if (passRate > 0.95) {
			recommendation = "raise";
			reason = `Pass rate: ${(passRate * 100).toFixed(1)}% (too permissive, consider stricter threshold)`;
		} else if (passRate < 0.1) {
			recommendation = "lower";
			reason = `Pass rate: ${(passRate * 100).toFixed(1)}% (too strict, consider more lenient threshold)`;
		}

		reports.push({
			ruleId: rule.ruleId,
			threshold: rule.threshold,
			passRate,
			median,
			p90,
			p95,
			recommendation,
			reason,
		});
	}

	return reports;
}

/**
 * 보정 보고서를 사람이 읽기 좋은 마크다운 형식으로 출력
 */
export function formatCalibrationReport(
	reports: RuleCalibrationReport[],
): string {
	const lines: string[] = [
		"# PERF 규칙 보정 보고서",
		"",
		`생성 시각: ${new Date().toISOString()}`,
		`총 규칙 수: ${reports.length}`,
		"",
		"## 요약",
		"",
	];

	const keepCount = reports.filter((r) => r.recommendation === "keep").length;
	const raiseCount = reports.filter((r) => r.recommendation === "raise").length;
	const lowerCount = reports.filter((r) => r.recommendation === "lower").length;

	lines.push(`- Keep: ${keepCount} 규칙`);
	lines.push(`- Raise (임계값 강화): ${raiseCount} 규칙`);
	lines.push(`- Lower (임계값 완화): ${lowerCount} 규칙`);
	lines.push("");
	lines.push("## 규칙별 상세");
	lines.push("");

	for (const report of reports) {
		const icon = {
			keep: "✅",
			raise: "⬆️",
			lower: "⬇️",
		}[report.recommendation];

		lines.push(`### ${icon} ${report.ruleId}`);
		lines.push(`- **현재 임계값**: ${report.threshold}`);
		lines.push(`- **Pass Rate**: ${(report.passRate * 100).toFixed(1)}%`);
		lines.push(`- **Median**: ${report.median.toFixed(2)}`);
		lines.push(`- **P90**: ${report.p90.toFixed(2)}`);
		lines.push(`- **P95**: ${report.p95.toFixed(2)}`);
		lines.push(`- **권고**: ${report.recommendation.toUpperCase()}`);
		lines.push(`- **사유**: ${report.reason}`);
		lines.push("");
	}

	return lines.join("\n");
}
