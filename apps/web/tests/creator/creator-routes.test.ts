import { describe, expect, it } from "vitest";
import { POST as POST_MAGIC_LINK } from "../../app/api/auth/magic-link/route";
import { GET as GET_GOOGLE } from "../../app/api/auth/oauth/google/route";
import { GET as GET_BILLING } from "../../app/api/creator/billing/status/route";
import {
  DELETE as DELETE_CITATION,
  GET as GET_CITATIONS,
  POST as POST_CITATION_SCAN,
} from "../../app/api/creator/citations/route";
import { POST as POST_DIAGNOSES } from "../../app/api/creator/diagnoses/route";
import { POST as POST_LOOKUPS } from "../../app/api/creator/lookups/route";
import { GET as GET_RADAR } from "../../app/api/creator/radar/route";
import { GET as GET_REPORT } from "../../app/api/creator/reports/current/route";
import { POST as POST_TOPICS } from "../../app/api/creator/topics/route";

function request(path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
  });
}

describe("Creator API routes", () => {
  it("serves radar data for S2 and S3 with channel URL passthrough", async () => {
    const res = await GET_RADAR(
      request("/api/creator/radar?topic=제주%20여행&channelUrl=https%3A%2F%2Fexample.com"),
    );
    const body = (await res.json()) as {
      success: boolean;
      data: { keywords: unknown[]; topic: { channelUrl: string | null } };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.topic.channelUrl).toBe("https://example.com");
    expect(body.data.keywords.length).toBeGreaterThanOrEqual(15);
  });

  it("creates a topic and returns first scan data for onboarding", async () => {
    const res = await POST_TOPICS(
      request("/api/creator/topics", { topic: "홈카페", channelUrl: "https://example.com" }),
    );
    const body = (await res.json()) as {
      success: boolean;
      data: { radar: { keywords: unknown[]; topic: { channelUrl: string | null } } };
    };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.radar.topic.channelUrl).toBe("https://example.com");
    expect(body.data.radar.keywords.length).toBeGreaterThanOrEqual(15);
  });

  it("validates lookup and diagnosis boundaries", async () => {
    const badLookup = await POST_LOOKUPS(request("/api/creator/lookups", { keyword: "" }));
    const malformedLookup = await POST_LOOKUPS(
      new Request("http://localhost/api/creator/lookups", {
        method: "POST",
        body: "{",
        headers: { "content-type": "application/json" },
      }),
    );
    const goodDiagnosis = await POST_DIAGNOSES(
      request("/api/creator/diagnoses", { url: "https://example.com/post" }),
    );

    expect(badLookup.status).toBe(400);
    expect(malformedLookup.status).toBe(400);
    expect(goodDiagnosis.status).toBe(201);
  });

  it("exposes citations, report, management actions, and honest billing status", async () => {
    const citations = await GET_CITATIONS();
    const report = await GET_REPORT();
    const scan = await POST_CITATION_SCAN(
      new Request("http://localhost/api/creator/citations?targetId=target_jeju_rain", {
        method: "POST",
      }),
    );
    const deleted = await DELETE_CITATION(
      new Request("http://localhost/api/creator/citations?targetId=target_jeju_rain", {
        method: "DELETE",
      }),
    );
    const billing = await GET_BILLING();

    expect(citations.status).toBe(200);
    expect(report.status).toBe(200);
    expect(scan.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(billing.status).toBe(200);
    await expect(billing.json()).resolves.toMatchObject({
      success: true,
      data: { billingEnabled: false },
    });
  });

  it("exposes S0 auth entrypoints with explicit provider configuration state", async () => {
    const magic = await POST_MAGIC_LINK(
      request("/api/auth/magic-link", { email: "owner@example.com", redirectTo: "/creator/radar" }),
    );
    const google = await GET_GOOGLE(
      new Request("http://localhost/api/auth/oauth/google?returnTo=/creator/radar"),
    );

    expect([200, 501]).toContain(magic.status);
    expect([307, 501]).toContain(google.status);
  });
});
