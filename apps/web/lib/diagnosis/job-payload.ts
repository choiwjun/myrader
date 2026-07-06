import {
  type Category,
  CategorySchema,
  type SourceType,
  SourceTypeSchema,
} from "@boina/contracts/enums";
import { z } from "zod";
import type { BusinessRecord } from "../business/business-service.js";
import { placeUrlFromNaverPlaceId } from "../business/business-service.js";

export const DEFAULT_DIAGNOSIS_MODULES = [
  "seo",
  "aeo",
  "geo",
] as const satisfies readonly Category[];

export const DiagnosisBusinessProfileSchema = z.object({
  businessName: z.string().min(1).max(50),
  industry: z.string().min(1),
  region: z.string().min(1),
  mainServices: z.array(z.string().max(50)).min(1).max(5),
  targetKeywords: z.array(z.string().max(30)).min(1).max(10),
});

export type DiagnosisBusinessProfile = z.infer<typeof DiagnosisBusinessProfileSchema>;

export const DiagnosisJobPayloadSchema = z.object({
  diagnosisId: z.string().uuid(),
  businessId: z.string().uuid(),
  target: z.string().url().max(2048),
  sourceType: SourceTypeSchema.optional(),
  businessProfile: DiagnosisBusinessProfileSchema,
  modules: z.array(CategorySchema).min(1),
  requestLlmValidation: z.boolean().optional(),
  competitorUrls: z.array(z.string().url().max(2048)).max(10).optional(),
});

export type DiagnosisJobPayload = z.infer<typeof DiagnosisJobPayloadSchema>;

export interface DiagnosisTargetSelectionInput {
  homepageUrl?: string | null;
  naverPlaceId?: string | null;
  fallbackTarget?: string | null;
  fallbackSourceType?: SourceType | null;
}

export interface DiagnosisTargetSelection {
  target: string;
  sourceType: SourceType;
}

export function resolveDiagnosisTarget(
  input: DiagnosisTargetSelectionInput,
): DiagnosisTargetSelection {
  const homepageUrl = input.homepageUrl?.trim();
  if (homepageUrl) {
    return { target: homepageUrl, sourceType: "website" };
  }

  const placeUrl = placeUrlFromNaverPlaceId(input.naverPlaceId?.trim() ?? null);
  if (placeUrl) {
    return { target: placeUrl, sourceType: "naver_place" };
  }

  const fallbackTarget = input.fallbackTarget?.trim();
  if (fallbackTarget) {
    return {
      target: fallbackTarget,
      sourceType: input.fallbackSourceType ?? detectFallbackSourceType(fallbackTarget),
    };
  }

  throw new Error("diagnosis target could not be resolved");
}

export interface BuildDiagnosisJobPayloadInput {
  diagnosisId: string;
  business: Pick<BusinessRecord, "id" | "homepageUrl" | "naverPlaceId">;
  businessProfile: DiagnosisBusinessProfile;
  modules?: readonly Category[];
  requestLlmValidation?: boolean;
  competitorUrls?: string[];
  fallbackTarget?: string | null;
  fallbackSourceType?: SourceType | null;
}

export function buildDiagnosisJobPayload(
  input: BuildDiagnosisJobPayloadInput,
): DiagnosisJobPayload {
  const target = resolveDiagnosisTarget({
    homepageUrl: input.business.homepageUrl,
    naverPlaceId: input.business.naverPlaceId,
    fallbackTarget: input.fallbackTarget,
    fallbackSourceType: input.fallbackSourceType,
  });

  return DiagnosisJobPayloadSchema.parse({
    diagnosisId: input.diagnosisId,
    businessId: input.business.id,
    target: target.target,
    sourceType: target.sourceType,
    businessProfile: input.businessProfile,
    modules: input.modules ?? [...DEFAULT_DIAGNOSIS_MODULES],
    requestLlmValidation: input.requestLlmValidation ?? false,
    ...(input.competitorUrls && input.competitorUrls.length > 0
      ? { competitorUrls: input.competitorUrls }
      : {}),
  });
}

export function parseStoredDiagnosisJobPayload(value: unknown): DiagnosisJobPayload | null {
  const parsed = DiagnosisJobPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function detectFallbackSourceType(target: string): SourceType {
  try {
    const host = new URL(target).hostname.toLowerCase();
    if (host === "place.naver.com" || host.endsWith(".place.naver.com")) return "naver_place";
  } catch {
    // ignore and fall back to website
  }
  return "website";
}
