// @TASK P1-R1 - 라우트 보호 정책 (공개 S1~S6 / 보호 S7)
// @TASK P2-admin - admin 라우트 보호 정책 추가
// @SPEC specs/screens/settings.yaml (S7 route:/settings auth:true)
// @SPEC docs/planning/03-user-flow.md (S1~S6 진단 = auth:false)
// @SPEC .claude/constitutions/nextjs/auth.md (Middleware 보호 패턴)
//
// 단일 인증 체계의 라우트 가드 정책. screen-spec(auth 플래그)을 코드 한 곳에
// 고정한다 — 미들웨어/서버 컴포넌트/route 가 모두 이 정책만 참조한다(중복 금지).

/** 로그인이 필요한 보호 라우트 prefix (S7 설정 등). */
export const PROTECTED_PREFIXES = ["/settings"] as const;

/**
 * 인증 진입점·공개 자원 — 보호 대상에서 명시적으로 제외한다.
 * (보호 prefix 와 겹치더라도 이 목록이 우선한다.)
 */
export const PUBLIC_PREFIXES = ["/login", "/api/auth"] as const;

/** 관리자 보호 prefix. */
export const ADMIN_PREFIX = "/admin";

/** 관리자 공개 진입점(로그인 페이지/로그인 API). */
export const ADMIN_PUBLIC_PREFIXES = ["/admin/login", "/api/admin/login"] as const;

/** 미인증 사용자를 보낼 로그인 경로. */
export const LOGIN_PATH = "/login";

/** 미인증 관리자를 보낼 경로. */
export const ADMIN_LOGIN_PATH = "/admin/login";

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * 주어진 경로가 로그인 필요한 보호 라우트인지 판정한다.
 * 공개 prefix 가 우선(인증 진입점은 항상 공개).
 */
export function isProtectedRoute(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => matchesPrefix(pathname, p))) return false;
  return PROTECTED_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

/** 주어진 경로가 관리자 보호 라우트인지(공개 진입점 제외). */
export function isAdminProtectedRoute(pathname: string): boolean {
  if (ADMIN_PUBLIC_PREFIXES.some((p) => matchesPrefix(pathname, p))) return false;
  return matchesPrefix(pathname, ADMIN_PREFIX);
}

export interface RouteAccessInput {
  pathname: string;
  authenticated: boolean;
  adminAuthenticated?: boolean;
}

export interface RouteAccessDecision {
  allowed: boolean;
  /** 차단 시 리다이렉트 대상(보호 라우트 미인증). */
  redirectTo?: string;
}

/**
 * 인증 상태 × 라우트 → 접근 허용/차단 결정.
 * - 미인증 + 관리자 보호 라우트 → 차단(redirect ADMIN_LOGIN_PATH)
 * - 미인증 + (고객) 보호 라우트 → 차단(redirect LOGIN_PATH)
 * - 그 외 → 허용
 */
export function decideRouteAccess(input: RouteAccessInput): RouteAccessDecision {
  if (isAdminProtectedRoute(input.pathname) && !input.adminAuthenticated) {
    return { allowed: false, redirectTo: ADMIN_LOGIN_PATH };
  }
  if (isProtectedRoute(input.pathname) && !input.authenticated) {
    return { allowed: false, redirectTo: LOGIN_PATH };
  }
  return { allowed: true };
}
