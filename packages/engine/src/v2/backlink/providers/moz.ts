/**
 * X-SAG Core Engine - Moz Backlink Provider
 *
 * Optional external backlink authority adapter. It stays behind
 * MOZ_BACKLINK_ENABLED so local/dev runs keep the deterministic heuristic
 * fallback unless the operator explicitly enables the integration.
 */

import type {
	BacklinkAdapter,
	BacklinkInput,
	BacklinkResult,
	BacklinkSignals,
} from "../types.js";

export class MozBacklinkProvider implements BacklinkAdapter {
	readonly name = "moz" as const;

	isAvailable(): boolean {
		const token = process.env.MOZ_API_TOKEN;
		return (
			process.env.MOZ_BACKLINK_ENABLED === "true" &&
			typeof token === "string" &&
			token.length > 0
		);
	}

	async analyze(input: BacklinkInput): Promise<BacklinkResult> {
		const token = process.env.MOZ_API_TOKEN;
		if (typeof token !== "string" || token.length === 0) {
			throw new Error("MOZ_API_TOKEN not set");
		}
		if (process.env.MOZ_BACKLINK_ENABLED !== "true") {
			throw new Error("MOZ_BACKLINK_ENABLED is not true");
		}

		const baseUrl = trimTrailingSlash(
			process.env.MOZ_BASE_URL ?? "https://lsapi.seomoz.com/v2",
		);
		const response = await globalThis.fetch(`${baseUrl}/url_metrics`, {
			method: "POST",
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ targets: [input.domain] }),
		});
		if (!response.ok) {
			throw new Error(`Moz backlink request failed: ${response.status}`);
		}

		const payload: unknown = await response.json();
		const domainAuthority = normalizeScore(
			findNumber(payload, ["domain_authority", "domainAuthority", "da"]),
		);
		const estimatedBacklinks = normalizeCount(
			findNumber(payload, ["external_links", "totalLinks", "links"]),
		);
		const estimatedReferringDomains = normalizeCount(
			findNumber(payload, [
				"linking_root_domains",
				"root_domains_to_root_domain",
				"linkingRootDomains",
			]),
		);

		return {
			domain: input.domain,
			domainAuthority,
			estimatedBacklinks,
			estimatedReferringDomains,
			confidence: 0.9,
			source: "moz",
			signals: signalsFromInput(input),
			measuredAt: new Date().toISOString(),
		};
	}

	/**
	 * Test helper for constructing deterministic Moz-style results without
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
			estimatedBacklinks: Math.round(domainAuthority * 40),
			estimatedReferringDomains: Math.round(domainAuthority * 4),
			confidence: 0.9,
			source: "moz",
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
