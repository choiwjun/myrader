// @TASK P1-R1 - 로그인 엔드포인트 (세션 발급)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비민감)
// @SPEC .claude/constitutions/nextjs/auth.md (단일 인증)
// @TEST apps/web/tests/auth/login-route.test.ts
//
// POST /api/auth/login — 이메일/비번 자격증명 또는 (개발) mode:"dev" 로그인.
// 성공 시 httpOnly 서명 세션 쿠키 설정 + account(id,email) 반환.
// 실패 시 401(계정/비번 존재 여부 구분 노출 금지).

import { getDefaultAccountRepository } from "@/lib/auth/account-repository";
import { devLogin, isDevLoginEnabled, loginWithCredentials } from "@/lib/auth/login-service";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { authLoginLimiter, enforceRateLimit } from "@/lib/shared/api-rate-limit";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

// 세션 쿠키를 발급하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

const CredentialsSchema = z.object({
  mode: z.literal("credentials").optional(),
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

const DevSchema = z.object({
  mode: z.literal("dev"),
  email: z.string().email(),
});

const LoginSchema = z.union([DevSchema, CredentialsSchema]);

export async function POST(request: Request) {
  try {
    // brute-force 완화: 검증/DB 도달 이전에 rate-limit 을 계수한다(분당 10회 초과 → 429).
    const limited = enforceRateLimit(request, authLoginLimiter);
    if (limited) return limited;

    const body = await request.json();
    const input = LoginSchema.parse(body);
    const repo = getDefaultAccountRepository();

    const result =
      input.mode === "dev"
        ? await devLogin(repo, input.email)
        : await loginWithCredentials(repo, input.email, input.password);

    if (!result) {
      // 401 — 잘못된 자격증명(계정 존재 여부 비노출). dev 모드 비활성 시도도 동일.
      return NextResponse.json(
        { error: "Invalid credentials", code: "UNAUTHORIZED", success: false },
        { status: 401 },
      );
    }

    const store = await cookies();
    store.set(SESSION_COOKIE, result.token, sessionCookieOptions());

    return NextResponse.json({ data: { account: result.account }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}

// GET — dev-login 활성 여부 안내(개발 편의, 민감정보 없음).
export function GET() {
  return NextResponse.json({ data: { devLoginEnabled: isDevLoginEnabled() }, success: true });
}
