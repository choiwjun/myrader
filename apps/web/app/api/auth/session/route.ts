// @TASK P1-R1 - 현재 세션 조회 엔드포인트 (세션 → account)
// @SPEC specs/screens/settings.yaml (S7 account_info — 로그인 이메일 표시)
// @SPEC .claude/constitutions/nextjs/auth.md (단일 Auth 레이어 getCurrentUser)
//
// GET /api/auth/session — 현재 세션의 account(id,email)를 반환한다.
// 미인증이면 401(보호 자원 — S7 account 표시의 데이터 출처).

import { getCurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";

// 세션/DB 에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
// (이 route 의 prerender 가 /settings 빌드를 DATABASE_URL 미설정으로 실패시키던 원인.)
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED", success: false },
        { status: 401 },
      );
    }
    // 민감정보(plan 내부값 외) 비노출 — S7 가 쓰는 id,email 만.
    return NextResponse.json({
      data: { account: { id: user.id, email: user.email } },
      success: true,
    });
  } catch (error) {
    console.error("GET /api/auth/session error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
