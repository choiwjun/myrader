/**
 * X-SAG Core Engine — Phase 1 점수 안정성(SCORE-STABILITY) 검증
 *
 * 목적: 룰 의미화(semantic migration) 이후 사이트 등급의 pass/fail 이동이
 *   **의도된 정밀도 향상**인지, 아니면 우연한 회귀/중립성 파괴인지 확정한다.
 *
 * before/after 를 한 트리에서 동시에 돌릴 수 없으므로(after 만 존재),
 * 의도된 결과를 직접 ASSERT 한다:
 *   - 예시/placeholder/비정상 데이터 fixture → 해당 의미화 룰 FAIL
 *   - 실제 schema/유효 데이터 fixture        → 해당 룰 PASS
 *   - 정상(legit) 사이트                     → 의미화 전후 동일 (기대 pass 집합 유지)
 *
 * 추가로 카테고리 누수 금지(GEO/AEO/SEO 결과는 자기 카테고리만)와
 * NLP 룰의 점수 중립성(nlpResult 부재 시 passed=true)을 룰 레벨에서 고정한다.
 *
 * 본 테스트는 결정적이다(POLICY § 7.1): 동일 fixture → 동일 결과, LLM 호출 없음.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import { analyzeAEO } from "../../aeo.js";
import { analyzeGEO } from "../../geo.js";
import { analyzeSEO } from "../../seo.js";
import type { BusinessProfile, RuleContext } from "../../types.js";

import {
	geoBusinessHoursDetail001,
	geoLocalBusinessSchema001,
} from "../geo-rules.js";
import { seoOg001 } from "../seo-rules.js";
import { aeoAnswerLength001, aeoScannable001 } from "../aeo-rules.js";
import { AEO_RULES, GEO_RULES, NLP_RULES, SEO_RULES } from "../index.js";

// ---------------------------------------------------------------------------
// Fixtures — 대표 ParsedPage 클래스 (gap1/phase-o-d 헬퍼 스타일과 동일)
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE: BusinessProfile = {
	businessName: "르카페",
	industry: "카페",
	region: "강남",
	mainServices: ["핸드드립", "원두"],
	targetKeywords: ["강남 카페", "핸드드립"],
};

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://lecafe.example.kr/",
		statusCode: 200,
		title: "르카페 | 강남 핸드드립 카페",
		description: "강남역 핸드드립 카페 르카페입니다.",
		h1: "르카페 - 강남 핸드드립",
		h2: ["메뉴 안내", "오시는 길"],
		meta: {
			viewport: "width=device-width, initial-scale=1",
			description: "강남역 핸드드립 카페 르카페입니다.",
		},
		bodyText: "르카페에 오신 것을 환영합니다.",
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
	page: ParsedPage,
	profile: BusinessProfile = DEFAULT_PROFILE,
	extraPages: ParsedPage[] = [],
): RuleContext {
	return {
		pages: [page, ...extraPages],
		mainPage: page,
		businessProfile: profile,
	};
}

// ---------------------------------------------------------------------------
// Fixture 본문 텍스트 (재사용)
// ---------------------------------------------------------------------------

/** 정상 카페: NAP·영업시간(요일별)·연락처·답변 문장 모두 충족하는 본문. */
const LEGIT_CAFE_BODY = [
	"르카페는 강남역 3번 출구에서 도보 5분 거리에 위치한 핸드드립 전문 카페입니다.",
	"매일 아침 직접 로스팅한 신선한 원두로 한 잔씩 정성껏 커피를 내려 드리고 있습니다.",
	"단체 모임과 스터디룸 예약도 가능하니 편하게 문의해 주시면 친절히 안내해 드리겠습니다.",
	"영업시간은 평일 09:00-21:00, 토요일 10:00-18:00 이며 일요일은 휴무입니다.",
	"주소: 서울시 강남구 테헤란로 123, 전화: 02-123-4567, 사업자번호 123-45-67890.",
].join("\n\n");

// ===========================================================================
// 1) 실제 schema vs 빈/최소 schema — GEO-LOCAL-BUSINESS-SCHEMA-001
// ===========================================================================

describe("점수 안정성 #1: LocalBusiness schema 의미화 (빈 스키마 FAIL, 실제 스키마 PASS)", () => {
	it("실제 cafe schema(@type+name+telephone)는 PASS — 정상 사이트 영향 없음", () => {
		const r = geoLocalBusinessSchema001(
			makeCtx(
				makePage({
					schemaJsonLd: [
						{
							"@type": "CafeOrCoffeeShop",
							name: "르카페",
							telephone: "02-123-4567",
							address: {
								"@type": "PostalAddress",
								streetAddress: "테헤란로 123",
							},
						},
					],
				}),
			),
		);
		expect(r.ruleId).toBe("GEO-LOCAL-BUSINESS-SCHEMA-001");
		expect(r.passed).toBe(true);
	});

	it("빈 껍데기 schema(@type만)는 FAIL — 의도된 정밀도 향상 (껍데기→탈락)", () => {
		const r = geoLocalBusinessSchema001(
			makeCtx(makePage({ schemaJsonLd: [{ "@type": "LocalBusiness" }] })),
		);
		// 의미화 이전(naive @type 매칭)이라면 PASS 했을 입력이 이제 FAIL 한다.
		expect(r.passed).toBe(false);
	});

	it("name 만 있고 주소/전화 없는 placeholder schema 도 FAIL", () => {
		const r = geoLocalBusinessSchema001(
			makeCtx(
				makePage({
					schemaJsonLd: [{ "@type": "LocalBusiness", name: "예시 업체명" }],
				}),
			),
		);
		expect(r.passed).toBe(false);
	});
});

// ===========================================================================
// 2) placeholder OG 텍스트 — SEO-OG-001
// ===========================================================================

describe("점수 안정성 #2: SEO-OG-001 placeholder 의미화 (예시 og 값 미카운트)", () => {
	it("실제 og 값 3개 이상이면 PASS — 정상 사이트 영향 없음", () => {
		const r = seoOg001(
			makeCtx(
				makePage({
					meta: {
						"og:title": "르카페 | 강남 핸드드립 카페",
						"og:description": "강남역 도보 5분 핸드드립 전문 카페입니다.",
						"og:image": "https://lecafe.example.kr/og.png",
					},
				}),
			),
		);
		expect(r.ruleId).toBe("SEO-OG-001");
		expect(r.passed).toBe(true);
	});

	it("og:title 이 placeholder('제목없음')면 카운트 제외 → FAIL — 의도된 향상", () => {
		const r = seoOg001(
			makeCtx(
				makePage({
					meta: {
						"og:title": "제목없음",
						"og:description": "기본 설명",
						"og:image": "https://lecafe.example.kr/og.png",
					},
				}),
			),
		);
		// title placeholder → 유효 2개만 → count<3 → FAIL.
		expect(r.passed).toBe(false);
	});
});

// ===========================================================================
// 3) 비정상 영업시간 — GEO-BUSINESS-HOURS-DETAIL-001
// ===========================================================================

describe("점수 안정성 #3: 비정상 시간('25:00'·역전 범위) 의미화", () => {
	it("'09:00-25:00' 만 있으면 유효 hours 아님 → passed(=정보부족, 별도 룰 위임)", () => {
		const r = geoBusinessHoursDetail001(
			makeCtx(makePage({ bodyText: "영업시간 09:00-25:00 입니다." })),
		);
		expect(r.ruleId).toBe("GEO-BUSINESS-HOURS-DETAIL-001");
		expect(r.passed).toBe(true);
		expect(r.evidence[0]).toContain("없음");
	});

	it("유효 시간만 있고 요일 구분 없으면 FAIL (회귀 가드)", () => {
		const r = geoBusinessHoursDetail001(
			makeCtx(makePage({ bodyText: "영업시간 09:00-18:00 입니다." })),
		);
		expect(r.passed).toBe(false);
	});

	it("요일별 구분 + 유효 시간이면 PASS — 정상 사이트", () => {
		const r = geoBusinessHoursDetail001(
			makeCtx(
				makePage({
					bodyText: "평일 09:00-18:00, 토요일 10:00-15:00, 일요일 휴무",
				}),
			),
		);
		expect(r.passed).toBe(true);
	});
});

// ===========================================================================
// 4) 문장 분할 정밀도 — AEO-ANSWER-LENGTH-001 / AEO-SCANNABLE-001
//    (example-text-heavy: URL/약어 dot 가 문장 수를 부풀리던 결함)
// ===========================================================================

describe("점수 안정성 #4: 예시 URL/약어 dot 오분할 의미화", () => {
	it("URL/약어 섞인 1문장은 여러 문장으로 쪼개지지 않아 ANSWER-LENGTH FAIL", () => {
		const body =
			"저희 대표 원장 Dr. Lee 가 운영하는 example.com 카페는 강남역 3번 출구 도보 5분 거리에 위치한 핸드드립 전문점입니다";
		const r = aeoAnswerLength001(makeCtx(makePage({ bodyText: body })));
		expect(r.ruleId).toBe("AEO-ANSWER-LENGTH-001");
		expect(r.passed).toBe(false);
	});

	it("실제 40자 이상 문장 3개면 ANSWER-LENGTH PASS — 정상 사이트", () => {
		const r = aeoAnswerLength001(makeCtx(makePage({ bodyText: LEGIT_CAFE_BODY })));
		expect(r.passed).toBe(true);
	});

	it("URL/약어 dot 가 SCANNABLE 문장 수를 부풀리지 않아 PASS", () => {
		const body =
			"저희 카페는 Dr. Lee 와 Smith Inc. 가 공동 운영하며 example.com 에서 예약을 받습니다. " +
			"강남역 도보 5분 거리에 있어 접근성이 매우 좋습니다.";
		const r = aeoScannable001(makeCtx(makePage({ bodyText: body })));
		expect(r.ruleId).toBe("AEO-SCANNABLE-001");
		expect(r.passed).toBe(true);
	});

	it("실제 5문장 단락은 여전히 SCANNABLE FAIL (회귀 가드)", () => {
		const body =
			"첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다. 네 번째 문장입니다. 다섯 번째 문장입니다.";
		const r = aeoScannable001(makeCtx(makePage({ bodyText: body })));
		expect(r.passed).toBe(false);
	});
});

// ===========================================================================
// 5) 전체 fixture 클래스 — analyzer 레벨 의도 결과 직접 ASSERT
//    fixture 클래스: 빈 껍데기 / 예시-텍스트 / NAP불일치 / 정상 / 실제-schema
// ===========================================================================

/** 룰 결과를 ruleId → passed 맵으로 변환. */
function byRule(results: { ruleId: string; passed: boolean }[]) {
	const m = new Map<string, boolean>();
	for (const r of results) m.set(r.ruleId, r.passed);
	return m;
}

describe("점수 안정성 #5: fixture 클래스별 GEO/AEO/SEO 의도 결과", () => {
	// (A) 빈 껍데기 / minimal shell — 거의 모든 룰 FAIL 이어야 한다.
	it("(A) 빈 셸: GEO 핵심 신호 룰이 FAIL 한다 (empty shell = 점수 하단)", () => {
		const ctx = makeCtx(
			makePage({
				title: null,
				h1: null,
				h2: [],
				description: null,
				meta: {},
				bodyText: "",
				wordCount: 0,
				schemaJsonLd: [],
			}),
		);
		const geo = byRule(analyzeGEO(ctx).results);
		expect(geo.get("GEO-LOCAL-BUSINESS-SCHEMA-001")).toBe(false);
		expect(geo.get("GEO-CONTACT-001")).toBe(false);
		expect(geo.get("GEO-PHONE-001")).toBe(false);
		expect(geo.get("GEO-ADDRESS-001")).toBe(false);
		expect(geo.get("GEO-TRUST-001")).toBe(false);
	});

	// (B) 예시-텍스트 heavy — 의미화 룰들이 placeholder/예시를 걸러 FAIL.
	it("(B) 예시-텍스트: placeholder schema/og + 비정상 시간 모두 FAIL", () => {
		const ctx = makeCtx(
			makePage({
				meta: {
					"og:title": "Untitled",
					"og:description": "default",
					"og:image": "https://lecafe.example.kr/og.png",
				},
				bodyText: "영업시간 09:00-25:00. 자세한 내용은 example.com 참고.",
				schemaJsonLd: [{ "@type": "LocalBusiness" }],
			}),
		);
		const geo = byRule(analyzeGEO(ctx).results);
		const seo = byRule(analyzeSEO(ctx).results);
		expect(geo.get("GEO-LOCAL-BUSINESS-SCHEMA-001")).toBe(false);
		expect(geo.get("GEO-BUSINESS-HOURS-DETAIL-001")).toBe(true); // 비정상시간→hours 미인식→정보부족 passed
		expect(seo.get("SEO-OG-001")).toBe(false); // placeholder og 2개 제외 → FAIL
	});

	// (C) NAP 불일치/불완전 — 업체명만 있고 주소·전화 누락 → NAP FAIL.
	it("(C) NAP 불완전: 업체명만 있고 주소/전화 없음 → GEO-NAP FAIL", () => {
		const ctx = makeCtx(
			makePage({
				bodyText: "르카페에 오신 것을 환영합니다. 맛있는 커피를 제공합니다.",
			}),
		);
		const geo = byRule(analyzeGEO(ctx).results);
		expect(geo.get("GEO-NAP-CONSISTENCY-001")).toBe(false);
		expect(geo.get("GEO-PHONE-001")).toBe(false);
		expect(geo.get("GEO-ADDRESS-001")).toBe(false);
	});

	// (D) 정상(legit) 사이트 — NAP·연락처·답변·schema 모두 충족 → 핵심 룰 PASS.
	it("(D) 정상 사이트: NAP/연락처/답변/schema 핵심 룰이 모두 PASS", () => {
		const ctx = makeCtx(
			makePage({
				bodyText: LEGIT_CAFE_BODY,
				schemaJsonLd: [
					{
						"@type": "CafeOrCoffeeShop",
						name: "르카페",
						telephone: "02-123-4567",
						address: {
							"@type": "PostalAddress",
							streetAddress: "서울시 강남구 테헤란로 123",
						},
					},
				],
			}),
		);
		const geo = byRule(analyzeGEO(ctx).results);
		const aeo = byRule(analyzeAEO(ctx).results);
		// GEO 핵심 신호
		expect(geo.get("GEO-LOCAL-BUSINESS-SCHEMA-001")).toBe(true);
		expect(geo.get("GEO-NAP-CONSISTENCY-001")).toBe(true);
		expect(geo.get("GEO-PHONE-001")).toBe(true);
		expect(geo.get("GEO-ADDRESS-001")).toBe(true);
		expect(geo.get("GEO-CONTACT-001")).toBe(true);
		expect(geo.get("GEO-TRUST-001")).toBe(true);
		expect(geo.get("GEO-BUSINESS-HOURS-DETAIL-001")).toBe(true);
		// AEO 답변 분량 (40자 이상 문장 3개+)
		expect(aeo.get("AEO-ANSWER-LENGTH-001")).toBe(true);
	});

	// (E) 실제-schema cafe — schema 기반 GEO 룰들이 PASS.
	it("(E) 실제 schema cafe: LocalBusiness/Location/ReviewAggregate schema PASS", () => {
		const ctx = makeCtx(
			makePage({
				bodyText: LEGIT_CAFE_BODY,
				schemaJsonLd: [
					{
						"@type": "CafeOrCoffeeShop",
						name: "르카페",
						telephone: "02-123-4567",
						address: {
							"@type": "PostalAddress",
							streetAddress: "테헤란로 123",
						},
						aggregateRating: {
							"@type": "AggregateRating",
							ratingValue: "4.8",
							reviewCount: "120",
						},
					},
				],
			}),
		);
		const geo = byRule(analyzeGEO(ctx).results);
		expect(geo.get("GEO-LOCAL-BUSINESS-SCHEMA-001")).toBe(true);
		expect(geo.get("GEO-LOCATION-SCHEMA-001")).toBe(true);
		expect(geo.get("GEO-REVIEW-AGGREGATE-001")).toBe(true);
	});
});

// ===========================================================================
// 6) 카테고리 누수 금지 — 의미화 후에도 카테고리 경계 유지
// ===========================================================================

describe("점수 안정성 #6: 카테고리 누수 금지 (GEO/AEO/SEO 자기 카테고리만)", () => {
	const ctx = makeCtx(makePage({ bodyText: LEGIT_CAFE_BODY }));

	it("analyzeGEO 결과는 전부 category='geo' (NLP-seo/aeo 누수 없음)", () => {
		const results = analyzeGEO(ctx).results;
		expect(results.length).toBe(GEO_RULES.length);
		expect(results.every((r) => r.category === "geo")).toBe(true);
	});

	it("analyzeSEO 결과는 전부 category='seo' (NLP-seo 포함하되 seo 라벨)", () => {
		const results = analyzeSEO(ctx).results;
		expect(results.length).toBe(SEO_RULES.length);
		expect(results.every((r) => r.category === "seo")).toBe(true);
	});

	it("analyzeAEO 결과는 전부 category='aeo' (NLP-aeo 포함하되 aeo 라벨)", () => {
		const results = analyzeAEO(ctx).results;
		expect(results.length).toBe(AEO_RULES.length);
		expect(results.every((r) => r.category === "aeo")).toBe(true);
	});

	it("ruleId 중복 없음 — 한 카테고리 내 동일 ruleId 가 두 번 나오지 않는다", () => {
		for (const analyze of [analyzeGEO, analyzeSEO, analyzeAEO]) {
			const ids = analyze(ctx).results.map((r) => r.ruleId);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});
});

// ===========================================================================
// 7) NLP 점수 중립성 — nlpResult 부재 시 모든 NLP 룰 passed=true (0 차감)
// ===========================================================================

describe("점수 안정성 #7: NLP 룰 점수 중립성 (nlpResult 부재 → passed=true)", () => {
	it("nlpResult 없으면 8개 NLP 룰이 전부 passed=true → 차감 0 (score-neutral)", () => {
		// 빈 본문이라도(=NLP 실패 유발 입력) nlpResult 가 주입되지 않으면 룰은 정보부족으로 통과.
		const ctx = makeCtx(makePage({ bodyText: "", wordCount: 0 }));
		expect(ctx.nlpResult).toBeUndefined();
		for (const rule of NLP_RULES) {
			const r = rule(ctx);
			expect(r.passed, `${r.ruleId} must pass when nlpResult absent`).toBe(true);
		}
	});

	it("NLP 룰은 category 가 seo|aeo 뿐 (geo 누수 없음)", () => {
		const ctx = makeCtx(makePage({ bodyText: LEGIT_CAFE_BODY }));
		for (const rule of NLP_RULES) {
			const r = rule(ctx);
			expect(["seo", "aeo"]).toContain(r.category);
		}
	});
});

// ===========================================================================
// 8) 결정성(reproducibility) — 동일 fixture 2회 실행 시 동일 pass/fail
// ===========================================================================

describe("점수 안정성 #8: 결정성 (동일 입력 → 동일 pass/fail 집합)", () => {
	it("동일 fixture 를 두 번 분석해도 GEO/AEO/SEO pass 집합이 같다", () => {
		const mk = () =>
			makeCtx(
				makePage({
					bodyText: LEGIT_CAFE_BODY,
					schemaJsonLd: [
						{ "@type": "CafeOrCoffeeShop", name: "르카페", telephone: "02-123-4567" },
					],
				}),
			);
		const snap = (ctx: RuleContext) =>
			[analyzeGEO, analyzeSEO, analyzeAEO]
				.flatMap((a) => a(ctx).results)
				.map((r) => `${r.ruleId}:${r.passed ? 1 : 0}`)
				.join("|");
		expect(snap(mk())).toBe(snap(mk()));
	});
});
