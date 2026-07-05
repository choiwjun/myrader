import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let authed = true;
vi.mock("../../lib/admin/require-admin", () => ({
  isAdminAuthenticated: async () => authed,
}));
const setPlan = vi.fn(async () => true);
const setBlocked = vi.fn(async () => true);
const revokeSessions = vi.fn(async () => true);
const setDeleted = vi.fn(async () => true);
vi.mock("../../lib/auth/account-repository", () => ({
  getDefaultAccountRepository: () => ({ setPlan, setBlocked, revokeSessions, setDeleted }),
}));

import { PATCH } from "../../app/api/admin/members/[id]/route";

const ID = "11111111-1111-4111-8111-111111111111";
function patch(body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/admin/members/${ID}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: ID }) },
  );
}

describe("PATCH /api/admin/members/[id]", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    authed = true;
    setPlan.mockClear();
    setBlocked.mockClear();
    revokeSessions.mockClear();
    setDeleted.mockClear();
    process.env.SESSION_SECRET = "test-session-secret-32bytes-minimum-len";
    process.env.ADMIN_PASSWORD = "pw-123456";
    process.env.DATABASE_URL = "postgresql://x";
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("미인증이면 401", async () => {
    authed = false;
    const res = await patch({ action: "block" });
    expect(res.status).toBe(401);
  });

  it("setPlan 액션이 repo.setPlan 호출", async () => {
    const res = await patch({ action: "setPlan", plan: "basic" });
    expect(res.status).toBe(200);
    expect(setPlan).toHaveBeenCalledWith(ID, "basic");
  });

  it("block 액션이 repo.setBlocked(true) 호출", async () => {
    await patch({ action: "block" });
    expect(setBlocked).toHaveBeenCalledWith(ID, true);
  });

  it("잘못된 action 은 400", async () => {
    const res = await patch({ action: "nope" });
    expect(res.status).toBe(400);
  });

  it("대상 없음(repo false)이면 404", async () => {
    setBlocked.mockResolvedValueOnce(false);
    const res = await patch({ action: "block" });
    expect(res.status).toBe(404);
  });

  it("잘못된 UUID id(not-a-uuid)이면 404", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/admin/members/not-a-uuid", {
        method: "PATCH",
        body: JSON.stringify({ action: "block" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");
  });
});
