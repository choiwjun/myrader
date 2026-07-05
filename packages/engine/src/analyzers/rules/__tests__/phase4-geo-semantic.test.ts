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
	geoMultipleLang001,
	geoOgImage001,
	geoPhoneFormat001,
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

	it("TRUE-POSITIVE: 실측 전화번호 + tel: 단서 → 통과", () => {
		const r = geoPhoneFormat001(
			makeCtx({
				bodyText:
					"르시그널 강남점 예약: 02-1234-5678 (tel:0212345678 으로 바로 전화 걸기)",
			}),
		);
		expect(r.passed).toBe(true);
	});
});
