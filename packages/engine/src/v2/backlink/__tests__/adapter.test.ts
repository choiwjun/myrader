/**
 * Phase R-D — BacklinkAdapterChain + factory tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BacklinkAdapterChain, createBacklinkAdapter } from "../adapter.js";
import { AhrefsBacklinkProvider } from "../providers/ahrefs.js";
import { HeuristicBacklinkProvider } from "../providers/heuristic.js";
import { MockBacklinkProvider } from "../providers/mock.js";
import { MozBacklinkProvider } from "../providers/moz.js";

describe("BacklinkAdapterChain", () => {
	it("requires at least one provider", () => {
		expect(() => new BacklinkAdapterChain([])).toThrow();
	});

	it("returns first successful provider result", async () => {
		const mock = new MockBacklinkProvider();
		const chain = new BacklinkAdapterChain([
			mock,
			new HeuristicBacklinkProvider(),
		]);
		const r = await chain.analyze({ url: "https://a.com/", domain: "a.com" });
		expect(r.source).toBe("mock");
	});

	it("falls back to next provider on failure", async () => {
		const failing = new MockBacklinkProvider();
		failing.setShouldFail(true);
		const heuristic = new HeuristicBacklinkProvider();
		const chain = new BacklinkAdapterChain([failing, heuristic]);
		const r = await chain.analyze({ url: "https://a.com/", domain: "a.com" });
		expect(r.source).toBe("heuristic");
	});

	it("throws if all providers fail", async () => {
		const f1 = new MockBacklinkProvider();
		f1.setShouldFail(true);
		const f2 = new MockBacklinkProvider();
		f2.setShouldFail(true);
		const chain = new BacklinkAdapterChain([f1, f2]);
		await expect(
			chain.analyze({ url: "https://a.com/", domain: "a.com" }),
		).rejects.toThrow();
	});

	it("isAvailable returns true if any provider is available", () => {
		const chain = new BacklinkAdapterChain([new HeuristicBacklinkProvider()]);
		expect(chain.isAvailable()).toBe(true);
	});
});

describe("createBacklinkAdapter (factory)", () => {
	const origAhrefs = process.env["AHREFS_API_KEY"];
	const origMoz = process.env["MOZ_API_TOKEN"];
	const origAhrefsEnabled = process.env["AHREFS_BACKLINK_ENABLED"];
	const origMozEnabled = process.env["MOZ_BACKLINK_ENABLED"];
	const origAhrefsBaseUrl = process.env["AHREFS_BASE_URL"];
	const origMozBaseUrl = process.env["MOZ_BASE_URL"];

	beforeEach(() => {
		delete process.env["AHREFS_API_KEY"];
		delete process.env["MOZ_API_TOKEN"];
		delete process.env["AHREFS_BACKLINK_ENABLED"];
		delete process.env["MOZ_BACKLINK_ENABLED"];
		delete process.env["AHREFS_BASE_URL"];
		delete process.env["MOZ_BASE_URL"];
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (origAhrefs !== undefined) process.env["AHREFS_API_KEY"] = origAhrefs;
		else delete process.env["AHREFS_API_KEY"];
		if (origMoz !== undefined) process.env["MOZ_API_TOKEN"] = origMoz;
		else delete process.env["MOZ_API_TOKEN"];
		if (origAhrefsEnabled !== undefined)
			process.env["AHREFS_BACKLINK_ENABLED"] = origAhrefsEnabled;
		else delete process.env["AHREFS_BACKLINK_ENABLED"];
		if (origMozEnabled !== undefined)
			process.env["MOZ_BACKLINK_ENABLED"] = origMozEnabled;
		else delete process.env["MOZ_BACKLINK_ENABLED"];
		if (origAhrefsBaseUrl !== undefined)
			process.env["AHREFS_BASE_URL"] = origAhrefsBaseUrl;
		else delete process.env["AHREFS_BASE_URL"];
		if (origMozBaseUrl !== undefined)
			process.env["MOZ_BASE_URL"] = origMozBaseUrl;
		else delete process.env["MOZ_BASE_URL"];
	});

	it("returns HeuristicBacklinkProvider when no API keys present", () => {
		const a = createBacklinkAdapter();
		expect(a.name).toBe("heuristic");
	});

	it("AhrefsBacklinkProvider is unavailable without API key", () => {
		expect(new AhrefsBacklinkProvider().isAvailable()).toBe(false);
	});

	it("MozBacklinkProvider is unavailable without API token", () => {
		expect(new MozBacklinkProvider().isAvailable()).toBe(false);
	});

	it("does not select Ahrefs/Moz providers unless explicitly enabled", () => {
		process.env["AHREFS_API_KEY"] = "test-ahrefs-key";
		process.env["MOZ_API_TOKEN"] = "test-moz-token";

		expect(new AhrefsBacklinkProvider().isAvailable()).toBe(false);
		expect(new MozBacklinkProvider().isAvailable()).toBe(false);
		expect(createBacklinkAdapter().name).toBe("heuristic");
	});

	it("AhrefsBacklinkProvider.analyze throws when no key", async () => {
		const ahrefs = new AhrefsBacklinkProvider();
		await expect(
			ahrefs.analyze({ url: "https://a.com/", domain: "a.com" }),
		).rejects.toThrow();
	});

	it("MozBacklinkProvider.analyze throws when no token", async () => {
		const moz = new MozBacklinkProvider();
		await expect(
			moz.analyze({ url: "https://a.com/", domain: "a.com" }),
		).rejects.toThrow();
	});

	it("AhrefsBacklinkProvider maps enabled API responses", async () => {
		process.env["AHREFS_API_KEY"] = "test-ahrefs-key";
		process.env["AHREFS_BACKLINK_ENABLED"] = "true";
		process.env["AHREFS_BASE_URL"] = "https://ahrefs.test/v3";
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					domain_rating: 72,
					backlinks: 1234,
					referring_domains: 56,
				}),
				{ status: 200 },
			),
		);

		const provider = new AhrefsBacklinkProvider();
		const result = await provider.analyze({
			url: "https://example.com/",
			domain: "example.com",
		});

		expect(provider.isAvailable()).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://ahrefs.test/v3/domain-rating?target=example.com",
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					Authorization: "Bearer test-ahrefs-key",
				}),
			}),
		);
		expect(result).toMatchObject({
			domain: "example.com",
			domainAuthority: 72,
			estimatedBacklinks: 1234,
			estimatedReferringDomains: 56,
			confidence: 0.95,
			source: "ahrefs",
		});
		expect(result.signals.httpsEnforced).toBe(true);
	});

	it("MozBacklinkProvider maps enabled API responses", async () => {
		process.env["MOZ_API_TOKEN"] = "test-moz-token";
		process.env["MOZ_BACKLINK_ENABLED"] = "true";
		process.env["MOZ_BASE_URL"] = "https://moz.test/v2";
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					results: [
						{
							domain_authority: 63,
							external_links: 987,
							linking_root_domains: 45,
						},
					],
				}),
				{ status: 200 },
			),
		);

		const provider = new MozBacklinkProvider();
		const result = await provider.analyze({
			url: "https://example.com/",
			domain: "example.com",
		});

		expect(provider.isAvailable()).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://moz.test/v2/url_metrics",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer test-moz-token",
				}),
				body: JSON.stringify({ targets: ["example.com"] }),
			}),
		);
		expect(result).toMatchObject({
			domain: "example.com",
			domainAuthority: 63,
			estimatedBacklinks: 987,
			estimatedReferringDomains: 45,
			confidence: 0.9,
			source: "moz",
		});
		expect(result.signals.httpsEnforced).toBe(true);
	});

	it("falls back to heuristic when enabled Ahrefs HTTP fails", async () => {
		process.env["AHREFS_API_KEY"] = "test-ahrefs-key";
		process.env["AHREFS_BACKLINK_ENABLED"] = "true";
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("upstream unavailable", { status: 503 }),
		);

		const adapter = createBacklinkAdapter();
		const result = await adapter.analyze({
			url: "https://example.com/",
			domain: "example.com",
		});

		expect(result.source).toBe("heuristic");
	});
});
