/**
 * @boina/engine — Public API (barrel export)
 *
 * x-sag core-engine 복사 후 독립 패키지화 (OQ-6). 엔진은 순수·재사용 레이어이며
 * 상위(앱·UI)를 모른다. 모든 입출력은 @boina/contracts 타입 경계를 통과한다 (07 §2).
 * 엔진 내부 구현은 이 배럴 경계 뒤에 둔다 — 앱은 엔진 내부 파일을 직접 의존하지 않는다.
 * 점수는 엔진 내부 신호이며 UI 노출은 전달 레이어에서 신호등으로 변환한다 (07 §4).
 *
 * 모든 모듈을 여기서 re-export 한다.
 */

import { CONTRACTS_PACKAGE } from "@boina/contracts";

// Types
export type {
	CrawlOptions,
	CrawlResult,
	ParsedPage,
	CrawlFailureReason,
} from "./types.js";
export {
	DEFAULT_CRAWL_OPTIONS,
	MAX_PAGES_BY_PLAN,
	getMaxPagesForPlan,
} from "./types.js";

// Crawler
export { crawlSite } from "./crawler.js";

// Parser
export { parseHtml } from "./parser.js";

// Sitemap (BACKLOG-G P3)
export { fetchSitemap, parseSitemapXml } from "./sitemap.js";
export type { SitemapResult, SitemapUrl } from "./sitemap.js";

// URL utilities
export {
	normalizeUrl,
	isSameDomain,
	isPrivateIp,
	validatePublicUrl,
} from "./utils/url.js";
export type { UrlValidationResult } from "./utils/url.js";

// Robots utilities
export { fetchRobots } from "./utils/robots.js";
export type { RobotsRules } from "./utils/robots.js";

// Analyzers
export {
	analyzePage,
	analyzeSEO,
	analyzeAEO,
	analyzeGEO,
} from "./analyzers/index.js";
export type {
	RuleContext,
	RuleResult,
	AnalyzerResult,
	Rule,
	BusinessProfile,
} from "./analyzers/index.js";

// Scoring (TASK-CORE-006)
export {
	scoreDiagnosis,
	scoreToGrade,
	scoreToHealthBand,
	SCORING_VERSION,
} from "./scoring.js";
export type { ScoringInput, ScoringOutput } from "./scoring.js";

// Classification (TASK-CORE-008)
export {
	classifyResults,
	groupByActionType,
	getRecommendedExecutionOrder,
} from "./classification.js";
export type { ClassifyOptions, GroupedItems } from "./classification.js";

// Recommendation (TASK-CORE-007)
export {
	RecommendationEngine,
	RuleBasedProvider,
	OpenAIProvider,
	GeminiProvider,
	AnthropicProvider,
} from "./recommendation/index.js";
export type {
	RecommendationInput,
	RecommendationOutput,
	RecommendationProvider,
	RecommendationEngineOptions,
	BusinessContext,
} from "./recommendation/index.js";

// Pipeline (통합)
export { runDiagnosisPipeline } from "./pipeline.js";
export type {
	DiagnosisPipelineInput,
	DiagnosisPipelineOutput,
} from "./pipeline.js";
// GAP 3: per-stage timeout budgets
export {
	DEFAULT_STAGE_TIMEOUTS,
	StageTimeoutError,
	withStageTimeout,
} from "./pipeline-stage-timeout.js";
export type { StageTimeoutBudgets } from "./pipeline-stage-timeout.js";

// Platform presence
export {
	PLATFORM_SOURCE_LABELS,
	adaptPlatformHtml,
	applyPlatformRuleScope,
	businessPresenceToCrawlResult,
	fetchPlatformPresence,
	getPlatformRuleScope,
} from "./platform-presence/index.js";
export type {
	AdaptPlatformHtmlInput,
	BusinessPresence,
	BusinessPresenceSignals,
	FetchPlatformPresenceInput,
	FetchPlatformPresenceResult,
	PlatformImprovementStatus,
	PlatformMeasurementStatus,
	PlatformRuleScope,
	PlatformScoreEffect,
	PlatformSourceType,
} from "./platform-presence/index.js";

// P0-T1 부팅 스모크 마커 — 빈 배럴 시절 호환 유지 (워크스페이스/앱 배선 테스트 의존).
/**
 * 패키지 식별 상수.
 */
export const ENGINE_PACKAGE = "@boina/engine" as const;

/**
 * 엔진이 contracts 경계 타입에 의존함을 드러내는 스모크 헬퍼.
 * (07 §2: 엔진↔앱 입출력은 contracts 를 통해서만)
 */
export function engineBoundaryMarker(): string {
	return `${ENGINE_PACKAGE} -> ${CONTRACTS_PACKAGE}`;
}
