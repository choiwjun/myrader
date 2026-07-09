import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      billingEnabled: false,
      currentPlan: "free",
      prices: {
        starter: 9900,
        pro: 24900,
      },
      message:
        "Toss billing is not connected yet. The creator settings screen shows PRD prices and limits only.",
    },
  });
}
