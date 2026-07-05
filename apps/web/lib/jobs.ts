// @TASK 수정R2-A-1 - 진단 잡 큐 배선 (DbBacked 전환 + 워커 트리거 + cross-process 복구)
// @SPEC docs/planning/02-trd.md#3-백그라운드-잡
// @SPEC docs/planning/DECISION_LOG.md (OQ-5 경량 잡 — 별도 브로커 없이 diagnoses.status 활용)
// @SPEC apps/web/lib/diagnosis/README.md (잡 워커 운영 가이드)
// @SPEC .claude/constitutions/nextjs/api-routes.md
//
// Route Handler/Server Action 은 이 모듈의 getJobQueue()/processJobQueue() 만 사용한다.
//
// ★ 수정R2-A 배경(출시차단): 이전엔 getJobQueue()=InMemoryJobQueue 였고 drain() 을 호출하는
//   주체가 프로덕션에 *없었다*(테스트만 drain). → 모든 진단이 영구 queued → 진단 통째 미동작.
//   본 모듈은 (1) DbBacked 로 전환(재시작·멀티인스턴스 안전), (2) enqueue 직후 백그라운드
//   drain + (3) cron 트리거 route(/api/jobs/process)가 호출할 processJobQueue() 를 제공해
//   "워커/스케줄러 없이도 표준 배포에서 진단이 자동 완주"하게 한다(멱등·동시성 안전).

import { type DbClient, createDb } from "@boina/db/client";
import { DbBackedJobQueue, type JobPayloadResolver, type JobQueue } from "@boina/jobs";
import {
  type DiagnosisJobPayload as PipelineDiagnosisJobPayload,
  buildDiagnosisHandler,
} from "./diagnosis/diagnosis-handler.js";
import { getDefaultDiagnosisRepository } from "./diagnosis/diagnosis-repository.js";
import type { DiagnosisRepository } from "./diagnosis/diagnosis-service.js";
import { resolveDiagnosisJobPayload } from "./diagnosis/job-payload-resolver.js";

/**
 * 진단 잡 페이로드 — 실제 파이프라인 핸들러 입력.
 * diagnosisId/businessProfile 가 채워지면 엔진 파이프라인을 완주한다.
 */
export type DiagnosisJobPayload = PipelineDiagnosisJobPayload;

/** 진단 잡 타입 키. */
export const DIAGNOSIS_JOB_TYPE = "diagnosis" as const;

/** 한 drain 라운드 동시 처리 상한(진단은 수십초 — 무제한 동시 실행 방지). */
const DRAIN_CONCURRENCY = 5;

let singleton: DbBackedJobQueue | null = null;
let singletonDb: DbClient | null = null;

/** DATABASE_URL 로 DbClient 를 생성한다(없으면 throw — 운영/통합 환경 보호). */
function getDb(): DbClient {
  if (singletonDb) return singletonDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  singletonDb = createDb(url);
  return singletonDb;
}

/**
 * 진단 핸들러를 등록한 DbBackedJobQueue 를 구성한다.
 *
 * - 핸들러에 db 를 주입한다(★ 영속화 배선: 이전엔 db 미주입으로 5종 테이블이 비어 있었음).
 * - payloadResolver 를 주입한다(cross-process 복구: cron 프로세스가 drain 할 때 인메모리
 *   메타가 없어도 DB 행으로 잡 payload 를 재구성해 처리).
 * - repo 주입(테스트 용이): 미지정 시 DATABASE_URL 기반 기본 repo.
 */
function buildQueue(repo?: DiagnosisRepository): DbBackedJobQueue {
  const db = getDb();
  const repository = repo ?? getDefaultDiagnosisRepository();

  const payloadResolver: JobPayloadResolver = async (diagnosisId) =>
    resolveDiagnosisJobPayload(db, diagnosisId, DIAGNOSIS_JOB_TYPE);

  const queue = new DbBackedJobQueue(db, {
    concurrency: DRAIN_CONCURRENCY,
    payloadResolver,
  });

  // 실 진단 핸들러(파이프라인 + 영속화). db 주입으로 competitors/gap/action 까지 일관 기록.
  const handler = buildDiagnosisHandler({ repo: repository, db });
  queue.process<DiagnosisJobPayload>(DIAGNOSIS_JOB_TYPE, handler);

  return queue;
}

/**
 * 프로세스 단일 잡 큐(DbBacked + 진단 핸들러)를 반환한다.
 *
 * 운영 경량(OQ-5): 별도 브로커 없이 diagnoses.status 를 큐 저장소로 활용한다.
 * repo 주입 시 싱글톤을 우회한다(테스트 격리).
 */
export function getJobQueue(repo?: DiagnosisRepository): JobQueue {
  if (singleton && !repo) return singleton;
  const queue = buildQueue(repo);
  if (!repo) singleton = queue;
  return queue;
}

/**
 * 대기 중인 진단 잡을 한 번 비운다(drain). 처리된 잡 수를 반환.
 *
 * 두 경로가 이 함수를 호출한다:
 *   1) enqueue 직후 백그라운드(kickBackgroundDrain) — 표준 배포에서 워커 없이 자동 완주.
 *   2) cron 트리거 route(/api/jobs/process) — 고아 잡(인스턴스 사망 등) 복구.
 * 멱등·동시성 안전: DbBacked 가 queued→running 을 원자적으로 claim 하므로 같은 잡 2회 처리 0.
 */
export async function processJobQueue(): Promise<number> {
  return getJobQueue().drain();
}

/**
 * enqueue 직후 백그라운드로 drain 을 띄운다(응답을 막지 않음).
 *
 * 표준 배포(Vercel/Node)에서 워커·스케줄러 없이도 진단이 자동 완주하게 하는 1차 경로다.
 * 같은 프로세스에서 enqueue→drain 하므로 인메모리 메타가 살아 있어 full fidelity 로 처리된다.
 * 서버리스에서 응답 후 인스턴스가 곧장 종료돼 미완으로 남는 경우는 cron 트리거(/api/jobs/process)가
 * 고아 잡을 복구한다(2차 경로). 에러는 삼켜서(워커 실패가 enqueue 응답을 깨지 않게) 로깅만 한다.
 */
export function kickBackgroundDrain(): void {
  void processJobQueue().catch((err) => {
    console.error("[jobs] background drain failed:", err instanceof Error ? err.message : err);
  });
}
