/**
 * X-SAG Core Engine — Phase 3 AEO 시맨틱 마이그레이션 테스트 (BATCH AEO Phase 3)
 *
 * 아직 얕은(bodyText 단순 매치/raw 카운트) 상태로 남아 있던 AEO 룰을
 * 구조화/문맥 인지 검증으로 이관한 뒤, 각 룰마다
 *   - FALSE-POSITIVE 픽스처: 전화번호/연도/주소 숫자, 답변 없는 수사적 질문,
 *     평서 슬로건 heading, placeholder/breadcrumb 단락, 채용/부정/예시 문맥,
 *     SNS/지도 외부 링크 → 이제 올바르게 실패
 *   - TRUE-POSITIVE 픽스처: 실제 통계 수치, schema FAQPage Q&A, 질문형 heading +
 *     답변, 실제 직답 단락, schema author/Person, 출처 표기/출처성 링크 → 통과
 * 를 검증한다.
 *
 * 대상(migrated):
 *   AEO-NUMERIC-FACTS-001 / AEO-QA-PAIR-MARKUP-001 /
 *   AEO-HEADING-QUESTION-RATIO-001 / AEO-FAQ-COUNT-001 /
 *   AEO-DIRECT-ANSWER-001 / AEO-AUTHOR-SCHEMA-001 /
 *   AEO-CITATION-001 / AEO-LIST-FORMAT-001
 *
 * RuleContext 는 phase25-aeo-semantic.test.ts 스타일을 그대로 따른다.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	aeoAuthorSchema001,
	aeoCitation001,
	aeoDirectAnswer001,
	aeoFaqCount001,
	aeoHeadingQuestionRatio001,
	aeoListFormat001,
	aeoNumericFacts001,
	aeoQaPairMarkup001,
} from "../aeo-rules.js";

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
// AEO-NUMERIC-FACTS-001 — 전화/연도/주소 숫자 제외, 통계/가격 수치만 인정
// ===========================================================================

describe("AEO-NUMERIC-FACTS-001: 수치 사실 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 전화번호+창업연도만 있으면 통계 수치 아님 → 실패", () => {
		// 예전 룰은 '2021년'(연도)·'02-123-4567'(전화)의 숫자도 수치로 세서 통과.
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText:
					"저희는 2021년에 창업했습니다. 문의 전화: 02-123-4567 로 연락 주세요. 1995년 출생.",
			}),
		);
		expect(r.ruleId).toBe("AEO-NUMERIC-FACTS-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 주소 번지 숫자만 있으면 → 실패", () => {
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText:
					"주소: 서울시 강남구 테헤란로 123 4층입니다. 강남대로 45-6 번지에 있습니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: '10년 경력' + '만족도 95%' 통계 수치 2종이면 통과", () => {
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText:
					"10년 경력의 바리스타가 운영하며 고객 만족도 95%를 기록하고 있습니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: '커트 25,000원' 가격 + '월 200명 이용' 수량이면 통과", () => {
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText: "커트는 25,000원이며 월 200명의 고객이 이용하고 있습니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-QA-PAIR-MARKUP-001 — 질문 + 실제 답변 쌍 (schema FAQPage 또는 heading 순서)
// ===========================================================================

describe("AEO-QA-PAIR-MARKUP-001: Q&A 쌍 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 답변 없는 수사적 질문 H2만 있으면 → 실패", () => {
		// 예전 룰은 물음표로 끝나는 H2 존재만으로 통과 → 답변 없는 슬로건도 통과.
		const r = aeoQaPairMarkup001(
			makeCtx({
				h2: ["우리가 왜 다를까요?"],
				headingStructure: [
					{ level: 2, text: "우리가 왜 다를까요?" },
					{ level: 2, text: "지금 예약하시겠어요?" },
				],
				bodyText: "지금 바로 예약하세요.",
			}),
		);
		expect(r.ruleId).toBe("AEO-QA-PAIR-MARKUP-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: schema FAQPage Question+acceptedAnswer 면 통과", () => {
		const r = aeoQaPairMarkup001(
			makeCtx({
				schemaJsonLd: [
					{
						"@type": "FAQPage",
						mainEntity: [
							{
								"@type": "Question",
								name: "가격이 얼마인가요?",
								acceptedAnswer: {
									"@type": "Answer",
									text: "브런치 세트는 18,000원입니다.",
								},
							},
						],
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 질문형 heading 다음에 본문(비-질문) 콘텐츠가 이어지면 통과", () => {
		const r = aeoQaPairMarkup001(
			makeCtx({
				h2: ["가격이 얼마인가요?"],
				headingStructure: [
					{ level: 2, text: "가격이 얼마인가요?" },
					{ level: 2, text: "오시는 길" },
				],
				bodyText:
					"가격이 얼마인가요? 브런치 세트는 18,000원이며 음료가 포함되어 있습니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 마지막 질문 heading 뒤 본문 답변 문장(40자+)이면 통과", () => {
		const r = aeoQaPairMarkup001(
			makeCtx({
				h2: ["메뉴", "예약은 어떻게 하나요?"],
				headingStructure: [
					{ level: 2, text: "메뉴" },
					{ level: 2, text: "예약은 어떻게 하나요?" },
				],
				bodyText:
					"예약은 네이버 예약 또는 전화로 가능하며 방문 하루 전까지 신청하시면 원하는 시간에 자리를 안내해 드립니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-HEADING-QUESTION-RATIO-001 — isQuestionHeading 으로 실제 질문형만 분자 카운트
// ===========================================================================

describe("AEO-HEADING-QUESTION-RATIO-001: 질문형 비율 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '왜 우리인가'/'무엇이든 가능' 평서 heading 은 질문 아님 → 실패", () => {
		// 예전 룰은 '왜'/'무엇' substring 만으로 질문으로 세서 100% 질문형으로 통과.
		const r = aeoHeadingQuestionRatio001(
			makeCtx({
				h2: ["왜 우리인가", "무엇이든 가능"],
				h3: ["어떤 서비스든"],
			}),
		);
		expect(r.ruleId).toBe("AEO-HEADING-QUESTION-RATIO-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 질문형 heading 비율 30% 이상이면 통과", () => {
		const r = aeoHeadingQuestionRatio001(
			makeCtx({
				h2: ["가격이 얼마인가요?", "예약은 어떻게 하나요?", "오시는 길"],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-FAQ-COUNT-001 — schema FAQPage Question 노드 우선, 질문형 heading 폴백
// ===========================================================================

describe("AEO-FAQ-COUNT-001: FAQ 항목 수 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '?'로 안 끝나는 평서 heading 들은 FAQ 항목 아님 → 실패", () => {
		// 예전 폴백은 endsWith('?') 만 봤지만, 핵심 FP는 비-질문 heading 을 FAQ 로
		// 오인하는 것. 평서 heading 5개는 FAQ 항목이 아니다.
		const r = aeoFaqCount001(
			makeCtx({
				h2: ["메뉴 소개", "오시는 길", "주차 안내", "단체 예약", "공지사항"],
				h3: [],
			}),
		);
		expect(r.ruleId).toBe("AEO-FAQ-COUNT-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: schema FAQPage 에 Question 5개면 통과", () => {
		const mk = (q: string) => ({
			"@type": "Question",
			name: q,
			acceptedAnswer: { "@type": "Answer", text: "답변입니다." },
		});
		const r = aeoFaqCount001(
			makeCtx({
				schemaJsonLd: [
					{
						"@type": "FAQPage",
						mainEntity: [
							mk("가격은?"),
							mk("예약 방법은?"),
							mk("주차되나요?"),
							mk("영업시간은?"),
							mk("환불되나요?"),
						],
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 질문형 H2/H3 5개(schema 없음) 폴백이면 통과", () => {
		const r = aeoFaqCount001(
			makeCtx({
				h2: ["가격이 얼마인가요?", "예약은 어떻게 하나요?", "주차되나요?"],
				h3: ["환불 가능한가요?", "영업시간은 언제인가요?"],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-DIRECT-ANSWER-001 — placeholder/breadcrumb 제외, 실제 문장 단락만 직답형
// ===========================================================================

describe("AEO-DIRECT-ANSWER-001: 직답형 단락 시맨틱 검증", () => {
	it("FALSE-POSITIVE: breadcrumb + placeholder 만 있으면 직답형 아님 → 실패", () => {
		// 50~200자 길이만 보던 예전 룰은 breadcrumb/placeholder 조각도 직답으로 셌다.
		const r = aeoDirectAnswer001(
			makeCtx({
				bodyText:
					"홈 > 회사소개 > 인사말 > 연락처 > 오시는 길 > 자주 묻는 질문\n\n소개 문구를 입력하세요. 여기에 내용을 입력하세요. 설명을 입력해 주세요.",
			}),
		);
		expect(r.ruleId).toBe("AEO-DIRECT-ANSWER-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 50~200자 실제 답변 문장 단락 비율 30%+ 면 통과", () => {
		const r = aeoDirectAnswer001(
			makeCtx({
				bodyText:
					"르시그널은 강남에 위치한 브런치 카페로 신선한 재료로 만든 브런치와 직접 내린 핸드드립 커피를 제공합니다.\n\n예약은 네이버 예약 또는 전화로 가능하며 방문 하루 전까지 신청하시면 됩니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-AUTHOR-SCHEMA-001 — schema author/Person 우선, 채용/부정/예시 문맥 제외
// ===========================================================================

describe("AEO-AUTHOR-SCHEMA-001: 작성자/전문가 시맨틱 검증", () => {
	it("FALSE-POSITIVE: '전문가를 모집합니다' 채용공고 문맥은 운영자 소개 아님 → 실패", () => {
		// 예전 룰은 '전문가' substring 만으로 통과.
		const r = aeoAuthorSchema001(
			makeCtx({
				bodyText:
					"함께 일할 디자이너 전문가를 모집합니다. 지원 자격과 채용 공고를 확인하세요.",
			}),
		);
		expect(r.ruleId).toBe("AEO-AUTHOR-SCHEMA-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '예: 대표 홍길동' 예시 placeholder 는 실제 운영자 아님 → 실패", () => {
		const r = aeoAuthorSchema001(
			makeCtx({
				bodyText: "작성 예) 대표 홍길동 처럼 입력하세요.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: schema author/Person 있으면 통과", () => {
		const r = aeoAuthorSchema001(
			makeCtx({
				bodyText: "환영합니다.",
				schemaJsonLd: [
					{
						"@type": "Article",
						headline: "원두 이야기",
						author: { "@type": "Person", name: "김바리" },
					},
				],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 실제 운영자 소개 문장이면 통과", () => {
		const r = aeoAuthorSchema001(
			makeCtx({
				bodyText: "10년 경력의 김바리 대표가 직접 원두를 로스팅합니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-CITATION-001 — 출처 표기/출처성 외부 링크 요구, SNS/지도 링크 제외
// ===========================================================================

describe("AEO-CITATION-001: 외부 출처 인용 시맨틱 검증", () => {
	it("FALSE-POSITIVE: SNS/지도 외부 링크만 있으면 인용 아님 → 실패", () => {
		// 예전 룰은 externalLinks.length >= 1 만으로 통과 → 인스타/지도 링크도 인용.
		const r = aeoCitation001(
			makeCtx({
				externalLinks: [
					"https://instagram.com/lesignal",
					"https://map.naver.com/lesignal",
				],
			}),
		);
		expect(r.ruleId).toBe("AEO-CITATION-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 본문 '출처:' 인용 표기면 통과", () => {
		const r = aeoCitation001(
			makeCtx({
				bodyText: "커피 소비량이 증가했습니다. (출처: 한국농수산식품유통공사)",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 출처성(연구/뉴스) 외부 링크가 있으면 통과", () => {
		const r = aeoCitation001(
			makeCtx({
				externalLinks: [
					"https://instagram.com/lesignal",
					"https://www.kati.net/report/coffee-2025",
				],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-LIST-FORMAT-001 — listTableCount(ul/ol) 우선, 산문 대시/번호 오인 제거
// ===========================================================================

describe("AEO-LIST-FORMAT-001: 목록 형식 시맨틱 검증", () => {
	it("FALSE-POSITIVE: 실제 ul/ol 없음(listTableCount=0) 이면 산문이라도 실패", () => {
		// 예전 폴백 정규식은 '- 5,000원' 줄-시작 대시도 목록으로 오인했다.
		const r = aeoListFormat001(
			makeCtx({
				bodyText: "- 5,000원\n- 추가 요금 없음",
				listTableCount: { ul: 0, ol: 0, table: 0 },
			}),
		);
		expect(r.ruleId).toBe("AEO-LIST-FORMAT-001");
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: listTableCount.ul>=1 이면 통과", () => {
		const r = aeoListFormat001(
			makeCtx({
				bodyText: "서비스 안내",
				listTableCount: { ul: 2, ol: 0, table: 0 },
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 구버전 파서(listTableCount 없음) + 불릿 본문이면 폴백 통과", () => {
		const r = aeoListFormat001(
			makeCtx({
				bodyText: "• 브런치 세트\n• 핸드드립 커피\n• 디저트",
			}),
		);
		expect(r.passed).toBe(true);
	});
});
