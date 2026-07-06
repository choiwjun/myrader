/**
 * X-SAG Core Engine — Phase 2.5 SEO 시맨틱 (Batch B) 테스트
 *
 * 이미지 룰 승격(PROMOTE) + shallow SEO 룰 이관(MIGRATE/DOWNGRADE) 검증.
 *
 *  - SEO-IMG-LAZY-001       : PROMOTE — images[].loading 실측 (commit 512973d).
 *      TP: 스크롤 아래 이미지가 loading="lazy" 면 통과.
 *      FP: 다수 이미지가 모두 eager(미선언) 면 실패.
 *  - SEO-IMG-DIMENSIONS-001 : PROMOTE — images[].width/height 실측 (CLS 방지).
 *      TP: 다수 이미지가 width·height 둘 다 선언 → 통과.
 *      FP: 치수 미선언 이미지 다수 → 실패.
 *  - SEO-LINK-NEWTAB-001    : DOWNGRADE — 파서가 링크별 target/rel 을 노출하지 않아
 *      bodyText "_blank"/"noopener" 검사는 FP. informational(passed=true) 강등.
 *  - SEO-KEYWORD-001        : MIGRATE — substring → word-aware(case/spacing) 매칭.
 *      FP: 키워드가 incidental 부분일치(영문 substring)로만 등장 → 실패.
 *      TP: 띄어쓰기 변형이어도 핵심 영역(title/H1/desc)에 단어 단위로 존재 → 통과.
 *
 * RuleContext 는 plain 형태(extractedEntities 미설정)로 전달한다.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	seoImgDimensions001,
	seoImgLazy001,
	seoKeyword001,
	seoLinkNewtab001,
} from "../seo-rules.js";

// ---------------------------------------------------------------------------
// Helpers (phase2-seo-semantic.test.ts 스타일)
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
// SEO-IMG-LAZY-001 — images[].loading 실측 승격 (PROMOTE)
// ===========================================================================

describe("SEO-IMG-LAZY-001: lazy loading 실측 승격", () => {
	it("TRUE-POSITIVE: 다수 이미지 중 below-the-fold 가 loading=lazy 면 통과", () => {
		// 첫 1장(above-the-fold)은 eager, 나머지는 lazy → 4장 중 3장 lazy(75%) ≥ 50%.
		const r = seoImgLazy001(
			makeCtx({
				images: [
					{ src: "/hero.jpg", alt: "히어로", loading: "eager" },
					{ src: "/2.jpg", alt: "메뉴1", loading: "lazy" },
					{ src: "/3.jpg", alt: "메뉴2", loading: "lazy" },
					{ src: "/4.jpg", alt: "메뉴3", loading: "lazy" },
				],
			}),
		);
		expect(r.ruleId).toBe("SEO-IMG-LAZY-001");
		expect(r.passed).toBe(true);
		expect(r.ruleWeight).toBe(3);
		expect(r.evidence.join(" ")).toContain("lazy");
	});

	it("FALSE-POSITIVE: 다수 이미지가 모두 eager/미선언이면 실패", () => {
		// 과거(informational)에는 무조건 통과했지만, 이제 다수 이미지가 지연 로딩
		// 안 되면 초기 로딩이 느려지므로 패널티를 준다.
		const r = seoImgLazy001(
			makeCtx({
				images: [
					{ src: "/1.jpg", alt: "1" },
					{ src: "/2.jpg", alt: "2" },
					{ src: "/3.jpg", alt: "3" },
					{ src: "/4.jpg", alt: "4", loading: "eager" },
				],
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("이미지가 적으면(≤2) below-the-fold 가 거의 없어 패널티 없이 통과", () => {
		const r = seoImgLazy001(
			makeCtx({
				images: [
					{ src: "/1.jpg", alt: "1" },
					{ src: "/2.jpg", alt: "2" },
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("이미지가 없으면 N/A 분기 그대로 통과", () => {
		const r = seoImgLazy001(makeCtx({ images: [] }));
		expect(r.passed).toBe(true);
	});

	it("bodyText 의 'loading=lazy' 문자열은 더 이상 신호로 쓰이지 않는다(속성 기준)", () => {
		// 본문에 코드 텍스트가 있어도 실제 img loading 속성이 없으면 다수 이미지는 실패.
		const r = seoImgLazy001(
			makeCtx({
				bodyText: "이미지에 loading=lazy 를 쓰라는 블로그 글입니다.",
				images: [
					{ src: "/1.jpg", alt: "1" },
					{ src: "/2.jpg", alt: "2" },
					{ src: "/3.jpg", alt: "3" },
				],
			}),
		);
		expect(r.passed).toBe(false);
	});
});

// ===========================================================================
// SEO-IMG-DIMENSIONS-001 — images[].width/height 실측 승격 (PROMOTE)
// ===========================================================================

describe("SEO-IMG-DIMENSIONS-001: width/height 실측 승격", () => {
	it("TRUE-POSITIVE: 다수 이미지가 width·height 둘 다 선언하면 통과(CLS 방지)", () => {
		const r = seoImgDimensions001(
			makeCtx({
				images: [
					{ src: "/1.jpg", alt: "1", width: "800", height: "600" },
					{ src: "/2.jpg", alt: "2", width: "640", height: "480" },
					{ src: "/3.jpg", alt: "3", width: "1024", height: "768" },
				],
			}),
		);
		expect(r.ruleId).toBe("SEO-IMG-DIMENSIONS-001");
		expect(r.passed).toBe(true);
		expect(r.ruleWeight).toBe(3);
		expect(r.evidence.join(" ")).toContain("선언");
	});

	it("FALSE-POSITIVE: 치수 미선언 이미지가 다수면 실패", () => {
		const r = seoImgDimensions001(
			makeCtx({
				images: [
					{ src: "/1.jpg", alt: "1" },
					{ src: "/2.jpg", alt: "2" },
					{ src: "/3.jpg", alt: "3", width: "800" }, // height 누락 → 종횡비 계산 불가
				],
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: width 만 있고 height 가 없으면 '둘 다' 조건 불충족 → 실패", () => {
		const r = seoImgDimensions001(
			makeCtx({
				images: [
					{ src: "/1.jpg", alt: "1", width: "800" },
					{ src: "/2.jpg", alt: "2", width: "640" },
				],
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("이미지가 없으면 N/A 분기 그대로 통과", () => {
		const r = seoImgDimensions001(makeCtx({ images: [] }));
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// SEO-LINK-NEWTAB-001 — 링크별 target/rel 신호 부재 → informational (DOWNGRADE)
// ===========================================================================

describe("SEO-LINK-NEWTAB-001: target/rel informational 강등", () => {
	it("FALSE-POSITIVE 방지: 본문에 '_blank' 가 있어도 패널티 없이 통과(passed=true)", () => {
		// 과거: bodyText.includes('_blank') && !includes('noopener') → 실패.
		// 이는 본문에 인용된 코드/안내문에도 오발화하는 FP. 파서가 링크별 target/rel 을
		// 노출하지 않으므로 informational 로 강등한다.
		const r = seoLinkNewtab001(
			makeCtx({
				bodyText:
					"외부 링크는 target=_blank 로 새 탭에서 연다는 안내 문구입니다.",
				externalLinks: ["https://naver.com"],
			}),
		);
		expect(r.ruleId).toBe("SEO-LINK-NEWTAB-001");
		expect(r.passed).toBe(true);
		expect(r.ruleWeight).toBe(6);
		expect(r.scoreImpact).toBe("unavailable");
		expect(r.evidence.join(" ")).toContain("미수집");
	});

	it("일반 페이지(외부 링크 유무 무관)도 패널티 없이 통과", () => {
		const r = seoLinkNewtab001(makeCtx({ bodyText: "르시그널 소개입니다." }));
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// SEO-KEYWORD-001 — substring → word-aware(case/spacing) 매칭 (MIGRATE)
// ===========================================================================

describe("SEO-KEYWORD-001: word-aware 키워드 매칭", () => {
	it("FALSE-POSITIVE: 영문 키워드가 더 긴 단어의 부분일치로만 등장하면 실패", () => {
		// 키워드 "cafe" 가 "cafeteria"(구내식당) 안에만 substring 으로 등장 → 과거에는
		// includes('cafe') 로 통과했으나, 단어 경계 매칭으로 incidental 매치를 배제한다.
		const r = seoKeyword001(
			makeCtx(
				{
					title: "Lesignal Cafeteria Brunch",
					h1: "Welcome to our cafeteria",
					description: "We run a cafeteria style brunch place.",
				},
				{ targetKeywords: ["cafe"] },
			),
		);
		expect(r.ruleId).toBe("SEO-KEYWORD-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 키워드가 어느 핵심 영역에도 단어 단위로 없으면 실패", () => {
		const r = seoKeyword001(
			makeCtx(
				{
					title: "환영합니다",
					h1: "르시그널",
					description: "맛있는 음료를 즐기세요.",
				},
				{ targetKeywords: ["강남 카페", "핸드드립 원두"] },
			),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 띄어쓰기 변형이어도 핵심 영역에 단어들이 존재하면 통과", () => {
		// 키워드 "강남 카페" → title 에 "강남"·"카페" 두 어절이 모두 존재(띄어쓰기 변형 흡수).
		const r = seoKeyword001(
			makeCtx(
				{
					title: "강남역 핸드드립 카페 르시그널",
					h1: "르시그널",
					description: "브런치 전문점입니다.",
				},
				{ targetKeywords: ["강남 카페"] },
			),
		);
		expect(r.passed).toBe(true);
		// evidence 에 매치 위치(title)가 기록된다.
		expect(r.evidence.join(" ")).toContain("title");
	});

	it("TRUE-POSITIVE: 영문 키워드가 단어 경계로 정확히 등장하면 통과(대소문자 무시)", () => {
		const r = seoKeyword001(
			makeCtx(
				{
					title: "Lesignal CAFE in Gangnam",
					h1: "Lesignal",
					description: "Brunch place.",
				},
				{ targetKeywords: ["cafe"] },
			),
		);
		expect(r.passed).toBe(true);
	});

	it("description 에만 있어도(핵심 영역) 통과", () => {
		const r = seoKeyword001(
			makeCtx(
				{
					title: "르시그널",
					h1: "르시그널",
					description: "강남에서 즐기는 브런치 카페입니다.",
				},
				{ targetKeywords: ["브런치 카페"] },
			),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toContain("description");
	});

	it("targetKeywords 가 빈 배열이면 N/A 통과", () => {
		const r = seoKeyword001(makeCtx({}, { targetKeywords: [] }));
		expect(r.passed).toBe(true);
	});
});
