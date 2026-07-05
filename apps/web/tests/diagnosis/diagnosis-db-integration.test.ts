// @TASK P1-R2 - 진단 파이프라인 ↔ DB 통합 (DbBackedJobQueue + mock 엔진 — 실외부호출 0)
// @SPEC docs/planning/02-trd.md §3 (잡 상태 → diagnosis 반영)
// @SPEC docs/planning/04-database-design.md#diagnosis-table
//
// enqueue → drain → mock 파이프라인 산출 → diagnoses 행에 overallScore/status/completedAt
// 반영(completed)을 실제 Postgres 로 검증한다. DATABASE_URL 없으면 스킵(단위 CI 보호).
// mock 파이프라인 주입으로 실 크롤/LLM/SERP 호출 0.

import { createDb } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import type { DiagnosisPipelineOutput } from "@boina/engine";
import { DbBackedJobQueue } from "@boina/jobs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildDiagnosisHandler } from "../../lib/diagnosis/diagnosis-handler.js";
import { createDbDiagnosisRepository, deriveOverallSignal } from "../../lib/diagnosis/index.js";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

function firstOrThrow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) throw new Error(`expected at least one ${label} row`);
  return row;
}

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

describeDb("진단 파이프라인 ↔ DB 통합 (P1-R2, mock 엔진)", () => {
  let db: ReturnType<typeof createDb>;
  let accountId: string;
  let businessId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const acc = firstOrThrow(
      await db
        .insert(accounts)
        .values({ email: `p1r2-${suffix}@example.com`, passwordHash: "x" })
        .returning({ id: accounts.id }),
      "account",
    );
    accountId = acc.id;
    const biz = firstOrThrow(
      await db
        .insert(businesses)
        .values({ accountId, name: `P1-R2 store ${suffix}` })
        .returning({ id: businesses.id }),
      "business",
    );
    businessId = biz.id;
  });

  afterAll(async () => {
    if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it("enqueue → drain → mock DiagnosisJson 이 diagnoses 행에 반영된다 (completed + overallScore + 신호등)", async () => {
    const repo = createDbDiagnosisRepository(db);
    const created = await repo.create({ businessId });
    expect(created.status).toBe("queued");

    const runPipeline = vi.fn().mockResolvedValue(mockOutput(82));
    const handler = buildDiagnosisHandler({ repo, runPipeline });

    const queue = new DbBackedJobQueue(db);
    queue.process("diagnosis", handler);

    await queue.enqueue({
      type: "diagnosis",
      diagnosisId: created.id,
      payload: {
        diagnosisId: created.id,
        target: "https://example.com",
        businessProfile: {
          businessName: "테스트가게",
          industry: "cafe",
          region: "서울 강남구",
          mainServices: ["커피"],
          targetKeywords: ["강남 카페"],
        },
        modules: ["seo", "aeo", "geo"],
      },
    });

    const processed = await queue.drain();
    expect(processed).toBe(1);
    expect(runPipeline).toHaveBeenCalledTimes(1);

    const row = firstOrThrow(
      await db
        .select({
          status: diagnoses.status,
          overallScore: diagnoses.overallScore,
          completedAt: diagnoses.completedAt,
        })
        .from(diagnoses)
        .where(eq(diagnoses.id, created.id)),
      "diagnosis after",
    );
    expect(row.status).toBe("completed");
    expect(row.overallScore).toBe("82");
    expect(row.completedAt).not.toBeNull();
    // 화면 신호등 파생 (07 §4): 82 → good.
    expect(deriveOverallSignal(row.overallScore)).toBe("good");
  });

  it("파이프라인 throw → diagnoses.status=failed 반영", async () => {
    const repo = createDbDiagnosisRepository(db);
    const created = await repo.create({ businessId });

    const runPipeline = vi.fn().mockRejectedValue(new Error("crawl exploded"));
    const handler = buildDiagnosisHandler({ repo, runPipeline });

    const queue = new DbBackedJobQueue(db);
    queue.process("diagnosis", handler);

    await queue.enqueue({
      type: "diagnosis",
      diagnosisId: created.id,
      payload: {
        diagnosisId: created.id,
        target: "https://example.com",
        businessProfile: {
          businessName: "테스트가게",
          industry: "cafe",
          region: "서울",
          mainServices: ["커피"],
          targetKeywords: ["카페"],
        },
        modules: ["seo"],
      },
    });
    await queue.drain();

    const status = await queue.getStatus(created.id);
    expect(status).toBe("failed");
  });
});
