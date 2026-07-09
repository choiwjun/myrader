import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const creatorDir = join(__dirname, "../../app/creator");

function readCreatorFile(relativePath: string): string {
  return readFileSync(join(creatorDir, relativePath), "utf-8");
}

describe("Creator screens", () => {
  it("implements the documented route surface", () => {
    for (const route of [
      "onboarding/page.tsx",
      "radar/page.tsx",
      "diagnose/page.tsx",
      "citations/page.tsx",
      "reports/current/page.tsx",
      "settings/page.tsx",
    ]) {
      expect(existsSync(join(creatorDir, route)), route).toBe(true);
    }
  });

  it("keeps the Creator UI isolated from the SME navigation shell", () => {
    const layout = readCreatorFile("layout.tsx");
    const chrome = readCreatorFile("_components/CreatorAppChrome.tsx");

    expect(`${layout}\n${chrome}`).toContain("SearchRadar");
    expect(`${layout}\n${chrome}`).toContain("/creator/radar");
    expect(layout).not.toContain("AppNav");
  });

  it("includes S2 radar, S2.5 lookup, S4 diagnosis, and S5 citation language", () => {
    const radar = readCreatorFile("radar/CreatorRadarClient.tsx");
    const detail = readCreatorFile("_components/KeywordDetailPanel.tsx");
    const lookup = readCreatorFile("_components/CreatorLookupOverlay.tsx");
    const diagnose = readCreatorFile("diagnose/CreatorDiagnoseClient.tsx");
    const citations = readCreatorFile("citations/page.tsx");

    expect(radar).toContain("TOP SIGNAL");
    expect(`${detail}\n${lookup}`).toContain("AI 인용 가능성 확인");
    expect(diagnose).toContain("글 읽는 중");
    expect(citations).toContain("아직 인용 전이에요");
  });
});
