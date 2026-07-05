/**
 * X-SAG Core Engine — Pipeline 스테이지 타임아웃 격리 (GAP 3)
 *
 * 한 스테이지(crawl/analyze/score/recommend)가 전체 파이프라인 예산을 잠식하지
 * 못하도록 각 스테이지를 개별 예산(ms)으로 격리한다. perf 스테이지가 이미 쓰던
 * Promise.race 격리 패턴과 동일하다.
 *
 * 무거운 의존(cheerio/contracts 등) 없이 단독 모듈로 분리해 결정론적 단위 테스트가
 * 가능하다 (pipeline.ts 전체 그래프를 끌어오지 않음).
 */

/** GAP 3: 스테이지별 타임아웃 예산(ms). */
export interface StageTimeoutBudgets {
	crawl: number;
	analyze: number;
	score: number;
	recommend: number;
}

/** GAP 3: 보수적 기본 스테이지 예산 — 기존 동작과 호환되도록 넉넉하게. */
export const DEFAULT_STAGE_TIMEOUTS: StageTimeoutBudgets = {
	crawl: 120_000,
	analyze: 60_000,
	score: 10_000,
	recommend: 60_000,
};

/** GAP 3: 스테이지 예산 초과 시 식별용 에러(현재는 신호 타입; 직접 throw 하지 않음). */
export class StageTimeoutError extends Error {
	readonly stage: string;
	readonly budgetMs: number;
	constructor(stage: string, budgetMs: number) {
		super(`pipeline stage "${stage}" exceeded ${budgetMs}ms budget`);
		this.name = "StageTimeoutError";
		this.stage = stage;
		this.budgetMs = budgetMs;
	}
}

/**
 * 한 스테이지를 예산(ms) 내로 격리 실행한다.
 *
 * 보장:
 *   - run() 이 예산 내 완료되면 그 결과를 그대로 반환 (기존 동작 호환).
 *   - 예산 초과 또는 run() 거부(reject) 시 onTimeout() 폴백 결과를 반환 (fail-soft).
 *     → 한 스테이지가 전체 파이프라인 예산을 잠식하지 못한다.
 *   - 타이머는 항상 정리한다 (누수/열린 핸들 방지).
 *
 * budgetMs <= 0(또는 비유한) 이면 타임아웃을 비활성화하고 run() 을 그대로 await 한다.
 * 단, 비활성화 상태에서도 run() 자체 실패는 폴백으로 흡수해 스테이지 격리 일관성을 유지한다.
 */
export async function withStageTimeout<T>(
	_stage: string,
	budgetMs: number,
	run: () => Promise<T>,
	onTimeout: () => T,
): Promise<T> {
	if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
		try {
			return await run();
		} catch {
			return onTimeout();
		}
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	// 결과를 태그 객체로 감싸 제네릭 T 가 무엇이든 명확히 분기한다.
	const timeout = new Promise<{ ok: false }>((resolve) => {
		timer = setTimeout(() => resolve({ ok: false }), budgetMs);
	});
	try {
		const result = await Promise.race([
			run().then(
				(value): { ok: true; value: T } | { ok: false } => ({
					ok: true,
					value,
				}),
				(): { ok: false } => ({ ok: false }),
			),
			timeout,
		]);
		return result.ok ? result.value : onTimeout();
	} finally {
		if (timer) clearTimeout(timer);
	}
}
