import { getDefaultBusinessRepository } from "@/lib/business";
import { getDefaultDiagnosisRepository } from "@/lib/diagnosis/diagnosis-repository";
import {
  buildSubscribedRadarPreview,
  buildUnsubscribedRadarPreview,
  emptySubscribedRadarPreview,
  failedSubscribedRadarPreview,
  waitingSubscribedRadarPreview,
} from "@/lib/radar/radar-preview";
import { getDefaultRadarRepository } from "@/lib/radar/radar-repository";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawDiagnosisId = searchParams.get("diagnosisId");

    if (!rawDiagnosisId) {
      const preview = await buildUnsubscribedRadarPreview({
        businessName: "",
        region: null,
        category: null,
      });
      return NextResponse.json({ data: preview, success: true });
    }

    const diagnosisId = z.string().uuid().parse(rawDiagnosisId);
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

    const radarRepository = getDefaultRadarRepository();
    const subscription = await radarRepository.findSubscriptionByBusinessId(business.id);
    if (subscription?.status === "active" || subscription?.status === "trialing") {
      try {
        const latestScan = await radarRepository.latestScanForSubscription(subscription.id);
        if (!latestScan || ["queued", "expanding", "scoring", "probing"].includes(latestScan.status)) {
          return NextResponse.json({ data: waitingSubscribedRadarPreview(), success: true });
        }
        if (latestScan.status === "failed") {
          return NextResponse.json({ data: failedSubscribedRadarPreview(), success: true });
        }

        const keywords = await radarRepository.latestKeywordsForSubscription(subscription.id, 5);
        const preview =
          keywords.length > 0 ? buildSubscribedRadarPreview(keywords) : emptySubscribedRadarPreview();
        return NextResponse.json({ data: preview, success: true });
      } catch {
        return NextResponse.json({ data: failedSubscribedRadarPreview(), success: true });
      }
    }

    const preview = await buildUnsubscribedRadarPreview({
      businessName: business.name,
      region: business.region,
      category: business.category,
    });
    return NextResponse.json({ data: preview, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid diagnosisId", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("GET /api/radar/preview error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
