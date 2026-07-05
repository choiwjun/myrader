import { readFileSync } from "node:fs";
import { join } from "node:path";
import { radarSubscriptions } from "@boina/db/schema";
import { describe, expect, it } from "vitest";
import CheckoutPage from "../../app/(app)/checkout/page";
import { POST as postPayment, PUT as putPayment } from "../../app/api/payment/route";

const appDir = join(__dirname, "../../app/(app)");
const repoRoot = join(__dirname, "../../../..");

function readAppFile(relativePath: string): string {
  return readFileSync(join(appDir, relativePath), "utf-8");
}

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf-8");
}

function redirectDigest(error: unknown): string {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const digest = error.digest;
    if (typeof digest === "string") return digest;
  }

  return String(error);
}

function expectRedirectToHome(run: () => unknown) {
  try {
    run();
  } catch (error) {
    const digest = redirectDigest(error);
    expect(digest).toContain("NEXT_REDIRECT");
    expect(digest).toContain("/home");
    return;
  }

  throw new Error("Expected checkout to redirect home");
}

describe("A0-6: Payment and external notification scope is excluded from primary app IA", () => {
  it("primary app menus do not expose checkout, Toss, Kakao, or SMS flows", () => {
    const sources = [
      "home/page.tsx",
      "status/page.tsx",
      "rivals/RivalsClient.tsx",
      "write/WriteClient.tsx",
      "settings/SettingsClient.tsx",
      "terms/page.tsx",
      "privacy/page.tsx",
    ].map(readAppFile);

    for (const src of sources) {
      expect(src).not.toMatch(/\/checkout|PaywallGate|Toss|toss|Kakao|kakao|SMS|sms|알림톡/);
    }
  });

  it("active specs and config do not define Toss payment or Kakao/SMS notification requirements", () => {
    const sources = [
      "specs/screens/home.yaml",
      "specs/screens/index.yaml",
      "specs/screens/settings.yaml",
      "specs/shared/components.yaml",
      "specs/screens/actions.yaml",
      "specs/screens/vs-competitor.yaml",
      "README.md",
      ".env.example",
      "vitest.config.ts",
      "packages/db/src/schema/radar-subscription.ts",
      "packages/db/src/radar-repository.ts",
      "packages/db/migrations/0000_init.sql",
      "packages/db/migrations/0004_radar_subscription_tables.sql",
    ].map(readRepoFile);

    for (const src of sources) {
      expect(src).not.toMatch(
        /Toss|toss|토스페이먼츠|토스\s*결제|SMS|sms_sender|알림톡|PAYMENT_SHEET|payment_sheet|toss_billing|kakao_notification|billing_key|billingCustomerKey|notification_phone|kakao_opted_in|sms_fallback_enabled|TOSS_/,
      );
    }
  });

  it("checkout and payment API are closed by behavior, not only by source text", async () => {
    expectRedirectToHome(() => CheckoutPage());

    for (const response of [
      postPayment(),
      putPayment(new Request("https://boina.local/api/payment", { method: "PUT" })),
    ]) {
      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toMatchObject({
        code: "PAYMENT_DISABLED",
        success: false,
      });
    }
  });

  it("radar subscription schema has scan ownership only and no billing or notification columns", () => {
    expect(Object.keys(radarSubscriptions)).toEqual(
      expect.arrayContaining(["businessId", "accountId", "status", "nextScanAt", "lastScanAt"]),
    );
    expect(Object.keys(radarSubscriptions)).not.toEqual(
      expect.arrayContaining([
        "billingKey",
        "billingCustomerKey",
        "notificationPhone",
        "kakaoOptedIn",
        "smsFallbackEnabled",
      ]),
    );
  });
});
