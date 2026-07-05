/**
 * X-SAG Core Engine — KoreanMorphologyAnalyzer tests
 *
 * Phase R-C: 한국어 형태소 분석기 검증.
 */

import { describe, expect, it } from "vitest";
import { KoreanMorphologyAnalyzer } from "../providers/korean-morphology.js";

describe("KoreanMorphologyAnalyzer", () => {
	const morph = new KoreanMorphologyAnalyzer();

	// -------------------------------------------------------------------------
	// 명사 추출
	// -------------------------------------------------------------------------
	describe("noun extraction", () => {
		it("extracts basic nouns from simple sentence", () => {
			const result = morph.analyze("강남 카페 추천해드릴까요?");
			const nounWords = result.nouns.map((n) => n.word);
			expect(nounWords).toContain("강남");
			expect(nounWords).toContain("카페");
		});

		it("strips postpositions (조사) from nouns", () => {
			// "카페에서는" → "카페", "강남의" → "강남"
			const result = morph.analyze(
				"카페에서는 음료를 판매합니다. 강남의 분위기가 좋습니다.",
			);
			const nounWords = result.nouns.map((n) => n.word);
			expect(nounWords).toContain("카페");
			expect(nounWords).toContain("강남");
			// 조사 그대로 남아있으면 안 됨
			expect(nounWords).not.toContain("카페에서는");
			expect(nounWords).not.toContain("강남의");
		});

		it("merges nouns with different postpositions into one count", () => {
			// "강남이", "강남을", "강남에" 모두 "강남" 으로 카운트
			const result = morph.analyze(
				"강남이 좋고 강남을 추천하며 강남에 갑니다.",
			);
			const gangnam = result.nouns.find((n) => n.word === "강남");
			expect(gangnam).toBeDefined();
			expect(gangnam?.count).toBeGreaterThanOrEqual(2);
		});

		it("filters stopwords (그리고, 하지만 등)", () => {
			const result = morph.analyze(
				"그리고 하지만 그러나 또한 정말 매우 너무 무엇 어떻게 왜",
			);
			const nounWords = result.nouns.map((n) => n.word);
			expect(nounWords).not.toContain("그리고");
			expect(nounWords).not.toContain("하지만");
			expect(nounWords).not.toContain("매우");
			expect(nounWords).not.toContain("무엇");
		});

		it("respects minLength option", () => {
			const result = morph.extractNouns("강남 가 카페 의 모임", {
				minLength: 2,
			});
			const words = result.map((n) => n.word);
			// 1글자 토큰 (가, 의) 는 제외
			for (const w of words) {
				expect(w.length).toBeGreaterThanOrEqual(2);
			}
		});

		it("respects topN option", () => {
			const result = morph.extractNouns(
				"카페 카페 강남 강남 강남 메뉴 메뉴 음료 음료 디저트",
				{ topN: 2 },
			);
			expect(result.length).toBeLessThanOrEqual(2);
		});

		it("returns positions array for noun occurrences", () => {
			const result = morph.analyze("카페 메뉴 카페 음료");
			const cafe = result.nouns.find((n) => n.word === "카페");
			expect(cafe).toBeDefined();
			expect(cafe?.positions.length).toBe(2);
		});
	});

	// -------------------------------------------------------------------------
	// 동사/형용사 분류
	// -------------------------------------------------------------------------
	describe("verb/adjective detection", () => {
		it("detects verb endings (~습니다, ~다, ~요)", () => {
			const result = morph.analyze("운영합니다. 판매합니다. 도와요. 만들어요.");
			// 어미가 인식되면 verb 분류 또는 nouns 에서 제외됨
			const totalVerbsOrFiltered =
				result.verbs.length + (result.nouns.length === 0 ? 1 : 0);
			expect(totalVerbsOrFiltered).toBeGreaterThanOrEqual(1);
			// 어떤 식으로든 "운영합니다" 가 원형 그대로 명사로 들어가면 안 됨
			const nounWords = result.nouns.map((n) => n.word);
			expect(nounWords).not.toContain("운영합니다");
			expect(nounWords).not.toContain("판매합니다");
		});

		it("detects adjective endings (~한, ~은)", () => {
			const result = morph.analyze("맛있는 따뜻한 시원한 깨끗한");
			// 형용사 어간이 감지되거나, 명사에서 배제되어야 함
			const nounWords = result.nouns.map((n) => n.word);
			// "맛있는" 같은 원형이 명사에 들어가면 안 됨
			expect(nounWords).not.toContain("맛있는");
		});
	});

	// -------------------------------------------------------------------------
	// 한국어 비율
	// -------------------------------------------------------------------------
	describe("Korean ratio", () => {
		it("returns 1.0 for pure Korean text", () => {
			const result = morph.analyze("강남카페추천");
			expect(result.koreanRatio).toBeGreaterThanOrEqual(0.9);
		});

		it("returns < 0.5 for mostly English text", () => {
			const result = morph.analyze("Hello world this is English");
			expect(result.koreanRatio).toBeLessThan(0.5);
		});

		it("returns 0.0 for empty string", () => {
			const result = morph.analyze("");
			expect(result.koreanRatio).toBe(0);
		});

		it("handles mixed Korean/English/numbers", () => {
			const result = morph.analyze("강남 cafe 2024년");
			expect(result.koreanRatio).toBeGreaterThan(0);
			expect(result.koreanRatio).toBeLessThan(1);
		});
	});

	// -------------------------------------------------------------------------
	// Keyword density
	// -------------------------------------------------------------------------
	describe("calculateKeywordDensity", () => {
		it("counts keyword with attached postpositions", () => {
			// "가죽공방", "가죽공방의", "가죽공방에서" 모두 카운트
			const text = "가죽공방 가죽공방의 가죽공방에서 안녕";
			const density = morph.calculateKeywordDensity(text, "가죽공방");
			// 4 어절 중 3 매칭 = 0.75
			expect(density).toBeGreaterThan(0.5);
			expect(density).toBeLessThanOrEqual(1);
		});

		it("returns 0 for empty keyword or text", () => {
			expect(morph.calculateKeywordDensity("", "test")).toBe(0);
			expect(morph.calculateKeywordDensity("text", "")).toBe(0);
		});

		it("returns 0 when keyword absent", () => {
			expect(morph.calculateKeywordDensity("강남 카페 메뉴", "변호사")).toBe(0);
		});

		it("clamps to <= 1", () => {
			const density = morph.calculateKeywordDensity("카페 카페 카페", "카페");
			expect(density).toBeLessThanOrEqual(1);
		});
	});

	// -------------------------------------------------------------------------
	// Edge cases
	// -------------------------------------------------------------------------
	describe("edge cases", () => {
		it("handles empty string", () => {
			const result = morph.analyze("");
			expect(result.nouns).toEqual([]);
			expect(result.totalTokens).toBe(0);
			expect(result.koreanRatio).toBe(0);
		});

		it("handles whitespace-only string", () => {
			const result = morph.analyze("   \n  \t  ");
			expect(result.nouns).toEqual([]);
		});

		it("does not crash on special characters", () => {
			expect(() => morph.analyze("!@#$%^&*()<>?{}[]|\\")).not.toThrow();
		});

		it("does not crash on emoji + Korean", () => {
			expect(() => morph.analyze("강남 카페 ☕ 추천 🎉")).not.toThrow();
		});

		it("totalTokens reflects all eojeols including filtered", () => {
			const result = morph.analyze("강남 카페 그리고 하지만");
			// totalTokens 는 어절 분리 결과 4개 (stopword 도 포함된 raw count)
			expect(result.totalTokens).toBe(4);
		});
	});
});
