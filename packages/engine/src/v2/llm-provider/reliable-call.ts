/**
 * X-SAG Core Engine v2 — LLM 호출 신뢰성 래퍼 (GAP 3)
 *
 * 세 호출 지점(geo/aeo/rule validator)이 공유하는 단일 진입점이다.
 * 각 validator 의 askChatMock() 은 자신의 fetch/parse 클로저(fn)만 넘기고,
 * 재시도(withRetry) + 회로 차단(CircuitBreaker) 오케스트레이션은 여기 한 곳에만 둔다
 * (세 파일에 retry/breaker 로직을 복붙하는 드리프트가 명시적 안티골).
 *
 * 동작:
 *   1. breaker 가 주입되어 있고 회로가 open 이면 → CircuitOpenError 로 fail-fast
 *      (underlying fn 미호출 — 죽은/쿼터소진 provider hammering 방지).
 *   2. fn 을 withRetry 로 실행. systemic(429/401/403) 는 재시도하지 않음(즉시 전파).
 *   3. systemic 실패(LlmHttpError + isSystemicLlmStatus)만 breaker.onFailure 로 집계.
 *      일시적(network/timeout/5xx) 실패는 breaker 에 집계하지 않는다 — 정당한 커버리지를
 *      잘못 억제하지 않기 위함(보수적). 성공은 breaker.onSuccess 로 카운트 리셋.
 */

import {
	type CircuitBreaker,
	CircuitOpenError,
} from "./circuit-breaker.js";
import { LlmHttpError, isSystemicLlmStatus } from "./errors.js";
import { type RetryOptions, withRetry } from "./retry.js";

export interface ReliableCallOptions {
	/** breaker 키. 보통 provider id ("openai"/"chatmock"/...). */
	providerId: string;
	/** 공유 회로 차단기 (선택). 미주입 시 차단 없이 재시도만. */
	breaker?: CircuitBreaker;
	/** 재시도 옵션 (maxAttempts/base/max/sleep). shouldRetry 는 기본 정책 사용. */
	retry?: RetryOptions;
}

/** systemic LlmHttpError 인지 (breaker 집계 대상 판정). */
function isSystemicFailure(err: unknown): boolean {
	return err instanceof LlmHttpError && isSystemicLlmStatus(err.status);
}

/**
 * 회로 차단 + 지수 백오프 재시도로 LLM 호출(fn)을 감싼다.
 *
 * @throws CircuitOpenError - 회로가 open 이라 fail-fast 한 경우 (fn 미호출)
 * @throws 그 외 - fn 이 최종적으로 던진 에러 (systemic 즉시 / 일시적 maxAttempts 소진 후)
 */
export async function callLlmWithReliability<T>(
	fn: () => Promise<T>,
	opts: ReliableCallOptions,
): Promise<T> {
	const { providerId, breaker } = opts;

	// 1) 회로가 open 이면 underlying 호출 없이 즉시 차단.
	if (breaker && !breaker.canRequest(providerId)) {
		throw new CircuitOpenError(providerId);
	}

	try {
		const result = await withRetry(fn, opts.retry);
		breaker?.onSuccess(providerId);
		return result;
	} catch (err) {
		// systemic 실패만 breaker 에 집계 (보수적: 일시적 실패는 회로를 열지 않음).
		if (breaker && isSystemicFailure(err)) {
			breaker.onFailure(providerId);
		}
		throw err;
	}
}
