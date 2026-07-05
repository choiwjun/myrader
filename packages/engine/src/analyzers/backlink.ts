/**
 * X-SAG Core Engine — BACKLINK Analyzer
 *
 * Phase R-D: 백링크/도메인 권위 룰 (informational, 점수 미포함).
 * 입력: RuleContext (backlinkResult 있으면 평가, 없으면 informational)
 * 출력: AnalyzerResult { category: 'backlink', results: RuleResult[] }
 *
 * POLICY § 7.1: 규칙 기반 정적 분석. AI 생성 없음.
 */

import {
	backlinkAgeSignal001,
	backlinkCanonicalConsistency001,
	backlinkDa001,
	backlinkHttps001,
	backlinkInternalLinkDepth001,
	backlinkLinkEquity001,
	backlinkSocialMeta001,
	backlinkStructuredDataDiversity001,
} from "./rules/backlink-rules.js";
import type { AnalyzerResult, RuleContext } from "./types.js";

/** BACKLINK 규칙 배열 (8개) — Phase R-D */
export const BACKLINK_RULES = [
	backlinkDa001,
	backlinkHttps001,
	backlinkCanonicalConsistency001,
	backlinkStructuredDataDiversity001,
	backlinkSocialMeta001,
	backlinkInternalLinkDepth001,
	backlinkLinkEquity001,
	backlinkAgeSignal001,
] as const;

/**
 * BACKLINK Analyzer — 도메인 권위·외부 신호 기반 점검.
 * ctx.backlinkResult 가 없으면 모든 룰이 informational 로 통과 처리된다.
 */
export function analyzeBacklink(ctx: RuleContext): AnalyzerResult {
	return {
		category: "backlink",
		results: BACKLINK_RULES.map((rule) => rule(ctx)),
	};
}
