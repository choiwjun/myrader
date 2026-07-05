/**
 * X-SAG Core Engine — Mock A11Y Provider
 *
 * 테스트 환경 전용. 고정값 반환 — 실제 분석/HTTP 호출 없음.
 */

import type { A11yInput, A11yProvider, A11yResult } from "../types.js";

export class MockA11yProvider implements A11yProvider {
	readonly name = "mock" as const;
	private readonly fixed: A11yResult | null;
	private shouldFail = false;

	constructor(fixed?: A11yResult) {
		this.fixed = fixed ?? null;
	}

	/** 테스트 도우미 — 다음 호출에서 실패하도록 설정. */
	setShouldFail(flag: boolean): void {
		this.shouldFail = flag;
	}

	isAvailable(): boolean {
		return true;
	}

	async analyze(_input: A11yInput): Promise<A11yResult> {
		if (this.shouldFail) {
			throw new Error("Mock A11y provider intentional failure");
		}
		if (this.fixed) return this.fixed;
		return {
			violations: [],
			passes: 15,
			incomplete: 0,
			inapplicable: 0,
			totalRules: 15,
			wcag21AaCompliance: 1,
			source: "mock",
			measuredAt: new Date().toISOString(),
		};
	}
}
