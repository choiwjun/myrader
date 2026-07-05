/**
 * X-SAG Core Engine — A11Y Analyzer (Provider Chain)
 *
 * Phase R-D: 접근성 자동 검사 어댑터 체인.
 *
 * 우선순위:
 * 1. AxeCoreA11yProvider (axe-core + jsdom 설치 시)
 * 2. CheerioStaticA11yProvider (항상 사용 가능 — 폴백)
 *
 * 사용법:
 *   const analyzer = await createA11yAnalyzer();
 *   const result = await analyzer.analyze({ html, url });
 */

import { AxeCoreA11yProvider } from "./providers/axe-core.js";
import { CheerioStaticA11yProvider } from "./providers/cheerio-static.js";
import type { A11yInput, A11yProvider, A11yResult } from "./types.js";

/**
 * 환경에 따라 적절한 A11yProvider 체인을 생성.
 *
 * axe-core 설치 여부를 init() 시점에서 검사한다 (1회).
 */
export async function createA11yAnalyzer(): Promise<A11yProvider> {
	const axe = new AxeCoreA11yProvider();
	const ok = await axe.init();
	if (ok) {
		return new A11yAnalyzerChain([axe, new CheerioStaticA11yProvider()]);
	}
	return new CheerioStaticA11yProvider();
}

/**
 * 여러 A11yProvider 를 순차적으로 시도하는 체인.
 * - isAvailable() 가 false 인 provider 는 건너뜀.
 * - 첫 번째 성공한 결과 반환.
 * - 모두 실패하면 마지막 에러를 던짐.
 */
export class A11yAnalyzerChain implements A11yProvider {
	readonly name = "cheerio-static" as const; // 체인 fallback 의 출처.

	constructor(private readonly providers: A11yProvider[]) {
		if (providers.length === 0) {
			throw new Error("A11yAnalyzerChain requires at least one provider");
		}
	}

	isAvailable(): boolean {
		return this.providers.some((p) => p.isAvailable());
	}

	async analyze(input: A11yInput): Promise<A11yResult> {
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
			: new Error("All A11Y providers failed");
	}
}
