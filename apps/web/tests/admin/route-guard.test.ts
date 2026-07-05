import { describe, expect, it } from "vitest";
import { decideRouteAccess } from "../../lib/auth/config";

describe("admin 라우트 가드 (config.ts)", () => {
  it("미인증 admin 라우트는 /admin/login 으로 차단", () => {
    const d = decideRouteAccess({
      pathname: "/admin",
      authenticated: false,
      adminAuthenticated: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.redirectTo).toBe("/admin/login");
  });

  it("admin 인증되면 admin 라우트 허용", () => {
    const d = decideRouteAccess({
      pathname: "/admin",
      authenticated: false,
      adminAuthenticated: true,
    });
    expect(d.allowed).toBe(true);
  });

  it("/admin/login 은 공개(미인증도 허용)", () => {
    const d = decideRouteAccess({
      pathname: "/admin/login",
      authenticated: false,
      adminAuthenticated: false,
    });
    expect(d.allowed).toBe(true);
  });

  it("고객 보호 라우트(/settings)는 기존대로 /login 으로 차단", () => {
    const d = decideRouteAccess({
      pathname: "/settings",
      authenticated: false,
      adminAuthenticated: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.redirectTo).toBe("/login");
  });

  it("/adminfoo 는 admin 보호 대상이 아니다 (prefix 오매칭 방지)", () => {
    const d = decideRouteAccess({
      pathname: "/adminfoo",
      authenticated: false,
      adminAuthenticated: false,
    });
    expect(d.allowed).toBe(true);
  });

  it("미인증 admin 하위경로(/admin/dashboard)도 /admin/login 으로 차단", () => {
    const d = decideRouteAccess({
      pathname: "/admin/dashboard",
      authenticated: false,
      adminAuthenticated: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.redirectTo).toBe("/admin/login");
  });
});
