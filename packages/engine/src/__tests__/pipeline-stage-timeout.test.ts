/**
 * Pipeline 스테이지 타임아웃 격리 단위 테스트 (GAP 3)
 *
 * 모두 결정론적 — fake timer 로 실타이머 미사용.
 *
 * 검증:
 * 1. run() 이 예산 내 완료 → 결과 그대로 반환 (happy path)
 * 2. run() 이 예산 초과 → onTimeout() 폴백 반환 (한 스테이지가 전체 예산 잠식 X)
 * 3. run() 이 reject → onTimeout() 폴백 반환 (fail-soft)
 * 4. budgetMs<=0 → 타임아웃 비활성화, run() 그대로 await
 * 5. budgetMs<=0 에서 run() reject 도 폴백으로 흡수
 * 6. 정상 완료 시 타이머가 정리되어 열린 핸들이 남지 않는다
 * 7. DEFAULT_STAGE_TIMEOUTS 값 검증 (crawl 120s / analyze 60s / score 10s / recommend 60s)
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_STAGE_TIMEOUTS,
	withStageTimeout,
} from "../pipeline-stage-timeout.js";

afterEach(() => {
	vi.useRealTimers();
});

describe("withStageTimeout() — GAP 3 스테이지 격리", () => {
	it("예산 내 완료되면 결과를 그대로 반환한다", async () => {
		const out = await withStageTimeout(
			"score",
			10_000,
			async () => 42,
			() => -1,
		);
		expect(out).toBe(42);
	});

	it("예산을 초과하면 onTimeout 폴백을 반환한다", async () => {
		vi.useFakeTimers();
		const slow = withStageTimeout(
			"crawl",
			10,
			() =>
				new Promise<string>((resolve) => {
					setTimeout(() => resolve("late"), 100_000);
				}),
			() => "fallback",
		);
		await vi.runAllTimersAsync();
		expect(await slow).toBe("fallback");
	});

	it("run() 이 reject 하면 onTimeout 폴백을 반환한다 (fail-soft)", async () => {
		const out = await withStageTimeout(
			"analyze",
			10_000,
			async () => {
				throw new Error("boom");
			},
			() => "soft",
		);
		expect(out).toBe("soft");
	});

	it("budgetMs<=0 이면 타임아웃 없이 run() 을 그대로 await 한다", async () => {
		const out = await withStageTimeout(
			"recommend",
			0,
			async () => "ran",
			() => "fallback",
		);
		expect(out).toBe("ran");
	});

	it("budgetMs<=0 에서 run() reject 도 폴백으로 흡수한다", async () => {
		const out = await withStageTimeout(
			"recommend",
			-5,
			async () => {
				throw new Error("nope");
			},
			() => "fallback",
		);
		expect(out).toBe("fallback");
	});

	it("정상 완료 시 타이머를 정리한다 (clearTimeout 호출)", async () => {
		vi.useFakeTimers();
		const clearSpy = vi.spyOn(globalThis, "clearTimeout");
		const out = await withStageTimeout(
			"score",
			10_000,
			async () => "done",
			() => "fallback",
		);
		expect(out).toBe("done");
		expect(clearSpy).toHaveBeenCalled();
	});
});

describe("DEFAULT_STAGE_TIMEOUTS — 보수적 기본 예산", () => {
	it("crawl 120s / analyze 60s / score 10s / recommend 60s", () => {
		expect(DEFAULT_STAGE_TIMEOUTS.crawl).toBe(120_000);
		expect(DEFAULT_STAGE_TIMEOUTS.analyze).toBe(60_000);
		expect(DEFAULT_STAGE_TIMEOUTS.score).toBe(10_000);
		expect(DEFAULT_STAGE_TIMEOUTS.recommend).toBe(60_000);
	});
});
