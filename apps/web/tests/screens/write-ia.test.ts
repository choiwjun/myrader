import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appDir = join(__dirname, "../../app/(app)");

function readAppFile(relativePath: string): string {
  return readFileSync(join(appDir, relativePath), "utf-8");
}

describe("A0-5: Write menu integrates actions and generated copy", () => {
  it("write owns action and generated-asset data directly", () => {
    const src = readAppFile("write/WriteClient.tsx");

    expect(src).toContain("/api/action");
    expect(src).toContain('searchParams.get("actionId")');
    expect(src).toContain('method: "PATCH"');
    expect(src).toContain("/api/generated-asset");
    expect(src).toContain("오늘 할 일");
    expect(src).toContain("추천 액션");
    expect(src).toContain("복붙 문안");
    expect(src).toContain("문안 근거");
    expect(src).toContain("BigCopyButton");
  });

  it("write does not route users to legacy actions, assets, or checkout pages", () => {
    const src = readAppFile("write/WriteClient.tsx");

    expect(src).not.toContain('hrefWithParams("/actions"');
    expect(src).not.toContain('hrefWithParams("/assets"');
    expect(src).not.toContain("router.push(`/actions");
    expect(src).not.toContain("router.push(`/assets");
    expect(src).not.toContain("router.push(`/checkout");
  });

  it("legacy actions and assets routes redirect to write while preserving query context", () => {
    const actions = readAppFile("actions/page.tsx");
    const assets = readAppFile("assets/page.tsx");

    for (const src of [actions, assets]) {
      expect(src).toContain("redirect(");
      expect(src).toContain("/write");
      expect(src).toContain("diagnosisId");
      expect(src).toContain("actionId");
    }
    expect(actions).toContain("tier");
    expect(assets).toContain("type");
  });
});
