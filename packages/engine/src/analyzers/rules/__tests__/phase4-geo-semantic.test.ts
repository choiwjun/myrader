/**
 * X-SAG Core Engine — Phase 4 GEO 시맨틱 마이그레이션 테스트 (BATCH GEO EDGE)
 *
 * low-weight 얕은 GEO 룰 3종을 bodyText substring/regex → 구조화 신호로 이관한 뒤,
 * 각 룰에 대해
 *   - FALSE-POSITIVE 픽스처: 안내문/인용/우연한 외국어 → 이제 올바르게 실패(또는 무시)
 *   - TRUE-POSITIVE 픽스처: 실제 meta / linkTags(hreflang) / 실측 전화번호 → 통과
 * 를 검증한다.
 *
 * 대상:
 *   GEO-OG-IMAGE-001     — bodyText.includes("og:image") 드롭, page.meta["og:image"] 실측 (migrate)
 *   GEO-MULTIPLE-LANG-001 — 우연한 영단어 regex 드롭, linkTags(rel=alternate hreflang) 구조화 (migrate)
 *   GEO-PHONE-FORMAT-001 — 느슨한 전화 substring → extractPhones(예시 제외) + tel: 단서 (tighten)
 *
 * RuleContext 는 extractedEntities 를 채우지 않은 plain 형태로 전달한다.
 * (phase1-geo-semantic.test.ts 스타일)
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	geoAiSummary001,
	geoBrandConsistency001,
	geoBrandInH1001,
	geoBrandInTitle001,
	geoBusinessHoursDetail001,
	geoBusinessName001,
	geoIndustry001,
	geoLocalBusinessSchema001,
	geoLocationSchema001,
	geoMultipleLang001,
	geoOrganizationSchema001,
	geoOgImage001,
	geoPhoneFormat001,
	geoRegion001,
} from "../geo-rules.js";

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
// GEO-OG-IMAGE-001 — page.meta["og:image"] 실측
// ===========================================================================

describe("GEO-OG-IMAGE-001: OG 이미지 메타 실측", () => {
	it("FALSE-POSITIVE: 본문이 'og:image 태그를 추가하세요' 안내만 함 → 메타 아님 → 실패", () => {
		// 예전 로직은 bodyText.includes("og:image") 만으로 통과시켜
		// SEO 가이드/안내문이 그 단어를 언급하기만 해도 OG 이미지가 설정된 것으로 오탐했다.
		const r = geoOgImage001(
			makeCtx({
				bodyText:
					"SNS 공유를 위해 <head> 에 og:image 태그를 추가하세요. og:image 는 대표 이미지를 지정합니다.",
				meta: { viewport: "width=device-width" },
			}),
		);
		expect(r.ruleId).toBe("GEO-OG-IMAGE-001");
		expect(r.passed).toBe(false);
		expect(r.evidence.join(" ")).toContain("없음");
	});

	it("FALSE-POSITIVE: meta['og:image'] 가 빈 문자열 → 실패", () => {
		const r = geoOgImage001(
			makeCtx({
				meta: { viewport: "width=device-width", "og:image": "   " },
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 meta['og:image'] URL 존재 → 통과", () => {
		const r = geoOgImage001(
			makeCtx({
				meta: {
					viewport: "width=device-width",
					"og:image": "https://lesignal.co.kr/og.png",
				},
				// 본문에는 og:image 언급이 전혀 없어도 메타만으로 통과해야 한다.
				bodyText: "르시그널 강남 브런치카페입니다.",
			}),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toContain("있음");
	});
});

// ===========================================================================
// GEO-MULTIPLE-LANG-001 — linkTags(rel=alternate hreflang) 구조화 신호
// ===========================================================================

describe("GEO-MULTIPLE-LANG-001: 다국어 구조화 신호(hreflang)", () => {
	it("FALSE-POSITIVE: 관광 업종 한국어 본문에 우연한 영단어만 → 다국어 아님 → 실패", () => {
		// 예전 로직은 [a-zA-Z]{4,} 5개 이상이면 '영어 콘텐츠 있음' 으로 보고 통과시켰다.
		// 차용어/브랜드명/URL 조각이 섞인 한국어 본문이 다국어로 오탐됐다.
		const r = geoMultipleLang001(
			makeCtx(
				{
					bodyText:
						"저희 호텔 라운지에서는 브런치 menu 와 special 디저트, premium 커피, signature 칵테일을 즐기실 수 있습니다.",
					// 다른 언어 alternate link 가 전혀 없다.
					linkTags: [
						{ rel: "canonical", href: "https://h.co.kr/", hreflang: null },
					],
					htmlLang: "ko",
				},
				{ industry: "호텔" },
			),
		);
		expect(r.ruleId).toBe("GEO-MULTIPLE-LANG-001");
		expect(r.passed).toBe(false);
		expect(r.evidence.join(" ")).toContain("0");
	});

	it("TRUE-POSITIVE: rel=alternate hreflang 로 영문/일문 버전 선언 → 다국어 → 통과", () => {
		const r = geoMultipleLang001(
			makeCtx(
				{
					bodyText: "한국어 본문입니다.",
					linkTags: [
						{ rel: "canonical", href: "https://h.co.kr/", hreflang: null },
						{
							rel: "alternate",
							href: "https://h.co.kr/en/",
							hreflang: "en",
						},
						{
							rel: "alternate",
							href: "https://h.co.kr/ja/",
							hreflang: "ja",
						},
					],
					htmlLang: "ko",
				},
				{ industry: "호텔" },
			),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toContain("hreflang");
	});

	it("TRUE-POSITIVE(non-tourist): 다국어 미선언이어도 비관광 업종은 통과(권고 아님)", () => {
		const r = geoMultipleLang001(
			makeCtx(
				{
					bodyText: "한국어 전용 카페입니다.",
					linkTags: [],
					htmlLang: "ko",
				},
				{ industry: "카페" },
			),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-PHONE-FORMAT-001 — extractPhones(예시 제외) + tel: 단서
// ===========================================================================

describe("GEO-PHONE-FORMAT-001: 전화 클릭 단서 실측", () => {
	it("FALSE-POSITIVE: 예시 전화번호('예시) 010-0000-0000')만 → 실측 전화 아님 → 통과(평가 대상 아님)", () => {
		// 예전 로직은 phonePattern.test 가 예시 placeholder 번호도 '전화번호 있음' 으로 보고
		// tel 단서가 없으면 실패시켰다. 이제 extractPhones+예시제외로 실측 번호가 0 이면
		// 평가 대상이 아니므로 통과한다.
		const r = geoPhoneFormat001(
			makeCtx({
				bodyText:
					"전화번호는 다음 형식으로 입력하세요. 예시) 010-0000-0000 처럼 작성하면 됩니다.",
			}),
		);
		expect(r.ruleId).toBe("GEO-PHONE-FORMAT-001");
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toContain("없음");
		expect(r.scoreImpact).toBe("unavailable");
	});

	it("FALSE-NEGATIVE→FAIL: 실측 전화번호는 있는데 tel: 단서 없음 → 실패", () => {
		const r = geoPhoneFormat001(
			makeCtx({
				bodyText:
					"르시그널 강남점입니다. 예약 문의는 02-1234-5678 로 연락 주세요.",
			}),
		);
		expect(r.passed).toBe(false);
		expect(r.evidence.join(" ")).toContain("있음");
	});

	it("TRUE-POSITIVE: 실측 전화번호 + parser contactLinks tel: 단서 → 통과", () => {
		const r = geoPhoneFormat001(
			makeCtx({
				bodyText: "르시그널 강남점 예약: 02-1234-5678",
				contactLinks: [
					{
						kind: "tel",
						href: "tel:0212345678",
						value: "0212345678",
						text: "바로 전화 걸기",
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: parser contactLinks의 tel: 링크를 클릭 가능 단서로 인정한다", () => {
		const r = geoPhoneFormat001(
			makeCtx({
				bodyText: "르시그널 강남점 예약 전화 버튼을 눌러 주세요.",
				contactLinks: [
					{
						kind: "tel",
						href: "tel:0212345678",
						value: "0212345678",
						text: "전화 예약",
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

describe("GEO schema rules: @graph 평탄화", () => {
	it("TRUE-POSITIVE: @graph 내부 Bakery LocalBusiness subtype을 인식한다", () => {
		const r = geoLocalBusinessSchema001(
			makeCtx({
				schemaJsonLd: [
					{
						"@context": "https://schema.org",
						"@graph": [
							{
								"@type": "Bakery",
								name: "르시그널",
								telephone: "02-1234-5678",
							},
						],
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: @graph 내부 Organization을 인식한다", () => {
		const r = geoOrganizationSchema001(
			makeCtx({
				schemaJsonLd: [
					{ "@graph": [{ "@type": "Organization", name: "르시그널" }] },
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: @graph 내부 address/geo 위치 신호를 인식한다", () => {
		const r = geoLocationSchema001(
			makeCtx({
				schemaJsonLd: [
					{
						"@graph": [
							{
								"@type": "CafeOrCoffeeShop",
								address: {
									"@type": "PostalAddress",
									streetAddress: "강남대로 100",
								},
							},
						],
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

describe("GEO-AI-SUMMARY-001: parser paragraph contract", () => {
	it("parser paragraphs 필드가 있으면 bodyText 개행 없이도 평균 단락 길이를 올바르게 계산한다", () => {
		const r = geoAiSummary001(
			makeCtx({
				bodyText:
					"첫 번째 단락은 강남 카페 르시그널의 대표 메뉴와 원두 특징, 예약 고객에게 제공되는 브런치 구성을 설명합니다. 두 번째 단락은 매장 위치, 대중교통 접근, 전화 예약 방법과 방문 전 확인할 내용을 설명합니다.",
				paragraphs: [
					"첫 번째 단락은 강남 카페 르시그널의 대표 메뉴와 원두 특징, 예약 고객에게 제공되는 브런치 구성을 설명합니다.",
					"두 번째 단락은 매장 위치, 대중교통 접근, 전화 예약 방법과 방문 전 확인할 내용을 설명합니다.",
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

describe("GEO high-weight matching: boundary, spacing, synonyms", () => {
	it("TRUE-POSITIVE: 업체명 띄어쓰기 변형을 인식한다", () => {
		const r = geoBusinessName001(
			makeCtx(
				{
					title: "르 쿠르 강남점",
					h1: "르 쿠르",
					bodyText: "르 쿠르는 강남의 카페입니다.",
				},
				{ businessName: "르쿠르" },
			),
		);
		expect(r.passed).toBe(true);
	});

	it("FALSE-POSITIVE: 업체명이 더 긴 한글 토큰 내부에만 있으면 실패한다", () => {
		const r = geoBusinessName001(
			makeCtx(
				{
					title: "프르쿠르미엄 베이커리",
					h1: "프르쿠르미엄",
					bodyText: "프르쿠르미엄 브랜드 소개입니다.",
				},
				{ businessName: "르쿠르" },
			),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 영어 industry=cafe 입력이 한국어 카페 본문과 매칭된다", () => {
		const r = geoIndustry001(
			makeCtx(
				{
					title: "르시그널 강남 브런치",
					description: "강남에서 운영하는 카페입니다.",
					bodyText: "핸드드립과 브런치를 제공하는 동네 카페입니다.",
				},
				{ industry: "cafe" },
			),
		);
		expect(r.passed).toBe(true);
	});

	it("FALSE-POSITIVE: 짧은 지역명은 부산 같은 합성 문자열 내부와 매칭하지 않는다", () => {
		const r = geoRegion001(
			makeCtx(
				{
					title: "부산 브런치 카페",
					description: "부산에서 운영합니다.",
					bodyText: "부산 지역 고객을 위한 안내입니다.",
				},
				{ region: "산" },
			),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 브랜드 일관성도 띄어쓰기 변형을 동일 브랜드로 본다", () => {
		const r = geoBrandConsistency001(
			makeCtx(
				{
					title: "르 쿠르 | 강남 카페",
					h1: "르 쿠르",
					description: "르쿠르 강남점 공식 홈페이지입니다.",
					bodyText: "르 쿠르는 예약제로 운영됩니다.",
				},
				{ businessName: "르쿠르" },
			),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: title/H1 브랜드 룰도 띄어쓰기 변형을 인정한다", () => {
		const titleRule = geoBrandInTitle001(
			makeCtx({ title: "르 쿠르 공식" }, { businessName: "르쿠르" }),
		);
		const h1Rule = geoBrandInH1001(
			makeCtx({ h1: "르 쿠르" }, { businessName: "르쿠르" }),
		);
		expect(titleRule.passed).toBe(true);
		expect(h1Rule.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 세부 운영시간이 없으면 점수 중립 unavailable로 반환한다", () => {
		const r = geoBusinessHoursDetail001(
			makeCtx({
				bodyText: "영업시간은 별도 공지로 안내합니다.",
			}),
		);
		expect(r.passed).toBe(false);
		expect(r.scoreImpact).toBe("unavailable");
	});
});
