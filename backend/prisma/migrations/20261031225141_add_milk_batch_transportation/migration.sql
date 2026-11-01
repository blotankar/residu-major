-- CreateTable
CREATE TABLE "milk_batch_transportations" (
    "id" TEXT NOT NULL,
    "milkBatchId" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3) NOT NULL,
    "arrivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milk_batch_transportations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "milk_batch_transportations_milkBatchId_key" ON "milk_batch_transportations"("milkBatchId");

-- CreateIndex
CREATE INDEX "milk_batch_transportations_factoryId_dispatchedAt_idx" ON "milk_batch_transportations"("factoryId", "dispatchedAt");

-- AddForeignKey
ALTER TABLE "milk_batch_transportations" ADD CONSTRAINT "milk_batch_transportations_milkBatchId_fkey" FOREIGN KEY ("milkBatchId") REFERENCES "milk_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milk_batch_transportations" ADD CONSTRAINT "milk_batch_transportations_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
