// @TASK 수정라운드A-3 - 진단 route 가드: businessId 검증 + rate limit (회귀)
// @SPEC apps/web/app/api/diagnosis/route.ts (businessId 존재 검증 404 / rate limit 429)
// @SPEC .claude/constitutions/nextjs/api-routes.md (비-200 에러 / 일관 응답)
// @TEST apps/web/tests/diagnosis/diagnosis-route-guards.test.ts
//
// route 모듈을 직접 import 해 Request 로 호출(Next 런타임 없이 핸들러 단위 검증).
// businessId 검증은 실 DB(getDefaultBusinessRepository) 조회 — 존재하지 않는 UUID → 404.
// (DATABASE_URL 필요 — 통합 성격. DB 미가용이면 skip 가능하나 게이트는 DB 있이 실행.)

import { describe, expect, it } from "vitest";
import { POST } from "../../app/api/diagnosis/route.js";

const VALID_PROFILE = {
  businessName: "테스트가게",
  industry: "한식",
  region: "서울 마포구",
  mainServices: ["점심"],
  targetKeywords: ["맛집"],
};

function postReq(body: unknown, ip: string): Request {
  return new Request("http://localhost/api/diagnosis", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/diagnosis 가드 (수정라운드A-3)", () => {
  it("존재하지 않는 businessId → 404 NOT_FOUND (고아 진단행 방지)", async () => {
    const res = await POST(
      postReq(
        {
          target: "https://example.com",
          businessId: "00000000-0000-4000-8000-000000000000", // 존재하지 않는 UUID
          businessProfile: VALID_PROFILE,
        },
        "203.0.113.10",
      ),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("businessId 가 UUID 가 아니면 400 VALIDATION_ERROR", async () => {
    const res = await POST(
      postReq({ target: "https://example.com", businessId: "not-a-uuid" }, "203.0.113.11"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("동일 IP 반복 호출 → rate limit 429 (무한 진단 생성 완화)", async () => {
    const ip = "198.51.100.77";
    let limited = false;
    // 한도(분당 10) 초과까지 반복. body-only(businessId 없음) 경로는 DB 미접근(큐 enqueue)이라
    // rate-limit 만 독립 검증 가능. 한도 초과 시 429 가 떠야 한다.
    for (let i = 0; i < 15; i++) {
      const res = await POST(postReq({ target: "https://example.com" }, ip));
      if (res.status === 429) {
        limited = true;
        const body = (await res.json()) as { code?: string };
        expect(body.code).toBe("RATE_LIMITED");
        expect(res.headers.get("Retry-After")).toBeTruthy();
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
