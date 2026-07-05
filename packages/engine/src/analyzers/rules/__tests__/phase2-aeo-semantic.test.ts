/**
 * X-SAG Core Engine — Phase 2 AEO 시맨틱 마이그레이션 테스트
 *
 * FP-prone AEO 룰들을 bodyText 정규식 → 다층 시맨틱 검증으로 이관한 뒤,
 * 각 룰에 대해
 *   - FALSE-POSITIVE 픽스처: placeholder / negation / copyright / form-label /
 *     tool-credit / example 텍스트 → 이제 올바르게 실패
 *   - TRUE-POSITIVE 픽스처: 실제 schema 신호 또는 실제 본문 신호 → 여전히 통과
 * 를 검증한다.
 *
 * RuleContext 는 extractedEntities 를 채우지 않은 plain 형태로 전달한다.
 * (각 룰이 schema 우선 → extractSentencesAround 본문 컨텍스트로 안전하게 검증)
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	aeoAuthorAttribution001,
	aeoContactDirect001,
	aeoDirectAnswerParagraph001,
	aeoLastUpdated001,
	aeoOrgAnswer001,
	aeoPublisherInfo001,
} from "../aeo-rules.js";

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
		lastModified: null,
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
// AEO-CONTACT-DIRECT-001 — 예시/부정 전화 제거, 실제 전화/카카오 요구
// ===========================================================================

describe("AEO-CONTACT-DIRECT-001: 직접 연락 수단 시맨틱 검증", () => {
	it("FALSE-POSITIVE: placeholder 전화(010-0000-0000)만 있으면 실패", () => {
		const r = aeoContactDirect001(
			makeCtx({
				bodyText:
					"전화번호 입력 예시) 010-0000-0000 형식으로 작성해 주세요.",
			}),
		);
		expect(r.ruleId).toBe("AEO-CONTACT-DIRECT-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '전화 대신 이메일' 부정 문맥이면 실패", () => {
		const r = aeoContactDirect001(
			makeCtx({
				bodyText:
					"전화 상담은 제공하지 않습니다. 02-000-0000 같은 번호는 더 이상 사용하지 않습니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 전화번호(지역 부합)면 통과", () => {
		const r = aeoContactDirect001(
			makeCtx({ bodyText: "예약 문의: 02-555-1234 로 연락 주세요." }),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 카카오 채널이면 통과", () => {
		const r = aeoContactDirect001(
			makeCtx({ bodyText: "카카오 오픈채팅으로 편하게 문의 주세요." }),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: schema telephone 이면 본문 없어도 통과", () => {
		const r = aeoContactDirect001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{ "@type": "CafeOrCoffeeShop", name: "르시그널", telephone: "02-555-1234" },
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-ORG-ANSWER-001 — schema Organization name 우선, 경쟁사 bio 거부
// ===========================================================================

describe("AEO-ORG-ANSWER-001: 운영자 시점 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 경쟁사/예시 bio 의 '저희' 만 있으면 실패", () => {
		// '저희' 가 example/placeholder 문맥(소개글 작성 예시)에만 등장 → 실제 운영자 답변 아님.
		const r = aeoOrgAnswer001(
			makeCtx({
				bodyText:
					"소개글 작성 예시: '저희는 ㅇㅇㅇ입니다' 형식으로 입력하세요. 아래는 샘플 텍스트입니다.",
			}),
		);
		expect(r.ruleId).toBe("AEO-ORG-ANSWER-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: schema Organization name 이 업체명과 일치하면 통과", () => {
		const r = aeoOrgAnswer001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [{ "@type": "Organization", name: "르시그널" }],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 실제 본문 운영자 시점 문장이면 통과", () => {
		const r = aeoOrgAnswer001(
			makeCtx({
				bodyText:
					"저희 르시그널은 강남에서 직접 원두를 로스팅하는 브런치 카페를 운영하고 있습니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-AUTHOR-ATTRIBUTION-001 — schema author/Person 우선, tool-credit/form-label 거부
// ===========================================================================

describe("AEO-AUTHOR-ATTRIBUTION-001: 작성자 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 'by GPT' 도구 크레딧만 있으면 실패", () => {
		const r = aeoAuthorAttribution001(
			makeCtx({
				bodyText: "이 글은 by GPT 로 자동 생성되었습니다. by ChatGPT.",
			}),
		);
		expect(r.ruleId).toBe("AEO-AUTHOR-ATTRIBUTION-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '작성자' form-label(입력란)만 있으면 실패", () => {
		const r = aeoAuthorAttribution001(
			makeCtx({
				bodyText: "댓글 작성자 이름을 입력하세요. 작성자: (입력란)",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: schema author 면 통과", () => {
		const r = aeoAuthorAttribution001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{
						"@type": "Article",
						author: { "@type": "Person", name: "홍길동" },
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 실제 본문 작성자 표기(작성자: 홍길동 대표)면 통과", () => {
		const r = aeoAuthorAttribution001(
			makeCtx({
				bodyText:
					"이 안내는 르시그널을 직접 운영하는 작성자 홍길동 대표가 정리했습니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-LAST-UPDATED-001 — schema dateModified / meta 우선, copyright/form-label 거부
// ===========================================================================

describe("AEO-LAST-UPDATED-001: 마지막 업데이트 시맨틱 검증", () => {
	it("FALSE-POSITIVE: copyright(© 2025)만 있으면 실패", () => {
		const r = aeoLastUpdated001(
			makeCtx({
				bodyText: "© 2025 르시그널. All rights reserved.",
			}),
		);
		expect(r.ruleId).toBe("AEO-LAST-UPDATED-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '수정일 입력' form-label 만 있으면 실패", () => {
		const r = aeoLastUpdated001(
			makeCtx({
				bodyText: "수정일 입력: 2025-01-01 형식으로 작성해 주세요.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: schema dateModified 면 통과", () => {
		const r = aeoLastUpdated001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{ "@type": "Article", dateModified: "2025-03-01" },
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: meta lastModified 면 통과", () => {
		const r = aeoLastUpdated001(
			makeCtx({ bodyText: "환영합니다.", lastModified: "2025-03-01T00:00:00Z" }),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 본문 '최종 수정: 2025-03-01' 라벨링된 날짜면 통과", () => {
		const r = aeoLastUpdated001(
			makeCtx({
				bodyText: "이 페이지의 최종 수정: 2025-03-01 입니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-PUBLISHER-INFO-001 — schema Organization/publisher 우선, example/form-label reg-number 거부
// ===========================================================================

describe("AEO-PUBLISHER-INFO-001: 발행자 정보 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 'sample 123-45-67890' 예시 사업자번호만 있으면 실패", () => {
		const r = aeoPublisherInfo001(
			makeCtx({
				bodyText:
					"사업자등록번호 입력 예시(sample): 123-45-67890 형식으로 작성하세요.",
			}),
		);
		expect(r.ruleId).toBe("AEO-PUBLISHER-INFO-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '사업자등록번호 입력' form-label 만 있으면 실패", () => {
		const r = aeoPublisherInfo001(
			makeCtx({
				bodyText: "사업자등록번호 입력란: (___-__-_____) 를 채워 주세요.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: schema Organization 이면 통과", () => {
		const r = aeoPublisherInfo001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [{ "@type": "Organization", name: "르시그널" }],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 실제 footer 사업자등록번호면 통과", () => {
		const r = aeoPublisherInfo001(
			makeCtx({
				bodyText:
					"르시그널 | 대표 홍길동 | 사업자등록번호 123-45-67890 | 서울특별시 강남구.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-DIRECT-ANSWER-PARAGRAPH-001 — 실제 본문 단락 요구, placeholder/breadcrumb 거부
// ===========================================================================

describe("AEO-DIRECT-ANSWER-PARAGRAPH-001: 첫 단락 직답형 시맨틱 검증", () => {
	it("FALSE-POSITIVE: breadcrumb 류 짧은 조각만 있으면 실패", () => {
		// 'A > B > C' 형태 내비게이션은 직답형 단락이 아니다.
		const r = aeoDirectAnswerParagraph001(
			makeCtx({
				bodyText: "홈 > 카페 소개 > 브런치 메뉴 > 예약 안내 입니다",
			}),
		);
		expect(r.ruleId).toBe("AEO-DIRECT-ANSWER-PARAGRAPH-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: placeholder 안내문(입력 예시)만 있으면 실패", () => {
		const r = aeoDirectAnswerParagraph001(
			makeCtx({
				bodyText:
					"소개 문구를 입력하세요 예시) '저희는 ㅇㅇㅇ입니다' 형식으로 작성합니다",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 직답형 첫 단락(40~200자 + 정의)이면 통과", () => {
		const r = aeoDirectAnswerParagraph001(
			makeCtx({
				bodyText:
					"르시그널은 강남에 위치한 브런치 카페로, 직접 로스팅한 원두로 핸드드립 커피와 제철 브런치를 제공합니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});
