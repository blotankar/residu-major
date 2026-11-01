-- CreateEnum
CREATE TYPE "ResidueScreeningResult" AS ENUM ('NEGATIVE', 'POSITIVE', 'INVALID');

-- AlterEnum
ALTER TYPE "MilkBatchStatus" ADD VALUE 'PENDING_SCREENING';

-- AlterTable
ALTER TABLE "milk_batches" ALTER COLUMN "status" SET DEFAULT 'PENDING_SCREENING';

-- CreateTable
CREATE TABLE "residue_screenings" (
    "id" TEXT NOT NULL,
    "milkBatchId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "testKitName" TEXT NOT NULL,
    "testKitBatchNumber" TEXT,
    "antibioticGroups" TEXT[],
    "result" "ResidueScreeningResult" NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL,
    "testedByUserId" TEXT NOT NULL,
    "remarks" TEXT,
    "reportUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residue_screenings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "residue_screenings_sampleId_key" ON "residue_screenings"("sampleId");

-- CreateIndex
CREATE INDEX "residue_screenings_milkBatchId_testedAt_idx" ON "residue_screenings"("milkBatchId", "testedAt");

-- CreateIndex
CREATE INDEX "residue_screenings_result_idx" ON "residue_screenings"("result");

-- AddForeignKey
ALTER TABLE "residue_screenings" ADD CONSTRAINT "residue_screenings_milkBatchId_fkey" FOREIGN KEY ("milkBatchId") REFERENCES "milk_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residue_screenings" ADD CONSTRAINT "residue_screenings_testedByUserId_fkey" FOREIGN KEY ("testedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
