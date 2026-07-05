import { describe, expect, it } from "vitest";
import { type HealthBand, HealthBandSchema } from "../enums.js";

describe("HealthBandSchema", () => {
	it("accepts the SCREEN-004 health band literals", () => {
		const bands: HealthBand[] = ["good", "fair", "weak", "poor"];

		for (const band of bands) {
			expect(HealthBandSchema.parse(band)).toBe(band);
		}
	});

	it("rejects grade-only literals that are not health bands", () => {
		expect(HealthBandSchema.safeParse("low").success).toBe(false);
	});
});
