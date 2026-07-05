import { z } from "zod";

export const RadarSubscriptionStatusSchema = z.enum([
  "inactive",
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
]);
export type RadarSubscriptionStatus = z.infer<typeof RadarSubscriptionStatusSchema>;

export const RadarScanTriggerSchema = z.enum(["auto", "manual", "preview"]);
export type RadarScanTrigger = z.infer<typeof RadarScanTriggerSchema>;

export const RadarScanStatusSchema = z.enum([
  "queued",
  "expanding",
  "scoring",
  "probing",
  "done",
  "partial",
  "skipped",
  "failed",
]);
export type RadarScanStatus = z.infer<typeof RadarScanStatusSchema>;

export const RadarKeywordVerdictSchema = z.enum(["now", "good", "normal", "watch"]);
export type RadarKeywordVerdict = z.infer<typeof RadarKeywordVerdictSchema>;

export const RadarFeedbackTypeSchema = z.enum(["used", "not_yet", "dismissed", "irrelevant"]);
export type RadarFeedbackType = z.infer<typeof RadarFeedbackTypeSchema>;

export const RadarNaverEvidenceSchema = z.object({
  volume: z.number().int().nonnegative().nullable(),
  docs: z.number().int().nonnegative().nullable(),
  saturation: z.number().nonnegative().nullable(),
  trend7d: z.number().nullable(),
  checkedAt: z.string().datetime(),
});
export type RadarNaverEvidence = z.infer<typeof RadarNaverEvidenceSchema>;

export const RadarAiEvidenceSchema = z
  .object({
    probeSummary: z.string().optional(),
    citedSources: z.array(z.string()).optional(),
    blogGap: z.string().optional(),
    checkedAt: z.string().datetime().optional(),
  })
  .catchall(z.unknown());
export type RadarAiEvidence = z.infer<typeof RadarAiEvidenceSchema>;

export const RadarKeywordSchema = z.object({
  id: z.string().uuid(),
  scanId: z.string().uuid(),
  text: z.string().min(1),
  clusterId: z.string().min(1),
  freq: z.number().int().nonnegative(),
  hop: z.number().int().nonnegative(),
  viaToken: z.string().nullable(),
  naverScore: z.number().int().min(0).max(100).nullable(),
  naverEvidence: RadarNaverEvidenceSchema.nullable(),
  aiScore: z.number().int().min(0).max(100).nullable(),
  aiEvidence: RadarAiEvidenceSchema.nullable(),
  verdict: RadarKeywordVerdictSchema,
});
export type RadarKeyword = z.infer<typeof RadarKeywordSchema>;
