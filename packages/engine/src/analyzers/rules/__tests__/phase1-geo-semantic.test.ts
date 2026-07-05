/**
 * X-SAG Core Engine — Phase 1 GEO 시맨틱 마이그레이션 테스트
 *
 * high-weight(10) NAP 룰들을 bodyText 정규식 → 다층 시맨틱 검증으로 이관한 뒤,
 * 각 룰에 대해
 *   - FALSE-POSITIVE 픽스처: 예시 텍스트/불일치 회사명 → 이제 올바르게 실패
 *   - TRUE-POSITIVE 픽스처: 실제 schema / region 부합 NAP → 여전히 통과
 * 를 검증한다.
 *
 * RuleContext 는 extractedEntities 를 채우지 않은 plain 형태로 전달한다.
 * (각 룰이 buildExtractedEntities inline-fallback 으로 안전하게 추출)
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	geoAddress001,
	geoContact001,
	geoNapConsistency001,
	geoPhone001,
	geoTrust001,
} from "../geo-rules.js";

// ---------------------------------------------------------------------------
// Helpers (gap1-precision-rules.test.ts 스타일)
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://lesignal.co.kr/",
		statusCode: 200,
		title: "르시그널 강남 브런치카페",
		description: "강남 브런치카페 르시그널입니다.",
		h1: "르시그널",
		h2: ["메뉴", "오시는 길"],
		meta: {
			viewport: "width=device-width, initial-scale=1",
			description: "강남 브런치카페 르시그널입니다.",
		},
		bodyText: "르시그널에 오신 것을 환영합니다.",
		wordCount: 10,
		internalLinks: [],
		externalLinks: [],
		images: [],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: null,
		robotsMeta: null,
		...overrides,
	};
}

function makeCtx(
	pageOverrides: Partial<ParsedPage> = {},
	profileOverrides: Partial<RuleContext["businessProfile"]> = {},
): RuleContext {
	const mainPage = makePage(pageOverrides);
	return {
		pages: [mainPage],
		mainPage,
		businessProfile: {
			businessName: "르시그널",
			industry: "카페",
			region: "강남",
			mainServices: ["브런치", "핸드드립"],
			targetKeywords: ["강남 카페", "브런치"],
			...profileOverrides,
		},
	};
}

// ===========================================================================
// GEO-TRUST-001 — 예시 전화/주소 제거, 실제 신호 요구
// ===========================================================================

describe("GEO-TRUST-001: 신뢰 정보 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 예시 전화/주소만 있으면 실패", () => {
		// 예전 정규식은 '예시: 010-0000-0000', '강남대로 100' 같은 placeholder 를
		// 신뢰 신호로 카운트해 통과시켰다. 이제 example 문맥으로 제외 → trust<2 → 실패.
		const r = geoTrust001(
			makeCtx({
				bodyText:
					"입력 형식입니다 예시) 전화번호 010-0000-0000, 주소 예시: 서울특별시 강남구 강남대로 100 처럼 작성하세요.",
			}),
		);
		expect(r.ruleId).toBe("GEO-TRUST-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 전화 + 주소 (지역 부합) 있으면 통과", () => {
		const r = geoTrust001(
			makeCtx({
				bodyText:
					"르시그널 카페입니다. 전화: 02-555-1234. 주소: 서울특별시 강남구 강남대로 100. 사업자등록번호 123-45-67890.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema telephone+address 있으면 본문 없어도 통과", () => {
		const r = geoTrust001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{
						"@type": "CafeOrCoffeeShop",
						name: "르시그널",
						telephone: "02-555-1234",
						address: {
							"@type": "PostalAddress",
							streetAddress: "강남대로 100",
						},
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-CONTACT-001 — schema/tel·mailto 우선, 예시 이메일/문서 키워드 거부
// ===========================================================================

describe("GEO-CONTACT-001: 연락 수단 시맨틱 검증", () => {
	it("FALSE-POSITIVE: example@test.com + 예시 전화만 있으면 실패", () => {
		const r = geoContact001(
			makeCtx({
				bodyText:
					"문의 양식 작성 예시입니다. 이메일 형식: example@test.com, 전화 예시) 010-0000-0000 형식으로 입력하세요.",
			}),
		);
		expect(r.ruleId).toBe("GEO-CONTACT-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 전화번호(지역 부합)면 통과", () => {
		const r = geoContact001(
			makeCtx({ bodyText: "예약 문의: 02-555-1234 로 연락 주세요." }),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 실제 이메일이면 통과", () => {
		const r = geoContact001(
			makeCtx({ bodyText: "문의: reservation@lesignal.co.kr 으로 보내주세요." }),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema contactPoint.telephone 이면 통과", () => {
		const r = geoContact001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{
						"@type": "Organization",
						name: "르시그널",
						contactPoint: {
							"@type": "ContactPoint",
							telephone: "02-555-1234",
						},
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-ADDRESS-001 — schema PostalAddress 우선, 예시 주소 제외
// ===========================================================================

describe("GEO-ADDRESS-001: 주소 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '형식입니다' 예시 주소만 있으면 실패", () => {
		const r = geoAddress001(
			makeCtx({
				bodyText:
					"주소 입력 형식입니다: 서울특별시 강남구 강남대로 100 형식으로 작성하세요.",
			}),
		);
		expect(r.ruleId).toBe("GEO-ADDRESS-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 도로명 주소면 통과", () => {
		const r = geoAddress001(
			makeCtx({
				bodyText: "오시는 길: 서울특별시 강남구 강남대로 100 르시그널 빌딩 2층.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema PostalAddress 면 본문 없어도 통과", () => {
		const r = geoAddress001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{
						"@type": "LocalBusiness",
						name: "르시그널",
						address: {
							"@type": "PostalAddress",
							addressRegion: "서울",
							addressLocality: "강남구",
							streetAddress: "강남대로 100",
						},
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-PHONE-001 — schema telephone 우선, 지역코드 부합, 예시 제외
// ===========================================================================

describe("GEO-PHONE-001: 전화번호 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '(예시)' 문맥 전화만 있으면 실패", () => {
		const r = geoPhone001(
			makeCtx({
				bodyText: "전화번호 (예시) 010-0000-0000 형식으로 입력하세요.",
			}),
		);
		expect(r.ruleId).toBe("GEO-PHONE-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 전화번호(지역 부합)면 통과", () => {
		const r = geoPhone001(makeCtx({ bodyText: "전화: 02-555-1234" }));
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema telephone 이면 통과", () => {
		const r = geoPhone001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{ "@type": "Store", name: "르시그널", telephone: "02-555-1234" },
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-NAP-CONSISTENCY-001 — 상호 일관성 (지역코드 / 업체명 충돌)
// ===========================================================================

describe("GEO-NAP-CONSISTENCY-001: NAP 상호 일관성", () => {
	it("FALSE-POSITIVE: 지역(강남)과 전화 지역번호(부산 051) 불일치면 실패", () => {
		// 이름·주소·전화 3개가 모두 '존재'하지만 전화 지역번호가 region 과 어긋남 → 불일치 실패.
		const r = geoNapConsistency001(
			makeCtx({
				bodyText:
					"르시그널 카페. 주소: 서울특별시 강남구 강남대로 100. 전화: 051-123-4567.",
			}),
		);
		expect(r.ruleId).toBe("GEO-NAP-CONSISTENCY-001");
		expect(r.passed).toBe(false);
		expect(r.evidence[3]).toContain("불일치");
	});

	it("FALSE-POSITIVE: footer schema 업체명이 프로필과 충돌하면 실패", () => {
		// 본문에 NAP 3개가 있어도 schema name 이 전혀 다른 회사명이면 충돌로 실패.
		const r = geoNapConsistency001(
			makeCtx({
				bodyText:
					"르시그널 카페. 주소: 서울특별시 강남구 강남대로 100. 전화: 02-555-1234.",
				schemaJsonLd: [
					{
						"@type": "Organization",
						name: "전혀다른상호주식회사",
						telephone: "02-555-1234",
					},
				],
			}),
		);
		expect(r.passed).toBe(false);
		expect(r.evidence[3]).toContain("불일치");
	});

	it("TRUE-POSITIVE: 이름/주소/전화 모두 존재 + 지역 일관되면 통과", () => {
		const r = geoNapConsistency001(
			makeCtx({
				bodyText:
					"르시그널 카페. 주소: 서울특별시 강남구 강남대로 100. 전화: 02-555-1234.",
			}),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence[3]).toContain("일치");
	});

	it("TRUE-POSITIVE: schema name 이 프로필 업체명과 일치하면 통과", () => {
		const r = geoNapConsistency001(
			makeCtx({
				bodyText:
					"르시그널 카페. 주소: 서울특별시 강남구 강남대로 100. 전화: 02-555-1234.",
				schemaJsonLd: [
					{
						"@type": "CafeOrCoffeeShop",
						name: "르시그널",
						telephone: "02-555-1234",
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});
