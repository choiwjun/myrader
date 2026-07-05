import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_DIAGNOSIS_ID = "00000000-0000-4000-8000-000000000001";
const VALID_BUSINESS_ID = "00000000-0000-4000-8000-0000000000b1";

const state: {
  diagnosis: { readonly businessId: string } | null;
  business: {
    readonly name: string;
    readonly region: string | null;
    readonly category: string | null;
  } | null;
  subscription: { readonly id: string; readonly status: string } | null;
  latestScan: { readonly status: string } | null;
  keywords: Array<{
    readonly id: string;
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
} = {
  diagnosis: null,
  business: null,
  subscription: null,
  latestScan: null,
  keywords: [],
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
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const { GET } = await import("../../app/api/radar/preview/route.js");

beforeEach(() => {
  state.diagnosis = null;
  state.business = null;
  state.subscription = null;
  state.latestScan = null;
  state.keywords = [];
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

  it("returns one measured preview row and two locked teasers from business context", async () => {
    state.diagnosis = { businessId: VALID_BUSINESS_ID };
    state.business = { name: "비건빵집", region: "성수동", category: "베이커리" };

    const res = await GET(req(`?diagnosisId=${VALID_DIAGNOSIS_ID}`));
    const body = (await res.json()) as {
      success: boolean;
      data: { source: string; fallbackLabel: string | null; rows: Array<{ locked: boolean }> };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.source).toBe("measured");
    expect(body.data.fallbackLabel).toBeNull();
    expect(body.data.rows).toHaveLength(3);
    expect(body.data.rows.filter((row) => !row.locked)).toHaveLength(1);
    expect(body.data.rows.filter((row) => row.locked)).toHaveLength(2);
  });

  it("returns subscribed weekly keywords for an active radar subscription", async () => {
    state.diagnosis = { businessId: VALID_BUSINESS_ID };
    state.business = { name: "비건빵집", region: "성수동", category: "베이커리" };
    state.subscription = { id: "sub-1", status: "active" };
    state.latestScan = { status: "done" };
    state.keywords = [
      {
        id: "keyword-1",
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
      data: { mode: string; rows: Array<{ actionHref?: string; locked: boolean }> };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.mode).toBe("subscribed");
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0]?.locked).toBe(false);
    expect(body.data.rows[0]?.actionHref).toContain("/write");
  });
});
