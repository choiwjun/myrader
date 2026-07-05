/**
 * X-SAG Core Engine — analyzeCrossPage tests
 *
 * Phase R-C: 사이트 전체 NLP 분석 검증.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import { analyzeCrossPage } from "../cross-page-analyzer.js";

function makePage(
	overrides: Partial<ParsedPage> & { url: string },
): ParsedPage {
	return {
		url: overrides.url,
		statusCode: 200,
		title: overrides.title ?? "Test Page",
		description: null,
		h1: overrides.h1 ?? null,
		h2: overrides.h2 ?? [],
		meta: {},
		bodyText: overrides.bodyText ?? "",
		wordCount:
			overrides.wordCount ??
			(overrides.bodyText
				? overrides.bodyText.split(/\s+/u).filter((w) => w.length > 0).length
				: 0),
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

describe("analyzeCrossPage", () => {
	// -------------------------------------------------------------------------
	// 빈 입력
	// -------------------------------------------------------------------------
	it("returns empty analysis for no pages", async () => {
		const result = await analyzeCrossPage([], {
			industry: "카페",
			region: "강남",
			targetKeywords: [],
		});
		expect(result.totalPages).toBe(0);
		expect(result.totalWords).toBe(0);
		expect(result.topicDistribution).toEqual([]);
		expect(result.cannibalization).toEqual([]);
		expect(result.avgWordsPerPage).toBe(0);
	});

	// -------------------------------------------------------------------------
	// 기본 통계
	// -------------------------------------------------------------------------
	it("aggregates totalPages and totalWords", async () => {
		const pages = [
			makePage({
				url: "https://example.com/a",
				bodyText: "강남 카페 메뉴 안내",
			}),
			makePage({
				url: "https://example.com/b",
				bodyText: "강남 카페 위치 안내 입니다",
			}),
		];
		const result = await analyzeCrossPage(pages, {
			industry: "카페",
			region: "강남",
			targetKeywords: ["카페"],
		});
		expect(result.totalPages).toBe(2);
		expect(result.totalWords).toBeGreaterThan(0);
		expect(result.avgWordsPerPage).toBeGreaterThan(0);
	});

	// -------------------------------------------------------------------------
	// 중복 콘텐츠 비율
	// -------------------------------------------------------------------------
	describe("duplicate content ratio", () => {
		it("detects high duplication when pages share most nouns", async () => {
			const sharedText =
				"강남 카페 메뉴 원두 커피 디저트 음료 분위기 위치 운영시간 주차 와이파이";
			const pages = [
				makePage({ url: "https://example.com/a", bodyText: sharedText }),
				makePage({ url: "https://example.com/b", bodyText: sharedText }),
			];
			const result = await analyzeCrossPage(pages, {
				industry: "카페",
				region: "강남",
				targetKeywords: [],
			});
			// 두 페이지가 동일 → 유사도 1.0 → ratio 1.0
			expect(result.duplicateContentRatio).toBeGreaterThanOrEqual(0.5);
		});

		it("returns low duplicate ratio when pages differ", async () => {
			const pages = [
				makePage({
					url: "https://example.com/menu",
					bodyText: "메뉴 원두 라떼 커피 디저트 음료",
				}),
				makePage({
					url: "https://example.com/location",
					bodyText: "주차 위치 교통 강남역 도보 지하철",
				}),
				makePage({
					url: "https://example.com/about",
					bodyText: "역사 운영자 철학 비전 미션 가치",
				}),
			];
			const result = await analyzeCrossPage(pages, {
				industry: "카페",
				region: "강남",
				targetKeywords: [],
			});
			// 세 페이지가 전혀 다른 단어 사용 → 중복 ratio 낮음
			expect(result.duplicateContentRatio).toBeLessThan(0.5);
		});

		it("returns 0 duplicate ratio for single page", async () => {
			const pages = [
				makePage({
					url: "https://example.com/",
					bodyText: "단일 페이지 내용",
				}),
			];
			const result = await analyzeCrossPage(pages, {
				industry: "카페",
				region: "강남",
				targetKeywords: [],
			});
			expect(result.duplicateContentRatio).toBe(0);
		});
	});

	// -------------------------------------------------------------------------
	// 키워드 카니발리제이션
	// -------------------------------------------------------------------------
	describe("cannibalization", () => {
		it("detects same keyword targeted by multiple pages", async () => {
			const pages = [
				makePage({
					url: "https://example.com/page1",
					title: "강남 카페 추천",
					h1: "강남 카페",
					h2: ["강남 카페 메뉴"],
					bodyText: "강남 카페에서 강남 카페 추천 강남 카페 위치",
				}),
				makePage({
					url: "https://example.com/page2",
					title: "강남 카페 후기",
					h1: "강남 카페 베스트",
					h2: ["강남 카페 분위기"],
					bodyText: "강남 카페 후기 강남 카페 베스트 강남 카페 분위기",
				}),
			];
			const result = await analyzeCrossPage(pages, {
				industry: "카페",
				region: "강남",
				targetKeywords: ["강남 카페"],
			});
			const cannibal = result.cannibalization.find(
				(c) => c.keyword === "강남 카페",
			);
			expect(cannibal).toBeDefined();
			expect(cannibal?.pages.length).toBeGreaterThanOrEqual(2);
		});

		it("does not flag keyword targeted by only one page", async () => {
			const pages = [
				makePage({
					url: "https://example.com/uniq",
					title: "유일한 페이지",
					h1: "특별한 키워드",
					bodyText:
						"특별한 키워드 특별한 키워드 특별한 키워드 한 번만 등장하는 사이트",
				}),
				makePage({
					url: "https://example.com/other",
					title: "전혀 다른 페이지",
					bodyText: "전혀 다른 내용 입니다",
				}),
			];
			const result = await analyzeCrossPage(pages, {
				industry: "카페",
				region: "강남",
				targetKeywords: ["특별한"],
			});
			// 한 페이지만 타게팅 → 카니발리제이션 아님
			const cannibal = result.cannibalization.find(
				(c) => c.keyword === "특별한",
			);
			expect(cannibal).toBeUndefined();
		});

		it("returns empty cannibalization for single page", async () => {
			const result = await analyzeCrossPage(
				[
					makePage({
						url: "https://example.com/",
						title: "강남 카페",
						bodyText: "강남 카페 메뉴 원두 카페 카페",
					}),
				],
				{
					industry: "카페",
					region: "강남",
					targetKeywords: ["강남 카페"],
				},
			);
			expect(result.cannibalization).toEqual([]);
		});
	});

	// -------------------------------------------------------------------------
	// 평균 단어 수
	// -------------------------------------------------------------------------
	it("calculates avgWordsPerPage", async () => {
		const pages = [
			makePage({
				url: "https://example.com/a",
				bodyText: "단어 단어 단어 단어",
				wordCount: 4,
			}),
			makePage({
				url: "https://example.com/b",
				bodyText: "단어 단어",
				wordCount: 2,
			}),
		];
		const result = await analyzeCrossPage(pages, {
			industry: "카페",
			region: "강남",
			targetKeywords: [],
		});
		expect(result.avgWordsPerPage).toBe(3);
		expect(result.totalWords).toBe(6);
	});

	// -------------------------------------------------------------------------
	// 토픽 분포 통합
	// -------------------------------------------------------------------------
	it("includes topicDistribution from TopicClusterAnalyzer", async () => {
		const pages = [
			makePage({
				url: "https://example.com/menu",
				title: "메뉴",
				bodyText: "메뉴 원두 커피 라떼 아메리카노 디저트",
			}),
			makePage({
				url: "https://example.com/about",
				title: "소개",
				bodyText: "분위기 인테리어 운영시간 위치 주차",
			}),
		];
		const result = await analyzeCrossPage(pages, {
			industry: "카페",
			region: "강남",
			targetKeywords: ["카페"],
		});
		expect(result.topicDistribution.length).toBeGreaterThan(0);
		for (const cluster of result.topicDistribution) {
			expect(cluster.topic).toBeTruthy();
			expect(Array.isArray(cluster.keywords)).toBe(true);
			expect(cluster.pageCount).toBeGreaterThanOrEqual(1);
		}
	});
});
