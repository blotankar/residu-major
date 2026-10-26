CREATE TYPE "QualityTestResult" AS ENUM ('PASS', 'FAIL', 'INCONCLUSIVE');
CREATE TYPE "QualityInspectionStatus" AS ENUM ('ACCEPTED', 'ON_HOLD', 'REJECTED');
CREATE TYPE "ProductLotStatus" AS ENUM ('AVAILABLE', 'HOLD', 'RECALLED', 'DEPLETED');
CREATE TYPE "InventoryMovementType" AS ENUM ('PRODUCTION_OUTPUT', 'DISPATCH');
CREATE TYPE "DispatchStatus" AS ENUM ('DISPATCHED', 'CANCELLED');

CREATE TABLE "factory_milk_batch_receipts" (
    "id" TEXT NOT NULL,
    "milkBatchId" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "receivedQuantityL" DECIMAL(12,3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "discrepancyNote" TEXT,
    "receivedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "factory_milk_batch_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "milk_quality_inspections" (
    "id" TEXT NOT NULL,
    "milkBatchId" TEXT NOT NULL,
    "inspectorUserId" TEXT NOT NULL,
    "temperatureC" DECIMAL(7,3) NOT NULL,
    "fatPercent" DECIMAL(7,3) NOT NULL,
    "snfPercent" DECIMAL(7,3) NOT NULL,
    "acidityPercent" DECIMAL(7,3) NOT NULL,
    "adulterationResult" "QualityTestResult" NOT NULL,
    "status" "QualityInspectionStatus" NOT NULL,
    "remarks" TEXT,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "milk_quality_inspections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_lots" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "processingBatchId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "producedQuantityL" DECIMAL(12,3) NOT NULL,
    "currentQuantityL" DECIMAL(12,3) NOT NULL,
    "status" "ProductLotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_lots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "factory_dispatches" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3) NOT NULL,
    "transportDetails" TEXT,
    "status" "DispatchStatus" NOT NULL DEFAULT 'DISPATCHED',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "factory_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "factory_dispatch_items" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "productLotId" TEXT NOT NULL,
    "quantityL" DECIMAL(12,3) NOT NULL,
    CONSTRAINT "factory_dispatch_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "productLotId" TEXT NOT NULL,
    "dispatchId" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "quantityL" DECIMAL(12,3) NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "processing_batches"
    ADD COLUMN "operatorUserId" TEXT,
    ADD COLUMN "inputVolumeL" DECIMAL(12,3),
    ADD COLUMN "outputVolumeL" DECIMAL(12,3),
    ADD COLUMN "wastageL" DECIMAL(12,3),
    ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "factory_milk_batch_receipts_milkBatchId_key"
    ON "factory_milk_batch_receipts"("milkBatchId");
CREATE INDEX "factory_milk_batch_receipts_factoryId_receivedAt_idx"
    ON "factory_milk_batch_receipts"("factoryId", "receivedAt");
CREATE INDEX "milk_quality_inspections_milkBatchId_inspectedAt_idx"
    ON "milk_quality_inspections"("milkBatchId", "inspectedAt");
CREATE UNIQUE INDEX "product_lots_lotId_key" ON "product_lots"("lotId");
CREATE INDEX "product_lots_processingBatchId_idx" ON "product_lots"("processingBatchId");
CREATE INDEX "product_lots_status_createdAt_idx" ON "product_lots"("status", "createdAt");
CREATE UNIQUE INDEX "factory_dispatches_dispatchId_key" ON "factory_dispatches"("dispatchId");
CREATE INDEX "factory_dispatches_factoryId_dispatchedAt_idx"
    ON "factory_dispatches"("factoryId", "dispatchedAt");
CREATE UNIQUE INDEX "factory_dispatch_items_dispatchId_productLotId_key"
    ON "factory_dispatch_items"("dispatchId", "productLotId");
CREATE INDEX "factory_dispatch_items_productLotId_idx"
    ON "factory_dispatch_items"("productLotId");
CREATE INDEX "inventory_movements_productLotId_createdAt_idx"
    ON "inventory_movements"("productLotId", "createdAt");
CREATE INDEX "inventory_movements_dispatchId_idx"
    ON "inventory_movements"("dispatchId");

ALTER TABLE "factory_milk_batch_receipts"
    ADD CONSTRAINT "factory_milk_batch_receipts_milkBatchId_fkey"
    FOREIGN KEY ("milkBatchId") REFERENCES "milk_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_milk_batch_receipts"
    ADD CONSTRAINT "factory_milk_batch_receipts_factoryId_fkey"
    FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_milk_batch_receipts"
    ADD CONSTRAINT "factory_milk_batch_receipts_receivedByUserId_fkey"
    FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "milk_quality_inspections"
    ADD CONSTRAINT "milk_quality_inspections_milkBatchId_fkey"
    FOREIGN KEY ("milkBatchId") REFERENCES "milk_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "milk_quality_inspections"
    ADD CONSTRAINT "milk_quality_inspections_inspectorUserId_fkey"
    FOREIGN KEY ("inspectorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_lots"
    ADD CONSTRAINT "product_lots_processingBatchId_fkey"
    FOREIGN KEY ("processingBatchId") REFERENCES "processing_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_dispatches"
    ADD CONSTRAINT "factory_dispatches_factoryId_fkey"
    FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_dispatches"
    ADD CONSTRAINT "factory_dispatches_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_dispatch_items"
    ADD CONSTRAINT "factory_dispatch_items_dispatchId_fkey"
    FOREIGN KEY ("dispatchId") REFERENCES "factory_dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_dispatch_items"
    ADD CONSTRAINT "factory_dispatch_items_productLotId_fkey"
    FOREIGN KEY ("productLotId") REFERENCES "product_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements"
    ADD CONSTRAINT "inventory_movements_productLotId_fkey"
    FOREIGN KEY ("productLotId") REFERENCES "product_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements"
    ADD CONSTRAINT "inventory_movements_dispatchId_fkey"
    FOREIGN KEY ("dispatchId") REFERENCES "factory_dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements"
    ADD CONSTRAINT "inventory_movements_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_batches"
    ADD CONSTRAINT "processing_batches_operatorUserId_fkey"
    FOREIGN KEY ("operatorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
