import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}));

import type { AccountRepository } from "../../lib/auth/account-service";
import { getCurrentUser } from "../../lib/auth/index";
import { signSessionToken, verifySessionToken } from "../../lib/auth/session";

const SECRET = "test-session-secret-32bytes-minimum-len";
const ACC = { id: "11111111-1111-4111-8111-111111111111", email: "a@b.com", plan: "free" as const };

function repoWith(
  result: Awaited<ReturnType<AccountRepository["findForSession"]>>,
): AccountRepository {
  return {
    findByEmail: async () => null,
    findById: async () => null,
    create: async () => ACC,
    findForSession: async () => result,
  } as unknown as AccountRepository;
}

describe("getCurrentUser 강제(차단/삭제/강제로그아웃)", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
    cookieValue = signSessionToken({ accountId: ACC.id });
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("정상 계정은 통과", async () => {
    const user = await getCurrentUser(repoWith({ account: ACC, sessionsRevokedAtMs: null }));
    expect(user?.id).toBe(ACC.id);
  });

  it("삭제/차단 계정은 null (repo가 null 반환)", async () => {
    const user = await getCurrentUser(repoWith(null));
    expect(user).toBeNull();
  });

  it("강제 로그아웃: 토큰 iat 가 sessionsRevokedAtMs 이전이면 null", async () => {
    const future = Date.now() + 10_000;
    const user = await getCurrentUser(repoWith({ account: ACC, sessionsRevokedAtMs: future }));
    expect(user).toBeNull();
  });

  it("강제 로그아웃 이후 재로그인(revoked 가 과거): 통과", async () => {
    const past = Date.now() - 10_000;
    const user = await getCurrentUser(repoWith({ account: ACC, sessionsRevokedAtMs: past }));
    expect(user?.id).toBe(ACC.id);
  });

  it("강제 로그아웃: iat === sessionsRevokedAtMs 경계는 통과", async () => {
    const token = signSessionToken({ accountId: ACC.id });
    cookieValue = token;
    const payload = verifySessionToken(token);
    const user = await getCurrentUser(
      repoWith({ account: ACC, sessionsRevokedAtMs: payload?.iat ?? 0 }),
    );
    expect(user?.id).toBe(ACC.id);
  });
});
