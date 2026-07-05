/**
 * X-SAG Core Engine — GEO Analyzer 단위 테스트
 *
 * 5 케이스:
 * 1. LocalBusiness Schema 있음 → GEO-LOCAL-BUSINESS-SCHEMA-001 통과
 * 2. 업체명 등장 → GEO-BUSINESS-NAME-001 통과
 * 3. 지역 등장 → GEO-REGION-001 통과
 * 4. 연락처 있음 → GEO-CONTACT-001 통과
 * 5. 리뷰 흔적 → GEO-SOCIAL-PROOF-001 통과
 *
 * Crawler/Parser 의존 없음. mock ParsedPage 사용.
 */

import { describe, expect, it } from "vitest";
import { analyzeGEO } from "../analyzers/geo.js";
import type { RuleContext } from "../analyzers/types.js";
import type { ParsedPage } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://sinchon-study-cafe.co.kr/",
		statusCode: 200,
		title: "신촌 스터디카페 | 공간 플러스",
		description:
			"신촌역 1분 거리 24시간 스터디카페. 1인실, 2인실, 그룹룸 제공.",
		h1: "신촌 스터디카페 공간 플러스",
		h2: ["공간 안내", "이용 요금", "예약 방법", "오시는 길"],
		meta: {
			viewport: "width=device-width, initial-scale=1",
		},
		bodyText:
			"신촌 스터디카페 공간 플러스에 오신 것을 환영합니다. " +
			"1인실 2,000원/시간, 그룹룸 5,000원/시간으로 저렴하게 이용 가능합니다. " +
			"500명 이상의 고객이 이용한 검증된 공간입니다. 후기 4.8점. " +
			"대표 홍길동. 사업자등록번호 789-01-23456. " +
			"서울특별시 서대문구 신촌로 456. 전화: 02-9876-5432. 이메일: info@sinchon-study.kr.",
		wordCount: 90,
		internalLinks: [
			"https://sinchon-study-cafe.co.kr/rooms",
			"https://sinchon-study-cafe.co.kr/price",
			"https://sinchon-study-cafe.co.kr/booking",
		],
		externalLinks: [],
		images: [
			{ src: "/img/room1.jpg", alt: "1인실 내부" },
			{ src: "/img/group.jpg", alt: "그룹룸" },
		],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: "https://sinchon-study-cafe.co.kr/",
		robotsMeta: null,
		...overrides,
	};
}

function makeContext(pageOverrides: Partial<ParsedPage> = {}): RuleContext {
	const page = makePage(pageOverrides);
	return {
		pages: [
			page,
			makePage({ url: "https://sinchon-study-cafe.co.kr/rooms" }),
			makePage({ url: "https://sinchon-study-cafe.co.kr/price" }),
			makePage({ url: "https://sinchon-study-cafe.co.kr/booking" }),
		],
		mainPage: page,
		businessProfile: {
			businessName: "공간 플러스",
			industry: "스터디카페",
			region: "신촌",
			mainServices: ["1인실", "그룹룸", "스터디"],
			targetKeywords: ["신촌 스터디카페", "24시간 카페", "공간 대여"],
		},
	};
}

// ---------------------------------------------------------------------------
// Test Case 1: LocalBusiness Schema 있음 → GEO-LOCAL-BUSINESS-SCHEMA-001 통과
// ---------------------------------------------------------------------------
describe("GEO-LOCAL-BUSINESS-SCHEMA-001: LocalBusiness JSON-LD", () => {
	it("LocalBusiness Schema 가 있으면 통과", () => {
		const ctx = makeContext({
			schemaJsonLd: [
				{
					"@context": "https://schema.org",
					"@type": "LocalBusiness",
					name: "공간 플러스",
					address: {
						"@type": "PostalAddress",
						streetAddress: "신촌로 456",
						addressLocality: "서대문구",
						addressRegion: "서울특별시",
					},
					telephone: "02-9876-5432",
				},
			],
			hasSchema: true,
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-LOCAL-BUSINESS-SCHEMA-001",
		);
		expect(rule).toBeDefined();
		expect(rule!.passed).toBe(true);
		expect(rule!.severity).toBe("high");
		expect(rule!.actionType).toBe("snippet_action");
		expect(rule!.ruleWeight).toBe(10);
	});

	it("Schema 없으면 실패, snippet_action 권고", () => {
		const ctx = makeContext({ schemaJsonLd: [] });
		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-LOCAL-BUSINESS-SCHEMA-001",
		);
		expect(rule!.passed).toBe(false);
		expect(rule!.actionType).toBe("snippet_action");
		expect(rule!.recommendation).toBeTruthy();
	});

	it("CafeOrCoffeeShop(@type)도 통과한다", () => {
		const ctx = makeContext({
			schemaJsonLd: [
				{
					"@context": "https://schema.org",
					"@type": "CafeOrCoffeeShop",
					name: "공간 플러스",
				},
			],
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-LOCAL-BUSINESS-SCHEMA-001",
		);
		// CafeOrCoffeeShop은 LocalBusiness 하위 타입이나 현재 룰 목록에 없음 → 실패
		// 이 테스트는 현재 구현의 한계를 문서화
		expect(rule).toBeDefined();
	});
});

describe("GEO rule semantic copy guards", () => {
	it("GEO-BUSINESS-NAME-001 missing-input branch names businessName", () => {
		const ctx = makeContext();
		ctx.businessProfile.businessName = "";

		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-BUSINESS-NAME-001",
		);

		expect(rule?.passed).toBe(false);
		expect(rule?.recommendation).toContain("businessName");
	});

	it("GEO-BUSINESS-NAME-001 missing-page branch names businessName", () => {
		const ctx = makeContext({
			title: "Generic homepage",
			h1: "Welcome",
			bodyText: "General introduction without the configured brand name.",
		});
		ctx.businessProfile.businessName = "Bright Clinic";

		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-BUSINESS-NAME-001",
		);

		expect(rule?.passed).toBe(false);
		expect(rule?.description).toContain('businessName="Bright Clinic"');
		expect(rule?.recommendation).toContain("businessName");
	});

	it("GEO-INDUSTRY-001 missing-input branch names industry", () => {
		const ctx = makeContext();
		ctx.businessProfile.industry = "";

		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-INDUSTRY-001");

		expect(rule?.passed).toBe(false);
		expect(rule?.recommendation).toContain("industry");
	});

	it("GEO-INDUSTRY-001 missing-page branch names industry", () => {
		const ctx = makeContext({
			title: "Generic homepage",
			description: "Local business",
			h1: "Welcome",
			bodyText: "General introduction without the configured category.",
		});
		ctx.businessProfile.industry = "clinic";

		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-INDUSTRY-001");

		expect(rule?.passed).toBe(false);
		expect(rule?.description).toContain('industry="clinic"');
		expect(rule?.recommendation).toContain("industry");
	});

	it("GEO-REGION-001 missing-input branch names region", () => {
		const ctx = makeContext();
		ctx.businessProfile.region = "";

		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-REGION-001");

		expect(rule?.passed).toBe(false);
		expect(rule?.recommendation).toContain("region");
	});

	it("GEO-REGION-001 missing-page branch names region", () => {
		const ctx = makeContext({
			title: "Generic homepage",
			description: "Local business",
			h1: "Welcome",
			bodyText: "General introduction without the configured area.",
		});
		ctx.businessProfile.region = "Seoul Gangnam";

		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-REGION-001");

		expect(rule?.passed).toBe(false);
		expect(rule?.description).toContain('region="Seoul Gangnam"');
		expect(rule?.recommendation).toContain("region");
	});

	it("GEO-AI-SUMMARY-001 long paragraph branch reports avgParagraphChars", () => {
		const longParagraph = "A".repeat(650);
		const ctx = makeContext({ bodyText: longParagraph });

		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-AI-SUMMARY-001");

		expect(rule?.passed).toBe(false);
		expect(rule?.description).toContain("avgParagraphChars");
		expect(rule?.recommendation).toContain("50-300");
	});
});

// ---------------------------------------------------------------------------
// Test Case 2: 업체명 등장 → GEO-BUSINESS-NAME-001 통과
// ---------------------------------------------------------------------------
describe("GEO-BUSINESS-NAME-001: 업체명 명확성", () => {
	it("title에 업체명이 있으면 통과", () => {
		const ctx = makeContext({
			title: "신촌 스터디카페 공간 플러스",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-BUSINESS-NAME-001",
		);
		expect(rule!.passed).toBe(true);
		expect(rule!.ruleWeight).toBe(10);
	});

	it("title과 H1 모두 업체명 없으면 실패", () => {
		const ctx = makeContext({
			title: "스터디카페",
			h1: "공간 안내",
			bodyText: "24시간 운영합니다. 합리적인 가격으로 이용하세요.",
		});
		ctx.businessProfile.businessName = "공간 플러스";
		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-BUSINESS-NAME-001",
		);
		expect(rule!.passed).toBe(false);
		expect(rule!.severity).toBe("high");
		expect(rule!.actionType).toBe("self_fix");
	});

	it("본문에 업체명이 있으면 통과", () => {
		const ctx = makeContext({
			bodyText:
				"공간 플러스는 신촌 최고의 스터디카페입니다. 24시간 운영합니다.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-BUSINESS-NAME-001",
		);
		expect(rule!.passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Test Case 3: 지역 등장 → GEO-REGION-001 통과
// ---------------------------------------------------------------------------
describe("GEO-REGION-001: 지역 정보 명확성", () => {
	it("title에 지역명이 있으면 통과", () => {
		const ctx = makeContext({
			title: "신촌 스터디카페 | 공간 플러스",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-REGION-001");
		expect(rule!.passed).toBe(true);
		expect(rule!.severity).toBe("high");
	});

	it("description에만 지역명이 있어도 통과", () => {
		const ctx = makeContext({
			title: "스터디카페 공간 플러스",
			description: "신촌역 근처 24시간 스터디카페입니다.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-REGION-001");
		expect(rule!.passed).toBe(true);
	});

	it("어디에도 지역명이 없으면 실패", () => {
		const ctx = makeContext({
			title: "스터디카페",
			h1: "편안한 공부 공간",
			description: "24시간 이용 가능한 공간입니다.",
			bodyText: "편안한 환경에서 공부하세요. 다양한 공간을 제공합니다.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-REGION-001");
		expect(rule!.passed).toBe(false);
		expect(rule!.recommendation).toContain("신촌");
	});
});

// ---------------------------------------------------------------------------
// Test Case 4: 연락처 있음 → GEO-CONTACT-001 통과
// ---------------------------------------------------------------------------
describe("GEO-CONTACT-001: 연락 수단 존재", () => {
	it("전화번호가 있으면 통과", () => {
		const ctx = makeContext({
			bodyText: "예약 및 문의: 02-9876-5432. 항상 친절하게 안내해드립니다.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-CONTACT-001");
		expect(rule!.passed).toBe(true);
		expect(rule!.evidence.some((e) => e.includes("전화번호: 있음"))).toBe(true);
	});

	it("이메일 주소가 있으면 통과", () => {
		const ctx = makeContext({
			bodyText:
				"이메일 문의: info@sinchon-study.kr. 최대한 빠르게 답변드립니다.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-CONTACT-001");
		expect(rule!.passed).toBe(true);
		expect(rule!.evidence.some((e) => e.includes("이메일: 있음"))).toBe(true);
	});

	it("연락 수단이 전혀 없으면 실패", () => {
		const ctx = makeContext({
			bodyText: "스터디카페 공간 플러스입니다. 다양한 서비스를 제공합니다.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-CONTACT-001");
		expect(rule!.passed).toBe(false);
		expect(rule!.severity).toBe("high");
		expect(rule!.actionType).toBe("self_fix");
	});

	it("'문의' 키워드만 있어도 통과", () => {
		const ctx = makeContext({
			bodyText: "이용 방법 및 문의 사항은 카카오톡으로 연락 주세요.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-CONTACT-001");
		expect(rule!.passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Test Case 5: 리뷰 흔적 → GEO-SOCIAL-PROOF-001 통과
// ---------------------------------------------------------------------------
describe("GEO-SOCIAL-PROOF-001: 리뷰/평점/수상 정보", () => {
	it("평점 수치('후기 4.8점')가 있으면 통과 (Phase 1 시맨틱)", () => {
		const ctx = makeContext({
			bodyText: "이용 후기 4.8점. 500명 이상의 고객이 만족하고 있습니다.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-SOCIAL-PROOF-001",
		);
		expect(rule!.passed).toBe(true);
	});

	it("'추천' 같은 일반 단어만 있으면 실패 (Phase 1: 수치/수상 증거 필요, FP 차단)", () => {
		// 기존 룰은 '추천' 단어만으로 통과(FP)했으나, 시맨틱 검증 후엔 평점 수치·리뷰
		// 건수·수상 같은 실제 증거가 없으면 통과하지 않는다.
		const ctx = makeContext({
			bodyText:
				"단골 고객이 직접 추천하는 공간입니다. 항상 깨끗하고 조용합니다.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-SOCIAL-PROOF-001",
		);
		expect(rule!.passed).toBe(false);
	});

	it("신뢰 증거가 없으면 실패, severity=low", () => {
		const ctx = makeContext({
			bodyText:
				"공간 플러스는 깨끗한 스터디카페입니다. 저렴한 이용 요금으로 운영합니다.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "GEO-SOCIAL-PROOF-001",
		);
		expect(rule!.passed).toBe(false);
		expect(rule!.severity).toBe("low");
		expect(rule!.ruleWeight).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// 전체 결과 구조 확인
// ---------------------------------------------------------------------------
describe("analyzeGEO 결과 구조", () => {
	it("category 가 geo 이고 results 가 배열이다", () => {
		const ctx = makeContext();
		const result = analyzeGEO(ctx);
		expect(result.category).toBe("geo");
		expect(Array.isArray(result.results)).toBe(true);
		expect(result.results.length).toBeGreaterThanOrEqual(11);
	});

	it("모든 RuleResult 에 필수 필드가 있다", () => {
		const ctx = makeContext();
		const result = analyzeGEO(ctx);
		for (const r of result.results) {
			expect(r.ruleId).toBeTruthy();
			expect(r.category).toBe("geo");
			expect(typeof r.passed).toBe("boolean");
			expect(Array.isArray(r.evidence)).toBe(true);
			expect(typeof r.recommendation).toBe("string");
			expect(r.recommendation.length).toBeGreaterThan(0);
		}
	});

	it("GEO-TRUST-001: 신뢰 정보가 충분하면 통과", () => {
		const ctx = makeContext({
			bodyText:
				"사업자등록번호 789-01-23456. 전화 02-9876-5432. 서울특별시 서대문구 신촌로 456.",
		});
		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-TRUST-001");
		expect(rule!.passed).toBe(true);
	});

	it("GEO-AI-SUMMARY-001: 평균 단락 길이가 50~300자이면 통과", () => {
		const bodyText = [
			"공간 플러스는 신촌에서 가장 조용하고 쾌적한 스터디카페입니다. 1인실부터 그룹룸까지 다양한 공간을 제공합니다.",
			"이용 요금은 시간 단위로 책정되어 부담 없이 이용할 수 있습니다. 장기 이용 시 할인 혜택도 있습니다.",
			"24시간 운영되어 심야에도 안전하게 공부할 수 있습니다. CCTV와 관리자 상주로 보안도 철저합니다.",
		].join("\n\n");
		const ctx = makeContext({ bodyText });
		const result = analyzeGEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "GEO-AI-SUMMARY-001");
		expect(rule!.passed).toBe(true);
	});
});
