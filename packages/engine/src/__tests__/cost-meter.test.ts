/**
 * X-SAG Core Engine — Cost Meter 단위 테스트 (TASK-CORE-013)
 *
 * @TEST T-COST-001 — CostMeter 인터페이스 검증
 * @IMPL packages/core-engine/src/recommendation/cost-meter.ts
 * @SPEC docs/POLICY.md § 7.2 AI 비용 정책
 *
 * 3가지 시나리오:
 * 1. 한도 미만 → allowed: true
 * 2. 정확히 도달 → allowed: false
 * 3. 초과 시도 → allowed: false, remainingUsd: 0
 * 4. 멀티 provider 합산
 */

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCostMeter } from "../recommendation/cost-meter.js";

describe("InMemoryCostMeter", () => {
	let meter: InMemoryCostMeter;

	beforeEach(() => {
		// 테스트용 한도: $10 (기본 $50 대신)
		meter = new InMemoryCostMeter(10);
	});

	// ---------------------------------------------------------------------------
	// Scenario 1: 한도 미만 → allowed: true
	// ---------------------------------------------------------------------------

	describe("Scenario 1: 한도 미만", () => {
		it("T-COST-001.1: 첫 요청이 한도 내면 allowed=true", async () => {
			const result = await meter.check(5);
			expect(result.allowed).toBe(true);
			expect(result.remainingUsd).toBe(10); // 아직 기록 전
		});

		it("T-COST-001.2: 한도의 정확히 절반까지 allowed=true", async () => {
			await meter.record(5, "openai");
			const result = await meter.check(5);
			expect(result.allowed).toBe(true);
			expect(result.remainingUsd).toBe(5);
		});

		it("T-COST-001.3: 복수 check 호출 시 누적되지 않음 (check는 읽기만)", async () => {
			const r1 = await meter.check(3);
			const r2 = await meter.check(3);
			expect(r1.remainingUsd).toBe(10);
			expect(r2.remainingUsd).toBe(10); // 동일 (record 호출 안 함)
		});
	});

	// ---------------------------------------------------------------------------
	// Scenario 2: 정확히 도달 → allowed: false
	// ---------------------------------------------------------------------------

	describe("Scenario 2: 한도 정확히 도달", () => {
		it("T-COST-001.4: 정확히 한도만큼 record하면 다음 check는 allowed=false", async () => {
			await meter.record(10, "openai");
			const result = await meter.check(0.01);
			expect(result.allowed).toBe(false);
			expect(result.remainingUsd).toBe(0);
		});

		it("T-COST-001.5: 정확히 한도만큼 누적되면 remainingUsd=0", async () => {
			await meter.record(5, "openai");
			await meter.record(5, "gemini");
			const result = await meter.check(0);
			expect(result.allowed).toBe(false);
			expect(result.remainingUsd).toBe(0);
		});
	});

	// ---------------------------------------------------------------------------
	// Scenario 3: 한도 초과 시도 → allowed: false
	// ---------------------------------------------------------------------------

	describe("Scenario 3: 한도 초과 시도", () => {
		it("T-COST-001.6: 한도 초과 금액 check 시 allowed=false", async () => {
			const result = await meter.check(11);
			expect(result.allowed).toBe(false);
			expect(result.remainingUsd).toBe(10);
		});

		it("T-COST-001.7: 일부 소비 후 잔액보다 큰 금액 check 시 allowed=false", async () => {
			await meter.record(3, "openai");
			const result = await meter.check(8); // 3 + 8 = 11 > 10
			expect(result.allowed).toBe(false);
			expect(result.remainingUsd).toBe(7); // 10 - 3
		});

		it("T-COST-001.8: 정확히 한도를 초과하는 record 후 check는 allowed=false", async () => {
			await meter.record(10.5, "openai");
			const result = await meter.check(0);
			expect(result.allowed).toBe(false);
			expect(result.remainingUsd).toBe(0); // ceil이 아니라 정확히 0 이상 차감
		});
	});

	// ---------------------------------------------------------------------------
	// Scenario 4: getDailyTotal — 누적 검증
	// ---------------------------------------------------------------------------

	describe("Scenario 4: getDailyTotal 누적", () => {
		it("T-COST-001.9: 초기 상태 getDailyTotal=0", async () => {
			const total = await meter.getDailyTotal();
			expect(total).toBe(0);
		});

		it("T-COST-001.10: record 후 getDailyTotal이 합산된다", async () => {
			await meter.record(2, "openai");
			await meter.record(3, "gemini");
			const total = await meter.getDailyTotal();
			expect(total).toBe(5);
		});

		it("T-COST-001.11: 복수 record 호출 시 누적된다", async () => {
			await meter.record(1, "openai");
			await meter.record(1, "openai");
			await meter.record(2, "gemini");
			const total = await meter.getDailyTotal();
			expect(total).toBe(4);
		});
	});

	// ---------------------------------------------------------------------------
	// Scenario 5: Multi-provider 합산
	// ---------------------------------------------------------------------------

	describe("Scenario 5: 멀티 provider 합산", () => {
		it("T-COST-001.12: openai + gemini + anthropic 합산", async () => {
			await meter.record(3, "openai");
			await meter.record(4, "gemini");
			await meter.record(2, "anthropic");
			const total = await meter.getDailyTotal();
			expect(total).toBe(9);
		});

		it("T-COST-001.13: provider별 비용 조회 (헬퍼)", async () => {
			await meter.record(3.5, "openai");
			await meter.record(2, "openai");
			await meter.record(4, "gemini");

			const openaiCost = await meter.getCostByProvider("openai");
			const geminiCost = await meter.getCostByProvider("gemini");
			const anthropicCost = await meter.getCostByProvider("anthropic");

			expect(openaiCost).toBe(5.5);
			expect(geminiCost).toBe(4);
			expect(anthropicCost).toBe(0);
		});

		it("T-COST-001.14: 멀티 provider로 한도 도달 검증", async () => {
			await meter.record(3, "openai");
			await meter.record(4, "gemini");

			// 남은 잔액: 10 - 7 = 3
			const result = await meter.check(3.1);
			expect(result.allowed).toBe(false);
			expect(result.remainingUsd).toBe(3);
		});
	});

	// ---------------------------------------------------------------------------
	// Scenario 6: 환경변수 기반 한도 설정
	// ---------------------------------------------------------------------------

	describe("Scenario 6: 환경변수 기반 한도", () => {
		it("T-COST-001.15: 기본값 없을 때 AI_DAILY_BUDGET_USD 환경변수 사용", async () => {
			const originalEnv = process.env.AI_DAILY_BUDGET_USD;
			try {
				process.env.AI_DAILY_BUDGET_USD = "25";
				const meterEnv = new InMemoryCostMeter(); // explicit cap 없음
				const result = await meterEnv.check(26);
				expect(result.allowed).toBe(false);
			} finally {
				process.env.AI_DAILY_BUDGET_USD = originalEnv;
			}
		});

		it("T-COST-001.16: 환경변수보다 constructor 인자가 우선한다", async () => {
			const originalEnv = process.env.AI_DAILY_BUDGET_USD;
			try {
				process.env.AI_DAILY_BUDGET_USD = "25";
				const meterExplicit = new InMemoryCostMeter(15);
				const result = await meterExplicit.check(16);
				expect(result.allowed).toBe(false); // 15가 한도
			} finally {
				process.env.AI_DAILY_BUDGET_USD = originalEnv;
			}
		});

		it("T-COST-001.17: 환경변수 없고 인자도 없으면 기본값 50", async () => {
			const originalEnv = process.env.AI_DAILY_BUDGET_USD;
			try {
				delete process.env.AI_DAILY_BUDGET_USD;
				const meterDefault = new InMemoryCostMeter();
				const result = await meterDefault.check(51);
				expect(result.allowed).toBe(false); // 기본값 50
			} finally {
				if (originalEnv) process.env.AI_DAILY_BUDGET_USD = originalEnv;
			}
		});
	});

	// ---------------------------------------------------------------------------
	// Scenario 7: reset() 헬퍼 (테스트용)
	// ---------------------------------------------------------------------------

	describe("Scenario 7: reset() 테스트 헬퍼", () => {
		it("T-COST-001.18: reset() 후 누적 비용이 0으로 리셋된다", async () => {
			await meter.record(5, "openai");
			expect(await meter.getDailyTotal()).toBe(5);

			await meter.reset();
			expect(await meter.getDailyTotal()).toBe(0);
		});

		it("T-COST-001.19: reset() 후 check 상태도 리셋된다", async () => {
			await meter.record(9, "openai");
			let result = await meter.check(2);
			expect(result.allowed).toBe(false);

			await meter.reset();
			result = await meter.check(2);
			expect(result.allowed).toBe(true);
		});
	});

	// ---------------------------------------------------------------------------
	// Scenario 8: Edge cases
	// ---------------------------------------------------------------------------

	describe("Scenario 8: Edge cases", () => {
		it("T-COST-001.20: 0 비용 record는 허용된다", async () => {
			await meter.record(0, "openai");
			const total = await meter.getDailyTotal();
			expect(total).toBe(0);
		});

		it("T-COST-001.21: 매우 작은 비용 ($0.001) 누적 검증", async () => {
			await meter.record(0.001, "openai");
			await meter.record(0.002, "gemini");
			const total = await meter.getDailyTotal();
			expect(total).toBeCloseTo(0.003, 5);
		});

		it("T-COST-001.22: provider 문자열이 다르면 별도로 집계된다", async () => {
			await meter.record(2, "OpenAI"); // 대문자
			await meter.record(2, "openai"); // 소문자
			const openaiCost = await meter.getCostByProvider("openai");
			const OpenAIcost = await meter.getCostByProvider("OpenAI");
			expect(openaiCost).toBe(2); // case-sensitive
			expect(OpenAIcost).toBe(2);
		});

		it("T-COST-001.23: 음수 비용은 차감된다 (오류 처리는 호출자 책임)", async () => {
			await meter.record(5, "openai");
			await meter.record(-1, "openai"); // 음수 기록 (이상 조건)
			const total = await meter.getDailyTotal();
			expect(total).toBe(4); // 5 + (-1)
		});
	});

	// ---------------------------------------------------------------------------
	// Scenario 9: 동시성 — lost-update 불변식 (GAP 3)
	// ---------------------------------------------------------------------------

	describe("Scenario 9: 동시성 record() lost-update 불변식", () => {
		// 한도가 작으면 비용이 잘려 합산이 어긋날 수 있으니 충분히 큰 한도로 격리.
		let bigMeter: InMemoryCostMeter;
		beforeEach(() => {
			bigMeter = new InMemoryCostMeter(1_000_000);
		});

		it("T-COST-001.24: 다수의 동시 record() 후에도 총합이 정확하다 (유실 업데이트 없음)", async () => {
			const N = 1000;
			const each = 0.01;
			// 동시(인터리브) 호출 — Promise.all 로 한꺼번에 디스패치.
			await Promise.all(
				Array.from({ length: N }, () => bigMeter.record(each, "openai")),
			);

			const total = await bigMeter.getDailyTotal();
			// 1000 * 0.01 = 10. 부동소수 오차 허용.
			expect(total).toBeCloseTo(N * each, 6);
			const byProvider = await bigMeter.getCostByProvider("openai");
			expect(byProvider).toBeCloseTo(N * each, 6);
		});

		it("T-COST-001.25: 다수 provider 동시 record() 도 provider별 합산이 정확하다", async () => {
			const N = 500;
			const tasks: Promise<void>[] = [];
			for (let i = 0; i < N; i++) {
				tasks.push(bigMeter.record(1, "openai"));
				tasks.push(bigMeter.record(2, "gemini"));
				tasks.push(bigMeter.record(3, "anthropic"));
			}
			await Promise.all(tasks);

			expect(await bigMeter.getCostByProvider("openai")).toBe(N * 1);
			expect(await bigMeter.getCostByProvider("gemini")).toBe(N * 2);
			expect(await bigMeter.getCostByProvider("anthropic")).toBe(N * 3);
			// 총합 = N*(1+2+3) = N*6
			expect(await bigMeter.getDailyTotal()).toBe(N * 6);
		});

		it("T-COST-001.26: 로컬 provider 동시 record() 는 일일 누적에 합산되지 않는다", async () => {
			const N = 1000;
			await Promise.all([
				...Array.from({ length: N }, () => bigMeter.record(0.01, "chatmock")),
				...Array.from({ length: N }, () => bigMeter.record(0.01, "openai")),
			]);
			// chatmock 은 면제 → 일일 누적엔 openai 분만.
			expect(await bigMeter.getDailyTotal()).toBeCloseTo(N * 0.01, 6);
			expect(await bigMeter.getCostByProvider("chatmock")).toBe(0);
		});
	});
});
