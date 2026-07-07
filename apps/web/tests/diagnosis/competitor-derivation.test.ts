// @TASK 수정R2-A-2 - 경쟁사 산출 단위 테스트 (실 grounded / dev 샘플 / production fail-fast)
// @SPEC apps/web/lib/diagnosis/competitor-derivation.ts
// @TEST apps/web/tests/diagnosis/competitor-derivation.test.ts

import type { DiagnosisPipelineOutput } from "@boina/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSampleNaverCompetitors,
  deriveCompetitorInput,
  hasRealCompetitorSignal,
} from "../../lib/diagnosis/competitor-derivation.js";

const PROFILE = {
  businessName: "강남카페",
  industry: "cafe",
  region: "서울 강남구",
  targetKeywords: ["강남 카페"],
};

function baseOutput(): DiagnosisPipelineOutput {
  const iso = new Date().toISOString();
  return {
    crawlResult: { pages: [], partialResult: false, startedAt: iso, completedAt: iso },
    scores: {
      seoScore: 70,
      aeoScore: 70,
      geoScore: 70,
      perfScore: null,
      overallScore: 70,
      scoringVersion: "2.1.0",
    },
    items: [],
    recommendations: [],
    partialResult: false,
    platformLimitations: [],
    businessPresence: {
      primarySourceType: "website",
      primaryUrl: "https://example.com",
      canonicalName: null,
      services: [],
      surfaces: [],
      limitations: [],
    },
  };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildSampleNaverCompetitors", () => {
  it("targetKeyword 기반 샘플 경쟁사 3건(순위 1~3, naver_serp)을 만든다", () => {
    const out = buildSampleNaverCompetitors(PROFILE);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(out.every((c) => c.source === "naver_serp")).toBe(true);
    // 정직성: 실 업체명 사칭 0 — "(샘플)" 접두사로 데모 데이터임을 명시.
    expect(out.every((c) => c.name.startsWith("(샘플)"))).toBe(true);
  });
});

describe("hasRealCompetitorSignal", () => {
  it("grounded=true + competitors 1건 이상이면 true", () => {
    const o = baseOutput();
    o.llmValidation = {
      provider: "x",
      grounded: true,
      disclaimer: "d",
      geo: null,
      aeo: null,
      competitors: [{ name: "옆집", mentionedInQueries: 2, source: "gpt_grounded" }],
    };
    expect(hasRealCompetitorSignal(o)).toBe(true);
  });

  it("grounded=true 이라도 이름이 공백뿐이면 false", () => {
    const o = baseOutput();
    o.llmValidation = {
      provider: "x",
      grounded: true,
      disclaimer: "d",
      geo: null,
      aeo: null,
      competitors: [{ name: "   ", mentionedInQueries: 2, source: "gpt_grounded" }],
    };
    expect(hasRealCompetitorSignal(o)).toBe(false);
  });

  it("grounded=false 면 false(학습기억 모드는 근거 아님)", () => {
    const o = baseOutput();
    o.llmValidation = {
      provider: "x",
      grounded: false,
      disclaimer: "d",
      geo: null,
      aeo: null,
      competitors: [{ name: "옆집", mentionedInQueries: 2, source: "gpt_grounded" }],
    };
    expect(hasRealCompetitorSignal(o)).toBe(false);
  });

  it("llmValidation 없으면 false", () => {
    expect(hasRealCompetitorSignal(baseOutput())).toBe(false);
  });
});

describe("deriveCompetitorInput", () => {
  it("grounded 신호가 이름뿐이면 diagnosable target 을 만들지 않고 미측정 상태로 둔다", async () => {
    const o = baseOutput();
    o.llmValidation = {
      provider: "x",
      grounded: true,
      disclaimer: "d",
      geo: null,
      aeo: null,
      competitors: [{ name: "옆집카페", mentionedInQueries: 3, source: "gpt_grounded" }],
    };
    const derived = await deriveCompetitorInput(o, PROFILE);
    expect(derived.hasNoCompetitorData).toBe(false);
    expect(derived.naverCompetitorTop).toHaveLength(0);
    expect(derived.competitorUrls).toEqual([]);
  });

  it("dev + 실 신호 없음 → 샘플 naver_serp 경쟁사 + competitorUrls(S3~S6 실데이터)", async () => {
    const derived = await deriveCompetitorInput(baseOutput(), PROFILE);
    expect(derived.hasNoCompetitorData).toBe(false);
    expect(derived.naverCompetitorTop.length).toBeGreaterThan(0);
    expect(derived.competitorUrls.length).toBeGreaterThan(0);
  });

  it("production + 실 신호 없음 + SERP 미구성(발견 0) → hasNoCompetitorData=true(fail-fast, 가짜 0)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // SERP 발견자를 주입(빈 결과) — 실제 엔진 SERP import 없이 미구성 상황을 모사.
    const derived = await deriveCompetitorInput(baseOutput(), PROFILE, {
      discoverSerp: async () => [],
    });
    expect(derived.hasNoCompetitorData).toBe(true);
    expect(derived.naverCompetitorTop).toHaveLength(0);
    expect(derived.competitorUrls).toHaveLength(0);
  });

  it("production + 실 신호 없음 + SERP 자동발견 성공 → 발견 경쟁사로 채움(OQ-4)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const derived = await deriveCompetitorInput(baseOutput(), PROFILE, {
      selfUrl: "https://me.example.com",
      discoverSerp: async (_profile, selfUrl) => {
        // selfUrl 이 발견자로 전달되는지(자기 제외)도 확인.
        expect(selfUrl).toBe("https://me.example.com");
        return [
          { name: "강남미소카페", rank: 1, query: "강남 카페", source: "naver_serp" },
          { name: "그라운드커피", rank: 2, query: "강남 카페", source: "naver_serp" },
        ];
      },
    });
    expect(derived.hasNoCompetitorData).toBe(false);
    expect(derived.naverCompetitorTop).toHaveLength(2);
    expect(derived.competitorUrls).toContain("naver_serp:강남미소카페");
    expect(derived.competitorUrls).toContain("naver_serp:그라운드커피");
  });

  it("production + grounded 경쟁사 이름만 있으면 SERP 호출 없이 미측정 경쟁사 상태로 남긴다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const o = baseOutput();
    o.llmValidation = {
      provider: "x",
      grounded: true,
      disclaimer: "d",
      geo: null,
      aeo: null,
      competitors: [{ name: "진짜경쟁사", mentionedInQueries: 1, source: "gpt_grounded" }],
    };
    let serpCalled = false;
    const derived = await deriveCompetitorInput(o, PROFILE, {
      discoverSerp: async () => {
        serpCalled = true;
        return [];
      },
    });
    expect(derived.hasNoCompetitorData).toBe(false);
    expect(derived.competitorUrls).toEqual([]);
    // grounded name-only 신호는 이미 원자료이므로 SERP 로 이름을 보강하지 않는다.
    expect(serpCalled).toBe(false);
  });
  it("production + grounded 경쟁사 URL 근거가 있으면 diagnosable URL 을 보존한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const o = baseOutput();
    o.llmValidation = {
      provider: "x",
      grounded: true,
      disclaimer: "d",
      geo: null,
      aeo: null,
      competitors: [
        {
          name: "URL있는경쟁사",
          mentionedInQueries: 1,
          source: "gpt_grounded",
          url: "https://rival.example",
        } as never,
      ],
    };

    const derived = await deriveCompetitorInput(o, PROFILE, {
      discoverSerp: async () => {
        throw new Error("SERP should not be called for grounded URL evidence");
      },
    });

    expect(derived.hasNoCompetitorData).toBe(false);
    expect(derived.competitorUrls).toEqual(["https://rival.example"]);
  });

  it("production + grounded 경쟁사 이름이 공백뿐이면 실 신호로 보지 않고 fail-fast 후보가 된다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const o = baseOutput();
    o.llmValidation = {
      provider: "x",
      grounded: true,
      disclaimer: "d",
      geo: null,
      aeo: null,
      competitors: [{ name: "   ", mentionedInQueries: 1, source: "gpt_grounded" }],
    };

    const derived = await deriveCompetitorInput(o, PROFILE, {
      discoverSerp: async () => [],
    });

    expect(derived.hasNoCompetitorData).toBe(true);
    expect(derived.competitorUrls).toEqual([]);
  });
});
