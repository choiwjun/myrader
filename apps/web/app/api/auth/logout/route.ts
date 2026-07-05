// @TASK P1-R1 - 로그아웃 엔드포인트 (세션 파기)
// @SPEC .claude/constitutions/nextjs/auth.md (단일 인증 — 세션)
// @SPEC .claude/constitutions/nextjs/api-routes.md (일관 응답)
//
// POST /api/auth/logout — 세션 쿠키를 제거한다. 멱등(세션 없어도 200).

import { SESSION_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// 세션 쿠키를 제거하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    return NextResponse.json({ data: { loggedOut: true }, success: true });
  } catch (error) {
    console.error("POST /api/auth/logout error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
