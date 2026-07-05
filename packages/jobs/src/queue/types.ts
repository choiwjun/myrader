/**
 * @TASK P0-T3 - 백그라운드 잡 큐 타입 + JobQueue 인터페이스
 * @SPEC docs/planning/02-trd.md#3-백그라운드-잡
 * @SPEC docs/planning/07-coding-convention.md#6-확장성-코딩-규칙구속 (잡·스토리지 추상화)
 * @TEST packages/jobs/src/queue/__tests__/in-memory-queue.test.ts
 *
 * 잡 큐 추상화의 단일 진실(SSOT). 이 파일의 타입·인터페이스는 인프라(인메모리/DB/
 * 추후 BullMQ+Redis)와 무관하게 불변이다 — OQ-5(경량 결정)에서 "JobQueue 인터페이스
 * 뒤에 두어 교체 자유"를 보장하는 경계.
 *
 * 발명 금지: 잡 상태(queued/running/completed/failed)는 contracts ReportStatus의
 * 부분집합을 그대로 차용한다 (DB diagnoses.status enum과 정합).
 */

import type { ReportStatus } from "@boina/contracts/enums";

/**
 * 잡 생명주기 상태.
 *
 * 02-trd §3 상태 모델은 (pending/running/done/failed)로 표기하지만, boina는
 * contracts/DB의 정본 enum(ReportStatus)에 정합시켜 다음으로 매핑한다:
 *   pending → "queued", done → "completed".
 * 즉 잡 상태는 ReportStatus의 부분집합이므로 새 enum을 발명하지 않는다.
 */
export type JobStatus = Extract<ReportStatus, "queued" | "running" | "completed" | "failed">;

/**
 * 허용된 상태 전이 (단방향 전진).
 *   queued    → running | failed
 *   running   → completed | failed
 *   completed → (종료)
 *   failed    → (종료)
 * 잘못된 전이는 InvalidJobTransitionError로 거부한다.
 */
export const JOB_STATUS_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  queued: ["running", "failed"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
} as const;

/** 종료 상태(더 이상 전이 불가) 여부. */
export function isTerminalJobStatus(status: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[status].length === 0;
}

/** from→to 전이가 허용되는지. */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * 큐에 넣을 잡 명세 (producer가 제출).
 *
 * `type`은 핸들러 라우팅 키(예: "diagnosis"). `payload`는 핸들러가 해석하는
 * 불투명 데이터 — 진단 잡의 경우 diagnosisId 등이 들어간다(배선은 P1-R2 담당).
 */
export interface JobSpec<TPayload = unknown> {
  /** 핸들러 라우팅 키 (예: "diagnosis"). */
  type: string;
  /** 핸들러가 해석하는 잡 입력. */
  payload: TPayload;
  /**
   * 이 잡이 반영할 diagnosis 행 id (있으면).
   * 경량 DbBacked 구현이 diagnoses.status를 갱신할 때 사용한다.
   * 더미/테스트 잡은 생략 가능.
   */
  diagnosisId?: string;
}

/** enqueue 후 큐가 발급하는 잡 레코드. */
export interface Job<TPayload = unknown> {
  /** 큐 내부 잡 id (UUID/serial 등 구현 자유). */
  id: string;
  type: string;
  payload: TPayload;
  diagnosisId?: string;
  status: JobStatus;
  /** running 진입 전까지 누적된 시도 횟수. */
  attempts: number;
  /** 마지막 실패 사유(있으면, 민감정보 비포함). */
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 잡 핸들러. 성공 시 정상 반환 → 큐가 completed로 전이.
 * throw 시 → 큐가 failed로 전이(에러 메시지 stamp).
 *
 * 핸들러는 상태 전이를 직접 만지지 않는다(큐의 책임). 비즈니스 로직만 수행.
 */
export type JobHandler<TPayload = unknown> = (job: Job<TPayload>) => Promise<void>;

/**
 * 잡 큐 추상화 — 인프라 교체 경계(OQ-5).
 *
 * 구현체(InMemoryJobQueue, DbBackedJobQueue, 추후 BullMqJobQueue)는 이
 * 인터페이스만 만족하면 서로 교체 가능하다. 서비스/Route Handler는 항상 이
 * 인터페이스에만 의존한다(구체 구현 import 금지 — 07 §6 외부 격리 규칙).
 */
export interface JobQueue {
  /** 잡을 큐에 넣고(=queued) 잡 레코드를 반환한다. */
  enqueue<TPayload>(spec: JobSpec<TPayload>): Promise<Job<TPayload>>;

  /**
   * 잡 타입에 핸들러를 등록한다. 등록된 타입의 대기 잡은 worker 루프에서
   * 처리된다(queued→running→completed/failed). 동일 타입 재등록은 덮어쓴다.
   */
  process<TPayload>(type: string, handler: JobHandler<TPayload>): void;

  /**
   * 대기 중인 잡을 한 번 비운다(테스트·서버리스 1-shot용). 처리된 잡 수를 반환.
   * 경량 구현의 worker 진입점 — cron/서버리스 호출이 이 메서드를 주기 호출한다.
   */
  drain(): Promise<number>;

  /** 잡 현재 상태 조회 (없으면 null). */
  getStatus(jobId: string): Promise<JobStatus | null>;

  /** 잡 레코드 조회 (없으면 null). */
  getJob(jobId: string): Promise<Job | null>;
}
