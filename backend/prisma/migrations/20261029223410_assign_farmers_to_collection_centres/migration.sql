-- AlterTable
ALTER TABLE "farmers" ADD COLUMN     "collectionCentreId" TEXT;

-- CreateIndex
CREATE INDEX "farmers_collectionCentreId_idx" ON "farmers"("collectionCentreId");

-- AddForeignKey
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_collectionCentreId_fkey" FOREIGN KEY ("collectionCentreId") REFERENCES "collection_centres"("id") ON DELETE SET NULL ON UPDATE CASCADE;
