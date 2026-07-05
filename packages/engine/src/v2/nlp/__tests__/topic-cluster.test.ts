/**
 * X-SAG Core Engine — TopicClusterAnalyzer tests
 *
 * Phase R-C: 토픽 클러스터링 검증.
 */

import { describe, expect, it } from "vitest";
import { KoreanMorphologyAnalyzer } from "../providers/korean-morphology.js";
import {
	INDUSTRY_TOPICS,
	TopicClusterAnalyzer,
	type TopicInput,
} from "../topic-cluster.js";

function makeAnalyzer(): TopicClusterAnalyzer {
	return new TopicClusterAnalyzer(new KoreanMorphologyAnalyzer());
}

describe("TopicClusterAnalyzer", () => {
	// -------------------------------------------------------------------------
	// 기본 동작
	// -------------------------------------------------------------------------
	describe("basic clustering", () => {
		it("extracts topics from a single page", async () => {
			const analyzer = makeAnalyzer();
			const input: TopicInput = {
				pages: [
					{
						url: "https://example.com/",
						title: "강남 카페 르쿠르",
						bodyText:
							"강남 카페 르쿠르는 다양한 메뉴와 원두 커피를 제공합니다. 메뉴는 시즌마다 바뀝니다. 분위기가 좋은 카페입니다.",
					},
				],
				industry: "카페",
				region: "강남",
				targetKeywords: ["강남 카페"],
			};
			const result = await analyzer.analyze(input);
			expect(result.clusters.length).toBeGreaterThan(0);
			expect(result.source).toBe("rule-based");
		});

		it("returns empty clusters and missing topics for empty pages", async () => {
			const analyzer = makeAnalyzer();
			const result = await analyzer.analyze({
				pages: [],
				industry: "카페",
				region: "강남",
				targetKeywords: [],
			});
			expect(result.clusters).toEqual([]);
			// 카페 industry 의 권장 토픽이 모두 missing
			expect(result.missingTopics.length).toBeGreaterThan(0);
		});

		it("clusters topics across multiple pages", async () => {
			const analyzer = makeAnalyzer();
			const result = await analyzer.analyze({
				pages: [
					{
						url: "https://example.com/menu",
						title: "메뉴",
						bodyText: "원두 커피 라떼 아메리카노 메뉴 가격",
					},
					{
						url: "https://example.com/about",
						title: "소개",
						bodyText: "카페 분위기 인테리어 위치 운영시간",
					},
					{
						url: "https://example.com/location",
						title: "위치",
						bodyText: "주차 위치 교통 강남역",
					},
				],
				industry: "카페",
				region: "강남",
				targetKeywords: ["카페"],
			});
			expect(result.clusters.length).toBeGreaterThanOrEqual(2);
		});
	});

	// -------------------------------------------------------------------------
	// Industry 권장 토픽 대조
	// -------------------------------------------------------------------------
	describe("industry topic matching", () => {
		it("detects missing recommended topics for 카페 industry", async () => {
			const analyzer = makeAnalyzer();
			// "메뉴", "원두", "주차" 등이 누락된 콘텐츠
			const result = await analyzer.analyze({
				pages: [
					{
						url: "https://example.com/",
						title: "환영합니다",
						bodyText: "안녕하세요 저희 가게에 오신 것을 환영합니다. 좋은 하루.",
					},
				],
				industry: "카페",
				region: "강남",
				targetKeywords: [],
			});
			expect(result.missingTopics.length).toBeGreaterThan(0);
			// "메뉴" 가 missing 일 가능성 높음
			const expectedTopics = INDUSTRY_TOPICS["카페"]!;
			const overlap = result.missingTopics.filter((t) =>
				expectedTopics.includes(t),
			);
			expect(overlap.length).toBeGreaterThan(0);
		});

		it("reduces missing topics when content covers them", async () => {
			const analyzer = makeAnalyzer();
			const expectedTopics = INDUSTRY_TOPICS["카페"]!;
			const allTopicsText = expectedTopics.join(" ");
			const result = await analyzer.analyze({
				pages: [
					{
						url: "https://example.com/",
						title: "카페 전체 안내",
						bodyText: allTopicsText.repeat(3),
					},
				],
				industry: "카페",
				region: "강남",
				targetKeywords: [],
			});
			// 모든 권장 토픽 단어가 본문에 등장하므로 missing 0
			expect(result.missingTopics.length).toBe(0);
		});

		it("INDUSTRY_TOPICS contains 20+ industries", () => {
			const count = Object.keys(INDUSTRY_TOPICS).length;
			expect(count).toBeGreaterThanOrEqual(20);
		});

		it("returns relevant-only clusters for matching industry", async () => {
			const analyzer = makeAnalyzer();
			const result = await analyzer.analyze({
				pages: [
					{
						url: "https://example.com/menu",
						title: "메뉴 안내",
						bodyText: "메뉴 메뉴 메뉴 원두 원두 커피 디저트 음료",
					},
				],
				industry: "카페",
				region: "강남",
				targetKeywords: ["카페 메뉴"],
			});
			// 적어도 하나의 cluster 가 relevance > 0
			const hasRelevant = result.clusters.some((c) => c.relevance > 0);
			expect(hasRelevant).toBe(true);
		});
	});

	// -------------------------------------------------------------------------
	// Relevance / Coverage
	// -------------------------------------------------------------------------
	describe("relevance & coverage", () => {
		it("clusters sorted by relevance × coverage", async () => {
			const analyzer = makeAnalyzer();
			const result = await analyzer.analyze({
				pages: [
					{
						url: "https://example.com/",
						title: "메뉴",
						bodyText:
							"메뉴 원두 커피 디저트 음료 메뉴 원두 라떼 아메리카노 카페라떼",
					},
					{
						url: "https://example.com/about",
						title: "회사 소개",
						bodyText: "주식 회사 경영 임원 매출",
					},
				],
				industry: "카페",
				region: "강남",
				targetKeywords: ["카페 메뉴"],
			});
			// 정렬 검증: 내림차순
			for (let i = 1; i < result.clusters.length; i++) {
				const cur = result.clusters[i]!;
				const prev = result.clusters[i - 1]!;
				expect(prev.relevance * prev.coverage).toBeGreaterThanOrEqual(
					cur.relevance * cur.coverage - 0.0001,
				);
			}
		});

		it("coverage is in 0..1", async () => {
			const analyzer = makeAnalyzer();
			const result = await analyzer.analyze({
				pages: [
					{
						url: "https://example.com/",
						title: "test",
						bodyText: "메뉴 원두 커피 메뉴 원두 음료 분위기 분위기",
					},
				],
				industry: "카페",
				region: "강남",
				targetKeywords: [],
			});
			for (const c of result.clusters) {
				expect(c.coverage).toBeGreaterThanOrEqual(0);
				expect(c.coverage).toBeLessThanOrEqual(1);
			}
		});

		it("relevance is in 0..1", async () => {
			const analyzer = makeAnalyzer();
			const result = await analyzer.analyze({
				pages: [
					{
						url: "https://example.com/",
						title: "test",
						bodyText: "메뉴 원두 커피 디저트 음료 분위기",
					},
				],
				industry: "카페",
				region: "강남",
				targetKeywords: [],
			});
			for (const c of result.clusters) {
				expect(c.relevance).toBeGreaterThanOrEqual(0);
				expect(c.relevance).toBeLessThanOrEqual(1);
			}
		});
	});

	// -------------------------------------------------------------------------
	// Unknown industry
	// -------------------------------------------------------------------------
	describe("unknown industry fallback", () => {
		it("handles unknown industry without error", async () => {
			const analyzer = makeAnalyzer();
			const result = await analyzer.analyze({
				pages: [
					{
						url: "https://example.com/",
						title: "test",
						bodyText: "어떤 내용 페이지",
					},
				],
				industry: "알수없는업종",
				region: "서울",
				targetKeywords: ["test"],
			});
			expect(result.missingTopics).toEqual([]);
			expect(result.source).toBe("rule-based");
		});
	});
});
