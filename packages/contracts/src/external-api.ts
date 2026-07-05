/**
 * X-SAG Contracts — External API schemas (FR-020, TRD § 7.4)
 *
 * External partner API schemas:
 *   - ExternalAnalyzeRequest   — POST /v1/external/analyze
 *   - ExternalAnalyzeResponse  — 202 Accepted response
 *   - WebhookPayload           — async delivery on report.completed / failed / partial
 *   - Webhook HMAC-SHA256 helpers (generateWebhookSignature / verifyWebhookSignature)
 *
 * Import: import { ExternalAnalyzeRequestSchema, verifyWebhookSignature } from "@boina/contracts/external-api";
 */

import { z } from "zod";
import { AnalyzeRequestSchema } from "./api.js";
import { DiagnosisJsonSchema } from "./diagnosis.js";

// ---------------------------------------------------------------------------
// External Analyze Request (FR-020, POLICY § 9.2)
// ---------------------------------------------------------------------------

/**
 * External API diagnosis request.
 * Extends the internal AnalyzeRequest with:
 *   - customerKey   — partner-side customer identifier (opaque to X-SAG)
 *   - webhookUrl    — async completion webhook (optional, URL-validated)
 *   - whitelabel    — brand customization (optional)
 */
export const ExternalAnalyzeRequestSchema = AnalyzeRequestSchema.extend({
  /** Partner's opaque customer identifier — stored in report metadata. */
  customerKey: z.string().min(1).max(200).optional(),

  /**
   * Webhook URL for async completion notification (POLICY § 9.2).
   * If present, a webhook job is enqueued after report completion.
   * The URL must be HTTPS in production; http is allowed for dev/testing.
   */
  webhookUrl: z.string().url("Webhook URL must be a valid URL.").optional(),

  /**
   * White-label branding metadata accepted from external partners.
   * All fields are optional; PDF rendering consumes these settings in its own pipeline.
   */
  whitelabel: z
    .object({
      brandName: z.string().min(1).max(100).optional(),
      brandColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "brandColor must be a 6-digit hex color (e.g. #1A2B3C).")
        .optional(),
      logoUrl: z.string().url("logoUrl must be a valid URL.").optional(),
    })
    .optional(),
});

export type ExternalAnalyzeRequest = z.infer<typeof ExternalAnalyzeRequestSchema>;

// ---------------------------------------------------------------------------
// External Analyze Response (202 Accepted)
// ---------------------------------------------------------------------------

export const ExternalAnalyzeResponseSchema = z.object({
  reportId: z.string().uuid(),
  status: z.literal("queued"),
  /** Estimated processing time in seconds (POLICY § 9.3 ≤ 5 min SLA). */
  etaSeconds: z.number().int().nonnegative(),
  /** Polling URL to check report status. */
  pollingUrl: z.string(),
  /**
   * Whether the provided webhookUrl passed URL validation.
   * If webhookUrl was omitted, this is false.
   */
  webhookConfirmed: z.boolean(),
});

export type ExternalAnalyzeResponse = z.infer<typeof ExternalAnalyzeResponseSchema>;

// ---------------------------------------------------------------------------
// External Report / PDF / Usage Responses
// ---------------------------------------------------------------------------

export const ExternalReportRunningResponseSchema = z.object({
  reportId: z.string(),
  status: z.enum(["queued", "running"]),
  message: z.string(),
  pollingUrl: z.string(),
});

export const ExternalReportFailedResponseSchema = z.object({
  reportId: z.string(),
  status: z.literal("failed"),
  failureReason: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

export const ExternalReportCompletedResponseSchema = z.object({
  reportId: z.string(),
  status: z.enum(["completed", "partial"]),
  websiteUrl: z.string(),
  overallScore: z.number().nullable().optional(),
  seoScore: z.number().nullable().optional(),
  aeoScore: z.number().nullable().optional(),
  geoScore: z.number().nullable().optional(),
  rawJsonUrl: z.string().nullable().optional(),
  completedAt: z.string().nullable(),
  engineVersion: z.string(),
  scoringVersion: z.string(),
});

export const ExternalReportResponseSchema = z.union([
  ExternalReportRunningResponseSchema,
  ExternalReportFailedResponseSchema,
  ExternalReportCompletedResponseSchema,
]);

export type ExternalReportResponse = z.infer<typeof ExternalReportResponseSchema>;

export const ExternalPdfAvailableResponseSchema = z.object({
  status: z.literal("available"),
  message: z.string().optional(),
  jobId: z.string().optional(),
  pdfUrl: z.string().optional(),
  pdfSizeBytes: z.number().nullable().optional(),
  pollingUrl: z.string().optional(),
});

export const ExternalPdfPendingResponseSchema = z.object({
  status: z.enum(["not_ready", "rendering"]),
  message: z.string(),
  jobId: z.string().optional(),
  pollingUrl: z.string(),
});

export const ExternalPdfResponseSchema = z.union([
  ExternalPdfAvailableResponseSchema,
  ExternalPdfPendingResponseSchema,
]);

export type ExternalPdfResponse = z.infer<typeof ExternalPdfResponseSchema>;

export const ExternalUsageResponseSchema = z.object({
  apiClientId: z.string(),
  clientName: z.string(),
  apiKeyPrefix: z.string(),
  status: z.enum(["active", "suspended", "revoked"]),
  usage: z.object({
    monthlyQuota: z.number().int().nonnegative(),
    monthlyUsed: z.number().int().nonnegative(),
    monthlyRemaining: z.number().int().nonnegative(),
    rateLimitPerMin: z.number().int().nonnegative(),
    resetAt: z.string(),
  }),
  webhookUrl: z.string().nullable(),
  createdAt: z.string(),
});

export type ExternalUsageResponse = z.infer<typeof ExternalUsageResponseSchema>;

// ---------------------------------------------------------------------------
// Webhook Payload (POLICY § 9.2)
// ---------------------------------------------------------------------------

export const WebhookEventSchema = z.enum([
  "report.completed",
  "report.failed",
  "report.partial",
]);

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

/**
 * Webhook payload delivered to the partner's webhookUrl.
 *
 * HTTP headers added by webhook-dispatcher:
 *   Content-Type:    application/json
 *   X-XSAG-Signature: <hex HMAC-SHA256 of body>
 *   X-XSAG-Event:    <event>
 */
export const WebhookPayloadSchema = z.object({
  event: WebhookEventSchema,
  reportId: z.string().uuid(),
  /** ISO-8601 UTC timestamp of the event. */
  timestamp: z.string().datetime(),
  /**
   * Full Diagnosis JSON — present only when event = "report.completed".
   * Omitted for failed / partial events to keep payload small.
   */
  data: DiagnosisJsonSchema.optional(),
  /** Human-readable failure reason — present when event = "report.failed". */
  reason: z.string().optional(),
  /** Partner's opaque customer key, echoed from the original request. */
  customerKey: z.string().optional(),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// ---------------------------------------------------------------------------
// Webhook HMAC-SHA256 helpers (POLICY § 9.2)
// ---------------------------------------------------------------------------

/**
 * Generate an HMAC-SHA256 signature over the JSON body string.
 *
 * The result is a lowercase hex string.
 * Used by webhook-dispatcher when sending; shared with partners for verification.
 *
 * @param body   - Raw request body string (JSON.stringify of WebhookPayload)
 * @param secret - Per-client webhook secret stored in api_clients.webhookSecret
 */
export function generateWebhookSignature(body: string, secret: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Verify a webhook signature from an incoming request.
 *
 * Compare the X-XSAG-Signature header against the locally computed HMAC.
 * Uses a constant-time comparison to prevent timing attacks.
 *
 * @param body      - Raw request body string
 * @param signature - Value from X-XSAG-Signature header (hex)
 * @param secret    - Per-client webhook secret
 * @returns true if the signature matches; false otherwise
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  // timingSafeEqual requires equal-length Buffers
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    // If lengths differ, timingSafeEqual throws — treat as invalid
    return false;
  }
}
