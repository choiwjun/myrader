// @TASK P2-R4 / P3-R1 - gapItem Route Handler 테스트 (RED→GREEN, 실 DB/외부호출 0)
// @SPEC specs/screens/reverse-gap.yaml (S4: GET ?diagnosisId= → 갭 매트릭스 + 인트로 + 페이월)
// @SPEC specs/domain/resources.yaml (gapItem 리소스)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러)
// @TEST apps/web/tests/diagnosis/gap-route.test.ts
//
// route 모듈을 직접 import 해 Request 로 호출 (Next 런타임 없이 핸들러 단위 검증).
// 저장소(getDefaultDiagnosisRepository)는 vi.mock 으로 fake 주입 — 실 DB 접근 0.
//
// ★ 보안(P3-R1): 무료/유료 경계는 서버 세션 account.plan 으로만 결정된다(resolveRequestPlanTier).
// 클라 ?paid=1 은 무시된다 — free 세션(또는 익명)이 ?paid=1 을 보내도 isPaid=false(우회 0).
//
// v1 한계(정직): DB(04 스키마)는 진단 원자료(competitorUrls·경쟁사 진단·GapResult)를
// 영속화하지 않으므로(FR-012 §5 영속화 [OPEN], 스키마 수정 금지), route 는 진단 view
// (완료 여부)만으로 정직 폴백을 산출한다 — 추측 갭 0, 카드 생략 + 응원 인트로. 코드값 노출 0.

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      }),
  },
}));
import { describe, expect, it, vi } from "vitest";
import type { DiagnosisView } from "../../lib/diagnosis/diagnosis-service.js";
import type { PlanTier } from "../../lib/diagnosis/plan-tier.js";

interface GapRowStub {
  item: string;
  competitorHas: boolean;
  isMyGap: boolean;
  actionTier?: "self_fix" | "snippet" | "vendor" | "ongoing";
  source?: "naver_serp" | "gpt_grounded" | "manual";
  collectedAt?: string;
  competitorName?: string | null;
}

const state: {
  view: DiagnosisView | null;
  tier: PlanTier;
  gapRows: GapRowStub[];
  competitors: Array<{
    name: string;
    source: "naver_serp" | "gpt_grounded" | "manual";
    collectedAt: string;
  }>;
} = {
  view: null,
  tier: "free",
  gapRows: [],
  competitors: [],
};

vi.mock("../../lib/diagnosis/diagnosis-repository.js", () => ({
  getDefaultDiagnosisRepository: () => ({
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  }),
}));

// 영속화 저장소 stub — 실 DB 접근 0. 기본 빈 데이터(미진단/구진단 → 정직 폴백 검증).
// state.gapRows 로 실 갭 행을 주입해 content 비노출(보안) 경계를 검증한다.
vi.mock("../../lib/diagnosis/persistence-repository.js", () => ({
  getDefaultDb: () => ({}),
  getPersistedGapRows: vi.fn(async () => state.gapRows),
  getPersistedCompetitors: vi.fn(async () => state.competitors),
}));

// ★ PlanTier 서버 판정 stub — 세션 account.plan 으로만 결정(클라 ?paid=1 무시) 검증용.
// 실 plan-tier 의 computePaywallMeta 는 그대로 쓰고, resolveRequestPlanTier 만 세션 tier 로 고정한다.
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

const { GET } = await import("../../app/api/gap/route.js");

function req(qs: string): Request {
  return new Request(`http://localhost/api/gap?${qs}`);
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

describe("GET /api/gap (P2-R4 / P3-R1)", () => {
  it("diagnosisId 누락/비UUID 시 400 (Validation)", async () => {
    state.tier = "free";
    const res = await GET(req("diagnosisId=not-a-uuid"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("진단을 찾을 수 없으면 404", async () => {
    state.tier = "free";
    state.view = null;
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("완료 진단 → items 배열 + intro + isPaid + paywall 반환 (200)", async () => {
    state.tier = "free";
    state.view = completedView();
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        items: unknown[];
        intro: string;
        isPaid: boolean;
        paywall: { locked: boolean; lockedCount: number };
      };
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(typeof body.data.intro).toBe("string");
    expect(typeof body.data.isPaid).toBe("boolean");
    expect(typeof body.data.paywall.lockedCount).toBe("number");
  });

  it("★ 보안: free 세션이 ?paid=1 을 보내도 무시 — isPaid=false (서버 강제, 우회 0)", async () => {
    state.tier = "free";
    state.view = completedView();
    // 클라가 ?paid=1 로 유료 content 요청 시도 → 서버는 세션 plan(free)으로만 판정 → 무시.
    const res = await GET(req(`diagnosisId=${VALID_UUID}&paid=1`));
    const body = (await res.json()) as { data: { isPaid: boolean } };
    expect(body.data.isPaid).toBe(false);
  });

  it("★ 서버 plan 판정: paid 세션(account.plan 유료) → isPaid=true(전체 매트릭스)", async () => {
    state.tier = "paid";
    state.view = completedView();
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as { data: { isPaid: boolean } };
    expect(body.data.isPaid).toBe(true);
  });

  it("기본(익명/free 세션) → isPaid=false (무료 Top3)", async () => {
    state.tier = "free";
    state.view = completedView();
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as { data: { isPaid: boolean } };
    expect(body.data.isPaid).toBe(false);
  });

  it("★ 보안 핵심: free 세션 + ?paid=1 → Top3 만, 유료 잠금 갭 content 미노출 + lockedCount 메타", async () => {
    // 내 갭 5개 영속화 — 무료는 Top3(3개)만 보여야 하고, 잠긴 2개의 label(content)은 응답에 0.
    state.tier = "free";
    state.view = completedView();
    state.gapRows = [
      { item: "영업시간이 안 적혀 있어요", competitorHas: true, isMyGap: true },
      { item: "가게 소개 문구가 없어요", competitorHas: true, isMyGap: true },
      { item: "자주 묻는 질문 안내가 없어요", competitorHas: true, isMyGap: true },
      { item: "리뷰 모음 안내가 없어요(잠금)", competitorHas: true, isMyGap: true },
      { item: "첫 화면이 늦게 떠요(잠금)", competitorHas: true, isMyGap: true },
    ];
    // 클라가 ?paid=1 로 우회 시도해도 free 세션이라 무시.
    const res = await GET(req(`diagnosisId=${VALID_UUID}&paid=1`));
    const body = (await res.json()) as {
      data: {
        items: { label: string }[];
        isPaid: boolean;
        paywall: { locked: boolean; lockedCount: number };
      };
    };
    expect(body.data.isPaid).toBe(false);
    // 무료는 Top3 만 — 정확히 3개.
    expect(body.data.items).toHaveLength(3);
    // ★ 잠긴 갭의 실제 content(label)는 응답 어디에도 없어야 한다(우회 0).
    const serialized = JSON.stringify(body.data.items);
    expect(serialized).not.toContain("잠금");
    // 잠금 메타는 개수만(content 0).
    expect(body.data.paywall.locked).toBe(true);
    expect(body.data.paywall.lockedCount).toBe(2);
  });

  it("★ paid 세션 → 전체 갭(잠금 0) content 통과", async () => {
    state.tier = "paid";
    state.view = completedView();
    state.gapRows = [
      { item: "영업시간이 안 적혀 있어요", competitorHas: true, isMyGap: true },
      { item: "가게 소개 문구가 없어요", competitorHas: true, isMyGap: true },
      { item: "자주 묻는 질문 안내가 없어요", competitorHas: true, isMyGap: true },
      { item: "리뷰 모음 안내가 없어요", competitorHas: true, isMyGap: true },
      { item: "첫 화면이 늦게 떠요", competitorHas: true, isMyGap: true },
    ];
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as {
      data: { items: { label: string }[]; paywall: { locked: boolean; lockedCount: number } };
    };
    // 유료는 전체 5개 — 잠금 0.
    expect(body.data.items).toHaveLength(5);
    expect(body.data.paywall.locked).toBe(false);
    expect(body.data.paywall.lockedCount).toBe(0);
  });

  it("경쟁사는 있지만 실제 competitor report 가 없으면 unavailable metadata 를 반환한다", async () => {
    state.tier = "free";
    state.view = completedView();
    state.gapRows = [];
    state.competitors = [
      {
        name: "옆집카페",
        source: "naver_serp",
        collectedAt: "2026-07-06T07:10:00.000Z",
      },
    ];
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as {
      data: {
        items: unknown[];
        source?: string;
        collectedAt?: string;
        evidence?: { reason?: string; competitors?: Array<{ name: string }> };
        measurementLabel?: string;
      };
    };
    expect(body.data.items).toEqual([]);
    expect(body.data.source).toBe("naver_serp");
    expect(body.data.collectedAt).toBe("2026-07-06T07:10:00.000Z");
    expect(body.data.measurementLabel).toBe("unavailable");
    expect(body.data.evidence).toMatchObject({
      reason: "competitor_reports_unavailable",
      competitors: [{ name: "옆집카페" }],
    });
  });

  it("v1 폴백: 원자료 미영속화 → 추측 갭 0(빈 배열) + 응원 인트로(룰코드/인과/전문용어 0)", async () => {
    state.tier = "free";
    state.gapRows = [];
    state.competitors = [];
    state.view = completedView();
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as {
      data: { items: unknown[]; intro: string; measurementLabel?: string };
    };
    expect(body.data.items).toEqual([]);
    expect(body.data.measurementLabel).toBe("unavailable");
    expect(body.data.intro).not.toMatch(/뒤처|졌|밀려/);
    expect(body.data.intro).not.toMatch(/1위|매출\s*↑|보장|따라하면|고치면/);
    expect(body.data.intro).not.toMatch(/SERP|grounded|점수|[A-Z]{2,}-[A-Z0-9-]*-?\d{2,}/);
  });
});
