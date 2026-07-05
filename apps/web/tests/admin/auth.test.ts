import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminCookieOptions,
  isAdminConfigured,
  signAdminToken,
  verifyAdminPassword,
  verifyAdminToken,
} from "../../lib/admin/auth";

const SECRET = "test-session-secret-32bytes-minimum-len";

describe("admin 인증 (auth.ts)", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
    process.env.ADMIN_PASSWORD = "s3cret-admin-pw";
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("올바른 비밀번호는 통과한다", () => {
    expect(verifyAdminPassword("s3cret-admin-pw")).toBe(true);
  });

  it("틀린 비밀번호는 거부된다", () => {
    expect(verifyAdminPassword("wrong")).toBe(false);
  });

  it("ADMIN_PASSWORD 미설정이면 어떤 입력도 거부(설정 안됨)", () => {
    process.env.ADMIN_PASSWORD = "   ";
    expect(isAdminConfigured()).toBe(false);
    expect(verifyAdminPassword("anything")).toBe(false);
  });

  it("발급한 토큰은 검증을 통과한다", () => {
    expect(verifyAdminToken(signAdminToken())).toBe(true);
  });

  it("변조된 토큰은 거부된다", () => {
    expect(verifyAdminToken(`${signAdminToken()}x`)).toBe(false);
    expect(verifyAdminToken(undefined)).toBe(false);
    expect(verifyAdminToken("garbage")).toBe(false);
  });

  it("만료된 토큰은 거부된다", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const token = signAdminToken();
      // ADMIN_MAX_AGE_SEC(12h) + 1초 경과
      vi.setSystemTime(new Date("2026-01-01T12:00:01Z"));
      expect(verifyAdminToken(token)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("쿠키 옵션은 httpOnly + lax", () => {
    const opt = adminCookieOptions();
    expect(opt.httpOnly).toBe(true);
    expect(opt.sameSite).toBe("lax");
  });
});
