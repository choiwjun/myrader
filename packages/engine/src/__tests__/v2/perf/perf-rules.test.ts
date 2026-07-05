/**
 * X-SAG Core Engine — PERF 규칙 단위 테스트
 *
 * 커버리지:
 * 1. PERF-LCP-001/002 — LCP 기준별 통과/실패
 * 2. PERF-FID-001 — FID 기준 통과/실패
 * 3. PERF-CLS-001/002 — CLS 기준별 통과/실패
 * 4. PERF-INP-001 — INP 기준 통과/실패 + 미제공
 * 5. PERF-TTFB-001 — TTFB 기준 통과/실패
 * 6. PERF-FCP-001 — FCP 기준 통과/실패
 * 7. PERF-PERF-SCORE-001 — 점수 기준 통과/실패
 * 8. PERF-MOBILE-001 — 모바일 점수 통과/실패 + desktop 전략 스킵
 * 9. lighthouseResult 미제공 — 모든 룰 passed=true
 *
 * Crawler/Parser/PSI API 의존 없음.
 */

import { describe, expect, it } from "vitest";
import {
	perfCls001,
	perfCls002,
	perfFcp001,
	perfFid001,
	perfInp001,
	perfLcp001,
	perfLcp002,
	perfMobile001,
	perfPerfScore001,
	perfTtfb001,
} from "../../../analyzers/rules/perf-rules.js";
import type { RuleContext } from "../../../analyzers/types.js";
import type { ParsedPage } from "../../../types.js";
import type { LighthouseResult } from "../../../v2/perf/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example-store.co.kr/",
		statusCode: 200,
		title: "예시 가게",
		description: "예시 설명",
		h1: "예시 가게",
		h2: [],
		meta: { viewport: "width=device-width, initial-scale=1" },
		bodyText: "예시 본문",
		wordCount: 5,
		internalLinks: [],
		externalLinks: [],
		images: [],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: "https://example-store.co.kr/",
		robotsMeta: null,
		...overrides,
	};
}

function makeLighthouseResult(
	overrides: Partial<LighthouseResult> = {},
): LighthouseResult {
	return {
		url: "https://example-store.co.kr/",
		strategy: "mobile",
		performance: 75,
		lcp: 2200,
		fid: 85,
		cls: 0.08,
		inp: 180,
		ttfb: 600,
		fcp: 1500,
		measuredAt: new Date().toISOString(),
		cachedAt: new Date().toISOString(),
		source: "mock",
		...overrides,
	};
}

function makeContext(
	lhOverrides?: Partial<LighthouseResult> | null,
): RuleContext {
	const page = makePage();
	return {
		pages: [page],
		mainPage: page,
		businessProfile: {
			businessName: "예시 가게",
			industry: "소매업",
			region: "서울",
			mainServices: ["상품 판매"],
			targetKeywords: ["예시"],
		},
		lighthouseResult:
			lhOverrides === null
				? undefined
				: makeLighthouseResult(lhOverrides ?? {}),
	};
}

// ---------------------------------------------------------------------------
// PERF-LCP-001
// ---------------------------------------------------------------------------

describe("PERF-LCP-001: LCP < 2.5s", () => {
	it("LCP 2200ms → 통과", () => {
		const result = perfLcp001(makeContext({ lcp: 2200 }));
		expect(result.passed).toBe(true);
		expect(result.ruleId).toBe("PERF-LCP-001");
		expect(result.category).toBe("perf");
	});

	it("LCP 2500ms (경계) → 통과", () => {
		const result = perfLcp001(makeContext({ lcp: 2500 }));
		expect(result.passed).toBe(true);
	});

	it("LCP 3000ms → 실패", () => {
		const result = perfLcp001(makeContext({ lcp: 3000 }));
		expect(result.passed).toBe(false);
		expect(result.severity).toBe("high");
	});

	it("lighthouseResult 없으면 passed=true (데이터 부족)", () => {
		const result = perfLcp001(makeContext(null));
		expect(result.passed).toBe(true);
		expect(result.evidence[0]).toMatch(/lighthouseResult/);
	});
});

// ---------------------------------------------------------------------------
// PERF-LCP-002
// ---------------------------------------------------------------------------

describe("PERF-LCP-002: LCP < 4.0s", () => {
	it("LCP 3500ms → 통과", () => {
		const result = perfLcp002(makeContext({ lcp: 3500 }));
		expect(result.passed).toBe(true);
	});

	it("LCP 4001ms → 실패", () => {
		const result = perfLcp002(makeContext({ lcp: 4001 }));
		expect(result.passed).toBe(false);
		expect(result.severity).toBe("medium");
	});
});

// ---------------------------------------------------------------------------
// PERF-FID-001
// ---------------------------------------------------------------------------

describe("PERF-FID-001: FID < 100ms", () => {
	it("FID 85ms → 통과", () => {
		const result = perfFid001(makeContext({ fid: 85 }));
		expect(result.passed).toBe(true);
	});

	it("FID 99ms (경계) → 통과", () => {
		const result = perfFid001(makeContext({ fid: 99 }));
		expect(result.passed).toBe(true);
	});

	it("FID 100ms → 실패", () => {
		const result = perfFid001(makeContext({ fid: 100 }));
		expect(result.passed).toBe(false);
	});

	it("FID 250ms → 실패", () => {
		const result = perfFid001(makeContext({ fid: 250 }));
		expect(result.passed).toBe(false);
		expect(result.severity).toBe("medium");
	});
});

// ---------------------------------------------------------------------------
// PERF-CLS-001
// ---------------------------------------------------------------------------

describe("PERF-CLS-001: CLS <= 0.1", () => {
	it("CLS 0.08 → 통과", () => {
		const result = perfCls001(makeContext({ cls: 0.08 }));
		expect(result.passed).toBe(true);
		expect(result.ruleId).toBe("PERF-CLS-001");
	});

	it("CLS 0.1 (경계) → 통과", () => {
		const result = perfCls001(makeContext({ cls: 0.1 }));
		expect(result.passed).toBe(true);
	});

	it("CLS 0.15 → 실패", () => {
		const result = perfCls001(makeContext({ cls: 0.15 }));
		expect(result.passed).toBe(false);
		expect(result.severity).toBe("high");
	});
});

// ---------------------------------------------------------------------------
// PERF-CLS-002
// ---------------------------------------------------------------------------

describe("PERF-CLS-002: CLS <= 0.25", () => {
	it("CLS 0.2 → 통과", () => {
		const result = perfCls002(makeContext({ cls: 0.2 }));
		expect(result.passed).toBe(true);
	});

	it("CLS 0.26 → 실패", () => {
		const result = perfCls002(makeContext({ cls: 0.26 }));
		expect(result.passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// PERF-INP-001
// ---------------------------------------------------------------------------

describe("PERF-INP-001: INP < 200ms", () => {
	it("INP 180ms → 통과", () => {
		const result = perfInp001(makeContext({ inp: 180 }));
		expect(result.passed).toBe(true);
		expect(result.ruleId).toBe("PERF-INP-001");
	});

	it("INP 200ms (경계) → 실패", () => {
		const result = perfInp001(makeContext({ inp: 200 }));
		expect(result.passed).toBe(false);
	});

	it("INP undefined → passed=true (측정 불가)", () => {
		const result = perfInp001(makeContext({ inp: undefined }));
		expect(result.passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// PERF-TTFB-001
// ---------------------------------------------------------------------------

describe("PERF-TTFB-001: TTFB < 800ms", () => {
	it("TTFB 600ms → 통과", () => {
		const result = perfTtfb001(makeContext({ ttfb: 600 }));
		expect(result.passed).toBe(true);
	});

	it("TTFB 799ms (경계) → 통과", () => {
		const result = perfTtfb001(makeContext({ ttfb: 799 }));
		expect(result.passed).toBe(true);
	});

	it("TTFB 800ms → 실패", () => {
		const result = perfTtfb001(makeContext({ ttfb: 800 }));
		expect(result.passed).toBe(false);
		expect(result.severity).toBe("medium");
	});
});

// ---------------------------------------------------------------------------
// PERF-FCP-001
// ---------------------------------------------------------------------------

describe("PERF-FCP-001: FCP <= 1.8s", () => {
	it("FCP 1500ms → 통과", () => {
		const result = perfFcp001(makeContext({ fcp: 1500 }));
		expect(result.passed).toBe(true);
	});

	it("FCP 1800ms (경계) → 통과", () => {
		const result = perfFcp001(makeContext({ fcp: 1800 }));
		expect(result.passed).toBe(true);
	});

	it("FCP 2000ms → 실패", () => {
		const result = perfFcp001(makeContext({ fcp: 2000 }));
		expect(result.passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// PERF-PERF-SCORE-001
// ---------------------------------------------------------------------------

describe("PERF-PERF-SCORE-001: Performance >= 70", () => {
	it("점수 75 → 통과", () => {
		const result = perfPerfScore001(makeContext({ performance: 75 }));
		expect(result.passed).toBe(true);
		expect(result.ruleId).toBe("PERF-PERF-SCORE-001");
	});

	it("점수 70 (경계) → 통과", () => {
		const result = perfPerfScore001(makeContext({ performance: 70 }));
		expect(result.passed).toBe(true);
	});

	it("점수 65 → 실패", () => {
		const result = perfPerfScore001(makeContext({ performance: 65 }));
		expect(result.passed).toBe(false);
		expect(result.severity).toBe("high");
	});
});

// ---------------------------------------------------------------------------
// PERF-MOBILE-001
// ---------------------------------------------------------------------------

describe("PERF-MOBILE-001: 모바일 점수 >= 50", () => {
	it("모바일 50점 (경계) → 통과", () => {
		const result = perfMobile001(
			makeContext({ strategy: "mobile", performance: 50 }),
		);
		expect(result.passed).toBe(true);
	});

	it("모바일 45점 → 실패", () => {
		const result = perfMobile001(
			makeContext({ strategy: "mobile", performance: 45 }),
		);
		expect(result.passed).toBe(false);
		expect(result.severity).toBe("medium");
	});

	it("desktop 전략이면 passed=true (검사 대상 아님)", () => {
		const result = perfMobile001(
			makeContext({ strategy: "desktop", performance: 30 }),
		);
		expect(result.passed).toBe(true);
	});
});
