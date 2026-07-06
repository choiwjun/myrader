import { getDefaultBusinessRepository } from "@/lib/business";
import { getDefaultDiagnosisRepository } from "@/lib/diagnosis/diagnosis-repository";
import {
  buildSubscribedRadarPreview,
  emptySubscribedRadarPreview,
  failedSubscribedRadarPreview,
  waitingSubscribedRadarPreview,
} from "@/lib/radar/radar-preview";
import { getDefaultRadarRepository } from "@/lib/radar/radar-repository";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  diagnosisId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const { diagnosisId } = BodySchema.parse(await request.json());
    const diagnosis = await getDefaultDiagnosisRepository().findById(diagnosisId);
    if (!diagnosis) {
      return NextResponse.json(
        { error: "Diagnosis not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }

    const business = await getDefaultBusinessRepository().findById(diagnosis.businessId);
    if (!business) {
      return NextResponse.json(
        { error: "Business not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }

    const now = new Date();
    const radarRepository = getDefaultRadarRepository();
    const existingSubscription = await radarRepository.findSubscriptionByBusinessId(business.id);
    const subscription = await radarRepository.upsertSubscription({
      businessId: business.id,
      accountId: existingSubscription?.accountId ?? null,
      status:
        existingSubscription?.status === "active" || existingSubscription?.status === "trialing"
          ? existingSubscription.status
          : "trialing",
      nextScanAt: existingSubscription?.nextScanAt ?? now,
      canceledAt: null,
    });
    if (!subscription) {
      throw new Error("Radar subscription upsert returned no row");
    }

    const latestScan = await radarRepository.latestScanForSubscription(subscription.id);
    if (!latestScan || ["queued", "expanding", "scoring", "probing"].includes(latestScan.status)) {
      return NextResponse.json({ data: waitingSubscribedRadarPreview(), success: true });
    }
    if (latestScan.status === "failed") {
      return NextResponse.json({ data: failedSubscribedRadarPreview(), success: true });
    }

    const keywords = await radarRepository.latestKeywordsForSubscription(subscription.id, 5);
    const preview =
      keywords.length > 0
        ? buildSubscribedRadarPreview(keywords, { diagnosisId })
        : emptySubscribedRadarPreview();
    return NextResponse.json({ data: preview, success: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid radar subscription request", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("POST /api/radar/subscription error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
