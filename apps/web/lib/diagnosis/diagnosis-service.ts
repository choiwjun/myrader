// @TASK P1-R2 - diagnosis 리소스 서비스 (앱↔DB 경계, DB-agnostic 코어)
// @SPEC docs/planning/04-database-design.md#diagnosis-table
// @SPEC docs/planning/02-trd.md#3-백그라운드-잡 (잡 상태 → diagnosis 반영)
// @SPEC docs/planning/07-coding-convention.md §2 (앱은 서비스 레이어 경유, DB 직접접근 금지)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출 → 신호등 변환)
// @TEST apps/web/tests/diagnosis/diagnosis-service.test.ts
//
// diagnosis 진단 세션의 순수 로직 + 저장소 추상화. Drizzle 미import(테스트 용이 +
// 07 단방향 의존: route/handler → service(인터페이스) → repository(DB 구현)).
// 구체 Drizzle 구현은 ./diagnosis-repository.ts.
//
// overallSignal(신호등)은 엔진 내부 점수(overallScore)를 화면용 HealthBand 로
// 파생한 값이다(07 §4). diagnoses 스키마에 별도 컬럼을 두지 않고(스키마 불변),
// 전달 레이어에서 변환만 한다(점수 원본은 뷰에 노출하지 않는다).
//
// 점수→신호등 변환은 전달 레이어(./signal.ts)가 소유한다 — 읽기/상태조회 경로가
// 무거운 엔진 배럴(@boina/engine: Playwright 등 server-only 의존)을 끌고 오지 않도록.

import type { HealthBand } from "@boina/contracts/enums";
import { scoreToSignal } from "./signal.js";

/** diagnoses.status 중 진단 잡이 만드는 값 (contracts/db enum 부분집합). */
export type DiagnosisStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "partial"
  | "canceled"
  | "timeout";

/** TRD § 7.3 / contracts CrawlFailureReason — 실패 사유(텍스트 인용 금지, enum). */
export type DiagnosisCrawlFailureReason =
  | "DNS_FAILED"
  | "CONNECTION_REFUSED"
  | "HTTP_5xx"
  | "HTTP_4xx"
  | "ROBOTS_BLOCK_ALL"
  | "TIMEOUT"
  | "JS_RENDER_FAILED";

/**
 * diagnoses 행의 앱層 레코드(저장소가 반환). DB 컬럼과 1:1 (overallScore 는 text).
 * 민감/내부 점수(overallScore)는 이 레코드까지만 — 뷰(DiagnosisView)에서 신호등으로 변환.
 */
export interface DiagnosisRecord {
  id: string;
  businessId: string;
  status: DiagnosisStatus;
  /** 0-100 정수의 text 표현 (04 스키마: overall_score text). null = 미산출. */
  overallScore: string | null;
  summaryText: string | null;
  crawlFailureReason: DiagnosisCrawlFailureReason | null;
  /** Operator-visible job metadata (validated payload + non-sensitive gate evidence). */
  jobPayload?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/** 화면(진행 표시·결과)용 뷰 — 점수 원본 비노출, 신호등(overallSignal)만 파생. */
export interface DiagnosisView {
  id: string;
  businessId: string;
  status: DiagnosisStatus;
  /** 07 §4: 엔진 점수 → 신호등(HealthBand). 미산출 시 null. */
  overallSignal: HealthBand | null;
  summaryText: string | null;
  crawlFailureReason: DiagnosisCrawlFailureReason | null;
  startedAt: Date;
  completedAt: Date | null;
}

/** create 입력 — businessId 만 필요(id 는 DB defaultRandom = UUID v4 생성). */
export interface CreateDiagnosisInput {
  businessId: string;
}

/** diagnoses 행 부분 갱신 패치 (저장소 update 인자). */
export interface DiagnosisPatch {
  status?: DiagnosisStatus;
  overallScore?: string | null;
  summaryText?: string | null;
  crawlFailureReason?: DiagnosisCrawlFailureReason | null;
  completedAt?: Date | null;
  jobPayload?: Record<string, unknown> | null;
}

/**
 * diagnosis 저장소 추상화 — DB 구현을 주입 가능하게 분리(07 경계 + 테스트 용이).
 * route/handler/service 는 이 인터페이스에만 의존한다.
 */
export interface DiagnosisRepository {
  create(input: CreateDiagnosisInput): Promise<DiagnosisRecord>;
  findById(id: string): Promise<DiagnosisRecord | null>;
  update(id: string, patch: DiagnosisPatch): Promise<DiagnosisRecord | null>;
}

/**
 * 엔진 내부 점수(0-100)를 화면 신호등(HealthBand)으로 파생한다 (07 §4).
 * null(미산출)이면 null. 점수 자체는 화면에 노출하지 않는다.
 */
export function deriveOverallSignal(overallScore: number | string | null): HealthBand | null {
  if (overallScore === null) return null;
  const n = typeof overallScore === "string" ? Number(overallScore) : overallScore;
  if (!Number.isFinite(n)) return null;
  return scoreToSignal(n);
}

/** DiagnosisRecord → DiagnosisView (점수 원본 제거, overallSignal 파생). */
export function toDiagnosisView(rec: DiagnosisRecord): DiagnosisView {
  return {
    id: rec.id,
    businessId: rec.businessId,
    status: rec.status,
    overallSignal: deriveOverallSignal(rec.overallScore),
    summaryText: rec.summaryText,
    crawlFailureReason: rec.crawlFailureReason,
    startedAt: rec.createdAt,
    completedAt: rec.completedAt,
  };
}

/** businessId 로 queued 진단 행을 만든다 (id = DB UUID v4). */
export async function createDiagnosis(
  repo: DiagnosisRepository,
  input: CreateDiagnosisInput,
): Promise<DiagnosisRecord> {
  return repo.create(input);
}

/** 진단 행을 화면용 뷰로 조회한다(없으면 null). */
export async function getDiagnosisView(
  repo: DiagnosisRepository,
  id: string,
): Promise<DiagnosisView | null> {
  const rec = await repo.findById(id);
  return rec ? toDiagnosisView(rec) : null;
}

/** queued → running 전이(워커 시작 시). */
export async function markDiagnosisRunning(
  repo: DiagnosisRepository,
  id: string,
): Promise<DiagnosisRecord | null> {
  return repo.update(id, { status: "running" });
}

/** 결과 반영 입력 — 엔진 산출 점수(number)와 한 줄 요약. */
export interface ReflectResultInput {
  overallScore: number;
  summaryText?: string | null;
}

/**
 * 파이프라인 산출 결과를 diagnoses 행에 반영한다 (running → completed).
 * overallScore 는 text 로 저장(04 스키마), completedAt stamp.
 */
export async function reflectDiagnosisResult(
  repo: DiagnosisRepository,
  id: string,
  input: ReflectResultInput,
): Promise<DiagnosisRecord | null> {
  return repo.update(id, {
    status: "completed",
    overallScore: String(Math.round(input.overallScore)),
    summaryText: input.summaryText ?? null,
    completedAt: new Date(),
  });
}

/** 실패 전이 입력 — 선택적 crawlFailureReason(enum). */
export interface MarkFailedInput {
  crawlFailureReason?: DiagnosisCrawlFailureReason | null;
}

/** running → failed 전이 (+ crawlFailureReason 반영, completedAt stamp). */
export async function markDiagnosisFailed(
  repo: DiagnosisRepository,
  id: string,
  input: MarkFailedInput = {},
): Promise<DiagnosisRecord | null> {
  return repo.update(id, {
    status: "failed",
    crawlFailureReason: input.crawlFailureReason ?? null,
    completedAt: new Date(),
  });
}
