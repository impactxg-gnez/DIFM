-- Customer-provided location on custom quote requests (replaces admin-entered location)

ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "PendingReview" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

UPDATE "PendingReview"
SET "location" = "admin_location"
WHERE "location" IS NULL AND "admin_location" IS NOT NULL;
