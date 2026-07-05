/**
 * X-SAG Core Engine — Phase 2 GEO 시맨틱 마이그레이션 테스트
 *
 * FP-prone GEO 룰들을 bodyText 정규식 → 구조화/문맥 인지 검증으로 이관한 뒤,
 * 각 룰에 대해
 *   - FALSE-POSITIVE 픽스처: 결손/비교/부정 문맥 또는 단순 언급 → 이제 올바르게 실패
 *   - TRUE-POSITIVE 픽스처: 실제 schema / 링크 / 긍정 신호 → 통과
 * 를 검증한다.
 *
 * 대상: GEO-REVIEW-AGGREGATE-001 / GEO-DIRECTIONS-INFO-001 /
 *       GEO-LLMS-TXT-001 / GEO-MAP-EMBED-001
 *
 * RuleContext 는 extractedEntities 를 채우지 않은 plain 형태로 전달한다.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	geoDirectionsInfo001,
	geoLlmsTxt001,
	geoMapEmbed001,
	geoReviewAggregate001,
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
// GEO-REVIEW-AGGREGATE-001 — schema AggregateRating 우선, 부정/비교/범위 문맥 제외
// ===========================================================================

describe("GEO-REVIEW-AGGREGATE-001: 리뷰 평점 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '후기 2개입니다' 결손 문맥은 평점 증거 아님 → 실패", () => {
		// 예전 정규식은 '후기 2개' 를 reviewCount 로 카운트해 통과시켰다.
		// 결손/부족 안내 문맥(±30자에 부족) 이면 증거로 인정하지 않는다.
		const r = geoReviewAggregate001(
			makeCtx({
				bodyText:
					"아직 등록된 후기 2개입니다. 후기가 부족하니 많은 리뷰 부탁드립니다.",
			}),
		);
		expect(r.ruleId).toBe("GEO-REVIEW-AGGREGATE-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '별점 1~5 범위' 척도 설명은 실제 평점 아님 → 실패", () => {
		const r = geoReviewAggregate001(
			makeCtx({
				bodyText:
					"별점은 1~5 범위로 매겨집니다. 다른 업체와 비교해 평가해 주세요.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: schema AggregateRating 있으면 본문 없어도 통과", () => {
		const r = geoReviewAggregate001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{
						"@type": "CafeOrCoffeeShop",
						name: "르시그널",
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

	it("TRUE-POSITIVE: 실제 평점(부정 문맥 없음)이면 통과", () => {
		const r = geoReviewAggregate001(
			makeCtx({
				bodyText: "네이버 평점 4.8점, 리뷰 120개로 많은 사랑을 받고 있습니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-DIRECTIONS-INFO-001 — 주차/교통 부정 문맥 제외, 긍정 안내만 인정
// ===========================================================================

describe("GEO-DIRECTIONS-INFO-001: 교통/길찾기 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '주차 걱정 없습니다' 부정 문맥만 있으면 실패", () => {
		// '주차' substring 이 부정/없음 문맥에 등장하면 실제 안내가 아니다.
		const r = geoDirectionsInfo001(
			makeCtx({
				bodyText: "주차 걱정 없습니다. 편하게 방문하세요.",
			}),
		);
		expect(r.ruleId).toBe("GEO-DIRECTIONS-INFO-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '교통 불편' 불만 문맥만 있으면 실패", () => {
		const r = geoDirectionsInfo001(
			makeCtx({
				bodyText: "주변 교통 불편 문제로 불만이 많았습니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 길찾기 안내(역/출구/도보)면 통과", () => {
		const r = geoDirectionsInfo001(
			makeCtx({
				bodyText: "찾아오시는 길: 강남역 3번 출구에서 도보 5분 거리입니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 긍정 주차 안내(부정 문맥 아님)면 통과", () => {
		const r = geoDirectionsInfo001(
			makeCtx({
				bodyText: "건물 지하에 주차 공간이 마련되어 있어 차량 방문이 편리합니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-LLMS-TXT-001 — 실제 /llms.txt 링크 요구, 본문 언급만으로는 미통과
// ===========================================================================

describe("GEO-LLMS-TXT-001: llms.txt 실제 파일 검증", () => {
	it("FALSE-POSITIVE: 본문에 'llms.txt' 언급만 있으면 실패", () => {
		// 예전 룰은 bodyText 의 'llms.txt' 언급만으로 통과시켰다.
		// 실제 파일 링크가 아니면 통과시키지 않는다.
		const r = geoLlmsTxt001(
			makeCtx({
				bodyText:
					"llms.txt 는 AI 검색 엔진에 정보를 안내하는 파일입니다. 블로그 글에서 소개합니다.",
			}),
		);
		expect(r.ruleId).toBe("GEO-LLMS-TXT-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: internalLinks 에 /llms.txt 경로가 있으면 통과", () => {
		const r = geoLlmsTxt001(
			makeCtx({
				internalLinks: ["https://lesignal.co.kr/llms.txt"],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: externalLinks 에 /llms.txt 경로가 있으면 통과", () => {
		const r = geoLlmsTxt001(
			makeCtx({
				externalLinks: ["https://cdn.example.com/llms.txt"],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// GEO-MAP-EMBED-001 — 실제 지도 링크/임베드 또는 schema hasMap 요구
// ===========================================================================

describe("GEO-MAP-EMBED-001: 지도 임베드 실제 신호 검증", () => {
	it("FALSE-POSITIVE: 'Google Maps' 본문 언급만 있으면 실패", () => {
		// 가이드/FAQ 의 단순 언급은 실제 임베드가 아니다.
		const r = geoMapEmbed001(
			makeCtx({
				bodyText:
					"Google Maps 와 네이버 지도 사용법을 안내합니다. 카카오맵도 편리합니다.",
			}),
		);
		expect(r.ruleId).toBe("GEO-MAP-EMBED-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: externalLinks 에 지도 링크가 있으면 통과", () => {
		const r = geoMapEmbed001(
			makeCtx({
				externalLinks: ["https://map.naver.com/v5/entry/place/12345"],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: internalLinks 에 maps iframe src 가 있으면 통과", () => {
		const r = geoMapEmbed001(
			makeCtx({
				internalLinks: [
					"https://www.google.com/maps/embed?pb=!1m18!1m12",
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema hasMap 이면 통과", () => {
		const r = geoMapEmbed001(
			makeCtx({
				schemaJsonLd: [
					{
						"@type": "LocalBusiness",
						name: "르시그널",
						hasMap: "https://map.naver.com/v5/entry/place/12345",
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});
