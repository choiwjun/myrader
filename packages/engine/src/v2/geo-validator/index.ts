/**
 * X-SAG Core Engine v2 — GEO Validator 공개 API (barrel export)
 *
 * Phase P-B: GEO 룰 실증 검증 시스템.
 * LLM 직접 질의 → 사이트 인용 패턴 분석 (Profound-style).
 *
 * 사용 예:
 *   import { ChatMockGeoValidator, generateDefaultQueries } from "@boina/engine/v2/geo-validator";
 *   const validator = new ChatMockGeoValidator();
 *   const result = await validator.validate({ url, businessName, industry, region, targetKeywords });
 */

// ---- Types ----
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
} from "./types.js";

// ---- Prompt templates ----
export {
	generateDefaultQueries,
	generateQueriesByFacet,
	withStructuredExtraction,
	RECOMMENDED_BUSINESSES_MARKER,
	RECOMMENDED_BUSINESSES_PROMPT,
} from "./prompt-templates.js";

// ---- Analysis utilities ----
export {
	aggregateRecommendedCompetitors,
	analyzeCitation,
	computeMetrics,
	extractDomain,
	parseRecommendedBusinesses,
} from "./validator.js";
export type { RecommendedCompetitor } from "./validator.js";

// ---- Providers ----
export { ChatMockGeoValidator } from "./providers/chatmock.js";
export type { ChatMockGeoValidatorOptions } from "./providers/chatmock.js";
export { MockGeoValidator } from "./providers/mock.js";
