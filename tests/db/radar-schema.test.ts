import { describe, expect, it } from "vitest";

import {
  RadarKeywordSchema,
  RadarScanStatusSchema,
  RadarSubscriptionStatusSchema,
} from "@boina/contracts/radar";
import {
  createRadarRepository,
  radarFeedback,
  radarKeywords,
  radarScans,
  radarSubscriptions,
} from "@boina/db";

describe("radar schema wiring", () => {
  it("exports the four radar tables required by the planning docs", () => {
    expect(tableName(radarSubscriptions)).toBe("radar_subscriptions");
    expect(tableName(radarScans)).toBe("radar_scans");
    expect(tableName(radarKeywords)).toBe("radar_keywords");
    expect(tableName(radarFeedback)).toBe("radar_feedback");
  });

  it("keeps DB statuses aligned with public contracts", () => {
    expect(RadarSubscriptionStatusSchema.parse("active")).toBe("active");
    expect(RadarSubscriptionStatusSchema.parse("past_due")).toBe("past_due");
    expect(RadarScanStatusSchema.parse("expanding")).toBe("expanding");
    expect(RadarScanStatusSchema.parse("skipped")).toBe("skipped");
  });

  it("accepts keyword evidence persisted from the keyword pipeline", () => {
    const parsed = RadarKeywordSchema.parse({
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

    expect(parsed.naverEvidence?.docs).toBe(420);
  });

  it("exposes a radar repository factory for jobs and app routes", () => {
    expect(typeof createRadarRepository).toBe("function");
  });
});

function tableName(table: object): unknown {
  return (table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")];
}
