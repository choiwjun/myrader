/**
 * X-SAG Core Engine — PERF Analyzer
 *
 * TRD § 19.2 + POLICY § 24.4 (가중치 15%)
 * 입력: RuleContext (lighthouseResult 포함 시 전체 분석, 없으면 데이터 부족 반환)
 * 출력: AnalyzerResult { category: 'perf', results: RuleResult[] }
 *
 * POLICY § 7.1: 규칙 기반 정적 분석. AI 생성 없음.
 */

import {
	perfCls001,
	perfCls002,
	perfFcp001,
	perfFid001,
	perfInp001,
	perfLcp001,
	perfLcp002,
	perfMobile001,
	perfPerfScore001,
	perfTtfb001,
} from "./rules/perf-rules.js";
import type { AnalyzerResult, RuleContext } from "./types.js";

/** PERF 규칙 배열 (10개) — TRD § 19.2 */
export const PERF_RULES = [
	perfLcp001,
	perfLcp002,
	perfFid001,
	perfCls001,
	perfCls002,
	perfInp001,
	perfTtfb001,
	perfFcp001,
	perfPerfScore001,
	perfMobile001,
] as const;

/**
 * PERF Analyzer — Lighthouse Core Web Vitals 기반 성능 분석.
 * ctx.lighthouseResult 가 없으면 모든 룰이 데이터 부족 상태로 통과 처리된다.
 */
export function analyzePerf(ctx: RuleContext): AnalyzerResult {
	return {
		category: "perf",
		results: PERF_RULES.map((rule) => rule(ctx)),
	};
}
