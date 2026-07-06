import { beforeEach, describe, expect, it, vi } from "vitest";

const payloads = vi.hoisted(() => ({
  businessFindById: vi.fn(),
  diagnosisCreate: vi.fn(),
  enqueue: vi.fn(),
  kickBackgroundDrain: vi.fn(),
}));

vi.mock("@/lib/business", () => ({
  getDefaultBusinessRepository: () => ({
    findById: payloads.businessFindById,
  }),
}));

vi.mock("@/lib/diagnosis/diagnosis-dedup", () => ({
  findActiveDiagnosisForBusiness: vi.fn(async () => null),
}));

vi.mock("@/lib/diagnosis/diagnosis-repository", () => ({
  getDefaultDiagnosisRepository: () => ({
    create: payloads.diagnosisCreate,
  }),
}));

vi.mock("@/lib/diagnosis/diagnosis-service", () => ({
  getDiagnosisView: vi.fn(async () => null),
}));

vi.mock("@/lib/jobs", () => ({
  DIAGNOSIS_JOB_TYPE: "diagnosis",
  getJobQueue: () => ({
    enqueue: payloads.enqueue,
    getStatus: vi.fn(async () => null),
  }),
  kickBackgroundDrain: payloads.kickBackgroundDrain,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const { POST } = await import("../../app/api/diagnosis/route.js");

beforeEach(() => {
  payloads.businessFindById.mockReset();
  payloads.diagnosisCreate.mockReset();
  payloads.enqueue.mockReset();
  payloads.kickBackgroundDrain.mockReset();
  payloads.diagnosisCreate.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    status: "queued",
  });
  payloads.enqueue.mockImplementation(
    async ({ diagnosisId, payload }: { diagnosisId: string; payload: unknown }) => ({
      id: diagnosisId,
      payload,
    }),
  );
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/diagnosis", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.55",
      },
      body: JSON.stringify(body),
    }),
  );
}

const PROFILE = {
  businessName: "테스트가게",
  industry: "한식",
  region: "서울 마포구",
  mainServices: ["점심"],
  targetKeywords: ["맛집"],
};

describe("POST /api/diagnosis payload wiring", () => {
  it("저장된 homepageUrl 이 있으면 website target 으로 통일한다", async () => {
    payloads.businessFindById.mockResolvedValue({
      id: "11111111-1111-4111-8111-1111111111b1",
      homepageUrl: "https://saved.example.com",
      naverPlaceId: "7654321",
    });

    const res = await post({
      target: "https://place.naver.com/restaurant/7654321",
      businessId: "00000000-0000-4000-8000-0000000000b1",
      businessProfile: PROFILE,
      sourceType: "naver_place",
      requestLlmValidation: true,
    });

    expect(res.status).toBe(202);
    expect(payloads.enqueue).toHaveBeenCalledTimes(1);
    expect(payloads.enqueue.mock.calls[0]?.[0]).toMatchObject({
      payload: {
        diagnosisId: "11111111-1111-4111-8111-111111111111",
        businessId: "11111111-1111-4111-8111-1111111111b1",
        target: "https://saved.example.com",
        sourceType: "website",
        businessProfile: PROFILE,
        modules: ["seo", "aeo", "geo"],
        requestLlmValidation: true,
      },
    });
  });

  it("homepageUrl 이 없으면 naver_place 를 유지한다", async () => {
    payloads.businessFindById.mockResolvedValue({
      id: "22222222-2222-4222-8222-2222222222b2",
      homepageUrl: null,
      naverPlaceId: "7654321",
    });

    const res = await post({
      target: "https://place.naver.com/restaurant/7654321",
      businessId: "00000000-0000-4000-8000-0000000000b2",
      businessProfile: PROFILE,
      sourceType: "naver_place",
    });

    expect(res.status).toBe(202);
    expect(payloads.enqueue.mock.calls[0]?.[0]).toMatchObject({
      payload: {
        diagnosisId: "11111111-1111-4111-8111-111111111111",
        businessId: "22222222-2222-4222-8222-2222222222b2",
        target: "https://place.naver.com/restaurant/7654321",
        sourceType: "naver_place",
        requestLlmValidation: false,
      },
    });
  });
});
