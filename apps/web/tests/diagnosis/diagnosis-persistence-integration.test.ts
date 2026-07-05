// @TASK P2-PERSIST - 진단 영속화 통합 (DiagnosisJson → 5종 테이블) + GapAnalyzer 라이브 배선
// @SPEC docs/planning/04-database-design.md §3·§4 (영속화 의도·Validation: S2~S6 본 모델만으로 렌더)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출 — API/UI 응답엔 signal만)
// @SPEC x-sag-FR012-competitor-gap-wiring-spec.md (GapAnalyzer 배선: competitorUrls→gap_rows)
// @TEST apps/web/tests/diagnosis/diagnosis-persistence-integration.test.ts
//
// RED→GREEN(실 docker Postgres, mock 파이프라인 — 실외부호출 0):
//   RED : 진단 완주 후 engine_results/competitors/gap_rows/generated_assets/actions 가 비어있음.
//   GREEN: 진단(mock) → 5종 테이블 일관 기록 + route 가 실데이터로 채널/경쟁/갭/행동/생성물 렌더
//          + 점수(number) 비노출(API 응답에 signal만).
//
// 04 §4 Validation: 한 진단이 diagnosis→engine_result→competitor→gap_row→snippet→action 일관 기록.
// DATABASE_URL 없으면 스킵(단위 CI 보호). 잡 파이프라인은 mock 주입(실 크롤/LLM/SERP 0).

import { createDb } from "@boina/db/client";
import {
  accounts,
  actions as actionsTable,
  businesses,
  competitors as competitorsTable,
  engineResults as engineResultsTable,
  gapRows as gapRowsTable,
  generatedAssets as generatedAssetsTable,
} from "@boina/db/schema";
import type { DiagnosisPipelineOutput } from "@boina/engine";
import { DbBackedJobQueue } from "@boina/jobs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildDiagnosisHandler } from "../../lib/diagnosis/diagnosis-handler.js";
import { createDbDiagnosisRepository } from "../../lib/diagnosis/diagnosis-repository.js";

// P3-R1: route 가 PlanTier 를 서버 세션(account.plan)으로 강제한다. 이 통합 테스트는 영속 5종이
// "전체(유료) 뷰"로 렌더됨을 검증하므로, 세션 판정을 paid 로 고정한다(getCurrentUser→cookies()는
// Next 런타임 밖에서 동작하지 않으므로 resolveRequestPlanTier 만 mock — 클라 ?paid=1 은 무시됨이 정상).
// computePaywallMeta 등 나머지 실구현은 그대로 사용한다.
vi.mock("../../lib/diagnosis/plan-tier.js", async (orig) => {
  const actual = await orig<typeof import("../../lib/diagnosis/plan-tier.js")>();
  return {
    ...actual,
    resolveRequestPlanTier: vi.fn(async () => ({
      account: {
        id: "00000000-0000-4000-8000-0000000000ac",
        email: "owner@example.com",
        plan: "pro" as const,
      },
      tier: "paid" as const,
      isPaid: true,
    })),
  };
});

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

function firstOrThrow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) throw new Error(`expected at least one ${label} row`);
  return row;
}

// mock 파이프라인 산출 — 실 외부 호출 0. items/llmValidation 으로 5종 테이블을 채울 원자료를 담는다.
function mockOutput(overall: number): DiagnosisPipelineOutput {
  const iso = new Date().toISOString();
  return {
    crawlResult: { pages: [], partialResult: false, startedAt: iso, completedAt: iso },
    scores: {
      seoScore: overall,
      aeoScore: overall,
      geoScore: overall,
      perfScore: null,
      overallScore: overall,
      scoringVersion: "2.1.0",
    },
    // 진단 항목 — engine_results 원자료 + GapAnalyzer self-report 원자료.
    items: [
      {
        id: "00000000-0000-4000-8000-000000000101",
        code: "GEO_OPENING_HOURS_MISSING",
        category: "geo",
        actionType: "self_fix",
        priority: "high",
        title: "영업시간 미기재",
        description: "영업시간이 안 적혀 있어요",
        evidence: { url: "https://example.com", found: "", expected: "영업시간" },
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
    ],
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
    // grounded AI 경쟁사(competitors 테이블 원자료 — gpt_grounded).
    llmValidation: {
      provider: "mock",
      grounded: true,
      disclaimer: "참고 지표입니다.",
      geo: { mentionRate: 0.5, directMentionRate: 0.2 },
      aeo: { appearanceRate: 0.3, prominenceScore: 0.4 },
      competitors: [
        {
          name: "옆집카페",
          mentionedInQueries: 3,
          sampleQuery: "강남 카페",
          source: "gpt_grounded",
        },
      ],
    },
  };
}

describeDb("진단 영속화 통합 (P2-PERSIST, mock 엔진, docker PG)", () => {
  let db: ReturnType<typeof createDb>;
  let accountId: string;
  let businessId: string;
  let diagnosisId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const acc = firstOrThrow(
      await db
        .insert(accounts)
        .values({ email: `persist-${suffix}@example.com`, passwordHash: "x" })
        .returning({ id: accounts.id }),
      "account",
    );
    accountId = acc.id;
    const biz = firstOrThrow(
      await db
        .insert(businesses)
        .values({ accountId, name: `Persist store ${suffix}`, region: "서울 강남구" })
        .returning({ id: businesses.id }),
      "business",
    );
    businessId = biz.id;

    // 진단 1건 enqueue → drain (mock 파이프라인). 영속화 핸들러가 5종 테이블을 채워야 한다.
    const repo = createDbDiagnosisRepository(db);
    const created = await repo.create({ businessId });
    diagnosisId = created.id;

    const runPipeline = vi.fn().mockResolvedValue(mockOutput(82));
    const handler = buildDiagnosisHandler({ repo, runPipeline, db });

    const queue = new DbBackedJobQueue(db);
    queue.process("diagnosis", handler);
    await queue.enqueue({
      type: "diagnosis",
      diagnosisId,
      payload: {
        diagnosisId,
        target: "https://example.com",
        businessProfile: {
          businessName: "테스트가게",
          industry: "cafe",
          region: "서울 강남구",
          mainServices: ["커피"],
          targetKeywords: ["강남 카페"],
        },
        modules: ["seo", "aeo", "geo"],
        // 수동 competitorUrls — GapAnalyzer 라이브 호출 트리거(자동발견 SERP 0).
        competitorUrls: ["https://competitor.example"],
      },
    });
    const processed = await queue.drain();
    expect(processed).toBe(1);
    expect(runPipeline).toHaveBeenCalledTimes(1);
  });

  afterAll(async () => {
    if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it("engine_results: 진단 항목이 채널별(naver/google/ai_citation)·카테고리별로 저장된다", async () => {
    const rows = await db
      .select()
      .from(engineResultsTable)
      .where(eq(engineResultsTable.diagnosisId, diagnosisId));
    expect(rows.length).toBeGreaterThan(0);
    // 04 §3: channel 컬럼 채워짐(naver/google/ai_citation).
    for (const r of rows) {
      expect(["naver", "google", "ai_citation"]).toContain(r.channel);
      expect(["seo", "aeo", "geo", "a11y", "backlink", "perf"]).toContain(r.category);
    }
    // 점수는 내부 저장(impactScore) — DB엔 있으나 API 응답으로는 안 나간다(별 테스트에서 검증).
    expect(rows.some((r) => r.impactScore !== null)).toBe(true);
  });

  it("competitors: grounded AI 경쟁사(gpt_grounded)가 저장된다(추측 0)", async () => {
    const rows = await db
      .select()
      .from(competitorsTable)
      .where(eq(competitorsTable.diagnosisId, diagnosisId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.source === "gpt_grounded")).toBe(true);
    expect(rows.some((r) => r.name === "옆집카페")).toBe(true);
  });

  it("gap_rows: GapAnalyzer 라이브 산출(competitorUrls→GapResult)이 저장된다", async () => {
    const comps = await db
      .select({ id: competitorsTable.id })
      .from(competitorsTable)
      .where(eq(competitorsTable.diagnosisId, diagnosisId));
    expect(comps.length).toBeGreaterThan(0);
    // 어느 competitor 라도 gap_row 가 연결돼 있어야 한다(competitor_id FK).
    let total = 0;
    for (const c of comps) {
      const g = await db.select().from(gapRowsTable).where(eq(gapRowsTable.competitorId, c.id));
      total += g.length;
    }
    expect(total).toBeGreaterThan(0);
  });

  it("generated_assets: 생성물(snippet 4종)이 저장된다", async () => {
    const rows = await db
      .select()
      .from(generatedAssetsTable)
      .where(eq(generatedAssetsTable.diagnosisId, diagnosisId));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(typeof r.code).toBe("string");
      expect(r.code.length).toBeGreaterThan(0);
    }
  });

  it("actions: 4분류 + '오늘 딱 하나'가 저장된다(정확히 1개 todayOne)", async () => {
    const rows = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.diagnosisId, diagnosisId));
    expect(rows.length).toBeGreaterThan(0);
    const todayOnes = rows.filter((r) => r.isTodayOne === true);
    expect(todayOnes.length).toBe(1);
  });

  it("04 §4 일관 기록: diagnosis→engine_result→competitor→gap_row→snippet→action 모두 1건 이상", async () => {
    const [er, comp, ga, act] = await Promise.all([
      db.select().from(engineResultsTable).where(eq(engineResultsTable.diagnosisId, diagnosisId)),
      db.select().from(competitorsTable).where(eq(competitorsTable.diagnosisId, diagnosisId)),
      db
        .select()
        .from(generatedAssetsTable)
        .where(eq(generatedAssetsTable.diagnosisId, diagnosisId)),
      db.select().from(actionsTable).where(eq(actionsTable.diagnosisId, diagnosisId)),
    ]);
    expect(er.length).toBeGreaterThan(0);
    expect(comp.length).toBeGreaterThan(0);
    expect(ga.length).toBeGreaterThan(0);
    expect(act.length).toBeGreaterThan(0);
  });

  // ── 04 §4 Validation: 화면 4종(S2~S6)이 본 모델만으로 렌더 가능 + 점수 비노출(07 §4) ──
  // route 핸들러를 실 영속 데이터로 직접 호출(Next 런타임 없이). DATABASE_URL 로 실 DB 읽기.

  function noScoreLeak(obj: unknown): void {
    // 응답 JSON 전체에 점수(number 라벨/점) 노출 0 — signal 만(07 §4).
    const s = JSON.stringify(obj);
    expect(s).not.toMatch(/"impactScore"/);
    expect(s).not.toMatch(/"overallScore"/);
    expect(s).not.toMatch(/\d{1,3}\s*점/);
  }

  it("S2 채널: GET /api/channel-status 가 영속 engine_results 실데이터로 렌더(점수 비노출)", async () => {
    const { GET } = await import("../../app/api/channel-status/route.js");
    const res = await GET(
      new Request(`http://localhost/api/channel-status?diagnosisId=${diagnosisId}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { channels: Array<{ channel: string; signal: string; summaryLine: string }> };
    };
    expect(body.data.channels.map((c) => c.channel).sort()).toEqual(["ai", "google", "naver"]);
    // ai 게이팅: grounded 실인용 근거 없음 → green 불가.
    expect(body.data.channels.find((c) => c.channel === "ai")?.signal).not.toBe("green");
    noScoreLeak(body);
  });

  it("S3 경쟁: GET /api/competitor 가 영속 competitors 실데이터로 렌더(옆집카페)", async () => {
    const { GET } = await import("../../app/api/competitor/route.js");
    const res = await GET(
      new Request(`http://localhost/api/competitor?diagnosisId=${diagnosisId}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        competitors: Array<{ name: string; channel: string; source: string }>;
        headline: string;
      };
    };
    expect(body.data.competitors.length).toBeGreaterThan(0);
    expect(body.data.competitors.some((c) => c.name === "옆집카페")).toBe(true);
    noScoreLeak(body);
  });

  it("S4 갭: GET /api/gap 가 영속 gap_rows 실데이터로 렌더(룰 코드값 비노출)", async () => {
    const { GET } = await import("../../app/api/gap/route.js");
    // 경계는 서버 세션(paid mock)으로 결정 — 쿼리 ?paid 는 무시됨(보안). 전체 갭이 렌더됨.
    const res = await GET(new Request(`http://localhost/api/gap?diagnosisId=${diagnosisId}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { items: Array<{ label: string }>; intro: string };
    };
    expect(body.data.items.length).toBeGreaterThan(0);
    // 룰 코드값(SEO-TITLE-001 류) 노출 0.
    for (const it of body.data.items) {
      expect(it.label).not.toMatch(/[A-Z]{2,}-[A-Z0-9-]*-?\d{2,}/);
    }
    noScoreLeak(body);
  });

  it("S5 행동: GET /api/action 가 영속 gap → 4분류 + 오늘 딱 하나(정확히 1개)", async () => {
    const { GET } = await import("../../app/api/action/route.js");
    // 경계는 서버 세션(paid mock)으로 결정 — 쿼리 ?paid 는 무시됨(보안). 전체 행동이 렌더됨.
    const res = await GET(new Request(`http://localhost/api/action?diagnosisId=${diagnosisId}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        actions: Array<{ title: string; tier: string; isTodayOne: boolean }>;
        todayOne: { title: string } | null;
      };
    };
    expect(body.data.actions.length).toBeGreaterThan(0);
    expect(body.data.actions.filter((a) => a.isTodayOne).length).toBe(1);
    expect(body.data.todayOne).not.toBeNull();
    noScoreLeak(body);
  });

  it("S6 생성물: GET /api/generated-asset 가 영속 generated_assets 실데이터로 렌더(복붙)", async () => {
    const { GET } = await import("../../app/api/generated-asset/route.js");
    // 경계는 서버 세션(paid mock)으로 결정 — 쿼리 ?paid 는 무시됨(보안). 전체 생성물이 렌더됨.
    const res = await GET(
      new Request(`http://localhost/api/generated-asset?diagnosisId=${diagnosisId}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { assets: Array<{ type: string; title: string; content: string; copyable: boolean }> };
    };
    expect(body.data.assets.length).toBeGreaterThan(0);
    for (const a of body.data.assets) {
      expect(["snippet", "place_intro", "review_request", "vendor_prescription"]).toContain(a.type);
      expect(a.copyable).toBe(true);
      expect(a.content.length).toBeGreaterThan(0);
    }
    noScoreLeak(body);
  });
});
