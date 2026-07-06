/**
 * @TASK P0-T3 - DbBackedJobQueue: diagnoses.status 반영 통합 테스트
 * @SPEC docs/planning/02-trd.md#3-백그라운드-잡 (상태 모델 → diagnosis 반영)
 *
 * 경량(DB 기반) 구현이 잡 상태 전이를 실제 diagnoses 행에 반영하는지 검증한다.
 * docker Postgres(가동 중) 사용. DATABASE_URL 없으면 스킵(단위 CI 환경 보호).
 *
 * 동일 JobQueue 인터페이스를 InMemoryJobQueue와 공유하므로, 이 테스트의 계약은
 * 인메모리 테스트와 같다 — 구현 교체에도 인터페이스 불변(교체 자유 실증).
 */

import { createDb } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbBackedJobQueue } from "../db-backed-queue.js";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

/** 첫 행을 꺼내되 없으면 명시적으로 실패한다(non-null assertion 회피). */
function firstOrThrow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) throw new Error(`expected at least one ${label} row`);
  return row;
}

describeDb("DbBackedJobQueue (P0-T3 diagnoses.status 반영)", () => {
  let db: ReturnType<typeof createDb>;
  let accountId: string;
  let businessId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const acc = firstOrThrow(
      await db
        .insert(accounts)
        .values({ email: `jobs-p0t3-${suffix}@example.com`, passwordHash: "x" })
        .returning({ id: accounts.id }),
      "account",
    );
    accountId = acc.id;

    const biz = firstOrThrow(
      await db
        .insert(businesses)
        .values({ accountId, name: `P0-T3 store ${suffix}` })
        .returning({ id: businesses.id }),
      "business",
    );
    businessId = biz.id;
  });

  afterAll(async () => {
    // account cascade 로 business/diagnosis 까지 정리된다.
    if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  async function seedDiagnosis(): Promise<string> {
    const row = firstOrThrow(
      await db
        .insert(diagnoses)
        .values({ businessId, status: "queued" })
        .returning({ id: diagnoses.id }),
      "diagnosis",
    );
    return row.id;
  }

  it("성공 핸들러: diagnoses.status 가 queued → running → completed 로 반영된다", async () => {
    const diagnosisId = await seedDiagnosis();
    const queue = new DbBackedJobQueue(db);

    let seenInsideHandler: string | null = null;
    queue.process("diagnosis", async (job) => {
      seenInsideHandler = job.status; // 핸들러는 running 상태에서 실행
    });

    const payload = { diagnosisId, businessId, target: "https://example.com" };
    await queue.enqueue({ type: "diagnosis", payload, diagnosisId });
    expect(await queue.getStatus(diagnosisId)).toBe("queued");

    const processed = await queue.drain();
    expect(processed).toBe(1);
    expect(seenInsideHandler).toBe("running");

    const after = firstOrThrow(
      await db
        .select({
          status: diagnoses.status,
          jobType: diagnoses.jobType,
          jobPayload: diagnoses.jobPayload,
          jobAttemptCount: diagnoses.jobAttemptCount,
          jobLastError: diagnoses.jobLastError,
          jobEnqueuedAt: diagnoses.jobEnqueuedAt,
          jobStartedAt: diagnoses.jobStartedAt,
          completedAt: diagnoses.completedAt,
        })
        .from(diagnoses)
        .where(eq(diagnoses.id, diagnosisId)),
      "diagnosis after",
    );
    expect(after.status).toBe("completed");
    expect(after.jobType).toBe("diagnosis");
    expect(after.jobPayload).toMatchObject(payload);
    expect(after.jobAttemptCount).toBe(1);
    expect(after.jobLastError).toBeNull();
    expect(after.jobEnqueuedAt).not.toBeNull();
    expect(after.jobStartedAt).not.toBeNull();
    expect(after.completedAt).not.toBeNull();
  });

  it("실패 핸들러: diagnoses.status 가 failed 로 반영된다", async () => {
    const diagnosisId = await seedDiagnosis();
    const queue = new DbBackedJobQueue(db);
    queue.process("diagnosis", async () => {
      throw new Error("pipeline boom");
    });

    await queue.enqueue({ type: "diagnosis", payload: { diagnosisId }, diagnosisId });
    await queue.drain();

    const status = await queue.getStatus(diagnosisId);
    expect(status).toBe("failed");
    const job = await queue.getJob(diagnosisId);
    expect(job?.error).toBe("pipeline boom");
    const after = firstOrThrow(
      await db
        .select({
          jobAttemptCount: diagnoses.jobAttemptCount,
          jobLastError: diagnoses.jobLastError,
        })
        .from(diagnoses)
        .where(eq(diagnoses.id, diagnosisId)),
      "failed diagnosis",
    );
    expect(after.jobAttemptCount).toBe(1);
    expect(after.jobLastError).toBe("pipeline boom");
  });
});
