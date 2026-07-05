/**
 * X-SAG Core Engine — Rule-Based Recommendation Provider
 *
 * Always available. Uses RuleResult.recommendation directly.
 * No AI calls, no external dependencies, deterministic.
 * POLICY § 7.1: 결정적·재현 가능.
 * aiGenerated: false (POLICY § 7.2).
 */

import type {
	RecommendationInput,
	RecommendationOutput,
	RecommendationProvider,
} from "../types.js";

export class RuleBasedProvider implements RecommendationProvider {
	readonly name = "rule-based" as const;

	isAvailable(): boolean {
		return true; // 항상 사용 가능
	}

	async generate(input: RecommendationInput): Promise<RecommendationOutput> {
		// 원본 RuleResult 의 recommendation 이 있으면 우선 사용,
		// 없으면 DiagnosisItem 의 recommendationText 사용.
		const body =
			input.ruleResult?.recommendation ??
			input.item.recommendationText ??
			`${input.item.title}: 개선이 필요합니다.`;

		return {
			body,
			examples: [],
			aiGenerated: false,
			provider: "rule-based",
		};
	}
}
