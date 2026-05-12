-- Intent classifier fields for PendingReview admin tagging
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "inferred_category" TEXT;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "confidence_label" TEXT;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "parser_stage_used" TEXT;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "blocked_reason" TEXT;
