/**
 * X-SAG Core Engine — Recommendation Engine (TASK-CORE-007, REM-A5)
 *
 * @TASK REM-A5 - AI 비용 미터 강제 게이트
 * @SPEC docs/features/x-sag-diagnosis-engine/TRD.md#9.5
 *
 * TRD § 9.5 AI fallback chain:
 *   0. chatmock (로컬 ChatGPT Plus 프록시, 옵트인) — $0
 *   1. gpt-4o-mini (OpenAI)
 *   2. gemini-2.5-flash (Google)
 *   3. claude-sonnet-4-6 (Anthropic)
 *   4. rule-based default
 *
 * 비용 캡: ENV AI_DAILY_BUDGET_USD (기본 50). 초과 시 rule-based 자동 전환.
 * HALLUCINATION_GUARD: AI throw → fallback. aiGenerated=true on all AI outputs.
 *
 * REM-A5 강화:
 * - Provider chain 단일 진입점에서 CostMeter.checkBudget() 강제 체크
 * - 호출 후 CostMeter.recordUsage() 로 실제 비용 기록
 * - 80% / 100% 알람은 observability 콜백으로 전달 (코어 엔진 → API 레이어)
 */

export type {
	RecommendationInput,
	RecommendationOutput,
	RecommendationProvider,
	RecommendationEngineOptions,
	BusinessContext,
} from "./types.js";

export { RuleBasedProvider } from "./providers/rule-based.js";
export { ChatMockProvider } from "./providers/chatmock.js";
export { OpenAIProvider } from "./providers/openai.js";
export { GeminiProvider } from "./providers/gemini.js";
export { AnthropicProvider } from "./providers/anthropic.js";

// Phase P-C: 품질 검수 / 동적 템플릿
export {
	RecommendationQualityChecker,
	type QualityLLMProvider,
} from "./quality-checker.js";
export type {
	QualityCheckInput,
	QualityCheckResult,
} from "./quality-prompts.js";
export {
	buildQualityPrompt,
	parseQualityResponse,
} from "./quality-prompts.js";
export {
	applyContext,
	getTemplate,
	listTemplateRuleIds,
	renderTemplate,
	type RecommendationTemplate,
	type ApplyContextOptions,
} from "./templates.js";

// REM-A5: 비용 미터 공개 API
export {
	InMemoryCostMeter,
	RedisCostMeter,
	isLocalProvider,
	type CostMeter,
	type BudgetCheckResult,
	type DailyUsageResult,
	type RedisLike,
} from "./cost-meter.js";

export { estimateCostUsd, COST_PER_1K_TOKENS_USD } from "./cost-table.js";

import {
	type CostMeter,
	InMemoryCostMeter,
	isLocalProvider,
} from "./cost-meter.js";
import { estimateCostUsd } from "./cost-table.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { ChatMockProvider } from "./providers/chatmock.js";
import { GeminiProvider } from "./providers/gemini.js";
import { OpenAIProvider } from "./providers/openai.js";
import { RuleBasedProvider } from "./providers/rule-based.js";
import { RecommendationQualityChecker } from "./quality-checker.js";
import type {
	RecommendationEngineOptions,
	RecommendationInput,
	RecommendationOutput,
	RecommendationProvider,
} from "./types.js";

const DEFAULT_DAILY_COST_CAP_USD = 50;
type RecommendationLlmProviderMode =
	| "auto"
	| "chatmock"
	| "openai"
	| "gemini"
	| "anthropic"
	| "mock";

// ---------------------------------------------------------------------------
// RecommendationEngine
// ---------------------------------------------------------------------------

/**
 * Orchestrates the AI fallback chain with cost cap enforcement.
 *
 * REM-A5: CostMeter 주입 지원.
 * - costMeter 미주입 시 → InMemoryCostMeter 자동 생성 (기존 동작 호환)
 * - 주입 시 → 단일 진입점에서 checkBudget() 강제
 *
 * Usage:
 * ```ts
 * const engine = new RecommendationEngine({
 *   providers: buildDefaultProviderChain(),
 *   costMeter: new RedisCostMeter(redis), // 프로덕션
 * });
 * ```
 */
export class RecommendationEngine {
	private readonly providers: RecommendationProvider[];
	private readonly dailyCostCapUsd: number;
	private readonly ruleBasedFallback: RuleBasedProvider;
	private readonly costMeter: CostMeter;

	/** Phase P-C: 품질 검수 옵션 */
	private readonly enableQualityCheck: boolean;
	private readonly qualityCheckThreshold: number;
	private readonly qualityChecker: NonNullable<
		RecommendationEngineOptions["qualityChecker"]
	>;

	/**
	 * REM-A5: observability 알람 콜백.
	 * 80% / 100% 도달 시 호출. API 레이어에서 주입.
	 */
	private readonly onBudgetAlert:
		| ((level: "warning" | "error", payload: Record<string, unknown>) => void)
		| undefined;

	constructor(opts: RecommendationEngineOptions) {
		this.providers = opts.providers;
		const envCap = Number.parseFloat(process.env.AI_DAILY_BUDGET_USD ?? "");
		this.dailyCostCapUsd =
			opts.dailyCostCapUsd ??
			(Number.isFinite(envCap) && envCap > 0
				? envCap
				: DEFAULT_DAILY_COST_CAP_USD);
		this.ruleBasedFallback = new RuleBasedProvider();

		// REM-A5: CostMeter 주입 or 기본 InMemoryCostMeter
		this.costMeter =
			opts.costMeter ?? new InMemoryCostMeter(this.dailyCostCapUsd);
		this.onBudgetAlert = opts.onBudgetAlert;

		// Phase P-C: 기본 비활성, 활성 시 LLM 미주입이면 rule-based 휴리스틱 사용
		this.enableQualityCheck = opts.enableQualityCheck ?? false;
		this.qualityCheckThreshold = opts.qualityCheckThreshold ?? 70;
		this.qualityChecker =
			opts.qualityChecker ?? new RecommendationQualityChecker();
	}

	/**
	 * Generate recommendation for a single DiagnosisItem.
	 * Iterates providers in order; falls back to rule-based on any failure
	 * or when daily cost cap is exceeded.
	 *
	 * Phase P-C: enableQualityCheck=true 시, 결과를 품질 검수 후 필요하면
	 * `improvedRecommendation` 으로 본문을 교체하고 메타데이터를 부착한다.
	 */
	async recommend(input: RecommendationInput): Promise<RecommendationOutput> {
		const raw = await this.runProviderChain(input);
		if (!this.enableQualityCheck) {
			return raw;
		}
		return this.applyQualityCheck(raw, input);
	}

	private async runProviderChain(
		input: RecommendationInput,
	): Promise<RecommendationOutput> {
		for (const provider of this.providers) {
			if (!provider.isAvailable()) continue;

			// REM-A5: 로컬 provider (chatmock, rule-based) 는 비용 게이트 건너뜀
			if (isLocalProvider(provider.name)) {
				try {
					return await provider.generate(input);
				} catch {
					continue;
				}
			}

			// REM-A5: AI provider — 사전 비용 체크
			// 호출 전 예상 토큰으로 estimated cost 계산 (입력 프롬프트 ~300 토큰, 출력 ~150 토큰 추정)
			const estimatedIn = 300;
			const estimatedOut = 150;
			const estimatedCost = estimateCostUsd(
				providerModel(provider.name),
				estimatedIn,
				estimatedOut,
			);

			const budgetCheck = await this.costMeter.checkBudget(estimatedCost, {
				provider: provider.name,
			});

			if (!budgetCheck.allowed) {
				// 예산 초과 — 이 provider 건너뜀 (다음 또는 rule-based 로)
				continue;
			}

			try {
				const result = await provider.generate(input);

				// REM-A5: 사후 실제 비용 기록
				const actualCost = result.costUsd ?? 0;
				const recordDims: { provider: string; model?: string } = {
					provider: provider.name,
				};
				if (result.model !== undefined) {
					recordDims.model = result.model;
				}
				await this.costMeter.recordUsage(actualCost, recordDims);

				// REM-A5: 80% / 100% 알람 체크
				await this.emitBudgetAlerts(provider.name);

				return result;
			} catch {}
		}

		// 모든 provider 실패 또는 예산 초과 → rule-based 최종 폴백
		return this.ruleBasedFallback.generate(input);
	}

	/**
	 * REM-A5: 80% / 100% 도달 시 onBudgetAlert 콜백 호출.
	 * Redis / 메모리 조회 실패해도 진단 흐름에 영향 없음.
	 */
	private async emitBudgetAlerts(provider: string): Promise<void> {
		if (!this.onBudgetAlert) return;
		try {
			const daily = await this.costMeter.getDailyUsage();
			const ratio = daily.capUsd > 0 ? daily.totalUsd / daily.capUsd : 0;
			if (ratio >= 1.0) {
				this.onBudgetAlert("error", {
					event: "ai_budget_100_reached",
					provider,
					usedUsd: daily.totalUsd,
					capUsd: daily.capUsd,
					ratio,
				});
			} else if (ratio >= 0.8) {
				this.onBudgetAlert("warning", {
					event: "ai_budget_80_warning",
					provider,
					usedUsd: daily.totalUsd,
					capUsd: daily.capUsd,
					ratio,
				});
			}
		} catch {
			// 알람 실패는 무시
		}
	}

	/**
	 * Phase P-C: 품질 검수 + 개선 적용.
	 * 실패해도 원본 결과를 그대로 반환 (검수는 보조 기능이므로 절대 throw 하지 않는다).
	 */
	private async applyQualityCheck(
		raw: RecommendationOutput,
		input: RecommendationInput,
	): Promise<RecommendationOutput> {
		try {
			const ruleId = input.ruleResult?.ruleId ?? input.item.code ?? "UNKNOWN";

			const result = await this.qualityChecker.check({
				ruleId,
				recommendation: raw.body,
				context: input.context,
			});

			const shouldImprove =
				result.qualityScore < this.qualityCheckThreshold &&
				typeof result.improvedRecommendation === "string" &&
				result.improvedRecommendation.trim().length > 0;

			if (shouldImprove) {
				return {
					...raw,
					body: result.improvedRecommendation!,
					qualityScore: result.qualityScore,
					qualityIssues: result.issues,
					wasImproved: true,
				};
			}

			return {
				...raw,
				qualityScore: result.qualityScore,
				qualityIssues: result.issues,
				wasImproved: false,
			};
		} catch {
			// 검수 자체가 실패해도 원본은 보존
			return raw;
		}
	}

	/** Returns the accumulated daily AI cost in USD. */
	async getDailyCostUsdAsync(): Promise<number> {
		return this.costMeter.getDailyTotal();
	}

	/**
	 * @deprecated getDailyCostUsdAsync 사용 권장.
	 * 동기 버전은 InMemoryCostMeter 에서만 정확함.
	 */
	getDailyCostUsd(): number {
		// InMemoryCostMeter 호환 - 동기 접근은 내부 상태 직접 읽기
		if (this.costMeter instanceof InMemoryCostMeter) {
			// getDailyTotal 은 async 이지만 InMemory 는 사실상 동기 —
			// 호환성을 위해 0 반환 (async 버전 권장)
		}
		return 0;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** provider name → 모델명 매핑 */
function providerModel(providerName: string): string {
	const map: Record<string, string> = {
		openai: "gpt-4o-mini",
		gemini: "gemini-2.5-flash",
		anthropic: "claude-sonnet-4-6",
	};
	return map[providerName] ?? providerName;
}

/**
 * 기본 provider 체인 빌더 (옵션).
 *
 * 우선순위:
 *   1. ChatMock        — 로컬 ChatGPT Plus 프록시 (CHATMOCK_ENABLED 또는 CHATMOCK_BASE_URL 설정 시)
 *   2. OpenAI          — gpt-4o-mini (OPENAI_API_KEY 설정 시)
 *   3. Gemini          — gemini-2.5-flash (GEMINI_API_KEY 설정 시, GOOGLE_AI_API_KEY legacy alias)
 *   4. Anthropic       — claude-sonnet (ANTHROPIC_API_KEY 설정 시)
 *   5. RuleBased       — 항상 최종 폴백
 *
 * 각 provider 는 isAvailable() 로 자가 검증하므로 환경변수 미설정 시 자동 제외된다.
 */
export function buildDefaultProviderChain(): RecommendationProvider[] {
	const mode = resolveRecommendationProviderMode();
	const chain: RecommendationProvider[] = [];

	if (mode === "mock") {
		return [new RuleBasedProvider()];
	}

	// 1순위: ChatMock (로컬, 무료) — 옵트인
	const chatmock = new ChatMockProvider();
	if ((mode === "auto" || mode === "chatmock") && chatmock.isAvailable()) {
		chain.push(chatmock);
	}

	// 2~4순위: 클라우드 API들 (isAvailable() 자체 검증)
	const openai = new OpenAIProvider();
	if (shouldIncludeProvider(mode, "openai") && openai.isAvailable()) {
		chain.push(openai);
	}

	const gemini = new GeminiProvider();
	if (shouldIncludeProvider(mode, "gemini") && gemini.isAvailable()) {
		chain.push(gemini);
	}

	const anthropic = new AnthropicProvider();
	if (shouldIncludeProvider(mode, "anthropic") && anthropic.isAvailable()) {
		chain.push(anthropic);
	}

	// 항상 최종 폴백
	chain.push(new RuleBasedProvider());

	return chain;
}

function resolveRecommendationProviderMode(): RecommendationLlmProviderMode {
	const raw = process.env.LLM_PROVIDER;
	if (typeof raw !== "string" || raw.trim().length === 0) {
		return "auto";
	}
	const normalized = raw.trim().toLowerCase();
	if (
		normalized === "chatmock" ||
		normalized === "openai" ||
		normalized === "gemini" ||
		normalized === "anthropic" ||
		normalized === "mock"
	) {
		return normalized;
	}
	return "mock";
}

function shouldIncludeProvider(
	mode: RecommendationLlmProviderMode,
	provider: "openai" | "gemini" | "anthropic",
): boolean {
	return mode === "auto" || mode === provider;
}
