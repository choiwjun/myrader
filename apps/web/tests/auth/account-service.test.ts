// @TASK P1-R1 - account 리소스 서비스 (RED→GREEN)
// @SPEC specs/domain/resources.yaml (account: id, email)
// @SPEC docs/planning/07-coding-convention.md (앱↔DB는 서비스 레이어 경유)
// @TEST apps/web/tests/auth/account-service.test.ts
//
// account 서비스는 @boina/db accounts 테이블을 서비스 레이어로 감싼다.
// DB 없이도 비밀번호 검증/생성 로직을 단위 검증할 수 있도록 순수 함수와
// 주입형(repository) 의존을 분리한다 (07 경계 — UI/route 는 서비스만 호출).

import { describe, expect, it } from "vitest";
import { type AccountRepository, authenticateAccount } from "../../lib/auth/account-service";
import { hashPassword, verifyPassword } from "../../lib/auth/password";

describe("비밀번호 해시 (P1-R1)", () => {
  it("scrypt 해시는 평문과 다르고 같은 평문 검증을 통과한다", async () => {
    const hash = await hashPassword("S3cret!pw");
    expect(hash).not.toContain("S3cret!pw");
    expect(await verifyPassword("S3cret!pw", hash)).toBe(true);
  });

  it("틀린 비밀번호는 검증에 실패한다", async () => {
    const hash = await hashPassword("S3cret!pw");
    expect(await verifyPassword("wrong-pw", hash)).toBe(false);
  });

  it("같은 평문도 매번 다른 해시를 만든다 (salt)", async () => {
    const a = await hashPassword("same-pw");
    const b = await hashPassword("same-pw");
    expect(a).not.toBe(b);
  });
});

describe("authenticateAccount — 이메일+비번 → 세션 귀속 account (P1-R1)", () => {
  it("올바른 자격증명이면 account(id,email)를 반환한다", async () => {
    const passwordHash = await hashPassword("correct-pw");
    const repo: AccountRepository = {
      findByEmail: async (email) =>
        email === "owner@boina.kr"
          ? { id: "44444444-4444-4444-8444-444444444444", email, passwordHash, plan: "free" }
          : null,
      findById: async () => null,
      findForSession: async () => null,
      create: async () => {
        throw new Error("not used");
      },
      setPlan: async () => false,
      setBlocked: async () => false,
      revokeSessions: async () => false,
      setDeleted: async () => false,
    };

    const account = await authenticateAccount(repo, "owner@boina.kr", "correct-pw");
    expect(account).not.toBeNull();
    expect(account?.id).toBe("44444444-4444-4444-8444-444444444444");
    expect(account?.email).toBe("owner@boina.kr");
  });

  it("비밀번호가 틀리면 null (계정 존재 노출 금지)", async () => {
    const passwordHash = await hashPassword("correct-pw");
    const repo: AccountRepository = {
      findByEmail: async (email) => ({
        id: "x",
        email,
        passwordHash,
        plan: "free",
      }),
      findById: async () => null,
      findForSession: async () => null,
      create: async () => {
        throw new Error("not used");
      },
      setPlan: async () => false,
      setBlocked: async () => false,
      revokeSessions: async () => false,
      setDeleted: async () => false,
    };
    expect(await authenticateAccount(repo, "owner@boina.kr", "wrong-pw")).toBeNull();
  });

  it("없는 이메일이면 null", async () => {
    const repo: AccountRepository = {
      findByEmail: async () => null,
      findById: async () => null,
      findForSession: async () => null,
      create: async () => {
        throw new Error("not used");
      },
      setPlan: async () => false,
      setBlocked: async () => false,
      revokeSessions: async () => false,
      setDeleted: async () => false,
    };
    expect(await authenticateAccount(repo, "ghost@boina.kr", "any")).toBeNull();
  });

  it("차단 계정은 비밀번호가 맞아도 null (차단 우회 방지)", async () => {
    // 저장소(repository)가 차단을 강제한다 — 차단 계정의 findByEmail 은 null 을 돌려준다.
    // authenticateAccount 는 그 계약을 따라야 하며, 올바른 비밀번호여도 인증을 내주면 안 된다.
    const repo: AccountRepository = {
      findByEmail: async () => null, // 차단 계정 → repo 가 null (deletedAt/blockedAt 가드)
      findById: async () => null,
      findForSession: async () => null,
      create: async () => {
        throw new Error("not used");
      },
      setPlan: async () => false,
      setBlocked: async () => false,
      revokeSessions: async () => false,
      setDeleted: async () => false,
    };
    expect(await authenticateAccount(repo, "blocked@boina.kr", "correct-pw")).toBeNull();
  });
});
