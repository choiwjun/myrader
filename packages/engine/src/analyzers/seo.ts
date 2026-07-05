/**
 * X-SAG Core Engine — SEO Analyzer
 *
 * TASK-CORE-003
 * 입력: RuleContext (pages[], mainPage, businessProfile)
 * 출력: AnalyzerResult { category: 'seo', results: RuleResult[] }
 *
 * POLICY § 7.1: 규칙 기반 정적 분석. AI 생성 없음.
 */

import { SEO_RULES } from "./rules/index.js";
import type { AnalyzerResult, RuleContext } from "./types.js";

/**
 * SEO Analyzer — mainPage 우선, 전체 pages 는 sitemap/링크 검사에 활용.
 */
export function analyzeSEO(ctx: RuleContext): AnalyzerResult {
	return {
		category: "seo",
		results: SEO_RULES.map((rule) => rule(ctx)),
	};
}
