/**
 * X-SAG Core Engine — Phase 1 AEO/SEO 시맨틱 마이그레이션 테스트
 *
 * P0 AEO(서비스/가격/절차) + P1/P2 GEO(영업시간/사회적증거/브랜드) +
 * P1/P2 SEO(CTA/og:locale/twitter:card/favicon) 룰을 정규식 표층 매칭 →
 * 다층 시맨틱 검증으로 이관한 뒤, 각 룰에 대해
 *   - FALSE-POSITIVE 픽스처: 표층 키워드만 있는 비신호 → 이제 올바르게 실패
 *   - TRUE-POSITIVE 픽스처: 실제 구조화/수치/명령형 신호 → 통과
 * 를 검증한다.
 *
 * RuleContext.extractedEntities 는 채우지 않은 plain 형태(룰의 inline-fallback 검증).
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	aeoPriceInfo001,
	aeoProcessInfo001,
	aeoServiceDesc001,
} from "../aeo-rules.js";
import {
	geoBrandMention001,
	geoOpeningHours001,
	geoSocialProof001,
} from "../geo-rules.js";
import {
	seoCta001,
	seoFavicon001,
	seoOg002,
	seoTwitter001,
} from "../seo-rules.js";

// ---------------------------------------------------------------------------
// Helpers (phase1-geo-semantic.test.ts 스타일)
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example-store.co.kr/",
		statusCode: 200,
		title: "예시 매장",
		description: "예시 매장 설명입니다.",
		h1: "예시 매장",
		h2: [],
		meta: {
			viewport: "width=device-width, initial-scale=1",
		},
		bodyText: "",
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
			businessName: "블루밍",
			industry: "미용실",
			region: "강남",
			mainServices: ["커트", "염색", "펌"],
			targetKeywords: ["강남 미용실"],
			...profileOverrides,
		},
	};
}

// ===========================================================================
// AEO-SERVICE-DESC-001 — schema/heading 우선, form-label/제목 전용 등장 제외
// ===========================================================================

describe("AEO-SERVICE-DESC-001: 서비스 설명 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 서비스명이 입력 폼 레이블에만 등장하면 인정하지 않음", () => {
		// '커트'/'염색'/'펌' 이 검색 폼 placeholder/레이블에만 등장 → 실제 서비스 설명 아님.
		const r = aeoServiceDesc001(
			makeCtx(
				{
					bodyText:
						"검색어를 입력하세요. 예: 커트 입력란, 염색 검색, 펌 제목을 입력해 주세요. 글쓰기 게시판입니다.",
				},
				{ mainServices: ["커트", "염색", "펌"] },
			),
		);
		expect(r.ruleId).toBe("AEO-SERVICE-DESC-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 본문 일반 문장에 서비스명이 설명되면 통과", () => {
		const r = aeoServiceDesc001(
			makeCtx(
				{
					bodyText:
						"커트는 얼굴형에 맞춰 세심하게 진행합니다. 염색은 두피 보호 제품을 사용합니다. 펌은 손상 최소화 방식으로 시술합니다.",
				},
				{ mainServices: ["커트", "염색", "펌"] },
			),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema Service.name 으로도 서비스가 인정됨", () => {
		const r = aeoServiceDesc001(
			makeCtx(
				{
					bodyText: "환영합니다.",
					schemaJsonLd: [
						{ "@type": "Service", name: "커트" },
						{ "@type": "Service", name: "염색" },
						{ "@type": "Service", name: "펌" },
					],
				},
				{ mainServices: ["커트", "염색", "펌"] },
			),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: heading(H2)에 서비스명이 있으면 섹션 신호로 인정", () => {
		const r = aeoServiceDesc001(
			makeCtx(
				{
					bodyText: "환영합니다.",
					h2: ["커트 안내", "염색 안내", "펌 안내"],
				},
				{ mainServices: ["커트", "염색", "펌"] },
			),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-PRICE-INFO-001 — 실제 가격 신호(숫자+통화/무료) 요구, 설명문/예시/부정 제외
// ===========================================================================

describe("AEO-PRICE-INFO-001: 가격 정보 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 숫자 없는 '가격' 설명문만 있으면 실패", () => {
		const r = aeoPriceInfo001(
			makeCtx({
				bodyText:
					"가격은 상담 후 결정됩니다. 합리적인 요금으로 서비스하니 비용 걱정 없이 방문하세요.",
			}),
		);
		expect(r.ruleId).toBe("AEO-PRICE-INFO-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 무료가 부정 맥락이면 가격 신호로 치지 않음", () => {
		const r = aeoPriceInfo001(
			makeCtx({
				bodyText: "주차는 무료가 아닙니다. 가격 안내는 별도 문의 바랍니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 숫자+통화(원)가 있으면 통과", () => {
		const r = aeoPriceInfo001(
			makeCtx({
				bodyText: "커트 25,000원, 염색 60,000원부터 시작합니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema Offer.price 가 있으면 통과", () => {
		const r = aeoPriceInfo001(
			makeCtx({
				bodyText: "가격은 아래 표를 참고하세요.",
				schemaJsonLd: [
					{
						"@type": "Product",
						name: "커트",
						offers: { "@type": "Offer", price: "25000", priceCurrency: "KRW" },
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-PROCESS-INFO-001 — 순서 있는 단계(ol/HowTo/번호) 요구, generic 안내 제외
// ===========================================================================

describe("AEO-PROCESS-INFO-001: 이용 절차 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '안내'/'가이드'/'진행' 단어만 있으면 실패", () => {
		const r = aeoProcessInfo001(
			makeCtx({
				bodyText:
					"이용 안내를 참고하세요. 자세한 가이드는 직원이 진행 과정을 도와드립니다. 다음 단계로 넘어가세요.",
			}),
		);
		expect(r.ruleId).toBe("AEO-PROCESS-INFO-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: '1단계/2단계/3단계' 순서 표기가 있으면 통과", () => {
		const r = aeoProcessInfo001(
			makeCtx({
				bodyText:
					"이용 절차: 1단계 온라인 예약, 2단계 매장 방문, 3단계 시술 진행 순서로 이루어집니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: ordered list(ol) 가 1개 이상이면 통과", () => {
		const r = aeoProcessInfo001(
			makeCtx({
				bodyText: "예약 방법을 안내합니다.",
				listTableCount: { ul: 0, ol: 1, table: 0 },
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema HowTo.step[] 가 있으면 통과", () => {
		const r = aeoProcessInfo001(
			makeCtx({
				bodyText: "이용 방법",
				schemaJsonLd: [
					{
						"@type": "HowTo",
						name: "예약 방법",
						step: [
							{ "@type": "HowToStep", text: "예약" },
							{ "@type": "HowToStep", text: "방문" },
						],
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-OPENING-HOURS-001 — schema/유효시간범위 요구, 예시 시간 제외
// ===========================================================================

describe("GEO-OPENING-HOURS-001: 영업시간 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 예시 맥락의 영업시간 표기는 인정하지 않음", () => {
		const r = geoOpeningHours001(
			makeCtx({
				bodyText:
					"예시) 영업시간 09:00-18:00 형식으로 입력하세요. (placeholder 안내문입니다.)",
			}),
		);
		expect(r.ruleId).toBe("GEO-OPENING-HOURS-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 불가능한 시간 범위(25:00)만 있으면 실패", () => {
		const r = geoOpeningHours001(
			makeCtx({
				bodyText: "테스트 값 09:00-25:00 은 잘못된 표기입니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 유효한 시간 범위가 있으면 통과", () => {
		const r = geoOpeningHours001(
			makeCtx({
				bodyText: "영업시간 평일 10:00-21:00, 일요일 휴무입니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema openingHoursSpecification 이 있으면 통과", () => {
		const r = geoOpeningHours001(
			makeCtx({
				bodyText: "오시는 길 안내.",
				schemaJsonLd: [
					{
						"@type": "BeautySalon",
						name: "블루밍",
						openingHoursSpecification: {
							"@type": "OpeningHoursSpecification",
							dayOfWeek: "Monday",
							opens: "10:00",
							closes: "21:00",
						},
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-SOCIAL-PROOF-001 — 수치/수상/리뷰건수 요구, 일반 단어/안내문 제외
// ===========================================================================

describe("GEO-SOCIAL-PROOF-001: 사회적 증거 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '고객'/'만족'/'추천' 일반 단어만 있으면 실패", () => {
		const r = geoSocialProof001(
			makeCtx({
				bodyText:
					"고객 만족을 최우선으로 합니다. 단골이 추천하는 깨끗하고 친절한 공간입니다.",
			}),
		);
		expect(r.ruleId).toBe("GEO-SOCIAL-PROOF-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 리뷰 '작성 안내' 메타 텍스트만 있으면 실패", () => {
		const r = geoSocialProof001(
			makeCtx({
				bodyText:
					"리뷰를 남겨주세요. 첫 리뷰 작성 시 음료를 드립니다. 후기 이벤트 진행 중입니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 평점 수치(4.8점)가 있으면 통과", () => {
		const r = geoSocialProof001(
			makeCtx({
				bodyText: "네이버 평점 4.8점, 방문 고객의 재방문율이 높습니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 리뷰 건수(리뷰 120개)가 있으면 통과", () => {
		const r = geoSocialProof001(
			makeCtx({ bodyText: "누적 리뷰 120개가 쌓였습니다." }),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema AggregateRating 이 있으면 통과", () => {
		const r = geoSocialProof001(
			makeCtx({
				bodyText: "고객 후기",
				schemaJsonLd: [
					{
						"@type": "BeautySalon",
						name: "블루밍",
						aggregateRating: {
							"@type": "AggregateRating",
							ratingValue: "4.8",
							reviewCount: "120",
						},
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-BRAND-MENTION-001 — 합성어 내 매치 제외(distinct-token 경계 가드)
// ===========================================================================

describe("GEO-BRAND-MENTION-001: 브랜드 언급 경계 가드", () => {
	it("FALSE-POSITIVE: 1글자 브랜드 '떡'이 합성어(떡집/떡카페/떡볶이)에만 묻혀 있으면 실패", () => {
		// 기존 substring 카운트는 '떡' 을 떡집/떡카페/떡볶이 안에서도 매치해 ≥3 통과(FP).
		const r = geoBrandMention001(
			makeCtx(
				{
					bodyText:
						"근처 떡집과 떡카페가 많습니다. 떡볶이 맛집도 있고 떡국 가게도 있습니다.",
				},
				{ businessName: "떡" },
			),
		);
		expect(r.ruleId).toBe("GEO-BRAND-MENTION-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 구분된 토큰으로 브랜드가 3회 이상 등장하면 통과", () => {
		const r = geoBrandMention001(
			makeCtx(
				{
					bodyText:
						"떡 은 전통 간식입니다. 저희 떡 을 맛보세요. 신선한 떡 을 매일 만듭니다.",
				},
				{ businessName: "떡" },
			),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 다음절 브랜드가 본문에 3회 등장하면 통과", () => {
		const r = geoBrandMention001(
			makeCtx(
				{
					bodyText:
						"블루밍에 오신 것을 환영합니다. 블루밍은 강남에 있습니다. 블루밍과 함께하세요.",
				},
				{ businessName: "블루밍" },
			),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// SEO-CTA-001 — actionable CTA(명령형/링크) 요구, 정책 문구 제외
// ===========================================================================

describe("SEO-CTA-001: 행동 유도 문구 시맨틱 검증", () => {
	it("FALSE-POSITIVE: CTA 명사가 정책 문구('예약은 취소할 수 없습니다')에만 있으면 실패", () => {
		const r = seoCta001(
			makeCtx({
				bodyText:
					"예약은 취소할 수 없습니다. 주문 변경 불가합니다. 환불 규정상 결제 후 변경이 어렵습니다.",
			}),
		);
		expect(r.ruleId).toBe("SEO-CTA-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 명령형 CTA('지금 예약하기')가 있으면 통과", () => {
		const r = seoCta001(
			makeCtx({
				bodyText: "지금 예약하기 버튼을 눌러 간편하게 상담받으세요.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 연락/예약 외부 링크가 있으면 통과", () => {
		const r = seoCta001(
			makeCtx({
				bodyText: "문의 사항은 아래 채널로 연락 주세요.",
				externalLinks: ["https://pf.kakao.com/_blooming"],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: tel/mailto contactLinks가 있으면 HTTP 링크 배열 없이도 통과", () => {
		const r = seoCta001(
			makeCtx({
				bodyText: "문의 사항은 아래 버튼으로 연락 주세요.",
				externalLinks: [],
				contactLinks: [
					{
						kind: "tel",
						href: "tel:025551234",
						value: "025551234",
						text: "전화 문의",
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// SEO-OG-002 — meta 맵의 og:locale 읽기 (bodyText 언급 아님)
// ===========================================================================

describe("SEO-OG-002: og:locale meta 검증", () => {
	it("FALSE-POSITIVE: bodyText 에 'og:locale' 글자만 있으면 실패", () => {
		const r = seoOg002(
			makeCtx({
				bodyText: "og:locale 태그를 추가하는 방법을 설명하는 블로그 글입니다.",
				meta: {},
			}),
		);
		expect(r.ruleId).toBe("SEO-OG-002");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: meta 맵에 og:locale 값이 있으면 통과", () => {
		const r = seoOg002(
			makeCtx({ meta: { "og:locale": "ko_KR" } }),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// SEO-TWITTER-001 — meta 맵의 twitter:card 읽기
// ===========================================================================

describe("SEO-TWITTER-001: twitter:card meta 검증", () => {
	it("FALSE-POSITIVE: bodyText 에 'twitter:card' 글자만 있으면 실패", () => {
		const r = seoTwitter001(
			makeCtx({
				bodyText:
					"twitter:card 메타태그란 무엇인지 설명하는 본문 텍스트입니다.",
				meta: {},
			}),
		);
		expect(r.ruleId).toBe("SEO-TWITTER-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: meta 맵에 twitter:card 값이 있으면 통과", () => {
		const r = seoTwitter001(
			makeCtx({ meta: { "twitter:card": "summary_large_image" } }),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// SEO-FAVICON-001 — 파서 신호 부재 시 doc-text 에 발화하지 않음(정직한 스킵)
// ===========================================================================

describe("SEO-FAVICON-001: 파비콘 정직한 스킵", () => {
	it("bodyText 에 'favicon'/'rel=icon' 글자가 있어도 발화(=fail)하지 않음", () => {
		const r = seoFavicon001(
			makeCtx({
				bodyText:
					'favicon 설정 방법: <link rel="icon"> 을 head 에 넣으세요 — 이런 안내 글에 발화하면 안 됨.',
				meta: {},
			}),
		);
		expect(r.ruleId).toBe("SEO-FAVICON-001");
		// 파서가 favicon 신호를 노출하지 않으므로 패널티 없이 informational pass.
		expect(r.passed).toBe(true);
		expect(r.scoreImpact).toBe("unavailable");
		expect(r.evidence.join(" ")).toContain("미수집");
	});

	it("meta 신호(apple-touch-icon)가 있으면 통과 + 신호 노출", () => {
		const r = seoFavicon001(
			makeCtx({ meta: { "apple-touch-icon": "/icon.png" } }),
		);
		expect(r.passed).toBe(true);
		expect(r.scoreImpact).toBe("scored");
		expect(r.evidence.join(" ")).toContain("apple-touch-icon");
	});
});
