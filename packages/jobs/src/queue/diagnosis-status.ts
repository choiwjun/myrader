/**
 * @TASK P0-T3 - 잡 상태 → diagnoses.status 반영 매퍼
 * @SPEC docs/planning/02-trd.md#3-백그라운드-잡 (상태 모델 → diagnosis 반영)
 *
 * 잡 상태(JobStatus)를 @boina/db diagnoses.status enum 값으로 매핑한다.
 * JobStatus는 이미 ReportStatus의 부분집합이라 1:1 항등 매핑이지만, 매핑을
 * 명시적으로 두어 (a) DB import 경계를 한 곳에 모으고, (b) 추후 잡↔diagnosis
 * 상태가 갈라질 때 이 파일만 바꾸면 되게 한다.
 *
 * 제약: @boina/db는 import만(스키마 수정 금지). 실제 diagnoses 행 갱신은
 * DbBackedJobQueue가 이 매핑을 통해 수행한다.
 */

import type { JobStatus } from "./types.js";

/** DB diagnoses.status가 받는 값 (contracts/db enum의 부분집합 — 잡이 만드는 상태). */
export type DiagnosisJobStatus = "queued" | "running" | "completed" | "failed";

/**
 * 잡 상태 → diagnoses.status 값.
 * 항등 매핑이지만 경계를 명시한다(발명 금지: enum 값을 새로 만들지 않음).
 */
export function jobStatusToDiagnosisStatus(status: JobStatus): DiagnosisJobStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default: {
      // exhaustiveness 가드 (noFallthroughCasesInSwitch + strict)
      const _never: never = status;
      return _never;
    }
  }
}

/** diagnoses.status에 completedAt을 같이 stamp해야 하는 종료 상태인지. */
export function isDiagnosisCompletionStatus(status: JobStatus): status is "completed" | "failed" {
  return status === "completed" || status === "failed";
}
