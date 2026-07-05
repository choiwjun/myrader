/**
 * X-SAG Core Engine — Mock NLP Provider
 *
 * 테스트 환경 전용. 고정값 반환 — 실제 분석/HTTP 호출 없음.
 */

import type { NlpInput, NlpProvider, NlpResult } from "../types.js";

export class MockNlpProvider implements NlpProvider {
	readonly name = "mock" as const;
	private readonly fixed: NlpResult | null;
	private shouldFail = false;

	constructor(fixed?: NlpResult) {
		this.fixed = fixed ?? null;
	}

	/** 테스트 도우미 — 다음 호출에서 실패하도록 설정. */
	setShouldFail(flag: boolean): void {
		this.shouldFail = flag;
	}

	isAvailable(): boolean {
		return true;
	}

	async analyze(input: NlpInput): Promise<NlpResult> {
		if (this.shouldFail) {
			throw new Error("Mock NLP provider intentional failure");
		}
		if (this.fixed) return this.fixed;
		return {
			keywordDensity: {
				targetKeywords: input.targetKeywords.map((kw) => ({
					keyword: kw,
					count: 1,
					density: 0.01,
				})),
				topNouns: [{ word: "테스트", count: 3 }],
			},
			topics: [{ topic: input.industry, relevance: 0.8 }],
			readability: {
				avgSentenceLength: 15,
				avgParagraphLength: 3,
				score: 80,
			},
			eeat: {
				hasAuthor: true,
				hasExpertiseSignals: 2,
				hasTrustSignals: 2,
				hasFreshness: true,
				score: 80,
			},
			semanticRelevance: {
				titleBodyAlignment: 0.7,
				keywordIntegration: 0.6,
			},
			source: "mock",
			analyzedAt: new Date().toISOString(),
		};
	}
}
