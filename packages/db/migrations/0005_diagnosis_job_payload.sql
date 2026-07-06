ALTER TABLE "diagnoses"
  ADD COLUMN IF NOT EXISTS "job_type" text,
  ADD COLUMN IF NOT EXISTS "job_payload" jsonb,
  ADD COLUMN IF NOT EXISTS "job_attempt_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "job_last_error" text,
  ADD COLUMN IF NOT EXISTS "job_enqueued_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "job_started_at" timestamp with time zone;
