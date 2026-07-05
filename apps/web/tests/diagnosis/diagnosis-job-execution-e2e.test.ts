// @TASK 수정R2-A-4 - 잡 실행 E2E (회귀 가드: 프로덕션 트리거 경로로 진단이 실제 완주하는지)
// @SPEC docs/planning/02-trd.md §3 (잡 상태 → diagnosis) / 04 §4 (5종 테이블 일관 기록)
// @SPEC apps/web/lib/jobs.ts (DbBacked + 백그라운드 drain + /api/jobs/process 트리거)
// @TEST apps/web/tests/diagnosis/diagnosis-job-execution-e2e.test.ts
//
// ★ 이 테스트가 잡았어야 할 출시차단 결함: drain() 을 호출하는 주체가 프로덕션에 없어서
//   모든 진단이 영구 queued 로 남았다(테스트가 drain 을 *직접* 호출해 결함을 못 봤음).
//   → 본 E2E 는 drain 을 직접 호출하지 않고, **프로덕션과 동일한 트리거 경로**
//      (POST /api/diagnosis 의 백그라운드 drain + GET /api/jobs/process cron 트리거)로
//      진단이 queued→running→completed 로 완주하고 5종 테이블이 채워지는지 검증한다.
//
// 엔진은 mock(@boina/engine.runDiagnosisPipeline) 으로 결정화한다(실 크롤/LLM/SERP 0). 단,
// 잡 큐·핸들러·영속화·route 는 모두 *실 프로덕션 코드 경로*를 그대로 통과한다(드레인 호출자
// 부재를 잡도록 — handler/queue/route 를 우회하지 않는다). docker PG 로 실제 상태 전이 검증.

import { createDb } from "@boina/db/client";
import {
  accounts,
  actions as actionsTable,
  businesses,
  competitors as competitorsTable,
  diagnoses,
  engineResults as engineResultsTable,
  gapRows as gapRowsTable,
} from "@boina/db/schema";
import type { DiagnosisPipelineOutput } from "@boina/engine";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ── 엔진 mock: 실 크롤/LLM 0. 핸들러의 defaultRunPipeline(@boina/engine lazy import)이 이 값을 받는다.
//    items 가 있어야 GapAnalyzer self-report → gap_rows → actions 가 산출된다(S4/S5 실데이터).
const mockPipelineOutput: DiagnosisPipelineOutput = {
  crawlResult: {
    pages: [],
    partialResult: false,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  },
  scores: {
    seoScore: 72,
    aeoScore: 72,
    geoScore: 72,
    perfScore: null,
    overallScore: 72,
    scoringVersion: "2.1.0",
  },
  items: [
    {
      id: "00000000-0000-4000-8000-0000000003a1",
      code: "GEO_OPENING_HOURS_MISSING",
      category: "geo",
      actionType: "self_fix",
      priority: "high",
      title: "영업시간 미기재",
      description: "영업시간이 안 적혀 있어요",
      evidence: { url: "https://example.com" },
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
      id: "00000000-0000-4000-8000-0000000003a2",
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
    primarySourceType: "naver_place",
    primaryUrl: "https://place.naver.com/restaurant/1",
    canonicalName: null,
    services: [],
    surfaces: [],
    limitations: [],
  },
};

vi.mock("@boina/engine", async (orig) => {
  const actual = await orig<typeof import("@boina/engine")>();
  return {
    ...actual,
    runDiagnosisPipeline: vi.fn(async () => mockPipelineOutput),
  };
});

// P3-R1: gap/action route 는 서버 세션(account.plan)으로 PlanTier 를 강제한다. 영속 5종이 전체(유료)
// 뷰로 렌더됨을 검증하므로 세션 판정을 paid 로 고정한다(Next 런타임 밖 — resolveRequestPlanTier mock).
vi.mock("../../lib/diagnosis/plan-tier.js", async (orig) => {
  const actual = await orig<typeof import("../../lib/diagnosis/plan-tier.js")>();
  return {
    ...actual,
    resolveRequestPlanTier: vi.fn(async () => ({
      account: {
        id: "00000000-0000-4000-8000-0000000000ac",
        email: "o@e.com",
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * queued/running 이 끝날 때까지 process route 트리거(cron 경로)를 폴링한다(직접 drain 금지).
 *
 * 라운드 사이에 짧은 지연을 둔다: enqueue 직후 백그라운드 drain(같은 프로세스)이 잡을 claim 해
 * running 으로 만든 뒤 비동기로 완주하는 중일 수 있으므로, in-flight 핸들러가 정착할 시간을 준다.
 * (process 트리거와 백그라운드 drain 은 멱등 claim 으로 같은 잡을 2회 처리하지 않는다.)
 */
async function pumpUntilSettled(
  triggerProcess: () => Promise<void>,
  readStatus: () => Promise<string>,
  maxRounds = 40,
): Promise<string> {
  for (let i = 0; i < maxRounds; i++) {
    const status = await readStatus();
    if (status !== "queued" && status !== "running") return status;
    // queued 면 cron 트리거로 처리를 민다(고아 잡 복구 경로). running 이면 in-flight 대기.
    if (status === "queued") await triggerProcess();
    await sleep(150);
  }
  return readStatus();
}

describeDb("잡 실행 E2E (수정R2-A-4, 프로덕션 트리거 경로, docker PG)", () => {
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
        .values({ email: `e2e-${suffix}@example.com`, passwordHash: "x" })
        .returning({ id: accounts.id }),
      "account",
    );
    accountId = acc.id;
    const biz = firstOrThrow(
      await db
        .insert(businesses)
        .values({ accountId, name: `E2E store ${suffix}`, region: "서울 강남구" })
        .returning({ id: businesses.id }),
      "business",
    );
    businessId = biz.id;

    // ── (1) 프로덕션 경로: POST /api/diagnosis 핸들러를 직접 호출(Next 런타임 없이).
    //    이 안에서 enqueue + kickBackgroundDrain 이 일어난다(드레인 호출자 = 프로덕션 코드).
    const { POST } = await import("../../app/api/diagnosis/route.js");
    const res = await POST(
      new Request("http://localhost/api/diagnosis", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.200" },
        body: JSON.stringify({
          target: "https://place.naver.com/restaurant/1",
          businessId,
          businessProfile: {
            businessName: "E2E가게",
            industry: "cafe",
            region: "서울 강남구",
            mainServices: ["커피"],
            targetKeywords: ["강남 카페"],
          },
          sourceType: "naver_place",
          requestLlmValidation: true,
        }),
      }),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { data: { diagnosisId: string; status: string } };
    diagnosisId = body.data.diagnosisId;
    // enqueue 직후 상태는 queued(또는 백그라운드 drain 이 이미 시작했으면 running/completed).
    expect(body.data.diagnosisId).toBeTruthy();

    // ── (2) cron 트리거 경로: GET /api/jobs/process 로 drain 을 호출한다(직접 drain 금지).
    //    프로세스 부재 결함을 잡도록, 테스트는 큐.drain() 이 아니라 route 를 통해서만 처리한다.
    const { GET: processGet } = await import("../../app/api/jobs/process/route.js");
    const triggerProcess = async () => {
      const r = await processGet(new Request("http://localhost/api/jobs/process"));
      expect(r.status).toBe(200);
    };
    const readStatus = async () => {
      const [row] = await db
        .select({ status: diagnoses.status })
        .from(diagnoses)
        .where(eq(diagnoses.id, diagnosisId))
        .limit(1);
      return row?.status ?? "missing";
    };

    const finalStatus = await pumpUntilSettled(triggerProcess, readStatus);
    expect(finalStatus).toBe("completed");
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it("상태 전이: 진단이 queued → completed 로 완주한다(프로덕션 트리거 경로)", async () => {
    const [row] = await db
      .select({ status: diagnoses.status, completedAt: diagnoses.completedAt })
      .from(diagnoses)
      .where(eq(diagnoses.id, diagnosisId))
      .limit(1);
    expect(row?.status).toBe("completed");
    expect(row?.completedAt).not.toBeNull();
  });

  it("영속화: engine_results 가 채널별로 저장된다(파이프라인 산출 → 5종 테이블)", async () => {
    const rows = await db
      .select()
      .from(engineResultsTable)
      .where(eq(engineResultsTable.diagnosisId, diagnosisId));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("★ S3 경쟁: competitors 가 저장된다(dev 샘플 경쟁사 — 빈 폴백 아님)", async () => {
    const rows = await db
      .select()
      .from(competitorsTable)
      .where(eq(competitorsTable.diagnosisId, diagnosisId));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("★ S4 갭: gap_rows 가 저장된다(경쟁사 → GapResult → 갭)", async () => {
    const comps = await db
      .select({ id: competitorsTable.id })
      .from(competitorsTable)
      .where(eq(competitorsTable.diagnosisId, diagnosisId));
    let total = 0;
    for (const c of comps) {
      const g = await db.select().from(gapRowsTable).where(eq(gapRowsTable.competitorId, c.id));
      total += g.length;
    }
    expect(total).toBeGreaterThan(0);
  });

  it("★ S5 행동: actions 가 저장된다(4분류 + 오늘 딱 하나 정확히 1개)", async () => {
    const rows = await db
      .select()
      .from(actionsTable)
      .where(eq(actionsTable.diagnosisId, diagnosisId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.isTodayOne === true).length).toBe(1);
  });

  it("★ S3 route: GET /api/competitor 가 실데이터로 렌더(빈 화면 해소)", async () => {
    const { GET } = await import("../../app/api/competitor/route.js");
    const res = await GET(
      new Request(`http://localhost/api/competitor?diagnosisId=${diagnosisId}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { competitors: Array<{ name: string }> } };
    expect(body.data.competitors.length).toBeGreaterThan(0);
  });

  it("★ S4 route: GET /api/gap 가 실데이터로 렌더(빈 화면 해소)", async () => {
    const { GET } = await import("../../app/api/gap/route.js");
    const res = await GET(new Request(`http://localhost/api/gap?diagnosisId=${diagnosisId}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { items: Array<{ label: string }> } };
    expect(body.data.items.length).toBeGreaterThan(0);
  });

  it("★ S5 route: GET /api/action 가 실데이터 + 오늘 딱 하나로 렌더(빈 화면 해소)", async () => {
    const { GET } = await import("../../app/api/action/route.js");
    const res = await GET(new Request(`http://localhost/api/action?diagnosisId=${diagnosisId}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { actions: Array<{ isTodayOne: boolean }>; todayOne: unknown };
    };
    expect(body.data.actions.length).toBeGreaterThan(0);
    expect(body.data.actions.filter((a) => a.isTodayOne).length).toBe(1);
    expect(body.data.todayOne).not.toBeNull();
  });

  it("멱등성: process 트리거를 다시 호출해도 같은 잡을 2회 처리하지 않는다(completed 유지)", async () => {
    const { GET: processGet } = await import("../../app/api/jobs/process/route.js");
    const before = await db
      .select()
      .from(engineResultsTable)
      .where(eq(engineResultsTable.diagnosisId, diagnosisId));

    const r = await processGet(new Request("http://localhost/api/jobs/process"));
    expect(r.status).toBe(200);

    const after = await db
      .select()
      .from(engineResultsTable)
      .where(eq(engineResultsTable.diagnosisId, diagnosisId));
    // completed 잡은 다시 처리되지 않으므로 engine_results 가 중복 insert 되지 않는다.
    expect(after.length).toBe(before.length);
  });
});
