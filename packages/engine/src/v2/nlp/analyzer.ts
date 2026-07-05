/**
 * X-SAG Core Engine — NlpAnalyzer (Provider Chain)
 *
 * 우선순위:
 * 1. ChatMockNlpProvider (CHATMOCK_ENABLED=true 또는 CHATMOCK_BASE_URL 설정 시)
 * 2. RuleBasedNlpProvider (항상 폴백 — LLM 실패 시에도 동작)
 *
 * 사용법:
 *   const analyzer = createNlpAnalyzer();
 *   const result = await analyzer.analyze(input);
 */

import { ChatMockNlpProvider } from "./providers/chatmock.js";
import { RuleBasedNlpProvider } from "./providers/rule-based.js";
import type { NlpInput, NlpProvider, NlpResult } from "./types.js";

/**
 * 환경에 따라 적절한 NlpProvider 체인을 생성한다.
 *
 * - ChatMock 사용 가능: [chatmock, rule-based] 체인 (chatmock 실패 시 폴백)
 * - 그 외: rule-based 단일
 */
export function createNlpAnalyzer(): NlpProvider {
	const chatmock = new ChatMockNlpProvider();
	if (chatmock.isAvailable()) {
		return new NlpAnalyzerChain([chatmock, new RuleBasedNlpProvider()]);
	}
	return new RuleBasedNlpProvider();
}

/**
 * 여러 NlpProvider 를 순차적으로 시도하는 체인.
 * - isAvailable() 가 false 인 provider 는 건너뜀.
 * - 첫 번째 성공한 결과 반환.
 * - 모두 실패하면 마지막 에러를 던짐.
 */
export class NlpAnalyzerChain implements NlpProvider {
	readonly name = "chain" as const;

	constructor(private readonly providers: NlpProvider[]) {
		if (providers.length === 0) {
			throw new Error("NlpAnalyzerChain requires at least one provider");
		}
	}

	isAvailable(): boolean {
		return this.providers.some((p) => p.isAvailable());
	}

	async analyze(input: NlpInput): Promise<NlpResult> {
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
			: new Error("All NLP providers failed");
	}
}
