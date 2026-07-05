/**
 * X-SAG Core Engine — PageSpeed Insights API Provider
 *
 * TRD § 19.2.3: LighthouseAdapter 구현체.
 * PSI API: https://www.googleapis.com/pagespeedonline/v5/runPagespeed
 * API 키 없이도 25k/day 무료 사용 가능.
 * PAGESPEED_API_KEY 환경변수 설정 시 높은 한도 적용.
 */

import type {
	LighthouseAdapter,
	LighthouseOptions,
	LighthouseResult,
} from "../types.js";

const PSI_API_URL =
	"https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
// 무거운 사이트(대형 포털 등)는 PSI Lighthouse 실행이 30s 를 넘길 수 있어 60s 로 둔다.
// 호출자는 LighthouseOptions.timeoutMs 로 override 가능.
const DEFAULT_TIMEOUT = 60_000;
const MISSING_API_KEY_MESSAGE =
	"PAGESPEED_API_KEY not set. Set PAGESPEED_API_KEY or legacy GOOGLE_PAGESPEED_API_KEY before using PageSpeed Insights.";

// ---------------------------------------------------------------------------
// PSI 응답 타입 (필요한 필드만 선언)
// ---------------------------------------------------------------------------

interface PsiAudit {
	numericValue?: number;
	score?: number | null;
}

interface PsiResponse {
	lighthouseResult: {
		categories: {
			performance?: { score: number | null };
		};
		audits: Record<string, PsiAudit>;
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractMs(value: number | undefined): number {
	return Math.round(value ?? 0);
}

function getPageSpeedApiKey(): string | undefined {
	return process.env.PAGESPEED_API_KEY ?? process.env.GOOGLE_PAGESPEED_API_KEY;
}

// ---------------------------------------------------------------------------
// PageSpeedInsightsProvider
// ---------------------------------------------------------------------------

export class PageSpeedInsightsProvider implements LighthouseAdapter {
	readonly name = "psi" as const;

	/**
	 * The production PSI path requires an explicit key so local/test runs cannot
	 * accidentally look like external validation evidence.
	 */
	isAvailable(): boolean {
		return Boolean(getPageSpeedApiKey());
	}

	async measure(
		url: string,
		opts: LighthouseOptions = {},
	): Promise<LighthouseResult> {
		const strategy = opts.strategy ?? "mobile";
		const apiKey = getPageSpeedApiKey();
		if (!apiKey) {
			throw new Error(MISSING_API_KEY_MESSAGE);
		}

		const params = new URLSearchParams({
			url,
			strategy,
			locale: opts.locale ?? "ko",
			category: "performance",
		});
		params.set("key", apiKey);

		const controller = new AbortController();
		const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const res = await fetch(`${PSI_API_URL}?${params}`, {
				signal: controller.signal,
			});

			if (!res.ok) {
				const body = await res.text();
				throw new Error(`PSI API ${res.status}: ${body}`);
			}

			const data = (await res.json()) as PsiResponse;
			const lh = data.lighthouseResult;
			const audits = lh.audits;

			const now = new Date().toISOString();

			return {
				url,
				strategy,
				performance: Math.round((lh.categories.performance?.score ?? 0) * 100),
				lcp: extractMs(audits["largest-contentful-paint"]?.numericValue),
				fid: extractMs(audits["max-potential-fid"]?.numericValue),
				cls: audits["cumulative-layout-shift"]?.numericValue ?? 0,
				inp: extractMs(
					audits["interaction-to-next-paint"]?.numericValue ??
						audits.interactive?.numericValue,
				),
				ttfb: extractMs(audits["server-response-time"]?.numericValue),
				fcp: extractMs(audits["first-contentful-paint"]?.numericValue),
				measuredAt: now,
				cachedAt: now,
				source: "psi",
			};
		} finally {
			clearTimeout(timer);
		}
	}
}
