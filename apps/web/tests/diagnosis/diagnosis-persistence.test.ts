import { describe, expect, it } from "vitest";
import {
  buildCompetitorReportFromOutput,
  buildPersistencePlan,
  buildSelfReport,
} from "../../lib/diagnosis/diagnosis-persistence.js";
import { MockGapAnalyzer, buildMockDiagnosisOutput } from "../../lib/diagnosis/mock-pipeline.js";

const output = buildMockDiagnosisOutput({
  startUrl: "https://example.com",
  sourceType: "website",
  businessProfile: {
    businessName: "테스트가게",
    industry: "카페",
    region: "서울",
    mainServices: ["커피"],
    targetKeywords: ["서울 카페"],
  },
  modules: ["seo", "aeo", "geo"],
  scoringMode: "graded",
  enableAiRecommendation: false,
  enableLlmValidation: false,
});

function baseInput() {
  return {
    diagnosisId: "00000000-0000-4000-8000-000000000abc",
    reportId: "00000000-0000-4000-8000-000000000abc",
    websiteUrl: "https://example.com",
    output,
    competitorUrls: ["https://competitor.example.com"],
    analyzer: new MockGapAnalyzer(),
  };
}

describe("buildPersistencePlan competitor report honesty", () => {
  it("does not synthesize gap rows from competitor identifiers alone", () => {
    const plan = buildPersistencePlan(baseInput());

    expect(plan.competitors.length).toBeGreaterThan(0);
    expect(plan.gapRows).toEqual([]);
    expect(plan.actions).toEqual([]);
  });
  it("does not synthesize gap rows from competitor reports without measured coverage", () => {
    const selfReport = buildSelfReport(
      "00000000-0000-4000-8000-000000000abc",
      "https://example.com",
      output.items,
    );
    const noCoverageOutput = {
      ...output,
      crawlResult: { ...output.crawlResult, pages: [] },
      businessPresence: { ...output.businessPresence, surfaces: [] },
      items: output.items.slice(0, 1),
    };
    const competitorReports = [
      buildCompetitorReportFromOutput(
        "https://competitor.example.com",
        noCoverageOutput,
        selfReport,
        {
          competitorName: "competitor.example.com",
        },
      ),
    ];

    const plan = buildPersistencePlan({ ...baseInput(), competitorReports });

    expect(plan.gapRows).toEqual([]);
    expect(plan.actions).toEqual([]);
  });
  it("does not trust caller-supplied competitor reports that lack coverage metadata", () => {
    const selfReport = buildSelfReport(
      "00000000-0000-4000-8000-000000000abc",
      "https://example.com",
      output.items,
    );
    const competitorReports = [
      {
        competitorUrl: "https://competitor.example.com",
        diagnosisItems: selfReport.diagnosisItems.map((item) => ({
          ruleId: item.ruleId,
          category: item.category,
          passed: true,
        })),
      },
    ];

    const plan = buildPersistencePlan({ ...baseInput(), competitorReports });

    expect(plan.gapRows).toEqual([]);
    expect(plan.actions).toEqual([]);
  });

  it("builds gap rows and actions from measured competitor diagnosis output", () => {
    const selfReport = buildSelfReport(
      "00000000-0000-4000-8000-000000000abc",
      "https://example.com",
      output.items,
    );
    const competitorOutput = { ...output, items: output.items.slice(0, 1) };
    const competitorReports = [
      buildCompetitorReportFromOutput(
        "https://competitor.example.com",
        competitorOutput,
        selfReport,
        {
          competitorName: "competitor.example.com",
        },
      ),
    ];

    const plan = buildPersistencePlan({ ...baseInput(), competitorReports });

    expect(plan.gapRows.length).toBeGreaterThan(0);
    expect(plan.actions.length).toBeGreaterThan(0);
  });
  it("measured grounded URL source wins over duplicate manual competitor target", () => {
    const selfReport = buildSelfReport(
      "00000000-0000-4000-8000-000000000abc",
      "https://example.com",
      output.items,
    );
    const competitorUrl = "https://rival.example";
    const competitorReports = [
      buildCompetitorReportFromOutput(
        competitorUrl,
        { ...output, items: output.items.slice(0, 1) },
        selfReport,
        {
          competitorName: "옆집카페",
        },
      ),
    ];
    const outputWithGroundedUrl = {
      ...output,
      llmValidation: {
        provider: "mock",
        grounded: true,
        disclaimer: "d",
        geo: null,
        aeo: null,
        competitors: [
          {
            name: "옆집카페",
            mentionedInQueries: 1,
            source: "gpt_grounded",
            url: competitorUrl,
          } as never,
        ],
      },
    };

    const plan = buildPersistencePlan({
      ...baseInput(),
      output: outputWithGroundedUrl,
      competitorUrls: [competitorUrl],
      competitorReports,
    });

    expect(plan.competitors.find((c) => c.url === competitorUrl)?.source).toBe("gpt_grounded");
  });
  it("orders diagnosable grounded URL competitors before grounded name-only placeholders", () => {
    const selfReport = buildSelfReport(
      "00000000-0000-4000-8000-000000000abc",
      "https://example.com",
      output.items,
    );
    const competitorUrl = "https://measured-rival.example";
    const competitorReports = [
      buildCompetitorReportFromOutput(
        competitorUrl,
        { ...output, items: output.items.slice(0, 1) },
        selfReport,
        {
          competitorName: "측정경쟁사",
        },
      ),
    ];
    const outputWithMixedGrounded = {
      ...output,
      llmValidation: {
        provider: "mock",
        grounded: true,
        disclaimer: "d",
        geo: null,
        aeo: null,
        competitors: [
          {
            name: "이름뿐인경쟁사",
            mentionedInQueries: 2,
            source: "gpt_grounded",
          } as never,
          {
            name: "측정경쟁사",
            mentionedInQueries: 1,
            source: "gpt_grounded",
            url: competitorUrl,
          } as never,
        ],
      },
    };

    const plan = buildPersistencePlan({
      ...baseInput(),
      output: outputWithMixedGrounded,
      competitorUrls: [competitorUrl],
      competitorReports,
    });

    expect(plan.competitors[0]?.url).toBe(competitorUrl);
    expect(plan.competitors[0]?.source).toBe("gpt_grounded");
    expect(plan.competitors[plan.competitors.length - 1]?.url).toBe("gpt_grounded:이름뿐인경쟁사");
    expect(plan.gapRows.length).toBeGreaterThan(0);
    expect(plan.actions.length).toBeGreaterThan(0);
  });
  it("stores grounded name-only competitors without fabricating gap rows or actions", () => {
    const outputWithNameOnlyGrounded = {
      ...output,
      llmValidation: {
        provider: "mock",
        grounded: true,
        disclaimer: "d",
        geo: null,
        aeo: null,
        competitors: [
          {
            name: "이름뿐인경쟁사",
            mentionedInQueries: 1,
            source: "gpt_grounded",
          } as never,
        ],
      },
    };

    const plan = buildPersistencePlan({
      ...baseInput(),
      output: outputWithNameOnlyGrounded,
      competitorUrls: [],
      competitorReports: [],
    });

    const competitor = plan.competitors.find((c) => c.name === "이름뿐인경쟁사");
    expect(competitor?.source).toBe("gpt_grounded");
    expect(competitor?.url).toBe("gpt_grounded:이름뿐인경쟁사");
    expect(plan.gapRows).toEqual([]);
    expect(plan.actions).toEqual([]);
  });
});
