/**
 * @TASK P0-T3 - 잡 큐 에러 타입
 * @SPEC docs/planning/02-trd.md#3-백그라운드-잡
 *
 * 에러 우선 설계: 잘못된 상태 전이·미등록 핸들러를 명시적 에러로 거부한다.
 */

import type { JobStatus } from "./types.js";

/** 허용되지 않은 상태 전이 시도. */
export class InvalidJobTransitionError extends Error {
  readonly from: JobStatus;
  readonly to: JobStatus;

  constructor(from: JobStatus, to: JobStatus) {
    super(`Invalid job status transition: ${from} -> ${to}`);
    this.name = "InvalidJobTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** 등록된 핸들러가 없는 잡 타입을 drain하려 할 때. */
export class NoHandlerRegisteredError extends Error {
  readonly jobType: string;

  constructor(jobType: string) {
    super(`No handler registered for job type: ${jobType}`);
    this.name = "NoHandlerRegisteredError";
    this.jobType = jobType;
  }
}
