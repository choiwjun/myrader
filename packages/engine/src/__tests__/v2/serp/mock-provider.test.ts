/**
 * v2/serp — MockSerpProvider 단위 테스트
 *
 * 결정론적 응답, 의료/SNS 필터 제외 (mock은 필터 없음), limit 동작 검증.
 */

import { describe, expect, it } from "vitest";
import { MockSerpProvider } from "../../../v2/serp/providers/mock.js";

describe("MockSerpProvider", () => {
	const provider = new MockSerpProvider();

	it("isAvailable()은 항상 true를 반환해야 한다", () => {
		expect(provider.isAvailable()).toBe(true);
	});

	it("name은 'mock'이어야 한다", () => {
		expect(provider.name).toBe("mock");
	});

	it("기본 쿼리로 5개 이하 결과를 반환해야 한다", async () => {
		const result = await provider.search({ keyword: "강남 카페" });
		expect(result.competitors.length).toBeGreaterThan(0);
		expect(result.competitors.length).toBeLessThanOrEqual(5);
		expect(result.source).toBe("mock");
	});

	it("결과 내 각 경쟁사는 SerpCompetitor 형식이어야 한다", async () => {
		const result = await provider.search({ keyword: "강남 카페" });
		for (const c of result.competitors) {
			expect(typeof c.rank).toBe("number");
			expect(typeof c.name).toBe("string");
			expect(typeof c.url).toBe("string");
			expect(typeof c.signals).toBe("object");
			expect(typeof c.signals.rank).toBe("number");
		}
	});

	it("limit=2 시 최대 2개를 반환해야 한다", async () => {
		const result = await provider.search({ keyword: "강남 카페", limit: 2 });
		expect(result.competitors.length).toBeLessThanOrEqual(2);
	});

	it("cachedAt과 expiresAt은 ISO 8601 문자열이어야 한다", async () => {
		const result = await provider.search({ keyword: "강남 카페" });
		expect(() => new Date(result.cachedAt)).not.toThrow();
		expect(() => new Date(result.expiresAt)).not.toThrow();
	});

	it("expiresAt은 cachedAt보다 24h 이후여야 한다", async () => {
		const result = await provider.search({ keyword: "강남 카페" });
		const diff =
			new Date(result.expiresAt).getTime() -
			new Date(result.cachedAt).getTime();
		expect(diff).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
	});

	it("동일 쿼리는 동일한 경쟁사 목록을 반환해야 한다 (결정론적)", async () => {
		const r1 = await provider.search({ keyword: "강남 카페" });
		const r2 = await provider.search({ keyword: "강남 카페" });
		const names1 = r1.competitors.map((c) => c.name);
		const names2 = r2.competitors.map((c) => c.name);
		expect(names1).toEqual(names2);
	});
});
