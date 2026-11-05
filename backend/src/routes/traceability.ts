
import { prisma } from "../lib/prisma";
import { evaluateFabricTransaction } from "../services/fabric";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseLedgerBatch(
  ledgerResponse: string,
  expectedBatchId: string,
): Record<string, unknown> | null {
  const parsed: unknown = JSON.parse(ledgerResponse);

  if (!isRecord(parsed) || parsed.batchId !== expectedBatchId) {
    return null;
  }

  return parsed;
}

function toConsumerBatch(batch: Record<string, unknown>) {
  const rawOrigins = Array.isArray(batch.farmOrigins)
    ? batch.farmOrigins
    : [];

  const farmOrigins = rawOrigins.filter(isRecord).map((origin) => ({
    farmName: optionalString(origin.farmName),
    location: optionalString(origin.location),
    linkedAt: optionalString(origin.linkedAt),
  }));

  const rawEvents = Array.isArray(batch.events) ? batch.events : [];

  const events = rawEvents.filter(isRecord).map((event) => ({
    eventType: optionalString(event.eventType),
    organization: optionalString(event.organization),
    location: optionalString(event.location),
    timestamp: optionalString(event.timestamp),
    vehicleId: optionalString(event.vehicleId),
    quantityLitres: optionalNumber(event.quantityLitres),
    qualityStatus: optionalString(event.qualityStatus),
    productLotId: optionalString(event.productLotId),
  }));

  return {
    batchId: optionalString(batch.batchId),

    collectionCentre: {
      name: optionalString(batch.collectionCentreName),
    },

    // Expose collection date in the format expected by the frontend.
    collectionDate: optionalString(batch.collectedAt),

    quantityLitres: optionalNumber(batch.quantityLitres),
    farmOrigins,
    events,
  };
}

async function getSourceMilkRecords(
  sourceMilkBatches: Array<{ milkBatch: { batchId: string } }>,
) {
  const uniqueBatchIds = [
    ...new Set(sourceMilkBatches.map((source) => source.milkBatch.batchId)),
  ];

  const sourceRecords = [];

  for (const sourceBatchId of uniqueBatchIds) {
    const ledgerResponse = await evaluateFabricTransaction(
      "GetMilkBatch",
      sourceBatchId,
    );

    const ledgerBatch = parseLedgerBatch(ledgerResponse, sourceBatchId);

    if (ledgerBatch) {
      sourceRecords.push(toConsumerBatch(ledgerBatch));
    }
  }

  return sourceRecords;
}

function getProductionInfo(processingBatch: {
  batchId: string;
  product: string;
  date: Date;
  volumeL: number;
  inputVolumeL: unknown;
  outputVolumeL: unknown;
  wastageL: unknown;
  packs: number;
  status: string;
  completedAt: Date | null;
}) {
  return {
    batchId: processingBatch.batchId,
    product: processingBatch.product,

    date: processingBatch.date.toISOString(),
    volumeL: optionalNumber(processingBatch.volumeL),

    inputVolumeL: optionalNumber(processingBatch.inputVolumeL),
    outputVolumeL: optionalNumber(processingBatch.outputVolumeL),
    wastageL: optionalNumber(processingBatch.wastageL),

    // These two fields must also be returned.
    packs: processingBatch.packs,
    status: processingBatch.status,

    completedAt: processingBatch.completedAt?.toISOString() ?? null,
  };
}

export async function handleTraceabilityRequest(
  req: Request,
  batchId: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  const normalizedBatchId = batchId.trim();

  if (
    normalizedBatchId.length < 3 ||
    normalizedBatchId.length > 100 ||
    !/^[A-Za-z0-9_-]+$/.test(normalizedBatchId)
  ) {
    return json({ error: "Invalid batch, lot or dispatch ID." }, 400);
  }

  try {
    // --------------------------------------------------
    // STEP 1: DISPATCH LOOKUP (DSP-...)
    // --------------------------------------------------

    const dispatch = await prisma.dispatch.findUnique({
      where: {
        dispatchId: normalizedBatchId,
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
                        milkBatch: true,
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

    if (dispatch) {
      if (dispatch.status !== "DISPATCHED") {
        return json(
          { error: "This dispatch is not available for public verification." },
          404,
        );
      }

      if (dispatch.items.length === 0) {
        return json(
          { error: "No products are linked to this dispatch." },
          404,
        );
      }

      const allSources = dispatch.items.flatMap(
        (item) => item.productLot.processingBatch.sourceMilkBatches,
      );

      const sourceRecords = await getSourceMilkRecords(allSources);

      if (sourceRecords.length === 0) {
        return json(
          {
            error:
              "Source milk batch records were not found on the blockchain.",
          },
          404,
        );
      }

      const products = dispatch.items.map((item) => ({
        productName: item.productLot.productName,
        productLotId: item.productLot.lotId,
        dispatchedQuantityL: optionalNumber(item.quantityL.toString()),
        producedQuantityL: optionalNumber(
          item.productLot.producedQuantityL.toString(),
        ),
        lotStatus: item.productLot.status,
        production: getProductionInfo(item.productLot.processingBatch),
      }));

      return json({
        lookupId: normalizedBatchId,
        lookupType: "DISPATCH",

        dispatch: {
          dispatchId: dispatch.dispatchId,
          destination: dispatch.destination,
          dispatchedAt: dispatch.dispatchedAt.toISOString(),
          vehicleId: dispatch.vehicleId,
          transportDetails: dispatch.transportDetails,
          status: dispatch.status,
        },

        products,
        sourceMilkBatches: sourceRecords,

        traceabilitySource: [
          "PostgreSQL",
          "Hyperledger Fabric",
        ],
      });
    }

    // --------------------------------------------------
    // STEP 2: PRODUCT LOT / PRODUCTION BATCH LOOKUP
    // --------------------------------------------------

    const productLot = await prisma.productLot.findFirst({
      where: {
        OR: [
          { lotId: normalizedBatchId },
          {
            processingBatch: {
              batchId: normalizedBatchId,
            },
          },
        ],
      },
      include: {
        processingBatch: {
          include: {
            sourceMilkBatches: {
              include: {
                milkBatch: true,
              },
            },
          },
        },
      },
    });

    if (productLot) {
      const sourceMilkBatches =
        productLot.processingBatch.sourceMilkBatches;

      if (!sourceMilkBatches.length) {
        return json(
          { error: "No source milk batches are linked to this product lot." },
          404,
        );
      }

      const sourceRecords = await getSourceMilkRecords(sourceMilkBatches);

      if (!sourceRecords.length) {
        return json(
          {
            error:
              "Source milk batch records were not found on the blockchain.",
          },
          404,
        );
      }

      return json({
        lookupId: normalizedBatchId,
        lookupType: "PRODUCT_LOT",

        product: {
          productName: productLot.productName,
          productLotId: productLot.lotId,
          producedQuantityL: optionalNumber(
            productLot.producedQuantityL.toString(),
          ),
          currentQuantityL: optionalNumber(
            productLot.currentQuantityL.toString(),
          ),
          lotStatus: productLot.status,
        },

        production: getProductionInfo(productLot.processingBatch),

        sourceMilkBatches: sourceRecords,

        traceabilitySource: [
          "PostgreSQL",
          "Hyperledger Fabric",
        ],
      });
    }

    // --------------------------------------------------
    // STEP 3: DIRECT MILK BATCH LOOKUP
    // --------------------------------------------------

    const ledgerResponse = await evaluateFabricTransaction(
      "GetMilkBatch",
      normalizedBatchId,
    );

    const batch = parseLedgerBatch(ledgerResponse, normalizedBatchId);

    if (!batch) {
      return json({ error: "Traceability record not found." }, 404);
    }

    return json({
      ...toConsumerBatch(batch),
      lookupType: "MILK_BATCH",
      traceabilitySource: "Hyperledger Fabric",
    });
  } catch (error) {
    console.error("Traceability lookup failed:", error);

    const message = error instanceof Error ? error.message : "";

    if (/does not exist|not found|batch not found/i.test(message)) {
      return json({ error: "Traceability record not found." }, 404);
    }

    return json(
      {
        error:
          "Unable to retrieve traceability information right now. Please try again.",
      },
      502,
    );
  }
}
