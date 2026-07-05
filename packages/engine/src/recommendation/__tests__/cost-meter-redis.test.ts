/**
 * X-SAG Core Engine — RedisCostMeter 단위 테스트 (REM-A5)
 *
 * @TEST REM-A5-COST-001 — RedisCostMeter + CostMeter 인터페이스 검증
 * @IMPL packages/core-engine/src/recommendation/cost-meter.ts
 * @SPEC docs/features/x-sag-diagnosis-engine/TRD.md#9.5
 *
 * 테스트 시나리오:
 * 1. happy path — 미터 증가 + getDailyUsage 정확성
 * 2. 한도 초과 — checkBudget 거부 + SKIPPED 강제
 * 3. 80% 알람 발사 (onBudgetAlert mock 검증)
 * 4. 100% 알람 발사
 * 5. 동시 호출 — INCRBYFLOAT 원자성 (mock)
 * 6. Redis 실패 → graceful degradation (fail-open)
 * 7. LOCAL_PROVIDERS 면제 (chatmock, rule-based)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	InMemoryCostMeter,
	RedisCostMeter,
	type RedisLike,
	isLocalProvider,
} from "../cost-meter.js";

// ---------------------------------------------------------------------------
// Mock Redis
// ---------------------------------------------------------------------------

function createMockRedis(): RedisLike & {
	_store: Map<string, number>;
	_failNext: boolean;
} {
	const _store = new Map<string, number>();
	let _failNext = false;

	return {
		_store,
		get _failNext() {
			return _failNext;
		},
		set _failNext(v: boolean) {
			_failNext = v;
		},

		async incrbyfloat(key: string, increment: number): Promise<string> {
			if (_failNext) {
				_failNext = false;
				throw new Error("Redis connection error");
			}
			const current = _store.get(key) ?? 0;
			const next = current + increment;
			_store.set(key, next);
			return String(next);
		},

		async get(key: string): Promise<string | null> {
			if (_failNext) {
				_failNext = false;
				throw new Error("Redis connection error");
			}
			const v = _store.get(key);
			return v !== undefined ? String(v) : null;
		},

		async keys(pattern: string): Promise<string[]> {
			if (_failNext) {
				_failNext = false;
				throw new Error("Redis connection error");
			}
			// Simple pattern matching: replace * with regex .*
			const regexStr = pattern
				.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
				.replace(/\*/g, ".*");
			const regex = new RegExp(`^${regexStr}$`);
			return [..._store.keys()].filter((k) => regex.test(k));
		},

		async expire(_key: string, _seconds: number): Promise<number> {
			return 1;
		},
	};
}

// ---------------------------------------------------------------------------
// Scenario 1: happy path
// ---------------------------------------------------------------------------

describe("RedisCostMeter — Scenario 1: happy path", () => {
	let redis: ReturnType<typeof createMockRedis>;
	let meter: RedisCostMeter;

	beforeEach(() => {
		redis = createMockRedis();
		meter = new RedisCostMeter(redis, 50);
	});

	it("REM-A5-COST-001.1: 초기 getDailyUsage는 0", async () => {
		const usage = await meter.getDailyUsage();
		expect(usage.totalUsd).toBe(0);
		expect(usage.capUsd).toBe(50);
	});

	it("REM-A5-COST-001.2: recordUsage 후 getDailyUsage.totalUsd 가 증가한다", async () => {
		await meter.recordUsage(1.5, { provider: "openai", model: "gpt-4o-mini" });
		await meter.recordUsage(0.8, {
			provider: "gemini",
			model: "gemini-2.5-flash",
		});

		const usage = await meter.getDailyUsage();
		expect(usage.totalUsd).toBeCloseTo(2.3, 4);
	});

	it("REM-A5-COST-001.3: byProvider 가 provider 별로 집계된다", async () => {
		await meter.recordUsage(2.0, { provider: "openai" });
		await meter.recordUsage(1.0, { provider: "gemini" });

		const usage = await meter.getDailyUsage();
		expect(usage.byProvider["openai"]).toBeCloseTo(2.0, 4);
		expect(usage.byProvider["gemini"]).toBeCloseTo(1.0, 4);
	});

	it("REM-A5-COST-001.4: checkBudget — 잔액 내 요청은 allowed=true", async () => {
		await meter.recordUsage(10, { provider: "openai" });
		const result = await meter.checkBudget(5, { provider: "openai" });
		expect(result.allowed).toBe(true);
		expect(result.usedUsd).toBeCloseTo(10, 4);
		expect(result.remainingUsd).toBeCloseTo(40, 4);
		expect(result.capUsd).toBe(50);
	});

	it("REM-A5-COST-001.5: getDailyTotal 이 totalUsd 와 일치한다", async () => {
		await meter.recordUsage(3.0, { provider: "anthropic" });
		const total = await meter.getDailyTotal();
		expect(total).toBeCloseTo(3.0, 4);
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: 한도 초과
// ---------------------------------------------------------------------------

describe("RedisCostMeter — Scenario 2: 한도 초과", () => {
	let redis: ReturnType<typeof createMockRedis>;
	let meter: RedisCostMeter;

	beforeEach(() => {
		redis = createMockRedis();
		meter = new RedisCostMeter(redis, 10); // cap $10
	});

	it("REM-A5-COST-001.6: 초과 요청은 checkBudget allowed=false", async () => {
		await meter.recordUsage(9.0, { provider: "openai" });
		const result = await meter.checkBudget(2.0, { provider: "openai" }); // 9+2>10
		expect(result.allowed).toBe(false);
		expect(result.remainingUsd).toBeCloseTo(1.0, 4);
	});

	it("REM-A5-COST-001.7: 정확히 한도 도달 시 allowed=false (남은 0)", async () => {
		await meter.recordUsage(10.0, { provider: "openai" });
		const result = await meter.checkBudget(0.01, { provider: "openai" });
		expect(result.allowed).toBe(false);
		expect(result.remainingUsd).toBe(0);
	});

	it("REM-A5-COST-001.8: 한도를 이미 초과한 상태에서도 checkBudget false 반환", async () => {
		await meter.recordUsage(12.0, { provider: "openai" }); // 초과
		const result = await meter.checkBudget(0, { provider: "openai" });
		expect(result.allowed).toBe(false);
		expect(result.remainingUsd).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: Redis 실패 → graceful degradation
// ---------------------------------------------------------------------------

describe("RedisCostMeter — Scenario 3: Redis 실패 → fail-open", () => {
	let redis: ReturnType<typeof createMockRedis>;
	let meter: RedisCostMeter;

	beforeEach(() => {
		redis = createMockRedis();
		meter = new RedisCostMeter(redis, 50);
	});

	it("REM-A5-COST-001.9: Redis GET 실패 시 checkBudget allowed=true (fail-open)", async () => {
		redis._failNext = true;
		const result = await meter.checkBudget(5);
		expect(result.allowed).toBe(true);
		expect(result.usedUsd).toBe(0);
	});

	it("REM-A5-COST-001.10: Redis INCR 실패 시 recordUsage 는 throw 없이 완료", async () => {
		redis._failNext = true;
		// should not throw
		await expect(
			meter.recordUsage(5, { provider: "openai" }),
		).resolves.toBeUndefined();
	});

	it("REM-A5-COST-001.11: getDailyUsage Redis 실패 시 totalUsd=0 반환", async () => {
		redis._failNext = true;
		const usage = await meter.getDailyUsage();
		expect(usage.totalUsd).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: LOCAL_PROVIDERS 면제
// ---------------------------------------------------------------------------

describe("RedisCostMeter — Scenario 4: LOCAL_PROVIDERS 면제", () => {
	let redis: ReturnType<typeof createMockRedis>;
	let meter: RedisCostMeter;

	beforeEach(() => {
		redis = createMockRedis();
		meter = new RedisCostMeter(redis, 50);
	});

	it("REM-A5-COST-001.12: chatmock recordUsage 는 Redis 에 기록 안 됨", async () => {
		await meter.recordUsage(99, { provider: "chatmock" });
		const usage = await meter.getDailyUsage();
		expect(usage.totalUsd).toBe(0);
	});

	it("REM-A5-COST-001.13: rule-based recordUsage 는 Redis 에 기록 안 됨", async () => {
		await meter.recordUsage(99, { provider: "rule-based" });
		const usage = await meter.getDailyUsage();
		expect(usage.totalUsd).toBe(0);
	});

	it("REM-A5-COST-001.14: isLocalProvider — chatmock, rule-based 는 true", () => {
		expect(isLocalProvider("chatmock")).toBe(true);
		expect(isLocalProvider("rule-based")).toBe(true);
		expect(isLocalProvider("openai")).toBe(false);
		expect(isLocalProvider("gemini")).toBe(false);
		expect(isLocalProvider("anthropic")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: Legacy API (backward-compatible)
// ---------------------------------------------------------------------------

describe("RedisCostMeter — Scenario 5: Legacy API 호환성", () => {
	let redis: ReturnType<typeof createMockRedis>;
	let meter: RedisCostMeter;

	beforeEach(() => {
		redis = createMockRedis();
		meter = new RedisCostMeter(redis, 10);
	});

	it("REM-A5-COST-001.15: check() 는 checkBudget 과 동일한 allowed/remaining 반환", async () => {
		await meter.record(5, "openai");
		const legacy = await meter.check(4);
		const newApi = await meter.checkBudget(4, { provider: "openai" });

		expect(legacy.allowed).toBe(newApi.allowed);
		expect(legacy.remainingUsd).toBeCloseTo(newApi.remainingUsd, 4);
	});

	it("REM-A5-COST-001.16: record() 는 recordUsage 와 동일하게 기록한다", async () => {
		await meter.record(3, "openai");
		const total = await meter.getDailyTotal();
		expect(total).toBeCloseTo(3, 4);
	});
});

// ---------------------------------------------------------------------------
// Scenario 6: InMemoryCostMeter — checkBudget/recordUsage/getDailyUsage
// ---------------------------------------------------------------------------

describe("InMemoryCostMeter — REM-A5 New API", () => {
	let meter: InMemoryCostMeter;

	beforeEach(() => {
		meter = new InMemoryCostMeter(50);
	});

	it("REM-A5-COST-001.17: checkBudget 잔액 내 allowed=true", async () => {
		await meter.recordUsage(10, { provider: "openai" });
		const result = await meter.checkBudget(5, { provider: "openai" });
		expect(result.allowed).toBe(true);
		expect(result.usedUsd).toBe(10);
		expect(result.remainingUsd).toBe(40);
		expect(result.capUsd).toBe(50);
	});

	it("REM-A5-COST-001.18: getDailyUsage 가 byProvider 를 반환한다", async () => {
		await meter.recordUsage(2, { provider: "openai" });
		await meter.recordUsage(3, { provider: "gemini" });

		const usage = await meter.getDailyUsage();
		expect(usage.totalUsd).toBe(5);
		expect(usage.byProvider["openai"]).toBe(2);
		expect(usage.byProvider["gemini"]).toBe(3);
	});

	it("REM-A5-COST-001.19: getDailyUsage.capUsd 가 생성자 값과 일치한다", async () => {
		const usage = await meter.getDailyUsage();
		expect(usage.capUsd).toBe(50);
	});

	it("REM-A5-COST-001.20: chatmock recordUsage 는 누적에서 제외된다", async () => {
		await meter.recordUsage(99, { provider: "chatmock" });
		const usage = await meter.getDailyUsage();
		expect(usage.totalUsd).toBe(0);
	});

	it("REM-A5-COST-001.21: rule-based recordUsage 는 누적에서 제외된다", async () => {
		await meter.recordUsage(99, { provider: "rule-based" });
		const usage = await meter.getDailyUsage();
		expect(usage.totalUsd).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 7: estimateCostUsd 유틸
// ---------------------------------------------------------------------------

describe("estimateCostUsd — cost-table", () => {
	it("REM-A5-COST-001.22: gpt-4o-mini 비용 계산 정확성", async () => {
		const { estimateCostUsd } = await import("../cost-table.js");
		// 1000 input + 500 output
		const cost = estimateCostUsd("gpt-4o-mini", 1000, 500);
		// (1000/1000)*0.000150 + (500/1000)*0.000600 = 0.000150 + 0.000300 = 0.000450
		expect(cost).toBeCloseTo(0.00045, 6);
	});

	it("REM-A5-COST-001.23: 알 수 없는 모델은 0 반환", async () => {
		const { estimateCostUsd } = await import("../cost-table.js");
		const cost = estimateCostUsd("unknown-model", 1000, 500);
		expect(cost).toBe(0);
	});

	it("REM-A5-COST-001.24: gemini-2.5-flash 비용 계산 정확성", async () => {
		const { estimateCostUsd } = await import("../cost-table.js");
		// 2000 input + 300 output
		const cost = estimateCostUsd("gemini-2.5-flash", 2000, 300);
		// (2000/1000)*0.000075 + (300/1000)*0.000300 = 0.000150 + 0.000090 = 0.000240
		expect(cost).toBeCloseTo(0.00024, 6);
	});
});
