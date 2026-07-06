// @TASK P2-R1 - business / placeCandidate Route Handler 테스트 (RED→GREEN)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러)
// @SPEC specs/screens/store-finder.yaml (S1: 검색 → 확정)
//
// 리소스 중심(REST):
//   GET  /api/business?name=&region=  → placeCandidate 후보 목록(검색)
//   POST /api/business                → 후보 확정 → business 생성(201)
//
// route 모듈을 직접 import 해 Request 로 호출 (Next 런타임 없이 핸들러 단위 검증).
// 검색은 mock provider 경로(키 없음) — 실 네이버 호출 0. 확정은 fake repo 주입 불가하므로
// validation/검색 경로 위주로 검증하고, DB 통합은 별도 integration 테스트가 담당한다.

import { describe, expect, it } from "vitest";
import { GET } from "../../app/api/business/route.js";

function getReq(qs: string): Request {
  return new Request(`http://localhost/api/business?${qs}`);
}

describe("GET /api/business (placeCandidate 검색, P2-R1)", () => {
  it("name+region 으로 후보 목록을 반환한다 (200, data 배열)", async () => {
    const res = await GET(
      getReq("name=%EC%8A%A4%ED%83%80%EB%B2%85%EC%8A%A4&region=%EC%84%9C%EC%9A%B8"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { candidates: Array<{ placeUrl: string; name: string; address: string }> };
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.candidates)).toBe(true);
    expect(body.data.candidates.length).toBeGreaterThan(0);
    const first = body.data.candidates[0];
    expect(first?.placeUrl).toMatch(/^https:\/\/place\.naver\.com\//);
    expect(typeof first?.address).toBe("string");
  });

  it("name만으로도 후보 목록을 반환한다 (지역 선택)", async () => {
    const res = await GET(getReq("name=%EC%8A%A4%ED%83%80%EB%B2%85%EC%8A%A4"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { candidates: Array<{ placeUrl: string; name: string; address: string }> };
    };
    expect(body.success).toBe(true);
    expect(body.data.candidates.length).toBeGreaterThan(0);
    expect(body.data.candidates[0]?.address).toContain("전국");
  });

  it("name 누락 시 400 (Validation, 헌법: 비-200 에러)", async () => {
    const res = await GET(getReq("region=%EC%84%9C%EC%9A%B8"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("응답에 점수·내부값 비노출 — placeCandidate 4필드만 (정직성/경계)", async () => {
    const res = await GET(
      getReq("name=%EA%B9%80%EB%B0%A5%EC%B2%9C%EA%B5%AD&region=%EC%84%9C%EC%9A%B8"),
    );
    const body = (await res.json()) as {
      data: { candidates: Array<Record<string, unknown>> };
    };
    const first = body.data.candidates[0];
    expect(first).toBeDefined();
    expect(Object.keys(first as object).sort()).toEqual(
      ["address", "category", "name", "placeUrl"].sort(),
    );
  });
});
