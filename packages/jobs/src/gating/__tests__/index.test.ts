import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createConfigurableCostGate,
  createInMemoryCostGateStore,
  readCostGatePolicyConfig,
} from "../index.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configurable cost gate", () => {
  it("non-production 기본값은 허용한다", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const gate = createConfigurableCostGate({}, createInMemoryCostGateStore());

    await expect(
      gate({ operation: "llm_validation", businessId: "biz-1", diagnosisId: "diag-1" }),
    ).resolves.toMatchObject({ allowed: true, reason: "non_production:llm_validation" });
  });

  it("production 에서는 같은 subject의 재호출을 cache ttl 동안 허용 재사용한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const store = createInMemoryCostGateStore();
    const gate = createConfigurableCostGate(
      { allowInNonProduction: false, dailyLimit: 1, monthlyLimit: 1, cacheTtlMs: 60_000 },
      store,
    );

    const first = await gate({ operation: "llm_validation", businessId: "biz-1" });
    const second = await gate({ operation: "llm_validation", businessId: "biz-1" });

    expect(first).toMatchObject({ allowed: true, reason: "granted:llm_validation" });
    expect(second).toMatchObject({ allowed: true, reason: "cache_hit:llm_validation" });
  });

  it("production 에서는 quota 초과 시 defer 한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const gate = createConfigurableCostGate(
      {
        allowInNonProduction: false,
        dailyLimit: 1,
        monthlyLimit: 5,
        cacheTtlMs: 0,
        fallbackOnDeny: "defer",
      },
      createInMemoryCostGateStore(),
    );

    await gate({ operation: "llm_validation", businessId: "biz-1" });
    const denied = await gate({ operation: "llm_validation", businessId: "biz-1" });

    expect(denied).toMatchObject({
      allowed: false,
      reason: "daily_quota_exceeded:llm_validation",
      fallback: "defer",
    });
  });

  it("production 에서는 식별자 없는 요청을 보수적으로 차단한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const gate = createConfigurableCostGate(
      { allowInNonProduction: false, fallbackOnDeny: "skip" },
      createInMemoryCostGateStore(),
    );

    const denied = await gate({ operation: "llm_validation" });
    expect(denied).toMatchObject({
      allowed: false,
      reason: "missing_subject_key:llm_validation",
      fallback: "skip",
    });
  });

  it("env 설정을 읽어 숫자/폴백을 반영한다", () => {
    vi.stubEnv("BOINA_COST_GATE_DAILY_LIMIT", "3");
    vi.stubEnv("BOINA_COST_GATE_MONTHLY_LIMIT", "40");
    vi.stubEnv("BOINA_COST_GATE_CACHE_TTL_MS", "120000");
    vi.stubEnv("BOINA_COST_GATE_FALLBACK", "use_cache");
    vi.stubEnv("BOINA_COST_GATE_ALLOW_NON_PRODUCTION", "false");

    expect(readCostGatePolicyConfig()).toMatchObject({
      dailyLimit: 3,
      monthlyLimit: 40,
      cacheTtlMs: 120000,
      fallbackOnDeny: "use_cache",
      allowInNonProduction: false,
    });
  });
});
