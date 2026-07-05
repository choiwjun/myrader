// @TASK 수정R2-A-1 - enqueue 진입점 (DbBacked 전환 후) 배선 스모크
// @SPEC docs/planning/02-trd.md#3-백그라운드-잡
// @SPEC apps/web/lib/jobs.ts (getJobQueue=DbBackedJobQueue + 진단 핸들러 등록)
//
// 이전(P0-T3)엔 getJobQueue()=InMemoryJobQueue 로 target-only 골격 잡을 drain 했다. 수정R2-A 에서
// getJobQueue()=DbBackedJobQueue 로 전환했으므로, 이 스모크는 "DbBacked 큐가 진단 핸들러를 등록한
// 채로 반환되고, 실 diagnoses 행을 enqueue→processJobQueue(프로덕션 drain 경로)로 completed 까지
// 보낸다"를 검증한다. docker PG 필요(DATABASE_URL 없으면 스킵 — 단위 CI 보호).

import { createDb } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import type { DiagnosisPipelineOutput } from "@boina/engine";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDbDiagnosisRepository } from "../lib/diagnosis/diagnosis-repository.js";
import { DIAGNOSIS_JOB_TYPE, getJobQueue } from "../lib/jobs.js";

// 엔진 mock(실 크롤/LLM 0) — getJobQueue 핸들러의 defaultRunPipeline 이 이 값을 받는다.
vi.mock("@boina/engine", async (orig) => {
  const actual = await orig<typeof import("@boina/engine")>();
  const out: DiagnosisPipelineOutput = {
    crawlResult: {
      pages: [],
      partialResult: false,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    scores: {
      seoScore: 80,
      aeoScore: 80,
      geoScore: 80,
      perfScore: null,
      overallScore: 80,
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
  return { ...actual, runDiagnosisPipeline: vi.fn(async () => out) };
});

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

function firstOrThrow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) throw new Error(`expected at least one ${label} row`);
  return row;
}

describeDb("enqueue 진입점 (수정R2-A-1 DbBacked)", () => {
  let db: ReturnType<typeof createDb>;
  let accountId: string;
  let businessId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const acc = firstOrThrow(
      await db
        .insert(accounts)
        .values({ email: `enqueue-${Date.now()}@example.com`, passwordHash: "x" })
        .returning({ id: accounts.id }),
      "account",
    );
    accountId = acc.id;
    const biz = firstOrThrow(
      await db.insert(businesses).values({ accountId, name: "enqueue store" }).returning({
        id: businesses.id,
      }),
      "business",
    );
    businessId = biz.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it("getJobQueue()=DbBacked 가 진단 잡을 enqueue→drain 으로 completed 까지 보낸다", async () => {
    const repo = createDbDiagnosisRepository(db);
    const diagnosis = await repo.create({ businessId });

    // 주입 repo 로 싱글톤을 우회(테스트 격리). 같은 db 를 공유한다.
    const queue = getJobQueue(repo);
    await queue.enqueue({
      type: DIAGNOSIS_JOB_TYPE,
      diagnosisId: diagnosis.id,
      payload: {
        diagnosisId: diagnosis.id,
        target: "https://example.com",
        businessProfile: {
          businessName: "테스트가게",
          industry: "cafe",
          region: "서울",
          mainServices: ["커피"],
          targetKeywords: ["강남 카페"],
        },
        modules: ["seo", "aeo", "geo"],
      },
    });

    expect(await queue.getStatus(diagnosis.id)).toBe("queued");

    const processed = await queue.drain();
    expect(processed).toBe(1);

    const [row] = await db
      .select({ status: diagnoses.status })
      .from(diagnoses)
      .where(eq(diagnoses.id, diagnosis.id))
      .limit(1);
    expect(row?.status).toBe("completed");
  });
});
