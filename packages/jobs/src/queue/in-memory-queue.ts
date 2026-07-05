/**
 * @TASK P0-T3 - 경량 잡 큐: 인메모리 구현 (단위 테스트·로컬용)
 * @SPEC docs/planning/02-trd.md#3-백그라운드-잡
 * @SPEC docs/planning/07-coding-convention.md#6 (잡·스토리지 추상화)
 * @TEST packages/jobs/src/queue/__tests__/in-memory-queue.test.ts
 *
 * OQ-5 경량 결정의 단위 테스트용 구현. JobQueue 인터페이스를 만족하므로
 * DbBackedJobQueue / (추후) BullMqJobQueue와 교체 가능하다.
 *
 * 영속성 없음(프로세스 메모리). 운영 경량 큐는 DbBackedJobQueue를 쓴다.
 * 핸들러 throw → failed 전이 + 에러 메시지 stamp(민감정보 비포함은 호출측 책임).
 */

import { InvalidJobTransitionError } from "./errors.js";
import {
  type Job,
  type JobHandler,
  type JobQueue,
  type JobSpec,
  type JobStatus,
  canTransition,
} from "./types.js";

/**
 * 단조 증가 잡 id 생성기. crypto.randomUUID가 없는 환경 대비 폴백.
 */
function makeId(seq: number): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `job-${Date.now()}-${seq}`;
  return uuid;
}

export class InMemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, Job>();
  private readonly handlers = new Map<string, JobHandler<unknown>>();
  private readonly pending: string[] = [];
  private seq = 0;

  async enqueue<TPayload>(spec: JobSpec<TPayload>): Promise<Job<TPayload>> {
    const now = new Date();
    const id = makeId(this.seq++);
    const job: Job<TPayload> = {
      id,
      type: spec.type,
      payload: spec.payload,
      ...(spec.diagnosisId !== undefined ? { diagnosisId: spec.diagnosisId } : {}),
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job as Job);
    this.pending.push(id);
    return job;
  }

  process<TPayload>(type: string, handler: JobHandler<TPayload>): void {
    this.handlers.set(type, handler as JobHandler<unknown>);
  }

  /**
   * 상태 전이 (가드 포함). 허용되지 않은 전이는 거부한다.
   * 인터페이스 밖 헬퍼지만 테스트·DbBacked 구현이 같은 가드 규칙을 공유한다.
   */
  transition(jobId: string, to: JobStatus): Job {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    if (!canTransition(job.status, to)) {
      throw new InvalidJobTransitionError(job.status, to);
    }
    job.status = to;
    job.updatedAt = new Date();
    return job;
  }

  async drain(): Promise<number> {
    let processed = 0;
    // 스냅샷을 떠서 이번 라운드 대기 잡만 처리한다.
    const batch = this.pending.splice(0, this.pending.length);

    for (const id of batch) {
      const job = this.jobs.get(id);
      if (!job) continue;

      const handler = this.handlers.get(job.type);
      if (!handler) {
        // 미등록 타입: 처리하지 않고 다시 대기열로 (queued 유지).
        this.pending.push(id);
        continue;
      }

      // queued → running
      this.transition(id, "running");
      job.attempts += 1;

      try {
        await handler(job);
        // running → completed
        this.transition(id, "completed");
      } catch (err) {
        // running → failed (+ 에러 메시지 stamp)
        this.transition(id, "failed");
        job.error = err instanceof Error ? err.message : String(err);
      }
      processed += 1;
    }

    return processed;
  }

  async getStatus(jobId: string): Promise<JobStatus | null> {
    return this.jobs.get(jobId)?.status ?? null;
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) ?? null;
  }
}
