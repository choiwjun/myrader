/**
 * X-SAG Core Engine — AI Cost Meter (TASK-CORE-013, REM-A5)
 *
 * @TASK REM-A5 - AI 비용 미터 강제 게이트
 * @SPEC docs/features/x-sag-diagnosis-engine/TRD.md#9.5
 *
 * POLICY § 7.2: AI 일일 비용 한도 관리
 * - 일일 한도: $50 USD (기본, ENV AI_DAILY_BUDGET_USD)
 * - 비용 초과 시 자동 rule-based fallback
 * - 80% / 100% 도달 시 observability 알람
 * - InMemoryCostMeter: 개발/테스트용 (process restart 시 리셋)
 * - RedisCostMeter: 프로덕션용 (분산 추적, INCRBYFLOAT 원자성)
 *
 * 로컬 provider 면제:
 * - "chatmock", "rule-based" 는 일일 누적/한도에서 제외
 * - provider 별 카운터에는 별도 기록 (관측용)
 */

// ---------------------------------------------------------------------------
// Local provider set
// ---------------------------------------------------------------------------

/**
 * 비용 한도 계산에서 제외되는 로컬 provider 목록.
 * 이 provider 들은 구독/오프라인 기반이라 호출당 과금이 없음.
 */
const LOCAL_PROVIDERS = new Set(["chatmock", "rule-based"]);

/**
 * 주어진 provider 명이 비용 면제 대상인지 확인.
 */
export function isLocalProvider(provider: string): boolean {
	return LOCAL_PROVIDERS.has(provider);
}

// ---------------------------------------------------------------------------
// CostMeter interface
// ---------------------------------------------------------------------------

export interface DailyUsageResult {
	totalUsd: number;
	byProvider: Record<string, number>;
	capUsd: number;
}

export interface BudgetCheckResult {
	allowed: boolean;
	remainingUsd: number;
	usedUsd: number;
	capUsd: number;
}

/**
 * CostMeter 인터페이스 — AI 비용 관리 추상화
 *
 * 구현체:
 * - InMemoryCostMeter: 개발/테스트용 (메모리 기반)
 * - RedisCostMeter: 프로덕션용 (Redis INCRBYFLOAT, 분산 추적)
 */
export interface CostMeter {
	/**
	 * 추정 비용으로 한도 가능 여부 판단 (사전 체크).
	 *
	 * @param estimatedCostUsd - 추정 비용 (USD)
	 * @param dimensions - provider, date 등 추가 차원
	 */
	checkBudget(
		estimatedCostUsd: number,
		dimensions?: { provider?: string; date?: string },
	): Promise<BudgetCheckResult>;

	/**
	 * 실제 사용 비용 기록 (사후).
	 *
	 * @param actualCostUsd - 실제 비용 (USD)
	 * @param dimensions - provider, model, tokensIn, tokensOut
	 */
	recordUsage(
		actualCostUsd: number,
		dimensions: {
			provider: string;
			model?: string;
			tokensIn?: number;
			tokensOut?: number;
		},
	): Promise<void>;

	/**
	 * 일별 통계 조회.
	 *
	 * @param date - YYYY-MM-DD (기본: 오늘 KST)
	 */
	getDailyUsage(date?: string): Promise<DailyUsageResult>;

	// ---------------------------------------------------------------------------
	// Legacy API (backward-compatible — InMemoryCostMeter 용)
	// ---------------------------------------------------------------------------

	/**
	 * @deprecated checkBudget 사용 권장.
	 * 추정 비용으로 현재 한도를 초과할지 확인.
	 */
	check(
		estimatedCostUsd: number,
	): Promise<{ allowed: boolean; remainingUsd: number }>;

	/**
	 * @deprecated recordUsage 사용 권장.
	 * 실제 사용한 비용을 기록.
	 */
	record(actualCostUsd: number, provider: string): Promise<void>;

	/**
	 * @deprecated getDailyUsage 사용 권장.
	 * 현재 일일 누적 비용을 반환.
	 */
	getDailyTotal(): Promise<number>;
}

// ---------------------------------------------------------------------------
// InMemoryCostMeter — 개발/테스트용
// ---------------------------------------------------------------------------

/**
 * InMemoryCostMeter — process 메모리 기반 비용 추적
 *
 * - process restart 시 리셋
 * - 단일 인스턴스 환경(개발/테스트)에 적합
 * - 프로덕션 다중 인스턴스에서는 RedisCostMeter 사용
 */
export class InMemoryCostMeter implements CostMeter {
	private readonly dailyCostCapUsd: number;
	private dailyCostAccumulated = 0;
	private dailyCostResetAt: Date;
	private costByProvider: Record<string, number> = {};

	constructor(dailyCostCapUsd?: number) {
		const envCap = Number.parseFloat(process.env.AI_DAILY_BUDGET_USD ?? "");
		this.dailyCostCapUsd =
			dailyCostCapUsd ?? (Number.isFinite(envCap) && envCap > 0 ? envCap : 50);
		this.dailyCostResetAt = startOfNextDay();
	}

	// ---- New API ----

	async checkBudget(
		estimatedCostUsd: number,
		_dimensions?: { provider?: string; date?: string },
	): Promise<BudgetCheckResult> {
		this.maybeResetDailyCost();
		const usedUsd = this.dailyCostAccumulated;
		const remaining = Math.max(0, this.dailyCostCapUsd - usedUsd);
		const allowed =
			estimatedCostUsd > 0 ? estimatedCostUsd <= remaining : remaining > 0;
		return {
			allowed,
			remainingUsd: remaining,
			usedUsd,
			capUsd: this.dailyCostCapUsd,
		};
	}

	async recordUsage(
		actualCostUsd: number,
		dimensions: {
			provider: string;
			model?: string;
			tokensIn?: number;
			tokensOut?: number;
		},
	): Promise<void> {
		await this.record(actualCostUsd, dimensions.provider);
	}

	async getDailyUsage(_date?: string): Promise<DailyUsageResult> {
		this.maybeResetDailyCost();
		return {
			totalUsd: this.dailyCostAccumulated,
			byProvider: { ...this.costByProvider },
			capUsd: this.dailyCostCapUsd,
		};
	}

	// ---- Legacy API ----

	async check(
		estimatedCostUsd: number,
	): Promise<{ allowed: boolean; remainingUsd: number }> {
		const result = await this.checkBudget(estimatedCostUsd);
		return { allowed: result.allowed, remainingUsd: result.remainingUsd };
	}

	async record(actualCostUsd: number, provider: string): Promise<void> {
		this.maybeResetDailyCost();
		// 로컬 provider (chatmock, rule-based) 는 일일 누적/한도 계산에서 제외.
		if (LOCAL_PROVIDERS.has(provider)) {
			this.costByProvider[provider] = this.costByProvider[provider] ?? 0;
			return;
		}
		this.dailyCostAccumulated += actualCostUsd;
		this.costByProvider[provider] =
			(this.costByProvider[provider] ?? 0) + actualCostUsd;
	}

	async getDailyTotal(): Promise<number> {
		this.maybeResetDailyCost();
		return this.dailyCostAccumulated;
	}

	// ---- Test helpers ----

	/** 테스트용 헬퍼: 누적 비용 강제 리셋 */
	async reset(): Promise<void> {
		this.dailyCostAccumulated = 0;
		this.costByProvider = {};
		this.dailyCostResetAt = startOfNextDay();
	}

	/** 테스트용 헬퍼: provider별 누적 비용 조회 */
	async getCostByProvider(provider: string): Promise<number> {
		return this.costByProvider[provider] ?? 0;
	}

	private maybeResetDailyCost(): void {
		const now = new Date();
		if (now >= this.dailyCostResetAt) {
			this.dailyCostAccumulated = 0;
			this.costByProvider = {};
			this.dailyCostResetAt = startOfNextDay();
		}
	}
}

// ---------------------------------------------------------------------------
// RedisCostMeter — 프로덕션용 (분산 추적)
// ---------------------------------------------------------------------------

/**
 * Redis 클라이언트 최소 인터페이스 (ioredis 호환).
 * core-engine 은 apps/api 에 직접 의존하지 않으므로 인터페이스로 주입.
 */
export interface RedisLike {
	incrbyfloat(key: string, increment: number): Promise<string | number>;
	get(key: string): Promise<string | null>;
	keys(pattern: string): Promise<string[]>;
	expire(key: string, seconds: number): Promise<number | boolean>;
}

/**
 * RedisCostMeter — 프로덕션용 Redis 기반 비용 미터
 *
 * 특징:
 * - INCRBYFLOAT 로 원자적 업데이트 (race-condition 방지)
 * - TTL 48h (자정 KST 기준 다음날까지 전날 데이터 보존)
 * - Redis 호출 실패 시 graceful degradation (진단은 계속 진행)
 *
 * Redis 키 형식:
 * - `ai:cost:daily:{YYYY-MM-DD}:total` — 전체 일일 누적 USD
 * - `ai:cost:daily:{YYYY-MM-DD}:provider:{provider}` — 공급자별 누적
 */
export class RedisCostMeter implements CostMeter {
	private readonly dailyCostCapUsd: number;

	constructor(
		private readonly redis: RedisLike,
		dailyCostCapUsd?: number,
	) {
		const envCap = Number.parseFloat(process.env.AI_DAILY_BUDGET_USD ?? "");
		this.dailyCostCapUsd =
			dailyCostCapUsd ?? (Number.isFinite(envCap) && envCap > 0 ? envCap : 50);
	}

	// ---- New API ----

	async checkBudget(
		estimatedCostUsd: number,
		dimensions?: { provider?: string; date?: string },
	): Promise<BudgetCheckResult> {
		try {
			const date = dimensions?.date ?? todayKst();
			const totalKey = dailyTotalKey(date);
			const rawTotal = await this.redis.get(totalKey);
			const usedUsd = rawTotal ? Number.parseFloat(rawTotal) : 0;
			const remaining = Math.max(0, this.dailyCostCapUsd - usedUsd);
			const allowed =
				estimatedCostUsd > 0 ? estimatedCostUsd <= remaining : remaining > 0;
			return {
				allowed,
				remainingUsd: remaining,
				usedUsd,
				capUsd: this.dailyCostCapUsd,
			};
		} catch {
			// Redis 실패 → fail-open (진단 계속, 비용 추적 건너뜀)
			return {
				allowed: true,
				remainingUsd: this.dailyCostCapUsd,
				usedUsd: 0,
				capUsd: this.dailyCostCapUsd,
			};
		}
	}

	async recordUsage(
		actualCostUsd: number,
		dimensions: {
			provider: string;
			model?: string;
			tokensIn?: number;
			tokensOut?: number;
		},
	): Promise<void> {
		await this.record(actualCostUsd, dimensions.provider);
	}

	async getDailyUsage(date?: string): Promise<DailyUsageResult> {
		try {
			const d = date ?? todayKst();
			const totalKey = dailyTotalKey(d);
			const rawTotal = await this.redis.get(totalKey);
			const totalUsd = rawTotal ? Number.parseFloat(rawTotal) : 0;

			// provider별 키 스캔
			const providerKeyPattern = `ai:cost:daily:${d}:provider:*`;
			const providerKeys = await this.redis.keys(providerKeyPattern);
			const byProvider: Record<string, number> = {};
			for (const key of providerKeys) {
				const raw = await this.redis.get(key);
				if (raw) {
					const providerName = key.split(":provider:")[1] ?? key;
					byProvider[providerName] = Number.parseFloat(raw);
				}
			}

			return { totalUsd, byProvider, capUsd: this.dailyCostCapUsd };
		} catch {
			return { totalUsd: 0, byProvider: {}, capUsd: this.dailyCostCapUsd };
		}
	}

	// ---- Legacy API ----

	async check(
		estimatedCostUsd: number,
	): Promise<{ allowed: boolean; remainingUsd: number }> {
		const result = await this.checkBudget(estimatedCostUsd);
		return { allowed: result.allowed, remainingUsd: result.remainingUsd };
	}

	async record(actualCostUsd: number, provider: string): Promise<void> {
		if (LOCAL_PROVIDERS.has(provider) || actualCostUsd <= 0) return;

		try {
			const date = todayKst();
			const totalKey = dailyTotalKey(date);
			const providerKey = `ai:cost:daily:${date}:provider:${provider}`;
			const ttlSeconds = 48 * 3600; // 48h

			// 원자적 누적 (INCRBYFLOAT)
			await this.redis.incrbyfloat(totalKey, actualCostUsd);
			await this.redis.expire(totalKey, ttlSeconds);
			await this.redis.incrbyfloat(providerKey, actualCostUsd);
			await this.redis.expire(providerKey, ttlSeconds);
		} catch {
			// Redis 실패 → graceful (비용 추적 못 해도 진단 진행)
		}
	}

	async getDailyTotal(): Promise<number> {
		const usage = await this.getDailyUsage();
		return usage.totalUsd;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 오늘 날짜 KST 기준 YYYY-MM-DD */
function todayKst(): string {
	// KST = UTC+9
	const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
	const y = kst.getUTCFullYear();
	const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
	const d = String(kst.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** daily total Redis 키 */
function dailyTotalKey(date: string): string {
	return `ai:cost:daily:${date}:total`;
}

/** 다음 자정 계산 (InMemoryCostMeter 용) */
function startOfNextDay(): Date {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	d.setHours(0, 0, 0, 0);
	return d;
}
