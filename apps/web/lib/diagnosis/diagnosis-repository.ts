// @TASK P1-R2 - diagnosis 저장소 (Drizzle/@boina/db 구현)
// @SPEC docs/planning/07-coding-convention.md §2 (앱↔DB 서비스 레이어 경유)
// @SPEC packages/db/src/schema/diagnosis.ts (diagnoses 테이블 — 구조 변경 금지, import만)
//
// DiagnosisRepository 의 Postgres 구현. 모든 쿼리는 eq() 파라미터 바인딩 —
// 문자열 보간 쿼리 금지(SQL Injection 방지, Guardrails). id 는 DB defaultRandom()
// (UUID v4) 가 생성 — 앱에서 만들지 않는다(.claude/constitutions/common/uuid.md).

import { type DbClient, createDb } from "@boina/db/client";
import { diagnoses } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import type {
  DiagnosisCrawlFailureReason,
  DiagnosisPatch,
  DiagnosisRecord,
  DiagnosisRepository,
  DiagnosisStatus,
} from "./diagnosis-service.js";

/** diagnoses 행(Drizzle select) → 앱 DiagnosisRecord 매핑. */
function toRecord(row: {
  id: string;
  businessId: string;
  status: string;
  overallScore: string | null;
  summaryText: string | null;
  crawlFailureReason: string | null;
  jobPayload: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): DiagnosisRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    status: row.status as DiagnosisStatus,
    overallScore: row.overallScore,
    summaryText: row.summaryText,
    crawlFailureReason: row.crawlFailureReason as DiagnosisCrawlFailureReason | null,
    jobPayload: row.jobPayload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

/** @boina/db(Drizzle/Postgres) 기반 DiagnosisRepository 구현. */
export function createDbDiagnosisRepository(db: DbClient): DiagnosisRepository {
  return {
    async create({ businessId }) {
      const [row] = await db.insert(diagnoses).values({ businessId, status: "queued" }).returning();
      if (!row) throw new Error("diagnosis insert failed");
      return toRecord(row);
    },

    async findById(id) {
      const [row] = await db.select().from(diagnoses).where(eq(diagnoses.id, id)).limit(1);
      return row ? toRecord(row) : null;
    },

    async update(id, patch: DiagnosisPatch) {
      // 빈 패치는 updatedAt 만 갱신(상태 무변경 호출 방어).
      const [row] = await db
        .update(diagnoses)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(diagnoses.id, id))
        .returning();
      return row ? toRecord(row) : null;
    },
  };
}

/** 기본 repository 를 DATABASE_URL 로 생성한다(잡 핸들러/route 진입점에서 사용). */
export function getDefaultDiagnosisRepository(): DiagnosisRepository {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db: DbClient = createDb(url);
  return createDbDiagnosisRepository(db);
}
