/**
 * v2/llm-provider — withRetry 단위 테스트 (GAP 3)
 *
 * 검증 시나리오 (모두 결정론적 — sleep 주입으로 실타이머 미사용):
 * 1. 첫 시도 성공 → 재시도 없음, 결과 반환
 * 2. 일시적 에러(network) → maxAttempts 까지 재시도 후 성공
 * 3. maxAttempts 소진 → 마지막 에러 rethrow
 * 4. systemic LlmHttpError(429/401/403) → 재시도 없이 즉시 rethrow (호출 1회)
 * 5. shouldRetry=false 커스텀 predicate → 즉시 rethrow
 * 6. 지수 백오프 지연 시퀀스 (base, base*2, ... maxDelay 캡) 가 sleep 으로 전달됨
 * 7. sleep 미주입(기본값)이라도 maxAttempts=1 이면 sleep 호출 0 (실타이머 안 씀)
 */

import { describe, expect, it, vi } from "vitest";
import { LlmHttpError } from "../errors.js";
import { withRetry } from "../retry.js";

describe("withRetry() — GAP 3 지수 백오프 재시도", () => {
	it("첫 시도에 성공하면 재시도 없이 결과를 반환한다", async () => {
		const sleep = vi.fn(async () => {});
		const fn = vi.fn(async () => "ok");

		const out = await withRetry(fn, { sleep });

		expect(out).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("일시적 에러 후 재시도하여 성공한다 (maxAttempts 내)", async () => {
		const sleep = vi.fn(async () => {});
		let calls = 0;
		const fn = vi.fn(async () => {
			calls += 1;
			if (calls < 3) throw new Error("network blip");
			return "recovered";
		});

		const out = await withRetry(fn, {
			maxAttempts: 3,
			baseDelayMs: 100,
			maxDelayMs: 2000,
			sleep,
		});

		expect(out).toBe("recovered");
		expect(fn).toHaveBeenCalledTimes(3);
		// 2번의 실패 → 2번 sleep
		expect(sleep).toHaveBeenCalledTimes(2);
	});

	it("maxAttempts 를 소진하면 마지막 에러를 rethrow 한다", async () => {
		const sleep = vi.fn(async () => {});
		const fn = vi.fn(async () => {
			throw new Error("always fails");
		});

		await expect(
			withRetry(fn, { maxAttempts: 3, baseDelayMs: 50, sleep }),
		).rejects.toThrow("always fails");

		expect(fn).toHaveBeenCalledTimes(3);
		// 마지막 시도 후엔 sleep 하지 않음 → 2번
		expect(sleep).toHaveBeenCalledTimes(2);
	});

	it("systemic LlmHttpError(429) 는 재시도 없이 즉시 rethrow 한다 (호출 1회)", async () => {
		const sleep = vi.fn(async () => {});
		const fn = vi.fn(async () => {
			throw new LlmHttpError(429, "Too Many Requests");
		});

		await expect(
			withRetry(fn, { maxAttempts: 5, baseDelayMs: 50, sleep }),
		).rejects.toBeInstanceOf(LlmHttpError);

		expect(fn).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("systemic 401/403 도 재시도하지 않는다", async () => {
		const sleep = vi.fn(async () => {});
		for (const status of [401, 403]) {
			const fn = vi.fn(async () => {
				throw new LlmHttpError(status, "auth");
			});
			await expect(
				withRetry(fn, { maxAttempts: 4, baseDelayMs: 10, sleep }),
			).rejects.toBeInstanceOf(LlmHttpError);
			expect(fn).toHaveBeenCalledTimes(1);
		}
		expect(sleep).not.toHaveBeenCalled();
	});

	it("transient 5xx LlmHttpError(503) 는 재시도 대상이다", async () => {
		const sleep = vi.fn(async () => {});
		let calls = 0;
		const fn = vi.fn(async () => {
			calls += 1;
			if (calls < 2) throw new LlmHttpError(503, "Service Unavailable");
			return "ok";
		});

		const out = await withRetry(fn, {
			maxAttempts: 3,
			baseDelayMs: 10,
			sleep,
		});

		expect(out).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledTimes(1);
	});

	it("커스텀 shouldRetry 가 false 면 즉시 rethrow 한다", async () => {
		const sleep = vi.fn(async () => {});
		const fn = vi.fn(async () => {
			throw new Error("do-not-retry");
		});

		await expect(
			withRetry(fn, {
				maxAttempts: 5,
				baseDelayMs: 10,
				sleep,
				shouldRetry: () => false,
			}),
		).rejects.toThrow("do-not-retry");

		expect(fn).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("지수 백오프 지연 시퀀스가 maxDelay 로 캡된다", async () => {
		const delays: number[] = [];
		const sleep = vi.fn(async (ms: number) => {
			delays.push(ms);
		});
		const fn = vi.fn(async () => {
			throw new Error("fail");
		});

		await expect(
			withRetry(fn, {
				maxAttempts: 5,
				baseDelayMs: 200,
				maxDelayMs: 1000,
				sleep,
			}),
		).rejects.toThrow("fail");

		// 4번의 재시도 지연: 200, 400, 800, 1000(캡)
		expect(delays).toEqual([200, 400, 800, 1000]);
	});

	it("maxAttempts=1 이면 재시도 없이 1회만 실행한다", async () => {
		const sleep = vi.fn(async () => {});
		const fn = vi.fn(async () => {
			throw new Error("boom");
		});

		await expect(
			withRetry(fn, { maxAttempts: 1, baseDelayMs: 10, sleep }),
		).rejects.toThrow("boom");

		expect(fn).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});
});
