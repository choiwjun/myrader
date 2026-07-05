/**
 * X-SAG Core Engine — RecommendationEngine × QualityChecker 통합 테스트 (Phase P-C)
 *
 * @IMPL packages/core-engine/src/recommendation/index.ts
 *
 * 검증:
 * 1. enableQualityCheck=false (기본) — 메타데이터 부착 안 함
 * 2. enableQualityCheck=true + 좋은 추천 — 점수만 부착, 본문 보존
 * 3. enableQualityCheck=true + 나쁜 추천 + 개선 버전 — 본문 교체
 * 4. enableQualityCheck=true + 검수 실패 — 원본 보존
 * 5. qualityCheckThreshold 커스텀 동작
 */

import type { DiagnosisItem } from "@boina/contracts/diagnosis";
import { describe, expect, it } from "vitest";
import { RecommendationEngine } from "../index.js";
import type {
	BusinessContext,
	RecommendationInput,
	RecommendationOutput,
	RecommendationProvider,
} from "../types.js";

const ctx: BusinessContext = {
	businessName: "테스트카페",
	industry: "카페",
	region: "서울 강남",
	mainServices: ["핸드드립", "원두판매"],
};

function makeItem(): DiagnosisItem {
	return {
		id: "00000000-0000-0000-0000-000000000001",
		code: "SEO_TITLE_MISSING",
		category: "seo",
		actionType: "quick-win",
		priority: "high",
		title: "타이틀 누락",
		description: "<title> 없음",
		evidence: { url: "https://x.kr/", foundValue: "", expectedValue: "..." },
		impactScore: 80,
		difficulty: "easy",
		expectedEffect: "노출 향상",
		isAiGenerated: false,
		recommendationText: "타이틀을 추가하세요.",
		relatedSnippetType: null,
		pageUrl: "https://x.kr/",
		ruleVersion: "1.0.0",
	} as DiagnosisItem;
}

function makeInput(): RecommendationInput {
	return {
		item: makeItem(),
		context: ctx,
		ruleResult: {
			ruleId: "SEO-TITLE-001",
			category: "seo",
			passed: false,
			severity: "high",
			title: "타이틀 누락",
			description: "...",
			evidence: [],
			recommendation: "기본 추천 문구",
			actionType: "vendor_action",
			difficulty: "easy",
			expectedImpact: "high",
			ruleWeight: 10,
		},
	};
}

/** 결정적 stub provider — 본문은 인자로 받음 */
function makeStubProvider(body: string): RecommendationProvider {
	return {
		name: "stub",
		isAvailable: () => true,
		generate: async (): Promise<RecommendationOutput> => ({
			body,
			examples: [],
			aiGenerated: true,
			provider: "rule-based",
			model: "stub",
			costUsd: 0,
		}),
	};
}

// ---------------------------------------------------------------------------
// 1. 기본 동작 — quality check 비활성
// ---------------------------------------------------------------------------

describe("RecommendationEngine — enableQualityCheck=false (기본)", () => {
	it("품질 메타데이터가 부착되지 않는다", async () => {
		const engine = new RecommendationEngine({
			providers: [makeStubProvider("짧")],
		});
		const r = await engine.recommend(makeInput());

		expect(r.body).toBe("짧");
		expect(r.qualityScore).toBeUndefined();
		expect(r.qualityIssues).toBeUndefined();
		expect(r.wasImproved).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// 2. 활성 + 좋은 추천 — 메타만 부착
// ---------------------------------------------------------------------------

describe("RecommendationEngine — enableQualityCheck=true (좋은 추천)", () => {
	it("점수만 부착, 본문은 보존", async () => {
		const goodText =
			"테스트카페의 메인 페이지에 '<title>테스트카페 | 핸드드립</title>' 형식으로 제목 태그를 추가해 주세요. 서울 강남 검색에 도움이 됩니다.";

		const engine = new RecommendationEngine({
			providers: [makeStubProvider(goodText)],
			enableQualityCheck: true,
		});

		const r = await engine.recommend(makeInput());
		expect(r.body).toBe(goodText);
		expect(r.qualityScore).toBeGreaterThanOrEqual(70);
		expect(r.wasImproved).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 3. 활성 + 나쁜 추천 + 개선 버전 → 교체
// ---------------------------------------------------------------------------

describe("RecommendationEngine — enableQualityCheck=true (개선 적용)", () => {
	it("점수 < threshold 이고 개선 버전 존재 시 본문 교체", async () => {
		const engine = new RecommendationEngine({
			providers: [makeStubProvider("짧")],
			enableQualityCheck: true,
			qualityCheckThreshold: 70,
			qualityChecker: {
				check: async (input) => ({
					qualityScore: 40,
					issues: ["너무 짧음"],
					improvedRecommendation: `개선된 ${input.context.businessName} 추천 문구입니다.`,
					passed: false,
				}),
			},
		});

		const r = await engine.recommend(makeInput());
		expect(r.body).toBe("개선된 테스트카페 추천 문구입니다.");
		expect(r.wasImproved).toBe(true);
		expect(r.qualityScore).toBe(40);
		expect(r.qualityIssues).toEqual(["너무 짧음"]);
	});

	it("점수 < threshold 이지만 개선 버전이 없으면 본문 보존", async () => {
		const engine = new RecommendationEngine({
			providers: [makeStubProvider("원본 그대로")],
			enableQualityCheck: true,
			qualityChecker: {
				check: async () => ({
					qualityScore: 30,
					issues: ["부족"],
					passed: false,
				}),
			},
		});

		const r = await engine.recommend(makeInput());
		expect(r.body).toBe("원본 그대로");
		expect(r.wasImproved).toBe(false);
		expect(r.qualityScore).toBe(30);
	});

	it("점수 >= threshold 이면 개선 버전이 있어도 교체하지 않음", async () => {
		const engine = new RecommendationEngine({
			providers: [makeStubProvider("원본 OK")],
			enableQualityCheck: true,
			qualityCheckThreshold: 70,
			qualityChecker: {
				check: async () => ({
					qualityScore: 75,
					issues: [],
					improvedRecommendation: "절대 사용 안 됨",
					passed: true,
				}),
			},
		});

		const r = await engine.recommend(makeInput());
		expect(r.body).toBe("원본 OK");
		expect(r.wasImproved).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 4. 검수기 자체 실패 → 원본 보존
// ---------------------------------------------------------------------------

describe("RecommendationEngine — quality checker 실패", () => {
	it("checker.check throw 발생 시 원본 결과 반환", async () => {
		const engine = new RecommendationEngine({
			providers: [makeStubProvider("원본")],
			enableQualityCheck: true,
			qualityChecker: {
				check: async () => {
					throw new Error("checker down");
				},
			},
		});

		const r = await engine.recommend(makeInput());
		expect(r.body).toBe("원본");
		expect(r.qualityScore).toBeUndefined();
		expect(r.wasImproved).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// 5. 커스텀 임계치
// ---------------------------------------------------------------------------

describe("RecommendationEngine — qualityCheckThreshold 커스텀", () => {
	it("threshold=90 이면 80점도 개선 대상", async () => {
		const engine = new RecommendationEngine({
			providers: [makeStubProvider("원본")],
			enableQualityCheck: true,
			qualityCheckThreshold: 90,
			qualityChecker: {
				check: async () => ({
					qualityScore: 80,
					issues: ["거의 좋음"],
					improvedRecommendation: "완벽한 버전",
					passed: true,
				}),
			},
		});

		const r = await engine.recommend(makeInput());
		expect(r.body).toBe("완벽한 버전");
		expect(r.wasImproved).toBe(true);
	});
});
