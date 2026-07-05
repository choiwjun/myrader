/**
 * X-SAG Core Engine — A11Y Analyzer Types
 *
 * Phase R-D: 접근성(WCAG 2.1 AA) 자동 검사.
 *
 * 목적:
 * - axe-core 호환 형식의 violation 결과를 룰 평가에 활용.
 * - axe-core 사용 가능 시 → AxeCoreA11yProvider.
 * - 미사용 시 → CheerioStaticA11yProvider (cheerio 기반 정적 패턴 매칭).
 *
 * A11yResult 는 RuleContext.a11yResult 로 주입되어 a11y-rules 15개에서 사용.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface A11yInput {
	/** 분석 대상 HTML (string) */
	html: string;
	/** 페이지 URL (axe-core 의 referrer/document.URL 설정용) */
	url: string;
}

// ---------------------------------------------------------------------------
// Violation
// ---------------------------------------------------------------------------

export type A11yImpact = "minor" | "moderate" | "serious" | "critical";

export interface A11yViolation {
	/** axe-core rule id (예: "color-contrast", "image-alt") */
	ruleId: string;
	/** 심각도 */
	impact: A11yImpact;
	/** 짧은 설명 */
	description: string;
	/** axe-core help URL */
	helpUrl: string;
	/** 영향받은 노드 수 */
	affectedNodes: number;
	/** WCAG 태그 — ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", ...] */
	wcagTags: string[];
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type A11ySource = "axe-core" | "cheerio-static" | "mock";

export interface A11yResult {
	/** 위반 목록 */
	violations: A11yViolation[];
	/** 통과한 룰 수 */
	passes: number;
	/** 평가 불가(incomplete) 룰 수 */
	incomplete: number;
	/** 적용 불가(inapplicable) 룰 수 */
	inapplicable: number;
	/** 총 평가 룰 수 (passes + violations + incomplete + inapplicable) */
	totalRules: number;
	/** WCAG 2.1 AA 준수율 (0~1). passes / (passes + AA-tagged violations). */
	wcag21AaCompliance: number;
	/** 데이터 출처 */
	source: A11ySource;
	/** ISO 8601 측정 시각 */
	measuredAt: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface A11yProvider {
	readonly name: A11ySource;
	isAvailable(): boolean;
	analyze(input: A11yInput): Promise<A11yResult>;
}
