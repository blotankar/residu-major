-- DropForeignKey
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_dispatchId_fkey";

-- AlterTable
ALTER TABLE "treatments" ADD COLUMN     "medicineMrlId" TEXT;

-- CreateTable
CREATE TABLE "medicine_mrls" (
    "id" TEXT NOT NULL,
    "medicineName" TEXT NOT NULL,
    "activeIngredient" TEXT,
    "mrlValue" DECIMAL(12,6),
    "unit" TEXT,
    "sourceTitle" TEXT,
    "sourceUrl" TEXT,
    "regulatoryStatus" TEXT NOT NULL DEFAULT 'NOT_VERIFIED',
    "unitVerification" TEXT,
    "isDashboardEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicine_mrls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medicine_mrls_medicineName_key" ON "medicine_mrls"("medicineName");

-- CreateIndex
CREATE INDEX "treatments_medicineMrlId_idx" ON "treatments"("medicineMrlId");

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_medicineMrlId_fkey" FOREIGN KEY ("medicineMrlId") REFERENCES "medicine_mrls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "factory_dispatches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
