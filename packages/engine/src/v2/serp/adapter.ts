/**
 * X-SAG Core Engine - SerpAdapter factory + chain.
 *
 * Real SERP providers are selected only when their credentials are configured.
 * X_SAG_SERP can force a provider for launch validation, while the deterministic
 * mock provider remains explicit local-test only.
 */

import { MockSerpProvider } from "./providers/mock.js";
import { NaverSerpProvider } from "./providers/naver.js";
import { SerpApiProvider } from "./providers/serpapi.js";
import type { SerpAdapter, SerpQuery, SerpResult } from "./types.js";

const MISSING_SERP_PROVIDER_MESSAGE =
	"SERP provider key not configured. Set SERPAPI_KEY/SERPAPI_API_KEY or NAVER_CLIENT_ID + NAVER_CLIENT_SECRET, or use X_SAG_SERP=mock for deterministic local tests.";

class UnavailableSerpProvider implements SerpAdapter {
	readonly name = "unavailable" as const;

	isAvailable(): boolean {
		return false;
	}

	async search(_query: SerpQuery, _selfDomain?: string): Promise<SerpResult> {
		throw new Error(MISSING_SERP_PROVIDER_MESSAGE);
	}
}

class SerpAdapterChain implements SerpAdapter {
	readonly name = "chain" as const;

	constructor(private readonly providers: SerpAdapter[]) {}

	isAvailable(): boolean {
		return this.providers.some((provider) => provider.isAvailable());
	}

	async search(query: SerpQuery, selfDomain?: string): Promise<SerpResult> {
		const errors: string[] = [];

		for (const provider of this.providers) {
			if (!provider.isAvailable()) continue;
			try {
				return await provider.search(query, selfDomain);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				errors.push(`[${provider.name}] ${msg}`);
				console.warn(
					`[SerpAdapterChain] Provider "${provider.name}" failed:`,
					msg,
				);
			}
		}

		throw new Error(`All SERP providers failed: ${errors.join("; ")}`);
	}
}

export function createSerpAdapter(): SerpAdapter {
	const mode = process.env.X_SAG_SERP?.trim().toLowerCase();

	if (mode === "mock") {
		return new MockSerpProvider();
	}

	if (mode === "serpapi") {
		return new SerpApiProvider();
	}

	if (mode === "naver") {
		return new NaverSerpProvider();
	}

	const providers: SerpAdapter[] = [];
	const serpApi = new SerpApiProvider();
	if (serpApi.isAvailable()) {
		providers.push(serpApi);
	}

	const naver = new NaverSerpProvider();
	if (naver.isAvailable()) {
		providers.push(naver);
	}

	if (providers.length === 0) {
		return new UnavailableSerpProvider();
	}

	return new SerpAdapterChain(providers);
}
