/**
 * X-SAG Core Engine — Phase 3 SEO 시맨틱 마이그레이션 테스트 (BATCH SEO Phase 3)
 *
 * bodyText 얕은 substring/regex 로 FP 가 나던 SEO 룰들을 구조화 신호(page.meta /
 * internalLinks / 경계-인지 매칭)로 이관하거나, 파서가 해당 <link rel> 신호를 수집하지
 * 않아 정직하게 informational 로 다운그레이드한 뒤 각 룰을 검증한다.
 *
 * 대상:
 *   SEO-NAVER-META-001  — page.meta["naver-site-verification"] 실측 (migrate)
 *   SEO-REGION-001      — region 경계-인지 매칭 (migrate)
 *   SEO-XML-SITEMAP-VALID-001 — internalLinks/externalLinks 의 sitemap.xml 경로 (migrate)
 *   SEO-HREFLANG-001    — Phase 4 에서 page.linkTags 실측 승격(본문 언급 무의미); 여기선 회귀만
 *   SEO-PAGINATION-001  — Phase 4 에서 page.linkTags 실측 승격(본문/URL 참고용); 여기선 회귀만
 *
 * RuleContext 는 extractedEntities 를 채우지 않은 plain 형태로 전달한다.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	seoHreflang001,
	seoNaverMeta001,
	seoPagination001,
	seoRegion001,
	seoXmlSitemapValid001,
} from "../seo-rules.js";

// ---------------------------------------------------------------------------
// Helpers (phase25-aeo-semantic.test.ts 스타일)
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
			...profileOverrides,
		},
	};
}

// ===========================================================================
// SEO-NAVER-META-001 — page.meta["naver-site-verification"] 실측
// ===========================================================================

describe("SEO-NAVER-META-001: 네이버 인증 메타 실측", () => {
	it("FALSE-POSITIVE: 본문이 'naver-site-verification' 문자열을 우연히 언급 → 메타 아님 → 실패", () => {
		// 예전 로직은 bodyText.includes('naver-site-verification') 만으로 통과시켜
		// 블로그/안내문이 그 단어를 인용하기만 해도 인증된 것으로 오탐했다.
		const r = seoNaverMeta001(
			makeCtx({
				bodyText:
					"네이버 서치어드바이저에서 naver-site-verification 메타태그를 발급받는 방법을 안내합니다.",
				meta: { viewport: "width=device-width" },
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 meta name=naver-site-verification 존재 → 통과", () => {
		const r = seoNaverMeta001(
			makeCtx({
				meta: {
					viewport: "width=device-width",
					"naver-site-verification": "abc123def456",
				},
			}),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toContain("abc123def456");
	});
});

// ===========================================================================
// SEO-REGION-001 — region 경계-인지 매칭
// ===========================================================================

describe("SEO-REGION-001: 지역 키워드 경계-인지 매칭", () => {
	it("FALSE-POSITIVE(ASCII): region 'san' 이 'thousand' 의 부분일치 → 실패", () => {
		// 예전 로직은 searchText.includes('san') 으로 'thousand' 안의 'san' 에도 통과했다.
		const r = seoRegion001(
			makeCtx(
				{
					title: "Thousand Oaks Coffee",
					description: "A thousand reasons to visit.",
					h1: "Thousand Oaks",
					h2: [],
					bodyText: "We serve a thousand happy guests.",
				},
				{ region: "san" },
			),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE(ASCII): region 'san' 이 'San Jose' 로 단어 단위 등장 → 통과", () => {
		const r = seoRegion001(
			makeCtx(
				{
					title: "San Jose Coffee",
					description: "Best coffee in San Jose.",
					h1: "San Jose",
					h2: [],
					bodyText: "Welcome to our San Jose cafe.",
				},
				{ region: "san jose" },
			),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE(한국어): region '강남' 이 제목에 등장 → 통과", () => {
		const r = seoRegion001(
			makeCtx(
				{ title: "르시그널 강남 브런치카페" },
				{ region: "강남" },
			),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE(한국어 place-suffix): region '강남' 이 '강남역' 으로 등장 → 통과", () => {
		// 강남역/강남구 는 region 강남 의 정당한 place-suffix 결합 → 매치 유지.
		const r = seoRegion001(
			makeCtx(
				{
					title: "르시그널 브런치카페",
					description: "강남역 3번 출구",
					h1: "르시그널",
					h2: [],
					bodyText: "강남역 인근에 위치합니다.",
				},
				{ region: "강남" },
			),
		);
		expect(r.passed).toBe(true);
	});

	it("실패: region 이 제목/설명/H1/H2/본문 어디에도 없음 → 실패", () => {
		const r = seoRegion001(
			makeCtx(
				{
					title: "르시그널 브런치카페",
					description: "맛있는 브런치",
					h1: "르시그널",
					h2: ["메뉴"],
					bodyText: "신선한 재료로 만듭니다.",
				},
				{ region: "부산" },
			),
		);
		expect(r.passed).toBe(false);
	});
});

// ===========================================================================
// SEO-XML-SITEMAP-VALID-001 — internalLinks/externalLinks 의 sitemap.xml 경로
// ===========================================================================

describe("SEO-XML-SITEMAP-VALID-001: sitemap.xml 링크 신호 실측", () => {
	it("FALSE-POSITIVE: 본문이 'sitemap.xml' 을 안내문으로 언급 → 실제 링크 아님 → 실패", () => {
		// 예전 fallback 은 bodyText.includes('sitemap.xml') 로 안내/블로그 텍스트에도 통과했다.
		const r = seoXmlSitemapValid001(
			makeCtx({
				bodyText:
					"robots.txt 에 Sitemap: 도메인/sitemap.xml 라인을 추가하는 방법을 설명합니다.",
				internalLinks: ["https://lesignal.co.kr/menu"],
				externalLinks: [],
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: internalLinks 에 /sitemap.xml 경로 존재 → 통과", () => {
		const r = seoXmlSitemapValid001(
			makeCtx({
				bodyText: "르시그널 강남 브런치카페",
				internalLinks: [
					"https://lesignal.co.kr/menu",
					"https://lesignal.co.kr/sitemap.xml",
				],
				externalLinks: [],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: externalLinks 에 sitemap_index.xml 경로 존재 → 통과", () => {
		const r = seoXmlSitemapValid001(
			makeCtx({
				bodyText: "르시그널 강남 브런치카페",
				internalLinks: [],
				externalLinks: ["https://cdn.example.com/sitemap_index.xml"],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// SEO-HREFLANG-001 — Phase 4 실측 승격 (page.linkTags). 본문 언급은 더 이상 무의미.
//   (실측 TP/FP 는 phase4-seo-semantic.test.ts 참조)
// ===========================================================================

describe("SEO-HREFLANG-001: 본문 hreflang 언급은 판정에 영향 없음 (Phase 4 실측)", () => {
	it("본문이 다국어를 언급해도 alternate-hreflang <link> 가 없으면 단일 언어로 통과", () => {
		// hreflang 은 <head> 의 <link rel="alternate" hreflang>. bodyText 에는 절대 나타나지
		// 않으므로 bodyText.includes('hreflang') 는 문서 텍스트 언급에만 반응하는 FP 였다.
		const r = seoHreflang001(
			makeCtx({
				bodyText:
					"English / 中文 / 日本語 버전을 제공합니다. en_us zh_cn ja_jp 콘텐츠.",
			}),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toMatch(/link|hreflang/i);
	});

	it("단일 언어 사이트(linkTags 없음)는 정보성 통과", () => {
		const r = seoHreflang001(makeCtx({ bodyText: "르시그널 강남 브런치카페" }));
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// SEO-PAGINATION-001 — Phase 4 실측 승격 (page.linkTags). 본문/URL 은 참고용.
//   (실측 TP/FP 는 phase4-seo-semantic.test.ts 참조)
// ===========================================================================

describe("SEO-PAGINATION-001: 본문/URL 페이지네이션 신호는 판정에 영향 없음 (Phase 4 실측)", () => {
	it("본문/URL 이 페이지네이션처럼 보여도 rel=prev/next <link> 가 없으면 통과", () => {
		// rel=prev/next 는 <head> 의 <link>. bodyText(가시 텍스트)에는 'rel=\"prev\"' 가
		// 절대 들어오지 않으므로 예전 bodyText 매칭은 절대 TP 가 불가능한 죽은 코드였다.
		const r = seoPagination001(
			makeCtx(
				{ bodyText: "다음 페이지 이전 페이지" },
				{},
				[makePage({ url: "https://lesignal.co.kr/list?page=2" })],
			),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toMatch(/link|prev|next/i);
	});

	it("단일 페이지 사이트(linkTags 없음)는 정보성 통과", () => {
		const r = seoPagination001(makeCtx({ bodyText: "르시그널 강남 브런치카페" }));
		expect(r.passed).toBe(true);
	});
});
