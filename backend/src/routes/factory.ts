import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../lib/auth-middleware";
import type { Prisma } from "../../generated/prisma/client";
import {
  evaluateFabricTransaction,
  submitFabricTransaction,
} from "../services/fabric";
import { ensureBatchOnFabric } from "../services/fabric-batch-sync";

const json = (data: unknown, status = 200) =>
  Response.json(data, { status });

const nonEmptyString = z.string().trim().min(1);
const toMilliLitres = (value: number) => Math.round(value * 1000);
const hasAtMostThreeDecimalPlaces = (value: number) => {
  const [coefficient = "", exponent = "0"] = value
    .toString()
    .toLowerCase()
    .split("e");
  const decimalPlaces = coefficient.split(".")[1]?.length ?? 0;
  return decimalPlaces - Number(exponent) <= 3;
};
const quantity = z
  .number()
  .finite()
  .max(999_999_999.999)
  .refine(
    hasAtMostThreeDecimalPlaces,
    "Use no more than three decimal places.",
  );
const positiveNumber = quantity.positive();
const nonNegativeNumber = quantity.nonnegative();
const qualityMeasurement = z
  .number()
  .finite()
  .min(-9999.999)
  .max(9999.999)
  .refine(
    hasAtMostThreeDecimalPlaces,
    "Use no more than three decimal places.",
  );

const receiptSchema = z.object({
  receivedQuantityL: positiveNumber,
  receivedAt: z.string().datetime().optional(),
  discrepancyNote: z.string().trim().max(1000).optional(),
});

const inspectionSchema = z.object({
  temperatureC: qualityMeasurement,
  fatPercent: qualityMeasurement.nonnegative(),
  snfPercent: qualityMeasurement.nonnegative(),
  acidityPercent: qualityMeasurement.nonnegative(),
  remarks: z.string().trim().max(2000).optional(),
  inspectedAt: z.string().datetime().optional(),
});

type QualityDecision = {
  qualityResult: "PASS" | "FAIL" | "INCONCLUSIVE";
  status: "ACCEPTED" | "ON_HOLD" | "REJECTED";
  reasons: string[];
};

function calculateMilkQuality(data: {
  fatPercent: number;
  snfPercent: number;
  temperatureC: number;
  acidityPercent: number;
}): QualityDecision {
  const rejected: string[] = [];
  const onHold: string[] = [];

  // FAT: Acceptable range 3.5% – 5.0%
  if (data.fatPercent < 3.5) {
    rejected.push("Fat is below the minimum of 3.5%.");
  } else if (data.fatPercent > 5.0) {
    rejected.push("Fat exceeds the maximum of 5.0%.");
  }

  // SNF: Acceptable range 8.0% – 9.0%
  if (data.snfPercent < 8.0) {
    rejected.push("SNF is below the minimum of 8.0%.");
  } else if (data.snfPercent > 9.0) {
    rejected.push("SNF exceeds the maximum of 9.0%.");
  }

  // TEMPERATURE: Maximum 7°C
  if (data.temperatureC > 7) {
    rejected.push("Temperature exceeds the acceptable limit of 7°C.");
  }

  // ACIDITY: Maximum 0.14%
  if (data.acidityPercent > 0.14) {
    rejected.push("Acidity exceeds the acceptable limit of 0.14%.");
  }

  if (rejected.length > 0) {
    return {
      qualityResult: "FAIL",
      status: "REJECTED",
      reasons: rejected,
    };
  }

  

  return {
    qualityResult: "PASS",
    status: "ACCEPTED",
    reasons: [
      "All four milk quality parameters meet the configured criteria.",
    ],
  };
}

const productionSchema = z.object({
  product: nonEmptyString.max(200),
  date: z.string().datetime(),
  milkBatchIds: z.array(nonEmptyString).min(1).max(100),
});

const completionSchema = z.object({
  outputVolumeL: positiveNumber,
  wastageL: nonNegativeNumber,
});

const dispatchSchema = z.object({
  destination: nonEmptyString.max(500),
  vehicleId: nonEmptyString.max(100),
  dispatchedAt: z.string().datetime().optional(),
  transportDetails: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        lotId: nonEmptyString,
        quantityL: positiveNumber,
      }),
    )
    .min(1)
    .max(100),
});

class FactoryConflictError extends Error {}

type FactoryProfile = NonNullable<
  Awaited<ReturnType<typeof getFactoryProfile>>
>;

async function getFactoryProfile(userId: string) {
  return prisma.factory.findUnique({ where: { userId } });
}

async function getOrCreateFactoryProfile(userId: string) {
  const factory = await getFactoryProfile(userId);
  if (!factory) {
    return json({ error: "No factory profile is linked to this account." }, 403);
  }
  return factory;
}

async function recordActivity(
  tx: Prisma.TransactionClient,
  factory: FactoryProfile,
  eventType: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
) {
  await tx.traceabilityEvent.create({
    data: {
      eventType,
      entityType,
      entityId,
      payload: { ...payload, factoryId: factory.id },
    },
  });
}

function parseJson(req: Request) {
  return req.json().catch(() => {
    throw new Error("Request body must be valid JSON.");
  });
}

function validationError(error: z.ZodError) {
  return json(
    {
      error: "Request validation failed.",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    400,
  );
}

function dateFilter(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const date: { gte?: Date; lte?: Date } = {};

  if (from) {
    const parsed = new Date(from);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid from date.");
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) parsed.setUTCHours(0, 0, 0, 0);
    date.gte = parsed;
  }
  if (to) {
    const parsed = new Date(to);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid to date.");
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) parsed.setUTCHours(23, 59, 59, 999);
    date.lte = parsed;
  }
  return Object.keys(date).length ? date : undefined;
}

const addIntakeSchema = z.object({
  milkBatchIds: z.array(nonEmptyString).min(1).max(100),
});

// Search collection centres by name or code
async function searchCollectionCentres(url: URL) {
  const search = url.searchParams.get("search")?.trim();

  if (!search) {
    return json([]);
  }

  const centres = await prisma.collectionCentre.findMany({
    where: {
      OR: [
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          code: {
            contains: search,
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      code: true,
      village: true,
      address: true,
    },
    orderBy: {
      name: "asc",
    },
    take: 20,
  });

  return json(centres);
}

// Fetch available milk batches from the selected centre
async function fetchCentreBatches(centreId: string) {
  const centre = await prisma.collectionCentre.findUnique({
    where: { id: centreId },
  });

  if (!centre) {
    return json({ error: "Collection centre not found." }, 404);
  }

  const batches = await prisma.milkBatch.findMany({
    where: {
      collectionCentreId: centreId,
      status: "SAFE",
      factoryIntake: null,
      factoryReceipt: null,
      processingBatches: {
        none: {},
      },
    },
    include: {
      collectionCentre: {
        select: {
          id: true,
          name: true,
          code: true,
          village: true,
        },
      },
    },
    orderBy: {
      date: "desc",
    },
  });

  return json(batches);
}

// Add selected batches to this factory's intake
async function addBatchesToIntake(
  req: Request,
  user: AuthenticatedUser,
  factory: FactoryProfile,
) {
  const body = addIntakeSchema.safeParse(await parseJson(req));

  if (!body.success) {
    return validationError(body.error);
  }

  const milkBatchIds = body.data.milkBatchIds;

  if (new Set(milkBatchIds).size !== milkBatchIds.length) {
    return json(
      { error: "Duplicate milk batch IDs are not allowed." },
      400,
    );
  }

  const batches = await prisma.milkBatch.findMany({
    where: {
      id: {
        in: milkBatchIds,
      },
    },
    include: {
      factoryIntake: true,
      factoryReceipt: true,
      processingBatches: true,
    },
  });

  if (batches.length !== milkBatchIds.length) {
    return json(
      { error: "One or more selected batches were not found." },
      404,
    );
  }

  const unavailable = batches.find(
    (batch) =>
      batch.status !== "SAFE" ||
      batch.factoryIntake !== null ||
      batch.factoryReceipt !== null ||
      batch.processingBatches.length > 0,
  );

  if (unavailable) {
    return json(
      {
        error: `Batch ${unavailable.batchId} is no longer available. Refresh and try again.`,
      },
      409,
    );
  }

  try {
    const intakeRecords = await prisma.$transaction(
      async (tx) => {
        const currentBatches = await tx.milkBatch.findMany({
          where: {
            id: {
              in: milkBatchIds,
            },
            status: "SAFE",
            factoryIntake: null,
            factoryReceipt: null,
            processingBatches: {
              none: {},
            },
          },
          select: {
            id: true,
            batchId: true,
          },
        });

        if (currentBatches.length !== milkBatchIds.length) {
          throw new FactoryConflictError(
            "One or more batches are no longer available.",
          );
        }

        const created = await Promise.all(
          currentBatches.map((batch) =>
            tx.factoryMilkBatchIntake.create({
              data: {
                factoryId: factory.id,
                milkBatchId: batch.id,
                addedByUserId: user.userId,
              },
            }),
          ),
        );

        await recordActivity(
          tx,
          factory,
          "MILK_BATCHES_ADDED_TO_INTAKE",
          "factory_operation",
          factory.id,
          {
            milkBatchIds: currentBatches.map((batch) => batch.id),
            batchIds: currentBatches.map((batch) => batch.batchId),
            count: created.length,
          },
        );

        return created;
      },
      {
        isolationLevel: "Serializable",
      },
    );

    return json(
      {
        message: "Batches added to factory intake successfully.",
        count: intakeRecords.length,
        intakeRecords,
      },
      201,
    );
  } catch (error) {
    if (
      error instanceof FactoryConflictError ||
      isUniqueViolation(error) ||
      isSerializationConflict(error)
    ) {
      return json(
        {
          error:
            "Some batches are no longer available. Refresh and try again.",
        },
        409,
      );
    }

    throw error;
  }
}

async function dashboard(factory: FactoryProfile) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const [receipts, inspections, processing, lots, dispatches, activity] =
    await Promise.all([
      prisma.factoryMilkBatchReceipt.findMany({
        where: { factoryId: factory.id },
        include: {
          milkBatch: {
            include: { qualityInspections: { orderBy: { inspectedAt: "desc" }, take: 1 } },
          },
        },
        orderBy: { receivedAt: "desc" },
        take: 500,
      }),
      prisma.milkQualityInspection.findMany({
        where: { milkBatch: { factoryReceipt: { factoryId: factory.id } } },
        orderBy: { inspectedAt: "desc" },
        take: 500,
      }),
      prisma.processingBatch.findMany({
        where: { factoryId: factory.id },
        select: { id: true, status: true },
      }),
      prisma.productLot.aggregate({
        where: { processingBatch: { factoryId: factory.id }, status: "AVAILABLE" },
        _sum: { currentQuantityL: true },
      }),
      prisma.dispatch.count({
        where: { factoryId: factory.id, status: "DISPATCHED", dispatchedAt: { gte: startOfToday, lt: startOfTomorrow } },
      }),
      prisma.traceabilityEvent.findMany({
        where: { entityType: "factory_operation", entityId: factory.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  const receivedToday = receipts.filter(
    (receipt) => receipt.receivedAt >= startOfToday && receipt.receivedAt < startOfTomorrow,
  );
  const latestByBatch = new Map<string, (typeof inspections)[number]>();
  for (const inspection of inspections) {
    if (!latestByBatch.has(inspection.milkBatchId)) {
      latestByBatch.set(inspection.milkBatchId, inspection);
    }
  }

  const inspectionStatuses = [...latestByBatch.values()].reduce(
    (result, inspection) => {
      result[inspection.status] += 1;
      return result;
    },
    { ACCEPTED: 0, ON_HOLD: 0, REJECTED: 0 },
  );

  return {
    metrics: {
      batchesReceivedToday: receivedToday.length,
      pendingInspections: receipts.filter((receipt) => {
        const latest = latestByBatch.get(receipt.milkBatchId);
        return !latest || latest.status === "ON_HOLD";
      }).length,
      acceptedBatches: inspectionStatuses.ACCEPTED,
      heldBatches: inspectionStatuses.ON_HOLD,
      rejectedBatches: inspectionStatuses.REJECTED,
      receivedQuantityL: receivedToday.reduce(
        (sum, receipt) => sum + Number(receipt.receivedQuantityL),
        0,
      ),
      acceptedQuantityL: receipts.reduce((sum, receipt) => {
        const latest = latestByBatch.get(receipt.milkBatchId);
        return latest?.status === "ACCEPTED"
          ? sum + Number(receipt.receivedQuantityL)
          : sum;
      }, 0),
      activeProductionRuns: processing.filter((run) => run.status === "PROCESSING").length,
      finishedInventoryL: Number(lots._sum.currentQuantityL ?? 0),
      dispatchesToday: dispatches,
    },
    alerts: receipts
      .flatMap((receipt) => {
        const latest = latestByBatch.get(receipt.milkBatchId);
        if (!latest || latest.status === "ACCEPTED") return [];
        return [
          {
            batchId: receipt.milkBatch.batchId,
            status: latest.status,
            message:
              latest.status === "REJECTED"
                ? "Rejected milk batch must not enter production."
                : "Milk batch is on hold pending further review.",
          },
        ];
      })
      .slice(0, 10),
    recentActivity: activity,
  };
}

async function listIntake(factory: FactoryProfile, url: URL) {
  const search = url.searchParams.get("search")?.trim();
  const status = url.searchParams.get("status");

  const batches = await prisma.milkBatch.findMany({
    where: {
      factoryIntake: {
        is: {
          factoryId: factory.id,
        },
      },

      ...(search
        ? {
            OR: [
              {
                batchId: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                collectionCentre: {
                  OR: [
                    {
                      name: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      code: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {}),
    },

    include: {
      collectionCentre: {
        select: {
          id: true,
          name: true,
          code: true,
          village: true,
        },
      },

      factoryIntake: true,
      factoryReceipt: true,

      qualityInspections: {
        orderBy: {
          inspectedAt: "desc",
        },
        take: 1,
        include: {
          inspector: {
            select: {
              name: true,
            },
          },
        },
      },

      processingBatches: {
        select: {
          id: true,
        },
      },
    },

    orderBy: {
      date: "desc",
    },

    take: 500,
  });

  return batches.filter((batch) => {
    if (status === "PENDING_RECEIPT") {
      return !batch.factoryReceipt;
    }

    if (status === "RECEIVED") {
      return Boolean(batch.factoryReceipt);
    }

    if (status === "PENDING_INSPECTION") {
      return (
        Boolean(batch.factoryReceipt) &&
        batch.qualityInspections.length === 0
      );
    }

    if (["ACCEPTED", "ON_HOLD", "REJECTED"].includes(status ?? "")) {
      return batch.qualityInspections[0]?.status === status;
    }

    return true;
  });
}


async function receiveBatch(
  req: Request,
  user: AuthenticatedUser,
  factory: FactoryProfile,
  batchId: string,
) {
  const body = receiptSchema.safeParse(await parseJson(req));

  if (!body.success) {
    return validationError(body.error);
  }

  const batch = await prisma.milkBatch.findUnique({
    where: { id: batchId },
    include: {
      factoryIntake: true,
      factoryReceipt: true,
      processingBatches: true,
    },
  });

  if (!batch) {
    return json({ error: "Milk batch not found." }, 404);
  }

  if (
    !batch.factoryIntake ||
    batch.factoryIntake.factoryId !== factory.id
  ) {
    return json(
      { error: "This batch has not been added to your factory intake." },
      403,
    );
  }

  if (batch.factoryReceipt) {
    return json(
      { error: "This milk batch has already been received." },
      409,
    );
  }

  if (batch.status !== "SAFE" || batch.processingBatches.length > 0) {
    return json(
      { error: "This milk batch is not available for factory receipt." },
      409,
    );
  }

  const receivedAt = body.data.receivedAt
    ? new Date(body.data.receivedAt)
    : new Date();

  const discrepancy = Math.abs(
    Number(batch.volumeL) - body.data.receivedQuantityL,
  );

  const discrepancyNote =
    discrepancy > 0
      ? body.data.discrepancyNote?.trim() ||
        `Received quantity differs from collection quantity by ${discrepancy.toFixed(3)} L.`
      : body.data.discrepancyNote?.trim() || null;

  // Generate the event ID before the PostgreSQL transaction.
  // This same ID will be reused if Fabric submission needs recovery.
  const eventId = crypto.randomUUID();

  let saved: {
    receipt: Awaited<
      ReturnType<typeof prisma.factoryMilkBatchReceipt.create>
    >;
    activityId: string;
  };

  try {
    saved = await prisma.$transaction(async (tx) => {
      const receipt = await tx.factoryMilkBatchReceipt.create({
        data: {
          milkBatchId: batch.id,
          factoryId: factory.id,
          receivedQuantityL: body.data.receivedQuantityL,
          receivedAt,
          discrepancyNote,
          receivedByUserId: user.userId,
        },
      });

      // Save the event ID and pending status in the same transaction.
      const activity = await tx.traceabilityEvent.create({
        data: {
          eventType: "MILK_BATCH_RECEIVED",
          entityType: "milk_batch",
          entityId: batch.id,
          payload: {
            batchId: batch.batchId,
            factoryId: factory.id,
            receivedQuantityL: body.data.receivedQuantityL,
            collectionQuantityL: Number(batch.volumeL),
            discrepancyNote,
            receivedAt: receivedAt.toISOString(),
            blockchainEventId: eventId,
            blockchainStatus: "PENDING",
          },
        },
      });

      return {
        receipt,
        activityId: activity.id,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return json(
        { error: "This milk batch has already been received." },
        409,
      );
    }

    throw error;
  }

  // Submit the factory receipt event to Hyperledger Fabric.
  let blockchainStatus: "CONFIRMED" | "FAILED" = "FAILED";
  let blockchainMessage = "";

  try {
    // Ensure the parent batch and its farm origins exist on Fabric.
    await ensureBatchOnFabric(batch.batchId);

    // Check whether this exact event has already been committed.
    // This protects against duplicate submissions after a timeout.
    const ledgerResponse = await evaluateFabricTransaction(
      "GetMilkBatch",
      batch.batchId,
    );

    const ledgerBatch = JSON.parse(ledgerResponse);

    if (!Array.isArray(ledgerBatch.events)) {
      throw new Error("Invalid Fabric batch event history.");
    }

    const existingEvent = ledgerBatch.events.find(
      (event: { eventId?: string }) => event.eventId === eventId,
    );

    if (!existingEvent) {
      await submitFabricTransaction(
        "RecordSupplyChainEvent",
        batch.batchId,
        eventId,
        "FACTORY_RECEIVED",
        factory.name,
        factory.address || factory.name,
        "",
        String(body.data.receivedQuantityL),
        "",
        "",
      );
    }

    // Verify the event exists on Fabric before confirming PostgreSQL.
    const verificationResponse = await evaluateFabricTransaction(
      "GetMilkBatch",
      batch.batchId,
    );

    const verifiedBatch = JSON.parse(verificationResponse);

    const verifiedEvent = verifiedBatch.events?.find(
      (event: { eventId?: string }) => event.eventId === eventId,
    );

    if (!verifiedEvent) {
      throw new Error(
        "Factory receipt event could not be verified on Fabric.",
      );
    }

    blockchainStatus = "CONFIRMED";
    blockchainMessage =
      "Factory receipt successfully recorded and verified on Hyperledger Fabric.";
  } catch (error) {
    console.error(
      "Fabric factory receipt submission failed:",
      error,
    );

    blockchainMessage =
      "Factory receipt was saved in PostgreSQL, but blockchain submission failed. The existing event ID is preserved for recovery.";
  }

  // Update the exact activity created for this receipt.
  try {
    const existingActivity = await prisma.traceabilityEvent.findUnique({
      where: { id: saved.activityId },
    });

    if (existingActivity) {
      const existingPayload =
        existingActivity.payload &&
        typeof existingActivity.payload === "object" &&
        !Array.isArray(existingActivity.payload)
          ? (existingActivity.payload as Record<string, unknown>)
          : {};

      await prisma.traceabilityEvent.update({
        where: { id: saved.activityId },
        data: {
          blockchainStatus,
          payload: {
            ...existingPayload,
            blockchainStatus,
            blockchainEventId: eventId,
            blockchainMessage,
          },
        },
      });
    }
  } catch (error) {
    console.error(
      "Failed to update factory receipt blockchain status:",
      error,
    );
  }

  return json(
    {
      message: "Milk batch received successfully.",
      receipt: saved.receipt,
      blockchainStatus,
      blockchainMessage,
    },
    201,
  );
}


async function retryFactoryReceiptBlockchain(
  factory: FactoryProfile,
  batchId: string,
) {
  // Find the milk batch and its existing factory receipt.
  const batch = await prisma.milkBatch.findFirst({
    where: {
      batchId,
      factoryReceipt: {
        factoryId: factory.id,
      },
    },
    include: {
      factoryReceipt: true,
    },
  });

  if (!batch || !batch.factoryReceipt) {
    return json(
      { error: "No factory receipt found for this batch." },
      404,
    );
  }

  // Find the original receipt activity.
  const activity = await prisma.traceabilityEvent.findFirst({
    where: {
      eventType: "MILK_BATCH_RECEIVED",
      entityType: "milk_batch",
      entityId: batch.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!activity) {
    return json(
      { error: "Factory receipt activity not found." },
      404,
    );
  }

  const payload =
    activity.payload &&
    typeof activity.payload === "object" &&
    !Array.isArray(activity.payload)
      ? (activity.payload as Record<string, unknown>)
      : {};

  const eventId = payload.blockchainEventId;

  if (typeof eventId !== "string" || !eventId.trim()) {
    return json(
      { error: "The original Fabric event ID is missing. Manual recovery is required." },
      409,
    );
  }

  try {
    // Ensure the parent batch and farm origins exist on Fabric.
    await ensureBatchOnFabric(batch.batchId);

    // Check whether the original event already exists.
    const ledgerResponse = await evaluateFabricTransaction(
      "GetMilkBatch",
      batch.batchId,
    );

    const ledgerBatch = JSON.parse(ledgerResponse);

    if (!Array.isArray(ledgerBatch.events)) {
      throw new Error("Invalid Fabric batch event history.");
    }

    const existingEvent = ledgerBatch.events.find(
      (event: { eventId?: string }) =>
        event.eventId === eventId,
    );

    // Submit only when the original event is not already committed.
    if (!existingEvent) {
      await submitFabricTransaction(
        "RecordSupplyChainEvent",
        batch.batchId,
        eventId,
        "FACTORY_RECEIVED",
        factory.name,
        factory.address || factory.name,
        "",
        String(batch.factoryReceipt.receivedQuantityL),
        "",
        "",
      );
    }

    // Verify the event on Fabric.
    const verificationResponse = await evaluateFabricTransaction(
      "GetMilkBatch",
      batch.batchId,
    );

    const verifiedBatch = JSON.parse(verificationResponse);

    const verifiedEvent = verifiedBatch.events?.find(
      (event: { eventId?: string }) =>
        event.eventId === eventId,
    );

    if (!verifiedEvent) {
      throw new Error(
        "Factory receipt event could not be verified on Fabric.",
      );
    }

    const blockchainMessage =
      "Factory receipt successfully recorded and verified on Hyperledger Fabric.";

    // Update the existing PostgreSQL activity.
    await prisma.traceabilityEvent.update({
      where: {
        id: activity.id,
      },
      data: {
        blockchainStatus: "CONFIRMED",
        payload: {
          ...payload,
          blockchainStatus: "CONFIRMED",
          blockchainEventId: eventId,
          blockchainMessage,
        },
      },
    });

    return json({
      message: "Factory receipt blockchain recovery successful.",
      batchId: batch.batchId,
      eventId,
      blockchainStatus: "CONFIRMED",
      blockchainMessage,
      alreadyExistedOnLedger: Boolean(existingEvent),
    });
  } catch (error) {
    console.error(
      "Factory receipt blockchain recovery failed:",
      error,
    );

    const blockchainMessage =
      error instanceof Error
        ? error.message
        : "Unknown Fabric recovery error.";

    // Preserve the original event ID and mark it failed for another retry.
    await prisma.traceabilityEvent.update({
      where: {
        id: activity.id,
      },
      data: {
        blockchainStatus: "FAILED",
        payload: {
          ...payload,
          blockchainStatus: "FAILED",
          blockchainEventId: eventId,
          blockchainMessage,
        },
      },
    });

    return json(
      {
        error: "Blockchain recovery failed.",
        batchId: batch.batchId,
        eventId,
        blockchainStatus: "FAILED",
        blockchainMessage,
      },
      502,
    );
  }
}


async function inspectBatch(
  req: Request,
  user: AuthenticatedUser,
  factory: FactoryProfile,
  batchId: string,
) {
  const body = inspectionSchema.safeParse(await parseJson(req));

  if (!body.success) {
    return validationError(body.error);
  }

  // Automatically calculate quality result and inspection status
  const qualityDecision = calculateMilkQuality(body.data);

  // Check whether the batch has been received by this factory
  const receipt = await prisma.factoryMilkBatchReceipt.findFirst({
    where: {
      milkBatchId: batchId,
      factoryId: factory.id,
    },
    include: {
      milkBatch: {
        include: {
          processingBatches: true,
        },
      },
    },
  });

  if (!receipt) {
    return json(
      { error: "Receive this batch before inspection." },
      409,
    );
  }

  // Prevent reinspection after production allocation
  if (receipt.milkBatch.processingBatches.length > 0) {
    return json(
      {
        error: "A batch already used in production cannot be re-inspected.",
      },
      409,
    );
  }

  // Only ON_HOLD batches can be inspected again
  const latest = await prisma.milkQualityInspection.findFirst({
    where: {
      milkBatchId: batchId,
    },
    orderBy: {
      inspectedAt: "desc",
    },
  });

  if (latest && latest.status !== "ON_HOLD") {
    return json(
      {
        error: "Only batches on hold may be inspected again.",
      },
      409,
    );
  }

  // Generate a stable event ID before saving the inspection
  const eventId = crypto.randomUUID();

  // Save inspection and activity log in PostgreSQL
  const inspection = await prisma.$transaction(async (tx) => {
    const created = await tx.milkQualityInspection.create({
      data: {
        milkBatchId: batchId,
        inspectorUserId: user.userId,

        temperatureC: body.data.temperatureC,
        fatPercent: body.data.fatPercent,
        snfPercent: body.data.snfPercent,
        acidityPercent: body.data.acidityPercent,

        qualityResult: qualityDecision.qualityResult,
        status: qualityDecision.status,

        remarks: [
          body.data.remarks?.trim(),
          ...qualityDecision.reasons,
        ]
          .filter(Boolean)
          .join("\n"),

        inspectedAt: body.data.inspectedAt
          ? new Date(body.data.inspectedAt)
          : new Date(),
      },
    });

    await recordActivity(
      tx,
      factory,
      "QUALITY_INSPECTION_RECORDED",
      "milk_batch",
      batchId,
      {
        status: qualityDecision.status,
        qualityResult: qualityDecision.qualityResult,
        reasons: qualityDecision.reasons,
        inspectionId: created.id,
        blockchainEventId: eventId,
        blockchainStatus: "PENDING",
      },
    );

    return created;
  });

  // Submit the quality inspection event to Hyperledger Fabric
  let blockchainStatus: "CONFIRMED" | "FAILED" = "FAILED";
  let blockchainMessage = "";

  try {
    // Make sure the parent batch and its farm origins exist on Fabric.
    // Missing batches are backfilled from PostgreSQL.
    await ensureBatchOnFabric(receipt.milkBatch.batchId);

    // Record the quality inspection event
    await submitFabricTransaction(
      "RecordSupplyChainEvent",
      receipt.milkBatch.batchId,
      eventId,
      "QUALITY_CHECK_RECORDED",
      factory.name,
      factory.address || factory.name,
      "",
      "",
      qualityDecision.qualityResult,
      "",
    );

    blockchainStatus = "CONFIRMED";
    blockchainMessage =
      "Quality inspection successfully recorded on Hyperledger Fabric.";
  } catch (error) {
    console.error(
      "Fabric quality inspection submission failed:",
      error,
    );

    blockchainMessage =
      "Inspection was saved in PostgreSQL, but blockchain submission failed.";
  }

  // Update the corresponding PostgreSQL activity with blockchain status
  try {
    const activities = await prisma.traceabilityEvent.findMany({
      where: {
        eventType: "QUALITY_INSPECTION_RECORDED",
        entityType: "milk_batch",
        entityId: batchId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Match this specific inspection rather than another inspection
    const activity = activities.find((item) => {
      const payload =
        item.payload &&
        typeof item.payload === "object" &&
        !Array.isArray(item.payload)
          ? (item.payload as Record<string, unknown>)
          : {};

      return payload.inspectionId === inspection.id;
    });

    if (activity) {
      const existingPayload =
        activity.payload &&
        typeof activity.payload === "object" &&
        !Array.isArray(activity.payload)
          ? (activity.payload as Record<string, unknown>)
          : {};

      await prisma.traceabilityEvent.update({
        where: {
          id: activity.id,
        },
        data: {
          blockchainStatus,
          payload: {
            ...existingPayload,
            blockchainStatus,
            blockchainEventId: eventId,
            blockchainMessage,
          },
        },
      });
    }
  } catch (error) {
    console.error(
      "Failed to update inspection blockchain status:",
      error,
    );
  }

  return json(
    {
      message: "Milk quality inspection completed.",
      inspection,
      decision: qualityDecision,
      blockchainStatus,
      blockchainMessage,
    },
    201,
  );
}

async function listProduction(factory: FactoryProfile) {
  return prisma.processingBatch.findMany({
    where: { factoryId: factory.id },
    include: {
      operator: { select: { name: true } },
      sourceMilkBatches: {
        include: {
          milkBatch: {
            include: {
              factoryReceipt: true,
              qualityInspections: { orderBy: { inspectedAt: "desc" }, take: 1 },
            },
          },
        },
      },
      productLots: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

async function createProduction(
  req: Request,
  user: AuthenticatedUser,
  factory: FactoryProfile,
) {
  const body = productionSchema.safeParse(await parseJson(req));

  if (!body.success) return validationError(body.error);

  if (
    new Set(body.data.milkBatchIds).size !==
    body.data.milkBatchIds.length
  ) {
    return json(
      { error: "Select each milk batch only once." },
      400,
    );
  }

  const batches = await prisma.milkBatch.findMany({
    where: {
      id: { in: body.data.milkBatchIds },
    },
    include: {
      factoryReceipt: true,
      qualityInspections: {
        orderBy: { inspectedAt: "desc" },
        take: 1,
      },
      processingBatches: true,
    },
  });

  if (batches.length !== body.data.milkBatchIds.length) {
    return json(
      { error: "One or more selected milk batches were not found." },
      404,
    );
  }

  const ineligible = batches.find(
    (batch) =>
      batch.factoryReceipt?.factoryId !== factory.id ||
      batch.qualityInspections[0]?.status !== "ACCEPTED" ||
      batch.qualityInspections[0]?.qualityResult !== "PASS" ||
      batch.processingBatches.length > 0,
  );

  if (ineligible) {
    return json(
      {
        error: `Milk batch ${ineligible.batchId} must be received, pass its latest inspection, and not be allocated to another production run.`,
      },
      409,
    );
  }

  const inputVolumeL =
    batches.reduce(
      (sum, batch) =>
        sum +
        toMilliLitres(
          Number(batch.factoryReceipt?.receivedQuantityL ?? 0),
        ),
      0,
    ) / 1000;

  const date = new Date(body.data.date);

  const batchId = `PB-${date
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;

  try {
    const run = await prisma.$transaction(
      async (tx) => {
        const created = await tx.processingBatch.create({
          data: {
            batchId,
            factoryId: factory.id,
            date,
            volumeL: inputVolumeL,
            inputVolumeL,
            product: body.data.product,
            packs: 0,
            status: "PROCESSING",
            operatorUserId: user.userId,

            sourceMilkBatches: {
              create: batches.map((batch) => ({
                milkBatchId: batch.id,
              })),
            },
          },
          include: {
            sourceMilkBatches: true,
          },
        });

        const allocated = await tx.milkBatch.updateMany({
          where: {
            id: {
              in: batches.map((batch) => batch.id),
            },
            status: "SAFE",
          },
          data: {
            status: "PROCESSING",
          },
        });

        if (allocated.count !== batches.length) {
          throw new FactoryConflictError(
            "One or more milk batches were concurrently allocated. Refresh and retry.",
          );
        }

        await recordActivity(
          tx,
          factory,
          "PRODUCTION_RUN_CREATED",
          "processing_batch",
          created.id,
          {
            batchId,
            milkBatchIds: batches.map(
              (batch) => batch.batchId,
            ),
            inputVolumeL,
          },
        );

        return created;
      },
      {
        isolationLevel: "Serializable",
      },
    );

    return json(
      {
        message: "Production run created successfully.",
        productionRun: run,
        blockchainStatus: "NOT_SUBMITTED",
        blockchainMessage:
          "Processing will be recorded on Hyperledger Fabric when the production run is completed.",
      },
      201,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return json(
        {
          error:
            "Could not create a unique production batch ID. Please retry.",
        },
        409,
      );
    }

    if (
      error instanceof FactoryConflictError ||
      isSerializationConflict(error)
    ) {
      return json(
        {
          error:
            "Milk batches changed while production was being created. Refresh and retry.",
        },
        409,
      );
    }

    throw error;
  }
}

async function completeProduction(
  req: Request,
  user: AuthenticatedUser,
  factory: FactoryProfile,
  productionId: string,
) {
  const body = completionSchema.safeParse(await parseJson(req));

  if (!body.success) return validationError(body.error);

  const run = await prisma.processingBatch.findFirst({
    where: {
      id: productionId,
      factoryId: factory.id,
    },
    include: {
      sourceMilkBatches: {
        include: {
          milkBatch: {
            include: {
              factoryReceipt: true,
            },
          },
        },
      },
    },
  });

  if (!run) {
    return json(
      { error: "Production run not found." },
      404,
    );
  }

  if (run.status !== "PROCESSING") {
    return json(
      { error: "Only active production runs can be completed." },
      409,
    );
  }

  if (run.sourceMilkBatches.length === 0) {
    return json(
      { error: "This production run has no source milk batches." },
      409,
    );
  }

  const input = Number(run.inputVolumeL ?? run.volumeL);

  const totalOutputAndWastageMilliLitres =
    toMilliLitres(body.data.outputVolumeL) +
    toMilliLitres(body.data.wastageL);

  if (
    totalOutputAndWastageMilliLitres >
    toMilliLitres(input)
  ) {
    return json(
      {
        error:
          "Output and wastage cannot exceed the recorded input quantity.",
      },
      400,
    );
  }

  const missingReceipt = run.sourceMilkBatches.find(
    (source) =>
      !source.milkBatch.factoryReceipt ||
      source.milkBatch.factoryReceipt.factoryId !== factory.id,
  );

  if (missingReceipt) {
    return json(
      {
        error:
          "Every source milk batch must have a valid factory receipt before production can be completed.",
      },
      409,
    );
  }

  const lotId = `LOT-${new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;

  // Generate stable Fabric event IDs before the database transaction.
  // These IDs are retained for recovery if Fabric submission fails.
  const fabricEvents = run.sourceMilkBatches.map((source) => ({
    milkBatchId: source.milkBatch.id,
    batchId: source.milkBatch.batchId,
    eventId: crypto.randomUUID(),
    quantityLitres: Number(
      source.milkBatch.factoryReceipt!.receivedQuantityL,
    ),
  }));

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const updatedCount = await tx.processingBatch.updateMany({
        where: {
          id: run.id,
          factoryId: factory.id,
          status: "PROCESSING",
        },
        data: {
          status: "COMPLETED",
          outputVolumeL: body.data.outputVolumeL,
          wastageL: body.data.wastageL,
          packs: 0,
          completedAt: new Date(),
        },
      });

      if (updatedCount.count !== 1) {
        throw new FactoryConflictError(
          "This production run was already completed. Refresh the production list.",
        );
      }

      const updated = await tx.processingBatch.findUniqueOrThrow({
        where: {
          id: run.id,
        },
      });

      const createdLot = await tx.productLot.create({
        data: {
          lotId,
          processingBatchId: run.id,
          productName: run.product,
          producedQuantityL: body.data.outputVolumeL,
          currentQuantityL: body.data.outputVolumeL,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          productLotId: createdLot.id,
          recordedByUserId: user.userId,
          movementType: "PRODUCTION_OUTPUT",
          quantityL: body.data.outputVolumeL,
          reference: run.batchId,
        },
      });

      // Store the Fabric event IDs and pending status in PostgreSQL.
      const activity = await tx.traceabilityEvent.create({
        data: {
          eventType: "PRODUCTION_RUN_COMPLETED",
          entityType: "processing_batch",
          entityId: run.id,
          payload: {
            factoryId: factory.id,
            batchId: run.batchId,
            lotId,
            outputVolumeL: body.data.outputVolumeL,
            wastageL: body.data.wastageL,
            blockchainStatus: "PENDING",
            fabricEvents,
          },
        },
      });

      return {
        productionRun: updated,
        productLot: createdLot,
        activityId: activity.id,
      };
    });

    // PostgreSQL is saved. Now submit the processing events to Fabric.
    const fabricResults: {
      batchId: string;
      eventId: string;
      status: "CONFIRMED" | "FAILED";
      message: string;
    }[] = [];

    for (const event of fabricEvents) {
      try {
        // Ensure this source milk batch and its farm origins exist on Fabric.
        await ensureBatchOnFabric(event.batchId);

        // Check the ledger before submitting.
        // This prevents duplicate events during recovery/retries.
        const ledgerResponse = await evaluateFabricTransaction(
          "GetMilkBatch",
          event.batchId,
        );

        const ledgerBatch = JSON.parse(ledgerResponse);

        if (!Array.isArray(ledgerBatch.events)) {
          throw new Error(
            `Invalid Fabric event history for ${event.batchId}.`,
          );
        }

        const existingEvent = ledgerBatch.events.find(
          (item: { eventId?: string }) =>
            item.eventId === event.eventId,
        );

        if (!existingEvent) {
          await submitFabricTransaction(
            "RecordSupplyChainEvent",
            event.batchId,
            event.eventId,
            "PROCESSING_RECORDED",
            factory.name,
            factory.address || factory.name,
            "",
            String(event.quantityLitres),
            "COMPLETED",
            lotId,
          );
        }

        // Verify the event was committed to Fabric.
        const verificationResponse =
          await evaluateFabricTransaction(
            "GetMilkBatch",
            event.batchId,
          );

        const verifiedBatch = JSON.parse(
          verificationResponse,
        );

        const verifiedEvent = verifiedBatch.events?.find(
          (item: { eventId?: string }) =>
            item.eventId === event.eventId,
        );

        if (!verifiedEvent) {
          throw new Error(
            `Processing event could not be verified for ${event.batchId}.`,
          );
        }

        fabricResults.push({
          batchId: event.batchId,
          eventId: event.eventId,
          status: "CONFIRMED",
          message: "Processing event verified on Hyperledger Fabric.",
        });
      } catch (error) {
        console.error(
          `Fabric processing event failed for ${event.batchId}:`,
          error,
        );

        fabricResults.push({
          batchId: event.batchId,
          eventId: event.eventId,
          status: "FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Unknown Fabric submission error.",
        });
      }
    }

    const confirmedCount = fabricResults.filter(
      (result) => result.status === "CONFIRMED",
    ).length;

    const failedCount = fabricResults.length - confirmedCount;

    const blockchainStatus:
      | "CONFIRMED"
      | "PARTIAL"
      | "FAILED" =
      failedCount === 0
        ? "CONFIRMED"
        : confirmedCount > 0
          ? "PARTIAL"
          : "FAILED";

    const blockchainMessage =
      blockchainStatus === "CONFIRMED"
        ? "All source milk batch processing events were successfully recorded and verified on Hyperledger Fabric."
        : blockchainStatus === "PARTIAL"
          ? "Production was completed, but some source milk batch events could not be recorded on Fabric. Failed events can be retried using their saved event IDs."
          : "Production was completed in PostgreSQL, but Fabric submission failed. The saved event IDs are retained for recovery.";

    // Update the exact activity created during production completion.
    try {
      const existingActivity =
        await prisma.traceabilityEvent.findUnique({
          where: {
            id: saved.activityId,
          },
        });

      if (existingActivity) {
        const existingPayload =
          existingActivity.payload &&
          typeof existingActivity.payload === "object" &&
          !Array.isArray(existingActivity.payload)
            ? (existingActivity.payload as Record<
                string,
                unknown
              >)
            : {};

        await prisma.traceabilityEvent.update({
          where: {
            id: saved.activityId,
          },
          data: {
            blockchainStatus,
            payload: {
              ...existingPayload,
              blockchainStatus,
              blockchainMessage,
              fabricResults,
            },
          },
        });
      }
    } catch (error) {
      console.error(
        "Failed to update production blockchain status:",
        error,
      );
    }

    return json(
      {
        message: "Production run completed successfully.",
        productionRun: saved.productionRun,
        productLot: saved.productLot,
        blockchainStatus,
        blockchainMessage,
        fabricResults,
      },
      201,
    );
  } catch (error) {
    if (
      error instanceof FactoryConflictError ||
      isSerializationConflict(error)
    ) {
      return json(
        {
          error:
            "This production run changed during completion. Refresh and retry.",
        },
        409,
      );
    }

    throw error;
  }
}

async function getInventory(factory: FactoryProfile) {
  return prisma.productLot.findMany({
    where: { processingBatch: { factoryId: factory.id } },
    include: {
      processingBatch: { select: { batchId: true, product: true, date: true } },
      movements: { orderBy: { createdAt: "desc" }, take: 20 },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

async function createDispatch(
  req: Request,
  user: AuthenticatedUser,
  factory: FactoryProfile,
) {
  const body = dispatchSchema.safeParse(await parseJson(req));

  if (!body.success) return validationError(body.error);

  if (
    new Set(body.data.items.map((item) => item.lotId)).size !==
    body.data.items.length
  ) {
    return json(
      { error: "Each product lot may only be listed once per dispatch." },
      400,
    );
  }

  const lots = await prisma.productLot.findMany({
    where: {
      lotId: { in: body.data.items.map((item) => item.lotId) },
      processingBatch: { factoryId: factory.id },
    },
    include: {
      processingBatch: {
        include: {
          sourceMilkBatches: {
            include: {
              milkBatch: {
                select: {
                  id: true,
                  batchId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (lots.length !== body.data.items.length) {
    return json(
      { error: "One or more product lots were not found for this factory." },
      404,
    );
  }

  for (const item of body.data.items) {
    const lot = lots.find((candidate) => candidate.lotId === item.lotId)!;

    if (
      lot.status !== "AVAILABLE" ||
      Number(lot.currentQuantityL) < item.quantityL
    ) {
      return json(
        {
          error: `Lot ${item.lotId} is not available in the requested quantity.`,
        },
        409,
      );
    }

    if (lot.processingBatch.sourceMilkBatches.length === 0) {
      return json(
        {
          error: `Lot ${item.lotId} has no source milk batch genealogy.`,
        },
        409,
      );
    }
  }

  const dispatchId = `DSP-${new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;

  // Generate stable event IDs before saving the dispatch.
  // Each product lot is linked to every source milk batch.
  const fabricEvents = body.data.items.flatMap((item) => {
    const lot = lots.find((candidate) => candidate.lotId === item.lotId)!;

    return lot.processingBatch.sourceMilkBatches.map((source) => ({
      lotId: lot.lotId,
      milkBatchId: source.milkBatch.id,
      batchId: source.milkBatch.batchId,
      eventId: crypto.randomUUID(),
    }));
  });

  try {
    const saved = await prisma.$transaction(
      async (tx) => {
        const created = await tx.dispatch.create({
          data: {
            dispatchId,
            factoryId: factory.id,
            destination: body.data.destination,
            vehicleId: body.data.vehicleId,
            dispatchedAt: body.data.dispatchedAt
              ? new Date(body.data.dispatchedAt)
              : new Date(),
            transportDetails: body.data.transportDetails || null,
            createdByUserId: user.userId,
          },
        });

        for (const item of body.data.items) {
          const lot = lots.find(
            (candidate) => candidate.lotId === item.lotId,
          )!;

          const updated = await tx.productLot.updateMany({
            where: {
              id: lot.id,
              status: "AVAILABLE",
              currentQuantityL: { gte: item.quantityL },
            },
            data: {
              currentQuantityL: { decrement: item.quantityL },
            },
          });

          if (updated.count !== 1) {
            throw new FactoryConflictError(
              `Inventory changed for lot ${item.lotId}. Refresh and retry.`,
            );
          }

          await tx.dispatchItem.create({
            data: {
              dispatchId: created.id,
              productLotId: lot.id,
              quantityL: item.quantityL,
            },
          });

          await tx.inventoryMovement.create({
            data: {
              productLotId: lot.id,
              dispatchId: created.id,
              recordedByUserId: user.userId,
              movementType: "DISPATCH",
              quantityL: item.quantityL,
              reference: dispatchId,
            },
          });

          const remainingMilliLitres =
            toMilliLitres(Number(lot.currentQuantityL)) -
            toMilliLitres(item.quantityL);

          if (remainingMilliLitres === 0) {
            await tx.productLot.update({
              where: { id: lot.id },
              data: { status: "DEPLETED" },
            });
          }
        }

        const activity = await tx.traceabilityEvent.create({
          data: {
            eventType: "PRODUCTS_DISPATCHED",
            entityType: "dispatch",
            entityId: created.id,
            payload: {
              dispatchId,
              factoryId: factory.id,
              destination: body.data.destination,
              vehicleId: body.data.vehicleId,
              items: body.data.items,
              blockchainStatus: "PENDING",
              fabricEvents,
            },
          },
        });

        const dispatch = await tx.dispatch.findUnique({
          where: { id: created.id },
          include: {
            items: {
              include: {
                productLot: true,
              },
            },
          },
        });

        return {
          dispatch,
          activityId: activity.id,
        };
      },
      { isolationLevel: "Serializable" },
    );

    // PostgreSQL is committed. Now submit the distribution events.
    const fabricResults: {
      batchId: string;
      lotId: string;
      eventId: string;
      status: "CONFIRMED" | "FAILED";
      message: string;
    }[] = [];

    for (const event of fabricEvents) {
      try {
        await ensureBatchOnFabric(event.batchId);

        const ledgerResponse = await evaluateFabricTransaction(
          "GetMilkBatch",
          event.batchId,
        );

        const ledgerBatch = JSON.parse(ledgerResponse);

        if (!Array.isArray(ledgerBatch.events)) {
          throw new Error(
            `Invalid Fabric event history for ${event.batchId}.`,
          );
        }

        const existingEvent = ledgerBatch.events.find(
          (item: { eventId?: string }) =>
            item.eventId === event.eventId,
        );

        if (!existingEvent) {
          await submitFabricTransaction(
            "RecordSupplyChainEvent",
            event.batchId,
            event.eventId,
            "DISTRIBUTION_DISPATCHED",
            factory.name,
            body.data.destination,
            body.data.vehicleId,
            "",
            "",
            event.lotId,
          );
        }

        // Verify that the event exists on the ledger.
        const verificationResponse = await evaluateFabricTransaction(
          "GetMilkBatch",
          event.batchId,
        );

        const verifiedBatch = JSON.parse(verificationResponse);

        const verifiedEvent = verifiedBatch.events?.find(
          (item: { eventId?: string }) =>
            item.eventId === event.eventId,
        );

        if (!verifiedEvent) {
          throw new Error(
            `Distribution event could not be verified for ${event.batchId}.`,
          );
        }

        fabricResults.push({
          batchId: event.batchId,
          lotId: event.lotId,
          eventId: event.eventId,
          status: "CONFIRMED",
          message: "Distribution event verified on Hyperledger Fabric.",
        });
      } catch (error) {
        console.error(
          `Fabric distribution event failed for ${event.batchId}:`,
          error,
        );

        fabricResults.push({
          batchId: event.batchId,
          lotId: event.lotId,
          eventId: event.eventId,
          status: "FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Unknown Fabric submission error.",
        });
      }
    }

    const confirmedCount = fabricResults.filter(
      (result) => result.status === "CONFIRMED",
    ).length;

    const failedCount = fabricResults.length - confirmedCount;

    const blockchainStatus:
      | "CONFIRMED"
      | "PARTIAL"
      | "FAILED" =
      failedCount === 0
        ? "CONFIRMED"
        : confirmedCount > 0
          ? "PARTIAL"
          : "FAILED";

    const blockchainMessage =
      blockchainStatus === "CONFIRMED"
        ? "All distribution events were recorded and verified on Hyperledger Fabric."
        : blockchainStatus === "PARTIAL"
          ? "Some distribution events failed. The original event IDs have been saved for recovery."
          : "Dispatch was saved in PostgreSQL, but Fabric submission failed. The original event IDs have been saved for recovery.";

    try {
      await prisma.traceabilityEvent.update({
        where: { id: saved.activityId },
        data: {
          blockchainStatus,
          payload: {
            dispatchId,
            factoryId: factory.id,
            destination: body.data.destination,
            vehicleId: body.data.vehicleId,
            items: body.data.items,
            blockchainStatus,
            blockchainMessage,
            fabricEvents,
            fabricResults,
          },
        },
      });
    } catch (error) {
      console.error(
        "Failed to update dispatch blockchain status:",
        error,
      );
    }

    return json(
      {
        dispatch: saved.dispatch,
        blockchainStatus,
        blockchainMessage,
        fabricResults,
      },
      201,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return json(
        { error: "Could not create a unique dispatch ID. Please retry." },
        409,
      );
    }

    if (
      error instanceof FactoryConflictError ||
      isSerializationConflict(error)
    ) {
      return json(
        {
          error:
            "Inventory changed while this dispatch was being created. Refresh and retry.",
        },
        409,
      );
    }

    throw error;
  }
}

async function retryDispatchBlockchain(
  factory: FactoryProfile,
  dispatchId: string,
) {
  const dispatch = await prisma.dispatch.findFirst({
    where: {
      dispatchId,
      factoryId: factory.id,
    },
    include: {
      items: {
        include: {
          productLot: {
            include: {
              processingBatch: {
                include: {
                  sourceMilkBatches: {
                    include: {
                      milkBatch: {
                        select: {
                          id: true,
                          batchId: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!dispatch) {
    return json({ error: "Dispatch not found." }, 404);
  }

  const activity = await prisma.traceabilityEvent.findFirst({
    where: {
      eventType: "PRODUCTS_DISPATCHED",
      entityType: "dispatch",
      entityId: dispatch.id,
    },
  });

  if (!activity) {
    return json(
      { error: "Original dispatch activity not found." },
      404,
    );
  }

  const payload =
    activity.payload &&
    typeof activity.payload === "object" &&
    !Array.isArray(activity.payload)
      ? (activity.payload as Record<string, unknown>)
      : {};

  const events = payload.fabricEvents;

  if (!Array.isArray(events) || events.length === 0) {
    return json(
      { error: "Saved Fabric event IDs are missing. Manual recovery is required." },
      409,
    );
  }

  const fabricResults: {
    batchId: string;
    lotId: string;
    eventId: string;
    status: "CONFIRMED" | "FAILED";
    message: string;
  }[] = [];

  for (const rawEvent of events) {
    const event = rawEvent as {
      batchId: string;
      lotId: string;
      eventId: string;
    };

    try {
      if (
        !event.batchId ||
        !event.lotId ||
        !event.eventId
      ) {
        throw new Error("Invalid saved Fabric event details.");
      }

      await ensureBatchOnFabric(event.batchId);

      const ledgerResponse = await evaluateFabricTransaction(
        "GetMilkBatch",
        event.batchId,
      );

      const ledgerBatch = JSON.parse(ledgerResponse);

      const existingEvent = ledgerBatch.events?.find(
        (item: { eventId?: string }) =>
          item.eventId === event.eventId,
      );

      if (!existingEvent) {
        await submitFabricTransaction(
          "RecordSupplyChainEvent",
          event.batchId,
          event.eventId,
          "DISTRIBUTION_DISPATCHED",
          factory.name,
          dispatch.destination,
          dispatch.vehicleId || "",
          "",
          "",
          event.lotId,
        );
      }

      const verificationResponse = await evaluateFabricTransaction(
        "GetMilkBatch",
        event.batchId,
      );

      const verifiedBatch = JSON.parse(verificationResponse);

      const verifiedEvent = verifiedBatch.events?.find(
        (item: { eventId?: string }) =>
          item.eventId === event.eventId,
      );

      if (!verifiedEvent) {
        throw new Error("Distribution event verification failed.");
      }

      fabricResults.push({
        batchId: event.batchId,
        lotId: event.lotId,
        eventId: event.eventId,
        status: "CONFIRMED",
        message: "Distribution event verified on Fabric.",
      });
    } catch (error) {
      fabricResults.push({
        batchId: event.batchId,
        lotId: event.lotId,
        eventId: event.eventId,
        status: "FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Unknown recovery error.",
      });
    }
  }

  const confirmed = fabricResults.filter(
    (item) => item.status === "CONFIRMED",
  ).length;

  const failed = fabricResults.length - confirmed;

  const blockchainStatus =
    failed === 0
      ? "CONFIRMED"
      : confirmed > 0
        ? "PARTIAL"
        : "FAILED";

  const blockchainMessage =
    blockchainStatus === "CONFIRMED"
      ? "All distribution events successfully verified on Fabric."
      : blockchainStatus === "PARTIAL"
        ? "Some distribution events still need recovery."
        : "Distribution events could not be recorded on Fabric.";

  await prisma.traceabilityEvent.update({
    where: { id: activity.id },
    data: {
      blockchainStatus,
      payload: {
        ...payload,
        blockchainStatus,
        blockchainMessage,
        fabricResults,
      },
    },
  });

  return json({
    dispatchId,
    blockchainStatus,
    blockchainMessage,
    fabricResults,
  });
}

async function listDispatches(factory: FactoryProfile) {
  return prisma.dispatch.findMany({
    where: { factoryId: factory.id },
    include: {
      items: { include: { productLot: { select: { lotId: true, productName: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { dispatchedAt: "desc" },
    take: 500,
  });
}

async function trace(factory: FactoryProfile, lookup: string) {
  const batch = await prisma.milkBatch.findFirst({
    where: {
      OR: [
        { batchId: { equals: lookup, mode: "insensitive" } },
        { id: lookup },
      ],
      factoryReceipt: { factoryId: factory.id },
    },
    include: {
      collectionCentre: { select: { name: true, code: true, village: true } },
      factoryReceipt: true,
      qualityInspections: {
        include: { inspector: { select: { name: true } } },
        orderBy: { inspectedAt: "desc" },
      },
      processingBatches: {
        include: {
          processingBatch: {
            include: {
              productLots: {
                include: {
                  dispatchItems: {
                    include: { dispatch: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (batch) return { type: "milk_batch", record: batch };

  const lot = await prisma.productLot.findFirst({
    where: {
      OR: [{ lotId: { equals: lookup, mode: "insensitive" } }, { id: lookup }],
      processingBatch: { factoryId: factory.id },
    },
    include: {
      processingBatch: {
        include: {
          sourceMilkBatches: {
            include: {
              milkBatch: {
                include: {
                  collectionCentre: { select: { name: true, code: true, village: true } },
                  factoryReceipt: true,
                  qualityInspections: { orderBy: { inspectedAt: "desc" } },
                },
              },
            },
          },
        },
      },
      dispatchItems: { include: { dispatch: true } },
      movements: { orderBy: { createdAt: "desc" } },
    },
  });
  if (lot) return { type: "product_lot", record: lot };

  const dispatch = await prisma.dispatch.findFirst({
    where: {
      OR: [
        { dispatchId: { equals: lookup, mode: "insensitive" } },
        { id: lookup },
      ],
      factoryId: factory.id,
    },
    include: {
      items: {
        include: {
          productLot: {
            include: {
              processingBatch: {
                include: {
                  sourceMilkBatches: {
                    include: { milkBatch: { include: { collectionCentre: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  return dispatch ? { type: "dispatch", record: dispatch } : null;
}

async function reports(factory: FactoryProfile, url: URL) {
  const receivedAt = dateFilter(url);
  const [receipts, productionRuns, productLots, dispatches, inspections] =
    await Promise.all([
      prisma.factoryMilkBatchReceipt.findMany({
        where: { factoryId: factory.id, ...(receivedAt ? { receivedAt } : {}) },
        include: {
          milkBatch: {
            include: {
              collectionCentre: { select: { name: true, code: true } },
              qualityInspections: { orderBy: { inspectedAt: "desc" }, take: 1 },
            },
          },
        },
        orderBy: { receivedAt: "desc" },
        take: 1000,
      }),
      prisma.processingBatch.findMany({
        where: { factoryId: factory.id, ...(receivedAt ? { date: receivedAt } : {}) },
        include: { productLots: true },
        orderBy: { date: "desc" },
        take: 1000,
      }),
      prisma.productLot.findMany({
        where: { processingBatch: { factoryId: factory.id } },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
      prisma.dispatch.findMany({
        where: { factoryId: factory.id, ...(receivedAt ? { dispatchedAt: receivedAt } : {}) },
        include: { items: { include: { productLot: true } } },
        orderBy: { dispatchedAt: "desc" },
        take: 1000,
      }),
      prisma.milkQualityInspection.findMany({
        where: { milkBatch: { factoryReceipt: { factoryId: factory.id } }, ...(receivedAt ? { inspectedAt: receivedAt } : {}) },
        include: {
          milkBatch: { select: { batchId: true } },
          inspector: { select: { name: true } },
        },
        orderBy: { inspectedAt: "desc" },
        take: 1000,
      }),
    ]);
  return { receipts, productionRuns, productLots, dispatches, inspections };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isSerializationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

export async function handleFactoryRequest(
  req: Request,
  user: AuthenticatedUser,
): Promise<Response> {
  try {
    const factory = await getOrCreateFactoryProfile(user.userId);
    if (factory instanceof Response) return factory;

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean).slice(2);
    const [resource, id, action] = segments.map((segment) => decodeURIComponent(segment));
    // Get the logged-in factory's profile
if (req.method === "GET" && resource === "profile" && !id) {
  return json({
    id: factory.id,
    name: factory.name,
    code: factory.code,
    address: factory.address,
  });
}

    if (req.method === "GET" && resource === "dashboard" && !id) {
      return json(await dashboard(factory));
    }

    // Search collection centres
if (
  req.method === "GET" &&
  resource === "collection-centres" &&
  (id === "search" || !id)
) {
  return searchCollectionCentres(url);
}

// Fetch batches belonging to a selected collection centre
if (
  req.method === "GET" &&
  resource === "collection-centres" &&
  id &&
  action === "batches"
) {
  return fetchCentreBatches(id);
}

// Add selected batches to factory intake
if (
  req.method === "POST" &&
  resource === "intake" &&
  id === "add"
) {
  return addBatchesToIntake(req, user, factory);
}
    if (req.method === "GET" && resource === "intake" && !id) {
      return json(await listIntake(factory, url));
    }
    if (req.method === "POST" && resource === "intake" && id && action === "receive") {
      return receiveBatch(req, user, factory, id);
    }
    if (
  req.method === "POST" &&
  resource === "intake" &&
  id &&
  action === "retry-blockchain"
) {
  return retryFactoryReceiptBlockchain(factory, id);
}
    if (req.method === "POST" && resource === "intake" && id && action === "inspect") {
      return inspectBatch(req, user, factory, id);
    }
    if (req.method === "GET" && resource === "production" && !id) {
      return json(await listProduction(factory));
    }

    if (
  req.method === "POST" &&
  resource === "dispatch" &&
  id &&
  action === "retry-blockchain"
) {
  return retryDispatchBlockchain(factory, id);
}
    if (req.method === "POST" && resource === "production" && !id) {
      return createProduction(req, user, factory);
    }
    if (req.method === "POST" && resource === "production" && id && action === "complete") {
      return completeProduction(req, user, factory, id);
    }
    if (req.method === "GET" && resource === "inventory" && !id) {
      return json(await getInventory(factory));
    }
    if (req.method === "GET" && resource === "dispatch" && !id) {
      return json(await listDispatches(factory));
    }
    if (req.method === "POST" && resource === "dispatch" && !id) {
      return createDispatch(req, user, factory);
    }
    if (req.method === "GET" && resource === "trace" && id && !action) {
      const result = await trace(factory, id);
      return result
        ? json(result)
        : json({ error: "No traceability record found for that ID." }, 404);
    }
    if (req.method === "GET" && resource === "reports" && !id) {
      return json(await reports(factory, url));
    }
    return json({ error: "Factory route not found." }, 404);
  } catch (error) {
    if (error instanceof z.ZodError) return validationError(error);
    if (error instanceof Error && error.message === "Request body must be valid JSON.") {
      return json({ error: error.message }, 400);
    }
    if (error instanceof Error && error.message.startsWith("Invalid ")) {
      return json({ error: error.message }, 400);
    }
    console.error("Factory API request failed:", error);
    return json({ error: "Factory request failed." }, 500);
  }
}
