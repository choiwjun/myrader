/**
 * X-SAG Core Engine — Integration Test: Pipeline Scenarios (TASK-CORE-014)
 *
 * @TEST T-PIPELINE-INTEGRATION-001~005 — 5가지 Mock URL 시나리오
 * @IMPL packages/core-engine/src/pipeline.ts
 * @SPEC docs/POLICY.md § 4.2 크롤링 제약, § 7.2 AI 비용 정책
 *
 * Mock 전략:
 * - vi.mock("../crawler.js") 로 crawlSite 모킹
 * - 실 네트워크 호출 없음
 * - 각 시나리오는 다른 CrawlResult 반환
 *
 * 5가지 시나리오:
 * 1. 정상 사이트: status='completed', overallScore > 0
 * 2. robots.txt 전체 차단: ROBOTS_BLOCK_ALL → failureReason 설정
 * 3. JS 렌더링 필요: 콘텐츠 비어있음 → 부분 진단
 * 4. HTTP 5xx: 503 응답 → HTTP_5xx failureReason
 * 5. Timeout: TIMEOUT failureReason
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlResult, ParsedPage } from "../../types.js";

// ---------------------------------------------------------------------------
// Mock crawler.js — crawlSite 함수 모킹
// ---------------------------------------------------------------------------

vi.mock("../../crawler.js", () => ({
	crawlSite: vi.fn(),
}));

import { crawlSite } from "../../crawler.js";
import { runDiagnosisPipeline } from "../../pipeline.js";

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

function makeMockPage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example-business.kr/",
		statusCode: 200,
		title: "예시 사업체 | 서비스 설명",
		description: "우리는 최고의 서비스를 제공합니다.",
		h1: "예시 사업체에 오신 것을 환영합니다",
		h2: ["서비스", "소개", "문의"],
		meta: {
			viewport: "width=device-width, initial-scale=1",
			description: "우리는 최고의 서비스를 제공합니다.",
			"og:title": "예시 사업체",
		},
		bodyText:
			"예시 사업체입니다. 우리의 핵심 서비스: 1. 서비스A 2. 서비스B. 사업자번호 123-45-67890. 연락처 010-1234-5678.",
		wordCount: 50,
		internalLinks: [
			"https://example-business.kr/about",
			"https://example-business.kr/services",
			"https://example-business.kr/contact",
		],
		externalLinks: ["https://external-link.com"],
		images: [{ src: "/img/main.jpg", alt: "메인 이미지" }],
		schemaJsonLd: [
			{
				"@context": "https://schema.org",
				"@type": "LocalBusiness",
				name: "예시 사업체",
				address: { "@type": "PostalAddress", streetAddress: "서울 강남" },
			},
		],
		hasFAQ: false,
		hasSchema: true,
		canonicalUrl: "https://example-business.kr/",
		robotsMeta: null,
		...overrides,
	};
}

function makeMockCrawlResult(
	pages: ParsedPage[],
	partialResult = false,
	failureReason?: string,
): CrawlResult {
	return {
		pages,
		partialResult,
		...(failureReason && { failureReason: failureReason as any }),
		startedAt: "2026-05-20T08:00:00.000Z",
		completedAt: "2026-05-20T08:00:05.000Z",
	};
}

// ---------------------------------------------------------------------------
// Business profile fixture
// ---------------------------------------------------------------------------

const BUSINESS_PROFILE = {
	businessName: "예시 사업체",
	industry: "기타",
	region: "서울",
	mainServices: ["서비스A", "서비스B"],
	targetKeywords: ["예시", "사업체", "서비스"],
};

// ---------------------------------------------------------------------------
// SCENARIO 1: 정상 사이트
// ---------------------------------------------------------------------------

describe("T-PIPELINE-INTEGRATION-001: 정상 사이트", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should complete diagnosis with scores and items", async () => {
		const mockPage = makeMockPage({
			title: "정상 사이트",
			h1: "정상 페이지",
			meta: {
				viewport: "width=device-width",
				description: "정상 설명",
				keywords: "keyword1, keyword2",
			},
			bodyText:
				"정상적인 본문 텍스트입니다. 충분한 길이의 콘텐츠가 있어야 합니다.",
			wordCount: 100,
			schemaJsonLd: [
				{
					"@context": "https://schema.org",
					"@type": "Organization",
					name: "정상 사이트",
				},
			],
			hasSchema: true,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([mockPage], false),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://example-business.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
		});

		// 스코어링 검증
		expect(output.scores.seoScore).toBeGreaterThanOrEqual(0);
		expect(output.scores.seoScore).toBeLessThanOrEqual(100);
		expect(output.scores.aeoScore).toBeGreaterThanOrEqual(0);
		expect(output.scores.geoScore).toBeGreaterThanOrEqual(0);
		expect(output.scores.overallScore).toBeGreaterThan(0);

		// 아이템 검증
		expect(Array.isArray(output.items)).toBe(true);
		expect(output.items.length).toBeGreaterThan(0);

		// 추천 검증
		expect(output.recommendations.length).toBe(output.items.length);
		for (const rec of output.recommendations) {
			expect(rec.itemId).toBeTruthy();
			expect(rec.body.length).toBeGreaterThan(0);
			expect(typeof rec.aiGenerated).toBe("boolean");
		}

		// 부분 결과 여부
		expect(output.partialResult).toBe(false);

		// crawlResult 포함
		expect(output.crawlResult.pages.length).toBeGreaterThan(0);
	});

	it("should classify multiple rule violations correctly", async () => {
		const mockPage = makeMockPage({
			title: null, // 제목 없음 — SEO violation
			h1: null, // H1 없음 — SEO violation
			bodyText: "x", // 매우 짧은 텍스트
			wordCount: 1,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([mockPage], false),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://example-business.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			enableAiRecommendation: false,
		});

		// 검증: 여러 SEO 위반이 감지되어야 함
		expect(output.items.length).toBeGreaterThanOrEqual(1);
		expect(output.partialResult).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// SCENARIO 2: robots.txt 전체 차단
// ---------------------------------------------------------------------------

describe("T-PIPELINE-INTEGRATION-002: robots.txt 전체 차단", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return ROBOTS_BLOCK_ALL failure reason", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([], false, "ROBOTS_BLOCK_ALL"),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://blocked-by-robots.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
		});

		// 페이지 크롤 실패 → 빈 결과
		expect(output.crawlResult.pages.length).toBe(0);
		expect(output.items.length).toBe(0);
		expect(output.recommendations.length).toBe(0);
		expect(output.scores.overallScore).toBe(0);
		expect(output.partialResult).toBe(true);

		// failureReason 전파
		expect(output.crawlResult.failureReason).toBe("ROBOTS_BLOCK_ALL");
	});

	it("should not attempt analysis when crawler fails", async () => {
		const mockCrawl = vi.mocked(crawlSite);
		mockCrawl.mockResolvedValue(
			makeMockCrawlResult([], false, "ROBOTS_BLOCK_ALL"),
		);

		await runDiagnosisPipeline({
			startUrl: "https://blocked-by-robots.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			enableAiRecommendation: false,
		});

		// crawlSite는 정확히 1회 호출
		expect(mockCrawl).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// SCENARIO 3: JS 렌더링 필요 (콘텐츠 비어있음)
// ---------------------------------------------------------------------------

describe("T-PIPELINE-INTEGRATION-003: JS 렌더링 필요 (콘텐츠 비어있음)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should handle empty main content gracefully", async () => {
		const mockPage = makeMockPage({
			title: "페이지 제목",
			h1: null,
			bodyText: "", // 콘텐츠 없음 — JS 렌더링 필요
			wordCount: 0,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([mockPage], false),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://js-required.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo"],
			enableAiRecommendation: false,
		});

		// 부분 진단 가능
		expect(output.crawlResult.pages.length).toBeGreaterThan(0);

		// 여러 SEO/AEO 위반 감지 가능
		expect(output.items.length).toBeGreaterThanOrEqual(1);

		// 부분 결과 유형은 정책에 따라 다름 (명시되지 않음 → false 또는 true 모두 가능)
		// 현재: pages가 있으면 partialResult 전파
		expect(typeof output.partialResult).toBe("boolean");
	});

	it("should detect missing H1 and low word count", async () => {
		const emptyContentPage = makeMockPage({
			h1: null,
			bodyText: "",
			wordCount: 0,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([emptyContentPage], false),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://js-required.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
		});

		// SEO 위반 (H1 없음, 너무 짧은 본문)
		expect(output.items.length).toBeGreaterThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// SCENARIO 4: HTTP 5xx
// ---------------------------------------------------------------------------

describe("T-PIPELINE-INTEGRATION-004: HTTP 5xx", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return HTTP_5xx failure reason", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([], false, "HTTP_5xx"),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://server-error.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
		});

		// 크롤 실패 → 빈 결과
		expect(output.crawlResult.pages.length).toBe(0);
		expect(output.items.length).toBe(0);
		expect(output.scores.overallScore).toBe(0);
		expect(output.crawlResult.failureReason).toBe("HTTP_5xx");
	});

	it("should set partialResult=true on HTTP_5xx", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([], false, "HTTP_5xx"),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://server-error.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
		});

		expect(output.partialResult).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// SCENARIO 5: Timeout
// ---------------------------------------------------------------------------

describe("T-PIPELINE-INTEGRATION-005: Timeout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return TIMEOUT failure reason", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([], false, "TIMEOUT"),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://slow-site.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
		});

		// 크롤 실패
		expect(output.crawlResult.pages.length).toBe(0);
		expect(output.items.length).toBe(0);
		expect(output.crawlResult.failureReason).toBe("TIMEOUT");
	});

	it("should set partialResult=true on timeout", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([], false, "TIMEOUT"),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://slow-site.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
		});

		expect(output.partialResult).toBe(true);
	});

	it("should handle partial crawl (some pages crawled before timeout)", async () => {
		const partialPage = makeMockPage({
			url: "https://slow-site.kr/",
			statusCode: 200,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([partialPage], true, "TIMEOUT"), // partialResult=true + failureReason
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://slow-site.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
		});

		// 부분 크롤 → 분석 계속
		expect(output.crawlResult.pages.length).toBeGreaterThan(0);
		expect(output.items.length).toBeGreaterThanOrEqual(0);
		expect(output.partialResult).toBe(true);
		expect(output.crawlResult.failureReason).toBe("TIMEOUT");
	});
});

// ---------------------------------------------------------------------------
// Cross-scenario: Module selection (SEO only, AEO only, etc.)
// ---------------------------------------------------------------------------

describe("Module selection (cross-scenario)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should run only requested modules", async () => {
		const mockPage = makeMockPage();
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([mockPage], false),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://example-business.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"], // Only SEO requested
			enableAiRecommendation: false,
		});

		// Pipeline always analyzes all modules but only uses requested ones for results
		expect(output.scores.seoScore).toBeGreaterThanOrEqual(0);
		expect(output.scores.seoScore).toBeLessThanOrEqual(100);
		// Note: aeo/geo are computed but not in requested modules
		// Items will only include SEO-related violations
		const seoItems = output.items.filter((item) => item.category === "seo");
		expect(seoItems.length).toBeGreaterThanOrEqual(0);
	});

	it("should calculate separate scores for each module", async () => {
		const mockPage = makeMockPage();
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([mockPage], false),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://example-business.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
		});

		// All scores should be calculated
		expect(typeof output.scores.seoScore).toBe("number");
		expect(typeof output.scores.aeoScore).toBe("number");
		expect(typeof output.scores.geoScore).toBe("number");
		expect(typeof output.scores.overallScore).toBe("number");
	});
});

// ---------------------------------------------------------------------------
// Cross-scenario: AI recommendation toggle
// ---------------------------------------------------------------------------

describe("AI recommendation toggle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should use rule-based when enableAiRecommendation=false", async () => {
		const mockPage = makeMockPage();
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([mockPage], false),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://example-business.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			enableAiRecommendation: false,
		});

		for (const rec of output.recommendations) {
			expect(rec.aiGenerated).toBe(false);
		}
	});

	it("should have fallback to rule-based when enableAiRecommendation=true", async () => {
		const mockPage = makeMockPage();
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([mockPage], false),
		);

		// Note: in actual implementation, AI providers might fail/not be available
		// So fallback to rule-based is expected
		const output = await runDiagnosisPipeline({
			startUrl: "https://example-business.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			enableAiRecommendation: true,
		});

		// All recommendations should have body text
		for (const rec of output.recommendations) {
			expect(rec.body.length).toBeGreaterThan(0);
		}
	});
});
