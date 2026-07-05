/**
 * X-SAG Core Engine v2 — LLM 호출 재시도 (GAP 3 신뢰성 인프라)
 *
 * 세 호출 지점(geo/aeo/rule validator)이 동일한 fetch 패턴을 공유하므로,
 * 재시도 로직은 이 단일 모듈에서만 구현하고 모두 여기서 재사용한다
 * (복제 시 분기 드리프트가 명시적 안티골 — errors.ts/router.ts 공유 정신과 동일).
 *
 * 핵심 계약:
 *   - **systemic** 에러(429/401/403 via isSystemicLlmStatus) 는 **절대 재시도하지 않는다.**
 *     이런 에러는 quota/auth 처럼 모든 후속 호출도 실패시키므로 (errors.ts 참조),
 *     재시도해봐야 provider 만 더 두드린다 → 즉시 rethrow.
 *   - **일시적** 에러(network/timeout/throw 된 5xx) 만 maxAttempts 까지 지수 백오프로 재시도.
 *   - 지연(sleep)은 **주입 가능**(opts.sleep) — 테스트는 가짜 sleep 으로 실타이머 없이
 *     즉시·결정론적으로 동작한다. 미주입 시 실 setTimeout 으로 폴백(제품 코드에선 정상).
 */

import { LlmHttpError, isSystemicLlmStatus } from "./errors.js";

/** 주입 가능한 sleep 시그니처 (ms 만큼 대기). */
export type SleepFn = (ms: number) => Promise<void>;

/** 재시도 여부 판정. true = 재시도, false = 즉시 rethrow. */
export type ShouldRetryFn = (err: unknown, attempt: number) => boolean;

export interface RetryOptions {
	/** 최대 시도 횟수 (첫 시도 포함). 기본 3. */
	maxAttempts?: number;
	/** 첫 재시도 지연 (ms). 기본 200. */
	baseDelayMs?: number;
	/** 지연 상한 (ms). 기본 2000. */
	maxDelayMs?: number;
	/**
	 * 재시도 여부 판정 predicate. 미지정 시 기본 정책:
	 *   - systemic LlmHttpError(429/401/403) → false (재시도 안 함)
	 *   - 그 외 모든 에러 → true (일시적으로 간주, 재시도)
	 */
	shouldRetry?: ShouldRetryFn;
	/** 주입 가능한 sleep. 미지정 시 실 setTimeout 기반. */
	sleep?: SleepFn;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 200;
const DEFAULT_MAX_DELAY_MS = 2000;

/** 실 setTimeout 기반 기본 sleep (제품 코드 경로). */
const realSleep: SleepFn = (ms) =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 기본 재시도 정책: systemic LlmHttpError 는 재시도하지 않는다.
 *
 * systemic 에러(429/401/403)는 배치 전체를 의도적으로 실패시켜야 하는
 * 신호이므로(데이터 정직성, errors.ts), 재시도로 가려서는 안 된다.
 */
export function defaultShouldRetry(err: unknown): boolean {
	if (err instanceof LlmHttpError && isSystemicLlmStatus(err.status)) {
		return false;
	}
	return true;
}

/**
 * 지수 백오프로 비동기 함수를 재시도한다.
 *
 * @param fn - 실행할 비동기 함수 (호출마다 새 시도)
 * @param opts - 재시도 옵션 (maxAttempts/base/max/shouldRetry/sleep)
 * @returns fn 의 성공 결과
 * @throws 재시도 불가(shouldRetry=false) 에러 즉시, 또는 maxAttempts 소진 후 마지막 에러
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	opts: RetryOptions = {},
): Promise<T> {
	const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
	const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
	const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
	const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
	const sleep = opts.sleep ?? realSleep;

	let lastErr: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			// 마지막 시도였거나 재시도 불가 에러면 즉시 전파.
			if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
				throw err;
			}
			// 지수 백오프: base * 2^(attempt-1), maxDelay 로 캡.
			const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
			await sleep(delay);
		}
	}
	// 도달 불가 (루프 내에서 반드시 return/throw) — 타입 안전용.
	throw lastErr;
}
