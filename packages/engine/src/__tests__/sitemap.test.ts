/**
 * X-SAG Core Engine — Sitemap 단위 테스트 (BACKLOG-G P3)
 *
 * 검증 항목:
 *  - sitemap.xml 정상 파싱 (5+ URL)
 *  - sitemap-index → child sitemap 1회 재귀
 *  - 무한 재귀 방지 (child 도 sitemap-index 인 경우 stop)
 *  - 404 응답 → null 반환
 *  - 빈 sitemap → urls=[]
 *  - 1000 URL 초과 → truncate
 *  - XML namespace 다양한 형태 (xmlns 있음/없음, ns prefix)
 *  - 잘못된 XML → null/empty (graceful)
 *  - priority/changefreq 누락 → optional 필드 undefined
 *  - robots.txt 의 Sitemap: 디렉티브 폴백
 *  - 5MB 응답 제한 / SSRF 검증
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSitemap, parseSitemapXml } from "../sitemap.js";
import { __setHostnameResolverForTests } from "../utils/url.js";

// ---------------------------------------------------------------------------
// 헬퍼 — fetch mock
// ---------------------------------------------------------------------------

function stubFetchByUrl(
	responses: Record<string, { status: number; body?: string }>,
): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async (url: string | URL | Request) => {
		const key = typeof url === "string" ? url : (url as URL).toString();
		const resp = responses[key];
		if (!resp) {
			return new Response("not found", { status: 404 });
		}
		return new Response(resp.body ?? "", {
			status: resp.status,
			headers: { "content-type": "application/xml" },
		});
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

beforeEach(() => {
	__setHostnameResolverForTests(async () => [
		{ address: "93.184.216.34", family: 4 },
	]);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	__setHostnameResolverForTests(null);
});

// ---------------------------------------------------------------------------
// parseSitemapXml — 순수 함수 테스트
// ---------------------------------------------------------------------------

describe("parseSitemapXml — XML 파싱", () => {
	it("표준 sitemap.xml 을 정상 파싱한다 (5+ URL)", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>
  <url><loc>https://example.com/about</loc><priority>0.8</priority></url>
  <url><loc>https://example.com/products</loc><priority>0.9</priority></url>
  <url><loc>https://example.com/services</loc><priority>0.7</priority></url>
  <url><loc>https://example.com/faq</loc><priority>0.6</priority></url>
  <url><loc>https://example.com/contact</loc><priority>0.5</priority></url>
</urlset>`;
		const result = parseSitemapXml(xml);
		expect(result.source).toBe("sitemap");
		expect(result.urls.length).toBe(6);
		expect(result.urls[0]?.loc).toBe("https://example.com/");
		expect(result.urls[0]?.priority).toBe(1.0);
		expect(result.urls[0]?.changefreq).toBe("daily");
	});

	it("priority 와 changefreq 가 누락되면 undefined 가 된다", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/no-meta</loc></url>
</urlset>`;
		const result = parseSitemapXml(xml);
		expect(result.urls.length).toBe(1);
		expect(result.urls[0]?.loc).toBe("https://example.com/no-meta");
		expect(result.urls[0]?.priority).toBeUndefined();
		expect(result.urls[0]?.changefreq).toBeUndefined();
		expect(result.urls[0]?.lastmod).toBeUndefined();
	});

	it("xmlns 가 없는 단순 형태도 파싱한다", () => {
		const xml = `<urlset>
  <url><loc>https://example.com/a</loc></url>
  <url><loc>https://example.com/b</loc></url>
</urlset>`;
		const result = parseSitemapXml(xml);
		expect(result.urls.length).toBe(2);
	});

	it("namespace prefix (e.g. sm:) 가 붙은 형태도 파싱한다", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sm:url><sm:loc>https://example.com/ns</sm:loc></sm:url>
</sm:urlset>`;
		const result = parseSitemapXml(xml);
		expect(result.source).toBe("sitemap");
		expect(result.urls.length).toBeGreaterThanOrEqual(1);
		expect(result.urls[0]?.loc).toBe("https://example.com/ns");
	});

	it("sitemap-index 를 인식하고 childSitemaps 를 채운다", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
</sitemapindex>`;
		const result = parseSitemapXml(xml);
		expect(result.source).toBe("sitemap-index");
		expect(result.urls.length).toBe(0);
		expect(result.childSitemaps?.length).toBe(2);
		expect(result.childSitemaps?.[0]).toBe("https://example.com/sitemap-1.xml");
	});

	it("빈 sitemap (url 없음) 은 urls=[] 를 반환한다", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
		const result = parseSitemapXml(xml);
		expect(result.urls).toEqual([]);
		expect(result.source).toBe("sitemap");
	});

	it("1000 URL 초과 시 truncate 된다", () => {
		const items: string[] = [];
		for (let i = 0; i < 1500; i++) {
			items.push(`<url><loc>https://example.com/p${i}</loc></url>`);
		}
		const xml = `<urlset>${items.join("")}</urlset>`;
		const result = parseSitemapXml(xml);
		expect(result.urls.length).toBe(1000);
	});

	it("잘못된 XML 도 throw 하지 않고 빈 결과를 반환한다", () => {
		// cheerio xmlMode 는 매우 관대 — 실제로는 'this is not xml' 같은 경우도
		// 빈 트리로 처리한다. 핵심은 throw 하지 않는 것.
		const result = parseSitemapXml("<<<not actually xml>>>");
		expect(result.urls).toEqual([]);
	});

	it("빈 문자열 입력 시 빈 결과를 반환한다", () => {
		expect(parseSitemapXml("").urls).toEqual([]);
		expect(parseSitemapXml("   \n  ").urls).toEqual([]);
	});

	it("loc 가 없는 url 엔트리는 건너뛴다", () => {
		const xml = `<urlset>
  <url><priority>0.5</priority></url>
  <url><loc>https://example.com/ok</loc></url>
</urlset>`;
		const result = parseSitemapXml(xml);
		expect(result.urls.length).toBe(1);
		expect(result.urls[0]?.loc).toBe("https://example.com/ok");
	});

	it("lastmod 가 있으면 그대로 보존한다", () => {
		const xml = `<urlset>
  <url><loc>https://example.com/a</loc><lastmod>2026-01-15</lastmod></url>
</urlset>`;
		const result = parseSitemapXml(xml);
		expect(result.urls[0]?.lastmod).toBe("2026-01-15");
	});
});

// ---------------------------------------------------------------------------
// fetchSitemap — 네트워크 동작 테스트
// ---------------------------------------------------------------------------

describe("fetchSitemap — 네트워크", () => {
	it("정상 sitemap.xml 응답 시 SitemapResult 를 반환한다", async () => {
		const xml = `<urlset>
  <url><loc>https://example.com/a</loc><priority>0.9</priority></url>
  <url><loc>https://example.com/b</loc><priority>0.5</priority></url>
</urlset>`;
		stubFetchByUrl({
			"https://example.com/sitemap.xml": { status: 200, body: xml },
		});
		const result = await fetchSitemap("https://example.com/");
		expect(result).not.toBeNull();
		expect(result?.urls.length).toBe(2);
		expect(result?.source).toBe("sitemap");
	});

	it("sitemap.xml 이 404 이고 robots.txt 에도 Sitemap: 가 없으면 null 을 반환한다", async () => {
		stubFetchByUrl({
			"https://example.com/sitemap.xml": { status: 404 },
			"https://example.com/robots.txt": {
				status: 200,
				body: "User-agent: *\nDisallow: /private\n",
			},
		});
		const result = await fetchSitemap("https://example.com/");
		expect(result).toBeNull();
	});

	it("sitemap.xml 이 404 이고 robots.txt 에 Sitemap: 디렉티브가 있으면 그 URL 로 폴백한다", async () => {
		const xml = `<urlset>
  <url><loc>https://example.com/from-robots</loc></url>
</urlset>`;
		stubFetchByUrl({
			"https://example.com/sitemap.xml": { status: 404 },
			"https://example.com/robots.txt": {
				status: 200,
				body: "User-agent: *\nAllow: /\nSitemap: https://example.com/custom-sitemap.xml\n",
			},
			"https://example.com/custom-sitemap.xml": { status: 200, body: xml },
		});
		const result = await fetchSitemap("https://example.com/");
		expect(result).not.toBeNull();
		expect(result?.urls.length).toBe(1);
		expect(result?.urls[0]?.loc).toBe("https://example.com/from-robots");
	});

	it("sitemap-index → child sitemap 1회 재귀 수행", async () => {
		const indexXml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
</sitemapindex>`;
		const childXml = `<urlset>
  <url><loc>https://example.com/child-a</loc><priority>0.9</priority></url>
  <url><loc>https://example.com/child-b</loc><priority>0.8</priority></url>
</urlset>`;
		stubFetchByUrl({
			"https://example.com/sitemap.xml": { status: 200, body: indexXml },
			"https://example.com/sitemap-1.xml": { status: 200, body: childXml },
		});
		const result = await fetchSitemap("https://example.com/");
		expect(result).not.toBeNull();
		expect(result?.urls.length).toBe(2);
		expect(result?.urls[0]?.loc).toBe("https://example.com/child-a");
		expect(result?.source).toBe("sitemap");
	});

	it("child 도 sitemap-index 면 무한 재귀를 방지하기 위해 stop 한다", async () => {
		const indexXml = `<sitemapindex>
  <sitemap><loc>https://example.com/sitemap-nested.xml</loc></sitemap>
</sitemapindex>`;
		const nestedIndexXml = `<sitemapindex>
  <sitemap><loc>https://example.com/sitemap-deeper.xml</loc></sitemap>
</sitemapindex>`;
		const fetchMock = vi.fn(async (url: string | URL | Request) => {
			const key = typeof url === "string" ? url : (url as URL).toString();
			if (key === "https://example.com/sitemap.xml") {
				return new Response(indexXml, { status: 200 });
			}
			if (key === "https://example.com/sitemap-nested.xml") {
				return new Response(nestedIndexXml, { status: 200 });
			}
			// 더 깊이 들어가면 안 되므로 deeper 는 호출되면 안 됨
			return new Response("DEEPER FETCHED — SHOULD NOT HAPPEN", {
				status: 200,
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await fetchSitemap("https://example.com/");
		expect(result).not.toBeNull();
		expect(result?.source).toBe("sitemap-index");
		// sitemap-deeper.xml 은 절대 호출되면 안 됨
		const calls = fetchMock.mock.calls.map((c) => String(c[0]));
		expect(calls).not.toContain("https://example.com/sitemap-deeper.xml");
	});

	it("네트워크 오류 (fetch reject) 시 null 을 반환한다", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("simulated network error");
			}),
		);
		const result = await fetchSitemap("https://example.com/");
		expect(result).toBeNull();
	});

	it("잘못된 baseUrl 은 null 을 반환한다 (URL 파싱 실패)", async () => {
		const result = await fetchSitemap("not-a-url-at-all");
		expect(result).toBeNull();
	});

	it("SSRF 차단 — 사설 IP origin 에 대해서는 null 을 반환한다", async () => {
		// localhost 는 validatePublicUrl 에서 차단되어 safeFetchText 가 null 반환
		const result = await fetchSitemap("http://127.0.0.1/");
		expect(result).toBeNull();
	});

	it("응답이 빈 sitemap 이어도 SitemapResult 가 반환된다 (urls=[])", async () => {
		stubFetchByUrl({
			"https://example.com/sitemap.xml": {
				status: 200,
				body: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
			},
		});
		const result = await fetchSitemap("https://example.com/");
		expect(result).not.toBeNull();
		expect(result?.urls).toEqual([]);
	});

	it("robots.txt 의 Sitemap URL 이 사설 IP 면 SSRF 차단으로 null", async () => {
		stubFetchByUrl({
			"https://example.com/sitemap.xml": { status: 404 },
			"https://example.com/robots.txt": {
				status: 200,
				body: "Sitemap: http://127.0.0.1/sitemap.xml\n",
			},
		});
		const result = await fetchSitemap("https://example.com/");
		expect(result).toBeNull();
	});
	it("sitemap redirect가 private destination이면 따라가지 않는다", async () => {
		const fetchMock = vi.fn(async (url: string | URL | Request) => {
			if (String(url) === "https://example.com/sitemap.xml") {
				return new Response("", {
					status: 302,
					headers: { location: "http://127.0.0.1/sitemap.xml" },
				});
			}
			return new Response("<urlset></urlset>", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await fetchSitemap("https://example.com/");

		expect(result).toBeNull();
		expect(fetchMock).not.toHaveBeenCalledWith(
			"http://127.0.0.1/sitemap.xml",
			expect.anything(),
		);
	});
});
