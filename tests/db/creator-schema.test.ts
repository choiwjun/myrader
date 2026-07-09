import {
  creatorArticles,
  creatorCitations,
  creatorKeywords,
  creatorLookups,
  creatorReports,
  creatorScans,
  creatorTopics,
  creatorUsage,
} from "@boina/db/schema";
import { describe, expect, it } from "vitest";

describe("Creator DB schema", () => {
  it("exports the Creator planning tables", () => {
    expect(creatorTopics).toBeDefined();
    expect(creatorScans).toBeDefined();
    expect(creatorKeywords).toBeDefined();
    expect(creatorLookups).toBeDefined();
    expect(creatorArticles).toBeDefined();
    expect(creatorCitations).toBeDefined();
    expect(creatorReports).toBeDefined();
    expect(creatorUsage).toBeDefined();
  });
});
