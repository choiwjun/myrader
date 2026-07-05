/**
 * X-SAG Core Engine — Phase 4 AEO 정밀화 테스트 (BATCH AEO Phase 4)
 *
 * Phase 3 이관 후에도 카운트/denylist 기반으로 남아 있던 4개 AEO 룰의
 * per-instance 문맥 정밀화. 각 룰마다
 *   - FALSE-POSITIVE 가드: 운영성 숫자(게시글/조회수)·미등재 일반 외부링크·
 *     과거-게시 날짜·수사형 CTA 슬로건 → 이제 올바르게 실패
 *   - FALSE-NEGATIVE 가드: 셀 구분자 분리 날짜·합법 정보형 질문·실적 수치 →
 *     계속 통과
 * 를 검증한다.
 *
 * 대상(precision):
 *   AEO-NUMERIC-FACTS-001 / AEO-CITATION-001 /
 *   AEO-LAST-UPDATED-001 / AEO-HEADING-QUESTION-RATIO-001
 *
 * RuleContext 는 phase3-aeo-semantic.test.ts 스타일을 그대로 따른다.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

import {
	aeoCitation001,
	aeoHeadingQuestionRatio001,
	aeoLastUpdated001,
	aeoNumericFacts001,
} from "../aeo-rules.js";

// ---------------------------------------------------------------------------
// Helpers (phase3-aeo-semantic.test.ts 스타일)
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
// AEO-NUMERIC-FACTS-001 — per-instance 수치-사실 문맥 정밀화
// ===========================================================================

describe("AEO-NUMERIC-FACTS-001: per-instance 수치-사실 문맥 정밀화", () => {
	it("FALSE-POSITIVE: 운영성 수량 + 퍼센트(앵커 없음)는 → 실패", () => {
		// OLD: kind3 '250개'(앵커 미요구) + kind0 '92%' = 2종 → PASS(FP).
		// NEW: '250개' 주변에 FACT_ANCHOR 없음 → kind3 드롭, '92%'만 남아 count=1 → FAIL.
		// (수정 전 룰이라면 passed=true 였던 케이스 — red→green flip 증거)
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText: "전체 250개 항목이 표시됩니다. 영역의 92%가 채워졌습니다.",
			}),
		);
		expect(r.ruleId).toBe("AEO-NUMERIC-FACTS-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 조회수(비-사실 맥락) 수량 + 퍼센트는 → 실패", () => {
		// OLD: kind3 '1,234회' + kind0 '32%' = 2종 → PASS(FP).
		// NEW: '조회수'는 NON_FACT_CONTEXT → kind3 드롭, '32%'만 남아 count=1 → FAIL.
		// 퍼센트 절(32%)에는 NON_FACT/부정 토큰을 두지 않아 kind0 는 살아남고,
		// FAIL 이 kind3 드롭에서 비롯됨을 보장한다.
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText: "조회수 1,234회 기록 중입니다. 그리고 32% 영역이 표시됩니다.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 게시글 수·조회수 같은 운영성 숫자만 있으면 → 실패", () => {
		// 게시글/조회수/댓글은 비-사실 맥락, '2024년'은 isYearLike 로 제외 → 의미 1종 미만.
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText:
					"게시글 1,234개 · 조회수 5,678회 · 댓글 12건. 2024년 공지사항 목록입니다. 다음 페이지로 이동하세요.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 메뉴 가짓수 나열 + 푸터 저작권 연도만 있으면 → 실패", () => {
		// '카테고리 5개'·'태그 3개'는 사실 앵커가 인접하지 않고, '© 2025'는 연도 → 부족.
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText:
					"카테고리 5개 · 태그 3개 · 목록 8건. © 2025 르시그널. All rights reserved.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: '10년 경력' + '만족도 95%' 통계 수치 2종이면 통과(회귀)", () => {
		// '경력'(앵커)·'만족도'(앵커) 가 각 숫자에 인접 → 의미 인스턴스 2종.
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText:
					"10년 경력의 바리스타가 운영하며 고객 만족도 95%를 기록하고 있습니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: '커트 25,000원' 가격 + '월 200명 이용' 수량이면 통과(회귀)", () => {
		// '25,000원'(가격 kind2)·'200명'(수량 kind3 — '고객'/'이용' 앵커 인접) → 2종.
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText: "커트는 25,000원이며 월 200명의 고객이 이용하고 있습니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("FALSE-NEGATIVE GUARD: 같은 모호 단위라도 실적 앵커가 있으면 통과", () => {
		// '1,200명'(kind3)에 '방문'/'누적' 앵커 인접, '96%'(kind0) → 2종 → 통과.
		const r = aeoNumericFacts001(
			makeCtx({
				bodyText: "누적 1,200명이 방문했고 만족도 96%입니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-CITATION-001 — 미등재 일반 외부 링크 FP 정밀화 (allowlist/경로신호 승격)
// ===========================================================================

describe("AEO-CITATION-001: 미등재 일반 외부 링크 FP 정밀화", () => {
	it("FALSE-POSITIVE: 미등재 니치 파트너 도메인 링크 1개만(본문 인용 표지 없음) → 실패", () => {
		// 예전 룰은 NON_CITATION_HOST denylist 만 봐서, 미등재 일반 외부 링크
		// 1개(파트너사·가족사이트)만 있어도 '출처성 링크'로 새어들어 통과했다.
		const r = aeoCitation001(
			makeCtx({
				bodyText:
					"저희와 함께하는 협력사를 소개합니다. 자세한 내용은 홈페이지를 참고하세요.",
				externalLinks: ["https://partner-company.co.kr/about"],
			}),
		);
		expect(r.ruleId).toBe("AEO-CITATION-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 미등재 가족사이트 + SNS 링크 조합(인용 표지 없음) → 실패", () => {
		const r = aeoCitation001(
			makeCtx({
				externalLinks: [
					"https://instagram.com/lesignal",
					"https://our-family-store.com/",
				],
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE(회귀): 공공 통계 allowlist 도메인 링크는 인용 표지 없어도 통과", () => {
		// 베어 호스트(www 없는) kosis.kr 도 allowlist suffix 매칭으로 통과해야 한다.
		const r = aeoCitation001(
			makeCtx({
				externalLinks: ["https://kosis.kr/statHtml/coffee"],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE(회귀): kati.net/report 경로 신호 링크는 그대로 통과", () => {
		// .net 이라 allowlist 도메인 매칭이 아니어도 경로의 'report' 출처 신호로 인정.
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

	it("TRUE-POSITIVE(회귀): 본문 '출처:' 표기가 있으면 링크가 미등재여도 통과", () => {
		const r = aeoCitation001(
			makeCtx({
				bodyText: "커피 소비량이 증가했습니다. (출처: 한국농수산식품유통공사)",
				externalLinks: ["https://partner-company.co.kr/about"],
			}),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// AEO-LAST-UPDATED-001 — 테이블/구분자 분리 날짜 시맨틱 보강
// ===========================================================================

describe("AEO-LAST-UPDATED-001: 테이블/구분자 분리 날짜 시맨틱 보강", () => {
	// --- 이번 수정으로 새로 "올바르게 통과"하게 되는 false-negative 보강 케이스 ---
	it("FN-FIX: '최종 수정 | 2025-01-10' 셀 구분자(|)로 분리돼도 통과", () => {
		// 종전 룰은 라벨↔날짜 인접만 인정 → 파이프/셀 경계로 분리되면 누락(FN).
		const r = aeoLastUpdated001(
			makeCtx({
				bodyText: "문서 정보\n최종 수정 | 2025-01-10\n작성자 | 홍길동",
			}),
		);
		expect(r.ruleId).toBe("AEO-LAST-UPDATED-001");
		expect(r.passed).toBe(true);
	});

	it("FN-FIX: '수정일\\t2025.01.10' 탭/점 구분 날짜도 통과", () => {
		const r = aeoLastUpdated001(
			makeCtx({
				bodyText: "수정일\t2025.01.10\n버전\t1.2",
			}),
		);
		expect(r.passed).toBe(true);
	});

	// --- 과교정 방지: 과거-게시 연도를 갱신으로 오인하면 안 됨(올바르게 실패) ---
	it("FALSE-POSITIVE: '2021년 1월 창업' 과거 게시/창업 날짜는 갱신 아님 → 실패", () => {
		// 라벨 가드를 느슨하게만 풀면 과거-게시 날짜를 갱신으로 오인할 위험 →
		// PAST_PUBLISH_PATTERN 가드로 차단함을 검증.
		const r = aeoLastUpdated001(
			makeCtx({
				bodyText:
					"저희 매장은 2021년 1월 창업했습니다. 오래도록 사랑받고 있어요.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: '수정일 입력 | 2025-01-01' 폼 라벨 맥락은 → 실패", () => {
		// 셀 분리를 허용해도 form-label('입력') 가드는 유지돼야 한다.
		const r = aeoLastUpdated001(
			makeCtx({
				bodyText: "수정일 입력 | 2025-01-01 형식으로 작성해 주세요.",
			}),
		);
		expect(r.passed).toBe(false);
	});

	// --- 기존 통과 케이스가 여전히 통과하는 TP 회귀 가드 ---
	it("TP-REGRESSION: '이 페이지의 최종 수정: 2025-03-01' 인접 라벨 날짜 여전히 통과", () => {
		const r = aeoLastUpdated001(
			makeCtx({
				bodyText: "이 페이지의 최종 수정: 2025-03-01 입니다.",
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TP-REGRESSION: copyright(© 2025)만 있으면 여전히 실패", () => {
		const r = aeoLastUpdated001(
			makeCtx({
				bodyText: "© 2025 르시그널. All rights reserved.",
			}),
		);
		expect(r.passed).toBe(false);
	});
});

// ===========================================================================
// AEO-HEADING-QUESTION-RATIO-001 — 수사형 CTA 슬로건 분자 제외 정밀화
// ===========================================================================

describe("AEO-HEADING-QUESTION-RATIO-001: 수사형 CTA 슬로건 분자 제외", () => {
	it("FALSE-POSITIVE: 물음표 CTA 슬로건만 있으면 정보형 질문 아님 → 실패", () => {
		// '준비되셨나요?'/'함께하실래요?' 는 물음표가 있어 isQuestionHeading 은 통과하지만
		// 답을 제공하는 정보형 질문이 아니다. 예전엔 100% 질문형으로 잘못 통과했다.
		const r = aeoHeadingQuestionRatio001(
			makeCtx({
				h2: ["준비되셨나요?", "함께하실래요?"],
				h3: ["지금 시작할까요?"],
			}),
		);
		expect(r.ruleId).toBe("AEO-HEADING-QUESTION-RATIO-001");
		expect(r.passed).toBe(false);
	});

	it("FALSE-POSITIVE: 정보형 질문 0개 + CTA 2개면 0%로 떨어져 실패", () => {
		// CTA 2개가 분자에서 빠지면 0/3 으로 떨어져 30% 미달.
		const r = aeoHeadingQuestionRatio001(
			makeCtx({
				h2: ["왜 망설이세요?", "함께하실래요?"],
				h3: ["오시는 길"],
			}),
		);
		expect(r.passed).toBe(false);
	});

	it("TRUE-POSITIVE: 실제 정보형 질문 30% 이상이면 그대로 통과(회귀)", () => {
		const r = aeoHeadingQuestionRatio001(
			makeCtx({
				h2: ["가격이 얼마인가요?", "예약은 어떻게 하나요?", "오시는 길"],
			}),
		);
		expect(r.passed).toBe(true);
	});

	it("TRUE-POSITIVE: 짧은 정보형 질문('가격?')은 CTA 가 아니므로 분자 유지(회귀)", () => {
		// CTA 패턴은 정보형 질문(가격/어떻게/얼마/주차)을 건드리지 않는다 → FN 없음.
		const r = aeoHeadingQuestionRatio001(
			makeCtx({
				h2: ["가격?", "주차되나요?", "메뉴 소개"],
			}),
		);
		expect(r.passed).toBe(true);
	});

	// --- FALSE-NEGATIVE 가드: CTA 토큰이 합법 정보형 질문을 깎으면 안 됨 ---
	it("FALSE-NEGATIVE GUARD: '환불을 망설이게 되는 이유는 무엇인가요?' 정보형 질문은 분자 유지", () => {
		// 좁힌 CTA 앵커('아직도 망설이' 등)는 이 합법 FAQ 를 건드리지 않아야 한다.
		const r = aeoHeadingQuestionRatio001(
			makeCtx({
				h2: ["환불을 망설이게 되는 이유는 무엇인가요?", "메뉴 소개"],
			}),
		);
		// 2개 중 1개 질문형 = 50% >= 30% → 통과(질문이 분자에 유지됨).
		expect(r.passed).toBe(true);
	});

	it("FALSE-NEGATIVE GUARD: '운동은 언제 시작할까요?' 정보형 질문은 분자 유지", () => {
		// 좁힌 '함께/지금 시작할까요' 앵커는 일반 '시작할까요?' 질문을 건드리지 않는다.
		const r = aeoHeadingQuestionRatio001(
			makeCtx({
				h2: ["운동은 언제 시작할까요?", "센터 소개"],
			}),
		);
		expect(r.passed).toBe(true);
	});
});
