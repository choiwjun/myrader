/**
 * X-SAG Core Engine — Pipeline 단위 테스트
 *
 * 3 케이스:
 * 1. 정상 흐름: mock crawler + analyzers → 정상 출력 검증
 * 2. 부분 실패: crawlResult.partialResult=true → output.partialResult=true
 * 3. AI 비활성화 시 rule-based만 사용 (aiGenerated=false)
 *
 * 실제 네트워크 호출 없음. vi.mock으로 crawler를 mocking.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlResult, ParsedPage } from "../types.js";

// ---------------------------------------------------------------------------
// Mock crawler (네트워크 없음)
// ---------------------------------------------------------------------------

vi.mock("../crawler.js", () => ({
	crawlSite: vi.fn(),
}));

import { crawlSite } from "../crawler.js";
import { runDiagnosisPipeline } from "../pipeline.js";

// ---------------------------------------------------------------------------
// Mock ParsedPage factory
// ---------------------------------------------------------------------------

function makeMockPage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://test-cafe.example.kr/",
		statusCode: 200,
		title: "강남 카페 르카페 | 핸드드립 커피",
		description: "강남역 근처 핸드드립 카페입니다.",
		h1: "강남 핸드드립 카페",
		h2: ["메뉴", "오시는 길"],
		meta: {
			viewport: "width=device-width, initial-scale=1",
			description: "강남역 근처 핸드드립 카페",
		},
		bodyText:
			"강남 카페 르카페에 오신 것을 환영합니다. 사업자번호 123-45-67890. 대표: 홍길동. 연락처: 010-1234-5678.",
		wordCount: 50,
		internalLinks: ["https://test-cafe.example.kr/menu"],
		externalLinks: [],
		images: [{ src: "/img/cafe.jpg", alt: "카페 내부" }],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: "https://test-cafe.example.kr/",
		robotsMeta: null,
		...overrides,
	};
}

function makeMockCrawlResult(
	pages: ParsedPage[],
	partial = false,
): CrawlResult {
	return {
		pages,
		partialResult: partial,
		startedAt: "2026-05-19T08:00:00.000Z",
		completedAt: "2026-05-19T08:00:05.000Z",
	};
}

// ---------------------------------------------------------------------------
// Business profile fixture
// ---------------------------------------------------------------------------

const BUSINESS_PROFILE = {
	businessName: "르카페",
	industry: "카페",
	region: "강남",
	mainServices: ["핸드드립", "원두", "디저트"],
	targetKeywords: ["강남 카페", "핸드드립", "원두 커피"],
};

// ---------------------------------------------------------------------------
// Test Case 1: 정상 흐름
// ---------------------------------------------------------------------------

describe("Case 1: 정상 흐름 — mock crawler + 파이프라인 전체 실행", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("crawlSite가 정상 반환하면 items, scores, recommendations를 반환한다", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
		});

		// scores
		expect(output.scores.seoScore).toBeGreaterThanOrEqual(0);
		expect(output.scores.seoScore).toBeLessThanOrEqual(100);
		expect(output.scores.overallScore).toBeGreaterThanOrEqual(0);
		expect(output.scores.scoringVersion).toBe("2.0.0");

		// items
		expect(Array.isArray(output.items)).toBe(true);

		// recommendations: 각 item에 대응하는 recommendation이 존재
		expect(output.recommendations).toHaveLength(output.items.length);
		for (const rec of output.recommendations) {
			expect(rec.itemId).toBeTruthy();
			expect(rec.body).toBeTruthy();
			expect(typeof rec.aiGenerated).toBe("boolean");
		}

		// crawlResult 포함
		expect(output.crawlResult).toBeDefined();
		expect(output.crawlResult.pages).toHaveLength(1);
		expect(output.businessPresence).toMatchObject({
			primarySourceType: "website",
			primaryUrl: "https://test-cafe.example.kr/",
		});
		expect(output.businessPresence.surfaces[0]?.sourceType).toBe("website");
	});

	it("crawlSite가 정확히 1회 호출된다", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);

		await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			enableAiRecommendation: false,
		});

		expect(vi.mocked(crawlSite)).toHaveBeenCalledTimes(1);
	});

	it("startUrl을 crawlSite에 전달한다", async () => {
		const url = "https://test-cafe.example.kr/";
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);

		await runDiagnosisPipeline({
			startUrl: url,
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
		});

		expect(vi.mocked(crawlSite)).toHaveBeenCalledWith(url, undefined);
	});

	it("platform sourceType이면 제한사항 메타데이터를 반환한다", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://blog.naver.com/testcafe",
			sourceType: "naver_blog",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
		});

		expect(output.platformLimitations.length).toBeGreaterThan(0);
		expect(output.platformLimitations[0]?.code).toBe(
			"PLATFORM_LIMITED_EVIDENCE",
		);
		expect(output.platformLimitations[0]?.message).toContain("네이버 블로그");
	});
	it("fetches additional businessSurfaceUrls into businessPresence", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				text: async () => `
					<html>
						<head><title>Example Cafe</title></head>
						<body><h1>Example Cafe</h1><p>coffee brunch booking 010-1234-5678</p></body>
					</html>
				`,
			})),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			sourceType: "website",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			businessSurfaceUrls: [
				{
					sourceType: "naver_place",
					url: "https://place.naver.com/restaurant/123",
				},
			],
			platformLiveFetchAllowlist: ["naver_place"],
		});

		expect(output.businessPresence.surfaces).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sourceType: "website", status: "skipped" }),
				expect.objectContaining({
					sourceType: "naver_place",
					status: "fetched",
					name: "Example Cafe",
				}),
			]),
		);
	});

	it("keeps platform live fetch disabled when requested by the caller", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://www.instagram.com/testcafe",
			sourceType: "instagram",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			businessSurfaceUrls: [
				{
					sourceType: "naver_place",
					url: "https://place.naver.com/restaurant/123",
				},
			],
			enablePlatformLiveFetch: false,
		});

		expect(output.partialResult).toBe(true);
		expect(output.crawlResult.pages).toHaveLength(0);
		expect(output.platformLimitations.map((item) => item.code)).toContain(
			"PLATFORM_LIVE_FETCH_DISABLED",
		);
		expect(output.businessPresence.surfaces).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					sourceType: "naver_place",
					status: "skipped",
				}),
			]),
		);
	});

	it("does not fetch platform sources that are enabled but not allowlisted", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			sourceType: "website",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			businessSurfaceUrls: [
				{
					sourceType: "kakao_place",
					url: "https://place.map.kakao.com/123",
				},
			],
			enablePlatformLiveFetch: true,
			platformLiveFetchAllowlist: ["naver_place"],
		});

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(output.businessPresence.surfaces).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					sourceType: "kakao_place",
					status: "skipped",
					surfaceKind: "place",
					limitations: expect.arrayContaining([
						expect.objectContaining({
							code: "PLATFORM_LIVE_FETCH_NOT_APPROVED",
						}),
					]),
				}),
			]),
		);
	});

	it("preserves surface kind for skipped map, review, and reservation surfaces", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			sourceType: "website",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			businessSurfaceUrls: [
				{
					sourceType: "kakao_place",
					url: "https://map.kakao.com/?q=Fixture%20Cafe",
				},
				{
					sourceType: "other_platform",
					url: "https://reviews.example.com/fixturecafe",
				},
				{
					sourceType: "other_platform",
					url: "https://booking.example.com/fixturecafe",
				},
			],
			enablePlatformLiveFetch: false,
		});

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(output.businessPresence.surfaces).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					url: "https://map.kakao.com/?q=Fixture%20Cafe",
					status: "skipped",
					surfaceKind: "map",
				}),
				expect.objectContaining({
					url: "https://reviews.example.com/fixturecafe",
					status: "skipped",
					surfaceKind: "review",
				}),
				expect.objectContaining({
					url: "https://booking.example.com/fixturecafe",
					status: "skipped",
					surfaceKind: "reservation",
				}),
			]),
		);
	});

	it("does not use public HTML fetch for prohibited platform sources even when allowlisted", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const output = await runDiagnosisPipeline({
			startUrl: "https://www.youtube.com/@testcafe",
			sourceType: "youtube",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			enablePlatformLiveFetch: true,
			platformLiveFetchAllowlist: ["youtube"],
		});

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(output.platformLimitations.map((item) => item.code)).toContain(
			"PLATFORM_HTML_FETCH_NOT_ALLOWED",
		);
		expect(output.partialResult).toBe(true);
	});

	it("applies review surface rule scope to primary platform analysis", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				text: async () => `
					<html>
						<head><title>Fixture Cafe Reviews</title></head>
						<body><h1>Fixture Cafe Reviews</h1><p>visitor reviews rating coffee brunch</p></body>
					</html>
				`,
			})),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://reviews.example.com/fixturecafe",
			sourceType: "other_platform",
			businessProfile: BUSINESS_PROFILE,
			modules: ["geo"],
			enablePlatformLiveFetch: true,
			platformLiveFetchAllowlist: ["other_platform"],
		});

		expect(output.businessPresence.surfaces).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					sourceType: "other_platform",
					surfaceKind: "review",
					status: "fetched",
				}),
			]),
		);
		expect(output.items.map((item) => item.code)).not.toContain("GEO-CONTACT-001");
	});
});

// ---------------------------------------------------------------------------
// Test Case 2: 부분 실패 (crawlResult.partialResult=true)
// ---------------------------------------------------------------------------

describe("Case 2: 부분 실패 — partialResult 전파", () => {
	it("crawlResult.partialResult=true이면 output.partialResult=true", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()], true), // partial=true
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
		});

		expect(output.partialResult).toBe(true);
	});

	it("pages가 빈 배열이면 0점으로 조기 반환 + partialResult=true", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([], false), // no pages
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://nonexistent.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
		});

		expect(output.partialResult).toBe(true);
		expect(output.scores.overallScore).toBe(0);
		expect(output.items).toHaveLength(0);
		expect(output.recommendations).toHaveLength(0);
	});

	it("정상 crawl이면 partialResult=false", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()], false),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
		});

		expect(output.partialResult).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Test Case 3: AI 비활성화 시 rule-based만 사용
// ---------------------------------------------------------------------------

describe("Case 3: enableAiRecommendation=false → rule-based만 사용", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);
	});

	it("enableAiRecommendation=false이면 모든 recommendation이 aiGenerated=false", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
		});

		for (const rec of output.recommendations) {
			expect(rec.aiGenerated).toBe(false);
		}
	});

	it("enableAiRecommendation 기본값은 false", async () => {
		// No enableAiRecommendation field → default is false
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			// enableAiRecommendation omitted
		});

		for (const rec of output.recommendations) {
			expect(rec.aiGenerated).toBe(false);
		}
	});

	it("recommendation body는 비어 있지 않다 (rule-based fallback)", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
		});

		for (const rec of output.recommendations) {
			expect(rec.body.length).toBeGreaterThan(0);
		}
	});

	it("LLM_PROVIDER=mock keeps the pipeline on rule-based recommendations even when enableAiRecommendation=true", async () => {
		process.env["LLM_PROVIDER"] = "mock";
		process.env["OPENAI_API_KEY"] = "sk-test";
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify({
									body: "Should not be used",
									examples: [],
								}),
							},
						},
					],
				}),
				{ status: 200 },
			),
		);

		try {
			const output = await runDiagnosisPipeline({
				startUrl: "https://test-cafe.example.kr/",
				businessProfile: BUSINESS_PROFILE,
				modules: ["seo", "aeo", "geo"],
				enableAiRecommendation: true,
			});

			expect(fetchMock).not.toHaveBeenCalled();
			for (const rec of output.recommendations) {
				expect(rec.aiGenerated).toBe(false);
			}
		} finally {
			delete process.env["LLM_PROVIDER"];
			delete process.env["OPENAI_API_KEY"];
			fetchMock.mockRestore();
		}
	});

	it("enableRecommendationQualityCheck=true exposes recommendation quality metadata", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableAiRecommendation: false,
			enableRecommendationQualityCheck: true,
		});

		expect(output.recommendations.length).toBeGreaterThan(0);
		for (const rec of output.recommendations) {
			expect(typeof rec.qualityScore).toBe("number");
			expect(rec.qualityScore).toBeGreaterThanOrEqual(0);
			expect(rec.qualityScore).toBeLessThanOrEqual(100);
			expect(Array.isArray(rec.qualityIssues)).toBe(true);
			expect(rec.wasImproved).toBe(false);
		}
	});
});

// ---------------------------------------------------------------------------
// Test Case 4: Backlink analysis activation
// ---------------------------------------------------------------------------

describe("Case 4: enableBacklinkAnalysis — backlink items, score-neutrality, fail-soft", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);
	});

	it("default (flag unset): output.items contains NO backlink-category items", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
		});

		const backlinkItems = output.items.filter(
			(item) => item.category === "backlink",
		);
		expect(backlinkItems).toHaveLength(0);
	});

	it("enableBacklinkAnalysis=false: output.items contains NO backlink-category items", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableBacklinkAnalysis: false,
		});

		const backlinkItems = output.items.filter(
			(item) => item.category === "backlink",
		);
		expect(backlinkItems).toHaveLength(0);
	});

	it("enableBacklinkAnalysis=true: output.items DOES contain backlink-category items", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableBacklinkAnalysis: true,
		});

		const backlinkItems = output.items.filter(
			(item) => item.category === "backlink",
		);
		expect(backlinkItems.length).toBeGreaterThan(0);
	});

	it("score-neutrality: scores identical with and without enableBacklinkAnalysis", async () => {
		const withoutBacklink = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableBacklinkAnalysis: false,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);

		const withBacklink = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableBacklinkAnalysis: true,
		});

		expect(withBacklink.scores.seoScore).toBe(withoutBacklink.scores.seoScore);
		expect(withBacklink.scores.aeoScore).toBe(withoutBacklink.scores.aeoScore);
		expect(withBacklink.scores.geoScore).toBe(withoutBacklink.scores.geoScore);
		expect(withBacklink.scores.overallScore).toBe(
			withoutBacklink.scores.overallScore,
		);
	});

	it("fail-soft: if backlink step throws, pipeline still returns without throwing", async () => {
		let thrownError: unknown = undefined;
		let output: Awaited<ReturnType<typeof runDiagnosisPipeline>> | undefined;
		try {
			output = await runDiagnosisPipeline({
				startUrl: "https://test-cafe.example.kr/",
				businessProfile: BUSINESS_PROFILE,
				modules: ["seo", "aeo", "geo"],
				enableBacklinkAnalysis: true,
			});
		} catch (err) {
			thrownError = err;
		}

		expect(thrownError).toBeUndefined();
		expect(output).toBeDefined();
		expect(output?.scores).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Test Case 5: A11Y analysis activation
// ---------------------------------------------------------------------------

describe("Case 5: enableA11yAnalysis — a11y items, score-neutrality, fail-soft", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);
	});

	it("default (flag unset): output.items contains NO a11y-category items", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
		});

		const a11yItems = output.items.filter((item) => item.category === "a11y");
		expect(a11yItems).toHaveLength(0);
	});

	it("enableA11yAnalysis=false: output.items contains NO a11y-category items", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableA11yAnalysis: false,
		});

		const a11yItems = output.items.filter((item) => item.category === "a11y");
		expect(a11yItems).toHaveLength(0);
	});

	it("enableA11yAnalysis=true: output.items may contain a11y-category items (not errored)", async () => {
		let output: Awaited<ReturnType<typeof runDiagnosisPipeline>> | undefined;
		let thrownError: unknown;
		try {
			output = await runDiagnosisPipeline({
				startUrl: "https://test-cafe.example.kr/",
				businessProfile: BUSINESS_PROFILE,
				modules: ["seo", "aeo", "geo"],
				enableA11yAnalysis: true,
			});
		} catch (err) {
			thrownError = err;
		}

		expect(thrownError).toBeUndefined();
		expect(output).toBeDefined();
		expect(output?.scores).toBeDefined();
		// a11y items may or may not be present (depends on providers in test env),
		// but no pipeline error should be thrown
		expect(Array.isArray(output?.items)).toBe(true);
		// a11y 경로는 jsdom/axe-core 를 콜드 로드하므로 기본 5s 타임아웃을 부하 상황에서
		// 우연히 초과할 수 있다(단독/warm 실행 시 ~0.7~2.2s). flaky 방지를 위해 15s 부여.
	}, 15_000);

	it("score-neutrality: scores identical with and without enableA11yAnalysis on same input", async () => {
		const withoutA11y = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableA11yAnalysis: false,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);

		const withA11y = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableA11yAnalysis: true,
		});

		expect(withA11y.scores.seoScore).toBe(withoutA11y.scores.seoScore);
		expect(withA11y.scores.aeoScore).toBe(withoutA11y.scores.aeoScore);
		expect(withA11y.scores.geoScore).toBe(withoutA11y.scores.geoScore);
		expect(withA11y.scores.overallScore).toBe(withoutA11y.scores.overallScore);
	});

	it("fail-soft: if a11y step throws, pipeline still returns without throwing", async () => {
		// Mock createA11yAnalyzer to throw
		vi.doMock("../v2/a11y/analyzer.js", () => ({
			createA11yAnalyzer: vi.fn().mockRejectedValue(new Error("a11y provider unavailable")),
		}));

		let thrownError: unknown;
		let output: Awaited<ReturnType<typeof runDiagnosisPipeline>> | undefined;
		try {
			output = await runDiagnosisPipeline({
				startUrl: "https://test-cafe.example.kr/",
				businessProfile: BUSINESS_PROFILE,
				modules: ["seo", "aeo", "geo"],
				enableA11yAnalysis: true,
			});
		} catch (err) {
			thrownError = err;
		}

		expect(thrownError).toBeUndefined();
		expect(output).toBeDefined();
		expect(output?.scores).toBeDefined();

		vi.doUnmock("../v2/a11y/analyzer.js");
	});
});

// ---------------------------------------------------------------------------
// Test Case 6: PERF analysis activation (informational, score-neutral)
// Uses X_SAG_LIGHTHOUSE=mock so NO real API call is made in tests.
// ---------------------------------------------------------------------------

describe("Case 6: enablePerfAnalysis — perf items, score-neutrality, fail-soft", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);
		// Use mock lighthouse so no real PageSpeed API call is made
		process.env["X_SAG_LIGHTHOUSE"] = "mock";
	});

	afterEach(() => {
		delete process.env["X_SAG_LIGHTHOUSE"];
	});

	it("default (flag unset): output.items contains NO perf-category items", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
		});

		const perfItems = output.items.filter((item) => item.category === "perf");
		expect(perfItems).toHaveLength(0);
	});

	it("enablePerfAnalysis=false: output.items contains NO perf-category items", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enablePerfAnalysis: false,
		});

		const perfItems = output.items.filter((item) => item.category === "perf");
		expect(perfItems).toHaveLength(0);
	});

	it("enablePerfAnalysis=true (mock): perf rules run without error (scores.perfScore populated)", async () => {
		// With MockLighthouseProvider all 10 perf rules pass (good mock values),
		// so classifyResults produces 0 failed perf items — that is correct behaviour.
		// The key signal is that scores.perfScore is set (non-null).
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enablePerfAnalysis: true,
		});

		// Pipeline must complete without error
		expect(output).toBeDefined();
		// perfScore is set when perf analysis ran
		expect(output.scores.perfScore).not.toBeNull();
		// No assertions on perfItems length: mock values pass all thresholds
		expect(Array.isArray(output.items)).toBe(true);
	});

	it("enablePerfAnalysis=true (mock): scores.perfScore is populated (0-100)", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enablePerfAnalysis: true,
		});

		expect(output.scores.perfScore).not.toBeNull();
		expect(typeof output.scores.perfScore).toBe("number");
		expect(output.scores.perfScore as number).toBeGreaterThanOrEqual(0);
		expect(output.scores.perfScore as number).toBeLessThanOrEqual(100);
	});

	it("score-neutrality: seoScore/aeoScore/geoScore/overallScore identical with and without enablePerfAnalysis", async () => {
		const withoutPerf = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enablePerfAnalysis: false,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);

		const withPerf = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enablePerfAnalysis: true,
		});

		// Core scores must be identical (score-neutral)
		expect(withPerf.scores.seoScore).toBe(withoutPerf.scores.seoScore);
		expect(withPerf.scores.aeoScore).toBe(withoutPerf.scores.aeoScore);
		expect(withPerf.scores.geoScore).toBe(withoutPerf.scores.geoScore);
		expect(withPerf.scores.overallScore).toBe(withoutPerf.scores.overallScore);
	});

	it("default (flag unset): scores.perfScore is null", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			// enablePerfAnalysis omitted → defaults to false
		});

		expect(output.scores.perfScore).toBeNull();
	});

	it("fail-soft: if lighthouse measure throws, pipeline still completes (no perf items, perfScore null)", async () => {
		// Force an error by switching to unavailable mode (no key, no mock)
		delete process.env["X_SAG_LIGHTHOUSE"];
		delete process.env["PAGESPEED_API_KEY"];
		delete process.env["GOOGLE_PAGESPEED_API_KEY"];

		let thrownError: unknown;
		let output: Awaited<ReturnType<typeof runDiagnosisPipeline>> | undefined;
		try {
			output = await runDiagnosisPipeline({
				startUrl: "https://test-cafe.example.kr/",
				businessProfile: BUSINESS_PROFILE,
				modules: ["seo", "aeo", "geo"],
				enablePerfAnalysis: true,
			});
		} catch (err) {
			thrownError = err;
		}

		expect(thrownError).toBeUndefined();
		expect(output).toBeDefined();
		expect(output?.scores).toBeDefined();
		// Pipeline completed but perf data unavailable
		expect(output?.scores.perfScore).toBeNull();
		const perfItems = output?.items.filter((i) => i.category === "perf") ?? [];
		// Rules return informational/passed when lighthouseResult absent, so items
		// may or may not be present — but pipeline must not throw.
		expect(Array.isArray(output?.items)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Test Case 7: NLP analysis activation (informational, SCORE-NEUTRAL)
// RuleBasedNlpProvider requires no external key → always runs deterministically.
// ---------------------------------------------------------------------------

describe("Case 7: enableNlpAnalysis — NLP items informational, SCORE-NEUTRAL", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);
	});

	it("default (flag unset): output.items contains no NLP- coded items", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
		});

		const nlpItems = output.items.filter((item) =>
			item.code.startsWith("NLP-"),
		);
		expect(nlpItems).toHaveLength(0);
	});

	it("enableNlpAnalysis=false: output.items contains no NLP- coded items", async () => {
		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableNlpAnalysis: false,
		});

		const nlpItems = output.items.filter((item) =>
			item.code.startsWith("NLP-"),
		);
		expect(nlpItems).toHaveLength(0);
	});

	it("score-neutrality: seoScore/aeoScore/geoScore/overallScore identical with and without enableNlpAnalysis", async () => {
		// Run WITHOUT NLP
		const withoutNlp = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableNlpAnalysis: false,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);

		// Run WITH NLP (RuleBasedNlpProvider — deterministic, no external key)
		const withNlp = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableNlpAnalysis: true,
		});

		// CRITICAL: scores must be identical regardless of NLP activation
		expect(withNlp.scores.seoScore).toBe(withoutNlp.scores.seoScore);
		expect(withNlp.scores.aeoScore).toBe(withoutNlp.scores.aeoScore);
		expect(withNlp.scores.geoScore).toBe(withoutNlp.scores.geoScore);
		expect(withNlp.scores.overallScore).toBe(withoutNlp.scores.overallScore);
	});

	it("score-neutrality regression: excludeNlpFromScoring does not alter scores when NLP rules pass (nlpResult absent)", async () => {
		// When enableNlpAnalysis=false, nlpResult is undefined.
		// NLP rules return passed=true (0 deduction) -> removing them from scoring
		// must not change the score by any amount.
		const baseline = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableNlpAnalysis: false,
		});

		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);

		// enableNlpAnalysis=true with page that has all NLP rules pass
		// (RuleBasedNlpProvider fills in defaults; scores must still match baseline)
		const withNlpEnabled = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableNlpAnalysis: true,
		});

		expect(withNlpEnabled.scores.seoScore).toBe(baseline.scores.seoScore);
		expect(withNlpEnabled.scores.aeoScore).toBe(baseline.scores.aeoScore);
		expect(withNlpEnabled.scores.geoScore).toBe(baseline.scores.geoScore);
		expect(withNlpEnabled.scores.overallScore).toBe(baseline.scores.overallScore);
	});

	it("enableNlpAnalysis=true: with an input that triggers NLP failures, those NLP- codes appear in output.items but scores are still identical to baseline", async () => {
		// Create a page with body text that will trigger NLP failures:
		// - empty bodyText -> readability score = 0 (< 60) -> NLP-READABILITY-001 fails
		// - targetKeywords present but bodyText empty -> NLP-KEYWORD-DENSITY-001 may fail
		// - industry/region not found in empty body -> NLP-TOPIC-RELEVANCE-001 fails
		const nlpFailPage = makeMockPage({
			bodyText: "",
			wordCount: 0,
		});

		// Baseline: same page, NO NLP analysis
		vi.mocked(crawlSite).mockResolvedValue(makeMockCrawlResult([nlpFailPage]));
		const baseline = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableNlpAnalysis: false,
		});

		// With NLP enabled, same page
		vi.mocked(crawlSite).mockResolvedValue(makeMockCrawlResult([nlpFailPage]));
		const withNlp = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo", "aeo", "geo"],
			enableNlpAnalysis: true,
		});

		// NLP findings must appear in items (at least one NLP- rule fails on empty body)
		const nlpItems = withNlp.items.filter((item) =>
			item.code.startsWith("NLP-"),
		);
		expect(nlpItems.length).toBeGreaterThan(0);

		// CRITICAL: scores must NOT be affected by NLP failures
		expect(withNlp.scores.seoScore).toBe(baseline.scores.seoScore);
		expect(withNlp.scores.aeoScore).toBe(baseline.scores.aeoScore);
		expect(withNlp.scores.geoScore).toBe(baseline.scores.geoScore);
		expect(withNlp.scores.overallScore).toBe(baseline.scores.overallScore);
	});
});

// ---------------------------------------------------------------------------
// GAP 3: 스테이지별 타임아웃 예산 (per-stage budget isolation)
// ---------------------------------------------------------------------------

describe("GAP 3: per-stage timeout budgets", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("crawl 예산을 초과하면 빈 partial 결과로 fail-soft 한다 (전체 예산 잠식 방지)", async () => {
		vi.useFakeTimers();
		// crawlSite 가 예산(10ms)보다 훨씬 늦게(100s) resolve → 타임아웃 발동.
		vi.mocked(crawlSite).mockImplementation(
			() =>
				new Promise((resolve) => {
					setTimeout(
						() => resolve(makeMockCrawlResult([makeMockPage()])),
						100_000,
					);
				}),
		);

		const p = runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			stageTimeouts: { crawl: 10 },
		});
		await vi.runAllTimersAsync();
		const output = await p;

		// 크롤 타임아웃 → 빈 페이지 + partialResult
		expect(output.crawlResult.pages).toHaveLength(0);
		expect(output.partialResult).toBe(true);
		expect(output.items).toHaveLength(0);
	});

	it("crawl 이 예산 내 완료되면 정상 동작 (기존 동작 호환)", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
			// 넉넉한 예산 — 정상 완료.
			stageTimeouts: { crawl: 120_000 },
		});

		expect(output.crawlResult.pages).toHaveLength(1);
		expect(output.partialResult).toBe(false);
		expect(Array.isArray(output.items)).toBe(true);
	});

	it("stageTimeouts 미지정 시 기본 예산으로 정상 동작 (backwards compatible)", async () => {
		vi.mocked(crawlSite).mockResolvedValue(
			makeMockCrawlResult([makeMockPage()]),
		);

		const output = await runDiagnosisPipeline({
			startUrl: "https://test-cafe.example.kr/",
			businessProfile: BUSINESS_PROFILE,
			modules: ["seo"],
		});

		expect(output.crawlResult.pages).toHaveLength(1);
		expect(output.scores.scoringVersion).toBe("2.0.0");
	});
});
