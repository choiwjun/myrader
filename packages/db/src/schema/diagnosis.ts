/**
 * @TASK P0-T2 - Diagnosis 테이블 정의
 * @SPEC docs/planning/04-database-design.md#diagnosis-table
 *
 * diagnosis table — 1회 진단 세션 (잡 상태 포함)
 *
 * 개념: x-sag의 diagnosis 스키마를 차용하되, boina에서는
 * business_id를 외래키로 참조하여 계층 구조 유지.
 * status는 contracts/enums.ts의 ReportStatus (queued/running/completed/failed/partial/canceled/timeout).
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { crawlFailureReasonEnum, diagnosisStatusEnum } from "../enums.js";
import { businesses } from "./business.js";

export const diagnoses = pgTable(
  "diagnoses",
  {
    /** UUID v4 primary key */
    id: uuid("id").primaryKey().defaultRandom(),

    /** Business reference (진단 대상 가게) */
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    /** Diagnosis status (queued/running/completed/failed/partial/canceled/timeout) */
    status: diagnosisStatusEnum("status").notNull().default("queued"),

    /**
     * Crawl failure reason (optional, when status = 'failed' or 'partial')
     * e.g., DNS_FAILED, TIMEOUT, etc.
     */
    crawlFailureReason: crawlFailureReasonEnum("crawl_failure_reason"),

    /**
     * Summary text (한 줄 요약, 화면 표시용)
     * e.g., "SEO 준비도 40점, 경쟁사 3곳 발견"
     */
    summaryText: text("summary_text"),

    /**
     * Overall score (0-100, internal only)
     * 화면에는 신호등으로 변환하여 노출 (07 § 4 점수 비노출)
     */
    overallScore: text("overall_score"),

    /** Diagnosis created timestamp */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    /** Last update timestamp */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    /** Completion timestamp (when status = 'completed' or 'failed') */
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    /** Index for business-based diagnosis queries */
    index("diagnoses_business_id_idx").on(t.businessId),
    /** Index for status-based queries */
    index("diagnoses_status_idx").on(t.status),
    /** Index for diagnosis creation time (latest first) */
    index("diagnoses_created_at_idx").on(t.createdAt),
  ],
);

export type Diagnosis = typeof diagnoses.$inferSelect;
export type NewDiagnosis = typeof diagnoses.$inferInsert;
