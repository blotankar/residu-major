/*
  Warnings:

  - You are about to drop the column `collectionCentreId` on the `farmers` table. All the data in the column will be lost.
  - You are about to alter the column `mrlValue` on the `medicine_mrls` table. The data in that column could be lost. The data in that column will be cast from `Decimal(12,6)` to `DoublePrecision`.

*/
-- DropForeignKey
ALTER TABLE "farmers" DROP CONSTRAINT "farmers_collectionCentreId_fkey";

-- DropIndex
DROP INDEX "farmers_collectionCentreId_idx";

-- DropIndex
DROP INDEX "treatments_medicineMrlId_idx";

-- AlterTable
ALTER TABLE "farmers" DROP COLUMN "collectionCentreId";

-- AlterTable
ALTER TABLE "medicine_mrls" ALTER COLUMN "mrlValue" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "regulatoryStatus" DROP NOT NULL,
ALTER COLUMN "regulatoryStatus" DROP DEFAULT;

-- CreateTable
CREATE TABLE "collection_centre_cattle" (
    "id" TEXT NOT NULL,
    "collectionCentreId" TEXT NOT NULL,
    "cattleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_centre_cattle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_centre_cattle_cattleId_key" ON "collection_centre_cattle"("cattleId");

-- CreateIndex
CREATE INDEX "collection_centre_cattle_collectionCentreId_idx" ON "collection_centre_cattle"("collectionCentreId");

-- AddForeignKey
ALTER TABLE "collection_centre_cattle" ADD CONSTRAINT "collection_centre_cattle_collectionCentreId_fkey" FOREIGN KEY ("collectionCentreId") REFERENCES "collection_centres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_centre_cattle" ADD CONSTRAINT "collection_centre_cattle_cattleId_fkey" FOREIGN KEY ("cattleId") REFERENCES "Cattle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
