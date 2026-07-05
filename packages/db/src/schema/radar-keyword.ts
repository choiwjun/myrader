import type { RadarAiEvidence, RadarNaverEvidence } from "@boina/contracts/radar";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { radarKeywordVerdictEnum } from "../enums.js";
import { radarScans } from "./radar-scan.js";

export const radarKeywords = pgTable(
  "radar_keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => radarScans.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    clusterId: text("cluster_id").notNull(),
    freq: integer("freq").notNull().default(0),
    hop: integer("hop").notNull().default(0),
    viaToken: text("via_token"),
    naverScore: integer("naver_score"),
    naverEvidence: jsonb("naver_evidence").$type<RadarNaverEvidence>(),
    aiScore: integer("ai_score"),
    aiEvidence: jsonb("ai_evidence").$type<RadarAiEvidence>(),
    verdict: radarKeywordVerdictEnum("verdict").notNull().default("watch"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("radar_keywords_scan_id_idx").on(t.scanId),
    index("radar_keywords_text_idx").on(t.text),
    index("radar_keywords_cluster_id_idx").on(t.clusterId),
    index("radar_keywords_verdict_idx").on(t.verdict),
  ],
);

export type RadarKeyword = typeof radarKeywords.$inferSelect;
export type NewRadarKeyword = typeof radarKeywords.$inferInsert;
