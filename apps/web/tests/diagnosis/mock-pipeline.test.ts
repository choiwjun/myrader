// @TASK dev-mock-pipeline - dev/실키없음 진단 파이프라인 mock 완주 (RED→GREEN)
// @SPEC docs/planning/02-trd.md §2 (데이터소스·비용 게이팅 — 실키 없으면 mock 완주, 실외부호출 0)
// @SPEC apps/web/lib/shared/runtime-env.ts (isMockFallbackAllowed — production 아니면 mock 허용)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출 / "(샘플)" 정직성 표기)
// @TEST apps/web/tests/diagnosis/mock-pipeline.test.ts
//
// 버그(브라우저 실사용): dev 서버에서 진단이 항상 failed — defaultRunPipeline 이 dev 에서도
// 실 @boina/engine.runDiagnosisPipeline 을 호출해 mock 후보의 가짜 place.naver.com URL 을
// 실제 크롤하려다 죽었다. place-search·경쟁사는 mock 인데 진단 파이프라인 자체는 mock 아님.
//
// 이 테스트는 dev-mock 파이프라인이:
//   1. 5종 테이블을 채울 충분한 산출(엔진 출력 타입 형태)을 반환하고,
//   2. "작은 가게" 현실 시나리오(네이버 일부/구글 맛보기/AI 미인용/경쟁사/갭 4~6/행동 4분류/생성물),
//   3. "(샘플)" 정직성 표기 + 점수 비노출 규율을 지키는지 고정한다.

import type { DiagnosisPipelineInput } from "@boina/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type DiagnosisJobPayload,
  buildDiagnosisHandler,
} from "../../lib/diagnosis/diagnosis-handler.js";
import { categoryToChannel, mapEngineResults } from "../../lib/diagnosis/diagnosis-persistence.js";
import type {
  DiagnosisRecord,
  DiagnosisRepository,
} from "../../lib/diagnosis/diagnosis-service.js";
import type { SelfReportLike } from "../../lib/diagnosis/gap-service.js";
import {
  MockGapAnalyzer,
  buildMockAssetFaqs,
  buildMockDiagnosisOutput,
  isMockSampleItem,
} from "../../lib/diagnosis/mock-pipeline.js";

const INPUT: DiagnosisPipelineInput = {
  startUrl: "https://place.naver.com/restaurant/1",
  sourceType: "naver_place",
  businessProfile: {
    businessName: "동네분식",
    industry: "분식집",
    region: "서울 마포구",
    mainServices: ["떡볶이", "김밥"],
    targetKeywords: ["마포 분식"],
  },
  modules: ["seo", "aeo", "geo"],
  enableLlmValidation: false,
  enableAiRecommendation: false,
};

describe("dev-mock 진단 파이프라인 (실키 없이 completed 완주)", () => {
  it("실 크롤/엔진 없이 결정적 DiagnosisPipelineOutput 을 반환한다(partialResult=false, completed 가능)", () => {
    const a = buildMockDiagnosisOutput(INPUT);
    const b = buildMockDiagnosisOutput(INPUT);
    // 결정적(동일 입력 → 동일 산출 — 크롤 무작위/외부호출 0).
    expect(a.partialResult).toBe(false);
    expect(a.items.map((i) => i.code)).toEqual(b.items.map((i) => i.code));
    // 크롤 결과는 빈 pages 가 아니어도(샘플 surface) 무방하나, 핵심은 partialResult=false 로
    // 핸들러가 completed 로 마감할 수 있어야 한다.
    expect(a.scores.overallScore).toBeGreaterThanOrEqual(0);
    expect(a.scores.overallScore).toBeLessThanOrEqual(100);
  });

  it("갭 4~6개를 만들 수 있는 미통과 항목(items)을 4종 행동분류에 걸쳐 산출한다", () => {
    const out = buildMockDiagnosisOutput(INPUT);
    const codes = new Set(out.items.map((i) => i.code));
    // gap_rows = 고유 ruleId(code) 개수(self=미통과, 경쟁사=통과 가정). 4~6개.
    expect(codes.size).toBeGreaterThanOrEqual(4);
    expect(codes.size).toBeLessThanOrEqual(6);
    // 행동 4분류 토대: self_fix / snippet_action / vendor_action / si_action 모두 등장.
    const actionTypes = new Set(out.items.map((i) => i.actionType));
    expect(actionTypes.has("self_fix")).toBe(true);
    expect(actionTypes.has("snippet_action")).toBe(true);
    expect(actionTypes.has("vendor_action")).toBe(true);
    expect(actionTypes.has("si_action")).toBe(true);
  });

  it("채널 신호: naver(geo)·google(seo)·ai_citation(aeo) 3채널에 항목이 분산된다(S2 신호등)", () => {
    const out = buildMockDiagnosisOutput(INPUT);
    const channels = new Set(out.items.map((i) => categoryToChannel(i.category)));
    expect(channels.has("naver")).toBe(true);
    expect(channels.has("google")).toBe(true);
    expect(channels.has("ai_citation")).toBe(true);
  });

  it("AI 아직 미인용: llmValidation 은 grounded 실인용을 만들지 않는다(red/yellow 게이팅 유지)", () => {
    const out = buildMockDiagnosisOutput(INPUT);
    // grounded 실인용(언급률>0)을 위조하지 않는다 — AI 채널 green 사칭 0(정직성).
    if (out.llmValidation) {
      expect(out.llmValidation.grounded).toBe(false);
    }
  });

  it("'(샘플)' 정직성: 항목 제목/설명에 샘플 표기가 있어 가짜 실측으로 오인되지 않는다", () => {
    const out = buildMockDiagnosisOutput(INPUT);
    // 적어도 항목이 샘플임을 식별할 수 있어야 한다(R2-A 패턴).
    expect(out.items.every((i) => isMockSampleItem(i))).toBe(true);
  });
  it("'(샘플)' 정직성: 샘플 표면도 명시해 경쟁사 갭 근거를 가짜 실측으로 오인시키지 않는다", () => {
    const out = buildMockDiagnosisOutput(INPUT);
    const surface = out.businessPresence.surfaces[0];

    expect(surface?.status).toBe("fetched");
    expect(surface?.sourceLabel).toContain("(샘플)");
    expect(surface?.description).toContain("(샘플)");
  });

  it("점수 비노출 규율: engine_results 매퍼가 impactScore 를 내부 저장만 한다(매퍼 통과)", () => {
    const out = buildMockDiagnosisOutput(INPUT);
    const rows = mapEngineResults("diag-mock", out.items);
    expect(rows.length).toBe(out.items.length);
    // 채널/카테고리가 올바르게 매핑되어 5종 테이블 영속화 입력으로 쓸 수 있다.
    expect(rows.every((r) => ["naver", "google", "ai_citation"].includes(r.channel))).toBe(true);
  });

  it("생성물 4종 토대: 샘플 FAQ 가 있어 snippet 까지 4종이 생성될 수 있다", () => {
    const faqs = buildMockAssetFaqs("동네분식");
    expect(faqs.length).toBeGreaterThan(0);
    // FAQ 본문은 "(샘플)" 표기(정직성).
    expect(faqs.every((f) => f.answer.includes("(샘플)"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MockGapAnalyzer — webpack-safe 폴백(엔진 GapAnalyzer 동형 알고리즘)
// ---------------------------------------------------------------------------

describe("MockGapAnalyzer (dev 폴백 — 경쟁사 우위 갭 산출)", () => {
  it("self=미통과 / 경쟁사=통과 → 각 룰이 경쟁사 우위 갭(gap>0)으로 드러난다", () => {
    const out = buildMockDiagnosisOutput(INPUT);
    const selfReport: SelfReportLike = {
      reportId: "r1",
      websiteUrl: INPUT.startUrl,
      diagnosisItems: out.items.map((it) => ({
        ruleId: it.code,
        category: it.category === "geo" ? "geo" : it.category === "aeo" ? "aeo" : "seo",
        passed: false,
        actionType: it.actionType,
        priority: it.priority,
      })),
    };
    const competitors = [
      {
        competitorUrl: "naver_serp:(샘플) 1위 가게",
        diagnosisItems: selfReport.diagnosisItems.map((d) => ({
          ruleId: d.ruleId,
          category: d.category,
          passed: true,
        })),
      },
    ];
    const result = new MockGapAnalyzer().analyze({ selfReport, competitors });
    // 경쟁사 우위(gap>0) 항목이 self 항목 수만큼 드러난다(전부 경쟁사 통과/내 미통과).
    const advantage = result.matrix.filter((r) => r.gap > 0);
    expect(advantage.length).toBe(out.items.length);
    // 우선순위 Top5 도 산출된다(행동 카드 토대).
    expect(result.priorities.length).toBeGreaterThan(0);
    expect(result.priorities.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// 핸들러 배선: defaultRunPipeline 이 dev/test(실키없음)에서 실 엔진 대신 mock 으로 완주
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.unstubAllEnvs();
});

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

const PAYLOAD: DiagnosisJobPayload = {
  diagnosisId: "diag-1",
  businessId: "biz-1",
  target: "https://place.naver.com/restaurant/1",
  sourceType: "naver_place",
  businessProfile: {
    businessName: "동네분식",
    industry: "분식집",
    region: "서울 마포구",
    mainServices: ["떡볶이"],
    targetKeywords: ["마포 분식"],
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

describe("defaultRunPipeline 환경 분기 (실키없음 → mock 완주, 실 크롤 0)", () => {
  it("dev/test(실키없음): runPipeline 미주입이어도 진단이 completed 로 완주한다(가짜 URL 실크롤 0)", async () => {
    vi.stubEnv("NODE_ENV", "test"); // isMockFallbackAllowed=true.
    const repo = makeFakeRepo();
    // runPipeline 미주입 → defaultRunPipeline 사용. db 미주입(단위) — 점수/요약만 반영.
    const handler = buildDiagnosisHandler({ repo });
    await handler(fakeJob(PAYLOAD));

    const row = await repo.findById("diag-1");
    // 실 엔진이 가짜 place.naver.com 을 크롤하다 죽지 않고 mock 으로 완주 → completed.
    expect(row?.status).toBe("completed");
    expect(row?.completedAt).not.toBeNull();
  });
});
