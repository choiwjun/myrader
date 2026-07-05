// @TASK P3-R1 - PlanTier 서버 판정 + 게이팅 헬퍼 테스트 (RED→GREEN, 실 DB/세션 0)
// @SPEC specs/shared/types.yaml (PlanTier: free/paid)
// @SPEC docs/planning/06-tasks.md#p3-r1 (서버 강제 — 클라 ?paid=1 무시)
// @SPEC docs/planning/DECISION_LOG.md (OQ-3: 무료=요약·훅 / 유료=일회성 실행팩)
// @TEST apps/web/tests/diagnosis/plan-tier.test.ts
//
// ★ 보안 핵심: PlanTier 는 오직 서버 세션 account.plan 으로만 결정된다. 클라 입력(?paid=1)은
// 이 레이어에 들어오지 않는다(우회 0). resolvePlanTier 는 순수 — account 만으로 판정.

import { describe, expect, it } from "vitest";
import type { PublicAccount } from "../../lib/auth/index.js";
import {
  isPaidTier,
  resolvePlanTier,
  resolveRequestPlanTier,
} from "../../lib/diagnosis/plan-tier.js";

function account(plan: PublicAccount["plan"]): PublicAccount {
  return { id: "00000000-0000-4000-8000-0000000000ac", email: "owner@example.com", plan };
}

describe("resolvePlanTier (P3-R1 — 서버 강제 PlanTier 판정)", () => {
  it("익명(null/undefined) = free", () => {
    expect(resolvePlanTier(null)).toBe("free");
    expect(resolvePlanTier(undefined)).toBe("free");
  });

  it("account.plan = 'free' = free", () => {
    expect(resolvePlanTier(account("free"))).toBe("free");
  });

  it("account.plan 유료 계열(basic/pro/business) = paid", () => {
    expect(resolvePlanTier(account("basic"))).toBe("paid");
    expect(resolvePlanTier(account("pro"))).toBe("paid");
    expect(resolvePlanTier(account("business"))).toBe("paid");
  });

  it("isPaidTier — paid=true / free=false", () => {
    expect(isPaidTier("paid")).toBe(true);
    expect(isPaidTier("free")).toBe(false);
  });
});

describe("resolveRequestPlanTier (P3-R1 — 세션 주입, 클라 신호 무시)", () => {
  it("세션 없음(getCurrentUser→null) = free / isPaid=false", async () => {
    const out = await resolveRequestPlanTier({ getCurrentUser: async () => null });
    expect(out.tier).toBe("free");
    expect(out.isPaid).toBe(false);
    expect(out.account).toBeNull();
  });

  it("free account 세션 = free / isPaid=false", async () => {
    const out = await resolveRequestPlanTier({ getCurrentUser: async () => account("free") });
    expect(out.tier).toBe("free");
    expect(out.isPaid).toBe(false);
  });

  it("paid 계열 account 세션 = paid / isPaid=true", async () => {
    const out = await resolveRequestPlanTier({ getCurrentUser: async () => account("pro") });
    expect(out.tier).toBe("paid");
    expect(out.isPaid).toBe(true);
    expect(out.account?.plan).toBe("pro");
  });

  it("★ 보안: resolveRequestPlanTier 는 입력 인자에 클라 paid 신호를 받지 않는다(세션만)", async () => {
    // 시그니처 자체가 클라 쿼리(`paid`)를 받지 않음을 계약으로 고정 — 세션 조회기만 주입 가능.
    const out = await resolveRequestPlanTier({ getCurrentUser: async () => account("free") });
    // free account 는 어떤 경우에도 paid 로 승격되지 않는다(클라가 paid=1 보내도 경로 자체가 없음).
    expect(out.isPaid).toBe(false);
  });
});
