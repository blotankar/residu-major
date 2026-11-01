
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../lib/auth-middleware";
import { Prisma } from "../../generated/prisma/client";
import {
  submitFabricTransaction,
  evaluateFabricTransaction,
} from "../services/fabric";
// ------------------------------------------------------
// VALIDATION SCHEMAS
// ------------------------------------------------------

const createSchema = z.object({
  cattleIds: z.array(z.string().trim().min(1)).min(1).max(500),
  volumeL: z.number().finite().positive(),
  date: z.string().datetime().optional(),
});

const residueScreeningSchema = z.object({
  sampleId: z.string().trim().min(1).max(100),
  testKitName: z.string().trim().min(1).max(150),
  testKitBatchNumber: z.string().trim().max(100).optional(),
  testedAt: z.string().datetime(),
  panelComplete: z.boolean(),

  measurements: z
    .array(
      z.object({
        medicineMrlId: z.string().trim().min(1),
        measuredValue: z.number().finite().nonnegative(),
        measuredUnit: z.string().trim().min(1).max(30),
      }),
    )
    .min(1)
    .max(100),

  remarks: z.string().trim().max(1000).optional(),
  reportUrl: z.string().trim().url().optional(),
}).superRefine((data, ctx) => {
  const ids = data.measurements.map((item) => item.medicineMrlId);

  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: "custom",
      path: ["measurements"],
      message: "Each medicine can only be measured once per screening.",
    });
  }
});

// ------------------------------------------------------
// COMMON HELPERS
// ------------------------------------------------------

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

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

function normalizeUnit(unit: string) {
  return unit.trim().toLowerCase();
}

// ------------------------------------------------------
// MILK BATCH REQUEST HANDLER
// GET  - Fetch batches
// POST - Create batch
// ------------------------------------------------------

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
        {
          error:
            "No collection-centre profile is linked to this account.",
        },
        403,
      );
    }

    // --------------------------------------------------
    // GET: Fetch batches belonging to this centre.
    // --------------------------------------------------

    if (req.method === "GET") {
      const batches = await prisma.milkBatch.findMany({
        where: {
          collectionCentreId: centre.id,
        },

        include: {
          collectionCentre: {
            select: {
              name: true,
              code: true,
            },
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
                      user: {
                        select: {
                          name: true,
                        },
                      },
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
                  factory: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },

          residueScreenings: {
            include: {
              testedBy: {
                select: {
                  name: true,
                },
              },
              measurements: true,
            },
            orderBy: {
              testedAt: "desc",
            },
          },
        },

        orderBy: {
          date: "desc",
        },

        take: 500,
      });

      return json(batches);
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    // --------------------------------------------------
    // POST: Create a milk batch.
    // --------------------------------------------------

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

    if (
      new Set(body.data.cattleIds).size !==
      body.data.cattleIds.length
    ) {
      return json(
        {
          error: "Each animal can only be included once.",
        },
        400,
      );
    }

    const batchDate = body.data.date
      ? new Date(body.data.date)
      : new Date();

    const { startOfDay, startOfTomorrow } =
      getIndiaDayRange(batchDate);

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

    if (cattle.length !== body.data.cattleIds.length) {
      return json(
        {
          error: "One or more selected animals were not found.",
        },
        404,
      );
    }

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

    // Group cattle by farmer for Fabric farm-origin recording.
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

    const batchId = `MB-${batchDate
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${crypto
      .randomUUID()
      .slice(0, 8)
      .toUpperCase()}`;

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
            conflict: existingIntakes.map(
              (item) => item.cattleId,
            ),
          };
        }

        const created = await tx.milkBatch.create({
          data: {
            batchId,
            collectionCentreId: centre.id,
            date: batchDate,
            volumeL: body.data.volumeL,
            status: "PENDING_SCREENING",

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

    // --------------------------------------------------
    // SUBMIT BATCH AND FARM ORIGINS TO HYPERLEDGER FABRIC
    // --------------------------------------------------

    let blockchainStatus = "PENDING";
    let blockchainError: string | null = null;

    try {
      await submitFabricTransaction(
        "CreateMilkBatch",
        batchId,
        centre.id,
        centre.name,
        batchDate.toISOString(),
        String(body.data.volumeL),
      );

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
        {
          error: "Request body must be valid JSON.",
        },
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
      {
        error: "Milk batch request failed.",
      },
      500,
    );
  }
}

// ------------------------------------------------------
// RESIDUE SCREENING REQUEST HANDLER
// POST /api/milk-batches/:milkBatchId/residue-screening
// ------------------------------------------------------


export async function handleResidueScreeningRequest(
  req: Request,
  user: AuthenticatedUser,
  milkBatchId: string,
): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const centre = await prisma.collectionCentre.findUnique({
      where: { userId: user.userId },
    });

    if (!centre) {
      return json(
        { error: "No collection-centre profile is linked to this account." },
        403,
      );
    }

    const body = residueScreeningSchema.safeParse(await req.json());

    if (!body.success) {
      return json(
        {
          error: "Residue screening validation failed.",
          details: body.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        400,
      );
    }

    const testedAt = new Date(body.data.testedAt);

    if (testedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return json(
        { error: "Screening date cannot be in the future." },
        400,
      );
    }

    // --------------------------------------------------
    // STEP 1: SAVE SCREENING IN POSTGRESQL
    // --------------------------------------------------

    const result = await prisma.$transaction(
      async (tx) => {
        const batch = await tx.milkBatch.findFirst({
          where: {
            id: milkBatchId,
            collectionCentreId: centre.id,
          },
          include: {
            residueScreenings: {
              orderBy: { testedAt: "desc" },
            },
          },
        });

        if (!batch) {
          return {
            error: "Milk batch not found for this collection centre.",
            status: 404,
          };
        }

        const hasPreviousPositive = batch.residueScreenings.some(
          (screening) => screening.result === "POSITIVE",
        );

        if (hasPreviousPositive) {
          return {
            error:
              "This batch has a previous POSITIVE residue result. Routine retesting cannot release it.",
            status: 409,
          };
        }

        const latestScreening = batch.residueScreenings[0];

        const canScreen =
          batch.status === "PENDING_SCREENING" ||
          (batch.status === "HOLD" &&
            latestScreening?.result === "INVALID");

        if (!canScreen) {
          return {
            error:
              "This batch cannot be screened in its current status.",
            status: 409,
          };
        }

        const enabledMedicines = await tx.medicineMRL.findMany({
          where: { isScreeningEnabled: true },
          orderBy: { medicineName: "asc" },
        });

        if (enabledMedicines.length === 0) {
          return {
            error: "No medicines are enabled for residue screening.",
            status: 409,
          };
        }

        const medicineMap = new Map(
          enabledMedicines.map((medicine) => [
            medicine.id,
            medicine,
          ]),
        );

        // Validate medicine IDs, MRL values and units.
        for (const measurement of body.data.measurements) {
          const medicine = medicineMap.get(
            measurement.medicineMrlId,
          );

          if (!medicine) {
            return {
              error:
                "One or more selected medicines are not enabled for screening.",
              status: 400,
            };
          }

          if (
            medicine.mrlValue === null ||
            !Number.isFinite(medicine.mrlValue) ||
            medicine.mrlValue < 0 ||
            !medicine.unit?.trim()
          ) {
            return {
              error:
                `MRL configuration for ${medicine.medicineName} is incomplete or invalid.`,
              status: 422,
            };
          }

          if (
            normalizeUnit(measurement.measuredUnit) !==
            normalizeUnit(medicine.unit)
          ) {
            return {
              error:
                `Unit mismatch for ${medicine.medicineName}. Expected ${medicine.unit}, received ${measurement.measuredUnit}.`,
              status: 422,
            };
          }
        }

        // Calculate medicine-wise screening results.
        const calculatedMeasurements =
          body.data.measurements.map((measurement) => {
            const medicine = medicineMap.get(
              measurement.medicineMrlId,
            )!;

            const measurementResult =
              measurement.measuredValue <= medicine.mrlValue!
                ? "NEGATIVE"
                : "POSITIVE";

            return {
              medicineMrlId: medicine.id,
              medicineNameAtTest: medicine.medicineName,
              measuredValue: measurement.measuredValue,
              measuredUnit: measurement.measuredUnit.trim(),
              mrlValueAtTest: medicine.mrlValue!,
              mrlUnitAtTest: medicine.unit!.trim(),
              result: measurementResult as
                | "NEGATIVE"
                | "POSITIVE",
            };
          });

        const hasPositiveMeasurement =
          calculatedMeasurements.some(
            (measurement) => measurement.result === "POSITIVE",
          );

        const overallResult = hasPositiveMeasurement
          ? "POSITIVE"
          : body.data.panelComplete
            ? "NEGATIVE"
            : "INVALID";

        const antibioticGroups = [
          ...new Set(
            calculatedMeasurements.map(
              (measurement) => measurement.medicineNameAtTest,
            ),
          ),
        ];

        // Save screening and individual measurements.
        const screening = await tx.residueScreening.create({
          data: {
            milkBatchId: batch.id,
            sampleId: body.data.sampleId,
            testKitName: body.data.testKitName,
            testKitBatchNumber:
              body.data.testKitBatchNumber || null,
            antibioticGroups,
            result: overallResult,
            testedAt,
            testedByUserId: user.userId,
            remarks: body.data.remarks || null,
            reportUrl: body.data.reportUrl || null,
            panelComplete: body.data.panelComplete,

            measurements: {
              create: calculatedMeasurements,
            },
          },
          include: {
            testedBy: {
              select: { name: true },
            },
            measurements: true,
          },
        });

        const updatedStatus =
          overallResult === "NEGATIVE" ? "SAFE" : "HOLD";

        const updatedBatch = await tx.milkBatch.update({
          where: { id: batch.id },
          data: { status: updatedStatus },
          include: {
            collectionCentre: {
              select: {
                name: true,
                code: true,
              },
            },
            residueScreenings: {
              include: {
                testedBy: {
                  select: { name: true },
                },
                measurements: true,
              },
              orderBy: { testedAt: "desc" },
            },
          },
        });

        // Save the PostgreSQL traceability event.
        const traceabilityPayload = {
          batchId: batch.batchId,
          sampleId: screening.sampleId,
          screeningId: screening.id,
          testKitName: screening.testKitName,
          testKitBatchNumber: screening.testKitBatchNumber,
          result: screening.result,
          panelComplete: screening.panelComplete,

          measurements: calculatedMeasurements.map(
            (measurement) => ({
              medicineMrlId: measurement.medicineMrlId,
              medicineName: measurement.medicineNameAtTest,
              measuredValue: measurement.measuredValue,
              measuredUnit: measurement.measuredUnit,
              mrlValue: measurement.mrlValueAtTest,
              mrlUnit: measurement.mrlUnitAtTest,
              result: measurement.result,
            }),
          ),

          testedAt: screening.testedAt.toISOString(),
          testedByUserId: user.userId,
          previousStatus: batch.status,
          updatedStatus,
        };

        const traceabilityEvent =
          await tx.traceabilityEvent.create({
            data: {
              eventType: "RESIDUE_SCREENING_RECORDED",
              entityType: "milk_batch",
              entityId: batch.id,
              payload: traceabilityPayload,
              blockchainStatus: "PENDING",
            },
          });

        return {
          screening,
          milkBatch: updatedBatch,
          batchId: batch.batchId,
          traceabilityEventId: traceabilityEvent.id,
          traceabilityPayload,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if ("error" in result) {
      return json(
        { error: result.error },
        result.status,
      );
    }

    // --------------------------------------------------
    // STEP 2: PREPARE BLOCKCHAIN SCREENING DATA
    // --------------------------------------------------

    const screeningData = {
      screeningId: result.screening.id,
      sampleId: result.screening.sampleId,
      testKitName: result.screening.testKitName,

      ...(result.screening.testKitBatchNumber
        ? {
            testKitBatchNumber:
              result.screening.testKitBatchNumber,
          }
        : {}),

      testedAt: result.screening.testedAt.toISOString(),
      testedByUserId: user.userId,
      panelComplete: result.screening.panelComplete,

      measurements: result.screening.measurements.map(
        (measurement) => ({
          medicineMrlId: measurement.medicineMrlId,
          medicineNameAtTest: measurement.medicineNameAtTest,
          measuredValue: measurement.measuredValue,
          measuredUnit: measurement.measuredUnit,
          mrlValueAtTest: measurement.mrlValueAtTest,
          mrlUnitAtTest: measurement.mrlUnitAtTest,
        }),
      ),
    };

    // --------------------------------------------------
    // STEP 3: SUBMIT RESIDUE SCREENING TO FABRIC
    // --------------------------------------------------

    let blockchainStatus = "PENDING";
    let blockchainTransactionId: string | null = null;
    let blockchainError: string | null = null;

    try {
      const fabricResponse = await submitFabricTransaction(
        "RecordResidueScreening",
        result.batchId,
        JSON.stringify(screeningData),
      );

      // The chaincode returns the screening JSON containing
      // the Fabric transaction ID.
      const fabricRecord = JSON.parse(fabricResponse) as {
        transactionId?: string;
        screeningId?: string;
        result?: string;
      };

      if (!fabricRecord.transactionId) {
        throw new Error(
          "Fabric did not return a transaction ID.",
        );
      }

      blockchainTransactionId = fabricRecord.transactionId;
      blockchainStatus = "CONFIRMED";

      // Save blockchain verification details in the
      // existing PostgreSQL traceability event.
      await prisma.traceabilityEvent.update({
        where: {
          id: result.traceabilityEventId,
        },
        data: {
          blockchainStatus: "CONFIRMED",
          payload: {
            ...result.traceabilityPayload,
            fabricTransactionId: blockchainTransactionId,
            fabricScreeningId:
              fabricRecord.screeningId ?? result.screening.id,
            blockchainRecorded: true,
          },
        },
      });

    } catch (fabricError) {
      blockchainStatus = "FAILED";

      blockchainError =
        fabricError instanceof Error
          ? fabricError.message
          : "Unknown Fabric transaction error.";

      console.error(
  `Fabric submission failed for batch ${result.batchId}`,
);

console.dir(fabricError, { depth: 10 });

if (fabricError instanceof Error) {
  console.error("Error name:", fabricError.name);
  console.error("Error message:", fabricError.message);
  console.error("Error stack:", fabricError.stack);

  const details = fabricError as Error & {
    details?: unknown;
    cause?: unknown;
    code?: unknown;
  };

  console.error("Fabric error code:", details.code);
  console.error("Fabric error details:", details.details);
  console.error("Fabric error cause:", details.cause);
}

      // Conservatively keep the batch on HOLD until its
      // blockchain screening record is confirmed.
      await prisma.$transaction([
        prisma.milkBatch.update({
          where: {
            id: result.milkBatch.id,
          },
          data: {
            status: "HOLD",
          },
        }),

        prisma.traceabilityEvent.update({
          where: {
            id: result.traceabilityEventId,
          },
          data: {
            blockchainStatus: "FAILED",
            payload: {
              ...result.traceabilityPayload,
              blockchainRecorded: false,
              blockchainError,
            },
          },
        }),
      ]);
    }

    // --------------------------------------------------
    // STEP 4: RETURN SCREENING AND BLOCKCHAIN DETAILS
    // --------------------------------------------------

    const finalMilkBatch =
      blockchainStatus === "FAILED"
        ? {
            ...result.milkBatch,
            status: "HOLD",
          }
        : result.milkBatch;

    return json(
      {
        message:
          blockchainStatus === "CONFIRMED"
            ? "Residue screening successfully saved in PostgreSQL and recorded on Hyperledger Fabric."
            : "Residue screening saved in PostgreSQL, but blockchain recording failed. The batch remains on HOLD.",

        screening: result.screening,
        milkBatch: finalMilkBatch,

        blockchain: {
          status: blockchainStatus,
          transactionId: blockchainTransactionId,
          error: blockchainError,
        },
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
            "This sample ID has already been used. Please enter a unique sample ID.",
        },
        409,
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2034"
    ) {
      return json(
        {
          error:
            "Another screening operation occurred simultaneously. Refresh the batch and try again.",
        },
        409,
      );
    }

    console.error("Residue screening request failed:", error);

    return json(
      { error: "Failed to save residue screening." },
      500,
    );
  }
}


export async function handleResidueScreeningRetryRequest(
  req: Request,
  user: AuthenticatedUser,
  milkBatchId: string,
  screeningId: string,
): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    if (!screeningId?.trim()) {
      return json({ error: "Screening ID is required." }, 400);
    }

    // 1. Verify the collection centre.
    const centre = await prisma.collectionCentre.findUnique({
      where: { userId: user.userId },
    });

    if (!centre) {
      return json(
        { error: "No collection-centre profile is linked to this account." },
        403,
      );
    }

    // 2. Fetch the existing PostgreSQL screening.
    // Never create another screening during recovery.
    const screening = await prisma.residueScreening.findFirst({
      where: {
        id: screeningId,
        milkBatch: {
          batchId: milkBatchId,
          collectionCentreId: centre.id,
        },
      },
      include: {
        milkBatch: true,
        measurements: true,
      },
    });

    if (!screening) {
      return json(
        { error: "Screening not found for this collection centre and batch." },
        404,
      );
    }

    // 3. Find the failed traceability event belonging to this screening.
    const failedEvents = await prisma.traceabilityEvent.findMany({
      where: {
        entityId: screening.milkBatchId,
        eventType: "RESIDUE_SCREENING_RECORDED",
        blockchainStatus: "FAILED",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const traceabilityEvent = failedEvents.find((event) => {
      const payload = event.payload as Record<string, unknown>;

      return payload?.screeningId === screening.id;
    });

    if (!traceabilityEvent) {
      return json(
        {
          error:
            "No failed blockchain traceability event was found for this screening. No retry was performed.",
        },
        409,
      );
    }

    // 4. Check the blockchain before submitting.
    // This protects against duplicate submissions if an earlier
    // transaction committed but the backend lost its response.
    const batchResponse = await evaluateFabricTransaction(
      "GetMilkBatch",
      screening.milkBatch.batchId,
    );

    const ledgerBatch = JSON.parse(batchResponse) as {
      residueScreenings?: Array<{
        screeningId: string;
        sampleId: string;
        result: string;
        panelComplete: boolean;
        transactionId: string;
      }>;
    };

    const ledgerScreenings = ledgerBatch.residueScreenings ?? [];

    const existingLedgerRecord = ledgerScreenings.find(
      (item) => item.screeningId === screening.id,
    );

    if (!existingLedgerRecord) {
      const duplicateSample = ledgerScreenings.find(
        (item) => item.sampleId === screening.sampleId,
      );

      if (duplicateSample) {
        return json(
          {
            error:
              "This sample ID already exists on the blockchain under another screening ID. Manual reconciliation is required.",
          },
          409,
        );
      }
    }

    // 5. Reuse the existing blockchain record if it already exists.
    let fabricRecord: {
      screeningId: string;
      sampleId: string;
      result: string;
      panelComplete: boolean;
      transactionId: string;
    };

    if (existingLedgerRecord) {
      fabricRecord = existingLedgerRecord;
    } else {
      // 6. Reconstruct the original payload from PostgreSQL.
      const screeningData = {
        screeningId: screening.id,
        sampleId: screening.sampleId,
        testKitName: screening.testKitName,

        ...(screening.testKitBatchNumber
          ? { testKitBatchNumber: screening.testKitBatchNumber }
          : {}),

        testedAt: screening.testedAt.toISOString(),
        testedByUserId: screening.testedByUserId,
        panelComplete: screening.panelComplete,

        measurements: screening.measurements.map((measurement) => ({
          medicineMrlId: measurement.medicineMrlId,
          medicineNameAtTest: measurement.medicineNameAtTest,
          measuredValue: measurement.measuredValue,
          measuredUnit: measurement.measuredUnit,
          mrlValueAtTest: measurement.mrlValueAtTest,
          mrlUnitAtTest: measurement.mrlUnitAtTest,
        })),
      };

      // 7. Submit the original screening to Fabric.
      const fabricResponse = await submitFabricTransaction(
        "RecordResidueScreening",
        screening.milkBatch.batchId,
        JSON.stringify(screeningData),
      );

      fabricRecord = JSON.parse(fabricResponse);
    }

    // 8. Verify that Fabric returned the expected screening.
    if (
      fabricRecord.screeningId !== screening.id ||
      fabricRecord.sampleId !== screening.sampleId ||
      !fabricRecord.transactionId
    ) {
      throw new Error(
        "Fabric response does not match the original PostgreSQL screening.",
      );
    }

    // 9. Reconcile PostgreSQL status with the confirmed ledger result.
    const reconciledStatus =
      fabricRecord.result === "NEGATIVE" &&
      fabricRecord.panelComplete
        ? "SAFE"
        : "HOLD";

    await prisma.$transaction([
      prisma.milkBatch.update({
        where: {
          id: screening.milkBatchId,
        },
        data: {
          status: reconciledStatus,
        },
      }),

      prisma.traceabilityEvent.update({
        where: {
          id: traceabilityEvent.id,
        },
        data: {
          blockchainStatus: "CONFIRMED",
          payload: {
            ...(traceabilityEvent.payload as Record<string, unknown>),
            fabricTransactionId: fabricRecord.transactionId,
            fabricScreeningId: fabricRecord.screeningId,
            blockchainRecorded: true,
            blockchainRecovered: true,
            blockchainError: null,
          },
        },
      }),
    ]);

    return json(
      {
        message: existingLedgerRecord
          ? "Screening was already present on Fabric. PostgreSQL has been reconciled."
          : "Existing PostgreSQL screening successfully recovered and recorded on Hyperledger Fabric.",

        screeningId: screening.id,
        sampleId: screening.sampleId,
        batchId: screening.milkBatch.batchId,

        result: fabricRecord.result,
        milkBatchStatus: reconciledStatus,

        blockchain: {
          status: "CONFIRMED",
          transactionId: fabricRecord.transactionId,
          recovered: true,
        },
      },
      200,
    );
  } catch (error) {
    console.error("Residue screening recovery failed:", error);

    return json(
      {
        error: "Failed to recover residue screening on blockchain.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown recovery error.",
      },
      500,
    );
  }
}


