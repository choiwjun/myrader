/**
 * X-SAG Core Engine - LighthouseAdapter factory.
 *
 * External PageSpeed measurements are enabled only when explicitly configured
 * or when a PageSpeed API key is present. Missing keys produce an unavailable
 * adapter instead of silently calling an external API or returning mock scores.
 */

import { MockLighthouseProvider } from "./providers/mock.js";
import { PageSpeedInsightsProvider } from "./providers/pagespeed.js";
import type {
	LighthouseAdapter,
	LighthouseOptions,
	LighthouseResult,
} from "./types.js";

const MISSING_API_KEY_MESSAGE =
	"PAGESPEED_API_KEY not set. Set PAGESPEED_API_KEY or legacy GOOGLE_PAGESPEED_API_KEY before using PageSpeed Insights.";

class UnavailableLighthouseProvider implements LighthouseAdapter {
	readonly name = "unavailable" as const;

	isAvailable(): boolean {
		return false;
	}

	async measure(
		_url: string,
		_opts?: LighthouseOptions,
	): Promise<LighthouseResult> {
		throw new Error(MISSING_API_KEY_MESSAGE);
	}
}

/**
 * Creates the appropriate Lighthouse adapter for the current environment.
 */
export function createLighthouseAdapter(): LighthouseAdapter {
	const mode = process.env.X_SAG_LIGHTHOUSE?.toLowerCase();
	if (mode === "mock") {
		return new MockLighthouseProvider();
	}

	const psi = new PageSpeedInsightsProvider();
	if (mode === "pagespeed" || mode === "psi") {
		return psi;
	}

	if (psi.isAvailable()) {
		return psi;
	}

	return new UnavailableLighthouseProvider();
}
