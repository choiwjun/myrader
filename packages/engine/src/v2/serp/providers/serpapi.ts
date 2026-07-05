/**
 * X-SAG Core Engine — SerpAPI Provider
 *
 * SerpAPI Naver 엔진 사용 (한국 매장 검색 정확도 최적).
 * env: SERPAPI_KEY
 *
 * TRD § 19.2.1
 * POLICY § 22: SERP 데이터 수집
 * POLICY § 5.4: 의료/SNS 도메인 제외
 */

import type {
	SerpAdapter,
	SerpCompetitor,
	SerpQuery,
	SerpResult,
} from "../types.js";

/** 의료 키워드 — URL/이름에 포함된 경우 제외 (POLICY § 5.4) */
const MEDICAL_KEYWORDS = [
	"hospital",
	"clinic",
	"pharmacy",
	"의원",
	"병원",
	"약국",
	"치과",
	"한의원",
];
/** SNS 도메인 — 제외 (POLICY § 23.x) */
const SNS_DOMAINS = [
	"instagram.com",
	"facebook.com",
	"tiktok.com",
	"youtube.com",
	"twitter.com",
	"x.com",
];

function isMedical(url: string, name: string): boolean {
	const lower = `${url} ${name}`.toLowerCase();
	return MEDICAL_KEYWORDS.some((k) => lower.includes(k));
}

function allowMedicalCompetitors(): boolean {
	return ["1", "true", "yes", "local"].includes(
		(process.env.X_SAG_ALLOW_MEDICAL_COMPETITORS ?? "").toLowerCase(),
	);
}

function isSns(url: string): boolean {
	return SNS_DOMAINS.some((d) => url.toLowerCase().includes(d));
}

interface SerpApiLocalResult {
	position?: number;
	title?: string;
	link?: string;
	snippet?: string;
	rating?: number;
	reviews?: number;
}

interface SerpApiResponse {
	local_results?: SerpApiLocalResult[];
	organic_results?: SerpApiLocalResult[];
	error?: string;
}

function getSerpApiKey(): string | undefined {
	return process.env.SERPAPI_KEY ?? process.env.SERPAPI_API_KEY;
}

export class SerpApiProvider implements SerpAdapter {
	readonly name = "serpapi" as const;

	isAvailable(): boolean {
		return Boolean(getSerpApiKey());
	}

	async search(query: SerpQuery, selfDomain?: string): Promise<SerpResult> {
		const apiKey = getSerpApiKey();
		if (!apiKey) {
			throw new Error("SERPAPI_KEY is not set");
		}

		const params = new URLSearchParams({
			api_key: apiKey,
			engine: "naver",
			query: [query.region, query.keyword].filter(Boolean).join(" "),
			gl: "kr",
			hl: query.language ?? "ko",
			num: String(query.limit ?? 10),
		});

		const response = await fetch(
			`https://serpapi.com/search?${params.toString()}`,
		);
		if (!response.ok) {
			throw new Error(
				`SerpAPI HTTP ${response.status}: ${response.statusText}`,
			);
		}

		const data = (await response.json()) as SerpApiResponse;
		if (data.error) {
			throw new Error(`SerpAPI error: ${data.error}`);
		}

		// Prefer local_results (map), fall back to organic_results
		const rawResults = data.local_results ?? data.organic_results ?? [];

		const now = new Date();
		const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		let selfRank: number | null = null;
		const competitors: SerpCompetitor[] = [];

		for (const result of rawResults) {
			const url = result.link ?? "";
			const name = result.title ?? "";
			const rank = result.position ?? competitors.length + 1;

			// 의료/SNS 제외 (POLICY § 5.4, § 23.x).
			// 로컬 검증은 X_SAG_ALLOW_MEDICAL_COMPETITORS=true로 해제 가능.
			if ((!allowMedicalCompetitors() && isMedical(url, name)) || isSns(url))
				continue;

			// 자기 매장 감지
			if (selfDomain && url.includes(selfDomain)) {
				selfRank = rank;
				continue;
			}

			const competitor: SerpCompetitor = {
				rank,
				name,
				url,
				signals: { rank },
			};
			if (result.snippet !== undefined) competitor.snippet = result.snippet;
			if (result.reviews !== undefined)
				competitor.signals.reviewCount = result.reviews;
			competitors.push(competitor);
		}

		return {
			rank: selfRank,
			competitors,
			source: "serpapi",
			cachedAt: now.toISOString(),
			expiresAt: expires.toISOString(),
		};
	}
}
