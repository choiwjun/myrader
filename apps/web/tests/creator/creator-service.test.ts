import {
  buildCreatorRadarSnapshot,
  diagnoseCreatorArticle,
  getCreatorCitations,
  getCreatorWeeklyReport,
  lookupCreatorKeyword,
  previewCreatorTopic,
} from "@/lib/creator/service";
import { describe, expect, it } from "vitest";

describe("Creator service", () => {
  it("builds a radar snapshot with dual-scored keywords and transparent evidence", async () => {
    const snapshot = await buildCreatorRadarSnapshot({
      channelUrl: "https://example.com/blog",
      topicName: "제주 여행",
    });

    expect(snapshot.topic.channelUrl).toBe("https://example.com/blog");
    expect(snapshot.keywords.length).toBeGreaterThanOrEqual(15);
    expect(snapshot.topSignal.keyword).toBe(snapshot.keywords[0]?.text);
    expect(snapshot.keywords[0]?.naverScore).toBeGreaterThan(0);
    expect(snapshot.keywords[0]?.aiScore).toBeGreaterThan(0);
    expect(snapshot.keywords[0]?.naverEvidence.reasons.length).toBeGreaterThan(0);
    expect(snapshot.keywords[0]?.aiEvidence?.methodology).toContain("가능성");
  });

  it("previews topic expansion without blocking niche subjects", async () => {
    const preview = await previewCreatorTopic("홈카페");

    expect(preview.seed).toBe("홈카페");
    expect(preview.keywords).toHaveLength(5);
    expect(preview.message).toContain("시작");
  });

  it("returns Naver first and AI only when the lookup opts in", async () => {
    const naverOnly = await lookupCreatorKeyword({ keyword: "제주 비오는날 갈만한곳" });
    const withAi = await lookupCreatorKeyword({
      keyword: "제주 비오는날 갈만한곳",
      includeAi: true,
    });

    expect(naverOnly.aiStatus).toBe("available");
    expect(naverOnly.aiScore).toBeNull();
    expect(withAi.aiStatus).toBe("complete");
    expect(withAi.aiScore).toBeGreaterThan(0);
  });

  it("diagnoses an article URL with three or more actionable checklist rows", async () => {
    const diagnosis = await diagnoseCreatorArticle({ url: "https://example.com/blog/ai-search" });

    expect(diagnosis.status).toBe("completed");
    expect(diagnosis.score).toBeGreaterThan(0);
    expect(diagnosis.checklist.length).toBeGreaterThanOrEqual(3);
    expect(diagnosis.checklist[0]?.fix).toContain("AI 인용 가능성");
  });

  it("returns citation targets and weekly report archives for creator tracking screens", async () => {
    const citations = getCreatorCitations();
    const report = await getCreatorWeeklyReport();

    expect(citations.trackedTargets).toHaveLength(citations.trackedCount);
    expect(citations.methodology).toContain("매주");
    expect(report.topKeywords).toHaveLength(5);
    expect(report.archiveWeeks.length).toBeGreaterThan(0);
  });
});
