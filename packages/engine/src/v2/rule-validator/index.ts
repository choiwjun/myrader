/**
 * X-SAG Core Engine v2 — Rule Semantic Validator 공개 API (barrel export)
 *
 * Wave 4 (P5) 사전 구현: 룰 의미 정합성 검토 시스템.
 * 진단 룰의 [의도] 와 [구현] 이 일치하는지 LLM 으로 메타 리뷰.
 *
 * 사용 예:
 *   import {
 *     RuleSemanticChatMockValidator,
 *     type RuleDescriptor,
 *   } from "@boina/engine/v2/rule-validator";
 *
 *   const validator = new RuleSemanticChatMockValidator();
 *   if (validator.isAvailable()) {
 *     const report = await validator.validate(descriptors);
 *   }
 */

// ---- Types ----
export type {
	RuleDescriptor,
	RuleSemanticIssue,
	RuleSemanticReport,
	RuleSemanticSeverity,
	RuleSemanticValidator,
} from "./types.js";

// ---- Providers ----
export { RuleSemanticChatMockValidator } from "./provider.js";
export type { ChatMockRuleSemanticValidatorOptions } from "./provider.js";
export { MockRuleSemanticValidator } from "./mock-provider.js";
export type { MockRuleSemanticValidatorOptions } from "./mock-provider.js";
