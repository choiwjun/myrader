/**
 * X-SAG Core Engine — Crawler ↔ Sitemap 통합 테스트 (BACKLOG-G P3)
 *
 * 검증 항목:
 *  1. sitemap 발견 시 sitemap URL 이 우선 크롤된다 (CrawlResult.sitemapUsed=true).
 *  2. sitemap URL > maxPagesPerSite 시 priority 기준으로 truncate.
 *  3. sitemap 미발견 시 기존 BFS 동작 유지 (sitemapUsed=false).
 *  4. robots.txt disallow 와 sitemap URL 충돌 시 disallow 우선.
 *  5. useSitemap=false 면 sitemap fetch 를 시도하지 않고 BFS 만 사용.
 *  6. sitemap fetcher 가 throw 해도 BFS 로 graceful 폴백.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
	__setJsRenderAdapterFactory,
	__setSitemapFetcher,
	crawlSite,
} from "../crawler.js";
import type { SitemapResult } from "../sitemap.js";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/**
 * URL별로 응답을 매핑하는 fetch mock.
 * robots.txt 의 응답을 명시적으로 제어할 수 있다.
 */
function stubFetchByMap(
	responses: Record<
		string,
		{ status: number; body?: string; contentType?: string }
	>,
): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async (url: string | URL | Request) => {
		const key = typeof url === "string" ? url : (url as URL).toString();
		const resp = responses[key];
		if (!resp) {
			// 기본은 200 OK 빈 HTML — 임의 URL 호출 시에도 크래시 방지
			return new Response("<html><body></body></html>", {
				status: 200,
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		}
		return new Response(resp.body ?? "", {
			status: resp.status,
			headers: {
				"content-type": resp.contentType ?? "text/html; charset=utf-8",
			},
		});
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const STATIC_HTML = `
  <!DOCTYPE html>
  <html lang="ko">
    <head><title>Main</title></head>
    <body>
      <h1>Main</h1>
      <a href="https://example.com/internal-a">a</a>
      <a href="https://example.com/internal-b">b</a>
    </body>
  </html>
`;

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	__setSitemapFetcher(null);
	__setJsRenderAdapterFactory(null);
});

// ---------------------------------------------------------------------------
// Test 1 — sitemap 발견 시 sitemap URL 우선 크롤
// ---------------------------------------------------------------------------

describe("crawlSite + sitemap (BACKLOG-G P3) — sitemap 발견", () => {
	it("sitemap URL 이 우선 크롤된다 (sitemapUsed=true)", async () => {
		const sitemapResult: SitemapResult = {
			source: "sitemap",
			fetchedAt: new Date().toISOString(),
			urls: [
				{ loc: "https://example.com/sitemap-page-1", priority: 0.9 },
				{ loc: "https://example.com/sitemap-page-2", priority: 0.5 },
			],
		};
		__setSitemapFetcher(async () => sitemapResult);

		const fetchMock = stubFetchByMap({
			"https://example.com/robots.txt": { status: 404 },
			"https://example.com/": { status: 200, body: STATIC_HTML },
			"https://example.com/sitemap-page-1": {
				status: 200,
				body: "<html><head><title>P1</title></head><body><h1>P1</h1></body></html>",
			},
			"https://example.com/sitemap-page-2": {
				status: 200,
				body: "<html><head><title>P2</title></head><body><h1>P2</h1></body></html>",
			},
		});

		const result = await crawlSite("https://example.com/", {
			maxPagesPerSite: 5,
			totalTimeoutMs: 10_000,
			requestIntervalMs: 0,
		});

		expect(result.sitemapUsed).toBe(true);
		// 메인 + sitemap 2 = 3 페이지
		expect(result.pages.length).toBe(3);
		// sitemap URL 이 fetch 되었는지 확인
		const fetchedUrls = fetchMock.mock.calls.map((c) => String(c[0]));
		expect(fetchedUrls).toContain("https://example.com/sitemap-page-1");
		expect(fetchedUrls).toContain("https://example.com/sitemap-page-2");
		// priority 높은 것이 먼저 (메인 뒤 첫 번째)
		expect(result.pages[1]?.title).toBe("P1");
	});

	it("sitemapUsed remains true when a sitemap-selected secondary page fails", async () => {
		const sitemapResult: SitemapResult = {
			source: "sitemap",
			fetchedAt: new Date().toISOString(),
			urls: [{ loc: "https://example.com/missing-from-sitemap", priority: 0.9 }],
		};
		__setSitemapFetcher(async () => sitemapResult);

		stubFetchByMap({
			"https://example.com/robots.txt": { status: 404 },
			"https://example.com/": { status: 200, body: STATIC_HTML },
			"https://example.com/missing-from-sitemap": { status: 404 },
		});

		const result = await crawlSite("https://example.com/", {
			maxPagesPerSite: 5,
			totalTimeoutMs: 10_000,
			requestIntervalMs: 0,
		});

		expect(result.sitemapUsed).toBe(true);
		expect(result.partialResult).toBe(true);
		expect(result.pages[1]?.url).toBe("https://example.com/missing-from-sitemap");
		expect(result.pages[1]?.statusCode).toBe(404);
		expect(result.pages[1]?.failureReason).toBe("HTTP_4xx");
	});

	it("sitemap URL 이 maxPagesPerSite 보다 많으면 priority 내림차순으로 truncate", async () => {
		const sitemapResult: SitemapResult = {
			source: "sitemap",
			fetchedAt: new Date().toISOString(),
			urls: [
				{ loc: "https://example.com/low", priority: 0.2 },
				{ loc: "https://example.com/high", priority: 0.9 },
				{ loc: "https://example.com/mid", priority: 0.5 },
				{ loc: "https://example.com/highest", priority: 1.0 },
			],
		};
		__setSitemapFetcher(async () => sitemapResult);

		stubFetchByMap({
			"https://example.com/robots.txt": { status: 404 },
			"https://example.com/": { status: 200, body: STATIC_HTML },
			"https://example.com/highest": {
				status: 200,
				body: "<html><head><title>HIGHEST</title></head></html>",
			},
			"https://example.com/high": {
				status: 200,
				body: "<html><head><title>HIGH</title></head></html>",
			},
		});

		// 메인 + 2 페이지만 크롤 (maxPagesPerSite=3)
		const result = await crawlSite("https://example.com/", {
			maxPagesPerSite: 3,
			totalTimeoutMs: 10_000,
			requestIntervalMs: 0,
		});

		expect(result.sitemapUsed).toBe(true);
		expect(result.pages.length).toBe(3);
		expect(result.pages[1]?.title).toBe("HIGHEST"); // priority 1.0
		expect(result.pages[2]?.title).toBe("HIGH"); // priority 0.9
	});
});

// ---------------------------------------------------------------------------
// Test 2 — sitemap 미발견 → BFS 폴백
// ---------------------------------------------------------------------------

describe("crawlSite + sitemap — 미발견 시 BFS 폴백", () => {
	it("sitemap fetcher 가 null 을 반환하면 기존 BFS 동작 (sitemapUsed=false)", async () => {
		__setSitemapFetcher(async () => null);

		stubFetchByMap({
			"https://example.com/robots.txt": { status: 404 },
			"https://example.com/": { status: 200, body: STATIC_HTML },
			"https://example.com/internal-a": {
				status: 200,
				body: "<html><head><title>A</title></head></html>",
			},
			"https://example.com/internal-b": {
				status: 200,
				body: "<html><head><title>B</title></head></html>",
			},
		});

		const result = await crawlSite("https://example.com/", {
			maxPagesPerSite: 5,
			totalTimeoutMs: 10_000,
			requestIntervalMs: 0,
		});

		expect(result.sitemapUsed).toBe(false);
		expect(result.pages.length).toBe(3); // 메인 + internalLinks 2개
		expect(result.pages[0]?.title).toBe("Main");
	});

	it("sitemap fetcher 가 throw 해도 BFS 로 graceful 폴백한다", async () => {
		__setSitemapFetcher(async () => {
			throw new Error("simulated sitemap fetch failure");
		});

		stubFetchByMap({
			"https://example.com/robots.txt": { status: 404 },
			"https://example.com/": { status: 200, body: STATIC_HTML },
			"https://example.com/internal-a": {
				status: 200,
				body: "<html><head><title>A</title></head></html>",
			},
		});

		const result = await crawlSite("https://example.com/", {
			maxPagesPerSite: 5,
			totalTimeoutMs: 10_000,
			requestIntervalMs: 0,
		});

		expect(result.sitemapUsed).toBe(false);
		expect(result.pages.length).toBeGreaterThanOrEqual(1);
		expect(result.pages[0]?.title).toBe("Main");
	});
});

// ---------------------------------------------------------------------------
// Test 3 — useSitemap=false
// ---------------------------------------------------------------------------

describe("crawlSite + sitemap — useSitemap=false", () => {
	it("useSitemap=false 면 sitemap fetcher 가 호출되지 않는다", async () => {
		const sitemapFetcher = vi.fn(async () => null);
		__setSitemapFetcher(sitemapFetcher);

		stubFetchByMap({
			"https://example.com/robots.txt": { status: 404 },
			"https://example.com/": { status: 200, body: STATIC_HTML },
		});

		const result = await crawlSite("https://example.com/", {
			useSitemap: false,
			maxPagesPerSite: 1,
			totalTimeoutMs: 5_000,
			requestIntervalMs: 0,
		});

		expect(sitemapFetcher).not.toHaveBeenCalled();
		expect(result.sitemapUsed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Test 4 — robots.txt disallow 와 sitemap URL 충돌
// ---------------------------------------------------------------------------

describe("crawlSite + sitemap — robots.txt disallow 우선", () => {
	it("robots.txt 가 disallow 한 sitemap URL 은 크롤하지 않는다", async () => {
		const sitemapResult: SitemapResult = {
			source: "sitemap",
			fetchedAt: new Date().toISOString(),
			urls: [
				{ loc: "https://example.com/private/secret", priority: 0.9 },
				{ loc: "https://example.com/public/page", priority: 0.8 },
			],
		};
		__setSitemapFetcher(async () => sitemapResult);

		const fetchMock = stubFetchByMap({
			"https://example.com/robots.txt": {
				status: 200,
				body: "User-agent: *\nDisallow: /private/\n",
			},
			"https://example.com/": { status: 200, body: STATIC_HTML },
			"https://example.com/public/page": {
				status: 200,
				body: "<html><head><title>PUBLIC</title></head></html>",
			},
			"https://example.com/private/secret": {
				// 만약 잘못 호출되면 알 수 있도록 표식 — 하지만 호출되면 안 됨
				status: 200,
				body: "<html><head><title>SHOULD-NOT-BE-FETCHED</title></head></html>",
			},
		});

		const result = await crawlSite("https://example.com/", {
			maxPagesPerSite: 5,
			totalTimeoutMs: 10_000,
			requestIntervalMs: 0,
		});

		expect(result.sitemapUsed).toBe(true);
		// public 만 크롤되었어야 함 (메인 + 1)
		expect(result.pages.length).toBe(2);
		expect(result.pages[1]?.title).toBe("PUBLIC");

		// /private/secret 은 fetch 호출되면 안 됨
		const fetchedUrls = fetchMock.mock.calls.map((c) => String(c[0]));
		expect(fetchedUrls).not.toContain("https://example.com/private/secret");
	});

	it("sitemap URL 에 다른 도메인 URL 이 섞여 있으면 제외한다", async () => {
		const sitemapResult: SitemapResult = {
			source: "sitemap",
			fetchedAt: new Date().toISOString(),
			urls: [
				{ loc: "https://example.com/same-domain", priority: 0.9 },
				{ loc: "https://other.com/external", priority: 0.95 },
			],
		};
		__setSitemapFetcher(async () => sitemapResult);

		const fetchMock = stubFetchByMap({
			"https://example.com/robots.txt": { status: 404 },
			"https://example.com/": { status: 200, body: STATIC_HTML },
			"https://example.com/same-domain": {
				status: 200,
				body: "<html><head><title>SAME</title></head></html>",
			},
		});

		const result = await crawlSite("https://example.com/", {
			maxPagesPerSite: 5,
			totalTimeoutMs: 10_000,
			requestIntervalMs: 0,
		});

		expect(result.sitemapUsed).toBe(true);
		expect(result.pages.length).toBe(2); // 메인 + same-domain
		const fetchedUrls = fetchMock.mock.calls.map((c) => String(c[0]));
		expect(fetchedUrls).not.toContain("https://other.com/external");
	});
});
