/**
 * X-SAG Core Engine — Naver Open API SERP Provider (폴백)
 *
 * Naver 지역 검색 API: https://openapi.naver.com/v1/search/local.json
 * env: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 *
 * TRD § 19.2.1
 * POLICY § 22: SERP 데이터 수집 — Naver는 SerpAPI 폴백
 * POLICY § 5.4: 의료/SNS 도메인 제외
 */

import type {
	SerpAdapter,
	SerpCompetitor,
	SerpQuery,
	SerpResult,
} from "../types.js";

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

/** Naver Local Search API item */
interface NaverLocalItem {
	title?: string;
	link?: string;
	description?: string;
	address?: string;
	roadAddress?: string;
	category?: string;
	telephone?: string;
}

interface NaverLocalResponse {
	lastBuildDate?: string;
	total?: number;
	start?: number;
	display?: number;
	items?: NaverLocalItem[];
}

/** HTML 태그 제거 (Naver API 응답에 <b> 태그 포함) */
function stripHtml(str: string): string {
	return str.replace(/<[^>]*>/g, "").trim();
}

function makeNaverMapSearchUrl(name: string, address?: string): string {
	const query = [name, address].filter(Boolean).join(" ");
	return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

export class NaverSerpProvider implements SerpAdapter {
	readonly name = "naver" as const;

	isAvailable(): boolean {
		return Boolean(
			process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET,
		);
	}

	async search(query: SerpQuery, selfDomain?: string): Promise<SerpResult> {
		const clientId = process.env.NAVER_CLIENT_ID;
		const clientSecret = process.env.NAVER_CLIENT_SECRET;
		if (!clientId || !clientSecret) {
			throw new Error("NAVER_CLIENT_ID or NAVER_CLIENT_SECRET is not set");
		}

		const keyword = [query.region, query.keyword].filter(Boolean).join(" ");
		const params = new URLSearchParams({
			query: keyword,
			display: String(Math.min(query.limit ?? 10, 5)), // Naver 무료 최대 5
			start: "1",
		});

		const response = await fetch(
			`https://openapi.naver.com/v1/search/local.json?${params.toString()}`,
			{
				headers: {
					"X-Naver-Client-Id": clientId,
					"X-Naver-Client-Secret": clientSecret,
				},
			},
		);

		if (!response.ok) {
			throw new Error(
				`Naver API HTTP ${response.status}: ${response.statusText}`,
			);
		}

		const data = (await response.json()) as NaverLocalResponse;
		const items = data.items ?? [];

		const now = new Date();
		const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		let selfRank: number | null = null;
		const competitors: SerpCompetitor[] = [];
		let rank = 1;

		for (const item of items) {
			const name = stripHtml(item.title ?? "");
			const url =
				item.link?.trim() ||
				makeNaverMapSearchUrl(name, item.roadAddress ?? item.address);

			// 의료/SNS 제외. 로컬 검증은 X_SAG_ALLOW_MEDICAL_COMPETITORS=true로 해제 가능.
			if ((!allowMedicalCompetitors() && isMedical(url, name)) || isSns(url))
				continue;

			// 자기 매장 감지
			if (selfDomain && url.includes(selfDomain)) {
				selfRank = rank;
				rank++;
				continue;
			}

			const competitor: SerpCompetitor = {
				rank,
				name,
				url,
				signals: { rank },
			};
			if (item.description) competitor.snippet = stripHtml(item.description);
			competitors.push(competitor);

			rank++;
		}

		return {
			rank: selfRank,
			competitors,
			source: "naver",
			cachedAt: now.toISOString(),
			expiresAt: expires.toISOString(),
		};
	}
}
