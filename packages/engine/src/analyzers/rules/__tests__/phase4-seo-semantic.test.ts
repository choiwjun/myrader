/**
 * X-SAG Core Engine — Phase 4 SEO 시맨틱 승격 테스트 (BATCH: SEO PROMOTION)
 *
 * commit bbd2d96 이 parser 에 ParsedPage.linkTags ( <link> 의 rel(소문자)/href/hreflang )
 * 를 추가하면서, Phase 3 에서 "파서 미수집"으로 informational 다운그레이드했던 두 SEO 룰을
 * 진짜 구조화 신호 실측으로 승격한다. 본문(bodyText)에 'hreflang'/'rel="prev"' 같은 단어를
 * 언급해도 더 이상 판정에 영향이 없음을(FP 제거) 함께 검증한다.
 *
 * 대상:
 *   SEO-HREFLANG-001   — <link rel="alternate" hreflang> 실측 (promote)
 *   SEO-PAGINATION-001 — <link rel="prev"|"next"> 실측 (promote)
 *
 * 판정 의도:
 *   - 단일 언어/비페이지네이션 SMB 사이트는 신호가 없으므로 정보성 통과(passed=true) — 감점 X.
 *   - 신호가 "있는데 깨진"(href 누락 등) 경우만 부드럽게 실패(passed=false, weight 3).
 *
 * RuleContext 는 extractedEntities 를 채우지 않은 plain 형태로 전달한다.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import { seoHreflang001, seoPagination001 } from "../seo-rules.js";

// ---------------------------------------------------------------------------
// Helpers (phase3-seo-semantic.test.ts 스타일)
// ---------------------------------------------------------------------------

type LinkTag = { rel: string | null; href: string | null; hreflang: string | null };

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
	extraPages: ParsedPage[] = [],
): RuleContext {
	const mainPage = makePage(pageOverrides);
	return {
		pages: [mainPage, ...extraPages],
		mainPage,
		businessProfile: {
			businessName: "르시그널",
			industry: "카페",
			region: "강남",
			mainServices: ["브런치", "핸드드립"],
			targetKeywords: ["강남 카페", "브런치"],
		},
	};
}

// ===========================================================================
// SEO-HREFLANG-001 — <link rel="alternate" hreflang> 실측
// ===========================================================================

describe("SEO-HREFLANG-001: hreflang alternate <link> 실측 (Phase 4 승격)", () => {
	it("TRUE-POSITIVE: rel=alternate hreflang <link> 가 유효하게 선언됨 → 통과", () => {
		const linkTags: LinkTag[] = [
			{ rel: "canonical", href: "https://lesignal.co.kr/", hreflang: null },
			{ rel: "alternate", href: "https://lesignal.co.kr/en/", hreflang: "en" },
			{
				rel: "alternate",
				href: "https://lesignal.co.kr/zh/",
				hreflang: "zh-CN",
			},
			{ rel: "alternate", href: "https://lesignal.co.kr/", hreflang: "x-default" },
		];
		const r = seoHreflang001(makeCtx({ linkTags }));
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toContain("3개");
		expect(r.evidence.join(" ")).toMatch(/en/);
		expect(r.evidence.join(" ")).toMatch(/zh-CN/);
	});

	it("TRUE-POSITIVE: 공백 구분 rel 토큰 'alternate' (예: rel=\"alternate stylesheet\" 가 아닌 진짜 alternate) → 통과", () => {
		const linkTags: LinkTag[] = [
			{ rel: "alternate", href: "https://lesignal.co.kr/ja/", hreflang: "ja" },
		];
		const r = seoHreflang001(makeCtx({ linkTags }));
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toContain("1개");
	});

	it("FALSE-POSITIVE 제거: 본문이 hreflang/en_us 를 언급만 해도 <link> 가 없으면 단일 언어로 통과(감점 X)", () => {
		// 예전 bodyText.includes('hreflang') 는 안내문 언급에도 반응했다. 이제 linkTags 만 본다.
		const r = seoHreflang001(
			makeCtx({
				bodyText:
					"hreflang 태그 다는 법: <link rel=\"alternate\" hreflang=\"en_us\"> 를 head 에 넣으세요.",
				linkTags: [
					{ rel: "canonical", href: "https://lesignal.co.kr/", hreflang: null },
				],
			}),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toMatch(/단일 언어|미발견|0개/);
	});

	it("단일 언어 사이트(linkTags 미정의)는 정보성 통과", () => {
		const r = seoHreflang001(makeCtx({}));
		expect(r.passed).toBe(true);
	});

	it("깨진 선언: rel=alternate hreflang 인데 href 누락 → 부드러운 실패(passed=false, weight 3)", () => {
		const linkTags: LinkTag[] = [
			{ rel: "alternate", href: "https://lesignal.co.kr/en/", hreflang: "en" },
			{ rel: "alternate", href: null, hreflang: "zh-CN" }, // href 누락 → 깨짐
		];
		const r = seoHreflang001(makeCtx({ linkTags }));
		expect(r.passed).toBe(false);
		expect(r.ruleWeight).toBe(3);
		expect(r.evidence.join(" ")).toMatch(/href 누락/);
	});

	it("rel=\"alternate\" 인데 hreflang 이 없으면(예: RSS alternate) hreflang 신호로 세지 않음 → 단일 언어 통과", () => {
		const linkTags: LinkTag[] = [
			{
				rel: "alternate",
				href: "https://lesignal.co.kr/feed.xml",
				hreflang: null,
			},
		];
		const r = seoHreflang001(makeCtx({ linkTags }));
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toContain("0개");
	});
});

// ===========================================================================
// SEO-PAGINATION-001 — <link rel="prev"|"next"> 실측
// ===========================================================================

describe("SEO-PAGINATION-001: rel=prev/next <link> 실측 (Phase 4 승격)", () => {
	it("TRUE-POSITIVE: rel=next / rel=prev <link> 가 유효하게 선언됨 → 통과", () => {
		const linkTags: LinkTag[] = [
			{ rel: "canonical", href: "https://lesignal.co.kr/list?page=2", hreflang: null },
			{ rel: "prev", href: "https://lesignal.co.kr/list?page=1", hreflang: null },
			{ rel: "next", href: "https://lesignal.co.kr/list?page=3", hreflang: null },
		];
		const r = seoPagination001(makeCtx({ linkTags }));
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toMatch(/rel="next"> 수: 1/);
		expect(r.evidence.join(" ")).toMatch(/rel="prev"> 수: 1/);
	});

	it("TRUE-POSITIVE: 첫 페이지라 rel=next 만 있어도(prev 없음) 유효하면 통과", () => {
		const linkTags: LinkTag[] = [
			{ rel: "next", href: "https://lesignal.co.kr/list?page=2", hreflang: null },
		];
		const r = seoPagination001(makeCtx({ linkTags }));
		expect(r.passed).toBe(true);
	});

	it("FALSE-POSITIVE 제거: 본문이 '다음 페이지' / URL 이 ?page=2 여도 rel <link> 가 없으면 통과(판정 제외)", () => {
		// 예전엔 bodyText/URL 신호를 보았지만 rel=prev/next 는 절대 bodyText 에 없다. 이제 무시.
		const r = seoPagination001(
			makeCtx(
				{
					bodyText: "다음 페이지 이전 페이지로 이동하세요. rel=\"next\" 다는 법.",
					linkTags: [
						{ rel: "canonical", href: "https://lesignal.co.kr/", hreflang: null },
					],
				},
				[makePage({ url: "https://lesignal.co.kr/list?page=2" })],
			),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toMatch(/rel="next"> 수: 0/);
	});

	it("비페이지네이션 사이트(linkTags 미정의)는 정보성 통과", () => {
		const r = seoPagination001(makeCtx({}));
		expect(r.passed).toBe(true);
	});

	it("깨진 선언: rel=next 인데 href 누락 → 부드러운 실패(passed=false, weight 3)", () => {
		const linkTags: LinkTag[] = [
			{ rel: "next", href: null, hreflang: null }, // href 누락 → 검색엔진이 따라갈 수 없음
		];
		const r = seoPagination001(makeCtx({ linkTags }));
		expect(r.passed).toBe(false);
		expect(r.ruleWeight).toBe(3);
		expect(r.evidence.join(" ")).toMatch(/href 누락/);
	});
});
