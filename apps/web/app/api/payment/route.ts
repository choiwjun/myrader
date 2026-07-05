import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function paymentDisabled(): NextResponse {
  return NextResponse.json(
    {
      error: "Payment is disabled by current product scope",
      code: "PAYMENT_DISABLED",
      success: false,
    },
    { status: 410 },
  );
}

export function POST(): NextResponse {
  return paymentDisabled();
}

export function PUT(_request: Request): NextResponse {
  return paymentDisabled();
}
