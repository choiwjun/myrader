/**
 * X-SAG Core Engine — GAP 1 (룰 신호 정밀도) 테스트
 *
 * 4개 정밀도 보강의 false-positive 차단 + 정상 입력 회귀 검증.
 *   1) GEO-LOCAL-BUSINESS-SCHEMA-001 — 빈/최소 LocalBusiness 스키마 통과 차단
 *   2) SEO-OG-001 — placeholder og:title/og:description 미카운트
 *   3) GEO-BUSINESS-HOURS-DETAIL-001 — "25:00" 같은 비정상 시간 미인식
 *   4) AEO-ANSWER-LENGTH-001 / AEO-SCANNABLE-001 — URL/약어 dot 오분할 방지
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	geoBusinessHoursDetail001,
	geoLocalBusinessSchema001,
} from "../geo-rules.js";
import { seoOg001 } from "../seo-rules.js";
import { aeoAnswerLength001, aeoScannable001 } from "../aeo-rules.js";

// ---------------------------------------------------------------------------
// Helpers (phase-o-d-rules.test.ts 스타일과 동일)
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example.co.kr/",
		statusCode: 200,
		title: "테스트 카페 강남",
		description: "강남 핸드드립 카페입니다.",
		h1: "강남 카페 메인",
		h2: ["메뉴 안내", "오시는 길"],
		meta: {
			viewport: "width=device-width, initial-scale=1",
			description: "강남 핸드드립 카페입니다.",
		},
		bodyText: "테스트 카페에 오신 것을 환영합니다.",
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
			businessName: "테스트카페",
			industry: "카페",
			region: "강남",
			mainServices: ["핸드드립", "원두"],
			targetKeywords: ["강남 카페", "핸드드립"],
		},
	};
}

// ===========================================================================
// 1) GEO-LOCAL-BUSINESS-SCHEMA-001 — 최소 스키마 false-positive 차단
// ===========================================================================

describe("GEO-LOCAL-BUSINESS-SCHEMA-001: 핵심 속성 요구", () => {
	it("name+telephone(또는 address) 없는 빈 LocalBusiness 스키마는 실패", () => {
		const r = geoLocalBusinessSchema001(
			makeCtx({ schemaJsonLd: [{ "@type": "LocalBusiness" }] }),
		);
		expect(r.ruleId).toBe("GEO-LOCAL-BUSINESS-SCHEMA-001");
		expect(r.passed).toBe(false);
	});

	it("name만 있고 address/telephone 없으면 실패", () => {
		const r = geoLocalBusinessSchema001(
			makeCtx({
				schemaJsonLd: [{ "@type": "LocalBusiness", name: "테스트카페" }],
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("name + telephone 있으면 통과 (회귀)", () => {
		const r = geoLocalBusinessSchema001(
			makeCtx({
				schemaJsonLd: [
					{
						"@type": "CafeOrCoffeeShop",
						name: "테스트카페",
						telephone: "02-123-4567",
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("name + address(객체) 있으면 통과 (회귀)", () => {
		const r = geoLocalBusinessSchema001(
			makeCtx({
				schemaJsonLd: [
					{
						"@type": "LocalBusiness",
						name: "테스트카페",
						address: {
							"@type": "PostalAddress",
							streetAddress: "강남대로 1",
						},
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("name + address(문자열) 있으면 통과 (회귀)", () => {
		const r = geoLocalBusinessSchema001(
			makeCtx({
				schemaJsonLd: [
					{
						"@type": "Store",
						name: "테스트스토어",
						address: "서울시 강남구 강남대로 1",
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("빈 address 객체는 미인정 → 실패", () => {
		const r = geoLocalBusinessSchema001(
			makeCtx({
				schemaJsonLd: [
					{ "@type": "LocalBusiness", name: "테스트카페", address: {} },
				],
			}),
		);
		expect(r.passed).toBe(false);
	});
});

// ===========================================================================
// 2) SEO-OG-001 — placeholder og:title/description 미카운트
// ===========================================================================

describe("SEO-OG-001: placeholder og 값 필터", () => {
	it("og:title이 placeholder('제목없음')면 카운트 제외되어 실패", () => {
		const r = seoOg001(
			makeCtx({
				meta: {
					"og:title": "제목없음",
					"og:description": "기본 설명",
					"og:image": "https://example.co.kr/og.png",
				},
			}),
		);
		expect(r.ruleId).toBe("SEO-OG-001");
		// title placeholder → desc/image 2개만 유효 → count<3 → 실패
		expect(r.passed).toBe(false);
	});

	it("og:title='Untitled' (영문, 대소문자 무시)도 제외", () => {
		const r = seoOg001(
			makeCtx({
				meta: {
					"og:title": "UNTITLED",
					"og:description": "Real description here",
					"og:image": "https://example.co.kr/og.png",
				},
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("실제 og 값 3개 이상이면 통과 (회귀)", () => {
		const r = seoOg001(
			makeCtx({
				meta: {
					"og:title": "강남 핸드드립 카페",
					"og:description": "강남역 도보 5분 핸드드립 전문 카페입니다.",
					"og:image": "https://example.co.kr/og.png",
				},
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// 3) GEO-BUSINESS-HOURS-DETAIL-001 — 비정상 시간 미인식
// ===========================================================================

describe("GEO-BUSINESS-HOURS-DETAIL-001: 시간 유효성", () => {
	it("'09:00-25:00' 같은 비정상 시간만 있으면 hours로 인식하지 않아 통과", () => {
		const r = geoBusinessHoursDetail001(
			makeCtx({ bodyText: "영업시간 09:00-25:00 입니다." }),
		);
		expect(r.ruleId).toBe("GEO-BUSINESS-HOURS-DETAIL-001");
		// 유효한 hours 없음 + detail 없음 → hasAnyHours=false → passed=true
		expect(r.passed).toBe(true);
		expect(r.evidence[0]).toContain("없음");
	});

	it("start>=end (18:00-09:00)도 비정상으로 미인식", () => {
		const r = geoBusinessHoursDetail001(
			makeCtx({ bodyText: "영업시간 18:00-09:00" }),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence[0]).toContain("없음");
	});

	it("유효한 단순 시간만 있으면(요일 구분 없음) 실패 (회귀)", () => {
		const r = geoBusinessHoursDetail001(
			makeCtx({ bodyText: "영업시간 09:00-18:00 입니다." }),
		);
		expect(r.passed).toBe(false);
		expect(r.evidence[0]).toContain("있음");
	});

	it("요일별 구분 + 유효 시간이면 통과 (회귀)", () => {
		const r = geoBusinessHoursDetail001(
			makeCtx({ bodyText: "월~금 09:00-18:00, 토요일 10:00-15:00, 일요일 휴무" }),
		);
		expect(r.passed).toBe(true);
		expect(r.evidence[1]).toContain("있음");
	});
});

// ===========================================================================
// 4) AEO-ANSWER-LENGTH-001 / AEO-SCANNABLE-001 — 문장 분할 정밀도
// ===========================================================================

describe("AEO-ANSWER-LENGTH-001: URL/약어 dot 오분할 방지", () => {
	it("URL/약어가 섞인 1개 긴 문장은 여러 문장으로 쪼개지지 않는다", () => {
		// 약어(Dr.)와 URL(example.com) 때문에 naive split은 4문장으로 오분할 → 통과로 잘못 판정.
		const body =
			"저희 대표 원장 Dr. Lee 가 운영하는 example.com 카페는 강남역 3번 출구 도보 5분 거리에 위치한 핸드드립 전문점입니다";
		const r = aeoAnswerLength001(makeCtx({ bodyText: body }));
		expect(r.ruleId).toBe("AEO-ANSWER-LENGTH-001");
		// 실제로는 40자 이상 문장 1개 → 3개 미만 → 실패해야 함
		expect(r.passed).toBe(false);
	});

	it("실제 40자 이상 문장 3개면 통과 (회귀)", () => {
		const body =
			"강남역 3번 출구에서 도보 5분 거리에 위치한 핸드드립 전문 카페로 매일 운영하고 있습니다. " +
			"매일 아침 신선하게 직접 로스팅한 원두로 한 잔씩 정성껏 커피를 내려 드리고 있습니다. " +
			"단체 모임과 스터디룸 예약도 언제든 가능하니 편하게 문의해 주시면 친절히 안내해 드리겠습니다.";
		const r = aeoAnswerLength001(makeCtx({ bodyText: body }));
		expect(r.passed).toBe(true);
	});
});

describe("AEO-SCANNABLE-001: URL/약어 dot 오분할 방지", () => {
	it("URL/약어 dot가 문장 수를 부풀리지 않는다", () => {
		// 단락 1개 = 실제 2문장. naive split이면 Dr./Inc./example.com dot으로 5+ 문장 →
		// 평균>4 → 잘못 실패. helper면 2문장 → 평균<=4 → 통과.
		const body =
			"저희 카페는 Dr. Lee 와 Smith Inc. 가 공동 운영하며 example.com 에서 예약을 받습니다. " +
			"강남역 도보 5분 거리에 있어 접근성이 매우 좋습니다.";
		const r = aeoScannable001(makeCtx({ bodyText: body }));
		expect(r.ruleId).toBe("AEO-SCANNABLE-001");
		expect(r.passed).toBe(true);
	});

	it("실제 5문장 단락은 여전히 실패 (회귀)", () => {
		const body =
			"첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다. 네 번째 문장입니다. 다섯 번째 문장입니다.";
		const r = aeoScannable001(makeCtx({ bodyText: body }));
		expect(r.passed).toBe(false);
		expect(r.description).toContain("paragraphLimit=4");
	});
});
