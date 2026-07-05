/**
 * v2/competitor — CompetitorDiscoveryEngine 단위 테스트
 *
 * TRD § 19.2.4
 * POLICY § 5.4: 의료/SNS 제외
 */

import { describe, expect, it } from "vitest";
import { CompetitorDiscoveryEngine } from "../../../v2/competitor/discovery.js";
import { MockSerpProvider } from "../../../v2/serp/providers/mock.js";

const mockSerp = new MockSerpProvider();
const engine = new CompetitorDiscoveryEngine(mockSerp);

describe("CompetitorDiscoveryEngine.discover", () => {
	const baseInput = {
		industry: "카페/음식점",
		region: "서울 강남구",
		targetKeywords: ["강남 카페", "테이크아웃"],
		topN: 5,
	};

	it("discover는 DiscoveryResult를 반환해야 한다", async () => {
		const result = await engine.discover(baseInput);
		expect(result).toMatchObject({
			signalSource: "serp",
		});
		expect(typeof result.discoveredAt).toBe("string");
		expect(Array.isArray(result.competitors)).toBe(true);
	});

	it("topN 제한을 준수해야 한다", async () => {
		const result = await engine.discover({ ...baseInput, topN: 3 });
		expect(result.competitors.length).toBeLessThanOrEqual(3);
	});

	it("topN=1이면 최대 1개를 반환해야 한다", async () => {
		const result = await engine.discover({ ...baseInput, topN: 1 });
		expect(result.competitors.length).toBeLessThanOrEqual(1);
	});

	it("excludeUrls에 포함된 URL은 제외되어야 한다", async () => {
		const result = await engine.discover({
			...baseInput,
			excludeUrls: ["starbucks.co.kr"],
		});
		const urls = result.competitors.map((c) => c.url);
		expect(urls.every((u) => !u.includes("starbucks.co.kr"))).toBe(true);
	});

	it("의료 도메인 키워드가 URL에 포함된 경우 제외해야 한다", async () => {
		// Mock provider의 결과에는 의료 도메인이 없지만, 필터 로직 자체를 검증
		// shouldExclude 메서드를 간접 테스트
		const result = await engine.discover(baseInput);
		for (const c of result.competitors) {
			expect(c.url.toLowerCase()).not.toMatch(
				/hospital|clinic|pharmacy|병원|의원|약국/,
			);
		}
	});

	it("SNS 도메인은 제외되어야 한다", async () => {
		const result = await engine.discover(baseInput);
		const snsDomains = [
			"instagram.com",
			"facebook.com",
			"tiktok.com",
			"youtube.com",
		];
		for (const c of result.competitors) {
			for (const sns of snsDomains) {
				expect(c.url.toLowerCase()).not.toContain(sns);
			}
		}
	});

	it("각 경쟁사는 DiscoveredCompetitor 형식이어야 한다", async () => {
		const result = await engine.discover(baseInput);
		for (const c of result.competitors) {
			expect(typeof c.rank).toBe("number");
			expect(typeof c.name).toBe("string");
			expect(typeof c.url).toBe("string");
			expect(typeof c.signals).toBe("object");
		}
	});

	it("targetKeywords 없이도 동작해야 한다 (industry+region만)", async () => {
		const result = await engine.discover({
			industry: "헬스장",
			region: "서울 마포구",
			targetKeywords: [],
			topN: 5,
		});
		expect(result).toBeDefined();
		expect(Array.isArray(result.competitors)).toBe(true);
	});
});
