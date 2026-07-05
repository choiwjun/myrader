/**
 * X-SAG Core Engine — Snippet Generator 단위 테스트
 *
 * TASK-CORE-009: 7가지 스니펫 생성기 검증
 * 10개 이상 케이스.
 */

import { describe, expect, it } from "vitest";
import {
	type SnippetInput,
	generateMany,
	generateSnippet,
} from "../snippets/index.js";

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

const BASE_INPUT: SnippetInput = {
	businessProfile: {
		businessName: "강남 르카페",
		industry: "카페/커피전문점",
		region: "서울특별시 강남구",
		websiteUrl: "https://example-cafe.co.kr",
		mainServices: ["핸드드립 커피", "에스프레소 음료", "디저트"],
		targetKeywords: ["강남 카페", "강남 핸드드립", "강남역 커피"],
		phone: "02-1234-5678",
		email: "hello@example-cafe.co.kr",
		address: "서울특별시 강남구 테헤란로 123",
		operatingHours: [
			{ day: "Mo-Fr", open: "09:00", close: "21:00" },
			{ day: "Sa-Su", open: "10:00", close: "20:00" },
		],
	},
	faqs: [
		{
			question: "영업 시간이 어떻게 되나요?",
			answer: "평일 09:00~21:00, 주말 10:00~20:00입니다.",
		},
		{
			question: "주차 가능한가요?",
			answer: "건물 내 유료 주차장을 이용하실 수 있습니다.",
		},
	],
	breadcrumbs: [
		{ name: "홈", url: "https://example-cafe.co.kr" },
		{ name: "메뉴", url: "https://example-cafe.co.kr/menu" },
		{ name: "핸드드립", url: "https://example-cafe.co.kr/menu/hand-drip" },
	],
};

// ---------------------------------------------------------------------------
// 1. LocalBusiness JSON-LD — @type=LocalBusiness, JSON.parse 성공
// ---------------------------------------------------------------------------

describe("LocalBusiness Generator", () => {
	it("JSON.parse 성공하고 @type=LocalBusiness 인지 확인", () => {
		const out = generateSnippet("LOCAL_BUSINESS", BASE_INPUT);

		expect(out.type).toBe("LOCAL_BUSINESS");
		expect(out.format).toBe("json-ld");
		expect(out.aiGenerated).toBe(false);
		expect(out.installLocation).toBe("head");

		// Extract JSON from <script> tag
		const match = out.code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		expect(match).not.toBeNull();
		const parsed = JSON.parse(match![1]!);

		expect(parsed["@context"]).toBe("https://schema.org");
		expect(parsed["@type"]).toBe("LocalBusiness");
		expect(parsed.name).toBe("강남 르카페");
		expect(parsed.telephone).toBe("02-1234-5678");
		expect(parsed.address["@type"]).toBe("PostalAddress");
		expect(parsed.address.addressCountry).toBe("KR");
		expect(parsed.openingHours).toHaveLength(2);
	});

	it("phone/email 없는 경우에도 JSON.parse 성공", () => {
		const input: SnippetInput = {
			businessProfile: {
				...BASE_INPUT.businessProfile,
				phone: undefined,
				email: undefined,
				operatingHours: undefined,
			},
		};
		const out = generateSnippet("LOCAL_BUSINESS", input);
		const match = out.code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		const parsed = JSON.parse(match![1]!);
		expect(parsed["@type"]).toBe("LocalBusiness");
		expect(parsed.telephone).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// 2. Organization JSON-LD — name 포함 확인
// ---------------------------------------------------------------------------

describe("Organization Generator", () => {
	it("name 포함, sameAs 빈 배열, JSON.parse 성공", () => {
		const out = generateSnippet("ORGANIZATION", BASE_INPUT);

		expect(out.type).toBe("ORGANIZATION");
		expect(out.format).toBe("json-ld");
		expect(out.aiGenerated).toBe(false);

		const match = out.code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		const parsed = JSON.parse(match![1]!);

		expect(parsed["@context"]).toBe("https://schema.org");
		expect(parsed["@type"]).toBe("Organization");
		expect(parsed.name).toBe("강남 르카페");
		expect(Array.isArray(parsed.sameAs)).toBe(true);
		expect(parsed.sameAs).toHaveLength(0);
		expect(parsed.logo["@type"]).toBe("ImageObject");
	});
});

// ---------------------------------------------------------------------------
// 3. Service JSON-LD — ItemList 또는 배열 구조
// ---------------------------------------------------------------------------

describe("Service Generator", () => {
	it("복수 서비스 → ItemList 구조", () => {
		const out = generateSnippet("SERVICE", BASE_INPUT);

		const match = out.code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		const parsed = JSON.parse(match![1]!);

		expect(parsed["@type"]).toBe("ItemList");
		expect(Array.isArray(parsed.itemListElement)).toBe(true);
		expect(parsed.itemListElement).toHaveLength(3);
		expect(parsed.itemListElement[0].item["@type"]).toBe("Service");
	});

	it("단일 서비스 → Service 타입 직접 출력", () => {
		const input: SnippetInput = {
			businessProfile: {
				...BASE_INPUT.businessProfile,
				mainServices: ["핸드드립 커피"],
			},
		};
		const out = generateSnippet("SERVICE", input);
		const match = out.code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		const parsed = JSON.parse(match![1]!);
		expect(parsed["@type"]).toBe("Service");
		expect(parsed.name).toBe("핸드드립 커피");
	});

	it("빈 mainServices → itemListElement 빈 배열", () => {
		const input: SnippetInput = {
			businessProfile: {
				...BASE_INPUT.businessProfile,
				mainServices: [],
			},
		};
		const out = generateSnippet("SERVICE", input);
		const match = out.code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		const parsed = JSON.parse(match![1]!);
		expect(parsed["@type"]).toBe("ItemList");
		expect(parsed.itemListElement).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 4. FAQ Schema JSON-LD — mainEntity 길이
// ---------------------------------------------------------------------------

describe("FAQ Schema Generator", () => {
	it("mainEntity 길이 = faqs 배열 길이", () => {
		const out = generateSnippet("FAQ_SCHEMA", BASE_INPUT);

		const match = out.code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		const parsed = JSON.parse(match![1]!);

		expect(parsed["@context"]).toBe("https://schema.org");
		expect(parsed["@type"]).toBe("FAQPage");
		expect(Array.isArray(parsed.mainEntity)).toBe(true);
		expect(parsed.mainEntity).toHaveLength(2);
		expect(parsed.mainEntity[0]["@type"]).toBe("Question");
		expect(parsed.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
	});

	it("faqs 누락 → mainEntity 빈 배열", () => {
		const input: SnippetInput = {
			businessProfile: BASE_INPUT.businessProfile,
			// faqs 없음
		};
		const out = generateSnippet("FAQ_SCHEMA", input);
		const match = out.code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		const parsed = JSON.parse(match![1]!);
		expect(parsed["@type"]).toBe("FAQPage");
		expect(parsed.mainEntity).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 5. Breadcrumb JSON-LD — itemListElement
// ---------------------------------------------------------------------------

describe("Breadcrumb Generator", () => {
	it("breadcrumbs 입력 → itemListElement 길이 일치, position 순서 올바름", () => {
		const out = generateSnippet("BREADCRUMB", BASE_INPUT);

		const match = out.code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		const parsed = JSON.parse(match![1]!);

		expect(parsed["@context"]).toBe("https://schema.org");
		expect(parsed["@type"]).toBe("BreadcrumbList");
		expect(Array.isArray(parsed.itemListElement)).toBe(true);
		expect(parsed.itemListElement).toHaveLength(3);
		expect(parsed.itemListElement[0].position).toBe(1);
		expect(parsed.itemListElement[0].name).toBe("홈");
		expect(parsed.itemListElement[2].name).toBe("핸드드립");
	});

	it("breadcrumbs 누락 → 기본 홈+업체명 2-item 구조", () => {
		const input: SnippetInput = {
			businessProfile: BASE_INPUT.businessProfile,
			// breadcrumbs 없음
		};
		const out = generateSnippet("BREADCRUMB", input);
		const match = out.code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		const parsed = JSON.parse(match![1]!);
		expect(parsed.itemListElement).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// 6. llms.txt — 헤더 포함 확인
// ---------------------------------------------------------------------------

describe("llms.txt Generator", () => {
	it("# Business 헤더 포함, 서비스/연락처/지역 섹션 모두 포함", () => {
		const out = generateSnippet("LLMS_TXT", BASE_INPUT);

		expect(out.type).toBe("LLMS_TXT");
		expect(out.format).toBe("plain-text");
		expect(out.installLocation).toBe("root");
		expect(out.aiGenerated).toBe(false);

		expect(out.code).toContain("# 강남 르카페");
		expect(out.code).toContain("## About");
		expect(out.code).toContain("## Services");
		expect(out.code).toContain("## Region");
		expect(out.code).toContain("## Contact");
		expect(out.code).toContain("## Trust");
		expect(out.code).toContain("02-1234-5678");
		expect(out.code).toContain("서울특별시 강남구");
	});
});

// ---------------------------------------------------------------------------
// 7. FAQ HTML — itemscope 포함 확인
// ---------------------------------------------------------------------------

describe("FAQ HTML Generator", () => {
	it("itemscope itemtype FAQPage 포함, 질문/답변 개수 일치", () => {
		const out = generateSnippet("FAQ_HTML", BASE_INPUT);

		expect(out.type).toBe("FAQ_HTML");
		expect(out.format).toBe("html");
		expect(out.installLocation).toBe("body");
		expect(out.aiGenerated).toBe(false);

		expect(out.code).toContain(
			'itemscope itemtype="https://schema.org/FAQPage"',
		);
		expect(out.code).toContain('itemtype="https://schema.org/Question"');
		expect(out.code).toContain('itemtype="https://schema.org/Answer"');
		expect(out.code).toContain("영업 시간이 어떻게 되나요?");
		expect(out.code).toContain("주차 가능한가요?");
	});

	it("faqs 누락 → 빈 FAQ 섹션 (주석 포함)", () => {
		const input: SnippetInput = {
			businessProfile: BASE_INPUT.businessProfile,
		};
		const out = generateSnippet("FAQ_HTML", input);
		expect(out.code).toContain(
			'itemscope itemtype="https://schema.org/FAQPage"',
		);
		expect(out.code).toContain("FAQ 항목이 없습니다");
	});
});

// ---------------------------------------------------------------------------
// 8. generateMany — 7가지 모두 생성
// ---------------------------------------------------------------------------

describe("generateMany", () => {
	it("7가지 SnippetType 모두 생성 성공", () => {
		const types: Parameters<typeof generateSnippet>[0][] = [
			"LOCAL_BUSINESS",
			"ORGANIZATION",
			"SERVICE",
			"FAQ_SCHEMA",
			"BREADCRUMB",
			"LLMS_TXT",
			"FAQ_HTML",
		];

		const results = generateMany(types, BASE_INPUT);

		expect(results).toHaveLength(7);
		const resultTypes = results.map((r) => r.type);
		expect(resultTypes).toEqual(types);

		// 모든 출력에 aiGenerated=false
		for (const r of results) {
			expect(r.aiGenerated).toBe(false);
			expect(r.code.length).toBeGreaterThan(0);
			expect(r.installGuide.length).toBeGreaterThan(0);
			expect(r.vendorInstruction.length).toBeGreaterThan(0);
			expect(r.verifyMethod.length).toBeGreaterThan(0);
		}
	});

	it("알 수 없는 type 전달 시 에러 throw", () => {
		expect(() => {
			generateSnippet(
				"UNKNOWN_TYPE" as Parameters<typeof generateSnippet>[0],
				BASE_INPUT,
			);
		}).toThrow("Unknown snippet type");
	});
});
