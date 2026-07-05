/**
 * MockJsRenderProvider 단위 테스트
 */

import { describe, expect, it } from "vitest";
import { MockJsRenderProvider } from "../../../v2/js-render/providers/mock.js";

describe("MockJsRenderProvider", () => {
	const provider = new MockJsRenderProvider();

	it("name이 'mock' 이어야 한다", () => {
		expect(provider.name).toBe("mock");
	});

	it("isAvailable()은 항상 true를 반환해야 한다", () => {
		expect(provider.isAvailable()).toBe(true);
	});

	it("fetchRendered()는 RenderResult를 반환해야 한다", async () => {
		const url = "https://example.com";
		const result = await provider.fetchRendered(url);

		expect(result.html).toContain(url);
		expect(result.finalUrl).toBe(url);
		expect(result.statusCode).toBe(200);
		expect(result.durationMs).toBeGreaterThan(0);
		expect(result.source).toBe("mock");
		expect(result.renderedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("fetchRendered()는 URL을 HTML에 포함해야 한다", async () => {
		const url = "https://test-site.com/page";
		const result = await provider.fetchRendered(url);

		expect(result.html).toContain(url);
		expect(result.html).toContain("<h1>");
	});

	it("opts를 전달해도 정상 동작해야 한다", async () => {
		const result = await provider.fetchRendered("https://example.com", {
			waitForLoadState: "networkidle",
			timeoutMs: 5000,
			blockResources: ["image", "font"],
		});

		expect(result.source).toBe("mock");
		expect(result.statusCode).toBe(200);
	});

	it("서로 다른 URL에 대해 다른 HTML을 반환해야 한다", async () => {
		const r1 = await provider.fetchRendered("https://site-a.com");
		const r2 = await provider.fetchRendered("https://site-b.com");

		expect(r1.html).toContain("site-a.com");
		expect(r2.html).toContain("site-b.com");
		expect(r1.html).not.toBe(r2.html);
	});
});
