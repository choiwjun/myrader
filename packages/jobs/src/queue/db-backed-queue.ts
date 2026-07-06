/**
 * @TASK P0-T3 - 경량 잡 큐: DB 기반 구현 (운영 경량 — OQ-5 경량 결정)
 * @SPEC docs/planning/02-trd.md#3-백그라운드-잡 (상태 모델 → diagnosis 반영)
 * @SPEC docs/planning/07-coding-convention.md#6 (잡·스토리지 추상화)
 *
 * OQ-5 경량 결정의 운영 구현. 별도 브로커(Redis/BullMQ) 없이 @boina/db의
 * diagnoses 테이블을 큐 상태 저장소로 활용한다:
 *   - enqueue → diagnoses.status = 'queued'
 *   - drain   → 'queued' 행을 집어 'running' → handler → 'completed'/'failed'
 *
 * 이 구현은 JobQueue 인터페이스를 InMemoryJobQueue와 동일하게 만족하므로
 * 서비스/Route Handler 코드를 바꾸지 않고 교체할 수 있다(교체 자유 실증).
 *
 * 제약: @boina/db는 import만(스키마 수정 금지). diagnoses 행 자체는 enqueue
 * 시점에 이미 존재한다고 가정한다(진단 생성은 P1-R2 진단 파이프라인 담당).
 * 여기서는 status 전이 골격만 배선한다.
 *
 * [OPEN] 동시성 잠금(여러 워커가 같은 행 집기 방지)은 P1+ 운영 배선에서
 * `SELECT ... FOR UPDATE SKIP LOCKED` 또는 advisory lock으로 처리한다.
 * 골격 단계에서는 단일 드레이너를 가정한다.
 */

import type { DbClient } from "@boina/db/client";
import { diagnoses } from "@boina/db/schema";
import { and, eq, sql } from "drizzle-orm";

import { isDiagnosisCompletionStatus, jobStatusToDiagnosisStatus } from "./diagnosis-status.js";
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
 * 한 번의 drain 에서 동시에 처리할 잡 상한(기본). 진단은 수십초 단위 작업이라
 * 한 인스턴스가 무제한 잡을 동시에 잡으면 메모리/외부 호출이 폭증한다 — 상한으로 보호.
 */
const DEFAULT_DRAIN_CONCURRENCY = 5;

/**
 * 메타(type/payload)가 이 드레이너에 없는 잡을 위한 페이로드 복원기.
 *
 * 같은 프로세스에서 enqueue→drain 하면 인메모리 메타로 완전 충실(full fidelity)하게
 * 처리된다. 그러나 별도 프로세스(예: cron 트리거 /api/jobs/process)가 drain 하면
 * 그 프로세스엔 메타가 없어 잡을 건너뛰게 된다(고아 잡). 이 복원기를 주입하면,
 * 메타 없는 diagnosisId 에 대해 DB(diagnoses+businesses 행)로부터 잡 type/payload 를
 * 재구성해 cross-process 복구를 가능하게 한다(스키마 변경 0 — 기존 행만 읽음).
 *
 * 복원에 실패(null 반환)하면 그 잡은 이번 라운드에서 건너뛴다(다음 라운드 재시도).
 */
export type JobPayloadResolver = (
  diagnosisId: string,
) => Promise<{ type: string; payload: unknown } | null>;

export interface DbBackedJobQueueOptions {
  /** 한 drain 라운드 동시 처리 상한(기본 5). */
  concurrency?: number;
  /** cross-process 복구용 페이로드 복원기(없으면 메타 있는 잡만 처리). */
  payloadResolver?: JobPayloadResolver;
}

function toPersistedPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

/**
 * DB 기반 경량 잡 큐.
 *
 * 잡 1건 = diagnoses 행 1건. 잡 id는 diagnosisId와 동일하게 둔다(골격 단순화).
 * 잡 type/payload는 외부 잡 테이블 없이도 동작하도록 메모리에 보관한다 —
 * 운영 확장 시 별도 jobs 테이블로 승격할 수 있으나(인터페이스 불변),
 * 골격 단계에서는 diagnoses.status가 진실의 원천이다.
 */
export class DbBackedJobQueue implements JobQueue {
  private readonly handlers = new Map<string, JobHandler<unknown>>();
  /** diagnosisId → (type/payload) 보조 메타. 골격용 인메모리 사이드카. */
  private readonly meta = new Map<
    string,
    { type: string; payload: unknown; attempts: number; error?: string }
  >();

  private readonly concurrency: number;
  private readonly payloadResolver?: JobPayloadResolver;

  constructor(
    private readonly db: DbClient,
    options: DbBackedJobQueueOptions = {},
  ) {
    this.concurrency =
      options.concurrency && options.concurrency > 0
        ? options.concurrency
        : DEFAULT_DRAIN_CONCURRENCY;
    if (options.payloadResolver) this.payloadResolver = options.payloadResolver;
  }

  async enqueue<TPayload>(spec: JobSpec<TPayload>): Promise<Job<TPayload>> {
    const diagnosisId = spec.diagnosisId;
    if (!diagnosisId) {
      // DbBacked는 반영 대상 diagnoses 행이 필요하다.
      throw new Error(
        "DbBackedJobQueue.enqueue requires spec.diagnosisId (the diagnoses row to reflect status onto)",
      );
    }

    const queuedAt = new Date();
    await this.db
      .update(diagnoses)
      .set({
        status: "queued",
        updatedAt: queuedAt,
        jobType: spec.type,
        jobPayload: toPersistedPayload(spec.payload),
        jobAttemptCount: 0,
        jobLastError: null,
        jobEnqueuedAt: queuedAt,
        jobStartedAt: null,
      })
      .where(eq(diagnoses.id, diagnosisId));

    this.meta.set(diagnosisId, {
      type: spec.type,
      payload: spec.payload,
      attempts: 0,
    });

    return this.readJob<TPayload>(diagnosisId) as Promise<Job<TPayload>>;
  }

  process<TPayload>(type: string, handler: JobHandler<TPayload>): void {
    this.handlers.set(type, handler as JobHandler<unknown>);
  }

  async drain(): Promise<number> {
    let processed = 0;

    // 'queued' 상태인 diagnoses 행을 집는다(동시성 상한까지만).
    const queued = await this.db
      .select({ id: diagnoses.id })
      .from(diagnoses)
      .where(eq(diagnoses.status, "queued"))
      .limit(this.concurrency);

    for (const row of queued) {
      // 메타가 없으면(다른 프로세스가 enqueue) 복원기로 DB 에서 재구성한다(cross-process 복구).
      let meta = this.meta.get(row.id);
      if (!meta) {
        const resolved = await this.resolveMeta(row.id);
        if (!resolved) {
          // 복원 불가 — 다른 워커 소유이거나 복원기 미주입. 건너뛴다(queued 유지).
          continue;
        }
        meta = resolved;
      }

      const handler = this.handlers.get(meta.type);
      if (!handler) {
        // 등록 핸들러 없음 — 처리 불가, queued 유지.
        continue;
      }

      // ★ 멱등·동시성 안전: queued → running 을 원자적으로 claim 한다.
      //   조건부 UPDATE(WHERE status='queued')라 두 드레이너가 동시에 같은 잡을 집어도
      //   정확히 하나만 1행을 갱신해 소유권을 얻는다(나머지는 0행 → 건너뜀). 같은 잡 2회 처리 0.
      const claimed = await this.claimQueued(row.id);
      if (!claimed) {
        // 이미 다른 드레이너가 running/완료로 가져감 — 이 라운드에서 건너뛴다.
        continue;
      }
      meta.attempts += 1;

      try {
        const job = await this.readJob(row.id);
        if (!job) continue;
        // claim 으로 이미 running 이므로, 핸들러에 running 상태 잡을 넘긴다.
        await handler({ ...job, status: "running" });
        await this.setStatus(row.id, "completed");
      } catch (err) {
        meta.error = err instanceof Error ? err.message : String(err);
        await this.setStatus(row.id, "failed", meta.error);
      }
      processed += 1;
    }

    return processed;
  }

  /**
   * queued → running 을 원자적으로 점유(claim)한다.
   *
   * 조건부 UPDATE(WHERE id=? AND status='queued')의 갱신 행 수로 소유권을 판정한다.
   * 1행이면 이 드레이너가 점유 성공(true), 0행이면 이미 다른 드레이너가 가져감(false).
   * Postgres 의 단일 행 UPDATE 는 원자적이라 별도 락 없이 double-처리를 방지한다
   * (SKIP LOCKED 없이도 "정확히 하나만 running 전이"가 보장됨 — 멱등 워커).
   */
  private async claimQueued(diagnosisId: string): Promise<boolean> {
    const now = new Date();
    const updated = await this.db
      .update(diagnoses)
      .set({
        status: "running",
        updatedAt: now,
        jobStartedAt: now,
        jobLastError: null,
        jobAttemptCount: sql`${diagnoses.jobAttemptCount} + 1`,
      })
      .where(and(eq(diagnoses.id, diagnosisId), eq(diagnoses.status, "queued")))
      .returning({ id: diagnoses.id });
    return updated.length === 1;
  }

  /**
   * 메타 없는 잡의 type/payload 를 복원기로 재구성하고 인메모리 메타에 캐시한다.
   * 복원기 미주입이거나 복원 실패면 null.
   */
  private async resolveMeta(
    diagnosisId: string,
  ): Promise<{ type: string; payload: unknown; attempts: number; error?: string } | null> {
    if (!this.payloadResolver) return null;
    const resolved = await this.payloadResolver(diagnosisId);
    if (!resolved) return null;
    const meta = { type: resolved.type, payload: resolved.payload, attempts: 0 };
    this.meta.set(diagnosisId, meta);
    return meta;
  }

  async getStatus(jobId: string): Promise<JobStatus | null> {
    const rows = await this.db
      .select({ status: diagnoses.status })
      .from(diagnoses)
      .where(eq(diagnoses.id, jobId))
      .limit(1);
    const status = rows[0]?.status;
    if (!status) return null;
    // diagnoses.status는 7개 값 중 잡이 만드는 4개만 반환한다고 가정(골격).
    return status as JobStatus;
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.readJob(jobId);
  }

  // ── 내부 ────────────────────────────────────────────────────────────────

  /**
   * 상태 전이 (가드 + diagnoses.status 반영). 종료 상태는 completedAt도 stamp.
   */
  private async setStatus(jobId: string, to: JobStatus, error?: string): Promise<void> {
    const current = await this.getStatus(jobId);
    // 멱등(idempotent): 핸들러가 결과 반영 중 이미 동일 상태로 써둔 경우(예: completed/failed)
    // 동일-상태 전이는 no-op 로 흡수한다(중복 stamp 방지). 인터페이스 계약은 불변.
    if (current === to) return;
    if (current && !canTransition(current, to)) {
      throw new InvalidJobTransitionError(current, to);
    }

    const now = new Date();
    const patch: {
      status: ReturnType<typeof jobStatusToDiagnosisStatus>;
      updatedAt: Date;
      completedAt?: Date;
      jobLastError?: string | null;
    } = {
      status: jobStatusToDiagnosisStatus(to),
      updatedAt: now,
    };
    if (isDiagnosisCompletionStatus(to)) {
      patch.completedAt = now;
    }
    if (to === "completed") {
      patch.jobLastError = null;
    } else if (error !== undefined) {
      patch.jobLastError = error;
    }

    await this.db.update(diagnoses).set(patch).where(eq(diagnoses.id, jobId));

    const meta = this.meta.get(jobId);
    if (meta && error !== undefined) meta.error = error;
  }

  private async readJob<TPayload>(jobId: string): Promise<Job<TPayload> | null> {
    const rows = await this.db
      .select({
        id: diagnoses.id,
        status: diagnoses.status,
        jobType: diagnoses.jobType,
        jobPayload: diagnoses.jobPayload,
        jobAttemptCount: diagnoses.jobAttemptCount,
        jobLastError: diagnoses.jobLastError,
        createdAt: diagnoses.createdAt,
        updatedAt: diagnoses.updatedAt,
      })
      .from(diagnoses)
      .where(eq(diagnoses.id, jobId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const meta = this.meta.get(jobId);
    const job: Job<TPayload> = {
      id: row.id,
      type: meta?.type ?? row.jobType ?? "unknown",
      payload: (meta?.payload ?? row.jobPayload ?? null) as TPayload,
      diagnosisId: row.id,
      status: row.status as JobStatus,
      attempts: meta?.attempts ?? row.jobAttemptCount,
      ...(meta?.error !== undefined
        ? { error: meta.error }
        : row.jobLastError !== null
          ? { error: row.jobLastError }
          : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return job;
  }
}
