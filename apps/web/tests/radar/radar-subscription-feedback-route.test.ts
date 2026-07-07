import { beforeEach, describe, expect, it, vi } from "vitest";

const diagnosisRepo = {
  findById: vi.fn(),
};

const businessRepo = {
  findById: vi.fn(),
};

const radarRepo = {
  findSubscriptionByBusinessId: vi.fn(),
  upsertSubscription: vi.fn(),
  latestScanForSubscription: vi.fn(),
  latestKeywordsForSubscription: vi.fn(),
  recordFeedback: vi.fn(),
};

vi.mock("@/lib/diagnosis/diagnosis-repository", () => ({
  getDefaultDiagnosisRepository: () => diagnosisRepo,
}));

vi.mock("@/lib/business", () => ({
  getDefaultBusinessRepository: () => businessRepo,
}));

vi.mock("@/lib/radar/radar-repository", () => ({
  getDefaultRadarRepository: () => radarRepo,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const { POST: subscribe } = await import("../../app/api/radar/subscription/route.js");
const { POST: feedback } = await import("../../app/api/radar/feedback/route.js");

const DIAGNOSIS_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const SUBSCRIPTION_ID = "33333333-3333-4333-8333-333333333333";
const SCAN_ID = "44444444-4444-4444-8444-444444444444";
const KEYWORD_ID = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  diagnosisRepo.findById.mockResolvedValue({ id: DIAGNOSIS_ID, businessId: BUSINESS_ID });
  businessRepo.findById.mockResolvedValue({ id: BUSINESS_ID });
  radarRepo.findSubscriptionByBusinessId.mockResolvedValue(null);
  radarRepo.upsertSubscription.mockResolvedValue({
    id: SUBSCRIPTION_ID,
    businessId: BUSINESS_ID,
    accountId: null,
    status: "trialing",
    nextScanAt: new Date("2026-07-07T00:00:00.000Z"),
    lastScanAt: null,
    canceledAt: null,
  });
  radarRepo.latestScanForSubscription.mockResolvedValue(null);
  radarRepo.latestKeywordsForSubscription.mockResolvedValue([]);
  radarRepo.recordFeedback.mockResolvedValue({ id: "feedback-1" });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/radar/subscription", () => {
  it("creates a trialing subscription and returns honest waiting preview before any scan result", async () => {
    const response = await subscribe(
      jsonRequest("http://localhost/api/radar/subscription", { diagnosisId: DIAGNOSIS_ID }),
    );
    const body = (await response.json()) as {
      success: boolean;
      data: { mode: string; rows: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { mode: "waiting", rows: [] } });
    expect(radarRepo.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        accountId: null,
        status: "trialing",
        canceledAt: null,
      }),
    );
    expect(radarRepo.latestKeywordsForSubscription).not.toHaveBeenCalled();
  });

  it("returns measured subscribed preview from latest completed scan keywords", async () => {
    radarRepo.latestScanForSubscription.mockResolvedValue({ id: SCAN_ID, status: "done" });
    radarRepo.latestKeywordsForSubscription.mockResolvedValue([
      {
        id: KEYWORD_ID,
        scanId: SCAN_ID,
        text: "성수동 비건빵집",
        verdict: "now",
        naverEvidence: {
          volume: 1800,
          docs: 420,
          saturation: 0.23,
          trend7d: 0.18,
          checkedAt: "2026-07-07T00:00:00.000Z",
        },
      },
    ]);

    const response = await subscribe(
      jsonRequest("http://localhost/api/radar/subscription", { diagnosisId: DIAGNOSIS_ID }),
    );
    const body = (await response.json()) as {
      data: { mode: string; source: string; rows: Array<{ id: string; actionHref: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ mode: "subscribed", source: "measured" });
    expect(body.data.rows[0]).toMatchObject({ id: KEYWORD_ID });
    expect(body.data.rows[0]?.actionHref).toContain(`diagnosisId=${DIAGNOSIS_ID}`);
  });
});

describe("POST /api/radar/feedback", () => {
  it("records feedback only for keywords owned by the business radar subscription", async () => {
    radarRepo.findSubscriptionByBusinessId.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      businessId: BUSINESS_ID,
      status: "trialing",
    });
    radarRepo.latestKeywordsForSubscription.mockResolvedValue([
      {
        id: KEYWORD_ID,
        scanId: SCAN_ID,
        text: "성수동 비건빵집",
        verdict: "now",
        naverEvidence: null,
      },
    ]);

    const response = await feedback(
      jsonRequest("http://localhost/api/radar/feedback", {
        diagnosisId: DIAGNOSIS_ID,
        keywordId: KEYWORD_ID,
        feedbackType: "used",
      }),
    );
    const body = (await response.json()) as { success: boolean; data: { feedbackType: string } };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { feedbackType: "used" } });
    expect(radarRepo.recordFeedback).toHaveBeenCalledWith({
      subscriptionId: SUBSCRIPTION_ID,
      businessId: BUSINESS_ID,
      scanId: SCAN_ID,
      keywordId: KEYWORD_ID,
      feedbackType: "used",
    });
  });

  it("rejects feedback for a keyword missing from the latest subscription keywords", async () => {
    radarRepo.findSubscriptionByBusinessId.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      businessId: BUSINESS_ID,
      status: "active",
    });
    radarRepo.latestKeywordsForSubscription.mockResolvedValue([]);

    const response = await feedback(
      jsonRequest("http://localhost/api/radar/feedback", {
        diagnosisId: DIAGNOSIS_ID,
        keywordId: KEYWORD_ID,
        feedbackType: "not_yet",
      }),
    );
    const body = (await response.json()) as { code?: string; success: boolean };

    expect(response.status).toBe(404);
    expect(body).toMatchObject({ code: "NOT_FOUND", success: false });
    expect(radarRepo.recordFeedback).not.toHaveBeenCalled();
  });
});
