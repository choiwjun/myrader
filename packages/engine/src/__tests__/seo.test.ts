/**
 * X-SAG Core Engine — SEO Analyzer 단위 테스트
 *
 * 5 케이스:
 * 1. title 없음 → SEO-TITLE-001 실패
 * 2. title 있음 (적절한 길이) → SEO-TITLE-001/002 통과
 * 3. multiple H1 (informational 검사)
 * 4. viewport 누락 → SEO-MOBILE-001 실패
 * 5. keyword 포함 → SEO-KEYWORD-001 통과
 *
 * Crawler/Parser 의존 없음. mock ParsedPage 사용.
 */

import { describe, expect, it } from "vitest";
import { analyzeSEO } from "../analyzers/seo.js";
import type { RuleContext } from "../analyzers/types.js";
import type { ParsedPage } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example-cafe.co.kr/",
		statusCode: 200,
		title: "강남 핸드드립 카페 | 르카페",
		description:
			"강남역 근처 핸드드립 원두 커피 전문 카페입니다. 원두 직접 로스팅, 다양한 디저트 제공.",
		h1: "강남 핸드드립 카페 르카페",
		h2: ["메뉴 안내", "오시는 길", "예약 안내"],
		meta: {
			viewport: "width=device-width, initial-scale=1",
			description: "강남역 근처 핸드드립 원두 커피 전문 카페입니다.",
		},
		bodyText:
			"강남 핸드드립 카페 르카페에 오신 것을 환영합니다. 원두를 직접 로스팅하여 신선한 커피를 제공합니다. 예약 문의는 전화 주세요. 010-1234-5678. 서울특별시 강남구 테헤란로 123. 사업자등록번호 123-45-67890.",
		wordCount: 60,
		internalLinks: [
			"https://example-cafe.co.kr/menu",
			"https://example-cafe.co.kr/reservation",
			"https://example-cafe.co.kr/location",
		],
		externalLinks: [],
		images: [
			{ src: "/img/cafe.jpg", alt: "카페 인테리어" },
			{ src: "/img/coffee.jpg", alt: "핸드드립 커피" },
		],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: "https://example-cafe.co.kr/",
		robotsMeta: null,
		...overrides,
	};
}

function makeContext(pageOverrides: Partial<ParsedPage> = {}): RuleContext {
	const page = makePage(pageOverrides);
	return {
		pages: [page],
		mainPage: page,
		businessProfile: {
			businessName: "르카페",
			industry: "카페",
			region: "강남",
			mainServices: ["핸드드립", "원두", "디저트"],
			targetKeywords: ["강남 카페", "핸드드립", "원두 커피"],
		},
	};
}

// ---------------------------------------------------------------------------
// Test Case 1: title 없음
// ---------------------------------------------------------------------------
describe("SEO-TITLE-001: title 태그 존재", () => {
	it("title이 없으면 passed=false, severity=high", () => {
		const ctx = makeContext({ title: null });
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-TITLE-001");
		expect(rule).toBeDefined();
		expect(rule!.passed).toBe(false);
		expect(rule!.severity).toBe("high");
		expect(rule!.category).toBe("seo");
		expect(rule!.actionType).toBe("vendor_action");
		expect(rule!.ruleWeight).toBe(10);
	});

	it("title이 빈 문자열이면 passed=false", () => {
		const ctx = makeContext({ title: "   " });
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-TITLE-001");
		expect(rule!.passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Test Case 2: title 있음 (적절한 길이)
// ---------------------------------------------------------------------------
describe("SEO-TITLE-002: title 길이 10~60자", () => {
	it("적절한 길이의 title이면 두 규칙 모두 통과", () => {
		const title = "강남 핸드드립 카페 르카페"; // ~14자
		const ctx = makeContext({ title });
		const result = analyzeSEO(ctx);

		const rule001 = result.results.find((r) => r.ruleId === "SEO-TITLE-001");
		const rule002 = result.results.find((r) => r.ruleId === "SEO-TITLE-002");

		expect(rule001!.passed).toBe(true);
		expect(rule002!.passed).toBe(true);
	});

	it("60자 초과 title이면 SEO-TITLE-002 실패", () => {
		const longTitle =
			"강남역 2번 출구 바로 앞에 위치한 핸드드립 원두 커피 전문 카페 르카페 강남본점 오픈 기념 특별 할인 이벤트 진행 중입니다";
		expect(longTitle.length).toBeGreaterThan(60);
		const ctx = makeContext({ title: longTitle });
		const result = analyzeSEO(ctx);
		const rule002 = result.results.find((r) => r.ruleId === "SEO-TITLE-002");
		expect(rule002!.passed).toBe(false);
		expect(rule002!.severity).toBe("medium");
	});

	it("9자 미만 title이면 SEO-TITLE-002 실패", () => {
		const ctx = makeContext({ title: "르카페" }); // 3자
		const result = analyzeSEO(ctx);
		const rule002 = result.results.find((r) => r.ruleId === "SEO-TITLE-002");
		expect(rule002!.passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Test Case 3: H1 관련 규칙
// ---------------------------------------------------------------------------
describe("SEO-H1-001/002: H1 존재 및 중복", () => {
	it("H1이 있으면 SEO-H1-001 통과", () => {
		const ctx = makeContext({ h1: "강남 핸드드립 카페 르카페" });
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-H1-001");
		expect(rule!.passed).toBe(true);
		expect(rule!.ruleWeight).toBe(10);
	});

	it("H1이 없으면 SEO-H1-001 실패, actionType=vendor_action", () => {
		const ctx = makeContext({ h1: null });
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-H1-001");
		expect(rule!.passed).toBe(false);
		expect(rule!.actionType).toBe("vendor_action");
		expect(
			rule!.evidence.some((e) => e.includes("https://example-cafe.co.kr/")),
		).toBe(true);
	});

	it("SEO-H1-002: headingStructure 없으면 skip(passed=true, 확인불가 메시지)", () => {
		// makePage default has no headingStructure → undefined
		const ctx = makeContext();
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-H1-002");
		expect(rule).toBeDefined();
		expect(rule!.category).toBe("seo");
		expect(rule!.passed).toBe(true);
		expect(rule!.description).toMatch(/확인 불가|미수집/);
	});

	it("SEO-H1-002: H1이 1개면 통과", () => {
		const ctx = makeContext({
			headingStructure: [
				{ level: 1, text: "카페 르카페" },
				{ level: 2, text: "메뉴 안내" },
			],
		});
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-H1-002");
		expect(rule!.passed).toBe(true);
		expect(rule!.description).toMatch(/1개로 올바르게/);
	});

	it("SEO-H1-002: H1이 2개 이상이면 실패", () => {
		const ctx = makeContext({
			headingStructure: [
				{ level: 1, text: "카페 르카페" },
				{ level: 1, text: "두 번째 H1" },
				{ level: 2, text: "메뉴 안내" },
			],
		});
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-H1-002");
		expect(rule!.passed).toBe(false);
		expect(rule!.description).toMatch(/2개 감지/);
	});
});

// ---------------------------------------------------------------------------
// Test Case 4: viewport 누락 → SEO-MOBILE-001 실패
// ---------------------------------------------------------------------------
describe("SEO-MOBILE-001: viewport 메타 태그", () => {
	it("viewport 없으면 passed=false, severity=high", () => {
		const ctx = makeContext({ meta: {} }); // viewport 없음
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-MOBILE-001");
		expect(rule!.passed).toBe(false);
		expect(rule!.severity).toBe("high");
		expect(rule!.actionType).toBe("vendor_action");
		expect(rule!.ruleWeight).toBe(10);
	});

	it("viewport 있으면 통과", () => {
		const ctx = makeContext({
			meta: { viewport: "width=device-width, initial-scale=1" },
		});
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-MOBILE-001");
		expect(rule!.passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Test Case 5: keyword 포함 → SEO-KEYWORD-001 통과
// ---------------------------------------------------------------------------
describe("SEO-KEYWORD-001: targetKeywords 핵심 영역 포함", () => {
	it("키워드가 title에 있으면 통과", () => {
		const ctx = makeContext({
			title: "강남 카페 핸드드립 르카페",
		});
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-KEYWORD-001");
		expect(rule!.passed).toBe(true);
		expect(rule!.actionType).toBe("self_fix");
		expect(rule!.ruleWeight).toBe(10);
		expect(
			rule!.evidence.some(
				(e) => e.includes("강남 카페") || e.includes("핸드드립"),
			),
		).toBe(true);
	});

	it("키워드가 어디에도 없으면 실패", () => {
		const ctx = makeContext({
			title: "환영합니다",
			h1: null,
			description: "맛있는 음료를 즐기세요",
		});
		// Override keywords to something not in text
		ctx.businessProfile.targetKeywords = ["강남 카페", "핸드드립", "원두 커피"];
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-KEYWORD-001");
		expect(rule!.passed).toBe(false);
		expect(rule!.severity).toBe("high");
	});

	it("targetKeywords 가 빈 배열이면 통과(N/A)", () => {
		const ctx = makeContext();
		ctx.businessProfile.targetKeywords = [];
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-KEYWORD-001");
		expect(rule!.passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// SEO-OG-001: OpenGraph 메타태그 (page.meta 기반 검사)
// ---------------------------------------------------------------------------
describe("SEO-OG-001: OpenGraph 기본 메타태그", () => {
	it("OG 태그가 없으면 passed=false (bodyText에 'og:title'이 있어도 무관)", () => {
		// bodyText에 'og:title' 문자열이 있어도 meta에 없으면 실패해야 한다
		const ctx = makeContext({
			meta: { viewport: "width=device-width, initial-scale=1" },
			bodyText: "og:title og:description og:image og:url 이 텍스트는 본문입니다",
		});
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-OG-001");
		expect(rule).toBeDefined();
		expect(rule!.passed).toBe(false);
	});

	it("OG 태그 3개 이상이면 통과", () => {
		const ctx = makeContext({
			meta: {
				viewport: "width=device-width, initial-scale=1",
				"og:title": "카페 르카페",
				"og:description": "강남 핸드드립 카페",
				"og:image": "https://example.com/img.jpg",
				"og:url": "https://example.com/",
			},
		});
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-OG-001");
		expect(rule!.passed).toBe(true);
	});

	it("OG 태그 2개면 실패", () => {
		const ctx = makeContext({
			meta: {
				"og:title": "카페 르카페",
				"og:description": "강남 핸드드립 카페",
			},
		});
		const result = analyzeSEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "SEO-OG-001");
		expect(rule!.passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 전체 결과 구조 확인
// ---------------------------------------------------------------------------
describe("analyzeSEO 결과 구조", () => {
	it("category 가 seo 이고 results 가 배열이다", () => {
		const ctx = makeContext();
		const result = analyzeSEO(ctx);
		expect(result.category).toBe("seo");
		expect(Array.isArray(result.results)).toBe(true);
		expect(result.results.length).toBeGreaterThanOrEqual(16);
	});

	it("모든 RuleResult 에 필수 필드가 있다", () => {
		const ctx = makeContext();
		const result = analyzeSEO(ctx);
		for (const r of result.results) {
			expect(r.ruleId).toBeTruthy();
			expect(r.category).toBe("seo");
			expect(typeof r.passed).toBe("boolean");
			expect(["high", "medium", "low"]).toContain(r.severity);
			expect([
				"self_fix",
				"snippet_action",
				"vendor_action",
				"si_action",
			]).toContain(r.actionType);
			expect(["easy", "medium", "hard"]).toContain(r.difficulty);
			expect(["low", "medium", "high"]).toContain(r.expectedImpact);
			expect(typeof r.ruleWeight).toBe("number");
			expect(r.ruleWeight).toBeGreaterThanOrEqual(0);
			expect(r.ruleWeight).toBeLessThanOrEqual(10);
			expect(Array.isArray(r.evidence)).toBe(true);
		}
	});
});
