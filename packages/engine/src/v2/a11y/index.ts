/**
 * X-SAG Core Engine — v2/a11y barrel export
 *
 * Phase R-D: 접근성(WCAG 2.1 AA) 자동 검사 어댑터.
 */

export type {
	A11yImpact,
	A11yInput,
	A11yProvider,
	A11yResult,
	A11ySource,
	A11yViolation,
} from "./types.js";

export { A11yAnalyzerChain, createA11yAnalyzer } from "./analyzer.js";
export { CheerioStaticA11yProvider } from "./providers/cheerio-static.js";
export { AxeCoreA11yProvider } from "./providers/axe-core.js";
export { MockA11yProvider } from "./providers/mock.js";
