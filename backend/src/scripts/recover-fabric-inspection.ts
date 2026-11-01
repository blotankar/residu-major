import { prisma } from "../lib/prisma";
import {
  evaluateFabricTransaction,
  submitFabricTransaction,
  disconnectFabric,
} from "../services/fabric";
import { ensureBatchOnFabric } from "../services/fabric-batch-sync";

const BATCH_ID = "MB-20261030-487C5186";

const ACTIVITY_ID = "1b25f795-41e7-4f60-ad47-95e6bd56dbaa";

async function main() {
  console.log("Starting Fabric inspection recovery...");

  // 1. Find the existing PostgreSQL activity
  const activity = await prisma.traceabilityEvent.findUnique({
    where: { id: ACTIVITY_ID },
  });

  if (!activity) {
    throw new Error("Existing inspection activity was not found.");
  }

  const payload =
    activity.payload &&
    typeof activity.payload === "object" &&
    !Array.isArray(activity.payload)
      ? (activity.payload as Record<string, unknown>)
      : {};

  const inspectionId = payload.inspectionId;
  const eventId = payload.blockchainEventId;
  const factoryId = payload.factoryId;
  const qualityResult = payload.qualityResult;

  if (
    typeof inspectionId !== "string" ||
    typeof eventId !== "string" ||
    typeof factoryId !== "string" ||
    typeof qualityResult !== "string"
  ) {
    throw new Error("Required inspection recovery details are missing.");
  }



  // 2. Verify the original inspection still exists
  const inspection = await prisma.milkQualityInspection.findUnique({
    where: { id: inspectionId },
  });

  if (!inspection) {
    throw new Error("The original PostgreSQL inspection was not found.");
  }

  if (inspection.milkBatchId !== activity.entityId) {
    throw new Error("Inspection and activity refer to different batches.");
  }

  // 3. Verify the parent milk batch
  const batch = await prisma.milkBatch.findUnique({
    where: { id: activity.entityId },
  });

  if (!batch || batch.batchId !== BATCH_ID) {
    throw new Error("The PostgreSQL milk batch does not match.");
  }

  // 4. Get the factory details
  const factory = await prisma.factory.findUnique({
    where: { id: factoryId },
    select: {
      name: true,
      address: true,
    },
  });

  if (!factory) {
    throw new Error("Factory profile was not found.");
  }

  console.log("Existing inspection verified:", inspectionId);
  console.log("Existing Fabric event ID:", eventId);

  // 5. Ensure the batch and farm origins exist on Fabric
  const syncResult = await ensureBatchOnFabric(BATCH_ID);

  console.log("Batch synchronization:", syncResult);

  // 6. Read the current Fabric ledger record
  const ledgerResponse = await evaluateFabricTransaction(
    "GetMilkBatch",
    BATCH_ID,
  );

  const ledgerBatch = JSON.parse(ledgerResponse);

  if (!Array.isArray(ledgerBatch.events)) {
    throw new Error("Fabric returned an invalid batch event history.");
  }

  // 7. Check whether this exact inspection event already exists
  const existingEvent = ledgerBatch.events.find(
    (event: { eventId?: string }) => event.eventId === eventId,
  );

  if (existingEvent) {
    console.log(
      "The original inspection event already exists on Fabric. Skipping submission.",
    );
  } else {
    console.log("Submitting the existing inspection event to Fabric...");

    await submitFabricTransaction(
      "RecordSupplyChainEvent",
      BATCH_ID,
      eventId,
      "QUALITY_CHECK_RECORDED",
      factory.name,
      factory.address || factory.name,
      "",
      "",
      qualityResult,
      "",
    );

    console.log("Inspection event successfully submitted.");
  }

  // 8. Verify the event on Fabric before updating PostgreSQL
  const verificationResponse = await evaluateFabricTransaction(
    "GetMilkBatch",
    BATCH_ID,
  );

  const verifiedBatch = JSON.parse(verificationResponse);

  const verifiedEvent = verifiedBatch.events.find(
    (event: { eventId?: string }) => event.eventId === eventId,
  );

  if (!verifiedEvent) {
    throw new Error(
      "The inspection event could not be verified on Fabric.",
    );
  }

  // 9. Update the existing PostgreSQL activity
  await prisma.traceabilityEvent.update({
    where: { id: ACTIVITY_ID },
    data: {
      blockchainStatus: "CONFIRMED",
      payload: {
        ...payload,
        blockchainStatus: "CONFIRMED",
        blockchainMessage:
          "Existing quality inspection successfully recovered and verified on Hyperledger Fabric.",
      },
    },
  });

  console.log("-----------------------------------");
  console.log("RECOVERY SUCCESSFUL");
  console.log("Batch:", BATCH_ID);
  console.log("Inspection:", inspectionId);
  console.log("Fabric event:", eventId);
  console.log("Blockchain status: CONFIRMED");
  console.log("-----------------------------------");
}

try {
  await main();
} catch (error) {
  console.error("Recovery failed:", error);
  process.exitCode = 1;
} finally {
  await disconnectFabric();
  await prisma.$disconnect();
}