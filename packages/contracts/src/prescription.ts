/**
 * X-SAG Contracts — PrescriptionDocument Model (API I/O)
 *
 * Source: TRD DATA-PRESCRIPTION-001, TRD § 7.1 API-PRESCRIPTION-001.
 * This is the API-level model (not the DB entity).
 *
 * Import: import { PrescriptionDocumentSchema, type PrescriptionDocument } from "@boina/contracts/prescription";
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// PrescriptionItem — individual item in a prescription
// ---------------------------------------------------------------------------

export const PrescriptionItemSchema = z.object({
  itemId: z.string().uuid(),
  position: z.number().int().nonnegative(),   // display order (0-indexed)
});
export type PrescriptionItem = z.infer<typeof PrescriptionItemSchema>;

// ---------------------------------------------------------------------------
// PrescriptionDocument — full API I/O model
// ---------------------------------------------------------------------------

export const PrescriptionDocumentSchema = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid(),
  userId: z.string().uuid(),
  selectedItemIds: z.array(z.string().uuid()).min(1),
  itemsOrder: z.array(PrescriptionItemSchema),
  pdfUrl: z.string().url().nullable(),
  pdfGeneratedAt: z.string().datetime().nullable(),
  emailDraft: z.string().min(1),
  pdfSizeBytes: z.number().int().nonnegative().nullable(),
  pdfPageCount: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PrescriptionDocument = z.infer<typeof PrescriptionDocumentSchema>;

// ---------------------------------------------------------------------------
// PrescriptionStatus — polling model
// ---------------------------------------------------------------------------

export const PrescriptionStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "rendering", "ready", "failed"]),
  pdfUrl: z.string().url().nullable(),
  emailDraft: z.string().nullable(),
  itemsCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type PrescriptionStatus = z.infer<typeof PrescriptionStatusSchema>;
