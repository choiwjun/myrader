/**
 * X-SAG Core Engine — Mock SERP Provider
 *
 * 테스트 환경에서 사용. X_SAG_SERP=mock 환경변수로 활성화.
 * 동일한 쿼리는 동일한 응답을 반환 (결정론적).
 */

import type { SerpAdapter, SerpQuery, SerpResult } from "../types.js";

/** 가상 경쟁사 5개 — 결정론적 목록 */
const MOCK_COMPETITORS = [
	{
		rank: 1,
		name: "스타벅스 강남점",
		url: "https://starbucks.co.kr/gangnam",
		snippet: "서울 강남구 대치동 위치. 프리미엄 원두 커피 전문점.",
		signals: { rank: 1, domainAuthority: 85, reviewCount: 2100, mentions: 5 },
	},
	{
		rank: 2,
		name: "투썸플레이스 강남대로점",
		url: "https://twosome.co.kr/gangnamdaero",
		snippet: "디저트 카페. 케이크와 커피의 완벽한 조화.",
		signals: { rank: 2, domainAuthority: 72, reviewCount: 980, mentions: 3 },
	},
	{
		rank: 3,
		name: "메가커피 강남역점",
		url: "https://megacoffee.kr/gangnamstation",
		snippet: "저렴한 가격의 대용량 커피. 강남역 도보 1분.",
		signals: { rank: 3, domainAuthority: 58, reviewCount: 654, mentions: 2 },
	},
	{
		rank: 4,
		name: "컴포즈커피 강남점",
		url: "https://composecoffee.com/gangnam",
		snippet: "가성비 최고의 카페. 다양한 커피 메뉴.",
		signals: { rank: 4, domainAuthority: 51, reviewCount: 432, mentions: 2 },
	},
	{
		rank: 5,
		name: "이디야커피 강남점",
		url: "https://ediya.com/gangnam",
		snippet: "전국 최대 규모 커피 전문점. 합리적인 가격.",
		signals: { rank: 5, domainAuthority: 63, reviewCount: 789, mentions: 1 },
	},
];

export class MockSerpProvider implements SerpAdapter {
	readonly name = "mock" as const;

	isAvailable(): boolean {
		return true;
	}

	async search(query: SerpQuery, selfDomain?: string): Promise<SerpResult> {
		const now = new Date();
		const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		// selfDomain 순위 계산 (결정론적)
		let selfRank: number | null = null;
		if (selfDomain) {
			const found = MOCK_COMPETITORS.find((c) => c.url.includes(selfDomain));
			selfRank = found ? found.rank : null;
		}

		// limit 적용
		const limit = query.limit ?? 10;
		const competitors = MOCK_COMPETITORS.slice(
			0,
			Math.min(limit, MOCK_COMPETITORS.length),
		);

		return {
			rank: selfRank,
			competitors,
			source: "mock",
			cachedAt: now.toISOString(),
			expiresAt: expires.toISOString(),
		};
	}
}
