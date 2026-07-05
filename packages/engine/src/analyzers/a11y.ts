/**
 * X-SAG Core Engine — A11Y Analyzer
 *
 * Phase R-D: WCAG 2.1 AA 기반 접근성 룰 (informational, 점수 미포함).
 * 입력: RuleContext (a11yResult 있으면 평가, 없으면 informational)
 * 출력: AnalyzerResult { category: 'a11y', results: RuleResult[] }
 *
 * POLICY § 7.1: 규칙 기반 정적 분석. AI 생성 없음.
 */

import {
	a11yAriaValid001,
	a11yAutoplay001,
	a11yButtonName001,
	a11yColorContrast001,
	a11yDocLang001,
	a11yDocTitle001,
	a11yFocusOrder001,
	a11yFocusVisible001,
	a11yFormLabel001,
	a11yHeadingOrder001,
	a11yImageAlt001,
	a11yLandmark001,
	a11yLinkName001,
	a11yList001,
	a11yTabindex001,
} from "./rules/a11y-rules.js";
import type { AnalyzerResult, RuleContext } from "./types.js";

/** A11Y 규칙 배열 (15개) — Phase R-D */
export const A11Y_RULES = [
	a11yColorContrast001,
	a11yImageAlt001,
	a11yFormLabel001,
	a11yButtonName001,
	a11yLinkName001,
	a11yDocLang001,
	a11yDocTitle001,
	a11yHeadingOrder001,
	a11yLandmark001,
	a11yFocusVisible001,
	a11yAriaValid001,
	a11yList001,
	a11yTabindex001,
	a11yAutoplay001,
	a11yFocusOrder001,
] as const;

/**
 * A11Y Analyzer — WCAG 2.1 AA 기반 접근성 점검.
 * ctx.a11yResult 가 없으면 모든 룰이 informational 로 통과 처리된다.
 */
export function analyzeA11y(ctx: RuleContext): AnalyzerResult {
	return {
		category: "a11y",
		results: A11Y_RULES.map((rule) => rule(ctx)),
	};
}
