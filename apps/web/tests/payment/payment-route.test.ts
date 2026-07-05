import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        status: init?.status ?? 200,
      }),
  },
}));

const { POST, PUT } = await import("../../app/api/payment/route.js");

async function expectPaymentDisabled(response: Response): Promise<void> {
  expect(response.status).toBe(410);
  const body = (await response.json()) as {
    readonly code?: string;
    readonly data?: unknown;
    readonly error?: string;
    readonly success?: boolean;
  };
  expect(body.success).toBe(false);
  expect(body.code).toBe("PAYMENT_DISABLED");
  expect(body.data).toBeUndefined();
  expect(JSON.stringify(body).toLowerCase()).not.toMatch(/orderid|paymentkey|secret/);
}

describe("A0-7: payment API is disabled by current scope", () => {
  it("POST returns 410 without creating a checkout order", async () => {
    await expectPaymentDisabled(await POST());
  });

  it("PUT returns 410 before parsing or granting payment input", async () => {
    const request = new Request("http://localhost/api/payment", {
      body: JSON.stringify({ paymentKey: "pk", orderId: "not-a-uuid", amount: 1 }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });

    await expectPaymentDisabled(await PUT(request));
  });
});
