-- AlterTable
ALTER TABLE "medicine_mrls" ADD COLUMN     "isScreeningEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "residue_screenings" ADD COLUMN     "panelComplete" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "residue_measurements" (
    "id" TEXT NOT NULL,
    "residueScreeningId" TEXT NOT NULL,
    "medicineMrlId" TEXT NOT NULL,
    "medicineNameAtTest" TEXT NOT NULL,
    "measuredValue" DOUBLE PRECISION NOT NULL,
    "measuredUnit" TEXT NOT NULL,
    "mrlValueAtTest" DOUBLE PRECISION NOT NULL,
    "mrlUnitAtTest" TEXT NOT NULL,
    "result" "ResidueScreeningResult" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "residue_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "residue_measurements_medicineMrlId_idx" ON "residue_measurements"("medicineMrlId");

-- CreateIndex
CREATE UNIQUE INDEX "residue_measurements_residueScreeningId_medicineMrlId_key" ON "residue_measurements"("residueScreeningId", "medicineMrlId");

-- AddForeignKey
ALTER TABLE "residue_measurements" ADD CONSTRAINT "residue_measurements_residueScreeningId_fkey" FOREIGN KEY ("residueScreeningId") REFERENCES "residue_screenings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residue_measurements" ADD CONSTRAINT "residue_measurements_medicineMrlId_fkey" FOREIGN KEY ("medicineMrlId") REFERENCES "medicine_mrls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
