-- CreateTable
CREATE TABLE "factory_milk_batch_intakes" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "milkBatchId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedByUserId" TEXT NOT NULL,

    CONSTRAINT "factory_milk_batch_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "factory_milk_batch_intakes_milkBatchId_key" ON "factory_milk_batch_intakes"("milkBatchId");

-- CreateIndex
CREATE INDEX "factory_milk_batch_intakes_factoryId_addedAt_idx" ON "factory_milk_batch_intakes"("factoryId", "addedAt");

-- AddForeignKey
ALTER TABLE "factory_milk_batch_intakes" ADD CONSTRAINT "factory_milk_batch_intakes_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory_milk_batch_intakes" ADD CONSTRAINT "factory_milk_batch_intakes_milkBatchId_fkey" FOREIGN KEY ("milkBatchId") REFERENCES "milk_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory_milk_batch_intakes" ADD CONSTRAINT "factory_milk_batch_intakes_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
