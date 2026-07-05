import { adminCookieOptions } from "@/lib/admin/auth";
// POST /api/admin/logout — 관리자 쿠키 만료. 인증된 관리자만 허용(CSRF DoS 가드).
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import { ADMIN_COOKIE } from "@/lib/auth/cookie-constants";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  // sameSite=lax 는 cross-site POST 에도 쿠키를 보내므로, 인증 검증 없이 쿠키를 지우면
  // 외부 사이트가 관리자를 강제 로그아웃시킬 수 있다(CSRF DoS). 인증된 관리자만 통과.
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", success: false },
      { status: 401 },
    );
  }
  const store = await cookies();
  // 삭제 시 발급과 동일 속성(secure 포함) + maxAge:0 이어야 브라우저가 확실히 지운다.
  store.set(ADMIN_COOKIE, "", { ...adminCookieOptions(), maxAge: 0 });
  return NextResponse.json({ data: { ok: true }, success: true });
}
