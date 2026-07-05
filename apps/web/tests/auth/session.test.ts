// @TASK P1-R1 - 쿠키 세션 헬퍼 (RED→GREEN)
// @SPEC .claude/constitutions/nextjs/auth.md (단일 인증 레이어)
// @TEST apps/web/tests/auth/session.test.ts
//
// 세션 토큰은 HMAC 서명된 쿠키 값으로, 변조 시 거부되어야 한다.
// (외부 의존성 없이 node:crypto 로 서명 — 시크릿은 .env, 하드코딩 금지.)

import { beforeAll, describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "../../lib/auth/session";

const TEST_SECRET = "test-session-secret-32bytes-minimum-len";

describe("쿠키 세션 토큰 (P1-R1)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SECRET;
  });

  it("발급한 토큰은 검증을 통과하고 accountId 를 복원한다", () => {
    const token = signSessionToken({ accountId: "11111111-1111-4111-8111-111111111111" });
    const payload = verifySessionToken(token);
    expect(payload?.accountId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("서명이 변조된 토큰은 거부된다 (null 반환)", () => {
    const token = signSessionToken({ accountId: "22222222-2222-4222-8222-222222222222" });
    const tampered = `${token}x`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("페이로드가 변조된 토큰은 거부된다", () => {
    const token = signSessionToken({ accountId: "33333333-3333-4333-8333-333333333333" });
    const [, sig] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ accountId: "victim", iat: Date.now() }),
    ).toString("base64url");
    const forged = `${forgedPayload}.${sig}`;
    expect(verifySessionToken(forged)).toBeNull();
  });

  it("형식이 잘못된 토큰은 null 을 반환한다 (예외 없음)", () => {
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("garbage")).toBeNull();
    expect(verifySessionToken("a.b.c.d")).toBeNull();
  });
});
