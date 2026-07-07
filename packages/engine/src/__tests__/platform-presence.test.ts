import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuleResult } from "../analyzers/types.js";
import {
	adaptPlatformHtml,
	buildBusinessPresenceModel,
	businessPresenceToCrawlResult,
	businessPresenceToSurface,
	fetchPlatformPresence,
	fetchBusinessPresenceSurfaces,
	getPlatformRuleScope,
	applyPlatformRuleScope,
	inferSurfaceKind,
} from "../platform-presence/index.js";
import type { PlatformSourceType } from "../platform-presence/index.js";
import { __setHostnameResolverForTests } from "../utils/url.js";

const baseHtml = `
<!doctype html>
<html lang="ko">
  <head>
    <title>강남 테스트 카페 - 네이버 플레이스</title>
    <meta name="description" content="강남역 근처 핸드드립 카페. 예약, 메뉴, 영업시간 정보를 제공합니다.">
    <meta property="og:title" content="강남 테스트 카페">
    <meta property="og:description" content="강남역 핸드드립과 디저트">
  </head>
  <body>
    <h1>강남 테스트 카페</h1>
    <p>서울 강남구 테헤란로 1길 10</p>
    <p>전화 02-123-4567</p>
    <p>영업시간 매일 10:00 - 21:00</p>
    <p>대표 메뉴: 핸드드립, 디저트, 원두 판매</p>
    <p>방문자 리뷰 127개, 사진 32장, 예약 가능</p>
  </body>
</html>`;

const platformFixtures: {
	sourceType: PlatformSourceType;
	fixture: string;
	url: string;
	expectedName: string;
	expectedText: string;
	expectedKind: string;
}[] = [
	{
		sourceType: "naver_place",
		fixture: "naver-place.html",
		url: "https://place.naver.com/restaurant/123",
		expectedName: "Fixture Cafe",
		expectedText: "visitor reviews 127",
		expectedKind: "place",
	},
	{
		sourceType: "naver_blog",
		fixture: "naver-blog.html",
		url: "https://blog.naver.com/fixturecafe",
		expectedName: "Fixture Cafe Blog",
		expectedText: "recent post coffee",
		expectedKind: "blog",
	},
	{
		sourceType: "instagram",
		fixture: "instagram.html",
		url: "https://www.instagram.com/fixturecafe",
		expectedName: "Fixture Cafe Instagram",
		expectedText: "coffee brunch",
		expectedKind: "social",
	},
	{
		sourceType: "kakao_place",
		fixture: "kakao-place.html",
		url: "https://place.map.kakao.com/123",
		expectedName: "Fixture Cafe Kakao Place",
		expectedText: "Map directions",
		expectedKind: "place",
	},
	{
		sourceType: "youtube",
		fixture: "youtube.html",
		url: "https://www.youtube.com/@fixturecafe",
		expectedName: "Fixture Cafe YouTube",
		expectedText: "store tour review",
		expectedKind: "video",
	},
	{
		sourceType: "facebook",
		fixture: "facebook.html",
		url: "https://www.facebook.com/fixturecafe",
		expectedName: "Fixture Cafe Facebook",
		expectedText: "posts coffee brunch",
		expectedKind: "social",
	},
	{
		sourceType: "other_platform",
		fixture: "reservation-page.html",
		url: "https://booking.example.com/fixturecafe",
		expectedName: "Fixture Cafe Reservation",
		expectedText: "booking reservation schedule",
		expectedKind: "reservation",
	},
	{
		sourceType: "other_platform",
		fixture: "map-page.html",
		url: "https://maps.example.com/?cid=fixturecafe",
		expectedName: "Fixture Cafe Map",
		expectedText: "map directions parking",
		expectedKind: "map",
	},
	{
		sourceType: "other_platform",
		fixture: "review-page.html",
		url: "https://reviews.example.com/fixturecafe",
		expectedName: "Fixture Cafe Reviews",
		expectedText: "visitor reviews rating",
		expectedKind: "review",
	},
];

function readPlatformFixture(fixture: string): string {
	return readFileSync(
		new URL(`./fixtures/platform-presence/${fixture}`, import.meta.url),
		"utf-8",
	);
}

beforeEach(() => {
	__setHostnameResolverForTests(async () => [
		{ address: "93.184.216.34", family: 4 },
	]);
});

afterEach(() => {
	vi.unstubAllGlobals();
	__setHostnameResolverForTests(null);
});

describe("platform BusinessPresence adapters", () => {
	it.each([
		["naver_place", "네이버 플레이스"],
		["naver_blog", "네이버 블로그"],
		["instagram", "인스타그램"],
		["kakao_place", "카카오 플레이스"],
		["youtube", "유튜브"],
		["facebook", "페이스북"],
	] as const)(
		"parses %s public HTML into normalized BusinessPresence",
		(sourceType, expectedLabel) => {
			const presence = adaptPlatformHtml({
				sourceType,
				sourceUrl: `https://example.com/${sourceType}`,
				html: baseHtml,
			});

			expect(presence.sourceType).toBe(sourceType);
			expect(presence.sourceLabel).toBe(expectedLabel);
			expect(presence.name).toBe("강남 테스트 카페");
			expect(presence.description).toContain("핸드드립");
			expect(presence.rawText).toContain("방문자 리뷰 127개");
			expect(presence.signals.contact.phone).toBe("02-123-4567");
			expect(presence.signals.local.address).toContain("서울 강남구");
			expect(presence.provenance.url).toContain(sourceType);
			expect(presence.limitations.length).toBeGreaterThan(0);
		},
	);

	it("converts BusinessPresence into a crawl result compatible with existing analyzers", () => {
		const presence = adaptPlatformHtml({
			sourceType: "naver_place",
			sourceUrl: "https://map.naver.com/p/entry/place/123",
			html: baseHtml,
		});

		const crawl = businessPresenceToCrawlResult(presence);

		expect(crawl.pages).toHaveLength(1);
		expect(crawl.partialResult).toBe(true);
		expect(crawl.pages[0]?.url).toBe(presence.sourceUrl);
		expect(crawl.pages[0]?.title).toContain("강남 테스트 카페");
		expect(crawl.pages[0]?.bodyText).toContain("영업시간");
		expect(crawl.pages[0]?.schemaJsonLd[0]).toMatchObject({
			"@type": "LocalBusiness",
			name: "강남 테스트 카페",
		});
	});

	it.each(platformFixtures)(
		"parses fixture HTML for $sourceType",
		({ sourceType, fixture, url, expectedName, expectedText, expectedKind }) => {
			const presence = adaptPlatformHtml({
				sourceType,
				sourceUrl: url,
				html: readPlatformFixture(fixture),
			});

			expect(presence.sourceType).toBe(sourceType);
			expect(presence.surfaceKind).toBe(expectedKind);
			expect(presence.sourceUrl).toBe(url);
			expect(presence.name).toBe(expectedName);
			expect(presence.rawText).toContain(expectedText);
			expect(presence.signals.contact.bookingHint).toBe(true);
			expect(presence.signals.content.serviceKeywords).toEqual(
				expect.arrayContaining(["coffee"]),
			);
			expect(presence.limitations.map((item) => item.code)).toEqual(
				expect.arrayContaining([
					"PLATFORM_PUBLIC_HTML_ONLY",
					"PLATFORM_EDIT_SCOPE_LIMITED",
				]),
			);
		},
	);

	it("classifies map, review, and reservation platform surface kinds under other_platform", () => {
		expect(inferSurfaceKind("other_platform", "https://maps.google.com/?cid=123")).toBe(
			"map",
		);
		expect(
			inferSurfaceKind(
				"other_platform",
				"https://reviews.example.com/fixturecafe",
			),
		).toBe("review");
		expect(
			inferSurfaceKind(
				"other_platform",
				"https://app.catchtable.co.kr/ct/shop/test",
			),
		).toBe("reservation");
	});

	it("keeps Naver and Kakao place detail URLs distinct from map surfaces", () => {
		expect(
			inferSurfaceKind(
				"naver_place",
				"https://map.naver.com/p/entry/place/123",
			),
		).toBe("place");
		expect(
			inferSurfaceKind("kakao_place", "https://place.map.kakao.com/123"),
		).toBe("place");
		expect(
			inferSurfaceKind(
				"kakao_place",
				"https://place.map.kakao.com/123/reviews",
			),
		).toBe("review");
		expect(
			inferSurfaceKind("kakao_place", "https://map.kakao.com/?q=Fixture%20Cafe"),
		).toBe("map");
	});

	it("fetches platform public HTML and passes it through the adapter", async () => {
		const headersSeen: string[] = [];
		const fetchImpl: typeof fetch = async (_url, init) => {
			const headers = init?.headers as Record<string, string> | undefined;
			if (headers?.["user-agent"]) headersSeen.push(headers["user-agent"]);
			return {
				ok: true,
				status: 200,
				text: async () => readPlatformFixture("naver-place.html"),
			} as Response;
		};

		const result = await fetchPlatformPresence({
			sourceType: "naver_place",
			sourceUrl: "https://place.naver.com/restaurant/123",
			fetchImpl,
		});

		expect(result.limitations).toEqual([]);
		expect(result.presence?.name).toBe("Fixture Cafe");
		expect(result.presence?.signals.contact.phone).toBe("010-1234-5678");
		expect(headersSeen[0]).toContain("X-SAG-Bot");
	});

	it("does not fetch platform URLs resolving to private addresses", async () => {
		__setHostnameResolverForTests(async () => [
			{ address: "127.0.0.1", family: 4 },
		]);
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchPlatformPresence({
			sourceType: "other_platform",
			sourceUrl: "https://private.example.test/internal",
		});

		expect(result.presence).toBeNull();
		expect(result.limitations.map((item) => item.code)).toEqual([
			"PLATFORM_FETCH_UNAVAILABLE",
		]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it.each(platformFixtures)(
		"fetches fixture public HTML for $sourceType through the adapter",
		async ({ sourceType, fixture, url, expectedName, expectedKind }) => {
			const requestedUrls: string[] = [];
			const userAgents: string[] = [];
			const fetchImpl: typeof fetch = async (requestUrl, init) => {
				requestedUrls.push(String(requestUrl));
				const headers = init?.headers as Record<string, string> | undefined;
				if (headers?.["user-agent"]) userAgents.push(headers["user-agent"]);
				return {
					ok: true,
					status: 200,
					text: async () => readPlatformFixture(fixture),
				} as Response;
			};

			const result = await fetchPlatformPresence({
				sourceType,
				sourceUrl: url,
				fetchImpl,
			});

			expect(result.limitations).toEqual([]);
			expect(requestedUrls).toEqual([url]);
			expect(userAgents[0]).toContain("X-SAG-Bot");
			expect(result.presence).toMatchObject({
				sourceType,
				sourceUrl: url,
				surfaceKind: expectedKind,
				name: expectedName,
			});
		},
	);
});

describe("business presence model", () => {
	it("builds a normalized business presence model across owned and platform surfaces", () => {
		const placePresence = adaptPlatformHtml({
			sourceType: "naver_place",
			sourceUrl: "https://place.naver.com/restaurant/123",
			html: baseHtml,
		});
		const blogPresence = adaptPlatformHtml({
			sourceType: "naver_blog",
			sourceUrl: "https://blog.naver.com/testcafe",
			html: baseHtml,
		});

		const model = buildBusinessPresenceModel({
			primarySourceType: "website",
			primaryUrl: "https://test-cafe.example.kr/",
			surfaces: [
				businessPresenceToSurface(placePresence),
				businessPresenceToSurface(blogPresence),
			],
			limitations: [],
		});

		expect(model.primarySourceType).toBe("website");
		expect(model.surfaces.map((surface) => surface.sourceType)).toEqual([
			"website",
			"naver_place",
			"naver_blog",
		]);
		expect(model.canonicalName).toBe(placePresence.name);
		expect(model.services.length).toBeGreaterThan(0);
	});

	it("deduplicates surface limitations into the top-level model", () => {
		const model = buildBusinessPresenceModel({
			primarySourceType: "website",
			primaryUrl: "https://test-cafe.example.kr/",
			limitations: [
				{
					code: "PLATFORM_LIMITED_EVIDENCE",
					message: "limited",
					affectedCategories: ["seo"],
				},
			],
			surfaces: [
				{
					sourceType: "instagram",
					url: "https://www.instagram.com/testcafe",
					status: "skipped",
					sourceLabel: "인스타그램",
					services: [],
					limitations: [
						{
							code: "PLATFORM_LIMITED_EVIDENCE",
							message: "limited",
							affectedCategories: ["seo"],
						},
						{
							code: "PLATFORM_HTML_FETCH_NOT_ALLOWED",
							message: "official API required",
							affectedCategories: ["seo", "aeo", "geo"],
						},
					],
				},
			],
		});

		expect(model.limitations?.map((item) => item.code)).toEqual([
			"PLATFORM_LIMITED_EVIDENCE",
			"BUSINESS_SURFACE_WEBSITE_REFERENCE_ONLY",
			"PLATFORM_HTML_FETCH_NOT_ALLOWED",
		]);
	});

	it("fetches distinct business surfaces once while preserving input order", async () => {
		const requestedUrls: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (requestUrl: string | URL | Request) => {
				const url = String(requestUrl);
				requestedUrls.push(url);
				const fixture = url.includes("reviews")
					? "review-page.html"
					: "naver-place.html";
				return {
					ok: true,
					status: 200,
					text: async () => readPlatformFixture(fixture),
				} as Response;
			}),
		);

		const surfaces = await fetchBusinessPresenceSurfaces([
			{
				sourceType: "website",
				url: "https://fixturecafe.example",
			},
			{
				sourceType: "naver_place",
				url: "https://place.naver.com/restaurant/123",
			},
			{
				sourceType: "naver_place",
				url: "https://place.naver.com/restaurant/123",
			},
			{
				sourceType: "other_platform",
				url: "https://reviews.example.com/fixturecafe",
				surfaceKind: "review",
			},
			{
				sourceType: "website",
				url: "https://fixturecafe.example",
			},
		]);

		expect(requestedUrls).toEqual([
			"https://place.naver.com/restaurant/123",
			"https://reviews.example.com/fixturecafe",
		]);
		expect(
			surfaces.map((surface) => [
				surface.sourceType,
				surface.surfaceKind,
				surface.status,
				surface.name ?? null,
			]),
		).toEqual([
			["website", "website", "skipped", null],
			["naver_place", "place", "fetched", "Fixture Cafe"],
			["other_platform", "review", "fetched", "Fixture Cafe Reviews"],
		]);
	});

	it("keeps failed platform surfaces in the model with explicit surface kind", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return {
					ok: false,
					status: 503,
					text: async () => "",
				} as Response;
			}),
		);

		const surfaces = await fetchBusinessPresenceSurfaces([
			{
				sourceType: "other_platform",
				url: "https://maps.example.com/?cid=fixturecafe",
				surfaceKind: "map",
			},
		]);

		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]).toMatchObject({
			sourceType: "other_platform",
			surfaceKind: "map",
			url: "https://maps.example.com/?cid=fixturecafe",
			status: "failed",
		});
		expect(surfaces[0]?.limitations.map((item) => item.code)).toEqual([
			"PLATFORM_FETCH_FAILED",
		]);
	});

	it("uses surfaceKind to avoid scoring non-native rules on review surfaces", () => {
		const contactFailure: RuleResult = {
			ruleId: "GEO-CONTACT-001",
			category: "geo",
			passed: false,
			severity: "high",
			title: "contact missing",
			description: "missing",
			evidence: ["contact missing"],
			recommendation: "add contact details",
			actionType: "vendor_action",
			difficulty: "easy",
			expectedImpact: "high",
			ruleWeight: 10,
		};
		const adjusted = applyPlatformRuleScope(
			"other_platform",
			[contactFailure],
			{ surfaceKind: "review" },
		);
		const result = adjusted[0];

		expect(
			getPlatformRuleScope("other_platform", "GEO-CONTACT-001", "review"),
		).toMatchObject({
			improvement: "reference_only",
			scoreEffect: "ignored",
		});
		expect(result?.passed).toBe(true);
		expect(result?.ruleWeight).toBe(0);
		expect(result?.evidence).toContain("platform_scope: reference_only");
	});

	it("keeps native map and reservation rules scoreable for matching surfaces", () => {
		expect(
			getPlatformRuleScope("other_platform", "GEO-MAP-EMBED-001", "map"),
		).toMatchObject({
			improvement: "platform_editable",
			scoreEffect: "scored",
		});
		expect(
			getPlatformRuleScope("other_platform", "SEO-CTA-001", "reservation"),
		).toMatchObject({
			improvement: "platform_editable",
			scoreEffect: "scored",
		});
	});
});

describe("platform-aware rule scope", () => {
	const canonicalFailure: RuleResult = {
		ruleId: "SEO-CANONICAL-001",
		category: "seo",
		passed: false,
		severity: "high",
		title: "canonical missing",
		description: "missing",
		evidence: ["canonical missing"],
		recommendation: "add canonical",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};

	const profileFailure: RuleResult = {
		...canonicalFailure,
		ruleId: "GEO-CONTACT-001",
		category: "geo",
		title: "contact missing",
		recommendation: "add contact details",
	};

	const partiallyObservableFailure: RuleResult = {
		...canonicalFailure,
		ruleId: "SEO-STRUCTURE-001",
		title: "heading structure unclear",
		recommendation: "improve heading structure",
		ruleWeight: 8,
	};

	it("marks homepage-only technical rules as reference-only for platform sources", () => {
		const canonicalScope = getPlatformRuleScope(
			"naver_place",
			canonicalFailure.ruleId,
		);
		const contactScope = getPlatformRuleScope("naver_place", profileFailure.ruleId);

		expect(canonicalScope).toMatchObject({
			measurement: "observable",
			improvement: "reference_only",
			scoreEffect: "ignored",
		});
		expect(contactScope).toMatchObject({
			measurement: "observable",
			improvement: "platform_editable",
			scoreEffect: "scored",
		});
	});

	it("removes reference-only platform rules from score input while keeping actionable rules", () => {
		const adjusted = applyPlatformRuleScope("instagram", [
			canonicalFailure,
			profileFailure,
		]);

		expect(adjusted.find((r) => r.ruleId === "SEO-CANONICAL-001")?.passed).toBe(
			true,
		);
		expect(
			adjusted.find((r) => r.ruleId === "SEO-CANONICAL-001")?.evidence,
		).toContain("platform_scope: reference_only");
		expect(adjusted.find((r) => r.ruleId === "GEO-CONTACT-001")?.passed).toBe(
			false,
		);
	});

	it("reweights partially observable platform rules instead of applying a full website penalty", () => {
		const adjusted = applyPlatformRuleScope("naver_blog", [
			partiallyObservableFailure,
		]);
		const result = adjusted[0];

		expect(result?.passed).toBe(false);
		expect(result?.ruleWeight).toBeGreaterThan(0);
		expect(result?.ruleWeight).toBeLessThan(
			partiallyObservableFailure.ruleWeight,
		);
		expect(result?.evidence).toContain("platform_scope: reweighted");
		expect(result?.recommendation).toContain("플랫폼 공개 데이터");
	});
});
