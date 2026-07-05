// @TASK P1-R1 - 보호 라우트 가드 미들웨어 (1차 게이트)
// @TASK P2-admin - admin 라우트 게이팅 추가
// @SPEC .claude/constitutions/nextjs/auth.md (Middleware 보호 패턴)
// @SPEC specs/screens/settings.yaml (S7 auth:true) / docs/03-user-flow (S1~S6 공개)
//
// Defense-in-depth 1차 레이어: 보호 라우트에 세션 쿠키가 없으면 즉시 /login 으로
// 리다이렉트한다. 암호 서명 검증(node:crypto)은 Edge 런타임 제약상 여기서 하지 않고,
// 서버 컴포넌트/route 의 getCurrentUser() 가 권위 있는 최종 검증을 수행한다(2차 레이어).
//
// 즉, 쿠키 존재 = 통과(가벼운 가드), 쿠키 위조/만료는 서버단에서 거부 → 단일 인증 일관.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decideRouteAccess } from "./lib/auth/config";
import { ADMIN_COOKIE, SESSION_COOKIE } from "./lib/auth/cookie-constants";

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const hasAdmin = Boolean(request.cookies.get(ADMIN_COOKIE)?.value);

  const decision = decideRouteAccess({
    pathname,
    authenticated: hasSession,
    adminAuthenticated: hasAdmin,
  });
  if (!decision.allowed && decision.redirectTo) {
    const url = request.nextUrl.clone();
    url.pathname = decision.redirectTo;
    // 로그인 후 원위치 복귀를 위한 next 파라미터(선택).
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// 보호 prefix(S7 + admin)만 미들웨어를 태운다.
// `:path*` 는 bare `/admin` 을 매칭하지 않으므로 정확 경로를 별도 명시한다.
export const config = {
  matcher: ["/settings/:path*", "/admin", "/admin/:path*"],
};
