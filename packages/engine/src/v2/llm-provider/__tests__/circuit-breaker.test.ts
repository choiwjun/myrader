/**
 * v2/llm-provider — CircuitBreaker 단위 테스트 (GAP 3)
 *
 * 모든 테스트는 주입된 now() 로 결정론적 — 실시간/타이머 미사용.
 *
 * 상태 전이 검증:
 * 1. closed → open : 연속 실패 threshold 도달 시 open, 이후 호출은 short-circuit (CircuitOpenError)
 * 2. open → half-open : cooldown 경과 후 1회 시도 허용 (half-open)
 * 3. half-open 성공 → closed : 실패 카운트 리셋, 정상 호출 재개
 * 4. half-open 실패 → open : 다시 cooldown 동안 차단
 * 5. provider id 별 독립 키 — 한 provider 의 실패가 다른 provider 를 차단하지 않음
 * 6. 성공이 연속 실패 카운트를 리셋한다 (threshold 직전 성공 → open 안 됨)
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
	CircuitBreaker,
	CircuitOpenError,
} from "../circuit-breaker.js";

describe("CircuitBreaker — GAP 3 in-process 회로 차단기", () => {
	let clock: number;
	const now = () => clock;

	beforeEach(() => {
		clock = 0;
	});

	it("연속 실패가 threshold 에 도달하면 open 되어 short-circuit 한다", () => {
		const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 1000, now });

		// 2회 실패: 아직 closed
		cb.onFailure("openai");
		cb.onFailure("openai");
		expect(cb.canRequest("openai")).toBe(true);
		expect(cb.getState("openai")).toBe("closed");

		// 3번째 실패 → open
		cb.onFailure("openai");
		expect(cb.getState("openai")).toBe("open");
		expect(cb.canRequest("openai")).toBe(false);
	});

	it("open 상태에서 assertCanRequest 는 CircuitOpenError 를 던진다", () => {
		const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000, now });
		cb.onFailure("openai");
		expect(cb.getState("openai")).toBe("open");
		expect(() => cb.assertCanRequest("openai")).toThrow(CircuitOpenError);
	});

	it("cooldown 경과 후 half-open 으로 전이해 1회 시도를 허용한다", () => {
		const cb = new CircuitBreaker({ threshold: 2, cooldownMs: 1000, now });
		cb.onFailure("openai");
		cb.onFailure("openai");
		expect(cb.getState("openai")).toBe("open");
		expect(cb.canRequest("openai")).toBe(false);

		// cooldown 직전 → 여전히 차단
		clock = 999;
		expect(cb.canRequest("openai")).toBe(false);

		// cooldown 경과 → half-open, 1회 허용
		clock = 1000;
		expect(cb.canRequest("openai")).toBe(true);
		expect(cb.getState("openai")).toBe("half-open");
	});

	it("half-open 에서 성공하면 closed 로 복귀하고 실패 카운트를 리셋한다", () => {
		const cb = new CircuitBreaker({ threshold: 2, cooldownMs: 1000, now });
		cb.onFailure("openai");
		cb.onFailure("openai");
		clock = 1000;
		expect(cb.canRequest("openai")).toBe(true); // half-open

		cb.onSuccess("openai");
		expect(cb.getState("openai")).toBe("closed");

		// 카운트 리셋되었으므로 다시 threshold 만큼 실패해야 open
		cb.onFailure("openai");
		expect(cb.getState("openai")).toBe("closed");
		cb.onFailure("openai");
		expect(cb.getState("openai")).toBe("open");
	});

	it("half-open 에서 실패하면 다시 open 되어 cooldown 동안 차단한다", () => {
		const cb = new CircuitBreaker({ threshold: 2, cooldownMs: 1000, now });
		cb.onFailure("openai");
		cb.onFailure("openai");
		clock = 1000;
		expect(cb.canRequest("openai")).toBe(true); // half-open

		cb.onFailure("openai"); // half-open 실패 → 즉시 open
		expect(cb.getState("openai")).toBe("open");
		expect(cb.canRequest("openai")).toBe(false);

		// 새 cooldown 창: openedAt 이 1000 으로 갱신되었으므로 1999 까진 차단
		clock = 1999;
		expect(cb.canRequest("openai")).toBe(false);
		clock = 2000;
		expect(cb.canRequest("openai")).toBe(true);
	});

	it("provider id 별로 독립적이다 (한 provider 의 open 이 다른 provider 를 막지 않음)", () => {
		const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000, now });
		cb.onFailure("openai");
		expect(cb.canRequest("openai")).toBe(false);
		expect(cb.canRequest("gemini")).toBe(true);
		expect(cb.getState("gemini")).toBe("closed");
	});

	it("성공이 연속 실패 카운트를 리셋한다 (threshold 직전 성공 → open 안 됨)", () => {
		const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 1000, now });
		cb.onFailure("openai");
		cb.onFailure("openai");
		cb.onSuccess("openai"); // 리셋
		cb.onFailure("openai");
		cb.onFailure("openai");
		expect(cb.getState("openai")).toBe("closed"); // 2회뿐 → 아직 open 아님
		cb.onFailure("openai");
		expect(cb.getState("openai")).toBe("open");
	});

	it("기본 now 없이도 동작한다 (실시간 clock 폴백) — 즉시 open 확인", () => {
		const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 60_000 });
		cb.onFailure("openai");
		expect(cb.getState("openai")).toBe("open");
		expect(cb.canRequest("openai")).toBe(false);
	});
});
