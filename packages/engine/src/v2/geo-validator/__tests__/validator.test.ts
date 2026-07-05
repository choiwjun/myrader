/**
 * v2/geo-validator — 분석 유틸리티 단위 테스트
 *
 * analyzeCitation, computeMetrics, extractDomain 검증.
 */

import { describe, expect, it } from "vitest";
import { RECOMMENDED_BUSINESSES_MARKER } from "../prompt-templates.js";
import type { GeoCitation, GeoQuery, GeoValidationInput } from "../types.js";
import {
	aggregateRecommendedCompetitors,
	analyzeCitation,
	computeMetrics,
	extractDomain,
	parseRecommendedBusinesses,
} from "../validator.js";

const baseInput: GeoValidationInput = {
	url: "https://test-cafe.kr",
	businessName: "테스트카페",
	industry: "카페",
	region: "서울 강남",
	targetKeywords: ["핸드드립"],
};

const brandQuery: GeoQuery = {
	query: "테스트카페에 대해 알려줘",
	facet: "brand-mention",
};

const fixedTime = new Date("2025-01-15T12:00:00.000Z");

// ---------------------------------------------------------------------------
// extractDomain
// ---------------------------------------------------------------------------

describe("extractDomain()", () => {
	it("https URL 에서 호스트명을 추출한다", () => {
		expect(extractDomain("https://test-cafe.kr/")).toBe("test-cafe.kr");
	});

	it("www. 접두사를 제거한다", () => {
		expect(extractDomain("https://www.test-cafe.kr")).toBe("test-cafe.kr");
	});

	it("path/query 가 있어도 호스트만 반환한다", () => {
		expect(extractDomain("https://test-cafe.kr/about?ref=1")).toBe(
			"test-cafe.kr",
		);
	});

	it("프로토콜이 없어도 도메인을 추출한다", () => {
		expect(extractDomain("test-cafe.kr/about")).toBe("test-cafe.kr");
	});

	it("빈 문자열은 빈 문자열로 반환", () => {
		expect(extractDomain("")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// analyzeCitation
// ---------------------------------------------------------------------------

describe("analyzeCitation()", () => {
	it("응답에 매장명이 있으면 hasMention=true", () => {
		const citation = analyzeCitation(
			brandQuery,
			"테스트카페는 강남에 위치한 카페입니다.",
			baseInput,
			fixedTime,
		);
		expect(citation.hasMention).toBe(true);
	});

	it("응답에 매장명이 없으면 hasMention=false", () => {
		const citation = analyzeCitation(
			brandQuery,
			"강남에는 좋은 카페가 많습니다.",
			baseInput,
			fixedTime,
		);
		expect(citation.hasMention).toBe(false);
	});

	it("응답에 도메인이 있으면 hasUrl=true", () => {
		const citation = analyzeCitation(
			brandQuery,
			"자세한 정보는 test-cafe.kr 에서 확인하세요.",
			baseInput,
			fixedTime,
		);
		expect(citation.hasUrl).toBe(true);
	});

	it("응답에 도메인이 없으면 hasUrl=false", () => {
		const citation = analyzeCitation(
			brandQuery,
			"테스트카페는 좋은 곳입니다.",
			baseInput,
			fixedTime,
		);
		expect(citation.hasUrl).toBe(false);
	});

	it("'매장명+조사' 패턴을 직접 인용으로 인식한다", () => {
		const citation = analyzeCitation(
			brandQuery,
			"테스트카페는 강남에 있고, 테스트카페에서는 핸드드립을 합니다.",
			baseInput,
			fixedTime,
		);
		expect(citation.isDirectMention).toBe(true);
	});

	it("매장명만 있고 조사가 없으면 isDirectMention=false", () => {
		// 매장명 단독 언급(예: 목록형) — 조사 패턴이 없어야 false
		const citation = analyzeCitation(
			brandQuery,
			"강남 인기 카페: 테스트카페, 다른카페, 또다른카페.",
			baseInput,
			fixedTime,
		);
		expect(citation.hasMention).toBe(true);
		expect(citation.isDirectMention).toBe(false);
	});

	it("응답에서 경쟁사 매장을 추출한다 (자기 매장 제외)", () => {
		const citation = analyzeCitation(
			brandQuery,
			"강남 인기 카페로 스타벅스 카페, 투썸 카페, 메가 카페가 있고 테스트카페도 인기입니다.",
			baseInput,
			fixedTime,
		);
		expect(citation.mentionedCompetitors.length).toBeGreaterThan(0);
		expect(citation.mentionedCompetitors).not.toContain("테스트카페");
		expect(citation.mentionedCompetitors).toEqual(
			expect.arrayContaining(["스타벅스", "투썸", "메가"]),
		);
	});

	it("응답은 최대 2000자까지만 저장한다", () => {
		const longResponse = "가".repeat(3000);
		const citation = analyzeCitation(
			brandQuery,
			longResponse,
			baseInput,
			fixedTime,
		);
		expect(citation.llmResponse.length).toBe(2000);
	});

	it("query/facet/measuredAt 이 모두 반영된다", () => {
		const citation = analyzeCitation(
			brandQuery,
			"응답입니다.",
			baseInput,
			fixedTime,
		);
		expect(citation.query).toBe(brandQuery.query);
		expect(citation.facet).toBe("brand-mention");
		expect(citation.measuredAt).toBe(fixedTime.toISOString());
	});

	it("빈 응답이어도 안전하게 분석한다", () => {
		const citation = analyzeCitation(brandQuery, "", baseInput, fixedTime);
		expect(citation.hasMention).toBe(false);
		expect(citation.hasUrl).toBe(false);
		expect(citation.isDirectMention).toBe(false);
		expect(citation.mentionedCompetitors).toEqual([]);
	});

	it("경쟁사 추출 시 중복을 제거하고 최대 10개로 제한한다", () => {
		const repeated = Array.from({ length: 20 })
			.map((_, i) => `매장${String.fromCharCode(0xac00 + i)} 카페`)
			.join(", ");
		const citation = analyzeCitation(
			brandQuery,
			`${repeated} 스타벅스 카페 스타벅스 카페`,
			baseInput,
			fixedTime,
		);
		expect(citation.mentionedCompetitors.length).toBeLessThanOrEqual(10);
		// 중복 제거 확인
		const set = new Set(citation.mentionedCompetitors);
		expect(set.size).toBe(citation.mentionedCompetitors.length);
	});

	it("기본(grounded 미지정)은 recommendedBusinesses 가 빈 배열이다 (정직성)", () => {
		const response = `${RECOMMENDED_BUSINESSES_MARKER}\n1. 스타벅스 강남점\n2. 투썸 역삼점`;
		const citation = analyzeCitation(brandQuery, response, baseInput, fixedTime);
		// grounded=false (기본) → 구조화 블록이 있어도 추출하지 않음
		expect(citation.recommendedBusinesses).toEqual([]);
	});

	it("grounded=true 면 구조화 블록에서 추천 업체를 결정적으로 추출한다", () => {
		const response = `강남 카페 추천드려요.\n${RECOMMENDED_BUSINESSES_MARKER}\n1. 스타벅스 강남점\n2. 투썸 역삼점`;
		const citation = analyzeCitation(
			brandQuery,
			response,
			baseInput,
			fixedTime,
			true,
		);
		expect(citation.recommendedBusinesses).toEqual([
			"스타벅스 강남점",
			"투썸 역삼점",
		]);
	});

	it("grounded=true 라도 구조화 마커가 없으면 빈 배열 (이름 생략 > 틀린 이름)", () => {
		const response = "강남 인기 카페로 스타벅스 카페, 투썸 카페가 있습니다.";
		const citation = analyzeCitation(
			brandQuery,
			response,
			baseInput,
			fixedTime,
			true,
		);
		// 정규식 휴리스틱(mentionedCompetitors)에는 잡혀도, 구조화 추출은 빈 배열
		expect(citation.recommendedBusinesses).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// parseRecommendedBusinesses (정직성 — 결정적 구조화 추출)
// ---------------------------------------------------------------------------

describe("parseRecommendedBusinesses()", () => {
	it("마커 + 번호목록에서 업체명을 순서대로 추출한다", () => {
		const response = [
			"강남 카페 추천:",
			RECOMMENDED_BUSINESSES_MARKER,
			"1. 스타벅스 강남점",
			"2. 투썸플레이스 역삼점",
			"3. 블루보틀 삼성점",
		].join("\n");
		expect(parseRecommendedBusinesses(response, "테스트카페")).toEqual([
			"스타벅스 강남점",
			"투썸플레이스 역삼점",
			"블루보틀 삼성점",
		]);
	});

	it("마커가 없으면 빈 배열 (파싱 실패 → 이름 생략)", () => {
		const response = "1. 스타벅스 강남점\n2. 투썸 역삼점";
		expect(parseRecommendedBusinesses(response, "테스트카페")).toEqual([]);
	});

	it("자기 업체는 추출 결과에서 제외한다", () => {
		const response = `${RECOMMENDED_BUSINESSES_MARKER}\n1. 스타벅스 강남점\n2. 테스트카페\n3. 투썸 역삼점`;
		const result = parseRecommendedBusinesses(response, "테스트카페");
		expect(result).not.toContain("테스트카페");
		expect(result).toEqual(["스타벅스 강남점", "투썸 역삼점"]);
	});

	it("'없음' 류 빈 목록은 빈 배열로 처리한다", () => {
		const response = `${RECOMMENDED_BUSINESSES_MARKER}\n1. 없음`;
		expect(parseRecommendedBusinesses(response, "테스트카페")).toEqual([]);
	});

	it("괄호 부가설명/마크다운 볼드는 결정적으로 제거한다", () => {
		const response = `${RECOMMENDED_BUSINESSES_MARKER}\n1. **스타벅스 강남점** (프리미엄)\n2. 투썸 역삼점 - 디저트 강점`;
		expect(parseRecommendedBusinesses(response, "테스트카페")).toEqual([
			"스타벅스 강남점",
			"투썸 역삼점",
		]);
	});

	it("번호목록이 끝나고 산문이 시작되면 멈춘다", () => {
		const response = [
			RECOMMENDED_BUSINESSES_MARKER,
			"1. 스타벅스 강남점",
			"2. 투썸 역삼점",
			"이 업체들이 가장 인기가 많습니다.",
			"3. 이건무시되어야함",
		].join("\n");
		expect(parseRecommendedBusinesses(response, "테스트카페")).toEqual([
			"스타벅스 강남점",
			"투썸 역삼점",
		]);
	});

	it("중복을 제거하고 최대 10개로 제한한다", () => {
		const lines = [RECOMMENDED_BUSINESSES_MARKER];
		for (let i = 0; i < 15; i++) lines.push(`${i + 1}. 업체${i % 12}`);
		const result = parseRecommendedBusinesses(lines.join("\n"), "테스트카페");
		expect(result.length).toBeLessThanOrEqual(10);
		expect(new Set(result).size).toBe(result.length);
	});

	it("빈/비문자열 응답은 빈 배열", () => {
		expect(parseRecommendedBusinesses("", "X")).toEqual([]);
		// @ts-expect-error 런타임 방어 검증
		expect(parseRecommendedBusinesses(null, "X")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// aggregateRecommendedCompetitors (빈도 집계 — 정직성 경로만)
// ---------------------------------------------------------------------------

describe("aggregateRecommendedCompetitors()", () => {
	it("업체별 등장 질의 수를 집계하고 빈도순 정렬한다", () => {
		const citations = [
			{ query: "Q1", recommendedBusinesses: ["스타벅스", "투썸"] },
			{ query: "Q2", recommendedBusinesses: ["스타벅스", "메가"] },
			{ query: "Q3", recommendedBusinesses: ["스타벅스"] },
		];
		const result = aggregateRecommendedCompetitors(citations);
		expect(result[0]).toEqual({
			name: "스타벅스",
			mentionedInQueries: 3,
			sampleQuery: "Q1",
		});
		// 투썸/메가는 각 1회 — 삽입 순서로 동률 정렬
		expect(result.map((r) => r.name)).toEqual(["스타벅스", "투썸", "메가"]);
	});

	it("같은 citation 내 중복은 질의 1건으로만 센다", () => {
		const citations = [
			{ query: "Q1", recommendedBusinesses: ["스타벅스", "스타벅스"] },
		];
		const result = aggregateRecommendedCompetitors(citations);
		expect(result).toEqual([
			{ name: "스타벅스", mentionedInQueries: 1, sampleQuery: "Q1" },
		]);
	});

	it("limit 으로 top N 만 반환한다", () => {
		const citations = [
			{ query: "Q1", recommendedBusinesses: ["A", "B", "C", "D"] },
			{ query: "Q2", recommendedBusinesses: ["A", "B", "C"] },
			{ query: "Q3", recommendedBusinesses: ["A", "B"] },
			{ query: "Q4", recommendedBusinesses: ["A"] },
		];
		const result = aggregateRecommendedCompetitors(citations, 2);
		expect(result).toHaveLength(2);
		expect(result.map((r) => r.name)).toEqual(["A", "B"]);
	});

	it("추천 업체가 없으면 빈 배열", () => {
		const citations = [
			{ query: "Q1", recommendedBusinesses: [] },
			{ query: "Q2", recommendedBusinesses: [] },
		];
		expect(aggregateRecommendedCompetitors(citations)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// computeMetrics
// ---------------------------------------------------------------------------

function makeCitation(overrides: Partial<GeoCitation> = {}): GeoCitation {
	return {
		query: "Q",
		facet: "brand-mention",
		llmResponse: "",
		hasMention: false,
		hasUrl: false,
		isDirectMention: false,
		mentionedCompetitors: [],
		recommendedBusinesses: [],
		measuredAt: fixedTime.toISOString(),
		...overrides,
	};
}

describe("computeMetrics()", () => {
	it("빈 배열이면 모든 메트릭이 0", () => {
		const metrics = computeMetrics([]);
		expect(metrics).toEqual({
			mentionRate: 0,
			urlRate: 0,
			directMentionRate: 0,
			competitorCount: 0,
		});
	});

	it("절반이 매장명을 언급하면 mentionRate=0.5", () => {
		const citations = [
			makeCitation({ hasMention: true }),
			makeCitation({ hasMention: false }),
		];
		expect(computeMetrics(citations).mentionRate).toBe(0.5);
	});

	it("모두 직접 인용이면 directMentionRate=1", () => {
		const citations = [
			makeCitation({ isDirectMention: true }),
			makeCitation({ isDirectMention: true }),
		];
		expect(computeMetrics(citations).directMentionRate).toBe(1);
	});

	it("경쟁사 평균 개수를 계산한다", () => {
		const citations = [
			makeCitation({ mentionedCompetitors: ["a", "b", "c"] }),
			makeCitation({ mentionedCompetitors: ["d"] }),
		];
		// (3+1)/2 = 2
		expect(computeMetrics(citations).competitorCount).toBe(2);
	});

	it("hasUrl 비율을 계산한다", () => {
		const citations = [
			makeCitation({ hasUrl: true }),
			makeCitation({ hasUrl: false }),
			makeCitation({ hasUrl: false }),
			makeCitation({ hasUrl: false }),
		];
		expect(computeMetrics(citations).urlRate).toBe(0.25);
	});
});
