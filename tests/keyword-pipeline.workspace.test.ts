import { describe, expect, it } from "vitest";

describe("@radar/keyword-pipeline workspace wiring", () => {
  it("imports the package by workspace name and expands a niche seed", async () => {
    const keywordPipeline = await import("@radar/keyword-pipeline");
    const result = await keywordPipeline.expand("성수동 비건 베이커리", {
      limit: 3,
      source: { suggest: async () => [] },
    });

    expect(result.status).toBe("fallback");
    expect(result.keywords).toHaveLength(3);
    expect(result.keywords[0]?.clusterId).toBe("성수동");
  });
});
