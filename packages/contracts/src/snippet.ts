/**
 * X-SAG Contracts — Snippet Model (API I/O)
 *
 * Source: TRD DATA-SNIPPET-001, TRD § 7.1 API-SNIPPET-001.
 * This is the API-level model (not the DB entity).
 *
 * Import: import { SnippetSchema, type Snippet } from "@boina/contracts/snippet";
 */

import { z } from "zod";
import {
  SnippetTypeSchema,
  SnippetCodeFormatSchema,
  SnippetInstallLocationSchema,
  SnippetGeneratedBySchema,
} from "./enums.js";

// ---------------------------------------------------------------------------
// Snippet — API I/O model
// ---------------------------------------------------------------------------

export const SnippetSchema = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid(),
  userId: z.string().uuid(),
  type: SnippetTypeSchema,
  code: z.string().min(1),
  codeFormat: SnippetCodeFormatSchema,
  installLocation: SnippetInstallLocationSchema,
  generatedBy: SnippetGeneratedBySchema,
  aiModel: z.string().nullable(),              // null when generatedBy = "rule"
  isLatest: z.boolean(),
  /**
   * POLICY § 7.2 — all AI-generated snippets carry this flag.
   * When true, the UI must show "🤖 AI 생성. 적용 전 검토 필요".
   */
  isAiGenerated: z.boolean(),
  userEdits: z
    .array(
      z.object({
        editedAt: z.string().datetime(),
        fieldChanged: z.string(),
        previousValue: z.unknown(),
        newValue: z.unknown(),
      })
    )
    .nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Snippet = z.infer<typeof SnippetSchema>;

// ---------------------------------------------------------------------------
// Snippet creation input (internal — worker / core-engine use)
// ---------------------------------------------------------------------------

export const CreateSnippetInputSchema = z.object({
  reportId: z.string().uuid(),
  userId: z.string().uuid(),
  type: SnippetTypeSchema,
  code: z.string().min(1),
  codeFormat: SnippetCodeFormatSchema,
  installLocation: SnippetInstallLocationSchema,
  generatedBy: SnippetGeneratedBySchema,
  aiModel: z.string().nullable(),
  isAiGenerated: z.boolean(),
});
export type CreateSnippetInput = z.infer<typeof CreateSnippetInputSchema>;
