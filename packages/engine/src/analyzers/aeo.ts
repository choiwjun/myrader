/**
 * X-SAG Core Engine — AEO Analyzer
 *
 * TASK-CORE-004
 * 입력: RuleContext (pages[], mainPage, businessProfile)
 * 출력: AnalyzerResult { category: 'aeo', results: RuleResult[] }
 *
 * POLICY § 7.1: 규칙 기반 정적 분석. AI 생성 없음.
 * AEO: Answer Engine Optimization — 질문/답변형 검색 환경 적합도.
 */

import { AEO_RULES } from "./rules/index.js";
import type { AnalyzerResult, RuleContext } from "./types.js";
import { buildExtractedEntities } from "./types/extracted-entities.js";

/**
 * AEO Analyzer — FAQ 구조, 질문형 제목, 서비스 설명 명확성 등 분석.
 *
 * Phase 0: ctx.extractedEntities 가 비어 있으면 1회 채워 NAP 룰들이 공유하도록 한다.
 */
export function analyzeAEO(ctx: RuleContext): AnalyzerResult {
	const enriched: RuleContext = ctx.extractedEntities
		? ctx
		: {
				...ctx,
				extractedEntities: buildExtractedEntities(
					ctx.mainPage,
					ctx.businessProfile,
				),
			};
	return {
		category: "aeo",
		results: AEO_RULES.map((rule) => rule(enriched)),
	};
}
