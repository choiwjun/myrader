import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  creatorCitationKindEnum,
  creatorKeywordVerdictEnum,
  creatorPlanEnum,
  creatorScanStatusEnum,
  creatorScanTriggerEnum,
} from "../enums.js";
import { accounts } from "./account.js";

export const creatorTopics = pgTable(
  "creator_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    seedTokens: text("seed_tokens").array().notNull(),
    channelUrl: text("channel_url"),
    plan: creatorPlanEnum("plan").notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("creator_topics_account_id_idx").on(t.accountId)],
);

export const creatorScans = pgTable(
  "creator_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => creatorTopics.id, { onDelete: "cascade" }),
    trigger: creatorScanTriggerEnum("trigger").notNull().default("auto"),
    status: creatorScanStatusEnum("status").notNull().default("queued"),
    stageDetail: text("stage_detail"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("creator_scans_topic_id_idx").on(t.topicId),
    index("creator_scans_status_idx").on(t.status),
  ],
);

export const creatorKeywords = pgTable(
  "creator_keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => creatorScans.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    clusterId: text("cluster_id").notNull(),
    freq: integer("freq"),
    hop: integer("hop").notNull().default(0),
    viaToken: text("via_token"),
    naverScore: integer("naver_score").notNull(),
    naverEvidence: jsonb("naver_evidence").$type<Record<string, unknown>>().notNull(),
    aiScore: integer("ai_score"),
    aiEvidence: jsonb("ai_evidence").$type<Record<string, unknown>>(),
    verdict: creatorKeywordVerdictEnum("verdict").notNull(),
  },
  (t) => [
    index("creator_keywords_scan_id_idx").on(t.scanId),
    index("creator_keywords_verdict_idx").on(t.verdict),
  ],
);

export const creatorLookups = pgTable(
  "creator_lookups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    naverScore: integer("naver_score").notNull(),
    naverEvidence: jsonb("naver_evidence").$type<Record<string, unknown>>().notNull(),
    aiScore: integer("ai_score"),
    aiEvidence: jsonb("ai_evidence").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("creator_lookups_account_id_idx").on(t.accountId)],
);

export const creatorArticles = pgTable(
  "creator_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    diagnosisScore: integer("diagnosis_score"),
    diagnosisChecklist: jsonb("diagnosis_checklist").$type<Record<string, unknown>>(),
    tracked: integer("tracked").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("creator_articles_account_id_idx").on(t.accountId)],
);

export const creatorCitations = pgTable(
  "creator_citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => creatorArticles.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    queryText: text("query_text").notNull(),
    kind: creatorCitationKindEnum("kind").notNull(),
    excerpt: text("excerpt").notNull(),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("creator_citations_article_id_idx").on(t.articleId)],
);

export const creatorReports = pgTable(
  "creator_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    week: text("week").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
  },
  (t) => [index("creator_reports_account_id_idx").on(t.accountId)],
);

export const creatorUsage = pgTable(
  "creator_usage",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    scansUsed: integer("scans_used").notNull().default(0),
    diagnosesUsed: integer("diagnoses_used").notNull().default(0),
    lookupsUsed: integer("lookups_used").notNull().default(0),
  },
  (t) => [index("creator_usage_account_period_idx").on(t.accountId, t.period)],
);

export type CreatorTopic = typeof creatorTopics.$inferSelect;
export type CreatorScan = typeof creatorScans.$inferSelect;
export type CreatorKeyword = typeof creatorKeywords.$inferSelect;
export type CreatorLookup = typeof creatorLookups.$inferSelect;
export type CreatorArticle = typeof creatorArticles.$inferSelect;
export type CreatorCitation = typeof creatorCitations.$inferSelect;
export type CreatorReport = typeof creatorReports.$inferSelect;
export type CreatorUsage = typeof creatorUsage.$inferSelect;
