/**
 * X-SAG Core Engine — Crawler 단위 테스트 (BACKLOG-G P3 / TASK-CORE-016)
 *
 * 목적:
 *  1. DEFAULT_CRAWL_OPTIONS.maxPagesPerSite === 50 회귀 방지 (BACKLOG-G P3).
 *  2. enableJsRendering=false 일 때 JS render adapter 가 호출되지 않음을 확인.
 *  3. enableJsRendering=true 이지만 Playwright 미설치(또는 어댑터 unavailable) 시
 *     크롤이 크래시하지 않고 정적 HTML 로 폴백하며 failureReason="JS_RENDER_FAILED"
 *     가 mainPage 에 세팅되는지 확인.
 *  4. enableJsRendering=true + 가용 어댑터일 때 fetchRendered() 가 호출되고
 *     렌더링된 HTML 이 mainPage 에 반영되는지 확인.
 *
 * 모든 네트워크 호출은 vi.stubGlobal("fetch", ...) 로 모킹한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __setJsRenderAdapterFactory, crawlSite } from "../crawler.js";
import { DEFAULT_CRAWL_OPTIONS } from "../types.js";
import type { JsRenderAdapter, RenderResult } from "../v2/js-render/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 정적 HTML 만 반환하는 단순 fetch mock.
 * robots.txt 는 404 (notFound → 허용), 그 외 URL 은 동일한 HTML 응답.
 */
function stubFetchWithHtml(
	html: string,
	headers: Record<string, string> = {},
): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async (url: string | URL | Request) => {
		const u =
			typeof url === "string"
				? url
				: ((url as URL).toString?.() ?? String(url));

		// robots.txt → 404
		if (u.endsWith("/robots.txt")) {
			return new Response("", { status: 404, headers: {} });
		}

		return new Response(html, {
			status: 200,
			headers: { "content-type": "text/html; charset=utf-8", ...headers },
		});
	});

	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const SIMPLE_STATIC_HTML = `
  <!DOCTYPE html>
  <html lang="ko">
    <head>
      <title>정적 페이지</title>
      <meta name="description" content="정적 HTML">
    </head>
    <body>
      <h1>정적 페이지</h1>
      <p>본문</p>
    </body>
  </html>
`;

const RENDERED_HTML = `
  <!DOCTYPE html>
  <html lang="ko">
    <head>
      <title>렌더링된 페이지</title>
      <meta name="description" content="Playwright 결과">
    </head>
    <body>
      <h1>렌더링된 페이지</h1>
      <p>JS 실행 후</p>
    </body>
  </html>
`;

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	// 다른 테스트로 어댑터 팩토리가 새지 않도록 복원
	__setJsRenderAdapterFactory(null);
});

describe("crawlSite secondary JS-rendered pages", () => {
	it("renders discovered secondary SPA pages when JS rendering is enabled", async () => {
		const staticShell = `
			<!DOCTYPE html>
			<html lang="ko">
				<head><title>Static Shell</title></head>
				<body><div id="root"></div></body>
			</html>
		`;
		stubFetchWithHtml(staticShell);

		const fetchRendered = vi.fn(async (url: string): Promise<RenderResult> => {
			const isDetail = url.includes("/spa-detail");
			return {
				html: isDetail
					? "<!DOCTYPE html><html><head><title>Rendered Detail</title></head><body><h1>Rendered Detail</h1></body></html>"
					: '<!DOCTYPE html><html><head><title>Rendered Home</title></head><body><a href="/spa-detail">Detail</a></body></html>',
				finalUrl: url,
				statusCode: 200,
				durationMs: 30,
				source: "mock",
				renderedAt: new Date().toISOString(),
			};
		});
		const okAdapter: JsRenderAdapter = {
			name: "fake-ok",
			isAvailable: () => true,
			fetchRendered,
		};

		__setJsRenderAdapterFactory(() => okAdapter);

		const result = await crawlSite("https://example.com/", {
			enableJsRendering: true,
			maxPagesPerSite: 2,
			requestIntervalMs: 1,
			totalTimeoutMs: 5_000,
			useSitemap: false,
		});

		expect(fetchRendered).toHaveBeenCalledTimes(2);
		expect(fetchRendered.mock.calls.map(([url]) => url)).toEqual([
			"https://example.com/",
			"https://example.com/spa-detail",
		]);
		expect(result.pages.map((page) => page.title)).toEqual([
			"Rendered Home",
			"Rendered Detail",
		]);
		expect(result.pages.every((page) => page.failureReason === undefined)).toBe(
			true,
		);
	});
});

// ---------------------------------------------------------------------------
// Test 1 — DEFAULT_CRAWL_OPTIONS.maxPagesPerSite (BACKLOG-G P3 회귀 방지)
// ---------------------------------------------------------------------------

describe("DEFAULT_CRAWL_OPTIONS (BACKLOG-G P3)", () => {
	it("maxPagesPerSite === 50 (BACKLOG-G P3 / TASK-CORE-016)", () => {
		expect(DEFAULT_CRAWL_OPTIONS.maxPagesPerSite).toBe(50);
	});

	it("time budget — 50 페이지 × 1s requestIntervalMs ≤ totalTimeoutMs", () => {
		// worst-case 순차 크롤 시간: maxPages × requestIntervalMs ≤ totalTimeoutMs
		// 50 × 1000 = 50_000 ≤ 60_000 → 예산 내.
		const worstCaseMs =
			DEFAULT_CRAWL_OPTIONS.maxPagesPerSite *
			DEFAULT_CRAWL_OPTIONS.requestIntervalMs;
		expect(worstCaseMs).toBeLessThanOrEqual(
			DEFAULT_CRAWL_OPTIONS.totalTimeoutMs,
		);
	});

	it("perDomainConcurrency 와 requestIntervalMs 가 POLICY § 4.2 와 일치 (회귀 방지)", () => {
		expect(DEFAULT_CRAWL_OPTIONS.perDomainConcurrency).toBe(1);
		expect(DEFAULT_CRAWL_OPTIONS.requestIntervalMs).toBe(1000);
		expect(DEFAULT_CRAWL_OPTIONS.totalTimeoutMs).toBe(60_000);
	});
});

// ---------------------------------------------------------------------------
// Test 2 — enableJsRendering=false 시 JS render adapter 미호출
// ---------------------------------------------------------------------------

describe("crawlSite — enableJsRendering=false (BACKLOG-G P3 / TASK-CORE-016)", () => {
	it("어댑터 fetchRendered() 가 호출되지 않는다", async () => {
		const fetchRendered = vi.fn<JsRenderAdapter["fetchRendered"]>();
		const isAvailable = vi.fn(() => true);
		const fakeAdapter: JsRenderAdapter = {
			name: "fake",
			isAvailable,
			fetchRendered,
		};

		__setJsRenderAdapterFactory(() => fakeAdapter);

		stubFetchWithHtml(SIMPLE_STATIC_HTML);

		const result = await crawlSite("https://example.com/", {
			enableJsRendering: false,
			// 내부 링크 크롤로 시간이 길어지지 않도록 1페이지로 제한 (정적 HTML 에 링크 없음)
			maxPagesPerSite: 1,
			totalTimeoutMs: 5_000,
		});

		expect(result.pages.length).toBeGreaterThanOrEqual(1);
		expect(fetchRendered).not.toHaveBeenCalled();
		// isAvailable 도 호출되지 않아야 함 (enableJsRendering=false 경로 자체를 건너뜀)
		expect(isAvailable).not.toHaveBeenCalled();
		// 정적 HTML 그대로 파싱되었는지 확인
		const main = result.pages[0];
		expect(main?.title).toBe("정적 페이지");
		expect(main?.failureReason).toBeUndefined();
	});

	it("Content-Language 응답 헤더와 html lang 을 ParsedPage 로 전달한다", async () => {
		stubFetchWithHtml(SIMPLE_STATIC_HTML, { "content-language": "ko-KR" });

		const result = await crawlSite("https://example.com/", {
			enableJsRendering: false,
			maxPagesPerSite: 1,
			totalTimeoutMs: 5_000,
		});

		const main = result.pages[0];
		expect(main?.htmlLang).toBe("ko");
		expect(main?.contentLanguageHeader).toBe("ko-KR");
	});
});

// ---------------------------------------------------------------------------
// Test 3 — enableJsRendering=true 이지만 어댑터 unavailable → 안전 폴백
// ---------------------------------------------------------------------------

describe("crawlSite — enableJsRendering=true, adapter unavailable (BACKLOG-G P3)", () => {
	it("크래시 없이 정적 HTML 로 폴백하고 failureReason=JS_RENDER_FAILED 가 세팅된다", async () => {
		const fetchRendered = vi.fn<JsRenderAdapter["fetchRendered"]>();
		const unavailableAdapter: JsRenderAdapter = {
			name: "fake-unavailable",
			isAvailable: () => false, // Playwright 미설치 시뮬레이션
			fetchRendered,
		};

		__setJsRenderAdapterFactory(() => unavailableAdapter);

		stubFetchWithHtml(SIMPLE_STATIC_HTML);

		const result = await crawlSite("https://example.com/", {
			enableJsRendering: true,
			maxPagesPerSite: 1,
			totalTimeoutMs: 5_000,
		});

		// 정적 fetch 는 성공 → 페이지가 1개 이상 존재
		expect(result.pages.length).toBeGreaterThanOrEqual(1);
		// render 는 호출 시도조차 하지 않았다 (isAvailable=false)
		expect(fetchRendered).not.toHaveBeenCalled();
		// 폴백 시 정적 HTML 사용 + failureReason=JS_RENDER_FAILED 기록
		const main = result.pages[0];
		expect(main?.title).toBe("정적 페이지");
		expect(main?.failureReason).toBe("JS_RENDER_FAILED");
	});

	it("어댑터 render 호출이 throw 해도 정적 결과로 폴백한다", async () => {
		const throwingAdapter: JsRenderAdapter = {
			name: "fake-throws",
			isAvailable: () => true,
			fetchRendered: vi.fn(async () => {
				throw new Error("simulated playwright launch failure");
			}),
		};

		__setJsRenderAdapterFactory(() => throwingAdapter);

		stubFetchWithHtml(SIMPLE_STATIC_HTML);

		const result = await crawlSite("https://example.com/", {
			enableJsRendering: true,
			maxPagesPerSite: 1,
			totalTimeoutMs: 5_000,
		});

		expect(result.pages.length).toBeGreaterThanOrEqual(1);
		const main = result.pages[0];
		expect(main?.title).toBe("정적 페이지");
		expect(main?.failureReason).toBe("JS_RENDER_FAILED");
	});
});

// ---------------------------------------------------------------------------
// Test 4 — enableJsRendering=true, 어댑터 available → 렌더링 HTML 사용
// ---------------------------------------------------------------------------

describe("crawlSite — enableJsRendering=true, adapter available (BACKLOG-G P3)", () => {
	it("fetchRendered() 결과 HTML 이 mainPage 에 반영된다", async () => {
		const renderResult: RenderResult = {
			html: RENDERED_HTML,
			finalUrl: "https://example.com/",
			statusCode: 200,
			durationMs: 42,
			source: "mock",
			renderedAt: new Date().toISOString(),
		};

		const fetchRendered = vi.fn(async () => renderResult);
		const okAdapter: JsRenderAdapter = {
			name: "fake-ok",
			isAvailable: () => true,
			fetchRendered,
		};

		__setJsRenderAdapterFactory(() => okAdapter);

		stubFetchWithHtml(SIMPLE_STATIC_HTML);

		const result = await crawlSite("https://example.com/", {
			enableJsRendering: true,
			maxPagesPerSite: 1,
			totalTimeoutMs: 5_000,
		});

		expect(fetchRendered).toHaveBeenCalledTimes(1);
		// 어댑터에 전달된 옵션이 BACKLOG-G P3 정책과 일치하는지 확인
		const [renderedUrl, renderOpts] = fetchRendered.mock.calls[0] ?? [];
		expect(renderedUrl).toBe("https://example.com/");
		expect(renderOpts?.blockResources).toEqual(
			expect.arrayContaining(["image", "font", "stylesheet", "media"]),
		);
		expect(renderOpts?.timeoutMs).toBe(30_000);

		// 렌더링 결과가 mainPage 로 사용됨
		const main = result.pages[0];
		expect(main?.title).toBe("렌더링된 페이지");
		expect(main?.failureReason).toBeUndefined();
	});
});
