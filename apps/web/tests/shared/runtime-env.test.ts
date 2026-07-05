import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MockNotAllowedInProductionError,
  assertMockAllowedOrThrow,
  isMockFallbackAllowed,
  isProduction,
} from "../../lib/shared/runtime-env.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runtime-env (운영 fail-fast 정책)", () => {
  it("NODE_ENV=production → isProduction true / mock 금지", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isProduction()).toBe(true);
    expect(isMockFallbackAllowed()).toBe(false);
  });

  it("NODE_ENV=development → mock 허용", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isProduction()).toBe(false);
    expect(isMockFallbackAllowed()).toBe(true);
  });

  it("NODE_ENV=test → mock 허용(CI/로컬 골격 완주)", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(isMockFallbackAllowed()).toBe(true);
  });

  it("production 에서 assertMockAllowedOrThrow 는 MockNotAllowedInProductionError 를 던진다", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertMockAllowedOrThrow("place-search(Naver)")).toThrow(
      MockNotAllowedInProductionError,
    );
    try {
      assertMockAllowedOrThrow("place-search(Naver)");
    } catch (e) {
      expect((e as MockNotAllowedInProductionError).feature).toBe("place-search(Naver)");
      expect((e as Error).message).not.toMatch(/secret|key|password/i);
    }
  });

  it("dev/test 에서 assertMockAllowedOrThrow 는 통과(throw 안 함)", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertMockAllowedOrThrow("place-search(Naver)")).not.toThrow();
  });
});
