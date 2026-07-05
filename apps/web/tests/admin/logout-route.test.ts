import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/headers cookies() 모킹 — get(인증 검증용) + set(쿠키 만료용) 둘 다 필요.
const setSpy = vi.fn();
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (_n: string) => (cookieValue ? { value: cookieValue } : undefined),
    set: setSpy,
  }),
}));

import { POST } from "../../app/api/admin/logout/route";
import { signAdminToken } from "../../lib/admin/auth";

describe("POST /api/admin/logout", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    setSpy.mockReset();
    cookieValue = undefined;
    process.env.SESSION_SECRET = "test-session-secret-32bytes-minimum-len";
    process.env.ADMIN_PASSWORD = "s3cret-admin-pw";
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("유효한 admin 쿠키면 200 + boina_admin 쿠키를 maxAge:0 으로 만료", async () => {
    cookieValue = signAdminToken();
    const res = await POST();
    expect(res.status).toBe(200);
    expect(setSpy).toHaveBeenCalledWith("boina_admin", "", expect.objectContaining({ maxAge: 0 }));
  });

  it("유효한 admin 쿠키가 없으면 401, 쿠키 미변경(CSRF DoS 가드)", async () => {
    cookieValue = undefined;
    const res = await POST();
    expect(res.status).toBe(401);
    expect(setSpy).not.toHaveBeenCalled();
  });
});
