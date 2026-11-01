import { prisma } from "../lib/prisma";
import {
  evaluateFabricTransaction,
  submitFabricTransaction,
} from "./fabric";

export async function ensureBatchOnFabric(batchId: string) {
  const batch = await prisma.milkBatch.findUnique({
    where: { batchId },
    include: {
      collectionCentre: {
        select: {
          id: true,
          name: true,
        },
      },
      contributingAnimals: {
        include: {
          cattle: {
            select: {
              cattleId: true,
              farmer: {
                select: {
                  id: true,
                  farmName: true,
                  farmLocation: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!batch) {
    throw new Error(`Milk batch ${batchId} not found in PostgreSQL.`);
  }

  let ledgerBatch: any = null;
  let created = false;

  // Check whether the batch already exists on Fabric
  try {
    const response = await evaluateFabricTransaction(
      "GetMilkBatch",
      batchId,
    );

    ledgerBatch = JSON.parse(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    if (!message.includes("does not exist")) {
      throw error;
    }

    // Create the missing parent batch
    await submitFabricTransaction(
      "CreateMilkBatch",
      batch.batchId,
      batch.collectionCentre.id,
      batch.collectionCentre.name,
      batch.date.toISOString(),
      String(batch.volumeL),
    );

    created = true;

    const response = await evaluateFabricTransaction(
      "GetMilkBatch",
      batchId,
    );

    ledgerBatch = JSON.parse(response);
  }

  // Group cattle by their contributing farms
  const farmGroups = new Map<
    string,
    {
      farmId: string;
      farmName: string;
      location: string;
      cattleIds: string[];
    }
  >();

  for (const item of batch.contributingAnimals) {
    const farmer = item.cattle.farmer;

    if (!farmer.farmName || !farmer.farmLocation) {
      throw new Error(
        `Farm details missing for farmer ${farmer.id}.`,
      );
    }

    const existingFarm = farmGroups.get(farmer.id);

    if (existingFarm) {
      existingFarm.cattleIds.push(item.cattle.cattleId);
    } else {
      farmGroups.set(farmer.id, {
        farmId: farmer.id,
        farmName: farmer.farmName,
        location: farmer.farmLocation,
        cattleIds: [item.cattle.cattleId],
      });
    }
  }

  // Add only farm origins missing from the ledger
  const existingFarmIds = new Set(
    (ledgerBatch.farmOrigins || []).map(
      (farm: { farmId: string }) => farm.farmId,
    ),
  );

  let originsAdded = 0;

  for (const farm of farmGroups.values()) {
    if (existingFarmIds.has(farm.farmId)) {
      continue;
    }

    await submitFabricTransaction(
      "AddFarmOrigin",
      batch.batchId,
      farm.farmId,
      farm.farmName,
      farm.location,
      JSON.stringify(farm.cattleIds),
    );

    originsAdded++;
    existingFarmIds.add(farm.farmId);
  }

  // Verify the final ledger state
  const finalResponse = await evaluateFabricTransaction(
    "GetMilkBatch",
    batchId,
  );

  const finalBatch = JSON.parse(finalResponse);

  if ((finalBatch.farmOrigins || []).length < farmGroups.size) {
    throw new Error(
      "Farm origin synchronization could not be verified.",
    );
  }

  return {
    status: "CONFIRMED",
    created,
    originsAdded,
    message: "Milk batch and farm origins synchronized with Fabric.",
  };
}