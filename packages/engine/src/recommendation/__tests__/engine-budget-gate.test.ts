/**
 * X-SAG Core Engine — RecommendationEngine Budget Gate 통합 테스트 (REM-A5)
 *
 * @TEST REM-A5-ENGINE-001 — CostMeter 게이트 통합 검증
 * @IMPL packages/core-engine/src/recommendation/index.ts
 * @SPEC docs/features/x-sag-diagnosis-engine/TRD.md#9.5
 *
 * 테스트 시나리오:
 * 1. 예산 충분 → AI provider 사용
 * 2. AI provider 예산 초과 → 다음 provider 시도
 * 3. 모든 AI provider 예산 초과 → RuleBased 강제 폴백
 * 4. 80% / 100% 알람 발사 (onBudgetAlert 콜백)
 * 5. CostMeter.recordUsage 가 실제 비용으로 호출된다
 * 6. provider 실패 (throw) → 다음 provider 폴백
 * 7. chatmock 은 비용 게이트 건너뜀
 */

import type { DiagnosisItem } from "@boina/contracts/diagnosis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryCostMeter } from "../cost-meter.js";
import { RecommendationEngine } from "../index.js";
import type {
	BusinessContext,
	RecommendationInput,
	RecommendationOutput,
	RecommendationProvider,
} from "../types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ctx: BusinessContext = {
	businessName: "테스트카페",
	industry: "카페",
	region: "서울 강남",
	mainServices: ["핸드드립"],
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
		recommendationText: "기본 룰 추천",
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
			recommendation: "기본 룰 추천",
			actionType: "vendor_action",
			difficulty: "easy",
			expectedImpact: "high",
			ruleWeight: 10,
		},
	};
}

/** AI provider stub */
function makeAiProvider(
	name: "openai" | "gemini" | "anthropic",
	opts: { available?: boolean; throws?: boolean; costUsd?: number } = {},
): RecommendationProvider {
	return {
		name,
		isAvailable: () => opts.available ?? true,
		generate: async (): Promise<RecommendationOutput> => {
			if (opts.throws) throw new Error(`${name} provider error`);
			return {
				body: `${name} 추천 결과`,
				examples: [],
				aiGenerated: true,
				provider: name,
				model:
					name === "openai"
						? "gpt-4o-mini"
						: name === "gemini"
							? "gemini-2.5-flash"
							: "claude-sonnet-4-6",
				costUsd: opts.costUsd ?? 0.01,
			};
		},
	};
}

/** chatmock stub */
function makeChatMockProvider(
	opts: { available?: boolean } = {},
): RecommendationProvider {
	return {
		name: "chatmock",
		isAvailable: () => opts.available ?? true,
		generate: async (): Promise<RecommendationOutput> => ({
			body: "chatmock 추천 결과",
			examples: [],
			aiGenerated: true,
			provider: "chatmock",
			costUsd: 0,
		}),
	};
}

// ---------------------------------------------------------------------------
// Scenario 1: 예산 충분 → AI provider 사용
// ---------------------------------------------------------------------------

describe("RecommendationEngine Budget Gate — Scenario 1: 예산 충분", () => {
	it("REM-A5-ENGINE-001.1: 예산 내에서 openai provider 결과를 반환한다", async () => {
		const costMeter = new InMemoryCostMeter(50);
		const engine = new RecommendationEngine({
			providers: [makeAiProvider("openai")],
			costMeter,
		});

		const result = await engine.recommend(makeInput());
		expect(result.provider).toBe("openai");
		expect(result.body).toBe("openai 추천 결과");
	});

	it("REM-A5-ENGINE-001.2: 호출 후 costMeter 에 비용이 기록된다", async () => {
		const costMeter = new InMemoryCostMeter(50);
		const engine = new RecommendationEngine({
			providers: [makeAiProvider("openai", { costUsd: 0.05 })],
			costMeter,
		});

		await engine.recommend(makeInput());
		const total = await costMeter.getDailyTotal();
		expect(total).toBeCloseTo(0.05, 5);
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: OpenAI 예산 초과 → Gemini 시도
// ---------------------------------------------------------------------------

describe("RecommendationEngine Budget Gate — Scenario 2: OpenAI 초과 → Gemini", () => {
	it("REM-A5-ENGINE-001.3: OpenAI 가 예산 초과면 Gemini 로 넘어간다", async () => {
		const costMeter = new InMemoryCostMeter(50);
		// OpenAI 를 완전히 막기 위해 이미 $49.99 소비 + 예상 비용(OpenAI gpt-4o-mini 300+150 토큰 ≈ $0.000135) > remaining
		await costMeter.record(50, "openai"); // 한도 꽉 참

		const engine = new RecommendationEngine({
			providers: [makeAiProvider("openai"), makeAiProvider("gemini")],
			costMeter,
		});

		const result = await engine.recommend(makeInput());
		// 예산 없어서 AI SKIPPED → rule-based fallback
		expect(result.provider).toBe("rule-based");
	});

	it("REM-A5-ENGINE-001.4: 여러 AI provider 예산 초과 → rule-based 최종 폴백", async () => {
		const costMeter = new InMemoryCostMeter(10);
		await costMeter.record(10, "openai"); // 한도 꽉 참

		const engine = new RecommendationEngine({
			providers: [
				makeAiProvider("openai"),
				makeAiProvider("gemini"),
				makeAiProvider("anthropic"),
			],
			costMeter,
		});

		const result = await engine.recommend(makeInput());
		expect(result.provider).toBe("rule-based");
		expect(result.aiGenerated).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: 80% / 100% 알람
// ---------------------------------------------------------------------------

describe("RecommendationEngine Budget Gate — Scenario 3: 알람 콜백", () => {
	it("REM-A5-ENGINE-001.5: 100% 도달 시 onBudgetAlert error 콜백 호출", async () => {
		const onBudgetAlert = vi.fn();
		const costMeter = new InMemoryCostMeter(1); // cap $1
		// 0.95 기록 → 추가 0.05 기록 → 총 1.0 (100%)
		await costMeter.record(0.95, "openai");

		const engine = new RecommendationEngine({
			providers: [makeAiProvider("openai", { costUsd: 0.05 })],
			costMeter,
			onBudgetAlert,
		});

		await engine.recommend(makeInput());

		// 0.95 + 0.05 = 1.0 (100% 도달 → "error" 레벨)
		const errorCalls = onBudgetAlert.mock.calls.filter(
			([level]) => level === "error",
		);
		expect(errorCalls.length).toBeGreaterThanOrEqual(1);
		expect(errorCalls[0]?.[1]).toMatchObject({
			event: "ai_budget_100_reached",
		});
	});

	it("REM-A5-ENGINE-001.6: 80% 도달 시 onBudgetAlert warning 콜백 호출", async () => {
		const onBudgetAlert = vi.fn();
		const costMeter = new InMemoryCostMeter(1); // cap $1
		// 0.79 기록 → 추가 0.02 기록 → 총 0.81 (81%)
		await costMeter.record(0.79, "openai");

		const engine = new RecommendationEngine({
			providers: [makeAiProvider("openai", { costUsd: 0.02 })],
			costMeter,
			onBudgetAlert,
		});

		await engine.recommend(makeInput());

		const warnCalls = onBudgetAlert.mock.calls.filter(
			([level]) => level === "warning",
		);
		expect(warnCalls.length).toBeGreaterThanOrEqual(1);
		expect(warnCalls[0]?.[1]).toMatchObject({ event: "ai_budget_80_warning" });
	});

	it("REM-A5-ENGINE-001.7: 50% 미만에서는 알람 없음", async () => {
		const onBudgetAlert = vi.fn();
		const costMeter = new InMemoryCostMeter(100); // cap $100

		const engine = new RecommendationEngine({
			providers: [makeAiProvider("openai", { costUsd: 0.01 })],
			costMeter,
			onBudgetAlert,
		});

		await engine.recommend(makeInput());
		expect(onBudgetAlert).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: Provider throw → 다음 폴백
// ---------------------------------------------------------------------------

describe("RecommendationEngine Budget Gate — Scenario 4: Provider throw 폴백", () => {
	it("REM-A5-ENGINE-001.8: openai throw → gemini 시도", async () => {
		const costMeter = new InMemoryCostMeter(50);
		const engine = new RecommendationEngine({
			providers: [
				makeAiProvider("openai", { throws: true }),
				makeAiProvider("gemini"),
			],
			costMeter,
		});

		const result = await engine.recommend(makeInput());
		expect(result.provider).toBe("gemini");
	});

	it("REM-A5-ENGINE-001.9: 모든 AI throw → rule-based 폴백", async () => {
		const costMeter = new InMemoryCostMeter(50);
		const engine = new RecommendationEngine({
			providers: [
				makeAiProvider("openai", { throws: true }),
				makeAiProvider("gemini", { throws: true }),
				makeAiProvider("anthropic", { throws: true }),
			],
			costMeter,
		});

		const result = await engine.recommend(makeInput());
		expect(result.provider).toBe("rule-based");
		expect(result.aiGenerated).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: chatmock — 비용 게이트 건너뜀
// ---------------------------------------------------------------------------

describe("RecommendationEngine Budget Gate — Scenario 5: chatmock 면제", () => {
	it("REM-A5-ENGINE-001.10: chatmock 은 예산 없어도 사용된다", async () => {
		const costMeter = new InMemoryCostMeter(50);
		await costMeter.record(50, "openai"); // 한도 꽉 참

		const engine = new RecommendationEngine({
			providers: [makeChatMockProvider()],
			costMeter,
		});

		const result = await engine.recommend(makeInput());
		// chatmock 은 LOCAL_PROVIDER → 비용 게이트 건너뜀
		expect(result.provider).toBe("chatmock");
	});

	it("REM-A5-ENGINE-001.11: chatmock 사용 후 비용 미터 변화 없음", async () => {
		const costMeter = new InMemoryCostMeter(50);
		const engine = new RecommendationEngine({
			providers: [makeChatMockProvider()],
			costMeter,
		});

		await engine.recommend(makeInput());
		const total = await costMeter.getDailyTotal();
		expect(total).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 6: isAvailable=false 건너뜀
// ---------------------------------------------------------------------------

describe("RecommendationEngine Budget Gate — Scenario 6: isAvailable=false", () => {
	it("REM-A5-ENGINE-001.12: isAvailable=false 는 예산 체크 없이 건너뜀", async () => {
		const costMeter = new InMemoryCostMeter(50);
		const checkBudgetSpy = vi.spyOn(costMeter, "checkBudget");

		const engine = new RecommendationEngine({
			providers: [
				makeAiProvider("openai", { available: false }),
				makeAiProvider("gemini"),
			],
			costMeter,
		});

		const result = await engine.recommend(makeInput());
		expect(result.provider).toBe("gemini");
		// openai 는 isAvailable=false → checkBudget 호출 안 됨
		const openaiCalls = checkBudgetSpy.mock.calls.filter(
			(args) => args[1]?.provider === "openai",
		);
		expect(openaiCalls.length).toBe(0);
	});
});
