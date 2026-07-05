/**
 * @TASK P0-T3 - 잡 큐 상태 전이 TDD (RED → GREEN)
 * @SPEC docs/planning/02-trd.md#3-백그라운드-잡
 *
 * TDD 순서:
 *  RED  — 더미 잡 enqueue 후 status 전이가 일어나지 않으면 실패한다.
 *  GREEN — queued → running → completed 전이 통과 + 실패 시 failed 전이 통과.
 *  REFACTOR — 구현을 JobQueue 인터페이스 뒤로 추출(교체 가능 실증).
 *
 * InMemory 구현으로 단위 테스트(DB 불필요). DbBacked 구현은 동일 인터페이스를
 * 만족하므로 교체해도 이 테스트의 계약은 불변이다.
 */

import { describe, expect, it } from "vitest";
import { InvalidJobTransitionError } from "../errors.js";
import { InMemoryJobQueue } from "../in-memory-queue.js";
import type { JobQueue, JobStatus } from "../types.js";

describe("InMemoryJobQueue (P0-T3 상태 전이)", () => {
  it("enqueue 직후 잡은 queued 상태다", async () => {
    const queue: JobQueue = new InMemoryJobQueue();
    const job = await queue.enqueue({ type: "dummy", payload: { n: 1 } });

    expect(job.status).toBe<JobStatus>("queued");
    expect(await queue.getStatus(job.id)).toBe<JobStatus>("queued");
  });

  it("성공 핸들러: queued → running → completed 전이 (전이 순서 관찰)", async () => {
    const queue = new InMemoryJobQueue();
    const observed: JobStatus[] = [];

    queue.process<{ n: number }>("dummy", async (job) => {
      // 핸들러 실행 시점에는 큐가 이미 running으로 전이한 상태여야 한다.
      observed.push(job.status);
    });

    const job = await queue.enqueue({ type: "dummy", payload: { n: 1 } });
    expect(job.status).toBe("queued"); // RED 기준: 처리 전 queued

    const processed = await queue.drain();

    expect(processed).toBe(1);
    expect(observed).toEqual<JobStatus[]>(["running"]); // 핸들러는 running에서 실행
    expect(await queue.getStatus(job.id)).toBe<JobStatus>("completed");
  });

  it("실패 핸들러: queued → running → failed 전이 + 에러 stamp", async () => {
    const queue = new InMemoryJobQueue();

    queue.process("dummy-fail", async () => {
      throw new Error("boom");
    });

    const job = await queue.enqueue({ type: "dummy-fail", payload: {} });
    await queue.drain();

    const record = await queue.getJob(job.id);
    expect(record?.status).toBe<JobStatus>("failed");
    expect(record?.error).toBe("boom");
    expect(record?.attempts).toBe(1);
  });

  it("completed/failed는 종료 상태 — 재처리하지 않는다", async () => {
    const queue = new InMemoryJobQueue();
    let runs = 0;
    queue.process("once", async () => {
      runs += 1;
    });

    await queue.enqueue({ type: "once", payload: {} });
    await queue.drain();
    const second = await queue.drain(); // 더 처리할 잡 없음

    expect(runs).toBe(1);
    expect(second).toBe(0);
  });

  it("잘못된 전이는 InvalidJobTransitionError로 거부한다", async () => {
    const queue = new InMemoryJobQueue();
    const job = await queue.enqueue({ type: "x", payload: {} });

    // queued → completed 는 허용되지 않음 (queued → running → completed 만)
    expect(() => queue.transition(job.id, "completed")).toThrow(InvalidJobTransitionError);
  });

  it("미등록 타입은 drain 시 처리되지 않고 queued로 남는다", async () => {
    const queue = new InMemoryJobQueue();
    const job = await queue.enqueue({ type: "no-handler", payload: {} });

    const processed = await queue.drain();

    expect(processed).toBe(0);
    expect(await queue.getStatus(job.id)).toBe<JobStatus>("queued");
  });
});
