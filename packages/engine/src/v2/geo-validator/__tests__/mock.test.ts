/**
 * v2/geo-validator — MockGeoValidator 단위 테스트
 *
 * 결정론적 응답, 모든 facet 처리, 메트릭 계산 검증.
 */

import { describe, expect, it } from "vitest";
import { MockGeoValidator } from "../providers/mock.js";
import type { GeoValidationInput } from "../types.js";

const input: GeoValidationInput = {
	url: "https://test-cafe.kr",
	businessName: "테스트카페",
	industry: "카페",
	region: "서울 강남",
	targetKeywords: ["핸드드립", "디저트"],
};

describe("MockGeoValidator", () => {
	it("isAvailable() 은 항상 true", () => {
		expect(new MockGeoValidator().isAvailable()).toBe(true);
	});

	it("name 은 'mock'", () => {
		expect(new MockGeoValidator().name).toBe("mock");
	});

	it("결정론적 — 동일 입력은 동일 결과를 반환한다", async () => {
		const validator = new MockGeoValidator();
		const r1 = await validator.validate(input);
		const r2 = await validator.validate(input);
		expect(r1).toEqual(r2);
	});

	it("결과 구조가 GeoValidationResult 계약을 만족한다", async () => {
		const validator = new MockGeoValidator();
		const result = await validator.validate(input);

		expect(result.url).toBe(input.url);
		expect(result.businessName).toBe(input.businessName);
		expect(result.source).toBe("mock");
		expect(Array.isArray(result.citations)).toBe(true);
		expect(result.citations.length).toBeGreaterThan(0);
		expect(typeof result.metrics.mentionRate).toBe("number");
		expect(typeof result.metrics.urlRate).toBe("number");
		expect(typeof result.metrics.directMentionRate).toBe("number");
		expect(typeof result.metrics.competitorCount).toBe("number");
		expect(typeof result.validatedAt).toBe("string");
	});

	it("brand-mention 질의의 mentionRate 는 1.0 (mock 응답에 항상 매장명 포함)", async () => {
		const validator = new MockGeoValidator();
		const result = await validator.validate(input, [
			{ query: "테스트카페에 대해 알려줘", facet: "brand-mention" },
		]);
		expect(result.metrics.mentionRate).toBe(1);
	});

	it("service-recommendation 질의에서는 매장명이 없을 수 있다", async () => {
		const validator = new MockGeoValidator();
		const result = await validator.validate(input, [
			{ query: "강남 핸드드립 잘하는 곳", facet: "service-recommendation" },
		]);
		// mock 의 service-recommendation 응답은 매장명을 포함하지 않음
		expect(result.metrics.mentionRate).toBe(0);
	});

	it("comparative 질의는 경쟁사 다수 노출", async () => {
		const validator = new MockGeoValidator();
		const result = await validator.validate(input, [
			{ query: "강남 카페 비교", facet: "comparative" },
		]);
		expect(result.metrics.competitorCount).toBeGreaterThanOrEqual(2);
	});
});
