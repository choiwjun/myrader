/**
 * X-SAG Contracts — Diagnosis schema unit tests
 *
 * vitest test suite covering the 5 core validation cases specified in the Work Order.
 * Run: vitest run (from packages/contracts)
 */

import { describe, it, expect } from "vitest";
import { DiagnosisJsonSchema } from "../diagnosis.js";
import {
  AnalyzeRequestSchema,
  detectSourceType,
  isSnsBlocked,
  isMedicalBlocked,
  normalizeWebsiteUrlInput,
} from "../api.js";
import { SCHEMA_VERSION } from "../version.js";

// ---------------------------------------------------------------------------
// Fixture: a minimal valid DiagnosisJson payload
// ---------------------------------------------------------------------------

const VALID_DIAGNOSIS = {
  schemaVersion: SCHEMA_VERSION,
  reportId: "550e8400-e29b-41d4-a716-446655440000",
  profileId: null,

  meta: {
    websiteUrl: "https://test-cafe.example.kr",
    businessName: "테스트 카페 강남",
    industry: "카페/음식점",
    region: "서울 강남구",
    mainServices: ["아메리카노", "케이크"],
    targetKeywords: ["강남 카페", "테이크아웃"],
    modules: ["seo", "aeo", "geo"],
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    startedAt: "2026-05-19T08:00:00Z",
    completedAt: "2026-05-19T08:00:38Z",
    durationMs: 38000,
  },

  scores: {
    overall: 64,
    seo: 72,
    aeo: 58,
    geo: 51,
    grade: "fair",
    disclaimer: "참고 지표입니다. 노출을 보장하지 않습니다.",
  },

  summary: {
    headline: "AI 검색 친화도가 부족합니다",
    topIssues: [
      {
        itemId: "550e8400-e29b-41d4-a716-446655440001",
        title: "메타 설명 없음",
        category: "seo",
        priority: "high",
      },
    ],
    actionCounts: {
      self_fix: 4,
      snippet_action: 3,
      vendor_action: 6,
      si_action: 1,
    },
  },

  analyzedPages: [
    {
      url: "https://test-cafe.example.kr",
      isMainPage: true,
      httpStatus: 200,
      responseTimeMs: 312,
      robotsBlocked: false,
      jsRenderFailed: false,
      extractedMeta: {
        title: "테스트 카페 강남",
        description: null,
        h1: ["강남 최고의 카페"],
        h2: [],
        canonical: "https://test-cafe.example.kr",
        imgAltRatio: 0.8,
      },
      schemas: [],
      faqs: [],
    },
  ],

  items: [
    {
      id: "550e8400-e29b-41d4-a716-446655440002",
      code: "SEO_META_DESC_MISSING",
      category: "seo",
      actionType: "self_fix",
      priority: "high",
      title: "메타 설명(meta description)이 없습니다",
      description: "검색 결과에서 페이지 설명이 표시되지 않아 클릭률이 낮아질 수 있습니다.",
      evidence: { url: "https://test-cafe.example.kr", foundValue: null, expectedValue: "150자 이내 설명" },
      impactScore: 75,
      difficulty: "easy",
      expectedEffect: "검색 결과 클릭률 5~15% 향상 기대",
      isAiGenerated: false,
      recommendationText: "업체 특성을 담은 150자 이내의 자연스러운 설명을 작성하세요.",
      relatedSnippetType: null,
      pageUrl: "https://test-cafe.example.kr",
      ruleVersion: "1.0.0",
    },
  ],

  recommendations: {
    executionOrder: ["550e8400-e29b-41d4-a716-446655440002"],
    quickWins: ["550e8400-e29b-41d4-a716-446655440002"],
    aiSummary: null,
  },

  snippets: [
    {
      type: "LOCAL_BUSINESS",
      available: true,
      suggestion: "업체 정보가 충분하여 LocalBusiness 스키마를 생성할 수 있습니다.",
    },
  ],

  prescriptionItems: [],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("DiagnosisJsonSchema", () => {
  // Case 1: valid payload parses successfully
  it("valid DiagnosisJson — parse succeeds", () => {
    const result = DiagnosisJsonSchema.safeParse(VALID_DIAGNOSIS);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe(SCHEMA_VERSION); // 1.1.0 (v0.4 bump)
      expect(result.data.scores.overall).toBe(64);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]!.isAiGenerated).toBe(false);
    }
  });

  it("accepts business presence surface kind metadata", () => {
    const result = DiagnosisJsonSchema.safeParse({
      ...VALID_DIAGNOSIS,
      meta: {
        ...VALID_DIAGNOSIS.meta,
        sourceType: "other_platform",
        businessPresence: {
          primarySourceType: "other_platform",
          primaryUrl: "https://app.catchtable.co.kr/ct/shop/test",
          canonicalName: "Fixture Cafe",
          services: ["reservation"],
          surfaces: [
            {
              sourceType: "other_platform",
              surfaceKind: "reservation",
              url: "https://app.catchtable.co.kr/ct/shop/test",
              status: "fetched",
              sourceLabel: "예약 페이지",
              name: "Fixture Cafe",
              confidence: "medium",
              services: ["reservation"],
              limitations: [],
            },
          ],
          limitations: [],
        },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.meta.businessPresence?.surfaces[0]?.surfaceKind).toBe(
        "reservation",
      );
    }
  });

  // Case 2: score out of range (101) — parse fails
  it("invalid score (101) — parse fails", () => {
    const invalid = {
      ...VALID_DIAGNOSIS,
      scores: {
        ...VALID_DIAGNOSIS.scores,
        overall: 101, // exceeds max(100)
      },
    };
    const result = DiagnosisJsonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("overall"))).toBe(true);
    }
  });

  // Case 3: invalid URL — parse fails
  it("invalid websiteUrl — parse fails", () => {
    const invalid = {
      ...VALID_DIAGNOSIS,
      meta: {
        ...VALID_DIAGNOSIS.meta,
        websiteUrl: "not-a-url",
      },
    };
    const result = DiagnosisJsonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("websiteUrl"))).toBe(true);
    }
  });

  // perf score — optional field tests
  it("scores.perf present (number) — parse succeeds", () => {
    const withPerf = {
      ...VALID_DIAGNOSIS,
      scores: { ...VALID_DIAGNOSIS.scores, perf: 78 },
    };
    const result = DiagnosisJsonSchema.safeParse(withPerf);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scores.perf).toBe(78);
    }
  });

  it("scores.perf null — parse succeeds", () => {
    const withPerfNull = {
      ...VALID_DIAGNOSIS,
      scores: { ...VALID_DIAGNOSIS.scores, perf: null },
    };
    const result = DiagnosisJsonSchema.safeParse(withPerfNull);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scores.perf).toBeNull();
    }
  });

  it("scores.perf absent (legacy payload without perf) — parse succeeds", () => {
    // VALID_DIAGNOSIS has no perf field — existing payloads must still validate
    const result = DiagnosisJsonSchema.safeParse(VALID_DIAGNOSIS);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scores.perf).toBeUndefined();
    }
  });

  it("scores.perf out of range (101) — parse fails", () => {
    const invalid = {
      ...VALID_DIAGNOSIS,
      scores: { ...VALID_DIAGNOSIS.scores, perf: 101 },
    };
    const result = DiagnosisJsonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("perf"))).toBe(true);
    }
  });

  // Case 4: invalid ActionType value — parse fails
  it("invalid actionType value — parse fails", () => {
    const invalidItems = [
      {
        ...VALID_DIAGNOSIS.items[0],
        actionType: "invalid_type", // not in enum
      },
    ];
    const invalid = { ...VALID_DIAGNOSIS, items: invalidItems };
    const result = DiagnosisJsonSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("actionType"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Case 5: blocked SNS domain (instagram.com) is rejected by AnalyzeRequest
// ---------------------------------------------------------------------------

describe("AnalyzeRequestSchema — blocked domain enforcement (POLICY § 5.2)", () => {
  it("normalizes bare business domains to https URLs", () => {
    const result = AnalyzeRequestSchema.parse({
      websiteUrl: "test-cafe.example.kr/menu#top",
      businessName: "카페 테스트",
      industry: "카페",
      region: "서울",
      mainServices: ["아메리카노"],
      targetKeywords: ["강남 카페"],
      competitorUrls: ["other-cafe.example.kr"],
      modules: ["seo"],
    });

    expect(result.websiteUrl).toBe("https://test-cafe.example.kr/menu");
    expect(result.competitorUrls).toEqual(["https://other-cafe.example.kr/"]);
    expect(normalizeWebsiteUrlInput("example.com")).toBe("https://example.com/");
  });

  it("rejects bare strings that are not valid domain names", () => {
    const result = AnalyzeRequestSchema.safeParse({
      websiteUrl: "not-a-url",
      businessName: "카페 테스트",
      industry: "카페",
      region: "서울",
      mainServices: ["아메리카노"],
      targetKeywords: ["강남 카페"],
      modules: ["seo"],
    });

    expect(result.success).toBe(false);
  });

  it("instagram.com URL — schema allows and source type is classified", () => {
    const url = "https://www.instagram.com/my_cafe";
    const result = AnalyzeRequestSchema.safeParse({
      websiteUrl: url,
      businessName: "카페 인스타",
      industry: "카페",
      region: "서울",
      mainServices: ["아메리카노"],
      targetKeywords: ["강남 카페"],
      modules: ["seo"],
    });
    expect(result.success).toBe(true);
    expect(detectSourceType(url)).toBe("instagram");
    expect(isSnsBlocked(url)).toBe(false);
  });

  it("enableJsRendering defaults to false and accepts explicit true", () => {
    const base = {
      websiteUrl: "https://test-cafe.example.kr",
      businessName: "테스트 카페",
      industry: "카페",
      region: "서울",
      mainServices: ["아메리카노"],
      targetKeywords: ["강남 카페"],
      modules: ["seo"],
    };

    const defaultResult = AnalyzeRequestSchema.parse(base);
    expect(defaultResult.enableJsRendering).toBe(false);

    const enabledResult = AnalyzeRequestSchema.parse({
      ...base,
      enableJsRendering: true,
    });
    expect(enabledResult.enableJsRendering).toBe(true);
  });

  it("subdomain of instagram.com (m.instagram.com) — classified", () => {
    expect(detectSourceType("https://m.instagram.com/shop")).toBe("instagram");
    expect(isSnsBlocked("https://m.instagram.com/shop")).toBe(false);
  });

  it("youtube.com URL — classified", () => {
    expect(detectSourceType("https://youtube.com/channel/abc")).toBe("youtube");
    expect(isSnsBlocked("https://youtube.com/channel/abc")).toBe(false);
  });

  it("x.com URL — classified as other platform", () => {
    expect(detectSourceType("https://x.com/my_business")).toBe("other_platform");
    expect(isSnsBlocked("https://x.com/my_business")).toBe(false);
  });

  it("map, review, and reservation URLs are classified as platform surfaces", () => {
    expect(detectSourceType("https://booking.naver.com/booking/6/bizes/123")).toBe(
      "naver_place",
    );
    expect(detectSourceType("https://maps.google.com/?cid=123")).toBe(
      "other_platform",
    );
    expect(detectSourceType("https://app.catchtable.co.kr/ct/shop/test")).toBe(
      "other_platform",
    );
    expect(detectSourceType("https://www.tabling.co.kr/restaurant/test")).toBe(
      "other_platform",
    );
  });

  it("normal business URL — website source type", () => {
    expect(detectSourceType("https://test-cafe.example.kr")).toBe("website");
    expect(isSnsBlocked("https://test-cafe.example.kr")).toBe(false);
  });

  it("medical industry — rejected", () => {
    expect(isMedicalBlocked("강남 치과의원")).toBe(true);
    expect(isMedicalBlocked("한의원 한방 클리닉")).toBe(true);
    expect(isMedicalBlocked("카페/음식점")).toBe(false);
  });
});
