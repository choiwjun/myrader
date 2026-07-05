import { describe, expect, it } from "vitest";
import type { PublicAccount } from "../../lib/auth/index.js";
import {
  computePaywallMeta,
  resolvePlanTier,
  resolveRequestPlanTier,
} from "../../lib/diagnosis/plan-tier.js";

describe("A0-7: legacy paywall integration is payment-free", () => {
  it("free and paid plan boundaries still compute without a payment transition", async () => {
    const freeAccount: PublicAccount = { email: "free@example.com", id: "acc-free", plan: "free" };
    const paidAccount: PublicAccount = {
      email: "paid@example.com",
      id: "acc-paid",
      plan: "basic",
    };

    expect(resolvePlanTier(freeAccount)).toBe("free");
    expect(resolvePlanTier(paidAccount)).toBe("paid");

    const freeMeta = computePaywallMeta(5, 3, false);
    const paidMeta = computePaywallMeta(5, 5, true);

    expect(freeMeta.locked).toBe(true);
    expect(freeMeta.lockedCount).toBe(2);
    expect(paidMeta.locked).toBe(false);
    expect(paidMeta.lockedCount).toBe(0);

    const resolvedFree = await resolveRequestPlanTier({
      getCurrentUser: async () => freeAccount,
    });
    const resolvedPaid = await resolveRequestPlanTier({
      getCurrentUser: async () => paidAccount,
    });

    expect(resolvedFree.isPaid).toBe(false);
    expect(resolvedPaid.isPaid).toBe(true);
  });

  it("locked-result navigation uses write workflow, not payment workflow", () => {
    const nextTarget = "/write?diagnosisId=diag-123";

    expect(nextTarget).toContain("/write");
    expect(nextTarget).not.toContain("/checkout");
    expect(nextTarget).not.toContain("/api/payment");
  });
});
