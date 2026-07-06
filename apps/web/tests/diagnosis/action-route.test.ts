// @TASK P2-R5 / P3-R1 - action Route Handler 테스트 (RED→GREEN, 실 DB/외부호출 0)
// @SPEC specs/screens/actions.yaml (S5: GET ?diagnosisId= → 4분류 + 오늘 딱 하나 + 페이월)
// @SPEC specs/domain/resources.yaml (action 리소스)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러)
// @TEST apps/web/tests/diagnosis/action-route.test.ts

import { describe, expect, it, vi } from "vitest";
import type { DiagnosisView } from "../../lib/diagnosis/diagnosis-service.js";
import type { GapActionTier } from "../../lib/diagnosis/gap-service.js";
import type { PlanTier } from "../../lib/diagnosis/plan-tier.js";

interface GapRowStub {
  id?: string;
  item: string;
  competitorHas: boolean;
  isMyGap: boolean;
  actionTier?: GapActionTier;
}

const state: {
  view: DiagnosisView | null;
  tier: PlanTier;
  gapRows: GapRowStub[];
  completions: Record<string, { isCompleted: boolean; completedAt: Date | null }>;
} = {
  view: null,
  tier: "free",
  gapRows: [],
  completions: {},
};

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

vi.mock("../../lib/diagnosis/diagnosis-repository.js", () => ({
  getDefaultDiagnosisRepository: () => ({
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  }),
}));

vi.mock("../../lib/diagnosis/persistence-repository.js", () => ({
  getDefaultDb: () => ({}),
  getPersistedGapRows: vi.fn(async () => state.gapRows),
  getPersistedActions: vi.fn(async () =>
    Object.entries(state.completions).map(([actionRef, value], index) => ({
      id: `persisted-${index}`,
      actionRef,
      actionTier: "low" as const,
      isTodayOne: false,
      isCompleted: value.isCompleted,
      completedAt: value.completedAt,
    })),
  ),
  setPersistedActionCompletion: vi.fn(
    async (_db, _diagnosisId: string, actionId: string, completed: boolean) => {
      const matched = state.gapRows.find((row) => row.id === actionId);
      if (!matched) return null;
      const completedAt = completed ? new Date("2026-07-06T07:55:00.000Z") : null;
      state.completions[actionId] = { isCompleted: completed, completedAt };
      return {
        id: `persisted-${actionId}`,
        actionRef: actionId,
        actionTier: "low" as const,
        isTodayOne: false,
        isCompleted: completed,
        completedAt,
      };
    },
  ),
}));

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

const { GET, PATCH } = await import("../../app/api/action/route.js");

function getReq(qs: string): Request {
  return new Request(`http://localhost/api/action?${qs}`);
}

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/action", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

describe("GET/PATCH /api/action (P2-R5 / P3-R1)", () => {
  it("diagnosisId 누락/비UUID 시 400 (Validation)", async () => {
    state.tier = "free";
    const res = await GET(getReq("diagnosisId=not-a-uuid"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("진단을 찾을 수 없으면 404", async () => {
    state.tier = "free";
    state.view = null;
    const res = await GET(getReq(`diagnosisId=${VALID_UUID}`));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("완료 진단 → actions 배열 + todayOne + intro + isPaid + paywall 반환 (200)", async () => {
    state.tier = "free";
    state.gapRows = [];
    state.completions = {};
    state.view = completedView();
    const res = await GET(getReq(`diagnosisId=${VALID_UUID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        actions: unknown[];
        todayOne: unknown;
        intro: string;
        isPaid: boolean;
        paywall: { locked: boolean; lockedCount: number };
      };
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.actions)).toBe(true);
    expect(typeof body.data.intro).toBe("string");
    expect(typeof body.data.isPaid).toBe("boolean");
    expect(typeof body.data.paywall.lockedCount).toBe("number");
  });

  it("★ 보안: free 세션이 ?paid=1 을 보내도 무시 — isPaid=false (서버 강제, 우회 0)", async () => {
    state.tier = "free";
    state.view = completedView();
    const res = await GET(getReq(`diagnosisId=${VALID_UUID}&paid=1`));
    const body = (await res.json()) as { data: { isPaid: boolean } };
    expect(body.data.isPaid).toBe(false);
  });

  it("tier 필터를 반영해 선택한 분류만 돌려준다", async () => {
    state.tier = "paid";
    state.view = completedView();
    state.gapRows = [
      {
        id: "gap-1",
        item: "영업시간이 안 적혀 있어요",
        competitorHas: true,
        isMyGap: true,
        actionTier: "self_fix",
      },
      {
        id: "gap-2",
        item: "가게 소개 문구가 없어요",
        competitorHas: true,
        isMyGap: true,
        actionTier: "snippet",
      },
      {
        id: "gap-3",
        item: "리뷰를 꾸준히 모아야 해요",
        competitorHas: true,
        isMyGap: true,
        actionTier: "ongoing",
      },
    ];
    const res = await GET(getReq(`diagnosisId=${VALID_UUID}&tier=yellow_copy`));
    const body = (await res.json()) as {
      data: { actions: Array<{ tier: string }>; paywall: { lockedCount: number } };
    };
    expect(body.data.actions).toHaveLength(1);
    expect(body.data.actions[0]?.tier).toBe("yellow_copy");
    expect(body.data.paywall.lockedCount).toBe(0);
  });

  it("★ 오늘 딱 하나는 무료 보장 — free 에서도 잠금 뒤가 아님(isPaid=false), 잠긴 행동 content 미노출", async () => {
    state.tier = "free";
    state.view = completedView();
    state.gapRows = [
      {
        id: "gap-1",
        item: "영업시간이 안 적혀 있어요",
        competitorHas: true,
        isMyGap: true,
        actionTier: "self_fix",
      },
      {
        id: "gap-2",
        item: "가게 소개 문구가 없어요",
        competitorHas: true,
        isMyGap: true,
        actionTier: "snippet",
      },
      {
        id: "gap-3",
        item: "자주 묻는 질문 안내가 없어요",
        competitorHas: true,
        isMyGap: true,
        actionTier: "vendor",
      },
      {
        id: "gap-4",
        item: "리뷰 모음 안내가 없어요(잠금행동)",
        competitorHas: true,
        isMyGap: true,
        actionTier: "ongoing",
      },
      {
        id: "gap-5",
        item: "첫 화면이 늦게 떠요(잠금행동)",
        competitorHas: true,
        isMyGap: true,
        actionTier: "snippet",
      },
    ];
    const res = await GET(getReq(`diagnosisId=${VALID_UUID}&paid=1`));
    const body = (await res.json()) as {
      data: {
        actions: { title: string; isTodayOne: boolean; isPaid: boolean }[];
        todayOne: { isPaid: boolean } | null;
        paywall: { locked: boolean; lockedCount: number };
      };
    };
    expect(body.data.actions).toHaveLength(3);
    expect(body.data.todayOne).not.toBeNull();
    expect(body.data.todayOne?.isPaid).toBe(false);
    expect(JSON.stringify(body.data.actions)).not.toContain("잠금행동");
    expect(body.data.paywall.locked).toBe(true);
    expect(body.data.paywall.lockedCount).toBe(2);
  });

  it("PATCH 완료 토글 → action completion mutation 응답", async () => {
    state.tier = "paid";
    state.view = completedView();
    state.gapRows = [
      {
        id: "gap-1",
        item: "영업시간이 안 적혀 있어요",
        competitorHas: true,
        isMyGap: true,
        actionTier: "self_fix",
      },
    ];
    state.completions = {};
    const res = await PATCH(
      patchReq({ diagnosisId: VALID_UUID, actionId: "gap-1", completed: true }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { actionId: string; isCompleted: boolean; completedAt: string | null };
    };
    expect(body.success).toBe(true);
    expect(body.data.actionId).toBe("gap-1");
    expect(body.data.isCompleted).toBe(true);
    expect(body.data.completedAt).toBeTruthy();
  });

  it("v1 폴백: 원자료 미영속화 → 추측 행동 0(빈 배열) + todayOne null + 응원 인트로(룰코드/인과 0)", async () => {
    state.tier = "free";
    state.gapRows = [];
    state.completions = {};
    state.view = completedView();
    const res = await GET(getReq(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as {
      data: { actions: unknown[]; todayOne: unknown; intro: string };
    };
    expect(body.data.actions).toEqual([]);
    expect(body.data.todayOne).toBeNull();
    expect(body.data.intro).not.toMatch(/뒤처|졌|밀려/);
    expect(body.data.intro).not.toMatch(/1위|매출\s*↑|보장|따라하면|고치면/);
    expect(body.data.intro).not.toMatch(/SERP|grounded|점수|[A-Z]{2,}-[A-Z0-9-]*-?\d{2,}/);
  });
});
