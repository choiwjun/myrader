import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/headers cookies() 모킹 — set 호출만 검증.
const setSpy = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: setSpy }),
}));

import { POST } from "../../app/api/admin/login/route";

const SECRET = "test-session-secret-32bytes-minimum-len";

function req(body: unknown, ip = "1.1.1.1"): Request {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    body: JSON.stringify(body),
    // rate limit key = IP. 테스트마다 고유 IP 를 써서 모듈 전역 limiter 상태를 격리한다.
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });
}

describe("POST /api/admin/login", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    setSpy.mockReset();
    process.env.SESSION_SECRET = SECRET;
    process.env.ADMIN_PASSWORD = "s3cret-admin-pw";
    (process.env as Record<string, string>).NODE_ENV = "test";
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("올바른 비번이면 200 + 쿠키 발급", async () => {
    const res = await POST(req({ password: "s3cret-admin-pw" }, "10.0.0.1"));
    expect(res.status).toBe(200);
    expect(setSpy).toHaveBeenCalledWith(
      "boina_admin",
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("틀린 비번이면 401, 쿠키 없음", async () => {
    const res = await POST(req({ password: "nope" }, "10.0.0.2"));
    expect(res.status).toBe(401);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("ADMIN_PASSWORD 미설정이면 403(ADMIN_DISABLED)", async () => {
    process.env.ADMIN_PASSWORD = "";
    const res = await POST(req({ password: "anything" }, "10.0.0.3"));
    expect(res.status).toBe(403);
  });

  it("body 형식 오류면 400", async () => {
    const res = await POST(req({ nope: 1 }, "10.0.0.4"));
    expect(res.status).toBe(400);
  });

  it("brute-force: 한도(분당 10회) 초과 시 429", async () => {
    // 동일 IP 로 반복 시도(틀린 비번) — 한도(10)까지는 401, 초과하면 429.
    const ip = "10.9.9.9";
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await POST(req({ password: "wrong" }, ip));
    }
    expect(last?.status).toBe(429);
    const json = (await last?.json()) as { code?: string; success?: boolean };
    expect(json.code).toBe("RATE_LIMITED");
    expect(json.success).toBe(false);
  });
});
