import { NextResponse } from "next/server";
import { z } from "zod";

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function validationError(error: z.ZodError) {
  return NextResponse.json(
    { success: false, code: "VALIDATION_ERROR", issues: error.issues },
    { status: 400 },
  );
}

export const topicSchema = z.object({
  topic: z.string().trim().min(1),
  channelUrl: z.string().url().optional(),
});

export const lookupSchema = z.object({
  keyword: z.string().trim().min(1),
  includeAi: z.boolean().optional(),
});

export const diagnosisSchema = z.object({
  url: z.string().url(),
});
