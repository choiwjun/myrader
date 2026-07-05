/**
 * X-SAG Contracts — Enumerations
 *
 * All domain enums derived from POLICY.md, PRD.md § 11, and SCREEN_SPEC.md § A.1.
 * Import: import { RoleSchema, type Role, ... } from "@boina/contracts/enums";
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Role — POLICY § 2.1
// ---------------------------------------------------------------------------
export const RoleSchema = z.enum([
  "guest",
  "member-free",
  "member-basic",
  "member-pro",
  "member-business",
  "admin",
  "api-client",
]);
export type Role = z.infer<typeof RoleSchema>;

// ---------------------------------------------------------------------------
// Plan — POLICY § 6
// ---------------------------------------------------------------------------
export const PlanSchema = z.enum(["free", "basic", "pro", "business"]);
export type Plan = z.infer<typeof PlanSchema>;

// ---------------------------------------------------------------------------
// Category — PRD § 2 (G1-G3), TRD § 7.2
// a11y / backlink / perf are informational-only (score-neutral) — PLAN_RULE_ACTIVATION § 4.4
// perf: Lighthouse CWV (informational, thresholds uncalibrated for Korean SMBs, default off)
// ---------------------------------------------------------------------------
export const CategorySchema = z.enum(["seo", "aeo", "geo", "a11y", "backlink", "perf"]);
export type Category = z.infer<typeof CategorySchema>;

// ---------------------------------------------------------------------------
// ActionType — PRD § 12, TRD DATA-ACTIONTYPE-001
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// SourceType — primary diagnosis surface classification (DL-128)
// ---------------------------------------------------------------------------
export const SourceTypeSchema = z.enum([
  "website",
  "naver_place",
  "naver_blog",
  "instagram",
  "kakao_place",
  "youtube",
  "facebook",
  "other_platform",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const ActionTypeSchema = z.enum([
  "self_fix",
  "snippet_action",
  "vendor_action",
  "si_action",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

// ---------------------------------------------------------------------------
// Priority — TRD DATA-ITEM-001
// ---------------------------------------------------------------------------
export const PrioritySchema = z.enum(["high", "medium", "low"]);
export type Priority = z.infer<typeof PrioritySchema>;

// ---------------------------------------------------------------------------
// Difficulty — TRD DATA-ITEM-001 (easy/medium/hard in DB; mapped to low/medium/high in contract)
// Note: TRD § 7.2 items.difficulty uses 'easy' | 'medium' | 'hard'
// ---------------------------------------------------------------------------
export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

// ---------------------------------------------------------------------------
// Impact — Work Order spec (low/medium/high for expected impact)
// ---------------------------------------------------------------------------
export const ImpactSchema = z.enum(["low", "medium", "high"]);
export type Impact = z.infer<typeof ImpactSchema>;

// ---------------------------------------------------------------------------
// ScoreTier — TRD § 7.2 scores.grade (POLICY § 11.1, renamed to match TRD literal)
// very_low: 0-39, low: 40-59, ok: 60-79, good: 80-100
// TRD uses 'poor' | 'low' | 'fair' | 'good' — we expose both aliases
// ---------------------------------------------------------------------------
export const ScoreTierSchema = z.enum(["very_low", "low", "ok", "good"]);
export type ScoreTier = z.infer<typeof ScoreTierSchema>;

/** Canonical grade labels used inside Diagnosis JSON (TRD § 7.2 scores.grade). */
export const GradeSchema = z.enum(["poor", "low", "fair", "good"]);
export type Grade = z.infer<typeof GradeSchema>;

// ---------------------------------------------------------------------------
// ReportStatus — TRD DATA-REPORT-001
// ---------------------------------------------------------------------------
export const ReportStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "partial",
  "canceled",
  "timeout",
]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

// ---------------------------------------------------------------------------
// CrawlFailureReason — TRD § 7.3 (status field, not HTTP code)
// ---------------------------------------------------------------------------
export const CrawlFailureReasonSchema = z.enum([
  "DNS_FAILED",
  "CONNECTION_REFUSED",
  "HTTP_5xx",
  "HTTP_4xx",
  "ROBOTS_BLOCK_ALL",
  "TIMEOUT",
  "JS_RENDER_FAILED",
]);
export type CrawlFailureReason = z.infer<typeof CrawlFailureReasonSchema>;

// ---------------------------------------------------------------------------
// SnippetType — TRD DATA-SNIPPET-001
// ---------------------------------------------------------------------------
export const SnippetTypeSchema = z.enum([
  "LOCAL_BUSINESS",
  "ORGANIZATION",
  "SERVICE",
  "FAQ_SCHEMA",
  "BREADCRUMB",
  "LLMS_TXT",
  "FAQ_HTML",
]);
export type SnippetType = z.infer<typeof SnippetTypeSchema>;

// ---------------------------------------------------------------------------
// InquiryType — TRD DATA-INQUIRY-001 (mapped to Work Order identifiers)
// ---------------------------------------------------------------------------
export const InquiryTypeSchema = z.enum([
  "homepage_improvement",
  "landing_creation",
  "schema_install",
  "llms_txt",
  "structure_improvement",
  "maintenance",
]);
export type InquiryType = z.infer<typeof InquiryTypeSchema>;

// ---------------------------------------------------------------------------
// InquiryStatus — TRD DATA-INQUIRY-001 / POLICY § 10.1
// ---------------------------------------------------------------------------
// Note: Aligned with DB enum & TRD § 6.2 → `under_review` (was `reviewing` in v0.1 draft)
export const InquiryStatusSchema = z.enum([
  "received",
  "under_review",
  "consulted",
  "proposed",
  "contracted",
  "on_hold",
]);
export type InquiryStatus = z.infer<typeof InquiryStatusSchema>;

// ---------------------------------------------------------------------------
// SnippetCodeFormat — TRD DATA-SNIPPET-001
// ---------------------------------------------------------------------------
export const SnippetCodeFormatSchema = z.enum(["json-ld", "html", "plain-text"]);
export type SnippetCodeFormat = z.infer<typeof SnippetCodeFormatSchema>;

// ---------------------------------------------------------------------------
// SnippetInstallLocation — TRD DATA-SNIPPET-001
// ---------------------------------------------------------------------------
export const SnippetInstallLocationSchema = z.enum([
  "head",
  "body-start",
  "body-end",
  "root-file",
]);
export type SnippetInstallLocation = z.infer<typeof SnippetInstallLocationSchema>;

// ---------------------------------------------------------------------------
// SnippetGeneratedBy — TRD DATA-SNIPPET-001
// ---------------------------------------------------------------------------
export const SnippetGeneratedBySchema = z.enum(["rule", "ai", "hybrid"]);
export type SnippetGeneratedBy = z.infer<typeof SnippetGeneratedBySchema>;

// ---------------------------------------------------------------------------
// IndustryId — 산업 카테고리 (FR-026, DL-041) — v0.4
// ---------------------------------------------------------------------------
export const IndustryIdSchema = z.enum([
  "cafe",
  "restaurant",
  "clinic",
  "academy",
  "salon",
  "workshop",
  "retail",
  "general",
]);
export type IndustryId = z.infer<typeof IndustryIdSchema>;

// ---------------------------------------------------------------------------
// HealthBand — SCREEN-004 v2.0 4단계 건강 라벨 (DL-041) — v0.4
// ---------------------------------------------------------------------------
export const HealthBandSchema = z.enum(["good", "fair", "weak", "poor"]);
export type HealthBand = z.infer<typeof HealthBandSchema>;

// ---------------------------------------------------------------------------
// CategoryMetaphor — 풀어쓴 카테고리 메타포 4묶음 (DL-042) — v0.4
// ---------------------------------------------------------------------------
export const CategoryMetaphorSchema = z.enum(["seo", "aeo", "geo", "self"]);
export type CategoryMetaphor = z.infer<typeof CategoryMetaphorSchema>;
