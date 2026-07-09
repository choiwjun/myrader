import { diagnoseCreatorArticle } from "@/lib/creator/service";
import { NextResponse } from "next/server";
import { diagnosisSchema, readJson, validationError } from "../_shared";

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = diagnosisSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const data = await diagnoseCreatorArticle(parsed.data);
  return NextResponse.json({ success: true, data }, { status: 201 });
}
