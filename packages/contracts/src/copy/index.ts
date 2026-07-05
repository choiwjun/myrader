/**
 * X-SAG Contracts — Copy Module Barrel
 *
 * @TASK TASK-COPY-001~005 — 카피 모듈 전체 re-export
 *
 * 외부 사용:
 *   import { INDUSTRY_VOCAB, RULE_COPY, renderRuleCopy } from "@boina/contracts/copy";
 *
 * NOTE: IndustryId 타입은 enums.ts 에서 canonical 정의됨.
 *       충돌 방지를 위해 copy/types.ts의 IndustryId re-export는 생략.
 */

// Types (IndustryVocab, RuleCopyTemplate, RuleCopyRendered + Zod schemas)
// IndustryId는 enums.ts 에서 이미 export됨 → 타입만 선택적으로 내보냄
export type { IndustryVocab, RuleCopyTemplate, RuleCopyRendered } from "./types.js";
export {
  IndustryVocabSchema,
  RuleCopyTemplateSchema,
  RuleCopyRenderedSchema,
} from "./types.js";

// Industry vocab (8 산업 어휘 사전)
export { INDUSTRY_VOCAB, isCompleteVocab, getVocabOrFallback } from "./industry-vocab.ko.js";

// Rule copy seeds (high 30 + medium 60 = 90 룰 × 5슬롯)
export { RULE_COPY } from "./rule-copy.ko.js";
export { MEDIUM_RULE_COPY_KO } from "./rule-copy-medium.ko.js";

// Render engine (변수 치환)
export {
  vocabToVars,
  renderSlot,
  renderRuleCopy,
  hasUnrenderedVars,
  renderAllRules,
  buildVarsFromIndustry,
} from "./render.js";
