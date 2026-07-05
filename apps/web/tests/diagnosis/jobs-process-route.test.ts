// @TASK 수정R2-A-1 - /api/jobs/process 시크릿 가드 테스트 (무단 trigger 차단)
// @SPEC apps/web/app/api/jobs/process/route.ts
// @TEST apps/web/tests/diagnosis/jobs-process-route.test.ts
//
// 403 경로(시크릿 가드)는 큐/DB 를 건드리지 않고 즉시 반환하므로 DB 불필요. env 는 vi.stubEnv 격리.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../../app/api/jobs/process/route.js";

beforeEach(() => {
  vi.stubEnv("JOBS_PROCESS_SECRET", "");
  vi.stubEnv("CRON_SECRET", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/jobs/process", { method: "POST", headers });
}

describe("/api/jobs/process 시크릿 가드 (수정R2-A-1)", () => {
  it("production + 시크릿 미설정 → 403(개방 금지, 무단 drain 차단)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(req());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("FORBIDDEN");
  });

  it("production + JOBS_PROCESS_SECRET 불일치 → 403", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JOBS_PROCESS_SECRET", "right-secret");
    const res = await POST(req({ "x-jobs-secret": "wrong" }));
    expect(res.status).toBe(403);
  });

  it("production + CRON_SECRET Bearer 불일치 → 403", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "cron-right");
    const res = await GET(
      new Request("http://localhost/api/jobs/process", {
        headers: { authorization: "Bearer cron-wrong" },
      }),
    );
    expect(res.status).toBe(403);
  });

  // 인가 통과(200) 경로는 실제 drain → DB 필요. DATABASE_URL 있을 때만 검증.
  const DATABASE_URL = process.env.DATABASE_URL;
  const itDb = DATABASE_URL ? it : it.skip;

  itDb("production + JOBS_PROCESS_SECRET 일치 → 200(인가 통과, drain 수행)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JOBS_PROCESS_SECRET", "right-secret");
    const res = await POST(req({ "x-jobs-secret": "right-secret" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data?: { processed: number } };
    expect(body.success).toBe(true);
    expect(typeof body.data?.processed).toBe("number");
  });

  itDb("dev + 시크릿 미설정 → 200(로컬 편의, 개방)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await POST(req());
    expect(res.status).toBe(200);
  });
});
