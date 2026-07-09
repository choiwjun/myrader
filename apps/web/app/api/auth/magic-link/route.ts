import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, code: "VALIDATION_ERROR", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { success: false, code: "AUTH_PROVIDER_NOT_CONFIGURED" },
      { status: 501 },
    );
  }
  return NextResponse.json({ success: true, data: { email: parsed.data.email, sent: true } });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
