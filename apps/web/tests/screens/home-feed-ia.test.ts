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

    for (const href of ["/home", "/status", "/rivals", "/write"]) {
      expect(src).toContain(`href: "${href}"`);
    }

    for (const legacyHref of ["/compare", "/gap", "/actions"]) {
      expect(src).not.toContain(`href: "${legacyHref}"`);
    }
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

    expect(status).toContain(
      'router.push(diagnosisId ? `/rivals?diagnosisId=${diagnosisId}` : "/rivals")',
    );
    expect(status).not.toContain(
      'router.push(diagnosisId ? `/compare?diagnosisId=${diagnosisId}` : "/compare")',
    );
  });
});
