/**
 * X-SAG Core Engine — Competitor Ranker
 *
 * PopularitySignals 기반 경쟁사 점수 계산 및 정렬.
 * POLICY § 23.4 가중치:
 *   - rank 40% (낮을수록 좋음)
 *   - reviewCount 30% (log10 스케일)
 *   - domainAuthority 20%
 *   - mentions 10% (log10 스케일)
 */

import type { SerpCompetitor } from "../serp/types.js";

/**
 * 인기 점수 계산 (0 ~ 1 범위).
 * POLICY § 23.4 가중치 적용.
 */
export function computePopularityScore(c: SerpCompetitor): number {
	// rank: 낮을수록 좋음 — 1/rank (rank 없으면 100으로 처리)
	const rankWeight = 1 / (c.signals.rank || 100);

	// reviewCount: log10 스케일, 최대 4 (10000+ 리뷰)
	const reviewWeight = Math.log10((c.signals.reviewCount ?? 1) + 1) / 4;

	// domainAuthority: 0-100 → 0-1
	const daWeight = (c.signals.domainAuthority ?? 0) / 100;

	// mentions: log10 스케일, 최대 4
	const mentionsWeight = Math.log10((c.signals.mentions ?? 1) + 1) / 4;

	return (
		rankWeight * 0.4 +
		reviewWeight * 0.3 +
		daWeight * 0.2 +
		mentionsWeight * 0.1
	);
}

/**
 * 경쟁사 목록을 인기 점수 내림차순으로 정렬.
 * 원본 배열을 변경하지 않는다.
 */
export function rankCompetitors(
	competitors: SerpCompetitor[],
): SerpCompetitor[] {
	return [...competitors]
		.map((c) => ({ c, score: computePopularityScore(c) }))
		.sort((a, b) => b.score - a.score)
		.map((x) => x.c);
}
