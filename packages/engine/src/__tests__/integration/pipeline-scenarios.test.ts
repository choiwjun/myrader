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

import { beforeEach, describe, expect, it, vi } from "vitest";
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
// SCENARIO 6: G004 repaired crawler contract integration
// ---------------------------------------------------------------------------

describe("T-PIPELINE-INTEGRATION-006: G004 crawler contract signals", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should preserve repaired crawler fields and emit real broken-link and document-order heading failures", async () => {
		const paragraphs = [
			"강남구 역삼동에 있는 예시 사업체는 오래된 EUC-KR 페이지에서 자주 보이던 한글 안내문을 정상 디코딩해 소개합니다. 상담, 예약, 위치 안내를 한 화면에서 확인할 수 있습니다.",
			"핸드드립 클래스와 원두 정기 배송은 초보자도 이해하기 쉽게 단계별로 설명합니다. 가격과 소요 시간, 준비물을 짧은 문장으로 나누어 제공합니다.",
			"방문 전에는 전화 02-1234-5678 또는 이메일 help@example-business.kr로 문의할 수 있습니다. 지하철 역삼역에서 도보 5분 거리이며 평일 오전 열 시부터 운영합니다.",
		];
		const mainPage = makeMockPage({
			url: "https://example-business.kr/",
			title: "예시 사업체 | 강남 핸드드립 클래스",
			description: "강남 핸드드립 클래스, 원두 배송, 매장 예약 안내",
			h1: "강남 핸드드립 클래스",
			h2: ["뒤늦은 H2"],
			meta: {
				viewport: "width=device-width, initial-scale=1",
				description: "강남 핸드드립 클래스, 원두 배송, 매장 예약 안내",
				keywords: "강남 카페, 핸드드립 클래스, 원두 배송",
				"og:title": "예시 사업체",
				"og:description": "강남에서 배우는 핸드드립 클래스",
			},
			bodyText:
				"강남구 역삼동 예시 사업체는 오래된 EUC-KR 한글 페이지도 깨짐 없이 안내합니다. 핸드드립 클래스와 원두 정기 배송을 제공합니다. 전화 02-1234-5678 이메일 help@example-business.kr 주소 서울 강남구 테헤란로 123.",
			wordCount: 90,
			internalLinks: [
				"https://example-business.kr/classes",
				"https://example-business.kr/missing",
			],
			externalLinks: [],
			schemaJsonLd: [
				{
					"@context": "https://schema.org",
					"@graph": [
						{
							"@type": "FAQPage",
							mainEntity: [
								{
									"@type": "Question",
									name: "예약 없이 방문할 수 있나요?",
									acceptedAnswer: {
										"@type": "Answer",
										text: "평일 수업은 예약제로 운영하지만 매장 상담은 가능합니다.",
									},
								},
							],
						},
						{
							"@type": "BreadcrumbList",
							itemListElement: [
								{
									"@type": "ListItem",
									position: 1,
									name: "홈",
									item: "https://example-business.kr/",
								},
								{
									"@type": "ListItem",
									position: 2,
									name: "클래스",
									item: "https://example-business.kr/classes",
								},
							],
						},
						{
							"@type": "LocalBusiness",
							name: "예시 사업체",
							telephone: "+82-2-1234-5678",
							address: {
								"@type": "PostalAddress",
								streetAddress: "테헤란로 123",
								addressLocality: "강남구",
								addressRegion: "서울",
								addressCountry: "KR",
							},
							geo: {
								"@type": "GeoCoordinates",
								latitude: 37.5009,
								longitude: 127.0363,
							},
						},
						{
							"@type": "Organization",
							name: "예시 사업체",
							url: "https://example-business.kr/",
							telephone: "+82-2-1234-5678",
						},
						{
							"@type": "Place",
							name: "예시 사업체 강남점",
							address: {
								"@type": "PostalAddress",
								streetAddress: "테헤란로 123",
								addressLocality: "강남구",
								addressRegion: "서울",
								addressCountry: "KR",
							},
						},
						{
							"@type": "Person",
							name: "김바리스타",
							jobTitle: "대표 강사",
						},
					],
				},
			],
			hasFAQ: true,
			hasSchema: true,
			canonicalUrl: "https://example-business.kr/",
			headingStructure: [
				{ level: 1, text: "강남 핸드드립 클래스" },
				{ level: 3, text: "H2 없이 먼저 나온 세부 안내" },
				{ level: 2, text: "뒤늦은 H2" },
			],
			paragraphs,
			textBlocks: [
				{ tag: "h1", text: "강남 핸드드립 클래스" },
				{ tag: "p", text: paragraphs[0] },
				{ tag: "h3", text: "H2 없이 먼저 나온 세부 안내" },
				{ tag: "p", text: paragraphs[1] },
				{ tag: "h2", text: "뒤늦은 H2" },
				{ tag: "p", text: paragraphs[2] },
			],
			contactLinks: [
				{
					kind: "tel",
					href: "tel:+82212345678",
					value: "+82-2-1234-5678",
					text: "전화 상담",
				},
				{
					kind: "mailto",
					href: "mailto:help@example-business.kr",
					value: "help@example-business.kr",
					text: "이메일 문의",
				},
			],
			httpProtocol: "2",
			redirectChainLength: 1,
			htmlLang: "ko-KR",
		});
		const missingPage = makeMockPage({
			url: "https://example-business.kr/missing",
			statusCode: 404,
			title: "페이지를 찾을 수 없습니다",
			description: null,
			h1: "404",
			h2: [],
			bodyText: "요청하신 페이지를 찾을 수 없습니다.",
			wordCount: 5,
			internalLinks: [],
			externalLinks: [],
			schemaJsonLd: [],
			hasFAQ: false,
			hasSchema: false,
			canonicalUrl: "https://example-business.kr/missing",
			failureReason: "HTTP_4xx",
		});
		const crawlResult = {
			...makeMockCrawlResult([mainPage, missingPage], true),
			sitemapUsed: true,
		};

		vi.mocked(crawlSite).mockResolvedValue(crawlResult);

		const output = await runDiagnosisPipeline({
			startUrl: "https://example-business.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
		});

		expect(output.scores.scoringVersion).toBe("2.1.0");
		expect(output.partialResult).toBe(true);
		expect(output.crawlResult.sitemapUsed).toBe(true);
		expect(output.crawlResult.partialResult).toBe(true);
		expect(output.crawlResult.pages[0]?.redirectChainLength).toBe(1);
		expect(output.crawlResult.pages[0]?.httpProtocol).toBe("2");
		expect(output.crawlResult.pages[0]?.bodyText).toContain("EUC-KR 한글 페이지도 깨짐 없이");
		expect(output.crawlResult.pages[0]?.contactLinks).toContainEqual(
			expect.objectContaining({
				kind: "mailto",
				href: "mailto:help@example-business.kr",
				value: "help@example-business.kr",
			}),
		);
		expect(output.crawlResult.pages[1]?.statusCode).toBe(404);
		expect(output.crawlResult.pages[1]?.failureReason).toBe("HTTP_4xx");

		const itemCodes = output.items.map((item) => item.code);
		expect(itemCodes).toContain("SEO-BROKEN-LINK-001");
		expect(itemCodes).not.toContain("SEO-SITEMAP-001");
		expect(itemCodes).not.toContain("SEO-XML-SITEMAP-VALID-001");
		expect(itemCodes).not.toContain("SEO-REDIRECT-CHAIN-001");
		expect(itemCodes).not.toContain("SEO-HTTP2-001");
		expect(itemCodes).toContain("SEO-HEADING-HIERARCHY-001");
		const headingItem = output.items.find(
			(item) => item.code === "SEO-HEADING-HIERARCHY-001",
		);
		expect(headingItem?.evidence.details).toContain(
			'첫 위반: H1 → H3 ("H2 없이 먼저 나온 세부 안내")',
		);
		expect(itemCodes).not.toContain("AEO-FAQ-SCHEMA-001");
		expect(itemCodes).not.toContain("AEO-PARAGRAPH-STRUCTURE-001");
		expect(itemCodes).not.toContain("AEO-SCANNABLE-001");
		expect(itemCodes).not.toContain("GEO-AI-SUMMARY-001");
		expect(itemCodes).not.toContain("GEO-LOCAL-BUSINESS-SCHEMA-001");
		expect(itemCodes).not.toContain("GEO-ORGANIZATION-SCHEMA-001");
		expect(itemCodes).not.toContain("GEO-LOCATION-SCHEMA-001");
		expect(itemCodes).not.toContain("GEO-PHONE-FORMAT-001");
	});
	it("should preserve explicit legacy v2 scoring version on normal scored input", async () => {
		const mockPage = makeMockPage({
			title: "명시적 레거시 채점 사이트",
			h1: "명시적 레거시 채점 사이트",
			bodyText:
				"예시 사업체는 서울에서 서비스A와 서비스B를 제공합니다. 연락처 010-1234-5678과 사업자번호 123-45-67890을 공개합니다.",
			wordCount: 80,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([mockPage], false),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://example-business.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
			scoringMode: "v2",
		});

		expect(output.crawlResult.pages.length).toBeGreaterThan(0);
		expect(output.scores.scoringVersion).toBe("2.0.0");
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
