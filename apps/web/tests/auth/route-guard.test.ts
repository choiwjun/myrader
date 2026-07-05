// @TASK P1-R1 - 보호 라우트 가드 (RED→GREEN)
// @SPEC specs/screens/settings.yaml (S7 auth:true)
// @SPEC .claude/constitutions/nextjs/auth.md
// @TEST apps/web/tests/auth/route-guard.test.ts
//
// REQ-001: 미인증 사용자가 보호 라우트(S7 /settings)에 접근하면 차단되어야 한다.
// 공개 라우트(S1~S6 진단 auth:false)는 세션 없이도 통과해야 한다.
//
// RED 의도: 가드(isProtectedRoute)와 미들웨어 결정 로직이 아직 없으면 실패한다.

import { describe, expect, it } from "vitest";
import { decideRouteAccess, isProtectedRoute } from "../../lib/auth/config";

describe("보호 라우트 가드 (P1-R1)", () => {
  describe("isProtectedRoute — 라우트 분류", () => {
    it("S7 설정(/settings)은 보호 라우트다 (auth:true)", () => {
      expect(isProtectedRoute("/settings")).toBe(true);
      expect(isProtectedRoute("/settings/account")).toBe(true);
    });

    it("S1~S6 진단 화면은 공개 라우트다 (auth:false)", () => {
      expect(isProtectedRoute("/")).toBe(false);
      expect(isProtectedRoute("/find")).toBe(false);
      expect(isProtectedRoute("/status")).toBe(false);
    });

    it("로그인/로그아웃 엔드포인트는 공개다 (인증 진입점)", () => {
      expect(isProtectedRoute("/api/auth/login")).toBe(false);
      expect(isProtectedRoute("/api/auth/logout")).toBe(false);
      expect(isProtectedRoute("/login")).toBe(false);
    });
  });

  describe("decideRouteAccess — 인증 상태 × 라우트 → 결정", () => {
    it("미인증 + 보호 라우트 → 차단(redirect /login)", () => {
      const result = decideRouteAccess({ pathname: "/settings", authenticated: false });
      expect(result.allowed).toBe(false);
      expect(result.redirectTo).toBe("/login");
    });

    it("인증됨 + 보호 라우트 → 허용", () => {
      const result = decideRouteAccess({ pathname: "/settings", authenticated: true });
      expect(result.allowed).toBe(true);
    });

    it("미인증 + 공개 라우트 → 허용 (진단은 로그인 불필요)", () => {
      const result = decideRouteAccess({ pathname: "/find", authenticated: false });
      expect(result.allowed).toBe(true);
    });
  });
});
