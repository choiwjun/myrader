import { isAdminConfigured, verifyAdminToken } from "@/lib/admin/auth";
// @SPEC docs/superpowers/plans/2026-06-17-admin-dashboard.md (Task 5 — requireAdmin 가드)
// 서버 컴포넌트/route 용 권위 검증 가드(2차 레이어). 쿠키 서명 + 설정 여부를 검증.
import { ADMIN_COOKIE } from "@/lib/auth/cookie-constants";
import { cookies } from "next/headers";

/** 현재 요청이 인증된 관리자인가. ADMIN_PASSWORD 미설정이면 항상 false(차단). */
export async function isAdminAuthenticated(): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}
