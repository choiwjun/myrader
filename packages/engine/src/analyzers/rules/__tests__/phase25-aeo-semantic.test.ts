/**
 * X-SAG Core Engine — Phase 2.5 AEO 시맨틱 마이그레이션 테스트 (BATCH A)
 *
 * FP-prone 얕은-정규식 AEO 룰들을 bodyText 단순 매치 → 구조화/문맥 인지 검증으로
 * 이관한 뒤, 각 룰에 대해
 *   - FALSE-POSITIVE 픽스처: 안내문/정책/부정/무관 문맥 또는 단어 일부 매치
 *     → 이제 올바르게 실패
 *   - TRUE-POSITIVE 픽스처: 실제 schema / heading / 긍정 본문 신호 → 통과
 * 를 검증한다.
 *
 * 대상:
 *   AEO-TESTIMONIAL-001 / AEO-DURATION-INFO-001 / AEO-DATE-RECENT-001 /
 *   AEO-QUESTION-FORMAT-001 / AEO-DEFINITION-001 / AEO-TARGET-CUSTOMER-001
 *
 * RuleContext 는 extractedEntities 를 채우지 않은 plain 형태로 전달한다.
 * (phase2-geo-semantic.test.ts 스타일)
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	aeoDateRecent001,
	aeoDefinition001,
	aeoDurationInfo001,
	aeoQuestionFormat001,
	aeoTargetCustomer001,
	aeoTestimonial001,
} from "../aeo-rules.js";

// ---------------------------------------------------------------------------
// Helpers (phase2-geo-semantic.test.ts 스타일)
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
// AEO-TESTIMONIAL-001 — schema Review/AggregateRating 우선, 안내/정책/부정 제외
// ===========================================================================

describe("AEO-TESTIMONIAL-001: 고객 후기 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '리뷰 작성 안내' 안내문은 후기 아님 → 실패", () => {
		// 예전 정규식은 '리뷰' substring 만으로 통과시켰다.
		// 후기 작성 안내(instruction) 문맥이면 실제 고객 증언이 아니다.
		const r = aeoTestimonial001(
			makeCtx({
				bodyText:
					"리뷰 작성 안내: 방문 후 리뷰를 남기는 방법을 설명합니다. 리뷰를 작성해 주세요.",
			}),
		);
		expect(r.ruleId).toBe("AEO-TESTIMONIAL-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '리뷰 정책'/'후기 이벤트' 정책 문맥은 후기 아님 → 실패", () => {
		const r = aeoTestimonial001(
			makeCtx({
				bodyText:
					"리뷰 정책 및 후기 이벤트 규정을 확인하세요. 부적절한 후기는 삭제될 수 있습니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '후기가 없습니다' 부정 문맥은 후기 아님 → 실패", () => {
		const r = aeoTestimonial001(
			makeCtx({
				bodyText: "아직 등록된 후기가 없습니다. 첫 후기를 남겨주세요.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: schema AggregateRating 있으면 본문 없어도 통과", () => {
		const r = aeoTestimonial001(
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

	it("TRUE-POSITIVE: schema Review 노드 있으면 통과", () => {
		const r = aeoTestimonial001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{
						"@type": "Review",
						reviewBody: "분위기가 정말 좋았어요.",
						author: { "@type": "Person", name: "김** 고객님" },
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 실제 후기 증언 문장(긍정 평가)이면 통과", () => {
		const r = aeoTestimonial001(
			makeCtx({
				bodyText:
					'고객 후기: "커피가 정말 훌륭하고 직원분들이 친절해서 대만족이었어요." 또 방문하고 싶습니다.',
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-DURATION-INFO-001 — 숫자+시간단위 인접(소요 문맥), '분석'의 '분' 등 단어일부 제외
// ===========================================================================

describe("AEO-DURATION-INFO-001: 소요 시간 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '분석'/'분야'의 '분' substring 만으로는 실패", () => {
		// 예전 정규식 /분|시간/ 은 '분석', '분야'의 '분'에도 매치되어 통과시켰다.
		const r = aeoDurationInfo001(
			makeCtx({
				bodyText:
					"저희는 데이터 분석 분야의 전문가입니다. 다양한 분야를 다룹니다.",
			}),
		);
		expect(r.ruleId).toBe("AEO-DURATION-INFO-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 숫자 없는 '시간이 중요합니다' 무관 문맥은 실패", () => {
		const r = aeoDurationInfo001(
			makeCtx({
				bodyText: "고객의 시간이 무엇보다 중요합니다. 시작이 반입니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: '소요시간 30분' 처럼 숫자+단위 소요 문맥이면 통과", () => {
		const r = aeoDurationInfo001(
			makeCtx({
				bodyText: "커트 서비스는 소요시간 30분 정도이며 예약이 가능합니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: '약 1시간 소요' 처럼 숫자+시간 단위면 통과", () => {
		const r = aeoDurationInfo001(
			makeCtx({
				bodyText: "염색은 약 1시간 소요됩니다. 충분한 시간을 두고 방문하세요.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: '당일 완료'/'즉시 처리' 즉시성 표현이면 통과", () => {
		const r = aeoDurationInfo001(
			makeCtx({
				bodyText: "접수하신 요청은 당일 완료를 원칙으로 처리해 드립니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-DATE-RECENT-001 — schema datePublished/dateModified 우선, 저작권/과거 제외
// ===========================================================================

describe("AEO-DATE-RECENT-001: 최신성 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '© 2025' 저작권 연도만 있으면 실패", () => {
		// 예전 정규식 /202[0-9]년|.../ 은 footer 저작권 연도에도 매치되어 통과시켰다.
		const r = aeoDateRecent001(
			makeCtx({
				bodyText: "© 2025 르시그널. All rights reserved.",
			}),
		);
		expect(r.ruleId).toBe("AEO-DATE-RECENT-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '2021년에 창업' 과거 서술만 있으면 실패", () => {
		const r = aeoDateRecent001(
			makeCtx({
				bodyText: "저희는 2021년에 창업하여 오랜 전통을 자랑합니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: schema dateModified 있으면 통과", () => {
		const r = aeoDateRecent001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{
						"@type": "Article",
						headline: "메뉴 개편 안내",
						dateModified: "2026-05-01",
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 본문 신선도 라벨+최신 날짜('최종 업데이트 2026년')면 통과", () => {
		const r = aeoDateRecent001(
			makeCtx({
				bodyText: "최종 업데이트 2026년 3월 기준으로 메뉴를 갱신했습니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-QUESTION-FORMAT-001 — 실제 질문형 H2/H3 (질문 종결어미/물음표) 요구
// ===========================================================================

describe("AEO-QUESTION-FORMAT-001: 질문형 소제목 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '왜 우리인가' 같은 비-질문(평서) H2 단어 매치는 실패", () => {
		// 예전 정규식은 '왜' substring 만으로 통과 → 평서 슬로건도 통과시켰다.
		// 질문 종결어미/물음표가 없으면 질문형 제목이 아니다.
		const r = aeoQuestionFormat001(
			makeCtx({
				h2: ["왜 우리인가", "무엇이든 가능"],
			}),
		);
		expect(r.ruleId).toBe("AEO-QUESTION-FORMAT-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 본문에만 '어떻게' 있고 heading 은 평서면 실패", () => {
		const r = aeoQuestionFormat001(
			makeCtx({
				h2: ["서비스 소개", "이용 안내"],
				bodyText: "어떻게 이용하는지 본문에서 설명합니다. 무엇이 좋은지도요.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 질문형 H2('가격이 얼마인가요?')면 통과", () => {
		const r = aeoQuestionFormat001(
			makeCtx({
				h2: ["서비스 소개", "가격이 얼마인가요?"],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: headingStructure 의 질문형 H3('어떻게 예약하나요?')면 통과", () => {
		const r = aeoQuestionFormat001(
			makeCtx({
				h2: ["서비스 소개"],
				headingStructure: [
					{ level: 2, text: "서비스 소개" },
					{ level: 3, text: "어떻게 예약하나요?" },
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-DEFINITION-001 — 정의 문장 구조('X(이)란 ... 입니다') 요구, 단순 종결 제외
// ===========================================================================

describe("AEO-DEFINITION-001: 정의 문장 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '환영합니다.' 단순 종결('입니다.' 매치)만으로는 실패", () => {
		// 예전 정규식 /입니다\./ 은 정의가 아닌 아무 종결 문장도 통과시켰다.
		const r = aeoDefinition001(
			makeCtx({
				bodyText: "방문해 주셔서 감사합니다. 좋은 하루 되세요.",
			}),
		);
		expect(r.ruleId).toBe("AEO-DEFINITION-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '란?' 단편(서술 없음)만 있으면 실패", () => {
		const r = aeoDefinition001(
			makeCtx({
				bodyText: "핸드드립이란? 자세한 내용은 블로그를 참고하세요.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 'X(이)란 ... 입니다' 정의 구조면 통과", () => {
		const r = aeoDefinition001(
			makeCtx({
				bodyText:
					"핸드드립이란 원두를 직접 갈아 물을 천천히 부어 추출하는 커피 방식입니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: '브런치란 ...을 말합니다' 정의 술어면 통과", () => {
		const r = aeoDefinition001(
			makeCtx({
				bodyText: "브런치란 아침과 점심을 겸한 식사를 말합니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-TARGET-CUSTOMER-001 — 대상 고객 표현('~을 위한', '대상: ~') 요구
// ===========================================================================

describe("AEO-TARGET-CUSTOMER-001: 대상 고객 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '대상포진'/'위한' 무관 substring 매치는 실패", () => {
		// 예전 정규식은 '대상'/'위한' substring 만으로 통과시켰다.
		// '대상포진'의 '대상', 위치 표현 '위' 등 무관 매치는 대상 고객 신호가 아니다.
		const r = aeoTargetCustomer001(
			makeCtx({
				bodyText: "대상포진 예방에 대한 일반 정보를 안내합니다.",
			}),
		);
		expect(r.ruleId).toBe("AEO-TARGET-CUSTOMER-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '입문서를 판매' 처럼 무관 '입문' 매치는 실패", () => {
		const r = aeoTargetCustomer001(
			makeCtx({
				bodyText: "다양한 입문서를 판매하는 서점입니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: '직장인을 위한' 대상 표현이면 통과", () => {
		const r = aeoTargetCustomer001(
			makeCtx({
				bodyText: "바쁜 직장인을 위한 빠른 점심 브런치를 제공합니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: '대상: 초보자' 명시 표현이면 통과", () => {
		const r = aeoTargetCustomer001(
			makeCtx({
				bodyText: "수강 대상: 커피를 처음 접하는 초보자도 환영합니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: '초보자도 쉽게' 대상 고객 안내면 통과", () => {
		const r = aeoTargetCustomer001(
			makeCtx({
				bodyText: "초보자도 쉽게 즐길 수 있도록 친절히 안내해 드립니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});
