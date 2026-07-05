import { beforeEach, describe, expect, it, vi } from "vitest";

const processRadarScanQueue = vi.fn(async () => ({
  processed: 2,
  completed: 1,
  partial: 1,
  skipped: 0,
  failed: 0,
}));

vi.mock("@/lib/radar", () => ({
  processRadarScanQueue,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const { GET, POST } = await import("../../app/api/radar/scans/process/route.js");

beforeEach(() => {
  processRadarScanQueue.mockClear();
  vi.stubEnv("RADAR_PROCESS_SECRET", "");
  vi.stubEnv("CRON_SECRET", "");
});

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/radar/scans/process", { method: "POST", headers });
}

describe("/api/radar/scans/process", () => {
  it("blocks production requests when scan secrets are not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(req());
    const body = (await res.json()) as { code?: string };

    expect(res.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(processRadarScanQueue).not.toHaveBeenCalled();
  });

  it("blocks production requests with a mismatched radar secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RADAR_PROCESS_SECRET", "right-secret");

    const res = await POST(req({ "x-radar-secret": "wrong-secret" }));

    expect(res.status).toBe(403);
    expect(processRadarScanQueue).not.toHaveBeenCalled();
  });

  it("runs radar scans with a matching radar secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RADAR_PROCESS_SECRET", "right-secret");

    const res = await POST(req({ "x-radar-secret": "right-secret" }));
    const body = (await res.json()) as { success: boolean; data?: { processed: number } };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { processed: 2 } });
    expect(processRadarScanQueue).toHaveBeenCalledTimes(1);
  });

  it("accepts cron bearer auth", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "cron-secret");

    const res = await GET(
      new Request("http://localhost/api/radar/scans/process", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(res.status).toBe(200);
    expect(processRadarScanQueue).toHaveBeenCalledTimes(1);
  });
});
