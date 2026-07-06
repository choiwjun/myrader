import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appDir = join(__dirname, "../../app/(app)");

function readAppFile(relativePath: string): string {
  return readFileSync(join(appDir, relativePath), "utf-8");
}

describe("A0-4: Rivals menu integrates compare and gap", () => {
  it("rivals owns both competitor comparison and reverse-gap data", () => {
    const src = readAppFile("rivals/RivalsClient.tsx");

    expect(src).toContain("/api/competitor?diagnosisId=");
    expect(src).toContain("/api/gap?diagnosisId=");
    expect(src).toContain("경쟁자 한 줄 요약");
    expect(src).toContain("비교 근거");
    expect(src).toContain("키워드");
    expect(src).toContain("사진");
    expect(src).toContain("메뉴");
    expect(src).toContain("리뷰");
    expect(src).toContain("소개글");
    expect(src).toContain("AI 인용 재료");
  });

  it("rivals no longer sends users to legacy compare, gap, actions, or checkout routes", () => {
    const src = readAppFile("rivals/RivalsClient.tsx");

    expect(src).not.toContain('hrefWithDiagnosisId("/compare"');
    expect(src).not.toContain('hrefWithDiagnosisId("/gap"');
    expect(src).not.toContain("router.push(`/checkout");
    expect(src).not.toContain("router.push(`/actions");
    expect(src).toContain("router.push(`/write");
    expect(src).toContain('params.set("actionId", item.id)');
    expect(src).toContain('params.set("tier", gapActionTierToClass(item.actionTier))');
  });

  it("legacy compare and gap routes redirect to rivals while preserving diagnosisId", () => {
    const compare = readAppFile("compare/page.tsx");
    const gap = readAppFile("gap/page.tsx");

    for (const src of [compare, gap]) {
      expect(src).toContain("redirect(");
      expect(src).toContain("/rivals");
      expect(src).toContain("diagnosisId");
    }
  });
});
