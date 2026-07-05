/**
 * Phase R-D — HeuristicBacklinkProvider tests
 */

import { describe, expect, it } from "vitest";
import { HeuristicBacklinkProvider } from "../providers/heuristic.js";
import type { BacklinkSignals } from "../types.js";

const FULL: BacklinkSignals = {
	httpsEnforced: true,
	hsts: true,
	sitemapPresent: true,
	robotsTxtPresent: true,
	structuredDataCount: 5,
	socialMetaCount: 8,
	canonicalConsistency: true,
	contentLengthScore: 80,
};

const EMPTY: BacklinkSignals = {
	httpsEnforced: false,
	hsts: false,
	sitemapPresent: false,
	robotsTxtPresent: false,
	structuredDataCount: 0,
	socialMetaCount: 0,
	canonicalConsistency: false,
	contentLengthScore: 0,
};

describe("HeuristicBacklinkProvider", () => {
	it("is always available", () => {
		expect(new HeuristicBacklinkProvider().isAvailable()).toBe(true);
	});

	it("has name 'heuristic'", () => {
		expect(new HeuristicBacklinkProvider().name).toBe("heuristic");
	});

	it("returns source='heuristic' and confidence=0.3", () => {
		const p = new HeuristicBacklinkProvider();
		const r = p.computeFromSignals("example.co.kr", FULL);
		expect(r.source).toBe("heuristic");
		expect(r.confidence).toBe(0.3);
	});

	it("computes higher DA with full signals", () => {
		const p = new HeuristicBacklinkProvider();
		const full = p.computeFromSignals("example.co.kr", FULL);
		const empty = p.computeFromSignals("example.co.kr", EMPTY);
		expect(full.domainAuthority).toBeGreaterThan(empty.domainAuthority);
		expect(empty.domainAuthority).toBe(0);
	});

	it("clamps DA to [0, 100]", () => {
		const p = new HeuristicBacklinkProvider();
		const r = p.computeFromSignals("example.co.kr", FULL);
		expect(r.domainAuthority).toBeGreaterThanOrEqual(0);
		expect(r.domainAuthority).toBeLessThanOrEqual(100);
	});

	it("is deterministic for same input", () => {
		const p = new HeuristicBacklinkProvider();
		const r1 = p.computeFromSignals("a.com", FULL);
		const r2 = p.computeFromSignals("a.com", FULL);
		expect(r1.domainAuthority).toBe(r2.domainAuthority);
		expect(r1.estimatedBacklinks).toBe(r2.estimatedBacklinks);
		expect(r1.estimatedReferringDomains).toBe(r2.estimatedReferringDomains);
	});

	it("preserves signals in result", () => {
		const p = new HeuristicBacklinkProvider();
		const r = p.computeFromSignals("example.co.kr", FULL);
		expect(r.signals).toEqual(FULL);
	});

	it("estimates ~5x backlinks from DA", () => {
		const p = new HeuristicBacklinkProvider();
		const r = p.computeFromSignals("example.co.kr", FULL);
		expect(r.estimatedBacklinks).toBe(r.domainAuthority * 5);
	});

	it("estimates ~0.8x referring domains from DA", () => {
		const p = new HeuristicBacklinkProvider();
		const r = p.computeFromSignals("example.co.kr", FULL);
		expect(r.estimatedReferringDomains).toBe(
			Math.round(r.domainAuthority * 0.8),
		);
	});

	it("analyze() uses URL https to set httpsEnforced", async () => {
		const p = new HeuristicBacklinkProvider();
		const r1 = await p.analyze({
			url: "https://example.co.kr/",
			domain: "example.co.kr",
		});
		const r2 = await p.analyze({
			url: "http://example.co.kr/",
			domain: "example.co.kr",
		});
		expect(r1.signals.httpsEnforced).toBe(true);
		expect(r2.signals.httpsEnforced).toBe(false);
	});

	it("returns ISO 8601 measuredAt", () => {
		const p = new HeuristicBacklinkProvider();
		const r = p.computeFromSignals("example.co.kr", FULL);
		expect(r.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});

	it("clamps contentLengthScore > 100 to 100", () => {
		const p = new HeuristicBacklinkProvider();
		const r1 = p.computeFromSignals("a.com", {
			...EMPTY,
			contentLengthScore: 200,
		});
		const r2 = p.computeFromSignals("a.com", {
			...EMPTY,
			contentLengthScore: 100,
		});
		expect(r1.domainAuthority).toBe(r2.domainAuthority);
	});

	it("structuredDataCount cap at 5 entries (25 pts max)", () => {
		const p = new HeuristicBacklinkProvider();
		const r5 = p.computeFromSignals("a.com", {
			...EMPTY,
			structuredDataCount: 5,
		});
		const r10 = p.computeFromSignals("a.com", {
			...EMPTY,
			structuredDataCount: 10,
		});
		expect(r5.domainAuthority).toBe(r10.domainAuthority);
	});
});
