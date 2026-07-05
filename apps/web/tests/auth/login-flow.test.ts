// @TASK P1-R1 - 로그인 플로우 통합 (login-service → 세션 토큰 → 검증)
// @SPEC .claude/constitutions/nextjs/auth.md (단일 인증·세션)
// @TEST apps/web/tests/auth/login-flow.test.ts
//
// 외부 IdP/DB 없이도 골격이 동작함을 검증한다:
//  1) 자격증명 로그인 → 세션 토큰 발급 → verifySessionToken 으로 accountId 복원
//  2) 틀린 비번 → 로그인 실패(null)
//  3) dev-login(개발 모드) → 신규 account 생성 + 세션 발급

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  AccountRecord,
  AccountRepository,
  PublicAccount,
} from "../../lib/auth/account-service";
import { devLogin, loginWithCredentials } from "../../lib/auth/login-service";
import { hashPassword } from "../../lib/auth/password";
import { verifySessionToken } from "../../lib/auth/session";

beforeAll(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret-32bytes-minimum-len");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("SESSION_SECRET", "test-session-secret-32bytes-minimum-len");
});

/** 인메모리 account 저장소(테스트용). */
function makeRepo(seed: AccountRecord[] = []): AccountRepository {
  const store = new Map<string, AccountRecord>(seed.map((a) => [a.email, a]));
  let seq = 0;
  return {
    findByEmail: async (email) => store.get(email) ?? null,
    findById: async (id) => {
      for (const rec of store.values()) {
        if (rec.id === id) return { id: rec.id, email: rec.email, plan: rec.plan };
      }
      return null;
    },
    create: async ({ email, password }) => {
      seq += 1;
      const rec: AccountRecord = {
        id: `00000000-0000-4000-8000-00000000000${seq}`,
        email,
        plan: "free",
        passwordHash: await hashPassword(password),
      };
      store.set(email, rec);
      return { id: rec.id, email: rec.email, plan: rec.plan } satisfies PublicAccount;
    },
    findForSession: async (id) => {
      for (const rec of store.values()) {
        if (rec.id === id) {
          return {
            account: { id: rec.id, email: rec.email, plan: rec.plan },
            sessionsRevokedAtMs: null,
          };
        }
      }
      return null;
    },
    setPlan: async () => false,
    setBlocked: async () => false,
    revokeSessions: async () => false,
    setDeleted: async () => false,
  };
}

describe("로그인 플로우 (P1-R1)", () => {
  it("자격증명 로그인 성공 → 세션 토큰이 accountId 를 담는다", async () => {
    const passwordHash = await hashPassword("owner-pw-123");
    const repo = makeRepo([
      {
        id: "55555555-5555-4555-8555-555555555555",
        email: "owner@boina.kr",
        plan: "free",
        passwordHash,
      },
    ]);

    const result = await loginWithCredentials(repo, "owner@boina.kr", "owner-pw-123");
    expect(result).not.toBeNull();
    if (!result) throw new Error("login should succeed");
    expect(result.account.email).toBe("owner@boina.kr");

    const payload = verifySessionToken(result.token);
    expect(payload?.accountId).toBe("55555555-5555-4555-8555-555555555555");
  });

  it("틀린 비밀번호 → 로그인 실패(null)", async () => {
    const passwordHash = await hashPassword("owner-pw-123");
    const repo = makeRepo([{ id: "x", email: "owner@boina.kr", plan: "free", passwordHash }]);
    expect(await loginWithCredentials(repo, "owner@boina.kr", "wrong")).toBeNull();
  });

  it("dev-login 비활성(프로덕션)에서는 null", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_LOGIN_ENABLED", "true");
    const repo = makeRepo();
    expect(await devLogin(repo, "new@boina.kr")).toBeNull();
  });

  it("dev-login 활성(개발) → 신규 account 생성 + 세션 발급", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN_ENABLED", "true");
    const repo = makeRepo();

    const result = await devLogin(repo, "new@boina.kr");
    expect(result).not.toBeNull();
    if (!result) throw new Error("dev-login should succeed");
    expect(result.account.email).toBe("new@boina.kr");

    const payload = verifySessionToken(result.token);
    expect(payload?.accountId).toBe(result.account.id);
  });
});
