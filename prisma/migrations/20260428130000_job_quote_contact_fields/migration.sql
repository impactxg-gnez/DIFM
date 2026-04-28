-- AlterTable
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "quoteContactEmail" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "quoteContactPhone" TEXT;
