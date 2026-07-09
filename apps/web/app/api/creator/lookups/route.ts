import { lookupCreatorKeyword } from "@/lib/creator/service";
import { NextResponse } from "next/server";
import { lookupSchema, readJson, validationError } from "../_shared";

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const data = await lookupCreatorKeyword(parsed.data);
  return NextResponse.json({ success: true, data }, { status: 201 });
}
