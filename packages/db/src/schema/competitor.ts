/**
 * @TASK P0-T2 - Competitor 테이블 정의
 * @SPEC docs/planning/04-database-design.md#competitor-table
 *
 * competitor table — 비교 대상 경쟁사
 *
 * 개념: x-sag의 competitor_reports를 차용하되, boina에서는
 * diagnosis_id를 직접 참조하여 진단과 1:N 관계.
 *
 * REQ-003 손실 프레이밍: 네이버 SERP 실 랭킹 데이터로 검증된
 * 경쟁사 정보만 저장. 휴리스틱 추출명은 절대 사용 금지 (07 정직성).
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { competitorSourceEnum } from "../enums.js";
import { diagnoses } from "./diagnosis.js";

interface EstimatedScores {
  seo?: number;
  aeo?: number;
  geo?: number;
  perf?: number;
  overall?: number;
}

export const competitors = pgTable(
  "competitors",
  {
    /** UUID v4 primary key */
    id: uuid("id").primaryKey().defaultRandom(),

    /** Diagnosis reference */
    diagnosisId: uuid("diagnosis_id")
      .notNull()
      .references(() => diagnoses.id, { onDelete: "cascade" }),

    /** Competitor URL */
    url: text("url").notNull(),

    /** Competitor business name (from verified source only) */
    name: text("name"),

    /** SERP rank (1-based, optional if discovery method ≠ naver_serp) */
    serpRank: integer("serp_rank"),

    /**
     * Source of discovery: naver_serp, gpt_grounded, manual
     * 정직성: naver_serp = 실제 SERP 순위 / gpt_grounded = 구조화 추출
     */
    source: competitorSourceEnum("source").notNull().default("manual"),

    /**
     * Estimated scores (SERP 기반 추정, 실제 진단 전)
     * { seo?: number, aeo?: number, geo?: number, perf?: number, overall?: number }
     */
    estimatedScores: jsonb("estimated_scores").$type<EstimatedScores>(),

    /**
     * Whether URL is anonymized (POLICY § 11.x)
     * false = 실제 URL 노출, true = 마스킹 처리
     */
    isAnonymized: boolean("is_anonymized").notNull().default(false),

    /** Discovery timestamp */
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),

    /** Created timestamp */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Index for diagnosis-based queries */
    index("competitors_diagnosis_id_idx").on(t.diagnosisId),
    /** Unique constraint: same diagnosis + same URL */
    unique("competitors_diagnosis_url_uniq").on(t.diagnosisId, t.url),
  ],
);

export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;
