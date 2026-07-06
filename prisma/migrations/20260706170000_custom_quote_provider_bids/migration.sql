-- Custom quote fulfillment + provider bidding for commercial bulk jobs

ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "custom_quote" DOUBLE PRECISION;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "job_id" TEXT;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "assignment_mode" TEXT;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "assigned_provider_id" TEXT;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "admin_location" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PendingReview_job_id_key" ON "PendingReview"("job_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PendingReview_job_id_fkey'
  ) THEN
    ALTER TABLE "PendingReview"
      ADD CONSTRAINT "PendingReview_job_id_fkey"
      FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ProviderQuote" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "quotedPrice" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderQuote_jobId_providerId_key" ON "ProviderQuote"("jobId", "providerId");
CREATE INDEX IF NOT EXISTS "ProviderQuote_jobId_idx" ON "ProviderQuote"("jobId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProviderQuote_jobId_fkey'
  ) THEN
    ALTER TABLE "ProviderQuote"
      ADD CONSTRAINT "ProviderQuote_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProviderQuote_providerId_fkey'
  ) THEN
    ALTER TABLE "ProviderQuote"
      ADD CONSTRAINT "ProviderQuote_providerId_fkey"
      FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
