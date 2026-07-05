import { describe, expect, it } from "vitest";

import type {
  NewRadarKeyword,
  NewRadarScan,
  NewRadarSubscription,
  RadarKeyword,
  RadarScan,
  RadarSubscription,
} from "@boina/db";
import type {
  GeoQuery,
  GeoValidationInput,
  GeoValidationResult,
  GeoValidator,
} from "@boina/engine/v2/geo-validator";
import type { KeywordSignalClient } from "@radar/keyword-pipeline";
import {
  type RadarScanRepository,
  type RadarScanTarget,
  processDueRadarScans,
} from "../../lib/radar/radar-scan-job.js";

describe("processDueRadarScans", () => {
  it("creates one scan per due subscription and stores scored keywords", async () => {
    const repo = new FakeRadarRepo([
      {
        subscriptionId: "11111111-1111-4111-8111-111111111111",
        businessId: "22222222-2222-4222-8222-222222222222",
        businessName: "비건빵집",
        region: "성수동",
        category: "베이커리",
      },
    ]);

    const result = await processDueRadarScans(repo, {
      now: new Date("2026-07-05T00:00:00.000Z"),
      keywordLimit: 5,
      signalLimit: 2,
      signalOptions: { client: completeClient() },
    });

    expect(result).toMatchObject({ processed: 1, completed: 1, failed: 0 });
    expect(repo.scans).toHaveLength(1);
    expect(repo.keywords).toHaveLength(2);
    expect(repo.keywords[0]?.naverScore).toBeGreaterThan(70);
    expect(repo.scanUpdates.at(-1)?.status).toBe("done");
  });

  it("stores AI citation probe evidence for the top scored keywords", async () => {
    const repo = new FakeRadarRepo([
      {
        subscriptionId: "11111111-1111-4111-8111-111111111111",
        businessId: "22222222-2222-4222-8222-222222222222",
        businessName: "비건빵집",
        region: "성수동",
        category: "베이커리",
        homepageUrl: "https://vegan.example",
      },
    ]);
    const geoValidator = new FakeGeoValidator();

    const result = await processDueRadarScans(repo, {
      now: new Date("2026-07-05T00:00:00.000Z"),
      keywordLimit: 5,
      probeLimit: 2,
      signalLimit: 4,
      signalOptions: { client: completeClient() },
      geoValidator,
    });

    expect(result).toMatchObject({ processed: 1, completed: 1, failed: 0 });
    expect(geoValidator.inputs[0]).toMatchObject({
      businessName: "비건빵집",
      industry: "베이커리",
      region: "성수동",
      url: "https://vegan.example",
    });
    expect(geoValidator.inputs[0]?.targetKeywords).toHaveLength(2);
    expect(repo.scanUpdates.some((patch) => patch.status === "probing")).toBe(true);
    expect(
      repo.keywords.filter((keyword) => keyword.aiScore !== null && keyword.aiScore !== undefined),
    ).toHaveLength(2);
    expect(repo.keywords[0]?.aiEvidence).toMatchObject({
      probeSummary: "AI 응답 2건 중 가게명 언급 1건",
      checkedAt: "2026-07-05T00:00:00.000Z",
    });
  });

  it("keeps scored keywords when the AI citation probe fails", async () => {
    const repo = new FakeRadarRepo([
      {
        subscriptionId: "11111111-1111-4111-8111-111111111111",
        businessId: "22222222-2222-4222-8222-222222222222",
        businessName: "비건빵집",
        region: "성수동",
        category: "베이커리",
        naverPlaceId: "12345",
      },
    ]);

    const result = await processDueRadarScans(repo, {
      now: new Date("2026-07-05T00:00:00.000Z"),
      keywordLimit: 3,
      probeLimit: 1,
      signalLimit: 2,
      signalOptions: { client: completeClient() },
      geoValidator: new FailingGeoValidator(),
    });

    expect(result).toMatchObject({ processed: 1, completed: 0, partial: 1, failed: 0 });
    expect(repo.keywords).toHaveLength(2);
    expect(repo.keywords.every((keyword) => keyword.aiScore == null)).toBe(true);
    expect(
      repo.scanUpdates.some(
        (patch) => patch.status === "partial" && patch.stageDetail === "probing_failed",
      ),
    ).toBe(true);
    expect(repo.scanUpdates.at(-1)).toMatchObject({
      status: "partial",
      stageDetail: "partial",
    });
  });

  it("marks partial scans without failing the whole fan-out", async () => {
    const repo = new FakeRadarRepo([
      {
        subscriptionId: "11111111-1111-4111-8111-111111111111",
        businessId: "22222222-2222-4222-8222-222222222222",
        businessName: "비건빵집",
        region: "성수동",
        category: "베이커리",
      },
    ]);

    const result = await processDueRadarScans(repo, {
      now: new Date("2026-07-05T00:00:00.000Z"),
      keywordLimit: 3,
      signalLimit: 1,
      signalOptions: {
        client: {
          ...completeClient(),
          async fetchDatalab() {
            throw new Error("quota");
          },
        },
      },
    });

    expect(result).toMatchObject({ processed: 1, partial: 1, failed: 0 });
    expect(repo.scanUpdates.at(-1)?.status).toBe("partial");
    expect(repo.keywords[0]?.naverEvidence?.trend7d).toBeNull();
  });

  it("isolates failures per subscription", async () => {
    const repo = new FakeRadarRepo([
      {
        subscriptionId: "11111111-1111-4111-8111-111111111111",
        businessId: "22222222-2222-4222-8222-222222222222",
        businessName: "첫가게",
        region: "성수동",
        category: "카페",
      },
      {
        subscriptionId: "33333333-3333-4333-8333-333333333333",
        businessId: "44444444-4444-4444-8444-444444444444",
        businessName: "둘째가게",
        region: "홍대",
        category: "식당",
      },
    ]);
    repo.failNextCreateScan = true;

    const result = await processDueRadarScans(repo, {
      now: new Date("2026-07-05T00:00:00.000Z"),
      keywordLimit: 3,
      signalLimit: 1,
      signalOptions: { client: completeClient() },
    });

    expect(result).toMatchObject({ processed: 2, completed: 1, failed: 1 });
    expect(repo.keywords).toHaveLength(1);
  });
});

function completeClient(): KeywordSignalClient {
  return {
    async fetchBlog() {
      return { docs: 420, checkedAt: "2026-07-05T00:00:00.000Z" };
    },
    async fetchSearchAd() {
      return { monthlySearches: 1800, checkedAt: "2026-07-05T00:00:00.000Z" };
    },
    async fetchDatalab() {
      return { trend7d: 0.18, checkedAt: "2026-07-05T00:00:00.000Z" };
    },
  };
}

class FakeGeoValidator implements GeoValidator {
  readonly name = "mock";
  readonly inputs: GeoValidationInput[] = [];

  isAvailable(): boolean {
    return true;
  }

  async validate(input: GeoValidationInput, queries?: GeoQuery[]): Promise<GeoValidationResult> {
    this.inputs.push(input);
    return {
      url: input.url,
      businessName: input.businessName,
      source: "mock",
      validatedAt: "2026-07-05T00:00:00.000Z",
      metrics: {
        mentionRate: 0.5,
        urlRate: 0,
        directMentionRate: 0.5,
        competitorCount: 1,
      },
      citations: [
        {
          query: queries?.[0]?.query ?? "비건빵집 알려줘",
          facet: "brand-mention",
          llmResponse: "비건빵집은 성수동 베이커리입니다.",
          hasMention: true,
          hasUrl: false,
          isDirectMention: true,
          mentionedCompetitors: [],
          recommendedBusinesses: [],
          measuredAt: "2026-07-05T00:00:00.000Z",
        },
        {
          query: "성수동 베이커리 추천",
          facet: "industry-region",
          llmResponse: "다른 베이커리도 함께 비교됩니다.",
          hasMention: false,
          hasUrl: false,
          isDirectMention: false,
          mentionedCompetitors: ["다른베이커리"],
          recommendedBusinesses: [],
          measuredAt: "2026-07-05T00:00:00.000Z",
        },
      ],
    };
  }
}

class FailingGeoValidator implements GeoValidator {
  readonly name = "failing";

  isAvailable(): boolean {
    return true;
  }

  async validate(): Promise<GeoValidationResult> {
    throw new Error("probe down");
  }
}

class FakeRadarRepo implements RadarScanRepository {
  failNextCreateScan = false;
  readonly scans: NewRadarScan[] = [];
  readonly scanUpdates: Array<Pick<NewRadarScan, "status" | "stageDetail" | "errorMessage">> = [];
  readonly keywords: NewRadarKeyword[] = [];
  readonly subscriptions: NewRadarSubscription[] = [];

  constructor(private readonly targets: readonly RadarScanTarget[]) {}

  async findDueScanTargets(): Promise<readonly RadarScanTarget[]> {
    return this.targets;
  }

  async createScan(input: NewRadarScan): Promise<RadarScan | undefined> {
    if (this.failNextCreateScan) {
      this.failNextCreateScan = false;
      return undefined;
    }
    this.scans.push(input);
    return {
      id: `scan-${this.scans.length}`,
      subscriptionId: input.subscriptionId,
      businessId: input.businessId,
      trigger: input.trigger ?? "auto",
      status: input.status ?? "queued",
      stageDetail: input.stageDetail ?? null,
      errorMessage: input.errorMessage ?? null,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async updateScanStatus(
    scanId: string,
    patch: Pick<
      NewRadarScan,
      "status" | "stageDetail" | "errorMessage" | "startedAt" | "finishedAt"
    >,
  ): Promise<RadarScan> {
    this.scanUpdates.push(patch);
    return {
      id: scanId,
      subscriptionId: this.targets[0]?.subscriptionId ?? "sub",
      businessId: this.targets[0]?.businessId ?? "biz",
      trigger: "auto",
      status: patch.status ?? "queued",
      stageDetail: patch.stageDetail ?? null,
      errorMessage: patch.errorMessage ?? null,
      startedAt: patch.startedAt ?? null,
      finishedAt: patch.finishedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async insertKeywords(input: readonly NewRadarKeyword[]): Promise<readonly RadarKeyword[]> {
    this.keywords.push(...input);
    return input.map((keyword, index) => ({
      id: `keyword-${index}`,
      scanId: keyword.scanId,
      text: keyword.text,
      clusterId: keyword.clusterId,
      freq: keyword.freq ?? 0,
      hop: keyword.hop ?? 0,
      viaToken: keyword.viaToken ?? null,
      naverScore: keyword.naverScore ?? null,
      naverEvidence: keyword.naverEvidence ?? null,
      aiScore: keyword.aiScore ?? null,
      aiEvidence: keyword.aiEvidence ?? null,
      verdict: keyword.verdict ?? "watch",
      createdAt: new Date(),
    }));
  }

  async upsertSubscription(input: NewRadarSubscription): Promise<RadarSubscription> {
    this.subscriptions.push(input);
    return {
      id: input.id ?? "subscription",
      businessId: input.businessId,
      accountId: input.accountId ?? null,
      status: input.status ?? "active",
      nextScanAt: input.nextScanAt ?? null,
      lastScanAt: input.lastScanAt ?? null,
      canceledAt: input.canceledAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
