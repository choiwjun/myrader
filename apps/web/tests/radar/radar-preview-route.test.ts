import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_DIAGNOSIS_ID = "00000000-0000-4000-8000-000000000001";
const VALID_BUSINESS_ID = "00000000-0000-4000-8000-0000000000b1";
const VALID_KEYWORD_ID = "00000000-0000-4000-8000-00000000c001";
const VALID_SCAN_ID = "00000000-0000-4000-8000-000000005001";

const state: {
  diagnosis: { readonly businessId: string } | null;
  business: {
    readonly id: string;
    readonly name: string;
    readonly region: string | null;
    readonly category: string | null;
  } | null;
  subscription: {
    readonly id: string;
    readonly businessId?: string;
    readonly status: string;
  } | null;
  latestScan: { readonly status: string } | null;
  keywords: Array<{
    readonly id: string;
    readonly scanId?: string | null;
    readonly text: string;
    readonly verdict: string;
    readonly naverEvidence: {
      readonly volume: number | null;
      readonly docs: number | null;
      readonly saturation: number | null;
      readonly trend7d: number | null;
      readonly checkedAt: string;
    } | null;
  }>;
  upsertedSubscription: unknown | null;
  feedback: unknown | null;
} = {
  diagnosis: null,
  business: null,
  subscription: null,
  latestScan: null,
  keywords: [],
  upsertedSubscription: null,
  feedback: null,
};

vi.mock("@/lib/diagnosis/diagnosis-repository", () => ({
  getDefaultDiagnosisRepository: () => ({
    findById: vi.fn(async () => state.diagnosis),
  }),
}));

vi.mock("@/lib/business", () => ({
  getDefaultBusinessRepository: () => ({
    findById: vi.fn(async () => state.business),
  }),
}));

vi.mock("@/lib/radar/radar-repository", () => ({
  getDefaultRadarRepository: () => ({
    findSubscriptionByBusinessId: vi.fn(async () => state.subscription),
    latestKeywordsForSubscription: vi.fn(async () => state.keywords),
    latestScanForSubscription: vi.fn(async () => state.latestScan),
    upsertSubscription: vi.fn(async (input) => {
      state.upsertedSubscription = input;
      state.subscription = { id: "sub-1", businessId: input.businessId, status: input.status };
      return { id: "sub-1", ...input };
    }),
    recordFeedback: vi.fn(async (input) => {
      state.feedback = input;
      return { id: "feedback-1", ...input };
    }),
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const { GET } = await import("../../app/api/radar/preview/route.js");
const { POST: POST_SUBSCRIPTION } = await import("../../app/api/radar/subscription/route.js");
const { POST: POST_FEEDBACK } = await import("../../app/api/radar/feedback/route.js");

beforeEach(() => {
  state.diagnosis = null;
  state.business = null;
  state.subscription = null;
  state.latestScan = null;
  state.keywords = [];
  state.upsertedSubscription = null;
  state.feedback = null;
});

function req(query = ""): Request {
  return new Request(`http://localhost/api/radar/preview${query}`);
}

describe("GET /api/radar/preview", () => {
  it("returns an honest example preview when diagnosisId is missing", async () => {
    const res = await GET(req());
    const body = (await res.json()) as {
      success: boolean;
      data: { source: string; fallbackLabel: string | null; rows: Array<{ locked: boolean }> };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.source).toBe("example");
    expect(body.data.fallbackLabel).toBe("예시 미리보기");
    expect(body.data.rows).toHaveLength(3);
    expect(body.data.rows.filter((row) => row.locked)).toHaveLength(2);
  });

  it("rejects malformed diagnosisId values", async () => {
    const res = await GET(req("?diagnosisId=bad"));
    const body = (await res.json()) as { success: boolean; code?: string };

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: "VALIDATION_ERROR" });
  });

  it("returns honest example preview rows when business expansion has only fallback candidates", async () => {
    state.diagnosis = { businessId: VALID_BUSINESS_ID };
    state.business = {
      id: VALID_BUSINESS_ID,
      name: "비건빵집",
      region: "성수동",
      category: "베이커리",
    };

    const res = await GET(req(`?diagnosisId=${VALID_DIAGNOSIS_ID}`));
    const body = (await res.json()) as {
      success: boolean;
      data: { source: string; fallbackLabel: string | null; rows: Array<{ locked: boolean }> };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.source).toBe("example");
    expect(body.data.fallbackLabel).toBe("예시 미리보기");
    expect(body.data.rows).toHaveLength(3);
    expect(body.data.rows.filter((row) => !row.locked)).toHaveLength(1);
    expect(body.data.rows.filter((row) => row.locked)).toHaveLength(2);
  });

  it("returns a waiting preview while the first subscribed scan is still preparing", async () => {
    state.diagnosis = { businessId: VALID_BUSINESS_ID };
    state.business = {
      id: VALID_BUSINESS_ID,
      name: "비건빵집",
      region: "성수동",
      category: "베이커리",
    };
    state.subscription = { id: "sub-1", status: "active" };

    const res = await GET(req(`?diagnosisId=${VALID_DIAGNOSIS_ID}`));
    const body = (await res.json()) as {
      success: boolean;
      data: { mode: string; ctaLabel: string; rows: unknown[] };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.mode).toBe("waiting");
    expect(body.data.ctaLabel).toBe("첫 결과 준비 중");
    expect(body.data.rows).toHaveLength(0);
  });

  it("returns subscribed weekly keywords for an active radar subscription", async () => {
    state.diagnosis = { businessId: VALID_BUSINESS_ID };
    state.business = {
      id: VALID_BUSINESS_ID,
      name: "비건빵집",
      region: "성수동",
      category: "베이커리",
    };
    state.subscription = { id: "sub-1", status: "active" };
    state.latestScan = { status: "done" };
    state.keywords = [
      {
        id: VALID_KEYWORD_ID,
        scanId: VALID_SCAN_ID,
        text: "성수동 비오는날 빵집",
        verdict: "now",
        naverEvidence: {
          volume: 120,
          docs: 4,
          saturation: 0.03,
          trend7d: 18,
          checkedAt: "2026-07-05T00:00:00.000Z",
        },
      },
    ];

    const res = await GET(req(`?diagnosisId=${VALID_DIAGNOSIS_ID}`));
    const body = (await res.json()) as {
      success: boolean;
      data: {
        mode: string;
        rows: Array<{ actionHref?: string; locked: boolean; scanId?: string | null }>;
      };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.mode).toBe("subscribed");
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0]?.locked).toBe(false);
    expect(body.data.rows[0]?.actionHref).toContain("/write");
    expect(body.data.rows[0]?.scanId).toBe(VALID_SCAN_ID);
  });

  it("creates a trialing radar subscription without billing or notification surfaces", async () => {
    state.diagnosis = { businessId: VALID_BUSINESS_ID };
    state.business = {
      id: VALID_BUSINESS_ID,
      name: "비건빵집",
      region: "성수동",
      category: "베이커리",
    };

    const res = await POST_SUBSCRIPTION(
      new Request("http://localhost/api/radar/subscription", {
        method: "POST",
        body: JSON.stringify({ diagnosisId: VALID_DIAGNOSIS_ID }),
      }),
    );
    const body = (await res.json()) as {
      success: boolean;
      data: { mode: string; ctaLabel: string };
    };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { mode: "waiting", ctaLabel: "첫 결과 준비 중" },
    });
    expect(state.upsertedSubscription).toMatchObject({
      businessId: VALID_BUSINESS_ID,
      accountId: null,
      status: "trialing",
      canceledAt: null,
    });
    expect(JSON.stringify(state.upsertedSubscription)).not.toMatch(
      /billing|payment|toss|kakao|sms/i,
    );
  });

  it("rejects malformed radar subscription requests", async () => {
    const res = await POST_SUBSCRIPTION(
      new Request("http://localhost/api/radar/subscription", {
        method: "POST",
        body: JSON.stringify({ diagnosisId: "bad" }),
      }),
    );
    const body = (await res.json()) as { success: boolean; code?: string };

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: "VALIDATION_ERROR" });
  });

  it("rejects feedback when no active radar subscription owns the keyword", async () => {
    state.diagnosis = { businessId: VALID_BUSINESS_ID };
    state.business = {
      id: VALID_BUSINESS_ID,
      name: "비건빵집",
      region: "성수동",
      category: "베이커리",
    };

    const res = await POST_FEEDBACK(
      new Request("http://localhost/api/radar/feedback", {
        method: "POST",
        body: JSON.stringify({
          diagnosisId: VALID_DIAGNOSIS_ID,
          keywordId: VALID_KEYWORD_ID,
          feedbackType: "not_yet",
        }),
      }),
    );
    const body = (await res.json()) as { success: boolean; code?: string };

    expect(res.status).toBe(404);
    expect(body).toMatchObject({ success: false, code: "NOT_FOUND" });
    expect(state.feedback).toBeNull();
  });

  it("rejects feedback for keywords outside the latest subscribed radar result", async () => {
    state.diagnosis = { businessId: VALID_BUSINESS_ID };
    state.business = {
      id: VALID_BUSINESS_ID,
      name: "비건빵집",
      region: "성수동",
      category: "베이커리",
    };
    state.subscription = { id: "sub-1", businessId: VALID_BUSINESS_ID, status: "active" };
    state.keywords = [];

    const res = await POST_FEEDBACK(
      new Request("http://localhost/api/radar/feedback", {
        method: "POST",
        body: JSON.stringify({
          diagnosisId: VALID_DIAGNOSIS_ID,
          keywordId: VALID_KEYWORD_ID,
          feedbackType: "used",
        }),
      }),
    );
    const body = (await res.json()) as { success: boolean; code?: string };

    expect(res.status).toBe(404);
    expect(body).toMatchObject({ success: false, code: "NOT_FOUND" });
    expect(state.feedback).toBeNull();
  });

  it("records subscribed keyword feedback through the radar repository", async () => {
    state.diagnosis = { businessId: VALID_BUSINESS_ID };
    state.business = {
      id: VALID_BUSINESS_ID,
      name: "비건빵집",
      region: "성수동",
      category: "베이커리",
    };
    state.subscription = { id: "sub-1", businessId: VALID_BUSINESS_ID, status: "active" };
    state.keywords = [
      {
        id: VALID_KEYWORD_ID,
        scanId: VALID_SCAN_ID,
        text: "성수동 비오는날 빵집",
        verdict: "now",
        naverEvidence: null,
      },
    ];

    const res = await POST_FEEDBACK(
      new Request("http://localhost/api/radar/feedback", {
        method: "POST",
        body: JSON.stringify({
          diagnosisId: VALID_DIAGNOSIS_ID,
          keywordId: VALID_KEYWORD_ID,
          feedbackType: "used",
        }),
      }),
    );
    const body = (await res.json()) as { success: boolean; data: { feedbackType: string } };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { feedbackType: "used" } });
    expect(state.feedback).toMatchObject({
      subscriptionId: "sub-1",
      businessId: VALID_BUSINESS_ID,
      scanId: VALID_SCAN_ID,
      keywordId: VALID_KEYWORD_ID,
      feedbackType: "used",
    });
  });
});
