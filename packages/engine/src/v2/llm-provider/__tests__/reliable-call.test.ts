/**
 * v2/llm-provider — callLlmWithReliability 단위 테스트 (GAP 3 wiring helper)
 *
 * 세 호출 지점(geo/aeo/rule validator)이 공유하는 retry+breaker 오케스트레이션.
 * 모두 결정론적 (sleep/now 주입).
 *
 * 핵심 계약 검증:
 * 1. systemic 429 → 재시도 안 함 (underlying call == 1) + rethrow
 * 2. 일시적 에러 → maxAttempts 까지 재시도 후 rethrow
 * 3. systemic 실패가 breaker 를 trip → 이후 호출 fail-fast(CircuitOpenError, 미호출)
 * 4. 성공은 breaker 실패 카운트를 리셋
 * 5. breaker 미주입이면 회로 차단 없이 재시도만
 */

import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../circuit-breaker.js";
import { LlmHttpError } from "../errors.js";
import { callLlmWithReliability } from "../reliable-call.js";

const noSleep = async () => {};

describe("callLlmWithReliability() — GAP 3 retry+breaker 결합", () => {
	it("systemic 429 는 재시도하지 않고 즉시 throw 한다 (underlying call == 1)", async () => {
		const fn = vi.fn(async () => {
			throw new LlmHttpError(429, "Too Many Requests");
		});

		await expect(
			callLlmWithReliability(fn, {
				providerId: "openai",
				retry: { maxAttempts: 3, baseDelayMs: 10, sleep: noSleep },
			}),
		).rejects.toBeInstanceOf(LlmHttpError);

		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("일시적 에러는 maxAttempts 까지 재시도 후 throw 한다", async () => {
		const fn = vi.fn(async () => {
			throw new Error("network");
		});

		await expect(
			callLlmWithReliability(fn, {
				providerId: "openai",
				retry: { maxAttempts: 3, baseDelayMs: 10, sleep: noSleep },
			}),
		).rejects.toThrow("network");

		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("systemic 실패가 breaker 를 trip → 이후 호출은 fail-fast (underlying 미호출)", async () => {
		const clock = 0;
		const breaker = new CircuitBreaker({
			threshold: 2,
			cooldownMs: 1000,
			now: () => clock,
		});
		const fn = vi.fn(async () => {
			throw new LlmHttpError(401, "Unauthorized");
		});

		// 첫 2회: 각각 1회 호출 + systemic 실패 → breaker open
		for (let i = 0; i < 2; i++) {
			await expect(
				callLlmWithReliability(fn, {
					providerId: "openai",
					breaker,
					retry: { maxAttempts: 3, baseDelayMs: 10, sleep: noSleep },
				}),
			).rejects.toBeInstanceOf(LlmHttpError);
		}
		expect(fn).toHaveBeenCalledTimes(2);
		expect(breaker.getState("openai")).toBe("open");

		// 3번째: open 이므로 underlying 호출 없이 CircuitOpenError
		await expect(
			callLlmWithReliability(fn, {
				providerId: "openai",
				breaker,
				retry: { maxAttempts: 3, baseDelayMs: 10, sleep: noSleep },
			}),
		).rejects.toBeInstanceOf(CircuitOpenError);
		expect(fn).toHaveBeenCalledTimes(2); // 증가하지 않음
	});

	it("성공은 breaker 의 연속 실패 카운트를 리셋한다", async () => {
		const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
		let calls = 0;
		const fn = vi.fn(async () => {
			calls += 1;
			if (calls <= 2) throw new LlmHttpError(403, "Forbidden");
			return "ok";
		});

		// 2회 systemic 실패 (threshold 3 미달)
		for (let i = 0; i < 2; i++) {
			await expect(
				callLlmWithReliability(fn, {
					providerId: "openai",
					breaker,
					retry: { maxAttempts: 1, sleep: noSleep },
				}),
			).rejects.toBeInstanceOf(LlmHttpError);
		}
		expect(breaker.getState("openai")).toBe("closed");

		// 성공 → 카운트 리셋
		const out = await callLlmWithReliability(fn, {
			providerId: "openai",
			breaker,
			retry: { maxAttempts: 1, sleep: noSleep },
		});
		expect(out).toBe("ok");
		expect(breaker.getState("openai")).toBe("closed");
	});

	it("breaker 미주입이면 회로 차단 없이 재시도만 수행한다", async () => {
		const fn = vi.fn(async () => "ok");
		const out = await callLlmWithReliability(fn, {
			providerId: "openai",
			retry: { maxAttempts: 3, sleep: noSleep },
		});
		expect(out).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
