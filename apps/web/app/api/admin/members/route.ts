import { type MemberStatus, listMembers } from "@/lib/admin/members";
// @SPEC docs/superpowers/specs/2026-06-17-admin-member-management-design.md §5
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import { adminMembersLimiter, enforceRateLimit } from "@/lib/shared/api-rate-limit";
import { createDb } from "@boina/db/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", success: false },
      { status: 401 },
    );
  }
  const limited = enforceRateLimit(request, adminMembersLimiter);
  if (limited) return limited;
  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ error: "DB unavailable", success: false }, { status: 503 });
  const sp = new URL(request.url).searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? "20") || 20, 100);
  const offset = Math.max(Number(sp.get("offset") ?? "0") || 0, 0);
  const statusParam = sp.get("status");
  const status = (["active", "blocked", "deleted"] as const).includes(statusParam as MemberStatus)
    ? (statusParam as MemberStatus)
    : undefined;
  const res = await listMembers(createDb(url), {
    q: sp.get("q") ?? undefined,
    plan: sp.get("plan") ?? undefined,
    status,
    limit,
    offset,
  });
  return NextResponse.json({ data: res, success: true });
}
