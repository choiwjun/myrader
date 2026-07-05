/**
 * X-SAG Core Engine v2 — In-process Circuit Breaker (GAP 3 신뢰성 인프라)
 *
 * provider id 별로 연속 실패를 추적하다가, 임계치(threshold)에 도달하면
 * cooldown 동안 회로를 **open** 해 호출을 short-circuit 한다. 죽었거나 쿼터가
 * 소진된 provider 를 계속 두드리는(hammering) 것을 막는다.
 *
 * 상태 (provider 별 독립):
 *   - closed    : 정상. 호출 허용. 연속 실패 카운트 누적.
 *   - open      : 차단. cooldown 경과 전엔 canRequest=false (short-circuit).
 *   - half-open : cooldown 경과 후 1회 시험 호출 허용.
 *                 성공 → closed(리셋), 실패 → 다시 open(cooldown 재시작).
 *
 * 시계 주입:
 *   - opts.now 로 millis 소스를 주입할 수 있어 테스트가 결정론적이다.
 *   - 미주입 시 표준 JS 현재시각(Date.now)으로 폴백 — 제품 코드에선 정상.
 *     (워크플로우 SCRIPT 레이어만 Date.now 를 금지; 엔진 제품 코드는 허용.)
 *
 * 범위 한계 (의도적):
 *   - **in-process 전용.** 다중 인스턴스/프로세스 간에는 공유되지 않는다.
 *     교차 인스턴스 차단이 필요하면 공유 스토어(Redis 등)가 있어야 한다 — out of scope.
 */

/** 회로 상태. */
export type CircuitState = "closed" | "open" | "half-open";

/** open 회로로 short-circuit 될 때 던지는 타입 에러. */
export class CircuitOpenError extends Error {
	readonly providerId: string;
	constructor(providerId: string) {
		super(`Circuit breaker is OPEN for provider "${providerId}"`);
		this.name = "CircuitOpenError";
		this.providerId = providerId;
	}
}

export interface CircuitBreakerOptions {
	/** 연속 실패가 이 횟수에 도달하면 open. 기본 3 (최소 1). */
	threshold?: number;
	/** open → half-open 전이까지 대기(ms). 기본 30000. */
	cooldownMs?: number;
	/** 주입 가능한 현재시각(ms) 소스. 미지정 시 Date.now. */
	now?: () => number;
}

const DEFAULT_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;

interface ProviderCircuit {
	consecutiveFailures: number;
	state: CircuitState;
	/** open 으로 전이된 시각(ms). state==="open" 일 때만 의미. */
	openedAt: number;
}

/**
 * provider id 로 키된 in-process 회로 차단기.
 *
 * 같은 인스턴스를 GEO/AEO/Rule validator 가 공유하면 한 provider 의 장애가
 * 모든 호출 지점에서 일관되게 차단된다 (단, in-process 한정).
 */
export class CircuitBreaker {
	private readonly threshold: number;
	private readonly cooldownMs: number;
	private readonly now: () => number;
	private readonly circuits = new Map<string, ProviderCircuit>();

	constructor(options: CircuitBreakerOptions = {}) {
		this.threshold = Math.max(1, options.threshold ?? DEFAULT_THRESHOLD);
		this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
		// 시계 주입: 미지정 시 표준 JS 현재시각으로 폴백 (제품 코드 허용).
		this.now = options.now ?? (() => Date.now());
	}

	/** 해당 provider 의 회로 상태를 (필요 시 cooldown 만료 반영하여) 반환. */
	getState(providerId: string): CircuitState {
		return this.refresh(providerId).state;
	}

	/**
	 * 지금 호출을 보내도 되는지. open(cooldown 미경과) 이면 false.
	 * open 인데 cooldown 이 지났으면 half-open 으로 전이하고 true 를 반환한다.
	 */
	canRequest(providerId: string): boolean {
		return this.refresh(providerId).state !== "open";
	}

	/** canRequest 와 동일하나 차단 시 CircuitOpenError 를 던진다(호출자 fail-fast 용). */
	assertCanRequest(providerId: string): void {
		if (!this.canRequest(providerId)) {
			throw new CircuitOpenError(providerId);
		}
	}

	/** 성공 기록: 연속 실패 카운트 리셋, 회로 닫음. */
	onSuccess(providerId: string): void {
		const c = this.refresh(providerId);
		c.consecutiveFailures = 0;
		c.state = "closed";
		c.openedAt = 0;
	}

	/**
	 * 실패 기록 (systemic/hard 실패만 호출하는 것을 권장 — 양성 빈 응답은 제외).
	 *   - half-open 에서 실패 → 즉시 다시 open (cooldown 재시작)
	 *   - closed 에서 누적 실패가 threshold 도달 → open
	 */
	onFailure(providerId: string): void {
		const c = this.refresh(providerId);
		c.consecutiveFailures += 1;
		if (c.state === "half-open") {
			c.state = "open";
			c.openedAt = this.now();
			return;
		}
		if (c.consecutiveFailures >= this.threshold) {
			c.state = "open";
			c.openedAt = this.now();
		}
	}

	/** 테스트/운영 헬퍼: 특정 provider 회로를 closed 로 강제 리셋. */
	reset(providerId: string): void {
		this.circuits.delete(providerId);
	}

	/**
	 * 회로를 가져오되, open 이고 cooldown 이 지났으면 half-open 으로 전이한다.
	 * 모든 조회 경로(getState/canRequest/onSuccess/onFailure)가 이 단일 함수를
	 * 거쳐 상태 전이 로직이 한 곳에만 존재하도록 한다.
	 */
	private refresh(providerId: string): ProviderCircuit {
		let c = this.circuits.get(providerId);
		if (!c) {
			c = { consecutiveFailures: 0, state: "closed", openedAt: 0 };
			this.circuits.set(providerId, c);
		}
		if (c.state === "open" && this.now() - c.openedAt >= this.cooldownMs) {
			c.state = "half-open";
		}
		return c;
	}
}
