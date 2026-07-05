import type { HealthBand } from "@boina/contracts/enums";
import { describe, expect, it } from "vitest";
import { scoreToHealthBand } from "../index.js";

describe("scoreToHealthBand", () => {
	it("maps score thresholds to SCREEN-004 health bands", () => {
		const cases: Array<[number, HealthBand]> = [
			[100, "good"],
			[80, "good"],
			[79, "fair"],
			[60, "fair"],
			[59, "weak"],
			[40, "weak"],
			[39, "poor"],
			[0, "poor"],
		];

		for (const [score, band] of cases) {
			expect(scoreToHealthBand(score)).toBe<HealthBand>(band);
		}
	});

	it("maps invalid and negative scores to poor", () => {
		for (const score of [
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			-1,
		]) {
			expect(scoreToHealthBand(score)).toBe<HealthBand>("poor");
		}
	});
});
