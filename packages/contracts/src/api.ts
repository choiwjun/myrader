/**
 * X-SAG Contracts — API Request / Response Schemas (TRD § 7.1)
 *
 * 5 API contracts:
 *   1. POST /v1/analyze         → AnalyzeRequest / AnalyzeResponse
 *   2. GET  /v1/reports/:id     → GetReportResponse (= DiagnosisJson when completed)
 *   3. POST /v1/snippets        → CreateSnippetRequest / CreateSnippetResponse
 *   4. POST /v1/prescriptions   → CreatePrescriptionRequest / CreatePrescriptionResponse
 *   5. GET  /v1/reports/:id/pdf → GetReportPdfResponse (binary — headers only)
 *
 * Platform source detection: PLATFORM_DIAGNOSIS_SCOPE.md
 *
 * Import: import { AnalyzeRequestSchema, detectSourceType, ... } from "@boina/contracts/api";
 */

import { z } from "zod";
import {
  ActionTypeSchema,
  CategorySchema,
  IndustryIdSchema,
  ReportStatusSchema,
  SourceTypeSchema,
  type SourceType,
  SnippetTypeSchema,
} from "./enums.js";
import { DiagnosisJsonSchema } from "./diagnosis.js";

export { SourceTypeSchema } from "./enums.js";
export type { SourceType } from "./enums.js";

// ---------------------------------------------------------------------------
// Platform/source detection
// All subdomains are covered by the regex pattern check.
// ---------------------------------------------------------------------------

/** Historical SNS domains. They are no longer blanket-blocked for diagnosis. */
export const BLOCKED_SNS_DOMAINS: readonly string[] = [
  "instagram.com",
  "blog.naver.com",
  "cafe.naver.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "threads.net",
  "facebook.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "linkedin.com",
] as const;

function hostnameMatches(hostname: string, domain: string) {
  const pattern = new RegExp(`^(.+\\.)?${domain.replace(/\./g, "\\.")}$`);
  return pattern.test(hostname);
}

export function detectSourceType(url: string): SourceType {
  let parsed: URL;
  try {
    parsed = new URL(normalizeWebsiteUrlInput(url));
  } catch {
    return "website";
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  if (hostnameMatches(hostname, "blog.naver.com")) return "naver_blog";
  if (
    hostnameMatches(hostname, "place.naver.com") ||
    hostnameMatches(hostname, "map.naver.com") ||
    hostnameMatches(hostname, "booking.naver.com") ||
    hostnameMatches(hostname, "naver.me")
  ) {
    return "naver_place";
  }
  if (
    hostnameMatches(hostname, "instagram.com") ||
    hostnameMatches(hostname, "threads.net")
  ) {
    return "instagram";
  }
  if (
    hostnameMatches(hostname, "place.map.kakao.com") ||
    hostnameMatches(hostname, "map.kakao.com") ||
    hostnameMatches(hostname, "pf.kakao.com")
  ) {
    return "kakao_place";
  }
  if (hostnameMatches(hostname, "youtube.com") || hostnameMatches(hostname, "youtu.be")) {
    return "youtube";
  }
  if (hostnameMatches(hostname, "facebook.com")) return "facebook";
  if (
    BLOCKED_SNS_DOMAINS.some((domain) => hostnameMatches(hostname, domain)) ||
    hostnameMatches(hostname, "maps.google.com") ||
    hostnameMatches(hostname, "catchtable.co.kr") ||
    hostnameMatches(hostname, "tabling.co.kr") ||
    pathname.includes("/place/")
  ) {
    return "other_platform";
  }
  return "website";
}

/**
 * Blocked medical industry labels (POLICY § 5.1).
 * These are matched against the `industry` field (case-insensitive).
 */
export const BLOCKED_MEDICAL_LABELS: readonly string[] = [
  "병원",
  "의원",
  "한의원",
  "치과",
  "의료기관",
  "약국",
  "성형외과",
  "피부과",
  "안과",
  "산부인과",
  "소아과",
  "정신건강의학과",
] as const;

/**
 * Legacy helper retained for older call sites. Platform URLs are now valid
 * diagnosis inputs, so this no longer blanket-blocks SNS/blog/place domains.
 */
export function isSnsBlocked(url: string): boolean {
  void url;
  return false;
}

/**
 * Returns true if the industry string contains a blocked medical label.
 * Case-insensitive substring match (POLICY § 5.1).
 */
export function isMedicalBlocked(industry: string): boolean {
  const lower = industry.toLowerCase();
  return BLOCKED_MEDICAL_LABELS.some((label) => lower.includes(label));
}

export function normalizeWebsiteUrlInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("UNSUPPORTED_PROTOCOL");
  }
  parsed.hash = "";
  return parsed.toString();
}

function isHttpWebsiteUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function hasWebsiteHostname(url: string) {
  try {
    return new URL(url).hostname.includes(".");
  } catch {
    return false;
  }
}

export const WebsiteUrlSchema = z
  .string()
  .min(1, "웹사이트 URL을 입력해주세요.")
  .transform((value, ctx) => {
    try {
      return normalizeWebsiteUrlInput(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "유효한 URL 형식이 아닙니다. 예: example.com",
      });
      return z.NEVER;
    }
  })
  .refine(isHttpWebsiteUrl, {
    message: "http 또는 https URL만 허용됩니다.",
  })
  .refine(hasWebsiteHostname, {
    message: "도메인 형식의 URL을 입력해주세요. 예: example.com",
  });

// ---------------------------------------------------------------------------
// 1. POST /v1/analyze — API-ANALYZE-001
// ---------------------------------------------------------------------------

export const AnalyzeRequestSchema = z.object({
  websiteUrl: WebsiteUrlSchema,
  sourceType: SourceTypeSchema.optional(),
  businessSurfaceUrls: z
    .array(
      z.object({
        sourceType: SourceTypeSchema,
        url: WebsiteUrlSchema,
      })
    )
    .max(8)
    .optional(),
  businessName: z.string().min(1).max(50),
  industry: z.string().min(1),
  region: z.string().min(1),
  mainServices: z.array(z.string().min(1).max(50)).min(1).max(5),
  targetKeywords: z.array(z.string().min(1).max(30)).min(1).max(10),
  competitorUrls: z.array(WebsiteUrlSchema).max(3).optional(),
  modules: z.array(CategorySchema).min(1),
  enableJsRendering: z.boolean().optional().default(false),
  saveProfile: z.boolean().optional().default(false),
  // v0.4 신규 — 산업별 비서 톤 카피 렌더 키 (자유 문자열 industry 와 별개로 유지)
  industryId: IndustryIdSchema.optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AnalyzeResponseSchema = z.object({
  reportId: z.string(),
  status: ReportStatusSchema,
  expectedDurationSec: z.number().int().nonnegative().optional(),
  pollingUrl: z.string().optional(),
  engineVersion: z.string().optional(),
  scoringVersion: z.string().optional(),
  /** Present when returning a cached result */
  cached: z.boolean().optional(),
  cachedAt: z.string().datetime().optional(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

// ---------------------------------------------------------------------------
// 2. GET /v1/reports/:reportId — API-REPORT-GET-001
// ---------------------------------------------------------------------------

/** When status = "running" */
export const ReportProgressSchema = z.object({
  currentStep: z.number().int().nonnegative(),
  totalSteps: z.number().int().positive(),
  stepLabel: z.string(),
  estimatedRemainingSec: z.number().int().nonnegative(),
});
export type ReportProgress = z.infer<typeof ReportProgressSchema>;

/** When status = "running" — polling response */
export const GetReportRunningResponseSchema = z.object({
  reportId: z.string(),
  status: z.literal("running"),
  progress: ReportProgressSchema,
  engineVersion: z.string().optional(),
});
export type GetReportRunningResponse = z.infer<typeof GetReportRunningResponseSchema>;

/** When status = "failed" */
export const GetReportFailedResponseSchema = z.object({
  reportId: z.string(),
  status: z.literal("failed"),
  failureReason: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});
export type GetReportFailedResponse = z.infer<typeof GetReportFailedResponseSchema>;

/**
 * When status = "completed" — the full Diagnosis JSON is returned.
 * (TRD § 7.1 API-REPORT-GET-001: "표준 Diagnosis JSON (§ 7.2) 반환")
 */
export const GetReportResponse = DiagnosisJsonSchema;
export type GetReportResponse = z.infer<typeof GetReportResponse>;

// ---------------------------------------------------------------------------
// 3. POST /v1/snippets — API-SNIPPET-001
// ---------------------------------------------------------------------------

export const FaqEditSchema = z.object({
  q: z.string().min(1),
  a: z.string().min(1),
});

export const CreateSnippetRequestSchema = z.object({
  reportId: z.string().min(1),
  types: z.array(SnippetTypeSchema).min(1),
  userEdits: z
    .record(
      z.string(),
      z.object({
        faqs: z.array(FaqEditSchema).optional(),
      })
    )
    .optional(),
});
export type CreateSnippetRequest = z.infer<typeof CreateSnippetRequestSchema>;

export const SnippetInstallGuideSchema = z.object({
  where: z.string(),
  validatorUrl: z.string().url().optional(),
});

export const GeneratedSnippetSchema = z.object({
  id: z.string(),
  type: SnippetTypeSchema,
  codeFormat: z.string(),
  code: z.string(),
  installLocation: z.string(),
  generatedBy: z.string(),
  aiLabel: z.string().optional(),   // "🤖 AI 생성. 적용 전 검토 필요" (POLICY § 7.2)
  installGuide: SnippetInstallGuideSchema,
});
export type GeneratedSnippet = z.infer<typeof GeneratedSnippetSchema>;

export const CreateSnippetResponseSchema = z.object({
  snippets: z.array(GeneratedSnippetSchema),
});
export type CreateSnippetResponse = z.infer<typeof CreateSnippetResponseSchema>;

// ---------------------------------------------------------------------------
// 4. POST /v1/prescriptions — API-PRESCRIPTION-001
// ---------------------------------------------------------------------------

export const CreatePrescriptionRequestSchema = z.object({
  reportId: z.string().min(1),
  selectedItemIds: z.array(z.string().uuid()).min(1),
  itemsOrder: z.array(z.string().uuid()).optional(),
  renderPdf: z.boolean().optional().default(false),
});
export type CreatePrescriptionRequest = z.infer<typeof CreatePrescriptionRequestSchema>;

/** When renderPdf=true → async (202 Accepted) */
export const CreatePrescriptionAsyncResponseSchema = z.object({
  prescriptionId: z.string(),
  status: z.literal("rendering"),
  pollingUrl: z.string(),
});
export type CreatePrescriptionAsyncResponse = z.infer<typeof CreatePrescriptionAsyncResponseSchema>;

/** When renderPdf=false → immediate (200 OK) */
export const CreatePrescriptionSyncResponseSchema = z.object({
  prescriptionId: z.string(),
  status: z.literal("draft"),
  emailDraft: z.string(),
  itemsCount: z.number().int().nonnegative(),
});
export type CreatePrescriptionSyncResponse = z.infer<typeof CreatePrescriptionSyncResponseSchema>;

export const CreatePrescriptionResponseSchema = z.union([
  CreatePrescriptionAsyncResponseSchema,
  CreatePrescriptionSyncResponseSchema,
]);
export type CreatePrescriptionResponse = z.infer<typeof CreatePrescriptionResponseSchema>;

// ---------------------------------------------------------------------------
// 5. GET /v1/reports/:reportId/pdf — API-REPORT-PDF-001
// Response is binary (application/pdf). This schema describes the HTTP headers.
// ---------------------------------------------------------------------------

/**
 * PDF response metadata (headers only — body is binary stream).
 * Content-Type: application/pdf
 * Content-Disposition: attachment; filename="XSAG_Report_{reportId}.pdf"
 */
export const GetReportPdfHeadersSchema = z.object({
  "content-type": z.literal("application/pdf"),
  "content-disposition": z.string().startsWith("attachment;"),
});
export type GetReportPdfHeaders = z.infer<typeof GetReportPdfHeadersSchema>;

/** When PDF is not yet rendered — 202 Accepted */
export const GetReportPdfAsyncResponseSchema = z.object({
  status: z.literal("rendering"),
  pollingUrl: z.string(),
});
export type GetReportPdfAsyncResponse = z.infer<typeof GetReportPdfAsyncResponseSchema>;

// ---------------------------------------------------------------------------
// Phase R-E — Email Notification, AI Cost Report, CSV Export contracts
// ---------------------------------------------------------------------------

/**
 * Email template identifiers — POLICY § 9 (이메일 알림).
 * Each id is rendered with a fixed subject + html + text body and supports
 * `{{variable}}` substitution.
 */
export const EmailTemplateIdSchema = z.enum([
  "report-completed",
  "report-failed",
  "rediagnose-score-drop",
  "rediagnose-score-up",
  "inquiry-received",
  "billing-receipt",
  "billing-failed",
  "welcome",
]);
export type EmailTemplateId = z.infer<typeof EmailTemplateIdSchema>;

export const EmailProviderNameSchema = z.enum(["resend", "console", "mock"]);
export type EmailProviderName = z.infer<typeof EmailProviderNameSchema>;

/** Email send result returned from an EmailProvider. */
export const EmailResultSchema = z.object({
  messageId: z.string(),
  status: z.enum(["sent", "queued", "failed"]),
  provider: EmailProviderNameSchema,
  sentAt: z.string().datetime(),
  error: z.string().optional(),
});
export type EmailResult = z.infer<typeof EmailResultSchema>;

/**
 * Outbound email notification (sent via Resend / Console / Mock).
 * Either `template` or `html/text` must be provided.
 */
export const EmailNotificationSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().min(1),
  from: z.string().optional(),
  replyTo: z.string().optional(),
  template: z
    .object({
      id: EmailTemplateIdSchema,
      variables: z.record(z.string(), z.unknown()),
    })
    .optional(),
  html: z.string().optional(),
  text: z.string().optional(),
});
export type EmailNotification = z.infer<typeof EmailNotificationSchema>;

// ---------------------------------------------------------------------------
// AI Cost Reports — Admin dashboard (POLICY § 7.2)
// ---------------------------------------------------------------------------

export const AICostDailyPointSchema = z.object({
  /** ISO date (YYYY-MM-DD) */
  date: z.string(),
  totalUsd: z.number().nonnegative(),
  /** Per-provider breakdown for the day. */
  byProvider: z.record(z.string(), z.number().nonnegative()),
});
export type AICostDailyPoint = z.infer<typeof AICostDailyPointSchema>;

export const AICostByProviderEntrySchema = z.object({
  provider: z.string(),
  totalUsd: z.number().nonnegative(),
  callCount: z.number().int().nonnegative(),
  isLocal: z.boolean(),
});
export type AICostByProviderEntry = z.infer<typeof AICostByProviderEntrySchema>;

export const AICostByRuleEntrySchema = z.object({
  ruleId: z.string(),
  totalUsd: z.number().nonnegative(),
  callCount: z.number().int().nonnegative(),
});
export type AICostByRuleEntry = z.infer<typeof AICostByRuleEntrySchema>;

export const AICostBudgetReportSchema = z.object({
  /** Daily budget cap in USD (default $50 — POLICY § 7.2) */
  dailyBudgetUsd: z.number().positive(),
  /** Spent today (USD). */
  spentTodayUsd: z.number().nonnegative(),
  /** dailyBudgetUsd - spentTodayUsd, clamped at 0. */
  remainingUsd: z.number().nonnegative(),
  /** Percentage of budget consumed (0.0–1.0). */
  utilization: z.number().min(0),
  /** Threshold for visual warnings (default 0.9). */
  warningThreshold: z.number().min(0).max(1),
  /** True once utilization ≥ warningThreshold (UI red banner). */
  warning: z.boolean(),
  /** True once spent ≥ budget (fallback mode active). */
  exceeded: z.boolean(),
});
export type AICostBudgetReport = z.infer<typeof AICostBudgetReportSchema>;

/** Aggregated report — top-level shape returned by /v1/admin/ai-costs endpoints when combined. */
export const AICostReportSchema = z.object({
  daily: z.array(AICostDailyPointSchema),
  byProvider: z.array(AICostByProviderEntrySchema),
  byRule: z.array(AICostByRuleEntrySchema),
  budget: AICostBudgetReportSchema,
});
export type AICostReport = z.infer<typeof AICostReportSchema>;

// ---------------------------------------------------------------------------
// CSV Export — /v1/reports/:id/export?format=csv|json (FR-013/014)
// ---------------------------------------------------------------------------

export const ReportExportFormatSchema = z.enum(["csv", "json"]);
export type ReportExportFormat = z.infer<typeof ReportExportFormatSchema>;

// ---------------------------------------------------------------------------
// Phase T-E — In-app Notifications + Action Completion contracts
// ---------------------------------------------------------------------------

export const NotificationTypeSchema = z.enum([
  "report_completed",
  "report_failed",
  "rediagnose_score_drop",
  "rediagnose_score_up",
  "action_completed",
  "inquiry_response",
  "plan_upgraded",
  "plan_grace_period",
  "system_announcement",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationPrioritySchema = z.enum([
  "low",
  "normal",
  "high",
  "urgent",
]);
export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>;

export const NotificationRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  actionUrl: z.string().nullable(),
  resourceType: z.string().nullable(),
  resourceId: z.string().uuid().nullable(),
  priority: NotificationPrioritySchema,
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});
export type NotificationRecord = z.infer<typeof NotificationRecordSchema>;

export const NotificationListResponseSchema = z.object({
  notifications: z.array(NotificationRecordSchema),
  total: z.number().int().nonnegative(),
});
export type NotificationListResponse = z.infer<
  typeof NotificationListResponseSchema
>;

export const NotificationCountResponseSchema = z.object({
  unread: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type NotificationCountResponse = z.infer<
  typeof NotificationCountResponseSchema
>;

// ── Action completions ───────────────────────────────────────────────────────
// NOTE: ActionTypeSchema is defined in "./enums.js". We re-export it from this
// module so that callers using `@boina/contracts/api` can access it directly.

export { ActionTypeSchema } from "./enums.js";
export type { ActionType } from "./enums.js";

export const ActionCompletionUserStatusSchema = z.enum([
  "claimed_done",
  "verified_done",
  "in_progress",
  "skipped",
]);
export type ActionCompletionUserStatus = z.infer<
  typeof ActionCompletionUserStatusSchema
>;

export const ActionCompletionRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  reportId: z.string().uuid(),
  diagnosisItemId: z.string().uuid().nullable(),
  ruleId: z.string(),
  actionType: ActionTypeSchema,
  userStatus: ActionCompletionUserStatusSchema,
  autoVerifiedAt: z.string().datetime().nullable(),
  verifiedByReportId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  claimedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ActionCompletion = z.infer<typeof ActionCompletionRecordSchema>;

export const ClaimActionCompletionRequestSchema = z.object({
  ruleId: z.string().min(1),
  actionType: ActionTypeSchema,
  diagnosisItemId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});
export type ClaimActionCompletionRequest = z.infer<
  typeof ClaimActionCompletionRequestSchema
>;

export const UpdateActionCompletionRequestSchema = z
  .object({
    userStatus: ActionCompletionUserStatusSchema.optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "변경할 필드가 없습니다.",
  });
export type UpdateActionCompletionRequest = z.infer<
  typeof UpdateActionCompletionRequestSchema
>;

export const ActionCompletionListResponseSchema = z.object({
  completions: z.array(ActionCompletionRecordSchema),
});
export type ActionCompletionListResponse = z.infer<
  typeof ActionCompletionListResponseSchema
>;
