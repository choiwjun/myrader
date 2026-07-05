/**
 * X-SAG Core Engine v2 — AEO Validator 공개 API (barrel export)
 *
 * Phase P4: AEO(Answer Engine Optimization) 룰 실증 검증 시스템.
 * LLM 에게 정보/지식형 질의를 직접 보내고, 응답이 우리 비즈니스를
 * 답변 소스로 인용/추천하는지 측정한다 (Profound-style appearance rate).
 *
 * 사용 예:
 *   import { ChatMockAeoValidator, generateDefaultAeoQueries } from "@boina/engine/v2/aeo-validator";
 *   const validator = new ChatMockAeoValidator();
 *   const result = await validator.validate({
 *     url, businessName, industry, mainServices, targetKeywords,
 *   });
 */

// ---- Types ----
export type {
	AeoCitation,
	AeoMentionContext,
	AeoMetrics,
	AeoQuery,
	AeoQueryFacet,
	AeoValidationInput,
	AeoValidationResult,
	AeoValidationSource,
	AeoValidator,
} from "./types.js";

// ---- Prompt templates ----
export {
	generateAeoQueriesByFacet,
	generateDefaultAeoQueries,
} from "./prompt-templates.js";

// ---- Analysis utilities ----
export {
	analyzeAeoCitation,
	computeAeoMetrics,
	computeProminence,
	extractDomain,
} from "./validator.js";

// ---- Providers ----
export { ChatMockAeoValidator } from "./providers/chatmock.js";
export type { ChatMockAeoValidatorOptions } from "./providers/chatmock.js";
export { MockAeoValidator } from "./providers/mock.js";
