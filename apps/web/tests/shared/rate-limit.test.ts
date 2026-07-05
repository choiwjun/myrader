// @TASK 수정라운드A-3 - rate limit 단위 테스트 (in-memory 토큰버킷)
// @SPEC apps/web/lib/shared/rate-limit.ts / api-rate-limit.ts
// @TEST apps/web/tests/shared/rate-limit.test.ts
//
// 고정 윈도 한도 초과 시 거부(429 신호), 윈도 경과 후 회복, key 분리(IP/세션) 검증.
// 시간은 vi.useFakeTimers 로 제어한다(실시간 sleep 금지 — 결정적).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceRateLimit } from "../../lib/shared/api-rate-limit.js";
import { InMemoryRateLimiter, rateLimitKeyFromRequest } from "../../lib/shared/rate-limit.js";

describe("InMemoryRateLimiter (고정 윈도)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("max 회까지 허용, 초과 시 거부(remaining/retryAfter 제공)", () => {
    const rl = new InMemoryRateLimiter({ windowMs: 60_000, max: 3 });
    expect(rl.check("k").allowed).toBe(true);
    expect(rl.check("k").allowed).toBe(true);
    const third = rl.check("k");
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    const fourth = rl.check("k");
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("윈도가 지나면 카운트가 리셋된다(회복)", () => {
    const rl = new InMemoryRateLimiter({ windowMs: 1_000, max: 1 });
    expect(rl.check("k").allowed).toBe(true);
    expect(rl.check("k").allowed).toBe(false);
    vi.advanceTimersByTime(1_001); // 윈도 경과
    expect(rl.check("k").allowed).toBe(true);
  });

  it("서로 다른 key 는 독립적으로 카운트된다(IP/세션 분리)", () => {
    const rl = new InMemoryRateLimiter({ windowMs: 60_000, max: 1 });
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("b").allowed).toBe(true); // b 는 별도 버킷
    expect(rl.check("a").allowed).toBe(false);
  });

  it("windowMs/max 가 0 이하면 생성자에서 거부", () => {
    expect(() => new InMemoryRateLimiter({ windowMs: 0, max: 1 })).toThrow();
    expect(() => new InMemoryRateLimiter({ windowMs: 1, max: 0 })).toThrow();
  });
});

describe("rateLimitKeyFromRequest (세션 우선 → IP)", () => {
  it("세션 토큰이 있으면 세션 key", () => {
    const req = new Request("https://x/api/business?name=a&region=b");
    expect(rateLimitKeyFromRequest(req, "tok123")).toBe("s:tok123");
  });

  it("세션 없으면 X-Forwarded-For 첫 IP 를 key 로", () => {
    const req = new Request("https://x/api/business", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(rateLimitKeyFromRequest(req, null)).toBe("ip:1.2.3.4");
  });

  it("세션/IP 둘 다 없으면 anon 버킷", () => {
    const req = new Request("https://x/api/business");
    expect(rateLimitKeyFromRequest(req, null)).toBe("ip:anon");
  });
});

describe("enforceRateLimit (route 헬퍼 — 429 NextResponse)", () => {
  it("한도 초과 시 429 + Retry-After 헤더를 반환, 통과 시 null", async () => {
    const rl = new InMemoryRateLimiter({ windowMs: 60_000, max: 1 });
    const req = new Request("https://x/api/diagnosis", {
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    expect(enforceRateLimit(req, rl)).toBeNull(); // 1회차 통과
    const limited = enforceRateLimit(req, rl); // 2회차 거부
    expect(limited).not.toBeNull();
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
    const json = (await limited?.json()) as { code?: string; success?: boolean };
    expect(json.code).toBe("RATE_LIMITED");
    expect(json.success).toBe(false);
  });
});
