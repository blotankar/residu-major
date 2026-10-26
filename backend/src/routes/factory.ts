import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../lib/auth-middleware";
import type { Prisma } from "../../generated/prisma/client";

const json = (data: unknown, status = 200) =>
  Response.json(data, { status });

const nonEmptyString = z.string().trim().min(1);
const positiveNumber = z.number().finite().positive();
const nonNegativeNumber = z.number().finite().nonnegative();

const receiptSchema = z.object({
  receivedQuantityL: positiveNumber,
  receivedAt: z.string().datetime().optional(),
  discrepancyNote: z.string().trim().max(1000).optional(),
});

const inspectionSchema = z.object({
  temperatureC: z.number().finite(),
  fatPercent: nonNegativeNumber,
  snfPercent: nonNegativeNumber,
  acidityPercent: nonNegativeNumber,
  adulterationResult: z.enum(["PASS", "FAIL", "INCONCLUSIVE"]),
  status: z.enum(["ACCEPTED", "ON_HOLD", "REJECTED"]),
  remarks: z.string().trim().max(2000).optional(),
  inspectedAt: z.string().datetime().optional(),
});

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
    date.gte = parsed;
  }
  if (to) {
    const parsed = new Date(to);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid to date.");
    date.lte = parsed;
  }
  return Object.keys(date).length ? date : undefined;
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
      pendingInspections: receipts.filter(
        (receipt) => !latestByBatch.has(receipt.milkBatchId),
      ).length,
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
    recentActivity: activity,
  };
}

async function listIntake(factory: FactoryProfile, url: URL) {
  const search = url.searchParams.get("search")?.trim();
  const status = url.searchParams.get("status");
  const where = {
    AND: [
      {
        OR: [
          { factoryReceipt: null },
          { factoryReceipt: { factoryId: factory.id } },
        ],
      },
      ...(search
        ? [
            {
              OR: [
                { batchId: { contains: search, mode: "insensitive" as const } },
                {
                  collectionCentre: {
                    OR: [
                      { name: { contains: search, mode: "insensitive" as const } },
                      { code: { contains: search, mode: "insensitive" as const } },
                    ],
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };

  const batches = await prisma.milkBatch.findMany({
    where,
    include: {
      collectionCentre: { select: { id: true, name: true, code: true, village: true } },
      factoryReceipt: true,
      qualityInspections: {
        orderBy: { inspectedAt: "desc" },
        take: 1,
        include: { inspector: { select: { name: true } } },
      },
      processingBatches: { select: { id: true } },
    },
    orderBy: { date: "desc" },
    take: 500,
  });
  const filtered = batches.filter((batch) => {
    if (status === "PENDING_RECEIPT") return !batch.factoryReceipt;
    if (status === "RECEIVED") return Boolean(batch.factoryReceipt);
    if (status === "PENDING_INSPECTION") {
      return Boolean(batch.factoryReceipt) && batch.qualityInspections.length === 0;
    }
    if (["ACCEPTED", "ON_HOLD", "REJECTED"].includes(status ?? "")) {
      return batch.qualityInspections[0]?.status === status;
    }
    return true;
  });
  return filtered;
}

async function receiveBatch(
  req: Request,
  user: AuthenticatedUser,
  factory: FactoryProfile,
  batchId: string,
) {
  const body = receiptSchema.safeParse(await parseJson(req));
  if (!body.success) return validationError(body.error);

  const batch = await prisma.milkBatch.findUnique({
    where: { id: batchId },
    include: { factoryReceipt: true, processingBatches: true },
  });
  if (!batch) return json({ error: "Milk batch not found." }, 404);
  if (batch.factoryReceipt) {
    return json({ error: "This milk batch has already been received." }, 409);
  }
  if (batch.status !== "SAFE" || batch.processingBatches.length) {
    return json({ error: "This milk batch is not available for factory receipt." }, 409);
  }

  const receivedAt = body.data.receivedAt
    ? new Date(body.data.receivedAt)
    : new Date();
  const discrepancy = Math.abs(Number(batch.volumeL) - body.data.receivedQuantityL);
  const discrepancyNote =
    discrepancy > 0
      ? body.data.discrepancyNote?.trim() ||
        `Received quantity differs from collection quantity by ${discrepancy.toFixed(3)} L.`
      : body.data.discrepancyNote?.trim() || null;

  try {
    const receipt = await prisma.$transaction(async (tx) => {
      const created = await tx.factoryMilkBatchReceipt.create({
        data: {
          milkBatchId: batch.id,
          factoryId: factory.id,
          receivedQuantityL: body.data.receivedQuantityL,
          receivedAt,
          discrepancyNote,
          receivedByUserId: user.userId,
        },
      });
      await recordActivity(tx, factory, "MILK_BATCH_RECEIVED", "milk_batch", batch.id, {
        batchId: batch.batchId,
        receivedQuantityL: body.data.receivedQuantityL,
        collectionQuantityL: batch.volumeL,
        discrepancyNote,
      });
      return created;
    });
    return json({ receipt }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return json({ error: "This milk batch has already been received." }, 409);
    }
    throw error;
  }
}

async function inspectBatch(
  req: Request,
  user: AuthenticatedUser,
  factory: FactoryProfile,
  batchId: string,
) {
  const body = inspectionSchema.safeParse(await parseJson(req));
  if (!body.success) return validationError(body.error);
  if (body.data.status === "ACCEPTED" && body.data.adulterationResult !== "PASS") {
    return json(
      { error: "A batch can only be accepted when the adulteration test passes." },
      400,
    );
  }

  const receipt = await prisma.factoryMilkBatchReceipt.findFirst({
    where: { milkBatchId: batchId, factoryId: factory.id },
    include: { milkBatch: { include: { processingBatches: true } } },
  });
  if (!receipt) return json({ error: "Receive this batch before inspection." }, 409);
  if (receipt.milkBatch.processingBatches.length) {
    return json({ error: "A batch already used in production cannot be re-inspected." }, 409);
  }

  const inspection = await prisma.$transaction(async (tx) => {
    const created = await tx.milkQualityInspection.create({
      data: {
        milkBatchId: batchId,
        inspectorUserId: user.userId,
        temperatureC: body.data.temperatureC,
        fatPercent: body.data.fatPercent,
        snfPercent: body.data.snfPercent,
        acidityPercent: body.data.acidityPercent,
        adulterationResult: body.data.adulterationResult,
        status: body.data.status,
        remarks: body.data.remarks || null,
        inspectedAt: body.data.inspectedAt ? new Date(body.data.inspectedAt) : new Date(),
      },
    });
    await recordActivity(tx, factory, "QUALITY_INSPECTION_RECORDED", "milk_batch", batchId, {
      status: body.data.status,
      adulterationResult: body.data.adulterationResult,
      inspectionId: created.id,
    });
    return created;
  });
  return json({ inspection }, 201);
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
  if (new Set(body.data.milkBatchIds).size !== body.data.milkBatchIds.length) {
    return json({ error: "Select each milk batch only once." }, 400);
  }

  const batches = await prisma.milkBatch.findMany({
    where: { id: { in: body.data.milkBatchIds } },
    include: {
      factoryReceipt: true,
      qualityInspections: { orderBy: { inspectedAt: "desc" }, take: 1 },
      processingBatches: true,
    },
  });
  if (batches.length !== body.data.milkBatchIds.length) {
    return json({ error: "One or more selected milk batches were not found." }, 404);
  }

  const ineligible = batches.find(
    (batch) =>
      batch.factoryReceipt?.factoryId !== factory.id ||
      batch.qualityInspections[0]?.status !== "ACCEPTED" ||
      batch.qualityInspections[0]?.adulterationResult !== "PASS" ||
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

  const inputVolumeL = batches.reduce(
    (sum, batch) => sum + Number(batch.factoryReceipt?.receivedQuantityL ?? 0),
    0,
  );
  const date = new Date(body.data.date);
  const batchId = `PB-${date.toISOString().slice(0, 10).replace(/-/g, "")}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;

  try {
    const run = await prisma.$transaction(async (tx) => {
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
            create: batches.map((batch) => ({ milkBatchId: batch.id })),
          },
        },
        include: { sourceMilkBatches: true },
      });
      await tx.milkBatch.updateMany({
        where: { id: { in: batches.map((batch) => batch.id) } },
        data: { status: "PROCESSING" },
      });
      await recordActivity(tx, factory, "PRODUCTION_RUN_CREATED", "processing_batch", created.id, {
        batchId,
        milkBatchIds: batches.map((batch) => batch.batchId),
        inputVolumeL,
      });
      return created;
    }, { isolationLevel: "Serializable" });
    return json({ productionRun: run }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return json({ error: "Could not create a unique production batch ID. Please retry." }, 409);
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
    where: { id: productionId, factoryId: factory.id },
    include: { sourceMilkBatches: true },
  });
  if (!run) return json({ error: "Production run not found." }, 404);
  if (run.status !== "PROCESSING") {
    return json({ error: "Only active production runs can be completed." }, 409);
  }
  const input = Number(run.inputVolumeL ?? run.volumeL);
  const totalOutputAndWastage = body.data.outputVolumeL + body.data.wastageL;
  if (totalOutputAndWastage > input) {
    return json(
      { error: "Output and wastage cannot exceed the recorded input quantity." },
      400,
    );
  }

  const lotId = `LOT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
  const lot = await prisma.$transaction(async (tx) => {
    const updated = await tx.processingBatch.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        outputVolumeL: body.data.outputVolumeL,
        wastageL: body.data.wastageL,
        packs: 0,
        completedAt: new Date(),
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
    await recordActivity(tx, factory, "PRODUCTION_RUN_COMPLETED", "processing_batch", run.id, {
      batchId: run.batchId,
      lotId,
      outputVolumeL: body.data.outputVolumeL,
      wastageL: body.data.wastageL,
    });
    return { productionRun: updated, productLot: createdLot };
  });
  return json(lot, 201);
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
  if (new Set(body.data.items.map((item) => item.lotId)).size !== body.data.items.length) {
    return json({ error: "Each product lot may only be listed once per dispatch." }, 400);
  }

  const lots = await prisma.productLot.findMany({
    where: {
      lotId: { in: body.data.items.map((item) => item.lotId) },
      processingBatch: { factoryId: factory.id },
    },
  });
  if (lots.length !== body.data.items.length) {
    return json({ error: "One or more product lots were not found for this factory." }, 404);
  }
  for (const item of body.data.items) {
    const lot = lots.find((candidate) => candidate.lotId === item.lotId)!;
    if (lot.status !== "AVAILABLE" || Number(lot.currentQuantityL) < item.quantityL) {
      return json(
        { error: `Lot ${item.lotId} is not available in the requested quantity.` },
        409,
      );
    }
  }

  const dispatchId = `DSP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
  try {
    const dispatch = await prisma.$transaction(async (tx) => {
      const created = await tx.dispatch.create({
        data: {
          dispatchId,
          factoryId: factory.id,
          destination: body.data.destination,
          dispatchedAt: body.data.dispatchedAt
            ? new Date(body.data.dispatchedAt)
            : new Date(),
          transportDetails: body.data.transportDetails || null,
          createdByUserId: user.userId,
        },
      });

      for (const item of body.data.items) {
        const lot = lots.find((candidate) => candidate.lotId === item.lotId)!;
        const updated = await tx.productLot.updateMany({
          where: {
            id: lot.id,
            status: "AVAILABLE",
            currentQuantityL: { gte: item.quantityL },
          },
          data: { currentQuantityL: { decrement: item.quantityL } },
        });
        if (updated.count !== 1) {
          throw new Error(`Inventory changed for lot ${item.lotId}. Refresh and retry.`);
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
        const remaining = Number(lot.currentQuantityL) - item.quantityL;
        if (remaining === 0) {
          await tx.productLot.update({
            where: { id: lot.id },
            data: { status: "DEPLETED" },
          });
        }
      }
      await recordActivity(tx, factory, "PRODUCTS_DISPATCHED", "dispatch", created.id, {
        dispatchId,
        destination: body.data.destination,
        items: body.data.items,
      });
      return tx.dispatch.findUnique({
        where: { id: created.id },
        include: { items: { include: { productLot: true } } },
      });
    }, { isolationLevel: "Serializable" });
    return json({ dispatch }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return json({ error: "Could not create a unique dispatch ID. Please retry." }, 409);
    }
    throw error;
  }
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

    if (req.method === "GET" && resource === "dashboard" && !id) {
      return json(await dashboard(factory));
    }
    if (req.method === "GET" && resource === "intake" && !id) {
      return json(await listIntake(factory, url));
    }
    if (req.method === "POST" && resource === "intake" && id && action === "receive") {
      return receiveBatch(req, user, factory, id);
    }
    if (req.method === "POST" && resource === "intake" && id && action === "inspect") {
      return inspectBatch(req, user, factory, id);
    }
    if (req.method === "GET" && resource === "production" && !id) {
      return json(await listProduction(factory));
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
