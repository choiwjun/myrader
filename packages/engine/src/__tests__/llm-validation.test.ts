/**
 * WS5a — buildLlmValidationSignal 단위 테스트 (실 호출 없이 검증기 주입)
 *
 * informational LLM 가시성 신호 조립·fail-soft·disclaimer(그라운딩 경고)를 검증한다.
 * 점수 무관성은 pipeline 구조(점수 산출 이후 별도 필드)로 보장되며 전체 pipeline 테스트로 회귀.
 */
import { describe, expect, it } from "vitest";
import { buildLlmValidationSignal } from "../pipeline.js";
import type { AeoValidator } from "../v2/aeo-validator/index.js";
import type { GeoValidator } from "../v2/geo-validator/index.js";

const geoInput = {
	url: "https://x.kr",
	businessName: "X",
	industry: "cafe",
	region: "Seoul",
	targetKeywords: ["a"],
};
const aeoInput = {
	url: "https://x.kr",
	businessName: "X",
	industry: "cafe",
	mainServices: ["a"],
	targetKeywords: ["a"],
};

function geoValidator(
	metrics: { mentionRate: number; directMentionRate: number } | "throw",
	/** 각 citation 의 recommendedBusinesses (결정적 구조화 추출 결과) 시뮬레이션. */
	recommended: string[][] = [],
): GeoValidator {
	return {
		name: "fake-geo",
		isAvailable: () => true,
		validate: async () => {
			if (metrics === "throw") throw new Error("geo boom");
			return {
				url: geoInput.url,
				businessName: "X",
				citations: recommended.map((rb, i) => ({
					query: `Q${i}`,
					facet: "industry-region",
					llmResponse: "",
					hasMention: false,
					hasUrl: false,
					isDirectMention: false,
					mentionedCompetitors: [],
					recommendedBusinesses: rb,
					measuredAt: "t",
				})),
				metrics: { ...metrics, urlRate: 0, competitorCount: 0 },
				source: "fake",
				validatedAt: "t",
			};
		},
	} as unknown as GeoValidator;
}

function aeoValidator(
	metrics:
		| { appearanceRate: number; prominenceScore: number; citationRate: number }
		| "throw",
): AeoValidator {
	return {
		name: "fake-aeo",
		isAvailable: () => true,
		validate: async () => {
			if (metrics === "throw") throw new Error("aeo boom");
			return {
				url: aeoInput.url,
				businessName: "X",
				citations: [],
				metrics,
				source: "fake",
				validatedAt: "t",
			};
		},
	} as unknown as AeoValidator;
}

describe("buildLlmValidationSignal (WS5a)", () => {
	it("geo/aeo 신호를 병렬 수집하고 provider·grounded·disclaimer 를 담는다", async () => {
		const signal = await buildLlmValidationSignal({
			provider: "openai",
			grounded: true,
			geoValidator: geoValidator({ mentionRate: 0.4, directMentionRate: 0.2 }),
			aeoValidator: aeoValidator({
				appearanceRate: 0.3,
				prominenceScore: 0.5,
				citationRate: 0.1,
			}),
			geoInput,
			aeoInput,
		});
		expect(signal.provider).toBe("openai");
		expect(signal.grounded).toBe(true);
		expect(signal.geo).toEqual({ mentionRate: 0.4, directMentionRate: 0.2 });
		expect(signal.aeo).toEqual({ appearanceRate: 0.3, prominenceScore: 0.5 });
		expect(signal.disclaimer).toContain("점수에 미반영");
	});

	it("grounded=false 면 학습기억 경고가 disclaimer 에 반영", async () => {
		const signal = await buildLlmValidationSignal({
			provider: "openai",
			grounded: false,
			geoValidator: geoValidator({ mentionRate: 0.1, directMentionRate: 0 }),
			aeoValidator: aeoValidator({
				appearanceRate: 0.1,
				prominenceScore: 0.1,
				citationRate: 0,
			}),
			geoInput,
			aeoInput,
		});
		expect(signal.grounded).toBe(false);
		expect(signal.disclaimer).toContain("학습기억");
	});

	it("개별 검증기 실패는 fail-soft (해당 신호 null, 다른 신호 유지)", async () => {
		const signal = await buildLlmValidationSignal({
			provider: "gemini",
			grounded: true,
			geoValidator: geoValidator("throw"),
			aeoValidator: aeoValidator({
				appearanceRate: 0.3,
				prominenceScore: 0.5,
				citationRate: 0.1,
			}),
			geoInput,
			aeoInput,
		});
		expect(signal.geo).toBeNull();
		expect(signal.aeo).toEqual({ appearanceRate: 0.3, prominenceScore: 0.5 });
	});

	it("grounded=true + 구조화 추출 경쟁사 → competitors 를 빈도순 top N 으로 담는다", async () => {
		const signal = await buildLlmValidationSignal({
			provider: "openai",
			grounded: true,
			geoValidator: geoValidator({ mentionRate: 0.1, directMentionRate: 0 }, [
				["스타벅스", "투썸"],
				["스타벅스", "메가"],
				["스타벅스"],
			]),
			aeoValidator: aeoValidator({
				appearanceRate: 0.1,
				prominenceScore: 0.1,
				citationRate: 0,
			}),
			geoInput,
			aeoInput,
		});
		expect(signal.competitors).toEqual([
			{ name: "스타벅스", mentionedInQueries: 3, sampleQuery: "Q0", source: "gpt_grounded" },
			{ name: "투썸", mentionedInQueries: 1, sampleQuery: "Q0", source: "gpt_grounded" },
			{ name: "메가", mentionedInQueries: 1, sampleQuery: "Q1", source: "gpt_grounded" },
		]);
	});

	it("competitorTopN 으로 상위 N 만 surfacing 한다", async () => {
		const signal = await buildLlmValidationSignal({
			provider: "openai",
			grounded: true,
			competitorTopN: 1,
			geoValidator: geoValidator({ mentionRate: 0.1, directMentionRate: 0 }, [
				["스타벅스", "투썸"],
				["스타벅스"],
			]),
			aeoValidator: aeoValidator({
				appearanceRate: 0.1,
				prominenceScore: 0.1,
				citationRate: 0,
			}),
			geoInput,
			aeoInput,
		});
		expect(signal.competitors).toEqual([
			{ name: "스타벅스", mentionedInQueries: 2, sampleQuery: "Q0", source: "gpt_grounded" },
		]);
	});

	it("grounded=false 면 추출 결과가 있어도 competitors 를 생략한다 (정직성)", async () => {
		const signal = await buildLlmValidationSignal({
			provider: "openai",
			grounded: false,
			geoValidator: geoValidator({ mentionRate: 0.1, directMentionRate: 0 }, [
				["스타벅스", "투썸"],
			]),
			aeoValidator: aeoValidator({
				appearanceRate: 0.1,
				prominenceScore: 0.1,
				citationRate: 0,
			}),
			geoInput,
			aeoInput,
		});
		expect(signal.competitors).toBeUndefined();
	});

	it("grounded=true 라도 구조화 추출 결과가 없으면 competitors 를 생략한다", async () => {
		const signal = await buildLlmValidationSignal({
			provider: "openai",
			grounded: true,
			geoValidator: geoValidator({ mentionRate: 0.1, directMentionRate: 0 }, [
				[],
				[],
			]),
			aeoValidator: aeoValidator({
				appearanceRate: 0.1,
				prominenceScore: 0.1,
				citationRate: 0,
			}),
			geoInput,
			aeoInput,
		});
		expect(signal.competitors).toBeUndefined();
	});
});
