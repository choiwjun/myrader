DO $$ BEGIN
	CREATE TYPE "radar_subscription_status" AS ENUM('inactive', 'trialing', 'active', 'past_due', 'paused', 'canceled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "radar_scan_trigger" AS ENUM('auto', 'manual', 'preview');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "radar_scan_status" AS ENUM('queued', 'expanding', 'scoring', 'probing', 'done', 'partial', 'skipped', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "radar_keyword_verdict" AS ENUM('now', 'good', 'normal', 'watch');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "radar_feedback_type" AS ENUM('used', 'not_yet', 'dismissed', 'irrelevant');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "radar_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE cascade,
	"account_id" uuid REFERENCES "public"."accounts"("id") ON DELETE set null,
	"status" "radar_subscription_status" DEFAULT 'inactive' NOT NULL,
	"next_scan_at" timestamp with time zone,
	"last_scan_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "radar_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL REFERENCES "public"."radar_subscriptions"("id") ON DELETE cascade,
	"business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE cascade,
	"trigger" "radar_scan_trigger" DEFAULT 'auto' NOT NULL,
	"status" "radar_scan_status" DEFAULT 'queued' NOT NULL,
	"stage_detail" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "radar_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL REFERENCES "public"."radar_scans"("id") ON DELETE cascade,
	"text" text NOT NULL,
	"cluster_id" text NOT NULL,
	"freq" integer DEFAULT 0 NOT NULL,
	"hop" integer DEFAULT 0 NOT NULL,
	"via_token" text,
	"naver_score" integer,
	"naver_evidence" jsonb,
	"ai_score" integer,
	"ai_evidence" jsonb,
	"verdict" "radar_keyword_verdict" DEFAULT 'watch' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "radar_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL REFERENCES "public"."radar_subscriptions"("id") ON DELETE cascade,
	"business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE cascade,
	"scan_id" uuid REFERENCES "public"."radar_scans"("id") ON DELETE set null,
	"keyword_id" uuid REFERENCES "public"."radar_keywords"("id") ON DELETE set null,
	"feedback_type" "radar_feedback_type" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "radar_subscriptions_business_id_uniq" ON "radar_subscriptions" USING btree ("business_id");
CREATE INDEX IF NOT EXISTS "radar_subscriptions_account_id_idx" ON "radar_subscriptions" USING btree ("account_id");
CREATE INDEX IF NOT EXISTS "radar_subscriptions_status_idx" ON "radar_subscriptions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "radar_subscriptions_next_scan_at_idx" ON "radar_subscriptions" USING btree ("next_scan_at");
CREATE INDEX IF NOT EXISTS "radar_scans_subscription_id_idx" ON "radar_scans" USING btree ("subscription_id");
CREATE INDEX IF NOT EXISTS "radar_scans_business_id_idx" ON "radar_scans" USING btree ("business_id");
CREATE INDEX IF NOT EXISTS "radar_scans_status_idx" ON "radar_scans" USING btree ("status");
CREATE INDEX IF NOT EXISTS "radar_scans_created_at_idx" ON "radar_scans" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "radar_keywords_scan_id_idx" ON "radar_keywords" USING btree ("scan_id");
CREATE INDEX IF NOT EXISTS "radar_keywords_text_idx" ON "radar_keywords" USING btree ("text");
CREATE INDEX IF NOT EXISTS "radar_keywords_cluster_id_idx" ON "radar_keywords" USING btree ("cluster_id");
CREATE INDEX IF NOT EXISTS "radar_keywords_verdict_idx" ON "radar_keywords" USING btree ("verdict");
CREATE INDEX IF NOT EXISTS "radar_feedback_subscription_id_idx" ON "radar_feedback" USING btree ("subscription_id");
CREATE INDEX IF NOT EXISTS "radar_feedback_business_id_idx" ON "radar_feedback" USING btree ("business_id");
CREATE INDEX IF NOT EXISTS "radar_feedback_scan_id_idx" ON "radar_feedback" USING btree ("scan_id");
CREATE INDEX IF NOT EXISTS "radar_feedback_keyword_id_idx" ON "radar_feedback" USING btree ("keyword_id");
CREATE INDEX IF NOT EXISTS "radar_feedback_type_idx" ON "radar_feedback" USING btree ("feedback_type");
