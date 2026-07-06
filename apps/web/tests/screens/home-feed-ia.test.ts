import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appDir = join(__dirname, "../../app/(app)");
const sharedDir = join(__dirname, "../../app/components/shared");

function readAppFile(relativePath: string): string {
  return readFileSync(join(appDir, relativePath), "utf-8");
}

function readSharedFile(relativePath: string): string {
  return readFileSync(join(sharedDir, relativePath), "utf-8");
}

describe("A0-3: Home feed IA route shell", () => {
  it("primary route files exist for the new IA", () => {
    for (const route of ["home", "status", "rivals", "write", "settings"]) {
      expect(existsSync(join(appDir, route, "page.tsx")), `${route} route`).toBe(true);
    }
  });

  it("AppNav exposes the new primary menu and drops legacy funnel links", () => {
    const src = readSharedFile("AppNav.tsx");

    for (const href of ["/home", "/status", "/rivals", "/write", "/settings"]) {
      expect(src).toContain(`href: "${href}"`);
    }

    for (const legacyHref of ["/compare", "/gap", "/actions"]) {
      expect(src).not.toContain(`href: "${legacyHref}"`);
    }
  });
  it("AppNav defines mobile bottom nav labels and preserves diagnosisId on carryId routes", () => {
    const src = readSharedFile("AppNav.tsx");

    for (const label of [
      'mobileLabel: "홈"',
      'mobileLabel: "상태"',
      'mobileLabel: "라이벌"',
      'mobileLabel: "문안"',
      'mobileLabel: "설정"',
    ]) {
      expect(src).toContain(label);
    }
    expect(src).toContain("md:hidden");
    expect(src).toContain("const hrefParams = new URLSearchParams();");
    expect(src).toContain('hrefParams.set("diagnosisId", diagnosisId);');
    expect(src).toContain("return `${s.href}?${hrefParams.toString()}`;");
  });

  it("find completion routes the first diagnosis to /home", () => {
    const src = readAppFile("find/page.tsx");
    expect(src).toContain("router.push(`/home?diagnosisId=${id}`)");
    expect(src).not.toContain("router.push(`/status?diagnosisId=${id}`)");
  });

  it("home owns RadarPreviewCard card ④ and status no longer mounts it", () => {
    const home = readAppFile("home/page.tsx");
    const status = readAppFile("status/page.tsx");

    expect(home).toContain("RadarPreviewCard");
    expect(home).toContain("이번 주 사람들이 찾는 말");
    expect(status).not.toContain("<RadarPreviewCard");
  });

  it("status continues to the rivals menu instead of the old compare page", () => {
    const status = readAppFile("status/page.tsx");

    expect(status).toContain("const params = new URLSearchParams();");
    expect(status).toContain('params.set("diagnosisId", diagnosisId);');
    expect(status).toContain(
      'router.push(`/rivals${params.toString() ? `?${params.toString()}` : ""}`);',
    );
    expect(status).not.toContain(
      'router.push(diagnosisId ? `/compare?diagnosisId=${diagnosisId}` : "/compare")',
    );
  });
});
