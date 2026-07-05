import { describe, expect, it } from "vitest";

import {
  type KeywordSignalClient,
  collectSignals,
  createQuotaGuard,
  expand,
  naverScore,
} from "../index.js";

describe("@radar/keyword-pipeline", () => {
  it("expands niche Korean seeds with deterministic fallback and cluster ids", async () => {
    const result = await expand("성수동 비건 베이커리", {
      limit: 8,
      source: {
        async suggest() {
          return [];
        },
      },
    });

    expect(result.status).toBe("fallback");
    expect(result.keywords).toHaveLength(8);
    expect(result.keywords[0]).toMatchObject({
      text: "성수동 비건 베이커리",
      hop: 0,
      fallback: false,
    });
    expect(result.keywords.some((keyword) => keyword.text.includes("후기"))).toBe(true);
    expect(new Set(result.keywords.map((keyword) => keyword.clusterId)).size).toBeGreaterThan(1);
    expect(result.warnings).toContain("expansion_source_empty");
  });

  it("collects signal evidence while reporting partial channel failures", async () => {
    const client: KeywordSignalClient = {
      async fetchBlog(keyword) {
        return {
          docs: keyword.text.includes("비건") ? 420 : 120,
          checkedAt: "2026-07-05T00:00:00.000Z",
        };
      },
      async fetchSearchAd(keyword) {
        return {
          monthlySearches: keyword.text.includes("비건") ? 1800 : 360,
          checkedAt: "2026-07-05T00:00:00.000Z",
        };
      },
      async fetchDatalab() {
        throw new Error("datalab temporarily unavailable");
      },
    };

    const result = await collectSignals(
      [{ text: "성수동 비건 베이커리", clusterId: "성수동", hop: 0 }],
      {
        client,
        now: new Date("2026-07-05T00:00:00.000Z"),
      },
    );

    expect(result.status).toBe("partial");
    expect(result.channelStatus.blog.status).toBe("complete");
    expect(result.channelStatus.searchAd.status).toBe("complete");
    expect(result.channelStatus.datalab.status).toBe("failed");
    expect(result.signals[0]?.evidence.volume).toBe(1800);
    expect(result.signals[0]?.evidence.docs).toBe(420);
    expect(result.signals[0]?.evidence.trend7d).toBeNull();
  });

  it("uses quota guard budgets to return skipped channels instead of failing the scan", async () => {
    const guard = createQuotaGuard({
      blog: { dailyBudget: 0, used: 0 },
      searchAd: { dailyBudget: 1, used: 1 },
      datalab: { dailyBudget: 1, used: 1 },
    });

    const result = await collectSignals([{ text: "작은 카페", clusterId: "작은", hop: 0 }], {
      client: {
        async fetchBlog() {
          throw new Error("should not be called");
        },
        async fetchSearchAd() {
          throw new Error("should not be called");
        },
        async fetchDatalab() {
          throw new Error("should not be called");
        },
      },
      quotaGuard: guard,
    });

    expect(result.status).toBe("skipped");
    expect(result.channelStatus.blog.status).toBe("skipped");
    expect(result.channelStatus.searchAd.status).toBe("skipped");
    expect(result.channelStatus.datalab.status).toBe("skipped");
    expect(result.signals[0]?.evidence).toMatchObject({
      volume: null,
      docs: null,
      saturation: null,
      trend7d: null,
    });
  });

  it("scores Naver evidence with volume, saturation, and trend components", () => {
    const score = naverScore({
      keyword: { text: "성수동 비건 베이커리", clusterId: "성수동", hop: 0 },
      evidence: {
        volume: 1800,
        docs: 420,
        saturation: 0.23,
        trend7d: 0.18,
        checkedAt: "2026-07-05T00:00:00.000Z",
      },
      channels: {
        blog: "complete",
        searchAd: "complete",
        datalab: "complete",
      },
    });

    expect(score.score).toBeGreaterThan(70);
    expect(score.state).toBe("good");
    expect(score.evidence).toMatchObject({
      volume: 1800,
      docs: 420,
      saturation: 0.23,
      trend7d: 0.18,
    });
    expect(score.reasons).toContain("검색량이 충분해요");
  });

  it("rejects empty or malformed seeds", async () => {
    await expect(expand("   ")).rejects.toThrow("seed is required");
  });
});
