/**
 * X-SAG Core Engine - Ahrefs Backlink Provider
 *
 * Optional external backlink authority adapter. It stays behind
 * AHREFS_BACKLINK_ENABLED so local/dev runs keep the deterministic heuristic
 * fallback unless the operator explicitly enables the integration.
 */

import type {
	BacklinkAdapter,
	BacklinkInput,
	BacklinkResult,
	BacklinkSignals,
} from "../types.js";

export class AhrefsBacklinkProvider implements BacklinkAdapter {
	readonly name = "ahrefs" as const;

	isAvailable(): boolean {
		const key = process.env.AHREFS_API_KEY;
		return (
			process.env.AHREFS_BACKLINK_ENABLED === "true" &&
			typeof key === "string" &&
			key.length > 0
		);
	}

	async analyze(input: BacklinkInput): Promise<BacklinkResult> {
		const key = process.env.AHREFS_API_KEY;
		if (typeof key !== "string" || key.length === 0) {
			throw new Error("AHREFS_API_KEY not set");
		}
		if (process.env.AHREFS_BACKLINK_ENABLED !== "true") {
			throw new Error("AHREFS_BACKLINK_ENABLED is not true");
		}

		const baseUrl = trimTrailingSlash(
			process.env.AHREFS_BASE_URL ?? "https://api.ahrefs.com/v3",
		);
		const url = new URL(`${baseUrl}/domain-rating`);
		url.searchParams.set("target", input.domain);

		const response = await globalThis.fetch(url.toString(), {
			method: "GET",
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${key}`,
			},
		});
		if (!response.ok) {
			throw new Error(`Ahrefs backlink request failed: ${response.status}`);
		}

		const payload: unknown = await response.json();
		const domainAuthority = normalizeScore(
			findNumber(payload, ["domain_rating", "domainRating", "dr"]),
		);
		const estimatedBacklinks = normalizeCount(
			findNumber(payload, ["backlinks", "total_backlinks", "backlinksTotal"]),
		);
		const estimatedReferringDomains = normalizeCount(
			findNumber(payload, [
				"referring_domains",
				"refdomains",
				"referringDomains",
				"referring_domains_count",
			]),
		);

		return {
			domain: input.domain,
			domainAuthority,
			estimatedBacklinks,
			estimatedReferringDomains,
			confidence: 0.95,
			source: "ahrefs",
			signals: signalsFromInput(input),
			measuredAt: new Date().toISOString(),
		};
	}

	/**
	 * Test helper for constructing deterministic Ahrefs-style results without
	 * making an HTTP request.
	 * @internal
	 */
	static mockResult(
		domain: string,
		domainAuthority: number,
		signals: BacklinkSignals,
	): BacklinkResult {
		return {
			domain,
			domainAuthority,
			estimatedBacklinks: Math.round(domainAuthority * 50),
			estimatedReferringDomains: Math.round(domainAuthority * 5),
			confidence: 0.95,
			source: "ahrefs",
			signals,
			measuredAt: new Date().toISOString(),
		};
	}
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function normalizeScore(value: number | undefined): number {
	return clamp(Math.round(value ?? 0), 0, 100);
}

function normalizeCount(value: number | undefined): number {
	return Math.max(0, Math.round(value ?? 0));
}

function findNumber(value: unknown, keys: string[]): number | undefined {
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findNumber(item, keys);
			if (found !== undefined) return found;
		}
		return undefined;
	}
	if (value === null || typeof value !== "object") return undefined;

	const record = value as Record<string, unknown>;
	for (const key of keys) {
		const raw = record[key];
		const parsed =
			typeof raw === "number" || typeof raw === "string"
				? Number(raw)
				: Number.NaN;
		if (Number.isFinite(parsed)) return parsed;
	}

	for (const child of Object.values(record)) {
		const found = findNumber(child, keys);
		if (found !== undefined) return found;
	}
	return undefined;
}

function signalsFromInput(input: BacklinkInput): BacklinkSignals {
	return {
		httpsEnforced: input.url.startsWith("https://"),
		hsts: false,
		sitemapPresent: false,
		robotsTxtPresent: false,
		structuredDataCount: 0,
		socialMetaCount: 0,
		canonicalConsistency: false,
		contentLengthScore: 0,
	};
}

function clamp(value: number, min: number, max: number): number {
	if (Number.isNaN(value)) return min;
	if (value < min) return min;
	if (value > max) return max;
	return value;
}
