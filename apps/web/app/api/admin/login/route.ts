// @SPEC docs/superpowers/specs/2026-06-17-admin-dashboard-design.md §4.2
// POST /api/admin/login — ADMIN_PASSWORD 검증 후 서명 쿠키 발급.
// 미설정 시 403(ADMIN_DISABLED), 틀린 비번 401, 검증 통과 200.

import {
  adminCookieOptions,
  isAdminConfigured,
  signAdminToken,
  verifyAdminPassword,
} from "@/lib/admin/auth";
import { ADMIN_COOKIE } from "@/lib/auth/cookie-constants";
import { adminLoginLimiter, enforceRateLimit } from "@/lib/shared/api-rate-limit";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const LoginSchema = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    if (!isAdminConfigured()) {
      return NextResponse.json(
        { error: "Admin is not configured", code: "ADMIN_DISABLED", success: false },
        { status: 403 },
      );
    }
    // brute-force 완화: 비번 검증 전에 클라이언트 key(IP/세션) 단위 rate limit(429).
    const limited = enforceRateLimit(request, adminLoginLimiter);
    if (limited) return limited;
    const body = await request.json();
    const { password } = LoginSchema.parse(body);

    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { error: "Invalid credentials", code: "UNAUTHORIZED", success: false },
        { status: 401 },
      );
    }

    const store = await cookies();
    store.set(ADMIN_COOKIE, signAdminToken(), adminCookieOptions());
    return NextResponse.json({ data: { ok: true }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/login error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
