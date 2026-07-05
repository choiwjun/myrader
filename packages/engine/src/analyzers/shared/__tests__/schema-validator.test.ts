/**
 * X-SAG Core Engine — schema-validator 단위 테스트 (Phase 0 인프라)
 *
 * shared/schema-validator.ts 의 타입 가드 + 접근자 직접 검증.
 * 결정적: AI/네트워크/시간 의존 없음.
 */

import { describe, expect, it } from "vitest";
import {
	getAggregateRating,
	getName,
	getOpeningHours,
	getPostalAddress,
	getSchemaNodes,
	getTelephone,
	isFaqPageNode,
	isLocalBusinessNode,
	isOrganizationNode,
	isPresent,
} from "../schema-validator.js";

// ===========================================================================
// getSchemaNodes — 평탄화
// ===========================================================================

describe("getSchemaNodes", () => {
	it("중첩 배열을 평탄화한다", () => {
		const nodes = getSchemaNodes([
			[{ "@type": "A" }, [{ "@type": "B" }]],
			{ "@type": "C" },
		]);
		const types = nodes.map((n) => n["@type"]);
		expect(types).toEqual(["A", "B", "C"]);
	});

	it("@graph 컨테이너를 전개하며 컨테이너 자신도 포함한다", () => {
		const nodes = getSchemaNodes([
			{
				"@context": "https://schema.org",
				"@graph": [{ "@type": "Organization" }, { "@type": "WebSite" }],
			},
		]);
		const types = nodes.map((n) => n["@type"]);
		// 컨테이너(@type 없음) → undefined, 이어서 graph 멤버들
		expect(types).toEqual([undefined, "Organization", "WebSite"]);
		expect(nodes).toHaveLength(3);
	});

	it("객체가 아닌 원소(문자열/null)는 건너뛴다", () => {
		const nodes = getSchemaNodes(["plain", null, 42, { "@type": "Keep" }]);
		expect(nodes).toHaveLength(1);
		expect(nodes[0]?.["@type"]).toBe("Keep");
	});

	it("빈 배열은 빈 결과", () => {
		expect(getSchemaNodes([])).toEqual([]);
	});
});

// ===========================================================================
// isPresent
// ===========================================================================

describe("isPresent", () => {
	it("비어있지 않은 문자열은 true, 빈/공백 문자열은 false", () => {
		expect(isPresent("hello")).toBe(true);
		expect(isPresent("")).toBe(false);
		expect(isPresent("   ")).toBe(false);
	});

	it("null/undefined 는 false", () => {
		expect(isPresent(null)).toBe(false);
		expect(isPresent(undefined)).toBe(false);
	});

	it("빈 객체는 false, 키가 있는 객체는 true", () => {
		expect(isPresent({})).toBe(false);
		expect(isPresent({ a: 1 })).toBe(true);
	});

	it("빈 배열은 false, 원소가 있는 배열은 true", () => {
		expect(isPresent([])).toBe(false);
		expect(isPresent([1])).toBe(true);
	});

	it("유한 숫자는 true, NaN/Infinity 는 false", () => {
		expect(isPresent(0)).toBe(true);
		expect(isPresent(3.14)).toBe(true);
		expect(isPresent(Number.NaN)).toBe(false);
		expect(isPresent(Number.POSITIVE_INFINITY)).toBe(false);
	});
});

// ===========================================================================
// isLocalBusinessNode
// ===========================================================================

describe("isLocalBusinessNode", () => {
	it("literal 'LocalBusiness' 는 true", () => {
		expect(isLocalBusinessNode({ "@type": "LocalBusiness" })).toBe(true);
	});

	it("*Store/*Cafe/*Restaurant 접미사 타입은 true", () => {
		expect(isLocalBusinessNode({ "@type": "ClothingStore" })).toBe(true);
		expect(isLocalBusinessNode({ "@type": "CafeOrCoffeeShop" })).toBe(true);
		expect(isLocalBusinessNode({ "@type": "Restaurant" })).toBe(true);
		expect(isLocalBusinessNode({ "@type": "HairSalon" })).toBe(true);
	});

	it("@type 가 string[] 인 경우도 처리한다", () => {
		expect(isLocalBusinessNode({ "@type": ["Thing", "BakeryStore"] })).toBe(
			true,
		);
		expect(isLocalBusinessNode({ "@type": ["Organization", "WebSite"] })).toBe(
			false,
		);
	});

	it("무관 타입/누락은 false", () => {
		expect(isLocalBusinessNode({ "@type": "WebSite" })).toBe(false);
		expect(isLocalBusinessNode({})).toBe(false);
		expect(isLocalBusinessNode(null)).toBe(false);
	});
});

// ===========================================================================
// isOrganizationNode
// ===========================================================================

describe("isOrganizationNode", () => {
	it("Organization/Corporation/NGO 및 *Organization 접미사는 true", () => {
		expect(isOrganizationNode({ "@type": "Organization" })).toBe(true);
		expect(isOrganizationNode({ "@type": "Corporation" })).toBe(true);
		expect(isOrganizationNode({ "@type": "NGO" })).toBe(true);
		expect(isOrganizationNode({ "@type": "EducationalOrganization" })).toBe(
			true,
		);
	});

	it("@type string[] 처리 + 무관 타입은 false", () => {
		expect(isOrganizationNode({ "@type": ["Thing", "Corporation"] })).toBe(
			true,
		);
		expect(isOrganizationNode({ "@type": "LocalBusiness" })).toBe(false);
		expect(isOrganizationNode(null)).toBe(false);
	});
});

// ===========================================================================
// isFaqPageNode
// ===========================================================================

describe("isFaqPageNode", () => {
	it("FAQPage literal/배열은 true, 그 외 false", () => {
		expect(isFaqPageNode({ "@type": "FAQPage" })).toBe(true);
		expect(isFaqPageNode({ "@type": ["WebPage", "FAQPage"] })).toBe(true);
		expect(isFaqPageNode({ "@type": "WebPage" })).toBe(false);
		expect(isFaqPageNode(undefined)).toBe(false);
	});
});

// ===========================================================================
// getName
// ===========================================================================

describe("getName", () => {
	it("trim 한 name 반환, 빈/공백/누락은 null", () => {
		expect(getName({ name: "  테스트 카페  " })).toBe("테스트 카페");
		expect(getName({ name: "   " })).toBeNull();
		expect(getName({ name: 42 })).toBeNull();
		expect(getName({})).toBeNull();
		expect(getName(null)).toBeNull();
	});
});

// ===========================================================================
// getTelephone — 최상위 + contactPoint.telephone
// ===========================================================================

describe("getTelephone", () => {
	it("최상위 telephone 을 우선 사용한다", () => {
		expect(getTelephone({ telephone: "  02-1234-5678 " })).toBe("02-1234-5678");
	});

	it("최상위 telephone 누락 시 contactPoint(객체).telephone 탐색", () => {
		expect(
			getTelephone({ contactPoint: { telephone: "031-111-2222" } }),
		).toBe("031-111-2222");
	});

	it("contactPoint 가 배열이면 첫 유효 telephone 사용", () => {
		expect(
			getTelephone({
				contactPoint: [
					{ contactType: "sales" },
					{ telephone: "1588-1234" },
				],
			}),
		).toBe("1588-1234");
	});

	it("telephone 이 전혀 없으면 null", () => {
		expect(getTelephone({ contactPoint: { contactType: "sales" } })).toBeNull();
		expect(getTelephone({})).toBeNull();
		expect(getTelephone(null)).toBeNull();
	});
});

// ===========================================================================
// getPostalAddress — string / object
// ===========================================================================

describe("getPostalAddress", () => {
	it("문자열 주소는 trim 하여 반환", () => {
		expect(getPostalAddress({ address: "  서울 강남구 테헤란로 1  " })).toBe(
			"서울 강남구 테헤란로 1",
		);
	});

	it("PostalAddress 객체는 파싱된 객체 반환", () => {
		const result = getPostalAddress({
			address: {
				"@type": "PostalAddress",
				streetAddress: "테헤란로 1",
				addressLocality: "강남구",
			},
		});
		expect(typeof result).toBe("object");
		expect(result).not.toBeNull();
		if (result && typeof result === "object") {
			expect(result.streetAddress).toBe("테헤란로 1");
			expect(result.addressLocality).toBe("강남구");
		}
	});

	it("빈 객체/누락/빈 문자열은 null", () => {
		expect(getPostalAddress({ address: {} })).toBeNull();
		expect(getPostalAddress({ address: "   " })).toBeNull();
		expect(getPostalAddress({})).toBeNull();
		expect(getPostalAddress(null)).toBeNull();
	});
});

// ===========================================================================
// getAggregateRating
// ===========================================================================

describe("getAggregateRating", () => {
	it("aggregateRating 객체를 파싱하여 반환", () => {
		const ar = getAggregateRating({
			aggregateRating: {
				"@type": "AggregateRating",
				ratingValue: "4.5",
				reviewCount: 120,
			},
		});
		expect(ar).not.toBeNull();
		expect(ar?.ratingValue).toBe("4.5");
		expect(ar?.reviewCount).toBe(120);
	});

	it("빈 객체/누락은 null", () => {
		expect(getAggregateRating({ aggregateRating: {} })).toBeNull();
		expect(getAggregateRating({})).toBeNull();
		expect(getAggregateRating(null)).toBeNull();
	});
});

// ===========================================================================
// getOpeningHours
// ===========================================================================

describe("getOpeningHours", () => {
	it("문자열 openingHours 는 1-원소 배열", () => {
		expect(getOpeningHours({ openingHours: "  Mo-Fr 09:00-18:00 " })).toEqual([
			"Mo-Fr 09:00-18:00",
		]);
	});

	it("배열 openingHours 는 문자열만 필터링", () => {
		expect(
			getOpeningHours({
				openingHours: ["Mo 09:00-18:00", "", 42, "Tu 09:00-18:00"],
			}),
		).toEqual(["Mo 09:00-18:00", "Tu 09:00-18:00"]);
	});

	it("openingHoursSpecification 폴백도 인식", () => {
		expect(
			getOpeningHours({ openingHoursSpecification: "Sa 10:00-15:00" }),
		).toEqual(["Sa 10:00-15:00"]);
	});

	it("누락 시 빈 배열", () => {
		expect(getOpeningHours({})).toEqual([]);
		expect(getOpeningHours(null)).toEqual([]);
	});
});
