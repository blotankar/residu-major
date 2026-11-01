
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../lib/auth-middleware";
import { Prisma } from "../../generated/prisma/client";
import { submitFabricTransaction } from "../services/fabric";

const createSchema = z.object({
  cattleIds: z.array(z.string().trim().min(1)).min(1).max(500),
  volumeL: z.number().finite().positive(),
  date: z.string().datetime().optional(),
});

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

// Get the start and end of the selected date in Indian Standard Time.
function getIndiaDayRange(date: Date) {
  const indiaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  const startOfDay = new Date(`${indiaDate}T00:00:00+05:30`);
  const startOfTomorrow = new Date(
    startOfDay.getTime() + 24 * 60 * 60 * 1000,
  );

  return { startOfDay, startOfTomorrow };
}

export async function handleMilkBatchRequest(
  req: Request,
  user: AuthenticatedUser,
): Promise<Response> {
  try {
    const centre = await prisma.collectionCentre.findUnique({
      where: { userId: user.userId },
    });

    if (!centre) {
      return json(
        { error: "No collection-centre profile is linked to this account." },
        403,
      );
    }

    // GET: Fetch batches belonging to this collection centre.
    if (req.method === "GET") {
      const batches = await prisma.milkBatch.findMany({
        where: { collectionCentreId: centre.id },
        include: {
          collectionCentre: {
            select: { name: true, code: true },
          },
          contributingAnimals: {
            include: {
              cattle: {
                select: {
                  id: true,
                  cattleId: true,
                  name: true,
                  farmer: {
                    include: {
                      user: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
          processingBatches: {
            include: {
              processingBatch: {
                select: {
                  batchId: true,
                  factory: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { date: "desc" },
        take: 500,
      });

      return json(batches);
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    // Validate request body.
    const body = createSchema.safeParse(await req.json());

    if (!body.success) {
      return json(
        {
          error: "Request validation failed.",
          details: body.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        400,
      );
    }

    // Prevent duplicate cattle IDs in one request.
    if (
      new Set(body.data.cattleIds).size !== body.data.cattleIds.length
    ) {
      return json(
        { error: "Each animal can only be included once." },
        400,
      );
    }

    const batchDate = body.data.date
      ? new Date(body.data.date)
      : new Date();

    const { startOfDay, startOfTomorrow } =
      getIndiaDayRange(batchDate);

    // Fetch all requested cattle, latest treatments, and farmer profiles.
    const cattle = await prisma.cattle.findMany({
      where: {
        id: {
          in: body.data.cattleIds,
        },
      },
      include: {
        treatments: {
          orderBy: {
            administeredAt: "desc",
          },
          take: 1,
        },
        farmer: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    // Check whether all requested cattle exist.
    if (cattle.length !== body.data.cattleIds.length) {
      return json(
        { error: "One or more selected animals were not found." },
        404,
      );
    }

    // Verify that every cattle belongs to this collection centre.
    const unauthorizedCattle = cattle.filter(
      (animal) => animal.collectionCentreId !== centre.id,
    );

    if (unauthorizedCattle.length > 0) {
      return json(
        {
          error:
            "You cannot create a milk batch using cattle assigned to another collection centre or not assigned to your centre.",
        },
        403,
      );
    }

    // Check the latest treatment withdrawal status.
    const heldAnimal = cattle.find((animal) => {
      const latest = animal.treatments[0];

      return (
        latest &&
        (!latest.withdrawalEnds ||
          latest.withdrawalEnds >= batchDate)
      );
    });

    if (heldAnimal) {
      return json(
        {
          error: `Milk from ${heldAnimal.cattleId} cannot be pooled while its latest treatment withdrawal status is active or unconfirmed.`,
        },
        409,
      );
    }

    // Every contributing farmer must have registered farm details.
    const farmerWithoutFarmDetails = cattle.find(
      (animal) =>
        !animal.farmer.farmName?.trim() ||
        !animal.farmer.farmLocation?.trim(),
    );

    if (farmerWithoutFarmDetails) {
      return json(
        {
          error:
            "A contributing farmer has not completed their farm profile. Please ask the farmer to update their farm name and farm location before creating this milk batch.",
          cattleId: farmerWithoutFarmDetails.cattleId,
        },
        409,
      );
    }

    // Group cattle by farmer so each farm is recorded once on Fabric.
    const farmGroups = new Map<
      string,
      {
        farmId: string;
        farmName: string;
        location: string;
        cattleIds: string[];
      }
    >();

    for (const animal of cattle) {
      const farmer = animal.farmer;

      const existingFarm = farmGroups.get(farmer.id);

      if (existingFarm) {
        existingFarm.cattleIds.push(animal.cattleId);
      } else {
        farmGroups.set(farmer.id, {
          farmId: farmer.id,
          farmName: farmer.farmName!,
          location: farmer.farmLocation!,
          cattleIds: [animal.cattleId],
        });
      }
    }

    // Generate a unique batch ID.
    const batchId = `MB-${batchDate
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${crypto
      .randomUUID()
      .slice(0, 8)
      .toUpperCase()}`;

    // Create the batch only if none of the selected cattle
    // have already contributed to a batch on this Indian calendar day.
    const result = await prisma.$transaction(
      async (tx) => {
        const existingIntakes =
          await tx.milkBatchAnimal.findMany({
            where: {
              cattleId: {
                in: body.data.cattleIds,
              },
              milkBatch: {
                collectionCentreId: centre.id,
                date: {
                  gte: startOfDay,
                  lt: startOfTomorrow,
                },
              },
            },
            select: {
              cattleId: true,
            },
          });

        if (existingIntakes.length > 0) {
          return {
            conflict: existingIntakes.map((item) => item.cattleId),
          };
        }

        const created = await tx.milkBatch.create({
          data: {
            batchId,
            collectionCentreId: centre.id,
            date: batchDate,
            volumeL: body.data.volumeL,
            status: "SAFE",
            contributingAnimals: {
              create: cattle.map((animal) => ({
                cattleId: animal.id,
              })),
            },
          },
          include: {
            contributingAnimals: {
              include: {
                cattle: {
                  select: {
                    cattleId: true,
                  },
                },
              },
            },
          },
        });

        const traceabilityEvent =
          await tx.traceabilityEvent.create({
            data: {
              eventType: "MILK_BATCH_CREATED",
              entityType: "milk_batch",
              entityId: created.id,
              payload: {
                batchId,
                collectionCentreId: centre.id,
                volumeL: body.data.volumeL,
                contributingCattleIds: cattle.map(
                  (animal) => animal.cattleId,
                ),
              },
              blockchainStatus: "PENDING",
            },
          });

        return {
          batch: created,
          traceabilityEventId: traceabilityEvent.id,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    // Return a conflict if any cattle were already used today.
    if ("conflict" in result) {
      return json(
        {
          error:
            "Some selected cattle have already contributed to a milk batch today.",
          cattleIds: result.conflict,
        },
        409,
      );
    }

    // Submit the batch and its farm origins to Hyperledger Fabric.
    let blockchainStatus = "PENDING";
    let blockchainError: string | null = null;

    try {
      // Step 1: Create the milk batch on the blockchain.
      await submitFabricTransaction(
        "CreateMilkBatch",
        batchId,
        centre.id,
        centre.name,
        batchDate.toISOString(),
        String(body.data.volumeL),
      );

      // Step 2: Record every contributing farm.
      for (const farm of farmGroups.values()) {
        await submitFabricTransaction(
          "AddFarmOrigin",
          batchId,
          farm.farmId,
          farm.farmName,
          farm.location,
          JSON.stringify(farm.cattleIds),
        );
      }

      blockchainStatus = "CONFIRMED";
    } catch (fabricError) {
      blockchainStatus = "FAILED";

      blockchainError =
        fabricError instanceof Error
          ? fabricError.message
          : "Unknown blockchain submission error.";

      console.error(
        `Fabric submission failed for batch ${batchId}:`,
        fabricError,
      );
    }

    // Record the blockchain submission outcome in PostgreSQL.
    await prisma.traceabilityEvent.update({
      where: {
        id: result.traceabilityEventId,
      },
      data: {
        blockchainStatus,
        payload: {
          batchId,
          collectionCentreId: centre.id,
          volumeL: body.data.volumeL,
          contributingCattleIds: cattle.map(
            (animal) => animal.cattleId,
          ),
          blockchainError,
        },
      },
    });

    return json(
      {
        milkBatch: result.batch,
        blockchainStatus,
        blockchainMessage:
          blockchainStatus === "CONFIRMED"
            ? "Milk batch and farm origins successfully recorded on Hyperledger Fabric."
            : "Milk batch was saved in PostgreSQL, but blockchain submission needs attention. Do not assume it is available on the consumer traceability page yet.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json(
        { error: "Request body must be valid JSON." },
        400,
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return json(
        {
          error:
            "Could not create a unique milk batch ID. Please retry.",
        },
        409,
      );
    }

    // Serializable transaction conflict.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2034"
    ) {
      return json(
        {
          error:
            "Another intake operation occurred simultaneously. Please refresh and try again.",
        },
        409,
      );
    }

    console.error("Milk batch request failed:", error);

    return json(
      { error: "Milk batch request failed." },
      500,
    );
  }
}
