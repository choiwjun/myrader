/**
 * X-SAG Core Engine — Phase 2 SEO 시맨틱 마이그레이션 테스트 (Batch C)
 *
 * bodyText 정규식/문자열 스캔으로 false positive 를 내던 low-weight SEO 룰들을
 * 구조화 신호로 이관하거나(=migrate), 파서가 신호를 노출하지 않아 실측이 불가능한
 * 경우 정직하게 informational(passed=true)로 강등(=downgrade)한 결과를 검증한다.
 *
 *  - SEO-SITEMAP-001        : MIGRATE — bodyText 'sitemap' 스캔 → internal/externalLinks 의 /sitemap.xml 경로 검사
 *  - SEO-IMG-LAZY-001       : PROMOTED (Phase 2.5) — images[].loading 실측 → phase25-seo-semantic.test.ts 로 이관
 *  - SEO-IMG-DIMENSIONS-001 : PROMOTED (Phase 2.5) — images[].width/height 실측 → phase25-seo-semantic.test.ts 로 이관
 *  - SEO-AMP-VALID-001      : DOWNGRADE — AMP link 필드 부재 → informational
 *
 * RuleContext 는 plain 형태(extractedEntities 미설정)로 전달한다.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import { seoAmpValid001, seoSitemap001 } from "../seo-rules.js";
// NOTE: SEO-IMG-LAZY-001 / SEO-IMG-DIMENSIONS-001 은 Phase 2.5 에서 실측으로 승격되어
// 커버리지가 phase25-seo-semantic.test.ts 로 이관되었다(여기서는 더 이상 테스트하지 않음).

// ---------------------------------------------------------------------------
// Helpers (phase1-geo-semantic.test.ts 스타일)
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://lesignal.co.kr/",
		statusCode: 200,
		title: "르시그널 강남 브런치카페",
		description: "강남 브런치카페 르시그널입니다.",
		h1: "르시그널",
		h2: ["메뉴", "오시는 길"],
		meta: {
			viewport: "width=device-width, initial-scale=1",
			description: "강남 브런치카페 르시그널입니다.",
		},
		bodyText: "르시그널에 오신 것을 환영합니다.",
		wordCount: 10,
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

function makeCtx(
	pageOverrides: Partial<ParsedPage> = {},
	profileOverrides: Partial<RuleContext["businessProfile"]> = {},
): RuleContext {
	const mainPage = makePage(pageOverrides);
	return {
		pages: [mainPage],
		mainPage,
		businessProfile: {
			businessName: "르시그널",
			industry: "카페",
			region: "강남",
			mainServices: ["브런치", "핸드드립"],
			targetKeywords: ["강남 카페", "브런치"],
			...profileOverrides,
		},
	};
}

// ===========================================================================
// SEO-SITEMAP-001 — bodyText 'sitemap' 스캔 → /sitemap.xml 링크 검사 (MIGRATE)
// ===========================================================================

describe("SEO-SITEMAP-001: sitemap.xml 링크 기반 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 본문/내비에 '사이트맵'·'sitemap' 단어만 있고 실제 sitemap.xml 링크는 없으면 실패", () => {
		// 기존 룰은 bodyText.includes('sitemap') 으로 통과했으나, 이는 푸터의
		// "사이트맵(sitemap)" 라벨이나 본문에 우연히 노출된 단어에도 매치되는 FP.
		const r = seoSitemap001(
			makeCtx({
				bodyText:
					"하단 메뉴: 회사소개 | 사이트맵(sitemap) | 개인정보처리방침. 사이트맵을 참고하세요.",
				internalLinks: ["https://lesignal.co.kr/about", "https://lesignal.co.kr/menu"],
				externalLinks: [],
			}),
		);
		expect(r.ruleId).toBe("SEO-SITEMAP-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 내부 링크 경로에 'sitemap' 문자열이 들어가지만 .xml 이 아니면 실패", () => {
		// /sitemap (HTML 사이트맵 페이지) 은 sitemap.xml 신호가 아니다.
		const r = seoSitemap001(
			makeCtx({
				internalLinks: ["https://lesignal.co.kr/sitemap-guide"],
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 내부 링크에 /sitemap.xml 경로가 있으면 통과", () => {
		const r = seoSitemap001(
			makeCtx({
				bodyText: "르시그널에 오신 것을 환영합니다.",
				internalLinks: ["https://lesignal.co.kr/sitemap.xml"],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 외부 링크에 sitemap.xml(쿼리 포함) 경로가 있어도 통과", () => {
		const r = seoSitemap001(
			makeCtx({
				externalLinks: ["https://cdn.lesignal.co.kr/sitemap_index.xml?v=2"],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// SEO-IMG-LAZY-001 / SEO-IMG-DIMENSIONS-001 — Phase 2.5 에서 실측 승격됨.
// 커버리지는 phase25-seo-semantic.test.ts 참조.
// ===========================================================================

// ===========================================================================
// SEO-AMP-VALID-001 — AMP link 필드 부재 → informational (DOWNGRADE)
// ===========================================================================

describe("SEO-AMP-VALID-001: AMP informational 강등", () => {
	it("FALSE-POSITIVE 방지: 본문에 '⚡'·'amphtml' 이 언급돼도 AMP 로 오판하지 않는다(passed=true)", () => {
		// 과거: bodyText 에 '⚡' 나 '<html amp' 가 있으면 AMP 페이지로 간주해 amphtml
		// 링크 부재로 실패시켰다. AMP 를 설명하는 일반 블로그 글에도 오발화하는 FP.
		const r = seoAmpValid001(
			makeCtx({
				bodyText:
					"AMP(⚡)는 모바일 가속 페이지입니다. amphtml 링크를 쓴다는 설명 블로그 글입니다.",
			}),
		);
		expect(r.ruleId).toBe("SEO-AMP-VALID-001");
		expect(r.passed).toBe(true);
		expect(r.ruleWeight).toBe(3);
		expect(r.evidence.join(" ")).toContain("미수집");
	});

	it("일반(비-AMP) 페이지는 패널티 없이 통과", () => {
		const r = seoAmpValid001(makeCtx({ bodyText: "르시그널 소개 페이지입니다." }));
		expect(r.passed).toBe(true);
	});
});
