/**
 * @TASK 수정R2-A-1 - DbBackedJobQueue 멱등·동시성 + cross-process 복구 테스트
 * @SPEC docs/planning/02-trd.md#3-백그라운드-잡 (멱등 워커 — 같은 잡 2회 처리 0)
 *
 * 출시차단 회복(R2-A)의 핵심 안전성 검증:
 *   1) 두 드레이너가 동시에 drain 해도 같은 잡을 정확히 한 번만 처리한다(원자적 claim).
 *   2) concurrency 상한이 한 라운드 처리량을 제한한다.
 *   3) payloadResolver 로 메타 없는 잡(cross-process)을 복구 처리한다.
 *
 * docker Postgres 사용. DATABASE_URL 없으면 스킵(단위 CI 보호).
 */

import { createDb } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbBackedJobQueue } from "../db-backed-queue.js";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

function firstOrThrow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) throw new Error(`expected at least one ${label} row`);
  return row;
}

describeDb("DbBackedJobQueue 멱등·동시성 (수정R2-A-1)", () => {
  let db: ReturnType<typeof createDb>;
  let accountId: string;
  let businessId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const acc = firstOrThrow(
      await db
        .insert(accounts)
        .values({ email: `concur-${suffix}@example.com`, passwordHash: "x" })
        .returning({ id: accounts.id }),
      "account",
    );
    accountId = acc.id;
    const biz = firstOrThrow(
      await db
        .insert(businesses)
        .values({ accountId, name: `concur store ${suffix}` })
        .returning({ id: businesses.id }),
      "business",
    );
    businessId = biz.id;
  });

  afterAll(async () => {
    if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  async function seed(): Promise<string> {
    const row = firstOrThrow(
      await db
        .insert(diagnoses)
        .values({ businessId, status: "queued" })
        .returning({ id: diagnoses.id }),
      "diagnosis",
    );
    return row.id;
  }

  it("두 드레이너가 동시에 drain 해도 핸들러는 정확히 1회만 호출된다(원자적 claim)", async () => {
    const diagnosisId = await seed();

    let handlerCalls = 0;
    const makeQueue = () => {
      const q = new DbBackedJobQueue(db);
      q.process("diagnosis", async () => {
        handlerCalls += 1;
        await new Promise((r) => setTimeout(r, 30)); // 처리 중 윈도우 — 경쟁 유발.
      });
      return q;
    };

    // 같은 잡을 두 드레이너의 메타에 모두 등록(동시 claim 경쟁 시뮬레이션).
    const qA = makeQueue();
    const qB = makeQueue();
    await qA.enqueue({ type: "diagnosis", payload: {}, diagnosisId });
    await qB.enqueue({ type: "diagnosis", payload: {}, diagnosisId });

    const [pA, pB] = await Promise.all([qA.drain(), qB.drain()]);
    // 둘 중 하나만 claim 성공 → 처리량 합이 1, 핸들러 호출 1회.
    expect(pA + pB).toBe(1);
    expect(handlerCalls).toBe(1);
    expect(await qA.getStatus(diagnosisId)).toBe("completed");
  });

  it("concurrency 상한이 한 라운드 처리량을 제한한다", async () => {
    const ids = await Promise.all([seed(), seed(), seed()]);
    const queue = new DbBackedJobQueue(db, { concurrency: 2 });
    queue.process("diagnosis", async () => {});
    for (const id of ids) {
      await queue.enqueue({ type: "diagnosis", payload: {}, diagnosisId: id });
    }
    // 상한 2 → 첫 라운드 최대 2건만 처리(나머지는 queued 유지).
    const processed = await queue.drain();
    expect(processed).toBeLessThanOrEqual(2);
    expect(processed).toBeGreaterThanOrEqual(1);
    // 테스트 격리: 남은 queued 잡을 모두 비워 다음 테스트(전역 drain)에 누수되지 않게 한다.
    while ((await queue.drain()) > 0) {
      /* drain until empty */
    }
  });

  it("payloadResolver: 메타 없는 잡(cross-process)을 복구해 처리한다", async () => {
    const diagnosisId = await seed();

    // enqueue 한 큐(메타 보유)와 별개로, 메타가 *없는* 새 드레이너를 만든다(다른 프로세스 흉내).
    const enqueuer = new DbBackedJobQueue(db);
    enqueuer.process("diagnosis", async () => {});
    await enqueuer.enqueue({ type: "diagnosis", payload: {}, diagnosisId });

    let resolverCalled = false;
    const recoveryDrainer = new DbBackedJobQueue(db, {
      // 이 테스트의 잡만 복원한다(다른 테스트 파일이 병렬로 만든 queued 잡은 null → skip).
      payloadResolver: async (id) => {
        if (id !== diagnosisId) return null;
        resolverCalled = true;
        return { type: "diagnosis", payload: { diagnosisId: id } };
      },
    });
    let recovered = false;
    recoveryDrainer.process("diagnosis", async () => {
      recovered = true;
    });

    const processed = await recoveryDrainer.drain();
    expect(resolverCalled).toBe(true);
    expect(recovered).toBe(true);
    // 이 드레이너는 메타 없는 모든 queued 잡을 복원 처리하므로(전역 drain), 정확한 건수 대신
    // "이 잡이 복구되어 completed 됐는지"로 단정한다(다른 테스트 잔여 잡 영향 격리).
    expect(processed).toBeGreaterThanOrEqual(1);
    expect(await recoveryDrainer.getStatus(diagnosisId)).toBe("completed");
  });

  it("payloadResolver 미주입 + 메타 없음 → 잡을 건너뛴다(queued 유지)", async () => {
    const diagnosisId = await seed();
    const enqueuer = new DbBackedJobQueue(db);
    enqueuer.process("diagnosis", async () => {});
    await enqueuer.enqueue({ type: "diagnosis", payload: {}, diagnosisId });

    // 메타 없고 복원기도 없는 드레이너 → 처리 0, 상태 queued 유지.
    const blind = new DbBackedJobQueue(db);
    blind.process("diagnosis", async () => {});
    const processed = await blind.drain();
    // 다른 잡이 없다면 0(이 잡은 메타 없어 skip). 다른 테스트 잔여 잡 영향 없도록 상태로 단정.
    expect(processed).toBeGreaterThanOrEqual(0);
    expect(await blind.getStatus(diagnosisId)).toBe("queued");
  });
});
