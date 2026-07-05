/**
 * X-SAG Core Engine — AEO Analyzer 단위 테스트
 *
 * 5 케이스:
 * 1. FAQ 있음 → AEO-FAQ-001 통과
 * 2. FAQ Schema 있음 → AEO-FAQ-SCHEMA-001 통과
 * 3. 가격 정보 있음 → AEO-PRICE-INFO-001 통과
 * 4. 질문형 제목 있음 → AEO-QUESTION-FORMAT-001 통과
 * 5. 지역+서비스 조합 → AEO-LOCAL-SERVICE-001 통과
 *
 * Crawler/Parser 의존 없음. mock ParsedPage 사용.
 */

import { describe, expect, it } from "vitest";
import { analyzeAEO } from "../analyzers/aeo.js";
import type { RuleContext } from "../analyzers/types.js";
import type { ParsedPage } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://hongdae-hairsalon.co.kr/",
		statusCode: 200,
		title: "홍대 미용실 | 헤어살롱 블루밍",
		description: "홍대 합정 근처 여성 커트, 염색, 펌 전문 미용실입니다.",
		h1: "홍대 여성 전문 미용실 블루밍",
		h2: ["서비스 안내", "가격 안내", "오시는 길"],
		meta: {
			viewport: "width=device-width, initial-scale=1",
		},
		bodyText:
			"홍대 미용실 블루밍에 오신 것을 환영합니다. 여성 커트 2만원부터, 염색 6만원부터, 펌 8만원부터 제공합니다. " +
			"시술 소요 시간은 커트 30분, 펌 2시간입니다. 초보자도 부담 없이 이용할 수 있습니다. " +
			"예약 문의: 02-1234-5678. 서울 마포구 홍대입구로 10. 사업자등록번호 456-78-90123.",
		wordCount: 80,
		internalLinks: [
			"https://hongdae-hairsalon.co.kr/services",
			"https://hongdae-hairsalon.co.kr/reservation",
			"https://hongdae-hairsalon.co.kr/faq",
		],
		externalLinks: [],
		images: [{ src: "/img/salon.jpg", alt: "미용실 내부" }],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: "https://hongdae-hairsalon.co.kr/",
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
			businessName: "블루밍",
			industry: "미용실",
			region: "홍대",
			mainServices: ["커트", "염색", "펌"],
			targetKeywords: ["홍대 미용실", "여성 커트", "염색"],
		},
	};
}

// ---------------------------------------------------------------------------
// Test Case 1: FAQ 있음 → AEO-FAQ-001 통과
// ---------------------------------------------------------------------------
describe("AEO-FAQ-001: FAQ 섹션 존재", () => {
	it("hasFAQ=true 이면 통과", () => {
		const ctx = makeContext({ hasFAQ: true });
		const result = analyzeAEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "AEO-FAQ-001");
		expect(rule).toBeDefined();
		expect(rule!.passed).toBe(true);
		expect(rule!.severity).toBe("high");
		expect(rule!.actionType).toBe("snippet_action");
		expect(rule!.ruleWeight).toBe(10);
	});

	it("hasFAQ=false 이면 실패, 권고사항 포함", () => {
		const ctx = makeContext({ hasFAQ: false });
		const result = analyzeAEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "AEO-FAQ-001");
		expect(rule!.passed).toBe(false);
		expect(rule!.recommendation).toBeTruthy();
		expect(rule!.recommendation.length).toBeGreaterThan(10);
	});
});

describe("AEO rule semantic copy guards", () => {
	it("AEO-SERVICE-DESC-001 names missing service values in the recommendation", () => {
		const ctx = makeContext({
			bodyText: "cut service is available by reservation.",
		});
		ctx.businessProfile.mainServices = ["cut", "color", "perm"];

		const result = analyzeAEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "AEO-SERVICE-DESC-001",
		);

		expect(rule?.passed).toBe(false);
		expect(rule?.description).toContain("missingServices");
		expect(rule?.recommendation).toContain("color");
		expect(rule?.recommendation).toContain("mainServices");
		expect(rule?.recommendation).toContain("Example service section");
	});
});

// ---------------------------------------------------------------------------
// Test Case 2: FAQ Schema 있음 → AEO-FAQ-SCHEMA-001 통과
// ---------------------------------------------------------------------------
describe("AEO-FAQ-SCHEMA-001: FAQ Schema JSON-LD 존재", () => {
	it("FAQPage JSON-LD 가 있으면 통과", () => {
		const ctx = makeContext({
			schemaJsonLd: [
				{
					"@context": "https://schema.org",
					"@type": "FAQPage",
					mainEntity: [
						{
							"@type": "Question",
							name: "커트 가격은 얼마인가요?",
							acceptedAnswer: {
								"@type": "Answer",
								text: "2만원부터 시작합니다.",
							},
						},
					],
				},
			],
			hasSchema: true,
		});
		const result = analyzeAEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "AEO-FAQ-SCHEMA-001");
		expect(rule!.passed).toBe(true);
		expect(rule!.severity).toBe("medium");
		expect(rule!.ruleWeight).toBe(6);
	});

	it("FAQ Schema 없으면 실패, snippet_action 권고", () => {
		const ctx = makeContext({ schemaJsonLd: [] });
		const result = analyzeAEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "AEO-FAQ-SCHEMA-001");
		expect(rule!.passed).toBe(false);
		expect(rule!.actionType).toBe("snippet_action");
	});
});

// ---------------------------------------------------------------------------
// Test Case 3: 가격 정보 있음 → AEO-PRICE-INFO-001 통과
// ---------------------------------------------------------------------------
describe("AEO-PRICE-INFO-001: 가격/요금 정보 포함", () => {
	it("본문에 '만원'이 있으면 통과", () => {
		const ctx = makeContext({
			bodyText:
				"여성 커트 2만원, 염색 6만원, 펌 8만원부터 시작합니다. 예약 문의주세요.",
		});
		const result = analyzeAEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "AEO-PRICE-INFO-001");
		expect(rule!.passed).toBe(true);
		expect(rule!.evidence.some((e) => e.includes("만원"))).toBe(true);
	});

	it("가격 정보 없으면 실패", () => {
		const ctx = makeContext({
			bodyText:
				"블루밍 미용실에 오신 것을 환영합니다. 다양한 서비스를 제공합니다.",
		});
		const result = analyzeAEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "AEO-PRICE-INFO-001");
		expect(rule!.passed).toBe(false);
		expect(rule!.actionType).toBe("self_fix");
		expect(rule!.difficulty).toBe("easy");
	});

	it("₩ 기호가 있어도 통과", () => {
		const ctx = makeContext({
			bodyText:
				"커트 ₩20,000, 염색 ₩60,000부터. 합리적인 가격으로 서비스합니다.",
		});
		const result = analyzeAEO(ctx);
		const rule = result.results.find((r) => r.ruleId === "AEO-PRICE-INFO-001");
		expect(rule!.passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Test Case 4: 질문형 제목 있음 → AEO-QUESTION-FORMAT-001 통과
// ---------------------------------------------------------------------------
describe("AEO-QUESTION-FORMAT-001: 질문형 H2 소제목", () => {
	it("H2에 '어떻게' 포함되면 통과", () => {
		const ctx = makeContext({
			h2: ["미용실 이용 방법은 어떻게 되나요?", "가격 안내", "오시는 길"],
		});
		const result = analyzeAEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "AEO-QUESTION-FORMAT-001",
		);
		expect(rule!.passed).toBe(true);
		expect(rule!.evidence.some((e) => e.includes("어떻게"))).toBe(true);
	});

	it("H2에 '얼마나' 포함되면 통과", () => {
		const ctx = makeContext({
			h2: ["펌은 얼마나 걸리나요?", "예약 방법"],
		});
		const result = analyzeAEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "AEO-QUESTION-FORMAT-001",
		);
		expect(rule!.passed).toBe(true);
	});

	it("질문형 H2가 없으면 실패", () => {
		const ctx = makeContext({
			h2: ["서비스 안내", "가격표", "위치"],
		});
		const result = analyzeAEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "AEO-QUESTION-FORMAT-001",
		);
		expect(rule!.passed).toBe(false);
		expect(rule!.actionType).toBe("self_fix");
	});
});

// ---------------------------------------------------------------------------
// Test Case 5: 지역+서비스 조합 → AEO-LOCAL-SERVICE-001 통과
// ---------------------------------------------------------------------------
describe("AEO-LOCAL-SERVICE-001: 지역+서비스 조합 표현", () => {
	it("title에 '홍대 커트' 조합이 있으면 통과", () => {
		const ctx = makeContext({
			title: "홍대 커트 전문 미용실 블루밍",
		});
		const result = analyzeAEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "AEO-LOCAL-SERVICE-001",
		);
		expect(rule!.passed).toBe(true);
		expect(rule!.evidence.some((e) => e.includes("홍대"))).toBe(true);
	});

	it("description에 '홍대 염색' 조합이 있어도 통과", () => {
		const ctx = makeContext({
			description: "홍대 염색 전문 미용실 블루밍. 합리적 가격으로 예쁘게.",
		});
		const result = analyzeAEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "AEO-LOCAL-SERVICE-001",
		);
		expect(rule!.passed).toBe(true);
	});

	it("지역과 서비스가 모두 없는 context에서는 실패", () => {
		const ctx = makeContext({
			title: "미용실",
			description: "헤어 서비스 제공",
			bodyText: "미용실 서비스 안내입니다.",
		});
		ctx.businessProfile.region = "홍대";
		ctx.businessProfile.mainServices = ["커트", "염색", "펌"];
		const result = analyzeAEO(ctx);
		const rule = result.results.find(
			(r) => r.ruleId === "AEO-LOCAL-SERVICE-001",
		);
		// 지역과 서비스가 200자 이내에 없으므로 실패
		expect(rule!.passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 전체 결과 구조 확인
// ---------------------------------------------------------------------------
describe("analyzeAEO 결과 구조", () => {
	it("category 가 aeo 이고 results 가 배열이다", () => {
		const ctx = makeContext();
		const result = analyzeAEO(ctx);
		expect(result.category).toBe("aeo");
		expect(Array.isArray(result.results)).toBe(true);
		expect(result.results.length).toBeGreaterThanOrEqual(10);
	});

	it("모든 RuleResult 에 필수 필드가 있다", () => {
		const ctx = makeContext();
		const result = analyzeAEO(ctx);
		for (const r of result.results) {
			expect(r.ruleId).toBeTruthy();
			expect(r.category).toBe("aeo");
			expect(typeof r.passed).toBe("boolean");
			expect(r.recommendation.length).toBeGreaterThan(0);
		}
	});
});
