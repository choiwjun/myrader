CREATE TYPE "creator_plan" AS ENUM ('free', 'starter', 'pro');
CREATE TYPE "creator_scan_trigger" AS ENUM ('auto', 'manual', 'onboarding');
CREATE TYPE "creator_scan_status" AS ENUM ('queued', 'expanding', 'scoring', 'probing', 'done', 'failed');
CREATE TYPE "creator_keyword_verdict" AS ENUM ('now', 'good', 'normal', 'watch');
CREATE TYPE "creator_citation_kind" AS ENUM ('url', 'brand', 'phrase');

CREATE TABLE "creator_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "seed_tokens" text[] NOT NULL,
  "channel_url" text,
  "plan" "creator_plan" DEFAULT 'free' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "creator_scans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "topic_id" uuid NOT NULL REFERENCES "creator_topics"("id") ON DELETE cascade,
  "trigger" "creator_scan_trigger" DEFAULT 'auto' NOT NULL,
  "status" "creator_scan_status" DEFAULT 'queued' NOT NULL,
  "stage_detail" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "creator_keywords" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scan_id" uuid NOT NULL REFERENCES "creator_scans"("id") ON DELETE cascade,
  "text" text NOT NULL,
  "cluster_id" text NOT NULL,
  "freq" integer,
  "hop" integer DEFAULT 0 NOT NULL,
  "via_token" text,
  "naver_score" integer NOT NULL,
  "naver_evidence" jsonb NOT NULL,
  "ai_score" integer,
  "ai_evidence" jsonb,
  "verdict" "creator_keyword_verdict" NOT NULL
);

CREATE TABLE "creator_lookups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "keyword" text NOT NULL,
  "naver_score" integer NOT NULL,
  "naver_evidence" jsonb NOT NULL,
  "ai_score" integer,
  "ai_evidence" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "creator_articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "url" text NOT NULL,
  "title" text,
  "diagnosis_score" integer,
  "diagnosis_checklist" jsonb,
  "tracked" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "creator_citations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "article_id" uuid NOT NULL REFERENCES "creator_articles"("id") ON DELETE cascade,
  "model" text NOT NULL,
  "query_text" text NOT NULL,
  "kind" "creator_citation_kind" NOT NULL,
  "excerpt" text NOT NULL,
  "found_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "creator_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "week" text NOT NULL,
  "payload" jsonb NOT NULL,
  "emailed_at" timestamp with time zone
);

CREATE TABLE "creator_usage" (
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "period" text NOT NULL,
  "scans_used" integer DEFAULT 0 NOT NULL,
  "diagnoses_used" integer DEFAULT 0 NOT NULL,
  "lookups_used" integer DEFAULT 0 NOT NULL
);

CREATE INDEX "creator_topics_account_id_idx" ON "creator_topics" ("account_id");
CREATE INDEX "creator_scans_topic_id_idx" ON "creator_scans" ("topic_id");
CREATE INDEX "creator_scans_status_idx" ON "creator_scans" ("status");
CREATE INDEX "creator_keywords_scan_id_idx" ON "creator_keywords" ("scan_id");
CREATE INDEX "creator_keywords_verdict_idx" ON "creator_keywords" ("verdict");
CREATE INDEX "creator_lookups_account_id_idx" ON "creator_lookups" ("account_id");
CREATE INDEX "creator_articles_account_id_idx" ON "creator_articles" ("account_id");
CREATE INDEX "creator_citations_article_id_idx" ON "creator_citations" ("article_id");
CREATE INDEX "creator_reports_account_id_idx" ON "creator_reports" ("account_id");
CREATE INDEX "creator_usage_account_period_idx" ON "creator_usage" ("account_id", "period");
