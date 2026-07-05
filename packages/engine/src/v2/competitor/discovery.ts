/**
 * X-SAG Core Engine — CompetitorDiscoveryEngine
 *
 * SERP 기반 경쟁사 자동 발견 엔진.
 * TRD § 19.2.4
 *
 * POLICY § 5.4: 의료/SNS 도메인 자동 제외
 * POLICY § 22: 캐시 24h, 일일 한도 적용 (API 레이어에서 처리)
 */

import type { SerpAdapter, SerpCompetitor, SerpQuery } from "../serp/types.js";
import { rankCompetitors } from "./ranker.js";
import type {
	DiscoveredCompetitor,
	DiscoveryInput,
	DiscoveryResult,
} from "./types.js";

/** 의료 키워드 (URL + 이름 체크) */
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

/** SNS 도메인 */
const SNS_DOMAINS = [
	"instagram.com",
	"facebook.com",
	"tiktok.com",
	"youtube.com",
	"twitter.com",
	"x.com",
	"naver.com/blog",
	"blog.naver.com",
];

function allowMedicalCompetitors(): boolean {
	return ["1", "true", "yes", "local"].includes(
		(process.env.X_SAG_ALLOW_MEDICAL_COMPETITORS ?? "").toLowerCase(),
	);
}

function hostnameOf(value: string): string | null {
	try {
		return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return null;
	}
}

function matchesExcludedUrl(url: string, excluded: string): boolean {
	if (url.includes(excluded)) return true;

	const urlHost = hostnameOf(url);
	const excludedHost = hostnameOf(excluded);
	if (!urlHost || !excludedHost) return false;

	return urlHost === excludedHost || urlHost.endsWith(`.${excludedHost}`);
}

/**
 * 경쟁사 자동 발견 엔진.
 *
 * @example
 * const engine = new CompetitorDiscoveryEngine(createSerpAdapter());
 * const result = await engine.discover({
 *   industry: "카페/음식점",
 *   region: "서울 강남구",
 *   targetKeywords: ["강남 카페", "테이크아웃"],
 *   topN: 3,
 * });
 */
export class CompetitorDiscoveryEngine {
	constructor(private readonly serp: SerpAdapter) {}

	async discover(input: DiscoveryInput): Promise<DiscoveryResult> {
		// 1. 검색 쿼리 구성
		const queries = this.buildQueries(input);

		// 2. 각 쿼리 SERP 호출 + 결과 병합
		const allCompetitors = new Map<string, SerpCompetitor>();

		for (const q of queries) {
			try {
				const result = await this.serp.search(q);
				for (const c of result.competitors) {
					if (this.shouldExclude(c, input)) continue;

					const existing = allCompetitors.get(c.url);
					if (existing) {
						// 같은 URL이면 mentions 증가 (복수 쿼리에서 등장 = 높은 인기)
						existing.signals.mentions = (existing.signals.mentions ?? 0) + 1;
					} else {
						allCompetitors.set(c.url, {
							...c,
							signals: { ...c.signals, mentions: 1 },
						});
					}
				}
			} catch (err) {
				// 한 쿼리 실패해도 계속 진행
				console.warn(
					"[CompetitorDiscoveryEngine] Query failed:",
					q.keyword,
					err,
				);
			}
		}

		// 3. 인기 점수 기반 정렬
		const ranked = rankCompetitors([...allCompetitors.values()]);

		// 4. topN 자르기
		const top = ranked.slice(0, input.topN);

		// 5. DiscoveredCompetitor로 변환 (estimatedScores는 이후 단계에서 채워짐)
		const competitors: DiscoveredCompetitor[] = top.map((c) => {
			// exactOptionalPropertyTypes: 명시적 undefined 할당 금지 → 속성 자체를 생략
			const discovered: DiscoveredCompetitor = { ...c };
			return discovered;
		});

		return {
			competitors,
			signalSource: "serp",
			discoveredAt: new Date().toISOString(),
		};
	}

	/**
	 * industry + region + targetKeywords로 검색 쿼리 목록 생성.
	 * 최대 4개 쿼리 (기본 1개 + 키워드 최대 3개).
	 */
	private buildQueries(input: DiscoveryInput): SerpQuery[] {
		const queries: SerpQuery[] = [
			{ keyword: `${input.region} ${input.industry}` },
		];

		for (const kw of input.targetKeywords.slice(0, 3)) {
			queries.push({ keyword: `${input.region} ${kw}` });
		}

		return queries;
	}

	/**
	 * 제외 여부 판단:
	 * - excludeUrls 목록에 포함된 URL
	 * - 의료 키워드 포함 (POLICY § 5.4)
	 * - SNS 도메인 (POLICY § 23.x)
	 */
	private shouldExclude(c: SerpCompetitor, input: DiscoveryInput): boolean {
		// 명시적 제외 목록
		if (input.excludeUrls?.some((u) => matchesExcludedUrl(c.url, u))) return true;

		const url = c.url.toLowerCase();
		const name = c.name.toLowerCase();

		// 의료 도메인 제외. 로컬 검증은 X_SAG_ALLOW_MEDICAL_COMPETITORS=true로 해제 가능.
		if (
			!allowMedicalCompetitors() &&
			MEDICAL_KEYWORDS.some((k) => url.includes(k) || name.includes(k))
		)
			return true;

		// SNS 도메인 제외
		if (SNS_DOMAINS.some((d) => url.includes(d))) return true;

		return false;
	}
}
