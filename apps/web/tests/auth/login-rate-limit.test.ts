// @TASK 출시하드닝 - 일반 로그인 rate-limit (brute-force 완화)
// @SPEC apps/web/lib/shared/api-rate-limit.ts (authLoginLimiter)
// @TEST apps/web/tests/auth/login-rate-limit.test.ts
//
// /api/auth/login 은 admin 과 달리 rate-limit 이 없어 비번 brute-force 에 노출됐다.
// rate-limit 은 Zod 검증·DB 도달 *이전*에 계수되므로, 잘못된 body(400 경로)로도 검증 가능.
// (limiter 는 모듈 전역 싱글톤 — 테스트마다 고유 IP 로 상태를 격리한다.)

import { describe, expect, it } from "vitest";
import { POST } from "../../app/api/auth/login/route";

function req(body: unknown, ip: string): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });
}

describe("POST /api/auth/login rate limit", () => {
  it("brute-force: 분당 10회 초과 시 429 (검증/DB 도달 전 차단)", async () => {
    const ip = "203.0.113.77";
    let last: Response | undefined;
    // 잘못된 body(검증 실패=400)로 반복 — rate-limit 은 검증/DB 이전에 계수된다.
    for (let i = 0; i < 11; i++) {
      last = await POST(req({ nope: 1 }, ip));
    }
    expect(last?.status).toBe(429);
    const json = (await last?.json()) as { code?: string; success?: boolean };
    expect(json.code).toBe("RATE_LIMITED");
    expect(json.success).toBe(false);
  });

  it("정상 범위(분당 10회 이내)는 rate-limit 으로 막히지 않는다", async () => {
    // 고유 IP 1회 호출 — 검증 실패로 400 이지만 429 는 아님(정상 사용자 비차단).
    const res = await POST(req({ nope: 1 }, "203.0.113.78"));
    expect(res.status).toBe(400);
  });
});
