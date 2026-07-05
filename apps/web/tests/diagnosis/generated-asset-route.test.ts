// @TASK P2-R6 / P3-R1 - generatedAsset Route Handler 테스트 (RED→GREEN, 실 DB/외부호출 0)
// @SPEC specs/screens/generated.yaml (S6: GET ?diagnosisId=[&type=] → 4종 생성물 + 인트로 + 페이월)
// @SPEC specs/domain/resources.yaml (generatedAsset 리소스)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러)
// @TEST apps/web/tests/diagnosis/generated-asset-route.test.ts
//
// route 모듈을 직접 import 해 Request 로 호출 (Next 런타임 없이 핸들러 단위 검증).
// 저장소(getDefaultDiagnosisRepository)는 vi.mock 으로 fake 주입 — 실 DB 접근 0.
//
// ★ 보안(P3-R1): 무료/유료 경계는 서버 세션 account.plan 으로만 결정된다(resolveRequestPlanTier).
// 클라 ?paid=1 은 무시된다 — free 세션이 ?paid=1 보내도 유료 생성물 본문 미노출(우회 0).
//
// v1 한계(정직): DB(04 스키마)는 진단 원자료(business 프로필/FAQ)를 생성물 형태로 영속화하지
// 않으므로, route 는 진단 view(완료 여부)만으로 정직 폴백을 산출한다 — 추측 생성물 0(빈 배열) +
// 응원 인트로. 카피 가드 통과 보증. 원자료 영속화 후 deriveGeneratedAssets 로 승급([OPEN]).

import { describe, expect, it, vi } from "vitest";
import type { DiagnosisView } from "../../lib/diagnosis/diagnosis-service.js";
import type { PlanTier } from "../../lib/diagnosis/plan-tier.js";

interface AssetRowStub {
  type: string;
  code: string;
}

const state: { view: DiagnosisView | null; tier: PlanTier; assets: AssetRowStub[] } = {
  view: null,
  tier: "free",
  assets: [],
};

vi.mock("../../lib/diagnosis/diagnosis-repository.js", () => ({
  getDefaultDiagnosisRepository: () => ({
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  }),
}));

// 영속화 저장소 stub — 실 DB 접근 0. state.assets 로 실 생성물 행 주입(content 비노출 검증).
vi.mock("../../lib/diagnosis/persistence-repository.js", () => ({
  getDefaultDb: () => ({}),
  getPersistedGeneratedAssets: vi.fn(async () => state.assets),
}));

// ★ PlanTier 서버 판정 stub — 세션 account.plan 으로만 결정(클라 ?paid=1 무시) 검증용.
vi.mock("../../lib/diagnosis/plan-tier.js", async (orig) => {
  const actual = await orig<typeof import("../../lib/diagnosis/plan-tier.js")>();
  return {
    ...actual,
    resolveRequestPlanTier: vi.fn(async () => ({
      account: state.tier === "free" ? null : { id: "a", email: "e", plan: "pro" as const },
      tier: state.tier,
      isPaid: state.tier === "paid",
    })),
  };
});

vi.mock("../../lib/diagnosis/diagnosis-service.js", async (orig) => {
  const actual = await orig<typeof import("../../lib/diagnosis/diagnosis-service.js")>();
  return {
    ...actual,
    getDiagnosisView: vi.fn(async () => state.view),
  };
});

const { GET } = await import("../../app/api/generated-asset/route.js");

function req(qs: string): Request {
  return new Request(`http://localhost/api/generated-asset?${qs}`);
}

const VALID_UUID = "00000000-0000-4000-8000-000000000abc";

function completedView(): DiagnosisView {
  return {
    id: VALID_UUID,
    businessId: "00000000-0000-4000-8000-0000000000b1",
    status: "completed",
    overallSignal: "fair",
    summaryText: "요약",
    crawlFailureReason: null,
    startedAt: new Date(),
    completedAt: new Date(),
  };
}

describe("GET /api/generated-asset (P2-R6 / P3-R1)", () => {
  it("diagnosisId 누락/비UUID 시 400 (Validation)", async () => {
    state.tier = "free";
    const res = await GET(req("diagnosisId=not-a-uuid"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("잘못된 type 값이면 400 (Validation)", async () => {
    state.tier = "free";
    state.view = completedView();
    const res = await GET(req(`diagnosisId=${VALID_UUID}&type=brokerage`));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("진단을 찾을 수 없으면 404", async () => {
    state.tier = "free";
    state.view = null;
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  it("완료 진단 → assets 배열 + intro + isPaid + paywall 반환 (200)", async () => {
    state.tier = "free";
    state.assets = [];
    state.view = completedView();
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        assets: unknown[];
        intro: string;
        isPaid: boolean;
        paywall: { locked: boolean; lockedCount: number };
      };
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.assets)).toBe(true);
    expect(typeof body.data.intro).toBe("string");
    expect(typeof body.data.isPaid).toBe("boolean");
    expect(typeof body.data.paywall.lockedCount).toBe("number");
  });

  it("★ 보안: free 세션이 ?paid=1 을 보내도 무시 — isPaid=false (서버 강제, 우회 0)", async () => {
    state.tier = "free";
    state.view = completedView();
    const res = await GET(req(`diagnosisId=${VALID_UUID}&paid=1`));
    const body = (await res.json()) as { data: { isPaid: boolean } };
    expect(body.data.isPaid).toBe(false);
  });

  it("★ 서버 plan 판정: paid 세션 → isPaid=true(전체), 익명/free → false(미리보기/일부)", async () => {
    state.view = completedView();
    state.tier = "free";
    const free = (await (await GET(req(`diagnosisId=${VALID_UUID}`))).json()) as {
      data: { isPaid: boolean };
    };
    expect(free.data.isPaid).toBe(false);
    state.tier = "paid";
    const paid = (await (await GET(req(`diagnosisId=${VALID_UUID}`))).json()) as {
      data: { isPaid: boolean };
    };
    expect(paid.data.isPaid).toBe(true);
  });

  it("★ 보안 핵심: free 세션 + ?paid=1 → 미리보기 일부만, 유료 생성물 본문 미노출 + lockedCount", async () => {
    // DB 4종 영속화 — 무료 미리보기는 place_intro(LOCAL_BUSINESS)+review_request(ORGANIZATION)만.
    // snippet(FAQ_HTML)·vendor_prescription(SERVICE) 본문(content)은 무료 응답에 0(잠금).
    state.tier = "free";
    state.view = completedView();
    state.assets = [
      { type: "LOCAL_BUSINESS", code: "우리 가게는 마포의 한식당이에요. 편하게 들러 주세요." },
      {
        type: "ORGANIZATION",
        code: "방문해 주셔서 고마워요. 한 줄 후기 남겨 주시면 큰 힘이 돼요.",
      },
      { type: "FAQ_HTML", code: "Q. 영업시간은요? A. 오전 11시부터 밤 9시까지예요.(유료본문)" },
      { type: "SERVICE", code: "안녕하세요, 아래 내용으로 도움 받고 싶어요.(유료본문)" },
    ];
    const res = await GET(req(`diagnosisId=${VALID_UUID}&paid=1`));
    const body = (await res.json()) as {
      data: {
        assets: { type: string; content: string }[];
        isPaid: boolean;
        paywall: { locked: boolean; lockedCount: number };
      };
    };
    expect(body.data.isPaid).toBe(false);
    // 무료 미리보기 2종만.
    expect(body.data.assets).toHaveLength(2);
    const types = body.data.assets.map((a) => a.type).sort();
    expect(types).toEqual(["place_intro", "review_request"]);
    // ★ 유료 생성물 본문(content)은 응답 어디에도 없어야 한다.
    expect(JSON.stringify(body.data.assets)).not.toContain("유료본문");
    // 잠금 메타는 개수만(4종 중 2종 잠금).
    expect(body.data.paywall.locked).toBe(true);
    expect(body.data.paywall.lockedCount).toBe(2);
  });

  it("v1 폴백: 원자료 미영속화 → 추측 생성물 0(빈 배열) + 응원 인트로(인과·중개 0)", async () => {
    state.tier = "free";
    state.assets = [];
    state.view = completedView();
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as { data: { assets: unknown[]; intro: string } };
    expect(body.data.assets).toEqual([]);
    expect(body.data.intro).not.toMatch(/1위|매출\s*↑|보장|따라하면|고치면/);
    expect(body.data.intro).not.toMatch(/중개|정산|수수료/);
    expect(body.data.intro).not.toMatch(/SERP|snippet|[A-Z]{2,}-[A-Z0-9-]*-?\d{2,}/);
  });
});
