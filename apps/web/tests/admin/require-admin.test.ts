import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (_n: string) => (cookieValue ? { value: cookieValue } : undefined),
  }),
}));

import { signAdminToken } from "../../lib/admin/auth";
import { isAdminAuthenticated } from "../../lib/admin/require-admin";

const SECRET = "test-session-secret-32bytes-minimum-len";

describe("isAdminAuthenticated (서버 가드)", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
    process.env.ADMIN_PASSWORD = "pw-123456";
    cookieValue = undefined;
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("유효한 admin 쿠키면 true", async () => {
    cookieValue = signAdminToken();
    expect(await isAdminAuthenticated()).toBe(true);
  });

  it("쿠키 없으면 false", async () => {
    cookieValue = undefined;
    expect(await isAdminAuthenticated()).toBe(false);
  });

  it("ADMIN_PASSWORD 미설정이면 유효 쿠키여도 false(prod fail-fast 동형)", async () => {
    cookieValue = signAdminToken();
    process.env.ADMIN_PASSWORD = "";
    expect(await isAdminAuthenticated()).toBe(false);
  });
});
