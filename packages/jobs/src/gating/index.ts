/**
 * @TASK P0-T3 - 비용 게이팅 기본 정책
 * @SPEC docs/planning/02-trd.md#5-리스크 (AI 인용·SERP 비용 폭증 → 게이팅)
 * @SPEC docs/planning/07-coding-convention.md#6 (어댑터/레지스트리 확장점)
 */

/** [비용 게이팅] 게이트가 보호하는 비용 발생 작업 종류. */
export type CostGatedOperation = "llm_validation" | "serp_query" | "ai_overview";

/** [비용 게이팅] 게이트 판단에 필요한 컨텍스트. */
export interface CostGateContext {
  operation: CostGatedOperation;
  /** 진단/비즈니스 식별자 (쿼터·캐시 키 산정용). */
  diagnosisId?: string;
  businessId?: string;
  /** 플랜 티어 (티어별 한도 차등용). */
  plan?: "free" | "basic" | "pro" | "business";
  /** 이번 호출의 예상 단위 수(토큰·쿼리 수 등). */
  estimatedUnits?: number;
}

/** [비용 게이팅] 게이트 판단 결과. */
export interface CostGateDecision {
  /** true면 호출 허용, false면 차단. */
  allowed: boolean;
  /** 차단/허용 사유 (로깅·UI 카피용, 민감정보 비포함). */
  reason: string;
  /** 차단 시 권장 폴백 (예: 캐시 사용·다음 진단 회차로 연기). */
  fallback?: "use_cache" | "defer" | "skip";
}

/** [비용 게이팅] 비용 발생 작업 허용 여부를 판단하는 게이트 함수 시그니처. */
export type CostGate = (ctx: CostGateContext) => Promise<CostGateDecision>;

export interface CostGateStore {
  grantedCache: Map<string, number>;
  dailyUsage: Map<string, number>;
  monthlyUsage: Map<string, number>;
}

export interface CostGatePolicyConfig {
  allowInNonProduction: boolean;
  cacheTtlMs: number;
  dailyLimit: number;
  monthlyLimit: number;
  fallbackOnDeny: "use_cache" | "defer" | "skip";
  requireSubjectKey: boolean;
}

const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_LIMIT = 1;
const DEFAULT_MONTHLY_LIMIT = 20;

export function createInMemoryCostGateStore(): CostGateStore {
  return {
    grantedCache: new Map<string, number>(),
    dailyUsage: new Map<string, number>(),
    monthlyUsage: new Map<string, number>(),
  };
}

export function readCostGatePolicyConfig(
  env: NodeJS.ProcessEnv = process.env,
): CostGatePolicyConfig {
  return {
    allowInNonProduction: readBooleanEnv(env, "BOINA_COST_GATE_ALLOW_NON_PRODUCTION", true),
    cacheTtlMs: readNumberEnv(env, "BOINA_COST_GATE_CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS),
    dailyLimit: readNumberEnv(env, "BOINA_COST_GATE_DAILY_LIMIT", DEFAULT_DAILY_LIMIT),
    monthlyLimit: readNumberEnv(env, "BOINA_COST_GATE_MONTHLY_LIMIT", DEFAULT_MONTHLY_LIMIT),
    fallbackOnDeny: readFallbackEnv(env, "BOINA_COST_GATE_FALLBACK", "defer"),
    requireSubjectKey: readBooleanEnv(env, "BOINA_COST_GATE_REQUIRE_SUBJECT_KEY", true),
  };
}

/**
 * 완전 허용 게이트. 테스트/비상우회에서만 사용한다.
 */
export const allowAllCostGate: CostGate = async (ctx) => ({
  allowed: true,
  reason: `allow_all:${ctx.operation}`,
});

export function createConfigurableCostGate(
  config: Partial<CostGatePolicyConfig> = {},
  store: CostGateStore = createInMemoryCostGateStore(),
): CostGate {
  const merged: CostGatePolicyConfig = {
    ...readCostGatePolicyConfig(),
    ...config,
  };

  return async (ctx) => {
    if (merged.allowInNonProduction && process.env.NODE_ENV !== "production") {
      return { allowed: true, reason: `non_production:${ctx.operation}` };
    }

    const subjectKey = resolveSubjectKey(ctx);
    if (!subjectKey && merged.requireSubjectKey) {
      return {
        allowed: false,
        reason: `missing_subject_key:${ctx.operation}`,
        fallback: merged.fallbackOnDeny,
      };
    }

    const scopedKey = buildScopedKey(ctx.operation, subjectKey ?? "anonymous");
    const cachedUntil = store.grantedCache.get(scopedKey);
    if (typeof cachedUntil === "number" && cachedUntil > Date.now()) {
      return { allowed: true, reason: `cache_hit:${ctx.operation}` };
    }

    const dailyKey = `${dayBucket()}:${scopedKey}`;
    const monthlyKey = `${monthBucket()}:${scopedKey}`;
    const dailyLimit = limitForPlan(merged.dailyLimit, ctx.plan);
    const monthlyLimit = limitForPlan(merged.monthlyLimit, ctx.plan);
    const dailyUsage = store.dailyUsage.get(dailyKey) ?? 0;
    const monthlyUsage = store.monthlyUsage.get(monthlyKey) ?? 0;

    if (dailyUsage >= dailyLimit) {
      return {
        allowed: false,
        reason: `daily_quota_exceeded:${ctx.operation}`,
        fallback: merged.fallbackOnDeny,
      };
    }
    if (monthlyUsage >= monthlyLimit) {
      return {
        allowed: false,
        reason: `monthly_quota_exceeded:${ctx.operation}`,
        fallback: merged.fallbackOnDeny,
      };
    }

    store.dailyUsage.set(dailyKey, dailyUsage + 1);
    store.monthlyUsage.set(monthlyKey, monthlyUsage + 1);
    if (merged.cacheTtlMs > 0) {
      store.grantedCache.set(scopedKey, Date.now() + merged.cacheTtlMs);
    }
    return { allowed: true, reason: `granted:${ctx.operation}` };
  };
}

/**
 * 보수적 기본 게이트.
 * - dev/test: 기본 허용(실키 없는 로컬·테스트 완주 보호)
 * - production: businessId/diagnosisId 단위로 낮은 일/월 한도 + 캐시 재사용
 */
export const defaultCostGate: CostGate = createConfigurableCostGate();

function resolveSubjectKey(ctx: CostGateContext): string | null {
  const businessId = ctx.businessId?.trim();
  if (businessId) return `business:${businessId}`;
  const diagnosisId = ctx.diagnosisId?.trim();
  if (diagnosisId) return `diagnosis:${diagnosisId}`;
  return null;
}

function buildScopedKey(operation: CostGatedOperation, subjectKey: string): string {
  return `${operation}:${subjectKey}`;
}

function limitForPlan(base: number, plan: CostGateContext["plan"]): number {
  if (base <= 0) return 0;
  switch (plan) {
    case "basic":
      return Math.max(base, base * 2);
    case "pro":
      return Math.max(base, base * 4);
    case "business":
      return Math.max(base, base * 10);
    default:
      return base;
  }
}

function dayBucket(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function monthBucket(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function readNumberEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readBooleanEnv(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function readFallbackEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: CostGatePolicyConfig["fallbackOnDeny"],
): CostGatePolicyConfig["fallbackOnDeny"] {
  const raw = env[key]?.trim();
  return raw === "use_cache" || raw === "defer" || raw === "skip" ? raw : fallback;
}
