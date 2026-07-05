/**
 * Phase R-D — backlink-rules tests
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type {
	BacklinkResult,
	BacklinkSignals,
} from "../../../v2/backlink/types.js";
import type { RuleContext } from "../../types.js";
import {
	backlinkAgeSignal001,
	backlinkCanonicalConsistency001,
	backlinkDa001,
	backlinkHttps001,
	backlinkInternalLinkDepth001,
	backlinkLinkEquity001,
	backlinkSocialMeta001,
	backlinkStructuredDataDiversity001,
} from "../backlink-rules.js";

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example.co.kr/",
		statusCode: 200,
		title: "테스트",
		description: "테스트 설명",
		h1: "테스트",
		h2: [],
		meta: {},
		bodyText: "",
		wordCount: 100,
		internalLinks: [],
		externalLinks: [],
		images: [],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: null,
		robotsMeta: null,
		...overrides,
	};
}

const FULL_SIGNALS: BacklinkSignals = {
	httpsEnforced: true,
	hsts: true,
	sitemapPresent: true,
	robotsTxtPresent: true,
	structuredDataCount: 5,
	socialMetaCount: 8,
	canonicalConsistency: true,
	contentLengthScore: 90,
};

const EMPTY_SIGNALS: BacklinkSignals = {
	httpsEnforced: false,
	hsts: false,
	sitemapPresent: false,
	robotsTxtPresent: false,
	structuredDataCount: 0,
	socialMetaCount: 0,
	canonicalConsistency: false,
	contentLengthScore: 0,
};

function makeBl(
	signals: BacklinkSignals,
	domainAuthority = 60,
): BacklinkResult {
	return {
		domain: "example.co.kr",
		domainAuthority,
		estimatedBacklinks: domainAuthority * 5,
		estimatedReferringDomains: Math.round(domainAuthority * 0.8),
		confidence: 0.3,
		source: "heuristic",
		signals,
		measuredAt: "2026-01-01T00:00:00.000Z",
	};
}

function makeCtx(
	bl?: BacklinkResult,
	pageOverrides: Partial<ParsedPage> = {},
	pages?: ParsedPage[],
): RuleContext {
	const mainPage = makePage(pageOverrides);
	return {
		pages: pages ?? [mainPage],
		mainPage,
		businessProfile: {
			businessName: "테스트",
			industry: "테스트",
			region: "강남",
			mainServices: ["서비스1"],
			targetKeywords: ["k1"],
		},
		...(bl ? { backlinkResult: bl } : {}),
	};
}

// ---------------------------------------------------------------------------
// BACKLINK-DA-001
// ---------------------------------------------------------------------------
describe("BACKLINK-DA-001", () => {
	it("passes when DA >= 30", () => {
		const r = backlinkDa001(makeCtx(makeBl(FULL_SIGNALS, 60)));
		expect(r.ruleId).toBe("BACKLINK-DA-001");
		expect(r.category).toBe("backlink");
		expect(r.passed).toBe(true);
	});

	it("fails when DA < 30", () => {
		const r = backlinkDa001(makeCtx(makeBl(EMPTY_SIGNALS, 10)));
		expect(r.passed).toBe(false);
	});

	it("is informational when backlinkResult is missing", () => {
		const r = backlinkDa001(makeCtx());
		expect(r.passed).toBe(true);
		expect(r.evidence[0]).toMatch(/미제공/);
	});
});

// ---------------------------------------------------------------------------
// BACKLINK-HTTPS-001
// ---------------------------------------------------------------------------
describe("BACKLINK-HTTPS-001", () => {
	it("passes when both https + hsts true", () => {
		const r = backlinkHttps001(makeCtx(makeBl(FULL_SIGNALS)));
		expect(r.passed).toBe(true);
	});

	it("fails when https=true but hsts=false", () => {
		const r = backlinkHttps001(
			makeCtx(makeBl({ ...FULL_SIGNALS, hsts: false })),
		);
		expect(r.passed).toBe(false);
	});

	it("fails when https=false", () => {
		const r = backlinkHttps001(
			makeCtx(makeBl({ ...FULL_SIGNALS, httpsEnforced: false })),
		);
		expect(r.passed).toBe(false);
	});

	it("informational when no backlinkResult", () => {
		const r = backlinkHttps001(makeCtx());
		expect(r.passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// BACKLINK-CANONICAL-CONSISTENCY-001
// ---------------------------------------------------------------------------
describe("BACKLINK-CANONICAL-CONSISTENCY-001", () => {
	it("passes when canonicalConsistency=true", () => {
		expect(
			backlinkCanonicalConsistency001(makeCtx(makeBl(FULL_SIGNALS))).passed,
		).toBe(true);
	});
	it("fails when canonicalConsistency=false", () => {
		expect(
			backlinkCanonicalConsistency001(
				makeCtx(makeBl({ ...FULL_SIGNALS, canonicalConsistency: false })),
			).passed,
		).toBe(false);
	});
	it("informational when no backlinkResult", () => {
		expect(backlinkCanonicalConsistency001(makeCtx()).passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// BACKLINK-STRUCTURED-DATA-DIVERSITY-001
// ---------------------------------------------------------------------------
describe("BACKLINK-STRUCTURED-DATA-DIVERSITY-001", () => {
	it("passes when structuredDataCount >= 3", () => {
		expect(
			backlinkStructuredDataDiversity001(
				makeCtx(makeBl({ ...EMPTY_SIGNALS, structuredDataCount: 3 })),
			).passed,
		).toBe(true);
	});
	it("fails when structuredDataCount < 3", () => {
		expect(
			backlinkStructuredDataDiversity001(
				makeCtx(makeBl({ ...EMPTY_SIGNALS, structuredDataCount: 1 })),
			).passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// BACKLINK-SOCIAL-META-001
// ---------------------------------------------------------------------------
describe("BACKLINK-SOCIAL-META-001", () => {
	it("passes when socialMetaCount >= 5", () => {
		expect(
			backlinkSocialMeta001(
				makeCtx(makeBl({ ...EMPTY_SIGNALS, socialMetaCount: 6 })),
			).passed,
		).toBe(true);
	});
	it("fails when socialMetaCount < 5", () => {
		expect(
			backlinkSocialMeta001(
				makeCtx(makeBl({ ...EMPTY_SIGNALS, socialMetaCount: 2 })),
			).passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// BACKLINK-INTERNAL-LINK-DEPTH-001
// ---------------------------------------------------------------------------
describe("BACKLINK-INTERNAL-LINK-DEPTH-001", () => {
	it("passes for flat 2-page site (main → child)", () => {
		const main = makePage({
			url: "https://a.com/",
			internalLinks: ["https://a.com/about"],
		});
		const child = makePage({ url: "https://a.com/about", internalLinks: [] });
		const ctx: RuleContext = {
			pages: [main, child],
			mainPage: main,
			businessProfile: {
				businessName: "x",
				industry: "x",
				region: "x",
				mainServices: ["s"],
				targetKeywords: ["k"],
			},
			backlinkResult: makeBl(FULL_SIGNALS),
		};
		expect(backlinkInternalLinkDepth001(ctx).passed).toBe(true);
	});

	it("fails when a page is unreachable", () => {
		const main = makePage({ url: "https://a.com/", internalLinks: [] });
		const orphan = makePage({ url: "https://a.com/orphan", internalLinks: [] });
		const ctx: RuleContext = {
			pages: [main, orphan],
			mainPage: main,
			businessProfile: {
				businessName: "x",
				industry: "x",
				region: "x",
				mainServices: ["s"],
				targetKeywords: ["k"],
			},
			backlinkResult: makeBl(FULL_SIGNALS),
		};
		expect(backlinkInternalLinkDepth001(ctx).passed).toBe(false);
	});

	it("informational when no backlinkResult", () => {
		expect(backlinkInternalLinkDepth001(makeCtx()).passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// BACKLINK-LINK-EQUITY-001
// ---------------------------------------------------------------------------
describe("BACKLINK-LINK-EQUITY-001", () => {
	it("passes when external links <= 50", () => {
		const r = backlinkLinkEquity001(
			makeCtx(makeBl(FULL_SIGNALS), {
				externalLinks: Array.from(
					{ length: 10 },
					(_, i) => `https://x.com/${i}`,
				),
			}),
		);
		expect(r.passed).toBe(true);
	});
	it("fails when external links > 50", () => {
		const r = backlinkLinkEquity001(
			makeCtx(makeBl(FULL_SIGNALS), {
				externalLinks: Array.from(
					{ length: 60 },
					(_, i) => `https://x.com/${i}`,
				),
			}),
		);
		expect(r.passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// BACKLINK-AGE-SIGNAL-001
// ---------------------------------------------------------------------------
describe("BACKLINK-AGE-SIGNAL-001", () => {
	it("passes when lastModified is set", () => {
		const r = backlinkAgeSignal001(
			makeCtx(makeBl(FULL_SIGNALS), {
				lastModified: "2026-01-01T00:00:00Z",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("passes when recent © year present in body", () => {
		const currentYear = new Date().getFullYear();
		const r = backlinkAgeSignal001(
			makeCtx(makeBl(FULL_SIGNALS), {
				bodyText: `푸터 © ${currentYear} 회사`,
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("fails when no lastModified and no recent copyright", () => {
		const r = backlinkAgeSignal001(
			makeCtx(makeBl(FULL_SIGNALS), {
				bodyText: "푸터 © 2015 회사",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("informational when no backlinkResult", () => {
		expect(backlinkAgeSignal001(makeCtx()).passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 통합: 카테고리 일관성
// ---------------------------------------------------------------------------
describe("BACKLINK rules — meta", () => {
	it("all rules return category='backlink'", () => {
		const ctx = makeCtx(makeBl(FULL_SIGNALS));
		const rules = [
			backlinkDa001,
			backlinkHttps001,
			backlinkCanonicalConsistency001,
			backlinkStructuredDataDiversity001,
			backlinkSocialMeta001,
			backlinkInternalLinkDepth001,
			backlinkLinkEquity001,
			backlinkAgeSignal001,
		];
		for (const r of rules) {
			expect(r(ctx).category).toBe("backlink");
		}
	});
});
