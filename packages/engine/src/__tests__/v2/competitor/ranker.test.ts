/**
 * v2/competitor — rankCompetitors + computePopularityScore 단위 테스트
 *
 * POLICY § 23.4 가중치 검증
 */

import { describe, expect, it } from "vitest";
import {
	computePopularityScore,
	rankCompetitors,
} from "../../../v2/competitor/ranker.js";
import type { SerpCompetitor } from "../../../v2/serp/types.js";

function makeCompetitor(
	rank: number,
	options: {
		reviewCount?: number;
		domainAuthority?: number;
		mentions?: number;
	} = {},
): SerpCompetitor {
	return {
		rank,
		name: `경쟁사-${rank}`,
		url: `https://competitor-${rank}.kr`,
		signals: {
			rank,
			reviewCount: options.reviewCount,
			domainAuthority: options.domainAuthority,
			mentions: options.mentions,
		},
	};
}

describe("computePopularityScore", () => {
	it("rank=1이 rank=10보다 높은 점수를 가져야 한다", () => {
		const c1 = makeCompetitor(1);
		const c10 = makeCompetitor(10);
		expect(computePopularityScore(c1)).toBeGreaterThan(
			computePopularityScore(c10),
		);
	});

	it("reviewCount가 높을수록 점수가 높아야 한다 (rank 동일)", () => {
		const low = makeCompetitor(5, { reviewCount: 10 });
		const high = makeCompetitor(5, { reviewCount: 1000 });
		expect(computePopularityScore(high)).toBeGreaterThan(
			computePopularityScore(low),
		);
	});

	it("domainAuthority가 높을수록 점수가 높아야 한다 (rank 동일)", () => {
		const low = makeCompetitor(5, { domainAuthority: 10 });
		const high = makeCompetitor(5, { domainAuthority: 90 });
		expect(computePopularityScore(high)).toBeGreaterThan(
			computePopularityScore(low),
		);
	});

	it("mentions가 높을수록 점수가 높아야 한다 (rank 동일)", () => {
		const low = makeCompetitor(5, { mentions: 1 });
		const high = makeCompetitor(5, { mentions: 100 });
		expect(computePopularityScore(high)).toBeGreaterThan(
			computePopularityScore(low),
		);
	});

	it("점수는 0 이상의 숫자여야 한다", () => {
		const c = makeCompetitor(1);
		const score = computePopularityScore(c);
		expect(typeof score).toBe("number");
		expect(score).toBeGreaterThanOrEqual(0);
	});
});

describe("rankCompetitors", () => {
	it("빈 배열을 입력하면 빈 배열을 반환해야 한다", () => {
		expect(rankCompetitors([])).toEqual([]);
	});

	it("단일 항목은 그대로 반환해야 한다", () => {
		const c = makeCompetitor(1);
		expect(rankCompetitors([c])).toHaveLength(1);
	});

	it("점수 내림차순으로 정렬해야 한다", () => {
		const competitors = [
			makeCompetitor(10, { reviewCount: 10 }), // 낮은 점수
			makeCompetitor(1, { reviewCount: 1000 }), // 높은 점수
			makeCompetitor(5, { reviewCount: 100 }), // 중간 점수
		];
		const ranked = rankCompetitors(competitors);
		const scores = ranked.map(computePopularityScore);
		for (let i = 0; i < scores.length - 1; i++) {
			expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1] as number);
		}
	});

	it("원본 배열을 변경하지 않아야 한다", () => {
		const competitors = [
			makeCompetitor(3),
			makeCompetitor(1),
			makeCompetitor(2),
		];
		const original = [...competitors];
		rankCompetitors(competitors);
		expect(competitors.map((c) => c.rank)).toEqual(original.map((c) => c.rank));
	});
});
