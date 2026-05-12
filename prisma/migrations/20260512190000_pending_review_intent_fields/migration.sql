-- PendingReview was added to schema without an earlier CREATE migration on some databases.
-- Create the full table when missing, then ensure intent-tag columns exist.

CREATE TABLE IF NOT EXISTS "PendingReview" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "request_id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "raw_input" TEXT NOT NULL,
    "detected_job" TEXT,
    "parsed_entities" JSONB,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "estimated_minutes" INTEGER NOT NULL DEFAULT 0,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inferred_category" TEXT,
    "confidence_label" TEXT,
    "parser_stage_used" TEXT,
    "blocked_reason" TEXT,
    "user_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "notes" TEXT,
    "uploaded_photos" TEXT,
    "review_status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PendingReview_request_id_key" ON "PendingReview"("request_id");

ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "inferred_category" TEXT;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "confidence_label" TEXT;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "parser_stage_used" TEXT;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "blocked_reason" TEXT;
