
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../lib/auth-middleware";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

export async function handleAuthorityRequest(
  req: Request,
  user: AuthenticatedUser,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (user.role !== "authority") {
    return json(
      { error: "You are not authorized to access authority data." },
      403,
    );
  }

  const path = new URL(req.url).pathname;
  const endpoint = path.replace("/api/authority/", "");

  try {
    // -----------------------------------------
    // 1. AUTHORITY DASHBOARD
    // -----------------------------------------

    if (endpoint === "dashboard") {
      const now = new Date();

      const [
        registeredAnimals,
        treatmentsOnRecord,
        animalsUnderWithdrawal,
        totalBatches,
        safeBatches,
        batchesOnHold,
      ] = await Promise.all([
        prisma.cattle.count(),

        prisma.treatment.count(),

        prisma.cattle.count({
          where: {
            treatments: {
              some: {
                withdrawalEnds: {
                  gt: now,
                },
              },
            },
          },
        }),

        prisma.milkBatch.count(),

        prisma.milkBatch.count({
          where: { status: "SAFE" },
        }),

        prisma.milkBatch.count({
          where: { status: "HOLD" },
        }),
      ]);

      return json({
        registeredAnimals,
        treatmentsOnRecord,
        animalsUnderWithdrawal,
        batchCompliance: {
          total: totalBatches,
          safe: safeBatches,
          onHold: batchesOnHold,
          safePercentage:
            totalBatches > 0
              ? Number(((safeBatches / totalBatches) * 100).toFixed(2))
              : 0,
        },
      });
    }

    // -----------------------------------------
    // 2. ANIMAL AND TREATMENT COMPLIANCE
    // -----------------------------------------

    if (endpoint === "compliance") {
      const now = new Date();

      const animals = await prisma.cattle.findMany({
        include: {
          farmer: {
            include: {
              user: true,
            },
          },
          treatments: {
            orderBy: {
              administeredAt: "desc",
            },
            include: {
              veterinarian: true,
              medicineMrl: true,
            },
          },
        },
        orderBy: {
          cattleId: "asc",
        },
      });

      const compliance = animals.map((animal) => {
        const activeTreatment = animal.treatments.find(
  (treatment) =>
    treatment.withdrawalEnds !== null &&
    treatment.withdrawalEnds > now,
);

        const latestTreatment = animal.treatments[0];

        const treatment = activeTreatment ?? latestTreatment;

        let status = "No treatment";

        if (activeTreatment) {
          status = "Under withdrawal";
        } else if (latestTreatment) {
          status = "Cleared";
        }

        return {
          id: animal.id,
          cattleId: animal.cattleId,
          animalName: animal.name,
          breed: animal.breed,

          farmer:
            animal.farmer?.user?.name ?? "Unknown farmer",

          village: animal.farmer?.village ?? "N/A",

          antibiotic: treatment?.medicineName ?? "N/A",

          veterinarian:
            treatment?.veterinarian?.name ?? "N/A",

          administeredAt: treatment?.administeredAt ?? null,

          withdrawalClearanceDate:
            treatment?.withdrawalEnds ?? null,

          status,

          treatmentCount: animal.treatments.length,
        };
      });

      return json(compliance);
    }

    // -----------------------------------------
    // 3. AUDIT LEDGER / TRACEABILITY EVENTS
    // -----------------------------------------

    if (endpoint === "audit-ledger") {
      const events = await prisma.traceabilityEvent.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });

      return json(
        events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          entityType: event.entityType,
          entityId: event.entityId,
          payload: event.payload,

          blockchainTxId: event.blockchainTxId,
          blockNumber: event.blockNumber,
          blockchainStatus: event.blockchainStatus,

          createdAt: event.createdAt,
        })),
      );
    }

// -----------------------------------------
// 4. MILK SUPPLY CHAIN
// -----------------------------------------

if (endpoint === "supply-chain") {
  const [milkBatches, processingBatches, dispatches] =
    await Promise.all([
      // 1. Milk batches
      prisma.milkBatch.findMany({
        include: {
          collectionCentre: true,
          residueScreenings: {
            include: {
              measurements: true,
            },
            orderBy: {
              testedAt: "desc",
            },
          },
          factoryReceipt: true,
          qualityInspections: true,
        },
        orderBy: {
          date: "desc",
        },
      }),

      // 2. Processing batches
      prisma.processingBatch.findMany({
        include: {
          factory: true,
          productLots: true,
          sourceMilkBatches: {
            include: {
              milkBatch: true,
            },
          },
        },
        orderBy: {
          date: "desc",
        },
      }),

      // 3. Dispatches
      prisma.dispatch.findMany({
        include: {
          factory: true,
          items: {
            include: {
              productLot: true,
            },
          },
        },
        orderBy: {
          dispatchedAt: "desc",
        },
      }),
    ]);

  return json({
    milkBatches,
    processingBatches,
    dispatches,
  });
}

    // -----------------------------------------
    // 5. MEDICINE MRL REFERENCES
    // -----------------------------------------

    if (endpoint === "mrl") {
      const references = await prisma.medicineMRL.findMany({
        where: {
          OR: [
            { isDashboardEnabled: true },
            { isScreeningEnabled: true },
          ],
        },
        orderBy: {
          medicineName: "asc",
        },
      });

      return json(references);
    }

    return json(
      { error: "Authority endpoint not found." },
      404,
    );
  } catch (error) {
    console.error(
      `Authority API error (${endpoint}):`,
      error,
    );

    return json(
      { error: "Failed to fetch authority data." },
      500,
    );
  }
}
