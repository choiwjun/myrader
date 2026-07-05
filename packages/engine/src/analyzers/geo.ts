/**
 * X-SAG Core Engine — GEO Analyzer
 *
 * TASK-CORE-005
 * 입력: RuleContext (pages[], mainPage, businessProfile)
 * 출력: AnalyzerResult { category: 'geo', results: RuleResult[] }
 *
 * POLICY § 7.1: 규칙 기반 정적 분석. AI 생성 없음.
 * GEO: Generative Engine Optimization — 생성형 AI 검색 환경 적합도.
 */

import { GEO_RULES } from "./rules/index.js";
import type { AnalyzerResult, RuleContext } from "./types.js";
import { buildExtractedEntities } from "./types/extracted-entities.js";

/**
 * GEO Analyzer — 업체명/업종/지역 명확성, 구조화 데이터, AI 요약 친화성 등 분석.
 *
 * Phase 0: ctx.extractedEntities 가 비어 있으면 1회 채워 NAP 룰들이 공유하도록 한다.
 */
export function analyzeGEO(ctx: RuleContext): AnalyzerResult {
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
		category: "geo",
		results: GEO_RULES.map((rule) => rule(enriched)),
	};
}
