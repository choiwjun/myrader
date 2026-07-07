// @TASK P1-R2 - 진단 파이프라인 배선 테스트 (RED→GREEN, mock 엔진 — 실외부호출 0)
// @SPEC docs/planning/02-trd.md §2 (데이터소스·비용 게이팅) / §3 (잡 상태)
// @SPEC docs/planning/07-coding-convention.md §2 (엔진 경계: contracts 타입만)
//
// 핵심 검증(REQ-002): enqueue → 잡 워커가 파이프라인 실행 → DiagnosisJson 산출 →
// diagnoses 행에 overallSignal/status 반영. 실패 시 failed 전이.
//
// 실외부호출 0: runDiagnosisPipeline 을 mock 으로 주입한다(엔진 export 시그니처는
// engine-integration 스모크가 별도로 보장). 비용 게이팅은 차단 게이트 주입으로 검증.

import type { DbClient } from "@boina/db/client";
import type { DiagnosisPipelineOutput } from "@boina/engine";
import { describe, expect, it, vi } from "vitest";
import {
  type DiagnosisJobPayload,
  buildDiagnosisHandler,
} from "../../lib/diagnosis/diagnosis-handler.js";
import type {
  DiagnosisRecord,
  DiagnosisRepository,
} from "../../lib/diagnosis/diagnosis-service.js";
import { MockGapAnalyzer } from "../../lib/diagnosis/mock-pipeline.js";

function makeFakeRepo(): DiagnosisRepository & { rows: Map<string, DiagnosisRecord> } {
  const rows = new Map<string, DiagnosisRecord>();
  const now = new Date();
  rows.set("diag-1", {
    id: "diag-1",
    businessId: "biz-1",
    status: "running",
    overallScore: null,
    summaryText: null,
    crawlFailureReason: null,
    jobPayload: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });
  return {
    rows,
    async create(input) {
      const rec: DiagnosisRecord = {
        id: "new",
        businessId: input.businessId,
        status: "queued",
        overallScore: null,
        summaryText: null,
        crawlFailureReason: null,
        jobPayload: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      rows.set(rec.id, rec);
      return rec;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async update(id, patch) {
      const cur = rows.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: new Date() };
      rows.set(id, next);
      return next;
    },
  };
}

/** 결정적 mock 파이프라인 산출 (overallScore 82 → 신호등 good). 실 크롤/엔진 미실행. */
function mockPipelineOutput(overall: number): DiagnosisPipelineOutput {
  return {
    crawlResult: {
      pages: [],
      partialResult: false,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    scores: {
      seoScore: overall,
      aeoScore: overall,
      geoScore: overall,
      perfScore: null,
      overallScore: overall,
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

const SAMPLE_ITEMS: DiagnosisPipelineOutput["items"] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    code: "GEO_OPENING_HOURS_MISSING",
    category: "geo",
    actionType: "self_fix",
    priority: "high",
    title: "영업시간 미기재",
    description: "영업시간이 안 적혀 있어요",
    evidence: { url: "https://example.com", expected: "영업시간" },
    impactScore: 30,
    difficulty: "easy",
    expectedEffect: "검색 노출에 도움",
    isAiGenerated: false,
    recommendationText: null,
    relatedSnippetType: null,
    pageUrl: "https://example.com",
    ruleVersion: "1.0.0",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    code: "SEO_TITLE_MISSING",
    category: "seo",
    actionType: "snippet_action",
    priority: "medium",
    title: "제목 누락",
    description: "가게 이름표가 빠져 있어요",
    evidence: { url: "https://example.com" },
    impactScore: 20,
    difficulty: "medium",
    expectedEffect: "소개에 도움",
    isAiGenerated: false,
    recommendationText: null,
    relatedSnippetType: "FAQ_HTML",
    pageUrl: "https://example.com",
    ruleVersion: "1.0.0",
  },
];

function makeFakeInsertDb(inserted: unknown[][]): DbClient {
  return {
    insert: () => ({
      values(values: unknown[] | unknown) {
        const rows = Array.isArray(values) ? values : [values];
        inserted.push(rows);
        return {
          async returning() {
            return rows.map((_, i) => ({ id: `inserted-${inserted.length}-${i}` }));
          },
        };
      },
    }),
  } as unknown as DbClient;
}

const PAYLOAD: DiagnosisJobPayload = {
  diagnosisId: "diag-1",
  businessId: "biz-1",
  target: "https://example.com",
  businessProfile: {
    businessName: "테스트가게",
    industry: "cafe",
    region: "서울 강남구",
    mainServices: ["커피"],
    targetKeywords: ["강남 카페"],
  },
  modules: ["seo", "aeo", "geo"],
};

function fakeJob(payload: DiagnosisJobPayload) {
  return {
    id: "diag-1",
    type: "diagnosis",
    payload,
    diagnosisId: "diag-1",
    status: "running" as const,
    attempts: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("진단 파이프라인 배선 (P1-R2, mock 엔진)", () => {
  it("핸들러가 production scoring 기본값 결함을 막기 위해 graded scoring 을 명시하고 DiagnosisJson 결과를 diagnoses 행에 반영한다", async () => {
    const repo = makeFakeRepo();
    const runPipeline = vi.fn().mockResolvedValue(mockPipelineOutput(82));

    const handler = buildDiagnosisHandler({ repo, runPipeline });
    await handler(fakeJob(PAYLOAD));

    expect(runPipeline).toHaveBeenCalledTimes(1);
    const passedInput = runPipeline.mock.calls[0]?.[0] as { scoringMode?: unknown };
    expect(passedInput.scoringMode).toBe("graded");
    const row = await repo.findById("diag-1");
    expect(row?.status).toBe("completed");
    // 엔진 점수(82) → diagnoses.overallScore 반영, completedAt stamp.
    expect(row?.overallScore).toBe("82");
    expect(row?.completedAt).not.toBeNull();
  });

  it("파이프라인 throw → 핸들러도 throw (큐가 failed 전이) + diagnoses.status=failed 반영", async () => {
    const repo = makeFakeRepo();
    const runPipeline = vi.fn().mockRejectedValue(new Error("crawl exploded"));

    const handler = buildDiagnosisHandler({ repo, runPipeline });
    await expect(handler(fakeJob(PAYLOAD))).rejects.toThrow();

    const row = await repo.findById("diag-1");
    expect(row?.status).toBe("failed");
    expect(row?.completedAt).not.toBeNull();
  });

  it("diagnosisId 는 있지만 businessProfile 이 누락된 malformed 잡은 파이프라인을 건너뛰지 않고 failed 로 전이한 뒤 reject 한다", async () => {
    const repo = makeFakeRepo();
    const runPipeline = vi.fn().mockResolvedValue(mockPipelineOutput(82));
    const malformedPayload = {
      ...PAYLOAD,
      businessProfile: undefined,
    } as unknown as DiagnosisJobPayload;

    const handler = buildDiagnosisHandler({ repo, runPipeline });
    await expect(handler(fakeJob(malformedPayload))).rejects.toThrow(/businessProfile/);

    expect(runPipeline).not.toHaveBeenCalled();
    const row = await repo.findById("diag-1");
    expect(row?.status).toBe("failed");
    expect(row?.completedAt).not.toBeNull();
  });

  it("diagnosisId 가 누락된 malformed 잡도 success 반환 없이 reject 한다", async () => {
    const repo = makeFakeRepo();
    const runPipeline = vi.fn().mockResolvedValue(mockPipelineOutput(82));
    const malformedPayload = {
      ...PAYLOAD,
      diagnosisId: undefined,
    } as unknown as DiagnosisJobPayload;

    const handler = buildDiagnosisHandler({ repo, runPipeline });
    await expect(handler(fakeJob(malformedPayload))).rejects.toThrow(/diagnosisId/);

    expect(runPipeline).not.toHaveBeenCalled();
    const row = await repo.findById("diag-1");
    expect(row?.status).toBe("running");
  });

  it("비용 게이팅: 게이트 차단 시 llmValidation/grounded 비활성(실외부호출 0)으로 파이프라인 실행하되 scoringMode 는 graded 유지", async () => {
    const repo = makeFakeRepo();
    const runPipeline = vi.fn().mockResolvedValue(mockPipelineOutput(70));

    // 차단 게이트: 항상 deny → 파이프라인 입력에서 enableLlmValidation=false 강제.
    const denyGate = vi
      .fn()
      .mockResolvedValue({ allowed: false, reason: "budget", fallback: "skip" });

    const handler = buildDiagnosisHandler({ repo, runPipeline, costGate: denyGate });
    await handler(fakeJob({ ...PAYLOAD, requestLlmValidation: true }));

    // 게이트가 호출되었고(비용 작업 보호), 파이프라인은 grounded/llm 비활성으로 받았다.
    expect(denyGate).toHaveBeenCalled();
    const passedInput = runPipeline.mock.calls[0]?.[0] as {
      enableLlmValidation?: boolean;
      scoringMode?: unknown;
    };
    expect(passedInput.enableLlmValidation).toBe(false);
    expect(passedInput.scoringMode).toBe("graded");
    const row = await repo.findById("diag-1");
    const storedGate = row?.jobPayload?.costGate as
      | { llmValidation?: { allowed?: boolean; reason?: string; fallback?: string } }
      | undefined;
    expect(storedGate?.llmValidation).toMatchObject({
      allowed: false,
      reason: "budget",
      fallback: "skip",
    });
  });

  it("비용 게이팅 허용 + LLM 미요청: 기본은 llmValidation 비활성(무분별 호출 금지)", async () => {
    const repo = makeFakeRepo();
    const runPipeline = vi.fn().mockResolvedValue(mockPipelineOutput(60));
    const allowGate = vi.fn().mockResolvedValue({ allowed: true, reason: "ok" });

    const handler = buildDiagnosisHandler({ repo, runPipeline, costGate: allowGate });
    await handler(fakeJob(PAYLOAD)); // requestLlmValidation 미지정

    const passedInput = runPipeline.mock.calls[0]?.[0] as { enableLlmValidation?: boolean };
    expect(passedInput.enableLlmValidation).toBe(false);
    const row = await repo.findById("diag-1");
    const storedGate = row?.jobPayload?.costGate as
      | { llmValidation?: { requested?: boolean; allowed?: boolean; reason?: string } }
      | undefined;
    expect(storedGate?.llmValidation).toMatchObject({
      requested: false,
      allowed: false,
      reason: "not_requested:llm_validation",
    });
  });
  it("경쟁사 재진단은 LLM 검증을 끄고 실패한 경쟁사는 건너뛰며 성공한 리포트로 gap/action 을 저장한다", async () => {
    const repo = makeFakeRepo();
    const inserted: unknown[][] = [];
    const db = makeFakeInsertDb(inserted);
    const selfOutput: DiagnosisPipelineOutput = {
      ...mockPipelineOutput(82),
      items: SAMPLE_ITEMS,
    };
    const competitorOutput: DiagnosisPipelineOutput = {
      ...mockPipelineOutput(91),
      items: SAMPLE_ITEMS.slice(0, 1),
    };
    competitorOutput.businessPresence.surfaces = [
      {
        sourceType: "website",
        url: "https://good.example",
        status: "fetched",
        sourceLabel: "경쟁사 사이트",
        services: ["커피"],
        limitations: [],
      },
    ];
    const runPipeline = vi
      .fn()
      .mockResolvedValueOnce(selfOutput)
      .mockRejectedValueOnce(new Error("competitor failed"))
      .mockResolvedValueOnce(competitorOutput);
    const allowGate = vi.fn().mockResolvedValue({ allowed: true, reason: "ok" });

    const handler = buildDiagnosisHandler({
      repo,
      runPipeline,
      costGate: allowGate,
      db,
      gapAnalyzer: new MockGapAnalyzer(),
    });
    await handler(
      fakeJob({
        ...PAYLOAD,
        requestLlmValidation: true,
        competitorUrls: ["https://bad.example", "https://good.example"],
      }),
    );

    expect(runPipeline).toHaveBeenCalledTimes(3);
    expect(
      (runPipeline.mock.calls[0]?.[0] as { enableLlmValidation?: boolean }).enableLlmValidation,
    ).toBe(true);
    expect(
      (runPipeline.mock.calls[1]?.[0] as { enableLlmValidation?: boolean }).enableLlmValidation,
    ).toBe(false);
    expect(
      (runPipeline.mock.calls[2]?.[0] as { enableLlmValidation?: boolean }).enableLlmValidation,
    ).toBe(false);
    expect(inserted.some((rows) => rows.some((row) => "isTodayOne" in (row as object)))).toBe(true);
    const row = await repo.findById("diag-1");
    expect(row?.status).toBe("completed");
  });

  it("production 에서 신뢰 경쟁사도 수동 경쟁사도 없으면 fake gap 없이 failed 로 전이한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const repo = makeFakeRepo();
      const inserted: unknown[][] = [];
      const runPipeline = vi.fn().mockResolvedValue(mockPipelineOutput(72));
      const handler = buildDiagnosisHandler({
        repo,
        runPipeline,
        db: makeFakeInsertDb(inserted),
        gapAnalyzer: new MockGapAnalyzer(),
        discoverSerp: async () => [],
      });

      await expect(handler(fakeJob(PAYLOAD))).rejects.toThrow(/no trusted competitor signal/);
      expect(runPipeline).toHaveBeenCalledTimes(1);
      expect(inserted).toHaveLength(0);
      const row = await repo.findById("diag-1");
      expect(row?.status).toBe("failed");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
