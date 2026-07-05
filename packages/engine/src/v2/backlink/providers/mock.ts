/**
 * X-SAG Core Engine — Mock Backlink Provider
 *
 * 테스트 환경 전용. 고정값 반환 — 실제 분석/HTTP 호출 없음.
 */

import type {
	BacklinkAdapter,
	BacklinkInput,
	BacklinkResult,
	BacklinkSignals,
} from "../types.js";

const DEFAULT_SIGNALS: BacklinkSignals = {
	httpsEnforced: true,
	hsts: true,
	sitemapPresent: true,
	robotsTxtPresent: true,
	structuredDataCount: 3,
	socialMetaCount: 5,
	canonicalConsistency: true,
	contentLengthScore: 80,
};

export class MockBacklinkProvider implements BacklinkAdapter {
	readonly name = "mock" as const;
	private readonly fixed: BacklinkResult | null;
	private shouldFail = false;

	constructor(fixed?: BacklinkResult) {
		this.fixed = fixed ?? null;
	}

	/** 테스트 도우미 — 다음 호출에서 실패하도록 설정. */
	setShouldFail(flag: boolean): void {
		this.shouldFail = flag;
	}

	isAvailable(): boolean {
		return true;
	}

	async analyze(input: BacklinkInput): Promise<BacklinkResult> {
		if (this.shouldFail) {
			throw new Error("Mock backlink provider intentional failure");
		}
		if (this.fixed) return this.fixed;
		return {
			domain: input.domain,
			domainAuthority: 50,
			estimatedBacklinks: 250,
			estimatedReferringDomains: 40,
			confidence: 1.0,
			source: "mock",
			signals: DEFAULT_SIGNALS,
			measuredAt: new Date().toISOString(),
		};
	}
}
