import { getMemberDetail } from "@/lib/admin/members";
// @SPEC docs/superpowers/specs/2026-06-17-admin-member-management-design.md §5
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import { getDefaultAccountRepository } from "@/lib/auth/account-repository";
import { adminMembersLimiter, enforceRateLimit } from "@/lib/shared/api-rate-limit";
import { createDb } from "@boina/db/client";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();
const PlanSchema = z.enum(["free", "basic", "pro", "business"]);
const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setPlan"), plan: PlanSchema }),
  z.object({ action: z.literal("block") }),
  z.object({ action: z.literal("unblock") }),
  z.object({ action: z.literal("forceLogout") }),
  z.object({ action: z.literal("softDelete") }),
  z.object({ action: z.literal("restore") }),
]);

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized", code: "UNAUTHORIZED", success: false },
    { status: 401 },
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return unauthorized();
  const limited = enforceRateLimit(request, adminMembersLimiter);
  if (limited) return limited;
  const { id } = await params;
  if (!IdSchema.safeParse(id).success)
    return NextResponse.json(
      { error: "Not found", code: "NOT_FOUND", success: false },
      { status: 404 },
    );
  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ error: "DB unavailable", success: false }, { status: 503 });
  const detail = await getMemberDetail(createDb(url), id);
  if (!detail) {
    return NextResponse.json(
      { error: "Not found", code: "NOT_FOUND", success: false },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: detail, success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAdminAuthenticated())) return unauthorized();
    const limited = enforceRateLimit(request, adminMembersLimiter);
    if (limited) return limited;
    const { id } = await params;
    if (!IdSchema.safeParse(id).success)
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: "DB unavailable", success: false }, { status: 503 });
    }
    const input = ActionSchema.parse(await request.json());
    const repo = getDefaultAccountRepository();

    let changed = false;
    switch (input.action) {
      case "setPlan":
        changed = await repo.setPlan(id, input.plan);
        break;
      case "block":
        changed = await repo.setBlocked(id, true);
        break;
      case "unblock":
        changed = await repo.setBlocked(id, false);
        break;
      case "forceLogout":
        changed = await repo.revokeSessions(id);
        break;
      case "softDelete":
        changed = await repo.setDeleted(id, true);
        break;
      case "restore":
        changed = await repo.setDeleted(id, false);
        break;
    }
    if (!changed) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: { ok: true }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("PATCH /api/admin/members/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
