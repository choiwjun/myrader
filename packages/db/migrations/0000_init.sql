-- Create all enum types first
CREATE TYPE "plan" AS ENUM('free', 'basic', 'pro', 'business');
CREATE TYPE "diagnosis_status" AS ENUM('queued', 'running', 'completed', 'failed', 'partial', 'canceled', 'timeout');
CREATE TYPE "crawl_failure_reason" AS ENUM('DNS_FAILED', 'CONNECTION_REFUSED', 'HTTP_5xx', 'HTTP_4xx', 'ROBOTS_BLOCK_ALL', 'TIMEOUT', 'JS_RENDER_FAILED');
CREATE TYPE "category" AS ENUM('seo', 'aeo', 'geo', 'a11y', 'backlink', 'perf');
CREATE TYPE "action_type" AS ENUM('self_fix', 'snippet_action', 'vendor_action', 'si_action');
CREATE TYPE "priority" AS ENUM('high', 'medium', 'low');
CREATE TYPE "difficulty" AS ENUM('easy', 'medium', 'hard');
CREATE TYPE "impact" AS ENUM('low', 'medium', 'high');
CREATE TYPE "generated_asset_type" AS ENUM('LOCAL_BUSINESS', 'ORGANIZATION', 'SERVICE', 'FAQ_SCHEMA', 'BREADCRUMB', 'LLMS_TXT', 'FAQ_HTML');
CREATE TYPE "code_format" AS ENUM('json-ld', 'html', 'text', 'other');
CREATE TYPE "generated_by" AS ENUM('rule', 'ai', 'hybrid');
CREATE TYPE "generated_asset_status" AS ENUM('draft', 'published', 'archived');
CREATE TYPE "source_type" AS ENUM('website', 'naver_place', 'naver_blog', 'instagram', 'kakao_place', 'youtube', 'facebook', 'other_platform');
CREATE TYPE "competitor_source" AS ENUM('naver_serp', 'gpt_grounded', 'manual');
CREATE TYPE "action_tier" AS ENUM('high', 'medium', 'low', 'waiting');
CREATE TYPE "gap_action_tier" AS ENUM('self_fix', 'snippet', 'vendor', 'ongoing');
CREATE TYPE "radar_subscription_status" AS ENUM('inactive', 'trialing', 'active', 'past_due', 'paused', 'canceled');
CREATE TYPE "radar_scan_trigger" AS ENUM('auto', 'manual', 'preview');
CREATE TYPE "radar_scan_status" AS ENUM('queued', 'expanding', 'scoring', 'probing', 'done', 'partial', 'skipped', 'failed');
CREATE TYPE "radar_keyword_verdict" AS ENUM('now', 'good', 'normal', 'watch');
CREATE TYPE "radar_feedback_type" AS ENUM('used', 'not_yet', 'dismissed', 'irrelevant');

--> statement-breakpoint
-- Create tables
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"phone" text,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagnosis_id" uuid NOT NULL,
	"action_ref" text NOT NULL,
	"action_tier" "action_tier" DEFAULT 'low' NOT NULL,
	"is_today_one" boolean DEFAULT false NOT NULL,
	"is_completed" boolean,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	-- account_id NULLABLE (익명 진단 — S1 auth:false / AC-1 "이름 한 칸으로 진단 시작").
	-- 통합(수정라운드A-4): 과거 0001_anonymous_business.sql 이 DROP NOT NULL 하던 것을
	-- 처음부터 nullable 로 둔다 → clean DB 에 0000 만 적용해도 익명 동작(0001 불필요·no-op).
	-- 인증 세션이 있으면 account 귀속, 익명이면 NULL → 결제(P3)/설정(S7)에서 귀속.
	"account_id" uuid,
	"name" text NOT NULL,
	-- 업종(자유 텍스트 — 네이버 후보 업종 문자열). 엔진 category enum 과 무관(S7 설정에서 확인/수정).
	"category" text,
	"region" text,
	"naver_place_id" text,
	"homepage_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "businesses_naver_place_id_unique" UNIQUE("naver_place_id")
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagnosis_id" uuid NOT NULL,
	"url" text NOT NULL,
	"name" text,
	"serp_rank" integer,
	"source" "competitor_source" DEFAULT 'manual' NOT NULL,
	"estimated_scores" jsonb,
	"is_anonymized" boolean DEFAULT false NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitors_diagnosis_url_uniq" UNIQUE("diagnosis_id","url")
);
--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"status" "diagnosis_status" DEFAULT 'queued' NOT NULL,
	"crawl_failure_reason" "crawl_failure_reason",
	"summary_text" text,
	"overall_score" text,
	"job_type" text,
	"job_payload" jsonb,
	"job_attempt_count" integer DEFAULT 0 NOT NULL,
	"job_last_error" text,
	"job_enqueued_at" timestamp with time zone,
	"job_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "engine_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagnosis_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"category" "category" NOT NULL,
	"action_type" "action_type" NOT NULL,
	"priority" "priority" NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"evidence" jsonb,
	"impact_score" integer,
	"expected_effect" text,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"related_snippet_type" text,
	"recommendation_text" text,
	"page_url" text,
	"rule_version" text DEFAULT '1.0.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gap_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"item" text NOT NULL,
	"competitor_has" boolean DEFAULT false NOT NULL,
	"is_my_gap" boolean DEFAULT false NOT NULL,
	"description" text,
	-- action 4분류(🟢🟡🔴⏳) 보존 — 영속화→읽기 왕복에서 tier 가 green 으로 수렴하지 않게 한다.
	"action_tier" "gap_action_tier" DEFAULT 'self_fix' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagnosis_id" uuid NOT NULL,
	"type" "generated_asset_type" NOT NULL,
	"code" text NOT NULL,
	"code_format" "code_format" DEFAULT 'json-ld' NOT NULL,
	"user_edits" jsonb,
	"generated_by" "generated_by" DEFAULT 'rule' NOT NULL,
	"ai_model" text,
	"status" "generated_asset_status" DEFAULT 'draft' NOT NULL,
	"is_latest" boolean DEFAULT true NOT NULL,
	"action_tier" "action_tier",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radar_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"account_id" uuid,
	"status" "radar_subscription_status" DEFAULT 'inactive' NOT NULL,
	"next_scan_at" timestamp with time zone,
	"last_scan_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radar_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
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
CREATE TABLE "radar_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
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
CREATE TABLE "radar_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"scan_id" uuid,
	"keyword_id" uuid,
	"feedback_type" "radar_feedback_type" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "engine_results" ADD CONSTRAINT "engine_results_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gap_rows" ADD CONSTRAINT "gap_rows_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "generated_assets" ADD CONSTRAINT "generated_assets_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "radar_subscriptions" ADD CONSTRAINT "radar_subscriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "radar_subscriptions" ADD CONSTRAINT "radar_subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "radar_scans" ADD CONSTRAINT "radar_scans_subscription_id_radar_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."radar_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "radar_scans" ADD CONSTRAINT "radar_scans_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "radar_keywords" ADD CONSTRAINT "radar_keywords_scan_id_radar_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."radar_scans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "radar_feedback" ADD CONSTRAINT "radar_feedback_subscription_id_radar_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."radar_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "radar_feedback" ADD CONSTRAINT "radar_feedback_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "radar_feedback" ADD CONSTRAINT "radar_feedback_scan_id_radar_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."radar_scans"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "radar_feedback" ADD CONSTRAINT "radar_feedback_keyword_id_radar_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."radar_keywords"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "accounts_email_idx" ON "accounts" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "accounts_plan_idx" ON "accounts" USING btree ("plan");
--> statement-breakpoint
CREATE INDEX "accounts_deleted_at_idx" ON "accounts" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "actions_diagnosis_id_idx" ON "actions" USING btree ("diagnosis_id");
--> statement-breakpoint
CREATE INDEX "actions_is_today_one_idx" ON "actions" USING btree ("is_today_one");
--> statement-breakpoint
CREATE INDEX "actions_is_completed_idx" ON "actions" USING btree ("is_completed");
--> statement-breakpoint
CREATE INDEX "actions_diagnosis_tier_idx" ON "actions" USING btree ("diagnosis_id","action_tier");
--> statement-breakpoint
CREATE INDEX "businesses_account_id_idx" ON "businesses" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "businesses_naver_place_id_idx" ON "businesses" USING btree ("naver_place_id");
--> statement-breakpoint
CREATE INDEX "businesses_deleted_at_idx" ON "businesses" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "competitors_diagnosis_id_idx" ON "competitors" USING btree ("diagnosis_id");
--> statement-breakpoint
CREATE INDEX "diagnoses_business_id_idx" ON "diagnoses" USING btree ("business_id");
--> statement-breakpoint
CREATE INDEX "diagnoses_status_idx" ON "diagnoses" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "diagnoses_created_at_idx" ON "diagnoses" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "engine_results_diagnosis_id_idx" ON "engine_results" USING btree ("diagnosis_id");
--> statement-breakpoint
CREATE INDEX "engine_results_category_idx" ON "engine_results" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "engine_results_priority_idx" ON "engine_results" USING btree ("priority");
--> statement-breakpoint
CREATE INDEX "engine_results_diagnosis_category_priority_idx" ON "engine_results" USING btree ("diagnosis_id","category","priority");
--> statement-breakpoint
CREATE INDEX "gap_rows_competitor_id_idx" ON "gap_rows" USING btree ("competitor_id");
--> statement-breakpoint
CREATE INDEX "gap_rows_is_my_gap_idx" ON "gap_rows" USING btree ("is_my_gap");
--> statement-breakpoint
CREATE INDEX "generated_assets_diagnosis_id_idx" ON "generated_assets" USING btree ("diagnosis_id");
--> statement-breakpoint
CREATE INDEX "generated_assets_type_idx" ON "generated_assets" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "generated_assets_diagnosis_type_is_latest_idx" ON "generated_assets" USING btree ("diagnosis_id","type","is_latest");
--> statement-breakpoint
CREATE INDEX "generated_assets_status_idx" ON "generated_assets" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "radar_subscriptions_business_id_uniq" ON "radar_subscriptions" USING btree ("business_id");
--> statement-breakpoint
CREATE INDEX "radar_subscriptions_account_id_idx" ON "radar_subscriptions" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "radar_subscriptions_status_idx" ON "radar_subscriptions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "radar_subscriptions_next_scan_at_idx" ON "radar_subscriptions" USING btree ("next_scan_at");
--> statement-breakpoint
CREATE INDEX "radar_scans_subscription_id_idx" ON "radar_scans" USING btree ("subscription_id");
--> statement-breakpoint
CREATE INDEX "radar_scans_business_id_idx" ON "radar_scans" USING btree ("business_id");
--> statement-breakpoint
CREATE INDEX "radar_scans_status_idx" ON "radar_scans" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "radar_scans_created_at_idx" ON "radar_scans" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "radar_keywords_scan_id_idx" ON "radar_keywords" USING btree ("scan_id");
--> statement-breakpoint
CREATE INDEX "radar_keywords_text_idx" ON "radar_keywords" USING btree ("text");
--> statement-breakpoint
CREATE INDEX "radar_keywords_cluster_id_idx" ON "radar_keywords" USING btree ("cluster_id");
--> statement-breakpoint
CREATE INDEX "radar_keywords_verdict_idx" ON "radar_keywords" USING btree ("verdict");
--> statement-breakpoint
CREATE INDEX "radar_feedback_subscription_id_idx" ON "radar_feedback" USING btree ("subscription_id");
--> statement-breakpoint
CREATE INDEX "radar_feedback_business_id_idx" ON "radar_feedback" USING btree ("business_id");
--> statement-breakpoint
CREATE INDEX "radar_feedback_scan_id_idx" ON "radar_feedback" USING btree ("scan_id");
--> statement-breakpoint
CREATE INDEX "radar_feedback_keyword_id_idx" ON "radar_feedback" USING btree ("keyword_id");
--> statement-breakpoint
CREATE INDEX "radar_feedback_type_idx" ON "radar_feedback" USING btree ("feedback_type");
