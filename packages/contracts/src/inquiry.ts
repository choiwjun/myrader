/**
 * X-SAG Contracts — Inquiry Schemas (creation + status change)
 *
 * Source: TRD DATA-INQUIRY-001, POLICY § 10.1.
 *
 * Import: import { CreateInquirySchema, type CreateInquiry, ... } from "@boina/contracts/inquiry";
 */

import { z } from "zod";
import { InquiryTypeSchema, InquiryStatusSchema } from "./enums.js";

// ---------------------------------------------------------------------------
// CreateInquiry — what the user submits (FR-014)
// ---------------------------------------------------------------------------

export const CreateInquirySchema = z.object({
  /** Authenticated user ID (optional — guest can submit). */
  userId: z.string().uuid().optional(),
  /** Associated report (optional). */
  reportId: z.string().uuid().nullable().optional(),

  /** Guest-only fields — required when userId is absent. */
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().max(20).optional(),

  inquiryType: InquiryTypeSchema,
  message: z.string().min(20).max(1000),
  preferredContact: z.enum(["email", "phone"]),
});
export type CreateInquiry = z.infer<typeof CreateInquirySchema>;

// ---------------------------------------------------------------------------
// InquiryResponse — what the API returns after creation
// ---------------------------------------------------------------------------

export const InquiryResponseSchema = z.object({
  id: z.string().uuid(),
  status: InquiryStatusSchema,
  createdAt: z.string().datetime(),
});
export type InquiryResponse = z.infer<typeof InquiryResponseSchema>;

// ---------------------------------------------------------------------------
// InquiryRecord — full admin-visible record
// ---------------------------------------------------------------------------

export const InquiryRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  reportId: z.string().uuid().nullable(),
  guestEmail: z.string().email().nullable(),
  guestPhone: z.string().nullable(),
  inquiryType: InquiryTypeSchema,
  message: z.string(),
  preferredContact: z.enum(["email", "phone"]),
  status: InquiryStatusSchema,
  internalMemo: z.string().nullable(),
  respondedAt: z.string().datetime().nullable(),
  firstResponseSlaMet: z.boolean().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type InquiryRecord = z.infer<typeof InquiryRecordSchema>;

// ---------------------------------------------------------------------------
// UpdateInquiryStatus — admin status transition
// ---------------------------------------------------------------------------

export const UpdateInquiryStatusSchema = z.object({
  status: InquiryStatusSchema,
  internalMemo: z.string().max(2000).optional(),
});
export type UpdateInquiryStatus = z.infer<typeof UpdateInquiryStatusSchema>;
