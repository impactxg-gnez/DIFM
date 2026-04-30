-- AlterTable
ALTER TABLE "ReviewQueue"
ADD COLUMN "slaDeadline" TIMESTAMP(3),
ADD COLUMN "slaStatus" TEXT NOT NULL DEFAULT 'PENDING';

-- Backfill existing rows to deterministic SLA window
UPDATE "ReviewQueue"
SET "slaDeadline" = "createdAt" + INTERVAL '60 minutes'
WHERE "slaDeadline" IS NULL;

-- Enforce not-null after backfill
ALTER TABLE "ReviewQueue"
ALTER COLUMN "slaDeadline" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ReviewQueue_slaStatus_slaDeadline_idx" ON "ReviewQueue"("slaStatus", "slaDeadline");
