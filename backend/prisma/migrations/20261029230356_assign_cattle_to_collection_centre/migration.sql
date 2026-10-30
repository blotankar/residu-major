-- AlterTable
ALTER TABLE "Cattle" ADD COLUMN     "collectionCentreId" TEXT;

-- CreateIndex
CREATE INDEX "Cattle_collectionCentreId_idx" ON "Cattle"("collectionCentreId");

-- AddForeignKey
ALTER TABLE "Cattle" ADD CONSTRAINT "Cattle_collectionCentreId_fkey" FOREIGN KEY ("collectionCentreId") REFERENCES "collection_centres"("id") ON DELETE SET NULL ON UPDATE CASCADE;
