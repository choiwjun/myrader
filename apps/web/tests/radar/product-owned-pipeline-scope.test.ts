import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectSignals, expand, naverScore } from "@radar/keyword-pipeline";
import { describe, expect, it } from "vitest";
import { buildSubscribedRadarPreview } from "../../lib/radar/radar-preview";
import { processDueRadarScans } from "../../lib/radar/radar-scan-job";

const repoRoot = join(__dirname, "../../../..");

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf-8");
}

describe("A1-1: radar keyword pipeline is product-owned", () => {
  it("planning docs do not block keyword pipeline completion on an external original file", () => {
    const docs = [
      "docs/planning/03-user-flow.md",
      "docs/planning/08-radar-subscription-gap-review.md",
      "docs/planning/DECISION_LOG.md",
      "docs/planning/DECISION_LOG-2026-07-05-home-feed-ia.md",
    ].map(readRepoFile);

    for (const doc of docs) {
      expect(doc).not.toMatch(/사장님레이더-검증\/pipeline\.js/);
      expect(doc).not.toMatch(/원본\s*(pipeline\s*)?확보.*(선행|전|후|불가|조건)/);
    }
  });

  it("owned keyword pipeline expands, collects, and scores without an external original", async () => {
    const expanded = await expand("강남 카페", { limit: 2 });
    const keyword = expanded.keywords.at(0);
    if (!keyword) throw new Error("Expected fallback keyword expansion");

    const collected = await collectSignals([keyword], {
      client: {
        fetchBlog: async () => ({ docs: 4 }),
        fetchSearchAd: async () => ({ monthlySearches: 120 }),
        fetchDatalab: async () => ({ trend7d: 18 }),
      },
      now: new Date("2026-07-05T00:00:00.000Z"),
    });
    const signal = collected.signals.at(0);
    if (!signal) throw new Error("Expected collected keyword signal");

    const score = naverScore(signal);
    expect(collected.status).toBe("complete");
    expect(score.keyword.text).toBe(keyword.text);
    expect(score.score).toBeGreaterThan(0);
  });

  it("radar app contracts consume owned pipeline outcomes through preview and scan job exports", () => {
    const preview = buildSubscribedRadarPreview(
      [
        {
          id: "kw-1",
          text: "강남 카페 후기",
          verdict: "now",
          naverEvidence: {
            volume: 120,
            docs: 4,
            saturation: 0.03,
            trend7d: 18,
            checkedAt: "2026-07-05T00:00:00.000Z",
          },
        },
      ],
      { diagnosisId: "00000000-0000-4000-8000-000000000abc" },
    );

    expect(preview.rows.at(0)?.actionHref).toContain("radarKeywordId=kw-1");
    expect(preview.rows.at(0)?.actionHref).toContain(
      "diagnosisId=00000000-0000-4000-8000-000000000abc",
    );
    expect(preview.rows.at(0)).toMatchObject({
      locked: false,
      status: "good",
    });
    expect(typeof processDueRadarScans).toBe("function");
  });

  it("radar gap review no longer lists implemented A0-A4 work as pending", () => {
    const review = readRepoFile("docs/planning/08-radar-subscription-gap-review.md");
    const openItems = review
      .split("\n")
      .filter((line) => /^- \[ \]/.test(line) || /^[0-9]+\. A[0-4]:/.test(line));

    expect(openItems).toEqual([]);
  });
});
