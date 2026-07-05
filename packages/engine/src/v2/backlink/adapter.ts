/**
 * X-SAG Core Engine — Backlink Adapter Chain
 *
 * Phase R-D: 우선순위에 따른 백링크 어댑터 체인.
 *
 * 우선순위:
 * 1. AhrefsBacklinkProvider (AHREFS_API_KEY 있을 때)
 * 2. MozBacklinkProvider    (MOZ_API_TOKEN 있을 때)
 * 3. HeuristicBacklinkProvider (항상 사용 가능 — 폴백)
 *
 * 사용법:
 *   const adapter = createBacklinkAdapter();
 *   const result = await adapter.analyze({ url, domain });
 */

import { AhrefsBacklinkProvider } from "./providers/ahrefs.js";
import { HeuristicBacklinkProvider } from "./providers/heuristic.js";
import { MozBacklinkProvider } from "./providers/moz.js";
import type {
	BacklinkAdapter,
	BacklinkInput,
	BacklinkResult,
} from "./types.js";

/**
 * 환경에 따라 적절한 BacklinkAdapter 체인을 생성.
 *
 * - 외부 API 키 미설정 시 → HeuristicBacklinkProvider 단독.
 * - 키 설정 시 → 체인 (실패하면 휴리스틱으로 폴백).
 */
export function createBacklinkAdapter(): BacklinkAdapter {
	const providers: BacklinkAdapter[] = [];
	const ahrefs = new AhrefsBacklinkProvider();
	const moz = new MozBacklinkProvider();
	if (ahrefs.isAvailable()) providers.push(ahrefs);
	if (moz.isAvailable()) providers.push(moz);
	providers.push(new HeuristicBacklinkProvider());

	if (providers.length === 1) {
		// 항상 휴리스틱 만 있는 경우 — 직접 반환 (체인 오버헤드 제거).
		return providers[0] as BacklinkAdapter;
	}
	return new BacklinkAdapterChain(providers);
}

/**
 * 여러 BacklinkAdapter 를 순차적으로 시도하는 체인.
 * - isAvailable() 가 false 인 어댑터 는 건너뜀.
 * - 첫 번째 성공한 결과 반환.
 * - 모두 실패하면 마지막 에러를 던짐.
 */
export class BacklinkAdapterChain implements BacklinkAdapter {
	readonly name = "heuristic" as const; // 체인의 fallback 이 heuristic.

	constructor(private readonly providers: BacklinkAdapter[]) {
		if (providers.length === 0) {
			throw new Error("BacklinkAdapterChain requires at least one provider");
		}
	}

	isAvailable(): boolean {
		return this.providers.some((p) => p.isAvailable());
	}

	async analyze(input: BacklinkInput): Promise<BacklinkResult> {
		let lastError: unknown = null;
		for (const p of this.providers) {
			if (!p.isAvailable()) continue;
			try {
				return await p.analyze(input);
			} catch (err) {
				lastError = err;
				// try next provider
			}
		}
		throw lastError instanceof Error
			? lastError
			: new Error("All backlink providers failed");
	}
}
