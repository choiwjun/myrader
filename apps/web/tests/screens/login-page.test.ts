import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = resolve(__dirname, "../..");
const LOGIN_TSX = resolve(WEB_ROOT, "app/(app)/login/page.tsx");
const source = readFileSync(LOGIN_TSX, "utf-8");

describe("login page contract", () => {
  it("exports the page component", () => {
    expect(source).toMatch(/export\s+default\s+function\s+\w+/);
  });

  it("supports Google and email magic-link entrypoints", () => {
    expect(source).toContain("/api/auth/oauth/google");
    expect(source).toContain("/api/auth/magic-link");
    expect(source).toMatch(/type="email"/);
  });

  it("keeps the existing credentials fallback route", () => {
    expect(source).toContain("/api/auth/login");
    expect(source).toMatch(/"credentials"|'credentials'/);
    expect(source).toMatch(/type="password"/);
  });

  it("guards return paths with safeRedirectPath and Suspense", () => {
    expect(source).toMatch(/["']next["']/);
    expect(source).toMatch(/["']returnTo["']/);
    expect(source).toMatch(/safeRedirectPath/);
    expect(source).toMatch(/Suspense/);
    expect(source).toMatch(/useSearchParams/);
  });

  it("keeps dev login conditional and avoids nonexistent signup routes", () => {
    expect(source).toMatch(/devLoginEnabled/);
    expect(source).toMatch(/"dev"|'dev'/);
    expect(source).not.toMatch(/\/signup|\/register/);
  });
});
