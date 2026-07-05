/**
 * @TASK P0-T3 - 잡 큐 배럴 export (07 §2 경계는 배럴로 유지)
 * @SPEC docs/planning/02-trd.md#3-백그라운드-잡
 *
 * 외부(서비스/Route Handler)는 이 배럴만 import한다.
 * 구체 구현(InMemory/DbBacked)도 여기서 노출하되, 호출부는 JobQueue
 * 인터페이스 타입에만 의존하도록 작성한다(교체 자유).
 */

export type {
  Job,
  JobHandler,
  JobQueue,
  JobSpec,
  JobStatus,
} from "./types.js";
export {
  JOB_STATUS_TRANSITIONS,
  canTransition,
  isTerminalJobStatus,
} from "./types.js";
export {
  InvalidJobTransitionError,
  NoHandlerRegisteredError,
} from "./errors.js";
export { InMemoryJobQueue } from "./in-memory-queue.js";
export {
  DbBackedJobQueue,
  type DbBackedJobQueueOptions,
  type JobPayloadResolver,
} from "./db-backed-queue.js";
export {
  type DiagnosisJobStatus,
  jobStatusToDiagnosisStatus,
  isDiagnosisCompletionStatus,
} from "./diagnosis-status.js";
