/**
 * X-SAG Core Engine v2 — 공개 API (barrel export)
 *
 * POLICY § 24 (Engine v2): JS 렌더링, 성능 측정 등 Pro+ 기능 모음.
 */

// JS Render Adapter (TRD § 19.2.2)
export type {
	JsRenderAdapter,
	RenderOptions,
	RenderResult,
} from "./js-render/index.js";
export {
	createJsRenderAdapter,
	MockJsRenderProvider,
	PlaywrightProvider,
} from "./js-render/index.js";

// Performance / Lighthouse types (TRD § 19.2.3)
export type {
	LighthouseAdapter,
	LighthouseOptions,
	LighthouseResult,
} from "./perf/types.js";

// GEO Validator (Phase P-B — GEO 룰 실증 검증)
export type {
	GeoCitation,
	GeoCitationMetrics,
	GeoQuery,
	GeoQueryFacet,
	GeoValidationInput,
	GeoValidationResult,
	GeoValidationSource,
	GeoValidator,
	RuleEffectivenessEstimate,
} from "./geo-validator/index.js";
export {
	ChatMockGeoValidator,
	MockGeoValidator,
	analyzeCitation,
	computeMetrics,
	extractDomain,
	generateDefaultQueries,
	generateQueriesByFacet,
} from "./geo-validator/index.js";
export type { ChatMockGeoValidatorOptions } from "./geo-validator/index.js";

// NLP Analysis (Phase P-A — 한국어 콘텐츠 분석 + E-E-A-T)
export type {
	KeywordDensityItem,
	NlpEeat,
	NlpInput,
	NlpKeywordDensity,
	NlpProvider,
	NlpReadability,
	NlpResult,
	NlpSemanticRelevance,
	NlpSource,
	NlpTopic,
	TopNoun,
} from "./nlp/index.js";
export {
	createNlpAnalyzer,
	NlpAnalyzerChain,
	RuleBasedNlpProvider,
	ChatMockNlpProvider,
	MockNlpProvider,
} from "./nlp/index.js";

// Backlink Adapter (Phase R-D — 도메인 권위/백링크 추정)
export type {
	BacklinkAdapter,
	BacklinkInput,
	BacklinkResult,
	BacklinkSignals,
	BacklinkSource,
} from "./backlink/index.js";
export {
	BacklinkAdapterChain,
	createBacklinkAdapter,
	HeuristicBacklinkProvider,
	AhrefsBacklinkProvider,
	MozBacklinkProvider,
	MockBacklinkProvider,
} from "./backlink/index.js";

// A11Y Analyzer (Phase R-D — WCAG 2.1 AA 자동 검사)
export type {
	A11yImpact,
	A11yInput,
	A11yProvider,
	A11yResult,
	A11ySource,
	A11yViolation,
} from "./a11y/index.js";
export {
	A11yAnalyzerChain,
	createA11yAnalyzer,
	CheerioStaticA11yProvider,
	AxeCoreA11yProvider,
	MockA11yProvider,
} from "./a11y/index.js";

// LLM Provider Router (Wave 5 — LLM_PROVIDER 환경 변수 라우팅)
export type { LlmProviderConfig, LlmProviderId } from "./llm-provider/index.js";
export { getActiveLlmProvider, isLlmEnabled } from "./llm-provider/index.js";

// Gap Analysis (TRD § 19.2.5)
export { GapAnalyzer } from "./gap/index.js";
export {
	groupByActionType,
	groupByCategory,
	filterCompetitorAdvantage,
	filterSelfStrength,
	filterByPriority,
	computeSummaryStats,
} from "./gap/index.js";
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
	GapSummaryStats,
	GroupedGapMatrix,
	Priority,
	PriorityGap,
	ScoreSnapshot,
} from "./gap/index.js";
