/**
 * X-SAG Core Engine — 추천 품질 검수기 (Phase P-C)
 *
 * 생성된 한국어 SEO 추천 문구의 품질을 평가하고, 필요 시 개선 버전을 제안한다.
 *
 *  - LLM 미가용 환경: rule-based 휴리스틱 (길이/명령조/영문 비율)만 평가.
 *  - LLM 가용 환경: 프롬프트 기반 검수 + 개선 문구 생성.
 *
 * 사용 예:
 * ```ts
 * const checker = new RecommendationQualityChecker({
 *   generate: async (prompt) => chatmock.complete(prompt),
 * });
 * const r = await checker.check({ ruleId, recommendation, context });
 * if (!r.passed && r.improvedRecommendation) {
 *   // 개선 버전 사용
 * }
 * ```
 */

import {
	type QualityCheckInput,
	type QualityCheckResult,
	buildQualityPrompt,
	parseQualityResponse,
} from "./quality-prompts.js";

export type {
	QualityCheckInput,
	QualityCheckResult,
} from "./quality-prompts.js";

// ---------------------------------------------------------------------------
// LLM provider 어댑터 (의도적으로 RecommendationProvider 와 분리)
// ---------------------------------------------------------------------------

export interface QualityLLMProvider {
	/** 프롬프트를 받아 LLM 응답 문자열을 반환. 실패 시 throw. */
	generate(prompt: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Heuristic thresholds
// ---------------------------------------------------------------------------

const MIN_LENGTH = 20;
const MAX_LENGTH = 300;
const RECOMMENDED_MIN = 50;
const RECOMMENDED_MAX = 200;
const COMMAND_SUFFIX_LIMIT = 3;
const ENGLISH_RATIO_LIMIT = 0.3;

// ---------------------------------------------------------------------------
// RecommendationQualityChecker
// ---------------------------------------------------------------------------

export class RecommendationQualityChecker {
	constructor(private readonly llmProvider?: QualityLLMProvider) {}

	/** LLM provider 가 주입되어 있으면 true. */
	isAvailable(): boolean {
		return this.llmProvider !== undefined;
	}

	/**
	 * 품질 검수 실행.
	 * LLM 가용 시 LLM 응답을 우선 사용하되, throw 발생 시 rule-based 폴백.
	 */
	async check(input: QualityCheckInput): Promise<QualityCheckResult> {
		if (!this.llmProvider) {
			return this.ruleBasedCheck(input);
		}

		try {
			const prompt = buildQualityPrompt(input);
			const response = await this.llmProvider.generate(prompt);
			const parsed = parseQualityResponse(response, input);

			// LLM 응답이 의미 있는 경우만 채택. 점수 0 & issues 비어있으면 폴백.
			if (parsed.qualityScore === 0 && parsed.issues.length === 0) {
				return this.ruleBasedCheck(input);
			}
			return parsed;
		} catch {
			// HALLUCINATION_GUARD: LLM 실패 → rule-based 폴백
			return this.ruleBasedCheck(input);
		}
	}

	/** 규칙 기반 휴리스틱 검사 (LLM 미가용 또는 폴백). */
	ruleBasedCheck(input: QualityCheckInput): QualityCheckResult {
		const text = input.recommendation ?? "";
		const issues: string[] = [];
		let score = 100;

		const len = [...text].length; // 유니코드 코드 포인트 단위 길이

		// 길이 검사
		if (len < MIN_LENGTH) {
			issues.push("너무 짧음");
			score -= 30;
		} else if (len < RECOMMENDED_MIN) {
			issues.push("권장 길이보다 짧음");
			score -= 10;
		}
		if (len > MAX_LENGTH) {
			issues.push("너무 길음");
			score -= 10;
		} else if (len > RECOMMENDED_MAX) {
			issues.push("권장 길이보다 김");
			score -= 5;
		}

		// 명령조 과다 — "...하세요/해주세요/하십시오" 빈도
		const commandMatches = text.match(/(하세요|해주세요|하십시오|해라)/g) ?? [];
		if (commandMatches.length > COMMAND_SUFFIX_LIMIT) {
			issues.push("명령조 과다");
			score -= 15;
		}

		// 영문 비율
		const totalChars = text.length;
		const englishChars = (text.match(/[a-zA-Z]/g) ?? []).length;
		if (totalChars > 0) {
			const ratio = englishChars / totalChars;
			if (ratio > ENGLISH_RATIO_LIMIT) {
				issues.push("영문 과다");
				score -= 10;
			}
		}

		// 구체성 휴리스틱: 숫자/예시("예:", "예를 들어")가 하나도 없으면 약한 감점
		const hasExample = /예\s*[:：]|예를 들어|예시/.test(text);
		const hasDigit = /\d/.test(text);
		if (!hasExample && !hasDigit) {
			issues.push("구체적 예시 부족");
			score -= 5;
		}

		// 컨텍스트 미반영 (업체명/지역/업종 중 어느 것도 등장하지 않음)
		const { businessName, region, industry } = input.context;
		const hasContext =
			(businessName && text.includes(businessName)) ||
			(region && text.includes(region)) ||
			(industry && text.includes(industry));
		if (!hasContext) {
			issues.push("업종/지역/매장명 미반영");
			score -= 5;
		}

		const finalScore = Math.max(0, Math.min(100, score));
		return {
			ruleId: input.ruleId,
			originalRecommendation: text,
			qualityScore: finalScore,
			issues,
			passed: finalScore >= 70,
		};
	}
}
