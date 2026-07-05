/**
 * X-SAG Core Engine — Report Generator 단위 테스트
 *
 * TASK-CORE-010: DiagnosisJson 생성 + Zod 검증
 * 5개 케이스.
 */

import type { AnalyzedPage, DiagnosisItem } from "@boina/contracts/diagnosis";
import type { SnippetAvailability } from "@boina/contracts/diagnosis";
import { describe, expect, it } from "vitest";
import {
	type ReportGeneratorInput,
	generateReportJson,
	generateSummary,
	parsedPageToAnalyzedPage,
} from "../report-generator.js";
import type { ParsedPage } from "../types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

function makeDiagnosisItem(
	overrides: Partial<DiagnosisItem> = {},
): DiagnosisItem {
	return {
		id: "00000000-0000-4000-8000-000000000001",
		code: "SEO_TITLE_MISSING",
		category: "seo",
		actionType: "self_fix",
		priority: "high",
		title: "페이지 제목 누락",
		description: "페이지 <title> 태그가 비어 있거나 없습니다.",
		evidence: {
			url: "https://example.co.kr",
			foundValue: null,
			expectedValue: "페이지 제목",
		},
		impactScore: 80,
		difficulty: "easy",
		expectedEffect: "검색결과 클릭률 향상",
		isAiGenerated: false,
		recommendationText: "페이지 제목을 30~60자 내로 작성하세요.",
		relatedSnippetType: null,
		pageUrl: "https://example.co.kr/",
		ruleVersion: "1.0.0",
		...overrides,
	};
}

function makeParsedPage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example.co.kr/",
		statusCode: 200,
		title: "강남 카페 | 르카페",
		description: "강남역 근처 카페",
		h1: "강남 카페 르카페",
		h2: ["메뉴", "오시는 길"],
		meta: {
			viewport: "width=device-width",
			"og:title": "강남 카페",
			"og:description": "강남역 카페",
		},
		bodyText: "강남 카페 르카페에 오신 것을 환영합니다.",
		wordCount: 50,
		internalLinks: ["https://example.co.kr/menu"],
		externalLinks: [],
		images: [
			{ src: "/img/cafe.jpg", alt: "카페 내부" },
			{ src: "/img/coffee.jpg", alt: null },
		],
		schemaJsonLd: [
			{
				"@context": "https://schema.org",
				"@type": "LocalBusiness",
				name: "르카페",
			},
		],
		hasFAQ: false,
		hasSchema: true,
		canonicalUrl: "https://example.co.kr/",
		robotsMeta: null,
		...overrides,
	};
}

function makeBaseInput(
	overrides: Partial<ReportGeneratorInput> = {},
): ReportGeneratorInput {
	const items = [
		makeDiagnosisItem({
			id: "00000000-0000-4000-8000-000000000001",
			actionType: "self_fix",
		}),
		makeDiagnosisItem({
			id: "00000000-0000-4000-8000-000000000002",
			code: "AEO_FAQ_MISSING",
			category: "aeo",
			actionType: "snippet_action",
			priority: "high",
			title: "FAQ 구조화 데이터 없음",
		}),
		makeDiagnosisItem({
			id: "00000000-0000-4000-8000-000000000003",
			code: "GEO_REGION_MISSING",
			category: "geo",
			actionType: "vendor_action",
			priority: "medium",
			title: "지역 정보 누락",
		}),
	];

	const analyzedPage: AnalyzedPage = parsedPageToAnalyzedPage(
		makeParsedPage(),
		true,
	);

	return {
		reportId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		profileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		websiteUrl: "https://example.co.kr",
		businessName: "강남 르카페",
		industry: "카페",
		region: "서울 강남구",
		mainServices: ["핸드드립 커피"],
		targetKeywords: ["강남 카페"],
		modules: ["seo", "aeo", "geo"],
		scores: {
			overallScore: 55,
			seoScore: 60,
			aeoScore: 45,
			geoScore: 55,
		},
		startedAt: NOW,
		completedAt: NOW,
		durationMs: 3000,
		analyzedPages: [analyzedPage],
		items,
		recommendations: {
			executionOrder: [
				"00000000-0000-4000-8000-000000000001",
				"00000000-0000-4000-8000-000000000002",
				"00000000-0000-4000-8000-000000000003",
			],
			quickWins: ["00000000-0000-4000-8000-000000000001"],
			aiSummary: null,
		},
		snippets: [],
		prescriptionItems: ["00000000-0000-4000-8000-000000000003"],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// 1. Zod 검증 통과
// ---------------------------------------------------------------------------

describe("generateReportJson", () => {
	it("Zod 검증 통과 — schemaVersion 1.1.0 확인 (v0.4 bump)", () => {
		const report = generateReportJson(makeBaseInput());

		expect(report.schemaVersion).toBe("1.1.0");
		expect(report.reportId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
		expect(report.profileId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
	});

	it("profileId 없으면 null로 설정", () => {
		const input = makeBaseInput();
		delete input.profileId;
		const report = generateReportJson(input);
		expect(report.profileId).toBeNull();
	});

	it("platform source metadata를 meta에 포함한다", () => {
		const report = generateReportJson(
			makeBaseInput({
				sourceType: "instagram",
				platformLimitations: [
					{
						code: "PLATFORM_LIMITED_EVIDENCE",
						message: "인스타그램 공개 정보 기준 진단입니다.",
						affectedCategories: ["seo", "aeo", "geo"],
					},
				],
			}),
		);

		expect(report.meta.sourceType).toBe("instagram");
		expect(report.meta.platformLimitations).toHaveLength(1);
		expect(report.meta.platformLimitations?.[0]?.code).toBe(
			"PLATFORM_LIMITED_EVIDENCE",
		);
	});

	it("includes businessPresence metadata when provided", () => {
		const report = generateReportJson(
			makeBaseInput({
				businessPresence: {
					primarySourceType: "website",
					primaryUrl: "https://example.com",
					canonicalName: "Example Cafe",
					services: ["coffee"],
					surfaces: [
						{
							sourceType: "website",
							url: "https://example.com",
							status: "skipped",
							sourceLabel: "Website",
							services: [],
							limitations: [],
						},
						{
							sourceType: "naver_place",
							url: "https://place.naver.com/restaurant/123",
							status: "fetched",
							sourceLabel: "Naver Place",
							name: "Example Cafe",
							description: "Public profile",
							confidence: "high",
							services: ["coffee"],
							limitations: [],
						},
					],
					limitations: [],
				},
			}),
		);

		expect(report.meta.businessPresence?.canonicalName).toBe("Example Cafe");
		expect(report.meta.businessPresence?.surfaces).toHaveLength(2);
	});

	it("snippets/prescriptionItems 빈 배열 기본값 적용", () => {
		const input = makeBaseInput();
		delete (input as Partial<ReportGeneratorInput>).snippets;
		delete (input as Partial<ReportGeneratorInput>).prescriptionItems;
		const report = generateReportJson(input);
		expect(report.snippets).toEqual([]);
		expect(report.prescriptionItems).toEqual([]);
	});

	it("scores 필드 — grade 파생, disclaimer 문구 포함", () => {
		const report = generateReportJson(makeBaseInput());
		// overall=55 → "low" grade
		expect(report.scores.grade).toBe("low");
		expect(report.scores.overall).toBe(55);
		expect(report.scores.disclaimer).toContain("참고 지표");
	});

	it("scores.perf — perfScore 값이 있을 때 포함됨", () => {
		const report = generateReportJson(
			makeBaseInput({ scores: { overallScore: 55, seoScore: 60, aeoScore: 45, geoScore: 55, perfScore: 72 } }),
		);
		expect(report.scores.perf).toBe(72);
	});

	it("scores.perf — perfScore null 이면 null로 포함됨", () => {
		const report = generateReportJson(
			makeBaseInput({ scores: { overallScore: 55, seoScore: 60, aeoScore: 45, geoScore: 55, perfScore: null } }),
		);
		expect(report.scores.perf).toBeNull();
	});

	it("scores.perf — perfScore 미제공 시 필드 없음 (기존 페이로드 호환)", () => {
		const report = generateReportJson(makeBaseInput());
		// makeBaseInput scores has no perfScore — field should be absent
		expect(report.scores.perf).toBeUndefined();
	});

	it("snippets SnippetAvailability 배열 직렬화 통과", () => {
		const snippets: SnippetAvailability[] = [
			{ type: "LOCAL_BUSINESS", available: true, suggestion: null },
			{
				type: "FAQ_SCHEMA",
				available: false,
				suggestion: "FAQ를 추가하면 생성 가능합니다.",
			},
		];
		const report = generateReportJson(makeBaseInput({ snippets }));
		expect(report.snippets).toHaveLength(2);
		expect(report.snippets[0].type).toBe("LOCAL_BUSINESS");
		expect(report.snippets[1].available).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 2. parsedPageToAnalyzedPage 매핑
// ---------------------------------------------------------------------------

describe("parsedPageToAnalyzedPage", () => {
	it("기본 필드 매핑 올바름", () => {
		const parsed = makeParsedPage();
		const analyzed = parsedPageToAnalyzedPage(parsed, true);

		expect(analyzed.url).toBe("https://example.co.kr/");
		expect(analyzed.isMainPage).toBe(true);
		expect(analyzed.httpStatus).toBe(200);
		expect(analyzed.robotsBlocked).toBe(false);
		expect(analyzed.jsRenderFailed).toBe(false);
		expect(analyzed.extractedMeta.title).toBe("강남 카페 | 르카페");
		expect(analyzed.extractedMeta.h1).toEqual(["강남 카페 르카페"]);
		expect(analyzed.extractedMeta.h2).toEqual(["메뉴", "오시는 길"]);
		expect(analyzed.extractedMeta.canonical).toBe("https://example.co.kr/");
	});

	it("imgAltRatio 계산 올바름 — 2개 이미지 중 1개 alt 있음 → 0.5", () => {
		const parsed = makeParsedPage();
		const analyzed = parsedPageToAnalyzedPage(parsed);
		expect(analyzed.extractedMeta.imgAltRatio).toBeCloseTo(0.5);
	});

	it("preserves JS render failure evidence in analyzed pages", () => {
		const parsed = makeParsedPage({ failureReason: "JS_RENDER_FAILED" });
		const analyzed = parsedPageToAnalyzedPage(parsed);

		expect(analyzed.failureReason).toBe("JS_RENDER_FAILED");
		expect(analyzed.jsRenderFailed).toBe(true);
	});

	it("og: 메타 태그 ogTags 로 매핑", () => {
		const parsed = makeParsedPage();
		const analyzed = parsedPageToAnalyzedPage(parsed);
		expect(analyzed.extractedMeta.ogTags?.["og:title"]).toBe("강남 카페");
	});

	it("schemaJsonLd → schemas 배열 변환", () => {
		const parsed = makeParsedPage();
		const analyzed = parsedPageToAnalyzedPage(parsed);
		expect(analyzed.schemas).toHaveLength(1);
		expect(analyzed.schemas[0].type).toBe("LocalBusiness");
	});

	it("이미지 없으면 imgAltRatio=null", () => {
		const parsed = makeParsedPage({ images: [] });
		const analyzed = parsedPageToAnalyzedPage(parsed);
		expect(analyzed.extractedMeta.imgAltRatio).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 3. generateSummary 한국어 출력
// ---------------------------------------------------------------------------

describe("generateSummary", () => {
	it("overall 55점 → 한국어 headline 포함", () => {
		const items = [makeDiagnosisItem()];
		const summary = generateSummary(
			{ overallScore: 55, seoScore: 60, aeoScore: 45, geoScore: 55 },
			items,
		);
		expect(typeof summary.headline).toBe("string");
		expect(summary.headline.length).toBeGreaterThan(0);
		// 55점 구간: "기본 구조는 갖춰져 있으나" 포함
		expect(summary.headline).toMatch(/[가-힣]/); // 한국어 포함
	});

	it("topIssues high 우선 정렬, 최대 5개", () => {
		const items = Array.from({ length: 7 }, (_, i) =>
			makeDiagnosisItem({
				id: `0000000${i}-0000-4000-8000-000000000000`,
				priority: i < 3 ? "high" : i < 5 ? "medium" : "low",
			}),
		);
		const summary = generateSummary(
			{ overallScore: 40, seoScore: 40, aeoScore: 40, geoScore: 40 },
			items,
		);
		expect(summary.topIssues.length).toBeLessThanOrEqual(5);
		if (summary.topIssues.length > 1) {
			// high 항목이 앞에 오는지 확인
			const priorities = summary.topIssues.map((t) => t.priority);
			const highIdx = priorities.lastIndexOf("high");
			const medIdx = priorities.indexOf("medium");
			if (highIdx >= 0 && medIdx >= 0) {
				expect(highIdx).toBeLessThan(medIdx);
			}
		}
	});

	it("actionCounts 집계 정확", () => {
		const items = [
			makeDiagnosisItem({
				id: "00000000-0000-4000-8000-000000000001",
				actionType: "self_fix",
			}),
			makeDiagnosisItem({
				id: "00000000-0000-4000-8000-000000000002",
				actionType: "self_fix",
			}),
			makeDiagnosisItem({
				id: "00000000-0000-4000-8000-000000000003",
				actionType: "snippet_action",
			}),
			makeDiagnosisItem({
				id: "00000000-0000-4000-8000-000000000004",
				actionType: "vendor_action",
			}),
		];
		const summary = generateSummary(
			{ overallScore: 50, seoScore: 50, aeoScore: 50, geoScore: 50 },
			items,
		);
		expect(summary.actionCounts.self_fix).toBe(2);
		expect(summary.actionCounts.snippet_action).toBe(1);
		expect(summary.actionCounts.vendor_action).toBe(1);
		expect(summary.actionCounts.si_action).toBe(0);
	});
});
