import { describe, expect, it } from "vitest";

import {
  RadarKeywordSchema,
  RadarScanStatusSchema,
  RadarSubscriptionStatusSchema,
} from "../radar.js";

describe("radar contracts", () => {
  it("accepts subscription and scan status values used by the DB", () => {
    expect(RadarSubscriptionStatusSchema.parse("active")).toBe("active");
    expect(RadarSubscriptionStatusSchema.parse("past_due")).toBe("past_due");
    expect(RadarScanStatusSchema.parse("scoring")).toBe("scoring");
    expect(RadarScanStatusSchema.parse("partial")).toBe("partial");
  });

  it("keeps Naver evidence required for transparent keyword cards", () => {
    const keyword = RadarKeywordSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      scanId: "22222222-2222-4222-8222-222222222222",
      text: "성수동 비건 베이커리",
      clusterId: "성수동",
      freq: 0,
      hop: 0,
      viaToken: null,
      naverScore: 90,
      naverEvidence: {
        volume: 1800,
        docs: 420,
        saturation: 0.23,
        trend7d: 0.18,
        checkedAt: "2026-07-05T00:00:00.000Z",
      },
      aiScore: null,
      aiEvidence: null,
      verdict: "now",
    });

    expect(keyword.naverEvidence?.saturation).toBe(0.23);
    expect(keyword.verdict).toBe("now");
  });
});
