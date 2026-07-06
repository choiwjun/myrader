import { getDefaultBusinessRepository } from "@/lib/business";
import { getDefaultDiagnosisRepository } from "@/lib/diagnosis/diagnosis-repository";
import { getDefaultRadarRepository } from "@/lib/radar/radar-repository";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  diagnosisId: z.string().uuid(),
  keywordId: z.string().uuid(),
  feedbackType: z.enum(["used", "not_yet"]),
});

export async function POST(request: Request) {
  try {
    const { diagnosisId, keywordId, feedbackType } = BodySchema.parse(await request.json());
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
    if (!subscription || !["active", "trialing"].includes(subscription.status)) {
      return NextResponse.json(
        { error: "Radar subscription not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }

    const keywords = await radarRepository.latestKeywordsForSubscription(subscription.id, 20);
    const keyword = keywords.find((candidate) => candidate.id === keywordId);
    if (!keyword) {
      return NextResponse.json(
        { error: "Radar keyword not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }

    const feedback = await radarRepository.recordFeedback({
      subscriptionId: subscription.id,
      businessId: business.id,
      scanId: keyword.scanId,
      keywordId: keyword.id,
      feedbackType,
    });
    if (!feedback) {
      throw new Error("Radar feedback insert returned no row");
    }

    return NextResponse.json({ data: { id: feedback.id, feedbackType }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid radar feedback request", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("POST /api/radar/feedback error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
