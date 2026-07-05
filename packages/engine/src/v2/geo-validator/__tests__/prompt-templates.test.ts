/**
 * v2/geo-validator — Prompt Templates 단위 테스트
 *
 * 매장 정보 → 표준 질의 자동 생성 검증.
 */

import { describe, expect, it } from "vitest";
import {
	generateDefaultQueries,
	generateQueriesByFacet,
} from "../prompt-templates.js";
import type { GeoValidationInput } from "../types.js";

const baseInput: GeoValidationInput = {
	url: "https://test-cafe.kr",
	businessName: "테스트카페",
	industry: "카페",
	region: "서울 강남",
	targetKeywords: ["핸드드립", "원두판매", "디저트", "케이크"],
};

describe("generateDefaultQueries()", () => {
	it("4개 facet 의 질의를 모두 생성한다", () => {
		const queries = generateDefaultQueries(baseInput);
		const facets = new Set(queries.map((q) => q.facet));
		expect(facets.has("brand-mention")).toBe(true);
		expect(facets.has("industry-region")).toBe(true);
		expect(facets.has("service-recommendation")).toBe(true);
		expect(facets.has("comparative")).toBe(true);
	});

	it("최소 5개 이상의 질의를 생성한다", () => {
		const queries = generateDefaultQueries(baseInput);
		expect(queries.length).toBeGreaterThanOrEqual(5);
	});

	it("targetKeywords 가 4개여도 최대 3개까지만 service-recommendation 으로 사용한다", () => {
		const queries = generateDefaultQueries(baseInput);
		const serviceQueries = queries.filter(
			(q) => q.facet === "service-recommendation",
		);
		expect(serviceQueries.length).toBeLessThanOrEqual(3);
	});

	it("질의문에 매장명/지역/업종이 반영된다", () => {
		const queries = generateDefaultQueries(baseInput);
		const allText = queries.map((q) => q.query).join(" ");
		expect(allText).toContain("테스트카페");
		expect(allText).toContain("서울 강남");
		expect(allText).toContain("카페");
	});

	it("targetKeywords 가 빈 배열이면 service-recommendation 은 0건이다", () => {
		const queries = generateDefaultQueries({
			...baseInput,
			targetKeywords: [],
		});
		const serviceQueries = queries.filter(
			(q) => q.facet === "service-recommendation",
		);
		expect(serviceQueries.length).toBe(0);
	});

	it("businessName 만 빈 문자열이면 brand-mention 은 0건이다", () => {
		const queries = generateDefaultQueries({
			...baseInput,
			businessName: "",
		});
		const brandQueries = queries.filter((q) => q.facet === "brand-mention");
		expect(brandQueries.length).toBe(0);
	});

	it("region 만 비어 있으면 keyword 만으로 service-recommendation 을 만든다", () => {
		const queries = generateDefaultQueries({
			...baseInput,
			region: "",
			targetKeywords: ["핸드드립"],
		});
		const service = queries.find((q) => q.facet === "service-recommendation");
		expect(service).toBeDefined();
		expect(service?.query).toContain("핸드드립");
		expect(service?.query).not.toContain("서울 강남");
	});

	it("region+industry 가 비어 있으면 industry-region/comparative 는 미생성", () => {
		const queries = generateDefaultQueries({
			...baseInput,
			region: "",
			industry: "",
		});
		const facets = new Set(queries.map((q) => q.facet));
		expect(facets.has("industry-region")).toBe(false);
		expect(facets.has("comparative")).toBe(false);
	});
});

describe("generateQueriesByFacet()", () => {
	it("지정된 facet 의 질의만 반환한다", () => {
		const queries = generateQueriesByFacet(baseInput, "brand-mention");
		expect(queries.length).toBeGreaterThan(0);
		expect(queries.every((q) => q.facet === "brand-mention")).toBe(true);
	});

	it("industry-region facet 의 질의만 반환한다", () => {
		const queries = generateQueriesByFacet(baseInput, "industry-region");
		expect(queries.length).toBeGreaterThan(0);
		expect(queries.every((q) => q.facet === "industry-region")).toBe(true);
	});
});
