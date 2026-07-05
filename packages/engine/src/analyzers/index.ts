/**
 * X-SAG Core Engine — Analyzers Entry Point
 *
 * analyzePage() 는 SEO/AEO/GEO 세 Analyzer 를 실행하고 결과를 merge 한다.
 * Scoring Engine 은 이 결과를 입력으로 점수를 계산한다.
 *
 * Phase R-D: analyzeBacklink, analyzeA11y 추가 (informational, 점수 미포함).
 */

import { analyzeA11y } from "./a11y.js";
import { analyzeAEO } from "./aeo.js";
import { analyzeBacklink } from "./backlink.js";
import { analyzeGEO } from "./geo.js";
import { analyzeSEO } from "./seo.js";
import type { AnalyzerResult, RuleContext } from "./types.js";

export type {
	RuleContext,
	RuleResult,
	AnalyzerResult,
	Rule,
	BusinessProfile,
	Category,
} from "./types.js";

export { analyzeSEO } from "./seo.js";
export { analyzeAEO } from "./aeo.js";
export { analyzeGEO } from "./geo.js";
export { analyzeBacklink, BACKLINK_RULES } from "./backlink.js";
export { analyzeA11y, A11Y_RULES } from "./a11y.js";

export {
	SEO_RULES,
	AEO_RULES,
	GEO_RULES,
} from "./rules/index.js";

// ---------------------------------------------------------------------------
// analyzePage — 세 카테고리 통합 분석
// ---------------------------------------------------------------------------

export interface PageAnalysisResult {
	seo: AnalyzerResult;
	aeo: AnalyzerResult;
	geo: AnalyzerResult;
}

/**
 * 단일 호출로 SEO / AEO / GEO 를 모두 실행한다.
 *
 * @param ctx - 분석 컨텍스트 (pages, mainPage, businessProfile)
 * @returns SEO, AEO, GEO 각 AnalyzerResult
 */
export function analyzePage(ctx: RuleContext): PageAnalysisResult {
	return {
		seo: analyzeSEO(ctx),
		aeo: analyzeAEO(ctx),
		geo: analyzeGEO(ctx),
	};
}

// ---------------------------------------------------------------------------
// analyzePageFull — 모든 카테고리 (SEO/AEO/GEO + Backlink/A11Y) 분석
// ---------------------------------------------------------------------------

export interface FullPageAnalysisResult extends PageAnalysisResult {
	backlink: AnalyzerResult;
	a11y: AnalyzerResult;
}

/**
 * Phase R-D: SEO/AEO/GEO + Backlink + A11Y 까지 모두 실행.
 *
 * backlink/a11y 는 점수에 포함되지 않는 informational 카테고리이다.
 */
export function analyzePageFull(ctx: RuleContext): FullPageAnalysisResult {
	return {
		seo: analyzeSEO(ctx),
		aeo: analyzeAEO(ctx),
		geo: analyzeGEO(ctx),
		backlink: analyzeBacklink(ctx),
		a11y: analyzeA11y(ctx),
	};
}
