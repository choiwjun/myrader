/**
 * X-SAG Core Engine — Heuristic Backlink Provider
 *
 * Phase R-D: API 없이 사이트 자체 시그널로 DA/백링크 추정.
 *
 * 휴리스틱 공식 (DA 추정, 0-100 범위):
 *   raw =  httpsEnforced         * 10
 *        + hsts                  * 5
 *        + sitemapPresent        * 10
 *        + robotsTxtPresent      * 5
 *        + min(structuredDataCount * 5, 25)
 *        + min(socialMetaCount   * 2, 15)
 *        + canonicalConsistency  * 10
 *        + contentLengthScore    * 0.2
 *   DA = clamp(raw * 0.9, 0, 100)
 *
 * 백링크/참조 도메인 추정: 실 API 없이는 정확도가 매우 낮아
 *   - estimatedBacklinks      = round(DA * 5)    (DA 50 → ~250 backlinks)
 *   - referringDomains        = round(DA * 0.8)  (DA 50 → ~40 ref domains)
 *
 * confidence = 0.3 (휴리스틱은 약한 신호).
 *
 * POLICY § 7.1: 결정적·재현 가능. 입력 동일 → 출력 동일.
 */

import type {
	BacklinkAdapter,
	BacklinkInput,
	BacklinkResult,
	BacklinkSignals,
} from "../types.js";

export class HeuristicBacklinkProvider implements BacklinkAdapter {
	readonly name = "heuristic" as const;

	isAvailable(): boolean {
		return true;
	}

	/**
	 * 외부 호출자가 signals 를 모를 때(URL 만 있을 때) 호출.
	 * 도메인 정보만으로 매우 거친 추정 — 모든 signal 을 false/0 으로 가정.
	 * 권장 경로는 computeFromSignals().
	 */
	async analyze(input: BacklinkInput): Promise<BacklinkResult> {
		// URL 만으로는 시그널을 모름 — 보수적 추정.
		const isHttps = input.url.startsWith("https://");
		const signals: BacklinkSignals = {
			httpsEnforced: isHttps,
			hsts: false,
			sitemapPresent: false,
			robotsTxtPresent: false,
			structuredDataCount: 0,
			socialMetaCount: 0,
			canonicalConsistency: false,
			contentLengthScore: 0,
		};
		return this.computeFromSignals(input.domain, signals);
	}

	/**
	 * ParsedPage 등 호출부에서 추출한 signals 로 DA/백링크 추정.
	 *
	 * 입력이 결정적이면 출력도 결정적이다 (POLICY § 7.1).
	 */
	computeFromSignals(domain: string, signals: BacklinkSignals): BacklinkResult {
		const raw =
			(signals.httpsEnforced ? 10 : 0) +
			(signals.hsts ? 5 : 0) +
			(signals.sitemapPresent ? 10 : 0) +
			(signals.robotsTxtPresent ? 5 : 0) +
			Math.min(signals.structuredDataCount * 5, 25) +
			Math.min(signals.socialMetaCount * 2, 15) +
			(signals.canonicalConsistency ? 10 : 0) +
			clamp(signals.contentLengthScore, 0, 100) * 0.2;

		const domainAuthority = Math.round(clamp(raw * 0.9, 0, 100));
		const estimatedBacklinks = Math.round(domainAuthority * 5);
		const estimatedReferringDomains = Math.round(domainAuthority * 0.8);

		return {
			domain,
			domainAuthority,
			estimatedBacklinks,
			estimatedReferringDomains,
			confidence: 0.3,
			source: "heuristic",
			signals,
			measuredAt: new Date().toISOString(),
		};
	}
}

function clamp(value: number, min: number, max: number): number {
	if (Number.isNaN(value)) return min;
	if (value < min) return min;
	if (value > max) return max;
	return value;
}
