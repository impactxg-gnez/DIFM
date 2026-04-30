-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "reviewPriority" TEXT,
ADD COLUMN     "reviewType" TEXT;

-- CreateTable
CREATE TABLE "ReviewQueue" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reviewType" TEXT NOT NULL DEFAULT 'PRICING_OVERFLOW',
    "reviewPriority" TEXT NOT NULL DEFAULT 'HIGH',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "capability" TEXT NOT NULL,
    "calculatedTime" INTEGER NOT NULL,
    "ladderMaxTime" INTEGER NOT NULL,
    "overflowDelta" INTEGER NOT NULL,
    "selectedClarifiers" JSONB NOT NULL,
    "customPrice" DOUBLE PRECISION,
    "customTime" INTEGER,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewQueue_visitId_key" ON "ReviewQueue"("visitId");

-- CreateIndex
CREATE INDEX "ReviewQueue_status_createdAt_idx" ON "ReviewQueue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewQueue_jobId_idx" ON "ReviewQueue"("jobId");

-- AddForeignKey
ALTER TABLE "ReviewQueue" ADD CONSTRAINT "ReviewQueue_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewQueue" ADD CONSTRAINT "ReviewQueue_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
