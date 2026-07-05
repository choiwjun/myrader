/**
 * X-SAG Core Engine — Mock Lighthouse Provider
 *
 * 테스트 환경에서 사용. X_SAG_LIGHTHOUSE=mock 환경변수로 활성화.
 * 실제 HTTP 요청 없이 고정값 반환.
 */

import type {
	LighthouseAdapter,
	LighthouseOptions,
	LighthouseResult,
} from "../types.js";

export class MockLighthouseProvider implements LighthouseAdapter {
	readonly name = "mock" as const;

	isAvailable(): boolean {
		return true;
	}

	async measure(
		url: string,
		opts?: LighthouseOptions,
	): Promise<LighthouseResult> {
		const now = new Date().toISOString();
		return {
			url,
			strategy: opts?.strategy ?? "mobile",
			performance: 75,
			lcp: 2200,
			fid: 85,
			cls: 0.08,
			inp: 180,
			ttfb: 600,
			fcp: 1500,
			measuredAt: now,
			cachedAt: now,
			source: "mock",
		};
	}
}
